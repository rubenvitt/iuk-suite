// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import FreigabeNichtGefunden from "./not-found";

describe("unbekannter Freigabelink (IDA-388)", () => {
  it("sagt dasselbe wie der abgelaufene Link und führt nicht zur Startseite", () => {
    document.body.innerHTML = renderToStaticMarkup(<FreigabeNichtGefunden />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Dieser Link ist ungültig oder abgelaufen.");
    expect(text).toContain("Bitte wenden Sie sich an die Person, die Ihnen den Link gegeben hat.");
    expect(document.body.querySelector("a")).toBeNull();
    expect(text).not.toContain("Startseite");
  });
});
