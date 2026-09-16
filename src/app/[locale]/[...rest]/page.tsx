import { notFound } from "next/navigation";

/** Unknown paths render the localized not-found page inside the layout (header and all). */
export default function CatchAll() {
  notFound();
}
