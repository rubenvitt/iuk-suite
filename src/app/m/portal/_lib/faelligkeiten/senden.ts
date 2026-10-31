/**
 * AN NTFY SENDEN — als JSON an die Wurzel des Servers, nicht mit Kopfzeilen an `/<thema>`.
 *
 * Warum JSON: Titel und Text tragen Umlaute und „…", und `fetch` lehnt Kopfzeilen außerhalb von
 * Latin-1 ab. Im JSON-Körper ist UTF-8 einfach Text.
 *
 * Kein `"use client"`.
 */
import type { PushNachricht } from "./nachricht";
import type { SendeZiel } from "./konfiguration";

/** Lange genug für einen trägen Container, kurz genug, dass ein hängender Versand den Takt nicht staut. */
export const SENDE_TIMEOUT_MS = 10_000;

export async function sendeAnNtfy(
  ziel: SendeZiel,
  nachricht: PushNachricht,
  holen: typeof fetch = fetch,
): Promise<void> {
  const antwort = await holen(`${ziel.basis}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${ziel.token}` },
    body: JSON.stringify({ topic: ziel.thema, ...nachricht }),
    signal: AbortSignal.timeout(SENDE_TIMEOUT_MS),
  });
  if (!antwort.ok) {
    // Den Körper nicht ins Log: ntfy antwortet mit JSON, das Thema kann darin stehen.
    throw new Error(`ntfy antwortete mit HTTP ${antwort.status}`);
  }
}
