import { useCallback } from "react";
import { useLocale } from "next-intl";
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing);

/** Turns a path into the current language's URL, for `window.history.replaceState` (which bypasses the router). */
export function useLocalizedPath() {
  const locale = useLocale();
  return useCallback((href: string) => getPathname({ href, locale }), [locale]);
}
