// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import type { SyncStatus as SyncStatusWert } from "../offline/syncEngine";

/*
 * DIE ECHTE ENGINE BLEIBT AUSSEN VOR. Geprüft wird hier nicht, WANN sie ihre
 * Zustände meldet (das tut `syncEngine.test.ts`), sondern was die Anzeige
 * daraus macht — und dafür muss der Test die Zustände selbst in der Hand
 * haben. Ein Doppel des Abonnements ist der kürzeste Weg dahin.
 */
let melden: ((status: SyncStatusWert) => void) | null = null;
const abbestellt = vi.fn();

vi.mock("../offline/syncEngine", () => ({
  syncEngine: {
    statusLesen: () => "online" as SyncStatusWert,
    abonnieren: (listener: (status: SyncStatusWert) => void) => {
      melden = listener;
      listener("online");
      return abbestellt;
    },
  },
}));

import { SyncStatus } from "./SyncStatus";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";

async function status(wert: SyncStatusWert) {
  await act(async () => {
    melden?.(wert);
  });
}

function sichtbarerText(): string {
  return (document.querySelector("[role='status']")?.textContent ?? "").trim();
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  melden = null;
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("SyncStatus", () => {
  /*
   * DER ALLTAG IST STILL. Vorher stand dauerhaft „Synchronisiert" am unteren
   * Bildrand — eine Meldung über den Normalfall, die zugleich (fest
   * positioniert) Einträge der Durchführungsliste verdeckte.
   */
  it("zeigt im Normalfall nichts an", async () => {
    await mount(<SyncStatus />);
    expect(sichtbarerText()).toBe("");
    await status("syncing");
    expect(sichtbarerText()).toBe("");
    await status("synced");
    expect(sichtbarerText()).toBe("");
  });

  it("meldet Offline und Fehler — die zwei Zustände, die jemanden angehen", async () => {
    await mount(<SyncStatus />);
    await status("offline");
    expect(sichtbarerText()).toContain("Offline");
    await status("fehler");
    expect(sichtbarerText()).toContain("Sync fehlgeschlagen");
  });

  it("bestätigt nach einer Störung und blendet sich danach aus", async () => {
    await mount(<SyncStatus />);
    await status("offline");
    expect(sichtbarerText()).toContain("Offline");

    // Erholung: sichtbar bleiben, sonst blinkt der Chip zwischen Störung und
    // Bestätigung weg.
    await status("online");
    expect(sichtbarerText()).toContain("Wieder online");
    await status("syncing");
    expect(sichtbarerText()).toContain("Synchronisiere");

    await status("synced");
    expect(sichtbarerText()).toContain("Synchronisiert");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6500);
    });
    expect(sichtbarerText()).toBe("");
  });

  /*
   * DIE HÜLLE BLEIBT IMMER STEHEN: eine Live-Region, die erst mit ihrem Text
   * entsteht, wird von Screenreadern nicht vorgelesen.
   */
  it("hält die Live-Region auch dann im DOM, wenn nichts zu melden ist", async () => {
    await mount(<SyncStatus />);
    const region = document.querySelector("[role='status']");
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
  });
});
