"use client";

// src/app/m/radio/admin/(arbeit)/import/ImportAssistent.tsx
import { useState } from "react";
import { Alert, Button, Card, Col, Result, Row, Select, Space, Statistic, Steps, Table, Tag, Tooltip, Typography, Upload } from "antd";
import { importSchreibenAction } from "../../actions";
import {
  IMPORTIERBARE_FELDER,
  automatischeSpaltenzuordnung,
  type ImportierbaresFeld,
} from "../../../_lib/csv/kopfzeilen";
import {
  IMPORTKLASSEN,
  KLASSEN_WOERTER,
  type Importklasse,
  type KlassifizierteZeile,
  type Spaltenzuordnung,
  type Zusammenfassung,
} from "../../../_lib/csv/klassifizieren";
import { VIkone } from "../../../_ui/verwaltungIkonen";
import s from "../../../_ui/verwaltung.module.css";
/*
 * ⛔ EIN TYPIMPORT AUS DEM HANDLER, UND ZWAR ABSICHTLICH: die Antwortform von
 * `hochladen/route.ts` waere sonst hier ein ZWEITES Mal abgeschrieben — genau die
 * Doppelabschrift, gegen die dieses Haus seine Scans hat. `import type` verschwindet zur
 * Laufzeit und legt keine Modulkante an; der Bundle-Waechter in `ImportAssistent.test.tsx`
 * ueberspringt ihn deshalb ausdruecklich (`if (nurTyp) continue;`). Vorbild:
 * `software/UpdateSuche.tsx` zieht `UpdateKarteZeile` aus einem Modul, das `_db/schema` als
 * WERT liest.
 */
import type { HochladenAntwort } from "./hochladen/route";

/**
 * INSEL 4 — DER ZWEIPHASIGE CSV-IMPORT (`Spec:4506`, §5.7; Aufgabe V18).
 *
 * ⛔ WARUM CLIENT — **FALLE 1 UND FALLE 9 ZUGLEICH**, und `Spec:4506` nennt beide:
 * `Upload.Dragger` (`ImportWizard.tsx:150`), `Typography.Text` und `Select` sind
 * Compound-Zugriffe bzw. zustandsbehaftet — aus einer Server Component gerendert ist das
 * HTTP 500 (`CLAUDE.md`, Falle 1); und die Vorschautabelle traegt zwei `render`-Funktionen
 * (`:271`, `:284`), die eine Server Component nicht ueber die RSC-Grenze reichen darf
 * (Falle 9).
 *
 * ⛔ KEINE PROPS — `type ImportAssistentProps = {}` ist die Aussage, nicht die Bauform: der
 * Assistent haelt Schritt, Zuordnung, Vorschau und Ergebnis SELBST (`Spec:4506`,
 * `ImportWizard.tsx:88-92`). Ein leerer Objekttyp waere `@typescript-eslint/no-empty-object-type`
 * und damit ein Fehler im Tor; die Aussage steht deshalb hier und die Funktion nimmt keinen
 * Parameter. Der Waechter dagegen ist der Fall „die Insel nimmt keine Props" in
 * `ImportAssistent.test.tsx`.
 *
 * ⛔ ZWEIPHASIG, UND DAS BLEIBT SO (`Spec:4695-4702`, woertlich: „Eine einphasige
 * Suite-Fassung (‚Datei hoch, fertig') ist **kein Port, sondern ein anderes Produkt** — der
 * Import ist der Weg, ueber den Geraete tatsaechlich in den Bestand kommen."). Vier Schritte,
 * 1:1 aus `ImportWizard.tsx:33-35`: `upload | mapping | preview | done`.
 *
 * ⛔ DIE ZWEI SERVERWEGE SIND VERSCHIEDEN, UND DER UNTERSCHIED IST DIE ENTSCHEIDUNG **E-V16**:
 *
 *   Schritt 1 (Datei)  -> `fetch("/admin/import/hochladen", { method: "POST" })` mit
 *                         `FormData`. ⛔ KEINE SERVER ACTION: die suiteweite Grenze
 *                         `experimental.serverActions.bodySizeLimit` steht bei 1 MB, und
 *                         `next.config.ts` hebt sie nicht an. Das Haus hat den Fall zweimal
 *                         so entschieden (`aufgaben/a/[id]/nachweis/hochladen/route.ts:2-9`,
 *                         `files/api/u/[token]/upload/route.ts`).
 *   Schritt 3 und 4    -> `importSchreibenAction(zuordnung, zeilen, probelauf)`,
 *                         ⛔ DIREKT IMPORTIERT und nicht als Prop gereicht
 *                         (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`).
 *                         `commit` wird ZWEIMAL gerufen — einmal mit `probelauf === true`
 *                         (`ImportWizard.tsx:107`), einmal mit `false` (`:123`).
 *
 * ⚠️ BENANNTE ABWEICHUNG BEI DER PFADFORM DES `fetch`: `briefs/V18.md:78` schreibt
 * `/m/radio/admin/import/hochladen` — die INNERE Form. Hier steht die AEUSSERE. Beide
 * erreichen den Handler (`src/core/routing.ts:68-76` laesst `/m/<key>/…` durch), aber die
 * aeussere ist die, die `_lib/routen.ts` fuehrt und `_lib/routen.test.ts` als Rewrite misst —
 * mit der inneren waere jener Eintrag Zierde. Dieselbe Trennung wie bei jedem `href`
 * (`_lib/nav.ts:9-11`) und beim Vorbild des Hauses
 * (`aufgaben/_ui/NachweisFormular.tsx:98`: `/a/${aufgabeId}/nachweis/hochladen`).
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), dieselbe Linie wie in
 * `geraete/[id]/NotizFeld.tsx:35-38` und `software/UpdateSuche.tsx`. Die vier
 * `message.error`-Aufrufe des Bestands (`ImportWizard.tsx:101`, `:109`, `:117`, `:131`)
 * werden zu EINER gedaempften Fehlerzeile; ⛔ IHRE TEXTE WANDERN WOERTLICH MIT, nur ihre
 * Darreichung nicht. Kein `Alert type="error"` und kein Rotton: `colorError === colorPrimary`
 * (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die Primaeraktion
 * (Falle 3, dieselbe Begruendung wie `GeraetFormular.tsx:615-620`). ⚠️ DER
 * ZUORDNUNGSHINWEIS IST DAVON NICHT BERUEHRT: er traegt `success`/`warning` (1:1
 * `ImportWizard.tsx:170-178`), und `colorWarning`/`colorSuccess` sind eigene Toene
 * (`theme.ts:34-35`). Die Begruendung steht an der Stelle selbst.
 *
 * ⛔ KEIN `size=` — Falle 4 (die Verwaltung laeuft seit dem 2026-08-28 auf
 * `SCHREIBTISCHDICHTE`, `controlHeight: 32`, `src/core/theme/theme.ts`; das Mass kommt aus
 * der Dichte und nie aus einem `size` am Bauteil), modulweit durchgesetzt von
 * `_ui/AusleihRahmen.test.tsx:196-214`. Damit entfallen `Space size="large"`/`size="middle"`
 * (`ImportWizard.tsx:138`, `:169`, `:295`) und ⛔ das `size="small"` an der Vorschautabelle
 * (`:305`) — Platz schafft dort `scroll={{ x: "max-content" }}`.
 *
 * ✅ DAS ZEICHEN AM ABLEGEFELD IST ZURUECK — 1:1 `ImportWizard.tsx:159-161` (`FiUpload` in
 * einem eigenen Absatz, dort `fontSize: 32`), Betreiberentscheidung vom 2026-08-28. Dazu
 * tragen die Schrittknoepfe `pfeil-links` (zurueck), `haken` (weiter/importieren) und `funk`
 * (zu den Geraeten — `FiRadio` ist im Bestand das Zeichen der Geraete, `Dashboard.tsx:28`).
 * ⚠️ HIER STAND, `@ant-design/icons` SEI DER GRUND — das stimmt fuer jenes Paket (Falle 7)
 * und NICHT fuer `react-icons/pi`, das gemessen RSC-sicher ist (`lagerbuch`, 2026-08-12).
 * Quelle ist `_ui/verwaltungIkonen.tsx`; `_ui/ikonen.tsx` bleibt der Ausleihflaeche.
 *
 * ⚠️ WAS DIESE DATEI NICHT LIEST: `_lib/csv/einlesen.ts`. Dort laufen die Node-Bausteine —
 * das Einlesen gehoert dem Handler (`hochladen/route.ts`), und ein Wertimport von hier zoege
 * sie ins Browser-Bundle. `_lib/csv/kopfzeilen.ts` (importlos) und
 * `_lib/csv/klassifizieren.ts` (jeder Schema-Bezug ein Typimport) sind ausdruecklich fuer
 * diese Insel gebaut — beide sagen es in ihrem Kopf.
 */

/**
 * DIE BILDSCHIRMTEXTE DIESER FLAECHE, in EINER benannten Liste und nicht inline verstreut
 * (`Spec:4815-4832`, 1:1-Tafel Abschnitt E). ⚠️ Sie tragen ihre Umlaute — es sind
 * Bildschirmtexte, keine Bezeichner. ⛔ NICHT EXPORTIERT: es gibt keinen Verbraucher, der
 * Test schreibt die Texte bewusst aus (ein Import waere tautologisch — dieselbe Wahl wie in
 * `software/UpdateSuche.tsx`).
 */
const IMPORT_TEXTE = {
  /** ⛔ Woertlich `ImportWizard.tsx:162`. */
  ablegen: "CSV-Datei hierher ziehen oder klicken",
  /** ⛔ Woertlich `ImportWizard.tsx:163`. */
  laeuft: "Wird verarbeitet…",
  /** ⛔ Woertlich `ImportWizard.tsx:101` — der Text des CLIENTS. Der Server antwortet mit
   *  „Leere oder ungültige Datei" (`import.ts:28`, in der Suite `LESE_FEHLER`), und der
   *  Bestand verwirft ihn hier ebenso: `onError` kennt den Rumpf nicht. */
  leseFehler: "Datei konnte nicht gelesen werden",
  /** ⛔ Woertlich `ImportWizard.tsx:168`. */
  zuordnenTitel: "Spalten zuordnen",
  /** ⛔ Woertlich `ImportWizard.tsx:175`. */
  issiZugeordnet: "ISSI ist zugeordnet.",
  /** ⛔ Woertlich `ImportWizard.tsx:176`. */
  issiOffen: "Die ISSI-Spalte muss zugeordnet werden, um fortzufahren.",
  /** ⛔ Woertlich `ImportWizard.tsx:200`. */
  nichtZuordnen: "— nicht zuordnen —",
  /** ⛔ Woertlich `ImportWizard.tsx:109` — die Sperre, wenn die ISSI-Spalte fehlt. */
  issiFehlt: "ISSI-Spalte muss zugeordnet sein",
  /** ⛔ Woertlich `ImportWizard.tsx:208`, `:311`. */
  zurueck: "Zurück",
  /** ⛔ Woertlich `ImportWizard.tsx:215`. */
  weiter: "Weiter",
  /** ⛔ Woertlich `ImportWizard.tsx:294`. */
  vorschauTitel: "Vorschau (Probelauf)",
  /** ⛔ Woertlich `ImportWizard.tsx:117`. */
  vorschauFehler: "Vorschau fehlgeschlagen",
  /** ⛔ Woertlich `ImportWizard.tsx:313`. */
  ausfuehren: "Import ausführen",
  /** ⛔ Woertlich `ImportWizard.tsx:131`. */
  importFehler: "Import fehlgeschlagen",
  /** ⛔ Woertlich `ImportWizard.tsx:234`. */
  fertig: "Import abgeschlossen",
  /** ⛔ Woertlich `ImportWizard.tsx:238`. */
  zuDenGeraeten: "Zu den Geräten",
  /** ⛔ Woertlich `ImportWizard.tsx:275` — die Erklaerung am uebersprungenen Tag. */
  uebersprungen: "updater darf keine neuen Geräte anlegen",
  /** ⛔ Woertlich `ImportWizard.tsx:288` — die Aenderungsspalte ohne Aenderung. */
  keineAenderung: "—",
} as const;

/**
 * Die vier Schritte in ihrer Reihenfolge — 1:1 `ImportWizard.tsx:33-35`.
 *
 * ⛔ DIE ENGLISCHEN NAMEN WANDERN MIT, wie die Klassennamen in `Importklasse`
 * (`_lib/csv/klassifizieren.ts:45`): sie sind der Bestand, und eine Uebersetzung waere ein
 * zweiter Wahrheitsort ohne Gegenwert. Die BESCHRIFTUNGEN sind deutsch (`:142-145`).
 */
const SCHRITT_FOLGE = ["upload", "mapping", "preview", "done"] as const;
type Schritt = (typeof SCHRITT_FOLGE)[number];

/** ⛔ Woertlich `ImportWizard.tsx:142-145`. */
const SCHRITT_TITEL: Record<Schritt, string> = {
  upload: "Datei",
  mapping: "Zuordnung",
  preview: "Vorschau",
  done: "Fertig",
};

/**
 * Die Beschriftung je importierbarem Feld — ⛔ 1:1 `ImportWizard.tsx:38-58`, alle NEUNZEHN.
 *
 * ⚠️ SIE STEHT HIER UND NICHT IN `_lib/csv/kopfzeilen.ts`: die Feldliste ist Fachlogik, die
 * BESCHRIFTUNG ist Oberflaeche — der Bestand trennt sie ebenso (`auto-map-headers.ts` gegen
 * `ImportWizard.tsx:38`). Der Typ `Record<ImportierbaresFeld, string>` haelt beide Mengen
 * zusammen: ein neues Feld ohne Beschriftung ist ein Typfehler, kein leeres Etikett.
 */
const FELD_ETIKETTEN: Record<ImportierbaresFeld, string> = {
  issi: "ISSI",
  tei: "TEI",
  rufname: "Rufname",
  serialNumber: "Seriennummer",
  deviceType: "Gerät",
  status: "Status",
  location: "Lagerort",
  assignedTo: "Zuordnung",
  softwareVersion: "Letztes Update",
  lastUpdatedAt: "Zuletzt aktualisiert",
  notes: "Bemerkung",
  hiorgId: "Hiorg-ID",
  opta: "OPTA",
  funktion: "Funktion",
  hersteller: "Hersteller",
  bedieneinheit: "Bedieneinheit",
  deviceModes: "Gerätefunktionen",
  alamosIntegrated: "Alamos integriert",
  loanable: "Ausleihbar",
};

/** ⛔ Der Platzhalterwert der Nicht-Zuordnung — 1:1 `ImportWizard.tsx:68`. */
const NICHT_ZUGEORDNET = "__none__";

/** Der aeussere Pfad des Hochladen-Handlers (`_lib/routen.ts`, `hochladen/route.ts`). */
const HOCHLADEN = "/admin/import/hochladen";

/** Der aeussere Pfad der Geraeteliste — die AEUSSERE Form, wie jeder `href` (`_lib/nav.ts:9-11`). */
const GERAETELISTE = "/admin/geraete";

/** Feld -> gewaehlte Kopfzeile der Datei. 1:1 `columnMapping.ts:4` (`ColumnMapping`). */
type Spaltenwahl = Partial<Record<ImportierbaresFeld, string>>;

/** Die gelesene Datei — die Erfolgshaelfte der Handlerantwort, ABGELEITET statt abgeschrieben. */
type Gelesen = Omit<Extract<HochladenAntwort, { ok: true }>, "ok">;

/** Die Bilanz eines Laufs — `ImportBilanz` aus `admin/actions.ts:117`, hier ohne Importzwang. */
type Bilanz = { zusammenfassung: Zusammenfassung; zeilen: KlassifizierteZeile[] };

/**
 * Der Vorschlag: Kopfzeile -> Feld, invertiert zu Feld -> Kopfzeile.
 *
 * ⛔ 1:1 `columnMapping.ts:15-25`, samt „First header wins per field" (`:13`): die
 * Synonymtabelle dedupliziert bewusst NICHT (`auto-map-headers.ts:95-98`), und wer hier die
 * LETZTE statt der ERSTEN Kopfzeile gewinnen liesse, aenderte bei einer Datei mit „Typ" UND
 * „Gerätetyp" still die Quellspalte.
 */
function vorschlag(spalten: readonly string[]): Spaltenwahl {
  const kopfZuFeld = automatischeSpaltenzuordnung(spalten);
  const wahl: Spaltenwahl = {};
  for (const kopf of spalten) {
    const feld = kopfZuFeld[kopf];
    if (feld !== undefined && wahl[feld] === undefined) wahl[feld] = kopf;
  }
  return wahl;
}

/**
 * Feld -> Kopfzeile wird zu Feld -> SPALTENINDEX, der Form, die die Action erwartet.
 *
 * ⛔ 1:1 `columnMapping.ts:33-43`: eine Kopfzeile, die es in der Datei nicht (mehr) gibt,
 * FAELLT WEG statt auf `-1` zu zeigen — `-1` waere ein gueltiger Index fuer
 * `zeileZuEingehend` und laese still die letzte Zelle jeder Zeile.
 */
function zuSpaltenzuordnung(wahl: Spaltenwahl, spalten: readonly string[]): Spaltenzuordnung {
  const zuordnung: Spaltenzuordnung = {};
  for (const feld of IMPORTIERBARE_FELDER) {
    const kopf = wahl[feld];
    if (kopf === undefined) continue;
    const index = spalten.indexOf(kopf);
    if (index >= 0) zuordnung[feld] = index;
  }
  return zuordnung;
}

/**
 * Die Zusammenfassung als Satz — ⛔ 1:1 `ImportWizard.tsx:247-251`: `Klasse: n · Klasse: n · …`
 * ueber ALLE FUENF Klassen, auch die mit `0`.
 */
function zusammenfassungText(zusammenfassung: Zusammenfassung): string {
  return IMPORTKLASSEN.map(
    (klasse) => `${KLASSEN_WOERTER[klasse].wort}: ${zusammenfassung[klasse] ?? 0}`,
  ).join(" · ");
}

/**
 * DIE ABLEGE-WEICHE — sie nimmt die abgelegte Datei an und gibt antd IMMER `false` zurueck.
 *
 * ⛔ 1:1 `ImportWizard.tsx:154-157`, dessen Kommentar den Grund woertlich nennt: „prevent
 * antd auto-POST; we upload via useImportParse". Gaebe sie `true` zurueck, liefe je Datei
 * ein ZWEITER, stiller Hochladeversuch — rc-uploads eigener, ueber `XMLHttpRequest` auf
 * antds Vorgabeadresse (`@rc-component/upload/es/AjaxUploader.js:175-192`, `:236`).
 *
 * ⛔ SIE STEHT ALS BENANNTE, EXPORTIERTE FUNKTION HIER UND NICHT ALS PFEIL IM JSX, UND DAS
 * IST DER FUND F2 DER SCHLUSSPRUEFUNG (`REVIEW-V18.md`). Der Quelltext-Scan, der bis dahin
 * die tragende Zusicherung war, belegte nur, dass die Zeichenfolge `return false;` im
 * Pfeilkoerper steht — ein `if (datei.size < 0) return false; return true;` kam durch alle
 * Tore (dort gemessen als Sonde M1: `Tests 14 passed`, typecheck 0). Als benannte Funktion
 * ist ihr RUECKGABEWERT messbar, und `ImportAssistent.test.tsx` misst ihn.
 *
 * ⚠️ `uebernimm` gibt `unknown` zurueck und nicht `void`: `handhabeDatei` ist `async`, und
 * eine Zusage auf `void` liefe in `@typescript-eslint/no-misused-promises`.
 */
export function ablegeWeiche(uebernimm: (datei: File) => unknown): (datei: unknown) => false {
  return (datei) => {
    void uebernimm(datei as File);
    return false;
  };
}

export function ImportAssistent() {
  const [schritt, setSchritt] = useState<Schritt>("upload");
  const [gelesen, setGelesen] = useState<Gelesen | null>(null);
  const [wahl, setWahl] = useState<Spaltenwahl>({});
  const [vorschau, setVorschau] = useState<Bilanz | null>(null);
  const [ergebnis, setErgebnis] = useState<Bilanz | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  /**
   * ⛔ DIE DATEI GEHT AN DEN ROUTE HANDLER, NICHT IN EINE SERVER ACTION (E-V16). Dass antd
   * daneben nicht SELBST hochlaedt, haelt `ablegeWeiche` oben — samt der Messung, die das
   * belegt.
   */
  const handhabeDatei = async (datei: File) => {
    setLaeuft(true);
    setFehler(null);
    try {
      const rumpf = new FormData();
      rumpf.set("datei", datei);
      const antwort = await fetch(HOCHLADEN, { method: "POST", body: rumpf });
      if (!antwort.ok) throw new Error(String(antwort.status));
      const daten = (await antwort.json()) as HochladenAntwort;
      if (!daten.ok) throw new Error(daten.fehler);
      setGelesen({ spalten: daten.spalten, zeilen: daten.zeilen });
      setWahl(vorschlag(daten.spalten));
      setSchritt("mapping");
    } catch {
      /* ⛔ EIN TEXT FUER JEDEN FEHLWEG — 1:1 `ImportWizard.tsx:101` (`onError`). Der Bestand
         unterscheidet hier ebenfalls nicht zwischen 404, 500 und unlesbarer Datei. */
      setFehler(IMPORT_TEXTE.leseFehler);
    } finally {
      setLaeuft(false);
    }
  };

  /** Der Probelauf — `commit` mit `dryRun: true` (`ImportWizard.tsx:105-119`). */
  const starteVorschau = async () => {
    if (gelesen === null) return;
    const zuordnung = zuSpaltenzuordnung(wahl, gelesen.spalten);
    /* ⛔ 1:1 `ImportWizard.tsx:108-111`: ohne zugeordnete ISSI-Spalte gibt es keinen
       Schluessel — der Knopf ist ohnehin gesperrt (`:211`), und diese Zeile ist der zweite
       Riegel fuer jeden Weg daran vorbei. Die Wahrheit bleibt die serverseitige Pruefung in
       `importSchreibenAction` („eine Regel, die nur im Client steht, ist keine Regel",
       `Spec:3583-3585`). */
    if (zuordnung.issi === undefined) {
      setFehler(IMPORT_TEXTE.issiFehlt);
      return;
    }
    setLaeuft(true);
    setFehler(null);
    try {
      const antwort = await importSchreibenAction(zuordnung, gelesen.zeilen, true);
      if (!antwort.ok) {
        setFehler(antwort.fehler);
        return;
      }
      setVorschau({ zusammenfassung: antwort.zusammenfassung, zeilen: antwort.zeilen });
      setSchritt("preview");
    } catch {
      /* Der Transportweg, nicht die Fachlichkeit — 1:1 `ImportWizard.tsx:117` (`onError`). */
      setFehler(IMPORT_TEXTE.vorschauFehler);
    } finally {
      setLaeuft(false);
    }
  };

  /** Der Schreiblauf — `commit` mit `dryRun: false` (`ImportWizard.tsx:121-133`). */
  const starteImport = async () => {
    if (gelesen === null) return;
    const zuordnung = zuSpaltenzuordnung(wahl, gelesen.spalten);
    if (zuordnung.issi === undefined) return;
    setLaeuft(true);
    setFehler(null);
    try {
      const antwort = await importSchreibenAction(zuordnung, gelesen.zeilen, false);
      if (!antwort.ok) {
        setFehler(antwort.fehler);
        return;
      }
      setErgebnis({ zusammenfassung: antwort.zusammenfassung, zeilen: antwort.zeilen });
      setSchritt("done");
    } catch {
      setFehler(IMPORT_TEXTE.importFehler);
    } finally {
      setLaeuft(false);
    }
  };

  const issiZugeordnet = wahl.issi !== undefined;

  return (
    <div data-rolle="radio-import" data-schritt={schritt}>
      <Steps
        current={SCHRITT_FOLGE.indexOf(schritt)}
        items={SCHRITT_FOLGE.map((wert) => ({ title: SCHRITT_TITEL[wert] }))}
      />

      {schritt === "upload" && (
        <div className={s.abstand}>
          <Upload.Dragger
            accept=".csv,text/csv"
            maxCount={1}
            showUploadList={false}
            /* ⛔ KEIN PFEIL HIER — die Weiche steht oben, damit ihr Rueckgabewert
               messbar ist (Fund F2 der Schlusspruefung). */
            beforeUpload={ablegeWeiche(handhabeDatei)}
          >
            {/* ⛔ OHNE `data-rolle` AM ABLEGEFELD UND AN DER VERARBEITUNGSMELDUNG: beide
                Griffe hatten seit dem Bau KEINEN Verbraucher — weder in dieser Datei noch in
                `e2e/radio-verwaltung.spec.ts` (`REVIEW-V18.md`, Fund F6). Ein Griff ohne
                Verbraucher sieht aus wie ein Waechter und ist keiner. Wer die
                Verarbeitungsmeldung messen will, braucht einen haengenden `fetch`; wer sie
                braucht, legt den Griff mit seinem Fall zusammen wieder an. */}
            {/* ⛔ EIN EIGENER ABSATZ UEBER DEM TEXT UND NICHT IN IHM — 1:1
                `ImportWizard.tsx:159-161`. `groesse={32}` ist die Pixelzahl am `<svg>`
                (⛔ NICHT `size` an einem Bedienelement, Falle 4 ist nicht beruehrt) und
                ersetzt das dortige `style={{ fontSize: 32 }}`. */}
            <p>
              <VIkone name="hochladen" groesse={32} />
            </p>
            <p>{IMPORT_TEXTE.ablegen}</p>
            {laeuft && <p>{IMPORT_TEXTE.laeuft}</p>}
          </Upload.Dragger>
        </div>
      )}

      {schritt === "mapping" && gelesen !== null && (
        <Card title={IMPORT_TEXTE.zuordnenTitel} className={s.abstand}>
          {/*
            ⛔ EIN `Alert`, KEIN NACKTES `<p>` — 1:1 `ImportWizard.tsx:170-178`
            (`<Alert type={issiMapped ? 'success' : 'warning'} showIcon>`). Der TON ist hier
            die halbe Aussage: er sagt vor dem Lesen, ob der Uebergang offen ist.
            ⛔ DIE HAUSREGEL AUS FALLE 3 TRIFFT DIESEN KASTEN NICHT — sie gilt
            `Alert type="error"` und dem Rotton, weil `colorError === colorPrimary`
            (`src/core/theme/theme.ts:32-33`); `colorWarning` (gelb) und `colorSuccess`
            (gruen) sind davon nicht beruehrt (`:34-35`). Das Vorbild im Modul steht eine
            Aufgabe zurueck: `software/UpdateSuche.tsx:229-233` (V17) — ⚠️ DORT ABER
            `type="info"`: `warning` und `success` sind die ERSTEN gelben und gruenen Flaechen
            dieses Moduls.
            ⬜ V18-L2 — WIE SIE IN BEIDEN FARBMODI AUSSEHEN, IST UNGEMESSEN. Vitest kann es
            strukturell nicht (`ant-alert-warning` ist ein Klassenname, kein Ton), und die
            Lehre des Hauses ist vernarbt: „UI-Abnahme: messen, nicht schauen — und immer
            beide Farbmodi". Eigentuemer ist der Browserlauf in **V23**, dieselbe Stelle wie
            die uebrige Abnahme dieser Flaeche. ⛔ Kein Kommentar hier behauptet etwas
            anderes.
            ⛔ DER GRIFF SITZT AM INNEREN `<span>`, wie dort: so liest
            `text("radio-import-hinweis")` und der Playwright-Fall den blanken Satz, waehrend
            der Ton am aeusseren Kasten haengt.
          */}
          <Alert
            type={issiZugeordnet ? "success" : "warning"}
            showIcon
            message={
              <span data-rolle="radio-import-hinweis">
                {issiZugeordnet ? IMPORT_TEXTE.issiZugeordnet : IMPORT_TEXTE.issiOffen}
              </span>
            }
          />
          {IMPORTIERBARE_FELDER.map((feld) => (
            /* ⛔ `Row`/`Col` mit `span={8}`/`span={16}` — 1:1 `ImportWizard.tsx:180-205`. */
            <Row key={feld} align="middle" gutter={8} className={s.importZeile}>
              <Col span={8}>
                <Typography.Text>
                  {FELD_ETIKETTEN[feld]}
                  {feld === "issi" && <Typography.Text type="danger"> *</Typography.Text>}
                </Typography.Text>
              </Col>
              <Col span={16}>
                <Select<string>
                  className={s.importWeit}
                  value={wahl[feld] ?? NICHT_ZUGEORDNET}
                  onChange={(wert) =>
                    setWahl((vorher) => {
                      const naechste = { ...vorher };
                      if (wert === NICHT_ZUGEORDNET) delete naechste[feld];
                      else naechste[feld] = wert;
                      return naechste;
                    })
                  }
                  options={[
                    { value: NICHT_ZUGEORDNET, label: IMPORT_TEXTE.nichtZuordnen },
                    ...gelesen.spalten.map((spalte) => ({ value: spalte, label: spalte })),
                  ]}
                  data-rolle={`radio-import-wahl-${feld}`}
                />
              </Col>
            </Row>
          ))}
          <Space>
            {/* ⛔ ZURUECK FUEHRT IN DEN DATEISCHRITT, NICHT AUF DIESEN — 1:1
                `ImportWizard.tsx:208`. ⛔ DAS ZIEL IST EIN ANDERES ALS BEI DER
                Vorschau-Taste (`:226` -> `mapping`); wer beide einebnet, macht aus dieser
                hier eine TOTE TASTE und laesst nur noch das Neuladen der Seite. */}
            <Button
              onClick={() => setSchritt("upload")}
              icon={<VIkone name="pfeil-links" />}
              data-rolle="radio-import-zurueck"
            >
              {IMPORT_TEXTE.zurueck}
            </Button>
            {/* ⛔ GESPERRT, SOLANGE DIE ISSI-SPALTE FEHLT — 1:1 `ImportWizard.tsx:211`. */}
            <Button
              type="primary"
              disabled={!issiZugeordnet}
              loading={laeuft}
              onClick={() => void starteVorschau()}
              icon={<VIkone name="haken" />}
              data-rolle="radio-import-weiter"
            >
              {IMPORT_TEXTE.weiter}
            </Button>
          </Space>
        </Card>
      )}

      {schritt === "preview" && vorschau !== null && (
        <Card title={IMPORT_TEXTE.vorschauTitel} className={s.abstand}>
          {/* ⛔ FUENF KARTEN, EINE JE KLASSE — `ImportWizard.tsx:296-302`, und FUENF und nicht
              drei: die Entscheidung dazu steht in `_lib/csv/klassifizieren.ts:35-44`. */}
          <Row gutter={16}>
            {IMPORTKLASSEN.map((klasse) => (
              <Col key={klasse}>
                <div data-rolle="radio-import-kennzahl">
                  <Statistic
                    title={KLASSEN_WOERTER[klasse].wort}
                    value={vorschau.zusammenfassung[klasse] ?? 0}
                  />
                </div>
              </Col>
            ))}
          </Row>
          <div className={s.abstand}>
            <Table<KlassifizierteZeile>
              rowKey="zeilenNummer"
              columns={vorschauSpalten()}
              dataSource={vorschau.zeilen}
              /* ⛔ 1:1 `ImportWizard.tsx:308`. Die Zeilen liegen VOLLSTAENDIG in dieser Insel —
                 anders als bei den Server-geblaetterten Tabellen (Regime B) gibt es hier keine
                 Adresse, ueber die geblaettert werden koennte. */
              pagination={{ pageSize: 10 }}
              /* Ohne `scroll` bricht eine antd-Tabelle auf 390 px (`aufgaben/_ui/RoutinenTabelle.tsx:33-34`). */
              scroll={{ x: "max-content" }}
            />
          </div>
          <Space>
            {/* ⛔ ZURUECK FUEHRT IN DIE ZUORDNUNG, NICHT IN DEN DATEISCHRITT — 1:1 `:226`. */}
            <Button
              onClick={() => setSchritt("mapping")}
              icon={<VIkone name="pfeil-links" />}
              data-rolle="radio-import-zurueck"
            >
              {IMPORT_TEXTE.zurueck}
            </Button>
            <Button
              type="primary"
              loading={laeuft}
              onClick={() => void starteImport()}
              icon={<VIkone name="haken" />}
              data-rolle="radio-import-ausfuehren"
            >
              {IMPORT_TEXTE.ausfuehren}
            </Button>
          </Space>
        </Card>
      )}

      {schritt === "done" && ergebnis !== null && (
        <div className={s.abstand} data-rolle="radio-import-fertig">
          <Result
            status="success"
            title={IMPORT_TEXTE.fertig}
            subTitle={
              <span data-rolle="radio-import-bilanz">
                {zusammenfassungText(ergebnis.zusammenfassung)}
              </span>
            }
            extra={
              /* ⛔ `Button href`, NIEMALS `<Link><Button/></Link>` — das verschachtelte ein
                 `<button>` in einem `<a>` (`lagerbuch/.../ChecklisteKnopf.tsx:15-28`). Und der
                 AEUSSERE Pfad (`_lib/nav.ts:9-11`), nicht `/devices` (`ImportWizard.tsx:237`). */
              <Button
                type="primary"
                href={GERAETELISTE}
                icon={<VIkone name="funk" />}
                data-rolle="radio-import-zu-geraeten"
              >
                {IMPORT_TEXTE.zuDenGeraeten}
              </Button>
            }
          />
        </div>
      )}

      {fehler !== null && (
        <p className={s.dialogFehler} role="alert" data-rolle="radio-import-fehler">
          {fehler}
        </p>
      )}
    </div>
  );
}

/**
 * Die vier Spalten der Vorschautabelle — ⛔ 1:1 `ImportWizard.tsx:264-291`: Zeile · ISSI ·
 * Klasse · Änderungen.
 *
 * ⛔ SIE ENTSTEHEN IN EINER FUNKTION DIESER `"use client"`-DATEI, nicht in der Server
 * Component: ein `columns[].render`, das jenseits der RSC-Grenze entsteht, ist eine
 * gewoehnliche Funktion, und React lehnt ab, sie ueber die Grenze zu reichen (Falle 9,
 * `CLAUDE.md`).
 */
function vorschauSpalten() {
  return [
    { title: "Zeile", dataIndex: "zeilenNummer", key: "zeilenNummer", width: 80 },
    { title: "ISSI", dataIndex: "issi", key: "issi" },
    {
      title: "Klasse",
      dataIndex: "klasse",
      key: "klasse",
      render: (klasse: Importklasse) => {
        const marke = (
          <Tag color={KLASSEN_WOERTER[klasse].ton} data-rolle="radio-import-klasse">
            {KLASSEN_WOERTER[klasse].wort}
          </Tag>
        );
        /* ⛔ 1:1 `ImportWizard.tsx:274-276`: NUR bei `skipped-no-permission` steht die
           Erklaerung dabei. Ohne sie sieht eine uebersprungene Zeile aus wie ein Fehler des
           Imports, statt wie eine Rechtefrage. */
        return klasse === "skipped-no-permission" ? (
          <Tooltip title={IMPORT_TEXTE.uebersprungen}>{marke}</Tooltip>
        ) : (
          marke
        );
      },
    },
    {
      title: "Änderungen",
      key: "aenderungen",
      /* ⛔ 1:1 `ImportWizard.tsx:284-289`: BEI EINEM FEHLER STEHT DER FEHLERTEXT STATT DER
         FELDLISTE (`:286`), sonst die FELDNAMEN oder ein Gedankenstrich (`:288`). Wer beides
         nebeneinander zeigte, machte aus der Fehlerzeile eine, die auch etwas geaendert hat. */
      render: (_: unknown, zeile: KlassifizierteZeile) => (
        <span data-rolle="radio-import-aenderungen">
          {zeile.fehler !== undefined ? (
            <Typography.Text type="danger">{zeile.fehler}</Typography.Text>
          ) : (
            zeile.aenderungen.map((a) => a.feld).join(", ") || IMPORT_TEXTE.keineAenderung
          )}
        </span>
      ),
    },
  ];
}
