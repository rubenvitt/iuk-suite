import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

/**
 * Das Zielschema von `lagerbuch` — 16 Tabellen, 1:1 aus
 * `lagerbuch/src/db/schema.ts` @ ca04eb1, mit vier benannten Abweichungen
 * (S1–S4, §4.1).
 *
 * KEIN "use client", KEIN Icon-Import (Fallen 6 und 7).
 *
 * ZEIT IST UNIX-SEKUNDEN: jede Zeitspalte traegt `{ mode: "timestamp" }`, NIEMALS
 * `timestamp_ms`. m/qr/_db/schema.ts:19-20 macht es anders, und ein Copy-Paste von
 * dort ist der wahrscheinlichste Weg in den Faktor-1000-Fehler. Er waere
 * PARITAETSGRUEN — beide Arme des Paritaetschecks fuehren dieselbe Umrechnung —,
 * waehrend das ganze Journal um Jahrtausende umdatiert ist (1:1-Pflicht 7).
 * `_db/migrations.test.ts` prueft deshalb den ROHEN Spaltenwert auf zehn Stellen.
 *
 * KEINE ID WIRD BEIM IMPORT NEU VERGEBEN, fuer keine der 16 Tabellen:
 * `artikel.id` steckt als QR auf gedruckten Regaletiketten und existiert dort
 * ausschliesslich als Pixelmuster (das Etikett traegt keinen abtippbaren
 * Identifikator), `soll_positionen.id` steht in historischen checks.ergebnis-JSONs,
 * `tokens.id` im jose-Cookie jeder laufenden Helfer-Sitzung, und `buchungen.id` ist
 * der Tiebreaker jeder deterministischen Sortierung.
 */

/** nanoid() mit den Vorgabewerten: 21 Zeichen, 64er-Alphabet inkl. `-` und `_`,
 *  case-sensitiv. 1:1 aus `lagerbuch/src/db/schema.ts:4`. Es gibt bewusst KEINEN
 *  Validator der Form /^[a-z0-9]+$/ — er gaebe fuer rund jeden 32. Zeichenplatz ein
 *  stilles 404. Der Kollisionsschutz ist der Primaerschluessel selbst. */
export const newId = () => nanoid();

export const lagerorte = sqliteTable("lagerorte", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  typ: text("typ", { enum: ["lager", "fahrzeug"] }).notNull(),
  kennung: text("kennung"),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Optionale Vorlage, an der ein Fahrzeug haengt. null = individuell gepackt.
  // DER FREMDSCHLUESSEL ZEIGT „RUECKWAERTS" — lagerorte ist die aeltere und
  // zentralere Tabelle. Kein Fehler, aber er bestimmt die Einfuegereihenfolge des
  // Imports (§4.14): fahrzeug_templates VOR lagerorte.
  templateId: text("template_id").references(() => fahrzeugTemplates.id),
});

export const fahrzeugTemplates = sqliteTable("fahrzeug_templates", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const templatePositionen = sqliteTable(
  "template_positionen",
  {
    id: text("id").primaryKey(),
    templateId: text("template_id").notNull().references(() => fahrzeugTemplates.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    // DIESER FK IST DER, DEN DER LOESCHPFAD HEUTE UEBERSIEHT: `pruefeArtikel`
    // zaehlt buchungen, chargen und soll_positionen — nicht template_positionen.
    // Ein Artikel, der nur in einer Vorlage steht, meldet loeschbar: true, und
    // db.delete(artikel) wirft FOREIGN KEY constraint failed (§5.21, Teil 3).
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
  },
  (t) => [index("idx_template_pos_template").on(t.templateId)],
);

export const artikel = sqliteTable("artikel", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  einheit: text("einheit").notNull(),   // freier String ("Stk.", "Pkg.") — KEIN Enum
  fach: text("fach").notNull(),
  mindestbestand: integer("mindestbestand").notNull().default(0),
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // UNIX-Sekunden. WIRD BEI JEDEM ZUGANG GENULLT (buchung.ts:42) — der vorherige
  // Wert ist danach unwiederbringlich weg und NICHT rekonstruierbar (§5.5).
  bestelltAt: integer("bestellt_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const chargen = sqliteTable(
  "chargen",
  {
    id: text("id").primaryKey(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    chargenNr: text("chargen_nr").notNull(),
    // "YYYY-MM", Ablauf = LETZTER TAG des Monats. "2099-12" ist der Sentinel fuer
    // „kein Verfall" (_lib/konstanten.ts). Auf NULL umgestellt kippen Ampel,
    // Verfall-Liste und FEFO-Sortierung fuer jede so angelegte Charge.
    verfall: text("verfall").notNull(),
    // Tiebreaker fuer „juengste Charge" UND Zweitsortierung der FEFO-Reihenfolge.
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  // KEIN uniqueIndex auf (artikel_id, chargen_nr, verfall) — siehe Kopfkommentar
  // des Tasks. Der Schaden ist eng (gleicher Verfall ⇒ gleiche Ampel, gleiche
  // FEFO-Prioritaet), und die unbestimmte Reihenfolge loest §5.3.1 ohne Migration.
  (t) => [index("idx_chargen_artikel_verfall").on(t.artikelId, t.verfall)],
);

/**
 * CHARGEN TRAEGT KEINE MENGE. Der Rest einer Charge ist SUM(buchungen.menge) je
 * charge_id, LAGERORT-GESCOPED. Die Scoping-Zeile ist kritisch: ohne sie zaehlte
 * nach der ersten Fahrzeugbuchung derselben Charge der Fahrzeugbestand als
 * Handlager-Rest mit → Phantombestand und falsche FEFO-Verteilung. Wer die
 * N+1-Schleife durch EINE GROUP-BY-Abfrage ersetzt (Entscheidung 7 b, §5.2.4),
 * muss `lagerort_id` im Praedikat behalten.
 */

export const sollPositionen = sqliteTable(
  "soll_positionen",
  {
    // Steht in historischen checks.ergebnis-JSONs (check.ts:102) — nicht neu vergeben.
    id: text("id").primaryKey(),
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    fachLabel: text("fach_label").notNull(),
    sort: integer("sort").notNull().default(0),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    soll: integer("soll").notNull(),
    // null = manuell/individuell; gesetzt = aus der Vorlage materialisiert.
    templatePositionId: text("template_position_id").references(() => templatePositionen.id),
    // Manuell abweichend ⇒ der Sync laesst die Zeile in Ruhe.
    ueberschrieben: integer("ueberschrieben", { mode: "boolean" }).notNull().default(false),
    // GRABSTEIN: zaehlt nirgends als Soll, verhindert aber, dass der Sync die
    // Vorlagen-Position wieder anlegt. Wer `entfernt` als „soft delete"
    // missversteht und die Zeilen wegfiltert BEVOR der Sync laeuft, legt sie beim
    // naechsten Sync wieder an (§5.7).
    entfernt: integer("entfernt", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("idx_soll_fahrzeug").on(t.fahrzeugId)],
);

export const geraete = sqliteTable(
  "geraete",
  {
    id: text("id").primaryKey(),
    typ: text("typ", { enum: ["medizin", "objekt"] }).notNull(),
    // BYTE-EXAKT, ohne Bereinigung. Die Werte stehen physisch am Geraet, oft
    // herstellergedruckt (EAN_13, EAN_8, ITF) — sie werden nicht normalisiert,
    // nicht getrimmt, nicht grossgeschrieben. nullable + unique: SQLite erlaubt
    // mehrere NULL im UNIQUE.
    // ⚠️ Die Eindeutigkeit UEBER geraete und bz_geraete hinweg lebt ausschliesslich
    // in einer Anwendungspruefung (`pruefeBarcodeFrei`), nicht im Schema.
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    // DIE EINZIGE ZUORDNUNG — kein Soll-/Vorlagen-Apparat wie bei Artikeln.
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    anmerkung: text("anmerkung"),
    mtkFaellig: text("mtk_faellig"),        // "YYYY-MM-DD", nur typ='medizin'
    beschreibung: text("beschreibung"),     // nur typ='objekt'
    ablaufdatum: text("ablaufdatum"),       // "YYYY-MM-DD", nur typ='objekt'
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_geraete_lagerort").on(t.lagerortId)],
);

export const buchungen = sqliteTable(
  "buchungen",
  {
    // Zeitlich bedeutungslos, aber DETERMINISTISCH — der Tiebreaker, der aus der
    // Sekundengranularitaet eine totale Ordnung macht (§4.9, §5.14.4).
    id: text("id").primaryKey(),
    // UNIX-Sekunden. SEKUNDENGRANULARITAET IST HIER FACHLICH SICHTBAR: ein
    // Check-Abschluss schreibt Abgleich, Umlagerung und Messungen in einem Rutsch,
    // alle Zeilen teilen dieselbe Sekunde (Falle 3).
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    // `umlagerung` IST TRAGEND und fehlt im Implementierungsplan. Beide Legs einer
    // Verschiebung tragen ihn, damit Bestellvorschlag und Reporting eine interne
    // Verschiebung nicht als Wareneingang oder Verbrauch missdeuten. Ein
    // Enum-Entwurf „nach Plan" verliert ihn — und mit ihm die Netto-Null-
    // Eigenschaft jeder Umlagerung (1:1-Pflicht 15).
    typ: text("typ", { enum: ["zugang", "entnahme", "korrektur", "umlagerung"] }).notNull(),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    // NOT NULL — jede Buchung hat eine Charge, notfalls eine Dummy-Charge.
    chargeId: text("charge_id").notNull().references(() => chargen.id),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    menge: integer("menge").notNull(),   // VORZEICHENBEHAFTET: Zugang +, Entnahme −
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    // bei token der CODE-KLARTEXT "NNN-NNN", bei oidc der Pocket-ID-`sub`.
    // Ein umkodierter Token-Code macht das gesamte historische Journal namenlos.
    quelleId: text("quelle_id").notNull(),
    // DIE EINZIGE VERBINDUNG zwischen Journalzeile und ausloesendem Vorgang — es
    // gibt KEINEN Fremdschluessel auf `checks`. Die drei Praefixe `check:<id>`,
    // `inventur:<id>`, `entnahme-ziel:<lagerortId>` stehen in historischen Zeilen
    // und sind damit Vertrag (1:1-Pflicht 12).
    referenz: text("referenz"),
    // Das Suchfeld des Journals durchsucht ihn per SQL-LIKE ueber `lb_falte` (§5.13.2).
    kommentar: text("kommentar"),
  },
  (t) => [
    index("idx_buchungen_artikel").on(t.artikelId),
    index("idx_buchungen_charge").on(t.chargeId),
    // Praefix-redundant zu idx_buchungen_ts_id und BLEIBT TROTZDEM STEHEN: die Regel
    // „kein Index wird entfernt" (§4.14) ist die Bedingung dafuer, dass der
    // Schema-Diff aus §4.3 einen abschliessenden Erwartungswert hat.
    index("idx_buchungen_ts").on(t.ts),
    // S3, neu: deterministische Journalsortierung ORDER BY ts DESC, id DESC. Macht
    // ein spaeteres Keyset-Nachladen zur Query-Aenderung statt zur Migration.
    index("idx_buchungen_ts_id").on(t.ts, t.id),
    // S3, neu: traegt bestandJeArtikel(db, lagerortId) und restJeCharge (§5.2.4) —
    // ein Lagerort, alle Artikel. Ohne ihn ist das ein Full-Scan.
    index("idx_buchungen_lagerort_artikel").on(t.lagerortId, t.artikelId),
    // S3, neu: deckend fuer restJeChargeFuerArtikel(db, artikelId, lagerortId) —
    // die Schreibseite (FEFO, Korrektur), die mit artikel_id FUEHREND filtert.
    // ⚠️ NICHT redundant zum vorigen: sie unterscheiden sich in der fuehrenden
    // Spalte, und genau daran entscheidet SQLite, ob ein Index fuer eine
    // WHERE-Klausel taugt.
    index("idx_buchungen_artikel_lagerort_charge").on(t.artikelId, t.lagerortId, t.chargeId),
  ],
);

export const checks = sqliteTable(
  "checks",
  {
    id: text("id").primaryKey(),   // steckt als `check:<id>` in buchungen.referenz
    fahrzeugId: text("fahrzeug_id").notNull().references(() => lagerorte.id),
    // S1: bekommt den Drizzle-Enum. Wirkung auf die Datenbank: KEINE —
    // SQLite-`text({enum})` erzeugt keinen CHECK.
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    startedAt: integer("started_at", { mode: "timestamp" }).notNull(),
    // NULL = offener Check. Heute nie erzeugt (check.ts schreibt startedAt und
    // completedAt in EINEM Insert), aber das Schema sieht die Bauform ausdruecklich
    // vor — GENAU DESHALB bekommt `checks` keinen UPDATE-Trigger (§4.4).
    completedAt: integer("completed_at", { mode: "timestamp" }),
    // JSON-String, ZWEI INKOMPATIBLE FORMATE, beide bleiben lesbar (§4.10):
    //   V1 = Array je Element { fehlt?, gebucht? }, erkannt an Array.isArray
    //   V2 = Objekt { positionen, artikel, geraete, flaschen, verfall }
    // Feldnamen im V2-Format sind NICHT umbenennbar — sonst wird jede historische
    // Auswertung stumm 0.
    ergebnis: text("ergebnis"),
  },
  // S3, neu: checkHistorie filtert nach fahrzeug_id und sortiert nach completed_at.
  // `checks` hat heute KEINEN EINZIGEN Index ausser dem Primaerschluessel.
  (t) => [index("idx_checks_fahrzeug_completed").on(t.fahrzeugId, t.completedAt)],
);

/**
 * Die Kompensation, die man beim Aufraeumen zerstoert (§4.11).
 *
 * Bei diff > 0 waehlt `korrekturAufLagerort` die JUENGSTE Charge des Artikels OHNE
 * JEDEN LAGERORTBEZUG und legt notfalls eine Dummy-Charge "Korrektur"/"2099-12" an.
 * Der Fahrzeug-Check bucht Fahrzeugbestand also auf eine Charge, die nie im Fahrzeug
 * lag. Fuer die Frage „wann laeuft das Zeug im Fahrzeug ab?" zaehlt nur, was auf der
 * Packung steht — und das steht HIER.
 *
 * ⚠️ WER DAS VERFALL-FELD IM ZAEHL-SCHRITT BEIM ANTD-NEUBAU ALS REDUNDANT STREICHT
 * („die Charge hat doch einen Verfall"), ZERSTOERT DIESE KOMPENSATION LAUTLOS. Die
 * Fahrzeug-Verfallsampel haengt danach an einer geratenen Charge, und kein Gate wird
 * rot (Falle 9).
 *
 * KEIN Trigger: die Tabelle ist Ist-Zustand, kein Nachweis. Der Upsert ueberschreibt,
 * ein leerer Wert LOESCHT die Zeile.
 */
export const lagerortVerfall = sqliteTable(
  "lagerort_verfall",
  {
    id: text("id").primaryKey(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    artikelId: text("artikel_id").notNull().references(() => artikel.id),
    verfall: text("verfall").notNull(),   // "YYYY-MM", streng ueber MONAT_REGEX
    erfasstAt: integer("erfasst_at", { mode: "timestamp" }).notNull(),
    quelleTyp: text("quelle_typ", { enum: ["token", "oidc", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
  },
  (t) => [uniqueIndex("idx_lagerort_verfall_ort_artikel").on(t.lagerortId, t.artikelId)],
);

export const bzGeraete = sqliteTable(
  "bz_geraete",
  {
    id: text("id").primaryKey(),
    // byte-exakt; kreuz-eindeutig mit geraete.barcode NUR per Anwendungspruefung.
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    streifenLot: text("streifen_lot"),
    level1Label: text("level1_label"),
    level1Min: integer("level1_min"),     // Referenzbereich, bar-frei (reine Zahl)
    level1Max: integer("level1_max"),
    level2Label: text("level2_label"),
    level2Min: integer("level2_min"),
    level2Max: integer("level2_max"),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_bz_geraete_lagerort").on(t.lagerortId)],
);

/**
 * MIT TRIGGERN (S2, in 0002_bz_kontrollen_append_only.sql).
 *
 * Entscheidung 5 faellt auf (c): Trigger auf bz_kontrollen, NICHT auf o2_messungen.
 * Die Tabelle ist ein Medizinprodukte-Nachweis; die Append-only-Zusage steht heute
 * nur als Kommentar. Geprueft, dass nichts bricht: im gesamten Alt-Repo gibt es
 * null Treffer fuer delete(bzKontrollen)/update(bzKontrollen), und der Hard-Delete
 * eines BZ-Geraets ist bereits gesperrt, sobald eine Kontrolle existiert.
 */
export const bzKontrollen = sqliteTable(
  "bz_kontrollen",
  {
    id: text("id").primaryKey(),
    geraetId: text("geraet_id").notNull().references(() => bzGeraete.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    level1Wert: integer("level1_wert"),
    level1ImBereich: integer("level1_im_bereich", { mode: "boolean" }),
    level2Wert: integer("level2_wert"),
    level2ImBereich: integer("level2_im_bereich", { mode: "boolean" }),
    kompresseVerfall: text("kompresse_verfall"),   // "YYYY-MM"
    sticks: integer("sticks").notNull().default(0),
    lanzetten: integer("lanzetten").notNull().default(0),
    batterieGewechselt: integer("batterie_gewechselt", { mode: "boolean" }).notNull().default(false),
    kommentar: text("kommentar"),
    bestanden: integer("bestanden", { mode: "boolean" }).notNull(),
    // ROHER JSON-STRING — NICHT RE-SERIALISIEREN. Er entsteht als JSON.stringify
    // ueber sieben Schluessel in DIESER Reihenfolge: streifenLot, level1Label,
    // level1Min, level1Max, level2Label, level2Min, level2Max. Ein Import, der ihn
    // parst und neu serialisiert, VERAENDERT EINEN NACHWEIS — Schluesselreihenfolge
    // und Zahlenformat sind nicht garantiert stabil. Der Wert wandert byte-fuer-byte.
    // Der Paritaetscheck faengt das nur, wenn er den Rohwert vergleicht.
    // ⚠️ Nachgeprueft: die Spalte wird heute GESCHRIEBEN und NIRGENDS GELESEN;
    // §5.11 macht sie sichtbar, statt sie zu streichen.
    refSnapshot: text("ref_snapshot"),
  },
  (t) => [index("idx_bz_kontrollen_geraet_ts").on(t.geraetId, t.ts)],
);

export const o2Flaschen = sqliteTable(
  "o2_flaschen",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    lagerortId: text("lagerort_id").notNull().references(() => lagerorte.id),
    groesseLiter: integer("groesse_liter"),
    // bar; Bezugsgroesse der Fuellstandsampel. Wandert zusaetzlich als Snapshot ins
    // Check-Ergebnis, damit der Fuellstand rekonstruierbar bleibt, wenn die Flasche
    // umkonfiguriert oder geloescht wird. Fehlt der Snapshot in einem Altcheck, wird
    // der Wert NICHT geraten (§5.12 ersetzt den heutigen ?? 200-Rueckfall).
    nennfuelldruckBar: integer("nennfuelldruck_bar").notNull().default(200),
    aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [index("idx_o2_flaschen_lagerort").on(t.lagerortId)],
);

/**
 * OHNE TRIGGER — und das ist entschieden, nicht vergessen (Entscheidung 5 c).
 *
 * Der Sauerstoff-Schritt des Fahrzeug-Checks ist auf den Nennfuelldruck VORBELEGT,
 * und beim Abschluss werden ausnahmslos ALLE Flaschen des Standorts gesendet. Wer
 * den Schritt durchklickt, erzeugt einen positiv aussehenden, fachlich wertlosen
 * Messwert. Eine solche Zeile faellt in keinen der zwei Zweige aus §5.12 („auffaellig"
 * / „nicht bewertbar"): sie sieht plausibel aus und zaehlt als bewertet. Der Entwurf
 * erzeugt also selbst den Bedarf an Loeschbarkeit, den ein Trigger hier wegnaehme.
 *
 * `_db/append-only.test.ts` behauptet die Gegenprobe ausdruecklich — ohne sie ist
 * der Unterschied zwischen „bewusst offen gelassen" und „vergessen" nicht lesbar.
 */
export const o2Messungen = sqliteTable(
  "o2_messungen",
  {
    id: text("id").primaryKey(),
    flascheId: text("flasche_id").notNull().references(() => o2Flaschen.id),
    ts: integer("ts", { mode: "timestamp" }).notNull(),
    druckBar: integer("druck_bar").notNull(),
    quelleTyp: text("quelle_typ", { enum: ["oidc", "token", "system"] }).notNull(),
    quelleId: text("quelle_id").notNull(),
    kommentar: text("kommentar"),
  },
  (t) => [index("idx_o2_messungen_flasche_ts").on(t.flascheId, t.ts)],
);

export const tokens = sqliteTable("tokens", {
  // Steckt im jose-Cookie JEDER laufenden Helfer-Sitzung — nicht neu vergeben.
  id: text("id").primaryKey(),
  // "NNN-NNN", sechs Ziffern MIT Bindestrich. Der Bindestrich ist Teil des
  // gespeicherten Werts, nicht der Anzeige; die Suche ist exakt. Der Code ist
  // zugleich QR-Nutzlast, Gate-Eingabe UND Anzeigeschluessel im Journal — er darf
  // beim Import unter keinen Umstaenden umkodiert oder normalisiert werden.
  code: text("code").notNull().unique(),
  // Der Anzeigename im Journal — der Code allein sagt niemandem etwas.
  label: text("label").notNull(),
  /**
   * TOTE SPALTE, 1:1 ERHALTEN. Belegt: createToken schreibt sie nicht, redeemToken
   * liest sie nicht, einziger Leser im ganzen src/ ist ein Loeschzaehler, der
   * dauerhaft auf 0 steht. Ein nicht zurueckgebauter Planrest.
   *
   * SIE WIRD TROTZDEM NICHT GESTRICHEN: „kein Produktionspfad schreibt sie" ist eine
   * CODE-Aussage, und die produktive Tabelle steht nicht im Repo. Eine weggelassene
   * Spalte macht einen vorhandenen Wert unwiederbringlich, und der Import hat keinen
   * zweiten Versuch. Der Loeschzaehler wechselt stattdessen auf `ziel_id` (§5.21).
   */
  scopeLagerortId: text("scope_lagerort_id").references(() => lagerorte.id),
  zielTyp: text("ziel_typ", { enum: ["fahrzeug", "artikel"] }),
  // BEWUSST POLYMORPH, OHNE FK: je nach zielTyp eine lagerorte.id oder eine artikel.id.
  // ⚠️ Waisenrisiko — ein ziel_id kann auf eine geloeschte Zeile zeigen. Runbook:
  // vor dem Cutover pruefen; Treffer sind laminierte Kaertchen, die ins Leere zeigen.
  zielId: text("ziel_id"),
  /**
   * DER EINZIGE WIDERRUF, DEN ES GIBT — und die schaerfste Import-Zusage dieser
   * Tabelle. Ein Import, der alles als aktiv anlegt, reaktiviert stillschweigend
   * jeden gesperrten Code — und zwar genau die, die gesperrt wurden, weil ein
   * laminiertes Kaertchen verschwunden ist (1:1-Pflicht 5).
   */
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden Kontos. Reines Auditfeld — kein Leser im ganzen Repo.
  createdBy: text("created_by").notNull(),
  // NULL = „nie eingeloest". Reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und
  // (nach Entscheidung 8-F) auch ohne Einfluss auf Loeschbarkeit. Wandert vollstaendig mit.
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});

/**
 * Reine Nachschlagetabelle fuer die ANZEIGE. `quelleAufloeser` laedt sie einmal je
 * Request und loest oidc → users.name, sonst email, sonst die ROHE ID auf.
 *
 * ⚠️ `select count(*) from users` ist KEINE Personenzahl — das gilt vor wie nach der
 * Bereinigung und gehoert in jede Oberflaeche, die die Zahl anzeigen will. Bis
 * f2b515b (29.07.2026) schrieb die Alt-App hier den Auth.js-`user.id`, also eine
 * ZUFALLS-UUID PRO ANMELDUNG; der Freeze liegt fuenf Tage spaeter. Fast jede Zeile
 * des Altbestands ist deshalb auf eine Waise geschluesselt. DAS JOURNAL IST HEIL —
 * dort stand immer der echte `sub`; verseucht ist ausschliesslich diese Tabelle.
 *
 * Es gibt KEINE Zuordnungstabelle alt_sub → neu_sub und es wird keine geben (§4.13):
 * die Kennung wird nirgends gefiltert, gruppiert oder aggregiert, nur angezeigt —
 * beide Kennungsraeume duerfen als Primaerschluessel DERSELBEN Tabelle koexistieren.
 * Gemessen ist ohnehin, dass die Pocket-ID-Instanz `subject_types_supported:
 * ["public"]` fuehrt, der `sub` also ueber beide OIDC-Clients identisch ist.
 *
 * KEIN UNIQUE auf `email` — er wuerde den zweiten Login zum Fehler machen.
 */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),   // der OIDC-`sub`
  name: text("name"),
  email: text("email"),
  lastLoginAt: integer("last_login_at", { mode: "timestamp" }),
});
