// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DER NEUDRUCK AUF LANGE CODES — DRK-442. Die Insel bietet ihn nur an, solange
 * eine Karte noch einen 6-stelligen Code traegt, fragt vorher nach und sagt
 * danach, wie viele Karten neu gedruckt werden muessen.
 */
const mocks = vi.hoisted(() => ({ ersetze: vi.fn() }));

vi.mock("../../../_actions/ortCodes", () => ({
  ersetzeAlteOrtCodesAmOrt: (...args: unknown[]) => mocks.ersetze(...args),
}));

import { OrtsetikettenChrome } from "./OrtsetikettenChrome";

const BASIS = "https://lagerbuch.iuk-ue.de";

beforeEach(() => {
  mocks.ersetze.mockReset();
  mocks.ersetze.mockResolvedValue({ ok: true, wert: { neu: 3 } });
  window.confirm = () => true;
});

afterEach(async () => {
  await unmount();
});

async function ruhe(): Promise<void> {
  await act(async () => { await new Promise((fertig) => setTimeout(fertig, 0)); });
}

describe("OrtsetikettenChrome — alte Codes (DRK-442)", () => {
  it("schweigt, wenn jede Karte schon einen langen Code traegt", async () => {
    await mount(<OrtsetikettenChrome basis={BASIS} neueCodes={0} alteCodes={0} />);
    expect(exists("[data-testid='lb-ort-alt']")).toBe(false);
  });

  it("nennt die Zahl und die Folge", async () => {
    await mount(<OrtsetikettenChrome basis={BASIS} neueCodes={0} alteCodes={3} />);
    const text = query("[data-testid='lb-ort-alt']").textContent ?? "";
    expect(text).toContain("3 Karten tragen noch einen alten 6-stelligen Code");
    expect(text).toContain("Alte Codes neu erzeugen");
  });

  it("ersetzt nach Rueckfrage und sagt, wie viele Karten neu zu drucken sind", async () => {
    const frage = vi.fn(() => true);
    window.confirm = frage;
    await mount(<OrtsetikettenChrome basis={BASIS} neueCodes={0} alteCodes={3} />);
    await click("[data-testid='lb-ort-alt'] button");
    await ruhe();

    expect(frage).toHaveBeenCalledOnce();
    expect(String(frage.mock.calls[0])).toContain("dauerhaft gesperrt");
    expect(mocks.ersetze).toHaveBeenCalledOnce();
    expect(query("[data-testid='lb-ort-alt-ergebnis']").textContent)
      .toContain("3 neue Codes sind entstanden");
  });

  it("tut nichts, wenn die Rueckfrage verneint wird", async () => {
    window.confirm = () => false;
    await mount(<OrtsetikettenChrome basis={BASIS} neueCodes={0} alteCodes={1} />);
    await click("[data-testid='lb-ort-alt'] button");
    await ruhe();
    expect(mocks.ersetze).not.toHaveBeenCalled();
  });

  it("zeigt den Satz des Servers, wenn es scheitert", async () => {
    mocks.ersetze.mockResolvedValue({ ok: false, fehler: "Ging nicht." });
    await mount(<OrtsetikettenChrome basis={BASIS} neueCodes={0} alteCodes={1} />);
    await click("[data-testid='lb-ort-alt'] button");
    await ruhe();
    expect(query("[data-testid='lb-ort-alt-ergebnis']").textContent).toContain("Ging nicht.");
  });
});
