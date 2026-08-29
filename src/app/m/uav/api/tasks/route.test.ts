import { describe, it, expect, beforeEach, vi } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";

/*
 * DER KATALOG IST OHNE ANMELDUNG LESBAR — und das ist der Prüfgegenstand.
 *
 * Bis zum 2026-08-29 wies diese Route jeden anonymen Aufruf mit 401 ab. Die
 * Betreiberentscheidung dreht das um: der Aufgabenkatalog soll sich auf einem
 * geteilten Tablet ohne jeden Code durchblättern lassen (nur lesen). Die drei
 * Grenzen daneben bleiben und stehen deshalb hier mit im Test: der Host-Riegel
 * greift weiterhin, inaktive Aufgaben kommen nicht mit, und die
 * Verwaltungsrouten bleiben gesperrt.
 */
const DIR = "./.data/uav-tasks-route-test";
vi.mock("@/core/auth", () => ({ auth: async () => null }));

beforeEach(async () => {
  rmSync(DIR, { recursive: true, force: true });
  process.env.DATA_DIR = DIR;
  process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
  delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
  migrateAllModules();
  const { getDb } = await import("../../_db/client");
  const q = await import("../../_lib/queries");
  q.taskAnlegen(getDb(), {
    teil: 1,
    nummer: "1.1",
    titel: "Vorflugkontrolle",
    lernziel: "",
    schritte: [],
    durchfuehrungshinweise: [],
    sicherheitshinweise: [],
    zielanzahlDefault: 3,
    aktiv: true,
  });
  const inaktiv = q.taskAnlegen(getDb(), {
    teil: 1,
    nummer: "1.2",
    titel: "Stillgelegt",
    lernziel: "",
    schritte: [],
    durchfuehrungshinweise: [],
    sicherheitshinweise: [],
    zielanzahlDefault: 1,
    aktiv: true,
  });
  q.taskAendern(getDb(), inaktiv.id, { aktiv: false });
});

const get = (host = "uav-training.iuk-ue.de") =>
  new Request("http://x/api/tasks", { headers: { host } });

describe("GET /api/tasks", () => {
  it("anonym: 200 mit dem Katalog — keine Anmeldung nötig", async () => {
    const { GET } = await import("./route");
    const res = await GET(get());
    expect(res.status).toBe(200);
    const liste = await res.json();
    expect(liste.map((t: { titel: string }) => t.titel)).toEqual(["Vorflugkontrolle"]);
  });

  it("anonym: eine deaktivierte Aufgabe kommt NICHT mit", async () => {
    const { GET } = await import("./route");
    const liste = await (await GET(get())).json();
    expect(liste.some((t: { titel: string }) => t.titel === "Stillgelegt")).toBe(false);
  });

  it("die Antwort trägt Trainingsinhalt, aber keine Teilnehmerangabe", async () => {
    const { GET } = await import("./route");
    const liste = await (await GET(get())).json();
    const felder = Object.keys(liste[0]).sort();
    // Positiv geprüft statt „enthält nicht": eine neue personenbezogene Spalte
    // fiele hier auf, eine Verbotsliste müsste sie erst kennen.
    expect(felder).toEqual(
      [
        "aktiv",
        "bildUrl",
        "durchfuehrungshinweise",
        "id",
        "lernziel",
        "nummer",
        "schritte",
        "sicherheitshinweise",
        "sortOrder",
        "teil",
        "titel",
        "zielanzahlDefault",
      ].sort(),
    );
  });

  it("fremder Host → 404 vor allem anderen", async () => {
    const { GET } = await import("./route");
    expect((await GET(get("iuk-ue.de"))).status).toBe(404);
  });

  it("die Verwaltungsroute bleibt für anonym gesperrt", async () => {
    // Die Gegenprobe zur Öffnung oben: geöffnet ist GENAU der Katalog.
    const { GET: ADMIN_GET } = await import("../admin/tasks/route");
    const res = await ADMIN_GET(new Request("http://x/api/admin/tasks", { headers: { host: "uav-training.iuk-ue.de" } }));
    // 403 aus `adminAbweisung()` (der Host stimmt ja, nur die Gruppe fehlt) —
    // die Zahl ist hier Nebensache, tragend ist, dass es KEINE 200 ist.
    expect(res.status).toBe(403);
  });
});
