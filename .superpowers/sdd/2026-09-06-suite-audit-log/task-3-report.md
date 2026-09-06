# Task 3 — Zentrale Audit-Ansicht und Browser-Exporte

Stand: 2026-09-06. Umsetzung auf `codex/suite-audit-log`, Basis `8bd97623`. Task 1/2 unverändert weiterverwendet; nur die unten beschriebene sichere Filtererweiterung und der Coverage-Katalog ergänzt. Kein Merge, Push oder Deployment. Der übergreifende Bericht unter `docs/superpowers/berichte/` gehört dem Parent und wurde nicht bearbeitet oder gestagt.

## Umsetzung und überprüfte Grenzen

- Portal → Verwaltung → Audit-Log und eigener Navigationseintrag. Navigation, Verwaltungseinstieg, direkte RSC-Seite und Daten-GET prüfen die tatsächliche Suite-Gruppe. `isAdmin` und Portal-/Modul-Admin-Overrides verleihen keine Audit-Leserechte. `requireAuditReader` läuft vor Query und Übernahme und protokolliert Rechteverweigerung mit serverseitigem Akteur. Keine neuen `use server`-Exports.
- Serverfilter für UTC-Zeitraum, Modul, genaue Personen-/Zugangskennung, Aktion, Ergebnis und bekannte geschützte Objektkennung. 50 Einträge pro Seite; stabiler vorhandener Cursor; Filterwechsel entfernt den Cursor. Ungültige/mehrfache/unbekannte Parameter werden abgelehnt. UTC-Tagesgrenzen sind ausdrücklich inklusive, mit Sommer-/Winterzeit-Tagen getestet.
- `AuditFilters.objectRefHash` akzeptiert genau 64 kleine Hexzeichen und kann nicht mit dem bisherigen Rohreferenzfilter kombiniert werden. Query vergleicht den vorhandenen `sha256:`-Wert ohne erneutes Hashen. Roh-/Hashabfrage ergeben nachgewiesen dieselben Treffer. Die Oberfläche übernimmt nur einen bereits gespeicherten Hash aus den Details in die URL; keine Rohreferenz, kein Token-Eingabefeld.
- RSC übergibt ausschließlich serialisierbare Daten. Tabelle, Renderfunktionen, Filter und Modal liegen in der Client-Insel. Feste deutsche Beschriftungen decken die Triggerobjekte sowie alle elf Task-2-Auslieferungstypen getrennt ab. Browserherkunft ist in Liste und Details als „Vom Browser gemeldet“ gekennzeichnet; Details erklären die fehlende Empfangsbestätigung.
- Eigene Zustände für erstmalig leer, keine Filtertreffer, ausstehende Übernahme, gestörte Übernahme und nicht verfügbaren Speicher. Keine leere Erfolgstabelle bei Speicherfehler. Fehlgeschlagene Formularvalidierung erhält Eingaben und fokussiert die Erklärung; laufende Navigation ist angekündigt und mehrfaches Anwenden gesperrt.
- `/api/audit/browser`: nur QR-PNG und Zeichen-PNG/SVG/JSON; exakt zwei erlaubte Felder. Strikte gleiche Herkunft, Content-Type, deklarierte und tatsächlich gelesene Grenze von 256 Bytes. Serverbestätigte Identität und Modulzugriff. Mengenbremse 30 je Akteur/Minute und 300 insgesamt/Minute; anonyme Meldungen teilen einen Schlüssel. Diese Bremse ist bewusst pro Prozess und wird bei Neustart zurückgesetzt. Keine IP-Zuschreibung, keine Clientakteure, Inhalte, Dateinamen oder Metadaten.
- Exakte Routing-Ausnahme nur für `/api/audit/browser`, auch auf QR-/Zeichen-Hosts geprüft; kein allgemeines API-Passthrough. GET ist lesefreier 204-Warmlauf, POST meldet Speicherprobleme als 503 mit festem, geheimnisfreiem Logtext. Browserexporte melden erst nach tatsächlicher Dateierzeugung und Downloadübergabe; Meldefehler und Offlinebetrieb verhindern den Export nicht. Keine Offline-Wiederholung behaupteter Erfolge.
- Coverage-Manifest ergänzt genau drei Callables: Empfänger-GET, Empfänger-POST, Audit-Daten-GET; zwei neue Denial-Verträge. Vorhandene Eintragsreihenfolge erhalten. Portal-Anwendernotiz mit drei kurzen Du-Absätzen im Register enthalten.

## Kanonisches Design und visuelle Prüfung

Gelesen und angewandt: `docs/design/README.md` und `docs/design/feedback-admin.md` sowie frontend-design-premium und upstream frontend-design. Die gepflegten Projektentwürfe bleiben maßgeblich; kein zweites Design- oder Tokensystem angelegt.

| Fähigkeit | Kanonischer Eigentümer / belegte Regel | Umsetzung und Prüfung |
| --- | --- | --- |
| Navigation, Seitentitel | Shell / Seitenkopf; README Zustands-/Einstiegsregeln | Bestehende Hülle, Rücklink Verwaltung, echte Navigation im Browser |
| Dichte, Typografie, Abstände | `core/theme` SPACE/SCHRIFT/ARBEITSDICHTE; README:74–86, feedback-admin:678 | 44px-Standard, kein size large/small, gemessene mobile Knopfhöhe |
| Auswahlfelder, Dialog, Tabelle | Ant Design, bestehender AntdProvider mit `antd/locale/de_DE`; feedback-admin:372–373, 843–857 | Autorisierte Antd-Selects, Client-Tabelle, Antd-Modal mit Escape; keine nativen Selects |
| Mobil | README:372–379 | Kartenliste statt gedrängter Tabelle; Aktionsgruppen volle Breite untereinander; Breakpoint 767.98px; Breite/Anordnung im Browser geprüft |
| Hell/Dunkel | README:180–187, feedback-admin:719 | Vorhandene Theme-Cookies und aufgelöstes html[data-theme], keine eigene Farbpalette |
| Feedback/Fehler | README Zustandsregeln; feedback-admin geschlossener Zustandsraum | Ladeankündigung, getrennte Leer-/Fehlerzustände, fokussierte Validierung, neutrale Datenflächen |

Premium-Scanner, exakt ausgeführt:

```sh
rtk proxy python3 /Users/rubeen/.codex/plugins/cache/openai-curated-remote/frontend-design-premium/1.4.0/skills/frontend-design-premium/scripts/audit_project.py /private/tmp/iuk-suite-audit-log --mode strict --config /private/tmp/audit-task3-premium-config.json --output /private/tmp/audit-task3-premium.json
```

Exit **2**, nicht als bestanden ausgewiesen. Drei eingeordnete Scannerbefunde: fehlende exakt formatierte Canonical-UI-Map-Tabelle im vorhandenen README, fehlender Dateiname `DESIGN.md` trotz verbindlich gepflegtem `docs/design/`, und `native-select-undecided`, weil der Scanner das importierte Antd-`Select` trifft. Projektanweisung/Parent verlangen ausdrücklich vorhandenes `docs/design/` als gepflegtes Äquivalent; keine konkurrierenden Design-Dateien. Der lokale Eigentümer ist oben dokumentiert. Scratch-Konfiguration: product-admin, sourceRoots nur neue Audit-UI, canonicalMap docs/design/README.md, locale de-DE. Der erste unbeschränkte Scannerlauf wurde wegen langsamen repo-weiten Scans mit Exit 130 beendet.

Anschließend Desktop 1440×960 und Mobil 390×844 tatsächlich angesehen; heller Filterbereich, mobile Karten, dunkle Details und dunkler Desktop. Die anfänglich langen mobilen Detailbeschriftungen wurden zu „Personen-ID“ und „Ereignis-ID“ gekürzt. Aktionsgruppen mobil untereinander; Modal-Schließen 44×44. Kein horizontaler Seitenüberlauf. Screenshots sind bewusst Scratch-Artefakte, nicht im Commit:

- `/private/tmp/audit-task3-shots/desktop.png`
- `/private/tmp/audit-task3-shots/mobile.png`
- `/private/tmp/audit-task3-shots/mobile-list.png`
- `/private/tmp/audit-task3-shots/mobile-dark-details.png`
- `/private/tmp/audit-task3-shots/desktop-dark.png`

Alle Bilder aus dem finalen Lauf, Animationen deaktiviert; Desktop vor Aufnahme auf scrollY=0. Die Detailansicht ist vollständig sichtbar. Kein Layoutumbau wegen zuvor versehentlich gescrolltem Desktopbild.

## Tests und tatsächliche Exit-Codes

Alle folgenden Befehle im Worktree `/private/tmp/iuk-suite-audit-log`, Node 22.23.0. Keine parallelen Fixture-Testläufe und kein paralleler Build/Dev-Server.

### Gezielte Tests

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/vitest/vitest.mjs run src/core/audit src/core/routing.test.ts src/app/api/audit src/app/m/portal/admin/audit src/app/m/portal/admin/page.test.tsx src/app/m/portal/layout.test.tsx src/app/m/portal/_lib/neuigkeiten/register.test.ts src/app/m/qr/QrDisplay.test.tsx src/app/m/zeichen/_ui/baukasten/BaukastenInsel.test.tsx --maxWorkers=2
```

Final: **18 Dateien, 294 Tests bestanden, Exit 0**, 5,47 s. Umfasst negative Rollen-/Receiver-/Speicher-/Filterproben, vorhandene Exportkomponenten, Release-Register und Coverage-Inventar. Erste Guard-/Receiverproben vor Implementierung rot wegen fehlenden Modulen (2 Suites); erster implementierter Rollen-/Receiver-/Routinglauf 49 Tests grün. Sichere Hashfilter-Probe vor Speicheränderung rot (1 fehlgeschlagen/8 bestanden), danach grün. Zusätzliche DOM-Proben mit bestehendem QR-Testharness: fünf echte Leer-/Fehlerzustände, erhaltene ungültige Eingabe mit Fokus, Cursorentfernung.

### Typen und scoped Lint

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/typescript/bin/tsc --noEmit --pretty false
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:$PATH GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/eslint/bin/eslint.js src/core/audit src/core/routing.ts src/core/routing.test.ts src/app/api/audit src/app/m/portal/admin/audit src/app/m/portal/admin/page.tsx src/app/m/portal/admin/page.test.tsx src/app/m/portal/layout.tsx src/app/m/portal/layout.test.tsx src/app/m/portal/_lib/neuigkeiten/register.ts src/app/m/portal/_lib/neuigkeiten/notizen/portal/2026-09-06-ereignisse-nachvollziehen.ts src/app/m/qr/QrDisplay.tsx src/app/m/zeichen/_ui/baukasten/BaukastenInsel.tsx e2e/suite-audit.spec.ts playwright.config.ts
```

Final beide **Exit 0**. Frühere, korrigierte Befunde: Actor-Union-Narrowing (tsc Exit 2), reservierter Next-Bezeichner `module` und JSX innerhalb try/catch (lint Exit 1). Finale Prüfung nach Korrekturen und mobiler Anpassung. Von next dev generierte `next-env.d.ts`-Pfadänderung anschließend auf den Ausgangsstand zurückgesetzt, nicht Teil der Änderung.

### Feature-Playwright

```sh
rtk proxy env PATH=/Users/rubeen/.local/share/mise/installs/node/22/bin:/private/tmp/iuk-suite-audit-log/node_modules/.bin:$PATH WATCHPACK_POLLING=1000 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.fsmonitor GIT_CONFIG_VALUE_0=false node node_modules/@playwright/test/cli.js test e2e/suite-audit.spec.ts --workers=1 --trace=on
```

Final **6 Fälle bestanden, Exit 0, 28,8 s**, mit genehmigter Chromium-Sandbox-Eskalation. Der vorherige vollständige Lauf war ebenfalls 6/6, Exit 0, 30,0 s; nach der kleinen mobilen Aktionsbreitenkorrektur nochmals vollständig geprüft. Fälle: tatsächlicher Admin-Einstieg/Filter/Details/Hash/50+5-Cursor/Darstellungen; Nutzer/Moduladmin/Portal-Override inklusive direkter Seite und GET; anonym; echter QR-PNG mit tatsächlichem Offlineexport; echte Zeichen-SVG/PNG/JSON mit Meldeausfall; Herkunft/Schema auf beiden Modulhosts. Neue Route vor POST mit GET gewärmt; POST-Antworten über waitForResponse und tatsächliche Downloads mit Dateibytes geprüft. Bestehende devLogin/wechsleAnmeldung/klickeWennRuhig genutzt. Suitegruppe und Portal-Override im E2E-Server ausdrücklich getrennt.

Traces in `test-results/**/trace.zip` kontrolliert: keine pageerror im Audit-Hauptablauf (explizite Assertion) und keine Console-Warnung/-Fehler in diesem Ablauf. Die drei absichtlichen 404-Direktseiten im Rollenfall enthalten jeweils erwartetes 404-Resource-Logging und Reacts Script-Tag-Warnung; keine Auditdaten und keine RSC-Serialisierungsfehler. Dies ist keine Behauptung einer vollständig warnungsfreien Suite.

### Laufumgebung und frühere Browserfehler

Systematic-debugging angewandt: ohne `node_modules/.bin` im PATH scheiterte der Webserver mit `next` nicht gefunden (Exit 127, Runner 1). Sandbox-fs.watch meldete reproduzierbar EMFILE bereits bei wenigen isolierten Watchern trotz ulimit -n=1048575. Nexts Watchpack-Remove-Pfad produzierte dabei irreführend `.next/dev was deleted`, obwohl das Verzeichnis vorhanden war. Keine fremden Builds/Dev-Prozesse als Ursache angenommen. Eigener abgebrochener Lauf Exit 130; ausschließlich nach PID/Port/CWD belegte eigene Restprozesse beendet. Polling nur als Prozess-Env gesetzt, kein Produktworkaround.

Mit Polling kam Chromium innerhalb der Sandbox bis zum Start, aber nicht in Testkörper: MachPortRendezvous/bootstrap_check_in Permission denied, sechs Startfehler, Exit 1. Erst der genehmigte eskalierte Browserlauf prüft Produktverhalten. Weitere echte Testursachen aus Trace isoliert: kalte Auth-/Route-Kompilierung, virtualisierte unsichtbare ARIA-Selectoption und mehrdeutiger Schließen-Selektor. Korrektur: Auth-Warmlauf, erwartete Navigation bzw. bestehende 30s-QR-Bereitschaft, Select-Tastaturvertrag, Escape. Kein Produkt-RSC-Fehler gefunden. Nach 5/6 wegen des Schließen-Selektors zunächst nur der betroffene Admin-Fall geprüft: **1 bestanden, Exit 0, 18,6 s**; erst danach vollständige grüne Läufe.

`rtk proxy lsof -nP -iTCP:3100 -iTCP:3310 -sTCP:LISTEN` nach finalem Lauf: **keine Ausgabe, Exit 1** (keine Listener). Next- und ClamAV-Testserver beendet, Ports frei. `git diff --check`: Exit 0. Keine Test-/Browser-/Serverprozesse dieses Auftrags bleiben aktiv. Vollständige Repo-Gates und unabhängige Review folgen beim Parent; diese werden hier nicht als durchgeführt ausgegeben.

## Selbstreview

Auftragspunkte gegen Brief/API/UI-Kontext geprüft; direkte Reads bleiben vor Zugriff geschützt, Empfänger kann keine Akteure/Felder fälschen, Hashlookup bleibt äquivalent und bounded, Browsermeldung ist best effort. Nur vorhandene Client-/Server-/Theme-Verträge verwendet. Keine neue Abhängigkeit, keine editierbaren Auditdaten und keine pauschalen Server-Action-Exporte. Coverage-Diff auf die drei Ergänzungen begrenzt. Erwartete Grenzen: Gruppenaktualität bleibt der bestehende Auth-Vertrag; Rate-Limit pro Prozess; Browsermeldung beweist keine Dateizustellung; neue Ereignisse erst ab Aktivierung. Für unabhängige Review und Gesamtprüfung bereit.
