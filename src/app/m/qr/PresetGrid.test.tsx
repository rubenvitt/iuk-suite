// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: vi.fn() }));

import { useRouter } from "next/navigation";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { clearHistory, loadHistory } from "@/app/m/qr/_lib/history";
import { clickElement, exists, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { Preset } from "@/app/m/qr/_lib/types";

const wlan: Preset = {
  id: "wlan-einsatz",
  label: "WLAN Einsatz",
  icon: "📶",
  kind: "wifi",
  value: { ssid: "DRK Einsatz", password: "geheim123", encryption: "WPA" },
};
const link: Preset = { id: "drk", label: "DRK", kind: "url", value: "https://drk.de" };

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

describe("PresetGrid", () => {
  it("zeigt ohne Presets gar nichts", async () => {
    await mount(<PresetGrid presets={[]} />);
    expect(exists('[data-testid="preset-grid"]')).toBe(false);
  });

  it("baut die Ziel-URL ueber buildQrUrl und nicht selbst", async () => {
    await mount(<PresetGrid presets={[wlan, link]} />);
    const tiles = queryAll('[data-testid="preset-tile"]');
    expect(tiles).toHaveLength(2);

    await clickElement(tiles[0]);
    expect(push).toHaveBeenCalledWith(buildQrUrl(wlan.label, wlan));
  });

  // Ohne diesen Eintrag faende der Nutzer einen per Schnellzugriff geoeffneten
  // Code nicht unter "Zuletzt erzeugt" wieder — anders als bei jedem anderen Weg.
  it("schreibt den geoeffneten Schnellzugriff in den Verlauf", async () => {
    await mount(<PresetGrid presets={[wlan]} />);
    await clickElement(queryAll('[data-testid="preset-tile"]')[0]);

    const [entry] = loadHistory();
    expect(entry.label).toBe("WLAN Einsatz");
    expect(entry.payload.kind).toBe("wifi");
  });
});
