import { abonniere } from "./verteiler";

export const HERZSCHLAG_MS = 15_000;
/** So viele ungelesene Ereignisse (samt Herzschlag) darf ein Strom vor sich herschieben. */
const WARTESCHLANGE = 8;

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

  const stream = new ReadableStream<Uint8Array>(
    {
      start(controller) {
        let offen = true;
        let herzschlag: ReturnType<typeof setInterval> | null = null;

        aufraeumen = () => {
          if (!offen) return;
          offen = false;
          if (herzschlag) clearInterval(herzschlag);
          abmelden();
          signal.removeEventListener("abort", schliessen);
        };
        function schliessen() {
          if (!offen) return;
          aufraeumen();
          try {
            controller.close();
          } catch {
            // schon geschlossen/abgebrochen
          }
        }

        const schreibe = (text: string) => {
          try {
            controller.enqueue(enc.encode(text));
          } catch {
            aufraeumen();
          }
        };

        const sende = () => {
          if (!offen) return;
          // LANGSAMER LESER: die Warteschlange ist voll, der Client kommt nicht nach. Weiter
          // einreihen hieße Speicher für einen, der veraltete Stände liest. Schließen: `EventSource`
          // verbindet neu, und das erste Ereignis danach ist ohnehin der volle Stand.
          if (controller.desiredSize !== null && controller.desiredSize <= 0) {
            schliessen();
            return;
          }
          try {
            const s = sicht();
            if (s === null) {
              schreibe("event: ende\ndata: {}\n\n");
              schliessen();
              return;
            }
            schreibe(`data: ${JSON.stringify(s)}\n\n`);
          } catch (fehler) {
            // Einmal je Strom: danach ist er zu.
            console.error(`[feedback][quiz] Sicht der Runde ${rundeId} fehlgeschlagen:`, fehler);
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
    },
    // Ein paar Ereignisse Luft, bevor ein Leser als „kommt nicht nach" gilt (`sende`).
    new CountQueuingStrategy({ highWaterMark: WARTESCHLANGE }),
  );

  return new Response(stream, { headers: KOPFZEILEN });
}
