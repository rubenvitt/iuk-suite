import { headers } from "next/headers";
import "./druck.css";
import { requireLagerbuchHost } from "../../_lib/host";
import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { DruckRahmen } from "../../_ui/DruckRahmen";

/**
 * DAS DRUCK-LAYOUT DES ETIKETTENBOGENS (Spec §8.4, Entscheidung 8-H; §6.1.3).
 *
 * EIGENE ROUTE-GROUP OHNE SUITE-SHELL: laege der Bogen unter `(arbeit)`, druckte
 * `FullShell` Kopfzeile und App-Switcher mit — und `minHeight:100vh`
 * (FullShell.tsx:19) erzeugte leere Folgeseiten hinter dem Bogen.
 *
 * DER PREIS UND SEINE BEZAHLUNG — und das ist die sicherheitsrelevante Zeile
 * dieses Moduls: mit dem `(arbeit)`-Layout faellt auch dessen Zugriffsriegel
 * weg, und DIESE Seite zeigt die Zugangs-Codes IM KLARTEXT und als QR
 * (../../lagerbuch/src/db/etiketten.ts:19,23). Deshalb ruft dieses Layout
 * DIESELBEN zwei Riegel wie `(arbeit)/layout.tsx` — dieselbe Funktion, nicht
 * zwei Abschriften (§6.1.3, Punkt 1). Die beiden Zeilen unten stehen deshalb
 * ZEICHENGLEICH zu `(arbeit)/layout.tsx`.
 *
 * Der aeussere Host-Riegel laeuft vor dem Personen-Riegel. So verraet ein
 * anonymer Aufruf auf einem fremden Host die Verwaltungsroute nicht ueber
 * einen vorgeschalteten Login-Umweg.
 *
 * ZWEI LINIEN SIND PFLICHT, weil `requiresAuth: false` gilt und die Middleware
 * hier nicht gatet: der Riegel in diesem Layout UND derselbe Riegel in der Seite
 * (§8.4, 8-H). Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (§2.1 d).
 *
 * DER PRAEZEDENZFALL STEHT IM REPO: „Der Praezedenzfall `feedback` hat sie als
 * eigene Route mit eigenem Layout — und genau dort fiel sie aus dem
 * Zugriffsriegel heraus, weil der Riegel im anderen Layout hing."
 * (src/app/m/files/_ui/zugangslinks.module.css:11-16). feedback hat es repariert
 * (m/feedback/(print)/layout.tsx); lagerbuch uebernimmt genau dieses Muster.
 *
 * NIE `session.user.isAdmin`, nie `isModuleAdmin`: der Suite-Admin bekommt keine
 * Lagerbuch-Rechte (Betreiber-Entscheidung 3, §3.6.1).
 *
 * Die EINZIGE Zusicherung, die diese Kopplung prueft, ist ein ABRUF:
 * /verwaltung/etiketten ohne Lagerbuch-Gruppe muss dieselbe Antwort geben wie
 * /verwaltung/artikel ohne Gruppe (T167, T175). Ein Quelltext-Scan sieht sie
 * nicht.
 */
export default async function LagerbuchDruckLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const kopf = await headers();
  requireLagerbuchHost(kopf);
  await requireLagerbuchAdmin();

  return <DruckRahmen>{children}</DruckRahmen>;
}
