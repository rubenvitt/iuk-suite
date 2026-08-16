"use client";

import { useActionState } from "react";
import { Button } from "antd";
import { fertigMeldenAction } from "../actions";
import { FORM_START, feldFehler } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/*
 * „FERTIG MELDEN" AUS DER FUEHRUNGSKARTE (Oberflaechen-Spec 2026-08-16 §4.2 BuFDi Rang 1/3, §10
 * Prueffrage 5) — die einzige Zustandsaktion der Karte, die eine EIGENE CLIENT-INSEL braucht.
 *
 * WARUM SIE EINE BRAUCHT UND DIE UEBRIGEN NICHT: `startenAction`, `zuruecksetzenAction`,
 * `wiederaufnehmenAction` und `einplanenAnnehmenAction` tragen die Signatur
 * `(formData) => Promise<void>` und passen damit auf ein zustandsloses `<form action={…}>`, das
 * eine Server Component direkt rendern darf (Server Actions duerfen als einzige ueber die
 * RSC-Grenze — aber DIREKT IMPORTIERT, nie als Prop durchgereicht). `fertigMeldenAction` traegt
 * dagegen `(prev, formData) => Promise<FormState>`; diese Signatur passt nur auf `useActionState`,
 * und `useActionState` ist ein Hook. Ohne diese Insel bliebe nur eine ZWEITE Bruecken-Action in
 * `actions.ts` — eine zweite Fassung derselben Fertigmeldung, an der die Nachweisprüfung
 * auseinanderlaufen koennte.
 *
 * NUR OHNE NACHWEISPFLICHT (§10 Prueffrage 5, Zeile „Fertig melden ohne Nachweispflicht"): dieser
 * Knopf hat KEIN Eingabefeld und kann deshalb in der Karte stehen. Mit Nachweispflicht fuehrt die
 * Karte auf `/a/<id>`, wo der Feldfehler AN seinem Feld ankommt — das entscheidet die aufrufende
 * Server Component ueber `optionen.nachweisHochladen`, nicht diese Datei.
 *
 * DER FEHLERZWEIG WIRD TROTZDEM GERENDERT, und das ist kein Zierrat: `fertigMeldenAction` lehnt
 * eine nachweispflichtige Aufgabe mit einem FELDFEHLER ab, nicht mit einem Wurf. Ohne die Anzeige
 * waere ein Klick ohne jede Wirkung — der schlechteste aller Fehlerfaelle, weil er wie ein
 * Bedienfehler der klickenden Person aussieht. BEIDE Schluessel werden gelesen (`nachweisText`
 * fuer den Textzweig, `nachweis` fuer den Bildzweig), dieselbe Regel wie in `_ui/AktionsZone.tsx`.
 */
export function FertigMeldenKnopf({ aufgabeId }: { aufgabeId: string }) {
  const [state, formAction, isPending] = useActionState(fertigMeldenAction, FORM_START);
  const fehler = feldFehler(state, "nachweisText") ?? feldFehler(state, "nachweis");

  return (
    <form action={formAction}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Button type="primary" htmlType="submit" loading={isPending} disabled={isPending}>
        Fertig melden
      </Button>
      {fehler ? <p style={{ margin: `${SPACE.xs}px 0 0` }}>{fehler}</p> : null}
    </form>
  );
}
