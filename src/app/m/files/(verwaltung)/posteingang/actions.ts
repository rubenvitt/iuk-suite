"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";

import { getDb } from "@/app/m/files/_db/client";
import { inboxFiles } from "@/app/m/files/_db/schema";
import { requireFilesAccess } from "@/app/m/files/_lib/access";
import { loesche } from "@/app/m/files/_lib/storage";

/**
 * DER EINZIGE SCHREIBWEG DES POSTEINGANGS (Spec §8.6; Plan T43).
 *
 * **Löschen entfernt Zeile UND Bytes.** Das ist die fachliche Zusage, die `drop`
 * nicht hatte, und sie ist der GRUND, warum die Sidecar-`.txt` und der
 * SSH-Abholweg entfallen dürfen (Betreiberentscheidung E14 (a)). Ein Löschweg,
 * der nur die Zeile entfernt, ließe die Bytes für immer liegen: der Aufräum-Lauf
 * **meldet** verwaiste Blobs, er löscht sie nicht (§7.6).
 *
 * `requireFilesAccess()` steht als ERSTE Anweisung, vor jedem Lesen der
 * Nutzlast. Eine Seiten- oder Layout-Prüfung erstreckt sich NICHT auf die
 * Actions darunter (Next-Doku `data-security.md:282,329`), und in der Alt-App
 * fehlte sie in allen drei Actions. Der Quelltext-Scan aus T26 erfasst diese
 * Datei mit.
 *
 * **Feldfehler werden ZURÜCKGEGEBEN, nicht geworfen** — eine geworfene Ausnahme
 * landet auf der technischen Fehlerseite. Ein fehlender ZUGANG ist dagegen kein
 * Feldfehler und wirft weiter: eine gerenderte Meldung „darfst du nicht" wäre
 * eine Auskunft über einen fremden Datenbestand.
 *
 * Es gibt hier **kein** Gegenstück zu `loescheShareVerzeichnis`: Inbox-Blobs
 * liegen alle in EINEM Verzeichnis `inbox/` (`_lib/storage.ts`, `pfadFuer`),
 * das keiner einzelnen Abgabe gehört. Ein `rmdir` darauf wäre der Versuch, den
 * zweiten Namensraum des Moduls zu entfernen.
 */

/**
 * `geloescht` und `bytes` tragen die Quittung. Die Byteangabe ist nicht Zierrat:
 * die Bestätigung nennt die Größe (§8.6), und „2 Zeilen weg" allein sagt nicht,
 * was in der Ablage freigeworden ist.
 */
export type PosteingangFormZustand =
  | { ok: true; geloescht: number; bytes: number }
  | { ok: false; feldFehler: Record<string, string> };

/**
 * EIN Aufruf mit `"layout"` statt zweier mit `"page"`. Die Route-Group
 * `(verwaltung)` taucht in keinem URL-Pfad auf — der interne Pfad der Liste ist
 * `/m/files/posteingang`. `"layout"` frischt das Segment MIT allen Unterrouten
 * auf. Der INTERNE Pfad, nicht der per Host geroutete (dieselbe Falle wie im
 * Portal).
 */
function auffrischen(): void {
  revalidatePath("/m/files", "layout");
}

/**
 * Die Auswahl aus dem Formular — **entdoppelt** und in der Reihenfolge der
 * Felder.
 *
 * `getAll` und nicht `get`: die Mehrfachauswahl schickt ein `ids`-Feld JE Zeile.
 * Ein `get` läse still nur das erste, meldete `ok: true`, und die übrigen Zeilen
 * blieben stehen — mit einer Erfolgsmeldung davor.
 */
function ausgewaehlteIds(formData: FormData): string[] {
  const roh = formData
    .getAll("ids")
    .map((wert) => String(wert).trim())
    .filter((wert) => wert !== "");
  return [...new Set(roh)];
}

/**
 * Löscht die ausgewählten Abgaben — Zeile **und** Bytes, einzeln wie über die
 * Mehrfachauswahl.
 *
 * **Erst die Bytes, dann die Zeile**, dieselbe Reihenfolge wie in
 * `shareLoeschenAction`: bricht der Vorgang dazwischen ab, bleibt eine Zeile
 * ohne Bytes — ein Zustand, den das Modul bereits benennt und sichtbar macht
 * (§4.4). Die Gegenrichtung hinterließe einen Blob ohne Zeile, und den räumt
 * niemand ab: §7.6 meldet Waisen, statt sie zu löschen.
 *
 * **Je Zeile nacheinander**, nicht „alle Bytes, dann ein Sammel-DELETE": ein
 * Fehlschlag in der Mitte lässt so einen sauberen Anfang und einen
 * unangetasteten Rest zurück, nicht eine Menge halb gelöschter Zeilen.
 */
export async function inboxLoeschenAction(
  _vorher: PosteingangFormZustand,
  formData: FormData,
): Promise<PosteingangFormZustand> {
  await requireFilesAccess();

  const ids = ausgewaehlteIds(formData);
  if (ids.length === 0) {
    return { ok: false, feldFehler: { ids: "Keine Abgabe ausgewählt." } };
  }

  // Spaltenliste statt `select()` — im Modul nicht erlaubt (§7.3): ohne sie
  // zöge jede spätere Spalte mehr über diese Naht, als hier gebraucht wird.
  // Einzeln abgefragt und nicht mit `inArray`, damit die Reihenfolge der
  // Löschungen die der Auswahl ist und ein Abbruch nachvollziehbar bleibt.
  const db = getDb();
  let geloescht = 0;
  let bytes = 0;

  for (const id of ids) {
    const [zeile] = db
      .select({ id: inboxFiles.id, size: inboxFiles.size })
      .from(inboxFiles)
      .where(eq(inboxFiles.id, id))
      .limit(1)
      .all();
    if (!zeile) continue;

    await loesche({ art: "inbox", inboxFileId: zeile.id });
    db.delete(inboxFiles).where(eq(inboxFiles.id, zeile.id)).run();

    geloescht += 1;
    bytes += zeile.size;
  }

  /*
   * KEINE Zeile getroffen heißt: die Auswahl ist veraltet (jemand anders hat
   * gelöscht) oder erfunden. Beides ist ein Feldfehler und kein `ok: true` —
   * eine Erfolgsmeldung für einen Vorgang, der nichts getan hat, ist genau die
   * Form, an der niemand merkt, dass etwas nicht stimmt.
   */
  if (geloescht === 0) {
    return {
      ok: false,
      feldFehler: { ids: "Diese Abgabe gibt es nicht (mehr) — die Liste ist veraltet." },
    };
  }

  auffrischen();
  return { ok: true, geloescht, bytes };
}
