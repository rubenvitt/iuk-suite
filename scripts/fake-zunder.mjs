#!/usr/bin/env node
/**
 * EIN ZUNDER-ERSATZ FÜR DIE E2E DES RÜCKMELDEWEGS (IDA-214).
 *
 * Spricht genau die Schnittstelle, die die Suite vom Zunder-Eingang erwartet
 * (`docs/superpowers/specs/2026-10-12-rueckmeldung-zunder-design.md`,
 * Abschnitt 4): `POST /intake/v1/tasks` mit `Authorization: Bearer zi_…`,
 * `201 {id, ref}` beim ersten Einwurf, `200` mit derselben Antwort bei einer
 * bekannten `external_id`.
 *
 * Dazu zwei Testgriffe, die es in Zunder nicht gibt:
 * - `GET /__test/einwuerfe` liefert alles Angenommene, damit die e2e prüfen
 *   kann, was wirklich ankam (Name ja, E-Mail nein, Pfad ohne Query).
 * - Ein Titel mit `[zunder-weg]` bekommt `503` — so lässt sich der Fehlerweg
 *   fahren, ohne den Prozess anzuhalten.
 *
 * `GET /healthz` für Playwrights Bereitschaftsprüfung.
 */
import { createServer } from "node:http";

const port = Number(process.env.PORT ?? 3103);
const token = process.env.FAKE_ZUNDER_TOKEN ?? "";
if (!token.startsWith("zi_")) {
  console.error("FAKE_ZUNDER_TOKEN fehlt oder ist kein Eingangs-Token (zi_…).");
  process.exit(1);
}

/** external_id → { id, ref, aufgabe } */
const einwuerfe = new Map();

function antworte(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body === undefined ? "" : JSON.stringify(body));
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");

  if (req.method === "GET" && url.pathname === "/healthz") return antworte(res, 200, { status: "ok" });
  if (req.method === "GET" && url.pathname === "/__test/einwuerfe") {
    return antworte(res, 200, [...einwuerfe.values()]);
  }
  if (req.method !== "POST" || url.pathname !== "/intake/v1/tasks") {
    return antworte(res, 404, { error: { code: "not_found", message: "Unbekannter Pfad" } });
  }
  if (req.headers.authorization !== `Bearer ${token}`) {
    return antworte(res, 401, { error: { code: "unauthorized", message: "Token ungültig" } });
  }

  let roh = "";
  req.on("data", (stueck) => (roh += stueck));
  req.on("end", () => {
    let aufgabe;
    try {
      aufgabe = JSON.parse(roh);
    } catch {
      return antworte(res, 400, { error: { code: "invalid_request", message: "Kein JSON" } });
    }
    if (typeof aufgabe.external_id !== "string" || typeof aufgabe.title !== "string") {
      return antworte(res, 400, { error: { code: "invalid_request", message: "Pflichtfeld fehlt" } });
    }
    if (aufgabe.title.includes("[zunder-weg]")) {
      return antworte(res, 503, { error: { code: "unavailable", message: "Testfall" } });
    }
    const bekannt = einwuerfe.get(aufgabe.external_id);
    if (bekannt) return antworte(res, 200, { id: bekannt.id, ref: bekannt.ref });
    const n = einwuerfe.size + 1;
    const eintrag = { id: `fake${String(n).padStart(20, "0")}`, ref: `IDAE-${n}`, aufgabe };
    einwuerfe.set(aufgabe.external_id, eintrag);
    return antworte(res, 201, { id: eintrag.id, ref: eintrag.ref });
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`fake-zunder lauscht auf http://127.0.0.1:${port}`);
});
