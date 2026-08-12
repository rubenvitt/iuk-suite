import { Alert } from "antd";
import { readFileSync } from "node:fs";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import type { CheckDetail } from "../../../../_lib/lesepfade/checks";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import {
  CheckDetailTabellen,
  type CheckDetailTabellenProps,
} from "./CheckDetailTabellen";
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
  unlesbar: false,
  summe: {
    positionen: 0,
    nachgefuellt: 0,
    korrigiert: 0,
    offen: 0,
    geraeteAuffaellig: 0,
    flaschenAuffaellig: 0,
    nichtBewertbar: 0,
    altFormat: false,
    unlesbar: false,
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

function istRekursivJsonSicher(wert: unknown): boolean {
  if (
    wert === null
    || typeof wert === "string"
    || typeof wert === "boolean"
  ) return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (typeof wert !== "object" || Object.getPrototypeOf(wert) !== Object.prototype) {
    return false;
  }
  return Reflect.ownKeys(wert).every((schluessel) =>
    typeof schluessel === "string"
    && istRekursivJsonSicher((wert as Record<string, unknown>)[schluessel]));
}

function importiertAntdTableDirekt(quelle: string): boolean {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const objektImporte = new Set<string>();
  for (const anweisung of source.statements) {
    if (
      !ts.isImportDeclaration(anweisung)
      || !ts.isStringLiteral(anweisung.moduleSpecifier)
    ) continue;
    const klausel = anweisung.importClause;
    if (!klausel || klausel.isTypeOnly) continue;
    const bindungen = klausel.namedBindings;
    if (/^antd\/(?:es|lib)\/table(?:\/|$)/i.test(anweisung.moduleSpecifier.text)) {
      if (
        klausel.name
        || (bindungen && ts.isNamespaceImport(bindungen))
        || (bindungen && ts.isNamedImports(bindungen)
          && bindungen.elements.some((element) => !element.isTypeOnly))
      ) return true;
      continue;
    }
    if (anweisung.moduleSpecifier.text !== "antd") continue;
    if (klausel.name) objektImporte.add(klausel.name.text);
    if (bindungen && ts.isNamespaceImport(bindungen)) {
      objektImporte.add(bindungen.name.text);
    }
    if (bindungen && ts.isNamedImports(bindungen) && bindungen.elements.some((element) =>
      !element.isTypeOnly
      && (element.propertyName?.text ?? element.name.text) === "Table")) {
      return true;
    }
  }

  let tableZugriff = false;
  function besuche(node: ts.Node): void {
    if (
      ts.isPropertyAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && objektImporte.has(node.expression.text)
      && node.name.text === "Table"
    ) {
      tableZugriff = true;
      return;
    }
    if (
      ts.isElementAccessExpression(node)
      && ts.isIdentifier(node.expression)
      && objektImporte.has(node.expression.text)
      && node.argumentExpression !== undefined
      && (
        ts.isStringLiteral(node.argumentExpression)
        || ts.isNoSubstitutionTemplateLiteral(node.argumentExpression)
      )
      && node.argumentExpression.text === "Table"
    ) {
      tableZugriff = true;
      return;
    }
    ts.forEachChild(node, besuche);
  }
  ts.forEachChild(source, besuche);
  return tableZugriff;
}

function tabellenAus(seite: ReactNode): CheckDetailTabellenProps {
  const [tabellen] = elementeVomTyp(seite, CheckDetailTabellen);
  if (!tabellen) throw new Error("Client-Tabellen des Check-Details fehlen");
  return tabellen.props as CheckDetailTabellenProps;
}

function gefuellterCheck(): CheckDetail {
  return {
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
}

describe("Check-Detailseite", () => {
  it("ist eine dynamische App-Router-Seite mit async Params", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(CheckDetailSeite).toBeTypeOf("function");
  });

  it("schickt alle fünf Tabellen als rekursiv JSON-sichere Anzeige-DTOs zur Client-Insel", () => {
    const props = tabellenAus(checkDetailInhalt(gefuellterCheck()));
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx",
      "utf8",
    );

    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(istRekursivJsonSicher(props)).toBe(true);
    expect([
      props.abgleichZeilen,
      props.nachfuellZeilen,
      props.geraeteZeilen,
      props.flaschenZeilen,
      props.verfallZeilen,
    ].map((zeilen) => Object.keys(zeilen[0]))).toEqual([
      ["id", "artikel", "sollText", "istText", "korrekturText", "nachgefuelltText", "offenChip"],
      ["id", "fachText", "artikelText", "einheitText", "sollText", "istText", "lueckeChip"],
      ["id", "name", "vorhandenChip", "zustandChip", "bemerkungText"],
      ["id", "name", "druck", "fuellstandChip"],
      ["id", "artikel", "verfallText", "statusChip"],
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

    const props = tabellenAus(checkDetailInhalt(check));

    expect(props.abgleichZeilen).toEqual([{
      id: "a1",
      artikel: "Verband",
      sollText: "4",
      istText: "2",
      korrekturText: "1",
      nachgefuelltText: "1",
      offenChip: { ton: "rot", zeichen: "warnung", text: "fehlt 1" },
    }]);
    expect(props.nachfuellZeilen).toEqual([{
      id: "sp-7",
      fachText: "Fach 7",
      artikelText: "Verband",
      einheitText: "Stk.",
      sollText: "4",
      istText: "2",
      lueckeChip: { ton: "rot", zeichen: "warnung", text: "2 fehlten" },
    }]);
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

    const zeilen = tabellenAus(checkDetailInhalt(check)).geraeteZeilen;

    expect(zeilen.map((zeile) => zeile.id)).toEqual([
      "g-null", "g-fremd", "g-defekt", "g-spuren",
    ]);
    expect(zeilen.map((zeile) => zeile.zustandChip)).toEqual([
      { ton: "grau", zeichen: null, text: "nicht erfasst" },
      { ton: "grau", zeichen: null, text: "Sonderprüfung" },
      { ton: "rot", zeichen: null, text: "Defekt" },
      { ton: "gelb", zeichen: null, text: "Gebrauchsspuren" },
    ]);
    expect(zeilen[1].vorhandenChip)
      .toEqual({ ton: "rot", zeichen: "warnung", text: "fehlt" });
    expect(zeilen[0].bemerkungText).toBe("—");
    expect(zeilen[1].bemerkungText).toBe("Werkstatt informieren");
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

    const zeilen = tabellenAus(checkDetailInhalt(check)).flaschenZeilen;

    expect(zeilen).toEqual([
      {
        id: "f-ohne-druck",
        name: "O2 ungemessen",
        druck: { darstellung: "chip", text: "nicht gemessen", ton: "grau" },
        fuellstandChip: { ton: "grau", zeichen: null, text: "nicht gemessen" },
      },
      {
        id: "f-ohne-nenn",
        name: "O2 ohne Nennwert",
        druck: { darstellung: "mono", text: "150 bar", ton: null },
        fuellstandChip: {
          ton: "grau", zeichen: null, text: "Nennfülldruck unbekannt",
        },
      },
      {
        id: "f-bewertet",
        name: "O2 bewertet",
        druck: { darstellung: "mono", text: "150 bar", ton: null },
        fuellstandChip: { ton: "ok", zeichen: null, text: "50 %" },
      },
    ]);
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

    expect(tabellenAus(seite).nachfuellLeertext)
      .toBe("Dieser Check stammt aus dem alten Format — Einzelpositionen sind darin nicht enthalten.");
  });

  it("kennzeichnet ein unlesbares Ergebnis, statt 0 Positionen zu behaupten", () => {
    /**
     * §11.5, Zustand 27. Ohne diese Meldung sieht ein Check mit zerstoertem
     * `ergebnis` aus wie einer, bei dem nichts zu tun war — die teuerste Sorte
     * 200. Nach dem Cutover sucht jemand einen Datenfehler, wo ein
     * Anzeigezustand fehlt.
     */
    const seite = checkDetailInhalt({ ...BASIS, unlesbar: true });

    const alerts = elementeVomTyp(seite, Alert);
    expect(alerts).toHaveLength(1);
    expect(alerts[0].props).toMatchObject({ type: "warning", showIcon: false });
    // ⚠️ NIE `type="error"`: `colorError === colorPrimary === #c8000f`, ein roter
    // Alert saehe hier aus wie eine Primaeraktion (§6.6.5).
    expect(alerts[0].props.type).not.toBe("error");
    expect(String(alerts[0].props.title)).toMatch(/^Ergebnis unlesbar/);

    // Und KEINE der fuenf Tabellen darunter darf der Meldung widersprechen:
    // „Keine Geraete in diesem Check." ist eine Tatsachenbehauptung, die hier
    // niemand pruefen konnte — genauso wenig wie „Keine Einzelposition
    // erfasst.". EIN Text fuer alle fuenf, weil es EINE Ursache ist.
    expect(tabellenAus(seite).unlesbarLeertext).toMatch(/nicht lesbar/i);
  });

  it("nimmt bei unlesbarem Ergebnis ALLEN fuenf Tabellen die Tatsachenbehauptung", () => {
    /**
     * Review-Fund (Minor 3): angepasst war zunaechst nur der Nachfuell-Leertext.
     * Danebenstanden weiter „Keine Positionen erfasst.", „Keine Geraete in
     * diesem Check.", „Keine Flaschen in diesem Check." und „Keine
     * Verfallsangabe in diesem Check." — vier Saetze, die etwas behaupten, was
     * bei zerstoertem `ergebnis` niemand geprueft hat. Die Begruendung, die
     * `nachfuellLeertext` geaendert hat, gilt fuer sie wortgleich.
     */
    const unlesbar = tabellenAus(checkDetailInhalt({ ...BASIS, unlesbar: true }));
    expect(unlesbar.unlesbarLeertext).toBeTruthy();

    // Die Gegenprobe: ein lesbarer Check bekommt KEINE Ueberschreibung, seine
    // Tabellen sagen weiter „Keine Geraete in diesem Check." — was dort ja auch
    // stimmt.
    expect(tabellenAus(checkDetailInhalt(BASIS)).unlesbarLeertext).toBeFalsy();
    // Und das Altformat behaelt seinen eigenen, anderen Nachfuell-Text.
    const alt = tabellenAus(checkDetailInhalt({
      ...BASIS, altFormat: true, summe: { ...BASIS.summe, altFormat: true },
    }));
    expect(alt.unlesbarLeertext).toBeFalsy();
    expect(alt.nachfuellLeertext).toMatch(/alten Format/);
  });

  it("meldet NICHTS fuer einen lesbaren Check mit 0 Positionen", () => {
    // Die Abgrenzung, an der die ganze Aenderung haengt: ein Check, der wirklich
    // nichts zu melden hatte, ist ein gueltiger Zustand und bekommt KEINE
    // Warnung. `BASIS` ist genau das — leere Listen, `unlesbar: false`.
    expect(elementeVomTyp(checkDetailInhalt(BASIS), Alert)).toHaveLength(0);
  });

  it("haelt Altformat und unlesbar auseinander — je eine Meldung, nie beide", () => {
    // Zwei Ursachen, zwei Texte. Sie schliessen einander aus (V1 kann nicht
    // unlesbar sein), und keiner der beiden erklaert den anderen: „alt" heisst
    // lesbar-aber-knapp, „unlesbar" heisst kaputt.
    const altText = String(
      elementeVomTyp(
        checkDetailInhalt({ ...BASIS, altFormat: true, summe: { ...BASIS.summe, altFormat: true } }),
        Alert,
      )[0].props.title,
    );
    const unlesbarText = String(
      elementeVomTyp(checkDetailInhalt({ ...BASIS, unlesbar: true }), Alert)[0].props.title,
    );

    expect(altText).not.toBe(unlesbarText);
    expect(altText).not.toMatch(/unlesbar/i);
    expect(unlesbarText).not.toMatch(/alten Format/i);
  });

  it("bereitet die gegen heute bewerteten Verfallszeilen serverseitig vor", () => {
    const check: CheckDetail = {
      ...BASIS,
      verfall: [{
        artikelId: "a1", artikelName: "Verband", verfall: "2026-06",
        ampel: "rot", abgelaufen: true, text: "abgelaufen",
      }],
    };

    expect(tabellenAus(checkDetailInhalt(check)).verfallZeilen).toEqual([{
      id: "a1",
      artikel: "Verband",
      verfallText: "2026-06",
      statusChip: { ton: "rot", zeichen: null, text: "abgelaufen" },
    }]);
  });

  it("verriegelt die directive-freie RSC-Seite gegen direkte antd-Table-Importe", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/[id]/page.tsx",
      "utf8",
    );

    expect(importiertAntdTableDirekt(quelle)).toBe(false);
    expect(importiertAntdTableDirekt('import { Table as Tabelle } from "antd";'))
      .toBe(true);
    expect(importiertAntdTableDirekt(
      'import * as Antd from "antd"; const tabelle = <Antd.Table />;',
    )).toBe(true);
    expect(importiertAntdTableDirekt(
      'import Antd from "antd"; const tabelle = <Antd.Table />;',
    )).toBe(true);
    expect(importiertAntdTableDirekt(
      'import * as Antd from "antd"; const alert = <Antd.Alert />;',
    )).toBe(false);
    expect(importiertAntdTableDirekt(
      'import Antd from "antd"; const alert = <Antd.Alert />;',
    )).toBe(false);
    expect(importiertAntdTableDirekt(
      'import type * as Antd from "antd"; type Props = Antd.TableProps;',
    )).toBe(false);
    expect(importiertAntdTableDirekt(
      'import type Antd from "antd"; type Props = Antd.TableProps;',
    )).toBe(false);
    expect(importiertAntdTableDirekt(
      'import * as Antd from "antd"; const Tabelle = Antd["Table"];',
    )).toBe(true);
    expect(quelle).not.toMatch(/["']use client["']/);
    expect(quelle).not.toMatch(/@ant-design\/icons|Table\.Column|Card\.Meta/);
    expect(quelle).toMatch(/params:\s*Promise<\{ id: string \}>/);
    expect(quelle).toMatch(/checkDetail\(getDb\(\), id, new Date\(\)\)/);
    expect(quelle).toMatch(/if \(!check\) notFound\(\)/);
  });

  it("reicht keine rohen Datumswerte oder Domänenzeilen durch", () => {
    const props = tabellenAus(checkDetailInhalt(gefuellterCheck()));

    expect(istRekursivJsonSicher(props)).toBe(true);
    expect(JSON.parse(JSON.stringify(props))).toEqual(props);
    expect(props.abgleichZeilen[0]).not.toHaveProperty("artikelId");
    expect(props.nachfuellZeilen[0]).not.toHaveProperty("artikelId");
    expect(props.geraeteZeilen[0]).not.toHaveProperty("geraetId");
    expect(props.flaschenZeilen[0]).not.toHaveProperty("flascheId");
    expect(props.verfallZeilen[0]).not.toHaveProperty("ampel");
  });
});
