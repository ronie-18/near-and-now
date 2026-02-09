import { Router } from 'express';
import * as placesController from '../controllers/places.controller.js';

const router = Router();

router.get('/autocomplete', placesController.autocomplete);
router.get('/details', placesController.placeDetails);
router.get('/geocode', placesController.geocode);
router.get('/reverse-geocode', placesController.reverseGeocode);

export default router;
