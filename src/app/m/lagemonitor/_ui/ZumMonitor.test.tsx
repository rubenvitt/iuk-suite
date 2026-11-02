// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { ZumMonitor } from "./ZumMonitor";

afterEach(async () => {
  await unmount();
});

describe("Link zum Live-Lagemonitor", () => {
  it("öffnet den Online-Monitor in einem neuen Tab, mit Schrägstrich am Ende", async () => {
    await mount(<ZumMonitor online="https://lagemonitor.example.org/monitor" />);
    const a = query("a[data-testid='zum-monitor']");
    expect(a?.getAttribute("href")).toBe("https://lagemonitor.example.org/monitor/");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(a?.getAttribute("rel")).toContain("noopener");
    expect(a?.textContent).toContain("Live-Lagemonitor öffnen");
    expect(a?.getAttribute("aria-label")).toBe("Live-Lagemonitor öffnen (neuer Tab)");
  });

  it("der Schrägstrich gehört zum Pfad, nicht hinter Query oder Fragment", async () => {
    await mount(<ZumMonitor online="https://lagemonitor.example.org/monitor?ansicht=gross#oben" />);
    expect(query("a[data-testid='zum-monitor']").getAttribute("href")).toBe("https://lagemonitor.example.org/monitor/?ansicht=gross#oben");
  });

  it("ohne eingetragene Adresse gibt es keinen Link", async () => {
    await mount(<ZumMonitor online={null} />);
    expect(queryAll("[data-testid='zum-monitor']")).toHaveLength(0);
  });
});
