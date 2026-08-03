import { PassThrough, Readable } from "node:stream";
// archiver 8 ist reines ESM ohne Default-Export: die Fabrik `archiver("zip", …)`
// gibt es nicht mehr, an ihre Stelle tritt die Klasse `ZipArchive` (index.js
// exportiert nur noch `Archiver`, `ZipArchive`, `TarArchive`, `JsonArchive`).
import { ZipArchive, type Archiver } from "archiver";
import { asc, inArray } from "drizzle-orm";

import { getDb } from "@/app/m/files/_db/client";
import { inboxFiles } from "@/app/m/files/_db/schema";
import { requireFilesAccess } from "@/app/m/files/_lib/access";
import { AV_STATUS, type AvStatus } from "@/app/m/files/_lib/av";
import { rolleOderNull } from "@/app/m/files/_lib/hostRolle";
import { BlobFehlt, UngueltigeId, groesse, lieseStrom } from "@/app/m/files/_lib/storage";
import {
  HINWEIS_DATEINAME,
  archivDisposition,
  planeArchiv,
  type ZipKandidat,
} from "@/app/m/files/_lib/zip";

/**
 * DIE ZIP-ZUSAMMENSTELLUNG DES POSTEINGANGS (Spec §8.6, §7.7; Plan T49,
 * Festlegung F).
 *
 * Sie steht hier, weil §8.6 die Mehrfachauswahl „ausgewaehlte herunterladen"
 * zusagt und §11.5 sie E2E prueft, die Routentabelle §2.1 und die
 * Einstiegspunkt-Tabelle §10.2 den Endpunkt aber nicht fuehren. Ohne diese Datei
 * staende in der Oberflaeche ein Knopf vor einer Route, die niemand baut. Als
 * Server Action ist es kein Weg: Streaming und `Content-Disposition` gehen dort
 * nicht — derselbe Grund, aus dem `…/download/[id]/zip` ein Handler ist.
 *
 * `api/inbox/zip` NEBEN `api/inbox/[id]` IST KEIN KONFLIKT, und der Grund gehoert
 * hierher, damit ihn niemand in ein `api/inbox-zip` „repariert": Next bevorzugt
 * das STATISCHE Segment vor dem dynamischen, `/api/inbox/zip` erreicht also immer
 * diesen Handler. Die Folge — `GET /api/inbox/[id]` mit `id === "zip"` ist
 * unerreichbar — ist unschaedlich, weil `inbox_files.id` ein `nanoid(10)` ist und
 * niemals `"zip"` lautet.
 *
 * DIE AUSSCHLUSSREGEL WIRD NICHT NACHGEBAUT. Sie kommt aus `_lib/zip.ts` — dieselbe
 * Funktion wie beim Share-ZIP. Eine zweite Regel waere eine zweite Wahrheit
 * darueber, was „freigegeben" heisst (§6.2).
 *
 * HIER WIRD NICHTS GEZAEHLT UND NICHTS PROTOKOLLIERT. Das Audit-Log gehoert den
 * OEFFENTLICHEN Share-Wegen (§7.8); der Posteingang hat keinen Zaehler und keinen
 * anonymen Abrufer. Eine Logzeile hier saehe aus wie ein Empfaenger-Download und
 * waere es nicht.
 */

/**
 * JEDE Textantwort dieses Handlers, mit denselben drei Kopfzeilen — wie `text()`
 * in T32 und `meldung()` in T34.
 *
 * `nosniff` UND `Cache-Control`, nicht nur der Typ: der Rumpf der 403 listet
 * Dateinamen aus einem gegateten Postfach, hochgeladen von anonymen Dritten. Er
 * gehoert in keinen geteilten Zwischenspeicher, und geraten wird an ihm nichts.
 * Dieselben Kopfzeilen wie auf der 200 — eine Antwortform je Handler, nicht zwei.
 */
function text(rumpf: string, status: number): Response {
  return new Response(rumpf, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Die 404 der ROLLENSPERRE, vom Handler selbst gebaut (§2.1, §2.5) — die des
 * ZUGANGS kommt dagegen aus `requireFilesAccess`, siehe unten.
 */
function nichtGefunden(): Response {
  return text("Not found", 404);
}

/**
 * Der Wertebereich der Spalte laesst nur die fuenf Werte zu (§4.3, als
 * `CONSTRAINT inbox_files_av_status_check` in
 * `_db/migrations/0000_overrated_human_torch.sql:41`). Ein sechster waere ein
 * Datenbankfehler und wird `error`, NICHT „unbekannt, also freigegeben":
 * `istFreigegeben` kennt genau EINEN Wert, und ein Fremdwert gaebe sonst ueber
 * eine Luecke im Typensystem frei.
 *
 * DIESE ZEILE IST BEWUSST VON KEINEM TEST BESESSEN, und der CHECK oben ist der
 * Grund: ein sechster Wert kommt gar nicht erst in die Zeile, also ist der
 * Fremdwert nur ueber ein abgeschaltetes Constraint herstellbar — ein Test, der
 * die Datenbank dafuer entschaerfen muss, belegt die Unerreichbarkeit und nicht
 * das Verhalten. Der Zwilling steht in `api/inbox/[id]/route.ts:91` und in
 * `_db/queries.ts:245`; die gemeinsame Fassung gehoerte nach `_lib/av.ts`, das
 * hier eine fremde Datei ist.
 */
function alsAvStatus(roh: string): AvStatus {
  return (AV_STATUS as readonly string[]).includes(roh) ? (roh as AvStatus) : "error";
}

/**
 * `?ids=a,b,c` → die Auswahl, ENTDOPPELT und in der Reihenfolge der Anfrage.
 *
 * Die Entdopplung traegt die UNBEKANNTEN IDs: eine doppelt genannte bekannte
 * Zeile faengt schon `WHERE id IN (…)` ab, eine doppelt genannte unbekannte
 * stuende sonst zweimal in der `_HINWEIS.txt`.
 */
function ausgewaehlteIds(url: URL): string[] {
  const roh = url.searchParams.get("ids") ?? "";
  return [...new Set(roh.split(",").map((teil) => teil.trim()).filter((teil) => teil !== ""))];
}

/**
 * Haengt EINEN Eintrag an und wartet, bis er vollstaendig im Archiv steht.
 *
 * GENAU DIESES WARTEN IST DIE ZUSAGE „SEQUENZIELL" (T34,
 * `download/[id]/zip/route.ts:28-32`): zu jedem Zeitpunkt ist hoechstens EIN
 * Quellstrom offen. `archiv.append()` kehrt sofort zurueck und reiht nur ein —
 * eine Schleife ohne dieses Warten haette alle Deskriptoren der Auswahl
 * gleichzeitig offen, und `?ids=` hat keine Obergrenze. Das waere ein
 * Descriptor-Leck per Bauform, das erst bei einer grossen Auswahl auffaellt.
 *
 * Der `signal`-Zweig ist kein Beiwerk: nach `archiv.abort()` verarbeitet
 * `archiver` die laufende Aufgabe nicht zu Ende und sendet KEIN `entry` mehr.
 * Ohne ihn bliebe dieses Promise fuer immer offen — und mit ihm das `finally`,
 * das den Deskriptor schliesst.
 *
 * DOPPELT ZU T34 UND ABSICHTLICH: eine gemeinsame Fassung waere eine Aenderung
 * an einer fremden Datei. Der Koordinator kann sie spaeter zusammenlegen.
 */
function fuegeEin(
  archiv: Archiver,
  quelle: Readable | string,
  name: string,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((aufloesen, ablehnen) => {
    const aufraeumen = () => {
      archiv.off("entry", beiEintrag);
      archiv.off("error", beiFehler);
      signal.removeEventListener("abort", beiAbbruch);
    };
    const beiEintrag = () => {
      aufraeumen();
      aufloesen();
    };
    const beiFehler = (fehler: Error) => {
      aufraeumen();
      ablehnen(fehler);
    };
    const beiAbbruch = () => {
      aufraeumen();
      ablehnen(new Error("[files] Posteingang-Archiv: die Anfrage wurde abgebrochen"));
    };

    // Ein `addEventListener` auf einem BEREITS abgebrochenen Signal loest laut
    // Spezifikation nicht mehr aus. Das ist der Fall „der Abbruch kam, waehrend
    // `lieseStrom` noch lief" — ohne diese Zeile hinge das Promise fuer immer.
    if (signal.aborted) {
      beiAbbruch();
      return;
    }

    archiv.once("entry", beiEintrag);
    archiv.once("error", beiFehler);
    signal.addEventListener("abort", beiAbbruch, { once: true });
    archiv.append(quelle, { name });
  });
}

/**
 * Der Blob-Abgleich VOR dem Planen, nicht waehrend des Streamens.
 *
 * Eine Zeile ohne Blob ist ein belegter Regelzustand (Waisen in beide
 * Richtungen, Analyse Falle 9). Faellt sie erst im Streamer auf, ist die Antwort
 * schon 200 und der Empfaenger haelt ein halbes Archiv in der Hand. Hier ist sie
 * dagegen eine gewoehnliche Fehlzeile — und wenn ALLE Blobs fehlen, greift der
 * `leer`-Ast, statt ein Archiv auszuliefern, das nur aus der Fehlliste besteht.
 *
 * Sie geht als „nicht gefunden" in die Fehlliste, und zwar mit ihrem
 * ANZEIGENAMEN: er liegt in derselben Abfrage, und ausgewaehlt wurde die Zeile
 * in der Liste nach ihm (T43). Eine nanoid waere fuer den Leser eine
 * Nachschlageaufgabe — dieselbe Begruendung, aus der T34 fuer dieselbe Bedingung
 * Namen uebergibt (`download/[id]/zip/route.ts:186-189`). IDs stehen in dieser
 * Liste nur dort, wo es keinen Namen gibt: fuer eine fremde `id` aus `?ids=`.
 */
async function blobVorhanden(id: string): Promise<boolean> {
  try {
    await groesse({ art: "inbox", inboxFileId: id });
    return true;
  } catch (fehler) {
    if (fehler instanceof BlobFehlt || fehler instanceof UngueltigeId) return false;
    throw fehler;
  }
}

export async function GET(req: Request): Promise<Response> {
  // ERSTE Anweisung: die Rollensperre (§2.1). `rolleOderNull` und nicht
  // `requireRolle` — ein `notFound()`-Wurf ist in einem Handler keine brauchbare
  // Antwort auf einen Download-Link.
  if (rolleOderNull(req.headers) !== "verwaltung") return nichtGefunden();

  /*
   * DER ZUGANGSRIEGEL IST DER GEMEINSAME (§2.4, T32) — anders als die
   * Rollensperre darueber, und der Unterschied hat einen Grund.
   *
   * `requireFilesAccess()` wirft: `notFound()` fuer die Sitzung ohne Zugang
   * (Next uebersetzt den Digest in eine echte 404-Antwort,
   * `route-modules/app-route/module.js:475`) und `redirect()` in den Login fuer
   * die anonyme Anfrage. Beides ist auf diesem Byte-Weg richtig. Die 307 traegt
   * KEIN `Content-Disposition`; der Browser folgt ihr und zeigt den Login —
   * wessen Sitzung waehrend der Arbeit ablief, kommt damit zurueck statt vor ein
   * „Not found" zu laufen. Ein eigener 404-Zweig hier waere ein Zwilling des
   * Riegels und eine zweite Antwortform fuer dieselbe Frage; §2.4 hat dafuer
   * genau EINE Stelle vorgesehen, und T44 nimmt die Form ueber alle dreizehn
   * Handler-Methoden gemeinsam ab.
   *
   * Bei der ROLLE ist es umgekehrt (`rolleOderNull` statt `requireRolle`), weil
   * dort nichts zu vereinheitlichen ist: „falscher Host" hat keinen zweiten
   * Aufrufer und keine sinnvolle Anmeldeaufforderung.
   */
  await requireFilesAccess();

  const ids = ausgewaehlteIds(new URL(req.url));
  if (ids.length === 0) {
    // 400 und nicht ein leeres Archiv: „nichts ausgewaehlt" ist ein Zustand der
    // aufrufenden Seite, kein Ergebnis.
    return text("Es ist keine Datei ausgewählt.", 400);
  }

  // Aufgezaehlte Spalten, nie `select()` ohne Argument (Quelltext-Zusicherung in
  // `_db/queries.test.ts`). Sortiert wie `ladeInhalt`, damit die Reihenfolge im
  // Archiv nicht an der Reihenfolge in der URL haengt.
  const zeilen = getDb()
    .select({
      id: inboxFiles.id,
      dateiname: inboxFiles.dateiname,
      avStatus: inboxFiles.avStatus,
      bytesVollstaendigAt: inboxFiles.bytesVollstaendigAt,
    })
    .from(inboxFiles)
    .where(inArray(inboxFiles.id, ids))
    .orderBy(asc(inboxFiles.empfangenAt), asc(inboxFiles.id))
    .all() as {
    id: string;
    dateiname: string;
    avStatus: string;
    bytesVollstaendigAt: Date | null;
  }[];

  const gefunden = new Set(zeilen.map((z) => z.id));
  // Eine unbekannte oder fremde ID reisst die Auswahl NICHT mit: eine 404 fuer
  // das ganze Archiv waere in einer Mehrfachauswahl eine Sackgasse, bei der
  // niemand erfaehrt, welche Zeile schuld war (T49 Punkt 6).
  const nichtGefundeneIds = ids.filter((id) => !gefunden.has(id));

  const kandidaten: ZipKandidat[] = [];
  for (const zeile of zeilen) {
    const avStatus = alsAvStatus(zeile.avStatus);
    // Nur Zeilen geprobt, die es ueberhaupt bis zum Archiv schaffen koennten:
    // fuer eine Zeile ohne Bytes ist das Fehlen des Blobs der ERWARTETE Zustand.
    if (
      zeile.bytesVollstaendigAt !== null &&
      avStatus === "clean" &&
      !(await blobVorhanden(zeile.id))
    ) {
      nichtGefundeneIds.push(zeile.dateiname);
      continue;
    }
    kandidaten.push({
      id: zeile.id,
      name: zeile.dateiname,
      avStatus,
      bytesVollstaendigAt: zeile.bytesVollstaendigAt,
    });
  }

  const plan = planeArchiv(kandidaten, nichtGefundeneIds);

  if (plan.art === "leer") {
    // Ein ZIP ohne Eintraege sieht fuer den Empfaenger wie ein Fehler seines
    // Entpackprogramms aus. Stattdessen der benannte Zustand — samt der
    // Fehlliste, denn im leeren Ast ist gerade sie die Begruendung.
    const zeilenText = plan.ausgeschlossen.map((a) => `- ${a.name} — ${a.meldung}`);
    return text([plan.meldung, "", ...zeilenText, ""].join("\n"), 403);
  }

  /*
   * Ab hier laeuft die Abbruchbehandlung der Alt-App (PassThrough,
   * `archive.on("error")`, `req.signal`-Zuhoerer, Aufraeumen im `finally`). Ihr
   * S3-Anlass faellt weg, sie selbst nicht: sie verhindert hier geleckte
   * FILE-DESCRIPTORS statt Sockets. Ohne den Fehler-Zuhoerer haengt der
   * PassThrough bei einem Lesefehler fuer immer, und der Client wartet bis in
   * sein eigenes Zeitlimit.
   */
  const rumpf = new PassThrough();
  const archiv = new ZipArchive({ zlib: { level: 1 } });
  archiv.on("error", (fehler) => {
    console.error("[files] Posteingang-Archiv: Fehler im Archivierer", fehler);
    rumpf.destroy(fehler);
  });
  archiv.pipe(rumpf);

  /*
   * DER ABBRUCH SCHLIESST DEN QUELLSTROM AUF ZWEI WEGEN, UND DAS IST ABSICHT —
   * gemessen, damit niemand den einen fuer ueberfluessig haelt und wegkuerzt:
   *
   *  - dieser Zuhoerer hier, der SOFORT beim `abort`-Ereignis raeumt, und
   *  - `fuegeEin`, das auf demselben Signal ablehnt, woraufhin `finally` unten
   *    denselben Strom schliesst.
   *
   * Jeder deckt die Luecke des anderen: nimmt man `fuegeEin` das Signal, haengt
   * sein Promise fuer immer und das `finally` liefe nie — dann traegt allein
   * dieser Zuhoerer. Nimmt man diesen Zuhoerer, kommt das Aufraeumen einen
   * Mikrotask spaeter, aber es kommt. Erst wenn BEIDE fehlen, bleibt der
   * Deskriptor offen; genau das ist die Mutation, die der Abbruch-Test rot
   * faerbt. `archive.abort()` selbst schliesst den Quellstrom NICHT — es ist
   * kein dritter Weg, sondern der Grund, dass es ueberhaupt zwei braucht.
   *
   * Eine LISTE, obwohl `fuegeEin` hoechstens EINEN gleichzeitig offen laesst:
   * sie ist die Form, die auch den Strom erfasst, der zwischen `lieseStrom` und
   * dem ersten `await` steht.
   */
  const geoeffnet: Readable[] = [];
  const schliesseStroeme = () => {
    // Ein fertig gelesener Strom ist schon zerstoert; der zweite Aufruf waere
    // folgenlos, die Abfrage haelt die Absicht trotzdem sichtbar.
    for (const strom of geoeffnet) if (!strom.destroyed) strom.destroy();
  };

  const beiAbbruch = () => {
    archiv.abort();
    rumpf.destroy();
    schliesseStroeme();
  };
  req.signal.addEventListener("abort", beiAbbruch);

  // Bewusst NICHT erwartet: die Antwort geht sofort raus, das Archiv entsteht
  // waehrend der Empfaenger schon liest — kein Temp-File, sequenziell.
  void (async () => {
    try {
      for (const eintrag of plan.eintraege) {
        if (req.signal.aborted) break;
        const { strom } = await lieseStrom({ art: "inbox", inboxFileId: eintrag.id });
        // VOR dem `await`: kam der Abbruch waehrend des Oeffnens, ist der
        // Deskriptor sonst in keiner Liste, und nichts schliesst ihn mehr.
        geoeffnet.push(strom);
        try {
          await fuegeEin(archiv, strom, eintrag.eintragsname, req.signal);
        } finally {
          // HIER und nicht erst im aeusseren `finally`: so ist der Deskriptor
          // auf JEDEM Ausgang zu, ehe der naechste aufgeht. Nach vollstaendigem
          // Lesen ist der Strom ohnehin zu; `destroy` ist dann folgenlos.
          strom.destroy();
        }
      }
      // Die Fehlliste ist selbst ein Eintrag, und `planeArchiv` hat ihren Namen
      // dafuer schon belegt. Auch sie geht durch `fuegeEin`: ein nicht
      // erwartetes `append` daneben stiehlt dem wartenden das `entry`-Ereignis.
      if (plan.hinweis !== null) {
        await fuegeEin(archiv, plan.hinweis, HINWEIS_DATEINAME, req.signal);
      }
      // Kein Abschluss auf einem abgebrochenen Archivierer: das Ergebnis will
      // niemand mehr, und sein Promise settelt je nach Reihenfolge gar nicht.
      // Dieselbe Abfrage wie T34 (`download/[id]/zip/route.ts:276`); sie ist
      // hier ein Ausschluss und kein Rettungsanker, weil der Abbruch auf diesem
      // Weg schon in `fuegeEin` ablehnt und im `catch` landet.
      if (!req.signal.aborted) await archiv.finalize();
    } catch (fehler) {
      // Der Abbruch ist der Normalfall eines Empfaengers, der die Verbindung
      // fallen laesst, und laeuft ueber denselben `catch`. Ohne die Abfrage
      // schriebe jeder davon eine Fehlerzeile ins Log.
      if (!req.signal.aborted) {
        console.error("[files] Posteingang-Archiv konnte nicht gebaut werden", fehler);
      }
      rumpf.destroy(fehler instanceof Error ? fehler : new Error(String(fehler)));
    } finally {
      req.signal.removeEventListener("abort", beiAbbruch);
      schliesseStroeme();
    }
  })();

  // Der Titel traegt das Datum, damit mehrere Zusammenstellungen im
  // Download-Ordner unterscheidbar bleiben. Das Leerzeichen ist Absicht: es
  // macht den harten ASCII-Rueckfall (`Posteingang_…`) vom echten Namen
  // unterscheidbar, und beide Formen stehen in der Kopfzeile.
  const titel = `Posteingang ${new Date().toISOString().slice(0, 10)}`;

  return new Response(Readable.toWeb(rumpf) as ReadableStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": archivDisposition(titel),
      "X-Content-Type-Options": "nosniff",
      // Gegateter Inhalt gehoert in keinen geteilten Zwischenspeicher.
      "Cache-Control": "private, no-store",
    },
  });
}
