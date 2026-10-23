/** A different site must not borrow the browser's httpOnly guest cookie. */
export function sameHost(origin: string | undefined, host: string | undefined): boolean {
  try {
    const page = new URL(origin ?? "");
    const endpoint = new URL(`http://${host ?? ""}`);
    return (page.protocol === "http:" || page.protocol === "https:") && page.hostname === endpoint.hostname;
  } catch { return false; }
}
