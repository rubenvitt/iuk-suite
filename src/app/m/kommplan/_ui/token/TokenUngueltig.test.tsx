import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TokenUngueltig } from "./TokenUngueltig";

describe("404 der Token-Ansicht (Entscheidung 4)", () => {
  it("ein Satz für alle Fälle, im Token-Rahmen, ohne Weg zur Startseite oder Anmeldung", () => {
    const html = renderToStaticMarkup(<TokenUngueltig />);
    expect(html).toContain("<h1>Dieser Link gilt nicht (mehr).</h1>");
    expect(html).toContain("Bitte die Person, die ihn dir geschickt hat, um einen neuen.");
    expect(html).toContain("kp-token-fahne");
    expect(html).not.toMatch(/<a\b|<button|href=|Anmeld|Startseite|Administration/);
  });
});
