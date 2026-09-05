# DRK-184: Verständliche Dateigrößenmeldung

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Der Verwaltungs-Upload meldet eine zu große Datei mit einer lesbaren Größenangabe und echten Umlauten.

**Architecture:** Die Meldung entsteht weiterhin im Route Handler und wird von der Upload-Insel durchgereicht. HTTP 413, die numerische Eigenschaft `grenzeBytes`, die konfigurierten Limits und die Upload-Verarbeitung bleiben erhalten.

**Tech Stack:** Next.js 16, TypeScript, Vitest, bestehendes DOM-Harness. Prüfung mit Node 22.23.0 und pnpm 11.0.9.

**Spec:** [DRK-184](https://app.clickup.com/t/86cb0kmk8) enthält nur den gemeldeten Fehlertext. Der Arbeitsumfang ist dessen verständliche Darstellung im Verwaltungs-Upload; eine Änderung des Upload-Limits ist nicht spezifiziert. Projektregeln: `CLAUDE.md`, insbesondere die Release Notes.

## Global Constraints

- Keine Änderung an Größenlimits, Byte-Zählung, Cleanup, Berechtigungen, AV oder Upload-Protokoll.
- `grenzeBytes` bleibt der unveränderte numerische Bytewert des Fehlers.
- Dateigrößen werden binär als MiB dargestellt (1 MiB = 1048576 Bytes), mit deutschem Dezimaltrennzeichen und höchstens zwei Nachkommastellen.
- Bei 524288000 Bytes lautet die Meldung: „Die Datei ist zu groß. Erlaubt sind höchstens 500 MiB.“
- Die nutzerseitige Fehlermeldung enthält weder `FILES_MAX_DATEI_BYTES` noch `Einheit: Bytes` noch eine unformatierte Bytezahl.
- Nur der exakt gemeldete Verwaltungs-Upload gehört zum Ticket. Andere Fehlerkategorien und der öffentliche Abgabeweg sind nicht Teil dieses Fixes.
- Bestehende Änderungen im Hauptcheckout sind fremd; alle Änderungen erfolgen im isolierten Worktree.
- Ein Umsetzungs-Agent besitzt den Code; unabhängige Agenten prüfen ihn. Git-Integration und ClickUp werden vom Controller gesteuert.

## Task 1: API-Meldung, Anzeigevertrag und Release Note

**Ownership / Files:**
- Modify: `src/app/m/files/api/upload/[fileId]/route.ts` (nur Meldung für `GroesseUeberschritten`).
- Modify: `src/app/m/files/api/upload/[fileId]/route.test.ts` (vorhandene 413-Probe und gegebenenfalls repräsentative Konfigurationswerte).
- Modify: `src/app/m/files/_ui/UploadInsel.tsx` (nur den veralteten Kommentar zum durchgereichten Servertext).
- Modify: `src/app/m/files/_ui/UploadInsel.test.tsx` (vorhandene Anzeigeprobe für 413).
- Create: `src/app/m/portal/_lib/neuigkeiten/notizen/files/2026-09-05-lesbare-dateigroesse.ts`.
- Modify: `src/app/m/portal/_lib/neuigkeiten/register.ts` (Import und Registereintrag).

**Interfaces:** `ausFehler` bildet `GroesseUeberschritten.maxBytes` auf `{ fehler: string, grenzeBytes: number }` bei HTTP 413 ab. `UploadInsel` stellt diesen Servertext unverändert am betroffenen Dateieintrag dar.

- [x] Baseline: vorhandene Route-, UploadInsel- und Storage-Tests mit der gepinnten Runtime ausführen. Noch keine Produktänderung vor dem grünen Ausgangszustand.
- [x] Bestehende 413-Probe so anpassen, dass sie die falsche Darstellung vor der Korrektur nachweist. Status, exakter `grenzeBytes`-Wert, entfernte Zwischendatei und unveröffentlichte Datenbankzeile weiterhin prüfen. Bei der bestehenden Grenze `4 * 1048576 + 1` erwartet die Anzeige `4 MiB`.
- [x] Die Route zusätzlich bei 524288000 Bytes und 13107200 Bytes prüfen: Anzeige `500 MiB` bzw. `12,5 MiB`, unveränderter Maschinenwert. Dazu die vorhandene `steuerung.schreibFehler`-Naht verwenden; keine riesige Testdatei anlegen. Der echte Grenz-/Cleanup-Test bleibt bestehen.
- [x] RED der Route beobachten und dokumentieren. Die bestehende UploadInsel-Probe auf den vom Server gelieferten neuen Text `Die Datei ist zu groß. Erlaubt sind höchstens 12 MiB.` umstellen und dessen Anzeige am Dateieintrag erhalten.
- [x] Die kleinste Produktänderung im `GroesseUeberschritten`-Zweig implementieren:

```ts
fehler: `Die Datei ist zu groß. Erlaubt sind höchstens ${new Intl.NumberFormat(
  "de-DE", { maximumFractionDigits: 2 },
).format(fehler.maxBytes / (1024 * 1024))} MiB.`,
grenzeBytes: fehler.maxBytes,
```

- [x] Den Kommentar an `meldungFuer` mit einem aktuellen Beispiel erklären; keine neue Client-Formatierung oder gemeinsame Formatter-Architektur.
- [x] Release Note nach `CLAUDE.md`: Titel `Die Dateigröße ist leichter zu lesen`, drei kurze Absätze in Du-Form. Inhalt: verständliche Obergrenze bei „Neue Freigabe“; MiB statt einer langen Bytezahl; die zulässige Größe und vorhandene Freigaben bleiben unverändert. Keine Ticketnummer, internen Namen oder Markdown im Produkttext. Datei mit `modul: "files"`, `datum: "2026-09-05"`, `slug: "lesbare-dateigroesse"` registrieren.
- [x] GREEN der fokussierten Tests und bestehender Release-Notiz-Prüfung dokumentieren. Keine neuen Tests für bloße Dokumentstruktur.
- [x] Den vorhandenen Modulwächter in `_lib/zeit.test.ts` mitprüfen: Zahlenformatierung muss explizit `Intl.NumberFormat` verwenden, da der Wächter `toLocaleString` als potenziell zonenabhängige Datumsformatierung erkennt. Der Wächter bleibt unverändert.
- [x] Selbstreview; dann Bericht schreiben. Der Controller führt die restlichen Gates, unabhängige Reviews und Git-Schritte aus.

**Test commands:** Nutze die vom Controller bereitgestellte gepinnte Runtime; alle Shell-Kommandos mit `rtk` oder `rtk proxy`.

```sh
rtk pnpm exec vitest run 'src/app/m/files/api/upload/[fileId]/route.test.ts' src/app/m/files/_ui/UploadInsel.test.tsx src/app/m/files/_lib/storage.test.ts src/app/m/portal/_lib/neuigkeiten/register.test.ts
rtk pnpm lint
rtk pnpm typecheck
rtk pnpm test
rtk pnpm build
rtk pnpm exec playwright test e2e/files-fileshare.spec.ts
```

## Validierung des umgesetzten Stands

- Unabhängiges Task- und Abschlussreview: freigegeben ohne offene Findings. Der anschließende Wechsel auf `Intl.NumberFormat` wurde separat nachgeprüft.
- Betroffenes Files-Modul und Portal-Notizen: 57 Testdateien, 1698 Tests bestanden, Exit 0.
- Bestehende Files-Browsertests: 10 Tests bestanden, Exit 0.
- Produktionsbuild, TypeScript und ESLint: Exit 0. ESLint meldet 13 bestehende Warnungen außerhalb der geänderten Dateien; die abschließend geänderte Route ist warnungsfrei.
- Der vollständige Repository-Testlauf ist nicht grün bestätigt: Zwei Versuche wurden nach Zeitüberschreitungen mit Exit 130 abgebrochen. Vier zuvor betroffene Suites bestanden isoliert mit 133 Tests. Der dabei gefundene Konflikt mit dem Zeit-Guard wurde behoben; alle betroffenen Files-Tests bestanden danach.
- Prüfprotokolle liegen lokal unter `.superpowers/sdd/2026-09-05-drk-184-dateigroesse/`.
