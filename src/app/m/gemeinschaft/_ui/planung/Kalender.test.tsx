// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "antd";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { KalenderEintrag } from "../../_lib/kalenderTage";
import { zeitpunkt } from "../../_lib/zeit";
import { Kalender } from "./Kalender";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const EINTRAEGE: KalenderEintrag[] = [
  { id: "e1", art: "event", von: zeitpunkt("2026-11-13", "18:00"), bis: zeitpunkt("2026-11-13", "23:00"), titel: "Glühweinabend", href: "/v/e1" },
  { id: "a1", art: "zugesagt", von: zeitpunkt("2026-11-07", "18:00"), bis: zeitpunkt("2026-11-08", "01:00"), titel: "Bar: 40. Geburtstag", href: "/vermietung/anfragen?id=a1" },
  { id: "s1", art: "gesperrt", von: zeitpunkt("2026-11-10", "19:00"), bis: zeitpunkt("2026-11-10", "22:00"), titel: "Dienstabend Bereitschaft", href: "/vermietung/sperrzeiten" },
];

afterEach(async () => { await unmount(); router.push.mockReset(); });

describe("Kalender", () => {
  it("trägt Events und Bar mit ihren Zielen ein, über Mitternacht an beiden Tagen", async () => {
    await mount(<App><Kalender tag="2026-11-07" heute="2026-11-01" eintraege={EINTRAEGE} /></App>);
    const links = queryAll<HTMLAnchorElement>("[data-kalender-eintrag]");
    expect(links.map((a) => [a.dataset.kalenderEintrag, a.getAttribute("href"), a.textContent])).toEqual([
      ["zugesagt", "/vermietung/anfragen?id=a1", "18:00 Bar: 40. Geburtstag"],
      ["zugesagt", "/vermietung/anfragen?id=a1", "… Bar: 40. Geburtstag"],
      ["gesperrt", "/vermietung/sperrzeiten", "19:00 Dienstabend Bereitschaft"],
      ["event", "/v/e1", "18:00 Glühweinabend"],
    ]);
    expect(document.body.textContent).toContain("November 2026");
    // Die Tagesliste des gewählten Tages.
    expect(query("[data-tagesliste]").textContent).toContain("Bar vermietet");
    expect(document.body.textContent).toContain("Sa, 7. November 2026");
  });

  it("wählt einen Tag im Monat ohne Neuladen, ein anderer Monat geht über die Adresse", async () => {
    await mount(<App><Kalender tag="2026-11-07" heute="2026-11-01" eintraege={EINTRAEGE} /></App>);
    await clickElement(query("td[title='2026-11-13']"));
    expect(router.push).not.toHaveBeenCalled();
    expect(query("[data-tagesliste]").textContent).toContain("Glühweinabend");
    await clickElement(query("button[aria-label='Nächster Monat']"));
    expect(router.push).toHaveBeenCalledWith("/kalender?tag=2026-12-01", { scroll: false });
  });
});
