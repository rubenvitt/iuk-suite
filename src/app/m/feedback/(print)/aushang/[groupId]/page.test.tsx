// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import Database from "better-sqlite3";
import * as schema from "../../../_db/schema";
import { insertGroup } from "../../../_db/queries";

/**
 * DER AUSHANG (Entwurf §3.5) — das Druckstück, das an die Wand des Gruppenraums
 * kommt und dort JAHRE hängt.
 *
 * Was hier bewacht wird:
 *
 * 1. A4, `@page`, `@media print` — und KEINE Suite-Navigation im Druck. Ein
 *    Aushang mit AppSwitcher-Leiste ist Papierverschwendung.
 * 2. Der QR ist groß (90mm) und in Druckauflösung (`?w=1024`). Der Endpunkt
 *    liefert ohne Parameter 512px, das sind auf 90mm ~145 dpi — sichtbar
 *    ausgefranst.
 * 3. Die Seite zeigt das SECRET der Gruppe. Sie ist deshalb ohne Anmeldung
 *    nicht erreichbar: Layout-Backstop (`layout.test.tsx`) UND `guardPage` in
 *    der Seite selbst.
 * 4. Keine Notendaten, keine Notenfarben — der Aushang zeigt keine Daten.
 */
const { guardPageMock } = vi.hoisted(() => ({ guardPageMock: vi.fn() }));

vi.mock("../../../_lib/guardPage", () => ({ guardPage: guardPageMock }));
vi.mock("../../../_db/client", () => ({ getDb: () => db }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound(): die Gruppe wurde nicht geladen");
  },
}));
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({
      host: "10.0.3.14:3000",
      "x-forwarded-host": "feedback.iuk-ue.de",
      "x-forwarded-proto": "https",
    }),
}));

import Aushang from "./page";

const TOKEN = "bereitschaft-abc12";
const URL_VOLL = `https://feedback.iuk-ue.de/f/${TOKEN}`;

let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  insertGroup(db, {
    name: "Bereitschaft Übach-Palenberg",
    slug: "bereitschaft",
    secret: "abc12",
    closeAfterHours: null,
    createdAt: new Date(0),
  });
  guardPageMock.mockReset();
  guardPageMock.mockResolvedValue({ viewer: { sub: "u1" }, db });
});
afterEach(() => sqlite.close());

async function zeichne(groupId = "1"): Promise<HTMLElement> {
  const element = await Aushang({ params: Promise.resolve({ groupId }) });
  const wirt = document.createElement("div");
  wirt.innerHTML = renderToStaticMarkup(element);
  return wirt;
}

describe("Aushang — Inhalt (§3.5)", () => {
  it("prüft den Zugang mit der geladenen Gruppen-Id, nicht nur im Layout", async () => {
    await zeichne("1");
    expect(guardPageMock).toHaveBeenCalledWith(1);
  });

  it("trägt Frage, Gruppenname, Adresse, Erklärzeile und Fußzeile wortgenau", async () => {
    const t = (await zeichne()).textContent ?? "";
    expect(t).toContain("Wie war der Dienstabend?");
    expect(t).toContain("Bereitschaft Übach-Palenberg");
    expect(t).toContain(URL_VOLL);
    expect(t).toContain("Anonym · 8 Noten, 6 freie Zeilen · etwa 2 Minuten");
    expect(t).toContain("Der Code gilt für alle Dienstabende.");
    expect(t).toContain("DRK");
  });

  it("zeigt den QR in Druckauflösung (`?w=1024`), nicht die 512px der Vorschau", async () => {
    const bild = (await zeichne()).querySelector<HTMLImageElement>("img");
    expect(bild).not.toBeNull();
    expect(bild!.getAttribute("src")).toBe(`/f/${TOKEN}/qr.png?w=1024`);
  });

  it("bietet einen Drucken-Knopf, der selbst nicht mitgedruckt wird", async () => {
    const wirt = await zeichne();
    const knopf = [...wirt.querySelectorAll<HTMLElement>("button")].find((b) =>
      (b.textContent ?? "").includes("Drucken"),
    );
    expect(knopf).toBeDefined();
    expect(knopf!.closest(".noprint")?.className ?? knopf!.className).toContain("noprint");
  });

  it("enthält keine Suite-Navigation", async () => {
    const wirt = await zeichne();
    expect(wirt.querySelector("nav")).toBeNull();
    expect(wirt.querySelector("header.ant-layout-header")).toBeNull();
    expect(wirt.textContent).not.toContain("Feedback-Verwaltung");
  });

  it("zeigt keine Notendaten und keine Notenfarben", async () => {
    const markup = (await zeichne()).innerHTML;
    for (const note of ["#2f7f59", "#54782a", "#7e6103", "#904708", "#912e10", "#811221"]) {
      expect(markup.toLowerCase()).not.toContain(note);
    }
  });
});

describe("Aushang — Druck-CSS (§3.5)", () => {
  const css = readFileSync(join(process.cwd(), "src/app/m/feedback/(print)/druck.css"), "utf8");
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  /** Der Rumpf einer Regel — die Datei hat keine verschachtelten Bloecke. */
  const rumpf = (selektor: string) => {
    const treffer = new RegExp(`\\${selektor}\\s*\\{([^}]*)\\}`).exec(ohneKommentare);
    expect(treffer, `Regel ${selektor} fehlt in druck.css`).not.toBeNull();
    return treffer![1];
  };

  it("legt A4 mit 18mm Rand fest", () => {
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/);
    expect(css).toMatch(/@page\s*\{[^}]*margin:\s*18mm/);
  });

  it("blendet im Druck `.noprint` aus und erzwingt Farbtreue", () => {
    expect(css).toContain("@media print");
    expect(css).toMatch(/\.noprint\s*\{\s*display:\s*none/);
    // Ohne `print-color-adjust: exact` schluckt der Browser die rote Fahne.
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toContain("-webkit-print-color-adjust: exact");
  });

  it("gibt dem QR 90mm — die Auflösung allein macht ihn nicht groß", () => {
    expect(css).toContain("90mm");
  });

  /*
   * EIN BLATT PAPIER HAT KEINEN DUNKELMODUS.
   *
   * `feedback.css` setzt `--fb-ink`/`--fb-muted` bei `data-theme="dark"` auf
   * near-white. Der Aushang druckt aber immer auf `body { background: #fff }`,
   * und `print-color-adjust: exact` verbietet dem Browser jede Notrechnung:
   * ohne festgenagelte Farben bliebe vom A4-Blatt nur der QR-Kasten uebrig,
   * Frage, Gruppenname, Adresse, Erklaerzeile und Fusszeile druckten unsichtbar.
   *
   * WARUM DIESE TESTS DIE QUELLE LESEN und nicht das DOM: jsdom rechnet keine
   * Custom Properties aus, und am Bildschirm faellt der Fehler ohnehin nicht auf
   * (das Root-Layout fuehrt `color-scheme` mit, die UA-Leinwand ist dunkel).
   * Genau deshalb hat ihn kein gerendeter Test gesehen.
   */
  it("nagelt `--fb-ink`/`--fb-muted` auf dem Blatt fest — Papier hat keinen Dunkelmodus", () => {
    const aushang = rumpf(".fb-aushang");
    expect(aushang).toMatch(/--fb-ink:\s*#1a1d20/);
    expect(aushang).toMatch(/--fb-muted:\s*#5b6570/);
  });

  it("setzt die weisse Flaeche mit — Bildschirmvorschau und Papier zeigen denselben Kontrast", () => {
    expect(rumpf(".fb-aushang")).toMatch(/background:\s*#ffffff/);
  });

  it("kennt kein `data-theme` — keine Regel der Datei faerbt nach Umschalterstand", () => {
    expect(ohneKommentare).not.toContain("data-theme");
    expect(ohneKommentare).not.toContain("prefers-color-scheme");
  });

  it("faerbt Text ausschliesslich mit den festgenagelten Namen", () => {
    // Erlaubt ist nur, was `.fb-aushang` selbst mit einem harten Wert
    // ueberschreibt — die Liste wird aus der Datei gelesen, nicht behauptet.
    const festgenagelt = [...rumpf(".fb-aushang").matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,8})/gi)].map(
      (deklaration) => deklaration[1],
    );
    const farben = [...ohneKommentare.matchAll(/\.fb-aushang[\w-]*\s*(?:img\s*)?\{([^}]*)\}/g)]
      .flatMap((regel) => [...regel[1].matchAll(/(?:^|[\s;])color:\s*([^;]+)/g)])
      .map((deklaration) => deklaration[1].trim());
    expect(farben.length).toBeGreaterThan(0);
    for (const wert of farben) {
      // DIE EINE ERLAUBTE LITERALFARBE ist das DRK-Rot des Wortzeichens (Marke,
      // nicht Datenflaeche) — der Test darunter deckelt es auf genau zwei
      // Vorkommen in der Datei.
      if (wert.toLowerCase() === "#c8000f") continue;
      // UNBEDINGT, nicht `if (variable)`: ein harter Hexwert ist GENAU die
      // Wertklasse, die dieser Waechter verbieten soll. Mit der bedingten
      // Fassung assertierte die Iteration fuer `color: #eeeeee` gar nichts — die
      // 40pt-Ueberschrift konnte unsichtbar drucken, und alle 20 Tests des
      // Verzeichnisses blieben gruen (Mutationsprobe).
      expect(wert, `Literalfarbe statt festgenagelter Variable: ${wert}`).toMatch(/^var\(\s*--/);
      const variable = /var\(\s*(--[\w-]+)/.exec(wert)?.[1];
      expect(festgenagelt).toContain(variable);
    }
  });

  it("trägt DRK-Rot GENAU ZWEIMAL: 3px-Fahne und Wortzeichen (§4.9)", () => {
    // Ohne Kommentare: der Dateikopf NENNT die Regel, die hier geprüft wird.
    const regeln = css.replace(/\/\*[\s\S]*?\*\//g, "").toLowerCase();
    expect(regeln.match(/#c8000f/g)?.length).toBe(2);
    expect(regeln).toContain("3px");
  });
});
