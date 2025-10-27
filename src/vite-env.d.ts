/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GOOGLE_MAPS_API_KEY: string;
  readonly VITE_LOCATION_CACHE_DURATION: string;
  readonly VITE_SEARCH_RADIUS_KM: string;
  readonly VITE_MAX_SAVED_ADDRESSES: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
