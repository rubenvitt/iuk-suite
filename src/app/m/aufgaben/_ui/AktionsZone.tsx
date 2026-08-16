"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import {
  fertigMeldenAction,
  startenAction,
  wiederaufnehmenAction,
  zuruecksetzenAction,
} from "../actions";
import type { AuslastungZeile } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import type { AktionsOptionen } from "../_lib/aktionsOptionen";
import { NACHWEIS_ART_TEXT } from "../_lib/anzeige";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";
import { FreigabeAktionen } from "./FreigabeZone";
import { NachweisFormular } from "./NachweisFormular";
import { UmverteilenKnopf } from "./VerteilenDialog";
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
 *
 * ══ GENAU EIN PRIMAERKNOPF (Oberflaechen-Spec 2026-08-16 §7 Nr. 2, Schritt 6). Bis dahin rendert
 *    diese Zone JEDES erlaubte `optionen.*` als eigenes Formular, mehrere davon mit
 *    `type="primary"` — auf einer `in_arbeit`-Aufgabe standen so drei rote Knoepfe nebeneinander,
 *    und keiner sagte, welcher der naechste Schritt ist. Neu: `VORRANG` unten ist eine feste
 *    Liste, der ERSTE erlaubte Eintrag wird `type="primary"`, alle uebrigen sind Standardknoepfe.
 *    Eine Sortierung plus ein Flag, kein Umbau — die Bedingungen bleiben `optionen.*`, also
 *    unveraendert `uebergang()`.
 */
export function AktionsZone({
  aufgabe,
  optionen,
  nachweisMaxBytes,
  verteilen = null,
}: {
  aufgabe: AufgabeRow;
  optionen: AktionsOptionen;
  /**
   * DIE ZIELE FUER „ANDERS ZUWEISEN" (§7 Nr. 3) — `null` fuer jede Person, die nicht verteilen
   * darf, und dann erscheint der Knopf gar nicht. Die Liste kommt aus `verteilDaten(db, heute)`
   * und damit aus `bufdis()`: eine ausgeschiedene Person ist kein Verteilziel, und dieser Riegel
   * bleibt woertlich (§11.3). Diese Insel baut sie NICHT selbst nach — sie nimmt nur entgegen.
   */
  verteilen?: { bufdis: PersonRow[]; auslastung: AuslastungZeile[]; tage: readonly string[] } | null;
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

  // DER ERSTE ERLAUBTE EINTRAG DER VORRANGLISTE IST DER EINE PRIMAERKNOPF — `undefined`, wenn
  // keiner erlaubt ist (dann traegt die Zone nur Standardknoepfe, und die Abwesenheit ist die
  // Auskunft; §3.4, Regel P liest „genau einer" als „hoechstens einer").
  const primaerAktion = VORRANG.find((eintrag) => optionen[eintrag]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {optionen.freigeben ? (
        <FreigabeAktionen aufgabe={aufgabe} primaer={primaerAktion === "freigeben"} />
      ) : null}
      {optionen.nachweisHochladen ? (
        <NachweisFormular
          aufgabeId={aufgabe.id}
          nachweisArt={aufgabe.nachweisArt}
          maxBytes={nachweisMaxBytes}
          primaer={primaerAktion === "nachweisHochladen"}
        />
      ) : null}
      {optionen.fertig ? (
        <FertigMeldenFormular aufgabe={aufgabe} primaer={primaerAktion === "fertig"} />
      ) : null}
      {optionen.starten ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={startenAction}
          beschriftung="Bearbeitung starten"
          primaer={primaerAktion === "starten"}
        />
      ) : null}
      {optionen.wiederaufnehmen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={wiederaufnehmenAction}
          beschriftung="Bearbeitung wieder aufnehmen"
          primaer={primaerAktion === "wiederaufnehmen"}
        />
      ) : null}
      {optionen.zuruecksetzen ? (
        <EinfacheAktion
          aufgabeId={aufgabe.id}
          aktion={zuruecksetzenAction}
          beschriftung="Bearbeitung zurücksetzen"
          primaer={primaerAktion === "zuruecksetzen"}
        />
      ) : null}
      {optionen.umverteilen && verteilen !== null ? (
        <UmverteilenKnopf
          aufgabe={aufgabe}
          bufdis={verteilen.bufdis}
          auslastung={verteilen.auslastung}
          tage={verteilen.tage}
          primaer={primaerAktion === "umverteilen"}
        />
      ) : null}
      {/*
       * ZURUECKZIEHEN STEHT NICHT IN `VORRANG` UND IMMER GANZ UNTEN (§7 Nr. 2) — s. den Kommentar
       * an der Liste. Es bleibt sekundaer mit `Popconfirm`, unabhaengig davon, was ueber ihm steht.
       */}
      {optionen.zurueckziehen ? <ZurueckziehenKnopf aufgabeId={aufgabe.id} /> : null}
    </div>
  );
}

/**
 * DIE FESTE VORRANGLISTE (§7 Nr. 2) — der erste erlaubte Eintrag ist der Primaerknopf.
 *
 * ZWEI EINTRAEGE STEHEN ANDERS, ALS MAN SIE ZUERST SCHREIBEN WUERDE, UND BEIDE GRUENDE SIND
 * NACHGELESEN:
 *
 *  1. `nachweisHochladen` STEHT VOR `fertig`. `uebergang()` erlaubt `in_arbeit`x`fertig`
 *     UNABHAENGIG von der Nachweispflicht (`_lib/lebenszyklus.ts`); die Ablehnung entsteht erst in
 *     `fertigMeldenAction` als FELDFEHLER (`actions.ts`). Ohne diese Reihenfolge waere fuer eine
 *     nachweispflichtige `in_arbeit`-Aufgabe „Fertig melden" der Primaerknopf, waehrend der
 *     tatsaechlich noetige erste Schritt daneben als Standardknopf staende — die Seite riete dann
 *     falsch, und der Server korrigierte sie erst nach dem Klick.
 *  2. `zurueckziehen` IST GAR NICHT IN DER LISTE. Es ist grundsaetzlich sekundaer mit
 *     `Popconfirm` — dieselbe Begruendung, die §4.2 fuer den Auftraggeber Rang 3 fuehrt („ein
 *     destruktiver Knopf als Primaeraktion laedt zum Wegdruecken einer Aufgabe ein, die nur auf
 *     Verteilung wartet"). STUENDE ES IN DER LISTE, WAERE ES FUER EINE `eingegangen`-AUFGABE DER
 *     EINZIGE ERLAUBTE EINTRAG — keine der uebrigen Aktionen hat in `TABELLE` eine Zeile aus
 *     `eingegangen` — und damit ausgerechnet die LOESCHENDE Aktion der Primaerknopf. So traegt eine
 *     `eingegangen`-Aufgabe auf `/a/<id>` KEINEN Primaerknopf, was Regel P ausdruecklich zulaesst.
 *
 * DIE RENDERREIHENFOLGE OBEN FOLGT DIESER LISTE. Das ist keine Kosmetik: stuende der Primaerknopf
 * unter zwei Standardknoepfen, waere „der erste erlaubte Eintrag" eine Behauptung ueber eine
 * Rangfolge, die man auf der Seite nicht sieht.
 */
const VORRANG: readonly (keyof AktionsOptionen)[] = [
  "freigeben",
  "nachweisHochladen",
  "fertig",
  "starten",
  "wiederaufnehmen",
  "zuruecksetzen",
  "umverteilen",
];

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
  primaer = true,
}: {
  aufgabeId: string;
  aktion: (formData: FormData) => Promise<void>;
  beschriftung: string;
  /** Vorgabe `true` — die Fuehrungskarte hat ihre eigene Fassung, hier setzt nur `VORRANG`. */
  primaer?: boolean;
}) {
  return (
    <form action={aktion}>
      <input type="hidden" name="aufgabeId" value={aufgabeId} />
      <Button type={primaer ? "primary" : undefined} htmlType="submit">
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
function FertigMeldenFormular({
  aufgabe,
  primaer = true,
}: {
  aufgabe: AufgabeRow;
  primaer?: boolean;
}) {
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
        type={primaer ? "primary" : undefined}
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
