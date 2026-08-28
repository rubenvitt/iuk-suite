"use client";

// src/app/m/radio/admin/(arbeit)/geraete/[id]/GeraetFormular.tsx
import { useEffect, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { AutoComplete, Button, Checkbox, Col, DatePicker, Divider, Form, Input, Row, Select, Tag } from "antd";
import { geraetAendernAction } from "../../../actions";
import type { GeraetPatch } from "../../../actions";
import type { GeraetFormWerte, Vorschlagsfeld } from "../../../../_lib/lesepfade/geraete";
import { GERAETE_MODI, STATUS_OPTIONEN } from "../../../../_lib/geraeteFelder";
import { UPDATER_FELDER, type RadioRolle } from "../../../../_lib/rollen";
import { tagAusWert } from "../../../../_lib/csv/spalten";
import type { UpdateStand } from "../../../../_lib/updateStand";
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
 * kein `name`, schreibt nichts und ist deshalb auch kein Feld des Feldriegels.
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
 * Das Wort zum Update-Stand — ⛔ ALS WORT, NICHT ALS FARBE (Falle 3, `Spec:4555-4561`; Regel 4
 * der Insel-Tafel): `colorError === colorPrimary` (`src/core/theme/theme.ts:32-33`), ein rotes
 * Zeichen auf einer Datenflaeche saehe aus wie eine Primaeraktion.
 *
 * ⚠️ ZWEITE KOPIE, BENANNT STATT STILL: dieselbe Zuordnung steht in
 * `admin/(arbeit)/geraete/GeraeteTabelle.tsx:82-92`. Sie von dort zu importieren zoege die
 * ganze Tabelleninsel in das Bundle dieser Seite. ⬜ **V14-L1** — sie in `_lib/geraeteFelder.ts`
 * zusammenzulegen ist ein ClickUp-Board-Posten, kein Bauwert in diesem Fenster (dieselbe
 * Behandlung wie ⬜ V-L9).
 */
const STAND_TON: Record<UpdateStand, "success" | "warning" | undefined> = {
  aktuell: "success",
  veraltet: "warning",
  unbekannt: undefined,
};

const STAND_WORT: Record<UpdateStand, string> = {
  aktuell: "Aktuell",
  veraltet: "Veraltet",
  unbekannt: "Unbekannt",
};

/**
 * ⚠️ `titlePlacement="start"` IST DIE ANTD-6-SCHREIBWEISE VON `orientation="left"`
 * (`DeviceFields.tsx:56`, `:91`, `:119`, `:149`, `:174`) — benannte Abweichung im Namen, nicht
 * in der Wirkung: in antd 6 traegt `orientation` die Achse (`horizontal`/`vertical`), und die
 * Ausrichtung des Titels heisst `titlePlacement` (`node_modules/antd/es/divider/index.d.ts:22-25`,
 * aufgeschlagen). Ohne sie stuenden die fuenf Abschnittsueberschriften ZENTRIERT.
 *
 * Die Spaltenbreite des Bestands (`DeviceFields.tsx:27`).
 */
const SPALTE = { xs: 24, sm: 12 } as const;

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
   * die Tafel nicht nennt (`admin/(arbeit)/geraete/page.tsx:72-73`). Freitext bleibt moeglich
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
   * genau diese Seite an (`admin/actions.ts:677`); die Seite reicht das frische `geraet`
   * herein. ⛔ ANTDS `Form` UEBERNIMMT GEAENDERTE `initialValues` BEI EINEM NEU-RENDERN NICHT
   * (gemessen: der Fall „eine angehaengte Anmerkung ueberlebt ein spaeteres Speichern des
   * Formulars" war ohne diese Zeile rot) — ohne den Abgleich traegt das Feld weiter den Stand
   * VOR dem Anhaengen, `baueGeaenderteFelder` macht daraus einen Patcheintrag (`:225`), und der
   * Server schreibt ihn fuer die Admin-Stufe ungefiltert (`_lib/rollen.ts:105`,
   * `admin/actions.ts:534`). Die soeben angehaengte Zeile waere weg, still, auf einer
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
      <Divider titlePlacement="start">Identität</Divider>
      <Row gutter={[16, 8]}>
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
            {/* Hier als Text bearbeitet; die Akte-Anzeige macht daraus einen Link (page.tsx). */}
            <Input disabled={gesperrt("hiorgId")} />
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="start">Gerät</Divider>
      <Row gutter={[16, 8]}>
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
        <Col {...SPALTE}>
          <Form.Item name="deviceModes" label="Gerätefunktionen">
            <Select
              mode="multiple"
              allowClear
              disabled={gesperrt("deviceModes")}
              options={GERAETE_MODI.map((modus) => ({ label: modus, value: modus }))}
            />
          </Form.Item>
        </Col>
        <VorschlagFeld
          name="funktion"
          label="Funktion"
          optionen={vorschlaege.funktion}
          gesperrt={gesperrt("funktion")}
        />
      </Row>

      <Divider titlePlacement="start">Einsatz</Divider>
      <Row gutter={[16, 8]}>
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
        <Col {...SPALTE}>
          <Form.Item name="loanable" label="Ausleihbar" valuePropName="checked">
            <Checkbox disabled={gesperrt("loanable")}>Für Ausleihe freigegeben</Checkbox>
          </Form.Item>
        </Col>
        <Col {...SPALTE}>
          <Form.Item name="alamosIntegrated" label="Alamos integriert" valuePropName="checked">
            <Checkbox disabled={gesperrt("alamosIntegrated")}>Integriert</Checkbox>
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="start">Update</Divider>
      <Row gutter={[16, 8]}>
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
        {/*
          ⛔ DER EINE FORM.ITEM OHNE `name` (`DeviceFields.tsx:167-171`): ein reiner
          Anzeige-Slot. Der Bestand rendert ihn nur im Aendern-Formular, nicht im
          Anlegen-Dialog — dort gibt es noch keinen Stand.
        */}
        <Col {...SPALTE}>
          <Form.Item label="Update-Stand">
            <Tag color={STAND_TON[geraet.updateStand]} data-rolle="radio-update-stand">
              {STAND_WORT[geraet.updateStand]}
            </Tag>
          </Form.Item>
        </Col>
      </Row>

      <Divider titlePlacement="start">Bemerkung</Divider>
      <Row gutter={[16, 8]}>
        <Col xs={24}>
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
          <Col xs={24}>
            <Form.Item name="updateNote" label="Update-Anmerkung (Abweichungen)">
              <Input.TextArea rows={3} />
            </Form.Item>
          </Col>
        )}
      </Row>

      <Form.Item>
        <Button
          type="primary"
          htmlType="submit"
          loading={laeuft}
          icon={<VIkone name="haken" />}
          data-rolle="radio-formular-speichern"
        >
          Speichern
        </Button>
      </Form.Item>

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
    </Form>
  );
}
