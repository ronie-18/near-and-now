/**
 * Application Configuration
 * 
 * This file provides centralized configuration for the application.
 * Environment variables are loaded from .env file (not committed to git).
 * See .env.example for required environment variables.
 */

interface AppConfig {
  // Google Maps API Key
  GOOGLE_MAPS_API_KEY: string;
  
  // App settings
  LOCATION_CACHE_DURATION: number;
  SEARCH_RADIUS_KM: number;
  MAX_SAVED_ADDRESSES: number;
  
  // Environment detection methods
  isProduction: () => boolean;
  isProductionDomain: () => boolean;
  requiresHTTPS: () => boolean;
  getApiKey: () => string;
}

const APP_CONFIG: AppConfig = {
  // Google Maps API Key - Loaded from environment variables
  GOOGLE_MAPS_API_KEY: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  
  // App settings - with fallback defaults
  LOCATION_CACHE_DURATION: Number(import.meta.env.VITE_LOCATION_CACHE_DURATION) || 24 * 60 * 60 * 1000, // 24 hours
  SEARCH_RADIUS_KM: Number(import.meta.env.VITE_SEARCH_RADIUS_KM) || 2, // 2km radius
  MAX_SAVED_ADDRESSES: Number(import.meta.env.VITE_MAX_SAVED_ADDRESSES) || 5,
  
  // Environment detection
  isProduction: function(): boolean {
    return import.meta.env.PROD;
  },
  
  // Check if we're on the production domain
  isProductionDomain: function(): boolean {
    if (typeof window === 'undefined') return false;
    return window.location.hostname === 'nearandnow.in' || 
           window.location.hostname === 'www.nearandnow.in';
  },
  
  // Check if HTTPS is required and available
  requiresHTTPS: function(): boolean {
    if (typeof window === 'undefined') return false;
    return this.isProduction() && window.location.protocol !== 'https:';
  },
  
  // Get the appropriate API key based on environment
  getApiKey: function(): string {
    return this.GOOGLE_MAPS_API_KEY;
  }
};

// Log configuration status in development
if (import.meta.env.DEV) {
  console.log('🔧 App configuration loaded');
  console.log('🌐 Environment:', APP_CONFIG.isProduction() ? 'Production' : 'Development');
  console.log('🔑 API Key Status:', APP_CONFIG.getApiKey() ? 'Present' : 'NOT FOUND - Check .env file');
  
  if (!APP_CONFIG.getApiKey()) {
    console.warn('⚠️ Google Maps API key is missing! Copy .env.example to .env and add your API key.');
  }
}

export default APP_CONFIG;
