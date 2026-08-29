// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import type { ReactNode } from "react";
import { vi } from "vitest";

// next/link greift auf den App-Router-Kontext zu, den es hier nicht gibt.
vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import type { TaskDTO } from "../../_lib/typen";
import { leererFortschritt, type AufgabenFortschritt } from "../offline/progress";
import { Dashboard } from "./Dashboard";
import { exists, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * Port aus uav-praxis/src/components/Dashboard.test.tsx — mit einem eigenen,
 * kleinen Fixture-Katalog statt `AUFGABEN` aus `src/data/tasks.ts` (der Seed
 * wird nicht mitportiert, Spec §2, Task 11), und über das repo-eigene
 * `test-dom`-Harness statt `@testing-library/react`.
 */
const KATALOG: TaskDTO[] = [
  { id: "1-1", teil: 1, nummer: "1.1", titel: "Schwebeflug", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 3, sortOrder: 0, aktiv: true, bildUrl: null },
  { id: "2-1", teil: 2, nummer: "2.1", titel: "Notlandung", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 1, aktiv: true, bildUrl: null },
];

function leererKatalogFortschritt(): Record<string, AufgabenFortschritt> {
  const f: Record<string, AufgabenFortschritt> = {};
  for (const a of KATALOG) f[a.id] = leererFortschritt(a.zielanzahlDefault);
  return f;
}

afterEach(async () => {
  await unmount();
});

describe("Dashboard", () => {
  it("zeigt den Gesamtfortschritt 0 von 2", async () => {
    await mount(<Dashboard katalog={KATALOG} fortschritt={leererKatalogFortschritt()} />);
    expect(document.body.textContent).toContain("0 von 2");
  });

  it("listet alle Aufgaben", async () => {
    await mount(<Dashboard katalog={KATALOG} fortschritt={leererKatalogFortschritt()} />);
    expect(document.body.textContent).toContain("1.1");
    expect(document.body.textContent).toContain("2.1");
  });

  it("verlinkt eine Aufgabe auf ihre äußere Route (/aufgabe?id=…)", async () => {
    await mount(<Dashboard katalog={KATALOG} fortschritt={leererKatalogFortschritt()} />);
    const links = queryAll<HTMLAnchorElement>("a");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(
      expect.arrayContaining(["/aufgabe?id=1-1", "/aufgabe?id=2-1"]),
    );
    expect(exists('a[href="/aufgabe?id=1-1"]')).toBe(true);
  });

  /*
   * DIE ÜBERSCHRIFT OHNE INHALT. Der Fixture-Katalog hat Aufgaben in Teil 1 und
   * 2, keine in Teil 3 — die Überschrift „Teil 3 · …" stand trotzdem da, weil
   * die drei Teile fest aus einer Konstanten gerendert wurden. Im Seed sah das
   * aus, als sei die Liste nicht fertig geladen.
   */
  it("zeigt keine Überschrift für einen Teil ohne Aufgaben", async () => {
    await mount(<Dashboard katalog={KATALOG} fortschritt={leererKatalogFortschritt()} />);
    const ueberschriften = queryAll("h2").map((h) => h.textContent);
    expect(ueberschriften).toEqual([
      "Teil 1 · Grundlegende Steuerung",
      "Teil 2 · Sichere Steuerung in einsatznahen Situationen",
    ]);
  });

  it("zeigt einen Leerzustand statt einer blanken Fläche, wenn der Katalog leer ist", async () => {
    await mount(<Dashboard katalog={[]} fortschritt={{}} />);
    expect(queryAll("h2")).toHaveLength(0);
    expect(document.body.textContent).toContain("Noch keine Aufgaben");
  });

  /*
   * DIE ZWEITE, FEINERE ZAHL. `gesamtFortschritt` zählt Aufgaben, und eine
   * Aufgabe zählt erst, wenn ihre Zielanzahl voll ist — mit 2 von 3
   * Durchführungen steht die grobe Zahl weiter auf 0 %. Die Legende darunter
   * zeigt die Bewegung, ohne die grobe Rechnung umzudeuten.
   */
  it("nennt neben den erledigten Aufgaben auch die erfassten Durchführungen", async () => {
    const fortschritt = leererKatalogFortschritt();
    fortschritt["1-1"] = {
      zielanzahl: 3,
      nichtAnwendbar: false,
      durchfuehrungen: [
        { id: "a", datum: "2026-01-06", drohnensteuerer: "M", luftraumbeobachter: "E" },
        { id: "b", datum: "2026-01-13", drohnensteuerer: "E", luftraumbeobachter: "M" },
      ],
    };
    await mount(<Dashboard katalog={KATALOG} fortschritt={fortschritt} />);
    // Grobe Zahl unverändert: keine Aufgabe ist fertig.
    expect(document.body.textContent).toContain("0 von 2 Aufgaben");
    // Feine Zahl: 2 von 3 + 2 = 5 nötigen Durchführungen.
    expect(document.body.textContent).toContain("2 von 5 Durchführungen erfasst");
  });

  it("zählt eine nicht anwendbare Aufgabe in keiner der beiden Zahlen mit", async () => {
    const fortschritt = leererKatalogFortschritt();
    fortschritt["2-1"] = { zielanzahl: 2, nichtAnwendbar: true, durchfuehrungen: [] };
    await mount(<Dashboard katalog={KATALOG} fortschritt={fortschritt} />);
    expect(document.body.textContent).toContain("0 von 1 Aufgaben");
    expect(document.body.textContent).toContain("0 von 3 Durchführungen erfasst");
  });

  /*
   * OHNE CODE: DER KATALOG BLEIBT, DAS PERSÖNLICHE GEHT.
   *
   * Der Fortschritt liegt im `localStorage` des GERÄTS. Auf einem geteilten
   * Tablet ist das der Stand der zuletzt angemeldeten Person — ihn anonym
   * anzuzeigen wäre eine Auskunft über sie. Deshalb prüft dieser Fall mit
   * einem GEFÜLLTEN Fortschritt, nicht mit einem leeren: nur so kann er
   * fehlschlagen.
   */
  it("zeigt ohne Code die Aufgaben, aber weder Fortschrittskarte noch Zähler", async () => {
    const fortschritt = leererKatalogFortschritt();
    fortschritt["1-1"] = {
      zielanzahl: 3,
      nichtAnwendbar: false,
      durchfuehrungen: [
        { id: "a", datum: "2026-01-06", drohnensteuerer: "Erika", luftraumbeobachter: "Klaus" },
      ],
    };
    await mount(<Dashboard katalog={KATALOG} fortschritt={fortschritt} nurLesen />);

    expect(document.body.textContent).toContain("Schwebeflug");
    expect(document.body.textContent).not.toContain("Gesamtfortschritt");
    expect(document.body.textContent).not.toContain("Durchführungen erfasst");
    expect(document.body.textContent).not.toContain("1 / 3");
    expect(document.body.textContent).toContain("Zum Eintragen einer Durchführung");
  });

  it("deckelt die Durchführungen bei der Zielanzahl statt über 100 % zu zählen", async () => {
    const fortschritt = leererKatalogFortschritt();
    fortschritt["2-1"] = {
      zielanzahl: 2,
      nichtAnwendbar: false,
      durchfuehrungen: [
        { id: "a", datum: "2026-01-06", drohnensteuerer: "", luftraumbeobachter: "" },
        { id: "b", datum: "2026-01-07", drohnensteuerer: "", luftraumbeobachter: "" },
        { id: "c", datum: "2026-01-08", drohnensteuerer: "", luftraumbeobachter: "" },
      ],
    };
    await mount(<Dashboard katalog={KATALOG} fortschritt={fortschritt} />);
    expect(document.body.textContent).toContain("2 von 5 Durchführungen erfasst");
  });
});
