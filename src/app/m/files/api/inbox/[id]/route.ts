/**
 * `GET /api/inbox/[id]` — der gegatete Download einer Posteingang-Datei
 * (Spec §2.1, §5.4, §6.3, §8.6; Plan T32).
 *
 * NEUBAU, keine Portierung: `drop` hatte ueberhaupt keinen Endpunkt, der
 * Uploads listet oder ausliefert (`fastifyStatic` wurzelt auf `web/dist`, nicht
 * auf dem Upload-Verzeichnis). Es gibt hier also nichts „1:1" zu erhalten —
 * wohl aber eine Zusage einzuhalten: eine Datei Dritter verlaesst dieses Modul
 * nur mit Zugang und nur, nachdem der Scanner sie freigegeben hat.
 *
 * DIE REIHENFOLGE DER RIEGEL IST DIE AUSSAGE, nicht nur das Ergebnis:
 *
 *     Rolle → Zugang → Zeile → AV → Blob
 *
 * - **Rolle vor Zugang.** Ein Ausgeloggter auf dem Inbox-Host bekommt 404 und
 *   keine Anmeldeaufforderung: ein 307 auf `/login` verriete, dass es unter
 *   dieser Adresse etwas zu holen gibt. Route Handler haben kein Layout, die
 *   Rollensperre der Group-Layouts erreicht sie also nicht (§2.1).
 * - **AV vor Blob.** Eine gesperrte Zeile ohne Bytes antwortet 403, nicht 404 —
 *   sonst verriete der Statuscode, ob zu einer gesperrten Datei ueberhaupt
 *   Bytes existieren. Dieselbe Linie wie auf dem Share-Weg
 *   (`_db/queries.ts`, belegt in `_db/queries.test.ts:532`).
 *
 * `rolleOderNull` und NICHT `requireRolle`: in einem Handler ist ein
 * `notFound()`-Wurf keine brauchbare Antwort auf einen Download-Link, die 404
 * gehoert dem Handler selbst (§2.1). Beim ZUGANG ist es umgekehrt —
 * `requireFilesAccess()` wirft, und Next uebersetzt den Digest in eine echte
 * 404-Antwort (`route-modules/app-route/module.js:475`). Die Asymmetrie ist die
 * der Spec, nicht die dieses Handlers: der Zugangsriegel ist die EINE Stelle
 * fuer alle drei Aufrufergruppen (§2.4) und darf hier keinen Zwilling bekommen.
 */
import { eq } from "drizzle-orm";
import { Readable } from "node:stream";

import { getDb } from "../../../_db/client";
import { inboxFiles } from "../../../_db/schema";
import { AV_STATUS, istFreigegeben, type AvStatus } from "../../../_lib/av";
import { requireFilesAccess } from "../../../_lib/access";
import { rolleOderNull } from "../../../_lib/hostRolle";
import { BlobFehlt, UngueltigeId, lieseStrom } from "../../../_lib/storage";
import { dispositionKopfzeile } from "../../../_lib/zip";

/**
 * Warum keine Bytes kommen — im Klartext, je Zustand EINE eigene Meldung.
 *
 * Bewusst NICHT aus `_lib/zip.ts` geholt: dessen `ZIP_AUSSCHLUSS_MELDUNGEN` ist
 * das Vokabular der ARCHIV-Zusammenstellung („wurde nicht aufgenommen") und
 * nennt seine zwei Aufrufer im eigenen Kommentar. Hier steht eine einzelne
 * Datei vor einer einzelnen Person, und der Unterschied, den sie braucht, ist
 * `scanning` (warten hilft) gegen die drei anderen (warten hilft nicht). Eine
 * Sammelmeldung „nicht freigegeben" waere fuer beide Faelle richtig und fuer
 * keinen brauchbar.
 */
const AV_MELDUNGEN: Record<Exclude<AvStatus, "clean">, string> = {
  scanning: "Diese Datei wird noch geprüft. Bitte versuchen Sie es in Kürze erneut.",
  infected: "Diese Datei ist gesperrt: die Virenprüfung hat einen Fund gemeldet.",
  error: "Diese Datei ist gesperrt: die Virenprüfung war nicht möglich.",
  unscanned: "Diese Datei ist gesperrt: sie wurde nicht virengeprüft.",
};

/** Der Rueckfall fuer eine Zeile ohne `mime_type` — der Altbestand von `drop`. */
const OHNE_TYP = "application/octet-stream";

/**
 * `type/subtype` ohne Parameter. Der Wert wird beim Upload serverseitig aus
 * Magic Bytes FESTGESTELLT (§8.5), ist also normalerweise harmlos — aber die
 * Spalte ist nullable und importierbar, und ein Steuerzeichen darin liesse
 * `new Headers` platzen: HTTP 500 auf einem Byte-Weg, an dem §5.4 gerade
 * KEINEN 500 haben will. Ein Fremdwert wird deshalb `application/octet-stream`,
 * dieselbe fail-closed-Richtung wie bei `alsAvStatus`.
 */
const MIME_MUSTER = /^[\w.+-]+\/[\w.+-]+$/;

/** Textantworten tragen ihren Typ selbst — sonst raet der Browser (§7.7). */
function text(rumpf: string, status: number): Response {
  return new Response(rumpf, {
    status,
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

/**
 * Der CHECK der Spalte laesst nur die fuenf Werte zu (§4.3); ein sechster waere
 * ein Datenbankfehler und wird `error`, nicht „unbekannt, also freigegeben".
 * Wortgleich zu `_db/queries.ts:245` (`alsAvStatus`), das dort privat ist —
 * eine gemeinsame Fassung waere eine Aenderung an einer fremden Datei.
 */
function alsAvStatus(roh: string): AvStatus {
  return (AV_STATUS as readonly string[]).includes(roh) ? (roh as AvStatus) : "error";
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (rolleOderNull(req.headers) !== "verwaltung") {
    return text("Not found", 404);
  }

  await requireFilesAccess();

  const { id } = await ctx.params;

  // `select()` ohne Argument ist im Modul nicht erlaubt (Quelltext-Zusicherung
  // in `_db/queries.test.ts`): es zoege bei jeder spaeteren Spalte mehr ueber
  // die Grenze, als dieser Handler braucht.
  const [zeile] = getDb()
    .select({
      id: inboxFiles.id,
      dateiname: inboxFiles.dateiname,
      mimeType: inboxFiles.mimeType,
      size: inboxFiles.size,
      avStatus: inboxFiles.avStatus,
    })
    .from(inboxFiles)
    .where(eq(inboxFiles.id, id))
    .limit(1)
    .all();

  if (!zeile) return text("Diese Datei gibt es nicht (mehr).", 404);

  const avStatus = alsAvStatus(zeile.avStatus);
  if (!istFreigegeben(avStatus)) {
    // `istFreigegeben` liefert ein `boolean`, keinen Typwaechter — TypeScript
    // kann `clean` hier nicht ausschliessen, obwohl die Zeile darueber es tut.
    // Ein Direktvergleich waere ein zweites Statusmodell (§6.2), also wird die
    // Einengung BEHAUPTET; getragen wird sie vom Meldungskatalog, der einen
    // Eintrag fuer jeden Status ausser `clean` hat.
    return text(AV_MELDUNGEN[avStatus as Exclude<AvStatus, "clean">], 403);
  }

  let strom;
  let bytes;
  try {
    ({ strom, bytes } = await lieseStrom({ art: "inbox", inboxFileId: zeile.id }));
  } catch (fehler) {
    // §5.4: eine fehlende Datei ist ein belegter REGELzustand (Waisen in beide
    // Richtungen) — die Alt-App lieferte dort 500. `UngueltigeId` steht daneben,
    // weil ein Import eine Zeile mit einer ID hinterlassen kann, die keine
    // nanoid(10) ist; auch das ist ein Datenfehler und kein 500 wert.
    if (fehler instanceof BlobFehlt || fehler instanceof UngueltigeId) {
      return text("Zu diesem Eintrag sind keine Daten mehr vorhanden.", 404);
    }
    throw fehler;
  }

  if (bytes !== zeile.size) {
    // §5.4: ausgeliefert wird die TATSAECHLICHE Groesse — ein falsches
    // `Content-Length` bricht den Download beim Client ab, und der Fehler waere
    // dann beim Empfaenger sichtbar statt hier im Log.
    console.warn(
      `[files] inbox ${zeile.id}: size-Spalte ${zeile.size}, gemessen ${bytes} — ausgeliefert wird die gemessene Groesse`,
    );
  }

  const typ = zeile.mimeType !== null && MIME_MUSTER.test(zeile.mimeType) ? zeile.mimeType : OHNE_TYP;

  return new Response(Readable.toWeb(strom) as ReadableStream<Uint8Array>, {
    status: 200,
    headers: {
      "content-type": typ,
      // IMMER `attachment`, fuer jeden Typ — die Inline-Auslieferung ist allein
      // die Sache von `/api/preview` mit seiner Typ-Allowlist und CSP (§7.7).
      // Beide Namensformen kommen aus `_lib/zip.ts`: der angefuehrte Teil ist
      // der gehaertete ASCII-Rueckfall, der echte Name steht in `filename*`.
      // `dateiname` geht in BEIDE Argumente, weil bei einer Datei — anders als
      // beim Archivnamen — Punkt und Endung erhalten bleiben muessen.
      "content-disposition": dispositionKopfzeile(zeile.dateiname, zeile.dateiname),
      "x-content-type-options": "nosniff",
      "content-length": String(bytes),
      // Kein `Accept-Ranges`, kein 206 (§7.7, verworfen in §12).
    },
  });
}
