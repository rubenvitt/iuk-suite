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
});
