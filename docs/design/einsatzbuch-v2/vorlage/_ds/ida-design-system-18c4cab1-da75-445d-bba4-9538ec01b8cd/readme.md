# IDA Design System

**IDA — Interne Dienste und Anwendungen** für die Bereitschaft (Katastrophenschutz / DRK-Bereitschaft, Informations- und Kommunikationsarbeit). Im Code heißt das Produkt **iuk-suite**: ein Next.js-Prozess, ein Login (Pocket ID), mehrere Module unter eigenen Hosts (z. B. `lagerbuch.iuk-ue.de`). Der Browser-Titel lautet „IDA", Beschreibung „Interne Dienste und Anwendungen".

## Quellen
- GitHub: **https://github.com/rubenvitt/iuk-suite** (Branch `main`) — Ground Truth. Besonders lesenswert: `docs/design/README.md` (verbindliche Querschnittsregeln), `docs/design/feedback-admin.md` („Die Lagekarte", Admin-Referenz), `docs/design/feedback-oeffentliche-ansicht.md` („Der Abendzettel", öffentliche Ansichten), `src/core/theme/` (tokens.ts, theme.ts, schrift.ts), `src/core/shell/shell.module.css`, `src/app/m/lagerbuch/_ui/helfer.module.css`.
- Wer tiefer bauen will: diese Dateien direkt im Repo lesen — sie begründen jede Zahl, oft mit gemessenen Kontrastwerten.

## Produkte & Oberflächen
Zwei **bewusst verschieden gestaltete Design-Klassen**:

1. **Verwaltung (Admin-Arbeitsseiten)** — gehören sichtbar zur Suite: Ant Design 6 + Suite-Theme, Suite-Chrome (5px roter Markenstreifen, 64px Kopfzeile, App-Umschalter, 240px Seitenleiste). Geist als Fließtext, Barlow Condensed für Titel/Kicker/Zahlen. Arbeitsdichte 44px.
2. **Kiosk / öffentliche Ansichten** (Helfer-Weg im Lagerbuch, Funkgeräte-Ausleihe, öffentliches Feedback „Abendzettel", Datei-Freigaben) — login-frei, per QR/Code, oft auf fremdem Telefon, mit Handschuhen: eigenes CSS ohne antd, eigene Anmutung (Barlow / Barlow Condensed / IBM Plex Mono), Tap-Maß 56/72px, 560px-Bahn, Tab-Leiste unten. Zusätzlich ein Wandmonitor-`KioskShell` (Schrift 20, Controls 72).

   **Wichtig:** jede Kiosk-/öffentliche Fläche trägt ihre EIGENE Palette auf ihrem Rahmen — sie teilen nur Suite-Rot als Akzent und die Ampel:
   - *Lagerbuch-Helferweg* (`--kiosk-*`): Barlow-Trio, Papier #eef0f1, Karten r14, 1.5px-Ränder, Tab-Leiste unten.
   - *Funkgeräte-Ausleihe*: Geist, Browser-Vorgabeflächen (`Canvas`), antd-Knöpfe 56px, Nachbaumaße 44/64, Status als 10px-Punkt (`--radio-status-*`).
   - *Feedback „Abendzettel"*: warmes Papier #f4f1ea / Blatt #fbfaf7, Newsreader-Serif für H1, Rot nur 3px-Fahne + Wortzeichen, Primärknopf Graphit, invertierte Schulnoten-Palette 1–6.
   - *Drohnentraining*: weiß/hellgrau (`--uav-*`), Geist 800 für Titel, Radien 14/10, weicher Schatten, Akzent Rot für Nummern/Fortschritt/Sicherheitshinweise.

Module: `portal` (Apps & Dienste, Neuigkeiten, Profil), `qr` (QR-Codes, Offline-PWA), `feedback`, `files` (Dateien), `lagerbuch` (Material, Buchungen, Inventur, Fahrzeug-Checks), `aufgaben` (BuFDi-Planung), `radio` (Funkgeräte), `uav` (Drohnentraining).

## Index
- `styles.css` — Einstieg, nur `@import`s → `tokens/fonts.css`, `colors.css`, `typography.css`, `spacing.css`, `base.css`
- `assets/fonts/` — Barlow, Barlow Condensed, Geist, Geist Mono, IBM Plex Mono (woff2, latin; lokal gespiegelt von Google Fonts, dieselben Familien, die `layout.tsx` über `next/font/google` lädt)
- `assets/icons/phosphor/` — Phosphor Regular (Lagerbuch/Kiosk, Seitenleiste) · `assets/icons/antd/` — @ant-design/icons Outlined (Shell, Modul-Icons)
- `guidelines/` — Foundation-Karten (Farben, Typo, Abstände, Marke)
- `components/` — React-Bausteine (siehe unten)
- `ui_kits/verwaltung/` — Lagerbuch-Übersicht, Artikel, Artikel-Detail, Portal
- `ui_kits/kiosk/` — Lagerbuch-Helferweg: Gate, Artikelliste, Entnahme, Zielwahl, Fahrzeug-Check (alle vier Schritte + Fertig)
- `ui_kits/radio/` — Funkgeräte-Ausleihe: Gate, Übersicht mit Filter/Standortgruppen, Ausleihen, Zurückgeben
- `ui_kits/feedback/` — öffentlicher Feedback-Zettel „Der Abendzettel": Notenmatrix, Freitexte, Navigator, Danke
- `ui_kits/uav/` — Drohnentraining (Teilnehmer): Katalog ohne Code, Anmelden, Fortschritt, Aufgabe mit Erfassung
- `SKILL.md` — Agent-Skill-Einstieg · `github.md` — Quellzuordnung

## Components
Grundbausteine (`components/core/`): **Icon**, **Chip**, **Fach**
Verwaltung · Formulare (`components/verwaltung/forms/`): **Button**, **TextField**, **Select**
Verwaltung · Daten (`components/verwaltung/daten/`): **Card**, **Kachel**, **Datentabelle**, **JournalDelta**
Verwaltung · Hinweise (`components/verwaltung/hinweise/`): **Hinweis**, **Gefahrenzone**
Verwaltung · Shell (`components/verwaltung/shell/`): **SuiteKopf**, **AppUmschalter**, **Modulleiste**, **Seitenkopf**
Kiosk · Bedienung (`components/kiosk/bedienung/`): **KioskKnopf**, **Stepper**, **KioskFeld**, **Rueckweg**
Kiosk · Flächen (`components/kiosk/flaechen/`): **KioskRahmen**, **KioskKarte**, **KioskZeile**, **Pruefkreis**, **Schritte**, **Abschlussleiste**

Namespace im Bundle: `window.IDADesignSystem_18c4ca`.

### Intentional additions
- **Button, TextField, Select, Card, Datentabelle** — im Original sind das antd-Komponenten mit Suite-Theme (`core/theme/theme.ts`). Da antd hier nicht geladen wird, sind sie als kosmetische Nachbauten mit den exakten Theme-Werten angelegt (Höhen 32/44/56, Radius 8/10, Kontur #868686, 16px-Felder). Hover/Active-Rottöne sind von antds Algorithmus abgeleitet und hier angenähert.
- **Icon** — Wrapper über die kopierten Phosphor- und antd-SVGs (Original: `react-icons/pi` bzw. `@ant-design/icons`).
- Alle übrigen Bausteine haben ein direktes Gegenstück im Repo (`Kachel.tsx`, `Chip.tsx`, `Seitenkopf.tsx`, `AppUmschalter.tsx`, `Modulleiste.tsx`, `HelferRahmen.tsx`, `Stepper.tsx`, CSS-Klassen `.knopf`, `.karte`, `.zeile`, `.schritte`, `.abschluss`, `.pruefKreis`, `.gefahr`, `.warnbox`, `.jdelta`, `.fach`).

---

## CONTENT FUNDAMENTALS
- **Sprache: Deutsch**, durchgängig, auch im Code (Komponenten heißen `Seitenkopf`, `Kachel`, `Rueckweg`). Umlaute in der UI, im Code ASCII (`ue`).
- **Anrede: du.** „Gib den Code vom Etikett am Regal … ein." „Wähle die Einheit." Kein „Sie", kein „wir".
- **Ton: nüchtern, präzise, dienstlich — und fürsorglich im Detail.** Sätze erklären den Grund, wenn etwas gesperrt ist: „Ohne Ziel wird nicht gebucht — wähle die Einheit oder „Keine Einheit — Verbrauch"." Fehlertexte nennen, was nicht geschah, und den nächsten Handgriff: „Der Code konnte nicht geprüft werden. Bitte noch einmal auf Weiter tippen — bleibt es dabei, wende dich an die Leitung."
- **Casing:** Satzschreibung für Titel und Knöpfe („Entnahme buchen", „Artikel anlegen", „Mit Pocket ID anmelden"). VERSALIEN nur typografisch über die Kicker-Rolle (Spaltenköpfe, Kartentitel, Tab-Beschriftungen) und in Wortmarken (LAGER**BUCH**).
- **Knöpfe = Verb + Objekt**, kurz: „Weiter", „Beenden", „Zurück", „Ändern", „Ziel wählen".
- **Leerzustände unterscheiden** „nichts angelegt" von „nichts passt": „Es ist noch kein Artikel angelegt. Die Verwaltung pflegt den Bestand." vs. „Kein Artikel gefunden für „mull"."
- **Fachvokabular der Bereitschaft:** Handlager, Charge, FEFO, Soll-Bestückung, RTW/KTW, Einheit, Kärtchen, Zugangs-Code, Aussondern, BZ-Kontrolle, Dienstabend, Gruppenleitung.
- **Zahlen:** tabellarische Ziffern, deutsches Datum („23.9.2026, 11:27 Uhr", „14.09. 08:12"), Verfall als „MM/JJ", Mengen mit Vorzeichen „−3 Stk" / „+12 Pkg", Ellipse „…", Gedankenstrich „—", deutsche Anführungszeichen „…".
- **Keine Emoji.** Keine Ausrufezeichen, keine Werbesprache.

## VISUAL FOUNDATIONS
- **Farbe — drei Rollen, sauber getrennt:** (1) **Suite-Rot `#c8000f`** = Marke & Primäraktion (Markenstreifen, Primärknopf, aktive Akzentkante, Wortmarke, Gefahrenzone) — nie Status-, nie Datenfarbe. (2) **Fachsemantische Ampel** (ok `#1e7a3c`/`#e4f2e9`, gelb `#8a5200`/`#fbf1dc`, rot `#8c0d16`/`#f6e3e0`, grau = „keine Angabe") nur für Werte ihrer Skala, immer Text + Fläche als Paar, luminanz-monoton. (3) **Neutral/Graphit** (Tinte `#1a1d20`, Stahl `#5b6570`, Linie `#d9dde1`, Papier `#eef0f1`, Karte `#fff`) für alles andere. `colorError === colorPrimary` → kein `Alert type="error"`; Warnungen sind Text + 3px Kante.
- **Dunkelmodus** über `<html data-theme="dark">` (Drei-Zustands-Umschalter auto/hell/dunkel), nie `prefers-color-scheme` im CSS. Rot als Text wird im Dunkeln `#e45a66` (Kontrast gemessen), Flächen `#000` / `#141414` / `#1f1f1f`.
- **Typografie:** Rollen statt Werte. Display **Barlow Condensed** 600/700 (Titel 24/600 +.02em, Wortmarke 20/600 +.07em, Kicker 12/600 versal +.09em, Zahlen 30/700 lh 1). Body **Geist** auf antds Leiter 12/14/16/20/24/30. Mono **Geist Mono** für Journal, IDs, Fächer. Kiosk: **Barlow** + Barlow Condensed + **IBM Plex Mono** (Code 700/24 +.16em). Eingabefelder nie unter 16px — Zoom ist suiteweit gesperrt.
- **Abstände:** SPACE 4/8/12/16/24/32. Seiteninhalt 16px Polster, Kachelraster 12px, Abschnitte 24px.
- **Bediendichten hängen an der Shell:** 56/72 Einsatz (Kiosk, MinimalShell, Kopfzeile), 44/48 Arbeitsfläche (FullShell), 32/40 nur radio-Verwaltung. Nie `size="large"` (=72).
- **Ein Breakpoint: 768px** (`max-width: 767.98px`). Umschaltung per CSS, beide Varianten im DOM. Unter 768px Handlungsknöpfe volle Breite, untereinander; Tabellen werden Karten (Kartentabelle) oder scrollen waagerecht.
- **Hintergründe:** flache Flächen. Keine Bilder, keine Verläufe, keine Texturen, keine Illustrationen im UI. Einziges grafisches Motiv: der **5px Markenstreifen** in Rot über jeder Ansicht (Kiosk-Gate zusätzlich ein 52×5px Balken über der Wortmarke).
- **Karten:** Verwaltung = antd Card (weiß, 1px `#f0f0f0`, Radius 10, kein Schatten; Hover-Schatten nur bei klickbaren Kacheln). Kiosk = `.karte` (1px Linie, Radius 14, `overflow:hidden`, Zeilen mit 1px Trennlinien). Status trägt nie die Kartenfläche, sondern Chip oder Kante.
- **Akzent-Sprache:** genau eine Akzentbreite **3px linke Kante** (aktiver Nav-Eintrag, App-Umschalter-Eintrag, Portal-Kachel bei Hover, Warnbox); KPI-Kachel 4px in Ampelfarbe. Aktiv = Kante + getönte Fläche (`rgb(0 0 0 / .06)`) + 600 — **keine** rote Schrift.
- **Radien:** Verwaltung 8 (Controls) / 10 (Karten) / 6 (Nav) / 4 (Warnbox, Fach) / 12 (Panel). Kiosk rundlicher: Knopf 11, Feld 10, Stepper 12, Karte 14, Gate-Karte 16, Pillen 99.
- **Ränder:** Verwaltung 1px; Kiosk 1.5px. Feldkontur `#868686` (3:1), Trennlinien bleiben leise.
- **Schatten:** sparsam, nur für Schwebendes — Popover `0 8px 24px rgb(0 0 0/.12)`, Kachel-Hover (antd), Kiosk-Abschlussleiste `0 10px 26px rgba(12,18,24,.32)`.
- **Hover:** getönte Fläche `--iuk-flaeche-aktiv` (Nav, Umschalter, Text-Knöpfe); antd-Default-Knöpfe färben Rand+Text rot; Portal-Kachel: linke Kante → Rot + Schatten. Kiosk hat keine Hover-Zustände (Touch).
- **Press:** antd-Farbabdunklung (`#a2000c`). Kein Schrumpfen, keine Federn.
- **Gesperrt:** Kiosk `opacity .45` + Satz daneben, der den Grund nennt.
- **Fokus:** immer sichtbar — `outline: 2px` + `outline-offset: 2px` (Kiosk Tinte, Verwaltung Rot).
- **Bewegung:** fast keine. 120ms `ease` für Kachelkante, 150ms Pfeildrehung des Umschalters, 2.6s Scan-Strich im Barcode-Scanner. Jede Bewegung hat einen `prefers-reduced-motion`-Zweig. Keine Fades, keine Bounces.
- **Transparenz/Blur:** kein Blur. Transparenz nur für getönte Aktivflächen und antd-Disabled.
- **Layout:** Kopfblock (Streifen + 64px) `sticky`, Seitenleiste 240px sticky unter 69px. Kiosk: `100dvh`-Spalte, Kopf oben, Tab-Leiste unten fix, Inhalt scrollt dazwischen.
- **Bildsprache:** praktisch keine. (Das Modul `uav` hat eigene Trainingsillustrationen, im Repo als Git-LFS-Zeiger — nicht übernommen.)

## ICONOGRAPHY
- **Zwei Sätze, klar zugeordnet:**
  - **@ant-design/icons, Outlined** — Shell und Modul-Icons (App-Umschalter, Portal-Kacheln, Theme-Umschalter: `AppstoreOutlined`, `ContainerOutlined`, `WifiOutlined`, `DesktopOutlined`, `BulbOutlined`/`BulbFilled`, `DownOutlined`, `SearchOutlined` …). Kopiert nach `assets/icons/antd/`.
  - **Phosphor (react-icons/pi), Regular** — Lagerbuch/Kiosk (`ikonen.tsx`, deutsche Namen: `chevron-rechts`, `plus`, `scannen`, `warnung`, `fahrzeug`, `tasche`, `box` …) und Seitenleisten-Icons (`navIkonen.tsx`). Bold nur für ± am Stepper. Kopiert nach `assets/icons/phosphor/`.
- Größen: 12 (im Chip), 14–16 (Knöpfe, Nav), 18 (Vorgabe), 20 (Tab-Leiste, Stepper).
- **Immer dekorativ** (`aria-hidden`); Bedeutung trägt der Text daneben, ein Icon-only-Knopf trägt `aria-label`.
- Server-Components nutzen Textzeichen statt Icons, z. B. **„‹"** im Rückweg des Seitenkopfs. Sonst keine Unicode-Icons, **keine Emoji**, keine Icon-Fonts, keine PNG-Icons.
- **Logo:** Im Repo gibt es **kein Bildlogo** (PWA-Icons werden per Route erzeugt, `login-bg.jpg` ist ein LFS-Zeiger). Die Marke ist rein typografisch: Wortmarken in Barlow Condensed, gesperrt, zweiter Teil rot (LAGER**BUCH**). Es wurde kein Logo gezeichnet.

## Schriften
Alle sechs Familien (inkl. Newsreader für den Feedback-Zettel) sind die Original-Familien des Repos (Google Fonts via `next/font`) und liegen als woff2 in `assets/fonts/` (nur `latin`-Subset). Keine Substitution nötig.
