# Scoped Re-Review: direkte E2E-Schreibverbindungen

## Umfang und Grundlage

Geprüftes Paket: `73ad39fe..55236677`, vollständig aus `e2e-fixture-review.diff`. Der Review beschränkt sich auf die zwölf ergänzten Codezeilen in sechs E2E-Specs und den zugehörigen Bericht. Kein erneuter Produktreview; die Freigabe des vorherigen Fixpakets in `final-fix-review.md` bleibt bestehen.

Gelesen: `e2e-fixture-diagnosis.md`, `e2e-fixture-fix-report.md`, vollständiges Diff, `src/core/audit/context.ts`, die aktuelle Import-/Konstruktor-/Registrierungsinventur unter `e2e`, `/private/tmp/audit-e2e-fixture-inventory.json` und der Abschluss des gezielten Playwright-Logs `/private/tmp/audit-e2e-fixture-targeted.log`. Keine Tests, Browser oder Server gestartet, keine Code- oder Git-Änderungen vorgenommen.

## Spec Compliance: PASS

Alle sechs direkten Schreibverbindungen auf auditierten Moduldatenbanken registrieren die bestehende API synchron unmittelbar nach dem Konstruktor und vor dem ersten Prepare, Drizzle-Zugriff oder Callback:

| Datei und Registrierungszeile | Geschützter Einstieg | Ergebnis |
| --- | --- | --- |
| `e2e/files-hosts.spec.ts:215` | `db()` | Registrierung vor Pragma, Drizzle und Rückgabe der Verbindung |
| `e2e/files-inbox.spec.ts:94` | `legeAbgabelinkAn` | Registrierung vor Pragma und INSERT |
| `e2e/files-mobil.spec.ts:192` | `sorgeFuerBestand` | Registrierung vor Drizzle und sämtlichen Cleanup-DELETEs/INSERTs |
| `e2e/lagerbuch-helfer.spec.ts:77` | `sperre` | Registrierung vor Prepare/UPDATE auf `tokens` |
| `e2e/radio-hosts.spec.ts:335` | `schreibend` | Registrierung vor Aufruf des schreibenden Callbacks |
| `e2e/radio-zugang.spec.ts:241` | `schreibend` | Registrierung vor Aufruf des schreibenden Callbacks |

Die aktuelle Quellsuche bestätigt die 18 direkten Konstruktorstellen der AST-Inventur, einschließlich des Alias `DatenbankLeser`: sechs betroffene Modul-Schreibverbindungen, elf ausdrücklich schreibgeschützte Verbindungen und eine direkte Schreibverbindung auf die zentrale `audit.db`. Die elf Leser führen keine Geschäftsmutationen aus; die zentrale Fixture schreibt `audit_events`, deren Tabelle keine Modul-Outbox-Trigger besitzt. Beide Gruppen benötigen für diese Zugriffe keine zusätzliche Registrierung. Der vorhandene Lagerbuch-Seed verwendet bereits den registrierenden Modulöffner. Für den geprüften Bestand ist damit keine weitere direkte E2E-Modul-Schreibverbindung ausgelassen.

## Code Quality: APPROVED

Die Ergänzungen verwenden genau die bestehende, Auth-unabhängige Registrierungsfunktion. Diese installiert alle fünf von den Triggern benötigten SQLite-Funktionen auf derselben Verbindung. Die Registrierung erfolgt früh genug, auch wenn SQLite einen Trigger schon beim Vorbereiten eines Cleanup-DELETEs auflösen muss. Ohne expliziten Actor-Kontext erzeugte Fixture-Mutationen bleiben korrekt dem System zugeordnet.

Die ursprünglichen Datenbankpfade, SQL-Operationen, Callback-Reihenfolgen, Pragmas, Rückgaben und vorhandenen `finally`-Blöcke bleiben erhalten. Das Paket entfernt weder Schreiboperationen noch Assertions, deaktiviert keine Trigger und verändert keine Wiederholungen oder Zeitbudgets. Produktcode und `next-env` sind im geprüften Paket unverändert. Die sechs identischen Ergänzungen sind für diesen begrenzten Fixture-Fix angemessen; eine neue Abstraktion ist nicht erforderlich.

## Befunde

- Critical: keine.
- Important: keine.
- Minor: keine bestätigten, handoff-relevanten Residualbefunde im Fixdiff.

Eine dauerhafte Konstruktorinventur als Regressionstest wäre eine mögliche spätere Ergänzung, ist aber kein offener Defekt dieses Pakets und keine Voraussetzung für seine Freigabe.

## Verifikation und Beweisgrenzen

Das gezielte Playwright-Log endet mit **56 passed (2.1m)** für die sechs betroffenen Specs. Der Fixbericht dokumentiert dafür Exit 0 sowie Exit 0 für Typecheck, scoped ESLint und Diff-Check. Diese Läufe wurden für den Review nicht wiederholt. Der gemeldete vorherige vollständige Lauf mit **379 passed / 26 failed** und `suite_audit_id`-Fehlern bleibt ausdrücklich ein roter Gesamtgate; seine gesicherten Traces sind Diagnosebelege und kein grüner Nachweis.

## Gesamturteil

**Spec Compliance: PASS. Code Quality: APPROVED.** Der begrenzte E2E-Fixture-Fix ist freigegeben; keine weitere Korrektur aus diesem Review erforderlich. Der abschließende vollständige 405-Test-Playwright-Gate auf dem korrigierten Stand steht noch aus und muss vor einem Gesamtgrün abgeschlossen werden.
