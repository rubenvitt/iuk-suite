// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DIE ZUORDNUNG DER LEITUNG (Entwurf §2.6 Punkt 2).
 *
 * Ohne diese Oberflaeche sieht in Produktion kein Gruppenleiter seine Gruppe:
 * `user_groups` war ausschliesslich per Datenbankeingriff fuellbar. Vier Zusagen,
 * die still brechen:
 *
 * 1. ENTFERNEN FUNKTIONIERT, NICHT NUR HINZUFUEGEN. Eine Fehlzuordnung ohne
 *    Entfernen-Aktion ist wieder ein Datenbankeingriff.
 * 2. NAMEN, NICHT NUR KENNUNGEN. Eine Tabelle aus `sub`-UUIDs ist nicht
 *    pruefbar; wer noch keinen Anzeigenamen hat, bekommt den Satz „hat sich noch
 *    nicht angemeldet" statt einer leeren Zelle.
 * 3. FEHLER AM FELD, NICHT ALS ALERT (§4.4). „Diese E-Mail ist unbekannt" ist
 *    eine Feldaussage; ein `Alert type="error"` waere zusaetzlich ein Bruch der
 *    Farb-Klausel (§4.9).
 * 4. ROT IST HIER VERBOTEN (§4.9): `colorError === colorPrimary === #c8000f`.
 *    Kein `type="primary" danger`, kein `Alert type="error"`.
 */

const { useActionStateMock, addGroupLeaderActionMock, removeGroupLeaderActionMock } = vi.hoisted(
  () => ({
    useActionStateMock: vi.fn(),
    addGroupLeaderActionMock: vi.fn(),
    removeGroupLeaderActionMock: vi.fn(),
  }),
);

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});
// Die Actions liegen hinter `"use server"` und ziehen Datenbank und `next/*`
// nach — hier interessiert nur, DASS die richtige mit dem richtigen Schluessel
// gerufen wird.
vi.mock("../actions", () => ({
  addGroupLeaderAction: addGroupLeaderActionMock,
  removeGroupLeaderAction: removeGroupLeaderActionMock,
}));

import { Zuordnung, type ZuordnungPerson } from "./Zuordnung";
import type { FormState } from "../_lib/formState";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const quelle = () =>
  readFileSync(join(process.cwd(), "src/app/m/feedback/_ui/Zuordnung.tsx"), "utf8");

const PERSONEN: ZuordnungPerson[] = [
  { userId: "sub-anna", name: "Anna Beispiel", email: "anna@drk.example" },
  { userId: "sub-neu", name: null, email: null },
];

const markup = (personen: ZuordnungPerson[] = PERSONEN) =>
  renderToStaticMarkup(<Zuordnung groupId={7} personen={personen} />);

beforeEach(() => {
  useActionStateMock.mockReset();
  removeGroupLeaderActionMock.mockReset();
  useActionStateMock.mockImplementation((_action: unknown, init: FormState) => [
    init,
    () => {},
    false,
  ]);
});
afterEach(async () => {
  await unmount();
});

describe("Zuordnung — die Liste", () => {
  it("nennt zugeordnete Personen mit Namen und Kennung", () => {
    const t = markup();
    expect(t).toContain("Anna Beispiel");
    expect(t).toContain("sub-anna");
  });

  it("ohne Anzeigenamen steht: hat sich noch nicht angemeldet", () => {
    expect(markup()).toContain("hat sich noch nicht angemeldet");
  });

  it("leer ist ein Zustand, keine leere Tabelle (§4.3)", () => {
    const t = markup([]);
    expect(t).toContain("Niemand einzeln zugeordnet");
  });

  /**
   * KEINE AUSSAGE UEBER SICHTBARKEIT im Leerzustand. `memberGroupIdsFor`
   * (`queries.ts:38-55`) gewaehrt Zugang zusaetzlich ueber das Fachgruppen-
   * Attribut per Abgleich mit `groups.slug` — der uebliche Weg im Projekt (siehe
   * `alsGruppenleitung` in `actions.test.ts`). Eine leere `user_groups`-Liste ist
   * deshalb NICHT „nur fuer Admins sichtbar", und dieser Test haelt die
   * Falschaussage draussen, statt sich auf den Wortlaut zu verlassen.
   */
  it("behauptet im Leerzustand nicht, nur Admins koennten die Gruppe sehen", () => {
    const t = markup([]);
    expect(t).not.toContain("nur Admins");
    // Der Fachgruppen-Weg wird stattdessen benannt.
    expect(t).toContain("Fachgruppen-Attribut");
  });

  it("bietet zu jeder Person eine Entfernen-Aktion", () => {
    const t = markup();
    expect(t.match(/Entfernen/g) ?? []).toHaveLength(2);
  });
});

describe("Zuordnung — Entfernen", () => {
  it("ruft removeGroupLeaderAction mit Gruppe und Kennung", async () => {
    await mount(<Zuordnung groupId={7} personen={PERSONEN} />);

    await clickElement(query('[data-testid="entfernen-sub-anna"]'));

    expect(removeGroupLeaderActionMock).toHaveBeenCalledTimes(1);
    const daten = removeGroupLeaderActionMock.mock.calls[0][0] as FormData;
    expect(daten.get("groupId")).toBe("7");
    expect(daten.get("userId")).toBe("sub-anna");
  });
});

describe("Zuordnung — Hinzufuegen", () => {
  it("uebergibt addGroupLeaderAction an useActionState", () => {
    markup();
    expect(useActionStateMock).toHaveBeenCalledWith(addGroupLeaderActionMock, { ok: true });
  });

  it("traegt Gruppe und Eingabefeld im Formular", async () => {
    await mount(<Zuordnung groupId={7} personen={PERSONEN} />);

    expect(query<HTMLInputElement>('input[name="groupId"]').value).toBe("7");
    expect(queryAll('input[name="kennung"]')).toHaveLength(1);
  });

  it("beschriftet den Knopf wortgenau: Kennung oder E-Mail hinzufügen", () => {
    expect(markup()).toContain("Kennung oder E-Mail hinzufügen");
  });

  it("zeigt den Serverfehler AM FELD, mit aria-invalid und Verweis", () => {
    useActionStateMock.mockImplementation(() => [
      {
        ok: false,
        fieldErrors: { kennung: "Diese E-Mail ist unbekannt." },
        values: { kennung: "wer@drk.example" },
      } satisfies FormState,
      () => {},
      false,
    ]);

    const t = markup();
    expect(t).toContain("Diese E-Mail ist unbekannt.");
    expect(t).toContain('aria-invalid="true"');
    // Die Eingabe geht nicht verloren (§4.4).
    expect(t).toContain("wer@drk.example");
  });
});

describe("Zuordnung — Farb-Klausel (§4.9)", () => {
  it("kein type=\"primary\" mit danger und kein Alert type=\"error\"", () => {
    const src = quelle();
    expect(src).not.toMatch(/type="primary"[^>]*danger/);
    expect(src).not.toMatch(/danger[^>]*type="primary"/);
    expect(src).not.toContain('type="error"');
  });
});
