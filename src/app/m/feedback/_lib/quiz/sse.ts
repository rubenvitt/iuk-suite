import { abonniere } from "./verteiler";

export const HERZSCHLAG_MS = 15_000;

const KOPFZEILEN = {
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-cache, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * Server-Sent-Events-Antwort für eine Runde. `sicht` liest den aktuellen Stand
 * (oder `null`, wenn die Runde beendet ist). Sendet sofort den Stand, danach bei
 * jeder Meldung des Verteilers und alle 15 s einen Herzschlag.
 */
export function sseAntwort(
  signal: AbortSignal,
  rundeId: number,
  sicht: () => unknown | null,
): Response {
  const enc = new TextEncoder();
  let aufraeumen: () => void = () => {};

  // Vorab prüfen, damit ein voller Verteiler ein 503 ohne Strom ergibt.
  let senden: () => void = () => {};
  const abmelden = abonniere(rundeId, () => senden());
  if (!abmelden) return new Response(null, { status: 503 });

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let offen = true;
      let herzschlag: ReturnType<typeof setInterval> | null = null;

      const schliessen = () => {
        if (!offen) return;
        offen = false;
        if (herzschlag) clearInterval(herzschlag);
        abmelden();
        signal.removeEventListener("abort", schliessen);
        try {
          controller.close();
        } catch {
          // schon geschlossen/abgebrochen
        }
      };
      aufraeumen = () => {
        if (!offen) return;
        offen = false;
        if (herzschlag) clearInterval(herzschlag);
        abmelden();
        signal.removeEventListener("abort", schliessen);
      };

      const schreibe = (text: string) => {
        try {
          controller.enqueue(enc.encode(text));
        } catch {
          aufraeumen();
        }
      };

      const sende = () => {
        if (!offen) return;
        try {
          const s = sicht();
          if (s === null) {
            schreibe("event: ende\ndata: {}\n\n");
            schliessen();
            return;
          }
          schreibe(`data: ${JSON.stringify(s)}\n\n`);
        } catch {
          schliessen();
        }
      };
      senden = sende;

      if (signal.aborted) {
        schliessen();
        return;
      }
      signal.addEventListener("abort", schliessen);
      herzschlag = setInterval(() => schreibe(": ping\n\n"), HERZSCHLAG_MS);
      sende();
    },
    cancel() {
      aufraeumen();
    },
  });

  return new Response(stream, { headers: KOPFZEILEN });
}
