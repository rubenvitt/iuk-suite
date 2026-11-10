// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";

// Die Insel importiert ihre Actions direkt (Falle 9); die Actions besitzt
// `actions.test.ts`, hier genuegt eine Attrappe des Moduls.
vi.mock("@/app/m/portal/actions", () => ({
  createServiceAction: vi.fn(),
  bearbeiteServiceAction: vi.fn(),
}));

import { bearbeiteServiceAction, createServiceAction } from "@/app/m/portal/actions";
import { ServiceForm } from "./service-form";
import { click, exists, fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";
import type { ServiceRow } from "./service-table";

/**
 * DAS FORMULAR FÜR „DIENST ANLEGEN" UND „DIENST BEARBEITEN". Gruppenwahl (IDA-227): ein nicht
 * öffentlicher Dienst ohne Gruppe lässt sich gar nicht erst abschicken. IDA-391: kein Feld für die
 * Kennung, alles, was die Kachel zeigt, und eine abgelehnte Eingabe lässt die Felder stehen.
 */

afterEach(unmount);
beforeEach(() => {
  vi.mocked(createServiceAction).mockReset();
  vi.mocked(bearbeiteServiceAction).mockReset();
});

const GRUPPEN = [{ wert: "iuk", anzeige: "IuK-Gruppe" }];
const DIENST: ServiceRow = {
  id: "w1",
  name: "Wiki",
  url: "https://wiki.example.org",
  description: "Handbuch",
  category: "Doku",
  iconUrl: null,
  openInNewTab: false,
  isPublic: true,
  requiredGroups: [],
};

function absenden(): HTMLButtonElement {
  return query<HTMLButtonElement>("button[type=submit]");
}

it("zeigt die Gruppenwahl erst ohne Haken bei „Öffentlich“ und sperrt dann das Anlegen", async () => {
  await mount(<ServiceForm gruppen={GRUPPEN} kategorien={[]} />);
  expect(exists("#svc-gruppen")).toBe(false);
  expect(absenden().disabled).toBe(false);

  await click("input[name=isPublic]");

  expect(exists("#svc-gruppen")).toBe(true);
  expect(absenden().disabled).toBe(true);
  expect(queryAll("input[type=hidden][name=requiredGroups]")).toHaveLength(0);
});

it("fragt keine Kennung ab, aber alles, was die Kachel zeigt", async () => {
  await mount(<ServiceForm gruppen={GRUPPEN} kategorien={["Doku"]} />);
  expect(exists("input[name=slug]")).toBe(false);
  for (const feld of ["name", "url", "description", "category", "iconUrl", "openInNewTab"]) {
    expect(exists(`[name=${feld}]`), feld).toBe(true);
  }
  expect(document.body.textContent).not.toMatch(/Slug/);
});

it("füllt beim Bearbeiten den Stand des Dienstes vor und schickt seine id mit", async () => {
  vi.mocked(bearbeiteServiceAction).mockResolvedValue({ ok: true });
  await mount(<ServiceForm gruppen={GRUPPEN} kategorien={[]} dienst={DIENST} />);
  expect(query<HTMLInputElement>("input[name=name]").value).toBe("Wiki");
  expect(query<HTMLInputElement>("input[name=category]").value).toBe("Doku");
  expect(query<HTMLInputElement>("input[name=openInNewTab]").checked).toBe(false);

  await submitForm();

  expect(createServiceAction).not.toHaveBeenCalled();
  const daten = vi.mocked(bearbeiteServiceAction).mock.calls[0][0];
  expect(daten.get("id")).toBe("w1");
  expect(daten.get("description")).toBe("Handbuch");
});

it("zeigt eine abgelehnte Eingabe und behält die Felder", async () => {
  vi.mocked(createServiceAction).mockResolvedValue({ ok: false, fehler: "Die Adresse muss mit http:// oder https:// beginnen." });
  const fertig = vi.fn();
  await mount(<ServiceForm gruppen={GRUPPEN} kategorien={[]} onFertig={fertig} />);
  await fill("input[name=name]", "Funk");
  await fill("input[name=url]", "funk.example");

  await submitForm();

  expect(fertig).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain("http:// oder https://");
  expect(query<HTMLInputElement>("input[name=name]").value).toBe("Funk");
});
