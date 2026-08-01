import { and, eq, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { clientIpAus } from "@/core/ratelimit";
import { ipKuerzen } from "../_lib/ip";
import * as schema from "./schema";
import { downloadLogs, shares, zugangslinks } from "./schema";

/**
 * Die verbrauchenden Vorgänge des Moduls `files` — und die EINE Schreibstelle des
 * Audit-Logs (Spec §7.5, §8.4, §4.5).
 *
 * ZWEI REGELN, die für jede Funktion hier gelten und die den Zweck der Datei sind:
 *
 * 1. **Ein einzelnes SQL-Statement pro Vorgang.** Die Bedingung steht IM `UPDATE`,
 *    nicht davor in JavaScript.
 * 2. **Die Entscheidung ist die Zahl betroffener Zeilen**, nie ein vorher
 *    gelesener Wert. `changes === 1` heißt „darf", `0` heißt „gesperrt".
 *
 * Warum das keine Stilfrage ist: heute läuft der Download-Zähler der Alt-App in
 * `after()` auf einem VOR der Antwort gelesenen Wert. Das SQL-Inkrement ist dort
 * atomar, die Ableitung `newCount = share.downloadCount + 1` aber NICHT — und
 * `after` läuft laut mitgelieferter Doku auch dann, wenn die Antwort nicht
 * erfolgreich abgeschlossen wurde. `max_downloads` bedeutet damit heute „etwa N".
 * Hier ist es eine Obergrenze. Belegt wird das von `gleichzeitigkeit.test.ts`
 * gegen echte Prozesse auf einer echten Datei-DB; ein sequenzieller Test wäre für
 * beide Bauformen grün (Analyse Falle 25).
 *
 * Der Preis der Richtung gehört benannt: ein ABGEBROCHENER Download ist
 * verbraucht. Das ist die betreiberfreundliche Seite — „dieser Link funktioniert
 * dreimal" ist dann eine Zusage statt einer Schätzung —, und das Gegenmittel ist
 * „Downloads aufstocken" in der Verwaltung.
 *
 * WARUM DAS AUDIT-LOG HIER LIEGT und nicht in den Handlern: §4.5 verlangt
 * `ipKuerzen` an JEDER Schreibstelle einer Absenderadresse. Läge die Zeile im
 * Handler, hätte jeder Auslieferungsweg seine eigene Fassung davon — und ein Weg,
 * der sie vergisst, wäre nicht als fehlendes Feature sichtbar, sondern als
 * grünes Audit-Log ohne Zeilen. Zählen und Protokollieren sind deshalb Nachbarn
 * in einer Datei und derselbe Schritt im Ablauf: erst zählen, dann
 * protokollieren, beides als letzter Schritt vor dem ersten Byte.
 *
 * Bewusst KEINE gemeinsame Transaktion um beide: die Reihenfolge gehört dem
 * aufrufenden Handler (T33 mit `file_id`, T34 mit `file_id = NULL`), und eine
 * Klammer hier würde ihm die Wahl nehmen, zwischen Zählung und Logzeile noch
 * etwas zu prüfen.
 */

type DB = BetterSQLite3Database<typeof schema>;

/**
 * Verbraucht EINEN Download des Shares. `true` = ausliefern, `false` = 410.
 *
 * Ein ZIP des ganzen Shares ist genau EIN Download, also genau EIN Aufruf —
 * unabhängig von der Zahl der Dateien im Archiv.
 *
 * `max_downloads IS NULL` ist der Sonderwert „unbegrenzt" und muss im SQL
 * ausdrücklich stehen: `download_count < NULL` ergibt in SQLite NULL, also nicht
 * wahr. Ohne den Zweig wäre JEDER unbegrenzte Share stumm nicht herunterladbar,
 * und zwar mit dem Symptom „Limit erreicht".
 */
export function zaehleDownload(db: DB, shareId: string): boolean {
  const ergebnis = db
    .update(shares)
    .set({ downloadCount: sql`${shares.downloadCount} + 1` })
    .where(
      and(
        eq(shares.id, shareId),
        sql`(${shares.maxDownloads} IS NULL OR ${shares.downloadCount} < ${shares.maxDownloads})`,
      ),
    )
    .run();
  return ergebnis.changes === 1;
}

/**
 * Verbucht EINE angenommene Abgabe auf dem Mengenbudget eines Abgabelinks.
 * `true` = angenommen, `false` = 429 („Kontingent dieses Abgabelinks erschöpft").
 *
 * Gezählt wird bei ABSCHLUSS der Datei mit der GEMESSENEN Bytezahl. Der laufende
 * Chunk-Upload prüft vorab gegen das Restbudget und bricht früh ab; dass beide
 * gleichzeitig durch diese Vorprüfung kommen können, ist der benannte Wettlauf —
 * dann liefert dieses `UPDATE` für die zweite Abgabe null Zeilen, obwohl ihre
 * Bytes schon auf der Platte liegen, und der Aufrufer entfernt Blob und Zeile
 * (T50). Ohne diesen Zweig blieben die Bytes als stiller Waise liegen.
 *
 * Das Budget liegt in `files.db` und nicht in einer `Map` im Prozessspeicher:
 * dort wäre es nach jedem Neustart weg und bei mehreren Instanzen wirkungslos.
 */
export function verbucheAbgabe(db: DB, tokenId: string, bytes: number): boolean {
  // Eine negative Bytezahl wäre eine RÜCKERSTATTUNG (`verbraucht_bytes + (−n)`):
  // ein Aufrufer mit kaputter Größenmessung könnte damit das Budget beliebig oft
  // auffüllen. Laut statt still — der Wert kommt aus einer Messung, nicht aus
  // einer Eingabe, also ist er ein Programmfehler und kein Benutzerfehler.
  if (!Number.isSafeInteger(bytes) || bytes < 0) {
    throw new Error(
      `verbucheAbgabe: bytes muss eine nichtnegative ganze Zahl sein, war ${String(bytes)}`,
    );
  }
  const ergebnis = db
    .update(zugangslinks)
    .set({
      verbrauchtDateien: sql`${zugangslinks.verbrauchtDateien} + 1`,
      verbrauchtBytes: sql`${zugangslinks.verbrauchtBytes} + ${bytes}`,
    })
    .where(
      and(
        eq(zugangslinks.id, tokenId),
        sql`${zugangslinks.verbrauchtDateien} < ${zugangslinks.budgetDateien}`,
        // `<=`, nicht `<`: eine Abgabe, die das Restbudget genau ausfüllt, ist
        // erlaubt. Ein `<` läge um ein Byte falsch, und zwar still.
        sql`${zugangslinks.verbrauchtBytes} + ${bytes} <= ${zugangslinks.budgetBytes}`,
      ),
    )
    .run();
  return ergebnis.changes === 1;
}

/**
 * Schreibt GENAU EINE Zeile ins Audit-Log. `fileId = null` heißt „ZIP des ganzen
 * Shares" — der 1:1-pflichtige Magic Value der Alt-Tabelle.
 *
 * Die Funktion nimmt die HEADER, nicht eine fertige Adresse: nur so kann kein
 * Aufrufer `ipKuerzen` vergessen. Was gespeichert wird, ist das NETZ
 * (`93.184.216.34` → `93.184.216.0`) — genug, um „drei Downloads aus demselben
 * Netz" zu erkennen, und unbrauchbar als Personenbezug. Ein Wert, der nicht als
 * Adresse verstanden wird, ergibt `null` statt des Rohwerts; `clientIpAus`
 * liefert ohne jeden Kopf „unknown", und genau das darf nicht in der Spalte
 * landen.
 *
 * Die VORSCHAU ruft diese Funktion nicht — sie zählt nicht und loggt nicht.
 */
export function protokolliereDownload(
  db: DB,
  vorgang: { shareId: string; fileId: string | null; headers: Headers },
): void {
  db.insert(downloadLogs)
    .values({
      shareId: vorgang.shareId,
      fileId: vorgang.fileId,
      clientIpUnbestaetigt: ipKuerzen(clientIpAus(vorgang.headers)),
      userAgent: vorgang.headers.get("user-agent"),
      downloadedAt: new Date(),
    })
    .run();
}
