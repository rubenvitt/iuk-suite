"use client";

import { useMemo, useState } from "react";
import { Button } from "antd";
import { layout } from "../../_lib/layout/layout";
import { baueSicht } from "../../_lib/layout/sicht";
import { legende } from "../../_lib/layout/zeichne";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { Flaeche } from "./Flaeche";
import { Legende } from "./Legende";
import { Umschalter } from "./EinklappKnopf";

/**
 * Der Betrachter (Spec §5.7): dasselbe Layout wie der Druck, mit Zoom, Verschieben und Einklappen.
 * Rechnet das Layout im Browser — `layout()` ist rein und teilt Metriken mit dem Server.
 *
 * KEIN setState IM EFFEKT-RUMPF (`react-hooks/set-state-in-effect` ist aktiv, Vorbild
 * `core/tabelle/useEntprellt.ts`): die eingepasste Ansicht wird beim Rendern aus der gemessenen
 * Flächengröße ABGELEITET; eigener Zustand entsteht erst, wenn jemand zoomt oder verschiebt.
 * „Einpassen" heißt: eigenen Zustand verwerfen. Gemessen wird per ResizeObserver-Rückruf — umgesetzt in `Flaeche.tsx`.
 *
 * LEGENDE wie auf dem Blatt (Spec §5.6, A3): verwendete Arten und Reservekanäle — die stehen sonst
 * nirgends am Bildschirm. Sie beschreibt den ganzen Plan, nicht die eingeklappte Sicht: Einklappen
 * ist Ansichtszustand. Die Symbole stehen in einem eigenen, unsichtbaren <svg>, damit Legende und
 * Zeichnung sie auch dann finden, wenn der Plan keine Stellen hat.
 */
export function Betrachter({ inhalt, symbole, titel, schrift }: { inhalt: PlanInhalt; symbole: Symbolsatz; titel: string; schrift: string }) {
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const daten = useMemo(() => layout(inhalt, "bildschirm", { eingeklappt }), [inhalt, eingeklappt]);
  const eintraege = useMemo(() => legende(inhalt, baueSicht(inhalt)), [inhalt]);
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  return (
    <div>
      <Flaeche daten={daten} symbole={symbole} titel={titel} schrift={schrift}
        bedienhinweis="Pfeiltasten verschieben, Plus und Minus zoomen, 0 passt ein"
        zusatz={(k) => <Umschalter k={k} onUmschalten={umschalten} />}
        leer={<p style={{ padding: 16 }}>Dieser Plan hat noch keine Stellen.</p>}
        werkzeuge={eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null} />
      <Legende eintraege={eintraege} />
    </div>
  );
}
