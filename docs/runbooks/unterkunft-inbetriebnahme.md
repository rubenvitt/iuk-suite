# Runbook: Inbetriebnahme des Moduls `unterkunft`

Das Modul rechnet den Bedarf für die Unterbringung Betroffener (IDA-322): aus Personen, Räumen, Fläche
oder einem Zeltbestand Schlaffläche, Feldbetten, Zelte, Sanitär, Krankenstation, Wasser und Verpflegung.
Es steht **vorübergehend** neben dem Rechner in Lifeline Hub (LLH-1520) und rechnet mit denselben
Richtwerten und derselben Rechnung. Keine Datenbank, kein Endpunkt: die Rechnung läuft im Browser.

## 1. Zugang

Jeder Angemeldete darf rechnen; eine eigene Gruppe gibt es nicht, weil das Modul keine Daten liest oder
schreibt. Wer das enger haben will, setzt `SUITE_ACCESS_GROUP_UNTERKUNFT`.

## 2. Umgebung

```
SUITE_HOST_UNTERKUNFT=unterkunft.iuk-ue.de
```

Der Host braucht einen DNS-Eintrag und eine Traefik-Regel auf den Suite-Container. Ohne Host zeigt der
App-Umschalter keinen Eintrag. Keine Datenbank, kein Backup.

## 3. Prüfen nach dem Deploy

1. Anmelden, im App-Umschalter **Unterkunftsrechner** öffnen.
2. Unter **Personen** 50 Männer und 50 Frauen eintragen: Sanitär zeigt 6 Toiletten und 4 Urinale.
3. Reiter **Richtwerte**: jeder Wert mit Herkunft; Werte ohne Quelle stehen als „Annahme“.

## 4. Richtwerte ändern

Die Werte stehen in `src/app/m/unterkunft/_lib/richtwerte.ts` und gleichen denen in Lifeline Hub. Eine
Änderung gehört in beide Werkzeuge, sonst rechnen sie verschieden. Gemeinsame Basiswerte und Testfälle
aus Lifeline Hub übernimmt IDA-323, sobald LLH-1520 sie angelegt hat.

## 5. Rückbau

Das Modul ist für die Übergangszeit gedacht. Rückbau: Eintrag in `core/registry.ts`, Ordner
`src/app/m/unterkunft`, Zeichen in `core/favicon/zeichen.ts` (danach `scripts/app-icon-generat.ts`),
Zeile in `.env.example`, e2e-Spec samt Eintrag in `e2e/gruppen.json`, `unterkunft` in der erwarteten
Modulliste von `core/shell/launcherEintraege.test.ts` und das Zeichen `tent` in `core/ikonen/katalog.ts`,
sofern es sonst niemand nutzt; die Release-Notiz bleibt.
