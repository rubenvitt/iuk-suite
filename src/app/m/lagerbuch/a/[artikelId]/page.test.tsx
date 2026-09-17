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
 * ⚠️ HIER STAND EINMAL `BUCHEN`, DIE ATTRAPPE DER SERVER ACTION (DRK-375). Sie
 * trug die Zusicherung „die Action kommt als PROP in die Insel" als
 * IDENTITAETSpruefung. Seit DRK-375 importiert `_ui/Entnahme.tsx` die Action
 * selbst (Falle 9), diese Seite reicht sie NICHT mehr durch — und damit hat der
 * Test kein Gegenueber mehr. Was an seine Stelle getreten ist, steht unten bei
 * „reicht die Action NICHT mehr als Prop durch".
 */
const { DB, gesehen } = vi.hoisted(() => ({
  DB: { marke: "db" },
  gesehen: {
    entnahme: null as
      | { detailId: string; detailName: string; hatBuchenProp: boolean; ziel: unknown }
      | null,
    rahmen: null as { aktiv: string; etikett: string; laeuftAb: unknown } | null,
  },
}));

let kopfzeilen = new Headers({ host: HOST });
/** DRK-300 — der rohe Cookie-Wert der Anfrage; `undefined` = kein Cookie. */
let zielCookie: string | undefined;
const umleitungen: string[] = [];

/*
 * ⚠️ `cookies` GEHÖRT SEIT DRK-300 DAZU. Die Seite löst das gemerkte
 * Entnahmeziel selbst auf; ein Mock nur mit `headers` lässt jeden Test dieser
 * Datei mit „cookies is not a function" fallen — und zwar ALLE, auch die, die
 * mit dem Ziel nichts zu tun haben.
 */
vi.mock("next/headers", () => ({
  headers: async () => kopfzeilen,
  cookies: async () => ({
    get: (name: string) =>
      name === "helfer_ziel" && zielCookie !== undefined ? { name, value: zielCookie } : undefined,
  }),
}));
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
vi.mock("../../_lib/helferZugang", () => ({
  helferZugangOderNull: vi.fn(),
  kontoZugangOderNull: vi.fn(),
}));
vi.mock("../../_lib/lesepfade/artikel", () => ({ artikelDetailHelfer: vi.fn() }));
vi.mock("../../_db/client", () => ({ getDb: vi.fn(() => DB) }));
/*
 * ⚠️ `gemerktesZiel` IST EINE ATTRAPPE, weil `getDb()` hier eine ist: die echte
 * Funktion liest `lagerorte` und bekäme `{ marke: "db" }` vorgesetzt. Was sie
 * SELBST zusagt (ein untaugliches Fahrzeug wird „ungewählt", nicht „Verbrauch"),
 * steht in `_lib/lesepfade/entnahmeZiel.test.ts` gegen eine echte Datenbank.
 * Hier geht es nur um die Verdrahtung: Cookie rein, Insel-Prop raus.
 */
vi.mock("../../_lib/lesepfade/entnahmeZiel", () => ({ gemerktesZiel: vi.fn() }));

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
  Entnahme: (p: { detail: { id: string; name: string }; ziel: unknown }) => {
    gesehen.entnahme = {
      detailId: p.detail.id,
      detailName: p.detail.name,
      // ⚠️ DAS VORHANDENSEIN DES SCHLUESSELS, nicht sein Wert (DRK-375): ein
      // `buchen={undefined}` waere von „gar kein Prop" ueber den Wert nicht zu
      // unterscheiden — und genau das ist hier die Frage.
      hatBuchenProp: "buchen" in p,
      ziel: p.ziel,
    };
    return <div data-rolle="entnahme" data-id={p.detail.id} data-name={p.detail.name} />;
  },
}));
/*
 * DAS ZUGRIFFSPROTOKOLL — DRK-417, Codex-Befund P2 zu PR #205.
 *
 * ⚠️ `_lib/helferBereich.ts` ist hier ABSICHTLICH NICHT ersetzt: die
 * Reichweitenpruefung soll ECHT laufen (ihr Kopf schreibt aus, warum eine
 * Attrappe sie stumm abschalten wuerde). Was sie zieht, ist `auditDenied` —
 * und DAS gehoert in eine Attrappe, weil es sonst einen Anfragekontext
 * braeuchte, den es in Vitest nicht gibt.
 */
const auditDenied = vi.hoisted(() => vi.fn());
vi.mock("@/core/audit/server", () => ({
  auditDenied,
  auditEvent: vi.fn(),
  auditAccessActor: vi.fn(() => ({ kind: "access" })),
  withAuditContext: async (_k: unknown, f: () => unknown) => f(),
}));

vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: {
    aktiv: string;
    reichweite: readonly string[];
    sitzungsetikett: string;
    laeuftAb: Date;
    children: ReactNode;
  }) => {
    gesehen.rahmen = { aktiv: p.aktiv, etikett: p.sitzungsetikett, laeuftAb: p.laeuftAb };
    /*
     * ⚠️ DIE REICHWEITE WIRD MITGESCHRIEBEN — DRK-417. Eine Attrappe, die das
     * Pflicht-Prop verwirft, macht die Zusage „die Reiterleiste dieses Schirms
     * kennt die Reichweite des Zugangs" fuer diese Datei unsichtbar: sie
     * bliebe gruen, wenn die Seite `reichweite={VOLLE_REICHWEITE}` fest
     * einsetzte. Dieselbe Ueberlegung wie beim `nav`-Mock in
     * `g/[code]/page.test.tsx`.
     */
    return (
      <div
        data-rolle="rahmen"
        data-aktiv={p.aktiv}
        data-etikett={p.sitzungsetikett}
        data-reichweite={p.reichweite.join(",")}
      >
        {p.children}
      </div>
    );
  },
}));

import { helferZugangOderNull, kontoZugangOderNull } from "../../_lib/helferZugang";
import { artikelDetailHelfer } from "../../_lib/lesepfade/artikel";
import { getDb } from "../../_db/client";
import { gemerktesZiel } from "../../_lib/lesepfade/entnahmeZiel";
import ArtikelDeepLink from "./page";
import { mount, unmount, query, queryAll, exists } from "@/app/m/qr/_lib/test-dom";
import { VOLLE_REICHWEITE } from "../../_lib/helferBereich";

const ZUGANG = {
  // DRK-305: `herkunft` unterscheidet Kaertchen und angemeldetes Konto. Diese
  // Weiche sieht NUR Kaertchen — `helferZugangOderNull` ist seit DRK-305
  // ausdruecklich auf `TokenZugang` verengt, damit ein Regaletikett eine
  // angemeldete Person weiterhin in die Verwaltung fuehrt und nicht in die
  // Helfer-Ansicht (Ausgang 2 unten).
  herkunft: "token" as const,
  tokenId: "tk1",
  code: "482-137",
  label: "RTW 1",
  laeuftAb: new Date("2026-08-04T17:00:00.000Z"),
  // Ein Regaletikett haengt an keinem Fahrzeug (DRK-302). Diese Weiche liest die
  // Bindung nicht — sie steht hier, weil `HelferZugang` sie als Pflichtfeld
  // fuehrt, und `null` ist der Fall, der zu einem Artikel-Kaertchen passt.
  fahrzeugBindung: null, reichweite: VOLLE_REICHWEITE,
};
/**
 * DRK-305 — der Konto-Zugang, wie ihn `kontoZugangOderNull` liefert.
 * `laeuftAb: null` und `fahrzeugBindung: null` stehen im Typ, nicht hier:
 * eine Kontositzung laeuft nicht ab und ist an kein Fahrzeug gebunden.
 */
const KONTO = {
  herkunft: "konto" as const,
  sub: "u1",
  name: "A. Verwaltung",
  laeuftAb: null,
  fahrzeugBindung: null,
  reichweite: VOLLE_REICHWEITE,
};
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
  zielCookie = undefined;
  vi.mocked(gemerktesZiel).mockReturnValue(null);
  umleitungen.length = 0;
  gesehen.entnahme = null;
  gesehen.rahmen = null;
  vi.mocked(helferZugangOderNull).mockResolvedValue(null);
  vi.mocked(kontoZugangOderNull).mockResolvedValue(null);
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
    expect(kontoZugangOderNull).not.toHaveBeenCalled();
    expect(umleitungen).toEqual([]);
  });

  it("Ausgang 1 — MIT Helfer-Sitzung: rendert, auch wenn die Person zugleich Admin ist", async () => {
    // `cordon.ts:61`: allowed = isA ? hasHelfer || isAdmin : hasHelfer. Die
    // Helfer-Sitzung gewinnt, sonst muesste ein Admin am Regal das Kaertchen
    // beiseitelegen.
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    vi.mocked(kontoZugangOderNull).mockResolvedValue(KONTO);
    await mount(await ArtikelDeepLink(params("art-77")));
    expect(umleitungen).toEqual([]);
    // Die ID kommt aus `params`, nicht aus der Fixture: die Attrappe echot sie.
    expect(query("[data-rolle='entnahme']").getAttribute("data-id")).toBe("art-77");
    // Und die Weiche fragt den Konto-Zweig GAR NICHT: das Kaertchen
    // kurzschliesst, sonst muesste ein Admin am Regal das Kaertchen
    // beiseitelegen — und die Bindung aus DRK-302 waere hin.
    expect(kontoZugangOderNull).not.toHaveBeenCalled();
    // Der Kopf zeigt das KAERTCHEN, nicht das Konto.
    expect(gesehen.rahmen?.etikett).toBe("Zugang: Token 482-137 · RTW 1");
  });

  it("Ausgang 2 — OHNE Kaertchen, ABER angemeldet: RENDERT die Entnahme (DRK-305)", async () => {
    /*
     * ⚠️ DIESER TEST HAT SICH UMGEDREHT, UND ER IST DER GRUND, AUS DEM DER
     * EINSTIEG „Bestand → Entnahme“ UEBERHAUPT TRAEGT.
     *
     * Bis DRK-305 leitete dieser Ausgang nach `/verwaltung/artikel?a=<id>` um.
     * Das war richtig, solange eine angemeldete Person im Helfer-Ast nichts zu
     * suchen hatte. Seit DRK-305 hat sie dort etwas zu suchen — und die
     * Artikelliste unter `/helfer` verlinkt JEDE Zeile hierher. Mit der
     * Umleitung endete die beworbene Entnahme ohne Code nach genau einem Klick,
     * und zwar still: beide Seiten antworteten je fuer sich mit 200.
     */
    vi.mocked(kontoZugangOderNull).mockResolvedValue(KONTO);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(umleitungen).toEqual([]);
    expect(query("[data-rolle='entnahme']").getAttribute("data-id")).toBe("art-9");
    expect(gesehen.rahmen?.etikett).toBe("Angemeldet: A. Verwaltung");
    // Kein Ablauf — der Rahmen zeigt darum keine Restzeit und keinen
    // Beenden-Knopf (`_ui/HelferRahmen.tsx`).
    expect(gesehen.rahmen?.laeuftAb).toBe(null);
  });

  it("Ausgang 2 — der Weg ins Artikelblatt bleibt, als LINK statt als Umleitung", async () => {
    // Verloren geht durch die Umkehrung nichts: wer das Artikelblatt will, ist
    // einen Klick entfernt statt null. `encodeURIComponent` ist kein Schmuck —
    // ohne sie haenge eine ID mit `&` einen zweiten Suchparameter an.
    vi.mocked(kontoZugangOderNull).mockResolvedValue(KONTO);
    await mount(await ArtikelDeepLink(params("a&b")));
    const weg = queryAll("a").find((a) => a.getAttribute("href")?.startsWith("/verwaltung/artikel"));
    expect(weg?.getAttribute("href")).toBe("/verwaltung/artikel?a=a%26b");
    expect(weg?.textContent).toContain("In der Verwaltung");
  });

  it("Ausgang 2 — MIT Kaertchen gibt es diesen Weg NICHT", async () => {
    // Wer mit einem Kaertchen hier steht, hat in der Verwaltung keinen Zutritt
    // und saehe einen Link, der ihn auf eine 404 fuehrt.
    vi.mocked(helferZugangOderNull).mockResolvedValue(ZUGANG);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(queryAll("a").some((a) => a.getAttribute("href")?.startsWith("/verwaltung"))).toBe(false);
  });

  it("Ausgang 3 — weder noch: Gate MIT returnTo, so ueberlebt das Etikett den Umweg ueber Pocket ID", async () => {
    await expect(ArtikelDeepLink(params("art-9"))).rejects.toThrow("NEXT_REDIRECT");
    expect(umleitungen).toEqual(["/?returnTo=%2Fa%2Fart-9"]);
    // Die Konto-Frage wurde GESTELLT und mit Nein beantwortet — ohne sie waere
    // dieser Ausgang auch fuer eine angemeldete Person der genommene.
    expect(kontoZugangOderNull).toHaveBeenCalledTimes(1);
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

  /**
   * ⚠️ DIESE ZUSICHERUNG STAND EINMAL ANDERSHERUM (DRK-375) — sie pruefte die
   * IDENTITAET des durchgereichten `buchen`-Props. Seit DRK-375 importiert
   * `_ui/Entnahme.tsx` die Action selbst; Falle 9 (`AGENTS.md`/`CLAUDE.md`):
   * „Server Actions duerfen als einzige ueber die Grenze — aber direkt
   * importiert, nicht als Prop durchgereicht."
   *
   * ⚠️ ZWEI HAELFTEN, UND BEIDE TRAGEN. Am gerenderten Baum faellt auf, wenn
   * jemand den Prop zurueckholt; am Quelltext faellt auf, wenn die Importzeile
   * bleibt, ohne dass sie noch jemand benutzt — eine ungenutzte Einfuhr einer
   * Server Action ist genau die Zeile, aus der der Prop wieder entsteht.
   */
  it("reicht die Action NICHT mehr als Prop durch", async () => {
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(gesehen.entnahme?.hatBuchenProp).toBe(false);
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/import .*from "\.\.\/\.\.\/_actions\/buchung"/);
  });

  it("löst das gemerkte Ziel aus DEM Cookie auf und reicht es an die Insel", async () => {
    // DRK-300. Zwei Hälften, und beide tragen: der Cookie-Wert der ANFRAGE geht
    // in die Auflösung, und ihr Ergebnis geht unverändert in die Insel. Ohne
    // die erste könnte die Seite ein festes Ziel anzeigen; ohne die zweite
    // stünde auf dem Schirm etwas anderes, als gebucht wird.
    zielCookie = "tk1|fz:fz-1";
    const aufgeloest = {
      art: "fahrzeug" as const, lagerortId: "fz-1", name: "RTW 1",
      kennung: "MS-1", einheitenart: "fahrzeug" as const,
    };
    vi.mocked(gemerktesZiel).mockReturnValue(aufgeloest);

    await mount(await ArtikelDeepLink(params("art-9")));

    expect(vi.mocked(gemerktesZiel)).toHaveBeenCalledWith(DB, "tk1|fz:fz-1", ZUGANG.tokenId);
    expect(gesehen.entnahme?.ziel).toBe(aufgeloest);
  });

  it("ohne Cookie bekommt die Insel `null` — und sperrt damit den Buchen-Knopf", async () => {
    // ⚠️ `null` und NICHT `{ art: "verbrauch" }`: der Unterschied ist die ganze
    // Zusage des Tickets, und er muss die Seitengrenze überleben.
    await mount(await ArtikelDeepLink(params("art-9")));

    expect(vi.mocked(gemerktesZiel)).toHaveBeenCalledWith(DB, undefined, ZUGANG.tokenId);
    expect(gesehen.entnahme?.ziel).toBeNull();
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

  it("benutzt ein PRAEDIKAT, NICHT `requireLagerbuchAdmin`", () => {
    /*
     * Der dritte Fall ist „keine Sitzung → Gate mit returnTo“; ein Riegel
     * schickte ihn nach /login (§3.2.1, §11.5 Zustand 18). T87 fuehrt genau
     * diesen Scan als Abnahme ueber beide Weichen-Dateien.
     *
     * ⚠️ DAS PRAEDIKAT HEISST SEIT DRK-305 `kontoZugangOderNull` und nicht mehr
     * `istLagerbuchAdmin`: die Gruppenpruefung ist dorthin gewandert
     * (`_lib/helferZugang.ts`), weil diese Seite jetzt einen ZUGANG braucht und
     * nicht nur eine Ja/Nein-Antwort. Die Zusage ist unveraendert — kein
     * werfender Riegel in dieser Datei.
     */
    expect(quelle()).toMatch(/kontoZugangOderNull/);
    expect(quelle()).not.toMatch(/requireLagerbuchAdmin|moduleAdminPageOrNotFound|isModuleAdmin/);
  });

  it("ruft `requireHelferSitzung` NICHT — die Weiche hat drei Ausgaenge, keinen Riegel", () => {
    expect(quelle()).not.toMatch(/requireHelferSitzung/);
  });

  it("ruft `requireLagerbuchHost` ausdruecklich — T87 verlangt genau das", () => {
    // ⚠️ ABWEICHUNG VON §2.24 IST HIER KEINE: Punkt 24 nennt namentlich nur
    // `requireHelferSitzung` und `requireHelferSchreibend`. `helferZugangOderNull`
    // riegelt zwar ebenfalls intern (`_lib/helferZugang.ts`), aber die
    // Abnahme in T87 (`task-87-brief.md:53-55`) verlangt den Ausdruck in dieser
    // Datei — und ohne ihn gaebe es keinen Punkt, an dem der Riegel VOR
    // `kontoZugangOderNull` und `artikelDetailHelfer` stuende. DRK-305:
    // `kontoZugangOderNull` prueft den Host ABSICHTLICH nicht selbst.
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

/**
 * AUSGANG 4 — DAS REGALETIKETT MIT DEM FALSCHEN CODE IN DER HAND (DRK-417).
 *
 * ⚠️ DIE WEICHE HAT DAMIT VIER AUSGAENGE, NICHT DREI. Bis hierher bekam JEDER
 * gueltige Zugang die volle Entnahmeflaeche — auch die Karte an einer Einheit,
 * die aus dem Handlager gar nicht buchen soll. Der Kopf der Datei zaehlt die
 * Ausgaenge auf; wer diesen wieder entfernt, oeffnet genau den Weg zurueck.
 */
describe("a/[artikelId] — Ausgang 4: der Code darf nicht entnehmen", () => {
  const KARTE_EINHEIT = { ...ZUGANG, reichweite: ["box", "check"] as const,
                          fahrzeugBindung: "rtw-1" };
  const KARTE_BOX = { ...ZUGANG, reichweite: ["box"] as const };

  /**
   * ⚠️ EIN GESAGTER ZUSTAND, KEINE UMLEITUNG — anders als auf `/helfer/box` und
   * `/helfer/check`. Der Unterschied ist der Einstieg: dort tippt jemand eine
   * Adresse, hier hat jemand GESCANNT und haelt das Etikett in der Hand. Eine
   * wortlose Umleitung sieht fuer ihn aus, als haette der Scan nicht
   * funktioniert — und er scannt noch dreimal.
   */
  it("sagt es, statt wortlos umzuleiten", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_EINHEIT);
    await mount(await ArtikelDeepLink(params("art-9")));

    expect(umleitungen).toEqual([]);
    expect(exists("[data-rolle='leer-titel']")).toBe(true);
    expect(exists("[data-rolle='entnahme']")).toBe(false);
  });

  /**
   * ⚠️ DER SATZ NENNT DIE KARTE, DIE HILFT (§11.7). Ohne sie steht die Person
   * mit dem Etikett in der Hand da und weiss nur, dass es nicht geht.
   */
  it("nennt die Karte, die stattdessen hilft", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_EINHEIT);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='leer-text']").textContent).toContain("Handlager");
  });

  /**
   * ⚠️ DAS DETAIL WIRD GAR NICHT ERST GELESEN. Weiter unten laege der Bestand
   * dieses Artikels samt Chargen im RSC-Payload — auf einem privaten Telefon,
   * fuer einen Zugang, der ihn nicht bekommen soll (§3.4.5). Sichtbar waere das
   * nur im Netzwerkteil, nie auf dem Schirm.
   */
  it("liest den Artikel gar nicht erst", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_BOX);
    vi.mocked(artikelDetailHelfer).mockClear();

    await mount(await ArtikelDeepLink(params("art-9")));

    expect(artikelDetailHelfer).not.toHaveBeenCalled();
  });

  /**
   * ⚠️ DIE REITERLEISTE ZEIGT DIE REICHWEITE DES ZUGANGS, nicht die der Seite.
   * Ein fest eingesetztes `VOLLE_REICHWEITE` waere hier die naheliegende
   * Abkuerzung — und boete der Person genau den Reiter an, der sie eben
   * abgewiesen hat.
   */
  it("reicht die Reichweite des Zugangs an den Rahmen weiter", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_BOX);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='rahmen']").getAttribute("data-reichweite")).toBe("box");
  });

  /**
   * ⚠️ DIE ABLEHNUNG STEHT IM ZUGRIFFSPROTOKOLL — Codex-Befund P2 zu PR #205.
   *
   * Hier stand `darf(...)` direkt, und damit war dies die EINZIGE Ablehnung der
   * Reichweite ohne Protokollzeile. Ausgerechnet hier wiegt sie am meisten: ein
   * direkt aufgerufenes `/a/<id>` ist der Weg, den jemand mit einem FOTO der
   * Regalkarte geht — und das Protokoll beantwortet sonst genau die Frage
   * nicht, fuer die man es liest: welche Karte zurueckgesetzt gehoert.
   */
  it("schreibt die Ablehnung ins Zugriffsprotokoll", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_EINHEIT);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(auditDenied).toHaveBeenCalled();
  });

  /** Und die Gegenprobe: ein erlaubter Zugang erzeugt keine Zeile. */
  it("schreibt fuer einen erlaubten Zugang KEINE Ablehnung", async () => {
    vi.mocked(auditDenied).mockClear();
    vi.mocked(helferZugangOderNull).mockResolvedValue({ ...ZUGANG, reichweite: ["entnahme"] });
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(auditDenied).not.toHaveBeenCalled();
  });

  /** Und der Weg heraus fuehrt dorthin, wo dieser Code etwas zu tun hat. */
  it("fuehrt auf den Schirm, den dieser Code oeffnen darf", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_EINHEIT);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='leer-weg']").getAttribute("href"))
      .toBe("/helfer/check?fz=rtw-1");

    await unmount();
    vi.mocked(helferZugangOderNull).mockResolvedValue(KARTE_BOX);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(query("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer/box");
  });

  /**
   * ⚠️ DIE GEGENPROBE, und sie ist nicht entbehrlich: ohne sie bliebe der Block
   * gruen, wenn die Weiche JEDEN Zugang abwiese — die Regalkarte eingeschlossen,
   * also genau die, fuer die diese Seite gebaut ist.
   */
  it("laesst die Regalkarte und das angemeldete Konto weiterhin durch", async () => {
    vi.mocked(helferZugangOderNull).mockResolvedValue({ ...ZUGANG, reichweite: ["entnahme"] });
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(exists("[data-rolle='entnahme']")).toBe(true);

    await unmount();
    vi.mocked(helferZugangOderNull).mockResolvedValue(null);
    vi.mocked(kontoZugangOderNull).mockResolvedValue(KONTO);
    await mount(await ArtikelDeepLink(params("art-9")));
    expect(exists("[data-rolle='entnahme']")).toBe(true);
  });
});
