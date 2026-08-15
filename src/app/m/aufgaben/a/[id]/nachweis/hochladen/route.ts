/**
 * `POST /a/<id>/nachweis/hochladen` — DER BILDNACHWEIS-UPLOAD (Aufgabe 19, Fix-Runde 1,
 * Betreiberentscheidung 2026-08-14). WAR EINE SERVER ACTION (`nachweisHochladenAction`,
 * `actions.ts`), IST JETZT EIN ROUTE HANDLER — der Grund steht in `next.config.ts`s
 * zurueckgebautem Kommentar: `serverActions.bodySizeLimit` ist eine EINZIGE, suiteweite
 * Next-Einstellung. Eine Anhebung fuer diese eine Route haette sie fuer JEDE Server Action
 * JEDES Moduls angehoben — auch fuer Formulare, die nie eine Datei erwarten. `files` hat
 * denselben Fall schon einmal entschieden (`api/u/[token]/upload/route.ts`): Upload ueber
 * einen Route Handler, damit die globale Grenze unangetastet bleibt.
 *
 * KEINE BLOECKE (anders als `files`): `files` traegt 12-MiB-Dateien fuer anonyme, moeglicherweise
 * unzuverlaessige Verbindungen und chunkt deshalb in `FILES_CHUNK_BYTES`-Schritten mit
 * Wiederaufsetzpunkt. Hier ist die Anforderung eine andere — ein paar BuFDis, ein Foto pro
 * Woche, `NACHWEIS_MAX_BYTES` (8 MiB) — und `_lib/ablage.ts`s Kopfkommentar zu `legeNachweisAb`
 * beschreibt bereits die getroffene Wahl: das ganze Bild im Speicher zu halten ist bei diesem
 * Volumen unproblematisch, und eine abgelehnte Datei hinterlaesst dadurch STRUKTURELL keinen
 * Rest. Ein Chunk-Protokoll fuer diesen Fall zu bauen waere Komplexitaet ohne Gegenwert.
 *
 * DIE GESAMTE `nachweisHochladenAction`-LOGIK WANDERT HIERHER, NICHT NUR DIE DATEIBYTES: eine
 * Aufteilung (Bytes ueber die Route, `dateiId` zurueck an eine schlanke Server Action fuer Text +
 * `erstelleNachweis`) haette eine ZWEITE Vertrauensgrenze noetig gemacht — die Server Action
 * haette einen CLIENT-GELIEFERTEN `dateiId` erneut gegen Zugehoerigkeit und Scan-Status pruefen
 * muessen, entgegen der Suite-Regel „Objekt-Zugehoerigkeit wird serverseitig aufgeloest, nie aus
 * einem Parameter" (`CLAUDE.md`, „Zugriffsschutz"). Zusaetzlich bliebe bei jedem Abbruch
 * zwischen Schritt 1 und 2 eine verwaiste `dateien`-Zeile ohne `nachweise`-Eintrag zurueck. Ein
 * einziger Handler, der Zugriffsrecht, Aufgabenzugehoerigkeit, Untergrenzen-Regel, Ablage UND
 * den `nachweise`-Insert traegt, hat GENAU EINE Vertrauensgrenze — dieselbe, die die Server
 * Action vorher hatte.
 *
 * DER RIEGEL STEHT IN DER ROUTE SELBST (`CLAUDE.md`, Falle 55): Route Handler haben KEIN Layout
 * ueber sich, ein Vitest-Test sieht ein fehlendes Gate strukturell nicht. Diese Datei loest
 * Sitzung, Person, Aufgabe UND Berechtigung deshalb selbst auf — `auth()` direkt, NICHT
 * `personFuerSession` (`_lib/zugang.ts`): jene wirft `notFound()` (next/navigation), gebaut fuer
 * Seiten, deren Wurf Next waehrend des Renderns faengt. Ein Route Handler rendert nicht — der
 * Wurf liesse hier einen unbehandelten 500 durchschlagen, wo eine saubere `Response` stehen soll.
 * Dieselbe Ueberlegung wie in `a/[id]/nachweis/[nachweisId]/route.ts`s Kopfkommentar.
 *
 * `id` KOMMT AUS DER URL, NICHT AUS DEM FORMULAR: die Vorgaenger-Action nahm `aufgabeId` als
 * verstecktes Feld entgegen — bei einem Route Handler unter `a/[id]/...` ist der URL-Parameter
 * die naheliegendere UND die staerkere Quelle (ein manipuliertes Formularfeld haette dort nie
 * gewirkt, ein manipulierter Pfad wird ohnehin gegen die DB geprueft).
 *
 * KEIN ZWEITER GRENZWERT: Groesse und MIME kommen ausschliesslich aus `_lib/ablage.ts`
 * (`NACHWEIS_MAX_BYTES`, `legeNachweisAb`s eigene Magic-Byte-Pruefung) — in Aufgabe 14 war eine
 * zweite, von Hand nachgebaute Fassung derselben Bedingung die Ursache dafuer, dass ein
 * Sicherheitsriegel zur Haelfte unbewacht war. Die fruehe `content-length`-Pruefung unten IST
 * KEINE zweite Grenze: sie vergleicht denselben importierten `NACHWEIS_MAX_BYTES`-Wert (plus
 * einem benannten Multipart-Rand) und ist nur ein FRueher Verzicht auf das Puffern einer
 * Anfrage, die ohnehin nie durchkommt — die massgebliche Entscheidung bleibt `legeNachweisAb`s
 * Pruefung der TATSAECHLICH gelesenen Bytes. Ohne den Server-Action-Deckel (1 MB) ist diese Route
 * die einzige Bremse gegen eine Anfrage, die absichtlich Gigabytes in den Speicher schiebt, bevor
 * irgendetwas sie ablehnt — der Server-Action-Weg brauchte das nicht, weil Next dort schon bei
 * 1 MB kappte.
 *
 * KEINE VERLAUFSZEILE, KEIN `await` AUF DAS SCANERGEBNIS: unveraendert aus der Vorgaenger-Action
 * uebernommen (Kopfkommentar dort, `git log` bei Bedarf).
 */
import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { getDb } from "../../../../_db/client";
import { aufgabe, erstelleDatei, erstelleNachweis, personNachSub } from "../../../../_db/queries";
import { newId } from "../../../../_db/schema";
import { legeNachweisAb, NACHWEIS_MAX_BYTES } from "../../../../_lib/ablage";
import { isoTag } from "../../../../_lib/datum";
import { starteAufgabenScanArbeiter } from "../../../../_lib/scan";
import { darfNachweisHochladen } from "../../../../_lib/zugang";
import type { FormState } from "../../../../_lib/formState";

const JSON_KOPF = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
} as const;

function antwort(status: number, koerper: FormState): Response {
  return new Response(JSON.stringify(koerper), { status, headers: JSON_KOPF });
}

/**
 * Zugriffsablehnungen (keine Sitzung, keine Personen-Zeile, unbekannte Aufgabe, kein Recht, kein
 * `in_arbeit`) ANTWORTEN OHNE JSON-Rumpf, DIESELBE 404-Linie wie die Auslieferungsroute
 * (`a/[id]/nachweis/[nachweisId]/route.ts`s `zustand()`): das sind Faelle, die ueber die
 * Oberflaeche nicht erreichbar sein sollten (der Knopf steht nur, wenn `darfNachweisHochladen`
 * bereits serverseitig bejaht wurde, `_lib/aktionsOptionen.ts`), keine regulaeren Feldfehler. Der
 * Client unterscheidet sie ueber `response.ok`/den fehlenden JSON-Rumpf vom Feldfehler-Pfad.
 */
function keinZugriff(): Response {
  return new Response(null, { status: 404 });
}

/** Wortgleich mit `actions.ts`s privatem Helfer — ein Import ueber die `"use server"`-Grenze
 * eines Server-Action-Moduls ist nicht moeglich (jeder Export dort waere selbst eine Aktion). */
function feld(formData: FormData, name: string): string {
  const wert = formData.get(name);
  return typeof wert === "string" ? wert : "";
}

/**
 * Rand fuer Multipart-Grenzen, Feldnamen und den Text-Feldinhalt — KEINE zweite Groessengrenze
 * (s. Kopfkommentar), nur die Toleranz um `NACHWEIS_MAX_BYTES` herum, innerhalb derer eine Anfrage
 * ueberhaupt gepuffert wird.
 */
const MULTIPART_UEBERHANG_BYTES = 64 * 1024;

function inhaltZuGross(headers: Headers): boolean {
  const roh = headers.get("content-length");
  if (roh === null) return false;
  const bytes = Number(roh);
  return Number.isFinite(bytes) && bytes > NACHWEIS_MAX_BYTES + MULTIPART_UEBERHANG_BYTES;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth();
  const sub = session?.user?.id;
  if (!sub) return keinZugriff();

  const db = getDb();
  const person = personNachSub(db, sub);
  if (!person) return keinZugriff();

  const { id } = await params;
  const task = aufgabe(db, id);
  if (!task) return keinZugriff();

  const heute = isoTag(new Date());
  // DIESELBE VORAUSSETZUNG WIE DIE VORGAENGER-ACTION (Kopfkommentar `_lib/zugang.ts`s
  // `darfNachweisHochladen`): der Zustand `in_arbeit` steht NEBEN dem Praedikat, nicht darin.
  if (task.status !== "in_arbeit" || !darfNachweisHochladen(person, task, heute)) {
    return keinZugriff();
  }

  if (inhaltZuGross(req.headers)) {
    return antwort(413, {
      ok: false,
      fieldErrors: { datei: `Die Datei ist zu groß, erlaubt sind höchstens ${NACHWEIS_MAX_BYTES} Bytes.` },
      values: { text: "" },
    });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return antwort(400, { ok: false, fieldErrors: {}, values: { text: "" } });
  }

  const text = feld(formData, "text").trim();
  const dateiFeld = formData.get("datei");
  const hatDatei = dateiFeld instanceof File && dateiFeld.size > 0;

  // DIE UNTERGRENZEN-REGEL (Spec §5.3), wortgleich mit der Vorgaenger-Action uebernommen.
  const fieldErrors: Record<string, string> = {};
  if (task.nachweisArt === "bild" && !hatDatei) {
    fieldErrors.datei = "Für diese Aufgabe ist ein Bild erforderlich.";
  }
  if (task.nachweisArt === "text" && text === "") {
    fieldErrors.text = "Für diese Aufgabe ist ein Text erforderlich.";
  }
  if (Object.keys(fieldErrors).length > 0) {
    return antwort(400, { ok: false, fieldErrors, values: { text } });
  }

  let dateiId: string | null = null;
  if (hatDatei) {
    const datei = dateiFeld as File;
    const bytes = new Uint8Array(await datei.arrayBuffer());
    const neueId = newId();
    const befund = await legeNachweisAb(neueId, datei.name, bytes, NACHWEIS_MAX_BYTES);
    if (!befund.ok) {
      return antwort(400, { ok: false, fieldErrors: { datei: befund.meldung }, values: { text } });
    }
    erstelleDatei(db, {
      id: neueId,
      aufgabeId: task.id,
      dateiname: datei.name,
      mime: befund.mime,
      groesse: befund.groesse,
    });
    dateiId = neueId;
  }

  erstelleNachweis(db, {
    aufgabeId: task.id,
    art: task.nachweisArt,
    text: text === "" ? null : text,
    dateiId,
    erstelltVon: person.id,
  });

  // FIRE-AND-FORGET, NICHT AWAITEN — Vertragspunkt aus Aufgabe 18 (Kopfkommentar oben).
  if (dateiId !== null) starteAufgabenScanArbeiter(db);

  // Dasselbe Ziel wie `actions.ts`s privater `revalidate()`-Helfer — ein Import ueber die
  // `"use server"`-Grenze ist nicht moeglich, deshalb hier wortgleich wiederholt (kein
  // Sicherheitsriegel, nur ein Pfad-Literal: `git log` fuer den Vorgaenger-Wortlaut).
  revalidatePath("/m/aufgaben", "layout");

  return antwort(200, { ok: true });
}
