import { headers } from "next/headers";
import { requireFahrzeugeHost } from "../_lib/host";
import { requireFahrzeugeZugang } from "../_lib/zugang";

/**
 * Die Hallentafel steht ohne Suite-Rahmen: kein Menü, keine Kopfzeile — sie läuft auf einem Bildschirm in
 * der Fahrzeughalle. Die Riegel sind dieselben wie in der Verwaltung (Host zuerst, dann Gruppe), und die
 * Seite ruft sie noch einmal: eine Route Group ist keine Sicherheitsgrenze.
 */
export default async function HallenLayout({ children }: { children: React.ReactNode }) {
  requireFahrzeugeHost(await headers());
  await requireFahrzeugeZugang();
  return children;
}
