"use client";

import { PRIORITAETEN } from "../_db/schema";
import { PRIORITAET_TEXT } from "../_lib/anzeige";
import { WahlFeld } from "./Felder";
import { SPACE } from "@/core/theme/tokens";

/*
 * DER FILTER VON `/archiv` — EINE CLIENT-INSEL, DIE FILTERUNG SELBST BLEIBT SERVERSEITIG (Brief,
 * Spec §8). Diese Komponente FILTERT NICHTS: sie schreibt den gewaehlten Wert nur in die URL
 * (`?prioritaet=...`, ein natives GET-Formular) und ueberlaesst `archiv/page.tsx` (Server
 * Component), die angezeigte Liste daraus neu zu lesen. Eine Liste, die im Browser filtert, haette
 * die fremden Zeilen VORHER schon ausgeliefert — genau das, was diese Trennung vermeidet.
 *
 * NATIVES `<form method="get">`, KEIN `useRouter()`/`usePathname()`: dieselbe Linie wie
 * `_ui/WochenWaehler.tsx`/`_ui/TagesWaehler.tsx`, die den URL-Zustand ausschliesslich ueber
 * `href`/native Formulare aendern, nie ueber einen Router-Hook — kein zweites Navigations-Vokabular
 * im Modul. Der Browser haengt `?prioritaet=...` selbst an `/archiv` an; die Wahl loest nur das
 * ohnehin vorhandene Absenden aus, fuer die bessere Bedienung ohne einen sichtbaren Extra-Knopf.
 *
 * ══ DAS FELD IST SEIT DER FUENFTEN OBERFLAECHEN-RUNDE (2026-08-16) antds `Select`, NICHT MEHR EIN
 *    NATIVES `<select>`. Hier stand „KEIN antd-`Select`", und die Begruendung war dieselbe wie in
 *    `PersonenFormular.tsx`: kein zweites Formular-Vokabular im Modul. Mit `_ui/Felder.tsx` IST
 *    antd dieses Vokabular — der Satz hat sich umgedreht, nicht verloren.
 *
 * ══ WARUM DAS ABSENDEN UEBER `requestSubmit()` AM VERSTECKTEN FELD LAEUFT UND NICHT UEBER
 *    `e.currentTarget.form` WIE VORHER: antds `Select` ist kein Formularelement, es hat kein
 *    `.form`. Der Wert liegt im versteckten Feld, das `WahlFeld` mitfuehrt — und genau dieses Feld
 *    kennt sein Formular. `WahlFeld` schreibt den neuen Wert VOR dem Ruf hierher in den DOM (die
 *    Begruendung steht dort); `requestSubmit()` liest deshalb den eben gewaehlten Wert, nicht den
 *    vorigen. Ohne diese Reihenfolge filterte die Seite jedes Mal auf die VORHERIGE Wahl — ein
 *    Fehler, den man an der Oberflaeche fuer eine Verzoegerung haelt, nicht fuer einen Bug.
 */
export function ArchivFilter({ prioritaet }: { prioritaet: string }) {
  return (
    <form
      method="get"
      action="/archiv"
      style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBlockEnd: SPACE.md }}
    >
      <label htmlFor="archiv-prioritaet">Priorität</label>
      {/*
       * DIE BREITE STEHT HIER UND NICHT IN `WahlFeld`: dort ist `width: 100%` richtig, weil jedes
       * andere Auswahlfeld des Moduls in einer Formularspalte steht und deren Breite fuellen soll.
       * Dieses eine steht NEBEN seiner Beschriftung in einer Zeile — auf 100% zoege es die Zeile
       * ueber die ganze Seitenbreite auseinander.
       */}
      <div style={{ minWidth: 200 }}>
        <WahlFeld
          id="archiv-prioritaet"
          name="prioritaet"
          wert={prioritaet}
          optionen={[
            { wert: "", text: "Alle" },
            ...PRIORITAETEN.map((p) => ({ wert: p, text: PRIORITAET_TEXT[p] })),
          ]}
          beiWahl={(_, feld) => feld.form?.requestSubmit()}
        />
      </div>
    </form>
  );
}
