// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";

const QUELLE = "src/app/m/lagerbuch/a/[artikelId]/page.tsx";

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (Regel 1 / N-5 der
 * Regeldatei fuer Teil 4). `bauform.test.ts` exportiert sie nicht, und dies ist
 * ein anderer Testkoerper — deshalb die lokale Kopie statt eines Re-Exports,
 * genau wie `_lib/pwaIcons.test.ts`, `_lib/schreibpfade/tokenEinloesung.test.ts`
 * und `page.test.tsx` (T81) es halten.
 *
 * ⚠️ OHNE SIE IST DER SCAN „benutzt `istLagerbuchAdmin`, NICHT
 * `requireLagerbuchAdmin`" DETERMINISTISCH ROT (Befund 45 des Preflight-Scans).
 * `page.tsx` schreibt `requireLagerbuchAdmin()` woertlich in ihren
 * Begruendungskommentar, weil §3.2.1 genau das konserviert haben will. Die
 * naheliegende „Reparatur" waere, den Kommentar zu loeschen — also genau die
 * Begruendung, um die es geht.
 *
 * NACHGEMESSEN: heute traegt NUR dieser eine Scan die Falle;
 * `requireHelferSitzung` und `notFound` kommen im Rohtext von `page.tsx` null
 * Mal vor (`grep -c`), auch nicht im Kommentar. Die uebrigen Scans laufen
 * TROTZDEM ueber `ohneKommentare()` — nicht weil sie es heute muessten, sondern
 * damit ein spaeter nachgetragener Begruendungssatz sie nicht kippt. Ein Scan,
 * der auf seiner eigenen Begruendung rot wird, wird abgeschaltet statt
 * repariert.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) {
          imBlock = true;
          return zeile.slice(0, auf);
        }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const HOST = "lagerbuch.localtest.me";

/*
 * ⚠️ ALLES, WAS EINE MOCK-FABRIK ZUR IMPORTZEIT BERUEHRT, LIEGT IN `vi.hoisted`.
 * `vi.mock` wird ueber die Importe gehoben; eine Fabrik, die eine gewoehnliche
 * `const` der Datei liest, liefe in die TDZ.
 *
 * `BUCHEN` ist die ATTRAPPE der Server Action. Sie wird hier festgehalten,
 * damit die Zusicherung „die Action kommt als PROP in die Insel" eine
 * IDENTITAETSpruefung sein kann (`toBe(BUCHEN)`) statt eines Quelltext-Scans
 * auf die Schreibweise `buchen={bucheEntnahmeHelfer}` (N-8, Regel 2). Sie wird
 * hier auch NICHT aus `../../_actions/buchung` importiert: die Datei gehoert
 * Teil 5 (T114) und existiert noch nicht — so bleibt die eine unaufloesbare
 * Importzeile in `page.tsx` und wandert nicht in den Testkoerper.
 */
const { DB, BUCHEN, gesehen } = vi.hoisted(() => ({
  DB: { marke: "db" },
  BUCHEN: async () => ({ ok: true as const, wert: { gebucht: 1 } }),
  gesehen: {
    entnahme: null as { detailId: string; detailName: string; buchen: unknown } | null,
    rahmen: null as { aktiv: string; etikett: string; laeuftAb: unknown } | null,
  },
}));

let kopfzeilen = new Headers({ host: HOST });
const umleitungen: string[] = [];

vi.mock("next/headers", () => ({ headers: async () => kopfzeilen }));
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    umleitungen.push(ziel);
    throw new Error("NEXT_REDIRECT");
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

/*
 * ⚠️ DIE ATTRAPPEN REICHEN IHRE ARGUMENTE DURCH (`vi.fn()` statt
 * `() => wert()`). Die im Plan abgedruckte Form `istLagerbuchAdmin: () =>
 * istAdmin()` verschluckt jedes Argument — damit waere NICHT pruefbar, dass das
 * Praedikat den Viewer aus `viewerOderNull()` bekommt, und ein hart
 * verdrahtetes `istLagerbuchAdmin(null)` bliebe gruen. Dasselbe gilt fuer
 * `artikelDetailHelfer` und den Datenbank-Griff.
 */
vi.mock("../../_lib/helferZugang", () => ({ helferZugangOderNull: vi.fn() }));
vi.mock("../../_lib/zugang", () => ({ viewerOderNull: vi.fn(), istLagerbuchAdmin: vi.fn() }));
vi.mock("../../_lib/lesepfade/artikel", () => ({ artikelDetailHelfer: vi.fn() }));
vi.mock("../../_db/client", () => ({ getDb: vi.fn(() => DB) }));
vi.mock("../../_actions/buchung", () => ({ bucheEntnahmeHelfer: BUCHEN }));

/*
 * Beide Attrappen schreiben ihre Props in `gesehen` UND an den gerenderten Baum
 * (N-8). `laeuftAb` wird MITGEFANGEN: es ist neben `sitzungsetikett` die zweite
 * Pflicht-Prop, um die §7.8.2 den ganzen Absatz baut — sie darf nicht die
 * einzige sein, die kein Test je sieht.
 *
 * `_ui/LeerZustand.tsx` bleibt ECHT: nur so ist pruefbar, dass der Rueckweg
 * wirklich als `<a href>` ankommt, und nicht bloss, dass die Seite ein
 * Attrappen-Attribut gesetzt hat.
 */
vi.mock("../../_ui/Entnahme", () => ({
  Entnahme: (p: { detail: { id: string; name: string }; buchen: unknown }) => {
    gesehen.entnahme = { detailId: p.detail.id, detailName: p.detail.name, buchen: p.buchen };
    return <div data-rolle="entnahme" data-id={p.detail.id} data-name={p.detail.name} />;
  },
}));
vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: {
    aktiv: string;
    sitzungsetikett: string;
    laeuftAb: Date;
    children: ReactNode;
  }) => {
    gesehen.rahmen = { aktiv: p.aktiv, etikett: p.sitzungsetikett, laeuftAb: p.laeuftAb };
    return (
      <div data-rolle="rahmen" data-aktiv={p.aktiv} data-etikett={p.sitzungsetikett}>
        {p.children}
      </div>
    );
  },
}));

import { helferZugangOderNull } from "../../_lib/helferZugang";
import { viewerOderNull, istLagerbuchAdmin } from "../../_lib/zugang";
import { artikelDetailHelfer } from "../../_lib/lesepfade/artikel";
import { getDb } from "../../_db/client";
import ArtikelDeepLink from "./page";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";

const ZUGANG = {
  tokenId: "tk1",
  code: "482-137",
  label: "RTW 1",
  laeuftAb: new Date("2026-08-04T17:00:00.000Z"),
};
const VIEWER = { sub: "u1", groups: ["lagerbuch"], name: null, email: null };
const DETAIL = {
  id: "art-9",
  name: "Kompresse",
  einheit: "Stk",
  fach: "A-01",
  bestand: 5,
  chargen: [],
};

beforeEach(() => {
  kopfzeilen = new Headers({ host: HOST });
  umleitungen.length = 0;
  gesehen.entnahme = null;
  gesehen.rahmen = null;
  vi.mocked(helferZugangOderNull).mockResolvedValue(null);
  vi.mocked(viewerOderNull).mockResolvedValue(null);
  vi.mocked(istLagerbuchAdmin).mockReturnValue(false);
  /*
   * Die Attrappe ECHOT die uebergebene ID zurueck, statt eine feste Fixture zu
   * liefern. Waeren beide zufaellig `"art-9"`, bliebe eine Seite gruen, die
   * `artikelDetailHelfer(db, "art-9")` hart verdrahtet — genau Ausprägung 1 aus
   * Regel 2.
   */
  vi.mocked(artikelDetailHelfer).mockImplementation((_db, id) => ({ ...DETAIL, id }));
});
afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
});

const params = (id: string) => ({ params: Promise.resolve({ artikelId: id }) });

describe("/a/<id> — die Rollen-Weiche, drei Ausgaenge", () => {
  it("Host zuerst: fremder Host wirft notFound(), BEVOR irgendetwas gelesen wird", async () => {
    kopfzeilen = new Headers({ host: "feedback.localtest.me" });
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_NOT_FOUND");
    /*
     * Ohne diese vier Zeilen bliebe der Test auch dann gruen, wenn der
     * Host-Riegel als LETZTE Anweisung stuende — er wuerfe ja weiterhin.
     * `helferZugangOderNull` riegelt intern selbst (`_lib/helferZugang.ts:111`),
     * `artikelDetailHelfer` und `viewerOderNull` tun das NICHT.
     */
    expect(helferZugangOderNull).not.toHaveBeenCalled();
    expect(artikelDetailHelfer).not.toHaveBeenCalled();
    expect(viewerOderNull).not.toHaveBeenCalled();
    expect(umleitungen).toEqual([]);
  });

  it("Ausgang 1 — MIT Helfer-Sitzung: rendert, auch wenn die Person zugleich Admin ist", async () => {
    // `cordon.ts:61`: allowed = isA ? hasHelfer || isAdmin : hasHelfer. Die
    // Helfer-Sitzung gewinnt, sonst muesste ein Admin am Regal das Kaertchen
    // beiseitelegen.
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    vi.mocked(istLagerbuchAdmin).mockReturnValue(true);
    await mount(await ArtikelDeepLink(params("art-77")));
    expect(umleitungen).toEqual([]);
    // Die ID kommt aus `params`, nicht aus der Fixture: die Attrappe echot sie.
    expect(query("[data-rolle='entnahme']").getAttribute("data-id")).toBe("art-77");
    // Und die Weiche fragt die Admin-Rolle GAR NICHT MEHR: die Kurzschluss-Form
    // `hasHelfer || isAdmin` kostet in diesem Fall keinen Sitzungs-Lookup.
    expect(viewerOderNull).not.toHaveBeenCalled();
    expect(istLagerbuchAdmin).not.toHaveBeenCalled();
  });

  it("Ausgang 2 — OHNE Helfer-Sitzung, ABER Admin: leitet in die Verwaltung, er rendert NICHT", async () => {
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istLagerbuchAdmin).mockReturnValue(true);
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/verwaltung/artikel?a=art-9"]);
    // Das Praedikat bekommt den Viewer aus `viewerOderNull` — nicht `undefined`
    // und nicht `null`. Ein hart verdrahtetes `istLagerbuchAdmin(null)` waere
    // hier gruen, wenn die Attrappe ihre Argumente verschluckte.
    expect(istLagerbuchAdmin).toHaveBeenCalledWith(VIEWER);
    // ER RENDERT NICHT — nur deshalb duerfen `sitzungsetikett` und `laeuftAb`
    // am `HelferRahmen` Pflicht-Props sein (§7.8.2).
    expect(artikelDetailHelfer).not.toHaveBeenCalled();
    expect(gesehen.rahmen).toBe(null);
  });

  it("Ausgang 3 — weder noch: Gate MIT returnTo, so ueberlebt das Etikett den Umweg ueber Pocket ID", async () => {
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/?returnTo=%2Fa%2Fart-9"]);
    // Die Admin-Frage wurde GESTELLT und mit Nein beantwortet — ohne sie waere
    // dieser Ausgang auch fuer einen Admin der genommene.
    expect(istLagerbuchAdmin).toHaveBeenCalledTimes(1);
    expect(artikelDetailHelfer).not.toHaveBeenCalled();
  });

  it("das `returnTo` traegt den AEUSSEREN Pfad — kein `/m/lagerbuch`-Praefix", async () => {
    // §2.1 g: der Browser steht auf dem Modul-Host, `decideRoute` praefixiert
    // danach. Ein innerer Pfad wuerde doppelt praefixiert und liefe ins Leere.
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen[0]).not.toContain("m%2Flagerbuch");
    expect(umleitungen[0]).not.toContain("/m/lagerbuch");
  });

  it("kodiert eine ID mit Sonderzeichen in der GATE-Umleitung", async () => {
    await expect(ArtikelDeepLink(params("a b&c"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/?returnTo=%2Fa%2Fa%20b%26c"]);
  });

  it("kodiert eine ID mit Sonderzeichen AUCH in der ADMIN-Umleitung", async () => {
    /*
     * ⚠️ DER TEST, DEN BEFUND 36 NACHTRAEGT. Der Plan hat EINEN Testkoerper mit
     * dem Namen „in beiden Umleitungen", laesst `istAdmin` aber im `beforeEach`
     * auf `false` — der Admin-Zweig wird nie betreten, und `umleitungen`
     * enthaelt nur den Gate-Redirect. Entfernte man `encodeURIComponent` in der
     * Admin-Umleitung, bliebe der Test gruen. Der Erwartungswert selbst war
     * korrekt; es fehlte der zweite Fall.
     *
     * Ohne Kodierung stuende `?a=a b&c` da — und `&c` waere ein ZWEITER
     * Suchparameter, den die Verwaltungsseite als Artikel-ID nie zu sehen
     * bekaeme.
     */
    vi.mocked(viewerOderNull).mockResolvedValue(VIEWER);
    vi.mocked(istLagerbuchAdmin).mockReturnValue(true);
    await expect(ArtikelDeepLink(params("a b&c"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/verwaltung/artikel?a=a%20b%26c"]);
  });
});

describe("/a/<id> — die Seite loest ihren Zugang SELBST auf (N-11)", () => {
  it("ruft `helferZugangOderNull` mit dem Griff aus `getDb()` — genau einmal", async () => {
    /*
     * ⚠️ DIE ZUSAGE, DIE BISHER NUR ALS KOMMENTAR IN `_ui/HelferRahmen.tsx:28-34`
     * STAND (N-11). Ein LAYOUT kann einer Seite keine Props reichen; deshalb
     * traegt diese Seite ihre eigene Aufloesung. Der Aufruf bekommt den Griff
     * aus `getDb()` und keinen zweiten, selbst geoeffneten — sonst liefen der
     * Riegel-Recheck und der Lesepfad auf verschiedenen Verbindungen.
     */
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(getDb).toHaveBeenCalled();
    expect(helferZugangOderNull).toHaveBeenCalledTimes(1);
    expect(helferZugangOderNull).toHaveBeenCalledWith(DB);
  });

  it("liest den Artikel mit DEMSELBEN Griff und der ID aus `params`", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    await mount(await ArtikelDeepLink(params("art-77")));
    expect(artikelDetailHelfer).toHaveBeenCalledWith(DB, "art-77");
  });

  it("nimmt NUR `params` entgegen — kein Zugang aus einer zweiten Quelle", async () => {
    // Wuerde die Seite den Zugang als Prop erwarten, muesste dieser Aufruf ohne
    // ihn scheitern oder leer rendern. Er rendert vollstaendig.
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    await mount(await ArtikelDeepLink({ params: Promise.resolve({ artikelId: "art-9" }) }));
    expect(exists("[data-rolle='entnahme']")).toBe(true);
    expect(gesehen.rahmen?.etikett).toBe("Zugang: Token 482-137 · RTW 1");
  });
});

describe("/a/<id> — der Rahmen", () => {
  beforeEach(() => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
  });

  it('setzt `aktiv="entnahme"` und das Sitzungsetikett aus der DB-Zeile', async () => {
    // `code` und `label` kommen ab jetzt aus der DB-Zeile, nicht aus dem Cookie
    // (§3.4.4) — sie sind dort AKTUELL, waehrend ein Cookie sie zwoelf Stunden
    // einfriert.
    await mount(await ArtikelDeepLink(params("art-9")));
    const r = query("[data-rolle='rahmen']");
    expect(r.getAttribute("data-aktiv")).toBe("entnahme");
    expect(r.getAttribute("data-etikett")).toBe("Zugang: Token 482-137 · RTW 1");
  });

  it("das Etikett folgt der DB-Zeile, nicht einem Literal", async () => {
    // Die Gegenprobe: ein zweiter Zugang, ein zweites Etikett. Ohne sie truege
    // die Zusicherung darueber auch eine fest verdrahtete Zeichenkette.
    vi.mocked(helferZugangOderNull).mockResolvedValue({
      ...ZUGANG,
      code: "900-001",
      label: "GW-San",
    });
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(gesehen.rahmen?.etikett).toBe("Zugang: Token 900-001 · GW-San");
  });

  it("reicht `laeuftAb` UNVERAENDERT durch — die zweite Pflicht-Prop (§7.8.2)", async () => {
    /*
     * Identitaetspruefung, nicht Wertvergleich: der Ablauf stammt aus dem `exp`
     * des verifizierten Cookies (`_lib/helferZugang.ts:35-43`) und ist die
     * Grundlage der 30-Minuten-Warnschwelle im Rahmen. Ein hier neu gebautes
     * `new Date()` faerbte die Restzeit-Anzeige jeder Sitzung gleich.
     */
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(gesehen.rahmen?.laeuftAb).toBe(ZUGANG.laeuftAb);
  });

  it("die Insel bekommt die Action als PROP — Identitaet, nicht Schreibweise", async () => {
    /*
     * ⚠️ N-8 UND REGEL 2. Der Plan prueft das mit
     * `toMatch(/buchen=\{bucheEntnahmeHelfer\}/)` auf dem DATEITEXT — ein Scan
     * auf eine exakte Schreibweise dort, wo ein Verhaltenstest moeglich ist, und
     * zugleich falsch-negativ-anfaellig (er waere auch gruen, wenn die
     * Zeichenfolge nur im Kopfkommentar staende). Hier haengt die Zusage am
     * gerenderten Baum: es muss GENAU die Funktion aus `_actions/buchung` sein.
     * `_ui/Entnahme.tsx` importiert sie ausdruecklich NICHT selbst (T78).
     */
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(gesehen.entnahme?.buchen).toBe(BUCHEN);
  });

  it("die Insel haengt IM Rahmen — die Tab-Leiste bleibt erreichbar", async () => {
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='rahmen'] [data-rolle='entnahme']")).toBeTruthy();
  });
});

describe("/a/<id> — das Etikett ohne Artikel (Entscheidung 8-C, 36 a)", () => {
  beforeEach(() => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    vi.mocked(artikelDetailHelfer).mockReturnValue(null);
  });

  it("gestalteter Zustand mit Rueckweg, KEIN wortloser Sprung und KEIN notFound()", async () => {
    // Der Bestand macht daraus `redirect("/helfer")` (`a/[artikelId]/page.tsx:23`)
    // — danach weiss die Person nicht, ob sie falsch gescannt hat oder ob das
    // Etikett veraltet ist. Und ein `notFound()` waere die Suite-404: fremdes
    // Layout, fremde Schrift, kein Satz, der sagt, was zu tun ist.
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(umleitungen).toEqual([]);
    expect(exists("[data-rolle='entnahme']")).toBe(false);
    expect(query("[data-rolle='leer-titel']").textContent).toBe(
      "Dieses Etikett kennt kein Artikel",
    );
  });

  it("der Rueckweg ist ein echtes `<a href>` auf den AEUSSEREN Pfad", async () => {
    await mount(await ArtikelDeepLink(params("art-9")));
    const weg = query<HTMLAnchorElement>("[data-rolle='leer-weg']");
    expect(weg.getAttribute("href")).toBe("/helfer");
    expect(weg.tagName).toBe("A");
    expect((weg.textContent ?? "").trim().length).toBeGreaterThan(0);
  });

  it("der Text sagt, was zu tun ist, und entlastet die Person", async () => {
    // §11.7: jeder gestaltete Zustand traegt einen Satz, der die Handlung
    // benennt. „Der Bestand ist davon nicht betroffen" ist der Teil, der die
    // Person vom Verdacht befreit, sie habe etwas kaputt gemacht.
    await mount(await ArtikelDeepLink(params("art-9")));
    const text = query("[data-rolle='leer-text']").textContent ?? "";
    expect(text).toContain("Bitte der Verwaltung melden");
    expect(text).toContain("Bestand ist davon nicht betroffen");
  });

  it("der Leerzustand steht IM Rahmen — die Tab-Leiste bleibt erreichbar", async () => {
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='rahmen'] [data-rolle='leer-titel']")).toBeTruthy();
    // Und der Rahmen steht genau einmal da, nicht zweimal.
    expect(queryAll("[data-rolle='rahmen']").length).toBe(1);
  });
});

describe("Bauform", () => {
  /*
   * ⚠️ ALLE SCANS HIER LAUFEN UEBER `ohneKommentare()` (Regel 1, Befund 1 und
   * Befund 45) — auch die, die es heute noch nicht muessten. Nachgemessen im
   * Rohtext von `page.tsx`: `requireLagerbuchAdmin` kommt EINMAL vor (im
   * Kopfkommentar, weil §3.2.1 den Satz konserviert haben will),
   * `requireHelferSitzung` und `notFound` kommen NULL Mal vor. Nur der erste
   * Scan traegt die Falle also heute wirklich; die uebrigen laufen aus
   * Vorsorge durch dieselbe Funktion, damit ein spaeter nachgetragener
   * Begruendungssatz sie nicht kippt.
   */
  const quelle = () => ohneKommentare(readFileSync(QUELLE, "utf8"));

  it("benutzt `istLagerbuchAdmin`, NICHT `requireLagerbuchAdmin`", () => {
    // Der dritte Fall ist „keine Sitzung → Gate mit returnTo"; ein Riegel
    // schickte ihn nach /login (§3.2.1, §11.5 Zustand 18). T87 fuehrt genau
    // diesen Scan als Abnahme ueber beide Weichen-Dateien.
    expect(quelle()).toMatch(/istLagerbuchAdmin/);
    expect(quelle()).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);
  });

  it("ruft `requireHelferSitzung` NICHT — die Weiche hat drei Ausgaenge, keinen Riegel", () => {
    expect(quelle()).not.toMatch(/requireHelferSitzung/);
  });

  it("ruft `requireLagerbuchHost` ausdruecklich — T87 verlangt genau das", () => {
    // ⚠️ ABWEICHUNG VON §2.24 IST HIER KEINE: Punkt 24 nennt namentlich nur
    // `requireHelferSitzung` und `requireHelferSchreibend`. `helferZugangOderNull`
    // riegelt zwar ebenfalls intern (`_lib/helferZugang.ts:111`), aber die
    // Abnahme in T87 (`task-87-brief.md:53-55`) verlangt den Ausdruck in dieser
    // Datei — und ohne ihn gaebe es keinen Punkt, an dem der Riegel VOR
    // `viewerOderNull` und `artikelDetailHelfer` stuende.
    expect(quelle()).toMatch(/requireLagerbuchHost\(/);
  });

  it("ist `force-dynamic` — sie liest Kopfzeilen, Cookie und Datenbank", () => {
    expect(quelle()).toMatch(/export const dynamic = "force-dynamic"/);
  });

  it("exportiert NUR `default` und `dynamic`", () => {
    const namen = [...quelle().matchAll(/^export (?:const|async function|function) (\w+)/gm)].map(
      (m) => m[1],
    );
    expect(namen).toEqual(["dynamic"]);
    expect(quelle()).toMatch(/^export default async function/m);
  });

  it('traegt KEIN "use client" — eine Server Component', () => {
    // Falle 6: ein WERT aus einem "use client"-Modul kaeme in einer Server
    // Component als Client-Referenz an. Die Seite liest `headers()` und die
    // Datenbank; als Insel waere sie beides nicht.
    expect(quelle()).not.toMatch(/["']use client["']/);
  });

  it("kennt weder `usePathname` noch `router.push` — die Weiche ist serverseitig", () => {
    expect(quelle()).not.toMatch(/usePathname|useSearchParams|router\.(?:push|replace)/);
  });

  it("nennt `notFound` nirgends im Code — der Riegel bringt ihn mit", () => {
    // Entscheidung 36 a: auf einem Weg, den eine Person MIT EINEM GEDRUCKTEN
    // ETIKETT IN DER HAND nimmt, ist die Suite-404 die falsche Antwort. Der
    // einzige `notFound()` dieser Route steckt in `requireLagerbuchHost` und
    // gilt dem fremden Host, nicht dem fehlenden Artikel.
    expect(quelle()).not.toMatch(/notFound/);
  });

  it("der Kopfkommentar traegt die drei Ausgaenge UND die Abgrenzung zu `/g` (Befund 27)", () => {
    /*
     * ⚠️ DIESER SCAN LIEST DEN ROHTEXT MIT KOMMENTAREN — mit Absicht: die
     * Zusage IST der Kommentar. E1 verspricht, dass Teil 6 die Rollen-Weiche
     * nicht neu herleiten muss; §6 loest das nicht ein (Preflight-Befund 27).
     * `/g` unterscheidet sich fachlich: dort leiten ALLE Trefferfaelle weiter.
     */
    const roh = readFileSync(QUELLE, "utf8");
    expect(roh).toMatch(/g\/\[code\]/);
    expect(roh).toMatch(/ALLEN Trefferfaellen weiter/i);
    for (const ausgang of [/RENDERN/, /verwaltung\/artikel/, /returnTo/]) {
      expect(roh).toMatch(ausgang);
    }
  });
});
