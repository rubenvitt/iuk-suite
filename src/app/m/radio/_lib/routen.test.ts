import { describe, it, expect } from "vitest";
import { decideRoute } from "@/core/routing";

/**
 * DIE `PASSTHROUGH`-PRUEFUNG ALS TEST, NICHT ALS ABSATZ (Spec 1 §1.2.3, Zeilen 345-365,
 * Testauftrag Spec:715). Ohne Vorbild im Repo — neu.
 *
 * WAS SIE FAENGT: eine spaetere Pfad-Umbenennung, die in die Passthrough-Liste faellt.
 * `core/routing.ts:12` fuehrt PASSTHROUGH = ["/api/auth", "/api/health", "/login",
 * "/_next", "/favicon.ico", "/.well-known"], geprueft als `pathname === p ||
 * pathname.startsWith(p + "/")` (`:50-52`). Ein Treffer ergibt `next` — der Pfad erreicht
 * das Modul NIE, auf keinem Host, und zwar OHNE Fehlermeldung.
 *
 * ⚠️ SIE PRUEFT DIE MIDDLEWARE-ENTSCHEIDUNG, NICHT DIE EXISTENZ EINER DATEI. Die meisten
 * Pfade unten haben heute keine Datei; sie entstehen in Planteil 3 (Gate, Ausleihe),
 * Planteil 4 (die zehn Verwaltungspfade, der Export-Handler) und Planteil 5 (`/sw.js`).
 * Ein Rewrite auf einen Pfad ohne Datei ist eine saubere 404 — das ist der erwartete
 * Zustand und kein Mangel.
 *
 * ⚠️ DIE RUECKGABE HAT DREI FELDER, NICHT ZWEI. `core/routing.ts:79` liefert
 * `{ action, target, moduleKey }`. Spec:715 beschreibt die Zusicherung verkuerzt als
 * `{ action: "rewrite", target: "/m/radio…" }` — ein `toEqual` auf DIESE Form waere rot.
 * Hier steht deshalb das vollstaendige Dreifeld-Literal: es ist die staerkere Aussage
 * (ein falscher `moduleKey` faellt mit auf) und die einzige, die gruen werden kann.
 */
const HOST = "radio.localtest.me";
const fahre = (pathname: string) => decideRoute({ host: HOST, pathname, groups: null });

/** `rest` ist bei `/` der LEERE String (routing.ts:78) — das Ziel ist `/m/radio`, nicht `/m/radio/`. */
const ziel = (pfad: string) => `/m/radio${pfad === "/" ? "" : pfad}`;

/** Der Ausleih-Zweig, Spec 1.2.1 (Zeilen 275-284). */
const AUSLEIHE = ["/", "/t/ABC123", "/abmelden", "/geraete", "/ausleihen", "/rueckgabe"];

/**
 * Der Verwaltungszweig: die ZEHN Seiten aus Spec 1.2.2 (Zeilen 301-314) plus den EINEN
 * Route Handler. ⚠️ Der Handler steht NICHT in 301-314 — er steht in Spec:563 (§1.4.3)
 * und wird erst durch B9 (Spec:98) mitgezaehlt: „Gezaehlt wird jetzt einheitlich: zehn
 * Seiten-Pfade plus ein Route Handler."
 */
const VERWALTUNG = [
  "/admin",
  "/admin/geraete",
  "/admin/geraete/g-1",
  "/admin/geraete/g-1/ereignisse",
  "/admin/ausleihen",
  "/admin/import",
  "/admin/software",
  "/admin/versionen",
  "/admin/zugaenge",
  "/admin/zugaenge/blatt",
  "/admin/geraete/export",
];

describe("radio: jeder aeussere Pfad wird ins Modul umgeschrieben", () => {
  /*
   * ⛔ DIE ZWEI VOLLZAEHLIGKEITS-FAELLE STEHEN AUSSERHALB DER `it.each`-KOERPER, UND
   * DAS IST DER GANZE PUNKT. `it.each` bewacht nur, was in der Liste steht: wer einen
   * Eintrag loescht, verliert seinen Prueffall LAUTLOS — die Datei bleibt gruen, nur
   * die Fallzahl sinkt, und die liest niemand. Gemessen am 2026-08-22 an dieser Datei:
   * `"/t/ABC123"` aus AUSLEIHE entfernt -> `Tests 24 passed (24)`, gruen (und das ist
   * der Pfad, den ein GEDRUCKTER QR-Code traegt); `const VERWALTUNG: string[] = []`
   * -> `Tests 14 passed (14)`, gruen und ohne jede Warnung, weil `it.each([])` in
   * vitest 4.1.10 still NULL Faelle erzeugt.
   *
   * ⛔ Eine Zusicherung IM `it.each`-Koerper faenge den zweiten Fall nie: ueber der
   * leeren Liste liefe sie kein einziges Mal. Wer diese zwei Faelle spaeter „hinein
   * vereinfacht", stellt genau die Luecke wieder her.
   *
   * ⛔ Und sie stehen als ZWEI Faelle, nicht als zwei Zeilen in einem: ein geworfenes
   * `expect` beendet seinen Fall, die zweite Zeile liefe nie — eine Sonde auf AUSLEIHE
   * liesse die VERWALTUNG-Zusicherung unbewiesen (die „0 rot"-Form).
   */
  it("die Ausleihliste ist vollzaehlig — sechs aeussere Pfade", () => {
    /*
     * Sechs, Spec:275-284 (Tabelle 1.2.1): `/`, `/t/<code>`, `/abmelden`, `/geraete`,
     * `/ausleihen`, `/rueckgabe`. Die zwei uebrigen Tabellenzeilen (`layout.tsx` und
     * `(ausleihe)/layout.tsx`) tragen keinen aeusseren Pfad.
     *
     * ⛔ `toBe` und NICHT `toBeGreaterThanOrEqual`. Das Vorbild
     * `src/app/m/lagerbuch/_lib/bauform.test.ts:1188` benutzt `>=`, weil seine Menge aus
     * `readdirSync` entsteht und mit dem Baum WAECHST — die Untergrenze schuetzt dort nur
     * gegen die leere Menge. Diese Liste ist dagegen vollstaendig und stabil; `>=` waere
     * hier genau die NT11-Form („ein Waechter, der `>= 5` statt `= 6` prueft, bleibt
     * gruen und bewacht nichts").
     */
    expect(AUSLEIHE.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(6);
  });

  it("die Verwaltungsliste ist vollzaehlig — zehn Seiten plus EIN Route Handler", () => {
    /*
     * Elf, gezaehlt nach B9 (Spec:98, woertlich: „Gezaehlt wird jetzt einheitlich: zehn
     * Seiten-Pfade plus ein Route Handler"). Die zehn Seiten stehen in Tabelle 1.2.2
     * (Spec:303-314; `:303` und `:313` sind die zwei Layouts ohne aeusseren Pfad), der
     * Route Handler in Spec:563.
     *
     * ⛔ Die Zahl ist NICHT aus Spec:353 genommen. Dort steht „`/admin` und alle acht
     * Unterpfade — frei.", und das ist einer zu wenig: Tabelle 1.2.2 fuehrt `/admin`
     * plus NEUN Unterpfade (ausgezaehlt am 2026-08-22). Kapitel B sticht ueber jeden
     * Kapiteltext, der ihm widerspricht — und hier ist der Kapiteltext nachweislich
     * verzaehlt.
     */
    expect(VERWALTUNG.length, "geschrumpfte Liste — der Riegel waere leer-gruen").toBe(11);
  });

  it.each(AUSLEIHE)("Ausleihe: %s", (pfad) => {
    expect(fahre(pfad)).toEqual({ action: "rewrite", target: ziel(pfad), moduleKey: "radio" });
  });

  it.each(VERWALTUNG)("Verwaltung: %s", (pfad) => {
    /*
     * ⚠️ `/admin/versionen` UND NICHT `/admin/einstellungen` — entschieden in B9
     * (Spec:98, Kapiteltext Spec:326-331): die Alt-Seite ist eine Tab-Leiste mit genau
     * zwei Reitern, der zweite („API-Zugriff") faellt mit Entscheidung 13, und ein
     * Reiterpaar mit einer Haelfte ist keine Reiterleiste.
     *
     * ⚠️ `/admin/kein-zugriff` steht NICHT in der Liste, und /403 auch nicht. Der
     * Verwaltungsriegel antwortet mit `notFound()`, nicht mit 403 (Spec:691-694, §1.5) —
     * was nicht freigegeben ist, sieht in dieser Suite aus wie etwas, das es nicht gibt.
     */
    expect(fahre(pfad)).toEqual({ action: "rewrite", target: ziel(pfad), moduleKey: "radio" });
  });

  it("/sw.js — Root-Scope trotz Modulpfad", () => {
    /*
     * Spec:715 verlangt `/sw.js` AUSDRUECKLICH in dieser Liste (Kapitel 7 §7.1.4). Der
     * Alt-Kiosk registriert seinen Service Worker mit `scope: '/'`
     * (radio-inventar/apps/frontend/src/hooks/usePWA.ts:73 — gemessen am 2026-08-22; der
     * Plan nannte `:72-73`, `:72` ist die `if`-Zeile darueber, Vorabscan-Fund F15); der
     * Abraeum-Worker der Suite muss denselben Pfad bedienen, sonst erreicht er die bereits
     * installierten Kopien nicht. Der Handler entsteht in Planteil 5; die WEGENTSCHEIDUNG
     * faellt hier.
     */
    expect(fahre("/sw.js")).toEqual({ action: "rewrite", target: "/m/radio/sw.js", moduleKey: "radio" });
  });

  it("/admin/login ergibt einen Rewrite und danach 404 — hingenommen, mit Runbook-Zeile", () => {
    /*
     * Spec:399-405: der Alt-Verwaltungshost `radio-admin.iuk-ue.de` bekommt einen
     * pfaderhaltenden Traefik-`redirectRegex`. Ein Lesezeichen auf
     * `radio-admin.iuk-ue.de/login` wird damit zu `radio.iuk-ue.de/admin/login` — und das
     * ist KEIN Passthrough, weil `/admin/login` nicht mit `/login` beginnt. Es wird also
     * ins Modul umgeschrieben und ergibt 404.
     *
     * Dieser Fall haelt die Kette fest, damit niemand spaeter aus dem 404 auf einen
     * Routing-Fehler schliesst. Die Abhilfe ist eine Runbook-Zeile, KEIN Code im Repo.
     */
    expect(fahre("/admin/login")).toEqual({
      action: "rewrite", target: "/m/radio/admin/login", moduleKey: "radio",
    });
  });
});

describe("radio: die Passthrough-Pfade erreichen das Modul NIE", () => {
  it("/login — deshalb gibt es kein radio/login/page.tsx, und es kann keines geben", () => {
    /*
     * Spec:354-358. Der Verwaltungsriegel leitet auf die SUITE-Anmeldung um:
     * `redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`)`.
     * Wer hier eine modul-eigene Anmeldeseite vorsieht, baut eine Datei, die nie
     * gerendert wird — typkorrekt, lint-sauber, still.
     */
    expect(fahre("/login")).toEqual({ action: "next" });
    expect(fahre("/login/irgendwas")).toEqual({ action: "next" });
  });

  it("/api/health/radio — den beantwortet core, nicht das Modul", () => {
    // Spec:359-360: es entsteht KEIN src/app/m/radio/api/health/…
    expect(fahre("/api/health/radio")).toEqual({ action: "next" });
  });

  it("/api/auth/*, /_next/*, /favicon.ico, /.well-known/* — kein Modulpfad traegt diese Namen", () => {
    expect(fahre("/api/auth/session")).toEqual({ action: "next" });
    expect(fahre("/_next/static/chunk.js")).toEqual({ action: "next" });
    expect(fahre("/favicon.ico")).toEqual({ action: "next" });
    expect(fahre("/.well-known/openid-configuration")).toEqual({ action: "next" });
  });

  it("aber JEDER andere Pfad unter /api/* landet im Modul", () => {
    /*
     * Spec:363-365. Route Handler unter `src/app/m/radio/api/…` funktionieren also —
     * solange sie nicht `api/auth/**` oder `api/health/**` heissen. ⛔ Kapitel 1 legt
     * keinen an; diese Zeile ist die ZUSAGE nach hinten, kein Bauauftrag.
     */
    expect(fahre("/api/irgendwas")).toEqual({
      action: "rewrite", target: "/m/radio/api/irgendwas", moduleKey: "radio",
    });
  });
});

describe("radio: die Luecke, gegen die _lib/host.ts gebaut ist (Falle 61)", () => {
  it("ein FREMDER Suite-Host darf /m/radio passieren — die Middleware haelt ihn NICHT auf", () => {
    /*
     * ⚠️ DIESER FALL SICHERT KEINE EIGENSCHAFT ZU, DIE MAN WILL — er haelt die LUECKE
     * fest, die den Host-Riegel ueberhaupt noetig macht (Spec:460-471, Falle 61 der
     * lagerbuch-Zaehlung).
     *
     * `decideRoute` gatet einen internen Pfad `/m/<key>/...` NACH DEM MODUL AUS DEM
     * SEGMENT, ohne jeden Hostbezug (routing.ts:58-66), und `canAccess` steigt fuer ein
     * Modul ohne Auth-Pflicht sofort mit `true` aus (registry.ts:260 — gemessen am
     * 2026-08-22 an `if (!mod.requiresAuth) return true;`; Spec:462 und der Plan nennen
     * `:239`, das war der Stand VOR der radio-Zeile aus Z1). JEDER Host, der auf den
     * Suite-Container terminiert, antwortet damit auf /m/radio/*.
     *
     * ⚠️ Kein Gate faengt das: `src/core/routing.test.ts:62-65` schreibt dieses Verhalten
     * ausdruecklich FEST, und Playwright faehrt gegen genau EINEN baseURL — ein zweiter
     * Host existiert im Lauf nicht (Spec:717). Deshalb steht die Absicherung in
     * `_lib/host.test.ts` und `riegel.test.ts` und nirgends sonst.
     *
     * Wird dieser Fall eines Tages rot, ist das KEIN Fehler dieses Moduls, sondern eine
     * Aenderung an `core/routing.ts` — und dann gehoert der Host-Riegel neu bewertet.
     */
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/m/radio", groups: null }))
      .toEqual({ action: "next" });
    expect(decideRoute({ host: "iuk-ue.de", pathname: "/m/radio/admin", groups: null }))
      .toEqual({ action: "next" });
  });

  it("und /m/radio/admin ist von /m/radio nicht zu unterscheiden — Falle 22", () => {
    /*
     * docs/radio-portierung-analyse.md:1542-1545, woertlich: „eine vergessene Riegelzeile
     * in einer Action ist typkorrekt und lint-sauber; `iuk-suite/src/core/routing.ts:58-66`
     * gatet nach dem Modul aus dem Segment und unterscheidet /m/radio/ und
     * /m/radio/admin/... NICHT."
     *
     * Mit `requiresAuth: false` hat `/admin` damit NULL Middleware-Gating. Der einzige
     * Traeger ist `requireRadioAdmin` (Z4) und der Scan in `riegel.test.ts` (Z5).
     *
     * ⚠️ IN DER ZUSICHERUNG SUBSUMIERT VON FALL 1 — gehalten wegen des HOSTUNTERSCHIEDS.
     * Fall 1 prueft `/m/radio/admin` unter dem FREMDEN Host `iuk-ue.de`, dieser Fall
     * denselben Pfadast unter dem RICHTIGEN (`HOST`). Jede Mutation, die diesen Fall rot
     * macht, macht Fall 1 mit rot; eine Mutation, die nur diesen trifft, gibt es nicht.
     * Das ist NICHT die NT11-Form (der Fall hat Mutationen, nur keine eigene) — wer ihn
     * dennoch fuer einen eigenstaendigen Riegel haelt, liest ihn falsch.
     */
    const anonym = decideRoute({ host: HOST, pathname: "/m/radio/admin/zugaenge", groups: null });
    // EINE Behauptung, nicht zwei: `toEqual({ action: "next" })` schliesst
    // `{ action: "login", callbackUrl: "/m/radio/admin/zugaenge" }` bereits aus. Ein
    // zusaetzliches `not.toEqual` darauf haette keine eigene Mutation — es kann nur rot
    // werden, wenn die Zeile darueber schon rot ist, und ein Prueffall ohne eigene
    // Mutation ist ein Prueffall, der nichts bewacht.
    expect(anonym).toEqual({ action: "next" });
  });
});
