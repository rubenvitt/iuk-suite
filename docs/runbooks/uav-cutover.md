# Runbook — Cutover Modul `uav` (uav-praxis → iuk-suite)

Ziel: Die Domain **`uav-training.iuk-ue.de`** von der Alt-Anwendung `uav-praxis`
(React/Vite-PWA + Hono + `node:sqlite`) auf das Suite-Modul `uav` umschwenken. Alle bereits
verteilten Zugänge (Dauer-Code, Magic-Link, Session-Cookie, Offline-Zustand) funktionieren danach
unverändert — das ist die harte Anforderung aus
`docs/superpowers/specs/2026-08-28-uav-modul-design.md` §3. Rollback ist frei (Router zurück +
`docker start`). Alt-Stack bleibt 14 Tage in Standby.

**Kein ClamAV, kein Blob-Umzug** (anders als `files-cutover.md`) — `uav.db` ist eine reine SQLite,
`scripts/backup.sh` sammelt sie mit den anderen `*.db` bereits ein, ohne Änderung.

**Zwei Deploys, nicht einer.** Anders als bei `feedback`/`portal` liegt zwischen dem Merge nach
`main` und dem Domain-Schwenk eine bewusste Lücke: das Modul geht mit `UAV_SW_MODUS=abraeumen`
scharf, **bevor** ein einziger Teilnehmer die Suite sieht — der Abräum-Worker unter `/sw.js`
liegt dann bereit, wird aber erst mit dem Host-Schwenk (§C) für irgendjemanden sichtbar. Reihenfolge:
§A (Betreiber, vor allem) → §B (Deploy 1, automatischer Rollout) → §P (Generalprobe, jederzeit
danach) → §C (Cutover, Host-Schwenk) → §S (Standby 14 Tage) → §E (Abbau).

---

## §A — Vorab (Betreiber)

Diese vier Dinge stehen nicht im Repo und müssen vor der Generalprobe (§P) erledigt sein:

1. **Gruppe `uav-training-admin` in Pocket ID anlegen, Mitglieder eintragen.** Das ist die
   Vorgabe aus `src/core/registry.ts` (`adminGroups: ["uav-training-admin"]`, Betreiberentscheidung
   28.08.2026); ein anderer Gruppenname geht über `SUITE_ADMIN_GROUP_UAV` in die `.env`
   (`_lib/requireUavAdmin.ts` prüft darüber, `core/groups.ts` löst auf). Ohne diese Gruppe sieht
   nach dem Cutover niemand die Verwaltung — nicht einmal ein Tippfehler in der Variable fällt
   auf: `isModuleAdmin` lässt zusätzlich den Suite-Admin durch, das Modul wirkt also benutzbar,
   nur die vorgesehenen Personen kommen nicht hinein.

2. **Drei Zeilen in die Prod-`.env` der Suite** — noch **ohne** den Host in
   `SUITE_TRAEFIK_RULE` (der kommt erst in §C, sonst kollidiert der neue Router mit dem laufenden
   `uav-praxis`-Router auf demselben Namen):
   ```
   SUITE_HOST_UAV=uav-training.iuk-ue.de
   SUITE_ADMIN_GROUP_UAV=uav-training-admin
   UAV_SW_MODUS=abraeumen
   ```
   `UAV_SW_MODUS` ist Pflicht, sobald `SUITE_HOST_UAV` gesetzt ist — fehlt sie oder ist sie
   verschrieben, bricht der Boot mit einer Meldung aus `_lib/boot.ts` ab
   (`uavBootFehler`, Spec §5). Vorgabe ist deshalb, `SUITE_HOST_UAV` erst zusammen mit den beiden
   anderen Zeilen zu setzen, nicht einzeln vorab.

3. **Snapshot der Alt-DB ziehen** (WAL-Modus — `docker-compose.yml` von `uav-praxis` mountet
   `./data:/app/data`, `DATABASE_PATH=./data/app.db`; ein `cp` einer laufenden WAL-SQLite ist
   inkonsistent, im `data/`-Verzeichnis liegt sichtbar eine `app.db-wal`):
   ```bash
   cd <uav-praxis-Verzeichnis auf dem Server>
   docker compose exec app sqlite3 /app/data/app.db ".backup /app/data/snap.db"
   docker compose cp app:/app/data/snap.db ./snap.db
   ```
   (Der Container heißt je nach Compose-Projektname z. B. `uav-praxis-app-1` — `docker compose ps`
   zeigt den tatsächlichen Namen; alternativ `docker exec <container> sqlite3 …` mit dem Namen aus
   `docker ps`.)

4. **Zählungen aus dem Snapshot** — dieselben Zahlen kommen nach dem Import in §P/§C aus dem
   Paritätsbericht zurück, hier nur als Beleg, was überhaupt drüben ankommen muss:
   ```bash
   sqlite3 snap.db "select count(*) from participants;"
   sqlite3 snap.db "select count(*) from executions;"
   sqlite3 snap.db "select count(*) from task_status;"
   sqlite3 snap.db "select count(*) from sessions where kind='participant' and expires_at > datetime('now');"
   ```
   Zahlen hier eintragen, bevor es weitergeht:

   | Tabelle | Zahl |
   |---|---|
   | `participants` | ⬜ |
   | `executions` | ⬜ |
   | `task_status` | ⬜ |
   | `sessions` (aktive Teilnehmer-Sitzungen) | ⬜ |

---

## §B — Deploy 1 (vor dem Cutover, kein Host-Schwenk)

Merge des Feature-Branches nach `main` löst den automatischen Rollout aus
(`docs/runbooks/auto-rollout.md`) — ein Klick auf **Review pending deployments → produktion →
Approve and deploy**, kein manueller Server-Schritt. Danach:

```bash
curl -s https://iuk-ue.de/api/health/uav
```

Erwartet: `{"status":"ok",...,"revision":"<merge-sha>"}` — `revision` ist der Merge-SHA, die
Gegenprobe aus `auto-rollout.md` Teil C, Schritt 3, nur auf den Modul-Health-Pfad angewandt statt
auf `/api/health/portal`.

**Der `uav`-Host zeigt zu diesem Zeitpunkt noch die Alt-App** — `SUITE_HOST_UAV` steht zwar in
der `.env` (§A), aber `SUITE_TRAEFIK_RULE`/der Traefik-Router für die Domain zeigt bis §C
weiterhin auf `uav-praxis`. Das Modul ist ab jetzt nur über `/m/uav/…` auf der Apex-Domain oder
per Host-Header erreichbar, nicht über die Prod-Domain.

⛔ Ab diesem Deploy liegt `/sw.js` auf der (noch von der Alt-App bedienten) Domain bereit als
Abräum-Worker, sobald der Host tatsächlich wechselt — sichtbar wird das erst mit §C, nicht jetzt.

---

## §P — Generalprobe (lokal, jederzeit nach §A/§B, vor §C)

```bash
DATA_DIR=./.data/gp pnpm exec tsx scripts/import/uav.ts snap.db
```

Der Aufruf entspricht `runUavImport()` in `scripts/import/uav.ts:409-426`. Erwartet, als letzte
Zeile:

```
uav-Import OK — <n> Zeilen, Parität grün.
```

Bricht der Lauf ab, steht die Ursache in der Fehlermeldung — entweder ein `ParityReport`-Mismatch
(`scripts/import/parity.ts`) oder der eigenständige Wurf bei einer abweichenden
`login_code`-Menge (`paritaetUav`, `scripts/import/uav.ts:373-382` — das ist die einzige Prüfung,
die **vor** jeder anderen Parität wirft, weil der Dauer-Code der einzige Zugangsweg eines
Teilnehmers ist). **Bricht die Generalprobe ab: kein Cutover, Ursache klären.**

Danach lokal gegen den Import-Stand prüfen, dass ein Magic-Link wirklich einlöst:

```bash
DATA_DIR=./.data/gp SUITE_HOST_UAV=uav.localtest.me pnpm dev
```

Einen aktiven Code aus dem Snapshot ziehen:

```bash
sqlite3 snap.db "select login_code from participants where aktiv=1 limit 1;"
```

und `http://uav.localtest.me:3000/login?code=<code>` öffnen — das ist die Brücke aus
`src/core/routing.ts:52-58` (`decideRoute`, Fall „uav-Host + `/login` + `code`-Parameter" →
Rewrite auf `/m/uav/login`). Erwartet: automatische Einlösung, Dashboard mit Fortschritt. Lokal
ohne echten Snapshot geht dasselbe gegen den Seed-Code aus `_lib/seedLokal.ts:88`
(`E2ETEST1` für die aktive Teilnehmerin „Erika Mustermann").

---

## §C — Cutover (Host-Schwenk)

Reihenfolge ist entscheidend, nie beide Router gleichzeitig aktiv:

1. **Freeze** — `uav-praxis` stoppen. Das ist zugleich der Konsistenz-Schritt (kein `cp` einer
   laufenden WAL-DB nötig, weil nichts mehr schreibt):
   ```bash
   docker compose -f <uav-praxis-Verzeichnis>/docker-compose.yml stop app
   ```
2. **Snapshot erneut ziehen** — der Container steht (Schritt 1), die Datei im Bind-Mount ist also
   konsistent; ein `.backup` ist hier nicht mehr zwingend, aber die sichere Wahl bleibt dieselbe
   wie in §A.3 (die Zahlen aus §A.4 sind jetzt der Vergleichswert, nicht mehr die Quelle):
   ```bash
   sqlite3 <uav-praxis-Verzeichnis>/data/app.db ".backup /tmp/cutover-snap.db"
   ```
3. **Import auf dem Server** — aus einem Repo-Checkout, nicht aus dem App-Image (das
   standalone-Image enthält weder `scripts/` noch `tsx`, Muster `feedback-cutover.md`):
   ```bash
   VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')
   DATA_DIR="$VOL" pnpm exec tsx scripts/import/uav.ts /tmp/cutover-snap.db
   ```
   (Pfad nach dem tatsächlichen Server-Layout — `docker compose exec suite pnpm import:uav
   /data/cutover-snap.db` ist die Alternative, falls `import:uav` als `package.json`-Script
   verdrahtet ist und die Snapshot-Datei ins Suite-Volume kopiert wurde.) Entscheidend: Ausgabe
   endet mit `uav-Import OK — <n> Zeilen, Parität grün.` — sonst **kein Cutover**, Volume-Snapshot
   (falls vorhanden) zurückspielen, `uav-praxis` wieder starten.
4. **Traefik-Regel setzen** — jetzt erst den Host aktiv schalten (Muster
   `aufgaben-inbetriebnahme.md`):
   ```
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || Host(`<bestehende Hosts>`) || Host(`uav-training.iuk-ue.de`)
   ```
   ```bash
   docker compose pull && docker compose up -d
   ```
5. **Verify** — fünf Prüfungen, in dieser Reihenfolge:
   ```bash
   curl -sI -H "Host: uav-training.iuk-ue.de" https://<server-ip-oder-apex>/
   curl -s -H "Host: uav-training.iuk-ue.de" https://<server-ip-oder-apex>/api/health/uav
   curl -s -H "Host: uav-training.iuk-ue.de" https://<server-ip-oder-apex>/sw.js | grep -o "registration.unregister"
   ```
   Erwartet: `/` = 200, `/api/health/uav` mit `revision` = Merge-SHA aus §B, `/sw.js` enthält
   `registration.unregister` (Beleg, dass `UAV_SW_MODUS=abraeumen` tatsächlich ausgeliefert wird —
   `_lib/sw-quelle.ts:47`, `UAV_SW_ABRAEUM_QUELLE`). Danach die beiden Prüfungen, die kein `curl`
   ersetzen kann:
   - **Ein echter Magic-Link von einem Teilnehmergerät.** Eine Person mit gültigem Code öffnet
     `https://uav-training.iuk-ue.de/login?code=<ihr Code>` auf ihrem eigenen Handy — Beleg, dass
     die Brücke (`routing.ts:52-58`) auch über den echten Host/DNS/TLS-Pfad greift, nicht nur
     lokal.
   - **Ein Handy mit der alten Installation neu laden.** Die Alt-Oberfläche muss verschwinden
     (der Abräum-Worker registriert sich aus, löscht alle Caches und navigiert das offene Fenster
     neu — `_lib/sw-quelle.ts:32-59`), und **Fortschritt sowie eine noch nicht gesyncte
     Erfassung müssen erhalten bleiben** — das ist Spec §3 #4: die `localStorage`-Keys
     (`drk-drohnen-fortschritt`, `-katalog`, `-sync-queue`, `-last-sync`, `-uebernommen`,
     `_ui/offline/localStore.ts:25-30`) sind wörtlich aus der Alt-App übernommen und werden vom
     neuen Origin unverändert gelesen; eine Warteschlange, die beim Neuladen leer ist oder ein
     Fortschritt, der auf null steht, ist ein Abbruchgrund.

Erst wenn alle fünf Punkte stehen, gilt der Cutover als vollzogen.

---

## §S — Standby (14 Tage)

`uav-praxis` bleibt gestoppt, Volume unangetastet. **Rollback:**

```bash
# 1. SUITE_TRAEFIK_RULE der Suite wieder auf den Stand vor §C.4 zurücksetzen, dann:
docker compose up -d
# 2. uav-praxis wieder starten
docker compose -f <uav-praxis-Verzeichnis>/docker-compose.yml start app
```

⚠️ **Nach einem Rollback fehlen in der Alt-DB alle Sync-Schreibungen, die während der Suite-Zeit
eingegangen sind** — der Import ist ein Einbahnweg (SQLite→SQLite, keine Rückschreibung). Vor
einem Rollback deshalb prüfen, ob seit dem Cutover synchronisiert wurde:

```bash
docker compose exec suite sh -c 'sqlite3 /data/uav.db "select count(*) from executions where created_at > \"<Cutover-Zeitpunkt>\";"'
```

und die Suite-DB (`uav.db`) sichern, bevor die Alt-App wieder Schreibzugriff bekommt. Ein
erneuter Import nach einem Rollback ist idempotent (Upsert per PK, `scripts/import/uav.ts:225-254`)
— er trägt aber keine in der Suite-Zeit entstandenen Zeilen in die Alt-App zurück.

---

## §E — Abbau (nach 14 Tagen Standby, ohne Rollback)

1. **`UAV_SW_MODUS=cachen` setzen und ausrollen** — erst jetzt, nicht früher (Spec §5): vorher
   räumte der Cache-Worker sich selbst weg, solange noch ein Gerät die Alt-Installation trägt.
   ```bash
   sed -i 's/^UAV_SW_MODUS=.*/UAV_SW_MODUS=cachen/' .env
   docker compose up -d
   ```
   Verify: `curl -s -H "Host: uav-training.iuk-ue.de" .../sw.js` enthält jetzt `uav-pwa-v1`
   (`_lib/sw-quelle.ts:79`, `UAV_SW_CACHE_QUELLE`) statt `registration.unregister`.
2. **Container, Volume und Repo von `uav-praxis` archivieren** — Volume-Tarball vorher ziehen
   (`docker run --rm -v <uav-praxis-volume>:/data -v "$PWD":/out node:22-alpine tar czf
   /out/uav-praxis-data.tgz -C /data .`), danach `docker compose down`, GitHub-Repo `uav-praxis`
   archivieren.
3. **Alten OIDC-Client in Pocket ID löschen** — den Wert vorher aus der Alt-`.env` ablesen
   (`grep OIDC_CLIENT_ID <uav-praxis-Verzeichnis>/.env`), nicht raten; er wird mit dem
   Alt-Admin-Login obsolet, da die Verwaltung jetzt über das Suite-SSO läuft (Spec §2, `admins`/
   `oidc_states` entfallen ersatzlos beim Import).

**Was NICHT abgebaut wird:** der `FAL_KEY` in der Alt-`.env` ist ein Dev-Werkzeug für die
Bildgenerierung (`pnpm gen:images`, kein Prod-Geheimnis) und bleibt bestehen — Betreiberentscheidung
28.08.2026, Spec §6. Er hat mit dem Cutover nichts zu tun und gehört nicht auf diese Liste.

---

## §H — Offene Betreiberzeilen

| | Zeile | Fällig |
|---|---|---|
| ⬜ | Gruppe `uav-training-admin` in Pocket ID angelegt, Mitglieder drin | vor §P |
| ⬜ | Snapshot der Alt-DB (`.backup`) auf dem Server erzeugt | vor §P |
| ⬜ | Traefik-Regel / `SUITE_HOST_UAV` gesetzt | §C |
| ⬜ | Ein Teilnehmergerät für den Verify verfügbar (Magic-Link + alte Installation) | §C |

---

## Was in diesem Runbook NICHT vorkommt

- **`uav-checklists`/`uav-signatures`** — bleiben außerhalb der Suite (Betreiberentscheidung
  28.08.2026, Spec §0). Kein Teil dieses Cutovers.
- **Eine Migration des `admins`-Bestands** — Alt-Admin-Sessions verfallen bewusst, Admins kommen
  ab dem Cutover ausschließlich aus dem Suite-SSO (Spec §2).
- **Ein zweites Wartungsfenster für §P** — die Generalprobe läuft gegen ein Wegwerf-`DATA_DIR`
  und braucht die Alt-App nicht anzufassen, `uav-praxis` läuft währenddessen normal weiter.
