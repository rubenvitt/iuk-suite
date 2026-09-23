// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";

/**
 * DRK-446: Der direkte Aufruf von `/aufgabe?id=…` meldete „Hydration failed".
 * Der Server hat keinen Browser-Speicher und rendert die Insel deshalb leer;
 * liest der Browser Katalog, Fortschritt oder Identität schon im ERSTEN Render
 * aus `localStorage`/`sessionStorage`, weicht sein Baum vom Server-HTML ab, und
 * React verwirft das Server-HTML.
 *
 * Nachgestellt über den echten Hydrationsweg (`hydrate`): das Server-HTML
 * entsteht mit LEEREM Speicher, erst danach — im Fenster zwischen HTML und
 * JavaScript — bekommt der Browser seinen Stand. `mount` sähe den Fehler nie:
 * dort gibt es kein Server-HTML, gegen das etwas abweichen könnte.
 */

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
let suchParameter = "id=1-1";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(suchParameter),
}));

import type { Identity } from "../../_lib/sitzung";
import type { TaskDTO } from "../../_lib/typen";
import { api } from "../offline/client";
import { syncEngine } from "../offline/syncEngine";
import { TeilnehmerApp } from "./TeilnehmerApp";
import { hydrate, unmount } from "@/app/m/qr/_lib/test-dom";

const KATALOG: TaskDTO[] = [
  { id: "1-1", teil: 1, nummer: "1.1", titel: "Vorflugkontrolle", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true },
];
const A: Identity & { kind: "participant" } = { kind: "participant", id: "teilnehmer-a", name: "Anna A" };

/** Alles, was React bei einer Abweichung meldet — über console.error ODER window.reportError. */
let meldungen: string[] = [];
const merken = (e: ErrorEvent) => meldungen.push(String(e.error ?? e.message));

async function warten(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

/** Server-HTML mit leerem Speicher, Browser mit dem Stand einer Teilnehmerin. */
async function direktAufrufen(ansicht: "start" | "aufgabe"): Promise<void> {
  localStorage.clear();
  sessionStorage.clear();
  await hydrate(<TeilnehmerApp ansicht={ansicht} />, () => {
    localStorage.setItem("drk-drohnen-katalog", JSON.stringify(KATALOG));
    localStorage.setItem("drk-drohnen-konto", JSON.stringify({ id: A.id }));
    sessionStorage.setItem("uav-identity", JSON.stringify(A));
  });
  await warten();
}

const hydrationsmeldungen = () => meldungen.filter((m) => /hydrat/i.test(m));

beforeEach(() => {
  meldungen = [];
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    meldungen.push(args.map(String).join(" "));
  });
  window.addEventListener("error", merken);
  vi.spyOn(api, "me").mockResolvedValue(A);
  vi.spyOn(api, "getTasks").mockResolvedValue(KATALOG);
  vi.spyOn(api, "sync").mockResolvedValue({ executions: [], taskStatus: [], serverTime: "2026-09-22T00:00:00.000Z" });
});

afterEach(async () => {
  window.removeEventListener("error", merken);
  await unmount();
  syncEngine.stop();
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe("Teilnehmer-Insel beim direkten Aufruf (DRK-446)", () => {
  it("/aufgabe?id=… hydriert ohne Abweichung und zeigt danach die Aufgabe aus dem Speicher", async () => {
    suchParameter = "id=1-1";
    await direktAufrufen("aufgabe");
    expect(hydrationsmeldungen()).toEqual([]);
    expect(document.body.textContent).toContain("Vorflugkontrolle");
  });

  it("die Startseite hydriert ebenso ohne Abweichung", async () => {
    suchParameter = "";
    await direktAufrufen("start");
    expect(hydrationsmeldungen()).toEqual([]);
    expect(document.body.textContent).toContain("Vorflugkontrolle");
  });
});
