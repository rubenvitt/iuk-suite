import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/*
 * Das Schema des Moduls `aufgaben` — sechs Tabellen (Spec §6).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEITPUNKTE SIND UNIX-SEKUNDEN: jede Zeitspalte traegt `{ mode: "timestamp" }`,
 * NIEMALS `timestamp_ms`. `m/qr/_db/schema.ts` macht es anders, und ein
 * Copy-Paste von dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler.
 *
 * KALENDERTAGE SIND TEXT (`YYYY-MM-DD`), keine Zeitstempel. Eine Frist, ein
 * Plantag und eine Dienstzeit sind TAGE, keine Zeitpunkte: als Zeitstempel
 * haengt ihre Bedeutung an der Zeitzone des Lesers, und „faellig am 13." wuerde
 * fuer manche am 12. abends beginnen. ISO-Strings sind ausserdem lexikografisch
 * vergleichbar, weshalb `faellig_am < heute` ohne Datums-Parsen funktioniert.
 *
 * UHRZEITEN SIND TEXT (`HH:MM`). Sie gehoeren zu einem Tag, der schon in einer
 * eigenen Spalte steht; als Zeitstempel waere die Information doppelt und
 * koennte auseinanderlaufen.
 */

export const newId = () => nanoid();

/**
 * DIE ZWEI ROLLEN DER MODULTABELLE (Spec §4 mit Nachtrag 2026-08-15). Werte ohne Umlaute — sie
 * stehen in der Datenbank.
 *
 * DIE KOORDINATION STEHT NICHT MEHR DARUNTER: sie kommt seit dem Quellenwechsel aus der
 * Auth-Gruppe (`canAdminModule("aufgaben")`, aufgeloest in `_lib/zugang.ts`s `akteurFuer`), nicht
 * aus dieser Spalte — zwei Register fuer dieselbe Frage liefen auseinander, und auf einer frischen
 * Datenbank durfte niemand die erste Person anlegen. Migration `0002` schreibt die bestehenden
 * `koordination`-Zeilen auf `auftrag` um.
 *
 * WARUM DIE UMGESCHRIEBENEN ZEILEN `auftrag` BEKOMMEN UND NICHT `bufdi`: `verteilDaten`
 * (`_db/queries.ts`) speist die Verteillisten aus `bufdis()`, AUSDRUECKLICH damit die Koordination
 * nicht in ihrer eigenen Zielliste steht (Betreiberentscheidung 2026-08-13, s. `darfFreigeben`s
 * Kopfkommentar). Eine automatisch entstandene Koordinationszeile mit `rolle: "bufdi"` — aus der
 * Migration oder aus der JIT-Anlage in `_lib/zugang.ts` — setzte die Koordination STILL in ihre
 * eigene Zielliste. Das ist kein Riegel, sondern eine Datenform-Zusage: die Koordination KANN einer
 * gruppentragenden Person ueber `/personen` sehr wohl eine `bufdi`-Zeile geben. Der eigentliche
 * Riegel des Vier-Augen-Prinzips steht in `darfFreigeben` (nie die selbst zugewiesene Aufgabe),
 * `bufdis()` ist die zweite Linie. `auftrag` ist zudem fachlich richtig und nicht bloss der Rest:
 * die Koordination stellt Aufgaben fuer andere ein, und `darfEinstellenFuerAndere` erlaubt
 * `auftrag` ohnehin.
 */
export const ROLLEN = ["auftrag", "bufdi"] as const;

/**
 * Die sechs Zustaende (Spec §5). Der siebte („Zeitvorschlag offen") wird
 * ABGELEITET und steht bewusst nicht hier — er wuerde jeden Filter und jede
 * Zaehlung um einen Fall erweitern, ohne mehr auszusagen.
 */
export const STATUS_WERTE = [
  "eingegangen",
  "verteilt",
  "in_arbeit",
  "freigabe_offen",
  "abgeschlossen",
  "zurueckgewiesen",
] as const;

export const PRIORITAETEN = ["hoch", "mittel", "niedrig"] as const;
export const NACHWEIS_ARTEN = ["text", "bild"] as const;

/**
 * DAS VOKABULAR DES VERLAUFS (Aufgabe 4 hatte es im Seed etabliert, ohne dass ein Typ es hielt —
 * `_lib/seedLokal.ts` schrieb `eingestellt`, `verteilt`, `eingeplant`, `gestartet`,
 * `fertig_gemeldet`, `zurueckgewiesen`, `abgeschlossen` frei Hand). Diese zehn Werte sind genau
 * die, die die Uebergangstabelle (Spec §5.2, `_lib/lebenszyklus.ts`) erzeugt: `einstellen` →
 * `eingestellt`; `verteilen` → `verteilt`; `umverteilen` → `umverteilt`; `einplanen` →
 * `eingeplant`; `starten` → `gestartet`; `zuruecksetzen` → `zurueckgesetzt`; `fertig`
 * (Fremdaufgabe) → `fertig_gemeldet`; `fertig` (Selbstaufgabe) ODER `freigeben` → `abgeschlossen`
 * (derselbe Endzustand, zwei Wege dorthin); `zurueckweisen` → `zurueckgewiesen`; `wiederaufnehmen`
 * → `wiederaufgenommen`. `zurueckziehen` erzeugt KEIN Ereignis — es loescht die Aufgabe samt
 * Verlauf, es bleibt also keine Zeile, die eines tragen koennte.
 *
 * Der Seed-Wortschatz ist eine ECHTE TEILMENGE dieser zehn Werte — kein Widerspruch, keine
 * Nacharbeit an `seedLokal.ts` noetig.
 *
 * DIE SPALTE `verlauf.ereignis` BLEIBT `text` OHNE `enum` — das ist bewusst und braucht keine
 * Migration: der Verlauf soll spaeter Ereignisse aufnehmen koennen, die HEUTE noch nicht
 * feststehen (eine Vertretungsfreigabe schreibt eine eigene Zeile, Spec §6). `Ereignis` ist die
 * Zusage NACH INNEN — an `schreibeVerlauf` (`_db/queries.ts`) und jeden Aufrufer dort —, keine
 * Beschraenkung IN der Datenbank.
 */
export const EREIGNISSE = [
  "eingestellt",
  "verteilt",
  "umverteilt",
  "eingeplant",
  "gestartet",
  "zurueckgesetzt",
  "fertig_gemeldet",
  "abgeschlossen",
  "zurueckgewiesen",
  "wiederaufgenommen",
] as const;

/**
 * Der Scan-Zustand einer Nachweisdatei. `sauber` ist der EINZIGE Wert, der
 * ausliefert — dieselbe Linie wie `istFreigegeben` im Modul `files`, und
 * `offen` gibt ausdruecklich nicht frei.
 */
export const SCAN_STATUS = ["offen", "sauber", "befund", "fehler"] as const;

export const personen = sqliteTable(
  "personen",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    /**
     * Der Pocket-ID-`sub` — also `session.user.id` (`core/auth/config.ts`
     * setzt `session.user.id = token.sub`). Unter dem Dev-Login ist das
     * `dev:<email>`, und genau darueber wechselt man lokal die Rolle: eine
     * andere Anmeldeadresse ist eine andere Person. Ein Demo-Umschalter waere
     * eine zweite Strecke neben dieser und haette den Echtbetrieb erreichen
     * koennen.
     */
    sub: text("sub").notNull(),
    name: text("name").notNull(),
    initialen: text("initialen").notNull(),
    rolle: text("rolle", { enum: ROLLEN }).notNull(),
    /** 468 = 7,8 Std. — die Vorgabe fuer einen BuFDi mit 39-Stunden-Woche. */
    sollMinutenTag: integer("soll_minuten_tag").notNull().default(468),
    aktivVon: text("aktiv_von").notNull(),
    /**
     * EINSCHLIESSENDES Ende, oder null fuer „unbefristet". Am Enddatum selbst
     * ist die Person noch aktiv — sonst kann jemand an seinem letzten
     * Diensttag nichts mehr abgeben.
     *
     * DIESE SPALTE IST DER GRUND, WARUM DER JAHRESWECHSEL KEINE LOESCHAKTION
     * IST: eine ausgeschiedene Person verschwindet aus Verteillisten und
     * Plan-Navigation, ihre Aufgaben, Nachweise und Verlaufszeilen bleiben
     * lesbar. Und die Dokumentation des vergangenen Jahres ist genau das, was
     * das Modul herstellen soll.
     */
    aktivBis: text("aktiv_bis"),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("personen_sub_idx").on(t.sub)],
);

export const aufgaben = sqliteTable(
  "aufgaben",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    titel: text("titel").notNull(),
    beschreibung: text("beschreibung").notNull(),
    prioritaet: text("prioritaet", { enum: PRIORITAETEN }).notNull(),
    erstellerId: text("ersteller_id")
      .notNull()
      .references(() => personen.id),
    zugewiesenAn: text("zugewiesen_an").references(() => personen.id),
    status: text("status", { enum: STATUS_WERTE }).notNull(),
    faelligAm: text("faellig_am").notNull(),
    faelligUhrzeit: text("faellig_uhrzeit"),
    dauerMinuten: integer("dauer_minuten").notNull(),
    nachweisPflicht: integer("nachweis_pflicht", { mode: "boolean" }).notNull().default(false),
    nachweisArt: text("nachweis_art", { enum: NACHWEIS_ARTEN }).notNull().default("text"),
    /** Null genau dann, wenn `istSelbst` — eine Selbstaufgabe hat keinen Pruefer. */
    prueferId: text("pruefer_id").references(() => personen.id),
    /**
     * Fachlich folgt das aus `ersteller_id = zugewiesen_an`, wird aber
     * GESPEICHERT: eine spaetere Umverteilung wuerde den Charakter der Aufgabe
     * sonst still aendern — aus einer freigabefreien Selbstaufgabe wuerde
     * rueckwirkend eine freigabepflichtige Fremdaufgabe.
     */
    istSelbst: integer("ist_selbst", { mode: "boolean" }).notNull().default(false),
    /** Gesetzt = der BuFDi hat sie in einen Tag gelegt. */
    planDatum: text("plan_datum"),
    planUhrzeit: text("plan_uhrzeit"),
    /** Reihenfolge innerhalb des Tages. Ohne `plan_datum` bedeutungslos. */
    planRang: integer("plan_rang").notNull().default(0),
    /**
     * Der Zeitvorschlag der Koordination (Spec §5.1). Er BLEIBT stehen, wenn der
     * BuFDi einplant — der Verlauf soll belegen koennen, ob angenommen oder
     * abgewichen wurde. Deshalb ist „Vorschlag offen" eine Ableitung ueber
     * `plan_datum IS NULL` und kein Status.
     */
    vorschlagDatum: text("vorschlag_datum"),
    vorschlagUhrzeit: text("vorschlag_uhrzeit"),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    aktualisiertAm: integer("aktualisiert_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Die Zeitplan-Abfrage: „was liegt bei dieser Person an diesem Tag".
    index("aufgaben_plan_idx").on(t.zugewiesenAn, t.planDatum),
    // Die Arbeitsvorratslisten (Posteingang, Freigabe-Warteschlange).
    index("aufgaben_status_idx").on(t.status),
    // Die Ueberfaelligkeitsliste.
    index("aufgaben_faellig_idx").on(t.faelligAm),
  ],
);

/**
 * EINE ROUTINE IST KEIN AUFGABENDATENSATZ. Sie ist ein wiederkehrender
 * Zeitblock, der beim Lesen in den Tag eingerechnet wird und Budget belegt —
 * ohne Status, ohne Nachweis, ohne Freigabe. Wer eine Routine dokumentieren
 * will, legt dafuer eine eigene Aufgabe an.
 *
 * Andernfalls entstehen bei fuenf Routinen × drei Personen ueber ein Dienstjahr
 * rund 3.000 Datensaetze, die niemand liest, und jede Liste im Modul braucht
 * einen Filter dagegen.
 */
export const routinen = sqliteTable(
  "routinen",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    personId: text("person_id")
      .notNull()
      .references(() => personen.id),
    titel: text("titel").notNull(),
    /**
     * Bitmaske ueber Mo–Fr: Bit 0 = Montag … Bit 4 = Freitag. Eine Maske statt
     * fuenf Spalten oder einer Nebentabelle, weil die Frage immer „gilt sie an
     * Tag n" lautet und nie „welche Routinen gelten am Montag" — und weil eine
     * Zeichenliste („0,2,4") in SQL nicht pruefbar ist.
     */
    wochentage: integer("wochentage").notNull(),
    uhrzeit: text("uhrzeit"),
    dauerMinuten: integer("dauer_minuten").notNull(),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("routinen_person_idx").on(t.personId)],
);

export const nachweise = sqliteTable(
  "nachweise",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    aufgabeId: text("aufgabe_id")
      .notNull()
      .references(() => aufgaben.id, { onDelete: "cascade" }),
    art: text("art", { enum: NACHWEIS_ARTEN }).notNull(),
    text: text("text"),
    dateiId: text("datei_id").references(() => dateien.id),
    erstelltVon: text("erstellt_von")
      .notNull()
      .references(() => personen.id),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("nachweise_aufgabe_idx").on(t.aufgabeId)],
);

/**
 * KEINE SPALTE `pfad` — Abweichung von Spec §6, ENTSCHIEDEN in Aufgabe 18.
 *
 * Spec §6 listet `pfad` als Spalte von `datei`; hier wird er stattdessen
 * ABGELEITET (`_lib/ablage.ts`, `pfadFuer(id)`), aus genau zwei Gruenden:
 *
 * 1. Der Pfad ist eine reine Funktion von `id` und Ablagewurzel (`DATA_DIR`).
 *    Eine gespeicherte Spalte waere ZUSTAND, der von der Ableitungsregel
 *    auseinanderlaufen kann — zieht die Ablage um (ein anderes `DATA_DIR`),
 *    ist das eine Konfigurationsaenderung, keine Migration ueber jede Zeile.
 * 2. Aendert sich die Ableitungsregel selbst (z. B. ein Unterverzeichnis pro
 *    Aufgabe), stehen alte und neue Regel sonst NEBENEINANDER in derselben
 *    Spalte, und niemand kann einer Zeile ansehen, welche Regel fuer sie galt.
 *
 * `_lib/storage.ts` im Modul `files` ist das Vorbild: auch dort entsteht der
 * Pfad ausschliesslich aus IDs, nie aus einer gespeicherten Spalte — genau
 * damit verschwindet die Traversal-Klasse strukturell statt per Guard.
 */
export const dateien = sqliteTable(
  "dateien",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    aufgabeId: text("aufgabe_id")
      .notNull()
      .references(() => aufgaben.id, { onDelete: "cascade" }),
    dateiname: text("dateiname").notNull(),
    mime: text("mime").notNull(),
    groesse: integer("groesse").notNull(),
    /**
     * `offen` ist die Vorbelegung und gibt NICHT frei. Fail-closed: eine Datei,
     * die noch nicht geprueft ist, wird nicht ausgeliefert. Das ist dieselbe
     * Linie wie `istFreigegeben` im Modul `files`, wo `unscanned` ebenfalls
     * gesperrt bleibt — gerade weil es der Fall ist, den noch niemand geprueft hat.
     */
    scanStatus: text("scan_status", { enum: SCAN_STATUS }).notNull().default("offen"),
    scanGeprueftAm: integer("scan_geprueft_am", { mode: "timestamp" }),
    erstelltAm: integer("erstellt_am", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [
    // Migration 0001 (Aufgabe 18) — nachgeholt aus dem Review von Aufgabe 2:
    // `dateien` hatte, anders als seine Kaskaden-Geschwister `nachweise` und
    // `verlauf`, KEINEN Index auf `aufgabe_id`.
    index("dateien_aufgabe_idx").on(t.aufgabeId),
    // Derselbe Zug: die Warteschlange (`_lib/scan.ts`) braucht einen Index auf
    // `scan_status`, um "alles was offen ist" nicht per Tabellenscan zu finden.
    index("dateien_scan_idx").on(t.scanStatus),
  ],
);

/**
 * DER VERLAUF IST EINE TABELLE, KEIN TEXTFELD. Jeder Uebergang schreibt eine
 * Zeile mit Akteur, Zeitstempel und Ereignis; eine Vertretungsfreigabe schreibt
 * sie als solche. Das IST die Leistungsdokumentation, die der gesamte
 * Freigabemechanismus herstellen soll — ohne sie hat man am Ende des
 * Dienstjahres sechs Haekchen und keine Geschichte.
 */
export const verlauf = sqliteTable(
  "verlauf",
  {
    id: text("id").primaryKey().$defaultFn(newId),
    aufgabeId: text("aufgabe_id")
      .notNull()
      .references(() => aufgaben.id, { onDelete: "cascade" }),
    ereignis: text("ereignis").notNull(),
    akteurId: text("akteur_id")
      .notNull()
      .references(() => personen.id),
    notiz: text("notiz"),
    ts: integer("ts", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [index("verlauf_aufgabe_idx").on(t.aufgabeId, t.ts)],
);

export type PersonRow = typeof personen.$inferSelect;
export type AufgabeRow = typeof aufgaben.$inferSelect;
export type RoutineRow = typeof routinen.$inferSelect;
export type NachweisRow = typeof nachweise.$inferSelect;
export type DateiRow = typeof dateien.$inferSelect;
export type VerlaufRow = typeof verlauf.$inferSelect;

export type Rolle = (typeof ROLLEN)[number];
export type Status = (typeof STATUS_WERTE)[number];
export type Prioritaet = (typeof PRIORITAETEN)[number];
export type NachweisArt = (typeof NACHWEIS_ARTEN)[number];
export type ScanStatus = (typeof SCAN_STATUS)[number];
export type Ereignis = (typeof EREIGNISSE)[number];
