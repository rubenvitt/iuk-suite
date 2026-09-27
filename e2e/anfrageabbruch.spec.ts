import { test, expect } from "@playwright/test";
import net from "node:net";
import { E2E_PORT } from "./fixtures";

/**
 * Ein Client, der mitten in einer POST-Anfrage abbricht, darf die Suite nicht beenden (DRK-481).
 *
 * Gefunden im Job `e2e (uav)`: nach dem ersten Test meldete der Server `Error: aborted`
 * (ECONNRESET) als uncaughtException, der Netzhaken beendete den Prozess, und alle folgenden
 * Tests liefen gegen einen toten Port. Die Ursache sitzt in next (Körpertausch nach dem Proxy,
 * `pnpm-workspace.yaml`, Patch an next), nicht in einer Route — deshalb geht dieser Fall auf
 * `/` des Portals, eine Seite, die keinen Körper liest. Gegen den gebauten Stand genügten dort
 * ungepatcht zwei Versuche; `src/next-anfrageabbruch.test.ts` belegt den Mechanismus.
 *
 * ⚠️ NUR DER GEBAUTE STAND BEWEIST ETWAS: unter `next dev` blieb der Server auch ungepatcht in
 * 40 von 40 Versuchen stehen. Lokal grün heißt hier nichts — `pnpm e2e:gebaut` fährt den CI-Weg.
 *
 * Roher Socket statt `request.post`: nur so kommt der RST, solange die Antwort noch aussteht —
 * so wie beim Telefon im Funkloch oder beim Seitenwechsel mitten im Upload.
 */
const HOST = `portal.localtest.me:${E2E_PORT}`;
const VERSUCHE = 40;

function postMitAbbruch(wartenMs: number): Promise<void> {
  return new Promise((fertig) => {
    const socket = net.connect(E2E_PORT, "127.0.0.1", () => {
      socket.write(
        `POST / HTTP/1.1\r\nHost: ${HOST}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`,
      );
      setTimeout(() => socket.resetAndDestroy(), wartenMs);
    });
    socket.on("error", () => {});
    socket.on("close", () => fertig());
  });
}

test("abgebrochene POST-Anfragen lassen den Server stehen", async ({ request }) => {
  // Warmlauf (Falle 10): unter `next dev` wäre der erste Treffer sonst die Übersetzung.
  expect((await request.get(`http://${HOST}/api/health`)).status()).toBe(200);
  for (let i = 0; i < VERSUCHE; i++) {
    // Wechselnde Wartezeit: der RST soll mal vor, mal während der Arbeit der Seite ankommen.
    await postMitAbbruch(i % 10);
    const antwort = await request.get(`http://${HOST}/api/health`);
    expect(antwort.status(), `Server nach ${i + 1} abgebrochenen Anfragen nicht mehr erreichbar`).toBe(200);
  }
});
