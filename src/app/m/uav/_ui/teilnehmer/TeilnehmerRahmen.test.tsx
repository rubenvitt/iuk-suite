// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import type { ReactNode } from "react";

vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children?: ReactNode; className?: string }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("../offline/client", () => ({ api: { logout: vi.fn() } }));

import { TeilnehmerRahmen } from "./TeilnehmerRahmen";
import { exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

afterEach(async () => {
  await unmount();
});

describe("TeilnehmerRahmen", () => {
  /*
   * DER BEFUND, GEGEN DEN DIESER FALL STEHT (gemessen 2026-08-29, anonym auf
   * dem Modul-Host): das Wort „Verwaltung" kam auf der ganzen Seite nicht vor.
   * Der Eintrag hing an `canAdminModule("uav")` — einer Bedingung, die am
   * Einstieg nie wahr sein kann: wer nicht angemeldet ist, ist kein
   * Modul-Admin; um sich anzumelden, bräuchte er den Weg.
   */
  it("zeigt den Verwaltungsweg AUCH ohne Anmeldung — und führt dann über den Suite-Login", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten={false}>Inhalt</TeilnehmerRahmen>);
    const link = query<HTMLAnchorElement>("[data-rolle='uav-verwaltungslink']");
    expect(link.textContent).toBe("Verwaltung");
    // `callbackUrl`: ohne ihn landet man nach der Anmeldung wieder auf der
    // Trainingsansicht, also dort, wo man schon war.
    // Direkt `/login` (IDA-401): über `/api/auth/signin` löste Auth.js `/admin`
    // gegen `AUTH_URL` auf, und man landete auf der Portal-Verwaltung.
    expect(link.getAttribute("href")).toBe("/login?callbackUrl=%2Fadmin");
  });

  it("führt Verwalter direkt in die Verwaltung", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten>Inhalt</TeilnehmerRahmen>);
    expect(
      query("[data-rolle='uav-verwaltungslink']").getAttribute("href"),
    ).toBe("/admin");
  });

  it("führt mit der Wortmarke zurück auf die Übersicht", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten={false}>Inhalt</TeilnehmerRahmen>);
    const links = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(links).toContain("/");
  });

  /*
   * ÄUSSERE PFADFORM, NIE DIE INNERE. `/m/uav/...` würde auf dem Modul-Host
   * ein zweites Mal präfixiert (dieselbe Falle wie in
   * `lagerbuch/_ui/HelferRahmen.tsx` und `_lib/nav.ts`).
   */
  it("trägt nur äußere Pfade", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten>Inhalt</TeilnehmerRahmen>);
    for (const a of queryAll<HTMLAnchorElement>("a")) {
      expect(a.getAttribute("href")?.startsWith("/m/uav")).toBe(false);
    }
  });

  // IDA-389: nach der Code-Anmeldung stand nirgends, wer eingetragen wird.
  it("zeigt, wer angemeldet ist, und den Weg zum Abmelden", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten={false} angemeldet="Ada Muster">Inhalt</TeilnehmerRahmen>);
    expect(query("[data-rolle='uav-angemeldet']").textContent).toContain("Angemeldet als Ada Muster");
    expect(query("[data-rolle='uav-abmelden']").textContent).toBe("Abmelden");
  });

  it("zeigt ohne Anmeldung keine Personenzeile", async () => {
    await mount(<TeilnehmerRahmen darfVerwalten={false}>Inhalt</TeilnehmerRahmen>);
    expect(exists("[data-rolle='uav-angemeldet']")).toBe(false);
  });
});
