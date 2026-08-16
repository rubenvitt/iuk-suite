import Link from "next/link";
import type { ReactNode } from "react";
import { ANLASS_TEXT } from "../_lib/anzeige";
import type { Anlass } from "../_lib/lage";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe, type AufgabenListeZeile, type ListenForm } from "./AufgabenListe";
import s from "./aufgaben.module.css";

/*
 * EBENE 4 DES AUFBAUS: EIN ANLASS ALS ZONE (Oberflaechen-Spec 2026-08-16 §3.4, Regeln R3 und D).
 *
 * WELCHE ANLAESSE HIER LANDEN, ENTSCHEIDET DER SELEKTOR, NICHT DIESE DATEI: `lage().zonen` ist
 * bereits nach R3 gefiltert (alle Anlaesse ab POSITION 2, plus Position 1 genau dann, wenn er mehr
 * als eine Aufgabe traegt, und ohne die, die bereits die Flaeche der Rolle sind). Eine LEERE ZONE
 * ist damit strukturell ausgeschlossen, nicht verboten — diese Komponente braucht keinen Leerfall.
 *
 * REGEL D — EIN DECKEL SETZT EINEN AUSGANG VORAUS. Eine Zone MIT Sammelziel zeigt hoechstens FUENF
 * Zeilen und schliesst mit „… und 47 weitere →" ab; fuenf, weil das die Zeilenzahl ist, die auf
 * 360px noch ueber der Falzkante einer Zone steht. Eine Zone OHNE Sammelziel bleibt VOLLSTAENDIG,
 * und das ist keine Inkonsequenz, sondern die getroffene Abwaegung: §3.1 verbietet ausdruecklich,
 * fuer „ueberfaellig" oder „zurueckgewiesen" eine Route zu erfinden („ueberfaellig ist keine
 * Sammlung, sondern eine Eigenschaft"), und ein Deckel ohne Ausgang machte ab der sechsten Zeile
 * Aufgaben NUR NOCH ueber `/a/<id>` erreichbar, das man erst kennen muss — wortwoertlich der
 * Defekt, den Fall S1 schliesst. Zwischen „zu lang" und „unauffindbar" ist zu lang das kleinere
 * Uebel.
 *
 * DIE UEBERSCHRIFT UND DAS ZIEL KOMMEN AUS `ANLASS_TEXT` (§3.5), nicht aus dieser Datei: sonst
 * stuenden die Zonenueberschriften in drei Einstiegen dreimal — heute genau der Zustand, den §4.1
 * als fuenfte Bauregel beendet.
 *
 * DIE DOM-ID BEHAELT IHRE SCHREIBWEISE, ABER NICHT IHRE GARANTIERTE ANWESENHEIT (§3.2): eine Zone
 * mit n = 1 entsteht gar nicht, weil die Karte die Aufgabe schon nennt. Jede e2e-Zusicherung greift
 * deshalb auf das BEDIENELEMENT zu (`getByRole`), nie auf den Zonencontainer.
 *
 * KEIN "use client", kein Compound-Zugriff, kein Icon — Server Component wie die Einstiege selbst.
 */

/** Der Deckel greift ab der sechsten Zeile (§3.4, Regel D). */
export const ZONEN_DECKEL = 5;

export function AnlassZone({
  anlass,
  heute,
  eigenePersonId,
  zusaetze = {},
  aktionen = {},
  deckelErlaubt = true,
  form = "raster",
}: {
  anlass: Anlass;
  heute: string;
  /** Fuer `deckelziel`, das bei `bufdiWartetAufEinplanung` auf `/plan/<eigene>` zeigt. */
  eigenePersonId: string;
  /** `aufgabe.id -> rollenZusatz` — GENAU EINE vorformatierte Angabe je Zeile (§3.6). */
  zusaetze?: Record<string, string | null>;
  /** `aufgabe.id -> fertig gerenderte Aktionen`. Wer was darf, entscheidet der Aufrufer. */
  aktionen?: Record<string, ReactNode>;
  /**
   * DAS DECKELZIEL KANN AM AUFRUFER SCHEITERN, NICHT NUR AM ANLASS (§3.5): `koordFreigabeOffen`
   * zeigt auf `/freigaben`, und wer dort 404 bekaeme (`darfFreigabenSehen`), darf den Deckel nicht
   * sehen — ein Knopf auf eine 404-Seite waere schlechter als eine laengere Zone. Die Bedingung
   * steht beim Aufrufer, weil sie den AKTEUR betrifft und nicht die Beschriftung.
   */
  deckelErlaubt?: boolean;
  /**
   * DIE SETZUNG DER LISTE (Nachtrag „mehr Diversitaet", 2026-08-16) — `raster`, wo man VERGLEICHT,
   * `knapp`, wo man nur wissen will, DASS es die Zeilen gibt. Die Wahl trifft der AUFRUFER, nicht
   * `ANLASS_TEXT`: sie haengt am Zweck der Flaeche, nicht am Anlass — derselbe `koordZurueckgewiesen`
   * kann auf `/archiv` sehr wohl eine Vergleichsfrage sein. Vorgabe ist `raster`, damit eine neue
   * Zone nie versehentlich in der duennsten Form landet.
   */
  form?: ListenForm;
}) {
  const text = ANLASS_TEXT[anlass.art];
  const ziel = deckelErlaubt ? (text.deckelziel?.(eigenePersonId) ?? null) : null;
  const gedeckelt = ziel !== null && anlass.zeilen.length > ZONEN_DECKEL;
  const sichtbar = gedeckelt ? anlass.zeilen.slice(0, ZONEN_DECKEL) : anlass.zeilen;
  const rest = anlass.zeilen.length - sichtbar.length;

  const zeilen: AufgabenListeZeile[] = sichtbar.map((a) => ({
    aufgabe: a,
    rollenZusatz: zusaetze[a.id] ?? null,
    aktionen: aktionen[a.id],
  }));

  return (
    <section
      id={text.zonenId ?? undefined}
      data-anlass={anlass.art}
      style={{ marginBlockEnd: SPACE.xl }}
    >
      {/*
       * DIE ZONENUEBERSCHRIFT TRITT ZURUECK (Oberflaechen-Runde 2026-08-16, Befund 4). Sie stand
       * in `SCHRIFT.unterTitel` (20/600) ueber Zeilen mit 14px-Titeln — die STRUKTUR war lauter
       * als der INHALT, und das ist genau verkehrt herum: die Zone sagt, WORUM es geht, die Zeile
       * ist die Sache selbst. `SCHRIFT.kicker` ist eine Rolle der Leiter (12/600 versal), keine
       * erfundene Groesse; Farbe und Haarlinie kommen aus `.zonenKopf`.
       */}
      <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
        {text.zone?.(anlass.zeilen.length) ?? ""}
      </h2>
      {/*
       * `leerText` IST PFLICHT UND HIER TROTZDEM UNERREICHBAR: `lage().zonen` traegt nur
       * nicht-leere Anlaesse (R3). Der Satz steht als benannter Vorbehalt da, nicht als
       * Platzhalter — wer diese Komponente je fuer eine andere Quelle benutzt, bekommt keinen
       * leeren Kasten, der wie ein Ladefehler aussieht.
       */}
      <AufgabenListe zeilen={zeilen} heute={heute} form={form} leerText="Nichts in dieser Zone." />
      {gedeckelt && ziel !== null ? (
        <p style={{ ...SCHRIFT.neben, margin: `${SPACE.sm}px 0 0` }}>
          <Link href={ziel}>… und {rest} weitere →</Link>
        </p>
      ) : null}
    </section>
  );
}
