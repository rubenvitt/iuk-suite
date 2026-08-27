/**
 * DIE ALIAS-TAFEL FUER DIE ALTEN PFADE — Betreiberentscheidung vom 2026-08-27
 * (`.superpowers/sdd/adminlink/KONTEXT.md`: „Die alten Pfade bekommen Alias-Routen im
 * Modul"). Die Messung dahinter ist `.superpowers/sdd/BERICHT-urls-und-adminzugang.md`,
 * Frage 1: von ZWANZIG aeusseren Alt-Pfaden bleiben ZWEI zeichengleich.
 *
 * ⛔ EIN REINES WERTMODUL PLUS ZWEI REINE FUNKTIONEN — keine Bauform-Direktive, kein Zugriff
 * auf `_db/`, kein `next/*`-Import. Es liegt unter `_lib/`, weil `riegel.test.ts` dort BEIDE
 * Direktiven verbietet: ein `"use client"` machte aus dieser Tafel eine Client-Referenz
 * (Falle 6), ein `"use server"` eine Serverreferenz. Dieselbe Begruendung wie im Kopf von
 * `_lib/routen.ts`.
 *
 * ⛔ WARUM DIE TAFEL NICHT IN `_lib/routen.ts` STEHT: jene zwei Listen sind SPEC-GEBUNDEN und
 * ihre Laengen sind zugesichert (`_lib/routen.test.ts:66-104`: `toBe(6)` und `toBe(12)` aus
 * `Spec:275-284` und `Spec:301-314`). Ein Alias ist kein aeusserer Pfad des Moduls im Sinne
 * jener Tabellen, sondern eine Uebergangsbruecke fuer einen Pfad, den es im Modul GERADE
 * NICHT gibt. In dieselbe Liste geschrieben verloeren beide Zahlen ihre Aussage.
 *
 * ⚠️ WELCHE ALIASSE HEUTE SCHON GREIFEN UND WELCHE ERST MIT C2 — das ist der Unterschied,
 * den ein Leser sonst ueberliest, und er steht je Zeile unten:
 *
 *   Der ALT-KIOSK laeuft schon heute unter `radio.iuk-ue.de` (Bericht §1.1, gestuetzt auf
 *   `docs/superpowers/plans/2026-08-24-radio-modul-plan4-grenze-verwaltung.md:84`). Seine
 *   Alt-Pfade treffen das Modul ab dem Cutover unmittelbar — die Aliasse dafuer wirken sofort.
 *
 *   Die VERWALTUNG lag unter `radio-admin.iuk-ue.de`. Dieser Host verschwindet; seine Pfade
 *   erreichen das Modul ausschliesslich ueber den pfaderhaltenden Traefik-Redirect **C2**
 *   (Praefix `/admin`, Entwurf in `.env.example:600-605`). ⛔ C2 IST NICHT GEBAUT (Bericht
 *   §1.6, `- [ ] C2` in `docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md:418`).
 *   Die drei Aliasse, die nur an ihm haengen, sind die Modul-Haelfte einer zweiteiligen
 *   Reparatur — ohne C2 laufen sie ins Leere, weil ihr Host gar nicht mehr aufloest.
 *
 * ⛔ WAS BEWUSST OHNE ALIAS BLEIBT, damit niemand es fuer eine Luecke haelt. Vier Alt-Pfade
 * bekommen KEINE Weiterleitung, weil ihre Funktion ERSATZLOS entfaellt — eine Weiterleitung
 * auf eine Flaeche, die etwas anderes tut, waere teurer als eine 404:
 *
 *   `/setup`            Anlegen des ERSTEN lokalen Verwalterkontos
 *                       (`radio-inventar/apps/frontend/src/routes/setup.tsx:2`). Die Suite
 *                       kennt keine lokalen Konten; die Identitaet kommt aus Pocket ID.
 *   `/qr-code`          die Druckseite des Alt-QR, und der Alt-QR trug den API-Token
 *                       (`.../components/features/admin/AppQRCode.tsx:20-23`). Der Nachfolger
 *                       `/admin/zugaenge/blatt` traegt `requireRadioAdmin` — ein Alias von
 *                       einer anonymen Kioskflaeche dorthin schickte ein Tablet ohne
 *                       Suite-Sitzung in den Login-Umweg. Das ist genau der „sichtbare Weg
 *                       dorthin, wo die aufrufende Person nicht hindarf" aus §4.9.6.
 *   `/admin/settings`   ⛔ ABWEICHUNG VOM MESSBERICHT, nachgemessen: die Seite ist NICHT die
 *                       aufgeteilte Einstellungsflaeche, sondern die Aenderung von
 *                       Benutzername und Passwort
 *                       (`radio-inventar/apps/frontend/src/routes/admin/settings.tsx:2-5`).
 *                       Sie schreibt heute schon selbst „Pocket ID verwaltet den Login"
 *                       (`:41-47`). Die Aufteilung auf `/admin/versionen` + `/admin/zugaenge`
 *                       gehoert `radio-admin`s `/einstellungen`, nicht dieser Seite.
 *   `/403`              die Abweisungsseite von `radio-admin`
 *                       (`radio-admin/client/src/pages/ForbiddenPage.tsx`). Die Suite weist
 *                       mit `notFound()` ab und AUSDRUECKLICH NICHT mit 403
 *                       (`_lib/zugang.ts:516`, „NICHT 403"). Die 404, die dieser Pfad ohne
 *                       Alias liefert, IST die neue Antwort auf dieselbe Lage.
 *
 * ⚠️ UND FUENF ALT-PFADE BRAUCHEN GAR KEINEN ALIAS, weil sie zeichengleich aufloesen: `/` und
 * `/admin` des Kiosks sowie — mit C2 — `/` (auf `/admin/`), `/ausleihen` und `/import` von
 * `radio-admin`. ⛔ `/` bedient dahinter etwas anderes als frueher (das Gate statt der
 * Bestandsliste), und ein alter, gedruckter QR mit `?token=` landet dort STILL im leeren
 * Codefeld (Bericht §1.5). Das ist entschieden und zweifach bewacht
 * (`_lib/ausleihZugang.test.ts:535-540`); die Abhilfe ist betrieblich — die gedruckten Codes
 * einsammeln —, nicht technisch. Ein Alias kann daran nichts richten.
 */

/** Der EINE Platzhalter, den ein Alt-Pfad tragen darf. */
export const PLATZHALTER = ":id";

export type AliasRoute = {
  /** Der aeussere ALT-Pfad, so wie er im Lesezeichen steht. */
  readonly alt: string;
  /** Der aeussere NEU-Pfad. Traegt der Alt-Pfad den Platzhalter, traegt das Ziel ihn auch. */
  readonly ziel: string;
};

/**
 * ⛔ NEUN EINTRAEGE FUER ELF ALT-PFADE. `/admin/devices` und `/admin/login` bedienen je zwei:
 * den gleichnamigen Pfad des Kiosks UND den von `radio-admin`, der mit C2 unter demselben
 * Namen ankommt. Die Aufstellung ueber alle zwanzig fuehrt
 * `.superpowers/sdd/adminlink/BERICHT-L4.md`.
 */
export const ALIAS_ROUTEN: readonly AliasRoute[] = [
  /*
   * KIOSK, wirkt sofort. `/loan` und `/return` sind die zwei Arbeitspfade, die auf JEDEM
   * Tablet im Lesezeichen stehen (`radio-inventar/apps/frontend/src/routes/loan.tsx:16`,
   * `return.tsx:13`). Beide Ziele sind anonym erreichbar wie ihre Vorgaenger — der Alias
   * verschiebt keine Berechtigung.
   */
  { alt: "/loan", ziel: "/ausleihen" },
  { alt: "/return", ziel: "/rueckgabe" },

  /*
   * KIOSK, wirkt sofort. `/token-setup` war die ERSTE Flaeche eines frischen Tablets: ohne
   * hinterlegten Token schickte `__root.tsx:88-90` jeden Aufruf dorthin. Die Frage, die sie
   * stellte — „womit bekommt dieses Geraet Zugang?" —, beantwortet in der Suite das Gate mit
   * dem Codefeld. ⛔ DESHALB `/` UND NICHT `/geraete`: eine Person MIT Suite-Sitzung wird von
   * `/` ohnehin sofort auf `/geraete` weitergereicht (`page.tsx:75`), eine ohne sieht das
   * Codefeld. Ein Alias direkt auf `/geraete` uebersprunge das Gate fuer niemanden und
   * verlangte fuer alle anderen erst die Abweisung.
   */
  { alt: "/token-setup", ziel: "/" },

  /*
   * KIOSK UND (mit C2) `radio-admin`. Beide Alt-Anwendungen hatten eine EIGENE Anmeldeseite
   * (`radio-inventar/.../routes/admin/login.tsx:18`,
   * `radio-admin/client/src/routes/router.tsx:15`); `radio-admin`s `/login` kommt mit C2 als
   * `/admin/login` an. Die Suite hat dafuer keine Modulflaeche und kann keine haben:
   * `/login` steht in `PASSTHROUGH` (`src/core/routing.ts:12`) und erreicht das Modul nie.
   *
   * ⛔ DAS ZIEL IST `/admin` UND NICHT `/login`, und das ist der Punkt: `/admin` erledigt die
   * Anmeldung selbst und BESSER — `riegelAufStufe` schickt eine Sitzungslose nach
   * `/login?callbackUrl=<verwaltungsZiel>` (`_lib/zugang.ts:513`), sie landet nach dem
   * Anmelden also IN der Verwaltung statt auf der Portalstartseite. Eine angemeldete Person
   * ohne Gruppe bekommt `notFound()` (`:516`). Beides ist genau die Antwort, die der
   * Alt-Login gegeben haette.
   *
   * ⚠️ Damit ueberholt diese Zeile eine frueher hingenommene Lage: `_lib/routen.test.ts`
   * fuehrte `/admin/login` als „Rewrite und danach 404 — hingenommen, mit Runbook-Zeile" und
   * schrieb „Die Abhilfe ist eine Runbook-Zeile, KEIN Code im Repo." Die
   * Betreiberentscheidung vom 2026-08-27 kehrt das um.
   */
  { alt: "/admin/login", ziel: "/admin" },

  /*
   * KIOSK UND (mit C2) `radio-admin`. `/admin/devices` ist der Kioskpfad
   * (`.../routes/admin/devices.tsx:13`); `radio-admin`s `/devices` (`router.tsx:25`) kommt mit
   * C2 unter genau demselben Namen an. EIN Handler bedient beide.
   */
  { alt: "/admin/devices", ziel: "/admin/geraete" },

  /*
   * NUR mit C2. `radio-admin`s `/devices/:id` (`router.tsx:26`) — die Geraeteakte, der
   * einzige Alt-Pfad mit einem Parameter.
   *
   * ✅ UND ER TRAEGT, WEIL DIE KENNUNGEN ERHALTEN BLEIBEN — gemessen, nicht gehofft:
   * `_db/schema.ts:11-12` schreibt aus, „bestehende Primaerschluessel wandern zeichengleich
   * (cuid2 aus radio-admin/server/src/db/id.ts)". Ein Lesezeichen auf eine Geraeteakte
   * loest nach dem Umzug also dieselbe Zeile auf. Waeren die Kennungen neu vergeben, waere
   * dieser Alias eine Weiterleitung in eine sichere 404 und die Geraeteliste das bessere Ziel.
   */
  { alt: `/admin/devices/${PLATZHALTER}`, ziel: `/admin/geraete/${PLATZHALTER}` },

  /*
   * KIOSK, wirkt sofort. `/admin/history` war die Ausleihhistorie
   * (`.../routes/admin/history.tsx:37`). Die Suite fuehrt sie als `/admin/ausleihen`
   * (`_lib/nav.ts:63`). ⚠️ Die geraetebezogene Zweitform
   * `/admin/geraete/<id>/ereignisse` ist NICHT das Ziel: der Alt-Pfad trug keinen
   * Geraetebezug, und ein Alias kann keinen erfinden.
   */
  { alt: "/admin/history", ziel: "/admin/ausleihen" },

  /*
   * NUR mit C2. `radio-admin`s `/update` (`router.tsx:28`), im Alt-Menue „Update-Modus"
   * (`client/src/layout/AppLayout.tsx:34`). ⚠️ Titel und Pfad gehen in der Suite bewusst
   * auseinander: die Flaeche heisst weiter „Update-Modus", ihr Pfad ist `/admin/software`
   * (`_lib/nav.ts:64-68` fuehrt Titel und Pfad ausdruecklich auseinander). Genau deshalb
   * faellt dieser Alt-Pfad sonst ins Leere.
   */
  { alt: "/admin/update", ziel: "/admin/software" },

  /*
   * NUR mit C2. `radio-admin`s `/einstellungen` (`router.tsx:30`) — DIES ist die aufgeteilte
   * Flaeche, nicht `/admin/settings` des Kiosks: `SettingsPage.tsx:10-16` ist eine
   * Reiterleiste aus „Softwareversionen" und „API-Zugriff".
   *
   * ⛔ DAS ZIEL IST `/admin/versionen`, UND DIE WAHL IST GEMESSEN, NICHT GEWUERFELT. Erstens
   * oeffnete die Alt-Seite selbst auf dem Versionen-Reiter (`defaultActiveKey="versions"`,
   * `SettingsPage.tsx:11`) — wer das Lesezeichen setzte, sah diesen Inhalt. Zweitens benennt
   * Entscheidung **B9** `/admin/versionen` ausdruecklich als den Ersatz fuer
   * `/admin/einstellungen` (`_lib/nav.ts:79`, `_lib/routen.test.ts:110-113`). Der zweite
   * Reiter ist von `/admin/versionen` aus ueber die Verwaltungsnavigation eine Zeile
   * entfernt; umgekehrt waere der Regelfall der Umweg.
   *
   * ⚠️ DER EINZIGE ALIAS, AN DEM DIE RECHTESTUFE DAS ERGEBNIS AENDERT — und das gehoert
   * gesagt (Fix-Runde 1 zu L4, Fund S6). `/admin/versionen` traegt `requireRadioAdmin()` und
   * ausdruecklich NICHT `requireRadioVerwaltung()`; ein UPDATER bekommt dort `notFound()`.
   * ✅ Das ist VERHALTENSGETREU und keine neue Sperre: die Alt-Seite war ebenso admin-only
   * (`radio-admin/client/src/pages/SettingsPage.tsx:9` `RequireRole role="admin"`,
   * `client/src/layout/AppLayout.tsx:36` `adminOnly: true`). ⚠️ Die Gegenprobe traegt:
   * `/admin/update` → `/admin/software` fuehrt `requireRadioVerwaltung()`, dort kommt der
   * Updater an — und der Alt-Pfad war ebenfalls nicht admin-only (`AppLayout.tsx:34`).
   */
  { alt: "/admin/einstellungen", ziel: "/admin/versionen" },
];

/**
 * Setzt den einen Platzhalter ein. Ein Muster ohne ihn bleibt unberuehrt.
 *
 * ⛔ `encodeURIComponent` IST HIER PFLICHT UND KEINE SORGFALT: `wert` kommt aus der URL und
 * landet in einem `Location`-Kopf, wo keine React-Entkommung schuetzt. Ein Wert mit `\r\n`
 * baute sonst Header-Injection ein — dieselbe Fehlerklasse, gegen die `_lib/gateTexte.ts:44-54`
 * den `grund` gegen einen geschlossenen Satz prueft, statt ihn durchzureichen.
 */
export function einsetzen(muster: string, wert: string): string {
  return muster.includes(PLATZHALTER)
    ? muster.replace(PLATZHALTER, encodeURIComponent(wert))
    : muster;
}

/**
 * Der modulrelative Pfad der Handlerdatei zu einem Alt-Pfad — ABGELEITET, nicht aufgezaehlt.
 * Eine zweite, gepflegte Spalte in der Tafel oben waere ein zweiter Ort fuer dieselbe
 * Aenderung; `_lib/aliasse.test.ts` koppelt Ableitung und Dateibaum in beide Richtungen.
 */
export function handlerDatei(alt: string): string {
  return `${alt.replace(/^\//, "").replace(/:(\w+)/g, "[$1]")}/route.ts`;
}

/**
 * DIE ANTWORT EINES ALIAS — an EINER Stelle, nicht neunmal abgeschrieben (die Begruendung
 * fuehrt `_lib/hostRiegel.ts:27-32` fuer den Host-Riegel aus: fuenf Kopien heissen fuenf Orte
 * fuer dieselbe Aenderung).
 *
 * ⛔ RELATIVES `Location`, UND DAS IST DIE TRAGENDE ZEILE. Eine absolute URL waere entweder
 * aus einer Basis-Variablen GERATEN oder aus `req.url` gebaut — und `req.url` traegt nach dem
 * Modul-Host-Rewrite den INNEREN Pfad `/m/radio/…`. Der Browser landete auf einer Adresse,
 * die er nie gesehen hat. Ein relatives `Location` loest er gegen die URL auf, die ER sah
 * (RFC 7231 §7.1.2). ⚠️ Bei `radio` ist der Bruch teurer als bei `lagerbuch`, weil es KEIN
 * Parallelfenster gibt (Spec:2284-2296): der einzige Rueckweg waere „Router zurueck".
 *
 * ⛔ 303 UND NIEMALS 301 ODER 308. Ein PERMANENTER Redirect liegt im Cache jedes Telefons und
 * macht den Rollback unmoeglich — dieselbe Auflage, die `.env.example:607-608` fuer den
 * Traefik-Redirect C2 als `permanent=false` ausschreibt. Ein Alias ist eine Uebergangsbruecke;
 * er darf sich in den Geraeten nicht festsetzen. 303 statt 302 folgt der Hausform der zwei
 * bestehenden aeusseren Handler (`abmelden/route.ts:88`, `t/[code]/route.ts:176-178`) und sagt
 * ausdruecklich, was hier gemeint ist: nach dem Folgen bleibt es ein GET.
 *
 * ⛔ DER QUERY-STRING DES ALT-AUFRUFS FAELLT WEG, UND DAS IST ENTSCHIEDEN, NICHT VERGESSEN
 * (Fix-Runde 1 zu L4, Fund W2). `ziel` ist der reine Zielpfad; `req.url` wird hier nirgends
 * gelesen. Drei der elf aliasierten Alt-Pfade trugen nachweislich Parameter:
 * `/loan?deviceIds=` (`radio-inventar/apps/frontend/src/routes/loan.tsx:12-14`),
 * `/admin/history?page=&pageSize=&deviceId=&from=&to=` (`.../routes/admin/history.tsx:25-31`)
 * und `/devices?q=&status=&location=&updateStatus=`
 * (`radio-admin/client/src/pages/DevicesPage.tsx:13-21`).
 *
 * ⛔ DER GRUND IST NICHT „DIE NAMEN SIND ANDERE", SONDERN DER TEILFILTER — die teurere
 * Haelfte, und sie ist gemessen. Bei `/devices` sind `q` und `status` ZEICHENGLEICH mit den
 * Parametern der Suite-Geraeteliste (`_lib/suchparameter.ts:200`, `:219` ueber
 * `FILTER_LISTEN:56-64`), `location` und `updateStatus` aber NICHT — die Suite fuehrt sie als
 * `lagerort` (`:220`) und `updateStand` (`:212`). Ein durchgereichter Query wendete also EINEN
 * TEIL der Kriterien an und liesse den anderen still fallen: die Liste zeigte MEHR Zeilen als
 * das Lesezeichen versprach und saehe dabei gefiltert aus. Ein weggelassener Query liefert
 * eine sichtbar UNgefilterte Liste. „Laut ist besser als still" (`CLAUDE.md`, Falle 7).
 * ⚠️ Bei den anderen zwei trifft kein einziger Name: `/loan?deviceIds=` gegen
 * `/ausleihen?geraete=` (`_lib/auswahl.ts:61`), `/admin/history?deviceId=&from=&to=` gegen
 * `/admin/ausleihen?geraet=&von=&bis=` (`_lib/suchparameter.ts:509-512`).
 *
 * ⚠️ DAS IST DIESELBE ANTWORT WIE FUER DEN GEDRUCKTEN ALT-QR mit `?token=` auf `/`
 * (Kopf dieser Datei, Bericht §1.5): der Parameter verfaellt, die Abhilfe ist betrieblich —
 * die alten Lesezeichen und Blaetter einsammeln —, nicht technisch. Der Verhaltensfall dazu
 * steht in `_lib/aliasse.test.ts`.
 */
export function aliasAntwort(ziel: string): Response {
  return new Response(null, { status: 303, headers: { Location: ziel } });
}

/**
 * Das Ziel zu einem Alt-Pfad — die EINE Quelle, aus der die neun Handler ihren `Location`
 * beziehen. Ohne sie stuende jedes Ziel zweimal im Baum: einmal in der Tafel oben, einmal im
 * Handler, und eine Aenderung an einer Stelle bliebe still.
 *
 * ⛔ SIE WIRFT, STATT `null` ZU LIEFERN. Ein unbekannter Alt-Pfad kann nur ein Tippfehler im
 * Handler sein, und ein stiller Rueckfall auf 404 saehe im Betrieb genauso aus wie „Alias
 * vergessen". Erreichbar ist der Wurf nicht: `_lib/aliasse.test.ts` ruft jeden der neun
 * Handler und koppelt Tafel und Dateibaum in beide Richtungen.
 */
export function aliasZiel(alt: string): string {
  const treffer = ALIAS_ROUTEN.find((eintrag) => eintrag.alt === alt);
  if (!treffer) throw new Error(`kein Alias-Eintrag fuer ${alt} in ALIAS_ROUTEN`);
  return treffer.ziel;
}
