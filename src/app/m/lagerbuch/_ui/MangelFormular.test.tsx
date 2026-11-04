// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { click, exists, fill, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { vergissFluechtig } from "@/core/entwurf/ablage";
import { MangelFormular } from "./MangelFormular";

/*
 * IDA-358 — das Meldeformular sendet über `core/entwurf`. Geprüft wird hier,
 * was am Telefon zählt: Eingaben überstehen ein Neuladen, eine Meldung ohne
 * Antwort bleibt liegen und geht mit DERSELBEN Sendungs-ID erneut raus, eine
 * Ablehnung der Route wird nicht wiederholt. Die Route selbst (Wiederholung →
 * kein zweiter Mangel) prüft `helfer/mangel/melden/route.test.ts`.
 */

const fetchSpion = vi.fn<(url: string, init: { body: FormData }) => Promise<unknown>>();

function antwortet(status: number, koerper: unknown) {
  fetchSpion.mockImplementation(async () => ({ status, json: async () => koerper }));
}

function formular() {
  return (
    <MangelFormular
      ortId="rtw"
      ortAnzeige="RTW 1"
      punkte={["Verschmutzt", "Etwas anderes"]}
      andererOrt={null}
      rueckweg={{ href: "/helfer", text: "Zur Entnahme" }}
    />
  );
}

const BESCHREIBUNG = "#mangel-beschreibung";
const SENDEN = "[data-rolle='mangel-senden']";
const STATUS = "[data-rolle='mangel-status']";

function gesendet(n: number): FormData {
  return fetchSpion.mock.calls[n]![1].body;
}

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  vi.stubGlobal("fetch", fetchSpion);
  antwortet(200, { ok: true });
});

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("MangelFormular — IDA-358", () => {
  it("Beschreibung und Name stehen nach dem Neuladen wieder da; ‚Neu beginnen' verwirft sie", async () => {
    await mount(formular());
    await fill(BESCHREIBUNG, "Sitz vorne links eingerissen");
    await fill("#mangel-name", "Kim");
    await unmount();

    await mount(formular());
    expect(query<HTMLTextAreaElement>(BESCHREIBUNG).value).toBe("Sitz vorne links eingerissen");
    expect(query<HTMLInputElement>("#mangel-name").value).toBe("Kim");
    expect(query(STATUS).dataset.art).toBe("wiederhergestellt");
    await click("[data-rolle='entwurf-verwerfen']");
    expect(query<HTMLTextAreaElement>(BESCHREIBUNG).value).toBe("");
    expect(fetchSpion).not.toHaveBeenCalled();
  });

  it("ein Wurf laesst die Meldung liegen: ‚Nicht gesendet', die Eingaben bleiben", async () => {
    fetchSpion.mockRejectedValue(new TypeError("Failed to fetch"));
    await mount(formular());
    await fill(BESCHREIBUNG, "Tür klemmt");
    await click(SENDEN);
    expect(query(STATUS).dataset.art).toBe("nicht-gesendet");
    expect(query(STATUS).textContent).toMatch(/^Nicht gesendet\./);
    expect(query<HTMLTextAreaElement>(BESCHREIBUNG).value).toBe("Tür klemmt");
    expect(exists("[data-rolle='mangel-fertig']")).toBe(false);
  });

  it("eine Antwort ohne JSON (Rollout: 502) gilt als Wurf und wird nach dem Neuladen mit DERSELBEN Sendung wiederholt", async () => {
    fetchSpion.mockImplementation(async () => ({ status: 502, json: async () => { throw new SyntaxError("<html>"); } }));
    await mount(formular());
    await click("input[type='checkbox']");
    await fill(BESCHREIBUNG, "Tür klemmt");
    await click(SENDEN);
    const sendung = gesendet(0).get("sendung");
    expect(sendung).toMatch(/^[0-9a-f-]{36}$/);
    await unmount();

    antwortet(200, { ok: true });
    await mount(formular());
    expect(fetchSpion).toHaveBeenCalledTimes(2);
    expect(gesendet(1).get("sendung")).toBe(sendung);
    expect(gesendet(1).getAll("punkt")).toEqual(["Verschmutzt"]);
    expect(gesendet(1).get("beschreibung")).toBe("Tür klemmt");
    expect(exists("[data-rolle='mangel-fertig']")).toBe(true);
  });

  it("eine Ablehnung der Route zeigt ihren Satz und wird nicht wiederholt", async () => {
    antwortet(401, { ok: false, fehler: "Die Sitzung ist abgelaufen. Bitte das Etikett noch einmal scannen." });
    await mount(formular());
    await fill(BESCHREIBUNG, "Tür klemmt");
    await click(SENDEN);
    expect(query("[data-rolle='mangel-fehler']").textContent)
      .toBe("Die Sitzung ist abgelaufen. Bitte das Etikett noch einmal scannen.");
    await unmount();
    await mount(formular());
    expect(fetchSpion).toHaveBeenCalledTimes(1);
    expect(query<HTMLTextAreaElement>(BESCHREIBUNG).value).toBe("Tür klemmt");
  });
});
