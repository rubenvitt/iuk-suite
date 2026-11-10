// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { clickElement, exists, fill, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { BarEintrag } from "../../_lib/vorhabenBar";
import type { FormularDaten, VorhabenVorlage } from "../../_lib/vorhabenTypen";
import { zeitpunkt } from "../../_lib/zeit";
import { VorhabenFormular } from "./VorhabenFormular";

const aktion = vi.hoisted(() => ({ speichern: vi.fn() }));
vi.mock("../../_actions/vorhaben", () => ({ vorhabenSpeichernAction: aktion.speichern }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const ABEND = { von: zeitpunkt("2026-11-12", "19:00"), bis: zeitpunkt("2026-11-12", "22:00") };
const bar = (art: BarEintrag["art"], titel: string): BarEintrag => ({ id: `b-${titel}`, art, titel, ...ABEND });
const daten = (eintraege: BarEintrag[]): FormularDaten => ({
  mitglieder: [{ id: "nele", name: "Nele Vogt" }], projekte: [{ id: "p1", titel: "Weihnachtsmarkt-Stand" }], bar: eintraege,
});
const fertig = vi.fn();

async function zeige(vorlage: VorhabenVorlage, eintraege: BarEintrag[] = []) {
  await mount(<App><VorhabenFormular vorlage={vorlage} daten={daten(eintraege)} onFertig={fertig} /></App>);
}
const knopf = (text: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === text)!;

afterEach(async () => { await unmount(); aktion.speichern.mockReset(); router.push.mockReset(); fertig.mockReset(); });

describe("Formular Event/Projekt", () => {
  it("eine Zusage im Zeitraum blockiert „Bar belegen“, eine offene Anfrage ist nur Hinweis", async () => {
    await zeige({ art: "event", titel: "Spieleabend", ...ABEND, barBelegen: true }, [bar("zugesagt", "40. Geburtstag"), bar("angefragt", "Kaffeetrinken")]);
    expect(query("[data-konflikt]").dataset.konflikt).toBe("hart");
    expect(query("[data-konflikt]").textContent).toContain("Die Bar ist in dieser Zeit schon vergeben.");
    expect(query("[data-konflikt]").textContent).toContain("Zusage „40. Geburtstag“");
    expect(knopf("Anlegen").disabled).toBe(true);
    await unmount();

    await zeige({ art: "event", titel: "Spieleabend", ...ABEND, barBelegen: true }, [bar("angefragt", "Kaffeetrinken")]);
    expect(query("[data-konflikt]").dataset.konflikt).toBe("hinweis");
    expect(query("[data-konflikt]").textContent).toContain("Lehn sie danach unter Vermietung mit Begründung ab");
    expect(knopf("Anlegen").disabled).toBe(false);
  });

  it("ohne „Bar belegen“ gibt es keinen Konflikt; das eigene Event steht sich nicht im Weg", async () => {
    await zeige({ art: "event", titel: "Spieleabend", ...ABEND }, [bar("zugesagt", "40. Geburtstag")]);
    expect(exists("[data-konflikt]")).toBe(false);
    await unmount();
    await zeige({ id: "e1", art: "event", titel: "Spieleabend", ...ABEND, barBelegen: true }, [{ ...bar("event", "Spieleabend"), id: "e1" }]);
    expect(exists("[data-konflikt]")).toBe(false);
    expect(knopf("Speichern").disabled).toBe(false);
  });

  it("legt an, schickt Zeitpunkte in Millisekunden und springt auf die neue Seite", async () => {
    aktion.speichern.mockResolvedValue({ ok: true, wert: "neu-1" });
    await zeige({ art: "event", ...ABEND, projektId: "p1" });
    expect(knopf("Anlegen").disabled).toBe(true);
    await fill("input[placeholder='Zum Beispiel Spieleabend']", "Quizabend");
    await clickElement(knopf("Anlegen"));
    await act(async () => {});
    expect(aktion.speichern).toHaveBeenCalledWith(null, expect.objectContaining({ art: "event", titel: "Quizabend", ...ABEND, projektId: "p1", barBelegen: false }));
    expect(router.push).toHaveBeenCalledWith("/events/neu-1");
    expect(fertig).toHaveBeenCalled();
  });

  it("zeigt den Fehler des Servers am Feld und bleibt offen", async () => {
    aktion.speichern.mockResolvedValue({ ok: false, fehler: "Bitte die markierten Felder prüfen.", feldFehler: { titel: "Höchstens 120 Zeichen." } });
    await zeige({ id: "p1", art: "projekt", titel: "Bar renovieren", ziel: "2026-12-10" });
    expect((query<HTMLInputElement>(".ant-picker input")).value).toBe("10.12.2026");
    await clickElement(knopf("Speichern"));
    await act(async () => {});
    expect(aktion.speichern).toHaveBeenCalledWith("p1", expect.objectContaining({ art: "projekt", ziel: "2026-12-10" }));
    expect(query("[role=alert]").textContent).toBe("Höchstens 120 Zeichen.");
    expect(fertig).not.toHaveBeenCalled();
  });
});
