// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";
import type { TestDb } from "../../_db/testdb";
import { migrierteTestDb } from "../../_db/testdb";
import { lagerorte, tokens } from "../../_db/schema";
import { HANDLAGER_ID } from "../../_lib/konstanten";

/**
 * DIE ZIELWAHL AM REGAL — DRK-300, die Seite.
 *
 * Was hier steht und nirgends sonst:
 *
 *   - „Kein Fahrzeug — Verbrauch" ist eine EIGENE Zeile in derselben Liste.
 *     Das ist die Betreiberentscheidung des Tickets: Verbrauch wird GEWÄHLT,
 *     nicht durch Nichtstun erreicht. Fehlte die Zeile, gäbe es am Regal keinen
 *     Weg mehr, etwas ohne Fahrzeug zu entnehmen.
 *   - STILLGELEGTE Fahrzeuge stehen nicht in der Liste. Sie anzubieten hieße,
 *     eine Wahl anzubieten, die die Buchung danach ablehnt.
 *   - `returnTo` wandert in JEDES Formular — sonst steht die Person nach der
 *     Wahl auf der Artikelliste statt vor ihrem Regalfach.
 *   - Ein FREMDES `returnTo` wird nicht weitergereicht (Open-Redirect-Schutz);
 *     die Seite ist mit einem laminierten Kärtchen erreichbar.
 */

const { GUELTIGES_COOKIE, LAEUFT_AB } = vi.hoisted(() => ({
  GUELTIGES_COOKIE: "cookie-gueltig",
  LAEUFT_AB: new Date("2026-08-04T17:00:00.000Z"),
}));

vi.mock("../../_lib/helferSitzung", () => ({
  HELFER_COOKIE: "helfer_session",
  verifyHelferSitzung: async (wert: string) =>
    wert === GUELTIGES_COOKIE ? { tokenId: "tk1", laeuftAb: LAEUFT_AB } : null,
}));

let zielCookie: string | undefined;

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "lagerbuch.localtest.me" }),
  cookies: async () => ({
    get: (name: string) => {
      if (name === "helfer_session") return { name, value: GUELTIGES_COOKIE };
      if (name === "helfer_ziel" && zielCookie !== undefined) return { name, value: zielCookie };
      return undefined;
    },
  }),
}));

vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../../_db/client", () => ({ getDb: () => t.db }));

/*
 * Die Action wird ersetzt: ein "use server"-Modul zöge seinen eigenen DB-Öffner
 * mit.
 *
 * ⚠️ SIE IST IM MARKUP NICHT NACHWEISBAR — gemessen: React DOM rendert eine
 * `action`-FUNKTION nicht als Attribut, das gerenderte `<form>` trägt gar kein
 * `action`. Die Bindung ans richtige Ziel hält deshalb der Typecheck, und was
 * beim Absenden wirklich passiert, sieht nur Playwright. Wer hier ein
 * `expect(form.getAttribute("action"))` ergänzt, prüft `null` gegen `null`.
 */
vi.mock("../../_actions/entnahmeZiel", () => ({
  waehleEntnahmeZiel: () => {},
}));

vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; children: ReactNode }) => (
    <div data-rolle="rahmen" data-aktiv={p.aktiv}>{p.children}</div>
  ),
}));

import ZielSeite from "./page";
import { mount, unmount, query, queryAll } from "@/app/m/qr/_lib/test-dom";

let t: TestDb;

const WAHL = "[data-rolle='ziel-wahl']";

/** Eine Zeile je Wahl: der sichtbare Text und der mitgeschickte Wert. */
function wahlen() {
  return queryAll(WAHL).map((el) => ({
    text: el.textContent ?? "",
    wert: el.querySelector<HTMLInputElement>("input[name='ziel']")?.value,
    returnTo: el.querySelector<HTMLInputElement>("input[name='returnTo']")?.value,
    aktuell: el.getAttribute("data-aktuell"),
  }));
}

beforeEach(() => {
  zielCookie = undefined;
  t = migrierteTestDb("lagerbuch-ziel-seite-");
  t.db.insert(tokens).values({
    id: "tk1", code: "482-137", label: "RTW 1", aktiv: true,
    createdAt: new Date(), createdBy: "u-1",
  }).run();
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, kennung: "HH-DRK 1" },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
  ]).run();
});

afterEach(async () => {
  await unmount();
  t.schliessen();
});

async function zeige(returnTo = "/a/art-1") {
  await mount(await ZielSeite({ searchParams: Promise.resolve({ returnTo }) }));
}

describe("Die Zielwahl", () => {
  it("bietet Verbrauch und jedes AKTIVE Fahrzeug an — und sonst nichts", async () => {
    await zeige();

    const w = wahlen();
    expect(w.map((z) => z.wert)).toEqual(["verbrauch", "fz:fz-1", "fz:fz-2"]);
    // Der Verbrauch steht OBEN und heißt nach dem, was er bewirkt.
    expect(w[0]!.text).toContain("Kein Fahrzeug");
    expect(w[1]!.text).toContain("RTW 1");
    // Die Kennung hilft beim Unterscheiden zweier gleich benannter Wagen.
    expect(w[1]!.text).toContain("HH-DRK 1");
    // ⚠️ Ein stillgelegtes Fahrzeug anzubieten hieße, eine Wahl anzubieten,
    // die die Buchung danach ablehnt.
    expect(w.some((z) => z.text.includes("RTW alt"))).toBe(false);
    // Das Handlager ist kein Ziel — es ist die Quelle.
    expect(w.some((z) => z.wert === `fz:${HANDLAGER_ID}`)).toBe(false);
  });

  it("schickt jede Wahl abschickbar ab und nimmt den Rückweg mit", async () => {
    await zeige("/a/art-42");

    for (const z of wahlen()) {
      expect(z.returnTo, z.wert).toBe("/a/art-42");
    }
    // ⚠️ Jede Wahl ist ein FORMULAR mit einem Absendeknopf, kein Link: eine
    // Server Component kann kein Cookie setzen, und ein Link auf einen
    // GET-Handler wäre ein zustandsändernder GET, den jeder Prefetch auslöst.
    // Dass das Formular an DIE Action gebunden ist, hält der Typecheck — React
    // rendert eine Action-Funktion nicht ins Markup.
    const wahlElemente = queryAll(WAHL);
    expect(wahlElemente.length).toBeGreaterThan(0);
    for (const el of wahlElemente) {
      expect(el.tagName).toBe("FORM");
      expect(el.querySelector("button[type='submit']")).not.toBeNull();
    }
  });

  it("markiert die aktuelle Wahl — sonst wählt man blind neu", async () => {
    zielCookie = "fz:fz-2";
    await zeige();

    const w = wahlen();
    expect(w.find((z) => z.wert === "fz:fz-2")!.aktuell).toBe("ja");
    expect(w.filter((z) => z.aktuell === "ja")).toHaveLength(1);
  });

  it("markiert auch die ausdrückliche Verbrauchswahl", async () => {
    // ⚠️ Der Träger der Drei-Zustände-Zusage AUF DER SEITE: „Verbrauch" ist
    // eine getroffene Wahl und muss als getroffen zu sehen sein.
    zielCookie = "verbrauch";
    await zeige();
    expect(wahlen().find((z) => z.wert === "verbrauch")!.aktuell).toBe("ja");
  });

  it("markiert NICHTS, solange nichts gewählt wurde", async () => {
    await zeige();
    expect(wahlen().filter((z) => z.aktuell === "ja")).toEqual([]);
  });

  it("reicht ein FREMDES `returnTo` nicht weiter", async () => {
    // Ohne `sanitizeReturnTo` stünde das fremde Ziel im Formular und die Action
    // bekäme es als Umleitung vorgelegt.
    await zeige("//boese.example");
    for (const z of wahlen()) expect(z.returnTo).toBe("/helfer");
  });

  it("bleibt im Helfer-Rahmen, damit der Weg zurück erreichbar ist", async () => {
    await zeige();
    expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("entnahme");
  });
});
