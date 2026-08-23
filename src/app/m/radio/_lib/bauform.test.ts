// src/app/m/radio/_lib/bauform.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DER REIHENFOLGE-SCAN DER DREI GATE-FLAECHEN (Spec 1 §3.3.1, Zeilen 2256-2272; Testauftrag
 * §3.8 Zeile 3108). Bauform aus `src/app/m/lagerbuch/_lib/bauform.test.ts:1340-1517` —
 * 1:1 uebernommen sind `riegelFuer` und der Reihenfolge-Fall selbst; NICHT uebernommen ist
 * `einloeseAbschnitt` (Begruendung bei `scanAbschnitt`).
 *
 * ⛔ WARUM DER AUSSCHNITT UND NICHT DER GANZE DATEITEXT: `muster.exec(q)` liefert das ERSTE
 * Vorkommen in der ganzen Datei. Traegt eine Flaeche mehr als eine exportierte Funktion —
 * fuer `_actions/sitzung.ts` seit Entscheidung E12 der Normalfall —, koennten die vier
 * Erst-Vorkommen aus VERSCHIEDENEN Funktionen stammen. Die Reihenfolgeaussage waere dann
 * bedeutungslos, OHNE rot zu werden: ein `requireRadioHost(` frueh im Text „erfuellte" den
 * Host-Riegel fuer die einloesende Funktion mit.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass ein Riegel bei einem echten Abruf GREIFT (⬜ A-L9).
 * Sie haelt fest, dass eine BAUFORM eingehalten ist — genau die Fehlerklasse, die
 * typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar ist.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");

/**
 * ⛔ DIE DREI FLAECHEN, DIE EINE AUSLEIH-SITZUNG AUSSTELLEN (Spec:2258: „Es gibt genau DREI
 * Stellen … ALLE DREI tragen dieselben sechs Schritte in derselben Reihenfolge"; Spec:3108
 * fuehrt genau diese drei Dateinamen). Die dritte, `_actions/sitzung.ts`, kommt aus
 * Planentscheidung E12 (`.superpowers/sdd/planteil3/briefs/KOPF.md:675-731`).
 */
const GATE_FLAECHEN = ["t/[code]/route.ts", "_actions/gate.ts", "_actions/sitzung.ts"];

/**
 * ⛔ JE FLAECHE WIRD DER KOERPER EINER BENANNTEN FUNKTION GESCANNT, NICHT DER DATEITEXT.
 * `_actions/sitzung.ts` traegt ZWEI Exporte (E12), und `beenden` traegt nur den
 * Host-Riegel. Ein Scan ueber den Dateitext meldete fuer sie „Sperre fehlt ganz" — bei
 * RICHTIGER Implementierung. Fuer `_actions/gate.ts` und `t/[code]/route.ts` gilt derselbe
 * Grund aus dem Kopfkommentar oben.
 *
 * `funktionsKoerper(quelle, name)` ist aus `riegel.test.ts:237-252` kopiert.
 */
const EINLOESE_FUNKTION: Record<string, string> = {
  "t/[code]/route.ts": "GET",
  "_actions/gate.ts": "einloesenAmGate",
  "_actions/sitzung.ts": "erneuereSitzung",
};

/**
 * Der Host-Riegel ist je Flaeche VERSCHIEDEN, und das ist keine Bequemlichkeit: ein Muster,
 * das BEIDE Formen naehme, machte diesen Block fuer die zwei Actions blind — sie koennten
 * still auf die nicht-werfende Form umschwenken (eine Server Action, die auf fremdem Host
 * `null` bekommt und WEITERLAEUFT), ohne dass hier etwas rot wuerde
 * (`lagerbuch/_lib/bauform.test.ts:1358-1368`, dort gemessen).
 *
 * Route Handler nicht-werfend (`riegel.test.ts:440-449` verbietet dort die werfende Form),
 * Actions werfend (Spec:2360-2362, Bauform-Zulaessigkeitstafel Zeile 11).
 *
 * ⛔ KEINE VORGABE UND KEIN `??`-RUECKFALL: eine vierte Gate-Flaeche ist eine ENTSCHEIDUNG
 * und muss hier eingetragen werden. Ein Rueckfall liesse sie still in den falschen Zweig
 * laufen; ohne ihn wird `HOST_FORM[schluessel]!` zu `undefined` und der Fall bricht LAUT ab.
 */
const HOST_FORM: Record<string, RegExp> = {
  "t/[code]/route.ts": /\bradioHostOderNull\s*\(/,
  "_actions/gate.ts": /\brequireRadioHost\s*\(/,
  "_actions/sitzung.ts": /\brequireRadioHost\s*\(/,
};

/**
 * Die vier Riegel EINER Flaeche, in der zugesicherten Reihenfolge. Als Funktion und nicht
 * als Modulebenen-`const`, weil der Host-Riegel je Flaeche verschieden ist. An keinem der
 * Muster haengt ein `g` — ein gehisstes `/g`-Muster truege `lastIndex` zwischen den
 * Flaechen weiter (`lagerbuch/_lib/bauform.test.ts:1379-1382`).
 */
const riegelFuer = (schluessel: string): { name: string; muster: RegExp }[] => [
  { name: "Host", muster: HOST_FORM[schluessel]! },
  { name: "Sperre", muster: /\bgateGesperrt\s*\(/ },
  { name: "normalisieren", muster: /\bnormalisiereCode\s*\(/ },
  { name: "Einloesung", muster: /\bloeseCodeEin\s*\(/ },
];

/** Der rohe Quelltext einer Flaeche, ueber ihren modulrelativen Namen. */
const lies = (pfad: string): string => readFileSync(join(MODUL, pfad), "utf8");

/**
 * Der Ausschnitt, ueber den die vier Muster laufen — die EINE benannte Funktion je Flaeche,
 * nicht der Dateitext.
 *
 * ⛔ NICHT `einloeseAbschnitt` NENNEN: im Vorbild (`lagerbuch/_lib/bauform.test.ts:1437-1447`)
 * ist das die MITGLIEDSCHAFTSBEDINGUNG — `flaechen()` behaelt dort nur Dateien, in denen es
 * etwas findet. Hier ist der Ausschnitt eine FUNKTION JE FLAECHE (E12), und die
 * Mitgliedschaft entscheidet `vorhandeneFlaechen()` unten. Ein Name, zwei Aufgaben waere
 * genau die Verwechslung, die dieser Abschnitt vermeiden soll.
 *
 * ⚠️ HIER WIRD NICHT VORGEREINIGT, und das ist Absicht (Vorabscan-Fund F23):
 * `funktionsKoerper` beginnt selbst mit `ohneKommentareUndZeichenketten(quelle)`
 * (`riegel.test.ts:238`). Eine zweite Anwendung waere idempotent und damit folgenlos — aber
 * der naechste Leser entfernte spaeter die falsche der beiden und machte den Scan still
 * blind.
 */
const scanAbschnitt = (schluessel: string): string =>
  funktionsKoerper(lies(schluessel), EINLOESE_FUNKTION[schluessel]!);

/**
 * ⛔ DIE EXISTENZPFLICHT FILTERT AUF DIE DATEI, NICHT AUF „loest ein". Das Vorbild filtert
 * auf „traegt `redeemToken(`" (`lagerbuch/_lib/bauform.test.ts:1437-1447`), weil dort ALLE
 * drei Dateien einloesen. Hier waere derselbe Filter zweideutig: `sitzung.ts` loest zwar ein
 * (in `erneuereSitzung`, E12), aber die Aussage, die diese Liste tragen soll, ist „die drei
 * Dateien EXISTIEREN" — sonst sind die Faelle darunter vacuously true, sobald eine fehlt.
 * WELCHE Funktion gescannt wird, sagt `EINLOESE_FUNKTION`.
 */
const vorhandeneFlaechen = (): string[] =>
  GATE_FLAECHEN.filter((f) => existsSync(join(MODUL, f)));

/*
 * ⛔ HIER STEHEN DIE FUENF SCAN-HELFER, KOPIERT AUS `riegel.test.ts:113-252`
 * (`quellDateien`, `ohneKommentare`, `ohneKommentareUndZeichenketten`, `trefferAuf`,
 * `funktionsKoerper`) — mit ihren Kommentaren, wo sie hier dieselbe Sache erklaeren.
 *
 * ⛔ KEIN IMPORT AUS `riegel.test.ts`: vitest laedt Testdateien nicht als Module
 * fuereinander. ⚠️ DIE ZWEITE HAELFTE DER UEBLICHEN BEGRUENDUNG TRAEGT NICHT, und sie steht
 * hier trotzdem, statt verschwiegen zu werden (Vorabscan-Fund F22): eine geteilte
 * Helferdatei muesste NICHT unter `src/app/m/radio/` liegen — `riegel.test.ts:696` filtert
 * fuer den `"use client"`-Scan INNERHALB von `quellDateien()`, und das laeuft ausschliesslich
 * ueber `MODUL`. Ein Modul unter `src/core/testing/` waere fuer jeden Scan dieses Moduls
 * unsichtbar und ganz normal importierbar. Der Preis der Kopie ist benannt: `ohneKommentare`
 * steht damit viermal im Repo. Die Alternative ist in den Bericht zu A910 geschrieben, nicht
 * hier still verworfen.
 *
 * ⚠️ DER SCHNITT BEGINNT BEI `:113` UND NICHT BEI `:117` (Vorabscan-Fund F24, nachgemessen):
 * `:117` liegt MITTEN im Kommentarblock von `quellDateien`, das oeffnende `/**` steht bei
 * `:113`.
 *
 * ⛔ KEIN `.filter((p) => p !== SELBST)`: `quellDateien` verwirft bereits jede
 * `*.test.ts`/`*.spec.ts` — ein zweiter Filter waere ein TOTER PFAD und laese sich wie ein
 * zweiter Riegel (REVIEW-A8 S1, dort gemessen).
 */

/**
 * Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv, OHNE Testdateien.
 *
 * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit: diese Datei hier nennt
 * `AUSLEIH_COOKIE`, `NextResponse.redirect` und `cookies().delete` in ihren eigenen Mustern.
 * Ein Scan, der Testdateien mitliest, macht genau die Tests rot, die die Zusicherung TRAGEN
 * — und wird dann abgeschaltet statt repariert. Der Verlust ist klein und benannt: eine
 * Verletzung, die AUSSCHLIESSLICH in einer Testdatei steht, bleibt unentdeckt. Testdateien
 * werden nicht ausgeliefert.
 */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // erzeugtes SQL/JSON, kein TypeScript
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (/\.(?:test|spec)\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise: die
 * Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt mit `//`
 * BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt stehen — ein naiver
 * Stripper leerte bei `const u = "https://example.org"` den Rest der Zeile und koennte damit
 * eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie falsch-negativ
 * und still.
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
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

/**
 * Wie `ohneKommentare`, zusaetzlich werden Zeichenkettenliterale UND nachgestellte
 * Kommentare geleert. Nur fuer die POSITIVEN Nachweise noetig: `toMatch` behauptet, dass ein
 * Muster VORKOMMT — ein String `"requireRadioHost("` oder ein `// frueher: gateGesperrt(x)`
 * erfuellte das sonst, OHNE dass der Riegel je liefe.
 */
function ohneKommentareUndZeichenketten(quelle: string): string {
  const bereinigt = ohneKommentare(quelle);
  let ergebnis = "";
  let i = 0;
  while (i < bereinigt.length) {
    const z = bereinigt[i]!;
    if (z === '"' || z === "'" || z === "`") {
      ergebnis += " ";
      i++;
      while (i < bereinigt.length && bereinigt[i] !== z) {
        if (bereinigt[i] === "\\") i++;
        else if (bereinigt[i] === "\n") ergebnis += "\n";
        i++;
      }
      if (i < bereinigt.length) { ergebnis += " "; i++; }
      continue;
    }
    ergebnis += z;
    i++;
  }
  return ergebnis.replace(/\/\/.*$/gm, ""); // ⛔ ZULETZT: davor zerrisse er "https://…"
}

function trefferAuf(muster: RegExp, dateien = quellDateien()): string[] {
  const funde: string[] = [];
  for (const pfad of dateien) {
    const zeilen = ohneKommentare(readFileSync(pfad, "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) funde.push(`${relative(process.cwd(), pfad)}:${i + 1}: ${zeile.trim()}`);
    });
  }
  return funde;
}

/**
 * Schneidet den KOERPER einer Funktion heraus — von ihrer Deklaration bis zur schliessenden
 * Klammer, ueber eine Klammerzaehlung.
 *
 * ⚠️ ⛔ DIE EINE FORM, DIE SIE NICHT TRIFFT, UND SIE IST FUER DIESEN PLANTEIL TRAGEND
 * (gemessen am 2026-08-23 mit einer Sonde ueber genau diese Kopie): der Schnitt beginnt an
 * der ERSTEN `{` NACH dem Funktionsnamen — nicht an der Rumpfklammer. Traegt die SIGNATUR
 * eine geschweifte Klammer, liest der Scan sie als Rumpf:
 *
 *   `function GET(req: Request, ctx: { params: Promise<{ code: string }> })`
 *      -> Koerper = "{ params: Promise<{ code: string }> }"   -> alle vier Riegel „fehlen"
 *   `function erneuereSitzung(c: string): Promise<{ ok: true } | { ok: false; … }>`
 *      -> Koerper = "{ ok: true }"                            -> dasselbe
 *
 * Beide Faelle sind NICHT leer und laufen deshalb an der Leer-Zusicherung im
 * Reihenfolge-Fall vorbei; sie melden „Riegel „Host" fehlt ganz" fuer eine sachlich
 * RICHTIGE Datei. ⛔ DIE BEHEBUNG GEHOERT IN DIE SIGNATUR, NICHT IN DIESE KOPIE: `route.ts`
 * fuehrt `RouteKontext` als benannten Typ, `sitzung.ts` `ErneuerungErgebnis`. Wer stattdessen
 * hier nachbessert, laesst diese Kopie und `riegel.test.ts:237-252` auseinanderlaufen.
 */
function funktionsKoerper(quelle: string, name: string): string {
  const bereinigt = ohneKommentareUndZeichenketten(quelle);
  const start = bereinigt.search(new RegExp(`\\bfunction\\s+${name}\\s*\\(`));
  if (start === -1) return "";
  const auf = bereinigt.indexOf("{", start);
  if (auf === -1) return "";
  let tiefe = 0;
  for (let i = auf; i < bereinigt.length; i++) {
    if (bereinigt[i] === "{") tiefe++;
    else if (bereinigt[i] === "}") {
      tiefe--;
      if (tiefe === 0) return bereinigt.slice(auf, i + 1);
    }
  }
  return "";
}

/** Jede Quelldatei unterhalb von `admin/` — die Trennlinie aus §3.6.3 Punkt 1. */
const adminDateien = (): string[] =>
  quellDateien().filter((p) => /\/admin\//.test(relative(process.cwd(), p).replace(/\\/g, "/")));

describe("radio-bauform: die drei Gate-Flaechen", () => {
  it("alle drei Gate-Flaechen existieren", () => {
    /*
     * ⛔ DIE VERSCHAERFUNG (Vorbild `lagerbuch/_lib/bauform.test.ts:1450-1457`). Ohne sie
     * sind die Faelle darunter „vacuously true", sobald eine Datei fehlt — und das sieht in
     * der Ausgabe wie ein bestandener Lauf aus. Verglichen wird eine aus der PLATTE gelesene
     * Liste gegen die Sollliste, IN DERSELBEN REIHENFOLGE.
     *
     * ⛔ DIESE ZEILE IST DER ZWEITE GRUND, WARUM A9 UND A10 EIN COMMIT SIND: ueber zwei von
     * drei Flaechen ist sie ROT.
     */
    expect(vorhandeneFlaechen()).toEqual(GATE_FLAECHEN);
  });

  it("jede Flaeche traegt alle vier Riegel — in dieser Reihenfolge", () => {
    /*
     * Spec:2256-2272. Die vier Riegel in der Reihenfolge Host -> Sperre -> normalisieren ->
     * Einloesung, gemessen an ihren TEXTPOSITIONEN im Funktionskoerper.
     *
     * ⛔ DIE LEER-ZUSICHERUNG STEHT VORNE UND MELDET FUER SICH (zeichengleich zu
     * `riegel.test.ts:572`, Vorabscan-Fund F8a). Ohne sie waere der Fall zwar nicht
     * leer-gruen — ein leerer Ausschnitt laesst alle vier `muster.exec` `null` liefern —,
     * aber die Meldung zeigte auf den FALSCHEN Fehler: „Riegel „Host" fehlt ganz", wo in
     * Wahrheit der Funktionsname nicht gefunden wurde.
     */
    const verstoesse: string[] = [];
    for (const schluessel of vorhandeneFlaechen()) {
      const abschnitt = scanAbschnitt(schluessel);
      if (abschnitt === "") {
        verstoesse.push(
          `${schluessel}: Funktionskoerper ${EINLOESE_FUNKTION[schluessel]!} nicht gefunden — der Scan waere hier blind`,
        );
        continue;
      }
      let vorher = -1;
      let vorherName = "(Abschnittsanfang)";
      for (const { name, muster } of riegelFuer(schluessel)) {
        const t = muster.exec(abschnitt);
        if (!t) { verstoesse.push(`${schluessel}: Riegel "${name}" fehlt ganz`); break; }
        if (t.index < vorher) { verstoesse.push(`${schluessel}: "${name}" steht VOR "${vorherName}"`); break; }
        vorher = t.index;
        vorherName = name;
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("kein Datenbankzugriff VOR der Sperre", () => {
    /*
     * ⛔ NACHGETRAGEN GEGEN DEN BRIEF (Vorabscan-Fund F8b): der Brief zitiert
     * `lagerbuch/_lib/bauform.test.ts:1370-1475`, dieser Fall steht dort bei `:1476` — also
     * knapp AUSSERHALB. Ohne ihn hat Eigenschaft 1 aus A3 keinen Waechter.
     *
     * `gateGesperrt` ist genau deshalb ohne Datenbankzugriff gebaut
     * (`_lib/gateSchranke.ts:165-169`, „UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT"):
     * sie SCHUETZT den Zugriff. Faellt ein `getDb()` davor, ist der Deckel wirkungslos — und
     * still. ⚠️ Der Reihenfolge-Fall oben faengt das NICHT: `getDb(` ist keiner seiner vier
     * Riegel.
     *
     * Fehlt `gateGesperrt(` im Abschnitt ganz, meldet das der Fall oben als „Riegel fehlt
     * ganz" — hier still weiterzugehen laesst also nichts durch.
     */
    const verstoesse: string[] = [];
    for (const schluessel of vorhandeneFlaechen()) {
      const abschnitt = scanAbschnitt(schluessel);
      const sperre = /\bgateGesperrt\s*\(/.exec(abschnitt);
      if (!sperre) continue;
      const db = /\bgetDb\s*\(/.exec(abschnitt);
      if (db && db.index < sperre.index) {
        verstoesse.push(`${schluessel}: getDb() steht vor gateGesperrt()`);
      }
    }
    expect(verstoesse).toEqual([]);
  });

  it("sitzung.ts hat ZWEI Exporte, und nur erneuereSitzung loest ein", () => {
    /*
     * ⛔ DIE ARBEITSTEILUNG INNERHALB EINER DATEI, und sie ist der Grund, warum der
     * Reihenfolge-Scan eine FUNKTION misst und nicht den Dateitext (E12).
     *
     *   erneuereSitzung — die dritte Gate-Flaeche (Spec:2258, :2563-2570). Alle vier Riegel,
     *                     in der Reihenfolge des Gates.
     *   beenden         — KEIN Code einzuloesen. Nur der Host-Riegel; die drei uebrigen
     *                     Muster gaebe es dort nicht, und ein Dateitext-Scan meldete sie
     *                     faelschlich als fehlend.
     */
    const q = ohneKommentareUndZeichenketten(lies("_actions/sitzung.ts"));
    expect(q).toMatch(/\bexport\s+async\s+function\s+beenden\s*\(/);
    expect(q).toMatch(/\bexport\s+async\s+function\s+erneuereSitzung\s*\(/);

    const beendenKoerper = funktionsKoerper(lies("_actions/sitzung.ts"), "beenden");
    expect(beendenKoerper, "beenden nicht gefunden — der Scan waere hier blind").not.toBe("");
    expect(beendenKoerper, "beenden traegt den Host-Riegel").toMatch(/\brequireRadioHost\s*\(/);
    expect(beendenKoerper, "beenden loest nichts ein").not.toMatch(/\bloeseCodeEin\s*\(/);

    const erneuernKoerper = funktionsKoerper(lies("_actions/sitzung.ts"), "erneuereSitzung");
    expect(erneuernKoerper, "erneuereSitzung nicht gefunden — der Scan waere hier blind").not.toBe("");
    expect(erneuernKoerper, "erneuereSitzung loest ein").toMatch(/\bloeseCodeEin\s*\(/);
    /*
     * ⛔ UND SIE LEITET NICHT UM. Das ist ihr ganzer Zweck: die Seite bleibt stehen, die
     * eingetragenen Werte bleiben stehen (Spec:2563-2567,
     * `lagerbuch/_actions/sitzung.ts:42-44`). Ein `redirect()` hier verwuerfe genau das,
     * wogegen die Funktion gebaut ist.
     */
    expect(erneuernKoerper, "erneuereSitzung darf nicht umleiten").not.toMatch(/\bredirect\s*\(/);
  });
});

describe("radio-bauform: die Zusagen, die kein Typ und kein Riegel halten kann", () => {
  it("abmelden/route.ts nennt signOut nicht", () => {
    /*
     * ⛔ Spec:2610-2614: „`/abmelden` raeumt AUSSCHLIESSLICH `AUSLEIH_COOKIE`. Kein
     * `signOut()`, kein Auth.js-Cookie — sonst verloere eine angemeldete Person ihre
     * Suite-Sitzung auf ALLEN Modul-Hosts beim Beenden des anonymen Zugangs."
     *
     * Der Fehler ist maximal naheliegend („abmelden heisst abmelden") und im Betrieb
     * unangenehm: wer ueber die Kachel kam und den Code-Zugang beendet, faende sich aus der
     * ganzen Suite ausgeloggt.
     */
    expect(ohneKommentareUndZeichenketten(lies("abmelden/route.ts"))).not.toMatch(/\bsignOut\b/);
  });

  it("keine Datei unter admin/ nennt AUSLEIH_COOKIE", () => {
    /*
     * ⛔ Spec:2449-2451 und §3.6.3 Punkt 1 (Spec:2908-2912): das Cookie traegt `path: "/"`
     * (`_lib/ausleihSitzung.ts:207-219`) und wird damit an `/admin` MITGESCHICKT. Die
     * Zusage, dass es dort niemand LIEST, kann kein Typ und kein Riegel halten — nur dieser
     * Scan.
     *
     * ⚠️ HEUTE UEBER ZWEI DATEIEN (`admin/(arbeit)/layout.tsx`, `admin/(druck)/layout.tsx`).
     * Die Untergrenze steht dabei, damit er nicht leer-gruen wird, wenn `admin/` einmal
     * anders heisst.
     */
    const dateien = adminDateien();
    expect(dateien.length, "leere Dateiliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(2);
    expect(trefferAuf(/\bAUSLEIH_COOKIE\b|radio_ausleihe/, dateien)).toEqual([]);
  });

  it("keine Gate-Flaeche nennt NextResponse.redirect", () => {
    /*
     * ⛔ Spec:2284-2296: `NextResponse.redirect(...)` verlangt eine ABSOLUTE URL, und
     * `req.url` traegt nach dem Modul-Host-Rewrite den INNEREN Pfad (`/m/radio/...`). Der
     * Browser landete also auf einer Adresse, die er nie gesehen hat — und bei `radio` ist
     * das teurer als bei `lagerbuch`, weil es KEIN PARALLELFENSTER gibt: der einzige
     * Rueckweg ist „Router zurueck".
     *
     * Ein RELATIVES `Location` loest der Browser gegen die URL auf, die ER sah
     * (RFC 7231 §7.1.2).
     */
    for (const f of GATE_FLAECHEN.concat(["abmelden/route.ts"])) {
      expect(ohneKommentareUndZeichenketten(lies(f)), `${f} nennt NextResponse.redirect`)
        .not.toMatch(/NextResponse\s*\.\s*redirect/);
    }
  });

  it("keine Datei dieses Moduls ruft cookies().delete", () => {
    /*
     * ⛔ Zwei Ausfaelle in einem (Bauform-Zulaessigkeitstafel Zeilen 3 und 4): in einer
     * Server Component WIRFT es (der vernarbte Praezedenzfall, mit Quellenbeleg in
     * `lagerbuch/abmelden/route.ts:12-20`), und ueberall sonst setzt es KEIN `Path` und
     * loescht dadurch am falschen Scope — WIRKUNGSLOS, ohne dass der Browser das meldet.
     *
     * Die eine erlaubte Form ist `ausleihCookieOptionen(0)`: dieselbe Optionen-Funktion wie
     * beim Setzen (Spec:2596-2604, `_lib/ausleihSitzung.ts:195-201`).
     *
     * ⛔ ZWEI SCANS, UND DER ZWEITE IST DIE BEHEBUNG VON VORABSCAN-FUND F21. `trefferAuf`
     * testet ZEILENWEISE (`riegel.test.ts:215-224`) — das `[\s\S]{0,40}` im ersten Muster
     * verspricht Mehrzeiligkeit, die es dort nicht bekommt: ein ueber zwei Zeilen
     * umbrochenes `(await cookies())\n  .delete(x)` faellt durch. Das waere
     * falsch-negativ UND still, die eine Richtung, die `riegel.test.ts:160-161` woertlich
     * verbietet. Der zweite Scan wendet dasselbe Muster DATEIWEIT an und schliesst genau
     * diese Luecke. ⚠️ Kein dritter, schwaecherer Scan daneben — es geht um DENSELBEN Scan
     * in der richtigen Reichweite.
     */
    expect(trefferAuf(/\bcookies\s*\(\s*\)[\s\S]{0,40}\.\s*delete\s*\(/)).toEqual([]);

    const mehrzeilig: string[] = [];
    for (const pfad of quellDateien()) {
      const q = ohneKommentareUndZeichenketten(readFileSync(pfad, "utf8"));
      if (/\bcookies\s*\(\s*\)[\s\S]{0,40}\.\s*delete\s*\(/.test(q)) {
        mehrzeilig.push(relative(process.cwd(), pfad));
      }
    }
    expect(mehrzeilig, "cookies().delete( — auch ueber einen Zeilenumbruch hinweg").toEqual([]);
  });
});
