// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";

// Die Insel importiert `createServiceAction` direkt (Falle 9); die Action
// besitzt `actions.test.ts`, hier genuegt eine Attrappe des Moduls.
vi.mock("@/app/m/portal/actions", () => ({ createServiceAction: vi.fn() }));

import { ServiceForm } from "./service-form";
import { click, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DAS ANLEGEN-FORMULAR MIT GRUPPENWAHL (IDA-227). Die Wirkung, die hier zählt:
 * ein nicht öffentlicher Dienst ohne Gruppe lässt sich gar nicht erst abschicken
 * — die Action lehnte ihn ab, und die Seite zerfiele in einen Fehler.
 */

afterEach(unmount);

const GRUPPEN = [{ wert: "iuk", anzeige: "IuK-Gruppe" }];

function anlegen(): HTMLButtonElement {
  return query<HTMLButtonElement>("button[type=submit]");
}

it("zeigt die Gruppenwahl erst ohne Haken bei „Öffentlich“ und sperrt dann das Anlegen", async () => {
  await mount(<ServiceForm gruppen={GRUPPEN} />);
  expect(exists("#svc-gruppen")).toBe(false);
  expect(anlegen().disabled).toBe(false);

  await click("input[name=isPublic]");

  expect(exists("#svc-gruppen")).toBe(true);
  expect(anlegen().disabled).toBe(true);
  expect(queryAll("input[type=hidden][name=requiredGroups]")).toHaveLength(0);
});
