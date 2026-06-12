import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import ka from "./ka.json";

// Default language is English; the ქარ toggle in the header switches to Georgian.
// Per conventions we don't use localStorage, so the choice resets per session;
// persistence can move to the Supabase profile later.
void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ka: { translation: ka },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
