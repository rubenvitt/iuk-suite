import { headers } from "next/headers";
import { requireGemeinschaftHost } from "../_lib/host";

/**
 * Die Teile ohne Anmeldung: Bar anfragen, Statusseite einer Anfrage, persönlicher Link eines Mitglieds.
 * Ohne Suite-Hülle und ohne antd — Gestaltung nach `docs/design/feedback-oeffentliche-ansicht.md`.
 */
export default async function GemeinschaftOffenLayout({ children }: { children: React.ReactNode }) {
  requireGemeinschaftHost(await headers());
  return children;
}
