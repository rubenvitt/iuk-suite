// src/app/m/radio/_lib/aliasse.test.ts
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { decideRoute } from "@/core/routing";
import { AUSLEIH_PFADE, VERWALTUNGS_PFADE } from "./routen";
import {
  ALIAS_ROUTEN,
  PLATZHALTER,
  einsetzen,
  handlerDatei,
  aliasAntwort,
} from "./aliasse";

/**
 * DIE ALIAS-ROUTEN FUER DIE ALTEN PFADE — Betreiberentscheidung vom 2026-08-27
 * (`.superpowers/sdd/adminlink/KONTEXT.md`, „Die alten Pfade bekommen Alias-Routen im
 * Modul"). Die Messung, auf der sie ruht, ist
 * `.superpowers/sdd/BERICHT-urls-und-adminzugang.md` Frage 1: von ZWANZIG aeusseren
 * Alt-Pfaden bleiben zwei zeichengleich.
 *
 * ⛔ WARUM EIN TRAEFIK-REDIRECT DIESE NEUN NICHT ERSETZT (Bericht §1.1): der Alt-Kiosk laeuft
 * schon heute unter `radio.iuk-ue.de`, also unter DEMSELBEN Host wie das neue Modul. Eine
 * Traefik-Regel auf diesem Host traefe die neuen Pfade mit. Der Umbau muss deshalb IM Modul
 * geschehen.
 *
 * ⛔ WARUM ROUTE HANDLER UND KEINE `page.tsx` — GEMESSEN AN DEN EIGENEN WAECHTERN DES MODULS,
 * nicht nach Geschmack gewaehlt:
 *
 *   `riegel.test.ts:1219` (`ADMIN_SEITEN`)    faengt `/\/admin\/(?:.*\/)?(?:page|template|default)\.tsx$/`
 *   `riegel.test.ts:808`       (`AUSLEIH_FLAECHEN`) faengt `/\/(?:page|layout|template|default)\.tsx$/`
 *
 *   Eine Alias-Seite als `page.tsx` fiele damit in Klausel (e) bzw. (f) und MUESSTE den
 *   Personen-Riegel ihrer Stufe als erste Anweisung tragen — eine Weiterleitung waere hinter
 *   dem Recht ihres ZIELS verriegelt. Ein anonymer Kiosk auf `/loan` landete dann im
 *   Login-Umweg statt auf `/ausleihen`. ⛔ Eine `route.ts` beruehrt dagegen ZWEI Zaehler und
 *   KEINEN Personen-Riegel: `HANDLER_ANZAHL` (`riegel.test.ts:157`) UND
 *   `QUELLDATEIEN_ANZAHL` (`_lib/keine-pwa.test.ts`) — beides musste diese Aufgabe anheben,
 *   und Sonde E (eine `route.ts` entfernt) faerbt gemessen BEIDE rot (Fix-Runde 1, Fund S3).
 *   Sie traegt mit `hostAbweisung(req) ?? …` genau den Riegel, der hier richtig ist: den
 *   HOST-Riegel, nicht den Personen-Riegel.
 *
 * ⛔ UND WARUM KEIN `redirects()` IN `next.config.ts`: die Umschreibung auf den Modulpfad
 * geschieht in `src/proxy.ts` (Middleware), die `redirects()` der Konfiguration laufen davor
 * und kennen den Host nur als BAUZEIT-Wert. Der Prod-Host steht aber ausschliesslich in der
 * LAUFZEIT-Variablen `SUITE_HOST_RADIO` (`src/core/registry.ts:174-176`,
 * `moduleUrl.ts:19-22`). Eine host-lose Regel traefe zugleich `portal.iuk-ue.de/loan`; eine
 * host-gebundene Regel truege beim Bauen den leeren Host. Beides ist gruen im Test und tot
 * im Betrieb — genau die Klasse, gegen die dieses Modul seine Quelltext-Scans fuehrt.
 *
 * ⚠️ WAS DIESE DATEI NICHT BELEGT: dass ein Lesezeichen im echten Browser ankommt. Sie prueft
 * die Middleware-Entscheidung (wie `_lib/routen.test.ts`) und das VERHALTEN der Handler (wie
 * `sw.js/route.test.ts`). Der Abruf auf zwei Hosts gehoert nach `e2e/`.
 */

const MODUL = join(process.cwd(), "src/app/m/radio");
const HOST = "radio.localtest.me";

/**
 * ⛔ `x-forwarded-host` UND NICHT `host` — uebernommen aus `sw.js/route.test.ts:38-42`:
 * `resolveHost` (`src/core/routing.ts:36-41`) liest ihn mit Vorrang, und `Host` ist in
 * undicis `Headers` mit dem Request-Waechter ein verbotener Name. Ein Test, der ihn setzt,
 * maesse die leere Zeichenkette und waere aus dem falschen Grund gruen.
 */
const RADIO_HOST = { "x-forwarded-host": "radio.localtest.me" };
const FREMDER_HOST = { "x-forwarded-host": "portal.localtest.me" };

const anfrage = (pfad: string, kopf: HeadersInit): Request =>
  new Request(`http://radio.localtest.me${pfad}`, {
    method: "GET",
    headers: kopf,
  });

/**
 * ⛔ DIE FUENF ROUTE HANDLER, DIE KEINE ALIASSE SIND — namentlich, damit die Abziehung unten
 * nicht ins Leere laeuft. Stand VOR dieser Aufgabe: `HANDLER_ANZAHL = 5`
 * (`git show bf1c0198:src/app/m/radio/riegel.test.ts`, dort Zeile 145, Wert 5); heute
 * `riegel.test.ts:157` mit 14.
 *
 * ⛔ DER ANKER IST DIE SHA UND AUSDRUECKLICH NICHT `HEAD` (Fix-Runde 2 zu L4, Fund N1). `HEAD`
 * wandert mit jedem Commit, und schon derjenige, der diesen Satz ablegte, machte ihn falsch:
 * dasselbe Kommando gegen `HEAD` liefert heute `157:const HANDLER_ANZAHL = 14;`, und Zeile 145
 * traegt dort Fliesstext statt der Zahl. Ein `HEAD`-Verweis in einer committeten Datei ist NIE
 * haltbar — er zeigt per Bauart auf den Stand NACH der Aenderung, die er beschreiben soll.
 * ⚠️ Der Wert steht zusaetzlich ausgeschrieben, weil eine Zweig-SHA eine Verdichtung beim Merge
 * nicht ueberlebt; faellt der Anker, traegt die Zahl den Satz weiter.
 * Ein sechster Nicht-Alias-Handler macht den Vollzaehligkeitsfall rot, und das ist gewollt.
 */
const NICHT_ALIAS = [
  "t/[code]/route.ts",
  "abmelden/route.ts",
  "sw.js/route.ts",
  "admin/(arbeit)/geraete/export/route.ts",
  "admin/(arbeit)/import/hochladen/route.ts",
];

/** Alle `route.ts` unter `src/app/m/radio`, modulrelativ mit `/` als Trenner. */
function alleHandler(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      treffer.push(...alleHandler(pfad));
      continue;
    }
    if (eintrag === "route.ts")
      treffer.push(relative(MODUL, pfad).replace(/\\/g, "/"));
  }
  return treffer;
}

/**
 * ⛔ DIE LADETAFEL, UND SIE IST AUFGEZAEHLT STATT GERECHNET. Ein `import(`../${datei}`)` aus
 * einem berechneten Ausdruck ist fuer Vites Modulaufloesung kein statischer Bezug; die
 * Alternative waere ein Glob ueber den ganzen Baum. Die Vollzaehligkeitsklausel darunter
 * haelt die Tafel dafuer an die Aliastafel gekoppelt — wer einen Alias eintraegt und ihn hier
 * vergisst, wird rot.
 */
const LADEN: Record<
  string,
  () => Promise<{
    GET: (req: Request, ctx?: never) => Response | Promise<Response>;
  }>
> = {
  "/loan": () => import("../loan/route"),
  "/return": () => import("../return/route"),
  "/token-setup": () => import("../token-setup/route"),
  "/admin/login": () => import("../admin/login/route"),
  "/admin/devices": () => import("../admin/devices/route"),
  "/admin/devices/:id": () => import("../admin/devices/[id]/route"),
  "/admin/history": () => import("../admin/history/route"),
  "/admin/update": () => import("../admin/update/route"),
  "/admin/einstellungen": () => import("../admin/einstellungen/route"),
} as unknown as Record<
  string,
  () => Promise<{
    GET: (req: Request, ctx?: never) => Response | Promise<Response>;
  }>
>;

/** Der eine Beispielwert fuer den Platzhalter — dieselbe Form wie `/admin/geraete/g-1` in `routen.ts:58`. */
const BEISPIEL_ID = "g-1";

/**
 * ⛔ DIE NEUN ZIELE, HIER AUSGESCHRIEBEN — UND DAS IST NICHT DOPPELTE ARBEIT, SONDERN DIE
 * MESSUNG, DIE DIESE DATEI UEBERHAUPT ERST ZU EINER MESSUNG MACHT.
 *
 * ⛔ GEMESSEN AM 2026-08-28, SONDEN S1-S9: die erste Fassung dieser Datei speiste ihre
 * `it.each`-Erwartung aus `ALIAS_ROUTEN` — also aus DERSELBEN Tafel, aus der der Handler sein
 * Ziel liest. Neun Sonden, je ein Ziel in `_lib/aliasse.ts` auf ein ANDERES, ebenfalls
 * gueltiges Kartenziel getauscht, liefen alle neun `Tests 47 passed (47)`: **0 rot**. Der
 * Erwartungswert wanderte mit der Mutation mit. Ein Fall, der die Quelle gegen sich selbst
 * prueft, bewacht nichts — er sieht nur so aus.
 *
 * ⛔ DESHALB STEHT DIE SOLLTAFEL HIER UND UNABHAENGIG, und sie ist die eigentliche Zusicherung
 * dieser Aufgabe: welcher Alt-Pfad auf welchen Neu-Pfad zeigt, ist eine ENTSCHEIDUNG (die
 * Begruendung je Zeile steht in `_lib/aliasse.ts`), keine Ableitung. Hausform:
 * `admin/actions.test.ts:683-690` haelt `SOLL_ADMIN_SEITEN` genauso ausgeschrieben gegen die
 * gefundene Menge.
 *
 * ⚠️ Wer hier etwas aendert, aendert die Zusage — nicht den Test. Die Reihenfolge ist
 * mitgeprueft (`toEqual` ueber Paaren), damit auch eine Umsortierung der Tafel auffaellt.
 */
const SOLL: readonly (readonly [alt: string, ziel: string])[] = [
  ["/loan", "/ausleihen"],
  ["/return", "/rueckgabe"],
  ["/token-setup", "/"],
  ["/admin/login", "/admin"],
  ["/admin/devices", "/admin/geraete"],
  ["/admin/devices/:id", "/admin/geraete/:id"],
  ["/admin/history", "/admin/ausleihen"],
  ["/admin/update", "/admin/software"],
  ["/admin/einstellungen", "/admin/versionen"],
];

/**
 * Ein Alias-Handler, aufgerufen wie im Betrieb. `anhang` haengt einen Query-String an die
 * ANFRAGE — nicht an das erwartete Ziel: dass er im `Location` NICHT wieder auftaucht, ist
 * die Zusage des Falles „reicht den Query-String nicht weiter" (Fund W2).
 */
const ruf = async (
  alt: string,
  kopf: HeadersInit,
  anhang = "",
): Promise<Response> => {
  const mod = await LADEN[alt]!();
  const pfad = einsetzen(alt, BEISPIEL_ID);
  // Der dynamische Handler bekommt `params` als Promise — die Bauform des App Routers.
  const ctx = {
    params: Promise.resolve({ id: BEISPIEL_ID }),
  } as unknown as never;
  return await mod.GET(anfrage(`${pfad}${anhang}`, kopf), ctx);
};

describe("radio-Aliasse: die Tafel", () => {
  /*
   * ⛔ DIE VOLLZAEHLIGKEITSFAELLE STEHEN AUSSERHALB DER `it.each`-KOERPER, und das ist
   * dieselbe Lehre, die `_lib/routen.test.ts:47-64` GEMESSEN hat: ein Eintrag aus der Liste
   * geloescht, `it.each` bleibt gruen, nur die Fallzahl sinkt — und die liest niemand.
   */
  it("die Aliastafel ist vollzaehlig — NEUN Alias-Routen", () => {
    /*
     * Neun Handlerdateien fuer ELF Alt-Pfade: `/admin/devices` und `/admin/login` bedienen je
     * ZWEI Alt-Pfade — den des Kiosks (Bericht Tafel A) und den von `radio-admin`, der mit
     * C2 unter demselben Namen ankommt (Tafel B). Die Rechnung ueber alle zwanzig steht in
     * `.superpowers/sdd/adminlink/BERICHT-L4.md`.
     *
     * ⛔ `toBe`, nicht `toBeGreaterThanOrEqual`: `laenge >= 0` ist fuer jede Liste wahr und
     * haette keine Mutation, die ihn rot macht (`riegel.test.ts:100-110`).
     */
    expect(
      SOLL.length,
      "geschrumpfte Solltafel — die Faelle darunter waeren leer-gruen",
    ).toBe(9);
    expect(ALIAS_ROUTEN.length, "geschrumpfte Tafel").toBe(9);
  });

  it("die Tafel deckt sich Zeile fuer Zeile mit der Solltafel", () => {
    /*
     * ⛔ DER FALL, DEN DIE SONDEN S1-S9 ERZWUNGEN HABEN. `toEqual` ueber PAAREN und in der
     * Reihenfolge: er wird rot, sobald ein Ziel in `_lib/aliasse.ts` von der Entscheidung
     * abweicht — auch dann, wenn das neue Ziel selbst ein gueltiger Pfad der Routenkarte ist
     * und deshalb an jedem anderen Fall dieser Datei vorbeikaeme.
     */
    expect(ALIAS_ROUTEN.map((a) => [a.alt, a.ziel])).toEqual(
      SOLL.map((z) => [...z]),
    );
  });

  it("PFLEGEWAECHTER: die Ladetafel deckt sich mit der Solltafel", () => {
    /*
     * ⛔ EIN PFLEGEWAECHTER UND KEIN VERHALTENSFALL — so benannt, damit ihn niemand fuer eine
     * Zusicherung ueber die Aliasse haelt (Fix-Runde 1 zu L4, Fund S5). `LADEN` und `SOLL`
     * stehen BEIDE testseitig; KEINE Aenderung an `_lib/aliasse.ts` oder an einem der neun
     * Handler kann ihn rot faerben. Gemessen: Sonde A (Ziel in der Quelle getauscht) liess ihn
     * gruen.
     *
     * ⛔ ER BLEIBT TROTZDEM STEHEN, und das ist der Grund: `LADEN` ist aufgezaehlt statt
     * gerechnet (Kopf oben), also ist sie die eine Stelle, die beim Eintragen eines neuen
     * Alias vergessen werden kann. Ohne ihn liefe der neue Alias durch `ruf` in ein
     * `undefined`-Objekt, und die Meldung zeigte auf die falsche Zeile. Was das VERHALTEN
     * bewacht, sind die vier `it.each` unten.
     */
    expect(Object.keys(LADEN).sort()).toEqual(SOLL.map(([alt]) => alt).sort());
  });

  it("kein Alt-Pfad kommt doppelt vor", () => {
    const alt = ALIAS_ROUTEN.map((a) => a.alt);
    expect(
      new Set(alt).size,
      "zwei Eintraege auf denselben Alt-Pfad — einer waere tot",
    ).toBe(alt.length);
  });

  it("jedes Ziel ist ein Pfad der Routenkarte", () => {
    /*
     * ⛔ DER TRAGENDE FALL DIESER DATEI, und er ist der Kopplungsfall aus `_lib/nav.test.ts`
     * auf die Aliasse angewandt: ein Alias, der auf einen Pfad zeigt, den es nicht gibt, ist
     * eine Weiterleitung in eine 404 — schlechter als gar keine, weil sie wie eine Reparatur
     * aussieht. Die Karte ist `_lib/routen.ts`, nicht eine zweite Abschrift.
     */
    const karte = new Set([...AUSLEIH_PFADE, ...VERWALTUNGS_PFADE]);
    const fehlend = ALIAS_ROUTEN.map((a) =>
      einsetzen(a.ziel, BEISPIEL_ID),
    ).filter((z) => !karte.has(z));
    expect(
      fehlend,
      "Alias-Ziel steht in keiner der zwei Pfadlisten von _lib/routen.ts",
    ).toEqual([]);
  });

  it("kein Alt-Pfad ist selbst ein Pfad der Routenkarte", () => {
    /*
     * ⛔ DIE GEGENRICHTUNG, und sie ist kein Beiwerk: ein Alias auf einem Pfad, den das Modul
     * SELBST bedient, verdeckte die echte Flaeche. `/ausleihen` als Alt-Pfad eingetragen
     * schickte die Ausleihe in eine Weiterleitung auf sich selbst.
     */
    const karte = new Set([...AUSLEIH_PFADE, ...VERWALTUNGS_PFADE]);
    const kollision = ALIAS_ROUTEN.map((a) =>
      einsetzen(a.alt, BEISPIEL_ID),
    ).filter((p) => karte.has(p));
    expect(
      kollision,
      "ein Alt-Pfad verdeckt eine echte Flaeche des Moduls",
    ).toEqual([]);
  });

  it("kein Alias zeigt auf einen anderen Alias", () => {
    const alt = new Set(ALIAS_ROUTEN.map((a) => a.alt));
    expect(
      ALIAS_ROUTEN.filter((a) => alt.has(a.ziel)).map((a) => a.alt),
    ).toEqual([]);
  });

  it("Datei und Tafel decken sich in BEIDE Richtungen", () => {
    /*
     * ⛔ EIN `toEqual` UEBER ZWEI SORTIERTE MENGEN FAENGT BEIDE AUSFAELLE: einen Tafeleintrag
     * ohne Datei (die Weiterleitung existiert nicht, der Alt-Pfad bleibt 404) UND eine
     * Aliasdatei ohne Tafeleintrag (eine Weiterleitung, die kein Fall dieser Datei prueft).
     *
     * ⛔ DIE ZUSICHERUNG UEBER `NICHT_ALIAS` DAVOR IST NICHT WEGZULASSEN: veraenderte sich
     * einer der fuenf Bestandshandler im Namen, verschwaende er aus der Abziehung und
     * erschiene als „Aliasdatei ohne Eintrag" — die Meldung zeigte dann auf die falsche Datei.
     */
    const gefunden = alleHandler();
    for (const pflicht of NICHT_ALIAS) {
      expect(
        gefunden,
        `${pflicht} nicht im Baum — die Abziehung darunter bewachte etwas anderes`,
      ).toContain(pflicht);
    }
    const aliasDateien = gefunden
      .filter((d) => !NICHT_ALIAS.includes(d))
      .sort();
    expect(aliasDateien).toEqual(SOLL.map(([alt]) => handlerDatei(alt)).sort());
  });

  it("einsetzen ersetzt genau den einen Platzhalter, url-kodiert", () => {
    expect(PLATZHALTER).toBe(":id");
    expect(einsetzen("/admin/devices/:id", "g-1")).toBe("/admin/devices/g-1");
    expect(
      einsetzen("/loan", "g-1"),
      "ein Pfad ohne Platzhalter bleibt unberuehrt",
    ).toBe("/loan");
    /*
     * ⛔ Die Kodierung ist kein Schmuck: der Wert kommt aus der URL und landet in einem
     * `Location`-Kopf, wo keine React-Entkommung schuetzt — dieselbe Begruendung wie fuer den
     * geschlossenen Satz in `_lib/gateTexte.ts:44-54`.
     */
    expect(einsetzen("/admin/devices/:id", "a b")).toBe("/admin/devices/a%20b");
    expect(einsetzen("/admin/devices/:id", "a\r\nX: y")).not.toMatch(/[\r\n]/);
  });

  it("handlerDatei leitet den Dateipfad aus dem Alt-Pfad ab", () => {
    expect(handlerDatei("/loan")).toBe("loan/route.ts");
    expect(handlerDatei("/admin/devices/:id")).toBe(
      "admin/devices/[id]/route.ts",
    );
  });
});

describe("radio-Aliasse: die Antwortform", () => {
  it("aliasAntwort antwortet 303 mit relativem Location", () => {
    const antwort = aliasAntwort("/ausleihen");
    expect(antwort.status).toBe(303);
    expect(antwort.headers.get("location")).toBe("/ausleihen");
  });

  it("die Quelle traegt keine Umleitung, die nicht 303 ist", () => {
    /*
     * ⛔ DIE ZWEITE HAELFTE IST DIE TRAGENDE — uebernommen aus `_lib/bauform.test.ts:672-696`.
     * `30(?!3)\d` deckt jede 3xx-Umleitung ausser 303 ab, auch die PERMANENTEN 301 und 308.
     * Und genau die sind hier der teure Fehler: `.env.example:607-608` schreibt fuer denselben
     * Umzug aus („permanent=false → 302, nie 301"), weil ein permanenter Redirect im Cache
     * jedes Telefons liegt und den Rollback unmoeglich macht. Ein Alias ist eine
     * Uebergangsbruecke; sie darf sich nicht in den Geraeten festsetzen.
     *
     * ⚠️ WARUM DIE NEUN HANDLER NICHT IN `ROUTE_HANDLER` VON `_lib/bauform.test.ts:48` STEHEN:
     * jener Fall prueft `toMatch(/status:\s*303\b/)` im Quelltext JEDER gelisteten Datei. Die
     * neun bauen ihre Antwort aber nicht selbst, sondern rufen `aliasAntwort` — neun Kopien
     * derselben drei Zeilen waeren genau der Zustand, gegen den `_lib/hostRiegel.ts:27-32`
     * argumentiert. Der Scan zielt deshalb auf die EINE Datei, in der die Zahl steht, und der
     * Verhaltensfall unten misst sie an allen neun.
     */
    const q = readFileSync(join(MODUL, "_lib/aliasse.ts"), "utf8");
    expect(q, "die Alias-Antwort ist nicht 303").toMatch(/status:\s*303\b/);
    expect(
      q,
      "eine Umleitung, die nicht 303 ist — 301/308 waeren unwiderruflich",
    ).not.toMatch(/status:\s*30(?!3)\d\b/);
  });
});

describe("radio-Aliasse: die Middleware schreibt jeden Alt-Pfad ins Modul um", () => {
  /*
   * ⚠️ DIESE HAELFTE BEANTWORTET DIE FRAGE, DIE DER MESSBERICHT OFFEN LAESST (§1.4 Tafel B):
   * `/admin/devices` und die drei anderen `admin/`-Aliasse sind KEIN Passthrough — `/login`
   * steht in `PASSTHROUGH` (`src/core/routing.ts:12`), `/admin/login` beginnt aber nicht mit
   * `/login` und wird umgeschrieben. Ohne diesen Fall waere der Handler darunter eine Datei,
   * die nie erreicht wird.
   */
  it.each(SOLL.map(([alt]) => einsetzen(alt, BEISPIEL_ID)))(
    "Alt-Pfad %s",
    (pfad) => {
      expect(decideRoute({ host: HOST, pathname: pfad, groups: null })).toEqual(
        {
          action: "rewrite",
          target: `/m/radio${pfad}`,
          moduleKey: "radio",
        },
      );
    },
  );
});

describe("radio-Aliasse: jeder Handler leitet auf seinen Zielort", () => {
  it.each(
    SOLL.map(([alt, ziel]) => [alt, einsetzen(ziel, BEISPIEL_ID)] as const),
  )("%s leitet auf %s", async (alt, ziel) => {
    const antwort = await ruf(alt, RADIO_HOST);
    expect(antwort.status).toBe(303);
    expect(antwort.headers.get("location")).toBe(ziel);
  });

  it.each(SOLL.map(([alt]) => alt))(
    "%s antwortet relativ, nie absolut",
    async (alt) => {
      /*
       * ⛔ Spec:2284-2296 und `_lib/bauform.test.ts:618-670`: eine ABSOLUTE URL waere hier aus
       * `req.url` gebaut, und `req.url` traegt nach dem Modul-Host-Rewrite den INNEREN Pfad
       * `/m/radio/…`. Der Browser landete auf einer Adresse, die er nie gesehen hat — und bei
       * `radio` gibt es kein Parallelfenster, der einzige Rueckweg ist „Router zurueck".
       *
       * ⛔ DIESER FALL MISST DEN KOPF, NICHT DEN QUELLTEXT. Der Scan in `bauform.test.ts` kann
       * die Form nur dort sehen, wo sie geschrieben steht; hier steht der Wert.
       */
      const loc = (await ruf(alt, RADIO_HOST)).headers.get("location");
      expect(
        loc,
        "ohne Location waere die Verneinung darunter leer-gruen",
      ).not.toBeNull();
      expect(loc!.startsWith("/"), `Location ist nicht relativ: ${loc}`).toBe(
        true,
      );
      expect(
        loc!,
        "protokoll-relative Form — der Browser laesse den Host fallen",
      ).not.toMatch(/^\/\//);
    },
  );

  it.each(
    SOLL.map(([alt, ziel]) => [alt, einsetzen(ziel, BEISPIEL_ID)] as const),
  )("%s reicht den Query-String NICHT weiter", async (alt, ziel) => {
    /*
     * ⛔ DER FALL, DER EINE UNENTSCHIEDENE STELLE ZU EINER ENTSCHIEDENEN MACHT (Fix-Runde 1
     * zu L4, Fund W2). Bis hierher fiel der Query weg, WEIL `aliasAntwort` `req.url` nicht
     * liest — nicht, weil es so beschlossen war. Ein Nachfolger haette
     * `new URL(req.url).search` angehaengt, und NICHTS waere rot geworden.
     *
     * ⛔ DIE ENTSCHEIDUNG UND IHR GRUND STEHEN IN `_lib/aliasse.ts` bei `aliasAntwort`, kurz:
     * bei `/devices` sind `q` und `status` zeichengleich mit den Suite-Parametern,
     * `location` und `updateStatus` aber nicht (`lagerort`, `updateStand`). Ein
     * durchgereichter Query wendete einen TEIL der Kriterien an und liesse den Rest still
     * fallen — die Liste zeigte mehr Zeilen als das Lesezeichen versprach und saehe dabei
     * gefiltert aus. Ein fallengelassener Query liefert eine sichtbar UNgefilterte Liste.
     *
     * ⚠️ DIE ANGEHAENGTEN NAMEN SIND DIE ECHTEN DREI aus den Alt-Anwendungen, nicht `?x=1`:
     * `deviceIds` (`loan.tsx:12-14`), `q`/`status`/`location` (`DevicesPage.tsx:13-21`) und
     * `from` (`admin/history.tsx:25-31`). Ein erfundener Name kaeme auch dann durch, wenn
     * ein Nachfolger nur die BEKANNTEN Parameter durchreichte.
     */
    const antwort = await ruf(
      alt,
      RADIO_HOST,
      "?deviceIds=g-1&q=tetra&status=IN_USE&location=Halle&from=2026-01-01",
    );
    expect(antwort.status).toBe(303);
    const loc = antwort.headers.get("location");
    expect(loc, `der Query-String wurde weitergereicht: ${loc}`).toBe(ziel);
    expect(
      loc!,
      "ein Fragezeichen im Location — der Query ist mitgewandert",
    ).not.toMatch(/\?/);
  });

  it.each(SOLL.map(([alt]) => alt))(
    "%s antwortet auf fremdem Host mit 404",
    async (alt) => {
      /*
       * ⛔ Falle 61 (`_lib/host.ts:7-20`): `decideRoute` gatet einen internen Pfad `/m/<key>/…`
       * NACH DEM MODUL AUS DEM SEGMENT, ohne jeden Hostbezug. Jeder Host, der auf den
       * Suite-Container terminiert, antwortet damit auf `/m/radio/*` — ein Alias ohne
       * Host-Riegel waere eine zweite, in keinem Runbook stehende Herkunft, die in die
       * Ausleihe zeigt.
       */
      const antwort = await ruf(alt, FREMDER_HOST);
      expect(antwort.status).toBe(404);
      expect(
        antwort.headers.get("location"),
        "auf fremdem Host wurde trotzdem umgeleitet",
      ).toBeNull();
    },
  );
});
