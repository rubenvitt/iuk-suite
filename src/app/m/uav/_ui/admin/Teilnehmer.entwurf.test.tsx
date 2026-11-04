// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import { entwurfSchluessel, ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";

const a = vi.hoisted(() => ({ anlegen: vi.fn(), aendern: vi.fn() }));
vi.mock("../../_actions/teilnehmer", () => ({
  teilnehmerAnlegenAction: (...x: unknown[]) => a.anlegen(...x),
  teilnehmerAendernAction: (...x: unknown[]) => a.aendern(...x),
  codeNeuAction: vi.fn(),
  teilnehmerLoeschenAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

import { TeilnehmerAnlegen } from "./TeilnehmerAnlegen";
import { TeilnehmerDetail } from "./TeilnehmerDetail";

/** IDA-358: der Schluessel eines Bearbeiten-Entwurfs traegt den Fingerabdruck des Serverstands. */
const entwurfZu = (anfang: string) => {
  const k = entwurfSchluessel().find((x) => x.startsWith(anfang) && !x.endsWith(":wahl"));
  return k ? ladeEntwurf(k) : null;
};

/** IDA-358 — die Teilnehmerformulare der UAV-Verwaltung behalten ihre Eingaben auf dem Gerät. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  a.anlegen.mockReset(); a.aendern.mockReset();
});
afterEach(async () => { await unmount(); });

describe("TeilnehmerAnlegen (Modus 2)", () => {
  it("der Name übersteht Neuladen und gescheitertes Anlegen; Erfolg leert Formular und Entwurf", async () => {
    a.anlegen.mockRejectedValueOnce(new Error("502"));
    await mount(<TeilnehmerAnlegen />);
    await fill("#tn-name", "Rosa Beispiel");
    await submitForm();
    await act(async () => {});
    await unmount();

    await mount(<TeilnehmerAnlegen />);
    expect(query<HTMLInputElement>("#tn-name").value).toBe("Rosa Beispiel");
    a.anlegen.mockResolvedValue(undefined);
    await submitForm();
    await act(async () => {});
    expect(query<HTMLInputElement>("#tn-name").value).toBe("");
    expect(ladeEntwurf("uav:teilnehmer:neu")).toBeNull();
  });
});

describe("TeilnehmerDetail (Modus 2)", () => {
  const TN = { id: "t1", name: "Alina", loginCode: "ABC123", aktiv: true, beginn: null, lastSeen: null };
  const ansicht = () => mount(
    <TeilnehmerDetail detail={{ participant: TN, erledigt: 0, gesamt: 0, quote: 0, teile: [], aufgaben: [], letzteAktivitaet: null }} magicLink="https://example.org/?code=ABC123" />,
  );

  it("eine Namensänderung übersteht das Neuladen; das Speichern löscht den Entwurf und lässt den Namen stehen", async () => {
    await ansicht();
    await fill("#tn-detail-name", "Alina Muster");
    await unmount();
    await ansicht();
    expect(query<HTMLInputElement>("#tn-detail-name").value).toBe("Alina Muster");

    a.aendern.mockResolvedValue({ ...TN, name: "Alina Muster" });
    await submitForm();
    await act(async () => {});
    expect(entwurfZu("uav:teilnehmer:t1")).toBeNull();
    expect(query<HTMLInputElement>("#tn-detail-name").value).toBe("Alina Muster");
  });
});
