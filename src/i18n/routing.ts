import { defineRouting } from "next-intl/routing";
import { defaultLocale, locales } from "./locales";

/** Russian lives at the root (`/page/…`), English under `/en` (`/en/page/…`). */
export const routing = defineRouting({
  locales,
  defaultLocale,
  localePrefix: "as-needed",
});
