# Suiteweites Audit-Log — Abnahmebericht

Die Umsetzung liegt auf `codex/suite-audit-log` im Arbeitsbaum `/private/tmp/iuk-suite-audit-log`. Produktstand: `73ad39fed595b9ac0a026778fced656e24e92996`; ergänzte Browser-Testvorrichtungen: `55236677d831297a0dad2e4b3a9429b38fbf3164`. Grundlage ist `origin/main` bei `0334c7c1`. Die Gesamtabnahme ist abgeschlossen; alle erforderlichen Prüfungen sind erfolgreich beendet.

## Ergebnis

Unter **Portal → Verwaltung → Audit-Log** sehen ausschließlich Mitglieder der tatsächlichen Suite-Admin-Gruppe die suiteweiten Ereignisse. Modul-Adminrechte und ein Portal-Admin-Override reichen nicht aus. Navigation, direkte Seite und Datenzugriff sind getrennt serverseitig geschützt.

Erfasst werden Änderungen, An-/Abmeldungen einschließlich Sitzungswiderruf, tatsächliche Zugriffsverweigerungen sowie Downloads und Exporte aus allen neun Fachmodulen und den Kontofunktionen. Normale Seitenaufrufe und technische Assets bleiben ausgenommen. Filter nach Zeitraum, Modul, Akteur, Aktion und Ergebnis, stabile Seitennavigation mit 50 Einträgen sowie Ereignisdetails stehen zur Verfügung. Die Oberfläche ist auf Desktop, Mobilgerät und im Dunkelmodus geprüft.

147 Trigger erfassen Änderungen an 49 ausdrücklich registrierten Fachtabellen in derselben Transaktion wie die Änderung. Lokale Ausgangstabellen ermöglichen eine wiederholbare Übernahme in die zentrale Audit-Datenbank; eine zentrale Störung verliert dadurch keine bereits lokal protokollierten Änderungen. Die Standardaufbewahrung beträgt 90 Tage, einstellbar über `SUITE_AUDIT_AUFBEWAHRUNG_TAGE` als positive ganze Zahl. Migrationen, Hintergrundübernahme und Containerdateien sind angebunden.

Bestätigte Benutzer, gemeinsame Zugangscodes, anonyme Abläufe und Systemarbeit werden unterschieden. Anonyme Feedback-Antworten erhalten keine Person, Referenz oder übernommene Korrelation. Objektreferenzen werden vor der Speicherung gehasht; Geheimnisse, Cookies, Formular- und Dateiinhalte werden nicht als Audit-Nutzlast übernommen. Eine Anwendernotiz ist im Portal registriert.

## Abnahme

| Prüfung | Ergebnis | Geprüfter Stand |
| --- | --- | --- |
| Typecheck | Exit 0 | Produktstand und Testkorrektur |
| Vollständiges ESLint | Exit 0; 0 Fehler, 13 bestehende Warnungen | Produktstand |
| Vollständiges Vitest | Exit 0; 612 Dateien, 10.039 bestanden, 1 bestehender Skip | Produktstand |
| Produktionsbuild | Exit 0; 58 statische Seiten; Audit-Seite und Handler enthalten | Produktstand |
| Sechs korrigierte Browser-Testdateien | Exit 0; 56 bestanden | Testkorrektur |
| Vollständiges Playwright | Exit 0; 405 bestanden, 17,8 Minuten | Testkorrektur |
| Unabhängige Gesamt- und Korrekturprüfung | Freigegeben, keine offenen Befunde | Produktstand und Testkorrektur |

Die Produktquellen und `next-env.d.ts` sind zwischen den beiden geprüften Commits identisch. Die letzte Korrektur registriert ausschließlich die bereits produktiv verwendeten Audit-SQLite-Funktionen in sechs schreibenden Browser-Testverbindungen. Deshalb bleiben die vollständigen Produktprüfungen gültig; der vollständige Browserlauf ist am korrigierten Teststand mit 405 bestandenen Fällen abgeschlossen.

Die Befehle verwenden Node 22.23.0 und die lokal installierten Runner. Der Browserlauf nutzt einen Worker sowie `WATCHPACK_POLLING=1000`, weil Dateisystem-Watcher in der lokalen Sandbox schon bei wenigen Verzeichnissen mit EMFILE scheiterten. Chromium läuft mit freigegebenem Hostzugriff. Das produktive Projektverhalten wird durch diese Testumgebung nicht verändert.

## Prüfbefunde und Korrekturen

Die unabhängigen Prüfungen deckten Transaktionsverhalten, Akteurszuordnung, Geheimnisabfluss, Rollen, Aufbewahrung, Mehrfachübernahme und die konkreten Modulpfade ab. Bestätigte Befunde wurden korrigiert und erneut geprüft. Dazu gehören vollständige Ablehnungsereignisse, sichere Download-Referenzen, getrennte Objektfilter-Namensräume, ergebnisabhängige Auslieferungstexte, ein Budget auch für abgelehnte Browsermeldungen, Filter-Zurücksetzen, Feldfehlerzuordnung und Tabellenlayout.

Bei Aufgaben bleiben die bestehenden Berechtigungen erhalten: sechs tatsächlich erreichbare Seitenablehnungen sind geprüft; die zusätzliche Plan-Ablehnung ist derzeit wegen des immer erlaubenden bestehenden Prädikats nicht erreichbar. Deren Test ist ausdrücklich eine synthetische Fehlerprobe, ergänzt durch eine reale Probe des erlaubten fremden Plans.

Ein früherer vollständiger Browserlauf am Produktstand endete mit 379 bestandenen und 26 fehlgeschlagenen Fällen (Exit 1). Alle 26 Fehler waren fehlende `suite_audit_id`-Registrierungen in den sechs Testverbindungen; die anschließende Inventur erfasste sämtliche 18 direkten SQLite-Konstruktoren. Dieser frühere Lauf ist kein grüner Abnahmenachweis. Ein noch früherer Lauf wurde für Reviewkorrekturen bewusst abgebrochen (Exit 130).

Der zusätzliche Premium-Designscanner bleibt mit Exit 2 dokumentiert: Er erwartet andere Dokumentnamen/Tabellenformate und klassifiziert Antd Select als natives Element. Die verbindlichen Projektregeln unter `docs/design/` und die tatsächlich gerenderte Oberfläche wurden separat geprüft; ein bestandener Scanner wird nicht behauptet.

## Entscheidungen und Kosten

1. Der isolierte Arbeitsbaum liegt unter `/private/tmp`, um im erlaubten Schreibbereich zu arbeiten. Kosten: Der Pfad ist temporär; der Arbeitszweig bleibt erhalten.
2. Nicht ausführbare Skill-Helfer wurden über Bash beziehungsweise direkt erzeugte Aufgabenbeschreibungen verwendet. Kosten: gleichwertige Hilfsausgaben wurden lokal gepflegt.
3. Objektreferenzen werden grundsätzlich gehasht und Rohreferenzen nur serverseitig aufgelöst. Kosten: IDs sind im Protokoll nicht direkt lesbar.
4. Gemeinsame Zugangscodes erhalten die Akteursart „Zugang“ statt einer behaupteten Benutzeridentität. Kosten: eine zusätzliche Akteurskategorie.
5. `docs/design/` bleibt die verbindliche Designquelle. Kosten: Die abweichenden Formatannahmen des Premium-Scanners bleiben als Exit 2 sichtbar.
6. Objektfilter verwenden Modul, Objekttyp und Hash gemeinsam. Kosten: Tabellenänderungen und anders typisierte Auslieferungsereignisse bleiben getrennte Suchbereiche, bis eine belegte Zuordnung existiert.
7. Das bisher erlaubende Plan-Prädikat bleibt unverändert. Kosten: Das Audit-Feature führt keine zusätzliche Sichtbeschränkung für Pläne ein; die defensive Ablehnungsprobe ist synthetisch.

## Fachliche Grenzen

Ein serverseitig erfolgreicher Download belegt eine bereitgestellte Antwort, nicht das Speichern auf dem Endgerät. Browser-Exporte werden als vom Browser gemeldet kenntlich gemacht und können bei Offline-Nutzung fehlen; die Meldemengenbegrenzung ist pro Serverprozess und wird beim Neustart zurückgesetzt. Die bestehende Aktualisierungsfrist der Authentifizierungsgruppen bleibt bestehen. Das Protokoll behauptet keine kryptographische Revisionssicherheit gegenüber einem direkten Server- oder Datenbankbetreiber. Ereignisse werden ab Aktivierung erfasst; es gibt keine rückwirkende Rekonstruktion.

Die zugehörigen Inventare und freigegebenen Reviewberichte liegen unter [Nachweise](2026-09-06-suite-audit-log-nachweise/). Arbeitszweig und Arbeitsbaum werden zur Prüfung übergeben; Merge und Deployment sind nicht erfolgt.
