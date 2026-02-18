/**
 * Places controller - proxies Google Places & Geocoding APIs.
 * Required because these REST APIs don't support CORS from browser.
 */

import { Request, Response } from 'express';
import { fetchRoadRoute } from '../services/directions.service.js';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';
const DIRECTIONS_URL = 'https://maps.googleapis.com/maps/api/directions/json';

function getApiKey(): string {
  // Prefer server-side API key (no referrer restrictions)
  // Fallback to VITE_ key for backward compatibility
  return process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_SERVER_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';
}

export async function autocomplete(req: Request, res: Response) {
  const { input } = req.query;
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(500).json({ status: 'ERROR', error_message: 'Google Maps API key not configured' });
  }
  if (!input || typeof input !== 'string') {
    return res.status(400).json({ status: 'INVALID_REQUEST', error_message: 'Missing input parameter' });
  }

  try {
    const url = new URL(AUTOCOMPLETE_URL);
    url.searchParams.set('input', input);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('components', 'country:in');
    url.searchParams.set('types', 'geocode');

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error('Places autocomplete error:', err);
    res.status(500).json({
      status: 'ERROR',
      error_message: err instanceof Error ? err.message : 'Autocomplete request failed',
    });
  }
}

export async function placeDetails(req: Request, res: Response) {
  const { place_id } = req.query;
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(500).json({ status: 'ERROR', error_message: 'Google Maps API key not configured' });
  }
  if (!place_id || typeof place_id !== 'string') {
    return res.status(400).json({ status: 'INVALID_REQUEST', error_message: 'Missing place_id parameter' });
  }

  try {
    const url = new URL(PLACE_DETAILS_URL);
    url.searchParams.set('place_id', place_id);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('fields', 'formatted_address,address_components,geometry');

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error('Place details error:', err);
    res.status(500).json({
      status: 'ERROR',
      error_message: err instanceof Error ? err.message : 'Place details request failed',
    });
  }
}

export async function geocode(req: Request, res: Response) {
  const { address } = req.query;
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(500).json({ status: 'ERROR', error_message: 'Google Maps API key not configured' });
  }
  if (!address || typeof address !== 'string') {
    return res.status(400).json({ status: 'INVALID_REQUEST', error_message: 'Missing address parameter' });
  }

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('address', address);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('components', 'country:IN');

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error('Geocode error:', err);
    res.status(500).json({
      status: 'ERROR',
      error_message: err instanceof Error ? err.message : 'Geocode request failed',
    });
  }
}

export async function reverseGeocode(req: Request, res: Response) {
  const { lat, lng } = req.query;
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(500).json({ status: 'ERROR', error_message: 'Google Maps API key not configured' });
  }
  const latNum = parseFloat(String(lat));
  const lngNum = parseFloat(String(lng));
  if (isNaN(latNum) || isNaN(lngNum)) {
    return res.status(400).json({ status: 'INVALID_REQUEST', error_message: 'Missing or invalid lat/lng parameters' });
  }

  try {
    const url = new URL(GEOCODE_URL);
    url.searchParams.set('latlng', `${latNum},${lngNum}`);
    url.searchParams.set('key', apiKey);

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error('Reverse geocode error:', err);
    res.status(500).json({
      status: 'ERROR',
      error_message: err instanceof Error ? err.message : 'Reverse geocode request failed',
    });
  }
}

export async function directions(req: Request, res: Response) {
  const { origin, destination } = req.query;
  const apiKey = getApiKey();

  if (!apiKey) {
    return res.status(500).json({ status: 'ERROR', error_message: 'Google Maps API key not configured' });
  }
  const originStr = typeof origin === 'string' ? origin : '';
  const destStr = typeof destination === 'string' ? destination : '';
  if (!originStr || !destStr) {
    return res.status(400).json({ status: 'INVALID_REQUEST', error_message: 'Missing origin or destination (lat,lng)' });
  }

  try {
    const url = new URL(DIRECTIONS_URL);
    url.searchParams.set('origin', originStr);
    url.searchParams.set('destination', destStr);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('mode', 'driving');
    url.searchParams.set('alternatives', 'false');
    url.searchParams.set('region', 'in');
    url.searchParams.set('components', 'country:in');

    const response = await fetch(url.toString());
    const data = await response.json();
    res.json(data);
  } catch (err: unknown) {
    console.error('Directions error:', err);
    res.status(500).json({
      status: 'ERROR',
      error_message: err instanceof Error ? err.message : 'Directions request failed',
    });
  }
}

/** Get road route (Directions API + Roads API fallback). Returns points along actual roads. */
export async function roadRoute(req: Request, res: Response) {
  const { origin, destination } = req.query;
  const originStr = typeof origin === 'string' ? origin : '';
  const destStr = typeof destination === 'string' ? destination : '';
  if (!originStr || !destStr) {
    return res.status(400).json({ error: 'Missing origin or destination (lat,lng)' });
  }
  const [oLat, oLng] = originStr.split(',').map(Number);
  const [dLat, dLng] = destStr.split(',').map(Number);
  if (isNaN(oLat) || isNaN(oLng) || isNaN(dLat) || isNaN(dLng)) {
    return res.status(400).json({ error: 'Invalid origin/destination format' });
  }
  try {
    const points = await fetchRoadRoute({ lat: oLat, lng: oLng }, { lat: dLat, lng: dLng });
    res.json({ status: 'OK', points });
  } catch (err: unknown) {
    console.error('Road route error:', err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Road route failed' });
  }
}
