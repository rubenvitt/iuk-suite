// src/app/m/radio/_lib/lesepfade/ereignisse.ts
// KEIN "use client" und KEIN "use server" (Falle 6, `CLAUDE.md`): reine Datenzugriffe, deren
// WERTE Server Components lesen. Der Scan, der beides fuer `_lib/` und `_db/` modulweit
// durchsetzt, steht in `src/app/m/radio/riegel.test.ts:1064-1117`.
import { desc, eq, inArray } from "drizzle-orm";
// ⛔ NUR DER TYP, NIE EIN WERT-IMPORT: `_db/client.ts:19` zieht `@/core/db`, und das zieht
// `better-sqlite3` und `node:fs` (`src/core/db/index.ts:2-4`). Ein Wert-Import ist die Klasse,
// die `build` MAL faengt und mal nicht — und im Zweifel erst im echten Abruf.
import type { DB } from "../../_db/client";
import { deviceEvents, users } from "../../_db/schema";
import { datumMitUhrzeit } from "../anzeige";

/**
 * DIE AENDERUNGSHISTORIE EINES GERAETS (Planteil 4, Aufgabe V7).
 *
 * ⛔ DIE FLAECHE IST NEU UND AUSDRUECKLICH KEIN 1:1-PORT
 * (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:4759-4765`). Gemessen ist beides:
 * der Alt-Endpunkt `GET /devices/:id/events` existiert
 * (`radio-admin/server/src/routes/devices.ts:66-80`), und `rg -n 'events'` ueber
 * `radio-admin/client/src` liefert KEINEN Konsumenten. Die Alt-Anwendung schreibt seit Anfang
 * an eine Ereigniszeile je geaendertem Feld (`radio-admin/server/src/repos/deviceRepo.ts:222-244`)
 * und zeigt sie NIRGENDS.
 *
 * ⛔ WARUM SIE TROTZDEM ENTSTEHT (`Spec:4759-4765`): der Import zieht `device_events` als
 * Historie mit — „eine importierte Tabelle, die niemand lesen kann, ist ein Datenfriedhof mit
 * Wartungskosten". Es gibt also kein Vorbild zum Nachpruefen; diese Datei prueft sich gegen das
 * DATENMODELL, die sechs Spalten aus `_db/schema.ts:130-141`.
 *
 * ⛔ `db` IST DER ERSTE PARAMETER, IMMER, und diese Datei holt sich die Verbindung nie selbst —
 * sonst waere sie im Test nicht gegen eine eigene Datei zu haengen, und `getModuleDb()` waere
 * dort ausserdem falsch: sein Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR`
 * (`src/core/db/index.ts:31-35`). Vorbild `_lib/lesepfade/geraete.ts:34-37`.
 *
 * ⛔ DIE SERVER COMPONENT FORMATIERT, DIE INSEL RENDERT. `EreignisZeile` unten traegt jeden
 * Wert fertig; Insel 5 (`EreignisTabelle.tsx`, V15) bekommt `{ zeilen: EreignisZeile[] }`
 * (`Spec:4507`) und sonst nichts. ⛔ `FELD_ETIKETTEN` UND `QUELLE_WOERTER` VERLASSEN DIESE
 * DATEI NICHT — die Insel sieht sie nie.
 */

/**
 * Die ZWANZIG Feldnamen der Geraetemaske mit ihrem deutschen Etikett.
 *
 * ⛔ DIE ETIKETTEN SIND DIESELBEN WIE IM FORMULAR (`Spec:4770-4771`, woertlich: „deutsches
 * Etikett aus derselben Etikettenliste, die das Formular benutzt" — und die Zeile darauf nennt
 * `DeviceFields.tsx` mit seinen `label`-Attributen als den Ort). Sie stehen dort je Eintrag mit
 * eigenem Anker am Zeilenende, in
 * `radio-admin/client/src/features/devices/DeviceFields.tsx`.
 *
 * ⛔ DER SCHLUESSEL IST DER WERT, DER IN `device_events.field` LANDET, nicht der Spaltenname der
 * Datenbank: `diffDevice` (`radio-admin/shared/src/diff-device.ts:16-22`) schreibt dort den
 * Schluessel des Datensatzes — also genau das `name`-Attribut derselben Formularzeile.
 *
 * ⚠️ DIESELBEN ZWANZIG TEXTE ENTSTEHEN IN V14 EIN ZWEITES MAL, als `label` des Suite-Formulars,
 * und es gibt heute KEINEN Mechanismus, der die zwei Abschriften gleich haelt (Vorabscan-Fund
 * F11, `.superpowers/sdd/planteil4/VORABSCAN.md`). Die Zuordnung hier ist der Ort, an dem die
 * Historie sie liest; wer eines der Etiketten aendert, aendert das andere von Hand mit.
 *
 * ⚠️ `Record<string, string>` UND NICHT EIN ENGERER SCHLUESSELTYP: der Wert kommt roh aus der
 * Datenbank, und die Spalte ist Freitext (`_db/schema.ts:130`). Ein enger Typ zwaenge jeden
 * Aufrufer zu einem Guss und nicht die Daten zu einem Etikett.
 */
export const FELD_ETIKETTEN: Record<string, string> = {
  issi: "ISSI", // DeviceFields.tsx:63
  tei: "TEI", // DeviceFields.tsx:71
  opta: "OPTA", // DeviceFields.tsx:76
  rufname: "Rufname", // DeviceFields.tsx:77
  serialNumber: "Seriennummer", // DeviceFields.tsx:79
  hiorgId: "Hiorg-ID", // DeviceFields.tsx:84
  hersteller: "Hersteller", // DeviceFields.tsx:95
  deviceType: "Gerät", // DeviceFields.tsx:99
  bedieneinheit: "Bedieneinheit", // DeviceFields.tsx:102
  deviceModes: "Gerätefunktionen", // DeviceFields.tsx:107
  funktion: "Funktion", // DeviceFields.tsx:116
  location: "Lagerort", // DeviceFields.tsx:121
  assignedTo: "Zuordnung", // DeviceFields.tsx:124
  status: "Status", // DeviceFields.tsx:129
  loanable: "Ausleihbar", // DeviceFields.tsx:138
  alamosIntegrated: "Alamos integriert", // DeviceFields.tsx:143
  softwareVersion: "Letztes Update", // DeviceFields.tsx:152
  lastUpdatedAt: "Zuletzt aktualisiert", // DeviceFields.tsx:163
  notes: "Bemerkung", // DeviceFields.tsx:177
  updateNote: "Update-Anmerkung (Abweichungen)", // DeviceFields.tsx:186
};

/**
 * Die VIER Quellwerte mit ihrem Klartextwort (`Spec:4772-4773`).
 *
 * ⛔ DIE VIER WERTE SIND ABSCHLIESSEND (`radio-admin/server/src/repos/deviceRepo.ts:219`,
 * `_db/schema.ts:139-141`) — und das Schema fuehrt sie als Drizzle-Enum OHNE DB-Check
 * (`_db/schema.ts:135-137`, woertlich): „Die Datenbank akzeptiert JEDEN String; ein fuenfter
 * Wert passiert Datenbank und Typpruefung unbeanstandet und bricht erst in einem erschoepfenden
 * Switch der Oberflaeche." Deshalb ist der Rueckfall unten der ROHE Wert und kein Absturz.
 */
export const QUELLE_WOERTER: Record<string, string> = {
  manual: "von Hand",
  "csv-import": "CSV-Import",
  create: "angelegt",
  "update-note": "Abweichung",
};

/**
 * ⬜ V-L7 — DER ALT-LESER HAT KEINE GRENZE (`deviceRepo.ts:248-254`: kein `limit`, keine
 * Blaetterung); die 200 sind eine Neuerung dieses Ports (`Spec:4767-4770`) und werden bei der
 * Generalprobe abgelesen (`.superpowers/sdd/planteil4/progress.md`, Zeile V-L7).
 *
 * ⛔ NEUESTE ZUERST, OHNE BLAETTERUNG. Der Deckel schneidet damit die AELTESTEN Zeilen weg —
 * die Form, die eine Historie braucht, wenn sie nur ein Fenster zeigt.
 */
export const EREIGNIS_GRENZE = 200;

/**
 * Die Leerwertform dieses Moduls. ⚠️ SIE IST HIER EINE BENANNTE WAHL UND KEIN PORT: der
 * Alt-Endpunkt hat gemessen keinen Konsumenten, es gibt also keine Alt-Darstellung eines leeren
 * Wertes zum Abschreiben. Dieselbe Form fuehren `_db/leihen.ts` (`ZURUECK_OFFEN`, 1:1 aus
 * `radio-admin/client/src/utils/format.ts:2-4`) und `_lib/lesepfade/geraete.ts:434`
 * (`letztesUpdateText`).
 */
const LEER = "—";

/**
 * Eine Zeile der Aenderungshistorie — VIER SPALTEN (`Spec:4767-4776`): Zeit, Feld, Aenderung,
 * Wer, dazu die Quelle als Zeichen.
 *
 * ⛔ VORFORMATIERT UND SERIALISIERBAR, KEIN `Date`. Die Zeile geht als Prop an Insel 5; ein
 * `Date` ueber diese Grenze ist verboten (Bauform-Zulaessigkeitstafel Nr. 7,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:320`), und was an einer Uhr haengt, entsteht auf
 * dem Server — sonst entscheiden Server und Client an der Tagesgrenze verschieden
 * (`Spec:3341-3342`).
 *
 * ⛔ `quelle` UND `quelleWort`, UND DAS IST KEIN BALLAST. Die Insel faerbt ihr Zeichen ueber
 * einen ERSCHOEPFENDEN Switch auf den vier bekannten Werten. Traege die Zeile nur das Wort,
 * koennte die Insel einen fuenften Wert nicht mehr von den vier bekannten unterscheiden — der
 * Rueckfall waere still in diesen Lesepfad gewandert, und der Fall „ein fuenfter, unbekannter
 * Quellwert bekommt KEINEN Ton" (V15) haette sein Pruefobjekt verloren.
 */
export type EreignisZeile = {
  /** Vorformatiert (`_lib/anzeige.ts:75`), in der festgenagelten Zone der Flaeche. */
  zeitText: string;
  /** Aus `FELD_ETIKETTEN`; Rueckfall = roher Feldname, damit die Spalte nie leer bleibt. */
  feldEtikett: string;
  /** Leere Werte bereits als Gedankenstrich. */
  alt: string;
  /** Dieselbe Regel. */
  neu: string;
  /** Aufgeloester Name; Rueckfall = roher `sub`, sonst der Gedankenstrich (siehe unten). */
  werText: string;
  /** Der rohe `sub`, ⛔ NUR fuer das `title`-Attribut — leer, wenn es keinen gibt. */
  werSub: string;
  /** ⛔ DER ROHE WERT — die Insel braucht ihn fuer die Tonzuordnung. */
  quelle: string;
  /** Klartext aus `QUELLE_WOERTER`; Rueckfall = roher Wert. */
  quelleWort: string;
};

/**
 * `sub` → Anzeigename fuer die bekannten `sub`s — 1:1 aus `resolveUserNames`
 * (`radio-admin/server/src/repos/userRepo.ts:28-40`), dieselbe Funktion, die der Alt-Endpunkt
 * fuer die Ereignisse ruft (`radio-admin/server/src/routes/devices.ts:73`).
 *
 * ⛔ DIE LEERE EINGABE FRAEGT DIE DATENBANK NICHT. Der Alt-Kommentar nennt den Grund
 * (`userRepo.ts:25-26`): sonst entstuende das ungueltige `IN ()`. ⚠️ HIER IST DAS KEIN
 * RANDFALL — jede per CSV importierte Historie traegt `changed_by` durchgehend als `null`
 * (`_db/schema.ts:133`, nullable), die leere Eingabe ist also der Normalfall dieser Flaeche.
 *
 * ⚠️ DIESELBEN ZWOELF ZEILEN STEHEN EIN ZWEITES MAL IN `_lib/lesepfade/geraete.ts:538-548`.
 * Das ist bewusst so gelassen: eine gemeinsame Datei waere ein fuenfter Baustein in einer
 * Aufgabe, die vier vorsieht, und die Wiederholung ist mechanisch — beide Fassungen bilden
 * denselben Alt-Rumpf ab und haben keinen eigenen Ermessensspielraum, der auseinanderlaufen
 * koennte.
 */
function nutzernamen(db: DB, subs: string[]): Map<string, string> {
  const karte = new Map<string, string>();
  const eindeutig = [...new Set(subs)];
  if (eindeutig.length === 0) return karte;
  for (const z of db
    .select({ sub: users.sub, name: users.name })
    .from(users)
    .where(inArray(users.sub, eindeutig))
    .all()) {
    karte.set(z.sub, z.name);
  }
  return karte;
}

/** Ein alter oder neuer Feldwert in seiner Anzeigeform — `null` und leer werden zum Strich. */
function wertText(wert: string | null): string {
  return wert === null || wert === "" ? LEER : wert;
}

/**
 * DIE AENDERUNGSHISTORIE EINES GERAETS, NEUESTE ZUERST.
 *
 * ⛔ `desc(changedAt)`, 1:1 aus `getDeviceEvents` (`deviceRepo.ts:253`), und ⛔ `eq(deviceId, …)`
 * aus `:252` — ohne dieses `where` zeigte die Historie eines Geraets die Aenderungen ALLER.
 *
 * ⛔ OHNE BLAETTERUNG (`Spec:4767-4770`). `grenze` ist der Ausweg fuer einen Aufrufer, der
 * weniger will; die Vorgabe ist `EREIGNIS_GRENZE`, und sie ist die Zahl, die in der Flaeche
 * wirkt.
 *
 * ⛔ SIE PRUEFT NICHT, OB DAS GERAET EXISTIERT. Der Alt-Handler tut das (`devices.ts:68`, 404),
 * aber er ist eine HTTP-Route; hier ist der Aufrufer die Server Component aus V15, die das
 * Geraet ohnehin schon geladen hat. Ein zweiter Rundlauf gegen `devices` waere eine Abfrage
 * ohne Empfaenger.
 */
export function ereignisseFuerGeraet(
  db: DB,
  geraeteId: string,
  grenze: number = EREIGNIS_GRENZE,
): EreignisZeile[] {
  const roh = db
    .select({
      field: deviceEvents.field,
      oldValue: deviceEvents.oldValue,
      newValue: deviceEvents.newValue,
      changedBy: deviceEvents.changedBy,
      changedAt: deviceEvents.changedAt,
      source: deviceEvents.source,
    })
    .from(deviceEvents)
    .where(eq(deviceEvents.deviceId, geraeteId))
    .orderBy(desc(deviceEvents.changedAt))
    .limit(grenze)
    .all();

  // Ein Rundlauf fuer alle Namen, nicht einer je Zeile — dieselbe Form wie der Alt-Handler
  // (`radio-admin/server/src/routes/devices.ts:72-73`).
  const namen = nutzernamen(
    db,
    roh.map((e) => e.changedBy).filter((s): s is string => s !== null),
  );

  return roh.map((e) => ({
    zeitText: datumMitUhrzeit(e.changedAt),
    // Rueckfall = roher Feldname: ein neu erfasstes Feld erzeugt so keine leere Spalte.
    feldEtikett: FELD_ETIKETTEN[e.field] ?? e.field,
    alt: wertText(e.oldValue),
    neu: wertText(e.newValue),
    // Rueckfall = roher `sub`, „so the field is never blank" (`devices.ts:70-71`); ohne jeden
    // Urheber der Gedankenstrich, siehe `LEER` oben.
    werText: e.changedBy === null ? LEER : (namen.get(e.changedBy) ?? e.changedBy),
    werSub: e.changedBy ?? "",
    quelle: e.source,
    quelleWort: QUELLE_WOERTER[e.source] ?? e.source,
  }));
}
