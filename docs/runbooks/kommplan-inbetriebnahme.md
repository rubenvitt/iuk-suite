# Runbook — Modul `kommplan` produktiv schalten

Ziel: die Kommunikationspläne unter einer eigenen Domain (Beispiel hier: `kommplan.iuk-ue.de`)
erreichbar machen. **Kein Cutover** — die Excel-Vorlage wird nicht importiert (Spec
`docs/superpowers/specs/2026-09-30-modul-kommunikationsplaene-design.md`, §12). Das Modul startet mit
einer leeren Datenbank; Pläne, Bibliothek und Briefkopf legen die Bearbeitenden selbst an.

## Was ohne Konfiguration passiert

| Variable | Pflicht | Was ohne sie passiert |
|---|---|---|
| `SUITE_HOST_KOMMPLAN` | **ja** | Das Modul liefert nur auf seinem eigenen Host aus (Host-Riegel `_lib/host.ts`). Ohne Eintrag gibt es in Produktion **keinen** solchen Host: jede Seite, jeder Token-Link und jede Action antwortet 404, die Kachel fehlt im App-Umschalter. Derselbe Wert ist die Basis der Token-Links und des QR-Codes auf dem Ausdruck (`moduleUrl("kommplan")`) und steht auf der Allowlist der Anmeldung (`core/auth/redirect.ts`). |
| `SUITE_ACCESS_GROUP_KOMMPLAN` | nur wenn die Pocket-ID-Gruppe anders heißt als `iuk-kommplan` | Zugang (ansehen, drucken) hat nur, wer die Registry-Gruppe trägt. **Leer gesetzt bricht den Boot ab** (`validateGroupConfig`). |
| `SUITE_ADMIN_GROUP_KOMMPLAN` | nur wenn die Gruppe anders heißt als `iuk-kommplan-bearbeiten` | Leer gesetzt startet die Suite, aber bearbeiten (Pläne, Bibliothek, Einstellungen, Links) darf nur noch die Suite-Admin-Gruppe. |
| `KOMMPLAN_AV_HOST`/`_PORT`/`_TIMEOUT_MS` | nein | Vorgabe `clamav`, `3310`, `30000` — der Compose-Sidecar. |

Die Bearbeitungsgruppe genügt für den Zugang; wer bearbeitet, braucht die Zugangsgruppe nicht
zusätzlich. Ein Gruppenentzug wirkt mit bis zu einer Stunde Verzug (Gruppen im JWT, `CLAUDE.md`,
„Zugriffsschutz"). **Ein ausgestellter Token-Link ist davon unabhängig:** wer ihn hat, sieht den Plan
ohne Anmeldung, bis der Link abläuft, widerrufen oder der Plan archiviert wird.

## Ablauf

1. **Gruppen in Pocket ID anlegen und besetzen.** Eine Gruppe zum Ansehen und Drucken, eine zum
   Bearbeiten; die Bearbeitungsgruppe braucht mindestens ein Mitglied, sonst kann niemand außer dem
   Suite-Admin den ersten Plan anlegen. Heißen die Gruppen in der Instanz anders als die
   Registry-Vorgaben, löst das die `.env` (Schritt 2) — die Literale in `core/registry.ts` bleiben
   unverändert, `e2e/gruppen.json` hängt daran.

2. **`.env` des Stacks ergänzen** (Vorlage in `.env.example`, Abschnitt „kommplan"):
   ```
   SUITE_HOST_KOMMPLAN=kommplan.iuk-ue.de
   # nur bei abweichenden Instanznamen:
   SUITE_ACCESS_GROUP_KOMMPLAN=<Gruppe zum Ansehen>
   SUITE_ADMIN_GROUP_KOMMPLAN=<Gruppe zum Bearbeiten>
   ```
   Reiner Hostname, ohne Protokoll und Port.

3. **DNS-Eintrag** für die Domain auf den Suite-Host und **`SUITE_TRAEFIK_RULE` erweitern**, sonst
   erreicht die Domain den Container nicht:
   ```
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`kommplan.iuk-ue.de`)
   ```

4. **Stack hochziehen**: `docker compose pull && docker compose up -d`. Der Boot legt `kommplan.db`
   an und wendet die Migrationen an (`MODULE_MIGRATIONS` in `core/bootstrap.ts`). Dabei entsteht das
   benannte Volume `kommplan_scan` (`compose.yaml`, Abschnitt `volumes:`): `suite` schreibt dort
   hochgeladene Logos für die Dauer des Virenscans hin, `clamav` liest sie. Eigentümer und Modus
   übernimmt das leere Volume aus dem Image (`Dockerfile`, `/data/kommplan-scan`). Das Backup mountet
   das Volume bewusst nicht — es hält nur Wegwerfdateien; das Logo selbst steht in `kommplan.db`, und
   die sichert der Sidecar wie jede `*.db` in `DATA_DIR` mit. Der Seed (`pnpm seed:lokal`) läuft hier
   nie; ohne Briefkopf bleibt der Kopf der Ausdrucke leer, das ist gewollt.

## Prüfschritte nach dem Rollout

Jeder Schritt prüft eine Annahme, die lokal und in der CI nicht belegbar ist.

1. **Anmelden und Erstzugang.** Von `https://kommplan.iuk-ue.de/` aus mit einem Konto der
   Bearbeitungsgruppe anmelden: man muss danach wieder auf der Planliste stehen (nicht im Portal),
   im Seitenkopf stehen „Bibliothek", „Einstellungen" und „Archiv". Gegenprobe mit einem Konto, das
   nur die Zugangsgruppe trägt: kein „Neu", kein „Bibliothek", `/bibliothek` und `/einstellungen`
   antworten 404.

2. **Logo hochladen** unter „Einstellungen" (PNG oder SVG, unter 1 MB). Das belegt drei Dinge auf
   einmal: das Volume `kommplan_scan` ist für `suite` beschreibbar, `clamav` darf es lesen, und die
   Herkunftsprüfung des Uploads (`Origin` gegen `x-forwarded-host`/`host`) trägt hinter dem
   Reverse-Proxy. Beide Fehler sind laut, nie still:
   - „Die Virenprüfung ist gerade nicht möglich. Versuch es später noch einmal." heißt: Scanner nicht
     erreichbar oder Volume nicht les-/beschreibbar (Eigentümer, gemeinsame Gruppe mit clamd).
   - „Hochladen geht nur aus der Seite „Einstellungen“." (HTTP 403) heißt: `Origin` und Host passen
     hinter dem Proxy nicht zusammen.
   Danach einen Plan drucken: das Logo steht rechts oben auf **jedem** Blatt.

3. **Token-Link von zwei Geräten.** Im Editor „Teilen" → „Link ausstellen" → „Link kopieren". Den
   Link auf zwei Geräten öffnen, eins davon **ohne** Anmeldung (etwa ein Telefon im Mobilfunknetz):
   beide zeigen den Plan mit Stand (und dem VS-NfD-Vermerk, wenn er eingeschaltet ist), ohne
   Suite-Hülle. Die Antwort trägt
   `x-robots-tag: noindex, nofollow, noarchive`, `referrer-policy: no-referrer` und ein
   `cache-control` mit `no-store` (Entwicklerwerkzeuge des Browsers, Reiter „Netzwerk").
   Im Teilen-Flyin zählt der Link danach Abrufe; dieselbe Adresse zählt je Minute höchstens einmal.
   Zählt er nach zwei Geräten nur einen Abruf, kommen beide mit derselben Client-Adresse an
   (`cf-connecting-ip`) — harmlos für die Ansicht, aber ein Befund für den Betrieb, weil andere
   Module dieselbe Adresse für Schranken nutzen. Zum Schluss den Link widerrufen: beide Geräte zeigen
   nach dem Neuladen „Dieser Link gilt nicht (mehr)." mit HTTP 404, ohne Weg zur Anmeldung.

4. **QR ausdrucken und scannen.** Als Bearbeitende im Plan „QR-Code „Aktuelle Fassung“ auf dem
   Ausdruck" einschalten (Flyin „Plan und Verbindungen" oder „Teilen"), einen gültigen Link
   ausstellen und „Drucken" auf Papier, nicht nur als PDF. Den Code (24 mm, unten rechts) mit zwei
   verschiedenen Telefonen scannen: beide öffnen die Token-Ansicht unter `https://kommplan.iuk-ue.de/t/…`.
   Wer nur die Zugangsgruppe trägt, druckt intern ohne QR — das ist gewollt (Spec §8.2).
   Scannt ein Telefon nicht zuverlässig, ist die Stellschraube die Kantenlänge (`QR_BOX`), nicht die
   Fehlerkorrektur (`core/qr` gilt für alle Module).

## Rollback

`SUITE_TRAEFIK_RULE` zurücksetzen und `docker compose up -d`. Ohne Datenverlust: `kommplan.db`
bleibt im Daten-Volume. Ausgestellte Token-Links führen dann ins Leere; sie werden wieder gültig,
sobald die Domain zurückkommt — wer das nicht will, archiviert die Pläne vorher (Archivieren
widerruft alle ihre Links).
