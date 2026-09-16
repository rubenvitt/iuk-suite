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
 *   - „Keine Einheit — Verbrauch" ist eine EIGENE Zeile in derselben Liste.
 *     Das ist die Betreiberentscheidung des Tickets: Verbrauch wird GEWÄHLT,
 *     nicht durch Nichtstun erreicht. Fehlte die Zeile, gäbe es am Regal keinen
 *     Weg mehr, etwas ohne Fahrzeug zu entnehmen.
 *   - STILLGELEGTE Fahrzeuge stehen nicht in der Liste. Sie anzubieten hieße,
 *     eine Wahl anzubieten, die die Buchung danach ablehnt.
 *   - Die Wahlen sind EINE Radiogruppe, keine Knopfreihe. Das ist keine
 *     Stilfrage: `docs/design/README.md` verlangt sie „ohne Ausnahme" — ein
 *     Tabstop für die ganze Gruppe, Pfeiltasten wählen nativ. Als Knopfreihe
 *     wäre jedes Fahrzeug ein eigener Tabstop, und dass die Wahlen einander
 *     ausschließen, stünde nirgends.
 *   - `returnTo` fährt im Formular mit — sonst steht die Person nach der
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

/*
 * DRK-305 — das Kaertchen-Cookie ist ABSCHALTBAR, damit der Konto-Weg geprueft
 * werden kann. Vorgabe bleibt „da": jeder bestehende Test dieser Datei laeuft
 * unveraendert ueber das Kaertchen.
 */
let kaertchenCookie: string | undefined = GUELTIGES_COOKIE;

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ host: "lagerbuch.localtest.me" }),
  cookies: async () => ({
    get: (name: string) => {
      if (name === "helfer_session" && kaertchenCookie !== undefined) {
        return { name, value: kaertchenCookie };
      }
      if (name === "helfer_ziel" && zielCookie !== undefined) return { name, value: zielCookie };
      return undefined;
    },
  }),
}));

/*
 * DRK-305 — der zweite Weg in den Helfer-Ast, als Attrappe. `viewerOderNull`
 * ruft `auth()` und braucht dafuer Sitzung, Konfiguration und Request;
 * `merkeNutzer` schreibt in `users`. Standardmaessig LEER — sonst entschiede
 * die Reihenfolge der Riegel, welcher Weg geprueft wird.
 */
let angemeldet: { sub: string; groups: string[]; name: string | null; email: null } | null = null;
vi.mock("../../_lib/zugang", () => ({
  viewerOderNull: async () => angemeldet,
  istLagerbuchAdmin: (v: { groups: string[] } | null) => !!v?.groups.includes("lagerbuch"),
}));
vi.mock("../../_lib/konto", () => ({ merkeNutzer: () => {} }));

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

/** Eine Zeile je Wahl: der sichtbare Text, der Wert und ob sie vorgewählt ist. */
function wahlen() {
  return queryAll(WAHL).map((el) => {
    const knopf = el.querySelector<HTMLInputElement>("input[type='radio'][name='ziel']");
    return {
      text: el.textContent ?? "",
      wert: knopf?.value,
      aktuell: knopf?.defaultChecked ? "ja" : null,
    };
  });
}

/** Das eine Formular, in dem die ganze Gruppe steckt. */
function formular() {
  return query<HTMLFormElement>("[data-rolle='ziel-formular']");
}

beforeEach(() => {
  zielCookie = undefined;
  kaertchenCookie = GUELTIGES_COOKIE;
  angemeldet = null;
  t = migrierteTestDb("lagerbuch-ziel-seite-");
  t.db.insert(tokens).values({
    id: "tk1", code: "482-137", label: "RTW 1", aktiv: true,
    createdAt: new Date(), createdBy: "u-1",
  }).run();
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true, kennung: "HH-DRK 1",
      einheitenart: "fahrzeug" },
    { id: "fz-2", name: "MTW", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug" },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false,
      einheitenart: "fahrzeug" },
    /*
     * DRK-309 — eine TASCHE ohne Kennung und eine Einheit ohne zugeordnete
     * Art. Beide sind AKTIV: sie stehen in derselben Wahl wie die Fahrzeuge,
     * und genau dort entschied sich, ob sie unterscheidbar sind.
     */
    { id: "ta-1", name: "Rucksack Betreuung", typ: "fahrzeug", aktiv: true,
      einheitenart: "tasche" },
    { id: "offen-1", name: "Kiste 3", typ: "fahrzeug", aktiv: true },
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
    expect(w.map((z) => z.wert))
      .toEqual(["verbrauch", "fz:fz-1", "fz:fz-2", "fz:ta-1", "fz:offen-1"]);
    // Der Verbrauch steht OBEN und heißt nach dem, was er bewirkt.
    // DRK-309: NEUTRAL — die Liste darunter fuehrt Fahrzeuge UND Taschen.
    expect(w[0]!.text).toContain("Keine Einheit");
    expect(w[1]!.text).toContain("RTW 1");
    // Die Kennung hilft beim Unterscheiden zweier gleich benannter Wagen.
    expect(w[1]!.text).toContain("HH-DRK 1");
    /*
     * ⚠️ UND DIE ART TUT DASSELBE, WO ES KEINE KENNUNG GIBT (DRK-309,
     * Reviewrunde 2). Eine Tasche traegt kein Kennzeichen — mit der Kennung
     * allein stand in ihrer Meta-Zeile gar nichts, und „Rucksack Betreuung"
     * war von einem gleich benannten Fahrzeug nicht zu unterscheiden. Das
     * wiegt hier schwerer als anderswo: die Wahl gilt fuer ALLE weiteren
     * Entnahmen mit diesem Kaertchen.
     */
    expect(w[1]!.text).toContain("Fahrzeug · HH-DRK 1");
    expect(w.find((z) => z.wert === "fz:ta-1")!.text).toContain("Tasche");
    // Der Zwischenstand sagt, was er ist, statt zu schweigen.
    expect(w.find((z) => z.wert === "fz:offen-1")!.text).toContain("nicht zugeordnet");
    // ⚠️ Ein stillgelegtes Fahrzeug anzubieten hieße, eine Wahl anzubieten,
    // die die Buchung danach ablehnt.
    expect(w.some((z) => z.text.includes("RTW alt"))).toBe(false);
    // Das Handlager ist kein Ziel — es ist die Quelle.
    expect(w.some((z) => z.wert === `fz:${HANDLAGER_ID}`)).toBe(false);
  });

  it("ist EINE Radiogruppe in EINEM Formular, keine Knopfreihe", async () => {
    await zeige("/a/art-42");

    /*
     * ⚠️ DIE BINDENDE FASSUNG (`docs/design/README.md`, „ohne Ausnahme"): ein
     * Tabstop für die Gruppe, Pfeiltasten wählen nativ. Eine Knopfreihe macht
     * aus fünf Fahrzeugen fünf Tabstops und verschweigt, dass sie einander
     * ausschließen — für Tastatur und Screenreader der Unterschied zwischen
     * „eine Wahl" und „fünf unverbundene Schalter".
     *
     * Der GEMEINSAME NAME ist das, was die Gruppe ausmacht; ohne ihn wären es
     * unabhängige Knöpfe, die nur wie eine Gruppe aussehen.
     */
    const knoepfe = queryAll<HTMLInputElement>("input[type='radio'][name='ziel']");
    expect(knoepfe.length).toBe(wahlen().length);
    expect(knoepfe.length).toBeGreaterThan(1);

    // EIN Formular, EIN Absendeknopf, EIN Rückweg — nicht je Zeile.
    const f = formular();
    expect(f.querySelectorAll("input[name='returnTo']")).toHaveLength(1);
    expect(f.querySelector<HTMLInputElement>("input[name='returnTo']")!.value).toBe("/a/art-42");
    expect(f.querySelectorAll("button[type='submit']")).toHaveLength(1);
    // Dass das Formular an DIE Action gebunden ist, hält der Typecheck — React
    // rendert eine Action-Funktion nicht ins Markup.
  });

  it("gibt jeder Wahl eine eigene Beschriftung — sonst ist der Knopf namenlos", async () => {
    await zeige();

    // Ein Radioknopf ohne zugeordnete Beschriftung wird vom Screenreader als
    // „Optionsfeld" ohne Inhalt angesagt; die Zeile daneben hilft nur dem Auge.
    for (const el of queryAll(WAHL)) {
      expect(el.tagName, "jede Wahl ist ein <label>").toBe("LABEL");
      expect(el.querySelector("input[type='radio']"), el.textContent).not.toBeNull();
    }
  });

  it("markiert die aktuelle Wahl — sonst wählt man blind neu", async () => {
    zielCookie = "tk1|fz:fz-2";
    await zeige();

    const w = wahlen();
    expect(w.find((z) => z.wert === "fz:fz-2")!.aktuell).toBe("ja");
    expect(w.filter((z) => z.aktuell === "ja")).toHaveLength(1);
  });

  it("markiert auch die ausdrückliche Verbrauchswahl", async () => {
    // ⚠️ Der Träger der Drei-Zustände-Zusage AUF DER SEITE: „Verbrauch" ist
    // eine getroffene Wahl und muss als getroffen zu sehen sein.
    zielCookie = "tk1|verbrauch";
    await zeige();
    expect(wahlen().find((z) => z.wert === "verbrauch")!.aktuell).toBe("ja");
  });

  it("markiert NICHTS, solange nichts gewählt wurde", async () => {
    await zeige();
    expect(wahlen().filter((z) => z.aktuell === "ja")).toEqual([]);
  });

  it("markiert die Wahl eines ANDEREN Kärtchens nicht — geteiltes Telefon", async () => {
    // Review-Befund P1 zu PR #140: die Wahl gehört ihrer Schicht. Stünde hier
    // eine Markierung, hätte die neue Person den Eindruck, schon gewählt zu
    // haben — und der Buchen-Knopf wäre auf dem Artikel bereits bedienbar.
    zielCookie = "tk-vorige|fz:fz-2";
    await zeige();
    expect(wahlen().filter((z) => z.aktuell === "ja")).toEqual([]);
  });

  it("reicht ein FREMDES `returnTo` nicht weiter", async () => {
    // Ohne `sanitizeReturnTo` stünde das fremde Ziel im Formular und die Action
    // bekäme es als Umleitung vorgelegt.
    await zeige("//boese.example");
    expect(formular().querySelector<HTMLInputElement>("input[name='returnTo']")!.value)
      .toBe("/helfer");
  });

  it("bleibt im Helfer-Rahmen, damit der Weg zurück erreichbar ist", async () => {
    await zeige();
    expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("entnahme");
  });
});

/**
 * DRK-305 — DIE ZIELWAHL AUF DEM KONTO-WEG (Review-Befund P2 zu PR #164).
 *
 * Die beiden Zusagen dieser Gruppe sind verschieden und hängen doch zusammen:
 * der SATZ beschreibt die Reichweite der Wahl, und das versteckte FELD ist das
 * einzige, woraus die Action nach einem Ausfall noch ableiten kann, wohin sie
 * jemanden schickt. Beides stünde sonst auf „Kärtchen", und beides wäre still
 * falsch — die Seite rendert in jedem Fall mit HTTP 200.
 */
describe("Die Zielwahl auf dem Konto-Weg (DRK-305)", () => {
  beforeEach(() => {
    kaertchenCookie = undefined;                                  // KEIN Kärtchen
    angemeldet = { sub: "sub-42", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };
  });

  it("nennt kein Kärtchen — die Wahl hängt an der ANMELDUNG", async () => {
    await zeige();
    const text = query("[data-rolle='rahmen']").textContent ?? "";
    expect(text).toContain("in deiner Anmeldung");
    expect(text).not.toContain("Kärtchen");
  });

  it("legt die Herkunft ins Formular", async () => {
    /*
     * ⚠️ DAS FELD IST DER GANZE BEFUND. Fällt die Anmeldung zwischen Rendern
     * und Absenden aus, sieht `waehleEntnahmeZiel` nur noch „kein Kärtchen,
     * kein Konto" — ein abgelaufenes Auth.js-Cookie ist serverseitig von „war
     * nie angemeldet" nicht zu trennen. Ohne diese Zeile landete die Person am
     * Gate mit „Scanne das Kärtchen erneut".
     */
    await zeige();
    const feld = formular().querySelector<HTMLInputElement>("input[type='hidden'][name='herkunft']");
    expect(feld?.value).toBe("konto");
  });

  it("bietet dieselben Ziele an wie mit Kärtchen", async () => {
    // Die Herkunft ändert die Reichweite der Wahl, nicht die Wahl selbst. Ohne
    // diese Zeile wäre eine Fassung grün, die dem Konto-Weg still die
    // Fahrzeugliste nimmt.
    await zeige();
    expect(wahlen().map((z) => z.wert)).toEqual(["verbrauch", "fz:fz-1", "fz:fz-2"]);
  });
});

describe("Die Zielwahl mit Kärtchen — die Gegenprobe (DRK-305)", () => {
  it("nennt das Kärtchen und trägt `herkunft=token`", async () => {
    // Ohne diese beiden Zeilen wäre auch eine Fassung grün, die den
    // Kärtchen-Satz ersatzlos gestrichen hat.
    await zeige();
    expect(query("[data-rolle='rahmen']").textContent ?? "").toContain("mit diesem Kärtchen");
    const feld = formular().querySelector<HTMLInputElement>("input[type='hidden'][name='herkunft']");
    expect(feld?.value).toBe("token");
  });
});
