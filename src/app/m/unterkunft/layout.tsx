import { headers } from "next/headers";
import { requireUnterkunftHost } from "./_lib/host";
import { requireUnterkunftSitzung } from "./_lib/zugang";

/**
 * Host und Sitzung oberhalb jeder künftigen `loading.tsx` (Falle 23). Ohne Hülle, weil das Druckblatt
 * keine haben darf; der Rechner setzt sie in `(rechner)/layout.tsx`. Jede Seite fragt trotzdem selbst.
 */
export default async function UnterkunftLayout({ children }: { children: React.ReactNode }) {
  requireUnterkunftHost(await headers());
  await requireUnterkunftSitzung();
  return children;
}
