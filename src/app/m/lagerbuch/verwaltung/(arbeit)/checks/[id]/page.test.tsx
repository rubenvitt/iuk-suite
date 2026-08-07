import { Alert, Card, Table } from "antd";
import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { CheckDetail } from "../../../../_lib/lesepfade/checks";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Chip } from "../../../../_ui/Chip";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import CheckDetailSeite, { checkDetailInhalt, dynamic } from "./page";

const BASIS: CheckDetail = {
  id: "chk-1",
  fahrzeugId: "rtw-1",
  fahrzeugName: "RTW 1",
  fahrzeugKennung: "MS-1",
  quelleId: "111-111",
  startedAt: new Date("2026-06-15T09:00:00Z"),
  completedAt: new Date("2026-06-15T10:00:00Z"),
  positionen: [],
  artikel: [],
  geraete: [],
  flaschen: [],
  verfall: [],
  altFormat: false,
  summe: {
    positionen: 0,
    nachgefuellt: 0,
    korrigiert: 0,
    offen: 0,
    geraeteAuffaellig: 0,
    flaschenAuffaellig: 0,
    nichtBewertbar: 0,
    altFormat: false,
    verfallAuffaellig: 0,
  },
};

function elementeVomTyp(
  wert: ReactNode,
  typ: unknown,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ
    ? [wert as ReactElement<Record<string, unknown>>]
    : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function textVon(wert: ReactNode): string {
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  if (Array.isArray(wert)) return wert.map(textVon).join("");
  if (!isValidElement(wert)) return "";
  return textVon((wert.props as { children?: ReactNode }).children);
}

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

function analysiereRscTables(quelle: string) {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let renderEigenschaften = 0;
  let funktionaleRowKeys = 0;

  function besuche(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node)
      && ((ts.isIdentifier(node.name) && node.name.text === "render")
        || (ts.isStringLiteral(node.name) && node.name.text === "render"))
    ) {
      renderEigenschaften += 1;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "rowKey") {
      const initializer = node.initializer;
      const istStatischerString = initializer !== undefined && (
        ts.isStringLiteral(initializer)
        || (ts.isJsxExpression(initializer) && initializer.expression !== undefined
          && ts.isStringLiteral(initializer.expression))
      );
      if (!istStatischerString) funktionaleRowKeys += 1;
    }
    ts.forEachChild(node, besuche);
  }

  besuche(source);
  return { renderEigenschaften, funktionaleRowKeys };
}

describe("Check-Detailseite", () => {
  it("ist eine dynamische App-Router-Seite mit async Params", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(CheckDetailSeite).toBeTypeOf("function");
  });

  it("ordnet die fünf fachlich getrennten Abschnitte unverrückbar an", () => {
    const seite = checkDetailInhalt(BASIS);

    expect(elementeVomTyp(seite, Card).map((element) =>
      (element.props as { title?: ReactNode }).title)).toEqual([
      "Abgleich",
      "Nachfüllung (je Fach)",
      "Geräte",
      "Sauerstoff",
      "Verfall (gegen heute gerechnet)",
    ]);
  });

  it("zeigt die vier Nachweis-Kennzahlen aus der Check-Summe mit ihren Signaltönen", () => {
    const check: CheckDetail = {
      ...BASIS,
      summe: {
        ...BASIS.summe,
        positionen: 8,
        nachgefuellt: 3,
        korrigiert: 2,
        offen: 1,
      },
    };

    const kacheln = elementeVomTyp(checkDetailInhalt(check), Kachel);
    expect(kacheln).toHaveLength(4);
    expect(kacheln.map((kachel) => {
      const props = kachel.props as {
        zahl: ReactNode;
        beschriftung: ReactNode;
        ton?: string;
      };
      return {
        zahl: props.zahl,
        beschriftung: props.beschriftung,
        ton: props.ton,
      };
    })).toEqual([
      { zahl: 8, beschriftung: "geprüfte Positionen", ton: undefined },
      { zahl: 3, beschriftung: "nachgefüllt", ton: "rot" },
      { zahl: 2, beschriftung: "korrigiert", ton: "gelb" },
      { zahl: 1, beschriftung: "fehlt weiterhin", ton: "rot" },
    ]);

    expect(elementeVomTyp(checkDetailInhalt(BASIS), Kachel).map((kachel) =>
      (kachel.props as { ton?: string }).ton)).toEqual([
      undefined, "ok", "ok", "ok",
    ]);
  });

  it("gibt jedem Abschnitt eine statisch geschlüsselte zugängliche Tabelle", () => {
    const tabellen = elementeVomTyp(checkDetailInhalt(BASIS), Table);

    expect(tabellen).toHaveLength(5);
    const props = tabellen.map((element) => element.props as {
      rowKey: string;
      pagination: boolean;
      scroll: { x: string };
      "aria-label": string;
      locale: { emptyText: ReactNode };
      columns: Array<{ title: ReactNode }>;
    });
    expect(props.map((p) => p.rowKey)).toEqual(["id", "id", "id", "id", "id"]);
    expect(props.map((p) => p.pagination)).toEqual([false, false, false, false, false]);
    expect(props.map((p) => p.scroll)).toEqual([
      { x: "max-content" },
      { x: "max-content" },
      { x: "max-content" },
      { x: "max-content" },
      { x: "max-content" },
    ]);
    expect(props.map((p) => p["aria-label"])).toEqual([
      "Abgleich",
      "Nachfüllung je Fach",
      "Geräte im Check",
      "Sauerstoff im Check",
      "Verfallsmeldungen des Checks",
    ]);
    expect(props.map((p) => p.columns.map((spalte) => spalte.title))).toEqual([
      ["Artikel", "Soll", "Gezählt", "Korrigiert", "Nachgefüllt", "Offen"],
      ["Fach", "Artikel", "Soll", "Gezählt", "Lücke im Fach"],
      ["Gerät", "Vorhanden", "Zustand", "Bemerkung"],
      ["Flasche", "Druck", "Füllstand"],
      ["Artikel", "Verfall", "Status"],
    ]);
    expect(props.map((p) => p.locale.emptyText)).toEqual([
      "Keine Positionen erfasst.",
      "Keine Einzelposition erfasst.",
      "Keine Geräte in diesem Check.",
      "Keine Flaschen in diesem Check.",
      "Keine Verfallsangabe in diesem Check.",
    ]);
  });

  it("bereitet Abgleich und Nachfüllung mit ihren verschiedenen Auflösungen vor", () => {
    const check: CheckDetail = {
      ...BASIS,
      artikel: [{
        artikelId: "a1", artikelName: "Verband", einheit: "Stk.",
        sollSumme: 4, istSumme: 2, recordedVorher: 1,
        korrektur: 1, nachfuellGebucht: 1, offen: 1,
      }],
      positionen: [{
        id: "sp-7", fachLabel: "Fach 7", artikelId: "a1",
        artikelName: "Verband", einheit: "Stk.", soll: 4, ist: 2,
      }],
    };

    const tabellen = elementeVomTyp(checkDetailInhalt(check), Table);
    const abgleichDaten = (tabellen[0].props as {
      dataSource: Array<Record<string, ReactNode>>;
    }).dataSource;
    const nachfuellDaten = (tabellen[1].props as {
      dataSource: Array<Record<string, ReactNode>>;
    }).dataSource;

    expect(abgleichDaten).toHaveLength(1);
    expect(nachfuellDaten).toHaveLength(1);
    const abgleich = abgleichDaten[0];
    const nachfuellung = nachfuellDaten[0];

    expect(abgleich.id).toBe("a1");
    expect(abgleich.artikel).toBe("Verband");
    expect(["soll", "ist", "korrektur", "nachgefuellt"].map((feld) =>
      textVon(abgleich[feld]))).toEqual(["4", "2", "1", "1"]);
    const [offen] = elementeVomTyp(abgleich.offen, Chip);
    expect(offen.props).toMatchObject({ ton: "rot", zeichen: "warnung" });
    expect(textVon(offen)).toBe("fehlt 1");

    expect(nachfuellung.id).toBe("sp-7");
    expect(textVon(nachfuellung.fach)).toBe("Fach 7");
    expect(textVon(nachfuellung.artikel)).toBe("Verband Stk.");
    expect(textVon(nachfuellung.soll)).toBe("4");
    expect(textVon(nachfuellung.ist)).toBe("2");
    const [luecke] = elementeVomTyp(nachfuellung.luecke, Chip);
    expect(luecke.props).toMatchObject({ ton: "rot", zeichen: "warnung" });
    expect(textVon(luecke)).toBe("2 fehlten");
  });

  it("unterscheidet nicht erfasste, bekannte und fremde Gerätezustände", () => {
    const check: CheckDetail = {
      ...BASIS,
      geraete: [
        {
          geraetId: "g-null", name: "Absaugpumpe", typ: "medizin",
          vorhanden: true, zustand: null, bemerkung: null,
        },
        {
          geraetId: "g-fremd", name: "Monitor", typ: "medizin",
          vorhanden: false, zustand: "Sonderprüfung", bemerkung: "Werkstatt informieren",
        },
        {
          geraetId: "g-defekt", name: "Spineboard", typ: "objekt",
          vorhanden: true, zustand: "Defekt", bemerkung: null,
        },
        {
          geraetId: "g-spuren", name: "Tragestuhl", typ: "objekt",
          vorhanden: true, zustand: "Gebrauchsspuren", bemerkung: null,
        },
      ],
    };

    const tabellen = elementeVomTyp(checkDetailInhalt(check), Table);
    const zeilen = (tabellen[2].props as {
      dataSource: Array<Record<string, ReactNode>>;
    }).dataSource;

    expect(zeilen.map((zeile) => zeile.id)).toEqual([
      "g-null", "g-fremd", "g-defekt", "g-spuren",
    ]);
    expect(zeilen.map((zeile) => {
      const [chip] = elementeVomTyp(zeile.zustand, Chip);
      return { ton: chip.props.ton, text: textVon(chip) };
    })).toEqual([
      { ton: "grau", text: "nicht erfasst" },
      { ton: "grau", text: "Sonderprüfung" },
      { ton: "rot", text: "Defekt" },
      { ton: "gelb", text: "Gebrauchsspuren" },
    ]);
    const [fehlt] = elementeVomTyp(zeilen[1].vorhanden, Chip);
    expect(fehlt.props).toMatchObject({ ton: "rot", zeichen: "warnung" });
    expect(textVon(fehlt)).toBe("fehlt");
    expect(textVon(zeilen[0].bemerkung)).toBe("—");
    expect(textVon(zeilen[1].bemerkung)).toBe("Werkstatt informieren");
  });

  it("stellt die drei Sauerstoff-Nullzweige ohne erfundene Messwerte dar", () => {
    const check: CheckDetail = {
      ...BASIS,
      flaschen: [
        {
          flascheId: "f-ohne-druck", name: "O2 ungemessen",
          druckBar: null, nennfuelldruckBar: 300,
          prozent: null, ampel: null, niedrig: false,
        },
        {
          flascheId: "f-ohne-nenn", name: "O2 ohne Nennwert",
          druckBar: 150, nennfuelldruckBar: null,
          prozent: null, ampel: null, niedrig: false,
        },
        {
          flascheId: "f-bewertet", name: "O2 bewertet",
          druckBar: 150, nennfuelldruckBar: 300,
          prozent: 50, ampel: "gruen", niedrig: false,
        },
      ],
    };

    const tabellen = elementeVomTyp(checkDetailInhalt(check), Table);
    const zeilen = (tabellen[3].props as {
      dataSource: Array<Record<string, ReactNode>>;
    }).dataSource;

    expect(zeilen.map((zeile) => zeile.id)).toEqual([
      "f-ohne-druck", "f-ohne-nenn", "f-bewertet",
    ]);
    const [druckFehlt] = elementeVomTyp(zeilen[0].druck, Chip);
    const [fuellstandFehlt] = elementeVomTyp(zeilen[0].fuellstand, Chip);
    expect({ ton: druckFehlt.props.ton, text: textVon(druckFehlt) })
      .toEqual({ ton: "grau", text: "nicht gemessen" });
    expect({ ton: fuellstandFehlt.props.ton, text: textVon(fuellstandFehlt) })
      .toEqual({ ton: "grau", text: "nicht gemessen" });

    expect(textVon(zeilen[1].druck)).toBe("150 bar");
    const [nennFehlt] = elementeVomTyp(zeilen[1].fuellstand, Chip);
    expect({ ton: nennFehlt.props.ton, text: textVon(nennFehlt) })
      .toEqual({ ton: "grau", text: "Nennfülldruck unbekannt" });

    expect(textVon(zeilen[2].druck)).toBe("150 bar");
    const [bewertet] = elementeVomTyp(zeilen[2].fuellstand, Chip);
    expect({ ton: bewertet.props.ton, text: textVon(bewertet) })
      .toEqual({ ton: "ok", text: "50 %" });
  });

  it("erklärt Gegen-heute-Bewertung und Altformat mit äußerem Rückweg", () => {
    const check: CheckDetail = {
      ...BASIS,
      altFormat: true,
      summe: { ...BASIS.summe, altFormat: true },
    };
    const seite = checkDetailInhalt(check);

    const brotkrumen = elementeVomTyp(seite, Brotkrume);
    expect(brotkrumen).toHaveLength(1);
    expect(brotkrumen[0].props).toMatchObject({ href: "/verwaltung/checks" });
    expect(textVon(brotkrumen[0])).toBe("Fahrzeug-Checks");

    const koepfe = elementeVomTyp(seite, SeitenKopf);
    expect(koepfe).toHaveLength(1);
    expect(koepfe[0].props).toMatchObject({ titel: "RTW 1" });
    expect(textVon(koepfe[0].props.beschreibung as ReactNode)).toMatch(/gegen heute gerechnet/i);

    const alerts = elementeVomTyp(seite, Alert);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].props).toMatchObject({
      type: "warning",
      showIcon: false,
      title: "Dieser Check stammt aus dem alten Format. Die Einzelpositionen sind darin nicht enthalten; die Summen unten sind vollständig.",
    });

    const tabellen = elementeVomTyp(seite, Table);
    expect((tabellen[1].props as { locale: { emptyText: ReactNode } }).locale.emptyText)
      .toBe("Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten.");
  });

  it("bereitet die gegen heute bewerteten Verfallszeilen serverseitig vor", () => {
    const check: CheckDetail = {
      ...BASIS,
      verfall: [{
        artikelId: "a1", artikelName: "Verband", verfall: "2026-06",
        ampel: "rot", abgelaufen: true, text: "abgelaufen",
      }],
    };

    const tabellen = elementeVomTyp(checkDetailInhalt(check), Table);
    const zeilen = (tabellen[4].props as {
      dataSource: Array<Record<string, ReactNode>>;
    }).dataSource;

    expect(zeilen).toHaveLength(1);
    expect(zeilen[0]).toMatchObject({ id: "a1", artikel: "Verband" });
    expect(textVon(zeilen[0].verfall)).toBe("2026-06");
    const [status] = elementeVomTyp(zeilen[0].status, Chip);
    expect({ ton: status.props.ton, text: textVon(status) })
      .toEqual({ ton: "rot", text: "abgelaufen" });
  });

  it("hält alle Table-Props in der Server Component serialisierbar und funktionsfrei", () => {
    expect(
      analysiereRscTables(
        '<Table rowKey={(zeile) => zeile.id} columns={[{ render: () => null }]} />',
      ),
    ).toEqual({ renderEigenschaften: 1, funktionaleRowKeys: 1 });

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx",
      "utf8",
    );
    expect(analysiereRscTables(quelle)).toEqual({
      renderEigenschaften: 0,
      funktionaleRowKeys: 0,
    });
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toMatch(/@ant-design\/icons|Table\.Column|Card\.Meta/);
    expect(quelle).toMatch(/params:\s*Promise<\{ id: string \}>/);
    expect(quelle).toMatch(/checkDetail\(getDb\(\), id, new Date\(\)\)/);
    expect(quelle).toMatch(/if \(!check\) notFound\(\)/);
  });

  it("reicht an keine der fünf Tabellen rohe Datumswerte oder Domänenzeilen durch", () => {
    const check: CheckDetail = {
      ...BASIS,
      artikel: [{
        artikelId: "a1", artikelName: "Verband", einheit: "Stk.",
        sollSumme: 2, istSumme: 1, recordedVorher: 1,
        korrektur: 0, nachfuellGebucht: 0, offen: 1,
      }],
      positionen: [{
        id: "sp1", fachLabel: "Fach 1", artikelId: "a1",
        artikelName: "Verband", einheit: "Stk.", soll: 2, ist: 1,
      }],
      geraete: [{
        geraetId: "g1", name: "Monitor", typ: "medizin",
        vorhanden: true, zustand: "In Ordnung", bemerkung: null,
      }],
      flaschen: [{
        flascheId: "f1", name: "O2", druckBar: 180,
        nennfuelldruckBar: 200, prozent: 90, ampel: "gruen", niedrig: false,
      }],
      verfall: [{
        artikelId: "a1", artikelName: "Verband", verfall: "2027-12",
        ampel: "gruen", abgelaufen: false, text: "haltbar",
      }],
    };

    const daten = elementeVomTyp(checkDetailInhalt(check), Table).map((tabelle) =>
      (tabelle.props as { dataSource: Array<Record<string, ReactNode>> }).dataSource);
    expect(daten.map((zeilen) => Object.keys(zeilen[0]))).toEqual([
      ["id", "artikel", "soll", "ist", "korrektur", "nachgefuellt", "offen"],
      ["id", "fach", "artikel", "soll", "ist", "luecke"],
      ["id", "name", "vorhanden", "zustand", "bemerkung"],
      ["id", "name", "druck", "fuellstand"],
      ["id", "artikel", "verfall", "status"],
    ]);
    expect(enthaeltDate(daten)).toBe(false);
  });
});
