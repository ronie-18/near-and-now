/**
 * DeliveryMap - Live map with road routes, customer/store/driver locations.
 * Uses Directions API (driving mode) for road-following routes.
 * - Before pickup: only driver → store path shown.
 * - After pickup: only driver → customer path shown.
 * Bounds always span the full visible route (Swiggy/Zomato style).
 * Custom icons for customer, store, and delivery partner.
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
  // Hide all POI markers (restaurants, shops, hospitals, etc.) but keep roads, water, parks, etc.
  styles: [
    {
      featureType: 'poi',
      elementType: 'labels',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi',
      elementType: 'labels.icon',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.business',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.attraction',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.place_of_worship',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.school',
      stylers: [{ visibility: 'off' }],
    },
    {
      featureType: 'poi.sports_complex',
      stylers: [{ visibility: 'off' }],
    },
  ],
};

const BOUNDS_PADDING = { top: 48, right: 48, bottom: 48, left: 48 };
const MARKER_SIZE_BASE = 48;
const MARKER_SIZE_MIN = 32;
const MARKER_SIZE_MAX = 112;
const ZOOM_REFERENCE = 15; // zoom level at which we use MARKER_SIZE_BASE

/** Scale icon size by map zoom so markers stay visible when zoomed out */
function iconSizeForZoom(zoom: number): number {
  const scale = Math.pow(2, (ZOOM_REFERENCE - zoom) / 5);
  const size = Math.round(MARKER_SIZE_BASE * scale);
  return Math.max(MARKER_SIZE_MIN, Math.min(MARKER_SIZE_MAX, size));
}

// Icon images from public folder (driver, shopkeeper, customer)
const MAP_ICON_BASE = '/map-icons';
const DRIVER_ICON = `${MAP_ICON_BASE}/driver.png`;
const SHOPKEEPER_ICON = `${MAP_ICON_BASE}/shopkeeper.png`;
const CUSTOMER_ICON = `${MAP_ICON_BASE}/customer.png`;

/**
 * Draw the image onto a canvas with white round background and optional black border.
 * Returns a data URL so the marker icon is self-contained (no external refs that fail to load).
 */
function drawBadgeIcon(image: HTMLImageElement, blackBorder: boolean): string {
  const size = 48;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const center = size / 2;
  const outerR = 22;   // circle with border
  const innerR = 20;   // clip image to this

  // White fill
  ctx.beginPath();
  ctx.arc(center, center, outerR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Border (black for driver, light gray for others)
  ctx.strokeStyle = blackBorder ? '#000000' : '#e5e7eb';
  ctx.lineWidth = blackBorder ? 2.5 : 2;
  ctx.stroke();

  // Clip to circle and draw image (cover the inner circle)
  ctx.save();
  ctx.beginPath();
  ctx.arc(center, center, innerR, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const pad = 4;
  const iconSize = size - pad * 2;
  ctx.drawImage(image, pad, pad, iconSize, iconSize);
  ctx.restore();

  return canvas.toDataURL('image/png');
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

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
  /** order status: before pickup = driver→store only; after pickup = driver→customer only */
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
  const zoomListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const { isLoaded, loadError } = useGoogleMaps();
  const [routePaths, setRoutePaths] = useState<{ lat: number; lng: number }[][]>([]);
  const [mapZoom, setMapZoom] = useState(ZOOM_REFERENCE);
  const [badgeIcons, setBadgeIcons] = useState<{ driver: string | null; customer: string | null; store: string | null }>({
    driver: null,
    customer: null,
    store: null,
  });

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

  // Load icon images and draw onto canvas badges (so they display correctly as marker icons)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      loadImage(DRIVER_ICON).then((img) => (cancelled ? null : drawBadgeIcon(img, true))),
      loadImage(CUSTOMER_ICON).then((img) => (cancelled ? null : drawBadgeIcon(img, false))),
      loadImage(SHOPKEEPER_ICON).then((img) => (cancelled ? null : drawBadgeIcon(img, false))),
    ])
      .then(([driver, customer, store]) => {
        if (!cancelled && driver != null && customer != null && store != null) {
          setBadgeIcons({ driver, customer, store });
        }
      })
      .catch((err) => {
        if (!cancelled) console.warn('Map icon load failed:', err);
      });
    return () => { cancelled = true; };
  }, []);

  // Route: before pickup = driver→store only; after pickup = driver→customer only (no store→customer until then)
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
          // Only driver → store; do not show store → customer until order is picked up
          const pts = await fetchDirections(origin, { lat: destStore.lat, lng: destStore.lng });
          if (pts.length >= 2) paths.push(pts);
        } else if (afterPickup) {
          // After pickup: show only driver → customer
          const pts = await fetchDirections(origin, { lat: deliveryLat, lng: deliveryLng });
          if (pts.length >= 2) paths.push(pts);
        }
      }
      if (!cancelled) setRoutePaths(paths);
    };
    run();
    return () => { cancelled = true; };
  }, [depKey]);

  // Fit bounds to full visible route at all times (Swiggy/Zomato style): route path + driver + destination
  const fitBoundsToFullRoute = useCallback(() => {
    if (!mapRef.current) return;
    const bounds = new google.maps.LatLngBounds();
    // Always include customer (delivery point)
    bounds.extend({ lat: deliveryLat, lng: deliveryLng });
    // Include all drivers
    for (const d of allDrivers) {
      bounds.extend({ lat: d.latitude, lng: d.longitude });
    }
    // Include stores when visible
    if (showStores) {
      for (const s of storeLocations) {
        bounds.extend({ lat: s.lat, lng: s.lng });
      }
    }
    // Include every point of the visible route so the full path is always in view
    for (const path of routePaths) {
      for (const p of path) {
        bounds.extend(p);
      }
    }
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    if (ne.lat() !== sw.lat() || ne.lng() !== sw.lng()) {
      mapRef.current.fitBounds(bounds, BOUNDS_PADDING);
    } else {
      mapRef.current.setCenter({ lat: deliveryLat, lng: deliveryLng });
      mapRef.current.setZoom(15);
    }
  }, [deliveryLat, deliveryLng, allDrivers, showStores, storeLocations, routePaths]);

  const driverPosKey = allDrivers.map((d) => `${d.latitude.toFixed(5)},${d.longitude.toFixed(5)}`).join('|');
  const routePathsKey = routePaths.map((p) => p.length).join(',');

  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    fitBoundsToFullRoute();
  }, [isLoaded, driverPosKey, routePathsKey, fitBoundsToFullRoute]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      const z = map.getZoom();
      if (typeof z === 'number') setMapZoom(z);
      zoomListenerRef.current?.remove();
      zoomListenerRef.current = google.maps.event.addListener(map, 'zoom_changed', () => {
        const z = map.getZoom();
        if (typeof z === 'number') setMapZoom(z);
      });
      fitBoundsToFullRoute();
      setTimeout(() => {
        google.maps.event.trigger(map, 'resize');
        fitBoundsToFullRoute();
      }, 100);
    },
    [fitBoundsToFullRoute]
  );

  const onMapUnmount = useCallback(() => {
    zoomListenerRef.current?.remove();
    zoomListenerRef.current = null;
    mapRef.current = null;
  }, []);

  // Icon config: use canvas-generated badge data URLs; scale size by zoom so icons stay visible when panned out
  const markerIcons = (() => {
    if (typeof google === 'undefined' || !google.maps || !badgeIcons.customer || !badgeIcons.store || !badgeIcons.driver) {
      return null;
    }
    const sizePx = iconSizeForZoom(mapZoom);
    const size = new google.maps.Size(sizePx, sizePx);
    const anchor = new google.maps.Point(sizePx / 2, sizePx);
    return {
      customer: { url: badgeIcons.customer, scaledSize: size, anchor },
      store: { url: badgeIcons.store, scaledSize: size, anchor },
      driver: { url: badgeIcons.driver, scaledSize: size, anchor },
    };
  })();

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
        onUnmount={onMapUnmount}
      >
        <Marker
          position={{ lat: deliveryLat, lng: deliveryLng }}
          title="Delivery address"
          icon={markerIcons?.customer}
        />
        {showStores && storeLocations.map((store, i) => (
          <Marker
            key={`store-${i}`}
            position={{ lat: store.lat, lng: store.lng }}
            title={store.label || `Store ${i + 1}`}
            icon={markerIcons?.store}
          />
        ))}
        {allDrivers.map((driver, i) => (
          <Marker
            key={`driver-${i}`}
            position={{ lat: driver.latitude, lng: driver.longitude }}
            title={`Delivery partner ${i + 1}`}
            icon={markerIcons?.driver}
          />
        ))}
        {routePaths.filter((p) => p.length >= 2).map((path, i) => (
          <Polyline
            key={`route-${i}-${path.length}`}
            path={path}
            options={{
              strokeColor: '#1f2937',
              strokeOpacity: 0.9,
              strokeWeight: 5,
            }}
          />
        ))}
      </GoogleMap>
    </div>
  );
}
