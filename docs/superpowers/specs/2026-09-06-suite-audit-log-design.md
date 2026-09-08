# Suiteweites Audit-Log

Freigegeben im Gespräch am 06.09.2026. Diese Datei konkretisiert den freigegebenen Entwurf; sie erweitert den Umfang nicht.

## Verhalten

Unter Portal → Verwaltung → Audit-Log sehen ausschließlich Suite-Admins Ereignisse aller Fachmodule. Maßgeblich ist die Suite-Gruppe aus `suiteAdminGroup()`, niemals das Verwaltungsrecht eines einzelnen Moduls oder eine konfigurierbare Portal-Admin-Gruppe. Jede Datenabfrage und jeder direkte Seiten-/Handler-Aufruf prüft diese Berechtigung serverseitig. Keine Weitergabe von Audit-Daten an andere Nutzer. Die vorhandene Frischegrenze der Auth.js-Gruppen gilt; der Audit-Dienst führt keinen zweiten Gruppen-Cache ein.

Erfasst werden persistierte Änderungen, An-/Abmeldungen einschließlich Sitzungswiderruf, explizit verweigerte Zugriffe sowie fachliche Downloads und Exporte. Reguläre Seitenaufrufe, technische Assets und wiederholte Sitzungsabfragen sind keine Audit-Ereignisse. Erfasst werden Portal, QR-Codes, Feedback, Dateien, Lagerbuch, Aufgaben, Funkgeräte, Drohnentraining, taktische Zeichen sowie gemeinsame Kontofunktionen.

Ein Eintrag enthält Ereignis-ID, Zeitpunkt, Modul, Aktion, Objekttyp und sichere Referenz, Akteurart und verfügbare serverseitig bestätigte Identität, Ergebnis und Herkunft. Objektänderungen dürfen die Namen geänderter Felder enthalten, aber keine unkontrollierten Datensatzabbilder. Identität wird niemals aus Client-Parametern übernommen. Bei anonymen Abläufen steht anonym; Hintergrundaktionen stehen als Systemaktionen im Log. Anonyme Feedback-Abgaben erhalten keine Personenidentität oder aus anderen Vorgängen übernommene Korrelation.

Keine Passwörter, Token, Cookies, Zugangscodes, vollständigen Token-URLs, Feedback-Antworten, Datei-Inhalte oder sonstigen unkontrollierten Nutzlasten im Audit. Referenzen, die selbst Zugänge ermöglichen, werden vor der Speicherung irreversibel abgeleitet. Audit-Einträge überleben das Löschen ihres Fachobjekts. Die Anwendung bietet kein Bearbeiten und kein einzelnes Löschen an. Gegen direkte Manipulation durch einen Server-/Datenbankbetreiber wird keine kryptographische Revisionssicherheit behauptet.

## Speicherung und zuverlässige Übernahme

Ein gemeinsamer Dienst unter `src/core/audit` führt eine eigene SQLite-Datenbank über `CORE_MIGRATIONS`; Bootstrap und Docker enthalten die Migrationen. Jedes Fachmodul führt eine persistente Ausgangstabelle für Änderungsereignisse. Änderung und Ausgangsereignis werden in derselben SQLite-Transaktion gespeichert. SQL-Trigger auf ausdrücklich registrierten Fachtabellen gewährleisten Abdeckung auch für bestehende und zukünftige Schreibwege dieser Tabellen. Technische Cache-/Sitzungstabellen werden bewusst getrennt behandelt. Ein Test inventarisiert alle Schema-Tabellen und verlangt eine Entscheidung zur Abdeckung.

Der Dienst übernimmt Ausgangsereignisse idempotent in die zentrale Datenbank. Ein Neustart oder eine wiederholte Übernahme erzeugt weder Verluste noch doppelte Einträge. Bei nicht verfügbarer zentraler Datenbank bleiben Ausgangsereignisse erhalten; die Oberfläche meldet einen Fehler beziehungsweise ausstehende Übernahme anstelle eines scheinbar leeren Logs. Ein Fehler beim lokalen Ausgangseintrag bricht die zugehörige Änderung ab. Das Rollenmodell und das Ergebnis bestehender Fachtransaktionen bleiben maßgeblich.

Server Actions und Handler bekommen einen begrenzten asynchronen Audit-Kontext zur Akteurszuordnung. Kein globaler veränderlicher Request-Akteur und kein Auslesen von Cookies in SQLite-Funktionen. Serverereignisse ohne Fachmutation (Anmeldung, Verweigerung, Auslieferung) werden explizit über die Audit-Schnittstelle geschrieben. Sicherheitsentscheidungen bleiben wirksam, selbst wenn deren Fehlerprotokollierung scheitert; solche Fehler werden ohne sensible Daten laut gemeldet.

Standardaufbewahrung 90 Tage, über `SUITE_AUDIT_AUFBEWAHRUNG_TAGE` als positive ganze Zahl konfigurierbar. Abgelaufene zentrale Einträge werden automatisch entfernt; noch nicht übertragene Ereignisse werden nicht durch eine pauschale Warteschlangenlöschung verloren. Die Altersgrenze gilt beim zentralen Lesen und Übertragen ebenfalls, sodass alte Ausgangseinträge nicht dauerhaft wieder erscheinen.

## Downloads, Authentifizierung und Ablehnungen

Ein erfolgreicher serverseitiger Download bedeutet bereitgestellte Antwort, nicht nachgewiesenes Speichern auf dem Endgerät. Ablehnungen werden an der tatsächlichen Rechteprüfung erfasst; eine gewöhnliche nicht gefundene Ressource ist nicht automatisch ein Rechteverstoß. Pocket-ID-Ereignisse werden nur erfasst, soweit sie die Suite tatsächlich beobachtet; keine erfundenen Ereignisse über Vorgänge ausschließlich beim Identitätsanbieter.

QR-/Zeichen-Exporte, die im Browser erzeugt werden, senden einen eng begrenzten Ereignistyp an den Server. Diese stehen sichtbar als „Vom Browser gemeldet“ im Log und werden nicht als serverseitiger Nachweis ausgegeben. Der Empfänger akzeptiert keine beliebigen Aktionen, Akteure oder Metadaten; er besitzt Größen-, Herkunfts- und Mengenbegrenzungen. Offline-/unterbundene Browsermeldungen sind kein verlässlicher Nachweis und dürfen bestehende Exportfunktionen nicht zerstören.

## Oberfläche

Die zentrale Seite bietet Zeitraum-, Modul-, Personen-, Aktions- und Ergebnisfilter, eine Detailansicht sowie begrenzte serverseitige Seitennavigation mit stabiler Reihenfolge. Filter werden validiert und als parametrisierte Abfragen ausgeführt. Datenbanken und sensible Daten bleiben im Servergraph. Die Ansicht nutzt vorhandene Ant-Design-/Suite-Konventionen, 44px-Bedienziele, Hell-/Dunkelmodus und die bestehende Shell. Der Einstieg erscheint nur für Suite-Admins, unabhängig von Portal-Modulrechten.

## Abnahme

- Reale SQLite-Tests für Speichern, Rollback, lokalen Schreibfehler, zentrale Störung, Neustart/Wiederholung, Aufbewahrung und stabile Filter/Seitengrenzen.
- Tests für Akteursisolation paralleler Anfragen, Redaktion und anonyme Feedback-Abgaben.
- Inventar sämtlicher Fachtabellen, Schreib-/Auth-/Downloadpfade und expliziter Ausnahmen.
- Negative Zugriffsproben für anonym, normale Nutzer, reine Modul-Admins und Portal-Admins ohne Suite-Gruppe; positive Probe für Suite-Admins.
- Browserprobe von Navigation, Filter, Details und direktem Zugriff, einschließlich Modul-Hosts.
- Typecheck, ESLint, Vitest, Produktionsbuild und Playwright mit nachgewiesenem Exit-Code. CI-Laufzeit Node 22, pnpm 11.0.9; Docker nutzt derzeit Node 26 und wird durch den Build nicht umgestellt.
- Anwendernotiz im Portal im selben Auslieferungsstand.
