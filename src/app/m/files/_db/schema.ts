import { sql } from "drizzle-orm";
import { sqliteTable, text, integer, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";

/*
 * Zeitstempel: Unix-SEKUNDEN, `mode: "timestamp"` — NIE `timestamp_ms`.
 * Die 1:1-pflichtigen Fileshare-Tabellen von easy-filesharing führen rohe
 * Sekunden (`Math.floor(Date.now()/1000)` an jeder Schreibstelle); `timestamp`
 * schreibt und liest genau diese Sekunden. `qr/_db/schema.ts:19-20` benutzt
 * `timestamp_ms`, und ein Copy-Paste von dort ist der wahrscheinlichste Weg in
 * den Faktor-1000-Fehler. Dessen Symptom ist brutal UND paritätsgrün: entweder
 * läuft nie ein Share ab und das Aufräumen löscht nichts, oder alles ist sofort
 * abgelaufen. `migrations.test.ts` liest deshalb den ROHEN Spaltenwert.
 */

/**
 * Der Wertebereich der AV-Statusspalten — bewusst mit ALLEN FÜNF Werten im
 * CHECK. `unscanned` fehlt in einem naiven Enum und ist genau der Wert, mit dem
 * der Altbestand beim Import einläuft; ein CHECK ohne ihn bricht den Import
 * (Analyse E18). Der TypeScript-seitige Wertebereich und `istFreigegeben()`
 * leben in `_lib/av.ts` (§4.6) — hier steht nur die Datenbankschranke.
 */
const AV_STATUS_SQL = sql.raw("('scanning','clean','infected','error','unscanned')");

/*
 * ERBE FÜR SPEC 2 (Import) — GESTRICHENE UND UMBENANNTE SPALTEN.
 * Was hier steht, ist im Schema unten NICHT mehr sichtbar; ohne diesen Block
 * sieht der Import keinen Hinweis darauf, dass es die Spalten je gab.
 *
 * Gestrichen: `shares.limit_reached_at`, `shares.s3_prefix`, `share_files.s3_key`.
 *   - `limit_reached_at`: der Zugriffszustand ist aus download_count/max_downloads
 *     ableitbar, und die Spalte war der Träger eines belegten Defekts (das
 *     ANHEBEN eines Limits hinterließ einen gesetzten Wert → 24 h später 410 auf
 *     drei Auslieferungsrouten, und der Aufräumjob löschte den Share).
 *   - `s3_prefix`/`s3_key`: der Pfad entsteht ausschließlich in `_lib/storage.ts`
 *     aus shareId und fileId. `s3_key` wird QUELLSEITIG gelesen, um das
 *     MinIO-Objekt zu finden, und NICHT ins Ziel geschrieben.
 * Umbenannt: `download_logs.ip` → `client_ip_unbestaetigt` (und gekürzt geschrieben).
 * Neu und nullable: `share_files.bytes_vollstaendig_at`.
 *
 * DESHALB IST DER IMPORT SPALTENWEISE MIT NAMEN, NIE POSITIONSWEISE: weil
 * `limit_reached_at` mitten aus `shares` gestrichen ist, verschiebt jede
 * positionsweise Abbildung ALLES dahinter — und dieser Fehler ist
 * PARITÄTSGRÜN, weil der Paritätscheck den Datenbank-Rundlauf belegt und nicht
 * die Richtigkeit der Feldzuordnung. Er fällt erst in einer feldweisen
 * Stichprobe gegen die Alt-Anwendung auf.
 *
 * Der Paritäts-Schlüssel der Blobs ist der INHALTS-Hash, nicht `relPath`: der
 * Quellpfad existiert im Zielschema nicht mehr.
 */
export const shares = sqliteTable(
  "shares",
  {
    // nanoid(10) über das 64-Zeichen-urlAlphabet: enthält `-` und `_` und ist
    // CASE-SENSITIVE. 1:1-Pflicht — ein Validator /^[a-z0-9]+$/ gäbe für ~jeden
    // 32. Zeichenplatz ein stilles 404 auf einen gemailten Bestandslink.
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description"),
    // Exakt "file" | "folder", kleingeschrieben, BEWUSST OHNE CHECK: das SQL der
    // Alt-App hat keinen, ein Enum kann an Altdaten scheitern, und neu
    // abzuleiten kippt Ordner-Shares mit genau einer Datei. Der Wertebereich
    // lebt im TypeScript-Typ (§4.1).
    type: text("type").notNull(),
    // Serverseitig auf FILES_MAX_ABLAUF_TAGE gedeckelt — bei JEDEM Speichern,
    // nicht nur beim Anlegen (Alt-Defekt: `updateShare` deckelte nicht, und das
    // Formular initialisierte expiryDays mit useState(1), wer nur den Titel
    // korrigierte verkürzte den Share auf 24 h).
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    // NULL = UNBEGRENZT (nicht 0, nicht −1). Die Alt-Zeile
    // `maxDownloads || null` machte aus „0 Downloads" still einen
    // unbegrenzten Share — deshalb überall `??`, nie `||`.
    maxDownloads: integer("max_downloads"),
    // 1:1 übernehmen, NIE aus `download_logs` rekonstruieren: das Log existiert
    // erst seit Alt-Migration 0002, der Zähler seit 0000 (§4.2).
    downloadCount: integer("download_count").notNull().default(0),
    // bcryptjs, cost 12, Präfix `$2b$12$`, 60 Zeichen — auch für NEUE
    // Passwörter. Die Bestandspasswörter liegen bei den Empfängern; ein Wechsel
    // der Hash-Familie macht jeden geschützten Bestands-Share unöffenbar.
    passwordHash: text("password_hash"),
    // GEMESSENE Bytesumme der vollständigen Dateien, nicht die
    // Client-Selbstauskunft der Alt-App (Analyse E20 b).
    totalSize: integer("total_size").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    // Reines Audit-Feld ohne FK (Hausmuster `qr/_db/schema.ts:21-23`):
    // OIDC-`sub` für neue Zeilen, `import:easy-filesharing` für den Altbestand.
    // Nur Anzeige — es gibt KEINE Ownership-Prüfung zwischen Mitgliedern (§2.4).
    createdBy: text("created_by").notNull(),
  },
  (t) => [
    index("idx_shares_expires").on(t.expiresAt), // Aufräum-Prädikat
    index("idx_shares_created").on(t.createdAt), // Dashboard-Sortierung
  ],
);

export const shareFiles = sqliteTable(
  "share_files",
  {
    // 1:1-Pflicht: steckt als `?file=<fileId>` in gemailten und gebookmarkten
    // Direktlinks.
    id: text("id").primaryKey(),
    shareId: text("share_id")
      .notNull()
      .references(() => shares.id, { onDelete: "cascade" }),
    // NUR Anzeige, `Content-Disposition` und ZIP-Eintragsname — NIE Teil eines
    // Pfades. Der Pfad entsteht ausschließlich aus DB-IDs (`_lib/storage.ts`),
    // damit die Traversal-Klasse strukturell verschwindet statt per Guard.
    filename: text("filename").notNull(),
    // Serverseitig FESTGESTELLT (Magic Bytes, §8.5), nicht die
    // Client-Deklaration wie in der Alt-App.
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    // NULL = Upload nicht abgeschlossen. Trägt den Zwischenzustand „Zeile ohne
    // Bytes" SICHTBAR: zählt nicht in total_size, nicht herunterladbar, nicht
    // im ZIP, und der Aufräum-Timer holt die Zeile samt `.part` ab (§4.4). In
    // der Alt-App war dieser Zustand unsichtbar und dauerhaft.
    bytesVollstaendigAt: integer("bytes_vollstaendig_at", { mode: "timestamp" }),
    // Neue Zeilen starten auf `scanning` — gesetzt an der EINFÜGESTELLE, nicht
    // per SQL-Default: der Startwert gehört zum Upload-Weg, der Wertebereich in
    // `_lib/av.ts`, und ein Default auf nur einer der beiden Statusspalten wäre
    // der erste Schritt zu zwei auseinanderlaufenden Vokabularen (§4.6).
    avStatus: text("av_status").notNull(),
    avGeprueftAt: integer("av_geprueft_at", { mode: "timestamp" }),
  },
  (t) => [
    index("idx_share_files_share").on(t.shareId), // heute unindexiert
    index("idx_share_files_av").on(t.avStatus), // Nachscan + Warteschlange
    check("share_files_av_status_check", sql`${t.avStatus} IN ${AV_STATUS_SQL}`),
  ],
);

export const downloadLogs = sqliteTable(
  "download_logs",
  {
    // Die Werte müssen NICHT erhalten bleiben — nichts außerhalb der Tabelle
    // verweist darauf, der Spec-2-Mapper darf neu vergeben (§4.5).
    id: integer("id").primaryKey({ autoIncrement: true }),
    // KEIN FK und kein Cascade: ein Log, das mit dem Share stirbt, ist kein
    // Audit-Log — es verschwindet genau dann, wenn man es braucht (Analyse
    // E12 b). Die eigene Frist ist FILES_LOG_AUFBEWAHRUNG_TAGE.
    shareId: text("share_id").notNull(),
    // NULL = ZIP-Download des GANZEN Shares. 1:1-pflichtiger Magic Value —
    // nicht zum FK machen und nicht auf NOT NULL setzen.
    fileId: text("file_id"),
    // Umbenannt aus `ip` UND gekürzt geschrieben (`ipKuerzen`, `_lib/ip.ts`):
    // es ist der erste Eintrag aus X-Forwarded-For ohne Trusted-Proxy-Prüfung,
    // also ein vom Client gesetzter Wert. Die Ansicht schreibt es dazu
    // („IP (unbestätigt, gekürzt)"). Der Rate-Limiter arbeitet dagegen mit der
    // VOLLEN Adresse im Prozessspeicher und schreibt sie nie.
    clientIpUnbestaetigt: text("client_ip_unbestaetigt"),
    userAgent: text("user_agent"),
    downloadedAt: integer("downloaded_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("idx_logs_share_time").on(t.shareId, t.downloadedAt), // heute unindexiert
    index("idx_logs_time").on(t.downloadedAt), // Aufbewahrungsfrist
  ],
);

/**
 * Eigene Tabelle, KEIN Mitwohnen in `share_files` (Analyse E18 a): dort ist
 * `share_id` notNull mit Cascade (ein Inbox-Upload bräuchte eine synthetische
 * `shares`-Zeile, die im Dashboard erschiene und beim Aufräumen mitstirbt) und
 * `mime_type` notNull (`drop` persistiert keinen MIME-Typ, jeder importierte
 * Upload bräuchte einen ERFUNDENEN Wert). Der Preis von E18 (a) steht ehrlich
 * in §4.6: jede Statusabfrage gibt es zweimal — Gegenmaßnahme ist die eine
 * Konstante `AV_STATUS` und die eine Funktion `istFreigegeben()` in `_lib/av.ts`.
 */
export const inboxFiles = sqliteTable(
  "inbox_files",
  {
    id: text("id").primaryKey(),
    // KEIN Cascade. NULL für den gesamten Altbestand — dort ist keine Datei
    // einem Token zuzuordnen (`req.shareKey` wurde gesetzt und nie gelesen).
    tokenId: text("token_id").references(() => zugangslinks.id),
    // ANZEIGENAME. Für neue Uploads der Originalname, nur um Steuerzeichen und
    // Pfadtrenner bereinigt — der Name steckt in keinem Pfad mehr, also braucht
    // er kein verlustbehaftetes Sanitizing.
    dateiname: text("dateiname").notNull(),
    // Beim SCHREIBEN gegen `_lib/kategorien.ts` validiert; die ANZEIGE toleriert
    // unbekannte Werte, weil der Altbestand Freitext tragen kann.
    kategorie: text("kategorie"),
    hinweis: text("hinweis"),
    // NULLABLE — für den Altbestand von `drop` gibt es keinen MIME-Wert.
    mimeType: text("mime_type"),
    size: integer("size").notNull(),
    clientIpUnbestaetigt: text("client_ip_unbestaetigt"),
    // Für neue Uploads die Annahmezeit; für META-lose Altdateien die
    // Quell-`mtime` — die einzige Zeitquelle, und der Ziel-Arm des
    // Paritätschecks liest sie von hier (§4.6).
    empfangenAt: integer("empfangen_at", { mode: "timestamp" }).notNull(),
    bytesVollstaendigAt: integer("bytes_vollstaendig_at", { mode: "timestamp" }),
    avStatus: text("av_status").notNull(),
    avGeprueftAt: integer("av_geprueft_at", { mode: "timestamp" }),
  },
  (t) => [
    index("idx_inbox_empfangen").on(t.empfangenAt), // Posteingang-Sortierung
    index("idx_inbox_av").on(t.avStatus),
    index("idx_inbox_token").on(t.tokenId),
    check("inbox_files_av_status_check", sql`${t.avStatus} IN ${AV_STATUS_SQL}`),
  ],
);

/**
 * Die anonymen Abgabelinks. Der ROHTOKEN wird nie gespeichert: er entsteht
 * einmal, wird einmal angezeigt (QR + PNG + Druckansicht) und existiert danach
 * nirgends. Wer den Zettel verliert, legt einen neuen Link an — bei ≤ 72 h
 * Laufzeit ist das der Normalfall. SHA-256 statt bcrypt ist begründet: 60 Bit
 * Entropie bei höchstens 72 Stunden Lebensdauer, und bcrypt auf jedem
 * Upload-Chunk wäre Rechenlast ohne Sicherheitsgewinn (§4.7).
 */
export const zugangslinks = sqliteTable(
  "zugangslinks",
  {
    id: text("id").primaryKey(),
    // Bezeichnung für den Betreiber („Übung Nord 30.07.").
    name: text("name").notNull(),
    // Die ersten 8 Zeichen im Klartext für die Liste (`dz-` plus vier
    // Geheimzeichen) — genug zum Wiedererkennen, zu wenig zum Benutzen.
    tokenStart: text("token_start").notNull(),
    // base64url_ohne_padding(SHA-256(utf8(voller Token))).
    tokenHash: text("token_hash").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    createdBy: text("created_by").notNull(),
    // 1–72 ganze Stunden ab Anlegen.
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    // Widerruf ist KEIN Zeilenlöschen — sonst verschwindet mit dem Link auch
    // die Zuordnung der schon empfangenen Dateien.
    revokedAt: integer("revoked_at", { mode: "timestamp" }),
    // Mengenbudget je Link (§8.4): in der DB, nicht im Prozessspeicher, weil
    // ein Neustart einen Speicherzähler zurücksetzt.
    budgetDateien: integer("budget_dateien").notNull(),
    budgetBytes: integer("budget_bytes").notNull(),
    // Atomar hochgezählt (ein UPDATE mit Bedingung, `_db/zaehler.ts`).
    verbrauchtDateien: integer("verbraucht_dateien").notNull().default(0),
    verbrauchtBytes: integer("verbraucht_bytes").notNull().default(0),
  },
  // UNIQUE, weil der Hash beim Upload den Link AUFLÖST: ohne Unique wäre eine
  // Kollision ein stiller Mehrtreffer statt eines Fehlers.
  (t) => [uniqueIndex("idx_zugangslinks_hash").on(t.tokenHash)],
);

/**
 * Die Protokollzeile des Aufräum-Timers. Im TROCKENLAUF tragen dieselben
 * Spalten die Zahlen, die der Lauf gelöscht HÄTTE — sonst wäre die Vorschau mit
 * dem echten Lauf nicht vergleichbar, und genau dieser Vergleich ist der Zweck
 * vor dem ersten Lauf nach dem Cutover (§4.8).
 *
 * KEIN Index, und das ist entschieden, nicht vergessen: die Tabelle wächst um
 * eine Zeile je FILES_AUFRAEUMEN_TAKT_MINUTEN (Vorgabe 60 → ~8.760 Zeilen im
 * Jahr) und wird ausschließlich „die letzten n" gelesen; der PK-Autoindex trägt
 * das. Ein Index auf `gestartet_at` wäre hier Ballast.
 */
export const aufraeumLaeufe = sqliteTable("aufraeum_laeufe", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  gestartetAt: integer("gestartet_at", { mode: "timestamp" }).notNull(),
  // NULL = Lauf abgebrochen (Prozess weg); genau daran ist ein Absturz mitten
  // im Lauf erkennbar.
  beendetAt: integer("beendet_at", { mode: "timestamp" }),
  trockenlauf: integer("trockenlauf", { mode: "boolean" }).notNull(),
  sharesGeloescht: integer("shares_geloescht").notNull().default(0),
  dateienGeloescht: integer("dateien_geloescht").notNull().default(0),
  // Die Einheit steht im Namen (§9.1) — Bytes, nicht MiB.
  bytesGeloescht: integer("bytes_geloescht").notNull().default(0),
  logzeilenGeloescht: integer("logzeilen_geloescht").notNull().default(0),
  inboxGeloescht: integer("inbox_geloescht").notNull().default(0),
  partsGeloescht: integer("parts_geloescht").notNull().default(0),
  // GEMELDET, nicht gelöscht: ein verwaister Blob kann eine Datei sein, deren
  // Zeile noch entsteht (§7.6).
  verwaisteBlobsGemeldet: integer("verwaiste_blobs_gemeldet").notNull().default(0),
  fehler: text("fehler"),
});

export type ShareRow = typeof shares.$inferSelect;
export type NewShareRow = typeof shares.$inferInsert;
export type ShareFileRow = typeof shareFiles.$inferSelect;
export type NewShareFileRow = typeof shareFiles.$inferInsert;
export type DownloadLogRow = typeof downloadLogs.$inferSelect;
export type NewDownloadLogRow = typeof downloadLogs.$inferInsert;
export type InboxFileRow = typeof inboxFiles.$inferSelect;
export type NewInboxFileRow = typeof inboxFiles.$inferInsert;
export type ZugangslinkRow = typeof zugangslinks.$inferSelect;
export type NewZugangslinkRow = typeof zugangslinks.$inferInsert;
export type AufraeumLaufRow = typeof aufraeumLaeufe.$inferSelect;
export type NewAufraeumLaufRow = typeof aufraeumLaeufe.$inferInsert;
