// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { WeitereAktionen } from "./WeitereAktionen";

afterEach(async () => {
  await unmount();
});

describe("WeitereAktionen", () => {
  /**
   * IDA-239 — neben dem Druckbogen führt das Menü ins Journal, gefiltert auf
   * genau diese Einheit über ihre Kennung.
   */
  it("bietet Checkliste und Journal dieser Einheit an", async () => {
    await mount(<WeitereAktionen fahrzeugId="rtw 1" />);
    await clickElement(query("button[aria-label='Weitere Aktionen']"));
    await act(async () => { await Promise.resolve(); });

    const links = Array.from(document.body.querySelectorAll<HTMLAnchorElement>(
      ".ant-dropdown-menu-item a",
    )).map((a) => [a.textContent, a.getAttribute("href")]);
    expect(links).toEqual([
      ["Checkliste drucken", expect.stringContaining("rtw")],
      ["Im Journal anzeigen", "/verwaltung/journal?ort=rtw%201"],
    ]);
  });
});
