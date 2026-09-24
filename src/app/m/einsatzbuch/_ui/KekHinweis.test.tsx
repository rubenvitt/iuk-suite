// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { exists, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { KekHinweis } from "./KekHinweis";

afterEach(unmount);

describe("KekHinweis", () => {
  it("zeigt den Hinweis auf den fehlenden KEK", async () => {
    await mount(<KekHinweis status={{ kek: "fehlt", paar: "fehlt", schluesselId: null }} />);
    const hinweis = query('[data-testid="kek-hinweis"]');
    expect(hinweis.textContent).toContain("Der Schlüssel-KEK fehlt");
  });

  it("zeigt nichts, wenn KEK und Schlüsselpaar in Ordnung sind", async () => {
    await mount(<KekHinweis status={{ kek: "ok", paar: "ok", schluesselId: "abc123" }} />);
    expect(exists('[data-testid="kek-hinweis"]')).toBe(false);
  });
});
