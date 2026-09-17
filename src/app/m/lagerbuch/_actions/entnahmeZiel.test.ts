import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { lagerorte } from "../_db/schema";
import { HANDLAGER_ID } from "../_lib/konstanten";
import { ZIEL_COOKIE } from "../_lib/entnahmeZiel";

/**
 * DIE ZIELWAHL AM REGAL — DRK-300.
 *
 * Was diese Datei trägt, und warum jeweils GENAU HIER:
 *
 *   - Die Wahl LANDET IM COOKIE, und zwar mit denselben Attributen wie die
 *     Sitzung. Ein `path`, das nicht `/` ist, liefe auf `/helfer` und auf
 *     `/a/<id>` auseinander — die Wahl wäre je nach Seite eine andere, und
 *     zwar still.
 *   - Ein untaugliches Fahrzeug setzt KEIN Cookie. Ohne diese Zusage merkte
 *     sich der Zugang ein stillgelegtes Fahrzeug, und jede folgende Entnahme
 *     liefe in den Fehlerzweig der Buchung — auf einer Seite, die das Ziel
 *     als gültig anzeigt.
 *   - Der RIEGEL steht VOR dem Cookie. Er ist hier keine Formalie: eine
 *     Server Action ist ein eigener Einstiegspunkt mit global aufrufbarer
 *     Kennung, ganz gleich, welche Seite sie eingebaut hat.
 *   - `returnTo` geht durch `sanitizeReturnTo`. Die Wahlseite ist über einen
 *     Suchparameter erreichbar, der im Formular landet — ohne die Prüfung
 *     wäre das ein Open Redirect auf einer Fläche, die mit einem laminierten
 *     Kärtchen erreichbar ist.
 */

const stand = vi.hoisted(() => ({
  cookieOps: [] as {
    art: "set" | "delete";
    name: string;
    wert?: string;
    opt?: Record<string, unknown>;
  }[],
  umleitungen: [] as string[],
}));

const { riegel } = vi.hoisted(() => ({
  riegel: vi.fn<(db: unknown) => Promise<unknown>>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    set: (name: string, wert: string, opt: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "set", name, wert, opt });
    },
    delete: (name: string, opt?: Record<string, unknown>) => {
      stand.cookieOps.push({ art: "delete", name, opt });
    },
  }),
}));

// `redirect()` WIRFT in der echten Laufzeit einen Next-internen Fehler; für die
// Unit-Aussage genügt ein erkennbarer Wurf (`_actions/sitzung.test.ts:119`).
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => {
    stand.umleitungen.push(ziel);
    throw new Error("NEXT_REDIRECT");
  },
}));

vi.mock("../_lib/helferZugang", () => ({
  requireHelferSchreibend: (db: unknown) => riegel(db),
}));

vi.mock("../_db/client", () => ({
  getDb: () => {
    throw new Error("getDb() im Test — jeder Aufruf uebergibt t.db");
  },
}));

import { waehleEntnahmeZiel } from "./entnahmeZiel";
import { VOLLE_REICHWEITE } from "../_lib/helferBereich";

let t: TestDb;

const ZUGANG_OK = {
  ok: true,
  zugang: {
    /*
     * DRK-305: `herkunft` ist der Diskriminator, aus dem `journalQuelle`,
     * `zugangsKennung` und `zugangsAkteur` ihre Antwort ziehen
     * (`_lib/zugangHerkunft.ts`). Eine Attrappe OHNE das Feld schreibt still
     * `quelleTyp: "oidc"` mit `quelleId: undefined` — die Action liefe durch,
     * und die gepruefte Journalzeile truege eine Quelle, die auf nichts
     * aufloest.
     */
    herkunft: "token" as const,
    tokenId: "tk1",
    code: "482-137",
    label: "RTW 1",
    laeuftAb: new Date(Date.now() + 3_600_000),
    fahrzeugBindung: null,
    reichweite: VOLLE_REICHWEITE,
  },
};

function formular(felder: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(felder)) fd.set(k, v);
  return fd;
}

/** Die Action leitet IMMER um — der Wurf ist der Redirect, nicht ein Fehler. */
async function waehle(felder: Record<string, string>) {
  await expect(waehleEntnahmeZiel(formular(felder), t.db)).rejects.toThrow("NEXT_REDIRECT");
}

function gesetzte() {
  return stand.cookieOps.filter((o) => o.name === ZIEL_COOKIE);
}

beforeEach(() => {
  stand.cookieOps.length = 0;
  stand.umleitungen.length = 0;
  riegel.mockResolvedValue(ZUGANG_OK);
  t = migrierteTestDb("lagerbuch-actions-ziel-");
  t.db.insert(lagerorte).values([
    { id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true },
    { id: "fz-alt", name: "RTW alt", typ: "fahrzeug", aktiv: false },
    { id: "lager-2", name: "Außenlager", typ: "lager", aktiv: true },
  ]).run();
});

afterEach(() => {
  t.schliessen();
  vi.clearAllMocks();
});

describe("waehleEntnahmeZiel", () => {
  it("merkt ein Fahrzeug und kehrt zur Artikelseite zurück", async () => {
    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    expect(gesetzte()).toHaveLength(1);
    // Die Kärtchen-Kennung steht IM Wert — die Wahl gehört ihrer Schicht.
    expect(gesetzte()[0]).toMatchObject({ art: "set", wert: "tk1|fz:fz-1" });
    // ÄUSSERER Pfad (Falle 63): der Browser steht auf dem Modul-Host.
    expect(stand.umleitungen).toEqual(["/a/art-1"]);
  });

  it("setzt das Cookie mit `path: /` — sonst gilt die Wahl je Seite anders", async () => {
    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    const opt = gesetzte()[0]!.opt!;
    expect(opt.path).toBe("/");
    // Kein Zugriff aus dem Skript der Seite — die Wahl ist Serversache.
    expect(opt.httpOnly).toBe(true);
    expect(opt.sameSite).toBe("lax");
    // Sie überlebt den nächsten Scan, sonst wäre „für den Zugang gemerkt"
    // wertlos.
    expect(opt.maxAge).toBeGreaterThan(0);
  });

  it("merkt die AUSDRÜCKLICHE Verbrauchswahl als eigenen Wert", async () => {
    // ⚠️ Der Träger des ganzen Tickets: „Verbrauch" ist ein GESETZTES Cookie,
    // kein fehlendes. Würde die Action hier löschen statt setzen, wäre die
    // Wahl nicht von „noch nichts gewählt" zu unterscheiden — und die nächste
    // Entnahme verlangte sie erneut.
    await waehle({ ziel: "verbrauch", returnTo: "/a/art-1" });

    expect(gesetzte()).toHaveLength(1);
    expect(gesetzte()[0]).toMatchObject({ art: "set", wert: "tk1|verbrauch" });
  });

  /*
   * ⚠️ REVIEW-BEFUND P2 ZU PR #140 — ein abgelehntes Ziel LÖSCHT die alte Wahl.
   *
   * Der Fall: jemand hat Fahrzeug A gewählt und wählt danach B, das inzwischen
   * stillgelegt wurde. Bliebe A einfach stehen, führte der Rückweg auf die
   * Artikelseite mit AKTIVEM Buchen-Knopf und dem Ziel A — während die letzte
   * Handlung der Person B war. Das ist die wahrscheinlichste Fehlbuchung, die
   * dieser Ablauf überhaupt erzeugen kann, und sie wäre still.
   */
  it("LÖSCHT die alte Wahl, wenn das neue Ziel untauglich ist — und führt zurück zur Wahl", async () => {
    // Das Handlager steht in der Liste, weil es EXISTIERT und AKTIV ist: eine
    // Prüfung, die nur „unbekannt" abweist, ließe es durch.
    for (const roh of ["fz:fz-alt", "fz:lager-2", "fz:gibtsnicht", `fz:${HANDLAGER_ID}`]) {
      stand.cookieOps.length = 0;
      stand.umleitungen.length = 0;
      await waehle({ ziel: roh, returnTo: "/a/art-1" });

      // GELÖSCHT heißt hier: mit denselben Attributen überschrieben und auf
      // Ablauf 0 gesetzt (Hausform aus `_actions/sitzung.ts`). Ein
      // `delete(name)` verlöre den `path` und wäre still wirkungslos.
      expect(gesetzte(), roh).toHaveLength(1);
      expect(gesetzte()[0], roh).toMatchObject({ art: "set", wert: "" });
      expect(gesetzte()[0]!.opt, roh).toMatchObject({ maxAge: 0, path: "/" });
      // ZURÜCK ZUR WAHL, nicht zum Artikel: dort stünde ein bedienbarer Knopf
      // und daneben „Noch nichts gewählt" — ohne jeden Hinweis, dass die
      // gerade getroffene Wahl nicht angekommen ist.
      expect(stand.umleitungen, roh).toEqual(["/helfer/ziel?returnTo=%2Fa%2Fart-1"]);
    }
  });

  it("merkt sich einen unlesbaren Wert NICHT", async () => {
    await waehle({ ziel: "kaputt", returnTo: "/a/art-1" });
    expect(gesetzte().filter((o) => o.wert !== "")).toEqual([]);
  });

  it("ein GESPERRTES Kärtchen setzt kein Ziel", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    expect(gesetzte()).toEqual([]);
  });

  /*
   * ⚠️ REVIEW-BEFUND P2 ZU PR #140 — der Weg zum Artikel überlebt eine
   * abgelaufene Sitzung.
   *
   * Läuft die Sitzung zwischen dem Öffnen der Wahlseite und dem Antippen einer
   * Zeile ab, führt der Weg aufs Gate. Ohne `returnTo` landet die Person nach
   * dem erneuten Einlösen dort, wohin ihr KÄRTCHEN zeigt — und steht mit dem
   * gescannten Etikett in der Hand vor der Artikelliste.
   */
  it("nimmt Rückweg UND Grund mit aufs Gate, wenn die Sitzung abgelaufen ist", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    // ⚠️ OHNE `grund` zeigt das Gate eine gewöhnliche Code-Eingabe ohne jede
    // Erklärung — es kennt seinen Satz nur aus diesem Parameter. „sitzung"
    // heißt dort „abgelaufen"; die Übersetzung steht in `_lib/gateTexte.ts`.
    expect(stand.umleitungen).toEqual(["/?grund=abgelaufen&returnTo=%2Fa%2Fart-1"]);
  });

  it("nennt am Gate den ANDEREN Grund, wenn das Kärtchen gesperrt ist", async () => {
    // Der zweite Grund steht eigens hier: nur er belegt, dass er DURCHgereicht
    // und nicht fest verdrahtet wird.
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1" });

    expect(stand.umleitungen).toEqual(["/?grund=gesperrt&returnTo=%2Fa%2Fart-1"]);
  });

  /*
   * ⚠️ REVIEW-BEFUND P2 ZU PR #164 (DRK-305) — die DRITTE Stelle, an der die
   * Herkunft zaehlt.
   *
   * `Entnahme` und `CheckFlow` haben sie als Pflicht-Prop bekommen; die
   * Zielwahl ist aber kein Insel-Formular, sondern eine Server Component mit
   * Server Action — und die Action kann nach dem Fall des Riegels NIEMANDEN
   * mehr fragen: ein abgelaufenes Auth.js-Cookie ist serverseitig von „war nie
   * angemeldet" nicht zu trennen. Ohne das Feld schickte das Gate jede
   * angemeldete Person zum Scannen eines Kaertchens, das sie nie hatte.
   */
  it("schickt eine ANGEMELDETE Person nicht zum Kärtchen-Scannen", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "konto" });

    expect(stand.umleitungen).toEqual(["/?grund=anmeldung&returnTo=%2Fa%2Fart-1"]);
  });

  it("nimmt den Rückweg auch auf diesem Weg mit — er wird zum callbackUrl", async () => {
    /*
     * Nicht dieselbe Zusage wie oben, sondern die, die den Weg ueberhaupt
     * schliesst: das Gate baut den `callbackUrl` seiner Pocket-ID-Karte aus
     * genau diesem `returnTo` (`lagerbuch/page.tsx`). Ginge er hier verloren,
     * waere der Satz „melde dich erneut an" zwar richtig — und die Person
     * stuende nach der Anmeldung trotzdem woanders als vor dem Absenden.
     */
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/helfer/ziel", herkunft: "konto" });

    expect(stand.umleitungen).toEqual(["/?grund=anmeldung&returnTo=%2Fhelfer%2Fziel"]);
  });

  it("ein gesperrtes Kärtchen im Browser ÜBERSTIMMT die Konto-Herkunft nicht", async () => {
    /*
     * ⚠️ DIESE ZUSAGE STAND HIER EINMAL UMGEKEHRT, und das war der dritte
     * Review-Befund (P2 zu PR #169, zweite Runde). Die alte Begründung lautete:
     * `gesperrt` entstehe nur mit Kärtchen-Cookie, wer ihn bekomme, HABE also
     * ein Kärtchen. Das stimmt — und trägt trotzdem nicht, weil es Besitzen mit
     * Benutzen verwechselt.
     *
     * `requireHelferSitzung` fällt hinter `grund: "gesperrt"` ausdrücklich auf
     * das Konto durch: wer ein totes Kärtchen-Cookie im Browser hat und sich
     * anmeldet, arbeitet angemeldet weiter, und das Cookie bleibt wirkungslos
     * liegen. Fällt später die Anmeldung, liefert der Riegel den Grund des
     * KÄRTCHENS — und die Person läse „dieser Zugangs-Code wurde gesperrt",
     * obwohl sie nie einen Code eingegeben hat. Der Satz spräche über den
     * falschen Gegenstand und verschwiege den Weg, der wirklich hilft.
     */
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "konto" });

    expect(stand.umleitungen).toEqual(["/?grund=anmeldung&returnTo=%2Fa%2Fart-1"]);
  });

  it("mit KÄRTCHEN-Herkunft bleibt `gesperrt` dagegen `gesperrt`", async () => {
    // Die Gegenprobe: nur sie hält fest, dass der Grund überhaupt noch
    // durchgereicht wird und nicht alles auf die Herkunft zusammenfällt.
    riegel.mockResolvedValue({ ok: false, grund: "gesperrt", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "token" });

    expect(stand.umleitungen).toEqual(["/?grund=gesperrt&returnTo=%2Fa%2Fart-1"]);
  });

  it("ein FEHLENDES oder unbekanntes Herkunftsfeld gilt als Kärtchen", async () => {
    /*
     * Das Feld ist von aussen setzbar — es entscheidet aber ausschliesslich,
     * welcher SATZ auf dem Gate steht, gewaehrt nichts und aendert das Ziel
     * nicht. Wichtig ist allein, dass alles ausser dem einen bekannten Wort
     * auf den bisherigen Weg faellt statt auf einen dritten Zustand.
     */
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });

    for (const roh of [undefined, "", "Konto", "token", "kaputt"]) {
      stand.umleitungen.length = 0;
      await waehle({
        ziel: "fz:fz-1", returnTo: "/a/art-1",
        ...(roh === undefined ? {} : { herkunft: roh }),
      });
      expect(stand.umleitungen, `Herkunft ${JSON.stringify(roh)}`)
        .toEqual(["/?grund=abgelaufen&returnTo=%2Fa%2Fart-1"]);
    }
  });

  /*
   * ⚠️ REVIEW-BEFUND P2 ZU PR #169 — „kein Konto-Zugang" sind ZWEI Lagen, und
   * die falsche Zusammenlegung baut eine SCHLEIFE.
   *
   * Wird jemandem die Lagerbuch-Gruppe entzogen, waehrend die Zielwahl offen
   * steht, ist die Sitzung weiterhin gueltig — es fehlt das RECHT. „Melde dich
   * erneut an" schickt diese Person durch den ganzen Pocket-ID-Weg und danach
   * vor dieselbe Sperre.
   */
  it("schickt jemanden mit ENTZOGENER Gruppe nicht in die Anmeldung", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: true });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "konto" });

    expect(stand.umleitungen).toEqual(["/?grund=keinZugriff&returnTo=%2Fa%2Fart-1"]);
  });

  it("die Unterscheidung kommt vom RIEGEL, nicht aus dem Formular", async () => {
    /*
     * Dieselbe Eingabe, derselbe Grund — nur der Serverbefund ist ein anderer,
     * und er entscheidet. Das ist die Trennlinie des ganzen Fixes: WELCHE
     * Herkunft gerendert wurde, weiss nur die Seite (deshalb das Formularfeld);
     * ob die Sitzung JETZT noch steht, weiss nur der Riegel. Waere auch das
     * zweite aus dem Formular gekommen, liesse sich von aussen bestimmen, ob
     * eine erneute Anmeldung ueberhaupt angeboten wird.
     */
    const eingabe = { ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "konto" };

    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });
    await waehle(eingabe);
    expect(stand.umleitungen).toEqual(["/?grund=anmeldung&returnTo=%2Fa%2Fart-1"]);

    stand.umleitungen.length = 0;
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: true });
    await waehle(eingabe);
    expect(stand.umleitungen).toEqual(["/?grund=keinZugriff&returnTo=%2Fa%2Fart-1"]);
  });

  it("mit KAERTCHEN bleibt es `abgelaufen`, auch wenn daneben jemand angemeldet ist", async () => {
    // `nochAngemeldet` gilt nur fuer die Konto-Herkunft. Wer ein Kaertchen
    // benutzt hat, soll es erneut scannen — dass er nebenbei ein Konto hat,
    // aendert daran nichts.
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: true });

    await waehle({ ziel: "fz:fz-1", returnTo: "/a/art-1", herkunft: "token" });

    expect(stand.umleitungen).toEqual(["/?grund=abgelaufen&returnTo=%2Fa%2Fart-1"]);
  });

  it("nimmt auch aufs Gate KEIN fremdes `returnTo` mit", async () => {
    riegel.mockResolvedValue({ ok: false, grund: "sitzung", nochAngemeldet: false });

    await waehle({ ziel: "fz:fz-1", returnTo: "//boese.example" });

    expect(stand.umleitungen).toEqual(["/?grund=abgelaufen&returnTo=%2Fhelfer"]);
  });

  it("weist ein fremdes `returnTo` ab und landet auf der Artikelliste", async () => {
    // Ohne `sanitizeReturnTo` wäre das ein Open Redirect — auf einer Fläche,
    // die mit einem laminierten Kärtchen erreichbar ist.
    for (const boese of ["//boese.example", "https://boese.example", "/\\boese.example"]) {
      stand.umleitungen.length = 0;
      await waehle({ ziel: "fz:fz-1", returnTo: boese });
      expect(stand.umleitungen, boese).toEqual(["/helfer"]);
    }
  });
});
