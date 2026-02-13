/**
 * DeliveryMap - Live map with road routes, customer/store/driver locations.
 * Uses Directions API (driving mode, India) for road-following routes.
 * Black polylines show route between driver, store, and customer.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { MapPin } from 'lucide-react';
import { useGoogleMaps } from '../../context/GoogleMapsContext';
import { fetchDirections } from '../../services/placesService';

const MAP_HEIGHT = 420;
const MAP_CONTAINER_STYLE = { width: '100%', height: `${MAP_HEIGHT}px` };
const MAP_OPTIONS = {
  zoomControl: false,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: false,
  disableDefaultUI: true,
  gestureHandling: 'greedy' as const,
};

const NEAR_CUSTOMER_METERS = 35;
const HAVERSINE_M = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export interface StoreLocation {
  lat: number;
  lng: number;
  label?: string;
  store_id?: string;
}

export interface DriverLocationPoint {
  latitude: number;
  longitude: number;
  updated_at?: string;
}

interface StoreOrder {
  store_id?: string;
  delivery_partner_id?: string;
  status?: string;
}

interface DeliveryMapProps {
  deliveryLat: number;
  deliveryLng: number;
  driverLocation?: DriverLocationPoint | null;
  /** Driver locations keyed by delivery_partner_id (for pairing with stores) */
  driverLocations?: DriverLocationPoint[] | Record<string, DriverLocationPoint>;
  storeLocations?: StoreLocation[];
  storeOrders?: StoreOrder[];
  /** order status for route logic: driver→shop before pickup, driver→customer after */
  orderStatus?: string;
  className?: string;
}

export default function DeliveryMap({
  deliveryLat,
  deliveryLng,
  driverLocation,
  driverLocations = [],
  storeLocations = [],
  storeOrders = [],
  orderStatus = '',
  className = '',
}: DeliveryMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const { isLoaded, loadError } = useGoogleMaps();
  const [routePaths, setRoutePaths] = useState<{ lat: number; lng: number }[][]>([]);

  const isRecord = typeof driverLocations === 'object' && driverLocations !== null && !Array.isArray(driverLocations);
  const driverMap: Record<string, DriverLocationPoint> = isRecord
    ? (driverLocations as Record<string, DriverLocationPoint>)
    : Object.fromEntries(((driverLocations as DriverLocationPoint[]) || []).map((d, i) => [`d${i}`, d]));
  if (driverLocation && Object.keys(driverMap).length === 0) {
    driverMap['single'] = driverLocation;
  }
  const driversList = Object.entries(driverMap);
  const allDrivers = Object.values(driverMap);

  const storeMap = new Map((storeLocations || []).map((s) => [(s.store_id ?? s.lat + ',' + s.lng) as string, s]));
  const beforePickup = ['delivery_partner_assigned'].includes(orderStatus);
  const afterPickup = ['order_picked_up', 'in_transit', 'order_delivered'].includes(orderStatus);
  const showStores = beforePickup || allDrivers.length === 0;

  const depKey = driversList.map(([k, v]) => `${k}:${v?.latitude?.toFixed(5)},${v?.longitude?.toFixed(5)}`).join('|') +
    (storeLocations || []).map((s) => `${s.lat.toFixed(5)},${s.lng.toFixed(5)}`).join('|') +
    `${deliveryLat},${deliveryLng},${beforePickup},${afterPickup}`;

  useEffect(() => {
    if (allDrivers.length === 0) {
      setRoutePaths([]);
      return;
    }
    let cancelled = false;
    const run = async () => {
      const paths: { lat: number; lng: number }[][] = [];
      let idx = 0;
      for (const [partnerId, driver] of driversList) {
        if (!driver || driver.latitude == null || driver.longitude == null) continue;
        const origin = { lat: driver.latitude, lng: driver.longitude };
        let destStore: StoreLocation | undefined;
        if (storeOrders.length > 0) {
          const so = storeOrders.find((o) => o.delivery_partner_id === partnerId);
          if (so?.store_id) destStore = storeMap.get(so.store_id);
        }
        if (!destStore && (storeLocations || []).length > 0) {
          destStore = (storeLocations || [])[idx] ?? (storeLocations || [])[0];
        }
        idx++;
        if (beforePickup && destStore) {
          const pts = await fetchDirections(origin, { lat: destStore.lat, lng: destStore.lng });
          if (pts.length >= 2) paths.push(pts);
          const storeToCustomer = await fetchDirections(
            { lat: destStore.lat, lng: destStore.lng },
            { lat: deliveryLat, lng: deliveryLng }
          );
          if (storeToCustomer.length >= 2) paths.push(storeToCustomer);
        } else {
          const pts = await fetchDirections(origin, { lat: deliveryLat, lng: deliveryLng });
          if (pts.length >= 2) paths.push(pts);
        }
      }
      if (!cancelled) setRoutePaths(paths);
    };
    run();
    return () => { cancelled = true; };
  }, [depKey]);

  const fitBounds = useCallback((includeDriver: boolean, includeStores: boolean) => {
    if (!mapRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    bounds.extend({ lat: deliveryLat, lng: deliveryLng });
    if (includeStores) {
      for (const s of storeLocations) {
        bounds.extend({ lat: s.lat, lng: s.lng });
      }
    }
    if (includeDriver) {
      for (const d of allDrivers) {
        bounds.extend({ lat: d.latitude, lng: d.longitude });
      }
    }
    if (bounds.getNorthEast().lat() !== bounds.getSouthWest().lat() || bounds.getNorthEast().lng() !== bounds.getSouthWest().lng()) {
      mapRef.current.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 });
    } else {
      mapRef.current.setCenter({ lat: deliveryLat, lng: deliveryLng });
      mapRef.current.setZoom(15);
    }
  }, [deliveryLat, deliveryLng, storeLocations, allDrivers]);

  const driverPosKey = allDrivers.map((d) => `${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`).join('|');
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    fitBounds(allDrivers.length > 0, showStores);
  }, [isLoaded, allDrivers.length, showStores, driverPosKey, fitBounds]);

  useEffect(() => {
    if (!mapRef.current || allDrivers.length === 0) return;
    const d = allDrivers[0];
    const dist = HAVERSINE_M(d.latitude, d.longitude, deliveryLat, deliveryLng);
    if (dist <= NEAR_CUSTOMER_METERS) {
      mapRef.current.setCenter({ lat: deliveryLat, lng: deliveryLng });
      mapRef.current.setZoom(17);
    }
  }, [allDrivers, deliveryLat, deliveryLng]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fitBounds(allDrivers.length > 0, showStores);
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        fitBounds(allDrivers.length > 0, showStores);
      }, 100);
    },
    [fitBounds, allDrivers.length, showStores]
  );

  if (loadError) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: MAP_HEIGHT }}>
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">Map unavailable. Check Google Maps API key.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: MAP_HEIGHT }}>
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-200 ${className}`} style={{ minHeight: MAP_HEIGHT }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        mapContainerClassName="w-full"
        options={MAP_OPTIONS}
        onLoad={onMapLoad}
        onUnmount={() => {
          mapRef.current = null;
        }}
      >
        <Marker
          position={{ lat: deliveryLat, lng: deliveryLng }}
          title="Delivery address"
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            scale: 12,
            fillColor: '#22c55e',
            fillOpacity: 1,
            strokeColor: '#ffffff',
            strokeWeight: 2,
          }}
        />
        {showStores && storeLocations.map((store, i) => (
          <Marker
            key={`store-${i}`}
            position={{ lat: store.lat, lng: store.lng }}
            title={store.label || `Store ${i + 1}`}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 11,
              fillColor: '#f97316',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        ))}
        {allDrivers.map((driver, i) => (
          <Marker
            key={`driver-${i}`}
            position={{ lat: driver.latitude, lng: driver.longitude }}
            title={`Delivery partner ${i + 1}`}
            icon={{
              path: google.maps.SymbolPath.CIRCLE,
              scale: 14,
              fillColor: '#3b82f6',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 2,
            }}
          />
        ))}
        {routePaths.filter((p) => p.length >= 2).map((path, i) => (
          <Polyline
            key={`route-${i}-${path.length}`}
            path={path}
            options={{
              strokeColor: '#000000',
              strokeOpacity: 1,
              strokeWeight: 6,
            }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}
