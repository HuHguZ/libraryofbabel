import type { NextRequest } from "next/server";
import createMiddleware from "next-intl/middleware";
import { routing } from "./i18n/routing";

/** The home page follows the visitor's language: the saved choice first, then the browser's. */
const detecting = createMiddleware(routing);

/**
 * Every other URL names its language outright: `/page/…` is the Russian Library and `/en/page/…`
 * the English one, and the same address holds different text in each. A shared link has to open
 * the Library it was copied from, so these paths are never redirected to another language.
 */
const literal = createMiddleware({ ...routing, localeDetection: false });

export default function proxy(request: NextRequest) {
  return request.nextUrl.pathname === "/" ? detecting(request) : literal(request);
}

export const config = {
  // Everything except the API, Next.js internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
