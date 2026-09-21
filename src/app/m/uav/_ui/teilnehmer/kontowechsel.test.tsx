// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import type { ReactNode } from "react";

/**
 * DRK-286: Kontowechsel auf einem geteilten Gerät, durch die ECHTE Insel
 * (`TeilnehmerApp`) und das ECHTE `LoginForm` gefahren — nur `api` ist
 * gestellt. Die Tests sprechen bewusst keine Speicher-Interna an (Schlüssel,
 * Queue-Funktionen), sondern nur, was eine Person sieht und was an den Server
 * geht: so laufen sie gegen den Stand vor und nach dem Fix gleichermaßen, und
 * am alten Stand sind sie rot (s. Commit).
 */

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams("id=1-1"),
}));

import type { Identity } from "../../_lib/sitzung";
import type { ProgressSnapshot, SyncRequest, TaskDTO } from "../../_lib/typen";
import { api, ApiError } from "../offline/client";
import { syncEngine } from "../offline/syncEngine";
import { LoginForm } from "./LoginForm";
import { TeilnehmerApp } from "./TeilnehmerApp";
import { fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

const KATALOG: TaskDTO[] = [
  { id: "1-1", teil: 1, nummer: "1.1", titel: "Vorflugkontrolle", lernziel: "", schritte: [], durchfuehrungshinweise: [], sicherheitshinweise: [], zielanzahlDefault: 2, sortOrder: 0, aktiv: true },
];
const A: Identity = { kind: "participant", id: "teilnehmer-a", name: "Anna A" };
const B: Identity = { kind: "participant", id: "teilnehmer-b", name: "Bernd B" };
const A_SYNCHRON = { id: "a-sync-1", taskId: "1-1", datum: "2026-08-01", drohnensteuerer: "Anna Pilotin", luftraumbeobachter: "Alf Auge" };
const leer = (): ProgressSnapshot => ({ executions: [], taskStatus: [], serverTime: "2026-09-21T00:00:00.000Z" });

/** Alle Sync-Anfragen samt der Identität, deren Cookie der Browser dabei trug. */
let anfragen: { cookie: string; req: SyncRequest }[] = [];
let cookie = "";
let antwort: (req: SyncRequest) => Promise<ProgressSnapshot>;

async function warten(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

async function appAls(identity: Identity | "offline"): Promise<void> {
  if (identity === "offline") vi.mocked(api.me).mockRejectedValue(new ApiError(0, "network_error", "offline"));
  else vi.mocked(api.me).mockResolvedValue(identity);
  await mount(<TeilnehmerApp ansicht="aufgabe" />);
  await warten();
}

async function erfassen(steuerer: string, beobachter: string): Promise<void> {
  await fill("#df-drohnensteuerer", steuerer);
  await fill("#df-luftraumbeobachter", beobachter);
  const form = query<HTMLInputElement>("#df-drohnensteuerer").closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  // Sync sofort anstoßen statt die 2-s-Entprellung abzuwarten.
  await act(async () => {
    window.dispatchEvent(new Event("online"));
  });
  await warten();
}

/** Der echte Login-Weg: `LoginForm` absenden, danach trägt der Browser Bs Cookie. */
async function anmelden(als: Identity & { kind: "participant" }): Promise<void> {
  await unmount();
  vi.mocked(api.participantLogin).mockImplementation(async () => {
    cookie = als.id;
    return { ok: true };
  });
  await mount(<LoginForm />);
  await fill("#login-code", "CODE1234");
  const form = query<HTMLInputElement>("#login-code").closest("form")!;
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warten();
  await unmount();
}

function sichtbarerText(): string {
  return document.body.textContent ?? "";
}

function feldwert(selector: string): string {
  return query<HTMLInputElement>(selector).value;
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem("drk-drohnen-katalog", JSON.stringify(KATALOG));
  anfragen = [];
  cookie = "";
  antwort = async () => leer();
  vi.spyOn(api, "me");
  vi.spyOn(api, "participantLogin");
  vi.spyOn(api, "getTasks").mockResolvedValue(KATALOG);
  vi.spyOn(api, "sync").mockImplementation(async (req) => {
    anfragen.push({ cookie, req });
    return antwort(req);
  });
  Object.defineProperty(window, "location", {
    value: { ...window.location, replace: vi.fn() },
    writable: true,
    configurable: true,
  });
});

afterEach(async () => {
  await unmount();
  syncEngine.stop();
  vi.restoreAllMocks();
});

const idsIn = (liste: { req: SyncRequest }[]) => liste.flatMap((a) => a.req.executions.map((e) => e.id));

describe("Kontowechsel A → B auf demselben Gerät (DRK-286)", () => {
  it("B sieht weder As synchronisierte noch As offene Daten, und nichts davon geht unter Bs Cookie raus", async () => {
    // A arbeitet: ein Eintrag liegt schon auf dem Server, einer kommt offline dazu.
    cookie = A.id;
    antwort = async (req) =>
      req.executions.length === 0 ? { ...leer(), executions: [A_SYNCHRON] } : Promise.reject(new ApiError(0, "network_error", "offline"));
    await appAls(A);
    expect(sichtbarerText()).toContain("Anna Pilotin");
    await erfassen("Arno Offline", "Adele Offline");
    expect(sichtbarerText()).toContain("Arno Offline");

    // B meldet sich mit dem eigenen Code an.
    await anmelden(B as Identity & { kind: "participant" });
    const abB = anfragen.length;
    antwort = async () => leer();
    await appAls(B);

    const text = sichtbarerText();
    for (const fremd of ["Anna Pilotin", "Alf Auge", "Arno Offline", "Adele Offline"]) expect(text).not.toContain(fremd);
    // Auch nicht als Vorbelegung im Formular.
    expect(feldwert("#df-drohnensteuerer")).toBe("");
    expect(feldwert("#df-luftraumbeobachter")).toBe("");

    const unterB = anfragen.slice(abB).filter((a) => a.cookie === B.id);
    expect(unterB.length).toBeGreaterThan(0);
    expect(idsIn(unterB)).toEqual([]);
  });

  it("eine verspätete Antwort aus As Sync nach Bs Login verändert Bs Ansicht nicht", async () => {
    cookie = A.id;
    let spaet: ((s: ProgressSnapshot) => void) | null = null;
    antwort = async (req) =>
      req.executions.length === 0
        ? leer()
        : new Promise<ProgressSnapshot>((resolve) => {
            spaet = resolve;
          });
    await appAls(A);
    await erfassen("Arno Spaet", "Adele Spaet");
    expect(spaet).not.toBeNull();

    await anmelden(B as Identity & { kind: "participant" });
    antwort = async () => leer();
    await appAls(B);
    const vorher = sichtbarerText();

    // Jetzt kommt As Antwort — mit As Stand.
    await act(async () => {
      spaet!({ ...leer(), executions: [A_SYNCHRON, { ...A_SYNCHRON, id: "a-spaet", drohnensteuerer: "Arno Spaet" }] });
    });
    await warten();

    expect(sichtbarerText()).toBe(vorher);
    for (const fremd of ["Anna Pilotin", "Arno Spaet"]) expect(sichtbarerText()).not.toContain(fremd);
  });

  it("A findet nach Bs Sitzung die eigene offene Arbeit wieder, und sie geht unter As Cookie raus", async () => {
    cookie = A.id;
    antwort = async (req) => (req.executions.length === 0 ? leer() : Promise.reject(new ApiError(0, "network_error", "offline")));
    await appAls(A);
    await erfassen("Arno Offen", "Adele Offen");

    await anmelden(B as Identity & { kind: "participant" });
    antwort = async () => leer();
    await appAls(B);
    expect(sichtbarerText()).not.toContain("Arno Offen");

    await anmelden(A as Identity & { kind: "participant" });
    const abA = anfragen.length;
    antwort = async (req) => ({ ...leer(), executions: req.executions });
    await appAls(A);

    expect(sichtbarerText()).toContain("Arno Offen");
    const unterA = anfragen.slice(abA).filter((a) => a.cookie === A.id);
    expect(unterA.flatMap((a) => a.req.executions.map((e) => e.drohnensteuerer))).toContain("Arno Offen");
    // B hat den Eintrag nie gesendet.
    expect(anfragen.filter((a) => a.cookie === B.id).flatMap((a) => a.req.executions.map((e) => e.drohnensteuerer))).not.toContain("Arno Offen");
  });
});

describe("echte anonyme Offline-Erfassung (DRK-286)", () => {
  it("wird genau einmal übernommen — vom ersten bestätigten Konto, nicht vom nächsten", async () => {
    // Nie angemeldet, offline: die Erfassung läuft trotzdem.
    await appAls("offline");
    await erfassen("Otto Anonym", "Olga Anonym");
    expect(sichtbarerText()).toContain("Otto Anonym");
    await unmount();

    // A meldet sich an: Übernahme, der Eintrag geht unter As Cookie raus.
    await anmelden(A as Identity & { kind: "participant" });
    antwort = async (req) => ({ ...leer(), executions: req.executions });
    await appAls(A);
    expect(sichtbarerText()).toContain("Otto Anonym");
    const unterA = anfragen.filter((a) => a.cookie === A.id);
    expect(unterA.flatMap((a) => a.req.executions.map((e) => e.drohnensteuerer))).toContain("Otto Anonym");

    // Danach B: übernimmt nichts mehr, sieht nichts.
    await anmelden(B as Identity & { kind: "participant" });
    const abB = anfragen.length;
    antwort = async () => leer();
    await appAls(B);
    expect(sichtbarerText()).not.toContain("Otto Anonym");
    expect(idsIn(anfragen.slice(abB))).toEqual([]);
  });
});
