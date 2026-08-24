"use client";

import Link from "next/link";
import { AUSWAHL_PARAMETER, auswahlSchreiben } from "../_lib/auswahl";
import { statusEtikett, type GeraeteStatus } from "../_lib/status";
import { StatusChip } from "./StatusChip";
import s from "./ausleihe.module.css";

/**
 * EINE ZEILE DER GERAETEUEBERSICHT — Nachbau von
 * `radio-inventar/apps/frontend/src/components/features/DeviceRow.tsx`.
 *
 * ⛔ NACHBAU, KEIN ANTD-BAUSTEIN (Entscheidung E4 und E8, Spec:3667-3670, `:3712-3717`).
 * Die Liste ist kartenfoermig; eine antd-`Table` schiede schon deshalb aus, weil ein
 * `columns[].render` aus einer Server Component die RSC-Grenze nicht ueberqueren darf
 * (Falle 9, `CLAUDE.md:52-70`). Auf einem Telefon ist die Karte ohnehin die richtige Form.
 *
 * ⛔ DIE PROPS SIND EIN EIGENER, HIER AUSGESCHRIEBENER SATZ und nicht `GeraetMitLeihstand`
 * aus `_db/leihen.ts`. Das ist die tragende Haelfte der Datenschutz-Zusage aus §4.1 Punkt 2
 * (Spec:3343-3348): waechst das Lesemodell um ein Feld, kommt es hier nicht von selbst an,
 * sondern erst, wenn jemand es HIER hinschreibt — und genau das faengt der Fall „reicht die
 * Seriennummer nicht in die Zeile, findet sie aber ueber den Suchschluessel"
 * (`GeraeteListe.test.tsx`). Die andere Haelfte, dass das Lesemodell sie gar nicht erst
 * liefert, steht in `_db/leihen.test.ts` („traegt die Seriennummer im Suchschluessel und in
 * keinem Feld der Zeile"). ⬜ Die Auflage dazu steht im Ledger
 * (`.superpowers/sdd/planteil3/progress.md`, Block „Fix-Runde 1 zu A13", Posten „A15 UND
 * A18 SCHULDEN DEN WIRKNACHWEIS FUER DIE SERIENNUMMER").
 *
 * ⛔ EIN VERGEBENES GERAET IST NICHT ANTIPPBAR (`DeviceRow.tsx:47`, `:49-50`): kein `href`,
 * `aria-disabled="true"`, 60 % Deckkraft. ⛔ Die Deckkraft ist NICHT der Traeger der
 * Aussage — sie ist die sichtbare Beigabe zu `aria-disabled` und zum fehlenden Link.
 *
 * ⛔ DER TAP IST EIN `next/link`, KEIN CLIENT-HANDLER (Spec:3427). Der Alt-Kiosk faehrt
 * `onSelect` mit `onKeyDown` fuer Enter und Leertaste (`DeviceRow.tsx:28-33`, `:50`) —
 * einen Nachbau der Tastaturbedienung eines `div`, den ein echter Anker mitbringt, ohne
 * dass ihn jemand pflegen muss.
 *
 * ⚠️ KEIN `memo` UND KEIN `arePropsEqual` (`DeviceRow.tsx:78-94`). Der Alt-Kiosk braucht
 * beides, weil `onSelect` bei jedem Rendern der Liste eine neue Funktion war; hier gibt es
 * keine Handler-Prop, und ein handgeschriebener Vergleich ueber elf Felder waere die
 * naechste Stelle, die ein neues Feld vergisst.
 */

/**
 * Was die Zeile zeigt — nicht mehr. Strukturell eine Teilmenge von `GeraetMitLeihstand`
 * (`_db/leihen.ts:93-102`), aber bewusst ohne Bezug darauf: der Bezug machte jedes neue
 * Feld des Lesemodells still zu einem Feld dieser Zeile.
 */
export type ZeilenGeraet = {
  readonly id: string;
  readonly rufname: string;
  readonly geraetetyp: string | null;
  readonly standort: string | null;
  readonly status: GeraeteStatus;
  readonly entleiher?: string;
  readonly seit?: string;
};

/**
 * Die zweite Textzeile, 1:1 aus `DeviceRow.tsx:20-26`: mit aktiver Leihe der Entleiher und
 * die Uhrzeit, sonst der Geraetetyp.
 *
 * ⛔ DAS WORT „Uhr" HAENGT HIER, NICHT AN `uhrzeit()` (`_lib/anzeige.ts:55-58`) — dort
 * ergaebe es an jedem zweiten Aufrufort „Uhr Uhr". `seit` ist bereits die vom SERVER
 * gerechnete Zeichenkette (§4.1 Punkt 1, Spec:3338-3342); im Browser gerechnet entschieden
 * Server und Client an der Tagesgrenze verschieden.
 *
 * ⛔ KEIN `sanitizeForDisplay` (`DeviceRow.tsx:21`, `:26`, `:37-38`). Der Alt-Kiosk raeumt
 * dort Steuerzeichen aus Fremdtext; React rendert jeden Textknoten entkommen, und ein
 * zweiter Reinigungsort waere eine zweite Wahrheit ueber denselben Wert.
 */
function nebenzeile(geraet: ZeilenGeraet): string {
  if (geraet.entleiher === undefined) return geraet.geraetetyp ?? "";
  return geraet.seit === undefined ? geraet.entleiher : `${geraet.entleiher} · ${geraet.seit} Uhr`;
}

export function GeraeteZeile({ geraet }: { geraet: ZeilenGeraet }) {
  /*
   * ⛔ „ANTIPPBAR" HEISST „FREI", UND DIE FALTUNG STEHT NICHT HIER. `status` ist der
   * bereits gefaltete Wert aus `geraeteZustandAus` (`_lib/status.ts`, ⬜ A-L13,
   * Betreiberentscheidung vom 2026-08-22): ein Geraet ohne erfassten Zustand faellt auf
   * „frei" zurueck und ist damit antippbar. Das ist die Entscheidung, nicht ein
   * vergessener Zweig — der angenommene Preis steht am Faltungsort.
   */
  const frei = geraet.status === "AVAILABLE";
  const neben = nebenzeile(geraet);

  /*
   * Die Vorlesereihenfolge, 1:1 aus `DeviceRow.tsx:36-41`: Rufname, Standort, Statusetikett,
   * Nebenzeile. Ohne sie liest eine Bildschirmleserin vier lose Textfetzen.
   */
  const beschriftung = [geraet.rufname, geraet.standort, statusEtikett(geraet.status), neben]
    .filter(Boolean)
    .join(", ");

  const inhalt = (
    <>
      <div className={s.zeileText}>
        <div className={s.zeileRufname} data-rolle="radio-zeile-rufname">
          {geraet.rufname}
        </div>
        <div className={s.zeileNeben}>{neben}</div>
      </div>
      <StatusChip status={geraet.status} />
    </>
  );

  if (!frei) {
    return (
      <div
        className={s.zeile}
        aria-disabled="true"
        aria-label={beschriftung}
        data-rolle="radio-geraetezeile"
        data-frei="nein"
      >
        {inhalt}
      </div>
    );
  }

  /*
   * ⛔ DIE URL WIRD AUS `_lib/auswahl.ts` GEBAUT, NICHT ZUSAMMENGESETZT: Parametername und
   * Trennerform stehen dort einmal (`AUSWAHL_PARAMETER`, `auswahlSchreiben`), damit die
   * Uebersicht und die Ausleihseite (A19) dieselbe URL meinen (`_lib/auswahl.ts:55-61`).
   * ⛔ AEUSSERER PFAD, kein `/m/radio/...` — der wuerde auf dem Modul-Host doppelt
   * praefixiert (`AusleihRahmen.tsx:70-72`).
   */
  return (
    <Link
      className={s.zeile}
      href={`/ausleihen?${AUSWAHL_PARAMETER}=${auswahlSchreiben([geraet.id])}`}
      aria-label={beschriftung}
      data-rolle="radio-geraetezeile"
      data-frei="ja"
    >
      {inhalt}
    </Link>
  );
}
