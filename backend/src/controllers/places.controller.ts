/**
 * Places controller - proxies Google Places & Geocoding APIs.
 * Required because these REST APIs don't support CORS from browser.
 */

import { Request, Response } from 'express';

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
const AUTOCOMPLETE_URL = 'https://maps.googleapis.com/maps/api/place/autocomplete/json';
const PLACE_DETAILS_URL = 'https://maps.googleapis.com/maps/api/place/details/json';

function getApiKey(): string {
  return process.env.VITE_GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY || '';
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
