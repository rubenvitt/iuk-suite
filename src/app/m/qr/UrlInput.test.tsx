// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Die Laengenwarnung muss ueber dieselbe Funktion laufen, mit der die Erzeugung
 * ablehnt: `QR_MAX_LENGTH` ist die BYTE-Kapazitaet. Zaehlt die Eingabe statt
 * dessen Zeichen, schweigt die Warnung bei einem Text aus Umlauten, der Knopf
 * bleibt aktiv — und der Nutzer landet auf /qr und sieht dort statt eines Codes
 * eine Fehlermeldung.
 */
vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useRouter } from "next/navigation";
import { UrlInput } from "@/app/m/qr/UrlInput";
import { clearHistory, loadHistory } from "@/app/m/qr/_lib/history";
import { exists, fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const push = vi.fn();

beforeEach(async () => {
  push.mockClear();
  localStorage.clear();
  clearHistory();
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
  await mount(<UrlInput />);
});

afterEach(async () => {
  await unmount();
});

function submitButton(): HTMLButtonElement {
  return query<HTMLButtonElement>('button[type="submit"]');
}

describe("UrlInput", () => {
  it("navigiert mit dem kodierten Inhalt und schreibt den Verlaufseintrag", async () => {
    await fill("#qr-url", "https://drk.de/a?b=1");
    await submitForm();

    expect(push).toHaveBeenCalledTimes(1);
    const url = new URL(push.mock.calls[0][0] as string, "http://qr.localtest.me");
    expect(url.pathname).toBe("/qr");
    expect(url.searchParams.get("data")).toBe("https://drk.de/a?b=1");
    expect(url.searchParams.get("kind")).toBe("url");
    expect(loadHistory()[0].label).toBe("https://drk.de/a?b=1");
  });

  // 700 Umlaute sind nach Zeichen laengst erlaubt (700 < 1273), nach Bytes aber
  // nicht (1400 > 1273). Genau hier faellt eine Zeichen-Zaehlung auf.
  it("warnt bei 700 Umlauten, obwohl es nach Zeichen erlaubt waere", async () => {
    await fill("#qr-url", "ä".repeat(700));

    expect(exists('[data-testid="too-long"]')).toBe(true);
    expect(submitButton().disabled).toBe(true);
  });

  it("navigiert nicht, wenn der Inhalt zu lang ist", async () => {
    await fill("#qr-url", "ä".repeat(700));
    await submitForm();

    expect(push).not.toHaveBeenCalled();
  });

  it("warnt nicht bei einem Text, der in Bytes noch passt", async () => {
    await fill("#qr-url", "ä".repeat(600));

    expect(exists('[data-testid="too-long"]')).toBe(false);
    expect(submitButton().disabled).toBe(false);
  });

  it("leere Eingabe: Knopf gesperrt und kein Absenden", async () => {
    expect(submitButton().disabled).toBe(true);
    await submitForm();

    expect(push).not.toHaveBeenCalled();
    expect(loadHistory()).toEqual([]);
  });
});
