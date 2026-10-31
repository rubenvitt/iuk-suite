/**
 * EINEN MANGEL MELDEN (IDA-298) — POST aus dem Helferbereich, multipart: Ort, angehakte Punkte,
 * Freitext, freiwilliger Name und bis zu drei Fotos.
 *
 * Eine Route statt einer Server Action, weil Fotos mitkommen: eine Server Action nimmt ohne eigene
 * Einstellung höchstens 1 MB an. Das Telefon verkleinert die Bilder vorher (`_ui/MangelFormular.tsx`);
 * die Grenze je Bild hier (`FOTO_MAX_BYTES`) fängt ab, was trotzdem groß ankommt.
 *
 * Zugang wie jede schreibende Helfer-Aktion: `requireHelferSchreibend` (Host, Kärtchen oder Lagerbuch-
 * Konto, Sperre aus der Datenbank). Jede Reichweite darf melden — ein Mangel ist keine Buchung, und wer
 * am Regal steht, sieht den kaputten Schrank genauso.
 *
 * Erst werden alle Fotos neu gerechnet, dann abgelegt, dann steht die Zeile. Scheitert ein Bild, gibt es
 * keine Meldung und keine Datei; scheitert erst das Schreiben der Zeile, bleiben höchstens Bilder ohne
 * Zeile liegen, die niemand ausliefert.
 */
import { withAuditContext } from "@/core/audit/server";
import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { newId } from "../../../_db/schema";
import { requireHelferSchreibend } from "../../../_lib/helferZugang";
import { lagerbuchHostOderNull } from "../../../_lib/host";
import { journalQuelle, zugangsAkteur } from "../../../_lib/zugangHerkunft";
import { bereinigePunkte, SONSTIGES } from "../../../_lib/maengel/checkliste";
import { legeMangelAn, meldeOrt } from "../../../_lib/maengel/daten";
import { FOTO_MAX_BYTES, legeFotoAb, MAX_FOTOS, rechneFotoNeu } from "../../../_lib/maengel/fotos";
import { BESCHREIBUNG_MAX, NAME_MAX, type MeldeAntwort } from "../../../_lib/maengel/meldung";

const KOPF = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } as const;

function antwort(status: number, koerper: MeldeAntwort): Response {
  return new Response(JSON.stringify(koerper), { status, headers: KOPF });
}

function fehler(status: number, text: string): Response {
  return antwort(status, { ok: false, fehler: text });
}

/** Eine fremde Seite darf hier nichts abschicken. Das Kärtchen-Cookie ist `lax`, das hier die zweite Linie. */
function fremdeHerkunft(req: Request): boolean {
  const herkunft = req.headers.get("origin");
  if (!herkunft) return false;
  try {
    return new URL(herkunft).host !== req.headers.get("host");
  } catch {
    return true;
  }
}

/** Großzügig: drei Bilder an der Grenze plus Formularfelder. */
const KOERPER_MAX = MAX_FOTOS * FOTO_MAX_BYTES + 256 * 1024;

function text(formData: FormData, name: string, max: number): string | null {
  const wert = formData.get(name);
  if (typeof wert !== "string") return null;
  const getrimmt = wert.trim().slice(0, max);
  return getrimmt === "" ? null : getrimmt;
}

/**
 * Den Körper lesen, aber nie mehr als `max` Bytes — `content-length` fehlt bei `fetch` mit FormData oft
 * oder kann lügen; gezählt wird deshalb beim Lesen (Vorbild `einsatzbuch/_lib/anbindung/koerper.ts`).
 */
async function begrenztGelesen(req: Request, max: number): Promise<Uint8Array<ArrayBuffer> | "zu_gross" | null> {
  const angegeben = req.headers.get("content-length");
  if (angegeben !== null && (!/^\d+$/.test(angegeben) || Number(angegeben) > max)) return "zu_gross";
  const reader = req.body?.getReader();
  if (!reader) return null;
  let bytes = 0;
  const teile: Uint8Array[] = [];
  try {
    while (true) {
      const teil = await reader.read();
      if (teil.done) break;
      bytes += teil.value.byteLength;
      if (bytes > max) {
        await reader.cancel();
        return "zu_gross";
      }
      teile.push(teil.value);
    }
  } catch {
    return null;
  }
  return new Uint8Array(Buffer.concat(teile));
}

export async function POST(req: Request): Promise<Response> {
  // Die nicht werfende Host-Probe zuerst (Falle 55): ein Route Handler hat keine Fehlerseite.
  if (lagerbuchHostOderNull(await headers()) === null) return new Response(null, { status: 404 });
  if (fremdeHerkunft(req)) return new Response(null, { status: 403 });
  const db = getDb();
  const zugang = await requireHelferSchreibend(db);
  if (!zugang.ok) return fehler(401, "Die Sitzung ist abgelaufen. Bitte das Etikett noch einmal scannen.");

  return withAuditContext({ actor: zugangsAkteur(zugang.zugang) }, async (): Promise<Response> => {
    const gelesen = await begrenztGelesen(req, KOERPER_MAX);
    if (gelesen === "zu_gross") return fehler(413, "Die Fotos sind zu groß.");

    let formData: FormData;
    try {
      if (gelesen === null) throw new Error("kein Körper");
      formData = await new Request(req.url, {
        method: "POST",
        headers: { "content-type": req.headers.get("content-type") ?? "" },
        body: gelesen,
      }).formData();
    } catch {
      return fehler(400, "Die Meldung kam nicht vollständig an. Bitte noch einmal senden.");
    }

    const roh = formData.get("ort");
    const ort = meldeOrt(db, typeof roh === "string" ? roh : null);
    if (!ort) return fehler(400, "Diesen Ort gibt es nicht mehr. Bitte das Etikett noch einmal scannen.");

    const punkte = bereinigePunkte(formData.getAll("punkt"), ort.art);
    const beschreibung = text(formData, "beschreibung", BESCHREIBUNG_MAX);
    const melderName = text(formData, "name", NAME_MAX);
    if (punkte.length === 0 && !beschreibung) {
      return antwort(400, { ok: false, fehler: "Bitte mindestens einen Punkt ankreuzen oder beschreiben, was los ist.", feld: "punkte" });
    }
    if (!beschreibung && punkte.length === 1 && punkte[0] === SONSTIGES) {
      return antwort(400, { ok: false, fehler: "Bitte kurz beschreiben, was los ist.", feld: "beschreibung" });
    }

    const dateien = formData.getAll("foto").filter((f): f is File => f instanceof File && f.size > 0);
    if (dateien.length > MAX_FOTOS) return antwort(400, { ok: false, fehler: `Höchstens ${MAX_FOTOS} Fotos.`, feld: "fotos" });
    const bilder: Buffer[] = [];
    for (const datei of dateien) {
      const neu = await rechneFotoNeu(new Uint8Array(await datei.arrayBuffer()));
      if (!neu) return antwort(400, { ok: false, fehler: "Ein Foto ließ sich nicht lesen. Bitte ein anderes wählen.", feld: "fotos" });
      bilder.push(neu);
    }

    const id = newId();
    for (const [nummer, bild] of bilder.entries()) await legeFotoAb(id, nummer, bild);
    legeMangelAn(db, {
      id,
      lagerortId: ort.id,
      punkte,
      beschreibung,
      melderName,
      quelle: journalQuelle(zugang.zugang),
      fotos: bilder.length,
      jetzt: new Date(),
    });
    return antwort(200, { ok: true });
  });
}
