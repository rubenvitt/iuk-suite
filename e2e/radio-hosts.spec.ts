import { existsSync } from "node:fs";
import { test, expect, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { devLogin } from "./fixtures";
import {
  E2E_CODE_AKTIV,
  FREMDER_HOST,
  RADIO_ADMIN_GRUPPE,
  RADIO_HOST,
  fremdUrl,
  radioUrl,
} from "./helpers/radio";

/**
 * FALLE 61 IN RADIO-FORM — UND SIE HAT HIER EINE DATENWIRKUNG (Aufgabe T4, Planteil 5).
 *
 * `decideRoute` gatet interne `/m/<key>`-Pfade nach dem MODUL AUS DEM SEGMENT, nicht nach dem
 * Host (`src/core/routing.ts:68-77`, Datei 90 Zeilen): `const target = findModule(internal[1])`,
 * dann `if (!canAccess(target, groups)) return { action: "forbidden" }` — und `canAccess` steigt
 * fuer ein Modul mit `requiresAuth: false` SOFORT mit `true` aus (`src/core/registry.ts:260-270`,
 * Datei 285 Zeilen; die fruehe Rueckkehr ist `:265` = `if (!mod.requiresAuth) return true;`).
 * `radio` traegt `requiresAuth: false` (Entscheidung 4, `src/core/registry.ts:197-199`).
 *
 * ⛔ FOLGE: JEDER Suite-Host, der auf den Container terminiert, beantwortet `/m/radio/*`, WENN
 * das Modul seinen eigenen Riegel nicht traegt (Spec:6584-6588). Bei `radio` ist das keine
 * Sichtwirkung, sondern eine DATENWIRKUNG: `/m/radio/t/<code>` praegt eine Ausleih-Sitzung und
 * schreibt `zugangscodes.last_used_at` (`_lib/schreibpfade/codeEinloesung.ts:70`, Datei 77
 * Zeilen). Der Bestand schreibt denselben Befund aus: `src/app/m/radio/_lib/host.ts:10-20`
 * (Datei 146 Zeilen) und `t/[code]/route.ts:71-78` (Datei 178 Zeilen).
 *
 * ⛔ KEIN GATE SIEHT DAS: `src/core/routing.test.ts` prueft AUSDRUECKLICH, dass interne Pfade
 * nach dem Segment gegatet werden — das Verhalten ist nicht bloss ungetestet, es ist
 * FESTGESCHRIEBEN. `typecheck`, `lint` und `pnpm build` sehen nichts, und Playwright faehrt
 * sonst gegen genau EINEN `baseURL`.
 *
 * ⛔ EINE SCHLEIFE, KEINE ZWEI STICHPROBEN (§8.4.3). Route Handler haben KEIN Layout, und die
 * Sperre erreicht sie ueber kein Group-Layout (`_lib/host.ts:75-112` listet jede Aufrufstelle
 * namentlich). Vor dieser Datei war genau EIN Pfad bei echtem Abruf geprueft
 * (`/m/radio/admin`, `e2e/radio-verwaltung.spec.ts`, Fall 8) — die uebrigen fehlten.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ E-G8 — WARUM FUENF EINSTIEGE, UND WELCHE ZWEI NICHT IN DER SCHLEIFE STEHEN
 * ────────────────────────────────────────────────────────────────────────────
 * §8.4.3 nennt fuenf Pfade: Ausleihe-Wurzel, Einloese-Route mit gueltigem Code,
 * Abmelde-Handler, `/m/radio/admin`, Manifest-/Icon-Handler. ZWEI davon lassen sich nicht als
 * Listeneintrag bauen, und beide Gruende sind gemessen:
 *
 *   1. ⛔ `/m/radio/t/<code>` STEHT NICHT IN `EINSTIEGE`. Der Eigen-Host-Arm der Schleife
 *      wuerde den Code WIRKLICH einloesen (`codeEinloesung.ts:70`) und damit die Vorbedingung
 *      des Falls zerstoeren, der die DATENWIRKUNG prueft. Das Vorbild macht es genau so und
 *      schreibt den Grund aus (`e2e/lagerbuch-hosts.spec.ts:87-89`, Datei 273 Zeilen).
 *   2. ⛔ ES GIBT KEINEN MANIFEST- ODER ICON-HANDLER. `radio` baut ausdruecklich keine PWA
 *      (Spec:5511-5513). Ein Abruf darauf pruefte „die Abwesenheit von etwas, das kategorisch
 *      nicht entstehen kann: immer gruen, und liest sich als Zusage" (Spec 2, V8/R36). ⛔ Der
 *      Slot wird NICHT ersatzlos gestrichen — er geht an `/m/radio/sw.js`, den einen Route
 *      Handler, den `radio` in dieser Klasse hat. Die Abwesenheit des Manifests beweist G6 im
 *      Repo (`src/app/m/radio/_lib/keine-pwa.test.ts`), nicht ein immer gruener Abruf.
 *
 * ⛔ `/m/radio/admin/import/hochladen` STEHT EBENFALLS NICHT IN DER LISTE, UND DAS IST EINE
 * LUECKE, DIE HIER STEHT STATT VERSCHWIEGEN ZU WERDEN. Gemessen exportiert die Datei nur
 * `POST` (`src/app/m/radio/admin/(arbeit)/import/hochladen/route.ts:81`); Next beantwortet ein
 * `GET` dorthin mit 405, BEVOR der Handler laeuft — der Host-Riegel kaeme auf dem fremden Host
 * nie zum Zug, und der Fall waere rot aus einem Grund, der nichts mit dem Riegel zu tun hat.
 * ⚠️ Der Host-Riegel dieses EINEN Handlers hat damit keinen e2e-Wirknachweis. Sein
 * Quelltext-Nachweis laeuft (`src/app/m/radio/riegel.test.ts`, Klausel (c)). Wer ihn
 * nachtraegt, traegt ihn nach; wer ihn wegdefiniert, nicht.
 *
 * ⛔ DIE KLAMMERZUSAETZE DER `EINSTIEGE`-TAFEL SIND ERWARTUNGEN, KEINE `toBe`-ZUSICHERUNGEN.
 * Die Schleife prueft je Eintrag genau `not.toBe(404)` — MIT folgenden Umleitungen, wie im
 * Vorbild (`e2e/lagerbuch-hosts.spec.ts:141-178`, `page.request.get` ohne `maxRedirects`). Ein
 * `toBe(303)` fuer `/m/radio/abmelden` stuende hier NICHT; wer es einbaute, pruefte die
 * Umleitung an einer Stelle, an der sie nicht die Zusage ist. Der 303 und sein `Set-Cookie`
 * sind die Zusage von T2 (`e2e/radio-kiosk.spec.ts`), und dort gilt Bauform 27
 * (`maxRedirects: 0`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ E-G9a — ES GIBT KEINE `e2e/radio-sw.spec.ts`, UND DAS IST KEIN VERSEHEN
 * ────────────────────────────────────────────────────────────────────────────
 * Spec:5765-5766 woertlich: „Ein e2e-Fall `e2e/radio-sw.spec.ts` mit dem Namen
 * `GET /sw.js liefert den Abraeum-Worker` ist sinnvoll, sobald der Zwei-Host-Aufbau des Moduls
 * steht … dieses Kapitel verlangt dort GENAU EINEN Fall." Bestaetigt in Spec:6354: „genau ein
 * e2e-Fall fuer `/sw.js`, der die ANTWORT prueft."
 *
 * Die Zusage ist „genau EIN Fall, der die Antwort prueft" — nicht „eine eigene Datei". Der Fall
 * steht hier, weil er hier billig ist: `fremdUrl`/`radioUrl` und der Login mit
 * `RADIO_ADMIN_GRUPPE` stehen bereits, und `/sw.js` braucht BEIDE Hosts — 404 auf dem fremden
 * (Schleifeneintrag 5) und 200 auf dem eigenen (der Worker-Fall unten). ⛔ „Genau einer" ist
 * eingehalten: der Worker-Fall ist der EINZIGE Fall, der die ANTWORT von `/sw.js` prueft; der
 * Schleifeneintrag prueft die ABWESENHEIT auf dem fremden Host — das ist die Riegelzusage,
 * nicht die Worker-Zusage.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ WARUM `feedback.localtest.me` DER FREMDE HOST IST
 * ────────────────────────────────────────────────────────────────────────────
 * `FREMDER_HOST` ist die SCHAERFERE Probe, weil `moduleForHost` dort tatsaechlich ein Modul
 * liefert (`e2e/helpers/radio.ts:17-26`, Datei 161 Zeilen): der 404 unten kommt nachweislich
 * aus dem radio-Host-Riegel, nicht aus einem unaufgeloesten Host. Er existiert bereits im Lauf
 * — `playwright.config.ts` wartet auf `http://feedback.localtest.me:3100/login`.
 *
 * ⛔ HOST, GRUPPE, PORT UND CODES KOMMEN AUSSCHLIESSLICH AUS `e2e/helpers/radio.ts`
 * (Bauform-Zulaessigkeitstafel Nr. 19) — kein Literal wie `"http://radio.localtest.me:3100"`
 * oder `"iuk-radio-admin"`: mit einem falschen Wert bezeugte der Lauf den Riegel-404 und saehe
 * dabei aus wie ein bestandener Test.
 *
 * ⛔ ANGEMELDET MIT DER RADIO-ADMIN-GRUPPE, UND NICHT MIT `groups: ""`. Sonst waere der 404 der
 * GRUPPENriegel und nicht der HOSTriegel, und der Test bewiese das Falsche.
 * `AUTH_COOKIE_DOMAIN=".localtest.me"` (`playwright.config.ts`, `webServer.env`) traegt die
 * Sitzung von `RADIO_HOST` auf `FREMDER_HOST` mit — genau das ist die Voraussetzung dafuer,
 * dass der 404 dort wirklich der Host-Riegel ist. ⛔ Die LEERE Stufe hat ihren eigenen Fall in
 * `e2e/radio-verwaltung.spec.ts` („V-L3 B") und wird hier NICHT dupliziert.
 *
 * ⚠️ DER GELTUNGSBEREICH DIESES SATZES, AUSGESCHRIEBEN STATT VORAUSGESETZT: `devLogin` steht in
 * der SCHLEIFE und im DATENWIRKUNGS-FALL. Der Worker-, der Health- und der Cookie-Fall melden
 * sich NICHT an, und das aendert an ihrer Aussage nichts: `radio` traegt `requiresAuth: false`
 * (`src/core/registry.ts:197-199`), und `canAccess` steigt deshalb schon in `:265`
 * (`if (!mod.requiresAuth) return true;`) mit `true` aus — AUCH fuer `groups === null`. Ein
 * GRUPPENriegel kann dort also gar nicht die Ursache eines 404 sein; es bleibt der HOSTriegel.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ `page.request` ODER `page.goto` — DER GELTUNGSBEREICH, AUSGESCHRIEBEN (Vorabscan F12)
 * ────────────────────────────────────────────────────────────────────────────
 * IN DER SCHLEIFE: `page.request`, fuer BEIDE Seiten. Es traegt denselben Cookie-Kontext wie
 * `page`, liefert den Statuscode direkt und loest — anders als eine echte Navigation — bei
 * einem nicht-HTML-`Content-Type` (hier `text/javascript` fuer `/sw.js`) KEIN
 * `net::ERR_ABORTED` aus (Bauform 23; `e2e/lagerbuch-hosts.spec.ts:133-140`).
 * IM DATENWIRKUNGS-FALL: `page.goto`, und das ist KEIN Rueckfall, sondern die Form des
 * Vorbilds (`e2e/lagerbuch-hosts.spec.ts:225` und `:243`). Beide Pfade dort liefern HTML bzw.
 * eine Umleitung auf HTML; die Navigation ist die naehere Nachbildung eines gescannten
 * QR-Codes.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ EINE ABWEICHUNG VOM AUFGABENBRIEF, UND SIE IST GEMESSEN (Vorabscan-Fund F8)
 * ────────────────────────────────────────────────────────────────────────────
 * Der Brief gibt fuer BEIDE einloesenden Faelle `E2E_CODE_AKTIV` vor. Der Datenwirkungs-Fall
 * behaelt ihn — er MUSS einloesbar sein, und `E2E_CODE_GESPERRT` schriebe in seiner staerkeren
 * Haelfte gar kein `last_used_at`. ⛔ DER COOKIE-FALL BEKOMMT EINEN EIGENEN CODE, und der Grund
 * ist die Spaltenaufloesung: `lastUsedAt` ist `integer("last_used_at", { mode: "timestamp" })`
 * (`src/app/m/radio/_db/schema.ts:192`, Datei 264 Zeilen) — Drizzle speichert `mode:
 * "timestamp"` in SEKUNDEN. Zwei aufeinanderfolgende `test()`-Bloecke derselben Datei laufen
 * unter `workers: 1` strikt nacheinander und ohne Pause; fielen beide Einloesungen in DIESELBE
 * Sekunde, waere `nachEigen.last_used_at === vorFremd.last_used_at` und der Datenwirkungs-Fall
 * rot OHNE jeden Fehler im Produktcode — die Klasse „rennabhaengig". Dieselbe Aufloesung
 * schreibt der Plan fuer T3 Fall 4 bereits vor, mit demselben Argument: aus `zugangscodes`
 * wird nie geloescht (§3.2.4).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ WAS DIESE DATEI AN DATEN HINTERLAESST — vollstaendig, weil `workers: 1` eine gemeinsame
 * SQLite-Datei bedeutet
 * ────────────────────────────────────────────────────────────────────────────
 *   - EINE EIGENE `zugangscodes`-ZEILE (`CODE_COOKIEFALL`, id `e2e-t4-cookie`), aktiv, mit
 *     gesetztem `last_used_at`. ⛔ Sie wird NICHT aufgeraeumt, und das ist folgenlos: aus
 *     `zugangscodes` wird nie geloescht (§3.2.4).
 *   - `E2E_CODE_AKTIV` traegt nach dem Datenwirkungs-Fall ein FRISCHES `last_used_at`. Das ist
 *     folgenlos: das Feld ist „reine Anzeige, ohne Einfluss auf Gueltigkeit"
 *     (`_db/schema.ts:191-192`), ein Code bleibt nach der Einloesung einloesbar
 *     (`codeEinloesung.ts:64` prueft nur `!zeile || !zeile.aktiv`). ⛔ Ein kuenftiger Fall, der
 *     `last_used_at IS NULL` als Vorbedingung braucht, darf ihn trotzdem nicht mehr benutzen.
 *   - KEINE `loans`-ZEILE. Diese Datei bucht nichts. `e2e/radio-zugang.spec.ts` fuehrt seine
 *     eigene Liste und nennt fuer sich GENAU EINE Zeile — diese Datei aendert daran nichts.
 *   - KEIN GATE-FEHLVERSUCH. Beide Einloesungen hier sind ERFOLGREICH, und ein richtiger Code
 *     kostet kein Budget (`t/[code]/route.ts:134-137` bucht nur im Misserfolgszweig). Die
 *     Grenze `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` traegt `einheit: "Anzahl/min"`
 *     (`src/app/m/radio/_lib/grenzen.ts:82`) — eine PRO-MINUTE-Grenze, keine Lauf-Grenze.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ WELCHE ZEILE WELCHEN FALL TRAEGT — GEMESSEN AM 2026-08-27, NICHT ABGELEITET
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ ZWEI VERSCHIEDENE ARTEN VON MESSUNG, UND SIE WERDEN NICHT ZUSAMMENGEZAEHLT: ELF
 * MUTATIONSSONDEN auf Produktcode (sie SOLLEN rot werden) und VIER STEUERPROBEN, die
 * belegen, WARUM eine Zusicherung ueberhaupt dasteht (sie bleiben absichtlich gruen).
 * „Vier Steuerproben mit 0 rot" waere zusammengezaehlt eine falsche Zahl.
 *
 * ELF MUTATIONSSONDEN — je eine Zeile im Produktcode entfernt, bei den letzten zwei je ZWEI,
 * danach ein Lauf dieser Datei. ⛔ ZWEI DAVON ERGABEN 0 ROT, UND DAS IST EIN BEFUND UEBER DIE
 * FLAECHE, NICHT UEBER DEN TEST — die zwei Ersatzfassungen stehen darunter und ergaben je 1 rot.
 * ⚠️ SECHS DER ELF SIND IN DER FIX-RUNDE 1 NACHGETRAGEN (Review-Hinweis H1): vorher hatten die
 * drei werfenden Schleifeneintraege und der Health-Fall keine gemessene Mutation.
 *
 *   | Mutation                                                      | rot                 |
 *   |---------------------------------------------------------------|---------------------|
 *   | `sw.js/route.ts:31` — `hostAbweisung(req) ??` faellt weg       | Schleife `/m/radio/sw.js` (404 -> 200) |
 *   | `t/[code]/route.ts:80` — der Host-Abgleich faellt weg          | Datenwirkungs-Fall  |
 *   | `EINSTIEGE` — ein Eintrag gestrichen                           | Laengenfall (9 statt 10 Bloecke liefen) |
 *   | `abmelden/route.ts:63` — der Host-Abgleich faellt weg          | Schleife `/m/radio/abmelden` (Umweg-Zeile) und Cookie-Fall |
 *   | `abmelden/route.ts` — Riegel HINTER die Raeumung, und die Raeumung faehrt auf der 404 mit | Cookie-Fall (Kopfzeilen-Zeile); ⛔ die Schleife BLEIBT gruen |
 *   | `admin/(arbeit)/geraete/export/route.ts:77` — `radioHostOderNull(...) === null` faellt weg | Schleife `/m/radio/admin/geraete/export` (404 -> 200) |
 *   | `api/health/[modul]/route.ts:24` — `revision: laufendeRevision()` faellt weg | Health-Fall (`Received value: {"module":"radio","status":"ok"}`) |
 *   | `page.tsx:60` — `requireRadioHost(kopf)` faellt weg (ALLEIN) | ⛔ NICHTS — `10 passed`, **0 rot** |
 *   | `admin/(arbeit)/layout.tsx:60` — `requireRadioHost(kopf)` faellt weg (ALLEIN) | ⛔ NICHTS — `10 passed`, **0 rot** |
 *   | `page.tsx:60` UND `_lib/ausleihZugang.ts:120` — BEIDE weg | Schleife `/m/radio`, an der UMWEG-Zeile: `Expected: "/m/radio" / Received: "/geraete"` |
 *   | `admin/(arbeit)/layout.tsx:60` UND `_lib/zugang.ts:462` — BEIDE weg | Schleife `/m/radio/admin` (404 -> 200) |
 *
 * ⛔ DAS PAAR UM `abmelden` IST DER GRUND, WARUM DER COOKIE-FALL EINE EIGENE ZUSAGE IST: der
 * 404 allein unterscheidet „der Riegel greift vor jeder Wirkung" nicht von „der Riegel greift
 * danach". Gemessen: Schleifeneintrag gruen, Cookie-Fall rot.
 *
 * ⛔ WARUM DIE ZWEI EINZEL-SONDEN 0 ROT ERGABEN — GEMESSEN AM 2026-08-27, UND ES STEHT SONST
 * NIRGENDS: die zwei WERFENDEN Einstiege sind DOPPELT geriegelt, und die Doppelung ist
 * angeordnet, nicht versehentlich. `page.tsx:60` traegt `requireRadioHost` ZUSAETZLICH zu dem
 * Aufruf, den `ausleihZugangOderNull` intern schon macht (`_lib/ausleihZugang.ts:120`; der
 * Grund steht dort `:104-112` und in Spec:2767 / Spec:2759-2763). Dasselbe gilt fuer
 * `admin/(arbeit)/layout.tsx:60` gegenueber `requireRadioAdmin` (`_lib/zugang.ts:462`,
 * „erst der Host, dann die Person"). ⛔ EINE EINZEL-SONDE IST DORT ALSO EIN NULL-EINGRIFF —
 * dieselbe Klasse wie S-T4g in der Fassung des Briefs und wie Probe P1 aus R-T3-1. Nicht der
 * TEST ist schwach, sondern die Sonde greift eine Ebene zu tief an; erst beide Zeilen zusammen
 * sind die Mutation, die der Eintrag zu fangen vorgibt.
 * ⚠️ UND DIE ROTE ZEILE BEI `/m/radio` IST NICHT DIE 404-ZEILE, SONDERN DIE UMWEG-ZEILE. Ohne
 * beide Riegel liefert das Gate auf dem fremden Host die Weiche `redirect("/geraete")` — die
 * Anfrage folgt ihr, `/geraete` antwortet auf dem FREMDEN Host 404, und Zusicherung 1 BLIEBE
 * gruen. Gefangen hat es `new URL(fremd.url()).pathname`.
 *
 * ⛔ WARUM DIESER 404 KOMMT — VIER SCHRITTE, JEDER BELEGT, UND NICHT DER GRUND, DER HIER BIS
 * ZUR FIX-RUNDE 2 STAND. Der fruehere Wortlaut hiess „`/geraete` hat heute noch keine Datei
 * und antwortet 404". ⛔ ER IST FALSCH: `src/app/m/radio/(ausleihe)/geraete/page.tsx` liegt
 * seit `e80808cf` (2026-08-24) im Baum, mit `page.test.tsx` daneben. Der tragende Grund:
 *   1. `src/app/m/radio/page.tsx:76` wirft `redirect("/geraete")` — ein RELATIVER Pfad. Er
 *      wird gegen den FREMDEN Origin aufgeloest, nicht gegen `radio.localtest.me`.
 *   2. Auf `feedback.localtest.me` ist `/geraete` KEIN `/m/*`-Pfad; der interne Zweig von
 *      `decideRoute` greift nicht (`src/core/routing.ts:68`).
 *   3. Der Host-Zweig loest gegen das Modul `feedback` auf (`src/core/routing.ts:79`).
 *      `feedback` traegt `requiresAuth: false` (`src/core/registry.ts:79-80`), also steigt
 *      `canAccess` in `src/core/registry.ts:265` sofort mit `true` aus — KEIN `forbidden` und
 *      KEIN `login`, obwohl die Schleife mit `RADIO_ADMIN_GRUPPE` angemeldet faehrt.
 *   4. `src/core/routing.ts:88-89` schreibt auf `/m/feedback/geraete` um, und das FREMDE Modul
 *      hat diese Flaeche nicht (`ls src/app/m/feedback/` listet `(admin)/ (print)/ _db/ _lib/
 *      _ui/ f/` und keine `geraete`). Daher der 404.
 * ⛔ DIE UNTERSCHEIDENDE MESSUNG, am 2026-08-27 DIREKT gefahren statt geschlossen (eine
 * Wegwerf-Spec gegen denselben Server, danach entfernt): `feedback.localtest.me/geraete` -> 404,
 * `radio.localtest.me/geraete` -> 200. Der 404 kommt also daher, dass das FREMDE Modul den Pfad
 * nicht hat, NICHT daher, dass `radio` ihn nicht haette.
 * ⚠️ WER DEN FRUEHEREN WORTLAUT LAS, ZOG DIE FALSCHE KONSEQUENZ — er las, der Praezedenzfall
 * fuer Zusicherung 2 verfalle, sobald `/geraete` gebaut sei. Er ist gebaut, und der
 * Praezedenzfall gilt trotzdem.
 *
 * ⛔ Das ist derselbe Umweg-Mechanismus, den der Brief fuer `/m/radio/abmelden` beschreibt —
 * hier zum zweiten Mal gemessen, an einem anderen Eintrag.
 *
 * VIER STEUERPROBEN — sie messen die NOTWENDIGKEIT einer Zusicherung, nicht die Wirkung
 * einer Zeile:
 *
 *   S1  Umweg-Zusicherung ENTFERNT + `abmelden`s Riegel ab
 *       -> der Schleifeneintrag `/m/radio/abmelden` BLIEB GRUEN (`9 passed`, rot war nur der
 *          Cookie-Fall). ⛔ Genau das ist der Grund fuer Zusicherung 2.
 *   S1' dieselbe Lage, Umweg-Zusicherung WIEDER DA
 *       -> der Eintrag wird rot: „Umweg statt 404", `Received: "/"`. Die Zusicherung traegt.
 *   S2  Eigen-Host-Gegenprobe ENTFERNT + ein Pfad verschrieben (`…/exprot`)
 *       -> `10 passed`, die Schleife BLIEB VOLLSTAENDIG GRUEN. ⛔ Der Grund fuer Zusicherung 3.
 *   S2' derselbe verschriebene Pfad, Gegenprobe WIEDER DA
 *       -> genau dieser Eintrag rot: „auf radio.localtest.me — Expected: not 404".
 *
 * ⛔ UND EINE FUENFTE MESSUNG, DIE EINE SCHWAECHE BELEGT STATT SIE ZU VERSCHWEIGEN: unter der
 * Mutation „Riegel hinter die Raeumung" und OHNE die Kopfzeilen-Zusicherung lief die Datei
 * `10 passed`. Die differenzielle Cookie-Zusicherung allein ist also NICHT falsifizierbar —
 * aus dem Host-only-Grund, der im Kommentar des Cookie-Falls ausgeschrieben steht.
 *
 * ⛔ EINE ABWEICHUNG VON DER SONDENVORGABE DES BRIEFS, UND SIE IST GEMESSEN. Der Brief
 * verlangt fuer die Rewrite-Sonde, in `src/core/registry.ts:251-258` die
 * `localtest.me`-Zeile HINTER den `prodHostsFor`-Vergleich zu ziehen. Das ist ein NULL-EINGRIFF:
 * beide Pruefungen stehen im SELBEN Schleifendurchlauf ueber `MODULES`, und kein Modul fuehrt
 * `radio.localtest.me` in `prodHosts` (`SUITE_HOST_RADIO` steht bewusst nicht in `RADIO_ENV`).
 * NACHGEFAHREN: `10 passed`, keine einzige rote Zeile. Die TRAGENDE Form der Sonde greift eine
 * Ebene hoeher an — `/sw.js` in `PASSTHROUGH` (`src/core/routing.ts:12`), womit der Host-Rewrite
 * fuer genau diesen Pfad ausfaellt: `1 failed`, und zwar GENAU die `radioUrl("/sw.js")`-Haelfte
 * des Worker-Falls, waehrend `radioUrl("/m/radio/sw.js")` und der Schleifeneintrag gruen
 * blieben. ⛔ Das ist der Nachweis, dass die zwei Haelften VERSCHIEDENE STRECKEN messen.
 * ⚠️ Eine dritte Fassung (`src/core/routing.ts:79`, `moduleForHost(host)` durch
 * `getModule("portal")` ersetzt) faerbte zusaetzlich den Schleifeneintrag `/m/radio` — sie riss
 * eine fremde Flaeche mit und wurde deshalb VERWORFEN, nicht als Befund gewertet.
 *
 * ⛔ ALLE SONDEN SIND ZURUECKGENOMMEN; `rtk git status --short` und `rtk git diff --stat`
 * waren danach leer bis auf diese neue Datei.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⬜ WAS DIESE DATEI FUER Z-L1 NICHT ABLIEST — DIE RESTMENGE, HIER STATT NUR IM BERICHT
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ DIE ZWEITE HAELFTE VON `Spec:6916` IST IM LAUF NICHT ABGELESEN, UND DAS IST DIE WICHTIGSTE
 * ZEILE DIESES KOPFES. Abgelesen und FALSIFIZIERT ist ihr Stellvertreter: die 404-Antwort des
 * fremden Hosts traegt kein `Set-Cookie` fuer `radio_ausleihe` (Sonde S-T4f). Die woertliche
 * Zusage — „das Cookie der laufenden Sitzung ist danach unveraendert vorhanden" — steht als
 * Zusicherung im Cookie-Fall unten und ist dort NACHWEISLICH NICHT falsifizierbar; der Grund
 * ist die Bauform (host-only Cookie) und im Kommentar jenes Falls ausgeschrieben.
 * ⛔ WER SIE FUER DEN WIRKNACHWEIS HAELT, UEBERSCHAETZT SIE. Sie gehoert in die RESTMENGE von
 * ⬜ Z-L1 und ist NICHT erledigt. ⛔ DESHALB HEISST DER FALL AUCH NICHT MEHR, WIE ER IN
 * `briefs/T4.md` HEISST: bis zum 2026-08-27 trug er den Namen „der Abmelde-Handler auf fremdem
 * Host laesst das Sitzungs-Cookie stehen" — er sagte damit die unbewachte Haelfte zu. Der
 * heutige Name sagt die bewachte.
 *   Was die Restmenge schloesse: ein Fall, der das Cookie auf `RADIO_HOST` NACH dem
 *   Fremdversuch wirklich noch BENUTZT — eine geschuetzte Ausleih-Flaeche abruft und dort nicht
 *   nach `/abmelden?grund=…` umgeleitet wird. Das ist eine ANDERE Zusage als „derselbe
 *   Cookie-Wert", und sie ist hier NICHT gebaut.
 * ⚠️ Ebenfalls offen und von dieser Datei NICHT gedeckt: `/m/radio/admin/import/hochladen` (nur
 * `POST`, Grund oben), ⬜ G-L5 (der Rumpf von `/api/health/radio` im BETRIEB) und ⬜ G-L7 (was
 * nach dem Abraeumen in „Application → Service Workers" steht).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⛔ ZEHN LAUFENDE `test()`-BLOECKE AUS SECHS `test(`-QUELLEN — nachgezaehlt, nicht geschaetzt
 * ────────────────────────────────────────────────────────────────────────────
 * 1 Laengenfall + 5 aus der Schleife (`test()` steht INNERHALB der `for`-Schleife, ein Block je
 * Einstieg — Vorbild `e2e/lagerbuch-hosts.spec.ts:141-145`) + 1 Datenwirkungs-Fall +
 * 1 Worker-Fall + 1 Health-Fall + 1 Cookie-Fall = 10 Bloecke aus 6 Quellen.
 */

/**
 * ⚠️ DER PFAD KOMMT NICHT AUS `moduleDbPath()`. `DATA_DIR=./.data/e2e` steht nur in
 * `playwright.config.ts` (`webServer.env`) und erreicht ausschliesslich den SERVERprozess; im
 * Testprozess ist die Variable nicht gesetzt, `moduleDbPath` liefe auf `./.data/radio.db` und
 * laese EINE ANDERE DATEI als die, in die der Server schreibt. Wortlaut und Vorbild:
 * `e2e/radio-zugang.spec.ts` (dieselbe Konstante) und `e2e/lagerbuch-hosts.spec.ts:55`.
 *
 * ⛔ KEIN `getDb()` UND KEIN `getModuleDb()` — deren Cache ist per Modulschluessel gekeyt,
 * nicht per `DATA_DIR` (`src/core/db/index.ts:25-36`), und `getDb()` IST
 * `getModuleDb("radio", schema)` (`src/app/m/radio/_db/client.ts:22-24`).
 */
const DB_PFAD = "./.data/e2e/radio.db";

/** Eine frische, schreibgeschuetzte Verbindung je Aufruf — die Zeile wird VOR und NACH dem
 *  fremden Zugriff gelesen, und ein wiederverwendetes Handle koennte eine gepufferte
 *  (veraltete) Sicht zeigen. Bauform aus `e2e/radio-zugang.spec.ts`. */
function lesend<T>(arbeit: (db: Database.Database) => T): T {
  expect(
    existsSync(DB_PFAD),
    `${DB_PFAD} fehlt — laeuft der e2e-Server mit DATA_DIR=./.data/e2e?`,
  ).toBe(true);
  const db = new Database(DB_PFAD, { readonly: true });
  try {
    return arbeit(db);
  } finally {
    db.close();
  }
}

function schreibend<T>(arbeit: (db: Database.Database) => T): T {
  const db = new Database(DB_PFAD);
  try {
    return arbeit(db);
  } finally {
    db.close();
  }
}

/**
 * Die Codezeile, roh gelesen.
 *
 * ⚠️ `aktiv` KOMMT ALS ZAHL, NICHT ALS `boolean`: Drizzles `mode: "boolean"`
 * (`_db/schema.ts:181`) ist eine Sicht der ORM-Schicht, in der Datei steht ein `integer`.
 * ⚠️ `last_used_at` KOMMT IN SEKUNDEN (`mode: "timestamp"`, `_db/schema.ts:192`) — und genau
 * diese Aufloesung ist der Grund fuer den eigenen Code des Cookie-Falls, siehe Kopf.
 */
function codeZeile(code: string): { id: string; aktiv: number; last_used_at: number | null } {
  const zeile = lesend(
    (db) =>
      db.prepare("select id, aktiv, last_used_at from zugangscodes where code = ?").get(code) as
        | { id: string; aktiv: number; last_used_at: number | null }
        | undefined,
  );
  expect(zeile, `der Seed muss ${code} fuehren`).toBeTruthy();
  return zeile!;
}

/**
 * Legt den laufeigenen Zugangscode an.
 *
 * ⛔ `insert or ignore` PLUS EIN ANSCHLIESSENDES `update … set aktiv = 1`, NICHT EIN BLOSSES
 * `insert`: `zugangscodes.code` traegt `.unique()` (`_db/schema.ts:171`), und unter
 * `--repeat-each` oder `retries` liefe derselbe Fall ein zweites Mal auf einer Datei, in der
 * die Zeile schon steht. Ein blosses `insert` waere dort ein Constraint-Fehler.
 *
 * ⚠️ `created_at` IN SEKUNDEN, NICHT IN MILLISEKUNDEN (`mode: "timestamp"`,
 * `_db/schema.ts:187`) — ein Millisekundenwert waere typkorrekt und ergaebe beim Lesen ein
 * Datum im Jahr 55000.
 * ⚠️ `created_by` IST `notNull` (`_db/schema.ts:189`) und ein reines Auditfeld
 * (Entscheidung 7); der Wert hier ist erkennbar ein Testwert.
 */
function legeCodeAn(code: string, id: string, bezeichnung: string): void {
  schreibend((db) => {
    db.prepare(
      "insert or ignore into zugangscodes (id, code, bezeichnung, aktiv, created_at, created_by) values (?, ?, ?, 1, ?, ?)",
    ).run(id, code, bezeichnung, Math.floor(Date.now() / 1000), "e2e-t4");
    db.prepare("update zugangscodes set aktiv = 1 where code = ?").run(code);
  });
  expect(codeZeile(code).aktiv, `der laufeigene Code ${code} muss aktiv sein`).toBe(1);
}

/**
 * DER LAUFEIGENE CODE DES COOKIE-FALLS, in der kanonischen Form aus §3.2.1: 28 Zeichen
 * Crockford-Base32 in sieben Vierergruppen, der Bindestrich TEIL des gespeicherten Werts.
 *
 * ⛔ DIE FORM IST NICHT KOSMETIK. `loeseCodeEin` normalisiert NICHT selbst
 * (`_lib/schreibpfade/codeEinloesung.ts:40-47`); der Einloeseweg normalisiert VORHER
 * (`t/[code]/route.ts:124`) und sucht dann auf GLEICHHEIT gegen `zugangscodes.code`. Ein Wert
 * ausserhalb des Alphabets („0123456789ABCDEFGHJKMNPQRSTVWXYZ", ohne I, L, O, U —
 * `_lib/code.ts:53`) ueberlebte die Normalisierung nicht unveraendert, und der Fall fiele an
 * seiner eigenen Vorbedingung statt an der Flaeche, die er misst.
 */
const CODE_COOKIEFALL = "T4C1-K7XM-3RTV-9Z2Y-B5HN-6DPW-8YFG";
const CODE_COOKIEFALL_ID = "e2e-t4-cookie";

/**
 * Das Ausleih-Sitzungscookie. ⛔ Der Name steht als Literal, weil er der VERTRAG mit dem
 * Browser ist und kein konfigurierter Wert: `AUSLEIH_COOKIE = "radio_ausleihe"`
 * (`src/app/m/radio/_lib/ausleihSitzung.ts:35`, Datei 221 Zeilen). Dieselbe Bauform tragen
 * `e2e/radio-zugang.spec.ts` und `e2e/lagerbuch-helfer.spec.ts:220`.
 */
const AUSLEIH_COOKIE_NAME = "radio_ausleihe";

/**
 * Das Ausleih-Cookie AUS DER SICHT DES RADIO-HOSTS. ⛔ Die URL-Form von
 * `BrowserContext.cookies(...)` und nicht die Gesamtliste: das Cookie ist HOST-ONLY (es kennt
 * kein `domain`-Attribut — `ausleihCookieOptionen` gibt `httpOnly/sameSite/path/secure/maxAge`
 * zurueck und sonst nichts, `_lib/ausleihSitzung.ts:207-221`), und eine Gesamtliste
 * vermischte es mit dem Suite-Sitzungscookie, das ueber `AUTH_COOKIE_DOMAIN=".localtest.me"`
 * auf ALLEN Hosts liegt.
 */
async function ausleihCookieWert(page: Page): Promise<string | undefined> {
  const kekse = await page.context().cookies(radioUrl("/"));
  return kekse.find((k) => k.name === AUSLEIH_COOKIE_NAME)?.value;
}

/**
 * Jeder Einstieg des Moduls, in INNERER Pfadform — so, wie ein fremder Host ihn erreichen
 * wuerde. Verbindlich nach E-G8:
 *
 *   1  `/m/radio`                        Erwartung eigen: nicht 404 (das Gate)
 *   2  `/m/radio/abmelden`               Erwartung eigen: nicht 404 (303, dann die Wurzel)
 *   3  `/m/radio/admin`                  Erwartung eigen: nicht 404 (mit Admin-Gruppe: 200)
 *   4  `/m/radio/admin/geraete/export`   Erwartung eigen: nicht 404 (`GET`, `route.ts:70`)
 *   5  `/m/radio/sw.js`                  Erwartung eigen: nicht 404 (200, `text/javascript`)
 *
 * ⛔ Die Klammerzusaetze sind ERWARTUNGEN, keine `toBe`-Zusicherungen — siehe Kopf.
 *
 * ⚠️ DER SCHLEIFEN-EINTRAG BLEIBT `/m/radio/sw.js` UND NICHT `/sw.js`: auf einem fremden Host
 * waere `/sw.js` ein 404 aus dem falschen Grund, weil `moduleForHost("feedback.localtest.me")`
 * dort nach `/m/feedback/sw.js` rewritet. Der AEUSSERE Pfad hat seine Zusage im Worker-Fall
 * unten, auf dem EIGENEN Host.
 */
const EINSTIEGE = [
  "/m/radio",
  "/m/radio/abmelden",
  "/m/radio/admin",
  "/m/radio/admin/geraete/export",
  "/m/radio/sw.js",
];

test.describe("radio-Host-Riegel", () => {
  // DIE ZAHL IST DIE ZUSAGE, nicht die Anwesenheit der Schleife: eine gestrichene Zeile
  // schrumpfte den Lauf sonst STILL, und „vier von fuenf gesperrt" saehe in der Ausgabe
  // genauso gruen aus wie fuenf.
  // ⚠️ Deckt NICHT jeden Tippfehler in einem Pfad — die Laenge haelt bei einer GEAENDERTEN
  // Zeile. Das faengt die Eigen-Host-Haelfte der Schleife: ein verschriebener, nicht
  // existierender Pfad waere dort ebenfalls 404 und liesse GENAU DIESEN Eintrag fehlschlagen.
  test("traegt alle fuenf Einstiege", () => {
    expect(EINSTIEGE).toHaveLength(5);
  });

  /*
   * STATUS, UMWEG UND EIGEN-HOST-NICHT-404 IN DERSELBEN SCHLEIFE, JE EINTRAG — genau wie im
   * Vorbild `e2e/lagerbuch-hosts.spec.ts:141-178`.
   */
  for (const pfad of EINSTIEGE) {
    test(`${pfad} antwortet auf einem fremden Suite-Host mit 404 — und auf dem eigenen nicht`, async ({
      page,
    }) => {
      await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

      const fremd = await page.request.get(fremdUrl(pfad));
      expect(fremd.status(), `${pfad} auf ${FREMDER_HOST}`).toBe(404);

      /*
       * KEIN UMWEG. `/m/radio/abmelden` antwortet auch OHNE Host-Riegel mit einem RELATIVEN
       * 303 (`abmelden/route.ts:87-90`, Datei 105 Zeilen) — und eine folgende Anfrage landete
       * auf `FREMDER_HOST`s eigener Wurzel und traefe dort ZUFAELLIG ebenfalls einen 404 oder
       * eine ganz andere Antwort. Ohne diese Zeile bewiese der Eintrag dann etwas anderes als
       * den Host-Riegel: GEMESSEN im Vorbild blieb bei probehalber deaktivierter Riegelfunktion
       * GENAU DIESER FALL gruen, waehrend alle anderen korrekt rot wurden
       * (`e2e/lagerbuch-hosts.spec.ts:155-167`, der Satz „blieb GENAU dieser Fall gruen" bei
       * `:159`, die Umweg-Zusicherung bei `:167`). Der Abgleich der finalen URL schliesst das
       * aus: ein relativer Redirect kann konstruktiv nicht auf denselben Pfad zurueckfallen,
       * den er verlassen hat.
       */
      expect(new URL(fremd.url()).pathname, `${pfad}: Umweg statt 404`).toBe(pfad);

      /*
       * DIE GEGENRICHTUNG, JE EINTRAG. Ohne sie bewiese der 404 oben nur, dass IRGENDETWAS 404
       * gibt — ein falsch geschriebener Pfad, eine umbenannte Route, ein Modul, das gar nicht
       * aufgeloest wird. Erst „auf dem EIGENEN Host ist es KEIN 404" macht aus dem 404 eine
       * Aussage ueber den HOST statt ueber die Existenz der Route.
       */
      const eigen = await page.request.get(radioUrl(pfad));
      expect(eigen.status(), `${pfad} auf ${RADIO_HOST}`).not.toBe(404);
    });
  }

  /**
   * DIE ZEILE, DIE FALLE 61 BEZAHLT: nach dem Versuch von einem fremden Host ist
   * `zugangscodes.last_used_at` NACHWEISLICH unveraendert. Ein 404 allein sagte nichts
   * darueber, ob der Code vorher schon verbraucht wurde — der Riegel muss VOR jeder Wirkung
   * greifen, und `t/[code]/route.ts:80` steht VOR jeder anderen Anweisung des Rumpfes.
   *
   * ⛔ DIE ZUSICHERUNGEN SIND DIFFERENZIELL, NICHT ABSOLUT — nie gegen `NULL`. Ein Vergleich
   * gegen `NULL` haenge am SEED-Zustand statt am Test selbst („in welchem falschen Zustand
   * waere das auch gruen?"): der Seed setzt `lastUsedAt: TAGE(2)`
   * (`src/app/m/radio/_lib/seedLokal.ts:190-191`, Datei 235 Zeilen), und T2 loest denselben Code
   * im selben Lauf wirklich ein. `loeseCodeEin` schreibt bei JEDEM Erfolg einen NEUEN
   * `new Date()`-Wert (`codeEinloesung.ts:70`), auch wenn `last_used_at` schon gesetzt war —
   * die Differenz bleibt damit auch bei wiederholten Laeufen ein gueltiger Diskriminator.
   * ⛔ `workers: 1` IST KEINE REIHENFOLGEZUSAGE — es heisst nur „eine gemeinsame Datei". Genau
   * deshalb haengt hier nichts an der Frage, ob T2 vor oder nach dieser Datei lief.
   *
   * ⛔ UND DIE DIFFERENZIELLE ZEILE IST HIER DIE TRAGENDE, NICHT DER 404 — GEMESSEN. Mit
   * probehalber entferntem Host-Abgleich in `t/[code]/route.ts:80` antwortete der FREMDE Host
   * WEITERHIN mit 404: der Handler liefert dann seinen relativen 303 nach `/`, `page.goto`
   * folgt ihm auf `feedback.localtest.me/`, und DIESE Wurzel antwortet ihrerseits 404. Rot
   * wurde die Zeile darunter — „der Riegel muss VOR jeder Wirkung greifen", `Expected:
   * 1787646656 / Received: 1787819470`. ⛔ Der 404 allein bewiese hier also NICHTS; dieselbe
   * Umweg-Klasse faengt in der Schleife die Zusicherung auf `new URL(...).pathname`.
   *
   * ⛔ `E2E_CODE_AKTIV` UND NICHT `E2E_CODE_GESPERRT`, und die Wahl steht hier statt still
   * getroffen zu sein: die staerkere Haelfte unten braucht eine ERFOLGREICHE Einloesung, und
   * ein gesperrter Code schriebe gar kein `last_used_at` (`codeEinloesung.ts:64` steht VOR
   * `:70`). Der Cookie-Fall unten benutzt ihn aus dem im Kopf genannten Grund (F8) NICHT mit.
   */
  test("verbraucht einen Code vom fremden Host aus nicht — bleibt auf dem eigenen einloesbar", async ({
    page,
  }) => {
    const vorFremd = codeZeile(E2E_CODE_AKTIV);
    expect(vorFremd.aktiv, "der Seed-Code muss aktiv sein").toBe(1);

    await devLogin(page, { host: RADIO_HOST, groups: RADIO_ADMIN_GRUPPE });

    const fremdAntwort = await page.goto(fremdUrl(`/m/radio/t/${E2E_CODE_AKTIV}`));
    expect(fremdAntwort!.status(), `/m/radio/t/<code> auf ${FREMDER_HOST}`).toBe(404);

    const nachFremd = codeZeile(E2E_CODE_AKTIV);
    expect(nachFremd.last_used_at, "der Riegel muss VOR jeder Wirkung greifen").toBe(
      vorFremd.last_used_at,
    );

    /*
     * DIE STAERKERE HAELFTE, und ohne sie waere der 404 oben aus dem FALSCHEN Grund nicht vom
     * 404 aus dem RICHTIGEN Grund zu unterscheiden: eine geloeschte Route, ein abgelehntes
     * Codeformat oder ein toter Seed lieferten ebenfalls 404 mit unveraendertem
     * `last_used_at` — und saehen hier genauso gruen aus.
     */
    const eigenAntwort = await page.goto(radioUrl(`/m/radio/t/${E2E_CODE_AKTIV}`));
    expect(eigenAntwort!.status(), `/m/radio/t/<code> auf ${RADIO_HOST}`).not.toBe(404);

    const nachEigen = codeZeile(E2E_CODE_AKTIV);
    expect(nachEigen.last_used_at, "auf dem EIGENEN Host wird eingeloest").not.toBe(
      vorFremd.last_used_at,
    );
  });

  /**
   * DER ABRAEUM-WORKER, AUF BEIDEN PFADEN — und die zwei Pfade messen VERSCHIEDENE STRECKEN.
   *
   * `radioUrl("/m/radio/sw.js")` laeuft in `decideRoute` ueber den INTERNEN `/m/<key>`-Zweig
   * (`src/core/routing.ts:68-77`) und beruehrt die Host-Rewrite-Strecke NIE.
   * `radioUrl("/sw.js")` laeuft ueber `moduleForHost(host) ?? getModule("portal")`
   * (`src/core/routing.ts:79`) und wird von dort nach `/m/radio/sw.js` rewritet. Die
   * Runbook-Zeile aus §4.7.2 Haelfte 1 lautet `curl "$B/sw.js"` — der AEUSSERE Pfad. Erst mit
   * beiden Haelften ist „die Haelfte-1-Messung im Lauf" wahr, und erst dann ist der ERSTE
   * STILLE FALL aus §7.4.4 (der Rewrite greift nicht) im Lauf gedeckt statt nur im Unit-Test
   * (`src/app/m/radio/_lib/routen.test.ts:122-133`, Datei 251 Zeilen).
   *
   * ⚠️ DIE VORAUSSETZUNG IST GEMESSEN: `moduleForHost` (`src/core/registry.ts:251-258`) trifft
   * `` `${m.key}.localtest.me` `` in `:254`, also VOR dem `prodHostsFor`-Vergleich in `:255`.
   * `radio.localtest.me` loest damit auch OHNE gesetztes `SUITE_HOST_RADIO` nach `radio` auf —
   * und genau deshalb braucht `RADIO_ENV` die Variable weiterhin nicht
   * (`e2e/helpers/radio.ts:80-85`).
   *
   * ⛔ DREI ANKER, UND DER DRITTE IST EIN VERBOT (E-G5, `Spec:5704-5718`): `registration
   * .unregister` und `caches.keys` muessen im Rumpf STEHEN, `addEventListener("fetch"` darf es
   * NICHT — ein `fetch`-Handler machte aus dem Abraeumer wieder einen ausliefernden Worker.
   * ⚠️ Der `content-type` wird als PRAEFIX geprueft: der Handler liefert
   * `text/javascript; charset=utf-8` (`sw.js/route.ts:34`, Datei 39 Zeilen), und eine
   * Gleichheitszusicherung zerbraeche an der Zeichensatzangabe.
   */
  test("/sw.js liefert den Abraeum-Worker, und er hat keinen fetch-Handler", async ({ page }) => {
    for (const pfad of ["/m/radio/sw.js", "/sw.js"]) {
      const antwort = await page.request.get(radioUrl(pfad));
      expect(antwort.status(), `${pfad} auf ${RADIO_HOST}`).toBe(200);
      expect(antwort.headers()["content-type"], `${pfad}: content-type`).toMatch(
        /^text\/javascript/,
      );
      expect(antwort.headers()["cache-control"], `${pfad}: cache-control`).toBe("no-cache");

      const rumpf = await antwort.text();
      expect(rumpf, `${pfad}: der Worker traegt sich aus`).toContain("registration.unregister");
      /*
       * ⚠️ DIESE ZEILE SAGT NICHT „ALLE" ZU, UND SIE HIESS BIS ZUM 2026-08-27 SO
       * („der Worker raeumt ALLE Cache-Namen"). `toContain("caches.keys")` belegt, dass der
       * Worker die Cache-LISTE abgreift — dass danach `caches.delete` ueber JEDEN Namen laeuft,
       * prueft dieser Fall nicht. Die Vollzaehligkeit haelt der Unit-Fall
       * `src/app/m/radio/_lib/sw-quelle.test.ts:132` („er loescht ALLE Cache-Namen, nicht nur
       * radio-inventar-v1"), und dort ist sie mit drei Fake-Namen falsifiziert.
       */
      expect(rumpf, `${pfad}: der Worker greift die Cache-Liste ab`).toContain("caches.keys");
      expect(rumpf, `${pfad}: KEIN fetch-Handler`).not.toContain('addEventListener("fetch"');
    }
  });

  /**
   * DIE HEALTH-FLAECHE, DIE G7 ZUSAGT — sie haette sonst keinen Wirknachweis.
   *
   * ⚠️ SIE STEHT NICHT IN DER SCHLEIFE. `/api/health` ist `PASSTHROUGH`
   * (`src/core/routing.ts:12`), die Route antwortet also HOSTUNABHAENGIG — auch auf
   * `FREMDER_HOST`. Ein 404-Anspruch dort waere falsch, und der Fall waere rot aus dem
   * richtigen Grund fuer die falsche Zusage.
   *
   * ⛔ DER WERT VON `revision` WIRD NICHT ZUGESICHERT — er ist der Commit-SHA und aendert sich
   * mit jedem Stand. Zugesichert wird die ANWESENHEIT des Feldes, weil sie die Zusage aus
   * Spec 2, V3 ist.
   * ⚠️ `revision` KOMMT GEMESSEN NICHT AUS `checkModuleHealth` — das liefert
   * `{ status, module, error? }` (`src/core/health/index.ts:4-15`, Datei 16 Zeilen) — sondern
   * aus dem Handler (`src/app/api/health/[modul]/route.ts:23-26`, Datei 27 Zeilen).
   * ⚠️ IM E2E-LAUF IST DER WERT GEMESSEN `"unbekannt"` — `SUITE_REVISION` steht nicht in
   * `webServer.env`, und `laufendeRevision()` faellt dann auf diese Zeichenkette zurueck
   * (`src/core/version.ts:21-24`, Datei 24 Zeilen). ⛔ Genau deshalb waere eine Zusicherung
   * auf den WERT hier eine Zusage ueber die Testumgebung statt ueber die Flaeche.
   */
  test("/api/health/radio nennt Modul und Revision", async ({ page }) => {
    const antwort = await page.request.get(radioUrl("/api/health/radio"));
    expect(antwort.status(), "/api/health/radio").toBe(200);

    const rumpf = (await antwort.json()) as Record<string, unknown>;
    expect(rumpf.module, "das Modul nennt sich selbst").toBe("radio");
    expect(rumpf, "die Revision ist die Rollout-Zusage aus Spec 2, V3").toHaveProperty("revision");
    expect(typeof rumpf.revision, "die Revision ist eine Zeichenkette").toBe("string");
  });

  /**
   * DIE ZWEITE HAELFTE VON `Spec:6916`, DIE BISHER FEHLTE: „der Abmelde-Route-Handler | 404,
   * UND das Cookie der laufenden Sitzung ist danach unveraendert vorhanden." Der
   * Schleifeneintrag `/m/radio/abmelden` belegt nur den 404 — dass der Riegel VOR dem
   * Cookie-Loeschen greift, ist eine EIGENE Zusage: ein Riegel HINTER der Raeumung antwortete
   * genauso mit 404.
   *
   * ⛔ DIE SITZUNG WIRD IM FALL SELBST GEPRAEGT (Bauform 27). Jeder Playwright-`test()`
   * bekommt einen frischen Kontext; ein Cookie aus einem anderen Block ueberlebt nicht.
   * `maxRedirects: 0` bei der Einloesung, weil die Zusage der Statuscode der UMLEITUNG ist und
   * `page.request` sonst der Umleitung folgte und Status und Kopfzeilen der ENDseite saehe.
   *
   * ────────────────────────────────────────────────────────────────────────────
   * ⛔ WARUM DIESER FALL ZWEI ZUSICHERUNGEN TRAEGT UND NICHT EINE — GEMESSEN, NICHT VERMUTET
   * ────────────────────────────────────────────────────────────────────────────
   * Das Ausleih-Cookie ist HOST-ONLY: `ausleihCookieOptionen` gibt kein `domain` zurueck
   * (`_lib/ausleihSitzung.ts:207-221`), und `t/[code]/route.ts:76-78` nennt genau das „die
   * ZWEITE HAELFTE dieses Riegels". Daraus folgt zweierlei, und beides ist unangenehm:
   *
   *   (a) Die Anfrage an `fremdUrl(...)` traegt das Cookie ueberhaupt nicht mit.
   *   (b) Ein `Set-Cookie` von `feedback.localtest.me` koennte den Eintrag von
   *       `radio.localtest.me` gar nicht loeschen.
   *
   * ⛔ DIE DIFFERENZIELLE COOKIE-ZUSICHERUNG IST DESHALB NICHT FALSIFIZIERBAR: sie bleibt auch
   * dann gruen, wenn der Host-Riegel des Abmelde-Handlers HINTER die Raeumung wandert.
   * ⚠️ UND DAS IST EIN OFFENER POSTEN, KEINE ERLEDIGTE ZEILE. Bis zum 2026-08-27 stand hier
   * „das ist keine Schwaeche des Tests, sondern die gemessene Lage" — der Satz stimmt, aber er
   * las sich wie eine Freizeichnung. Richtig gefasst: die woertliche Zusage von `Spec:6916` ist
   * im Lauf NICHT abgelesen, sie bleibt Restmenge von ⬜ Z-L1 (Aufstellung im Kopf dieser
   * Datei). Die Zusicherung am ENDE dieses Falls (`dasselbe Cookie, nicht nur irgendeines`)
   * bleibt trotzdem stehen — sie IST der Spec-Wortlaut, und ein stiller Wegfall waere schlimmer
   * als eine benannte Leerstelle.
   * ⚠️ SIE WIRD UEBER IHREN WORTLAUT BENANNT UND NICHT UEBER EINE ZEILENNUMMER, UND DAS IST KEINE
   * STILFRAGE: in der Fix-Runde 1 stand hier zuerst eine Ziffer, und der naechste Einschub in
   * DIESEN Kopfkommentar verschob die Zusicherung um 26 Zeilen — die Angabe war nach zwei
   * Commits falsch. Das ist genau die Klasse, die Review-Fund W1 ist, am eigenen Diff wieder
   * aufgetreten. ⛔ EIN WORTLAUT UEBERLEBT EINEN EINSCHUB, EINE ZIFFER NICHT.
   * ⛔ DIE FALSIFIZIERBARE HAELFTE IST DIE KOPFZEILEN-ZUSICHERUNG: die 404-Antwort des fremden
   * Hosts darf KEIN `Set-Cookie` fuer `radio_ausleihe` tragen. Genau die wandert mit dem
   * Riegel — ein Handler, der erst raeumt und dann abweist, schickt die Raeumung mit.
   * Die Mutationssonde S-T4f faerbt genau diese Zeile (siehe `BERICHT-T4.md`).
   * ⛔ DARUM HEISST DIESER FALL, WIE ER HEISST. Bis zum 2026-08-27 hiess er „der Abmelde-Handler
   * auf fremdem Host laesst das Sitzungs-Cookie stehen" — so, wie `briefs/T4.md:103` ihn nennt.
   * Der Name sagte damit die UNBEWACHTE Haelfte zu; der heutige sagt die bewachte. Der alte
   * Wortlaut steht hier als Zitat, damit die Ablesung nachvollziehbar bleibt.
   */
  test("der Abmelde-Handler auf fremdem Host schickt keine Cookie-Raeumung mit", async ({
    page,
  }) => {
    legeCodeAn(CODE_COOKIEFALL, CODE_COOKIEFALL_ID, "e2e T4 Aufsteller Cookie-Fall");

    const einloesung = await page.request.get(radioUrl(`/m/radio/t/${CODE_COOKIEFALL}`), {
      maxRedirects: 0,
    });
    expect(einloesung.status(), "die Einloesung muss den 303 liefern").toBe(303);

    const vorher = await ausleihCookieWert(page);
    expect(vorher, "die Vorbedingung ist eine LAUFENDE Ausleih-Sitzung").toBeTruthy();

    const fremd = await page.request.get(fremdUrl("/m/radio/abmelden"), { maxRedirects: 0 });
    expect(fremd.status(), `/m/radio/abmelden auf ${FREMDER_HOST}`).toBe(404);

    /*
     * ⛔ `headersArray()` UND NICHT `headers()`: `headers()` faltet mehrere gleichnamige
     * Kopfzeilen zusammen, und `Set-Cookie` ist der eine Kopf, bei dem das regelmaessig
     * mehrfach vorkommt. Die Liste ist die einzige Form, in der jede Zeile einzeln lesbar ist.
     */
    const geraeumt = fremd
      .headersArray()
      .filter((k) => k.name.toLowerCase() === "set-cookie")
      .filter((k) => k.value.startsWith(`${AUSLEIH_COOKIE_NAME}=`));
    expect(geraeumt, "der Riegel muss VOR der Raeumung greifen").toEqual([]);

    const nachher = await ausleihCookieWert(page);
    expect(
      nachher,
      "dasselbe Cookie, nicht nur irgendeines — woertlich Spec:6916, aber NICHT falsifizierbar",
    ).toBe(vorher);
  });

  /**
   * DIE ALIAS-ROUTEN AUF DEM AEUSSEREN PFAD — DER EINE WIRKNACHWEIS, DEN KEIN UNIT-FALL FUEHREN
   * KANN (Fix-Runde 1 zu L4, Fund W1).
   *
   * `src/app/m/radio/_lib/aliasse.test.ts` misst ZWEI HAELFTEN GETRENNT: die
   * Middleware-Entscheidung (`decideRoute`) und das Verhalten der Handler, direkt per
   * `import("../loan/route")` geladen. Was ZWISCHEN beiden liegt — dass Next.js den AEUSSEREN
   * Pfad `/loan` ueber den Host-Rewrite auf GENAU DIESE Datei aufloest — ist dort nirgends
   * gemessen. Das ist die Klasse „gruen im Test und tot im Betrieb", vor der die Bauformwahl im
   * Kopf jener Datei ausdruecklich warnt: eine `redirects()`-Regel in `next.config.ts` haette
   * beide Haelften ebenso bestanden und waere trotzdem tot.
   *
   * ⛔ DIESELBE BEGRUENDUNG WIE BEIM ABRAEUM-WORKER OBEN (`:554-559`): die zwei Pfade
   * `/m/radio/sw.js` und `/sw.js` messen VERSCHIEDENE STRECKEN. Hier wird NUR die aeussere
   * gefahren, weil ausschliesslich sie die offene Frage beantwortet — der innere Pfad umginge
   * genau den Rewrite, um den es geht.
   *
   * ⛔ WARUM HIER EIN `toBe(303)` STEHT, OBWOHL `:68-74` ES AUSSCHLIESST: jener Absatz nimmt es
   * aus der `EINSTIEGE`-SCHLEIFE heraus — die prueft `not.toBe(404)` MIT folgenden
   * Umleitungen, und dort waere die Umleitung nicht die Zusage. Hier IST sie die ganze Zusage.
   * Der Fall steht deshalb eigenstaendig, wie `/sw.js` und `/api/health/radio`, und faehrt
   * `maxRedirects: 0` (Bauform 27) — sonst folgte Playwright der 303 und meldete den Status
   * des ZIELS.
   *
   * ⛔ ANONYM, UND DAS IST DIE ZWEITE HAELFTE DER MESSUNG. `page.request.get` ohne `devLogin`
   * hat keine Suite-Sitzung. Dass `/admin/devices` trotzdem mit 303 auf `/admin/geraete`
   * antwortet — und NICHT mit einer Umleitung nach `/login` —, belegt, dass der Alias VOR jedem
   * Personen-Riegel greift. Genau das koennte eine `page.tsx` nicht: sie fiele in
   * `src/app/m/radio/riegel.test.ts` Klausel (e) und muesste `requireRadioVerwaltung()` als
   * erste Anweisung tragen. ⚠️ Das ist KEINE §4.9.6-Verletzung: verboten ist ein SICHTBARER
   * Verwaltungsweg auf einer anonymen Flaeche, nicht die Antwort auf ein getipptes altes
   * Lesezeichen. Das Ziel traegt seinen Riegel unveraendert selbst
   * (`admin/(arbeit)/geraete/page.tsx:5` Import, `:53` erste Anweisung).
   *
   * ⚠️ ZWEI ALIASSE UND NICHT NEUN: die uebrigen sieben pruefen dieselbe Aufloesungsklasse ein
   * zweites Mal, und ihr VERHALTEN deckt der Unit-Fall an allen neun ab. Hier steht je einer
   * der zwei Strecken — der Kioskpfad `/loan` (wirkt ab Cutover sofort) und der
   * `admin/`-Pfad `/admin/devices` (der anonyme Fall).
   *
   * ⛔ ER IST GRUEN GESCHRIEBEN UND DANN AN DER QUELLE ROT GEMESSEN, nicht rot-zuerst — die
   * neun Handler standen bereits. Sonde H (`_lib/aliasse.ts`, Ziel `/loan` auf `/rueckgabe`
   * getauscht) und Sonde I (`loan/route.ts` entfernt) faerbten ihn je `1 rot`, Sonde I mit
   * `404 statt 303`: das ist der Beleg, dass der aeussere Pfad wirklich in DIESER Datei landet.
   */
  test("die Alias-Routen antworten auf dem AEUSSEREN Pfad mit 303 auf ihr Ziel", async ({
    page,
  }) => {
    for (const [alt, ziel] of [
      ["/loan", "/ausleihen"],
      ["/admin/devices", "/admin/geraete"],
    ] as const) {
      const antwort = await page.request.get(radioUrl(alt), { maxRedirects: 0 });
      expect(antwort.status(), `${alt} auf ${RADIO_HOST}`).toBe(303);
      expect(antwort.headers()["location"], `${alt}: das Ziel`).toBe(ziel);
    }
  });
});
