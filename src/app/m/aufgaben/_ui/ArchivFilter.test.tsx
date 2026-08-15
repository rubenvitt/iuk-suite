// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { ArchivFilter } from "./ArchivFilter";

afterEach(async () => {
  await unmount();
});

describe("ArchivFilter — natives GET-Formular, keine eigene Filterung im Browser", () => {
  it("traegt ein GET-Formular auf /archiv mit dem Feldnamen `prioritaet`", async () => {
    await mount(<ArchivFilter prioritaet="" />);
    const form = query<HTMLFormElement>("form");
    expect(form.method.toLowerCase()).toBe("get");
    expect(form.getAttribute("action")).toBe("/archiv");
    expect(query<HTMLSelectElement>("select").name).toBe("prioritaet");
  });

  it("zeigt „Alle“ und jede der drei Prioritaeten als Option", async () => {
    await mount(<ArchivFilter prioritaet="" />);
    const optionen = Array.from(query<HTMLSelectElement>("select").options).map((o) => o.textContent);
    expect(optionen).toEqual(["Alle", "Hoch", "Mittel", "Niedrig"]);
  });

  it("uebernimmt die vorgegebene Prioritaet als Vorbelegung", async () => {
    await mount(<ArchivFilter prioritaet="hoch" />);
    expect(query<HTMLSelectElement>("select").value).toBe("hoch");
  });
});
