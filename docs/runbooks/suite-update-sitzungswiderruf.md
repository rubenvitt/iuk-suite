# Runbook — Suite-Update: Profilseite und Sitzungswiderruf

Für den Server-Agenten. **Ein Teil, kein Cutover:** die laufende Suite auf den Stand
bringen, der `/profil` und den Knopf „Von allen Geräten abmelden" mitbringt. Keine
Domain wird umgeschwenkt, kein Modul zieht um.

> **Das Ungewöhnliche an diesem Update ist, wie wenig zu tun ist.** Keine neue
> Umgebungsvariable, keine Änderung an `compose.yaml`, keine Datei neben der `.env`,
> kein Eingriff ins Volume. Der Deploy ist `pull` + `up -d`. Die Substanz dieses
> Runbooks steckt deshalb nicht in den Schritten, sondern in **Abschnitt 5
> (Rollback)** — dort gibt es eine Eigenschaft, die man kennen muss, bevor man
> zurückrollt, nicht danach.

## Was das Update mitbringt

- `/profil` auf der Portal-Domain: zeigt Name, E-Mail, Gruppen, Fachgruppen, Kennung
  und „angemeldet seit". Nur lesend — Stammdaten pflegt weiterhin Pocket ID.
- Ein Knopf, der **alle** Sitzungen dieser Suite für die drückende Person sofort
  ungültig macht, auf jedem Gerät.
- Ein Eintrag „Profil" im Nutzermenü jedes Moduls, der auf die Portal-Domain führt.

Technisch dahinter: eine Widerrufs-Epoche je Person in einer **neuen SQLite-Datei
`konto.db`**, geprüft bei jeder Anfrage im Auth-Pfad.

## 0. Was NICHT passiert — bitte vorher lesen

**Es gibt keinen Zwangs-Logout.** Bestehende Sitzungen laufen über das Update hinweg
weiter. Der Grund: ein Token ohne Anmeldestempel gilt als „bei 0 angemeldet", und
widerrufen wird nur, wenn für die Person eine Epoche existiert — die entsteht erst
beim ersten Knopfdruck. Zum Zeitpunkt des Deploys ist die Tabelle leer.

Wer also mit Rückfragen „warum bin ich abgemeldet?" rechnet: die kommen von diesem
Update nicht.

## 1. Vorbedingung: das Image muss den richtigen Commit tragen — sonst STOPP

```bash
docker pull ghcr.io/rubenvitt/iuk-suite:latest

docker image inspect ghcr.io/rubenvitt/iuk-suite:latest \
  -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}'
```

Die Revision muss der aktuelle `main`-Commit sein. **Stimmt sie nicht: hier abbrechen
und melden.** Ein altes Image hätte die Migration für `konto.db` nicht — und dann
steht zwar `/profil` nirgends, aber es fällt auch nichts auf, bis jemand den Knopf
sucht.

## 2. Ephemere Prüfung, bevor es live geht

Container **ohne Volume und ohne Traefik-Labels** — er kann weder die Produktiv-DB
anfassen noch mit dem Router der laufenden Suite kollidieren:

```bash
docker run --rm -d --name suite-verify -p 3999:3000 \
  -e AUTH_SECRET=verify-only \
  -e POCKET_ID_ISSUER=https://id.iuk-ue.de \
  ghcr.io/rubenvitt/iuk-suite:latest
sleep 15
```

**Das eine, was hier wirklich geprüft wird: kommt der Boot durch?**

```bash
docker logs suite-verify 2>&1 | tail -30
curl -fsS -H "Host: iuk-ue.de" http://127.0.0.1:3999/api/health/portal
```

Der Boot migriert alle Modul-Datenbanken **und** die neue core-Datenbank
(`migrateAllModules()` in `src/core/bootstrap.ts` läuft über `MODULE_MIGRATIONS`
**und** `CORE_MIGRATIONS`). Fehlte die `COPY`-Zeile für `src/core/konto/_db/migrations`
im Image, wirft `migrate()` — und weil das in `instrumentation.ts` vor dem ersten
Request steht, **startet die gesamte Suite nicht**, mit allen Modulen. Das ist die
laute Variante und genau deshalb erwünscht; ein Test im Repo koppelt Migrationsordner,
Listeneintrag und `COPY`-Zeile aneinander, damit es nicht erst hier auffällt.

Gegenprobe, dass die Tabelle tatsächlich entstanden ist:

```bash
docker exec suite-verify sh -c 'ls -l /app/.data/ 2>/dev/null || ls -l ./.data/'
```

`konto.db` muss dabei sein.

Aufräumen: `docker stop suite-verify`

**Weicht etwas ab: STOPP, nicht deployen, melden.**

## 3. Deploy

```bash
cd /srv/iuk-suite      # bzw. das Verzeichnis mit compose.yaml und .env
docker compose pull suite
docker compose up -d suite
docker compose logs -f suite   # bis der Boot durch ist
```

`compose.yaml` und `.env` bleiben **unverändert**. Es gibt keine neue Variable, und
`DATA_DIR=/data` mit dem Volume `suite_data` trägt die neue Datei ohne Zutun.

## 4. Verifikation

1. **Die Seite steht:** `https://iuk-ue.de/profil` aufrufen (angemeldet). Es müssen
   Name, E-Mail, Gruppen, Fachgruppen, Kennung und „angemeldet seit" erscheinen.
2. **Der Weg dorthin steht:** in einem beliebigen Modul das Avatar-Menü öffnen — über
   „Abmelden" steht „Profil" und führt auf die Portal-Domain.
3. **Der Knopf wirkt** — und das prüft man nur mit **zwei getrennten Browsern** (oder
   einem privaten Fenster), nicht mit zwei Tabs: zwei Tabs teilen dasselbe Cookie und
   beweisen nichts.
   - In beiden anmelden, mit demselben Konto.
   - In Browser A auf `/profil` den Knopf drücken und bestätigen. A wird abgemeldet.
   - In Browser B irgendwohin navigieren → B landet auf `/login`, ohne dass in B
     etwas getan wurde.
   - In B neu anmelden → es funktioniert wieder. (Diese Gegenprobe gehört dazu: sonst
     wäre der Knopf eine Falle, einmal gedrückt und nie wieder hinein.)
4. **Die Datei liegt im Volume:**
   ```bash
   docker compose exec suite ls -l /data/konto.db
   ```

## 5. Rollback — und die Eigenschaft, die man vorher kennen muss

Der Rollback ist mechanisch trivial: das vorherige Image-Tag ziehen und `up -d`.
`konto.db` bleibt liegen und stört das alte Image nicht; ein erneutes Vorrollen
aktiviert dieselben Epochen wieder. **Es gehen keine Daten verloren.**

**Aber:** das alte Image prüft die Epoche nicht. Das hat eine Folge, die nicht
offensichtlich ist.

- Ein widerrufenes Gerät, das seit dem Widerruf **schon einmal eine Anfrage gestellt
  hat**, ist dauerhaft draußen: sein Sitzungs-Cookie wurde dabei gelöscht, und ein
  gelöschtes Cookie kommt durch einen Rollback nicht zurück. (Gemessen, nicht
  hergeleitet — `e2e/konto-widerruf.spec.ts` prüft nach dem Widerruf ausdrücklich,
  dass im zweiten Browser kein Sitzungs-Cookie mehr liegt.)
- Ein widerrufenes Gerät, das seit dem Widerruf **nichts getan hat** (ausgeschaltet,
  offline, Tab zu), trägt sein Cookie noch. Nach einem Rollback ist dieses Cookie
  wieder gültig, bis die Sitzung regulär abläuft (30 Tage).

**Praktisch heißt das:** Wurde der Knopf zwischen Deploy und Rollback von jemandem
gedrückt, der ein Gerät wirklich verloren hat, dann macht der Rollback genau diesen
Widerruf teilweise rückgängig. In dem Fall gehört zum Rollback die Ansage an die
betroffene Person, ihr Passwort bzw. ihren Passkey bei Pocket ID zu erneuern — der
Rollback allein reicht dann nicht.

Ist der Knopf noch von niemandem gedrückt worden (Normalfall am Deploy-Tag), ist der
Rollback folgenlos.

## 6. Backup — nichts zu tun, und warum das belegt ist

`scripts/backup.sh` sammelt die Datenbanken per Glob ein (`dbs=("$DATA_DIR"/*.db)`,
Zeile 26) und sichert jede einzeln über `sqlite3 .backup`. `konto.db` ist damit ab dem
ersten Lauf nach dem Deploy im Tarball, ohne dass eine Liste gepflegt werden muss.

Zur Kontrolle nach dem ersten Backup-Lauf:

```bash
tar -tzf <letztes-backup>.tar.gz | grep konto.db
```

## 7. Die Grenze, die auch nach diesem Update bleibt

Der Knopf beendet alle Sitzungen **dieser Suite**. Er beendet **nicht** die Sitzung
beim Identitätsanbieter (Pocket ID) auf fremden Geräten: wer dort auf „Anmelden"
klickt, ist wortlos wieder drin, solange das Pocket-ID-Cookie lebt. Die Seite betextet
das entsprechend („Beendet alle Sitzungen dieser Suite").

Das ist geprüft und nicht bloß vermutet — Stand Pocket ID **v2.13.0** (07.08.2026):

- Einen Admin-Endpunkt „widerrufe alle Sitzungen von Nutzer X" gibt es nicht, und
  dazu ist auch kein Issue offen.
- Der passende Endpunkt (`DELETE /oidc/users/me/authorized-clients/:clientId`)
  verlangt einen Token-Claim `type == "access-token"`, den nur Pocket IDs eigene
  Login-Ausstellung setzt; das OIDC-Access-Token, das die Suite hält, trägt ihn nicht.
- Der einzige verbleibende Hebel wäre `PUT /users/:id {disabled: true}`. **Als
  Betreiber-Maßnahme im Ernstfall ist das brauchbar** — es sperrt die Person sofort
  aus Pocket ID selbst aus und lässt jeden künftigen Token-Refresh scheitern. Es
  braucht dann aber zwingend einen zweiten Aufruf zum Entsperren, und bis der erfolgt
  ist, kommt die Person nirgends mehr hinein.

**Wenn also jemand ein Gerät wirklich verloren hat**, ist die vollständige Reihenfolge:
Knopf drücken (sperrt die Suite sofort) **und** bei Pocket ID die Anmeldedaten der
Person erneuern. Der Knopf allein ist die halbe Miete.

## Anhang — was dieses Update am Repo geändert hat, das einen Server-Agenten angeht

- **Neue Datei im Volume:** `konto.db` (klein: eine Zeile je Person, die den Knopf
  gedrückt hat).
- **Zweite Migrationsliste:** Datenbanken, die `core` selbst führt, stehen jetzt in
  `CORE_MIGRATIONS` statt in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts`). Für den
  Betrieb ändert das nichts — beide werden beim Boot migriert —, aber wer künftig eine
  fehlende Migration sucht, muss in **beide** Listen schauen.
- **Neue `COPY`-Zeile im `Dockerfile`** für `src/core/konto/_db/migrations`.
