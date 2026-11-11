# Runbook: Inbetriebnahme des Moduls `gemeinschaft`

Das Modul gehört der Helfergruppe „Gemeinschaft“ (IDA-320, POC IDA-319): Events und Projekte mit
Aufgaben und Zuständigen, ein gemeinsamer Kalender, eine Mitgliederliste mit persönlichen Links und die
Vermietung der Bar (IDA-315, POC IDA-310) als eigener Abschnitt.

## 1. Wer was sieht

| Wer | Wie | Was |
| --- | --- | --- |
| Leitung | Anmeldung über Pocket ID, Gruppe `gemeinschaft-admin` (`SUITE_ADMIN_GROUP_GEMEINSCHAFT`; der Suite-Admin zählt mit) | alles: Events, Projekte, Mitglieder, Vermietung |
| Mitglied | persönlicher Link `/mein/<code>`, **kein Konto** | eigene Aufgaben abhaken, sich für offene eintragen, nächste Termine |
| alle | ohne Anmeldung `/bar` | Bar frei/belegt sehen und anfragen; Stand über `/status/<code>` |

Mitglieder stehen nur in diesem Modul, nicht in Pocket ID. Geht ein Link verloren oder in falsche Hände,
erzeugt die Leitung unter **Mitglieder → Neuer Link** einen neuen; der alte gilt sofort nicht mehr.

`requiresAuth` ist `false`, weil drei Pfade ohne Anmeldung gehen müssen. Den Rest riegelt das Modul selbst
(`_lib/zugang.ts`, Host-Riegel in `_lib/host.ts`).

## 2. Umgebung

```
SUITE_HOST_GEMEINSCHAFT=gemeinschaft.iuk-ue.de
# optional, Vorgabe gemeinschaft-admin
# SUITE_ADMIN_GROUP_GEMEINSCHAFT=gemeinschaft-admin
```

Turnstile (IDA-341): sind `TURNSTILE_SITE_KEY` und `TURNSTILE_SECRET` gesetzt, verlangt die Bar-Anfrage ein
Turnstile-Token. Der Host muss dann im Cloudflare-Widget als Domain stehen und, falls `TURNSTILE_HOSTNAMES`
gesetzt ist, auch dort (`gemeinschaft.iuk-ue.de`) — sonst scheitert jede Sendung an der Prüfung (`.env.example`).

Reihenfolge wie bei jedem neuen Modul: erst das Image mit dem Modul ausrollen, dann den Host setzen
(ein altes Image bricht an einem unbekannten `SUITE_HOST_*` beim Boot ab). Der Host braucht einen
DNS-Eintrag und die Traefik-Regel auf den Suite-Container. Die Datenbank `gemeinschaft.db` legt der
Boot-Pfad an (`MODULE_MIGRATIONS`); sie gehört ins nächtliche Backup wie die anderen Moduldatenbanken
(`backup-sidecar.md`). Die abgelegten Mietverträge (PDF) liegen in derselben Datenbank.

Mietvertrag (IDA-343): Vorlage und unterschriebene Verträge liegen ebenfalls in `gemeinschaft.db`. Jede
hochgeladene Datei (Vorlage, Ablage der Leitung, Upload auf der Statusseite) prüft clamd vor dem Speichern,
fail-closed. Die Wegwerfdatei liegt unter `/data/kommplan-scan/gemeinschaft` (Volume `kommplan_scan`, das
clamd schon lesend sieht); es braucht keinen neuen Mount. Eigene Variablen, nur bei abweichendem Scanner:

```
# GEMEINSCHAFT_AV_HOST=clamav
# GEMEINSCHAFT_AV_PORT=3310
# GEMEINSCHAFT_AV_TIMEOUT_MS=30000
```

## 3. Erste Schritte nach dem Deploy

1. Gruppe `gemeinschaft-admin` in Pocket ID anlegen, die Leitung hineinnehmen, die Gruppe am OIDC-Client
   „IDA“ erlauben.
2. Mit der Leitung anmelden, unter **Mitglieder** die Gruppe anlegen und jedem seinen Link schicken.
3. Unter **Vermietung → Sperrzeiten** die festen Termine der Bereitschaft eintragen (z. B. Dienstabende).
4. Unter **Vermietung → Mietvertrag** die Vorlage hochladen und das Unterschriftenfeld aufziehen.
5. Den Link `https://<host>/bar` dort bekannt machen, wo bisher nach der Bar gefragt wurde.
6. Unter Portal → Verwaltung → Audit erscheinen die Änderungen mit Modul `gemeinschaft`.

## 4. Was hier bewusst fehlt

- **E-Mail.** Weder Mitglieder noch anfragende Personen bekommen Post; beide haben ihren Link.
- **Kaution, Abrechnung, qualifizierte Signatur.** Der Mietvertrag ist eine Vorlage, die auf der Statusseite
  per Fingerunterschrift (einfache elektronische Signatur) oder per hochgeladenem Ausdruck unterschrieben wird.
- **Weitere Räume.** Das Datenmodell trägt `raum`, die Oberfläche kennt heute nur die Bar.
