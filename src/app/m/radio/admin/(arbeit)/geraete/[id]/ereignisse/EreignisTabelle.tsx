"use client";

// src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/EreignisTabelle.tsx
import { Table, Tag, type TableProps } from "antd";
import type { EreignisZeile } from "../../../../../_lib/lesepfade/ereignisse";
import s from "../../../../../_ui/verwaltung.module.css";

/**
 * INSEL 5 — DIE AENDERUNGSHISTORIE EINES GERAETS (`Spec:4759-4776`, §5.10; Aufgabe V15).
 *
 * ⛔ SIE IST NEU UND AUSDRUECKLICH KEIN 1:1-PORT (`Spec:4759-4765`). Der Alt-Endpunkt
 * `GET /devices/:id/events` existiert (`radio-admin/server/src/routes/devices.ts:66-80`),
 * hat aber gemessen KEINEN Konsumenten — `rg -n 'events' radio-admin/client/src` liefert
 * nur einen Kommentar ueber antd-Tabellenereignisse. Es gibt also kein Vorbild, gegen das
 * man diese Insel pruefen koennte; sie prueft sich gegen das DATENMODELL, die sechs Spalten
 * aus `_db/schema.ts:130-141`.
 *
 * ⛔ WARUM CLIENT — **Falle 9** (Bauform-Zulaessigkeitstafel Nr. 1, `CLAUDE.md`): die vier
 * Spalten fuehren vier `render`-Funktionen. Eine `render`-Funktion, die in einer Server
 * Component entstuende, ist eine gewoehnliche Funktion — keine Server Action —, und React
 * lehnt ab, sie ueber die RSC-Grenze zu reichen
 * (`Error: Functions cannot be passed directly to Client Components`). ⚠️ Weder `typecheck`
 * noch `lint` noch `build` sehen das, und jsdom kann es STRUKTURELL nicht sehen — dort gibt
 * es keine RSC-Grenze. Der Waechter ist der Playwright-Fall aus `Spec:4880` (Fall 4),
 * Eigentuemer Aufgabe V23.
 *
 * ⛔ DIE PROPS-GRENZE IST `{ zeilen: EreignisZeile[] }` UND SONST NICHTS (`Spec:4507`). Jede
 * Zeile kommt VORFORMATIERT: kein `Date` (Bauform-Zulaessigkeitstafel Nr. 7,
 * `Spec:4536-4539`) und kein Rohzeitstempel — was an einer Uhr haengt, entsteht auf dem
 * Server, sonst entscheiden Server und Client an der Tagesgrenze verschieden
 * (`Spec:3341-3342`).
 *
 * ⛔ `FELD_ETIKETTEN` UND `QUELLE_WOERTER` BLEIBEN IM LESEPFAD
 * (`_lib/lesepfade/ereignisse.ts:36-37`, Aufgabenbrief V15 „Interfaces"). Zwei Gruende, und
 * beide tragen allein: die Zuordnung stuende sonst an zwei Stellen, und jene Datei ist ein
 * WERTMODUL mit `drizzle-orm`- und `_db/schema`-Import — ein Wertimport daraus zoege Drizzle
 * und `better-sqlite3` ins Browser-Bundle (`_lib/csv/klassifizieren.ts:6-9`). ⛔ DER TYP
 * KOMMT DESHALB ALS `import type` IN EINER EIGENEN ANWEISUNG, nie als `type` in einer
 * gemischten Klammer.
 *
 * ⛔ KEIN `size` (Falle 4): die Verwaltung laeuft in `FullShell` mit `controlHeight: 44`
 * (`src/core/theme/theme.ts:207-209`), auch auf dem Telefon. Platz schafft
 * `scroll={{ x: "max-content" }}`, nicht `size`.
 */

/** Der Gedankenstrich dieses Moduls — dieselbe Wahl wie `GeraeteTabelle.tsx:69`. */
const LEER = "—";

/**
 * Der Rueckfall an der PROPS-GRENZE.
 *
 * ⚠️ ER STEHT HIER EIN ZWEITES MAL, obwohl der Lesepfad bereits faltet
 * (`_lib/lesepfade/ereignisse.ts`, `wertText`) — und das ist die Hausform, nicht eine
 * Nachlaessigkeit: `GeraeteTabelle.tsx:69-72` fuehrt dieselbe Konstante und denselben
 * Rueckfall. Was ueber die Props hereinkommt, ist der Vertrag DIESER Datei; die leere
 * Zeichenkette ist der Wert, den `toEventValue` fuer ein geleertes Feld herausgibt
 * (`radio-admin/shared/src/diff-device.ts:4-6`).
 *
 * ⛔ MIT `||` UND NICHT `??`: beide Spalten sind Freitext (`_db/schema.ts:131-132`), die
 * LEERE Zeichenkette muss weiterfallen.
 */
const wert = (v: string) => v || LEER;

/**
 * DIE VIER QUELLWERTE UND IHR TON (`Spec:4772-4773`).
 *
 * ⛔ DER SCHLUESSEL IST DER ROHE WERT AUS `device_events.source`, NICHT DAS KLARTEXTWORT —
 * und das ist keine Geschmacksfrage. Das Schema fuehrt `source` als Drizzle-Enum OHNE
 * DB-Check (`_db/schema.ts:135-137`, woertlich): „Die Datenbank akzeptiert JEDEN String; ein
 * fuenfter Wert passiert Datenbank und Typpruefung unbeanstandet und bricht erst in einem
 * erschoepfenden Switch der Oberflaeche." Der Lesepfad faellt fuer einen unbekannten Wert
 * auf den ROHEN Wert als Wort zurueck; leitete diese Zuordnung ihren Ton aus dem WORT ab,
 * bekaeme ein unbekannter Quellwert namens `angelegt` still den Ton von `create`. Der Fall
 * „ein fuenfter, unbekannter Quellwert bekommt KEINEN Ton" misst genau das.
 *
 * ⛔ JEDER WERT BEKOMMT SEINEN EIGENEN TON — zwei Quellen auf einem Ton waeren auf dem
 * Bildschirm nicht zu unterscheiden.
 *
 * ⛔ KEIN ROT (Falle 3): `colorError === colorPrimary === FARBEN.rot`
 * (`src/core/theme/theme.ts:32-33`); ein rotes Zeichen auf einer Datenflaeche saehe aus wie
 * eine Primaeraktion. Rot bleibt allein den zerstoerenden Knoepfen.
 *
 * ⚠️ `warning` FUER `update-note` IST DER TON, DEN DAS MODUL FUER EINE ABWEICHUNG SCHON
 * FUEHRT (`geraete/[id]/page.tsx`, Kopfzeile „Abweichung"; `GeraeteTabelle.tsx`,
 * Abweichungsspalte) — ⛔ und deshalb KEIN zweiter Hexsatz, den NS-A8b verboete
 * (`_lib/status.ts:125`). Die drei uebrigen sind antd-Vorgabetoene
 * (`antd/es/theme/interface/presetColors.js:1`), keine eigenen Werte.
 *
 * ⚠️ `Record<string, string>` UND NICHT EIN ENGERER SCHLUESSELTYP: der Wert kommt roh aus der
 * Datenbank, und die Spalte nimmt jeden String an. Ein enger Typ zwaenge den Aufrufer zu
 * einem Guss und nicht die Daten zu einem Ton.
 */
export const QUELLE_TON: Record<string, string> = {
  manual: "blue",
  "csv-import": "purple",
  create: "green",
  "update-note": "warning",
};

/**
 * Eine Zeile mit ihrem Tabellenschluessel.
 *
 * ⚠️ `EreignisZeile` TRAEGT KEINEN EIGENEN SCHLUESSEL — `device_events` hat keine
 * Ausweisspalte im Lesepfad (`_lib/lesepfade/ereignisse.ts`, die sechs gelesenen Spalten).
 * Der Schluessel entsteht deshalb HIER, aus der Position; ⛔ nicht als `rowKey`-Funktion mit
 * `index`, denn antd verwarnt die seit Version 6 ausdruecklich
 * (`antd/es/table/InternalTable.js:209`: „`index` parameter of `rowKey` function is
 * deprecated").
 */
type Reihe = EreignisZeile & { schluessel: string };

/**
 * DIE VIER SPALTEN (`Spec:4767-4776`): Zeit, Feld, Aenderung, Wer.
 *
 * ⚠️ DIE QUELLE IST KEINE FUENFTE SPALTE. `Spec:4770` zaehlt „vier Spalten" und nennt die
 * Quelle im Satz danach separat („`source` wird als `Tag` gezeigt"); die Insel-Tafel des
 * Plans sagt dasselbe („vier Spalten mit `render` … und ein `Tag` je `quelle`",
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:1362`). Sie steht deshalb NEBEN dem Urheber:
 * „wer" und „wodurch" sind dieselbe Frage, und die Flaeche bleibt bei vier Spalten.
 */
const SPALTEN: NonNullable<TableProps<Reihe>["columns"]> = [
  {
    title: "Zeit",
    key: "zeit",
    // Vorformatiert in der festgenagelten Zone der Flaeche (`_lib/anzeige.ts:75`).
    render: (_: unknown, z: Reihe) => <span data-rolle="radio-ereignis-zeit">{z.zeitText}</span>,
  },
  {
    title: "Feld",
    key: "feld",
    /*
     * Das deutsche Etikett, nicht der Spaltenname (`Spec:4770-4771`). Die Zuordnung — und
     * ihr Rueckfall auf den rohen Feldnamen — liegt im Lesepfad; die Insel rendert nur.
     */
    render: (_: unknown, z: Reihe) => <span data-rolle="radio-ereignis-feld">{z.feldEtikett}</span>,
  },
  {
    title: "Änderung",
    key: "aenderung",
    /*
     * ⛔ „alt → neu" (`Spec:4771-4772`), in dieser Reihenfolge — vertauscht stuende die
     * Historie auf dem Kopf, und kein Tor faellt.
     */
    render: (_: unknown, z: Reihe) => (
      <span data-rolle="radio-ereignis-aenderung">
        {wert(z.alt)} → {wert(z.neu)}
      </span>
    ),
  },
  {
    title: "Wer",
    key: "wer",
    /*
     * ⛔ DER AUFGELOESTE NAME IN DER ZELLE, DER ROHE `sub` NUR IM `title` (`Spec:4772`) —
     * beide sind da, an verschiedenen Stellen.
     *
     * ⛔ `|| undefined` UND NICHT DER LEERE STRING: `changed_by` ist nullable
     * (`_db/schema.ts:133`), und jede per CSV importierte Zeile traegt ihn gar nicht — der
     * Lesepfad liefert dann `werSub: ""`. Ein `title=""` waere eine leere Sprechblase auf
     * jeder importierten Zeile.
     */
    render: (_: unknown, z: Reihe) => (
      <>
        <span data-rolle="radio-ereignis-wer" title={z.werSub || undefined}>
          {z.werText}
        </span>{" "}
        <Tag data-rolle="radio-ereignis-quelle" color={QUELLE_TON[z.quelle]}>
          {z.quelleWort}
        </Tag>
      </>
    ),
  },
];

export type EreignisTabelleProps = { zeilen: EreignisZeile[] };

export function EreignisTabelle({ zeilen }: EreignisTabelleProps) {
  /*
   * ⛔ OHNE EREIGNISSE WIRD DIE TABELLE GAR NICHT ERST GEBAUT. `locale={{ emptyText }}`
   * liesse ihre Huelle stehen — die Form, die `GeraeteTabelle.tsx` fuehrt, weil dort eine
   * Suche mit zehn Filtern darueber steht und die Spaltenkoepfe die Auskunft geben, WONACH
   * gesucht wurde. Hier gibt es weder Suche noch Filter; ein Tabellenkopf ueber nichts liest
   * sich wie ein Ladefehler statt wie „hier ist nichts passiert".
   */
  if (zeilen.length === 0) {
    return (
      <div data-rolle="radio-ereignis-flaeche">
        <p className={s.leer} data-rolle="radio-ereignis-leer">
          Für dieses Gerät ist keine Änderung aufgezeichnet.
        </p>
      </div>
    );
  }

  const reihen: Reihe[] = zeilen.map((z, i) => ({ ...z, schluessel: String(i) }));

  return (
    <div data-rolle="radio-ereignis-flaeche">
      <Table<Reihe>
        rowKey="schluessel"
        columns={SPALTEN}
        dataSource={reihen}
        /*
          ⛔ `pagination={false}` — die Historie kommt ohne Blaetterung (`Spec:4767-4770`),
          gedeckelt auf `EREIGNIS_GRENZE` im Lesepfad. Eine antd-eigene Blaetterung legte eine
          zweite, rein clientseitige Seitenteilung ueber das bereits geschnittene Fenster.
        */
        pagination={false}
        /* Ohne `scroll` bricht eine antd-Tabelle auf 390 px (`aufgaben/_ui/RoutinenTabelle.tsx:33-34`). */
        scroll={{ x: "max-content" }}
        aria-label="Änderungshistorie"
      />
    </div>
  );
}
