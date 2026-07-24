# Runbook — Feedback-Cutover (da-feedback → iuk-suite)

Ziel: Die Feedback-Domain von der Go-Alt-App `da-feedback` auf das Suite-Modul `feedback`
umschwenken. Rollback ist frei (Router zurück + Alt-Container an). Alt-Stack bleibt 2 Wochen in
Standby.

## ⚠️ Die zwei Dinge, die diesen Cutover von den vorigen unterscheiden

**1. Es hängen gedruckte QR-Codes daran.** Die Aushänge in den Gruppenräumen zeigen auf
`https://<feedback-domain>/f/<slug>-<secret>`. Beide Anwendungen bedienen **denselben Pfad**
(Alt-App: `GET /f/{slugSecret}` in `internal/ui/router.go`; Suite: `f/[slugSecret]`), und der Importer
übernimmt `slug` und `secret` **1:1**. Gedruckte Codes überleben den Cutover daher unverändert —
**vorausgesetzt `SUITE_HOST_FEEDBACK` ist genau der Host, der bisher in `DAF_BASE_URL` stand.** Ein
anderer Host macht jeden Aushang im Verband zu Altpapier. Das ist der teuerste Fehler, den dieser
Cutover erlaubt, und er fällt erst am nächsten Dienstabend auf.

**2. Der Import ist nicht atomar.** `runFeedbackImport` schreibt **zuerst** und prüft die Parität
**danach** (so kommentiert in `scripts/import/feedback.ts`). Ein geworfener Paritätsfehler bedeutet
also: das Ziel wurde bereits mit Importzeilen beschrieben — **nicht** „nichts ist passiert". Deshalb
**vor** dem Import einen Volume-Snapshot ziehen (Schritt 4); ohne ihn ist der Rückweg das Löschen der
Modul-Datenbank.

## Vorbedingungen

- CI grün, Image `ghcr.io/rubenvitt/iuk-suite:latest` gepusht.
- Die Suite läuft bereits (Portal- und QR-Cutover sind erfolgt) — dieser Cutover fügt nur einen Host
  hinzu. Der Suite-Stack darf also **laufen** bleiben; anders als beim Portal-Cutover gibt es keine
  Apex-Router-Kollision, solange `SUITE_HOST_FEEDBACK` noch nicht gesetzt ist.
- **Die echte Domain feststellen** — sie steht **nicht** im Repo (`docker-compose.yml` der Alt-App
  trägt den Platzhalter `feedback.example.com`), sondern in der Server-`.env` der Alt-App:
  ```
  grep DAF_BASE_URL /pfad/zu/da-feedback/.env
  ```
  Der Host aus dieser URL ist der Wert für `SUITE_HOST_FEEDBACK`. Alles Weitere hängt daran.
- **`.env` der Suite ergänzen:**
  | Variable | Wert | Folge, wenn sie fehlt |
  |---|---|---|
  | `SUITE_HOST_FEEDBACK` | der Host aus `DAF_BASE_URL` | Das Modul ist unter der Domain nicht erreichbar; gedruckte QR-Codes zeigen ins Leere. |
  | `POCKET_ID_FACHGRUPPEN_CLAIM` | Name des Attributs in Pocket ID, das die Fachgruppen-Slugs einer Person führt (Rückfall: `fachgruppen`) | Gruppenleiter sehen ihre Gruppe nur, wenn sie zusätzlich im Werkzeug zugeordnet sind. Kein Sicherheitsproblem, aber Handarbeit. |

## Vor dem Wartungsfenster: die Zuordnung klären

Ohne diesen Schritt sieht nach dem Cutover **kein Gruppenleiter** seine Gruppe — nur Suite-Admins
können arbeiten. Zwei Wege, beide zulässig, sie ergänzen sich (Vereinigungsmenge):

1. **Pocket ID:** Jeder Gruppenleitung das Fachgruppen-Attribut mit den **Slugs** ihrer Gruppen
   zuweisen. Die Slugs stehen in der Alt-Datenbank:
   ```
   sqlite3 feedback.db "SELECT slug, name FROM groups ORDER BY name;"
   ```
   Der Vergleich ist **exakt und Groß-/Kleinschreibung beachtend**. Wichtig: Das Attribut darf in
   Pocket ID **nicht durch die Nutzer selbst editierbar** sein — sonst vergibt sich jeder seine
   Gruppenleitung.
2. **Im Werkzeug:** In den Einstellungen der Gruppe aus dem Nutzerverzeichnis auswählen. Das
   Verzeichnis füllt sich, sobald jemand das Modul betritt — eine Person ist also erst zuordenbar,
   **nachdem** sie sich einmal angemeldet und `/m/feedback` geöffnet hat. Für den Cutover-Tag heißt
   das: entweder Weg 1 vorbereiten, oder die Gruppenleitungen bitten, sich einmal anzumelden.

**Prüfpunkt aus der Portierung — jetzt entscheiden:** In der Alt-Datenbank ist `user_groups.user_id`
als `number | string` typisiert. Die Suite erwartet dort den **OIDC-`sub`**. Prüfen:
```
sqlite3 feedback.db "SELECT DISTINCT user_id FROM user_groups LIMIT 5;"
```
- Sehen die Werte wie OIDC-Subjekt-Kennungen aus (UUID-artig) → Import übernimmt sie korrekt, nichts
  zu tun.
- Sind es **fortlaufende Zahlen** (interne Nutzer-IDs der Alt-App) → die importierten Zuordnungen sind
  **wertlos**, weil sie auf keinen SSO-Nutzer zeigen. Dann die Zuordnung nach dem Cutover über Weg 1
  oder 2 neu setzen und die importierten Zeilen ignorieren. Das ist kein Fehler des Imports (die
  Parität ist trotzdem grün — sie prüft Gleichheit der Werte, nicht ihre Bedeutung).

## Ablauf

1. **Generalprobe** (lokal, gegen eine **Kopie** des echten Dumps, nicht gegen das Original):
   ```
   cp /pfad/zu/feedback.db /tmp/gp-feedback.db
   DATA_DIR=./.data/gp pnpm exec tsx scripts/import/feedback.ts /tmp/gp-feedback.db
   ```
   → muss mit `Feedback import OK — <n> Zeilen, Parität grün.` enden. Bricht es ab: **kein Cutover**,
   Report prüfen.
   Danach stichprobenhaft gegen die Alt-Anwendung vergleichen: Gruppenzahl, Abendzahl, und für einen
   Abend die Durchschnittsnoten. Die Parität beweist den Datenbank-Rundlauf, **nicht** die
   Richtigkeit der Zuordnung von Feldern — der Stichprobenvergleich schließt diese Lücke.

2. **Freeze:** Alt-App stoppen (kurzes Wartungsfenster). Damit ist die SQLite-Datei konsistent —
   ein `cp` einer *laufenden* SQLite kann einen halben Schreibvorgang erwischen.
   ```
   docker compose -f /pfad/zu/da-feedback/docker-compose.yml stop
   ```

3. **Echten Snapshot ziehen** (bei gestoppter App):
   ```
   sqlite3 /pfad/zu/feedback.db ".backup '/tmp/feedback-cutover.db'"
   ```
   (`.backup` statt `cp`, weil es auch bei aktivem WAL einen konsistenten Stand liefert.)

4. **Volume der Suite sichern** — Pflicht, weil der Import nicht atomar ist:
   ```
   docker run --rm -v suite_data:/data -v "$PWD":/out node:22-alpine \
     tar czf /out/suite_data-vor-feedback-import.tgz -C /data .
   ```

5. **Import** — aus einem **Repo-Checkout**, nicht aus dem App-Image (das standalone-Image enthält
   weder `scripts/` noch `tsx`):
   ```
   VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')
   DATA_DIR="$VOL" pnpm exec tsx scripts/import/feedback.ts /tmp/feedback-cutover.db
   ```
   Alternative ohne Host-Pfad (throwaway-Container):
   ```
   docker run --rm -v suite_data:/data -v "$PWD":/repo -w /repo \
     -v /tmp/feedback-cutover.db:/src.db node:22-alpine \
     sh -c 'corepack enable && pnpm install && DATA_DIR=/data pnpm exec tsx scripts/import/feedback.ts /src.db'
   ```
   Entscheidend: Ausgabe endet mit `Parität grün`.

6. **Paritätscheck fehlgeschlagen?** → **kein Cutover.** Volume aus Schritt 4 zurückspielen, Report
   prüfen, Alt-App wieder starten.

7. **Verify vor dem Flip** — gegen das echte Image, per ephemerem Container **ohne Traefik-Labels**
   (keine Router-Kollision möglich):
   ```
   docker run --rm -p 3000:3000 -v suite_data:/data \
     -e AUTH_SECRET=<secret> -e SUITE_HOST_FEEDBACK=<feedback-domain> \
     ghcr.io/rubenvitt/iuk-suite:latest
   ```
   In einem zweiten Terminal, mit **echten** Werten aus der Alt-Datenbank:
   ```
   # 1. Öffentliche Strecke — der Test, der die gedruckten Aushänge beweist
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Host: <feedback-domain>" "http://127.0.0.1:3000/f/<slug>-<secret>"
   ```
   Erwartet: `200` (läuft eine Umfrage) bzw. die gestaltete Seite „Zurzeit läuft keine Umfrage" —
   **nicht** `404`. Ein `404` heißt: Slug/Secret kamen nicht korrekt an → abbrechen.
   Weiter stichprobenhaft: QR-Bild (`/f/<slug>-<secret>` → QR-Karte im Cockpit), eine Auswertung eines
   Abends mit bekannten Zahlen, und dass ein Gruppenleiter **fremde** Gruppen nicht sieht.
   Danach Container stoppen.

8. **Cutover** — Reihenfolge ist entscheidend, nie beide Router gleichzeitig aktiv:
   1. Traefik-Router der **Alt-App zuerst deaktivieren** (Container ist seit Schritt 2 gestoppt; jetzt
      auch die Labels entfernen bzw. den Service aus dem Stack nehmen, damit er nicht bei einem
      Neustart zurückkommt).
   2. Erst danach `SUITE_HOST_FEEDBACK` in der Suite-`.env` setzen und
      ```
      docker compose pull && docker compose up -d
      ```
      (holt `:latest` statt einer veralteten lokalen Kopie und aktiviert den neuen Host).

9. **Nachprüfung am echten Host** (nicht per Host-Header, sondern über DNS/TLS):
   ```
   curl -s -o /dev/null -w '%{http_code}\n' "https://<feedback-domain>/f/<slug>-<secret>"
   ```
   Und **mit einem echten gedruckten QR-Code aus einem Gruppenraum scannen.** Das ist die einzige
   Prüfung, die den gesamten Pfad belegt (Papier → Kamera → DNS → TLS → Router → Modul).
   Danach einmal die Admin-Strecke durchgehen: Anmelden, Cockpit öffnen, „Feedback starten", QR
   sichtbar, eine Testabgabe, Auswertung, Umfrage beenden, Testabend wieder löschen.

10. **Standby & Abbau:** Nach 2 Wochen Alt-Stack abbauen, `feedback.db` als Tarball archivieren,
    GitHub-Repo `da-feedback` archivieren. Den Volume-Snapshot aus Schritt 4 mindestens so lange
    behalten.

## Rollback

**Vor Schritt 8** (kein Router umgestellt): Alt-App starten, fertig. Die importierten Daten in der
Suite stören nicht, weil das Modul ohne `SUITE_HOST_FEEDBACK` unter der Domain nicht erreichbar ist.

**Nach Schritt 8:** `SUITE_HOST_FEEDBACK` entfernen, `docker compose up -d`, Alt-Router und
Alt-Container zurück. Sekunden. Achtung: Rückmeldungen, die zwischen Cutover und Rollback in der Suite
abgegeben wurden, stehen **nur** dort — vor einem Rollback prüfen, ob welche eingegangen sind:
```
docker compose exec suite sh -c 'ls -la /data/feedback.db'
```
und gegebenenfalls die Modul-Datenbank sichern, bevor die Alt-App wieder Antworten annimmt.
Ein erneuter Import nach dem Rollback ist idempotent (`importFeedback` überschreibt anhand der IDs) —
er würde in der Suite abgegebene Rückmeldungen aber **nicht** in die Alt-App zurücktragen.

## Was sich für die Nutzer sichtbar ändert

Kurz kommunizieren, damit am nächsten Dienstabend niemand stutzt:

- **QR-Codes und Aushänge bleiben gültig.** Nichts neu drucken.
- **Der Ablauf ist kürzer:** „Feedback starten" erzeugt Dienstabend und Umfrage in einem Schritt; ein
  separates Aktivieren gibt es nicht mehr.
- **Die Umfrage schließt automatisch** zwei Tage nach dem Abend (bisher: zwei Tage nach dem
  Aktivieren). Manuelles Beenden bleibt möglich.
- **Die Bewertung sieht anders aus:** farbige Notenfelder 1–6 statt Sterne. Die Skala ist unverändert
  die Schulnote — alle Altdaten bleiben vergleichbar.
- **Neu:** QR-Code und Teilnahme-Link stehen im Cockpit, es gibt eine Druckansicht für den Aushang,
  eine Zwischenauswertung während der laufenden Umfrage, und die Rückmeldungen werden in zufälliger
  Reihenfolge angezeigt (bisher in Eingangsreihenfolge — das ließ auf die Person schließen).
