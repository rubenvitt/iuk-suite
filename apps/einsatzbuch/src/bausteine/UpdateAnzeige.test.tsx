/**
 * Die Anzeige unten rechts: Spinner, solange das Update läuft, danach der wartende Neustart, und
 * vorher das anstehende Update. Die Einbindung in die App (auf der Startseite, ohne Anmeldung,
 * nach dem Ereignis des Updaters) prüft `App.test.tsx`.
 */
import { afterEach, describe, expect, it } from "vitest";

import { mount, queryAll, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import { UpdateAnzeige } from "./UpdateAnzeige";

const text = () => document.body.textContent ?? "";
const anzeige = () => queryAll<HTMLElement>(".update-anzeige");

afterEach(async () => {
  await unmount();
});

describe("UpdateAnzeige", () => {
  it("zeigt nichts ohne Vormerkung und ohne Lauf, die Live-Region steht trotzdem", async () => {
    await mount(<UpdateAnzeige update={null} lauf={null} />);
    expect(anzeige()).toHaveLength(0);
    expect(text()).toBe("");
    expect(queryAll('[role="status"]')).toHaveLength(1);
  });

  it("kündigt ein vorgemerktes Update an, ohne Spinner", async () => {
    await mount(<UpdateAnzeige update="1.2.0" lauf={null} />);
    expect(anzeige()[0].dataset.lauf).toBe("vorgemerkt");
    expect(text()).toContain("Update auf 1.2.0 steht an");
    expect(text()).toContain("Es wird installiert, sobald niemand angemeldet ist und kein Einsatz aussteht.");
    expect(queryAll(".update-spinner")).toHaveLength(0);
  });

  it("dreht einen Spinner, solange das Update heruntergeladen und installiert wird", async () => {
    await mount(<UpdateAnzeige update="1.2.0" lauf="laedt" />);
    expect(anzeige()[0].dataset.lauf).toBe("laedt");
    expect(queryAll(".update-spinner")).toHaveLength(1);
    expect(queryAll(".update-spinner")[0].getAttribute("aria-hidden")).toBe("true");
    expect(text()).toContain("Update wird installiert");
    expect(text()).toContain("Version 1.2.0. Die App startet danach neu.");
    expect(text()).not.toContain("steht an");
  });

  it("meldet den wartenden Neustart, auch ohne Version", async () => {
    await mount(<UpdateAnzeige update={null} lauf="neustart" />);
    expect(queryAll(".update-spinner")).toHaveLength(0);
    expect(text()).toContain("Update installiert");
    expect(text()).toContain("Die App startet neu, sobald niemand angemeldet ist und kein Einsatz aussteht.");
    expect(text()).not.toContain("Version");
  });
});
