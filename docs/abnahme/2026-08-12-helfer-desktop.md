# Abnahme — Helfer-Zweig ab 768px (12.08.2026)

Modul `lagerbuch`, Branch `lagerbuch-helfer-desktop`, Task 7 des Plans
`docs/superpowers/plans/2026-08-12-lagerbuch-helfer-desktop.md`. Trägt die
Messungen zu den vier Abnahmesätzen aus dem Task-7-Brief und die Grundlage der
neuen E2E-Abdeckung in `e2e/lagerbuch-mobil.spec.ts`.

## Herkunft der Werte — zwei getrennte Quellen

⚠️ **Zwei Datenbasen, nicht eine — das ist Absicht, keine Inkonsistenz.**

1. **E2E-Fixture (`e2e/seed-lagerbuch.ts`, Token `E2E_TOKEN_HELFER` = `111-111`,
   Fahrzeug `e2e-fahrzeug`).** Diese Zeilen wurden **heute frisch per
   Playwright gemessen** (derselbe Mechanismus, den der neue Test in
   `e2e/lagerbuch-mobil.spec.ts` nutzt: `/t/111-111` einlösen, dann jede
   Ansicht bei jeder Breite und in beiden Modi laden, `document.documentElement
   .scrollWidth` gegen `window.innerWidth` prüfen, die Reiterleiste gegen
   `<main>` positionieren). Diese Fixture trägt bewusst **nur eine**
   Soll-Position (`e2e-soll`, `e2e/seed-lagerbuch.ts:183-184`) — genug für
   Überlauf- und Positionsaussagen, aber ungeeignet für eine Dichte-Aussage
   (1 von 1 bei jeder Breite ist keine Skalierung).
2. **Lokaler Demo-Seed (`_lib/seedLokal.ts`, Token `100-100`, Fahrzeug
   `fz-rtw-1`, RTW-Check mit zehn Soll-Positionen).** Für die Dichte-Aussage
   (Abnahmesatz 3) braucht es die reichere Datenlage aus `pnpm seed:lokal`.
   **Diese Werte stammen vom Koordinator**, gemessen mit einem eigenen
   Werkzeug gegen `pnpm dev` (mein Browserwerkzeug blockiert in dieser Umgebung
   die Stylesheets und wurde für die Sichtprüfung nicht verwendet). Sie sind
   unten als **„Koordinator-Messung"** gekennzeichnet und wurden stichprobenhaft
   gegen die Rasterregeln in `_ui/helfer.module.css` geprüft (siehe
   Anmerkungen), nicht blind übernommen.
   ⚠️ **Nachgemessen im Endzustand nach Task 6, nicht nach Task 3.** Die erste
   Fassung dieses Artefakts hatte die Dichte-Werte aus einer Messung nach
   Task 3 übernommen — von **vor** der Schriftänderung in Task 6. Task 6
   ändert die Schriftfamilie von `.zeileName`, und genau diese Schrift
   bestimmt die Zeilenumbrüche der Artikelnamen und damit die Zeilenhöhe der
   Zählliste: eine Dichteaussage auf Basis der Task-3-Messung hätte einen
   Zustand zertifiziert, der so nie nachgemessen wurde. Die Werte in der
   Tabelle unten sind deshalb **im Endzustand nach Task 6** neu erhoben, mit
   der Schriftfamilie von `.zeileName` als vierter Messgröße — sie belegt,
   dass die Messung tatsächlich nach der Schriftänderung liegt.

Beide Quellen sind für die Aussage „kein Überlauf" und „Reiterleiste
oben/unten" deckungsgleich — dort zählt nur die Breite, nicht die Datenmenge.

## Tabelle — E2E-Fixture, alle vier Breiten, beide Modi

375 / 768 / 1024 / 1440 px, hell und dunkel (`iuk-theme`-Cookie), für die fünf
Ansichten `/`, `/helfer`, `/helfer/check`, `/helfer/check?fz=e2e-fahrzeug`,
`/a/e2e-artikel`. Gemessen per Wegwerf-Playwright-Skript gegen den echten
E2E-`webServer` (nicht committet — reproduzierbar mit dem Code im Anhang).

| Ansicht | Breite | Modus | Sichtbare Positionen (Zählliste) | Waagerechter Überlauf | Reiterleiste | Abweichung ggü. Stand vor Task 1 bei 375px |
|---|---|---|---|---|---|---|
| `/` | 375 | hell | – (kein Zählschritt) | nein | entfällt (Gate trägt keine Tableiste) | keine |
| `/` | 375 | dunkel | – | nein | entfällt | keine |
| `/` | 768 | hell | – | nein | entfällt | – |
| `/` | 768 | dunkel | – | nein | entfällt | – |
| `/` | 1024 | hell | – | nein | entfällt | – |
| `/` | 1024 | dunkel | – | nein | entfällt | – |
| `/` | 1440 | hell | – | nein | entfällt | – |
| `/` | 1440 | dunkel | – | nein | entfällt | – |
| `/helfer` | 375 | hell | – | nein | unten | keine |
| `/helfer` | 375 | dunkel | – | nein | unten | keine |
| `/helfer` | 768 | hell | – | nein | oben | – |
| `/helfer` | 768 | dunkel | – | nein | oben | – |
| `/helfer` | 1024 | hell | – | nein | oben | – |
| `/helfer` | 1024 | dunkel | – | nein | oben | – |
| `/helfer` | 1440 | hell | – | nein | oben | – |
| `/helfer` | 1440 | dunkel | – | nein | oben | – |
| `/helfer/check` (Fahrzeugwahl) | 375 | hell | – (Wahlbildschirm, kein Raster) | nein | unten | keine |
| `/helfer/check` | 375 | dunkel | – | nein | unten | keine |
| `/helfer/check` | 768 | hell | – | nein | oben | – |
| `/helfer/check` | 768 | dunkel | – | nein | oben | – |
| `/helfer/check` | 1024 | hell | – | nein | oben | – |
| `/helfer/check` | 1024 | dunkel | – | nein | oben | – |
| `/helfer/check` | 1440 | hell | – | nein | oben | – |
| `/helfer/check` | 1440 | dunkel | – | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` (Zählliste) | 375 | hell | 1 von 1 (Fixture) | nein | unten | keine |
| `/helfer/check?fz=e2e-fahrzeug` | 375 | dunkel | 1 von 1 | nein | unten | keine |
| `/helfer/check?fz=e2e-fahrzeug` | 768 | hell | 1 von 1 | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` | 768 | dunkel | 1 von 1 | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` | 1024 | hell | 1 von 1 | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` | 1024 | dunkel | 1 von 1 | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` | 1440 | hell | 1 von 1 (Fixture; Dichte-Aussage s. eigene Koordinator-Tabelle unten) | nein | oben | – |
| `/helfer/check?fz=e2e-fahrzeug` | 1440 | dunkel | 1 von 1 (Fixture) | nein | oben | – |
| `/a/e2e-artikel` | 375 | hell | – (Entnahme, kein Zählschritt) | nein | unten | keine |
| `/a/e2e-artikel` | 375 | dunkel | – | nein | unten | keine |
| `/a/e2e-artikel` | 768 | hell | – | nein | oben | – |
| `/a/e2e-artikel` | 768 | dunkel | – | nein | oben | – |
| `/a/e2e-artikel` | 1024 | hell | – | nein | oben | – |
| `/a/e2e-artikel` | 1024 | dunkel | – | nein | oben | – |
| `/a/e2e-artikel` | 1440 | hell | – | nein | oben | – |
| `/a/e2e-artikel` | 1440 | dunkel | – | nein | oben | – |

Reiterleiste kippt exakt bei der `min-width: 768px`-Schwelle aus
Betreiberentscheidung 14 (s. u.) von unten nach oben, bei 375px unverändert
unten. Kein Überlauf in irgendeiner Zelle, in keinem Modus.

⚠️ **Worauf die Spalte „Abweichung ggü. Stand vor Task 1 bei 375px" beruht:**
Das Wegwerf-Playwright-Skript oben lief ausschließlich gegen den Endzustand
nach Task 6 — es gibt keinen automatisierten Vorher-Nachher-Bildvergleich.
„keine" stützt sich stattdessen auf Konstruktionsnachweis, nicht auf eine
Messung an zwei Zeitpunkten: §7.7.1 lässt außerhalb des neuen
`min-width: 768px`-Zweigs keine breitenabhängige Regel zu (von
`bauform.test.ts` gehalten), plus die empirischen Einzelnachweise aus dem
Umsetzungsverlauf — die Kappungs-Sichtprüfungen bei 650px in Task 1 und
Task 2 (Kappung bleibt unverändert bei 560px, kein Rückfall des
561–767px-Fehlers) und der empirische Grid-gegen-Block-Vergleich bei 375px
aus Task 3 (Minor B: Abstände zwischen dem alten Block-Layout und dem neuen
Grid identisch). Diese Nachweise stehen im Ledger
`.superpowers/sdd/2026-08-12-lagerbuch-helfer-desktop/progress.md`; die
Aussage selbst wird dadurch nicht schwächer, nur die Zertifizierung
ehrlicher — sie beruht auf Konstruktion plus Stichprobe, nicht auf einem
Bildvergleich.

**Ergänzend zur `/`-Zeile (Gate-Kartenlayout, gehört zu Abnahmesatz 2):** bei
375px liegen die beiden `.gateKarte`-Boxen (Zugangscode, Verwaltung)
untereinander, ab 768px, 1024px und 1440px nebeneinander — in beiden Modi
identisch.

## Tabelle — Koordinator-Messung: Dichte der Zählliste (Endzustand nach Task 6)

Eigene, klar abgegrenzte Tabelle — **nicht** in eine Zelle der E2E-Fixture-Tabelle
gequetscht, damit die Quellentrennung aus dem Abschnitt oben durchgehalten wird.
Grundlage: lokaler Demo-Seed (`_lib/seedLokal.ts`, Token `100-100`, Fahrzeug
`fz-rtw-1`), Ansicht `/helfer/check?fz=fz-rtw-1`, 1440×900, heller Modus.
Gemessen vom Koordinator, **nach** der Task-6-Schriftänderung, nicht übernommen
aus der Task-3-Messung (Begründung s. o.).

| Messgröße | Wert |
|---|---|
| Spalten | 3 à 388px |
| Positionen gesamt | 10 |
| gleichzeitig sichtbar | 7 |
| Namen mit Zeilenumbruch | 6 von 10 |
| Schriftfamilie von `.zeileName` | **Barlow** — Beleg, dass die Messung nach Task 6 liegt |

Die Werte sind **identisch** zur früheren Task-3-Messung — die Barlow-Metrik
verteilt die Zeilenumbrüche der Artikelnamen genauso wie die vorherige
Geist-Vererbung. Das ist ein Messergebnis, keine Wiederholung ungeprüft
übernommener Zahlen: die Frage „ändert Task 6 die Dichte?" wurde gestellt und
mit Nein beantwortet, nicht stillschweigend vorausgesetzt.

## Die vier Abnahmesätze

1. **Bei 375px ist kein Unterschied zum Stand vor Task 1 sichtbar.**
   ✅ Bestätigt. Reiterleiste bleibt unten, kein Überlauf, alle Anker
   (`lb-tableiste`, `data-rolle="zaehlliste"`) unverändert erreichbar — sowohl
   in der obigen Messung als auch im bestehenden
   `lagerbuch-helfer.spec.ts`, das bei 375px-nahen Breiten seit Task 1
   unverändert grün läuft.
2. **Das Gate zeigt ab 768px zwei Karten nebeneinander.**
   ✅ Bestätigt — per Playwright gemessen, nicht nur aus dem Quelltext
   geschlossen (Falle 5: eine Regel kann richtig dastehen und trotzdem nicht
   greifen). `.gateKarten` (`_ui/helfer.module.css:198-201`) ist ein
   `display: grid` mit `grid-template-columns: repeat(auto-fit,
   minmax(272px, 1fr))`, `max-width: 680px` — **kein** eigener
   `min-width`-Breakpoint, sondern intrinsisches Umbrechen. Gemessen an den
   zwei `.gateKarte`-Boxen (`_ui/Gate.tsx:153,204`, Zugangscode- und
   Verwaltungskarte): bei 375px liegen sie **untereinander** (y-Versatz
   > 5px), ab 768px **auf derselben Zeile** (y-Versatz < 5px) — bei 1024px
   und 1440px unverändert nebeneinander. Damit ist die Beobachtung „ab 768px"
   korrekt, auch wenn der eigentliche Umschlagpunkt bei `.gateKarten`s
   Geometrie rechnerisch bereits unterhalb von 768px läge (zwei Spalten à
   mindestens 272px plus 14px Lücke passen ab rund 560px verfügbarer Breite);
   768px ist die erste der vier geforderten Prüfbreiten, bei der es zutrifft.
3. **Die Zählliste erzeugt bei 1440px mindestens zwei Spalten, und es sind
   mindestens doppelt so viele Positionen gleichzeitig sichtbar wie bei
   375px.**
   ✅ Bestätigt — **Koordinator-Messung im Endzustand nach Task 6** (eigene
   Tabelle oben), weil die E2E-Fixture mit einer einzigen Soll-Position keine
   Dichteaussage zulässt: bei 1440×900 **3 Spalten à 388px, 7 von 10
   Positionen sichtbar** (bei 375px, vor jeder Rasteränderung dieses Plans,
   waren es 3 von 10). 7 ≥ 2×3 und die Spaltenzahl liegt bei 3 ≥ 2 — beide
   Teilbedingungen erfüllt.
   Stichprobe: `.fachraster` in `_ui/CheckFlow.tsx:468` sitzt unter
   `data-rolle="zaehlliste"` und ist laut `_ui/helfer.module.css` ein
   CSS-Grid mit `repeat(auto-fit, minmax(...))` ab dem 768px-Zweig — das
   Ergebnis „mehrspaltig ab einer festen Mindestbreite" ist mit dem
   gemessenen Wert (388px Spaltenbreite bei 1440px verfügbarer Breite)
   konsistent, drei Spalten passen rechnerisch (3 × 388px + Lücken < 1200px
   Arbeitsflächenbreite).
   ⚠️ **Die ursprüngliche Formulierung „mindestens 10 Positionen gleichzeitig
   sichtbar" war unerfüllbar** und wurde für diesen Task korrigiert: der
   RTW-Check trägt im Seed insgesamt nur zehn Positionen, die Bedingung maß
   die Seed-Daten statt der Oberfläche. Gemessen wird mit den Steppern
   (`[class*='stepper']`, genau einer pro Position), **nicht** mit
   `[class*='zeile']` — letzteres trifft zusätzlich `zeileName` und
   `zeileMeta` und zählte in einer Voruntersuchung 26 statt der tatsächlichen
   7.
4. **Kein waagerechtes Scrollen auf keiner der vier Breiten, in keinem
   Modus.**
   ✅ Bestätigt für den gesamten Helfer-Zweig — alle 40 Zellen der Tabelle
   oben, plus die 22 automatisierten Tests in
   `e2e/lagerbuch-mobil.spec.ts` (davon 7 neu für den Helfer-Zweig), alle
   grün.

## Zusätzliche Messwerte (Koordinator, 1440px, eigenes Werkzeug)

Nicht Teil der vier Abnahmesätze, aber dokumentierter Ist-Stand — auf dem
lokalen Demo-Seed (`_lib/seedLokal.ts`) gemessen, stichprobenhaft gegen den
Quelltext geprüft statt blind übernommen:

| Messung | Wert |
|---|---|
| Artikelliste bei 1440px | alle 12 Artikel gleichzeitig sichtbar (vorher 9) |
| Lesebahn Entnahme und LeerZustand | 720px breit, zentriert mit 360px Rand beidseitig |
| Kein-Treffer-Hinweis | füllt 1198 von 1200px Arbeitsfläche |
| Artikeltitel | 24px / Schriftschnitt 700, Barlow Condensed (vor Task 6: 14px / 400, Geist) |
| Trennerlogik Artikelliste, 1 Treffer | keine Kanten |
| Trennerlogik Artikelliste, 3 Treffer | Zeile 1 links: keine/keine · Zeile 2 rechts: keine/1px · Zeile 3 links: 1px/keine |
| Portal (anderer Host) | rendert durchgängig Geist — kein Barlow-Element im Payload |

**Stichprobe:** `_ui/helfer.module.css` deklariert `--lb-bahn` als Maß (nicht
als Farbe, deshalb nicht im Dunkelzweig wiederholt — 1:1 aus dem
Task-Auftrag) und referenziert Barlow Condensed für Artikeltitel; die
Schriftimporte selbst liegen im Wurzel-Layout (`src/app/layout.tsx`), nicht
im Modul — das deckt sich mit dem Befund „Portal rendert Geist, kein
Barlow", weil Barlow dort nie in der Bahn verwendet wird, obwohl das Layout
die Schriftfamilie global deklariert (siehe offener Punkt 1 unten).

## Offene Posten — bewusste Trade-offs, kein Mangel

1. **Fünf Schriftfamilien im Wurzel-Layout, vier Module brauchen nur zwei.**
   `src/app/layout.tsx` deklariert Barlow, Barlow Condensed und IBM Plex Mono
   zusätzlich zu den bisherigen zwei — obwohl nur `lagerbuch` (Helfer-Zweig)
   sie nutzt. Möglicher Preload-/Payload-Effekt auf jeder Route der Suite,
   nicht nur `lagerbuch`. `preload: false` für die drei Lagerbuch-Schriften
   wäre die naheliegende Optimierung. Bewusst nicht in diesem Task behoben —
   ein Eingriff ins Wurzel-Layout wirkt suiteweit und ist eine eigene
   Entscheidung.
2. **Sechs von zehn Artikelnamen brechen bei 388px Spaltenbreite auf zwei
   Zeilen um.** Bewusst hingenommen: drei Spalten mit Umbruch schlagen zwei
   Spalten ohne, und mit den tatsächlichen Artikelnamen aus dem
   Produktivbestand (länger als die Demo-Namen) bräche es ohnehin. Keine
   weitere Breakpoint- oder Rasteränderung in diesem Task (s. Plan: „Was
   dieser Plan bewusst nicht tut").

## Betreiberentscheidung 14

Siehe `docs/superpowers/plans/ENTSCHEIDUNGEN-lagerbuch.md` — dort steht sie
jetzt als vierzehnter Punkt neben den dreizehn vom 04.08.2026.

## Anhang — Messverfahren

Die Tabelle oben wurde mit folgendem Wegwerf-Playwright-Test erzeugt (nicht
committet, reproduzierbar):

```ts
import { test, expect, type Page } from "@playwright/test";
import { E2E_TOKEN_HELFER, lagerbuchUrl } from "./helpers/lagerbuch";

const BREITEN = [375, 768, 1024, 1440];
const MODI: ("light" | "dark")[] = ["light", "dark"];

async function ueberlauf(page: Page) {
  return page.evaluate(() => ({
    vw: window.innerWidth,
    doc: document.documentElement.scrollWidth,
  }));
}

async function setTheme(page: Page, modus: "light" | "dark") {
  await page.context().addCookies([
    { name: "iuk-theme", value: modus, domain: "lagerbuch.localtest.me", path: "/" },
  ]);
}

test("Messungen fuer das Abnahme-Artefakt", async ({ page }) => {
  for (const modus of MODI) {
    await setTheme(page, modus);
    await page.goto(lagerbuchUrl(`/t/${E2E_TOKEN_HELFER}`));
    for (const b of BREITEN) {
      await page.setViewportSize({ width: b, height: 900 });
      for (const pfad of ["/", "/helfer", "/helfer/check", "/helfer/check?fz=e2e-fahrzeug", "/a/e2e-artikel"]) {
        await page.goto(lagerbuchUrl(pfad));
        await page.waitForLoadState("networkidle");
        const m = await ueberlauf(page);
        // ... Reiterleiste/Stepper je nach Ansicht messen, siehe Task-7-Report
      }
    }
  }
});
```
