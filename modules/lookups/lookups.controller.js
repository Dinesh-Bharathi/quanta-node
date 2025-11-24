import { Country, State } from "country-state-city";
import getSymbolFromCurrency from "currency-symbol-map";

export const getCountries = (req, res, next) => {
  try {
    const countries = Country.getAllCountries().map((c) => ({
      ...c,
      flagUrl: `https://flagcdn.com/${c.isoCode.toLowerCase()}.svg`,
      currencySymbol: getSymbolFromCurrency(c.currency) || null,
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
        states,
      },
    });
  } catch (error) {
    next(error);
  }
};
