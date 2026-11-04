// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { entwurfSchluessel, ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const a = vi.hoisted(() => ({ start: vi.fn(), abend: vi.fn(), gruppe: vi.fn() }));
vi.mock("../actions", () => ({
  startFeedbackAction: (...x: unknown[]) => a.start(...x),
  updateEveningAction: (...x: unknown[]) => a.abend(...x),
  updateGroupAction: (...x: unknown[]) => a.gruppe(...x),
  deleteGroupAction: vi.fn(),
  regenerateSecretAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { AbendBearbeiten } from "./AbendBearbeiten";
import { EinstellungenPanel } from "./EinstellungenPanel";
import { StartFormular } from "./StartFormular";

/** IDA-358: der Schluessel eines Bearbeiten-Entwurfs traegt den Fingerabdruck des Serverstands. */
const entwurfZu = (anfang: string) => {
  const k = entwurfSchluessel().find((x) => x.startsWith(anfang) && !x.endsWith(":wahl"));
  return k ? ladeEntwurf(k) : null;
};

/** IDA-358 — die Verwaltungsformulare des Feedbacks behalten ihre Eingaben auf dem Gerät. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  a.start.mockReset(); a.abend.mockReset(); a.gruppe.mockReset();
});
afterEach(async () => { await unmount(); });

const hinweis = () => document.querySelector("[data-rolle='entwurf-hinweis']")?.textContent ?? "";
const imPortal = <T extends HTMLElement>(sel: string) => document.body.querySelector<T>(sel)!;

describe("StartFormular (Modus 2)", () => {
  const ansicht = () => mount(<StartFormular groupId={7} heute="2026-11-04" teilnehmerVorbelegung={null} stunden={48} />);

  it("Thema und Teilnehmer überstehen Neuladen; ein bestätigter Start räumt den Entwurf", async () => {
    await ansicht();
    expect(ladeEntwurf("feedback:start:7:primaer")).toBeNull();
    await fill('input[name="topic"]', "Fahrzeugcheck 40-92-2");
    await fill('input[name="participantCount"]', "12");
    await unmount();

    await ansicht();
    expect(query<HTMLInputElement>('input[name="topic"]').value).toBe("Fahrzeugcheck 40-92-2");
    expect(query<HTMLInputElement>('input[name="participantCount"]').value).toBe("12");
    expect(hinweis()).toContain("Eingaben wiederhergestellt.");

    a.start.mockResolvedValue({ ok: true });
    await submitForm();
    await act(async () => {});
    expect(a.start).toHaveBeenCalledTimes(1);
    expect(ladeEntwurf("feedback:start:7:primaer")).toBeNull();
  });
});

describe("AbendBearbeiten (Modus 2)", () => {
  const ABEND = { eveningId: 3, datum: new Date(Date.UTC(2026, 10, 4, 12)), thema: "Funk", teilnehmer: 10, notizen: null };
  const ansicht = () => mount(<AbendBearbeiten abend={ABEND} offen schliessen={() => {}} />);

  it("stellt Thema und Notizen je Abend wieder her", async () => {
    await ansicht();
    const thema = imPortal<HTMLInputElement>('form[data-testid="abend-bearbeiten"] input[name="topic"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(thema, "Funkübung Süd");
      thema.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(entwurfZu("feedback:abend:3")).not.toBeNull();
    await unmount();

    await ansicht();
    expect(imPortal<HTMLInputElement>('form[data-testid="abend-bearbeiten"] input[name="topic"]').value).toBe("Funkübung Süd");
  });
});

describe("EinstellungenPanel — Gruppenformular (Modus 2)", () => {
  const ansicht = async () => {
    await mount(<EinstellungenPanel groupId={5} name="Bereitschaft" closeAfterHours={48} istAdmin={false} abende={0} rueckmeldungen={0} />);
    await act(async () => { query(".ant-collapse-header").click(); });
  };

  it("stellt den Gruppennamen wieder her", async () => {
    await ansicht();
    await fill('input[name="name"]', "Bereitschaft Uelzen");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>('input[name="name"]').value).toBe("Bereitschaft Uelzen");
    expect(entwurfZu("feedback:gruppe:5")).not.toBeNull();
  });
});
