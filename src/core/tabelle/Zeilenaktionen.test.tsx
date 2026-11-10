// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import { App } from "antd";
import { mount, unmount } from "@/app/m/qr/_lib/test-dom";
import { Zeilenaktionen } from "./Zeilenaktionen";
import { Datentabelle } from "./Datentabelle";
import { aktionsSpalte } from "./aktionsspalte";
import { kuerze } from "./kuerzen";

/*
 * Die Wirkung — die Zeile bleibt bei 1280px in ihrem Rahmen — misst nur ein echter Browser
 * (`e2e/tabellen-desktop.spec.ts`). Hier steht, WAS gerendert wird: ein Knopf oder ein Menü.
 */

afterEach(async () => {
  await unmount();
});

const knoepfe = () => [...document.querySelectorAll("button")];

describe("Zeilenaktionen", () => {
  it("rendert EINE Aktion als Knopf mit Text", async () => {
    const klick = vi.fn();
    await mount(<App><Zeilenaktionen name="Zeile" aktionen={[{ key: "b", label: "Bearbeiten", onClick: klick }]} /></App>);
    const [knopf] = knoepfe();
    expect(knopf?.textContent).toBe("Bearbeiten");
    await act(async () => { knopf!.click(); });
    expect(klick).toHaveBeenCalledOnce();
  });

  it("legt ab ZWEI Aktionen ein Menü hinter einen Knopf „Aktionen für …“", async () => {
    await mount(
      <App>
        <Zeilenaktionen
          name="Erika"
          aktionen={[
            { key: "a", label: "Bearbeiten" },
            { key: "b", label: "Entfernen", danger: true },
          ]}
        />
      </App>,
    );
    const alle = knoepfe();
    expect(alle).toHaveLength(1);
    expect(alle[0]!.getAttribute("aria-label")).toBe("Aktionen für Erika");
    expect(document.body.textContent).not.toContain("Entfernen");
  });

  it("zählt unsichtbare Aktionen nicht mit", async () => {
    await mount(
      <App>
        <Zeilenaktionen name="x" aktionen={[{ key: "a", label: "Bearbeiten" }, { key: "b", label: "Weg", sichtbar: false }]} />
      </App>,
    );
    expect(knoepfe().map((k) => k.textContent)).toEqual(["Bearbeiten"]);
  });

  it("lässt die Hauptaktion neben dem Menü stehen", async () => {
    await mount(
      <App>
        <Zeilenaktionen name="x" haupt={{ key: "h", label: "Prüfen" }} aktionen={[{ key: "a", label: "Bearbeiten" }]} />
      </App>,
    );
    const alle = knoepfe();
    expect(alle.map((k) => k.textContent)).toEqual(["Prüfen", ""]);
    expect(alle[1]!.getAttribute("aria-label")).toBe("Aktionen für x");
  });
});

describe("Aktionsspalte in der Datentabelle", () => {
  it("heftet die Spalte `aktion`/`aktionen` rechts an", async () => {
    type Z = { id: string };
    await mount(
      <App>
        <Datentabelle<Z>
          rowKey="id"
          dataSource={[{ id: "1" }]}
          columns={[
            { title: "Name", key: "name", render: () => "eins" },
            { title: "Aktion", key: "aktion", render: () => "x" },
            aktionsSpalte<Z>(() => "y"),
          ]}
        />
      </App>,
    );
    const kopf = [...document.querySelectorAll("thead th")];
    const fest = kopf.map((th) => th.className.includes("fix-end") || th.className.includes("fix-right"));
    expect(fest).toEqual([false, true, true]);
  });
});

describe("kuerze", () => {
  it("lässt kurze Werte stehen und kürzt lange mit „…“", () => {
    expect(kuerze("abc", 12)).toBe("abc");
    expect(kuerze("abcdefghijklm", 12)).toBe("abcdefghijklm");
    expect(kuerze("abcdefghijklmn", 12)).toBe("abcdefghijkl…");
  });
});
