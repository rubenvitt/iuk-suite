"use client";

import { Button } from "antd";
import { fmtTagKurz, montagDerWoche, tagePlus, wochenTage } from "../_lib/datum";
import { SPACE } from "@/core/theme/tokens";
import { SCHRIFT } from "@/core/theme/schrift";
import { Ikone } from "./ikonen";

/*
 * DER WOCHENWAEHLER (Spec §8.1, §8.5-Umfeld, Aufgabe 13) — Kopf jeder Seite, die eine Woche
 * zeigt: „Meine Woche" UND `plan/[personId]`. KEIN "use client" waere hier technisch noetig (die
 * Navigation laeuft ueber `<Button href>`, also einen gewoehnlichen Link, wie
 * `RoutinenTabelle.tsx`s „Ändern"-Verweis) — die Datei ist trotzdem eine, weil der Brief sie
 * ausdruecklich als Client-Insel fuehrt (Dateitabelle: "Client-Insel — vor/zurück").
 *
 * DIE WOCHE STEHT IN DER URL (Suchparameter `woche`), NICHT IN EINEM `useState` (Brief): sonst
 * waere sie nicht teilbar, nicht im Verlauf des Browsers, und ein Neuladen spraenge zurueck. Diese
 * Komponente AENDERT die URL deshalb nur ueber `href`, sie haelt keinen eigenen Zustand — die Seite
 * liest den Parameter serverseitig (`_lib/datum.ts`s `montagAusParam`).
 *
 * EIN WEITERGEREICHTER WOCHENWECHSEL LOESCHT DEN TAG-PARAMETER (`?tag=`) BEWUSST: eine andere Woche
 * hat andere fuenf Tage, ein mitgeschleppter `tag`-Wert aus der alten Woche waere in der neuen KEINER
 * ihrer fuenf Tage und fiele ueber `ausgewaehlterTag` ohnehin auf „heute" oder Montag zurueck — das
 * neue `?woche=` allein reicht deshalb.
 *
 * `href` TRAEGT NUR DEN SUCHPARAMETER (`?woche=...`), KEINEN PFAD: relativ zur aktuellen Seite
 * funktioniert das fuer `/` UND `/plan/<id>` gleichermassen, ohne dass diese Komponente ihren
 * eigenen Pfad kennen muesste.
 */
export function WochenWaehler({ montag, heute }: { montag: string; heute: string }) {
  const zurueck = tagePlus(montag, -7);
  const vor = tagePlus(montag, 7);
  const tage = wochenTage(montag);
  const istAktuelleWoche = montag === montagDerWoche(heute);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: SPACE.sm, flexWrap: "wrap" }}>
      <Button href={`?woche=${zurueck}`} aria-label="Vorherige Woche">
        <Ikone name="pfeil-links" /> Zurück
      </Button>
      <span style={{ ...SCHRIFT.unterTitel, minWidth: 160, textAlign: "center" }}>
        {fmtTagKurz(tage[0]!)} – {fmtTagKurz(tage[4]!)}
      </span>
      <Button href={`?woche=${vor}`} aria-label="Nächste Woche">
        Vor <Ikone name="pfeil-rechts" />
      </Button>
      {!istAktuelleWoche ? (
        <Button href={`?woche=${montagDerWoche(heute)}`}>Aktuelle Woche</Button>
      ) : null}
    </div>
  );
}
