// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * DER KOPIERKNOPF DER TEILNAHME-ZONE (Entwurf §2.4, §4.13).
 *
 * Zwei Zusagen:
 *
 * 1. Kopiert wird die VOLLSTÄNDIGE Adresse mit Protokoll und Host. Ein
 *    Rohtoken in der Zwischenablage ist genau der Fehler, den die Zone
 *    abschaffen soll — er landet dann in einer WhatsApp-Gruppe und ist dort
 *    nicht anklickbar.
 * 2. Die Rückmeldung sitzt AM KNOPF („Kopiert ✓", 2 s), nicht in einem Toast:
 *    man sieht den Knopf an, den man gerade gedrückt hat.
 */

import { KopierZeile } from "./KopierZeile";
// Kein zweites Mount-Harness erfinden (CLAUDE.md): `mount`/`clickElement` liegen
// in `qr/_lib/test-dom.tsx` und fahren schon `Lagekarte.test.tsx`.
import { clickElement, query, mount, unmount } from "@/app/m/qr/_lib/test-dom";

const URL_VOLL = "https://feedback.iuk-ue.de/f/bereitschaft-abc12";

const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});

beforeEach(() => {
  writeText.mockClear();
  // jsdom kennt `navigator.clipboard` nicht. Der Stub ist absichtlich dumm: es
  // wird geprüft, WAS in die Zwischenablage geht, nicht die Browser-API.
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("KopierZeile", () => {
  it("kopiert die vollständige Adresse, nicht den Rohtoken", async () => {
    await mount(<KopierZeile url={URL_VOLL} />);

    await clickElement(query("button"));

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith(URL_VOLL);
  });

  it("meldet am Knopf und fällt nach 2 s auf die Ausgangsbeschriftung zurück", async () => {
    vi.useFakeTimers();
    await mount(<KopierZeile url={URL_VOLL} />);

    const knopf = query("button");
    expect(knopf.textContent).toContain("Kopieren");

    await clickElement(knopf);
    expect(query("button").textContent).toContain("Kopiert ✓");

    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(query("button").textContent).toContain("Kopieren");
    expect(query("button").textContent).not.toContain("Kopiert");
  });

  it("ist eine Client-Insel und trägt kein Suite-Rot (kein zweiter Primärknopf, §2.6/§4.9)", async () => {
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/feedback/_ui/KopierZeile.tsx"),
      "utf8",
    );
    expect(quelle).toContain('"use client"');
    // Ohne Kommentare: der Dateikopf BEGRÜNDET, warum es kein `primary` ist.
    expect(quelle.replace(/\/\*[\s\S]*?\*\//g, "")).not.toContain('type="primary"');

    await mount(<KopierZeile url={URL_VOLL} />);
    expect(query("button").className).not.toContain("ant-btn-primary");
  });
});
