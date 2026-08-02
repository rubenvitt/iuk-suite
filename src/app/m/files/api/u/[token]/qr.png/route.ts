import { eq } from "drizzle-orm";

import { qrPng } from "@/core/qr";
import { getDb } from "../../../../_db/client";
import { zugangslinks } from "../../../../_db/schema";
import { requireFilesAccess } from "../../../../_lib/access";
import { oeffentlicheUrl, rolleOderNull } from "../../../../_lib/hostRolle";
import { normalisiereToken, tokenHash } from "../../../../_lib/token";
import { dispositionKopfzeile, entschaerfeTitel } from "../../../../_lib/zip";

/**
 * DER ABGABE-QR — dieselben Regeln wie §7.9, Nutzlast aus der Rolle `inbox`
 * (Spec §8.7).
 *
 * ZWEI UNTERSCHIEDE ZUR SHARE-ROUTE, und beide sind der ganze Inhalt dieser
 * Datei:
 *
 * 1. DER ENDPUNKT IST GEGATET. Er wird nur in der Verwaltung gebraucht
 *    (Ausgabe-Dialog nach dem Anlegen und Druckansicht, §8.6), und ungegatet
 *    waere er ein Orakel: „existiert dieses Token?". Der Riegel ist derselbe wie
 *    ueberall im Modul — `requireFilesAccess()`, GENAU EINE Stufe, kein
 *    Suite-Admin-Umweg (§2.4).
 *
 *    Dass die Route auf der INBOX-Domain liegt und trotzdem eine angemeldete
 *    Sitzung verlangt, geht nur auf, weil das Session-Cookie ueber
 *    `AUTH_COOKIE_DOMAIN` auf der gemeinsamen Elterndomain sitzt
 *    (`core/auth/cookies.ts`) — host-only waere es auf `drop.…` unsichtbar und
 *    die Verwaltung bekaeme ihr eigenes Bild nicht zu sehen.
 *
 * 2. KEIN OEFFENTLICHER CACHE. Die Nutzlast IST der Abgabe-Link; ein gemeinsamer
 *    Cache schluesselt auf die URL, nicht auf die Sitzung, und liefe damit an
 *    Punkt 1 vorbei.
 *
 * OHNE `?dl=1` LOEST DIE ROUTE DAS TOKEN NICHT AUF. Sie normalisiert es, baut
 * die Nutzlast und verlaesst sich auf den Riegel — auf diesem Weg gibt es keine
 * Tabellenabfrage: fuer ein existierendes und ein erfundenes Token ist die
 * Antwort byteweise gleich, und das Orakel entsteht gar nicht erst. Genau
 * diesen Weg geht das `<img>` der einmaligen Ausgabe und der Druckansicht.
 *
 * MIT `?dl=1` MUSS SIE ES AUFLOESEN (§8.7: „Erhalten bleiben muss der
 * PNG-Download"). Der Dateiname der Kopfzeile ist `zugangslinks.name`, und der
 * steht nirgendwo sonst — aus der Anfrage darf er NICHT kommen: ein Name aus dem
 * Client in einer Kopfzeile ist eine Injektionsstelle, und wiedererkennbar ist
 * ohnehin nur, was in der Zeile steht. Damit unterscheidet die Antwort auf
 * diesem Weg zwischen „gibt es" und „gibt es nicht" — tragbar ausschliesslich,
 * weil der Riegel DAVOR steht: wer ihn passiert, sieht die ganze Liste der
 * Abgabelinks ohnehin (§2.4, EINE Stufe). Deshalb liegt die Abfrage als letzte
 * Anweisung hinter Host, Person und Grammatik, und `route.test.ts` haelt genau
 * diese Reihenfolge ueber einen Spion auf `getDb` fest.
 *
 * DER NAME WIRD NICHT ZWEIMAL ENTSCHAERFT: `entschaerfeTitel` aus `_lib/zip.ts`
 * ist die eine Regel (§7.9), und `(verwaltung)/zugangslinks/page.tsx` leitet mit
 * derselben Funktion den Wert des `download`-Attributs ab. Beide Wege muessen
 * denselben Namen ergeben — ein zweites Entschaerfen hier waere die zweite
 * Wahrheit darueber, wie die Datei heisst.
 */

/** Vorgabe und Obergrenze wie beim Share-QR — der Aushang druckt in 1024px. */
const BREITE_VORGABE = 512;
const BREITE_MAX = 2048;

/**
 * `?w=` GEKLEMMT, nicht durchgereicht. Auch hinter dem Riegel bleibt der Grund
 * gueltig: `qrPng` gibt `width` direkt an den Kodierer, und `?w=100000` waere
 * Rechenlast, die eine einzige angemeldete Sitzung beliebig oft ausloesen kann.
 * Unsinn faellt auf die Vorgabe zurueck statt einen Fehler zu erzeugen.
 *
 * (Dieselben sechs Zeilen stehen in `api/s/[id]/qr.png/route.ts` und ein drittes
 * Mal in `feedback/f/[slugSecret]/qr.png/route.ts:26-31`. Drei Aufrufer erfuellen
 * die core-Regel „ein zweiter, heute belegbarer Nutzniesser" — aber weder
 * `core/qr/` noch die feedback-Route gehoeren zur Dateiliste dieses Tasks; die
 * Zusammenfuehrung ist als offener Punkt gemeldet.)
 */
function breiteAus(anfrage: string): number {
  const rohwert = new URL(anfrage).searchParams.get("w");
  if (!rohwert) return BREITE_VORGABE;
  const zahl = Number.parseInt(rohwert, 10);
  if (!Number.isFinite(zahl) || zahl <= 0) return BREITE_VORGABE;
  return Math.min(zahl, BREITE_MAX);
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  /*
   * ERST DER HOST, DANN DIE PERSON — die Reihenfolge ist nicht beliebig und hat
   * dieselbe Begruendung wie in `(verwaltung)/layout.tsx`: andernfalls schickte
   * ein anonymer Aufruf auf dem FALSCHEN Host erst in den Login und antwortete
   * danach mit 404. Der Login waere eine Sackgasse, und die Rollentrennung
   * haette einen Umweg, der die Existenz des Pfades verraet.
   */
  if (rolleOderNull(req.headers) !== "inbox") {
    return new Response("Not found", { status: 404 });
  }

  /*
   * Der Riegel steht VOR der Bewertung des Tokens: waere es umgekehrt, unter-
   * schiede die Antwort fuer Unangemeldete zwischen „syntaktisch gueltig" und
   * „Unsinn" — ein kleines Orakel, das es nicht zu geben braucht.
   */
  await requireFilesAccess();

  const { token } = await params;
  const kanonisch = normalisiereToken(token);
  // Gedruckt gehoert die kanonische Form; eine Eingabe, die nicht der Grammatik
  // entspricht, kann kein Token sein und bekommt keine Nutzlast.
  if (kanonisch === null) return new Response("Not found", { status: 404 });

  /*
   * NUR fuer den Download, und deshalb erst hier: ohne `?dl=1` bleibt die
   * Antwort exakt die von vorher — dieselbe Adresse steht als `<img src>` in der
   * einmaligen Ausgabe und in der Druckansicht, und eine `attachment`-Kopfzeile
   * machte aus dem angezeigten QR einen Download-Dialog.
   */
  const kopfzeilen: Record<string, string> = {
    "content-type": "image/png",
    "cache-control": "private, no-store",
  };
  if (istDownload(req.url)) {
    const name = nameZumToken(kanonisch);
    // Kein Name heisst: keine Zeile. Dieselbe Antwort wie bei einer Eingabe
    // ausserhalb der Grammatik — und VOR `qrPng`, weil ein ausgeliefertes Bild
    // die Auskunft „diesen Link gibt es nicht mehr" waere, nur in Bytes.
    if (name === null) return new Response("Not found", { status: 404 });
    kopfzeilen["content-disposition"] = qrDisposition(name);
  }

  const nutzlast = oeffentlicheUrl("inbox", `/u/${kanonisch}`, req.headers);
  const png = await qrPng(nutzlast, { width: breiteAus(req.url) });

  return new Response(Buffer.from(png), { headers: kopfzeilen });
}

/**
 * GENAU `1`, wie `ende=1` im Upload-Weg derselben Route-Familie. Ein „irgendwas
 * Wahres" waere ein zweiter, ungeschriebener Vertrag — und `?dl=0` hiesse dann
 * Download.
 */
function istDownload(anfrage: string): boolean {
  return new URL(anfrage).searchParams.get("dl") === "1";
}

/**
 * Der Anzeigename des Abgabelinks, oder `null`, wenn es die Zeile nicht gibt.
 *
 * OHNE `revoked_at IS NULL` und OHNE Ablaufvergleich — anders als
 * `loeseTokenAuf` in `upload/route.ts`, und das ist entschieden, nicht
 * vergessen: dort entscheidet die Abfrage, ob eine Abgabe ANGENOMMEN wird, hier
 * nur, wie die heruntergeladene Datei heisst. Das Bild selbst liefert dieselbe
 * Adresse ohne `?dl=1` fuer jeden Token aus, unabhaengig von Widerruf und
 * Ablauf; ein Filter allein am Download erfaende eine Unterscheidung
 * („widerrufen" gegen „gueltig"), die der Bildweg nicht trifft — und zwar fuer
 * einen Aufrufer, der die ganze Liste mitsamt Zustand ohnehin sieht (§8.6).
 * Ein Ausdruck bleibt lesbar, auch wenn der Link inzwischen widerrufen ist.
 */
function nameZumToken(kanonisch: string): string | null {
  const zeile = getDb()
    .select({ name: zugangslinks.name })
    .from(zugangslinks)
    .where(eq(zugangslinks.tokenHash, tokenHash(kanonisch)))
    .get();
  return zeile === undefined ? null : zeile.name;
}

/**
 * `<entschaerfter-name>-qr.png` (§7.9) in BEIDEN Formen der Kopfzeile.
 *
 * DERSELBE Wert in beiden Parametern, und das ist entschieden, nicht
 * nachlaessig: `filename*` gewinnt beim Empfaenger, und der roh uebernommene
 * Name lieferte dort eine ANDERE Datei als die, die `download` im Markup nennt
 * (`_ui/ZugangslinksListe.tsx`) — zwei Namen fuer eine Sache. §7.9 nennt genau
 * einen. Praezedenzfall im Modul: `api/inbox/[id]/route.ts:168`.
 *
 * `-qr.png` haengt NACH der Entschaerfung dran, wie `.zip` in
 * `archivDisposition`: der Punkt liegt ausserhalb von `[a-zA-Z0-9_-]` und wuerde
 * sonst selbst zu `_` (`…-qr_png`).
 */
function qrDisposition(name: string): string {
  const dateiname = `${entschaerfeTitel(name)}-qr.png`;
  return dispositionKopfzeile(dateiname, dateiname);
}
