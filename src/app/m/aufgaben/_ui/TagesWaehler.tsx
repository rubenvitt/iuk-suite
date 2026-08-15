"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { fmtTagKurz } from "../_lib/datum";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "./aufgaben.module.css";

/*
 * DER MOBILE TAGESWAEHLER (Spec §9.6, Aufgabe 13) — und der Spec ist hier ungewoehnlich genau:
 * EINE ECHTE RADIOGRUPPE, EIN TABSTOP, PFEILTASTEN WAEHLEN NATIV — KEINE KNOPFREIHE. Das ist eine
 * Zugaenglichkeitszusage, keine Stilfrage: eine Knopfreihe haette fuenf Tabstops und keine
 * Pfeiltastennavigation. Natives `<input type="radio">` in einem `<fieldset>` mit `<legend>`, NICHT
 * antds `Radio.Group` (Compound-Zugriff, Falle 1) und KEINE Knoepfe.
 *
 * `.tagesWaehler` blendet das `<fieldset>` per CSS oberhalb von 767.98px aus (dieselbe eine
 * Medienabfrage wie `.wochenGitter`/`.tagesListe`) — die Komponente rendert immer, ohne
 * `Grid.useBreakpoint`.
 *
 * DIE AUSWAHL AENDERT DIE URL (`?tag=...`), NICHT EINEN `useState` — dieselbe Begruendung wie
 * `WochenWaehler`: teilbar, im Browser-Verlauf, kein Zuruecksringen bei einem Neuladen. Der
 * bestehende `woche`-Parameter bleibt dabei erhalten (`useSearchParams` wird kopiert, nicht
 * ersetzt) — ein Tageswechsel soll die angezeigte Woche nicht veraendern.
 */
export function TagesWaehler({
  tage,
  ausgewaehlterTag,
}: {
  /** Die fuenf Tage der angezeigten Woche, Mo–Fr, ISO. */
  tage: readonly string[];
  ausgewaehlterTag: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function waehlen(tag: string): void {
    const naechste = new URLSearchParams(searchParams.toString());
    naechste.set("tag", tag);
    router.push(`${pathname}?${naechste.toString()}`);
  }

  return (
    <fieldset
      className={s.tagesWaehler}
      style={{ border: "none", padding: 0, margin: 0, gap: SPACE.sm, flexWrap: "wrap" }}
    >
      <legend style={{ ...SCHRIFT.kicker, padding: 0, marginBlockEnd: SPACE.xs }}>Tag</legend>
      {tage.map((tag) => (
        <label
          key={tag}
          style={{ display: "inline-flex", alignItems: "center", gap: SPACE.xs, marginInlineEnd: SPACE.sm }}
        >
          <input
            type="radio"
            name="tageswahl"
            value={tag}
            checked={tag === ausgewaehlterTag}
            onChange={() => waehlen(tag)}
          />
          {fmtTagKurz(tag)}
        </label>
      ))}
    </fieldset>
  );
}
