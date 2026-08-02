// Die modulweiten CSS-Variablen (`--fi-*`) und die Umschaltung
// Tabelle/Kartenliste. Der Import steht HIER und nicht in den Layouts: damit
// liegen Shell, Navigation und Variablen an EINER Stelle mit zwei Importeuren,
// und keiner der beiden kann den Stylesheet-Import vergessen. (`feedback` hat
// ihn im Layout, weil es keine gemeinsame Rahmenkomponente hat.)
import "./files.css";
import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";
import type { SuiteNavItem } from "@/core/shell/types";

/**
 * DER RAHMEN DER VERWALTUNGSSEITEN — EINE STELLE, ZWEI IMPORTEURE.
 *
 * `files` bedient zwei Hosts, die beide auf `/m/files` rewriten. Der
 * Rollen-Verteiler `page.tsx` muss deshalb auszerhalb aller Route-Groups liegen
 * und bekommt `(verwaltung)/layout.tsx` NICHT — Next.js stapelt Layouts pro
 * Pfad-Segment. Haengen Shell und Navigation allein am Group-Layout, stuende die
 * Freigaben-Uebersicht auf der Modulwurzel ohne Navigation (Spec §3.5). Beide
 * rufen darum diesen Rahmen; er ist die einzige Stelle, die `Shell` kennt.
 *
 * `nav` ist ein PFLICHT-Prop und kein Vorgabewert: die beiden aufrufenden SERVER
 * Components lesen `FILES_NAV` aus `_lib/nav.ts` selbst (dort steht, warum es
 * dort und nicht hier liegt). Ein optionaler Vorgabewert waere der einzige
 * Bauform, deren Fehlerfall niemand sieht — vergessenes `nav` ergaebe eine Seite
 * ohne Navigation, statt eines Typfehlers.
 *
 * Server Component, und ohne jeden Import aus `antd`: `Shell` traegt die
 * antd-Bausteine, und die Compound-Falle (`Layout.Header` & Co. ergeben in RSC
 * `undefined` und HTTP 500) ist hier damit strukturell ausgeschlossen. `variant`
 * kommt aus der Registry, nicht als Literal — sonst haette das Modul zwei
 * Wahrheiten ueber seine eigene Shell.
 */
export function VerwaltungsRahmen({
  nav,
  children,
}: {
  nav: SuiteNavItem[];
  children: React.ReactNode;
}) {
  const mod = getModule("files");
  return (
    <Shell variant={mod.shell} moduleKey={mod.key} nav={nav}>
      {children}
    </Shell>
  );
}
