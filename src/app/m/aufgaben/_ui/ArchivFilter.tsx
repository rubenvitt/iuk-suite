"use client";

import { PRIORITAETEN } from "../_db/schema";
import { PRIORITAET_TEXT } from "../_lib/anzeige";
import { SPACE } from "@/core/theme/tokens";

/*
 * DER FILTER VON `/archiv` — EINE CLIENT-INSEL, DIE FILTERUNG SELBST BLEIBT SERVERSEITIG (Brief,
 * Spec §8). Diese Komponente FILTERT NICHTS: sie schreibt den gewaehlten Wert nur in die URL
 * (`?prioritaet=...`, ein natives GET-Formular) und ueberlaesst `archiv/page.tsx` (Server
 * Component), die angezeigte Liste daraus neu zu lesen. Eine Liste, die im Browser filtert, haette
 * die fremden Zeilen VORHER schon ausgeliefert — genau das, was diese Trennung vermeidet.
 *
 * NATIVES `<form method="get">` PLUS NATIVES `<select>`, KEIN `useRouter()`/`usePathname()` UND
 * KEIN antd-`Select`: dieselbe Linie wie `_ui/WochenWaehler.tsx`/`_ui/TagesWaehler.tsx`, die den
 * URL-Zustand ausschliesslich ueber `href`/native Formulare aendern, nie ueber einen Router-Hook
 * — kein zweites Navigations-Vokabular im Modul. Der Browser haengt `?prioritaet=...` selbst an
 * `/archiv` an; `onChange` loest nur das ohnehin vorhandene Absenden aus, fuer die bessere
 * Bedienung ohne einen sichtbaren Extra-Knopf.
 */
export function ArchivFilter({ prioritaet }: { prioritaet: string }) {
  return (
    <form
      method="get"
      action="/archiv"
      style={{ display: "flex", alignItems: "center", gap: SPACE.sm, marginBlockEnd: SPACE.md }}
    >
      <label htmlFor="archiv-prioritaet">Priorität</label>
      <select
        id="archiv-prioritaet"
        name="prioritaet"
        defaultValue={prioritaet}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
      >
        <option value="">Alle</option>
        {PRIORITAETEN.map((p) => (
          <option key={p} value={p}>
            {PRIORITAET_TEXT[p]}
          </option>
        ))}
      </select>
    </form>
  );
}
