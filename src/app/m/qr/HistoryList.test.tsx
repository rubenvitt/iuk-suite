// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useRouter } from "next/navigation";
import { HistoryList } from "@/app/m/qr/HistoryList";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { clearHistory, recordEntry } from "@/app/m/qr/_lib/history";
import { click, clickElement, exists, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { QrPayload } from "@/app/m/qr/_lib/types";

const wifi: QrPayload = {
  kind: "wifi",
  value: { ssid: "DRK Einsatz", password: "geheim123", encryption: "WPA", hidden: false },
};

const push = vi.fn();

beforeEach(() => {
  push.mockClear();
  localStorage.clear();
  clearHistory();
  vi.mocked(useRouter).mockReturnValue({ push } as unknown as ReturnType<typeof useRouter>);
});

afterEach(async () => {
  await unmount();
});

describe("HistoryList", () => {
  // Beim ersten Besuch stuende sonst eine leere Ueberschrift "Zuletzt erzeugt"
  // samt Knopf "Verlauf loeschen" ueber einer leeren Liste.
  it("zeigt bei leerem Verlauf gar nichts", async () => {
    await mount(<HistoryList />);
    expect(exists('[data-testid="qr-history"]')).toBe(false);
  });

  it("zeigt je Eintrag eine Zeile, neueste zuerst", async () => {
    recordEntry("Erster", { kind: "url", value: "https://a" });
    recordEntry("WLAN Einsatz", wifi);
    await mount(<HistoryList />);

    expect(queryAll('[data-testid="history-entry"]').map((el) => el.textContent)).toEqual([
      "WLAN Einsatz",
      "Erster",
    ]);
  });

  // Der Verlauf haelt das Payload, nicht den fertigen String: die URL muss
  // deshalb ueber denselben Weg entstehen wie beim ersten Erzeugen.
  it("fuehrt beim Antippen auf die von buildQrUrl erzeugte URL", async () => {
    recordEntry("WLAN Einsatz", wifi);
    await mount(<HistoryList />);
    await clickElement(queryAll('[data-testid="history-entry"]')[0]);

    expect(push).toHaveBeenCalledWith(buildQrUrl("WLAN Einsatz", wifi));
  });

  it("leert die Liste auf Knopfdruck", async () => {
    recordEntry("Erster", { kind: "url", value: "https://a" });
    await mount(<HistoryList />);
    await click("section > button");

    expect(exists('[data-testid="qr-history"]')).toBe(false);
  });
});
