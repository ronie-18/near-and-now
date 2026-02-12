/**
 * DeliveryMap - Live map showing delivery address and driver location.
 * Shows delivery partner's real-time position when in transit.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useJsApiLoader, GoogleMap, Marker, Polyline } from '@react-google-maps/api';
import { MapPin, Truck } from 'lucide-react';
import APP_CONFIG from '../../config/app-config';

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };
const MAP_OPTIONS = {
  zoomControl: true,
  mapTypeControl: false,
  streetViewControl: false,
  fullscreenControl: true,
};

interface DeliveryMapProps {
  deliveryLat: number;
  deliveryLng: number;
  driverLocation: { latitude: number; longitude: number } | null;
  className?: string;
}

export default function DeliveryMap({
  deliveryLat,
  deliveryLng,
  driverLocation,
  className = '',
}: DeliveryMapProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const apiKey = APP_CONFIG.getApiKey();
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey || '',
    id: 'delivery-tracking-map',
  });

  const fitBounds = useCallback(() => {
    if (!mapRef.current) return;
    if (driverLocation) {
      const bounds = new google.maps.LatLngBounds();
      bounds.extend({ lat: deliveryLat, lng: deliveryLng });
      bounds.extend({ lat: driverLocation.latitude, lng: driverLocation.longitude });
      mapRef.current.fitBounds(bounds, { top: 50, right: 50, bottom: 50, left: 50 });
    } else {
      mapRef.current.setCenter({ lat: deliveryLat, lng: deliveryLng });
      mapRef.current.setZoom(15);
    }
  }, [deliveryLat, deliveryLng, driverLocation]);

  useEffect(() => {
    if (isLoaded && mapRef.current) {
      fitBounds();
    }
  }, [isLoaded, driverLocation, fitBounds]);

  const onMapLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      fitBounds();
    },
    [fitBounds]
  );

  if (loadError) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: 280 }}>
        <div className="text-center p-6">
          <MapPin className="w-12 h-12 text-gray-400 mx-auto mb-2" />
          <p className="text-gray-600">Map unavailable. Check Google Maps API key.</p>
        </div>
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className={`bg-gray-100 rounded-lg flex items-center justify-center ${className}`} style={{ minHeight: 280 }}>
        <div className="animate-spin w-10 h-10 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    );
  }

  const path = driverLocation
    ? [
        { lat: driverLocation.latitude, lng: driverLocation.longitude },
        { lat: deliveryLat, lng: deliveryLng },
      ]
    : [];

  return (
    <div className={`rounded-lg overflow-hidden border border-gray-200 ${className}`} style={{ minHeight: 280 }}>
      <GoogleMap
        mapContainerStyle={MAP_CONTAINER_STYLE}
        mapContainerClassName="w-full h-[280px]"
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
        {driverLocation && (
          <>
            <Marker
              position={{ lat: driverLocation.latitude, lng: driverLocation.longitude }}
              title="Delivery partner"
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: 14,
                fillColor: '#3b82f6',
                fillOpacity: 1,
                strokeColor: '#ffffff',
                strokeWeight: 2,
              }}
            />
            <Polyline
              path={path}
              options={{
                strokeColor: '#3b82f6',
                strokeOpacity: 0.8,
                strokeWeight: 4,
              }}
            />
          </>
        )}
      </GoogleMap>
      <div className="bg-white px-4 py-2 border-t border-gray-200 flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-green-500" />
          Delivery address
        </span>
        {driverLocation && (
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500" />
            <Truck className="w-4 h-4 text-blue-500" />
            Delivery partner
          </span>
        )}
      </div>
    </div>
  );
}
