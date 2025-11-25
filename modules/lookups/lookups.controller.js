import { Country, State } from "country-state-city";
import getSymbolFromCurrency from "currency-symbol-map";
import { getExampleNumber, parsePhoneNumber } from "libphonenumber-js";
import examples from "libphonenumber-js/mobile/examples";

// Helper function to get phone number length constraints
const getPhoneNumberLengths = (countryCode) => {
  try {
    // Get example mobile number for the country
    const exampleNumber = getExampleNumber(countryCode, examples);

    if (!exampleNumber) {
      return { minLength: null, maxLength: null, callingCode: null };
    }

    const nationalNumber = exampleNumber.nationalNumber;
    const callingCode = exampleNumber.countryCallingCode;

    // Parse to get accurate information
    const parsed = parsePhoneNumber(`+${callingCode}${nationalNumber}`);

    return {
      minLength: nationalNumber.length,
      maxLength: nationalNumber.length,
      callingCode: `+${callingCode}`,
      exampleNumber: nationalNumber,
      format: parsed.formatInternational(),
    };
  } catch (error) {
    console.error(
      `Error getting phone lengths for ${countryCode}:`,
      error.message
    );
    return { minLength: null, maxLength: null, callingCode: null };
  }
};

export const getCountries = (req, res, next) => {
  try {
    const countries = Country.getAllCountries().map((c) => ({
      ...c,
      flagUrl: `https://flagcdn.com/${c.isoCode.toLowerCase()}.svg`,
      currencySymbol: getSymbolFromCurrency(c.currency) || null,
      phoneNumber: getPhoneNumberLengths(c.isoCode),
    }));

    res.status(200).json({
      success: true,
      data: countries,
    });
  } catch (error) {
    next(error);
  }
};

export const getStateOfCountry = (req, res, next) => {
  try {
    const { countryCode } = req.params;
    const states = State.getStatesOfCountry(countryCode);

    res.status(200).json({
      success: true,
      data: states,
    });
  } catch (error) {
    next(error);
  }
};

export const getCountryDetails = (req, res, next) => {
  try {
    const { countryCode } = req.params;

    const country = Country.getCountryByCode(countryCode);
    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    res.status(200).json({
      success: true,
      data: {
        ...country,
        flagUrl: `https://flagcdn.com/${countryCode.toLowerCase()}.svg`,
        currencySymbol: getSymbolFromCurrency(country.currency) || null,
        phoneNumber: getPhoneNumberLengths(countryCode),
      },
    });
  } catch (error) {
    next(error);
  }
};

export const getCountryStateDetails = (req, res, next) => {
  try {
    const { countryCode } = req.params;

    const country = Country.getCountryByCode(countryCode);
    if (!country) {
      return res.status(404).json({
        success: false,
        message: "Country not found",
      });
    }

    const states = State.getStatesOfCountry(countryCode);

    res.status(200).json({
      success: true,
      data: {
        ...country,
        flagUrl: `https://flagcdn.com/${countryCode.toLowerCase()}.svg`,
        currencySymbol: getSymbolFromCurrency(country.currency) || null,
        phoneNumber: getPhoneNumberLengths(countryCode),
        states,
      },
    });
  } catch (error) {
    next(error);
  }
};
