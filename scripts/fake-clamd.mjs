#!/usr/bin/env node
/**
 * Ein einschaltbarer Fake-clamd — EIN Werkzeug für drei Zwecke (Spec §6.8):
 * Vitest (`_lib/av.test.ts`), `pnpm dev:av` und Playwright (zweiter
 * `webServer`-Eintrag). Zwei Fakes wären zwei Wahrheiten über das Protokoll,
 * und die Auswertung in `_lib/av.ts` hängt am Transport (§6.3.3).
 *
 * Warum ein Fake und kein clamav-Sidecar im E2E-Aufbau: gescannt wird per PFAD
 * (`zSCAN`), und der Pfad lautet lokal `./.data/e2e/files/…`. Für einen echten
 * Container ist er unsichtbar; der Fake läuft auf derselben Maschine mit
 * demselben Arbeitsverzeichnis. Ohne erreichbaren Scanner erreicht wegen
 * fail-closed (§6.3) KEINE Datei je `clean` — das Modul wäre lokal unbenutzbar,
 * und zwar still.
 *
 * Vier Modi: `ok | found | error | haengt`.
 *
 * Der Modus wird bei JEDER Verbindung neu gelesen, nicht beim Prozessstart
 * (Plan-Festlegung H). Grund: Playwright startet den Fake einmal je Lauf
 * (`workers: 1`), und ein Lauf braucht `ok` (T35, T38/T43) UND `error` (T47) —
 * T47 sogar `clean` und `scanning` in EINEM Share. Ein Startwert allein macht
 * T47 unausführbar, und damit fiele die Zusage „fail-closed ist nachweislich
 * erreichbar", die §6.3 für nicht verhandelbar erklärt.
 *
 * Quellenfolge: Modusdatei (`FAKE_CLAMD_MODUS_DATEI`) → `FAKE_CLAMD_MODUS` →
 * `ok`. Ein UNBEKANNTER Inhalt fällt nicht still auf `ok` zurück, sondern gilt
 * als `error` und wird einmal je Wert laut gemeldet: sonst ist ein Tippfehler in
 * einem Testhelfer ein grüner Testlauf mit der falschen Zusage.
 */
import { createServer } from "node:net";
import { open, readFile } from "node:fs/promises";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT ?? 3310);
const MODUS_DATEI = process.env.FAKE_CLAMD_MODUS_DATEI ?? "./.data/fake-clamd-modus";
const MODI = ["ok", "found", "error", "haengt"];
const START_MODUS = (process.env.FAKE_CLAMD_MODUS ?? "").trim();

/** Die Signatur, die der `found`-Modus meldet — dieselbe, die clamav für EICAR liefert. */
const SIGNATUR = "Win.Test.EICAR_HDB-1";

/**
 * Die gemessene Antwort einer Übergrösse — OHNE `stream:`-Präfix. Genau daran
 * scheitert eine Auswertung, die auf das Präfix baut (§6.3.3), deshalb ist sie
 * hier der `error`-Modus und nicht irgendeine Fehlerzeile.
 */
const FEHLER_ANTWORT = "INSTREAM size limit exceeded. ERROR";

/** Nur bis 64 KiB lesen: der Zugriff ist der Gegenstand, nicht der Inhalt. */
const LESE_BYTES = 64 * 1024;

/** Je unbekanntem Wert EINE Meldung — nicht eine pro Prozess: der zweite Tippfehler wäre sonst still. */
const gemeldet = new Set();

function meldeUnbekannt(quelle, wert) {
  const schluessel = `${quelle}=${wert}`;
  if (!gemeldet.has(schluessel)) {
    gemeldet.add(schluessel);
    console.error(
      `[fake-clamd] unbekannter Modus "${wert}" (aus ${quelle}). Es gilt "error", NICHT "ok" — ` +
        `ein stiller Rückfall machte aus diesem Tippfehler einen grünen Testlauf. ` +
        `Erlaubt: ${MODI.join(" | ")}.`,
    );
  }
  return "error";
}

async function ermittleModus() {
  let ausDatei = "";
  try {
    ausDatei = (await readFile(MODUS_DATEI, "utf8")).trim();
  } catch {
    // Keine Modusdatei ist der Normalfall in `pnpm dev` — dann gilt der Startwert.
    ausDatei = "";
  }
  if (ausDatei !== "") {
    return MODI.includes(ausDatei) ? ausDatei : meldeUnbekannt(MODUS_DATEI, ausDatei);
  }
  if (START_MODUS !== "") {
    return MODI.includes(START_MODUS) ? START_MODUS : meldeUnbekannt("FAKE_CLAMD_MODUS", START_MODUS);
  }
  return "ok";
}

/**
 * Der Pfad wird WIRKLICH gelesen (§6.8) — `access` allein würde als root
 * gelingen, wo `open` scheitert. Damit ist die Klasse „clamd sieht den Pfad
 * nicht" lokal überhaupt darstellbar: sie ist der häufigste Betriebsfehler des
 * Sidecars und ohne diesen Schritt hier unsichtbar.
 */
async function pfadLesbar(pfad) {
  let griff;
  try {
    griff = await open(pfad, "r");
    await griff.read(Buffer.alloc(LESE_BYTES), 0, LESE_BYTES, 0);
    return true;
  } catch {
    return false;
  } finally {
    await griff?.close().catch(() => {});
  }
}

async function antwortFuerScan(pfad) {
  const modus = await ermittleModus();
  if (modus === "haengt") return null;
  if (modus === "error") return FEHLER_ANTWORT;
  if (!(await pfadLesbar(pfad))) return `${pfad}: Can't access file ERROR`;
  return modus === "found" ? `${pfad}: ${SIGNATUR} FOUND` : `${pfad}: OK`;
}

async function beantworte(kommando, verbindung) {
  // Das `z`-Präfix ist optional zu lesen, damit ein Aufrufer, der (falsch) ohne
  // Präfix redet, eine Antwort und keine Stille bekommt — geschickt wird von
  // `_lib/av.ts` immer mit.
  const roh = kommando.startsWith("z") || kommando.startsWith("n") ? kommando.slice(1) : kommando;
  if (roh === "PING") {
    verbindung.end(`PONG\0`);
    return;
  }
  if (roh.startsWith("SCAN ")) {
    const antwort = await antwortFuerScan(roh.slice("SCAN ".length).trim());
    // `null` = Modus `haengt`: annehmen und schweigen. Die Verbindung bleibt
    // offen, damit die Zeitgrenze des Aufrufers der Gegenstand ist.
    if (antwort !== null) verbindung.end(`${antwort}\0`);
    return;
  }
  verbindung.end(`UNKNOWN COMMAND\0`);
}

const server = createServer((verbindung) => {
  let puffer = "";
  verbindung.on("data", (stueck) => {
    puffer += stueck.toString("utf8");
    // TCP kennt keine Nachrichtengrenzen: ein `zSCAN <pfad>\0` darf in zwei
    // Segmenten ankommen. Ohne diese Pufferung wäre der Fake für lange Pfade
    // sporadisch stumm — und drei Verbraucher hingen daran.
    let ende = puffer.indexOf("\0");
    while (ende >= 0) {
      const kommando = puffer.slice(0, ende);
      puffer = puffer.slice(ende + 1);
      void beantworte(kommando, verbindung);
      ende = puffer.indexOf("\0");
    }
  });
  // Ein Abbruch des Aufrufers (Zeitgrenze, `socket.destroy()` in jedem Ausgang)
  // ist der Normalfall und darf den Fake nicht beenden.
  verbindung.on("error", () => {});
});

server.on("error", (fehler) => {
  console.error(`[fake-clamd] konnte nicht lauschen: ${fehler.message}`);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const { port } = server.address();
  // Diese Zeile ist die Bereitschaftsmeldung: `av.test.ts` liest den Port
  // daraus (`PORT=0`), und in `pnpm dev:av` ist sie die Antwort auf „läuft er?".
  console.log(
    `[fake-clamd] lauscht auf ${HOST}:${port} — Modusdatei ${MODUS_DATEI}, Startwert "${START_MODUS || "ok"}"`,
  );
});
