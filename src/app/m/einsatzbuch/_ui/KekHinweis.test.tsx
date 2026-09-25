// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { testDb } from "../_lib/testDb";
import { ENTWICKLUNGS_KEK, KEK_VARIABLE } from "../_lib/schluessel/kek";
import { legePaarAn } from "../_lib/schluessel/paar";
import { schluesselStatus } from "../_lib/schluessel/status";
import { KekHinweis } from "./KekHinweis";

afterEach(unmount);

describe("KekHinweis", () => {
  it("zeigt den Hinweis auf den fehlenden KEK", async () => {
    await mount(<KekHinweis status={{ kek: "fehlt", paar: "fehlt", schluesselId: null, entwicklungsKekInProduktion: false }} />);
    const hinweis = query('[data-testid="kek-hinweis"]');
    expect(hinweis.textContent).toContain("Der Schlüssel-KEK fehlt");
  });

  it("zeigt nichts, wenn KEK und Schlüsselpaar in Ordnung sind", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "ok", schluesselId: "abc123", entwicklungsKekInProduktion: false }} />);
    expect(exists('[data-testid="kek-hinweis"]')).toBe(false);
  });

  it("warnt vor dem Entwicklungs-KEK, wenn der Status ihn in Produktion meldet", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "ok", schluesselId: "abc123", entwicklungsKekInProduktion: true }} />);
    const hinweis = query('[data-testid="kek-hinweis"]');
    expect(hinweis.textContent).toContain("Der Entwicklungs-KEK ist aktiv");
    expect(hinweis.textContent).toContain("steht im Repo");
    expect(hinweis.textContent).toContain("aus der Notfall-Sicherung neu ab");
  });

  it("der Entwicklungs-KEK geht dem fehlenden Paar vor — und rät dann zum Erzeugen, nicht zur Notfall-Sicherung", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "fehlt", schluesselId: null, entwicklungsKekInProduktion: true }} />);
    const text = query('[data-testid="kek-hinweis"]').textContent;
    expect(text).toContain("Der Entwicklungs-KEK ist aktiv");
    expect(text).toContain("eigenen KEK");
    expect(text).toContain("pnpm einsatzbuch:schluessel erzeugen");
    expect(text).not.toContain("Notfall-Sicherung");
  });
});

/*
 * Beide NODE_ENV-Fälle über die echte Kette Status → Hinweis: lokal (kein `production`)
 * schweigt der Hinweis zum Entwicklungs-KEK, im Container-Image warnt er.
 */
describe("KekHinweis mit schluesselStatus und dem Entwicklungs-KEK", () => {
  it.each([
    ["production", true],
    ["development", false],
    [undefined, false],
  ] as const)("NODE_ENV=%s → Warnung %s", async (nodeEnv, warnt) => {
    const db = testDb();
    const dev = new Uint8Array(Buffer.from(ENTWICKLUNGS_KEK, "base64"));
    await legePaarAn(db, { art: "echt", rechnerId: null, kek: dev, jetzt: new Date(0) });
    const status = await schluesselStatus(db, { [KEK_VARIABLE]: ENTWICKLUNGS_KEK, NODE_ENV: nodeEnv });
    await mount(<KekHinweis status={status} />);
    expect(exists('[data-testid="kek-hinweis"]')).toBe(warnt);
    if (warnt) expect(query('[data-testid="kek-hinweis"]').textContent).toContain("Der Entwicklungs-KEK ist aktiv");
  });
});
