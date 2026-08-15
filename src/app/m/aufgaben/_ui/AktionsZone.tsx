"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import {
  fertigMeldenAction,
  startenAction,
  wiederaufnehmenAction,
  zuruecksetzenAction,
} from "../actions";
import type { AufgabeRow } from "../_db/schema";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import { NACHWEIS_ART_TEXT } from "../_lib/anzeige";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { FreigabeAktionen } from "./FreigabeZone";
import { NachweisFormular } from "./NachweisFormular";
import { ZurueckziehenKnopf } from "./ZurueckziehenKnopf";

/*
 * DIE AKTIONSZONE VON `/a/<id>` (Spec §8.4, Aufgabe 16) — trägt NUR, was diese Person mit dieser
 * Aufgabe in DIESEM Zustand tun darf. `optionen` kommt FERTIG BERECHNET von `a/[id]/page.tsx`
 * herein (`_lib/aktionsOptionen.ts`, das `uebergang()` je Aktion ruft) — diese Datei entscheidet
 * selbst NICHTS ueber Berechtigung oder Zustand, sie rendert nur, was schon entschieden ist.
 *
 * KEIN IMPORT AUS `_lib/zugang.ts` ODER `_lib/lebenszyklus.ts` HIER: `lebenszyklus.ts` importiert
 * `zugang.ts`, und die importiert `@/core/auth` (next-auth) — ein Import in dieser Client-Insel
 * zoege next-auths serverseitigen Code ins Client-Bundle (dasselbe Muster wie
 * `_ui/PersonenTabelle.tsx`s Kopfkommentar zu `istAktivHeute`).
 *
 * FREIGEBEN/ZURUECKWEISEN KOMMEN AUS `FreigabeZone.tsx`s EXPORTIERTER `FreigabeAktionen` —
 * dieselbe Bestaetigungspflicht-mit-Text-Logik wie auf `/freigaben`, keine zweite Fassung
 * (Brief: „zwei Fassungen derselben Zone liefen auseinander").
 *
 * `optionen.freigeben` UND `optionen.zurueckweisen` SIND IMMER GLEICH (`_lib/lebenszyklus.ts`s
 * `TABELLE`: beide Zeilen teilen sich `wer: darfFreigeben`) — die Zone prueft deshalb nur EINES der
 * beiden Felder, um zu entscheiden, ob `FreigabeAktionen` ueberhaupt erscheint.
 *
 * ZURUECKZIEHEN IST BESTAETIGUNGSPFLICHTIG (Spec §9.9) — Vorbild `_ui/PersonenTabelle.tsx`s
 * „Beenden": `Popconfirm` plus ein `ref` aufs Formular, `onConfirm` loest `requestSubmit()` aus.
 * SEIT DER OBERFLAECHEN-SPEC (§6.7) STEHT DIESER KNOPF IN `_ui/ZurueckziehenKnopf.tsx`, weil ihn
 * die Fuehrungskarte des Auftraggebers (Rang 3) ebenfalls braucht — und die ist eine SERVER
 * COMPONENT, aus der ein `onConfirm` nicht ueber die RSC-Grenze darf (Falle 9). Eine zweite
 * Fassung hier waere dieselbe Bestaetigungspflicht an zwei Orten.
 * `zurueckziehenAction` LOESCHT DIE AUFGABE — nach dem Absenden existiert `/a/<id>` fuer diese Id
 * nicht mehr, und die naechste Revalidierung dieser Route zeigt `notFound()`. Das ist keine
 * Regression dieser Aufgabe: `zurueckziehenAction` (Aufgabe 9) redirectet heute nirgendwohin, und
 * eine solche Aenderung an einer bereits getesteten, modulweiten Action ist NICHT Teil dieses
 * Auftrags — im Bericht als bekannte, kleine Rauheit vermerkt statt still mitgezogen.
 */
export function AktionsZone({
  aufgabe,
  optionen,
  nachweisMaxBytes,
}: {
  aufgabe: AufgabeRow;
  optionen: AktionsOptionen;
  /**
   * `NACHWEIS_MAX_BYTES` (`_lib/ablage.ts`), ALS PROP AUS `a/[id]/page.tsx` — diese Datei darf
   * `_lib/ablage.ts` nicht importieren (`node:fs/promises` auf Modulebene buendelte das in den
   * Browser, s. `_ui/NachweisFormular.tsx`s Kopfkommentar). PFLICHT statt optional mit Vorgabe:
   * eine zweite, hier erfundene Zahl waere die zweite Fassung derselben Konstante.
   */
  nachweisMaxBytes: number;
}) {
  // FIX-RUNDE 1, IMPORTANT 3: eine von Hand aufgezaehlte Fassung liess `optionen.zurueckweisen`
  // aus (sechs von sieben Feldern) und war damit bereits inkonsistent, bevor sie einmal geaendert
  // wurde — heute folgenlos, weil `_lib/lebenszyklus.ts`s `TABELLE` `freigeben`/`zurueckweisen`
  // dasselbe `wer: darfFreigeben` teilt, aber genau die Naht, die in Aufgabe 14 einen Riegel zur
  // Haelfte unbewacht liess. `Object.values` kann nicht veralten, wenn `AktionsOptionen` waechst.
  const keineAktion = !Object.values(optionen).some(Boolean);

  if (keineAktion) {
    return <p>Für diese Aufgabe ist derzeit keine Aktion möglich.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {optionen.starten ? (
        <EinfacheAktion aufgabeId={aufgabe.id} aktion={startenAction} beschriftung="Bearbeitung starten" />
      ) : null}
      {optionen.zuruecksetzen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={zuruecksetzenAction}
          beschriftung="Bearbeitung zurücksetzen"
        />
      ) : null}
      {optionen.nachweisHochladen ? (
        <NachweisFormular
          aufgabeId={aufgabe.id}
          nachweisArt={aufgabe.nachweisArt}
          maxBytes={nachweisMaxBytes}
        />
      ) : null}
      {optionen.fertig ? <FertigMeldenFormular aufgabe={aufgabe} /> : null}
      {optionen.freigeben ? <FreigabeAktionen aufgabe={aufgabe} /> : null}
      {optionen.wiederaufnehmen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={wiederaufnehmenAction}
          beschriftung="Bearbeitung wieder aufnehmen"
        />
      ) : null}
      {optionen.zurueckziehen ? <ZurueckziehenKnopf aufgabeId={aufgabe.id} /> : null}
    </div>
  );
}

/**
 * DIE VIER STATUSWECHSEL OHNE EIGENES FORMULARFELD (starten, zuruecksetzen, wiederaufnehmen —
 * `optionen.freigeben`/`zurueckziehen` haben eigene Komponenten) TEILEN SICH DIESE FORM: ein
 * natives `<form action={...}>` mit genau einem versteckten Feld, wie
 * `_ui/EinstiegBufdi.tsx`s `posteingangAktionen` es fuer „Annehmen" schon tut.
 */
function EinfacheAktion({
  aufgabeId,
  aktion,
  beschriftung,
}: {
  aufgabeId: string;
  aktion: (formData: FormData) => Promise<void>;
  beschriftung: string;
}) {
  return (
    <form action={aktion}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Button type="primary" htmlType="submit">
        {beschriftung}
      </Button>
    </form>
  );
}

/**
 * „FERTIG MELDEN" (Spec §5.3, §8.4) — DIE PFLICHT IST EINE UNTERGRENZE: `nachweisArt === "bild"`
 * verlangt eine Datei, die seit Aufgabe 19 ueber `NachweisFormular` (oben in `AktionsZone`, sobald
 * `optionen.nachweisHochladen` gilt) hochgeladen wird — NICHT ueber dieses Formular hier, das nur
 * Text entgegennimmt. Die Server-Action lehnt ohne ein `sauber`es Bild MIT FELDFEHLER `nachweis` ab
 * (`actions.ts`s `fertigMeldenAction`-Kopfkommentar) — NICHT `nachweisText`. BEIDE SCHLUESSEL WERDEN
 * GERENDERT: wuerde nur `nachweisText` gelesen, verschwaende der Bild-Fehler nach dem Absenden
 * spurlos — genau die stille Fehlerklasse, die dieses Modul immer wieder gefangen hat.
 *
 * DER HINWEISTEXT FUER `bild` NENNT DIE SICHERHEITSPRUEFUNG, NICHT „folgt spaeter" (Aufgabe 19 hat
 * den Upload gebaut): eine Person, die GERADE ein Bild hochgeladen hat und sofort auf „Fertig
 * melden" klickt, sieht `scan_status: "offen"` — der Feldfehler sagt dann „wird noch geprueft",
 * nicht „fehlt" (Brief, wortgleich verlangt).
 */
function FertigMeldenFormular({ aufgabe }: { aufgabe: AufgabeRow }) {
  const [state, formAction, isPending] = useActionState(fertigMeldenAction, FORM_START);
  const nachweisTextFehler = feldFehler(state, "nachweisText");
  const nachweisFehler = feldFehler(state, "nachweis");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, maxWidth: 480 }}
    >
      <input type="hidden" name="aufgabeId" value={feldWert(state, "aufgabeId", aufgabe.id)} />

      {aufgabe.nachweisPflicht ? (
        <p style={{ margin: 0, fontSize: 12 }}>
          Nachweispflicht: {NACHWEIS_ART_TEXT[aufgabe.nachweisArt]}
          {aufgabe.nachweisArt === "bild"
            ? " — der Bildnachweis muss die Sicherheitsprüfung bestanden haben (Status „sauber“), bevor diese Aufgabe fertig gemeldet werden kann."
            : ""}
        </p>
      ) : null}

      <div>
        <label htmlFor="az-nachweistext" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Nachweis (Text)
        </label>
        <Input.TextArea
          id="az-nachweistext"
          name="nachweisText"
          autoSize={{ minRows: 3, maxRows: 8 }}
          defaultValue={feldWert(state, "nachweisText", "")}
          status={nachweisTextFehler ? "error" : undefined}
          aria-invalid={nachweisTextFehler ? true : undefined}
          aria-describedby={nachweisTextFehler ? "az-nachweistext-err" : undefined}
        />
        {nachweisTextFehler ? (
          <p id="az-nachweistext-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {nachweisTextFehler}
          </p>
        ) : null}
      </div>

      {nachweisFehler ? <p style={{ margin: 0 }}>{nachweisFehler}</p> : null}

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        Fertig melden
      </Button>
    </form>
  );
}
