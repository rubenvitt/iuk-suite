"use client";

// src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetFormular.tsx
import { useEffect, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { AutoComplete, Button, Checkbox, Col, DatePicker, Form, Input, Row, Select } from "antd";
import { geraetAendernAction } from "../../../actions";
import type { GeraetPatch } from "../../../actions";
import type { GeraetFormWerte, Vorschlagsfeld } from "../../../../_lib/lesepfade/geraete";
import { GERAETE_MODI, STATUS_OPTIONEN } from "../../../../_lib/geraeteFelder";
import { UPDATER_FELDER, type RadioRolle } from "../../../../_lib/rollen";
import { tagAusWert } from "../../../../_lib/csv/spalten";
import s from "../../../../_ui/verwaltung.module.css";
import { VIkone } from "../../../../_ui/verwaltungIkonen";

/**
 * INSEL 6 — DAS GERAETEFORMULAR (`Spec:4508`, §5.7; Aufgabe V14). Nachfolger von
 * `DeviceFields.tsx` (194 Zeilen) und `DeviceEditForm.tsx`.
 *
 * ⛔ SIE IST FALLE 1, NICHT FALLE 9 (`Spec:4523-4532`, Bauform-Zulaessigkeitstafel Nr. 3):
 * `DeviceFields.tsx` ist fast ausschliesslich `Form.Item` — **21 gerenderte, davon 20 benannte**,
 * gemessen. Compound-Zugriff in einer Server Component ist HTTP 500, und typecheck, lint und
 * build saehen nichts. Dazu `Input.TextArea` (`DeviceFields.tsx:178`, `:187`), `DatePicker`
 * (`:164`) und `Select mode="multiple"` (`:108`).
 *
 * ⛔ DREI NEBENEINANDERLIEGENDE INSELN, KEINE VERSCHACHTELTE (Entscheidung **E-V6**):
 * `GeraetFormular`, `NotizFeld` und `GeraetLoeschen` teilen KEINEN Zustand — jede haengt an
 * einer anderen Action. Die Insel-Tafel zaehlt sie als EINE (`Spec:4508`); der Zaehlunterschied
 * ist Vorabscan-Fund F22 und aendert an der Bauform nichts.
 *
 * ⛔ `rolle` IST EIN WERT, KEINE FUNKTION (`Spec:4508`): `lockedFor` entsteht IN der Insel,
 * 1:1 aus `DeviceEditForm.tsx:36-37`. Eine Funktion ueber die RSC-Grenze waere Falle 9.
 *
 * ⛔ `UPDATER_FELDER` KOMMT AUS `_lib/rollen.ts`, DAS KEIN `"use client"` TRAEGT — Falle 6 in
 * der HARMLOSEN Richtung: ein Wert AUS einem Server-Modul IN eine Client-Insel ist erlaubt
 * (`_lib/rollen.ts:6-10` schreibt genau diesen Verbraucher aus). ⛔ Die Gegenrichtung ist es
 * nicht: `_lib/lesepfade/geraete.ts` und `_lib/lesepfade/ereignisse.ts` duerfen hier nur als
 * `import type` vorkommen, sonst liegt Drizzle im Browser-Bundle
 * (`GeraetFormular.test.tsx`, Fall „keine Datei der Insel zieht _db/ oder drizzle-orm in den
 * Browser").
 *
 * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul dreimal ausgeschrieben
 * (`_ui/RueckgabeDialog.tsx:311-315`, `_ui/AusleihVorgang.tsx:443-446`,
 * `NeuGeraetModal.tsx:40-45`): in `src/app` gibt es keinen Aufruf von `message.*`. ⚠️ Damit
 * entfaellt das „Gerät gespeichert" aus `DeviceEditForm.tsx:94` — benannte Abweichung, dieselbe
 * wie beim Anlegen-Dialog. Der FEHLER steht dafuer am Ort der Aktion, und sein Text kommt aus
 * der Action selbst (`admin/actions.ts`), nicht aus einer zweiten Liste hier.
 *
 * ⚠️ ZWEI BENANNTE ABWEICHUNGEN VOM BESTAND, BEIDE MIT GRUND:
 *   1. Der eigene `Combobox` (`radio-admin/client/src/components/Combobox.tsx`) wird antds
 *      `AutoComplete` — dieselbe Bauform, die Planteil 3 fuer das Namensfeld gewaehlt hat
 *      (`_ui/EntleiherFeld.tsx:12-18`), kein zweites Muster. Der Eintrag „Anlegen: <Text>"
 *      (`Combobox.tsx:51`) entfaellt ersatzlos: bei einem `AutoComplete` IST der getippte Text
 *      der Wert, der Eintrag saehe wie ein zweiter Weg zum selben Ergebnis aus.
 *   2. `size` steht auf keinem Bedienelement (Falle 4, `CLAUDE.md`): der Verwaltungsrahmen
 *      traegt `controlHeight: 32` (`SCHREIBTISCHDICHTE`).
 */

/**
 * Die ZWANZIG benannten Felder, in der Reihenfolge des Bestands
 * (`DeviceFields.tsx:56-191`).
 *
 * ⛔ SIE IST DIESELBE MENGE WIE DIE SCHLUESSEL VON `FELD_ETIKETTEN`
 * (`_lib/lesepfade/ereignisse.ts:62`) — die Ereignisliste beschriftet ihre Zeilen aus
 * derselben Etikettenliste wie das Formular (`Spec:4770-4771`). Beide Abschriften existieren
 * nebeneinander (Vorabscan-Fund F11); der Fall „die zwanzig Feldnamen stehen im Markup und in
 * der Etikettenliste gleich" bindet sie aneinander, statt es zu erbitten.
 *
 * ⛔ DER ANZEIGE-SLOT „Update-Stand" (`DeviceFields.tsx:169`) ZAEHLT HIER NICHT MIT — er traegt
 * kein `name`, schreibt nichts und ist deshalb auch kein Feld des Feldriegels. ⚠️ Seit DRK-462
 * rendert das Formular ihn gar nicht mehr; er steht als Marke im Seitenkopf.
 *
 * ⚠️ DIESE REIHENFOLGE IST DIE DER LISTE, NICHT MEHR DIE DES RASTERS. Im Abschnitt „Gerät"
 * steht seit DRK-462 `funktion` VOR `deviceModes`, weil die Mehrfachauswahl dort zwei Spalten
 * traegt (`SPALTE_DOPPELT`) und die zweite Rasterzeile nur so glatt aufgeht. ⛔ DIE LISTE BLEIBT
 * TROTZDEM IN DER BESTANDSORDNUNG: sie bindet die Feldnamen an `FELD_ETIKETTEN`
 * (`_lib/lesepfade/ereignisse.ts`), und die Ereignisliste ordnet ihre Zeilen danach — wer sie
 * der Rasterordnung nachzoege, sortierte die Aenderungshistorie um.
 */
export const FORMULAR_FELDER = [
  "issi", // DeviceFields.tsx:62
  "tei", // DeviceFields.tsx:71
  "opta", // DeviceFields.tsx:76
  "rufname", // DeviceFields.tsx:77
  "serialNumber", // DeviceFields.tsx:79
  "hiorgId", // DeviceFields.tsx:84
  "hersteller", // DeviceFields.tsx:94
  "deviceType", // DeviceFields.tsx:99
  "bedieneinheit", // DeviceFields.tsx:101
  "deviceModes", // DeviceFields.tsx:107
  "funktion", // DeviceFields.tsx:116
  "location", // DeviceFields.tsx:121
  "assignedTo", // DeviceFields.tsx:123
  "status", // DeviceFields.tsx:129
  "loanable", // DeviceFields.tsx:138
  "alamosIntegrated", // DeviceFields.tsx:143
  "softwareVersion", // DeviceFields.tsx:152
  "lastUpdatedAt", // DeviceFields.tsx:163
  "notes", // DeviceFields.tsx:177
  "updateNote", // DeviceFields.tsx:186
] as const;

/**
 * Der Feldriegel der Updater-Stufe — 1:1 aus `DeviceEditForm.tsx:36-37`.
 *
 * ⛔ ER IST EINE ANZEIGE-ENTSCHEIDUNG, KEINE SPERRE. Die Sperre ist serverseitig
 * `filterSchreibbareFelder` (`_lib/rollen.ts:101`), und sie VERWIRFT STILL, statt abzulehnen
 * (`Spec:4432-4440`, Quellkommentar `radio-admin/server/src/routes/devices.ts:124-125`: „the
 * field allowlist (not a route guard) is the authorization boundary — disallowed fields are
 * silently dropped, not rejected").
 *
 * ⛔ ER WIRD AUCH VON `NotizFeld.tsx` GELESEN, und das ist der Grund, warum er hier steht und
 * nicht inline im Rumpf: die Fallunterscheidung „wer sieht die Update-Anmerkung wo" muss an
 * BEIDEN Stellen dieselbe sein, sonst steht sie doppelt oder gar nicht
 * (`DeviceFields.tsx:181-183`, `DeviceDetailDrawer.tsx:109`).
 */
export function gesperrtFuer(rolle: RadioRolle): (feld: string) => boolean {
  return (feld: string) =>
    rolle === "updater" && !(UPDATER_FELDER as readonly string[]).includes(feld);
}

/**
 * Die zwei Wahrheitswert-Felder, deren gespeichertes `null` das Formular als `false` bindet.
 *
 * ⛔ 1:1 aus `DeviceEditForm.tsx:27-29`. Ohne sie meldete JEDES Oeffnen-und-Speichern eines
 * frisch angelegten Geraets zwei Aenderungen, die niemand vorgenommen hat.
 */
const WAHRHEITS_FELDER: readonly string[] = ["alamosIntegrated", "loanable"];

/**
 * Die Werte, die antds `Form` haelt: die Geraetefelder, aber `lastUpdatedAt` als dayjs und
 * `deviceModes` als Liste (`DeviceEditForm.tsx:21-25`).
 *
 * ⛔ `updateNote` KANN FEHLEN — fuer die Updater-Stufe wird das Feld nicht gerendert
 * (`DeviceFields.tsx:184`), und `Form` liefert dann `undefined`. Genau darauf beruht die Regel
 * in `baueGeaenderteFelder`.
 */
export type FormularWerte = Omit<
  GeraetFormWerte,
  "id" | "updateStand" | "lastUpdatedAt" | "deviceModes"
> & {
  lastUpdatedAt: Dayjs | null;
  deviceModes: string[];
};

/**
 * Die komma-verbundene Spalte als Liste, in der kanonischen Reihenfolge — 1:1 aus
 * `radio-admin/client/src/features/devices/deviceModes.ts:8-17`.
 *
 * ⛔ DIE REIHENFOLGE IST DIE VON `GERAETE_MODI` UND WIRD NIE SORTIERT
 * (`radio-admin/shared/src/constants.ts:4`, woertlich: „The order here IS the canonical output
 * order — do not sort."). Unbekannte Token fallen weg.
 */
export function modiZuListe(wert: string | null | undefined): string[] {
  if (!wert) return [];
  const vorhanden = new Set(
    wert
      .split(",")
      .map((teil) => teil.trim())
      .filter((teil) => teil !== ""),
  );
  return GERAETE_MODI.filter((modus) => vorhanden.has(modus));
}

/**
 * Die Gegenrichtung — 1:1 aus `deviceModes.ts:24-31`. ⛔ Die LEERE Auswahl wird `null`, damit
 * sie mit der nullable Spalte rund laeuft (`_db/schema.ts:49`).
 *
 * ⬜ **V14-L2 — DER RUNDLAUF IST KEINE IDENTITAET, WENN DER GESPEICHERTE WERT NICHT KANONISCH
 * GEORDNET IST.** Gemessen: `"DMO,TMO"` geht als `["TMO","DMO"]` in das Formular und als
 * `"TMO,DMO"` zurueck — ein Patcheintrag beim blossen Oeffnen-und-Speichern, also eine
 * Ereigniszeile, die niemand eingegeben hat. ⚠️ 1:1 aus dem Bestand geerbt
 * (`deviceModes.ts:8-17`, `:24-31`; `DeviceEditForm.tsx:68` faehrt denselben Rundlauf), deshalb
 * KEIN Bauwert im 1:1-Rahmen.
 * ⛔ ALLE SCHREIBWEGE DER SUITE NORMALISIEREN — gemessen: der CSV-Weg ueber `normalisiereModi`
 * (`_lib/csv/klassifizieren.ts:193`, Reihenfolge aus der Konstanten und nicht aus der Zelle),
 * dieser Weg ueber `listeZuModi`, `_lib/seedLokal.ts:141` kanonisch, und `NeuGeraetModal` setzt
 * die Spalte gar nicht. ⛔ ES BLEIBT GENAU EINE QUELLE: die CUTOVER-DATENUEBERNAHME der
 * Alt-Zeilen. **Eigentuemer: Generalprobe / Cutover (Spec 2)**, zusammen mit ⬜ V-L8. Die
 * Abhilfe waere eine Zeile (die Spalte beim Uebernehmen durch dieselbe Normalisierung fuehren);
 * ⛔ wie viele Zeilen betroffen sind, hat NIEMAND gemessen, und eine Zahl zu raten waere die
 * Erfindung, gegen die dieser Planteil steht.
 */
export function listeZuModi(modi: string[] | null | undefined): string | null {
  if (!modi || modi.length === 0) return null;
  const vorhanden = new Set(modi);
  const geordnet = GERAETE_MODI.filter((modus) => vorhanden.has(modus));
  return geordnet.length > 0 ? geordnet.join(",") : null;
}

/**
 * Der Diff des Formulars — ⛔ 1:1 aus `DeviceEditForm.tsx:49-90`: es wird ein VOLLER Patch
 * gebaut und dann auf die tatsaechlich geaenderten Felder reduziert.
 *
 * ⛔ EIN UNANGEHAKTER WAHRHEITSWERT (`false`) UEBER EINEM GESPEICHERTEN `null` IST KEINE
 * AENDERUNG (`:79-82`, woertlich: „the form coerces null -> false on init, so treat them as
 * equal"). ⛔ OHNE DIESE REGEL ERZEUGT JEDES OEFFNEN-UND-SPEICHERN ZWEI FALSCHE
 * EREIGNISZEILEN.
 *
 * ⛔ UND `updateNote` BEHAELT BEI FEHLENDEM FELD DEN GESPEICHERTEN WERT (`:73`), damit der Diff
 * ihn nicht beruehrt. Die Spalte ist append-only (`_db/schema.ts:56-59`) — ein `null` von hier
 * loeschte die gesamte Anmerkungshistorie, und der Feldriegel des Servers faenge es nicht: fuer
 * die Admin-Stufe ist `updateNote` schreibbar.
 *
 * ⛔ `lastUpdatedAt` GEHT ALS `YYYY-MM-DD`, NICHT ALS `valueOf()` — Entscheidung **E-V11**. Der
 * Bestand sendet epoch-ms (`:61`), weil seine Spalte epoch-ms fuehrt; die Suite-Spalte IST der
 * Kalendertag (`_db/schema.ts:34-39`).
 * ⛔ UND DER TAG GEHT ALS ZEICHENKETTE IN `tagAusWert`, NICHT ALS `Date`: jene Funktion rechnet
 * einen `Date` in `Europe/Berlin` um (`_lib/csv/spalten.ts:207-236`), waehrend die ISO-Form
 * OHNE Zonenrechnung durchgeht („DIE ZWEI DATUMSFORMEN LAUFEN NICHT UEBER `Date` — sie SIND
 * bereits Kalendertage"). Ueber einen `Date` gefuehrt ergaebe die lokale Mitternacht einer Zone
 * oestlich von Berlin den VORTAG, und jedes Speichern schriebe einen Diff, den niemand
 * eingegeben hat. Die EINE Umrechnungsstelle (E-V11 Punkt 4) bleibt damit `_lib/csv/spalten.ts`.
 */
export function baueGeaenderteFelder(
  gespeichert: GeraetFormWerte,
  eingabe: FormularWerte,
): GeraetPatch {
  const naechst: GeraetPatch = {
    issi: eingabe.issi,
    rufname: eingabe.rufname ?? null,
    tei: eingabe.tei ?? null,
    serialNumber: eingabe.serialNumber ?? null,
    deviceType: eingabe.deviceType ?? null,
    status: eingabe.status ?? null,
    location: eingabe.location ?? null,
    assignedTo: eingabe.assignedTo ?? null,
    softwareVersion: eingabe.softwareVersion ?? null,
    lastUpdatedAt: tagAusWert(
      eingabe.lastUpdatedAt ? eingabe.lastUpdatedAt.format("YYYY-MM-DD") : null,
    ),
    notes: eingabe.notes ?? null,
    hiorgId: eingabe.hiorgId ?? null,
    opta: eingabe.opta ?? null,
    funktion: eingabe.funktion ?? null,
    hersteller: eingabe.hersteller ?? null,
    bedieneinheit: eingabe.bedieneinheit ?? null,
    deviceModes: listeZuModi(eingabe.deviceModes),
    alamosIntegrated: eingabe.alamosIntegrated ?? null,
    loanable: eingabe.loanable ?? null,
    updateNote: eingabe.updateNote === undefined ? gespeichert.updateNote : eingabe.updateNote,
  };

  const patch: Record<string, unknown> = {};
  for (const [schluessel, wert] of Object.entries(naechst)) {
    const alt = (gespeichert as unknown as Record<string, unknown>)[schluessel];
    if (WAHRHEITS_FELDER.includes(schluessel) && wert === false && alt == null) continue;
    if (wert !== alt) patch[schluessel] = wert;
  }
  return patch as GeraetPatch;
}

/**
 * ⬜ **V14-L1 IST EINGELOEST** (DRK-462): das Wort und der Ton des Update-Stands standen hier
 * und ein zweites Mal in `admin/(arbeit)/geraete/GeraeteTabelle.tsx`. Beide lesen sie jetzt aus
 * `_lib/geraeteFelder.ts` (`STAND_TON`, `STAND_WORT`) — einem Modul OHNE Direktive, und das ist
 * der Grund, warum der Zusammenzug hier nicht mehr aufschiebbar war: die Geraeteakte zeigt den
 * Stand seit DRK-462 als Marke im SEITENKOPF, und der ist eine Server Component. Von hier
 * importiert waere er eine Client-Referenz (Falle 6, HTTP 500 fuer die ganze Seite).
 *
 * ⛔ DAS FORMULAR ZEIGT IHN DAMIT GAR NICHT MEHR: der Anzeige-Slot ohne `name`
 * (`DeviceFields.tsx:167-171`) ist ersatzlos weg — benannte Abweichung vom Bestand, Begruendung
 * unten am Abschnitt „Update".
 */

/**
 * DIE SPALTENBREITE — ⛔ DREI SPALTEN AB `lg`, NICHT MEHR ZWEI (DRK-462).
 *
 * Der Bestand fuehrt `xs: 24, sm: 12` (`DeviceFields.tsx:27`), also fest zwei Spalten. Gemessen
 * im echten Chromium bei 1440x1000: die Inhaltsspalte ist 1024 px breit, jedes Feld darin
 * 479 px — eine SIEBENSTELLIGE ISSI in einem Kasten von 479 px, und drei Abschnitte mit
 * ungerader Feldzahl liessen je eine halbe Zeile (479 x 62 px) leer stehen. Mit der dritten
 * Spalte misst dasselbe Feld 310 px, und aus fuenf Feldzeilen werden zwei.
 *
 * ⚠️ `sm: 12` BLEIBT DAZWISCHEN STEHEN: von 576 bis 992 px waeren drei Spalten je ~200 px, und
 * darin passt „Update-Anmerkung (Abweichungen)" nicht mehr in eine Etikettzeile. Der Sprung
 * geht also 1 → 2 → 3, nicht 1 → 3.
 *
 * ⛔ KEIN `Grid.useBreakpoint` FUER DIESE ENTSCHEIDUNG: antds `Col` legt sie als CSS-Klassen
 * ab, eine JS-Abfrage zeigte beim ersten Rendern die falsche Variante (Falle 16, `CLAUDE.md`).
 */
const SPALTE = { xs: 24, sm: 12, lg: 8 } as const;

/** Die breite Spalte fuer die zwei Textfelder — ⛔ ZWEI NEBENEINANDER AB `lg`, nicht untereinander. */
const SPALTE_BREIT = { xs: 24, lg: 12 } as const;

/**
 * Die Doppelspalte der Mehrfachauswahl „Gerätefunktionen".
 *
 * ⛔ SIE IST KEINE KOSMETIK, SONDERN DIE EINZIGE ZELLE, DIE MEHR ALS EINEN WERT ZEIGT: vier
 * Modi als Marken in einem Feld von 310 px brechen um, und der Abschnitt „Gerät" haette mit
 * fuenf gleich breiten Feldern ohnehin eine dritte Spalte leer gelassen. Mit 8 + 16 geht die
 * zweite Rasterzeile glatt auf.
 */
const SPALTE_DOPPELT = { xs: 24, sm: 12, lg: 16 } as const;

/**
 * EIN ABSCHNITTSKOPF — ⛔ EIGENES MARKUP STATT `Divider titlePlacement="start"` (DRK-462).
 *
 * Der Bestand gliedert mit fuenf `Divider` (`DeviceFields.tsx:56`, `:91`, `:119`, `:149`,
 * `:174`). Gemessen kostete jeder davon 25 px Hoehe plus 16 px Abstand oben und unten — fuenf
 * mal 57 px, also **285 px allein fuer Ueberschriften** auf einer Seite von 2359 px. Und die
 * Abstaende liessen sich nicht kuerzen, ohne gegen antds eigenes CSS zu schreiben (Falle 5,
 * erste Ausprägung: Gleichstand, antd gewinnt durch Reihenfolge).
 *
 * ⛔ DER ERSATZ IST EINE UEBERSCHRIFT MIT LINIE, KEIN NACKTER TEXT: die Gliederung ist der
 * halbe Grund, warum die Flaeche nicht wie eine Feldwueste liest. Sie steht als Ueberschrift
 * da und nicht als `<strong>`, damit eine Vorleseanwendung die fuenf Abschnitte als
 * Gliederung ausgibt.
 *
 * ⛔ `<h2>` UND NICHT `<h3>`, OBWOHL DIE ABSCHNITTE IN EINER KARTE STEHEN: `Card title=`
 * rendert eine `div`, KEINE Ueberschrift (`antd/es/card/Card.js`, der `ant-card-head-title`).
 * Der Kartenkopf besetzt die zweite Stufe also gar nicht, und ein `<h3>` liesse zwischen dem
 * `<h1>` der Seite und den Abschnitten eine Stufe AUS — der Fall, den jede
 * Barrierefreiheitspruefung als „heading-order" meldet. ⚠️ Hausvorbild ist das Fahrzeugblatt
 * (`lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/page.tsx`, seine Abschnittsueberschriften):
 * dieselbe Lage — Detailseite mit einem `<h1>` und mehreren Abschnitten —, dort ebenfalls
 * `<h2>`. ⛔ Die `<h3>` in `lagerbuch/_ui/ArtikelDrawer.tsx` und `SammelDrawer.tsx` sind KEIN
 * Gegenbeispiel: sie stehen in einer `Drawer`, die ihren eigenen Titel als Ueberschrift fuehrt.
 *
 * ⚠️ DIE ZAEHLUNG BLEIBT BEI FUENF, und `GeraetFormular.test.tsx` misst sie weiter ueber die
 * TEXTE, nicht ueber `<Divider`.
 */
function Abschnitt({ children }: { children: string }) {
  return <h2 className={s.formAbschnitt}>{children}</h2>;
}

export type GeraetFormularProps = {
  /** ⛔ Vorformatiert und serialisierbar; `lastUpdatedAt` ist der Kalendertag `YYYY-MM-DD`. */
  geraet: GeraetFormWerte;
  /** ⛔ EIN WERT, KEINE FUNKTION (`Spec:4508`). */
  rolle: RadioRolle;
  vorschlaege: Record<Vorschlagsfeld, string[]>;
  /**
   * Die bekannten Softwareversionen fuer das Feld „Letztes Update".
   *
   * ⚠️ VIERTER PROP UEBER `Spec:4508` HINAUS, BENANNT: der Bestand bindet dieses Feld an einen
   * `Combobox allowCreate` ueber `useSoftwareVersions()` (`DeviceFields.tsx:152-160`), und ein
   * ersatzloses Weglassen waere ein stiller Verlust an einem Feld. Der Praezedenzfall steht
   * eine Ebene hoeher: Insel 1 fuehrt mit `suchtext` und `suchfelder` ebenfalls zwei Props, die
   * die Tafel nicht nennt (`admin/(arbeit)/geraete/page.tsx:73-74`). Freitext bleibt moeglich
   * — eine neu getippte Version registriert die Action selbst
   * (`admin/actions.ts`, `registriereVersion`).
   */
  versionen: string[];
};

/** Ein Vorschlagsfeld — der Nachfolger von `SuggestCol` (`DeviceFields.tsx:30-49`). */
function VorschlagFeld({
  name,
  label,
  optionen,
  gesperrt,
}: {
  name: string;
  label: string;
  optionen: string[];
  gesperrt: boolean;
}) {
  return (
    <Col {...SPALTE}>
      <Form.Item name={name} label={label}>
        <AutoComplete
          allowClear
          disabled={gesperrt}
          placeholder={label}
          options={optionen.map((wert) => ({ value: wert }))}
          filterOption={(eingabe, option) =>
            String(option?.value ?? "")
              .toLowerCase()
              .includes(eingabe.toLowerCase())
          }
        />
      </Form.Item>
    </Col>
  );
}

export function GeraetFormular({ geraet, rolle, vorschlaege, versionen }: GeraetFormularProps) {
  const [form] = Form.useForm<FormularWerte>();
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const gesperrt = gesperrtFuer(rolle);
  const notizImFormular = !gesperrt("updateNote");

  /*
   * ⛔ DIE ZWEI FALTUNGEN DES BESTANDS (`DeviceEditForm.tsx:39-47`): der Datumswaehler bekommt
   * ein dayjs, die Kaestchen echte Wahrheitswerte statt `null` („a React
   * controlled/uncontrolled antipattern").
   */
  const anfangswerte: FormularWerte = {
    issi: geraet.issi,
    rufname: geraet.rufname,
    tei: geraet.tei,
    serialNumber: geraet.serialNumber,
    deviceType: geraet.deviceType,
    status: geraet.status,
    location: geraet.location,
    assignedTo: geraet.assignedTo,
    softwareVersion: geraet.softwareVersion,
    lastUpdatedAt: geraet.lastUpdatedAt ? dayjs(geraet.lastUpdatedAt) : null,
    notes: geraet.notes,
    hiorgId: geraet.hiorgId,
    opta: geraet.opta,
    funktion: geraet.funktion,
    hersteller: geraet.hersteller,
    bedieneinheit: geraet.bedieneinheit,
    deviceModes: modiZuListe(geraet.deviceModes),
    alamosIntegrated: geraet.alamosIntegrated ?? false,
    loanable: geraet.loanable ?? false,
    updateNote: geraet.updateNote,
  };

  /*
   * ⛔ DIE APPEND-ONLY-SPALTE WIRD NACHGEZOGEN, WENN DER SERVER SIE FORTGESCHRIEBEN HAT.
   * `NotizFeld` haengt ueber `notizAnfuegenAction` an und stoesst danach `revalidatePath` auf
   * genau diese Seite an (`admin/actions.ts:689`); die Seite reicht das frische `geraet`
   * herein. ⛔ ANTDS `Form` UEBERNIMMT GEAENDERTE `initialValues` BEI EINEM NEU-RENDERN NICHT
   * (gemessen: der Fall „eine angehaengte Anmerkung ueberlebt ein spaeteres Speichern des
   * Formulars" war ohne diese Zeile rot) — ohne den Abgleich traegt das Feld weiter den Stand
   * VOR dem Anhaengen, `baueGeaenderteFelder` macht daraus einen Patcheintrag (`:225`), und der
   * Server schreibt ihn fuer die Admin-Stufe ungefiltert (`_lib/rollen.ts:105`,
   * `admin/actions.ts:546`). Die soeben angehaengte Zeile waere weg, still, auf einer
   * ausdruecklich append-only gefuehrten Spalte (`_db/schema.ts:56-59`).
   *
   * ⛔ NUR DIESES EINE FELD, UND DAS IST DER GANZE UNTERSCHIED ZU EINEM `key` AN DER INSEL: ein
   * Neuaufbau des ganzen Formulars verwuerfe JEDE noch nicht gespeicherte Eingabe. `updateNote`
   * ist das einzige Feld, das eine ANDERE Insel derselben Seite fortschreibt.
   *
   * ⚠️ WAS DAS KOSTET, BENANNT: tippt eine Admin-Person gerade im Formularfeld und haengt
   * gleichzeitig ueber `NotizFeld` an, ersetzt der Abgleich den ungespeicherten Text durch den
   * Serverstand. Das ist die richtige Richtung — der ungespeicherte Text haette die angehaengte
   * Zeile beim Speichern geloescht.
   *
   * ⛔ NICHT FUER DIE UPDATER-STUFE: dort wird das Feld gar nicht gerendert
   * (`DeviceFields.tsx:181-190`, unten im Rumpf am `!gesperrt("updateNote")`), und ein
   * `setFieldValue` legte den Schluessel erst im Speicher an.
   * ⚠️ DIESE EINE ZEILE IST HEUTE NICHT BEWACHT, UND DAS STEHT HIER STATT VERSCHWIEGEN ZU SEIN:
   * ihr Wegfall ist **gemessen 0 rot** (Sonde P2 der Fix-Runde 1). Der Grund ist strukturell —
   * antds Speicher gibt einen Schluessel, dessen `Form.Item` nie gerendert wurde, ueber
   * `onFinish` nicht heraus, und fuer die Updater-Stufe faenge der serverseitige Feldriegel ihn
   * ohnehin (`_lib/rollen.ts:105`: `updateNote` steht nicht in `UPDATER_FELDER`). Sie bleibt als
   * SPERRE gegen eine kuenftige Aenderung dieser antd-Eigenschaft stehen, ⛔ nicht als tragender
   * Zweig. Der Fall „ein Speichern durch die Updater-Stufe ruehrt die Anmerkung nicht an" misst
   * die ZUSAGE (nichts Veraltetes geht ueber die Grenze), nicht diese Zeile.
   */
  useEffect(() => {
    if (!notizImFormular) return;
    form.setFieldValue("updateNote", geraet.updateNote);
  }, [form, geraet.updateNote, notizImFormular]);

  const absenden = async (eingabe: FormularWerte) => {
    const patch = baueGeaenderteFelder(geraet, eingabe);
    /*
     * ⛔ EIN LEERER PATCH WIRD GAR NICHT ERST GESENDET (`DeviceEditForm.tsx:87-90`). Die Action
     * steigt bei leerem Diff zwar frueh aus (`admin/actions.ts`, Schritt 4), aber sie kann nur
     * ueberspringen, was gar nicht erst ankommt.
     */
    if (Object.keys(patch).length === 0) {
      setFehler(null);
      return;
    }
    setLaeuft(true);
    setFehler(null);
    const ergebnis = await geraetAendernAction(geraet.id, patch);
    setLaeuft(false);
    setFehler(ergebnis.ok ? null : ergebnis.fehler);
  };

  return (
    <Form<FormularWerte>
      form={form}
      layout="vertical"
      initialValues={anfangswerte}
      onFinish={absenden}
      requiredMark
    >
      <Abschnitt>Identität</Abschnitt>
      <Row gutter={[16, 0]}>
        <Col {...SPALTE}>
          <Form.Item
            name="issi"
            label="ISSI"
            rules={[{ required: true, message: "ISSI ist erforderlich" }]}
          >
            {/* Die ISSI ist der Abgleichschluessel — nur die Admin-Stufe aendert sie. */}
            <Input disabled={gesperrt("issi")} />
          </Form.Item>
        </Col>
        <Col {...SPALTE}>
          <Form.Item name="tei" label="TEI">
            {/* Hardware-Identitaet, geraeteindividuell — deshalb ohne Vorschlaege. */}
            <Input disabled={gesperrt("tei")} />
          </Form.Item>
        </Col>
        <VorschlagFeld
          name="opta"
          label="OPTA"
          optionen={vorschlaege.opta}
          gesperrt={gesperrt("opta")}
        />
        <VorschlagFeld
          name="rufname"
          label="Rufname"
          optionen={vorschlaege.rufname}
          gesperrt={gesperrt("rufname")}
        />
        <Col {...SPALTE}>
          <Form.Item name="serialNumber" label="Seriennummer">
            <Input disabled={gesperrt("serialNumber")} />
          </Form.Item>
        </Col>
        <Col {...SPALTE}>
          <Form.Item name="hiorgId" label="Hiorg-ID">
            {/*
              Hier als Text bearbeitet; den LINK auf eine eingetragene Adresse traegt seit
              DRK-462 die Kopfzeile der Seite (`page.tsx`, `HiorgWert`) — bis dahin stand der
              Wert zweimal auf derselben Seite, einmal als Lesezeile und 400 px weiter unten
              noch einmal als dieses Feld.
            */}
            <Input disabled={gesperrt("hiorgId")} />
          </Form.Item>
        </Col>
      </Row>

      <Abschnitt>Gerät</Abschnitt>
      <Row gutter={[16, 0]}>
        <VorschlagFeld
          name="hersteller"
          label="Hersteller"
          optionen={vorschlaege.hersteller}
          gesperrt={gesperrt("hersteller")}
        />
        <VorschlagFeld
          name="deviceType"
          label="Gerät"
          optionen={vorschlaege.geraeteTyp}
          gesperrt={gesperrt("deviceType")}
        />
        <VorschlagFeld
          name="bedieneinheit"
          label="Bedieneinheit"
          optionen={vorschlaege.bedieneinheit}
          gesperrt={gesperrt("bedieneinheit")}
        />
        <VorschlagFeld
          name="funktion"
          label="Funktion"
          optionen={vorschlaege.funktion}
          gesperrt={gesperrt("funktion")}
        />
        <Col {...SPALTE_DOPPELT}>
          <Form.Item name="deviceModes" label="Gerätefunktionen">
            <Select
              mode="multiple"
              allowClear
              disabled={gesperrt("deviceModes")}
              options={GERAETE_MODI.map((modus) => ({ label: modus, value: modus }))}
            />
          </Form.Item>
        </Col>
      </Row>

      <Abschnitt>Einsatz</Abschnitt>
      <Row gutter={[16, 0]}>
        <VorschlagFeld
          name="location"
          label="Lagerort"
          optionen={vorschlaege.lagerort}
          gesperrt={gesperrt("location")}
        />
        <VorschlagFeld
          name="assignedTo"
          label="Zuordnung"
          optionen={vorschlaege.zuordnung}
          gesperrt={gesperrt("assignedTo")}
        />
        <Col {...SPALTE}>
          <Form.Item name="status" label="Status">
            <Select
              allowClear
              disabled={gesperrt("status")}
              options={STATUS_OPTIONEN.map((wert) => ({ label: wert, value: wert }))}
            />
          </Form.Item>
        </Col>
      </Row>
      {/*
        ⛔ DIE ZWEI HAKEN STEHEN IN EINER EIGENEN ZEILE UND OHNE ETIKETT DARUEBER (DRK-462).
        Der Bestand gibt jedem ein `label` — „Ausleihbar" ueber „Für Ausleihe freigegeben",
        „Alamos integriert" ueber „Integriert": zwei Textzeilen fuer einen Haken, und beide
        sagen dasselbe. Gemessen kosteten sie so 2 x 62 px in zwei verschiedenen Rasterzeilen.
        Der Text AM Kaestchen traegt die Aussage jetzt allein, und er ist zugleich die
        Beschriftung, die eine Vorleseanwendung ansagt — `Checkbox` legt sein Kind in ein
        `<label>`, der Name geht also nicht verloren.

        ⛔ DER TEXT IST WORTGLEICH DAS ETIKETT AUS `FELD_ETIKETTEN`
        (`_lib/lesepfade/ereignisse.ts`) — „Ausleihbar" und „Alamos integriert" —, UND DAS IST
        DIE BEDINGUNG, UNTER DER DAS `label` WEGFALLEN DARF: der Fall „die zwanzig Feldnamen
        stehen im Markup und in der Etikettenliste gleich" bindet Formular und Ereignisliste
        aneinander (Vorabscan-Fund F11). Er liest diese zwei Texte seit DRK-462 am Kaestchen
        statt am `label`; stuende dort weiter „Für Ausleihe freigegeben", nennte die
        Aenderungshistorie dasselbe Feld anders als das Formular.
        ⚠️ „Für Ausleihe freigegeben" ENTFAELLT DAMIT — benannte Abweichung vom Bestand. Der
        Satz war die einzige Stelle der Suite, die dieses Feld nicht „Ausleihbar" nannte; die
        Zustandsmarke im Seitenkopf und die Spalte der Geraeteliste tun es beide.
        ⚠️ DIE FELDNAMEN BLEIBEN `loanable` UND `alamosIntegrated`: der Feldriegel der
        Updater-Stufe haengt an ihnen, nicht am Etikett.
      */}
      <div className={s.formHaken}>
        <Form.Item name="loanable" valuePropName="checked" noStyle>
          <Checkbox disabled={gesperrt("loanable")}>Ausleihbar</Checkbox>
        </Form.Item>
        <Form.Item name="alamosIntegrated" valuePropName="checked" noStyle>
          <Checkbox disabled={gesperrt("alamosIntegrated")}>Alamos integriert</Checkbox>
        </Form.Item>
      </div>

      <Abschnitt>Update</Abschnitt>
      {/*
        ⛔ DER ANZEIGE-SLOT „Update-Stand" IST HIER WEG (DRK-462) — benannte Abweichung vom
        Bestand (`DeviceFields.tsx:167-171`, ein `Form.Item` OHNE `name`). Er war ein reiner
        LESEWERT und belegte trotzdem eine volle Feldzeile (gemessen 479 x 62 px, davon die
        Haelfte leer), mitten zwischen zwei Eingabefeldern. Seit DRK-462 steht er als Marke im
        Seitenkopf, wo die Frage „wie steht es um dieses Geraet" ohnehin beantwortet wird.
        ⛔ ER WAR NIE TEIL DES FELDRIEGELS: ohne `name` schreibt er nichts und steht deshalb
        auch nicht in `FORMULAR_FELDER`. Sein Wegfall ruehrt keine Rechtestufe an.
      */}
      <Row gutter={[16, 0]}>
        <Col {...SPALTE}>
          <Form.Item name="softwareVersion" label="Letztes Update">
            <AutoComplete
              allowClear
              disabled={gesperrt("softwareVersion")}
              placeholder="Softwareversion"
              options={versionen.map((wert) => ({ value: wert }))}
              filterOption={(eingabe, option) =>
                String(option?.value ?? "")
                  .toLowerCase()
                  .includes(eingabe.toLowerCase())
              }
            />
          </Form.Item>
        </Col>
        <Col {...SPALTE}>
          <Form.Item name="lastUpdatedAt" label="Zuletzt aktualisiert">
            <DatePicker className={s.feldWeit} disabled={gesperrt("lastUpdatedAt")} />
          </Form.Item>
        </Col>
      </Row>

      <Abschnitt>Bemerkung</Abschnitt>
      {/*
        ⛔ DIE ZWEI TEXTFELDER STEHEN AB `lg` NEBENEINANDER (DRK-462): sie lagen als zwei
        `xs={24}` untereinander und nahmen gemessen 2 x 112 px auf der vollen Kartenbreite ein,
        beide meist leer. `rows={3}` bleibt — die Hoehe ist nicht das Problem, die Anordnung war
        es.
        ⚠️ IST `updateNote` NICHT GERENDERT (Updater-Stufe), fuellt „Bemerkung" die halbe
        Breite und der Rest bleibt leer. Das ist gewollt: ein Textfeld, das je nach Rechtestufe
        seine Breite wechselt, verschiebt bei jedem Rollenwechsel das ganze Raster.
      */}
      <Row gutter={[16, 0]}>
        <Col {...SPALTE_BREIT}>
          <Form.Item name="notes" label="Bemerkung">
            <Input.TextArea rows={3} disabled={gesperrt("notes")} />
          </Form.Item>
        </Col>
        {/*
          ⛔ FUER DIE UPDATER-STUFE WIRD DIESES FELD NICHT GERENDERT
          (`DeviceFields.tsx:181-190`, woertlich: „Für Updater NICHT gerendert — die hängen
          über das UpdateNotePanel an (so wird die Anmerkung nicht doppelt angezeigt)").
          `NotizFeld.tsx` liest dieselbe Bedingung ueber `gesperrtFuer`.
        */}
        {!gesperrt("updateNote") && (
          <Col {...SPALTE_BREIT}>
            <Form.Item name="updateNote" label="Update-Anmerkung (Abweichungen)">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        )}
      </Row>

      {/*
        ⛔ EINE ABGESETZTE FUSSLEISTE STATT EINES LEEREN `Form.Item` (DRK-454). Der Knopf stand
        am Ende von zwanzig Feldern ohne jede Abgrenzung im Fluss. Die Linie trennt sie von der
        einen Aktion, die sie absendet; das `Form.Item` drum herum trug
        nichts als seinen Abstand, und der steht jetzt im Blatt (`.formularFuss` in
        `_ui/verwaltung.module.css`).
        ⚠️ DER KNOPF BEHAELT `htmlType="submit"` UND BRAUCHT DAS `Form.Item` NICHT: `Form`
        haengt an `onFinish`, nicht an einem `onClick` — ein Absenden-Knopf irgendwo INNERHALB
        des `<Form>` loest dieselbe Kette aus.
        ⛔ DER FEHLER STEHT NEBEN DEM KNOPF, NICHT DARUNTER: er gehoert an den Ort der Aktion,
        und ohne Toast (E6) ist er die einzige Rueckmeldung, die es gibt.
      */}
      <div className={s.formularFuss}>
        <Button
          type="primary"
          htmlType="submit"
          loading={laeuft}
          icon={<VIkone name="haken" />}
          data-rolle="radio-formular-speichern"
        >
          Speichern
        </Button>

        {fehler !== null && (
          /*
            ⛔ KEIN `Alert type="error"` UND KEIN ROTTON: `colorError === colorPrimary`
            (`src/core/theme/theme.ts:32-33`) — ein roter Kasten saehe aus wie die Primaeraktion
            (Falle 3). Dieselbe Form wie `NeuGeraetModal.tsx:104-113`.
          */
          <p className={s.dialogFehler} role="alert" data-rolle="radio-formular-fehler">
            {fehler}
          </p>
        )}
      </div>
    </Form>
  );
}
