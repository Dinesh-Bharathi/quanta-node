import { Router } from "express";
import {
  getCountries,
  getStateOfCountry,
  getCountryDetails,
  getCountryStateDetails,
} from "./lookups.controller.js";

const router = Router();

router.get("/countries", getCountries);

router.get("/states/:countryCode", getStateOfCountry);

router.get("/country/:countryCode", getCountryDetails);

router.get("/country/:countryCode/details", getCountryStateDetails);

export default router;
