# Task 101 — Bericht

## Status und Umfang

- Branch: `feat/lagerbuch-modul-teil5`
- Ausgangspunkt: `adde25d fix(lagerbuch): exportiere neutralen KPI-Marker`
- Umgesetzt wurde ausschließlich T101 samt dem bindenden Reconciliation-Override:
  zentrale `_ui/ikonen.tsx`, modulweiter Icon-/Namens-/Roh-SVG-Riegel und die
  Migration der acht freigegebenen Lagerbuch-Consumer.
- Der laut Reconciliation nach W1 geforderte Browserlauf gehört zum W1-Gate
  nach T105 und ist deshalb kein T101-Gate.

## RED-Nachweise

### 1. Fehlendes Modul

Nach dem test-first Anlegen von `_ui/ikonen.test.ts`:

```text
pnpm vitest run src/app/m/lagerbuch/_ui/ikonen.test.ts
exit 1
FAIL src/app/m/lagerbuch/_ui/ikonen.test.ts
Error: Cannot find module './ikonen'
Test Files 1 failed (1), Tests no tests
```

Der Fehler war der geplante fehlende Import und kein Syntax- oder
Testgeschirrfehler.

### 2. Verbliebene Roh-SVG-Quellen

Nach der minimalen zentralen Implementierung, vor jeder Consumer-Migration,
schlug ausschließlich der Roh-SVG-Riegel fehl. Nachdem Kommentare aus dem Scan
entfernt wurden, meldete er exakt die acht bindend benannten Quellen:

```text
_ui/ArtikelSuche.tsx
_ui/BarcodeScanner.tsx
_ui/CheckFlow.tsx
_ui/Entnahme.tsx
_ui/FahrzeugWahl.tsx
_ui/Gate.tsx
_ui/HelferRahmen.tsx
_ui/Stepper.tsx

Test Files 1 failed (1), Tests 1 failed | 11 passed (12)
```

Der Kommentarfilter ist notwendig, weil Tests und Begründungskommentare die
Zeichenfolge `<svg>` bzw. `"use client"` ausdrücklich nennen dürfen, ohne eine
zweite ausführbare SVG-Quelle oder Direktive zu sein.

## GREEN-Nachweise

Alle Projektwerkzeuge liefen mit CI-Node 22 und pnpm 11.0.9 über:

```text
rtk mise exec node@22 -- /Users/rubeen/.local/share/mise/installs/node/24/bin/pnpm ...
```

- `_ui/ikonen.test.ts`: 1 Datei, 12/12 Tests bestanden.
- Direkt betroffene Component-Tests (`FahrzeugWahl`, `Stepper`,
  `BarcodeScanner`, `CheckFlow`, `Gate`, `Entnahme`, `HelferRahmen`,
  `ArtikelSuche`): 8 Dateien, 177/177 Tests bestanden.
- Lagerbuch-Strukturriegel `_lib/bauform.test.ts`: 39 bestanden, 1 bestehender
  Skip, 0 fehlgeschlagen.
- `pnpm typecheck`: Exit 0.
- `pnpm lint`: Exit 0, 0 Fehler. Die fünf ausgegebenen Warnungen liegen in
  bestehenden, von T101 unveränderten Dateien (`e2e/fixtures.ts`,
  `_lib/boot.test.ts`, `_lib/grenzen.test.ts`, `_lib/lesepfade/artikel.ts`).
- `git diff --check`: Exit 0.
- Frischer gemeinsamer Schlusslauf aller zehn fokussierten Testdateien:
  10/10 Dateien, 228 bestanden, 1 bestehender Skip, 0 fehlgeschlagen.

## Mutation: unbekannter Name

Temporär wurde `_ui/Probe.tsx` mit `<Ikone name="warnungg" />` angelegt. Der
Namensscan wurde wie vorgesehen rot:

```text
_ui/Probe.tsx: "warnungg"
Test Files 1 failed (1), Tests 1 failed | 11 passed (12)
```

Nach dem Löschen der temporären Datei war `_ui/ikonen.test.ts` wieder 12/12
grün. `_ui/Probe.tsx` ist nicht mehr vorhanden und wird nicht committed.

## Vertragsprüfung

- `IkonName` und `PFADE` führen exakt 36 Namen.
- Alle 36 Pfade sind nicht leer, beginnen mit einem Move-Befehl und sind
  eindeutig; kein Pfad ist doppelt vergeben.
- Die acht Fachzeichen `warnung`, `medizin`, `objekt`, `sauerstoff`, `akku`,
  `verfall`, `handlager-griff`, `fahrzeug` sind enthalten.
- `_ui/ikonen.tsx` enthält keine Importdeklaration und keine `"use client"`-
  Direktive; sie ist aus RSC und Client-Inseln importierbar.
- `Ikone` nutzt `currentColor`, `viewBox="0 0 24 24"`, Vorgabegröße 18,
  `aria-hidden`, `focusable="false"` und einen nicht schrumpfenden Flex-Stil.
- Kein ausführbares Lagerbuch-TSX außerhalb `_ui/ikonen.tsx` enthält ein rohes
  `<svg>`; kein Lagerbuch-Modul importiert `@ant-design/icons`, `lucide-react`
  oder `core/shell/icons`.
- Sichtbarer Nachbartext, bestehende Button-/Link-Benennungen und
  `aria-pressed` bleiben unverändert. Zusätzliche fokussierte Tests sichern die
  zuvor nicht direkt belegten Fälle in `Stepper`, `BarcodeScanner`, `Entnahme`
  und `ArtikelSuche`.

### Migration der acht Consumer

| Consumer | Zentraler Name | Größe | Erhaltener Vertrag |
|---|---:|---:|---|
| `FahrzeugWahl.tsx` | `chevron-rechts` | 18 | Pfeil neben Fahrzeugtext |
| `Stepper.tsx` | `minus`, `plus` | 20 | benannte Tasten, SVG stumm |
| `BarcodeScanner.tsx` | `taschenlampe` | 20 | `aria-label="Taschenlampe"`, `aria-pressed` |
| `CheckFlow.tsx` | `haken` | 13 | sichtbare Auswahl zusätzlich zu Farbe und `aria-pressed` |
| `Gate.tsx` | `schluessel` | 16 | Zeichen neben „Mit Pocket ID anmelden“ |
| `Entnahme.tsx` | `chevron-links` | 15 | Zeichen neben „Zurück“ |
| `HelferRahmen.tsx` | `kreuz`, `tabelle`, `haken` | 14/20 | Beenden- und Tab-Texte sowie `aria-current` |
| `ArtikelSuche.tsx` | `chevron-rechts` | 18 | Zeichen neben Artikeltext |

## Dateien

Neu:

- `src/app/m/lagerbuch/_ui/ikonen.tsx`
- `src/app/m/lagerbuch/_ui/ikonen.test.ts`
- `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil5/task-101-report.md`

Migriert:

- `src/app/m/lagerbuch/_ui/FahrzeugWahl.tsx`
- `src/app/m/lagerbuch/_ui/Stepper.tsx`
- `src/app/m/lagerbuch/_ui/BarcodeScanner.tsx`
- `src/app/m/lagerbuch/_ui/CheckFlow.tsx`
- `src/app/m/lagerbuch/_ui/Gate.tsx`
- `src/app/m/lagerbuch/_ui/Entnahme.tsx`
- `src/app/m/lagerbuch/_ui/HelferRahmen.tsx`
- `src/app/m/lagerbuch/_ui/ArtikelSuche.tsx`

Fokussierte Regressionstests ergänzt:

- `src/app/m/lagerbuch/_ui/Stepper.test.tsx`
- `src/app/m/lagerbuch/_ui/BarcodeScanner.test.tsx`
- `src/app/m/lagerbuch/_ui/Entnahme.test.tsx`
- `src/app/m/lagerbuch/_ui/ArtikelSuche.test.tsx`

## Commit-Nachweis

Der Task wird als genau ein fokussierter Commit auf Basis `adde25d` erstellt.
Commit-Betreff:

```text
feat(lagerbuch): zentralisiere 36 Modul-Ikonen
```

Die Rechnung des Briefs bleibt bindend: 46 Ausgangszeichen minus 6 ersatzlose
Streichungen minus 4 Zusammenlegungen ergeben 36 zentrale Namen. Der erzeugte
Commit-SHA wird bei der Übergabe separat genannt; ein Commit kann seinen eigenen
SHA nicht in seinem Inhalt speichern.
