import { headers } from "next/headers";
import { requireSchichtplanHost } from "../_lib/host";
import { requireSchichtplanZugang } from "../_lib/zugang";

/**
 * Host und Zugang oberhalb jeder künftigen `loading.tsx` (Falle 23). Ohne Hülle, weil die Druckansicht
 * darunter keine haben darf; Liste und Editor setzen sie in ihren eigenen Layouts. Jede Seite ruft die
 * Riegel noch einmal — eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function SchichtplanInternLayout({ children }: { children: React.ReactNode }) {
  requireSchichtplanHost(await headers());
  await requireSchichtplanZugang();
  return children;
}
