/** The languages of the site. Each one has a Library of its own (see `@/lib/alphabet`). */
export const locales = ["ru", "en"] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ru";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
