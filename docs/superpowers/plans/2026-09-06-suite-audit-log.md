# Suite Audit-Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein suiteweites Audit-Log für Änderungen, Authentifizierung, Rechteverweigerungen und Downloads/Exporte, zentral nur für Suite-Admins sichtbar.

**Architecture:** Transaktionale Ausgangsereignisse in den Modul-Datenbanken, idempotente Übernahme in `core/audit`, explizite Ereignisse für Authentifizierung/Auslieferung. Asynchroner Request-Kontext für sichere Akteurszuordnung; Portal-Ansicht mit eigener Suite-Admin-Prüfung.

**Tech Stack:** Next.js 16, React 19, Ant Design 6, Drizzle, better-sqlite3, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-06-suite-audit-log-design.md`

## Global Constraints

- RTK vor Shellbefehlen; im isolierten Arbeitszweig arbeiten. Bestehende AGENTS.md/CLAUDE.md sowie `docs/design/` beachten.
- CI-Laufzeit Node 22, pnpm 11.0.9; Exit-Codes der Tore auswerten.
- Standardaufbewahrung 90 Tage über `SUITE_AUDIT_AUFBEWAHRUNG_TAGE`.
- Ausschließlich Suite-Admins lesen Audit-Daten; keine Geheimnisse/Feedback-Inhalte und keine ungeprüften Client-Akteure speichern.
- Kein Merge oder Deployment Bestandteil dieses Auftrags. Keine neue Abhängigkeit erforderlich.
- Abdeckung aller neun Fachdatenbanken und Kontofunktionen; kein bloßer Rahmen mit später einzubauenden Modulen.

### Task 1: Transaktionale Audit-Grundlage und Abdeckungsinventar

**Files:** Neu `src/core/audit/{types,context,catalog,storage,transfer,retention}.ts` mit zugehörigen Tests und `src/core/audit/_db/`; ändern `src/core/db/index.ts`, `src/core/bootstrap.ts`, `Dockerfile`, `.env.example`; je Modul unter `src/app/m/*/_db/migrations/` neue Ausgangstabellen/Trigger, außerdem `src/core/konto/_db/migrations/`.

**Interfaces:** Diese Aufgabe definiert und dokumentiert `AuditActor`, `AuditContext`, `AuditEvent`, `withAuditContext(context, operation)`, `recordAuditEvent(event)`, `transferAuditEvents()`, `queryAuditEvents(filters)` und einen geprüften Ereignis-/Tabellenkatalog. Kein Import aus `core/auth` in den reinen Kontext-/Speicherpfad (Auth-Konfiguration muss ihn nutzen können).

- [ ] Reale SQLite-Testvorrichtung schreiben: Änderung erzeugt Ereignis, Rollback erzeugt keines, Trigger-Schreibfehler rollt Änderung zurück, zentrale Störung behält Ausgangseintrag. Wiederaufnahme übernimmt genau einmal.
- [ ] Tests zuerst rot ausführen; danach Ausgangsmigrationen, registrierte SQLite-Kontextfunktionen und zentrale Migration implementieren. Alle Tabellen ausdrücklich erfassen oder mit Grund ausschließen; anonyme Feedback-Daten konsequent isolieren.
- [ ] Actor-Kontexte parallel prüfen: `await Promise.all([withAuditContext(alice, a), withAuditContext(bob, b)])` darf keine Identitäten vertauschen. Ohne Request-Kontext ist der Akteur System.
- [ ] Speicher-/Lesepfad implementieren: validierte Typen, parametrisierte Filter, stabile `(occurredAt,id)`-Reihenfolge, begrenzte Seitengrößen, definierte Altersgrenze. Aufbewahrungs-/Redaktions-/Duplikatproben ausführen.
- [ ] Bootstrap, Docker und Konfiguration ergänzen; betroffene vorhandene Tests ausführen. Produktionsoberfläche bleibt Aufgabe 3.
- [ ] Schnittstellen und Testbefehle im Aufgabenbericht festhalten; getrennt reviewen.

### Task 2: Ereignisse aller Module und Authentifizierung verbinden

**Files:** `src/core/audit/server.ts`, `src/core/auth/{config,guards}.ts`, `src/proxy.ts`, sämtliche exportierten Server Actions unter `src/app/m/`, relevante Route Handler und Modul-Zugangswächter; `src/core/audit/coverage.test.ts`; neue fokussierte Integrationstests.

**Interfaces:** Verwendet die veröffentlichten Schnittstellen von Aufgabe 1. `withAuditContext` umschließt die bestehende Fachoperation; Identität wird aus der bestehenden serverseitigen Authentifizierung gewonnen. `recordAuditEvent` nimmt ausschließlich erlaubte typisierte Daten entgegen. Keine Änderung fachlicher Transaktions-/Berechtigungsregeln.

- [ ] Verzeichnis aller Server Actions und fachlichen Route Handler erstellen und im Bericht mit erfasstem Verhalten ablegen. Die Trigger erfassen persistierte Änderungen; jeder aufrufbare Schreibpfad braucht den richtigen Akteurskontext.
- [ ] Erst rote Integrationstests für echte Nutzeraktion und Audit-Zeile sowie zwei parallele Akteure erstellen; Wrapper/Anbindung implementieren und grün prüfen. Reine Lese-Actions erzeugen keine Änderungsereignisse.
- [ ] An-/Abmeldung, Sitzungswiderruf sowie modul-eigene Code-/Teilnehmersitzungen verbinden; Session-Polling und Token-Refresh nicht als Anmeldung zählen.
- [ ] Explizite Rechteablehnungen in allgemeinen und Modul-Wächtern/Handlern erfassen; keine Roh-URLs/Token oder Formularnutzlasten. Abweisung muss bei Audit-Störung bestehen bleiben. Negative Proben für Suite-/Modulrollen ausführen.
- [ ] Fachliche Download-/Export-Handler verbinden, mit Erfolg/Ablehnung/Fehler sauber getrennt. Streamantwort als bereitgestellt benennen. Keine Icons/Manifeste protokollieren.
- [ ] Bestehende Modul-/Auth-/Proxy-Tests ausführen und Abdeckungsinventar auf fehlende Pfade prüfen; alle Lücken im vereinbarten Umfang schließen.

### Task 3: Zentrale Admin-Ansicht und Browser-Exporte

**Files:** Neu `src/app/m/portal/admin/audit/page.tsx`, eigene Client-Komponenten für Filter/Tabelle/Details, `src/core/audit/access.ts`, begrenzter Browser-Ereignisempfänger und Client-Helfer; ändern `src/app/m/portal/{layout.tsx,admin/page.tsx}`, `src/app/m/qr/QrDisplay.tsx`, `src/app/m/zeichen/_ui/baukasten/BaukastenInsel.tsx`; Portal-Anwendernotiz und Register; `e2e/suite-audit.spec.ts`.

**Interfaces:** Nutzt `queryAuditEvents` ausschließlich nach eigener Suite-Admin-Prüfung. Browserempfänger akzeptiert nur festgelegte QR-/Zeichen-Exportaktionen, setzt Herkunft `browser` und Akteur serverseitig. Kein allgemeiner Client-Schreibzugriff auf Audit-Events.

- [ ] Zuerst rote Rollenproben: Suite-Admin erlaubt; anonym, Nutzer, Modul-Admin und Portal-Admin-Override ohne Suite-Gruppe ausgeschlossen. Navigation und direkte Seite/Handler separat prüfen.
- [ ] Filter, Seitennavigation und Details implementieren; keine unbeschränkte Ereignisliste im Browser. Fehlzustand bei nicht verfügbarem Speicher/Übernahme sichtbar machen. Hell-/Dunkel und mobile Bedienung prüfen.
- [ ] Browserempfänger mit Herkunfts-, Größen-, Mengen- und Schema-Prüfung implementieren; gefälschte Akteure/Aktionen/Metadaten ablehnen. Erfolgreiche QR-/Zeichen-Exportaktion meldet eng begrenzte Daten und bleibt bei Offline-/Meldeproblemen nutzbar.
- [ ] Browsermeldungen eindeutig kennzeichnen. Portal-Anwendernotiz erstellen und registrieren.
- [ ] Playwright deckt tatsächlichen Einstieg, Filter, Detail, Rechte und Direktaufruf ab; Antworten der Testanfragen ausdrücklich prüfen.

### Task 4: Gesamtabnahme und unabhängiges Review

**Files:** Alle Feature-Dateien; Abnahmebericht `docs/superpowers/berichte/2026-09-06-suite-audit-log.md`.

- [ ] Abdeckungsinventar gegen Spec und aktuellen Quellbaum prüfen; kein Modul als fertig markieren, dessen Pfade nur geplant sind.
- [ ] Gesamtdiff unabhängig auf Rollenleck, Geheimnisabfluss, Actor-Vermischung, Transaktionsverlust, doppelte Ereignisse und Retention prüfen lassen; bestätigte Befunde beheben und erneut prüfen.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run`, `pnpm build`, `pnpm exec playwright test` mit passenden Laufzeit-/Testkonfigurationen ausführen. Jeden Exit-Code und wesentliche Einschränkungen dokumentieren.
- [ ] Finalen Git-Stand, Abdeckung und Testnachweise dokumentieren. Arbeitszweig reviewbar übergeben, nicht mergen oder deployen.
