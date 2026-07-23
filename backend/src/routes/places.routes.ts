import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import * as placesController from '../controllers/places.controller.js';

const router = Router();

// These routes are intentionally public (address entry happens before login),
// but each call forwards to a billed Google Maps API with no other gate in
// front of it — unthrottled, they're a cheap cost-DoS vector (script a loop,
// run up the Google Maps bill). 60/min per IP is generous for real usage
// (autocomplete firing on every keystroke while typing an address) while
// still meaningfully throttling scripted abuse. Same library/pattern already
// used for OTP rate limiting in auth.routes.ts.
const placesLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  keyGenerator: (req) => req.ip || 'unknown',
  message: { error: 'Too many requests. Please slow down.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.use(placesLimiter);

router.get('/autocomplete', placesController.autocomplete);
router.get('/details', placesController.placeDetails);
router.get('/geocode', placesController.geocode);
router.get('/reverse-geocode', placesController.reverseGeocode);
router.get('/directions', placesController.directions);
router.get('/road-route', placesController.roadRoute);

export default router;
