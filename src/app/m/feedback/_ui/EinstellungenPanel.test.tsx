// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ZONE e — EINSTELLUNGEN (Entwurf §2.6, §4.4, §4.6, §4.9).
 *
 * Fuenf Server-Actions hatten keinen Aufrufer: Gruppe bearbeiten, Secret neu
 * erzeugen, Gruppe loeschen, Abend bearbeiten, Abend loeschen. Ohne diese Zone
 * bleibt jede Korrektur ein Datenbankeingriff.
 *
 * FUENF ZUSAGEN, DIE STILL BRECHEN:
 *
 * 1. EINGEKLAPPT IN ALLEN VIER ZUSTAENDEN (§2.6). Nichts hier braucht man im
 *    Gruppenraum — und ein aufgeklappter Gefahrenblock neben dem Primaerknopf
 *    ist genau die Verwechslung, die §2.6 mit der Reihenfolge harmlos →
 *    folgenschwer verhindert.
 * 2. `slug` IST NICHT EDITIERBAR (§2.6): er steckt in jedem gedruckten QR-Code.
 *    Ein Slug-Feld im Speichern-Formular waere ein stiller „Neues Secret"-Knopf.
 * 3. SPEICHERN IST `default`, NICHT `primary` (§2.6): es gibt genau einen
 *    Primaerknopf pro Seite, und der steht in der Lagekarte.
 * 4. DIE FOLGE WIRD WOERTLICH GENANNT (§4.6). „Neues Secret erzeugen" nennt die
 *    ungueltigen Aushaenge, „Gruppe loeschen" verlangt den abgetippten Namen und
 *    nennt ECHTE Zahlen aus der Seite — nie behauptete.
 * 5. ROT NUR AM KNOPFRAND UND IM okButton (§4.6/§4.9). `colorError ===
 *    colorPrimary === #c8000f`: ein `type="primary" danger` waere pixelgleich
 *    mit dem normalen Primaerknopf.
 */

const {
  useActionStateMock,
  updateGroupActionMock,
  regenerateSecretActionMock,
  deleteGroupActionMock,
  pushMock,
} = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  updateGroupActionMock: vi.fn(),
  regenerateSecretActionMock: vi.fn(),
  deleteGroupActionMock: vi.fn(),
  pushMock: vi.fn(),
}));

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});
vi.mock("../actions", () => ({
  updateGroupAction: updateGroupActionMock,
  regenerateSecretAction: regenerateSecretActionMock,
  deleteGroupAction: deleteGroupActionMock,
  // `Zuordnung` haengt in derselben Zone und importiert aus demselben Modul.
  addGroupLeaderAction: vi.fn(),
  removeGroupLeaderAction: vi.fn(),
}));
/** `useRouter` wirft ausserhalb des `AppRouterContext`; nach dem Loeschen gibt es
 *  die Seite nicht mehr, die Zone springt deshalb auf die Uebersicht. */
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: pushMock, refresh: vi.fn() }) }));

import { EinstellungenPanel, type EinstellungenPanelProps } from "./EinstellungenPanel";
import type { FormState } from "../_lib/formState";
import { act } from "react";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const UI = join(process.cwd(), "src/app/m/feedback/_ui");
const quelle = (datei: string) => readFileSync(join(UI, datei), "utf8");
/** Block- und Zeilenkommentare weg — sie zitieren die verbotenen Muster. */
const ohneKommentare = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|\s)\/\/.*$/gm, "");

const BASIS: EinstellungenPanelProps = {
  groupId: 7,
  name: "Bereitschaft Mitte",
  closeAfterHours: 48,
  istAdmin: false,
  abende: 12,
  rueckmeldungen: 143,
};

const panel = (over: Partial<EinstellungenPanelProps> = {}) => (
  <EinstellungenPanel {...BASIS} {...over} />
);
const markup = (over: Partial<EinstellungenPanelProps> = {}) =>
  renderToStaticMarkup(panel(over));

/** Die Zone ist zu — der Inhalt entsteht erst nach einem Klick auf den Kopf. */
async function aufklappen(over: Partial<EinstellungenPanelProps> = {}): Promise<void> {
  await mount(panel(over));
  await clickElement(query(".ant-collapse-header"));
}

/**
 * `fill` aus dem Harness sucht INNERHALB des gemounteten Wirts; `Modal` und
 * `Popconfirm` haengen aber im Portal an `document.body`. Deshalb dasselbe Muster
 * (Prototyp-Setter, damit Reacts value-Tracker die Aenderung sieht), nur ohne die
 * Wirt-Suche.
 */
async function tippen(el: HTMLInputElement, wert: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value")?.set;
  if (!setter) throw new Error("Kein value-Setter am Prototyp");
  await act(async () => {
    setter.call(el, wert);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const knopfMit = (beschriftung: string): HTMLElement => {
  const treffer = [
    ...queryAll("button"),
    ...Array.from(document.body.querySelectorAll<HTMLElement>(".ant-modal button, .ant-popover button")),
  ].find((b) => (b.textContent ?? "").trim() === beschriftung);
  if (!treffer) throw new Error(`Kein Knopf mit ${beschriftung}`);
  return treffer;
};

beforeEach(() => {
  useActionStateMock.mockReset();
  updateGroupActionMock.mockReset();
  regenerateSecretActionMock.mockReset();
  deleteGroupActionMock.mockReset();
  pushMock.mockReset();
  useActionStateMock.mockImplementation((_action: unknown, init: FormState) => [
    init,
    () => {},
    false,
  ]);
});
afterEach(async () => {
  await unmount();
  // antds Portale (Modal, Popconfirm) haengen an `body` und ueberleben das
  // Unmount des Wirts — ohne dieses Aufraeumen findet der naechste Test zwei
  // Dialoge und liest den falschen.
  document.body.replaceChildren();
});

describe("EinstellungenPanel — eingeklappt", () => {
  it("zeigt Label und Metazeile, aber keinen Inhalt", () => {
    const t = markup();
    expect(t).toContain("Einstellungen");
    expect(t).toContain("Name, Frist, Zugang");
    expect(t).not.toContain("Speichern");
    expect(t).not.toContain("Gruppe löschen");
  });

  it("fuer Admins nennt die Metazeile auch die Leitung", () => {
    expect(markup({ istAdmin: true, leitung: [] })).toContain("Name, Frist, Leitung, Zugang");
  });
});

describe("EinstellungenPanel — Gruppe bearbeiten (§2.6 Punkt 1)", () => {
  it("uebergibt updateGroupAction an useActionState", async () => {
    await aufklappen();
    expect(useActionStateMock).toHaveBeenCalledWith(updateGroupActionMock, { ok: true });
  });

  it("traegt id, Gruppenname und Standard-Schliessfrist mit Vorbelegung", async () => {
    await aufklappen();

    expect(query<HTMLInputElement>('input[name="id"]').value).toBe("7");
    expect(query<HTMLInputElement>('input[name="name"]').value).toBe("Bereitschaft Mitte");
    // Muss ein natives Feld MIT `name` sein, sonst landet die Frist nie in der
    // FormData der Action — `InputNumber` rendert das Feld selbst.
    expect(query<HTMLInputElement>('input[name="closeAfterHours"]').value).toBe("48");
  });

  it("hat KEIN slug-Feld — der Slug steht auf jedem gedruckten Aushang", async () => {
    await aufklappen();
    expect(queryAll('[name="slug"]')).toHaveLength(0);
  });

  it("nennt den Hilfetext der Frist wortgenau", async () => {
    await aufklappen();
    expect(query(".ant-collapse-body").textContent).toContain(
      "Vorgabe: 48 Stunden. Gilt für jede neu gestartete Umfrage — gerechnet ab Mitternacht nach dem Abendtag.",
    );
  });

  it("Speichern ist ein default-Knopf, kein Primaerknopf", async () => {
    await aufklappen();
    expect(knopfMit("Speichern").className).not.toContain("ant-btn-primary");
  });

  it("zeigt den Serverfehler am Feld statt auf einer Fehlerseite (§4.4)", async () => {
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { name: "Name fehlt" },
        values: { name: "", closeAfterHours: "72" },
      } satisfies FormState,
      () => {},
      false,
    ]);

    await aufklappen();

    const inhalt = query(".ant-collapse-body");
    expect(inhalt.textContent).toContain("Name fehlt");
    expect(query('input[name="name"]').getAttribute("aria-invalid")).toBe("true");
    // Eingaben gehen nicht verloren.
    expect(query<HTMLInputElement>('input[name="closeAfterHours"]').value).toBe("72");
  });
});

describe("EinstellungenPanel — Leitung (§2.6 Punkt 2)", () => {
  it("die getippte Null der Frist geht nicht verloren (§4.4)", async () => {
    // `0` ist falsy: ein `Number(...) || undefined` haette hier ein LEERES Feld
    // gezeigt — Fehlermeldung plus geloeschte Eingabe.
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { closeAfterHours: "Frist ungültig — ganze Stunden über 0" },
        values: { name: "Bereitschaft Mitte", closeAfterHours: "0" },
      } satisfies FormState,
      () => {},
      false,
    ]);

    await aufklappen();

    expect(query<HTMLInputElement>('input[name="closeAfterHours"]').value).toBe("0");
    expect(query(".ant-collapse-body").textContent).toContain("Frist ungültig");
  });
});

describe("EinstellungenPanel — Leitung, die Zone (§2.6 Punkt 2)", () => {
  it("Nicht-Admins sehen die Zone nicht", async () => {
    await aufklappen();
    expect(query(".ant-collapse-body").textContent).not.toContain("LEITUNG");
  });

  it("Admins sehen die Zuordnung mit Namen", async () => {
    await aufklappen({
      istAdmin: true,
      leitung: [{ userId: "sub-anna", name: "Anna Beispiel", email: null }],
    });
    const t = query(".ant-collapse-body").textContent ?? "";
    expect(t).toContain("LEITUNG");
    expect(t).toContain("Anna Beispiel");
  });
});

describe("EinstellungenPanel — FOLGENSCHWER: neues Secret (§4.6)", () => {
  it("nennt die Folge wortgenau und bestaetigt mit „Secret neu erzeugen“", async () => {
    await aufklappen();
    await clickElement(knopfMit("Neues Secret erzeugen"));

    const dialog = document.body.textContent ?? "";
    expect(dialog).toContain(
      "Bestehende QR-Codes und gedruckte Aushänge werden ungültig und müssen neu ausgehängt werden.",
    );
    expect(dialog).toContain("Secret neu erzeugen");
    expect(regenerateSecretActionMock).not.toHaveBeenCalled();
  });

  it("erst die Bestaetigung ruft regenerateSecretAction — mit der Gruppen-id", async () => {
    await aufklappen();
    await clickElement(knopfMit("Neues Secret erzeugen"));
    await clickElement(knopfMit("Secret neu erzeugen"));

    expect(regenerateSecretActionMock).toHaveBeenCalledTimes(1);
    const daten = regenerateSecretActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("id")).toBe("7");
  });
});

describe("EinstellungenPanel — FOLGENSCHWER: Gruppe loeschen (§4.6)", () => {
  it("nennt die ECHTEN Zahlen der Seite, nicht behauptete", async () => {
    await aufklappen();
    await clickElement(knopfMit("Gruppe löschen"));

    expect(document.body.textContent).toContain(
      "Löscht 12 Dienstabende und 143 Rückmeldungen unwiderruflich.",
    );
  });

  it("zaehlt im Singular richtig — „1 Dienstabend“, nicht „1 Dienstabende“", async () => {
    await aufklappen({ abende: 1, rueckmeldungen: 1 });
    await clickElement(knopfMit("Gruppe löschen"));

    expect(document.body.textContent).toContain(
      "Löscht 1 Dienstabend und 1 Rückmeldung unwiderruflich.",
    );
  });

  it("der okButton bleibt gesperrt, bis der Gruppenname abgetippt ist", async () => {
    await aufklappen();
    await clickElement(knopfMit("Gruppe löschen"));

    const bestaetigen = document.body.querySelector<HTMLButtonElement>(
      ".ant-modal-footer .ant-btn-dangerous",
    );
    if (!bestaetigen) throw new Error("Kein Gefahren-okButton im Modal");
    expect(bestaetigen.disabled).toBe(true);

    await clickElement(bestaetigen);
    expect(deleteGroupActionMock).not.toHaveBeenCalled();
  });

  it("abgetippter Name entsperrt, loescht und springt auf die Uebersicht", async () => {
    await aufklappen();
    await clickElement(knopfMit("Gruppe löschen"));

    const feld = document.body.querySelector<HTMLInputElement>(
      '[data-testid="loeschen-bestaetigung"]',
    );
    if (!feld) throw new Error("Kein Bestaetigungsfeld im Modal");
    await tippen(feld, "Bereitschaft Mitte");

    const bestaetigen = document.body.querySelector<HTMLButtonElement>(
      ".ant-modal-footer .ant-btn-dangerous",
    )!;
    expect(bestaetigen.disabled).toBe(false);

    await clickElement(bestaetigen);
    expect(deleteGroupActionMock).toHaveBeenCalledTimes(1);
    expect((deleteGroupActionMock.mock.calls[0][0] as FormData).get("id")).toBe("7");
    expect(pushMock).toHaveBeenCalledWith("/m/feedback");
  });
});

describe("EinstellungenPanel — Farb-Klausel (§4.9)", () => {
  it("kein type=\"primary\" mit danger, kein Alert type=\"error\"", () => {
    // OHNE Kommentare geprueft: die Begruendung der Klausel nennt das verbotene
    // Muster wortwoertlich, und ein Treffer im Kommentar waere ein Fehlalarm, der
    // beim naechsten Mal die Begruendung aus der Datei treibt.
    const src = ohneKommentare(quelle("EinstellungenPanel.tsx"));
    expect(src).not.toMatch(/type="primary"[^>]*danger/);
    expect(src).not.toMatch(/danger[^>]*type="primary"/);
    expect(src).not.toContain('type="error"');
  });

  it("benutzt Collapse mit items, nicht Collapse.Panel (§2.6)", () => {
    const src = ohneKommentare(quelle("EinstellungenPanel.tsx"));
    expect(src).not.toContain("Collapse.Panel");
    expect(src).toContain("items={");
  });

  it("die Gefahrenknoepfe sind Umrisse — danger ohne type", async () => {
    await aufklappen();
    for (const label of ["Neues Secret erzeugen", "Gruppe löschen"]) {
      const b = knopfMit(label);
      expect(b.className).toContain("ant-btn-dangerous");
      expect(b.className).not.toContain("ant-btn-primary");
    }
  });
});
