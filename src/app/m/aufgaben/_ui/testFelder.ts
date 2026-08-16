import { act } from "react";
import { clickElement, fill, query } from "@/app/m/qr/_lib/test-dom";

/**
 * BEDIENHILFEN FUER DIE DREI AUSWAHLFELDER AUS `_ui/Felder.tsx` — das Gegenstueck zu `fill()` aus
 * `qr/_lib/test-dom.tsx`, das fuer ein natives `<input type="date">` noch gereicht hat.
 *
 * KEIN ZWEITES HARNESS (CLAUDE.md, Abschnitt „Tests"): diese Datei ERSETZT `test-dom.tsx` nicht,
 * sie benutzt es. `mount`/`query`/`fill`/`click` bleiben der Zugang; hier steht nur, was ein
 * antd-Auswahlfeld ZUSAETZLICH braucht, und das sind genau zwei Dinge:
 *
 *  1. EIN GETIPPTES DATUM GILT ERST MIT `Enter`. `@rc-component/picker` uebernimmt eine Eingabe
 *     nicht bei jedem Anschlag — es waere sonst unmoeglich, „01.0" zu tippen, ohne dass das Feld
 *     zwischendurch ein Datum meldet. Uebernommen wird bei Bestaetigung. GEMESSEN, NICHT VERMUTET:
 *     ein blosses `fill()` liess das versteckte Feld leer, ein nachgeschobenes `blur` ebenso — nur
 *     `Enter` traegt den Wert ein. (Im echten Browser uebernimmt auch das Verlassen des Feldes;
 *     jsdom hat dafuer keinen Fokus, den es verlieren koennte.) Wer das nicht weiss, sucht den
 *     Fehler im Formular statt in der Bedienung.
 *
 *  2. EINE WAHL AUS EINER LISTE IST EIN KLICK IM PORTAL. antds `Select` haengt sein Panel an den
 *     `<body>`, also NEBEN den Mount-Wirt — `query()` sucht im Wirt und findet die Option nie.
 *     Dieselbe Lage, die `test-dom.tsx` mit `queryPortal`/`clickPortal` schon beschreibt.
 *
 * `_ui` IST EIN NEXT PRIVATE FOLDER und erzeugt keine Route; diese Datei liegt beim Modul, weil
 * sie heute genau einen Nutznieszer hat — den Massstab fuer einen Umzug nach `core` (ein zweites,
 * HEUTE belegbares Modul) erfuellt sie nicht.
 */

/** Bestaetigt die Eingabe eines Auswahlfeldes — s. Punkt 1 im Kopfkommentar. */
async function bestaetige(selektor: string): Promise<void> {
  const feld = query(selektor);
  await act(async () => {
    feld.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, key: "Enter", keyCode: 13 }));
  });
}

/**
 * Ein Datum in ein `DatumFeld` eintragen. `iso` ist `YYYY-MM-DD` — das Feld nimmt beide Formate an
 * (s. Kopfkommentar von `Felder.tsx`), und die ISO-Form ist die, in der dieses Projekt Daten
 * herumreicht.
 */
export async function waehleDatum(selektor: string, iso: string): Promise<void> {
  await fill(selektor, iso);
  await bestaetige(selektor);
}

/** Eine Uhrzeit (`HH:MM`) in ein `ZeitFeld` eintragen. */
export async function waehleZeit(selektor: string, hhmm: string): Promise<void> {
  await fill(selektor, hhmm);
  await bestaetige(selektor);
}

/**
 * Das Panel eines `WahlFeld` aufklappen.
 *
 * `mousedown` AUF DER HUELLE, NICHT `click` AUF DEM FELD, und das ist gemessen: rc-select oeffnet
 * am `onMouseDown` seines Wrapper-`<div>` (`.ant-select`), nicht an einem Klick auf das innere
 * `<input>` — ein `click(selektor)` liess die Liste leer, ohne dass irgendetwas fehlschlug. Das
 * innere Feld traegt die `id`, die Huelle nicht; deshalb wird von der Id aus nach oben gesucht.
 */
export async function oeffneListe(selektor: string): Promise<void> {
  const huelle = query(selektor).closest(".ant-select");
  if (!(huelle instanceof HTMLElement)) {
    throw new Error(`${selektor} steckt in keinem antd-Select`);
  }
  await act(async () => {
    huelle.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    huelle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

/** Die Optionen eines geoeffneten `WahlFeld`-Panels — sie haengen im Portal, nicht im Wirt. */
export function listenOptionen(): HTMLElement[] {
  return Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"));
}

/**
 * Eine Option eines `WahlFeld` nach ihrem ANZEIGETEXT waehlen — nicht nach ihrem Wert: das ist,
 * was auf dem Schirm steht, und ein Test, der den Schluessel anklickt, bewiese nicht, dass die
 * richtige Beschriftung daran haengt.
 */
export async function waehleAusListe(selektor: string, text: string): Promise<void> {
  await oeffneListe(selektor);
  const treffer = listenOptionen().find((o) => (o.textContent ?? "").trim() === text);
  if (!treffer) {
    const gesehen = listenOptionen().map((o) => o.textContent);
    throw new Error(`Option ${JSON.stringify(text)} nicht gefunden — da stand: ${gesehen.join(", ")}`);
  }
  await clickElement(treffer);
}

/**
 * Der Wert, den ein Auswahlfeld ABSENDEN wuerde. Er steht im versteckten Feld neben dem sichtbaren
 * (s. Kopfkommentar von `Felder.tsx`) — das sichtbare traegt bei einem Datum den ANZEIGETEXT
 * („01.09.2026") und bei einer Liste ueberhaupt keinen Wert.
 */
export function feldWertImDom(name: string): string {
  return query<HTMLInputElement>(`input[type='hidden'][name='${name}']`).value;
}
