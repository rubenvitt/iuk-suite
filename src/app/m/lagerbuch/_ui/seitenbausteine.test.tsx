// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { SeitenKopf } from "./SeitenKopf";
import { Brotkrume } from "./Brotkrume";
import { Kachel } from "./Kachel";
import s from "./verwaltung.module.css";

afterEach(async () => { await unmount(); });

describe("SeitenKopf", () => {
  it("rendert ein nacktes <h1>, kein Typography.Title", async () => {
    await mount(<SeitenKopf titel="Artikel & Bestand" />);
    const h1 = query("h1");
    expect(h1.textContent).toBe("Artikel & Bestand");
    // Typography.Title waere ein Compound-Zugriff und ergaebe in einer Server
    // Component HTTP 500 — auf 23 Seiten.
    expect(h1.className).not.toMatch(/ant-typography/);
  });

  it("setzt die Titel-Rolle als Inline-Stil, nicht als Klasse", async () => {
    await mount(<SeitenKopf titel="Journal" />);
    expect(query("h1").getAttribute("style")).toMatch(/font-size:\s*24px/);
  });

  it("rendert Beschreibung und Aktionen, wenn sie da sind", async () => {
    await mount(
      <SeitenKopf
        titel="Vorlagen"
        beschreibung={<span>Bestückung einmal definieren.</span>}
        aktionen={<button type="button">Neue Vorlage</button>}
      />,
    );
    expect(document.body.textContent).toContain("Bestückung einmal definieren.");
    expect(query("button").textContent).toBe("Neue Vorlage");
  });

  it("rendert ohne Beschreibung und ohne Aktionen genau ein Kind", async () => {
    await mount(<SeitenKopf titel="Inventur" />);
    expect(queryAll("h1")).toHaveLength(1);
    expect(exists("p")).toBe(false);
  });
});

describe("Brotkrume", () => {
  it("ist ein <nav aria-label=\"Brotkrume\"> mit einem Link", async () => {
    await mount(<Brotkrume href="/verwaltung/geraete">Geräte</Brotkrume>);
    expect(query("nav").getAttribute("aria-label")).toBe("Brotkrume");
    const a = query("nav a");
    expect(a.getAttribute("href")).toBe("/verwaltung/geraete");
    expect(a.textContent).toContain("Geräte");
  });

  it("traegt die Modulklasse .backlink und einen Pfeil", async () => {
    await mount(<Brotkrume href="/verwaltung/bz">BZ-Kontrolle</Brotkrume>);
    expect(query("nav a").className.split(" ")).toContain(s.backlink);
    expect(exists("nav a svg")).toBe(true);
  });

  it("benutzt KEIN antd-Breadcrumb", async () => {
    // Breadcrumb steht nicht auf der RSC-sicheren Liste, und ob die Komponente
    // in der RSC-Ebene laedt, ist NICHT gemessen. Eine ungemessene Annahme
    // kostet hier HTTP 500 auf neun Seiten.
    const quelle = readFileSync("src/app/m/lagerbuch/_ui/Brotkrume.tsx", "utf8");
    expect(quelle).not.toMatch(/Breadcrumb/);
    expect(quelle).not.toMatch(/from ["']antd["']/);
  });

  it("traegt die aeuszere Pfadform", async () => {
    await mount(<Brotkrume href="/verwaltung/vorlagen">Vorlagen</Brotkrume>);
    expect(query("nav a").getAttribute("href")).not.toMatch(/^\/m\/lagerbuch/);
  });
});

describe("Kachel", () => {
  it("rendert Zahl und Beschriftung", async () => {
    await mount(<Kachel zahl={7} beschriftung="Artikel unter Mindestbestand" />);
    expect(document.body.textContent).toContain("7");
    expect(document.body.textContent).toContain("Artikel unter Mindestbestand");
  });

  it("die Zahl traegt tabular-nums und KEINE Farbe", async () => {
    await mount(<Kachel zahl={12} beschriftung="offene Bestellpositionen" ton="rot" />);
    const zahl = query("[data-rolle='kachelzahl']");
    expect(zahl.getAttribute("style")).toMatch(/font-variant-numeric:\s*tabular-nums/);
    // Eine rote 7 IST Rot auf einer Datenflaeche — die Kante traegt die Farbe,
    // die Zahl traegt Tinte (§6.6.4).
    expect(zahl.getAttribute("style")).not.toMatch(/color:/);
  });

  it.each([
    ["rot", "kpiRot"],
    ["gelb", "kpiGelb"],
    ["ok", "kpiOk"],
  ] as const)("faerbt bei Ton %s die Kante ueber .%s", async (ton, klasse) => {
    await mount(<Kachel zahl={1} beschriftung="x" ton={ton} />);
    expect(query(`.${s.kpi}`).className.split(" ")).toContain(s[klasse]);
  });

  it("bekommt ohne Ton keine Kantenklasse", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("`grau` faerbt die Kante NICHT — er ist kein Ampelwert", async () => {
    await mount(<Kachel zahl={1} beschriftung="x" ton="grau" />);
    const klassen = query(`.${s.kpi}`).className.split(" ");
    expect(klassen).not.toContain(s.kpiRot);
    expect(klassen).not.toContain(s.kpiGelb);
    expect(klassen).not.toContain(s.kpiOk);
  });

  it("mit href wird sie ein Link mit Chevron", async () => {
    // Eine klickbare Kachel ohne erkennbare Klickbarkeit ist eine Sackgasse
    // fuer alle, die es nicht zufaellig ausprobieren.
    await mount(<Kachel zahl={3} beschriftung="abgelaufen" ton="rot" href="/verwaltung/verfall" />);
    const a = query("a");
    expect(a.getAttribute("href")).toBe("/verwaltung/verfall");
    expect(a.className.split(" ")).toContain(s.kpiLink);
    expect(exists("a svg")).toBe(true);
  });

  it("ohne href gibt es keinen Link und kein Chevron", async () => {
    await mount(<Kachel zahl={3} beschriftung="Buchungen im Journal" />);
    expect(exists("a")).toBe(false);
    expect(exists("svg")).toBe(false);
  });
});

describe("Alle drei sind RSC-tauglich", () => {
  it.each(["SeitenKopf", "Brotkrume", "Kachel"])("%s.tsx traegt kein \"use client\"", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(quelle.slice(0, 200)).not.toMatch(/["']use client["']/);
  });

  it.each(["SeitenKopf", "Brotkrume", "Kachel"])("%s.tsx importiert keine Icons aus antd", (name) => {
    const quelle = readFileSync(`src/app/m/lagerbuch/_ui/${name}.tsx`, "utf8");
    expect(quelle).not.toMatch(/@ant-design\/icons/);
  });
});
