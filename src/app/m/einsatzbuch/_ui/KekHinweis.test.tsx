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
    expect(hinweis.textContent).toContain("Die Verschlüsselung ist auf dem Server nicht eingerichtet");
    expect(hinweis.textContent).toContain("Melde dich bei der Technik.");
    expect(hinweis.getAttribute("data-ursache")).toBe("fehlt");
  });

  // IDA-390: Die Verwaltung liest Sätze, keine Variablennamen, Befehle oder Kürzel.
  it.each([
    [{ kek: "fehlt", paar: "fehlt", entwicklungsKekInProduktion: false }],
    [{ kek: "ungueltig", paar: "fehlt", entwicklungsKekInProduktion: false }],
    [{ kek: "ok", paar: "kek_passt_nicht", entwicklungsKekInProduktion: false }],
    [{ kek: "ok", paar: "ok", entwicklungsKekInProduktion: true }],
    [{ kek: "ok", paar: "fehlt", entwicklungsKekInProduktion: false }],
  ] as const)("ohne Technikwörter: %j", async (teil) => {
    await mount(<KekHinweis status={{ ...teil, schluesselId: null }} />);
    const text = query('[data-testid="kek-hinweis"]').textContent ?? "";
    for (const wort of ["KEK", "EINSATZBUCH_", "openssl", "pnpm", "Base64", "Umgebung"]) expect(text).not.toContain(wort);
    expect(text).toContain("Melde dich bei der Technik.");
  });

  it("zeigt nichts, wenn KEK und Schlüsselpaar in Ordnung sind", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "ok", schluesselId: "abc123", entwicklungsKekInProduktion: false }} />);
    expect(exists('[data-testid="kek-hinweis"]')).toBe(false);
  });

  it("warnt vor dem Entwicklungs-KEK, wenn der Status ihn in Produktion meldet", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "ok", schluesselId: "abc123", entwicklungsKekInProduktion: true }} />);
    const hinweis = query('[data-testid="kek-hinweis"]');
    expect(hinweis.textContent).toContain("Die Verschlüsselung läuft mit einem Testschlüssel");
    expect(hinweis.getAttribute("data-ursache")).toBe("entwicklungs_kek");
  });

  it("der Entwicklungs-KEK geht dem fehlenden Paar vor", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "fehlt", schluesselId: null, entwicklungsKekInProduktion: true }} />);
    expect(query('[data-testid="kek-hinweis"]').textContent).toContain("Die Verschlüsselung läuft mit einem Testschlüssel");
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
    if (warnt) expect(query('[data-testid="kek-hinweis"]').textContent).toContain("Die Verschlüsselung läuft mit einem Testschlüssel");
  });
});
