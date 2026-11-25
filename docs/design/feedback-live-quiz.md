# Live-Quiz: Beamer und Handy — „Schilderwald“

Freigegeben vom Gruppenführer am 25.11.2026. Das Mockup mit allen Zuständen in Hell und Dunkel liegt in
`docs/design/mockups/live-quiz.html`, die Messwerte dazu in `docs/design/mockups/live-quiz-notizen.md`.
Diese Datei hält fest, **warum** es so aussieht und welche Variablen es gibt. Wer am Quiz baut, öffnet das
Mockup daneben: es ist die Referenz für Maße, Wortlaute und Zustände.

Beamer und Handy sind **öffentliche Ansichten** (`README.md`): eigene CSS-Module, kein antd, keine
`--ant-*` (Falle 2). Hell/Dunkel folgt `<html data-theme>` (Cookie), nie `prefers-color-scheme`.

## Richtung

Beamer und Handy lesen sich wie Beschilderung, nicht wie eine Spielshow. Barlow kommt aus der
Autobahnbeschilderung und ist für das Lesen aus der Entfernung gemacht. Die Suite lädt Barlow und
Barlow Condensed schon in `app/layout.tsx` über `next/font` (`--font-barlow`, `--font-barlow-condensed`);
das Quiz liest nur diese Variablen, es kommt kein Request dazu.

- **Verwandtschaft zum Abendzettel:** 3px-Fahne oben und Wortzeichen „IDA“ sind die einzigen roten
  Stellen. Primäraktion ist Tinte (Falle 3).
- **Antwortfarben tragen nie allein:** jede Option hat Form (▲ ● ■ ◆) und feste Position, auf Beamer und
  Handy gleich. Wer oben links ▲ sieht, tippt oben links ▲. Kein Rot (Marke) und kein Grün (läse sich
  als „richtig“).
- **Formschild:** eine Plakette in der Schriftfarbe der Kachel, die Form darin in Kachelfarbe. So hat die
  Form denselben Kontrast wie der Text (ein weißes Schild auf Bernstein hätte 1,82 : 1).
- **Zeit um:** Kacheln werden entsättigt (`saturate(.25)`), nicht ausgeblendet; der Text bleibt über AA.
- **Auflösung:** die richtige Option bekommt ✓, fetten Text und einen Tintenring. „Falsch“ ist nie rot,
  auf dem Handy steht ein leerer Ring mit Strich statt eines Kreuzes, und die richtige Antwort zuerst.
- **Ein Blickfang je Bild:** Lobby die Code-Schilder, Frage das Antwortfeld, Auflösung die Prozentzahl,
  auf dem Handy die Punktzahl. Bewegung nur beim Warten (drei Punkte) und beim Puls „dabei“; bei
  `prefers-reduced-motion` ist sie aus. Keine Vibration, kein Ton.
- **Anonymität im Lagebild** steht als eigene Fläche mit Schloss („Anonym — kein Name, keine Uhrzeit.“),
  nicht als Fußnote. Die Zusage gehört an den Code, der sie wahr macht (`_db/quiz.ts`, `tritteBei`).

## Variablen `--qz-*`

Sie hängen an der Wurzelklasse des CSS-Moduls (`handy.module.css` `.seite`, später `beamer.module.css`),
nicht an `:root` — ein CSS-Modul kann `:root` nicht scopen. Dunkel über `:root[data-theme="dark"] .seite`.

| Variable | Hell | Dunkel | Rolle |
|---|---|---|---|
| `--qz-grund` | `#f5f6f8` | `#101214` | Seite, Beamer-Grund |
| `--qz-flaeche` | `#ffffff` | `#1b1e22` | Karten, Felder |
| `--qz-tinte` | `#16181a` | `#ece9e2` | Text, Primäraktion, Fokus |
| `--qz-tinte-auf` | `#ffffff` | `#101214` | Text auf Tinte |
| `--qz-gedaempft` | `#5c6168` | `#9aa0a6` | Sekundärtext |
| `--qz-linie` | `#dde0e5` | `#2c3035` | Ränder |
| `--qz-linie-stark` | `#c4c8cf` | `#3a3f45` | Feldrand, Modusschild |
| `--qz-spur` | `#e9ebef` | `#262a30` | leere Balken- und Ringspur |
| `--qz-marke` | `#c8000f` | `#c8000f` | nur Fahne; Wortzeichen dunkel `#e45a66` |
| `--qz-a` / `--qz-a-text` | `#1e4fc2` / `#ffffff` | `#7fa6ff` / `#101214` | ▲ Kobalt |
| `--qz-b` / `--qz-b-text` | `#f2b705` / `#16181a` | `#f5c542` / `#101214` | ● Bernstein |
| `--qz-c` / `--qz-c-text` | `#00707a` / `#ffffff` | `#4fc6c9` / `#101214` | ■ Petrol |
| `--qz-d` / `--qz-d-text` | `#7a2e8c` / `#ffffff` | `#d09be2` / `#101214` | ◆ Pflaume |

Kontraste (gemessen, Notizen): Kacheltext hell 5,84–9,79 : 1, dunkel 7,87–11,57 : 1; Tinte auf Grund
16,46 bzw. 15,48 : 1. Optionen 5 und 6 (eine Frage darf sechs haben) wiederholen Farbe und Form von 1 und
2; ihre Position unterscheidet sie.

## Handy

- 360px breit gedacht, Maße in px. Skala 13 · 15 · 18 · 20 (Frage) · 28 · 40 · 64.
- Antwortkacheln mindestens 88px hoch, Knöpfe 56px (Bediendichte ohne Shell). Das Spitznamefeld hat
  18px Schrift, damit iOS beim Fokus nicht zoomt.
- Barlow Condensed 700 nur für Ziffern (Punkte, Platz). Fließtext Barlow 500/600, Überschriften 700,
  alles linksbündig.
- Einfachauswahl und Wahr/Falsch senden beim Tippen, Mehrfachauswahl erst mit „Absenden“.
- Die Restzeit („noch 14 s“) rechnet gegen die Serveruhr: jede Sicht trägt `jetzt` (Serverzeit), das
  Handy merkt sich den Versatz zur eigenen Uhr. Maßgeblich bleibt der Server (409 `geschlossen` →
  „Zeit ist um.“).
- Ohne JavaScript zeigt die Seite den Stand beim Laden, insbesondere „Das Quiz ist beendet.“ für einen
  beendeten oder unbekannten Code. Mitmachen und Antworten brauchen JavaScript (Strom und POST).
- Zwischen den Fragen (Rangliste am Beamer) zeigt das Handy „Du bist dabei.“ und, im Wettbewerb, Platz
  und Punkte. Das Mockup zeigt dort nur das Warten; die Werte sind eine kleine Ergänzung.
- Wahr/Falsch (zwei Optionen) hat Kacheln von 120–160px statt das Feld zu füllen; das Mockup zeigt nur
  vier Optionen. Im Lagebild ohne Antwort steht in der Auflösung „Keine Antwort.“ mit „Richtig war“.
