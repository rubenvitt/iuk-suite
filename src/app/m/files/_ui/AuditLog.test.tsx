// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { AuditLog, type AuditLogZeile } from "./AuditLog";

/**
 * DAS AUDIT-LOG DER SHARE-DETAILSEITE (Spec §7.8; Plan T41, Punkt 4).
 *
 * SERVERSEITIG GERENDERT UND NICHT GEMOUNTET: diese Komponente traegt keinen
 * Zustand — „mehr laden" ist ein LINK auf `?logs=<n>`, ein Suchparameter der
 * Server Component. Ein `mount` wuerde hier nichts pruefen, was das Serverbild
 * nicht schon zeigt, und die Bauform als Server Component gerade verdecken.
 *
 * WAS DIESE DATEI BESITZT: die Spaltenueberschriften (insbesondere den Wortlaut
 * „IP (unbestätigt, gekürzt)"), die Abbildung der Spalte „Was", die
 * Spaltenbreiten samt `scroll.x`, den Leerzustand und die beiden Ausgaenge des
 * Nachladewegs.
 *
 * WAS SIE NICHT BESITZT: die KLEMMUNG von `?logs=<n>` und die Aufloesung des
 * Dateinamens aus der Datenbank — beides besitzt
 * `(verwaltung)/shares/[id]/page.test.tsx` gegen eine echte, migrierte
 * Datenbank.
 */

function zeile(ueberschreibung: Partial<AuditLogZeile> = {}): AuditLogZeile {
  return {
    id: 1,
    zeitText: "25.07.2026, 12:00:03",
    dateiId: "fi-aaaaaa1",
    dateiname: "bericht.pdf",
    ipText: "192.168.178.0",
    agentText: "Mozilla/5.0 (Test)",
    ...ueberschreibung,
  };
}

function dom(element: ReactElement): HTMLElement {
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

function zeige(
  zeilen: AuditLogZeile[] = [zeile()],
  mehrHref: string | null = null,
  obergrenzeZeilen: number | null = null,
): HTMLElement {
  return dom(
    <AuditLog zeilen={zeilen} mehrHref={mehrHref} obergrenzeZeilen={obergrenzeZeilen} />,
  );
}

function zeilentext(wirt: HTMLElement, id: number): string {
  const tr = wirt.querySelector(`tr[data-row-key="${id}"]`);
  expect(tr, `keine Protokollzeile mit der id ${id}`).not.toBeNull();
  return (tr?.textContent ?? "").replace(/\s+/g, " ");
}

/**
 * Die GERENDERTEN Spaltenbreiten, nach Ueberschrift benannt statt nach Index:
 * eine umgestellte Spaltenreihenfolge verschoebe sonst still die Zuordnung, und
 * der Test pruefte danach eine andere Spalte als die, die er nennt.
 *
 * Gelesen wird das `<colgroup>` — NICHT die Konstante aus dem Modul. Ein
 * `expect(SPALTE_IP_GEKUERZT_PX)` waere dieselbe Selbstbespiegelung in anderem
 * Gewand: es verglieche die Datei mit sich selbst.
 */
function spaltenbreiten(wirt: HTMLElement): Map<string, number> {
  const spalten = Array.from(wirt.querySelectorAll("colgroup col"));
  const kopf = Array.from(wirt.querySelectorAll("thead th"));
  expect(spalten.length, "kein colgroup — traegt keine Spalte eine Breite?").toBe(kopf.length);
  expect(kopf.length, "keine Kopfzeile").toBeGreaterThan(0);
  return new Map(
    kopf.map((th, i) => [
      (th.textContent ?? "").trim(),
      Number.parseInt((spalten[i]?.getAttribute("style") ?? "").replace(/\D+/g, ""), 10),
    ]),
  );
}

function breite(wirt: HTMLElement, ueberschrift: string): number {
  const breiten = spaltenbreiten(wirt);
  const wert = breiten.get(ueberschrift);
  expect(wert, `keine Spalte „${ueberschrift}“ — vorhanden: ${[...breiten.keys()].join(" | ")}`)
    .not.toBeUndefined();
  return wert as number;
}

/**
 * DIE OBERGRENZE FUER „GEKUERZT", benannt statt geraten (§7.8, §4.5).
 *
 * Gespeichert wird das letzte Oktett als `0` bzw. das IPv6-Praefix als `/48`.
 * Die LAENGSTE real speicherbare Form ist damit `2001:db8:1234::/48` — 18
 * Zeichen. Eine VOLLSTAENDIGE IPv6-Adresse haette 39, also mehr als das
 * Doppelte, und fuer die reserviert diese Spalte ausdruecklich keinen Platz.
 *
 * Gerechnet mit 8px je Zeichen (14px Grundschrift der `small`-Tabelle) plus
 * 2 × 8px Zellenrand. Die Zahl ist eine OBERGRENZE, keine Sollbreite: die
 * Spalte darf breiter sein als ihr laengster Wert, weil ihre Ueberschrift
 * („IP (unbestätigt, gekürzt)", 25 Zeichen) laenger ist als jeder Wert. Sie darf
 * nur nicht so breit werden, dass eine volle Adresse hineinpasste — genau das
 * ist die Zusage, und genau die war unbewacht: eine Mutation
 * `SPALTE_IP_GEKUERZT_PX` 190 → 390 liess die Suite 11/11 gruen.
 */
const PX_JE_ZEICHEN = 8;
const ZELLENRAND_PX = 16;
const VOLLE_IPV6_ZEICHEN = 39;
const VOLLE_IPV6_BREITE_PX = VOLLE_IPV6_ZEICHEN * PX_JE_ZEICHEN + ZELLENRAND_PX;

// ---------------------------------------------------------------------------

describe("die Spaltenüberschriften sagen, was in der Spalte steht", () => {
  /**
   * DER FELDNAME TRAEGT DIE AUSSAGE (§7.8): `client_ip_unbestaetigt` kommt ohne
   * Trusted-Proxy-Pruefung vom Client, und gespeichert wird er GEKUERZT (letztes
   * Oktett bzw. `/48`). Beides gehoert in die Ueberschrift — sonst liest die
   * Spalte sich wie eine belastbare Adresse.
   */
  it("nennt die Adressspalte „IP (unbestätigt, gekürzt)“", () => {
    const ueberschriften = Array.from(zeige().querySelectorAll("th")).map((th) => th.textContent);
    expect(ueberschriften).toContain("IP (unbestätigt, gekürzt)");
    expect(ueberschriften).toContain("Zeit");
    expect(ueberschriften).toContain("Was");
  });
});

describe("die Spalte „Was“", () => {
  it("schreibt `Datei <name>` für eine einzelne Datei", () => {
    expect(zeilentext(zeige([zeile({ dateiname: "lagekarte.pdf" })]), 1)).toContain(
      "Datei lagekarte.pdf",
    );
  });

  /** `file_id = NULL` ist der 1:1-pflichtige Magic Value für „ZIP des GANZEN
   *  Shares" (§4.5) — nicht „keine Datei". */
  it("schreibt `ZIP`, wenn keine Datei-ID hinterlegt ist", () => {
    const text = zeilentext(zeige([zeile({ dateiId: null, dateiname: null })]), 1);
    expect(text).toContain("ZIP");
    expect(text).not.toContain("Datei");
  });

  /**
   * `download_logs` hat KEINEN Fremdschlüssel und kein Cascade (§4.5): die Zeile
   * überlebt ihre Datei. Ohne benannten Rückfall stünde hier „Datei undefined".
   */
  it("benennt eine nicht mehr vorhandene Datei, statt `undefined` zu schreiben", () => {
    const text = zeilentext(zeige([zeile({ dateiId: "fi-weg0001", dateiname: null })]), 1);
    expect(text).toContain("nicht mehr vorhanden");
    expect(text).not.toContain("undefined");
  });

  it("setzt für eine fehlende Adresse und einen fehlenden Browser einen Strich", () => {
    const text = zeilentext(zeige([zeile({ ipText: "—", agentText: "—" })]), 1);
    expect(text).toContain("—");
  });
});

describe("die Tabelle scrollt, statt umzubrechen", () => {
  /**
   * `scroll.x` MUSS die Summe der Spaltenbreiten sein: tragen die Spalten
   * `width`, ist die Summe die einzige richtige Zahl
   * (`docs/design/README.md:176-182`). Gemessen wird am GERENDERTEN `<colgroup>`
   * gegen die Breite, die rc-table an die Tabelle schreibt — eine der beiden
   * Seiten allein wäre bei einer geänderten Spaltenbreite still falsch.
   *
   * WAS DIESER TEST NICHT BESITZT: die einzelnen Spaltenbreiten. Er vergleicht
   * die Summe mit sich selbst und ist deshalb bei JEDER Spaltenbreite grün — die
   * Zahl der Adressspalte bindet der Test darunter.
   */
  it("setzt `scroll.x` auf die Summe der Spaltenbreiten", () => {
    const wirt = zeige();
    const breiten = [...spaltenbreiten(wirt).values()];
    expect(breiten.length, "kein colgroup — trägt keine Spalte eine Breite?").toBe(4);
    const summe = breiten.reduce((a, b) => a + b, 0);

    const tabelle = wirt.querySelector("table");
    const stil = (tabelle?.getAttribute("style") ?? "").replace(/\s+/g, "");
    expect(stil).toContain(`width:${summe}px`);
  });

  /**
   * DIE ADRESSSPALTE RECHNET MIT `0` AM ENDE (§7.8, Plan T41 Punkt 4) — eine
   * namentlich benannte Teilzusage, die bis hierher KEIN Test besaß.
   *
   * Drei Zusicherungen, weil eine allein die Zahl nicht bindet:
   *  - gegen die BENANNTE Obergrenze `VOLLE_IPV6_BREITE_PX`: die Spalte darf
   *    keinen Platz für eine vollständige 39-Zeichen-Adresse reservieren. Das
   *    ist die Zusage im Wortlaut.
   *  - gegen die BROWSERSPALTE: ein User-Agent ist ein Vielfaches länger als
   *    `2001:db8:1234::/48`, die Adressspalte gehört also zu den schmalen.
   *  - gegen die ZEITSPALTE: `25.07.2026, 12:00:03` sind 20 Zeichen, die
   *    längste speicherbare Adresse 18 — mehr Platz als die Zeit braucht die
   *    Adresse nicht. Diese dritte Schranke ist die engste und fängt die
   *    Mutationen ab, die zwischen 340 und 328 hindurchpassten.
   */
  it("reserviert für die Adresse keinen Platz für eine VOLLE IPv6-Adresse", () => {
    const wirt = zeige();
    const ip = breite(wirt, "IP (unbestätigt, gekürzt)");

    expect(ip, `${ip}px fassen eine volle Adresse — gespeichert wird gekürzt`).toBeLessThan(
      VOLLE_IPV6_BREITE_PX,
    );
    expect(ip, "die Adressspalte ist schmaler als die Browserspalte").toBeLessThan(
      breite(wirt, "Browser/Gerät"),
    );
    expect(ip, "die Adresse braucht nicht mehr Platz als der Zeitpunkt").toBeLessThanOrEqual(
      breite(wirt, "Zeit"),
    );
  });

  /** Keine Spalte trägt `fixed` oder `ellipsis`, `scroll.y` ist nicht gesetzt —
   *  sonst schaltet rc-table auf `table-layout: fixed` und verteilt die Spalten
   *  gleichmäßig (`lib/Table.js:426-442`). */
  it("rendert kein festes Tabellenlayout", () => {
    const stil = (zeige().querySelector("table")?.getAttribute("style") ?? "").replace(/\s+/g, "");
    expect(stil).not.toContain("table-layout:fixed");
  });
});

describe("die beiden Ausgänge des Nachladewegs", () => {
  it("verlinkt „mehr laden“ auf den übergebenen Pfad", () => {
    const mehr = zeige([zeile()], "/shares/sh-aaaaaa1?logs=200").querySelector(
      "[data-testid='files-auditlog-mehr']",
    );
    expect(mehr?.getAttribute("href")).toBe("/shares/sh-aaaaaa1?logs=200");
  });

  it("zeigt keinen Link, wenn es nichts nachzuladen gibt", () => {
    expect(zeige().querySelector("[data-testid='files-auditlog-mehr']")).toBeNull();
    expect(zeige().querySelector("[data-testid='files-auditlog-grenze']")).toBeNull();
  });

  /**
   * EIN LINK, DER NICHTS NACHLÄDT, IST EINE SACKGASSE. Ist die Obergrenze
   * erreicht und gibt es trotzdem ältere Einträge, wird der Zustand BENANNT —
   * ein weiterhin angebotenes „mehr laden“ wäre ein Bedienelement ohne Wirkung.
   */
  it("nennt die erreichte Obergrenze statt eines wirkungslosen Links", () => {
    const wirt = zeige([zeile()], null, 1000);
    expect(wirt.querySelector("[data-testid='files-auditlog-mehr']")).toBeNull();
    expect(wirt.querySelector("[data-testid='files-auditlog-grenze']")?.textContent).toContain(
      "1000",
    );
  });
});

describe("der Leerzustand", () => {
  it("nennt den Zustand, statt eine leere Tabelle zu zeigen", () => {
    const wirt = zeige([]);
    expect(wirt.querySelector("[data-testid='files-auditlog-leer']")).not.toBeNull();
    expect(wirt.querySelector("table")).toBeNull();
  });
});
