# Runbook: Inbetriebnahme des Moduls `lagemonitor`

Das Modul ist die Verwaltung des Lagemonitors im FüKw (Repo `lagemonitor`, Spec 4.4): Standort,
Warnregion, Warnschwelle, welche Teile der Monitor zeigt und die Verbindung zu Suchlage. Der Monitor
holt die Einstellungen jede Minute unter `GET /api/konfiguration` ab, behält den letzten Stand in seiner
eigenen Datenbank und läuft damit auch ohne Internet weiter. Die Suite ist also die Verwaltung, nicht
die Laufzeit.

## 1. Gruppe in Pocket ID

| Variable | Vorgabe | Bedeutung |
| --- | --- | --- |
| `SUITE_ADMIN_GROUP_LAGEMONITOR` | `lagemonitor-admin` | die ganze Verwaltung |

Es gibt keine Lesegruppe: Wer nicht verwalten darf, bekommt einen 404. Der Suite-Admin zählt mit.
Das Modul hat `requiresAuth: false`, weil der Monitor ohne Sitzung abholt; die Seiten riegelt
`_lib/zugang.ts`.

## 2. Umgebung

```
SUITE_HOST_LAGEMONITOR=lagemonitor.iuk-ue.de
```

DNS-Eintrag und Traefik-Regel wie bei jedem Modul. `lagemonitor.db` legt der Boot-Pfad an
(`MODULE_MIGRATIONS`); sie gehört ins nächtliche Backup (`backup-sidecar.md`). Sie enthält das
Großbild-Token aus Suchlage im Klartext, denn der Monitor braucht es; die Zugangsschlüssel der Monitore
dagegen nur als SHA-256.

## 3. Einrichten

1. Unter **Lagemonitor** Standort und Warnregion eintragen, Warnschwelle und Teile wählen, **Speichern**.
   Die Vorschau zeigt jede Änderung vorher mit Beispieldaten.
2. Für Suchlage: in Suchlage unter **Einstellungen → Großbild** einen Zugang anlegen (etwa
   „Lagemonitor FüKw") und den Link `https://…/kiosk#…` unter **Suchlage** einfügen. Suchlage muss die
   Version mit der Lagemonitor-Schnittstelle haben (`/api/lagemonitor/v1/lage`).
3. Unter **Zugänge für den Monitor** einen Zugang anlegen. Die zwei angezeigten Zeilen kommen in die
   `.env` des Lagemonitors (`deploy/README.md` im Repo `lagemonitor`, Abschnitt 9), danach den Dienst
   neu starten. Der Schlüssel steht nur in diesem Moment da.
4. Prüfen: nach spätestens einer Minute die Seite neu laden; in der Liste der Zugänge steht dann „zuletzt
   abgeholt“, und der Monitor zeigt unten keinen Hinweis „Konfiguration aus IUK-Suite nicht abholbar“.

## 4. Meldungen am Monitor

Unter **Meldungen am Monitor** steht ein kurzer Hinweis als blaues Band unter der Kopfzeile, etwa
„Nächste Lagebesprechung“. Mit einer Uhrzeit zählt der Monitor herunter („in 42 min“). Jede Meldung
läuft ab (Vorgabe 24 Stunden, höchstens 7 Tage), höchstens drei laufen gleichzeitig. Der Monitor
prüft den Ablauf selbst: eine Meldung verschwindet pünktlich, auch wenn die Suite nicht erreichbar
ist. **Beenden** nimmt sie spätestens nach der nächsten Abholung (eine Minute) herunter; ohne
Verbindung zur Suite bleibt sie bis zu ihrem Ablauf stehen.

Ein Monitor ohne Meldungsband (ältere Version) übergeht das Feld `notices` im Drahtformat einfach.

**QR-Code fürs Ehrenamt** (Vorgabe aus): unter **Mitmachen im Ehrenamt** einschalten, eine
`https://`-Adresse (Mitmach-Seite des Ortsvereins) und einen kurzen Satz eintragen. Der Monitor zeigt
den Code unten rechts auf der Karte, aber nur in ruhiger Lage: bei einer Warnung im Band oder einem
laufenden Suchlage-Einsatz blendet er ihn aus. Das Feld `recruitment` übergeht ein älterer Monitor.

## 5. Online-Monitor und Links ohne Anmeldung

Neben dem FüKw läuft der Lagemonitor ein zweites Mal auf iuk-services, unter
`https://lagemonitor.iuk-ue.de/monitor/` (Traefik nimmt nur `/monitor`, der Rest des Hosts bleibt bei
der Suite; Einrichtung im Repo `lagemonitor`, `deploy/cloud/README.md`). Er holt mit einem eigenen
Zugang ab und lässt nur mit Pocket ID (`lagemonitor-nutzer`, `lagemonitor-admin`) oder mit einem Link
hinein.

```
LAGEMONITOR_ONLINE_URL=https://lagemonitor.iuk-ue.de/monitor
```

Ohne diese Zeile zeigt **Links für Rechner ohne Anmeldung** nur einen Hinweis. Mit ihr legt die
Verwaltung benannte Links an (`…/monitor/auth/link#<Schlüssel>`); der Link steht genau einmal da,
gespeichert ist nur sein SHA-256, der mit der Konfiguration als `publicLinks` zum Monitor geht. Ein
Rechner, der den Link einmal öffnet, bleibt angemeldet. **Widerrufen** sperrt jeden Rechner mit diesem
Link nach spätestens einer Minute aus. Ein älterer Monitor übergeht das Feld.

## 6. Störungen

- **Monitor zeigt alte Einstellungen**, unten „nicht abholbar": Zugang widerrufen oder Suite nicht
  erreichbar. Der Monitor läuft mit dem letzten Stand weiter; einen neuen Zugang anlegen oder die
  Verbindung herstellen.
- **Kein Einsatz zu sehen**, obwohl Suchlage einen hat: Großbild-Zugang in Suchlage widerrufen oder
  Link falsch. Unten steht dann „Suchlage nicht erreichbar"; einen neuen Großbild-Link eintragen.
- **Lokal**: `pnpm seed:lokal lagemonitor` legt eine Anzeige und einen Zugang an und gibt den Schlüssel
  aus.
