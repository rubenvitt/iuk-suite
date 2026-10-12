import type { ZunderEingang } from "@/core/rueckmeldung/eingang";
import type { ZunderAufgabe } from "@/core/rueckmeldung/vorlage";

/**
 * DER AUFRUF AN DEN ZUNDER-EINGANG (IDA-214, Konzept Abschnitt 4).
 *
 * `POST /intake/v1/tasks` mit dem Eingangs-Token. Zunder erkennt eine
 * Wiederholung an `external_id` und legt dann nichts doppelt an — deshalb darf
 * hier nach einem Netzfehler, einer Zeitüberschreitung oder einem `5xx`
 * genau einmal wiederholt werden.
 *
 * ⚠️ DIE MELDUNGEN SIND FÜR DIE PERSON VOR DEM FLYIN, NICHT FÜR DEN BETRIEB.
 * Was Zunder im Fehlerfall sagt, geht nicht in die Oberfläche (es kann
 * technische Namen enthalten); eine falsche Einrichtung (`401`, `409`) steht
 * stattdessen als Warnung im Serverlog.
 */

export type Einwurf = { ok: true; id: string; kennung: string } | { ok: false; grund: string };

export const NICHT_ERREICHBAR =
  "Die Rückmeldung konnte gerade nicht zugestellt werden. Dein Text bleibt stehen — versuch es gleich noch einmal.";
export const ZU_VIELE =
  "Gerade kommen sehr viele Rückmeldungen an. Versuch es in ein paar Minuten noch einmal.";
export const ABGELEHNT =
  "Die Rückmeldung wurde nicht angenommen. Prüf Titel und Beschreibung und versuch es noch einmal.";

export const ZEITLIMIT_MS = 8000;

type Antwort = { status: number; json: unknown } | "netz";

async function sende(
  eingang: ZunderEingang,
  aufgabe: ZunderAufgabe,
  holen: typeof fetch,
  zeitlimitMs: number,
): Promise<Antwort> {
  try {
    const antwort = await holen(`${eingang.basis}/intake/v1/tasks`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${eingang.token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(aufgabe),
      signal: AbortSignal.timeout(zeitlimitMs),
      cache: "no-store",
    });
    const json = await antwort.json().catch(() => null);
    return { status: antwort.status, json };
  } catch {
    return "netz";
  }
}

function kennungAus(json: unknown): { id: string; kennung: string } | null {
  const j = (json ?? {}) as Record<string, unknown>;
  const id = typeof j.id === "string" ? j.id : "";
  const ref = typeof j.ref === "string" ? j.ref : "";
  return id ? { id, kennung: ref || id } : null;
}

export async function wirfEin(
  eingang: ZunderEingang,
  aufgabe: ZunderAufgabe,
  {
    holen = fetch,
    zeitlimitMs = ZEITLIMIT_MS,
    warnen = console.warn,
  }: { holen?: typeof fetch; zeitlimitMs?: number; warnen?: (meldung: string) => void } = {},
): Promise<Einwurf> {
  let antwort = await sende(eingang, aufgabe, holen, zeitlimitMs);
  if (antwort === "netz" || antwort.status >= 500) {
    antwort = await sende(eingang, aufgabe, holen, zeitlimitMs);
  }
  if (antwort === "netz" || antwort.status >= 500) return { ok: false, grund: NICHT_ERREICHBAR };

  if (antwort.status === 200 || antwort.status === 201) {
    const kennung = kennungAus(antwort.json);
    if (kennung) return { ok: true, ...kennung };
    warnen("Zunder-Eingang: Antwort ohne Aufgaben-ID.");
    return { ok: false, grund: NICHT_ERREICHBAR };
  }
  if (antwort.status === 429) return { ok: false, grund: ZU_VIELE };
  if (antwort.status === 400) return { ok: false, grund: ABGELEHNT };

  // 401, 403, 404, 409 …: der Eingang ist falsch eingerichtet, nicht die Eingabe falsch.
  warnen(`Zunder-Eingang antwortet ${antwort.status}; Token oder Zielprojekt prüfen.`);
  return { ok: false, grund: NICHT_ERREICHBAR };
}
