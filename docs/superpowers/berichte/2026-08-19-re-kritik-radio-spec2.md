# Re-Kritik auf Spec 2 (radio-Cutover) — 34 Funde

> ⚠️ **Zeilennummern in diesem Bericht meinen den Stand seiner Entstehung.** Die Plaene wurden
> danach umbenannt (`2026-08-18-planN-radio-*.md`) und an einzelnen Stellen weiterbearbeitet;
> die Dateinamen sind nachgezogen, die Zeilennummern nicht. **Ueber den Wortlaut suchen,
> nicht ueber die Nummer** — dieselbe Regel, die auch die Leitplaene fuehren.


**Stand 2026-08-19.** Spec 2 sagt ueber sich selbst: *"ein Re-Kritik-Durchgang steht vor dem Cutover-Abend aus"* — der Vorgaengerdurchgang wurde von einer Ausgabengrenze abgebrochen, bevor er berichten konnte, und eine Re-Kritik fand nie statt. Das ist sie.

Drei Linsen, unabhaengig voneinander, jede mit eigener Nachpruefung im Repo: **Ausfuehrbarkeit am Cutover-Abend** · **Datenintegritaet und Testguete** · **Belege, Querverweise und innere Konsistenz**.

| Schwere | Anzahl |
|---|---|
| blockierend | 4 |
| erheblich | 16 |
| klein | 14 |

**Diese Funde betreffen die SPEC, nicht die Umsetzungsplaene.** Sie sind vor dem Cutover-Abend in `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` nachzuziehen.

---

## RK-A1 — blockierend ⛔

**Ort:** §3.2.2 (Z. 2579) und §3.2.6 (Z. 2769–2782) sowie §4.5 Schritt 8 (Z. 3702, 3721–3727)

**Befund:** Beide Pruefcontainer setzen `SUITE_HOST_RADIO=localhost`, und beide Pruefsaetze fahren danach `curl -H 'Host: radio.iuk-ue.de'`. Mit diesem Wert beansprucht `radio` genau den Host `localhost` — der Kopf `radio.iuk-ue.de` trifft kein Modul und faellt auf das Portal zurueck. Die sechs bzw. sieben kopfgestuetzten Zeilen messen damit nicht `radio`, sondern den Portal-Login. Die Spec kennt die Mechanik (§3.2.4 zitiert `registry.ts:225-232` woertlich) und setzt in der Escalation §3.2.5 folgerichtig `SUITE_HOST_RADIO: radio.iuk-ue.de` — aber Stufe 1 und Stufe 3 sind in §3.2.2/§4.5 Schritt 8 auf EINEN Container mit EINEM Wert gelegt.

**Beleg:** src/core/registry.ts:225-232 (`moduleForHost`: Vergleich gegen `prodHostsFor`, exakt); src/core/hosts.ts:39-46 (`envHostsFor` splittet auf `,` — Mehrfachhosts sind vorgesehen); src/core/registry.ts:57-59 (portal: `requiresAuth: true`, `prodHosts: ["iuk-ue.de"]`); src/core/routing.ts:69-73 (`moduleForHost(host) ?? getModule("portal")`, dann `action: "login"` bei `groups === null`). Nachgerechnet: `prodHostsFor(radio)=["localhost"]`, `prodHostsFor(portal)=["iuk-ue.de"]` (SUITE_HOST_PORTAL im Pruefcontainer ungesetzt) → kein Treffer → Portal → Login-Redirect.

**Folge:** Am Cutover-Abend in §4.5 Schritt 8: V1 (Ausleihe 200) rot, V4 (`/admin/geraete/export` 404) rot, V5 (`/sw.js` mit `text/javascript`) rot — jeweils aus dem falschen Grund, mitten in der Freigabepruefung vor dem Umschwenk. Schlimmer: V2 (`/admin` → 3xx + `location: …/login`) ist GRUEN, weil das Portal genau diese Antwort liefert, und V6 (`Host: iuk-ue.de` auf `/sw.js` liefert ihn nicht) ebenfalls — zwei Zusagen, die bestanden werden, ohne geprueft worden zu sein. V3 laeuft ueber PASSTHROUGH (`routing.ts:12`) und sagt ueber den Host nichts. Betroffen sind §3.2.6 und §4.5 Schritt 8; §4.6 laeuft nach dem Umschwenk gegen die echte `.env` und ist unberuehrt.

**Empfehlung:** In beiden Pruefcontainern `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` setzen — `envHostsFor` splittet auf Komma (`hosts.ts:39-46`), `validateHostConfig` hat gegen beide Werte nichts (kein `/`, kein `:`, keine Doppelvergabe, `hosts.ts:65-99`). Alternativ Stufe 1 und Stufe 3 als zwei getrennte `docker run` mit je einem Wert fuehren. Zusaetzlich in §3.2.6 und §4.5 Schritt 8 die Zeile aufnehmen: `curl -s -H "$H" "$B/" | grep -c '<L10-Zeichenkette>'` — der Portal-Fallback ist sonst genau dort still, wo er am teuersten ist.

---

## RK-A2 — blockierend ⛔

**Ort:** §4.9, der Nachtrag (Z. 4150–4156)

**Befund:** Der einzige ausgeschriebene Weg, in der Rueckweg-Stunde die nach dem Umschwenk geschriebenen Leihen zu retten, ist doppelt nicht ausfuehrbar. Erstens liest er `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem HOST — genau die Form, die dieselbe Spec an vier Stellen ausdruecklich verbietet (§1.8 Z. 1516-1519, §4.5 Schritt 4 Z. 3504, §4.5 Schritt 5 Z. 3587, §4.6 Nr. 4 Z. 3813); `DATA_DIR` ist ausserdem in keiner Fenster-Shell dieser Spec je gesetzt worden. Zweitens verlangt das SQL `<umschwenk_epoch_sekunden>` — einen Wert, den kein Schritt erzeugt: `date -u` steht in der ganzen Spec genau einmal, in §4.5 Schritt 1 fuer `<freeze_iso>` (Z. 3404), und §4.5 Schritt 9 protokolliert keinen Zeitpunkt. §5.1.1 fuehrt nur ein Formularfeld `Umschwenk am: ____` (Z. 4226), ein Datum, keine Epoche.

**Beleg:** compose.yaml:79 (`- DATA_DIR=/data` unter `environment:`, also ein Wert IM Container), compose.yaml:99 (`- suite_data:/data`), compose.yaml:221-223 (`suite_data: name: suite_data`, benanntes Volume ohne vereinbarten Host-Pfad) — im Repo nachgeprueft. Gegenform, die funktioniert, steht in derselben Spec: §4.5 Schritt 5 (d) und §5.2.2 Abfrage Z mit `docker run --rm -i -v "$VOL_SUITE":/data alpine … sqlite3 -readonly /data/radio.db`.

**Folge:** In der Frist von einer Stunde nach dem Umschwenk, unter Zeitdruck, an dem einen Handgriff, der ueber Datenverlust entscheidet: bei ungesetztem `DATA_DIR` liest der Befehl `/radio.db` und meldet `unable to open database file`; bei gesetztem (etwa aus dem Backup-Cron, vgl. backup.sh:19) liest er zufaellig richtig — der Runbook-Satz funktioniert auf einem Host und auf dem naechsten nicht. Und selbst wenn er oeffnet, fehlt der Vergleichswert, so dass entweder gar nichts oder alles nachgetragen wird.

**Empfehlung:** Den Nachtrag auf die §2.2.2-Form gegen `$VOL_SUITE` umschreiben (woertlich wie Abfrage Z). Und in §4.5 Schritt 9 nach `docker compose up -d` eine Zeile `date -u +%s   # → <umschwenk_epoch_sekunden>, ins Protokoll` aufnehmen, neben `<freeze_iso>` — und sie in §5.1.1 in das Formularfeld uebernehmen.

---

## RK-A3 — blockierend ⛔

**Ort:** §4.9 Handgriff 3b (Z. 4087) gegen §4.5 Schritt 1 (Z. 3406–3411, 3416)

**Befund:** Der Freeze stoppt den Kiosk mit `docker compose -f radio-inventar/docker-compose.yml --profile full-app stop backend` und begruendet das Profil eigens: `backend` steht hinter `profiles: ["full-app"]`, und ob eine Compose-Version das Profil beim namentlichen Aufruf selbst aktiviert, sei versionsabhaengig — „ohne das Profil kann der Stopp ein No-op sein, und ein No-op sieht wie ein Erfolg aus". Auch die Ruecklesung im selben Schritt fuehrt `--profile full-app ps`. Der Rueckweg laesst das Profil weg: `docker compose -f radio-inventar/docker-compose.yml start postgres backend`.

**Beleg:** Kein Repo-Beleg moeglich — `radio-inventar` liegt nicht in diesem Repo (geprueft: kein `radio-inventar/` unter /Users/rubeen/dev/personal/drk/iuk-suite). Der Beleg ist die Spec gegen sich selbst: dieselbe Datei begruendet in Z. 3406-3410 fuer `stop`, warum das Profil in den Befehl gehoert, und laesst es in Z. 4087 fuer `start` weg. Das Argument ist richtungsunabhaengig.

**Folge:** Der Rollback laeuft ohne Fehlermeldung durch und startet den Kiosk nicht. Nach §4.9 ist der Alt-Kiosk der einzige Rueckfall fuer `radio.iuk-ue.de` (§5.1.1, Randbedingung 1) — die Domain bleibt nach dem „Rollback" tot, und zwar innerhalb der Ein-Stunden-Frist, in der es keine zweite Gelegenheit gibt.

**Empfehlung:** `--profile full-app` in 3b aufnehmen, zeichengleich zum Stopp-Befehl aus Schritt 1. Und die Regel ausschreiben, die §4.5 Schritt 1 ohnehin schon aufstellt: der Stopp-Befehl aus Schritt 1 ist die Vorlage des Start-Befehls in §4.9 — Wort fuer Wort, nur `stop` gegen `start` getauscht.

---

## RK-A1 — blockierend ⛔

**Ort:** Erfuellungspunkte, Punkt 9 — Zeile 4810 (gegen Kapitel 4 §4.2, Zeilen 3091-3191)

**Befund:** Die Abschlussliste hakt „§4.2 Nr. 1–12 vollständig" ab. §4.2 führt aber DREIZEHN Posten. Nr. 13 — „Die heutige Router-Konfiguration von radio.iuk-ue.de UND radio-admin.iuk-ue.de ist abgelesen und WÖRTLICH im Protokoll", mit dem eigenen Zusatz „⛔ Fehlt die Zeile, wird das Fenster nicht eröffnet" — fällt aus der Klammer heraus. Kein anderer Erfuellungspunkt fängt ihn auf: Punkt 4 deckt L13/L14 (= §4.2 Nr. 12), Punkt 10 deckt U4/C.5 (verwandte Wurzel, aber ein anderer Handgriff — U4 sagt, WO die Regel liegt, Nr. 13 verlangt ihren WÖRTLICHEN Wortlaut samt Rückstell-Befehl), Punkt 19 prüft die Ausführung von Schritt 9, nicht seine Vorbedingung. Besonders bitter: Nr. 13 ist ausweislich des Kopfes (Zeile 47) genau das Ergebnis eines der zwei blockierenden Funde des Vorgänger-Durchgangs.

**Beleg:** docs/superpowers/specs/2026-08-18-radio-cutover-design.md:4810 („§4.2 Nr. 1–12") gegen :3175-3191 (Posten 13) und :4799 (Punkt 4 = L13/L14), :4813 (Punkt 10 = U4), :4831 (Punkt 19). Die Abhängigkeit steht in :3757 („gegen die Protokollzeile aus §4.2 Nr. 13") und :4092 (§4.9 3c). Dass die Alt-Compose-Dateien keine Labels tragen, ist unabhängig nachgeprüft: `git -C ../radio-admin show 265abd5:docker-compose.yml | grep -ic traefik` = 0, dasselbe für f883ec4 in ../radio-inventar; beide veröffentlichen nur `ports:` (radio-admin :6, radio-inventar :13 und :40).

**Folge:** Die Abschlussliste lässt sich vollständig abhaken, während die einzige ⛔-Vorbedingung ungelesen ist, die Schritt 9 Nr. 1 überhaupt ausführbar macht. Am Cutover-Abend heißt „Alt-Router zuerst weg" dann Rekonstruktionsarbeit an einer fremden Proxy-Konfiguration um 21 Uhr — und §4.9 3c/3d hat im Rückweg nichts zurückzustellen. Das ist die Lage, die der Vorgänger-Durchgang als blockierend gemeldet hatte; die Reparatur in §4.2 kam an, die Klammer darüber nicht.

**Empfehlung:** Punkt 9 auf „§4.2 Nr. 1–13 vollständig" ändern und Nr. 13 in der „insbesondere"-Aufzählung namentlich nennen („heutige Router-Regel beider Hosts wörtlich protokolliert, samt Rückstell-Befehl"). Zusätzlich in §4.2 Nr. 13 einen Rückverweis auf Erfuellungspunkt 9 setzen, damit die Kopplung in beide Richtungen steht.

---

## RK-A4 — erheblich ⚠️

**Ort:** §5.2.2, Abfrage A, Zielarm (Z. 4295 und Z. 4298)

**Befund:** Der Zielarm der Abbau-Sperre A liest `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem Host — im selben Abschnitt, in dem Abfrage R (Z. 4344) und Abfrage Z (Z. 4373) mit eigener Warnung genau diese Form verbieten und die `docker run`-Form gegen `$VOL_SUITE` vorschreiben. Der Befund aus dem vorigen Kritikdurchgang ist an zwei von drei Bloecken nachgezogen worden, am dritten nicht.

**Beleg:** compose.yaml:79 (`DATA_DIR=/data` als Container-Wert), compose.yaml:99, compose.yaml:221-223 (benanntes Volume `suite_data`) — im Repo nachgeprueft. Die korrekte Form ist in derselben Spec zweimal ausgeschrieben (§4.5 Schritt 5 (a), §5.2.2 Abfrage Z) und in §1.8 Z. 1516-1519 fuer Glied (4) sogar explizit nach Generalprobe/Fenster getrennt.

**Folge:** Abfrage A ist eine der acht Abbau-Sperren (§5.3). Ohne gesetztes `DATA_DIR` bricht sie ab und wird — Wochen nach dem Fenster, ohne den Kontext des Abends — leicht als „Umgebungsproblem" abgehakt statt als Sperre gefahren. Mit einem aus anderem Grund gesetzten `DATA_DIR` liest sie eine Datei, ueber deren Identitaet nichts im Protokoll steht, und liefert Zahlen, die eine Volume-Loeschung freigeben.

**Empfehlung:** Beide Zeilen auf die `docker run`-Form gegen dieselbe `$VOL_SUITE`-Protokollzeile ziehen, wie R und Z zwanzig Zeilen weiter — inklusive der dortigen Gegenprobe `docker run --rm -v "$VOL_SUITE":/data alpine ls -ln /data` (eine `0` ist zuerst ein Volume-Fehler).

---

## RK-A5 — erheblich ⚠️

**Ort:** §4.9 (Z. 4076–4100), gegen §4.5 Schritt 1 (Z. 3413–3421)

**Befund:** Der Freeze hat eine Ruecklesung — `ps` fuer beide Stacks und ein `curl` gegen die Domain — mit eigener Begruendung: „Der Freeze ist der einzige Schritt, dessen Wirkung man SOFORT pruefen kann und muss." Der Rueckweg hat keine. Nach `docker compose up -d`, 3a, 3b, 3c und 3d steht kein einziger Befehl, der belegt, dass die drei Prozesse wirklich laufen und dass `radio.iuk-ue.de` wieder bedient wird.

**Beleg:** Kein Repo-Beleg moeglich — Luecke innerhalb der Spec. Die Hausform belegt die Erwartung: docs/runbooks/files-cutover.md:190-196 („Kein Punkt ist durch einen Statuscode allein erfuellt … Ergebnis danebenschreiben, nicht nur abhaken") — im Repo nachgeprueft.

**Folge:** Zusammen mit RK-A3 ergibt das einen Rollback, der Erfolg meldet und die Domain tot laesst: ein `start` ohne Profil ist ein No-op, und ohne `ps`/`curl` faellt es erst auf, wenn jemand anruft. Genau die Lage, die §4.5 Schritt 1 fuer die Gegenrichtung ausdruecklich ausschliesst.

**Empfehlung:** Nach 3d dieselben drei Zeilen wie in Schritt 1, mit umgekehrter Erwartung: `docker compose -f radio-admin/docker-compose.yml ps` und `… -f radio-inventar/docker-compose.yml --profile full-app ps` (Erwartung: `running`), dazu `curl -si https://radio.iuk-ue.de/ | head -3` (Erwartung: die Alt-Oberflaeche, verglichen mit der Ablesung aus §4.2 Nr. 5) und `curl -si https://radio-admin.iuk-ue.de/ | head -3`.

---

## RK-A6 — erheblich ⚠️

**Ort:** §4.5 Schritt 4, Handgriff 0 und 3 (Z. 3521–3527, 3544, 3548) und §3.1.2 Handgriff 0 (Z. 2323–2331)

**Befund:** Die numerische Kennung, auf die `radio.db` uebereignet wird, wird aus dem IMAGE gelesen (`docker run --entrypoint sh "$IMG" -c 'id -u'` / `'id -g'`). Massgeblich ist aber nicht das Image, sondern der `user:`-Schluessel des Compose-Service. Die zwei Werte sind im Repo dokumentiert verschieden: `adduser --system --uid 1001 nextjs` setzt kein `-G nodejs`, `USER nextjs` laeuft also als 1001:65533(nogroup) — waehrend der Service als `user: ${SUITE_USER:-1001:1001}` startet und ein arm64-Host laut `.env.example` `SUITE_USER=1001:1000` setzen soll.

**Beleg:** Dockerfile:42-43 (`addgroup --system --gid 1001 nodejs` / `adduser --system --uid 1001 nextjs`, ohne `-G`), Dockerfile:88 (`USER nextjs`), compose.yaml:62 (`user: ${SUITE_USER:-1001:1001}`) und der Docblock compose.yaml:47-61, der die Messung woertlich fuehrt: „`USER nextjs` laeuft also als 1001:65533(nogroup)"; .env.example:210 (`clamav/clamav-debian: clamd 1000:1000 -> hier gehoert SUITE_USER=1001:1000 hin`) und .env.example:223 — alles im Repo nachgeprueft.

**Folge:** Die Erwartung in Z. 3548 („`ls -ln /data` zeigt `radio.db` mit derselben numerischen Kennung wie die uebrigen Modul-Datenbanken") ist auf einem Standardhost ZWANGSLAEUFIG rot: die anderen Modul-DBs traegt der Prozess mit gid 1001 (bzw. 1000), `radio.db` bekaeme gid 65533. Schritt 7 schickt daraufhin in den Handgriff „Handgriff 3 mit dem chown nachholen, nicht die `.env` durchsuchen" (Z. 3697-3701) — ein Handgriff, der die Abweichung reproduziert. Ein rotes Signal ohne Fehler, mit einer vorgeschriebenen Reparatur, die nicht konvergiert, mitten im Fenster.

**Empfehlung:** Die Kennung am Server ablesen statt aus dem Image: `docker compose config --format json | grep -i '"user"'` bzw. `docker inspect <Suite-Container> --format '{{.Config.User}}'` (die Ablesung des Containernamens ist ohnehin ⬜ L13), ersatzweise die Zeile `SUITE_USER` aus der `.env` — und beide Werte ins Fenster-Protokoll. Der Riegel bleibt derselbe: `radio.db` traegt danach dieselbe Kennung wie die uebrigen `*.db` im Volume.

---

## RK-A7 — erheblich ⚠️

**Ort:** §4.5 Schritt 4, Handgriff 3 (Z. 3538–3546), gegen §4.2 Nr. 1 (Z. 3086–3096)

**Befund:** Handgriff 3 loescht `radio.db`, `radio.db-wal` und `radio.db-shm` im produktiven Volume und legt neue Dateien hin — waehrend der regulaere Suite-Container laeuft und die Datei geoeffnet haelt. Dass sie geoeffnet ist, erzwingt die Spec selbst: §4.2 Nr. 1 verlangt `/api/health/radio` = 200 gegen den laufenden Container, und die Spec sagt in Z. 3551-3553 richtig, dass damit `openModuleDatabase` die Datei bereits angelegt hat. Sie zieht daraus nur die halbe Folge („die Loeschung ist notwendig") und nicht die andere: das Handle bleibt offen. §4.5 Schritt 8 / ⬜ L14 stellen die Frage nach zwei gleichzeitigen Prozessen auf einer SQLite-Datei ausdruecklich — aber nur fuer den Pruefcontainer, nie fuer den laufenden Stack waehrend des Dateitauschs. Kein Schritt belegt danach, dass Schritt 7 den Container wirklich ersetzt hat.

**Beleg:** src/core/db/index.ts:25-35 (`getModuleDb` legt das Handle in `globalThis.__suiteDb[key]` ab und gibt es fuer die Lebensdauer des Prozesses zurueck), src/core/db/index.ts:12-22 (`openModuleDatabase` legt Verzeichnis und Datei an und setzt `journal_mode = WAL`); src/app/api/health/[modul]/route.ts:1-6 (Health geht ueber `checkModuleHealth`, also ueber die Datenbank) — im Repo nachgeprueft.

**Folge:** Zwei Wege ins Stille. (a) Die WAL- und SHM-Dateien einer offenen Verbindung werden unter ihr weggenommen; was die laufende Verbindung danach schreibt oder liest, ist nicht mehr die Datei im Verzeichnis. (b) Ersetzt Schritt 7 den Container nicht, bedient der Prozess weiter den geloeschten Inode: `/api/health/radio` ist gruen (Nr. 3), die fuenf Zaehlungen gegen das VOLUME sind gruen (Nr. 4) — die Spec sagt in Z. 3815-3821 selbst, dass diese Zaehlung die Sicht des Containers nicht beweist, fuehrt als Ursache aber nur ein vertipptes `DATA_DIR` — und die Oberflaeche zeigt null Geraete.

**Empfehlung:** Vor Handgriff 3 `docker compose stop suite` (er bedient fuer `radio` noch keine Domain; fuer die uebrigen sechs Module ist es dieselbe Abwaegung wie in ⬜ L14 und gehoert in dieselbe Ablesung), oder Schritt 7 auf `docker compose up -d --force-recreate suite` festlegen. In jedem Fall: `docker compose ps --format '{{.Name}} {{.ID}} {{.CreatedAt}}' suite` vor Handgriff 3 und nach Schritt 7 ins Protokoll — eine unveraenderte Container-ID ist ein Stopp-Punkt.

---

## RK-A8 — erheblich ⚠️

**Ort:** Erfuellungspunkte, Punkt 9 (Z. 4810), gegen §4.2 Nr. 13 (Z. 3175–3190)

**Befund:** Die Abschlussliste hakt „§4.2 Nr. 1–12 vollstaendig" ab. §4.2 fuehrt dreizehn Posten. Nr. 13 — die woertlich protokollierte heutige Router-Konfiguration von `radio.iuk-ue.de` und `radio-admin.iuk-ue.de` samt dem Handgriff, der sie zurueckstellt — faellt aus der Liste. Nach dem Kopf dieser Spec ist genau dieser Posten das Ergebnis des vorigen Kritikdurchgangs („Daraus ist die Vorbedingung §4.2 Nr. 13 geworden", Z. 51-53), und er traegt selbst ein ⛔: „Fehlt die Zeile, wird das Fenster nicht eroeffnet."

**Beleg:** Kein Repo-Beleg moeglich — Widerspruch innerhalb der Spec: die Aufzaehlung in §4.2 endet bei Punkt 13 (Z. 3175), die Erfuellungsliste zitiert „Nr. 1–12" (Z. 4810). Beide Zeilen nachgezaehlt.

**Folge:** Der eine Posten, ohne den §4.5 Schritt 9 Nr. 1 („Alt-Router zuerst weg") kein ausfuehrbares Ziel und §4.9 3c/3d nichts zurueckzustellen haben, steht in keiner Abhakliste. Die Erfuellungspunkte sind die Klammer, die um 23 Uhr gelesen wird; ein Posten, der dort fehlt, ist ein Posten, der faktisch nicht existiert — und die Rekonstruktion einer fremden Proxy-Konfiguration um 21 Uhr ist genau das, was Nr. 13 verhindern soll.

**Empfehlung:** Punkt 9 auf „§4.2 Nr. 1–13 vollstaendig" korrigieren und Nr. 13 in die „insbesondere"-Aufzaehlung aufnehmen — mit demselben ⛔ wie Punkt 10 (U4/C.5), denn beide haengen an derselben Auskunft.

---

## RK-A1 — erheblich ⚠️

**Ort:** §2.3.1 und §2.3.2 (Kapitel 2), Zeilen 1843-1857 und 1885-1891 — die Spalte `gelesen_als_s`

**Befund:** Die Zeitstempel-Stichprobe stellt im Quellarm zwei Lesarten nebeneinander und sagt: „`gelesen_als_s` muss **1970** zeigen". Das kann sie nicht. Der Quellwert ist epoch-Millisekunden (13-stellig, ~1.74e12); als Sekunden gelesen liegt er im Jahr ~57000, nicht 1970 — SQLite gibt für `datetime(1741100000000,'unixepoch')` deshalb NULL zurück, also eine **leere Zelle**. Die 1970-Lesart entsteht erst bei `datetime(1741100,'unixepoch')`, und das ist der **Ziel**wert nach einem Faktor-1000-Fehler, nicht der Quellwert. Die Spec weiß das an anderer Stelle selbst: §5.2.2 Abfrage Z begründet ihre obere Grenze `> 4000000000` ausdrücklich mit „rohe Millisekunden, die ungeteilt in einer Sekundenspalte landen (Jahr 57000)". Betroffen ist nur die Quellarm-Spalte; die Protokollzeile `Jahr = <Jahr> ⛔ 1970` (Zeile 1871) meint den Zielwert und ist richtig.

**Beleg:** Gemessen mit sqlite3 3.54 gegen eine nachgebaute Quelle (/private/tmp/claude-501/-Users-rubeen-dev-personal-drk/d0722102-2375-46aa-981e-ec4962235b31/scratchpad/q.db): `datetime(1741100000000,'unixepoch')` → NULL, `datetime(1741100000000/1000,'unixepoch')` → 2025-03-04, `datetime(1741100,'unixepoch')` → 1970-01-21. Repo-Gegenbeleg im selben Dokument: docs/superpowers/specs/2026-08-18-radio-cutover-design.md:4415-4416 (Abfrage Z, „Jahr 57000"). Die Arithmetik ist buildunabhängig, die NULL-Darstellung die sekundäre Beobachtung.

**Folge:** Die Kontrollzeile, die den einzigen paritätsgrünen UND datenlöschenden Fehler dieses Ports fangen soll, liefert im Fenster eine leere Spalte statt der zugesagten „1970". Um 23 Uhr liest sich eine leere Zelle als „Abfrage kaputt" — und die vorgeschriebene Entscheidungsregel („Zeigen beide Spalten dasselbe → Cutover absagen") hat für eine leere Zelle keinen Fall. Wer die Spalte daraufhin streicht, hat die Stichprobe auf eine einzige Lesart reduziert.

**Empfehlung:** Erwartung berichtigen: `gelesen_als_ms` = Datum aus der Betriebszeit, `gelesen_als_s` = **leer/NULL (Wert außerhalb des Kalenderbereichs)**; die Beschriftung „muss 1970 zeigen" streichen. Die 1970-Erwartung gehört an den **Zielarm** und steht dort schon: §5.2.2 Abfrage Z, untere Grenze `< 946684800`. Beide Stellen wechselseitig verweisen, damit niemand die eine für die andere hält.

---

## RK-A2 — erheblich ⚠️

**Ort:** §2.2.1 (Kapitel 2), Zeilen 1665-1692 — `devices.last_updated_at`, zusammen mit der ⛛-Zusicherung in §1.3.4, Zeile 922

**Befund:** Für die einzige Spalte mit Typwechsel gibt §2.2.1 zwei Kandidatentage aus (`utc_tag`, `utc_tag_plus1`) und schreibt vor, „den Zielwert gegen sie zu stellen" — aber **nirgends steht, welcher der beiden der Sollwert ist**. Der Sollwert ist jedoch determiniert: Spec 1 §2.2.3 setzt den **Berliner** Kalendertag, also bei `uhrzeit_utc >= 22:00` (Sommerzeit) bzw. `>= 23:00` (Winterzeit) immer `utc_tag_plus1`. Ohne diese Regel besteht ein Mapper mit `new Date(ms).toISOString().slice(0,10)` die Produktionsstichprobe, weil `utc_tag` einer der zwei akzeptierten Kandidaten ist — genau der Mapper, den die ⛛-Zusicherung in §1.3.4 („liefert hier 2025-03-01") verwirft. Und die in §2.2.2/§2.3.2 als zweite Meinung vorgesehene Alt-Anwendung kann es nicht entscheiden: sie zeigt denselben Wert je nach Fläche verschieden.

**Beleg:** radio-admin, lokal am Freeze-SHA 265abd5 ausgecheckt und nachgesehen: server/src/routes/export.ts:49-51 formatiert `lastUpdatedAt` als **UTC**-Tag (`new Date(value).toISOString().slice(0,10)`, Kommentar :42 „UTC `YYYY-MM-DD`"); client/src/utils/format.ts:4 (`toLocaleString('de-DE')`) und client/src/features/devices/DeviceEditForm.tsx:41 (`dayjs(device.lastUpdatedAt)`), :61 (`values.lastUpdatedAt.valueOf()`) lesen und schreiben ihn als **lokalen (Berliner)** Tag. Die zwei Flächen widersprechen sich bei genau den Zeilen, die §2.2.1s Filter auswählt.

**Folge:** Die einzige Produktionsprobe für die einzige Spalte mit Typwechsel hat keinen Sollwert und ist damit unter einem Zonenfehler grün — dieselbe Klasse „grün trotz falscher Zuordnung", gegen die das ganze Kapitel gebaut ist. Zusätzlich ist die Rückfrage an die Alt-Oberfläche für diese eine Spalte kein Schiedsrichter, sondern eine Münze: wer die Detailansicht öffnet, bekommt den Berliner Tag, wer den CSV-Export zieht, den UTC-Tag.

**Empfehlung:** Den Sollwert ausschreiben statt zwei Kandidaten anzubieten: „Sollwert ist der **Berliner** Kalendertag; er ist in SQL nicht berechenbar, deshalb sind `utc_tag`/`utc_tag_plus1` Plausibilitätsrahmen, keine Alternativen. Regel: `uhrzeit_utc >= 22:00` (Sommer) bzw. `>= 23:00` (Winter) → Sollwert ist `utc_tag_plus1`, sonst `utc_tag`." Dazu einen Satz, dass die Alt-Anwendung für **diese** Spalte keine zulässige zweite Meinung ist, mit den zwei Fundstellen als Beleg.

---

## RK-A3 — erheblich ⚠️

**Ort:** §1.6.3 Fall B, Schritt 0 (der ARRANGE-Riegel), Zeilen 1342-1347

**Befund:** Der ARRANGE-Riegel liest `select sql from sqlite_master where type='index' and name='loans_device_active_uidx'` und sichert zu: „der Text enthaelt \"WHERE returned_at IS NULL\"". `sqlite_master.sql` speichert die CREATE-Anweisung **zeichengleich so, wie sie ausgeführt wurde**. Die Quell-Migration, die §1.8 und Spec 1 §2.6 ausdrücklich **zeichengleich** übernehmen lassen, schreibt den Ausdruck mit Backticks. Der Riegel ist damit rot gegen eine vollkommen korrekte Migration.

**Beleg:** radio-admin/server/drizzle/0003_kind_spot.sql, letzte Zeile (am Freeze-SHA 265abd5 gelesen): ``CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;``. Gemessen gegen genau diese DDL (…/scratchpad/idx.db): `sqlite_master.sql` gibt den Text mit Backticks zurück, `instr(sql,'WHERE returned_at IS NULL')` ergibt **0**.

**Folge:** Der Riegel wurde eigens eingebaut, damit sich „eine fehlende Ziel-Migration nicht als *expected throw, got none* tarnt" und „der Test die Ursache selbst meldet". Stattdessen meldet er einen Migrationsdefekt, wo keiner ist — derselbe Fehlertyp, vor dem §1.6.3 zwei Absätze später warnt (`toThrow(/loans_device_active_uidx/)` sei „ein Test, der aus dem falschen Grund rot ist"). Wer ihn daraufhin lockert, verliert die Unterscheidung Migrationsdefekt ↔ Importdefekt ganz.

**Empfehlung:** Nicht auf Text prüfen, sondern auf Struktur: `select count(*) from pragma_index_list('loans') where name='loans_device_active_uidx' and partial=1` — Zusicherung genau 1. Wenn der Text unbedingt geprüft werden soll, dann mit einem Muster, das die Anführung offenlässt: `/WHERE\s+`?returned_at`?\s+IS\s+NULL/i`.

---

## RK-A4 — erheblich ⚠️

**Ort:** §5.2.2, Abfrage A, Zielarm, Zeilen 4293-4299

**Befund:** Der Zielarm der Zählungs-Gegenprobe liest mit `sqlite3 -readonly "$DATA_DIR/radio.db"` **auf dem Host** — genau die Form, die dieselbe Teilüberschrift 50 Zeilen weiter für Abfrage R (Zeilen 4343-4345) und Abfrage Z (Zeilen 4371-4374) ausdrücklich verbietet („`sqlite3` auf dem Host gegen `$DATA_DIR/radio.db` liest einen Pfad, den es auf dem Host **nicht gibt**") und die §1.8 Glied (4) für alles außerhalb der Generalprobe mit ⛔ ausschließt. R und Z benutzen die §2.2.2-Containerform gegen `$VOL_SUITE`, A nicht.

**Beleg:** compose.yaml im Repo nachgesehen: :79 `- DATA_DIR=/data` (Container-Pfad), :99 `- suite_data:/data`, :221-223 `volumes: suite_data: name: suite_data`. Die Datei liegt also ausschließlich im Volume. Gemessen: `sqlite3 -readonly` auf einen nicht existierenden Pfad bricht mit Exit 1 und „unable to open database file" ab.

**Folge:** Abfrage A ist eine ⛔-Abbau-Sperre („Ohne fünf gleiche Paare wird kein Volume gelöscht") und in der niedergeschriebenen Form nicht ausführbar. Am Abbautag steht der Vorgang dann an einem Werkzeugfehler, nicht an einem Befund — und der naheliegende Ausweg (die Form aus R/Z von Hand nachbauen) ist genau das Improvisieren, das die Spec sonst überall verbietet.

**Empfehlung:** Abfrage A auf dieselbe §2.2.2-Containerform ziehen wie R und Z, mit derselben `$VOL_SUITE`-Protokollzeile davor: `echo "…" | docker run --rm -i -v "$VOL_SUITE":/data alpine sh -c 'apk add --no-cache sqlite …; sqlite3 -readonly /data/radio.db'`, Mount ohne `:ro`, kein `immutable=1`. Die `zugangscodes`-Protokollzeile mit umstellen.

---

## RK-A5 — erheblich ⚠️

**Ort:** §2.2.2, Zeilen 1703-1728 — der Lesebefehl auf dem Zielarm samt Lauf-Tabelle

**Befund:** §2.2.2 gibt **genau einen** Zielarm-Lesebefehl, und der ist fest auf `$VOL_SUITE` verdrahtet (`docker volume ls | grep -i suite`, `-v "$VOL_SUITE":/data`). Die Tabelle direkt darunter dehnt dieselbe Form auf **zwei Läufe** aus und nennt für die **Generalprobe** die Variante `file:/data/radio.db?immutable=1` auf `:ro` — ohne je zu sagen, dass die Generalproben-Ziel-DB gar nicht im Volume liegt. §1.8 Glied (4) sagt das Gegenteil und ist richtig: „Generalprobe: `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem HOST — dort ist DATA_DIR ein Bind-Pfad (`$GP/data`, §3.1.2)".

**Beleg:** compose.yaml:221-223 — `suite_data` ist der produktive Volumename, den §3.2.1 als Textriegel für die Generalprobe ausdrücklich verbietet. src/core/db/index.ts:6 (`DATA_DIR ?? "./.data"`) und :8-10 (`moduleDbPath`) belegen, dass der Generalproben-Lauf über `DATA_DIR` gesteuert wird, also über einen Host-Pfad und nicht über ein Volume; scripts/import/portal.ts:117 und feedback.ts:283 führen dieselbe Aufrufform.

**Folge:** Wer §2.2.2 in der Generalprobe befolgt — und §2.2.4 Nr. 1 schickt ihn genau dorthin —, liest die **produktive** `radio.db` statt der Generalproben-Datei und bricht dabei den §3.2.1-Riegel („die docker-run-Zeile der Generalprobe enthält die Zeichenkette `suite_data` nicht") mit der Vorlage der Spec selbst. Das Ergebnis ist entweder ein lauter Öffnungsfehler oder — sobald der erste Deploy gelaufen ist und `migrateAllModules()` eine leere `radio.db` angelegt hat — fünf Nullen, die wie ein misslungener Import aussehen und einen Generalprobendurchgang kosten.

**Empfehlung:** Die Lauf-Tabelle je Zeile mit ihrem **Mount** ausschreiben: Generalprobe `-v "$GP/data":/data:ro` (oder schlicht `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem Host, wie §1.8 Glied 4) · Fenster `-v "$VOL_SUITE":/data` ohne `:ro`. Den §3.2.1-Riegel an dieser Stelle mit seinem Geltungsbereich zitieren, so wie W5 es für §4.5 Schritt 8 schon verlangt.

---

## RK-A2 — erheblich ⚠️

**Ort:** Kapitel 5 §5.2.2, Abfrage A, Zielarm — Zeilen 4293-4298

**Befund:** Der Zielarm der Abfrage A liest mit `sqlite3 -readonly "$DATA_DIR/radio.db"` auf dem Host. Genau diese Form schließt die Spec an vier anderen Stellen ⛔ aus — darunter die zwei unmittelbaren Nachbarblöcke R und Z derselben Sektion, die den Fall ausdrücklich ausschreiben („`$DATA_DIR/radio.db` gibt es auf dem HOST nicht") und stattdessen die §2.2.2-`docker run`-Form gegen `$VOL_SUITE` fahren. Innerhalb von §5.2.2 widerspricht A also R und Z.

**Beleg:** Spec 2:4295 und :4298 (`sqlite3 -readonly "$DATA_DIR/radio.db"`) gegen :4343-4345 (R) und :4371-4374 (Z), sowie gegen :3504-3506 (Schritt 4), :3586-3588 (Schritt 5 a) und :3812-3814 (§4.6 Nr. 4). Repo-Beleg für die Sache selbst: compose.yaml:79 (`DATA_DIR=/data`, ein Wert im Container), compose.yaml:99 (`suite_data:/data`) und compose.yaml:221-223 (`name: suite_data`) — ein benanntes Volume hat keinen vereinbarten Host-Pfad.

**Folge:** Abfrage A ist eine ⛔ Abbau-Sperre („Ohne fünf gleiche Paare wird kein Volume gelöscht"). Auf dem Host ist `$DATA_DIR` nicht gesetzt — die Zuweisung in Schritt 4 ist ein Kommando-Präfix und exportiert nicht —, der Befehl bricht also mit `unable to open database file` ab. Das ist laut, aber es ist ein verbrannter Schritt in genau dem Protokoll, das über die einzige unumkehrbare Handlung dieses Cutovers entscheidet, und er steht zwischen zwei Blöcken, die es richtig machen: der Leser hält den Fehler für einen Datenbefund oder bastelt sich unter Zeitdruck ein `DATA_DIR=` zurecht.

**Empfehlung:** Den Zielarm von Abfrage A zeichengleich auf die Form von Abfrage Z umstellen (`echo "…" | docker run --rm -i -v "$VOL_SUITE":/data alpine sh -c '… sqlite3 -readonly /data/radio.db'`), mit demselben ⚠️-Absatz („Mount ohne `:ro`, kein `immutable=1`") darüber, und die `zugangscodes`-Protokollzeile (:4298) mitziehen.

---

## RK-A3 — erheblich ⚠️

**Ort:** Rahmen, W5 Residuum 2 (Zeilen 429-434) und Kapitel 2 §2.2.2, Tabellenzeile „Fenster" (Zeile 1728) — gegen Kapitel 4 §4.5 Schritt 4 Handgriff 3 (Zeilen 3540-3545)

**Befund:** Die Begründung, warum im Fenster `immutable=1` verboten ist, lautet: „der reguläre Stack hält `radio.db` offen (Migrationen, Health, Boot-Haken)". Zwei der drei genannten Wege schließen ihr Handle nachweislich wieder, der dritte ist ungebaut und damit nicht prüfbar — die Aussage ist als Messung formuliert, ist aber keine. Und sie kollidiert mit der Gegenrichtung: wäre sie wahr, wäre Schritt 4 Handgriff 3 (`rm -f /data/radio.db /data/radio.db-wal /data/radio.db-shm` plus `cp` in das produktive Volume, während der Stack aus §4.2 Nr. 1 läuft) ein Eingriff an einer offenen Datenbankdatei — und kein Schritt, kein ⚠️ und keine ⬜ benennt das.

**Beleg:** src/core/bootstrap.ts:99-105 — `migrateAllModules()` öffnet je Modul, migriert und ruft `sqlite.close()` in :103. src/core/health/index.ts:13-15 — `checkModuleHealth` schließt im `finally` (`db?.close()`). Das einzige zwischengespeicherte Handle entsteht in src/core/db/index.ts:31-35 (`getModuleDb` legt es in `globalThis` ab) und wird für `radio` nur aus Modulcode erreicht, den vor Schritt 9 kein Router bedient. Der dritte Weg — die radio-Boot-Haken — existiert nicht: src/app/m/radio/ ist im Repo nicht vorhanden.

**Folge:** Zwei Kosten. Erstens hält der Text am Cutover-Abend eine Tatsache bereit, die keine ist: wer bei Schritt 4 Handgriff 3 an W5 denkt, hält das `rm` für gefährlich und hält mitten im Fenster an. Zweitens, in die andere Richtung: sollte sich beim Bau herausstellen, dass ein Boot-Haken die Datei doch dauerhaft offen hält, ersetzt Handgriff 3 eine geöffnete Datei unter einem laufenden Prozess — und diese Frage stellt L14 nicht, denn L14 fragt nach zwei BOOTENDEN Prozessen, nicht nach Löschen und Ersetzen unter einem laufenden.

**Empfehlung:** W5 Residuum 2 und die §2.2.2-Fenster-Zeile umformulieren: die Entscheidung (kein `immutable=1`) beibehalten, aber als konservative Wahl begründen — belegbar ist heute nur, dass Migrationen (`bootstrap.ts:103`) und Health (`health/index.ts:13-15`) ihr Handle schließen; ob ein radio-Boot-Haken eines hält, ist Bau. Und eine neue Zeile ⬜ L15 aufnehmen: „hält der reguläre Stack `radio.db` nach dem Boot dauerhaft offen?" — gebraucht in §2.2.2 und, mit anderer Konsequenz, in §4.5 Schritt 4 Handgriff 3.

---

## RK-A4 — erheblich ⚠️

**Ort:** Rahmen, ⬜-Tabelle Zeile L5 (Zeile 185) — sowie ihre fünf Verwendungsstellen §2.6 (2263-2264), §3.2.6 (2842), §4.2 Nr. 1 (3111), §4.5 Schritt 8 (3732), §4.6 Nr. 3 (3800)

**Befund:** L5 verlangt als Ablesung „welches Feld den Modulnamen und welches den DB-Zugriff belegt" und nennt als Quelle „Bau". Beides ist heute im Repo lesbar und hängt an keiner radio-Bauform: die Route ist generisch. Zusätzlich zeigt der angegebene Beleg `src/app/api/health/[modul]/route.ts:11-18` nicht auf die Antwortform, sondern mitten in einen Kommentarblock über `revision` und Prerendering.

**Beleg:** src/core/health/index.ts:4-15 — `checkModuleHealth` liefert `{ status: "ok"|"error", module: key, error? }`; `module` trägt den Modulnamen (:10), und `status: "ok"` entsteht erst nach `openModuleDatabase(...)` plus `db.prepare("SELECT 1").get()` (:8-9). src/app/api/health/[modul]/route.ts:23-26 hängt `revision: laufendeRevision()` an und setzt 200/503. Die zitierten Zeilen :11-18 derselben Datei sind der Kommentar „BEWUSST NUR HIER UND NICHT IN /api/health …".

**Folge:** Eine erfundene Leerstelle kostet dreifach: sie hält Erfuellungspunkt 37 („jede der vierzehn Zeilen trägt eine Ablesung") ohne Not offen, sie lässt fünf Runbook-Stellen mit einem ⬜ stehen, das schon beantwortet ist, und sie schickt den Leser, der es doch nachschlägt, mit `route.ts:11-18` an eine Stelle, an der die Antwort nicht steht. Was an V3 wirklich offen ist, ist nur der WERT der Revision — und den liefert §4.2 Nr. 1 bereits als Protokollzeile.

**Empfehlung:** L5 auf das reduzieren, was tatsächlich Bau ist, oder ganz streichen: die Feldnamen in §2.6, §3.2.6 V3 und §4.6 Nr. 3 wörtlich ausschreiben („`module` = Modulname, `status`:"ok" = DB-Zugriff über `SELECT 1`, `revision` = Commit") mit dem Beleg `src/core/health/index.ts:4-15` und `src/app/api/health/[modul]/route.ts:23-26`. Bleibt eine Zeile stehen, dann als „der SOLLWERT von `revision`" — und die zeigt auf §4.2 Nr. 1, nicht auf den Bau.

---

## RK-A5 — erheblich ⚠️

**Ort:** Kapitel 3 und 4, blanke §-Verweise: Zeilen 2679, 2800, 2862, 2864, 2865, 2891, 2907, 2923, 2958, 3257, 4020

**Befund:** Elf Verweise zeigen ohne das Präfix „Spec 1" in Spec 1 hinein, und sechs davon kollidieren mit Spec 2s eigener, im Kopf verbindlich gesetzter Nummerierung: §1.2.2 (Spec 2 hat §1.2), §3.3.4 (Spec 2 hat §3.3 mit .1–.3), §3.4.1 (Spec 2 hat §3.4), §3.5.3 (Spec 2 hat §3.5), §3.6.1 (Spec 2 hat §3.6), §4.3.5 (Spec 2 hat §4.3). Die schärfste Stelle ist Zeile 2958: sie steht INNERHALB von Spec 2 §3.4 und zitiert „§3.4.1 wörtlich". Die übrigen (§3.7.2, §3.8, §3.9) sind in Spec 2 nicht auflösbar, weil Kapitel 3 bei §3.6 endet. Kapitel 1 und 2 halten die Disziplin durchgehend ein und schreiben „Spec 1 §…".

**Beleg:** Spec 2:2958 („§3.4.1 wörtlich" und „die Quelltext-Zusicherung aus §3.8") steht in §3.4 (Überschrift :2946); :2800 („§3.6.1") steht in §3.2.6; :2891 („§3.5.3") steht in §3.3.1; :2864/:2865 („§4.3.5", „§3.3.4") stehen in der V-Tabelle von §3.2.6; :3257 („§3.7.2") steht in §4.4.1. Gegenprobe im selben Dokument: :3042 und :4796 schreiben für dieselbe Stelle korrekt „Spec 1 §3.8". Verbindliche Kapitelnummern von Spec 2: :138-146.

**Folge:** Der Kopf verspricht mit der Umschlüsselung ausdrücklich, „damit ein Querverweis aus einem Teiltext auffindbar bleibt". Genau das leisten diese elf nicht. Ein Leser, der um 22 Uhr §3.4.1 aufschlägt, landet in Spec 2 §3.4 (der Tabelle „Was am ephemeren Container NICHT prüfbar ist") und findet dort keine Aussage über `secure`-Cookies — im schlimmsten Fall hält er die Cookie-Domain-Zusicherung für nicht belegt und lässt Erfuellungspunkt 2 fallen.

**Empfehlung:** Alle elf Stellen auf „Spec 1 §…" vereinheitlichen — das ist eine mechanische Änderung und die Hausform von Kapitel 1 und 2. Zusätzlich in den Abschnitt „Kapitelnummern und die Umschlüsselung" einen Satz aufnehmen: „Ein § ohne Präfix meint IMMER Spec 2; jeder Verweis in Spec 1 trägt das Präfix `Spec 1`."

---

## RK-A6 — erheblich ⚠️

**Ort:** Erfuellungspunkte, Punkt 17 (Zeilen 4828-4829) — gegen Kapitel 5 §5.2.2, Abfrage Z (Zeile 4412)

**Befund:** Die Abschlussliste verlangt „Z alle drei `0`". Abfrage Z hat zehn Glieder, und §5.2.2 schreibt es zwei Zeilen unter dem SQL selbst aus: „Alle zehn Zahlen MÜSSEN 0 sein." Anhang A-5 (Zeile 4893) nennt Z ebenfalls „drei Spalten, feste Epoche" — dort ist die Spaltenzahl allerdings eine Nebenbemerkung, entschieden wird in A-5 nur „komplementär, nicht doppelt"; die Zahl selbst ist keine Entscheidung, sondern derselbe Zählfehler.

**Beleg:** Spec 2:4377-4407 — das SQL von Z führt zehn `select`-Glieder (loans.returned_at, loans.borrowed_at, loans.created_at, loans.updated_at, devices.created_at, devices.updated_at, software_versions.created_at, users.last_seen_at, device_events.changed_at, devices.last_updated_at als Formatprobe). :4412: „Alle zehn Zahlen MÜSSEN 0 sein." :4417: „Neun Spalten sind Zahlen, die zehnte ist Text." Gegen :4829 („Z alle drei `0`") und :4893 („drei Spalten").

**Folge:** Genau der Fehlertyp, den W8 benennt und dessen Schaden W8 selbst ausschreibt: „eine Prüfliste, deren Kopf eine andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekürzt". Z ist eine ⛔ Abbau-Sperre und die einzige Probe, die sagt, WELCHE Spalte vom Faktor-1000-Fehler betroffen ist. Wer drei Zahlen abhakt und sieben ungelesen lässt, kann den Fehler in `users.last_seen_at` oder `device_events.changed_at` haben und trotzdem grün protokollieren — und danach fällt das Volume.

**Empfehlung:** Punkt 17 auf „Z: alle zehn Zeilen `0`" ändern (die Formatprobe `devices.last_updated_at` ausdrücklich mitgezählt) und die Nebenbemerkung in Anhang A-5 von „drei Spalten" auf „zehn Spalten" korrigieren — die Entscheidung von A-5 bleibt davon unberührt.

---

## RK-A7 — erheblich ⚠️

**Ort:** Kapitel 4 §4.9, Der Nachtrag — Zeilen 4151-4155

**Befund:** Die Bergungsabfrage des Rückwegs lautet `sqlite3 -readonly "$DATA_DIR/radio.db" "select … from loans where created_at >= <umschwenk_epoch_sekunden> …"` — dieselbe auf dem Host nicht ausführbare Form wie in RK-A2, hier aber im Rückweg, innerhalb der Ein-Stunden-Frist. Dazu ein zweiter Mangel derselben Zeile: `<umschwenk_epoch_sekunden>` ist eine Eingabe, die kein Schritt der Spec erzeugt.

**Beleg:** Spec 2:4152 gegen :3504-3506 („`$DATA_DIR/radio.db` gibt es auf dem HOST nicht"), :3586-3588, :4343-4345. Zur zweiten Hälfte: `grep -n "umschwenk_epoch"` über die Spec liefert genau einen Treffer, :4154 — §4.5 Schritt 9 (:3753-3769) protokolliert keinen Zeitstempel, während Schritt 1 den Freeze ausdrücklich als ISO-UTC festhält (:3404). Auch die Ein-Stunden-Frist (:4147-4148, :4195) hängt an derselben, nirgends festgehaltenen Uhrzeit.

**Folge:** Im Rollback, unter der einzigen harten Zeitfrist dieses Cutovers, läuft der einzige ausgeschriebene Bergungsbefehl nicht — und selbst wenn man ihn zur `docker run`-Form umbaut, fehlt der Wert, gegen den er filtert. Der Nachtrag ist dann Improvisation an genau der Stelle, an der die Spec sagt „ausgeschrieben, nicht improvisiert".

**Empfehlung:** Den Befehl auf die §2.2.2-`docker run`-Form gegen `$VOL_SUITE` umstellen (Mount ohne `:ro`, `sqlite3 -readonly`, kein `immutable=1`). Und §4.5 Schritt 9 eine erste Zeile geben, die Schritt 1 spiegelt: `date -u +%Y-%m-%dT%H:%M:%SZ` → `<umschwenk_iso>` ins Protokoll, plus die Sekundenzahl daneben — sie ist der Nullpunkt der Ein-Stunden-Frist UND das Filterargument des Nachtrags.

---

## RK-A9 — klein

**Ort:** Erfuellungspunkte, Punkt 17 (Z. 4828–4829), gegen §5.2.2 Abfrage Z (Z. 4376–4412)

**Befund:** Punkt 17 verlangt „Z alle drei `0`". Abfrage Z hat zehn Zeilen, und §5.2.2 sagt es selbst: „Alle zehn Zahlen MUESSEN 0 sein" (Z. 4412) — neun Zahlgrenzproben plus die Formatprobe auf `devices.last_updated_at`.

**Beleg:** Kein Repo-Beleg moeglich — Widerspruch innerhalb der Spec. Nachgezaehlt: das SQL in Z. 4376-4410 fuehrt zehn `union all`-Glieder, Z. 4412 nennt zehn, Z. 4829 nennt drei.

**Folge:** Genau der Fehlertyp, den W8 selbst beim Namen nennt („eine Pruefliste, deren Kopf eine andere Zahl nennt als ihr Rumpf, wird unter Zeitdruck gekuerzt") — nur diesmal in der Abschlussliste, wo die Zahl den Umfang der Abbau-Sperre bestimmt. Wer drei liest und drei protokolliert, gibt ein Volume frei, dessen Zeitstempelspalten zu sieben Zehnteln ungeprueft sind.

**Empfehlung:** „Z alle zehn `0`" schreiben und die Formatprobe eigens nennen, damit die zehnte Zeile nicht als neunte Zahl verwechselt wird.

---

## RK-A10 — klein

**Ort:** §4.6 Nr. 2 (Z. 3790–3793)

**Befund:** Die zweite Zeile der Probe lautet `curl -si https://radio.iuk-ue.de/admin | grep localtest.me   # muss LEER sein`. Anonym antwortet `/admin` nach der Festlegung derselben Spec mit einer Weiterleitung in den Login (§4.6 Nr. 5, ⬜ L7) — also mit einem 3xx ohne verwertbaren Rumpf. Die Probe ist damit strukturell leer und liest sich als gruen, unabhaengig davon, ob irgendwo ein `localtest.me`-Link steht.

**Beleg:** Kein Repo-Beleg moeglich (die Verwaltungsflaeche ist nicht gebaut, src/app/m/radio/ existiert nicht — im Repo geprueft). Der Beleg ist die Spec gegen sich selbst: §4.6 Nr. 5 (Z. 3826-3830) und §3.2.6 (Z. 2793-2799) legen fuer denselben Abruf 3xx + `location:` fest.

**Folge:** Dieselbe Mechanik, die W6 fuer `grep -i '^radio:'` als tragend einstuft: leere Ausgabe wird als Abwesenheit gelesen. Der Fehlfall, den Nr. 2 fangen soll (Post-Cutover-Befund 2, tote `localtest.me`-Links), waere auf der Verwaltungsflaeche unentdeckt — und die Verwaltungsflaeche ist die einzige, die Navigationslinks in Menge traegt.

**Empfehlung:** Die Zeile mit `-L` fahren oder — besser, weil der Login-Umweg dann nicht mitgeprueft wird — sie nach §4.6 Nr. 10 wiederholen: dieselbe Person, dieselbe Sitzung, Seitenquelltext aus dem Browser gespeichert und `grep localtest.me`. Und die Zeile im Runbook mit der Bedingung versehen, unter der ihre Leere etwas bedeutet.

---

## RK-A11 — klein

**Ort:** W1, der Snapshot-Block (Z. 274–279); zweite Fundstelle §1.1 (Z. 618)

**Befund:** Der verbindliche Snapshot-Befehl steht in `sh -c '…'`, also in einfachen Anfuehrungszeichen; die darunter als „gleichwertig" angebotene Alternative lautet `sqlite3 /d/data.sqlite "VACUUM INTO '/out/…'"` und traegt einfache Anfuehrungszeichen um den Ausgabepfad. Woertlich in die `sh -c`-Zeile uebernommen — und genau als Ersatz DAFUER steht sie da — beendet das erste `'` die umschliessende Zeichenkette.

**Beleg:** Kein Repo-Beleg noetig, es ist eine Quoting-Ebene im Text selbst: die aeussere Ebene ist `sh -c '…'` (Z. 276-278), die angebotene Ersatzzeile (Z. 279) enthaelt `'`. Zum Vergleich die korrekte Verschachtelung in derselben Datei: §5.2.3 Z. 4477 loest dasselbe Problem mit `'"'"'public'"'"'` — die Spec kennt die Form also.

**Folge:** Der Snapshot ist der Befehl, an dem beide Laeufe haengen (Generalprobe und Fenster, W1 nennt ihn „die einzige zulaessige Form"). Ein Syntaxfehler ist laut, aber im Fenster ein verbrannter Schritt an der Stelle, an der der Alt-Stack gerade eingefroren wurde und die Uhr laeuft.

**Empfehlung:** Die Alternative entweder als vollstaendige `docker run`-Zeile mit aufgeloester Verschachtelung ausschreiben (`sh -c "apk add …; sqlite3 /d/data.sqlite \"VACUUM INTO '/out/…'\""`) oder ersatzlos streichen — `.backup` ist ohnehin verbindlich, und eine Variante, die niemand fahren soll, ist im Fenster nur eine Falle.

---

## RK-A12 — klein

**Ort:** §4.6 Nr. 13 (Z. 3895–3903)

**Befund:** Der Abnahmeschritt lautet `scripts/backup.sh` und danach `tar -tzf <das erzeugte Tarball> | grep radio.db`. Das Skript ist als Host-Cron gebaut und faellt ohne die Env dieses Cron auf `DATA_DIR=/data` zurueck — ein Pfad, den es auf dem Host nach der Argumentation dieser Spec gerade nicht gibt. Wo das Tarball entsteht, sagt die Zeile nicht; das Skript legt es unter `$BACKUP_DIR` = `$DATA_DIR/backups` ab.

**Beleg:** scripts/backup.sh:3 („Laeuft als Host-Cron; benoetigt sqlite3, tar + rsync"), :7 (`DATA_DIR="${DATA_DIR:-/data}"`), :8 (`BACKUP_DIR="${BACKUP_DIR:-$DATA_DIR/backups}"`), :19-21 (`BLOB_DIR` mit dem Hostpfad `/var/lib/docker/volumes/files_data/_data` als Vorgabe), :32-35 (harter Abbruch `no *.db in $DATA_DIR — aborting`) — im Repo nachgeprueft.

**Folge:** Bar aufgerufen bricht der Schritt mit Exit 1 ab. Das ist laut und damit der gute Fall — aber es ist ein verbrannter Handgriff um 23 Uhr, und der schlechtere Fall ist die naheliegende Reparatur: jemand exportiert ein `DATA_DIR` von Hand, das Skript laeuft durch und sichert etwas anderes als das, was der Cron sichert. Dann ist die Zusage „`radio.db` faellt ohne Skriptaenderung ins Backup" gegen die falsche Konfiguration belegt.

**Empfehlung:** Die Zeile um die Env erweitern, mit der der Host-Cron laeuft — `DATA_DIR=… BLOB_DIR=… scripts/backup.sh` —, und die zwei Werte vor dem Fenster aus der Crontab bzw. der Timer-Unit ablesen und ins Protokoll schreiben (dieselbe Klasse Auskunft wie U4b). Den Fundort des Tarballs ausschreiben: `$BACKUP_DIR/<stamp>` bzw. das daraus erzeugte Archiv.

---

## RK-A6 — klein

**Ort:** §2.2.3, Zeilen 1780-1807 — „Der Zielarm braucht keine eigene Abfrage"

**Befund:** W8 setzt **fünf** Verwechslungspaare bzw. -tripel verbindlich. §2.2.3 gibt für jedes ein Quellarm-Auswahl-SQL und erklärt dann eine eigene Zielarm-Abfrage für entbehrlich, weil die Spaltennamen auf beiden Armen zeichengleich seien — belegt mit zwei Abfragen „identisch auf BEIDEN Armen". Diese zwei Abfragen enthalten die Glieder des zweiten Tripels **nicht**: die devices-Abfrage führt `id, issi, tei, serial_number, hiorg_id, opta, alamos_integrated, loanable`, die loans-Abfrage keine devices-Spalte. Für `created_at ↔ updated_at ↔ last_updated_at` gibt es damit im ganzen Kapitel 2 keinen Zielarm-Handgriff — und die Ausnahmeliste darunter („genau zwei Spalten weichen ab") nennt nur `devices.last_updated_at` und `loans.zugangscode_id`, also gerade nicht `created_at`/`updated_at`.

**Beleg:** scripts/import/parity.ts:43-56 (checkParity vergleicht Multimengen von Zeilen-Hashes) und scripts/import/portal.ts:73-76 (beide Arme laufen durch dieselbe Mapping-Funktion) — die Feldstichprobe ist damit das einzige Tor gegen eine Spaltenvertauschung im Mapper. radio-admin/server/src/db/schema.ts:18, :37, :38 (am Freeze-SHA nachgesehen) belegen, dass das Tripel drei Spalten mit zwei verschiedenen Zieltypen umfasst.

**Folge:** Die Aussage „Der Zielarm braucht keine eigene Abfrage — und das ist ein Befund, nicht eine Bequemlichkeit" trifft für vier der fünf Paare zu und für das fünfte nicht. Der Mapper-Unit-Test aus §1.3.4 (paarweise verschiedene Konstanten) fängt die Vertauschung, es fehlt also **nicht** das Tor, sondern die Produktionsbestätigung, die Regel 3 für jedes Paar verbindlich verlangt — im Protokoll steht am Ende eine abgehakte Regel ohne durchgeführten Handgriff.

**Empfehlung:** Eine dritte symmetrische Abfrage aufnehmen und ihre Asymmetrie benennen: Quellarm `select id, created_at, updated_at, last_updated_at from devices where id='<id>'` (ms bzw. ms), Zielarm dieselbe Spaltenliste (Sekunden bzw. TEXT), Protokollform aus §2.2.1 — `rechnung = quelle_ms/1000 == ziel_s` für die zwei Zeitstempel, Sollwert nach RK-A2 für `last_updated_at`.

---

## RK-A7 — klein

**Ort:** §1.3.4, Zeilen 885-891 — die Regel über die Fixture-Konstanten

**Befund:** „Die **sieben** Millisekunden-Konstanten oben sind paarweise verschieden" steht über einer Aufzählung mit **dreizehn** Werten, und die Fixture enthält tatsächlich dreizehn. Das ist wörtlich der Fehlertyp, den W8 zweimal als tragend einstuft: eine Wortzahl neben einer richtigen Liste.

**Beleg:** Nachgezählt in derselben Datei: die Fixture (Zeilen 782-882) trägt 1_735_689_600_000, 1_736_000_000_000, 1_737_000_000_000, 1_738_368_000_000, 1_739_000_000_000, 1_740_871_800_000, 1_740_999_999_000, 1_741_000_000_000, 1_741_100_000_000, 1_741_100_001_000, 1_742_000_000_000, 1_742_000_001_000, 1_742_000_002_000 = 13; die Aufzählung in Zeile 886-889 nennt dieselben 13. Repo-seitig stützt scripts/import/parity.ts:30-32 (rowChecksum über die ganze Zeile), warum wiederverwendete Konstanten Zusicherungen vakuös machen.

**Folge:** Die Regel ist die Vorbedingung für fast jede Vertauschungs-Zusicherung des Kapitels. Wer „sieben" liest, hält sie für eine Aussage über einen Teil der Fixture und darf beim Nachtragen einer Zeile einen schon benutzten Wert wiederverwenden — genau der Fall, den der Absatz verbieten will.

**Empfehlung:** „dreizehn" schreiben. Besser noch: die Zählung nicht dem Fließtext überlassen, sondern eine Zusicherungszeile ergänzen, die alle ms-Konstanten der Fixture einsammelt und auf paarweise Verschiedenheit prüft — dann ist die Wortzahl kein Beleg mehr, sondern nur noch Prosa.

---

## RK-A8 — klein

**Ort:** §1.3.5, Zeile 938 — der Beleg für `!!row.is_public`

**Befund:** „`portal.ts:46-48` benutzt `!!row.is_public`" trifft nicht: `:46` ist `tags: row.tags ?? []` und `:47` ist `requiredGroups: row.required_groups ?? []`. Die `!!`-Zeilen sind `:48`, `:49` und `:51`.

**Beleg:** scripts/import/portal.ts, mit `cat -n` gelesen: :46 `tags: row.tags ?? [],` · :47 `requiredGroups: row.required_groups ?? [],` · :48 `isPublic: !!row.is_public,` · :49 `isActive: !!row.is_active,` · :50 `sortOrder: row.sort_order ?? 0,` · :51 `openInNewTab: !!row.open_in_new_tab,`.

**Folge:** In einem Dokument, das mit W9 eigens einen Widerspruch für verrutschte Zeilenbänder führt, ist das der eine Beleg, der beim Nachschlagen auf das **gegenteilige** Muster zeigt: `?? []` ist genau die Form, die der Absatz empfiehlt, nicht die, vor der er warnt. Wer die Stelle prüft, hält entweder die Warnung oder das Repo für falsch.

**Empfehlung:** `portal.ts:48-49, :51` einsetzen. (Am Rand geprüft und **nicht** beanstandet: das zweite Band `portal.ts:79-80` in §1.5.2 Regel 4 zeigt auf den Kommentar, der die Insert-Default-Normalisierung erklärt — als Begründungsbeleg vertretbar, der Code steht in `:94-95`.)

---

## RK-A9 — klein

**Ort:** §1.8, Zeilen 1436-1437 — der Hausform-Beleg für die Fixture-Bauform

**Befund:** „Die Test-Quelle ist eine In-Memory-SQLite mit der ECHTEN produktiven DDL — nicht ein Objekt-Array. `feedback.ts:63-65` nennt genau diese Bauform." Die Hausform belegt nur die erste Hälfte. `feedback` hat **keine** kopierte DDL: sie ist im Test von Hand nachgeschrieben, und `scripts/import/fixtures/` enthält überhaupt keine `.sql`-Datei.

**Beleg:** scripts/import/feedback.test.ts:30-70 — `buildSourceDb()` führt fünf handgeschriebene `CREATE TABLE`-Anweisungen aus, keine Kopie aus einem Migrationsverzeichnis. `ls scripts/import/fixtures/` liefert genau eine Datei: `portal-services.sample.ndjson`. Der zitierte Kommentar steht in feedback.ts:64-65 und sagt „in-memory-Fixture im Test", nichts über die Herkunft der DDL.

**Folge:** Die drei eigenen Gründe in §1.8 tragen die Entscheidung; die Fußnote tut so, als sei sie schon geübte Praxis. Ein späterer Leser, der „wie bei feedback" vereinfacht und die DDL neu schreibt, verliert die physische Spaltenreihenfolge der Produktion (`update_note` auf 24, `tei` auf 25) — und damit wird der Reihenfolge-Test aus §1.8, einer der drei Tests „ohne die dieses Kapitel keinen Schutz hat", vakuös, ohne rot zu werden.

**Empfehlung:** Den Beleg zweiteilen: In-Memory-SQLite statt Objekt-Array = Hausform (`feedback.test.ts:30-70`) · **zeichengleiche** Kopie der Produktions-DDL = Neuerung dieses Kapitels, getragen allein von den drei genannten Gründen. Und in `radio-quelle-ddl.sql` als Kommentarkopf einen Satz, dass die Datei nicht neu geschrieben, sondern kopiert wird.

---

## RK-A10 — klein

**Ort:** §1.6.1 (Zeilen 1302-1307) und §1.6.3 (Zeilen 1317-1384) — die Aufzählung der asymmetrischen Fälle

**Befund:** §1.6.3 führt den asymmetrischen Fall je Tabelle vor: Fall A `devices`, Fall B `loans`, Fall C `device_events`. Für `users` und vor allem für `software_versions` gibt es keinen. Dabei ist `software_versions` die Tabelle mit der größten Hebelwirkung: `is_target` markiert genau eine Zeile, ein Zweitimport per Primärschlüssel-Upsert setzt eine im Ziel umgehängte Marke still auf den Quellstand zurück — Fall A in groß.

**Beleg:** radio-admin@265abd5 nachgesehen: server/src/repos/softwareVersionRepo.ts:77-89 (`setTargetVersion` hängt die Marke in einer Transaktion um) und :63-71 (`getTargetVersion` liest `.limit(1).get()` **ohne** `ORDER BY`); server/drizzle/0002_numerous_mandroid.sql:2 (`is_target integer DEFAULT false NOT NULL`) samt Backfill, der **keine** Zeile markiert, wenn keine Version von einem Gerät referenziert wird — Quelle und Ziel können also legitim auseinanderlaufen, zumal die 🧹-Bereinigung von A2 nach §2.5 in der **Snapshot-Kopie** stattfindet.

**Folge:** Kein operativer Weg — §1.6.4 verbietet den Zweitlauf gegen ein bespieltes Ziel. Es ist eine Lücke in der Testaufzählung: §2.2.3 Regel 4 sagt über genau diese Zeile „Kippt diese eine Zeile, kippt der Status **jedes** Geräts", und für sie gibt es weder einen Idempotenz-Fall noch eine Zusicherung. Wer die drei Fälle später „der Vollständigkeit halber" auf eine Tabelle reduziert, hat kein Gegenargument in der Hand.

**Empfehlung:** Einen vierten Fall D aufnehmen, nach dem Muster von Fall A: importieren · im Ziel `setTargetVersion` auf eine andere Zeile · erneut importieren · Zusicherung, dass die Marke auf dem **Quellstand** steht (also ein Fehlschlag, kein No-Op), mit einem Satz Verweis auf A2 und §2.6s Ziel-Gegenprobe `select count(*) from software_versions where is_target = 1`.

---

## RK-A8 — klein

**Ort:** Rahmen, W1, Absatz „Daraus die Verschärfung einer Frist" — Zeile 299

**Befund:** W1 verschärft „§4.2 Nr. 3 und §3.6 Zusage 12". §3.6 führt vier nummerierte Voraussetzungen und keine „Zusage 12"; die gemeinte Stelle ist §3.6 Nr. 4, und sie trägt die Verschärfung bereits korrekt.

**Beleg:** Spec 2:299 („§3.6 Zusage 12") gegen :3035-3046 — §3.6 „Was vor der Generalprobe grün sein muss", vier Punkte, Nr. 4 lautet bereits „⚠️ vor dem ersten Generalproben-Snapshot, nicht vor dem Cutover-Abend (W1)". `grep -n "Zusage"` über die Spec zeigt keine Zusage-Numerierung in Kapitel 3.

**Folge:** Wer W1 gegenprüfen will — und W1 ist ⛔ tragend —, sucht in §3.6 nach einer Numerierung, die es nicht gibt, und kann nicht feststellen, ob die Verschärfung angekommen ist. Sie ist angekommen; nur der Zeiger stammt aus der alten Teil-3-Numerierung.

**Empfehlung:** „§3.6 Zusage 12" durch „§3.6 Nr. 4" ersetzen. Bei der Gelegenheit prüfen, ob weitere Reste der Teil-Numerierungen als „Zusage N" stehen geblieben sind.

---

## RK-A9 — klein

**Ort:** Kapitel 4 §4.1, Zeile 3071

**Befund:** Die tragende Ablaufregel „die `.env` wird in EINER Änderung vorbereitet, aber die drei schaltenden Zeilen bleiben ungesetzt" beruft sich auf `docs/runbooks/files-cutover.md:107-109`. Dort steht etwas anderes: die Pflege der Pocket-ID-Gruppenmitglieder und der Verlust der Better-Auth-Konten von `easy-filesharing`. Die Stelle, die das Muster wirklich belegt, liegt acht Zeilen tiefer.

**Beleg:** docs/runbooks/files-cutover.md:107-110 (Mitglieder/Better-Auth) gegen :115-116 — „**`.env` vorbereiten — alle Zeilen aus der Tabelle unten in EINER Änderung**, aber noch nicht aktiv: `SUITE_HOST_FILES` und `SUITE_TRAEFIK_RULE` bleiben bis zum Fenster ungesetzt." Die zwei anderen files-cutover-Zitate desselben Kapitels sind korrekt: :167-170 (Alt-Router zuerst weg) und :192-196 (Ergebnis danebenschreiben).

**Folge:** Kein Ausführungsfehler — die Regel selbst ist im Haus belegt. Aber wer sie im Fenster anzweifelt („müssen die drei Zeilen wirklich draußen bleiben?") und der Fußnote folgt, findet keine Bestätigung und entscheidet dann nach Gefühl. Genau an dieser Zeile hängt, ob die Verifikation vor oder nach dem Umschwenk läuft.

**Empfehlung:** Auf `docs/runbooks/files-cutover.md:115-116` umstellen; :107-109 ersatzlos streichen.

---

## RK-A10 — klein

**Ort:** Kapitel 3 §3.1.2, Kommentarblock zu Schritt 1 — Zeilen 2332-2339

**Befund:** Die Begründung für `mkdir -p "$GP/data/files"` lautet: „`src/core/bootstrap.ts:87-90` ruft die Boot-Prüfungen JEDES Moduls … `src/app/m/files/_lib/boot.ts:425` löst `resolve(DATA_DIR, "files")` auf. Fehlt der Pfad, bricht der Prüfcontainer aus einem Grund ab, der nichts mit radio zu tun hat." Die zitierte Datei sagt an derselben Stelle das Gegenteil, und die zitierte Funktion ist nicht die Boot-Prüfung.

**Beleg:** src/app/m/files/_lib/boot.ts:420-422 — Doc-Kommentar zu genau dieser Funktion: „Ein fehlendes Verzeichnis ist KEIN Fehler … ein Lauf, der daran scheitert, protokollierte einen Fehler, der keiner ist"; :429 gibt bei `ENOENT` `[]` zurück. Die Funktion `ablageWurzelListe` (:424) wird ausschließlich von der Statusfunktion :404 gerufen, nicht von `filesBootFehler`. Die Boot-Prüfung ist `pruefeAblage` (boot.ts:87), sie legt das Verzeichnis selbst an (`mkdir(wurzel, { recursive: true … })`, src/app/m/files/_lib/storage.ts:411) und läuft nur, wenn `files` einen Prod-Host trägt (boot.ts:85) — die §3.2.2-Env-Liste setzt kein `SUITE_HOST_FILES`, und der Code-Default ist leer (src/core/registry.ts:105, `prodHosts: []`).

**Folge:** Der Handgriff selbst ist harmlos und bleibt richtig. Falsch ist das Wissen daneben — und es ist als Messung formuliert („⚠️ … und genau das wird um 22 Uhr als radio-Defekt gelesen"). Wer bei einem Startabbruch des Prüfcontainers dieser Fährte folgt, sucht bei `files` statt bei den fünf radio-Boot-Prüfungen aus §3.2.3, die den Abbruch tatsächlich auslösen können.

**Empfehlung:** Den Kommentar auf das kürzen, was belegbar ist: `mkdir -p "$GP/data/files"` wird angelegt, weil ein Bind-Mount die Verzeichnisstruktur des Images nicht erbt (Dockerfile:64-71) — nicht, weil eine Boot-Prüfung daran scheitert. Den Verweis auf `boot.ts:425` streichen; wenn ein Beleg bleiben soll, dann `boot.ts:82-91` plus `storage.ts:406-432` mit dem korrekten Befund: die Ablage-Probe legt das Verzeichnis selbst an und läuft nur bei gesetztem files-Host.

---

## RK-A11 — klein

**Ort:** Kapitel 4 §4.5 Schritt 3 (Zeile 3492) und Kapitel 5 §5.3, Sperrenkasten (Zeile 4610)

**Befund:** Zwei Zählungen um denselben Block. §4.5 Schritt 3 nennt „Die fünf Postgres-Zählungen (P1–P5)"; §5.2.1 und §5.2.3 führen sechs (P1–P6), und Erfuellungspunkt 29 verlangt „P1–P6 vollständig". Zweitens: der Sperrenkasten in §5.3 zählt als Abbau-Sperren „A, T, R, Z, P1, P2, P3, P4 und beide Archivproben" — P6 fehlt, obwohl §5.2.3 P6 mit „Erst danach darf das Volume fallen" überschrieben ist und Abbauliste Posten 3 den Abbau ausdrücklich „erst nach P6" bindet.

**Beleg:** Spec 2:3492-3493 („Die fünf Postgres-Zählungen (P1–P5)") gegen :4265-4266 („die Postgres-Zählungen P1–P6"), :4555 (Überschrift „P6 — der Archiv-Dump. Erst danach darf das Volume fallen.") und :4851 (Erfuellungspunkt 29: „P1–P6 vollständig"). Der Sperrenkasten: :4609-4610; die widersprechende Bedingung in Posten 3: :4616.

**Folge:** Derselbe W8-Fehlertyp wie RK-A6, hier an der Liste, die entscheidet, wann das Postgres-Volume fallen darf. Wer den Sperrenkasten als abschließend liest — er ist als ⛔-Kasten genau dafür gebaut —, kann alle acht genannten Sperren grün haben und das Volume löschen, während der einzige Dump dieses Volumes (P6) nicht gelaufen oder nicht protokolliert ist. Der Dump ist laut §5.2.3 die einzige Sicherung, die dieses Volume je hatte.

**Empfehlung:** In §4.5 Schritt 3 „fünf (P1–P5)" auf „sechs (P1–P6)" korrigieren und den Sperrenkasten in §5.3 um P6 ergänzen („A, T, R, Z, P1–P4, P6 und beide Archivproben"; P5 bleibt Protokoll). Danach gegenlesen, ob die Aufzählung mit Erfuellungspunkt 29 und mit Posten 3 und 5 der Abbauliste deckungsgleich ist.

---

## RK-A12 — klein

**Ort:** Rahmen, ⬜-Tabelle Zeile L1 (Zeile 181)

**Befund:** L1 nennt als Verwendungsstellen §1.4 und §1.5.2. An beiden Stellen steht kein ⬜-L1-Zeichen: §1.5.2 markiert ausschließlich ⬜ L3 (die vier übrigen Paritätssichten), und §1.4 markiert gar nichts. L1 ist damit die einzige der vierzehn Zeilen ohne Anker im Text — nachgezählt über alle ⬜-Vorkommen ab Kapitel 1.

**Beleg:** Spec 2:181 (L1, „Wo es gebraucht wird: §1.4, §1.5.2") gegen :1165-1166 (§1.5.2 markiert nur ⬜ L3) und §1.4 (:955-1112, kein ⬜). `grep -n "⬜"` ab Zeile 562 liefert 27 Treffer, die sich auf L2–L14 verteilen; L1 kommt darin nicht vor. Nebenbefund derselben Zeile: der Kapiteltext benutzt die Mapper- und Typnamen (`toNeuesGeraet`, `NeuesGeraet`, `RadioQuelle`, `RadioDb`, `RadioTx`) durchgehend als gesetzt, ohne den Vorbehalt aus L1 zu wiederholen.

**Folge:** Erfuellungspunkt 37 verlangt, dass „jede der vierzehn Zeilen eine Ablesung trägt und die Runbook-Stellen darauf nachgezogen sind". Für L1 gibt es keine Runbook-Stelle, die man nachziehen könnte — der Punkt ist für diese eine Zeile nicht erfüllbar, und beim Abarbeiten nach dem Bau fällt L1 als einzige durch das Raster.

**Empfehlung:** Entweder in §1.5.2 (bei der Signatur `importiereRadio(quelle, db)` und den fünf `paritaetsSicht*`-Aufrufen) ein ⬜ L1 setzen, oder L1 mit L3 zusammenlegen — beide sind dieselbe Ablesung an der gebauten Schemadatei — und die Tabelle auf dreizehn Zeilen führen, mit angepasster Zahl in Erfuellungspunkt 37.

---


# Anhang — was geprueft und NICHT beanstandet wurde

Das Fehlen genau dieser Liste war der Mangel des Vorgaengerdurchgangs: ohne sie ist nicht unterscheidbar, ob eine Stelle in Ordnung war oder nur nicht angesehen wurde.

## Linse v2:5aac5db45824240c28ecf419f24bf2038ddb17732d020a575b42c5f08bf2cc41

- Quoting-Ebenen §4.5 Schritt 5 (a) und (d) sowie §5.2.2 Abfrage Z: SQL geht per `echo "…" | docker run --rm -i` ueber stdin, das innere Skript steht in einfachen Anfuehrungszeichen (`sh -c 'apk add …; sqlite3 -readonly /data/radio.db'`) — keine Expansion leckt in die Container-Ebene, und die Host-Variable `$VOL_SUITE` steht korrekt ausserhalb.
- Quoting-Ebenen §4.5 Schritt 4 Handgriff 3: `UID_APP`/`GID_APP` werden per `-e` an den Container uebergeben und im einfach gequoteten `sh -c` dort expandiert — das ist die richtige Form und nicht die haeufige Verwechslung, die den Host-Wert einbackt.
- Quoting-Ebenen §5.2.3: `'"'"'public'"'"'` ergibt genau ein Argument mit einfachen Anfuehrungszeichen fuer Postgres; das unquotierte `$PG` zerfaellt beabsichtigt in Woerter, und die doppelten Anfuehrungszeichen um `\"$t\"` in P5 sind fuer den quoted identifier `AdminUser` notwendig und richtig gesetzt.
- Compose-Interpolation in §4.4.4: `$${1}` erreicht Traefik als `${1}` (Compose ersetzt `$$` durch `$`), `permanent=false` ergibt 302, die Middleware haengt am Router und nicht am Service, und die Vorbelegung `${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}` greift mit `:-` sowohl bei leer als auch bei ungesetzt — der Rueckweg in §4.9 (leeren statt entfernen) passt dazu.
- Die Umkehrregel §4.4.3 nachgerechnet: `SUITE_HOST_RADIO=` ergibt `[]` (`hosts.ts:39-46`, leerer String → Split → filter(Boolean) → leere Liste), das Entfernen ergibt `null` und damit den Code-Default; `SUITE_ACCESS_GROUP_RADIO=` kommt als definierter leerer String an. Die Gegenlaeufigkeit der zwei Formen ist im Repo belegt und in der Spec richtig beschrieben.
- §4.1/§4.4.1: die drei ⏸-Zeilen bleiben bis Schritt 9 ungesetzt, weil `SUITE_TRAEFIK_RULE` ueber Labels beim Containerstart wirkt (compose.yaml:153-155 nachgeprueft) — die Reihenfolge `.env` vorbereiten → `up -d` → verifizieren → Router ist tragfaehig und folgt files-cutover.md:165-172.
- §3.2.4 Stufe 3 auf ihre eigene Zulaessigkeit geprueft: `validateHostConfig` weist nur `/` und `:` ab (hosts.ts:80-85), `moduleForHost` schneidet den Port ab (registry.ts:226), kein Modul beansprucht `localhost`, und `/login`, `/api/auth`, `/api/health`, `/_next` sind PASSTHROUGH (routing.ts:12) — die vier Begruendungen stimmen. Nur der Wert selbst ist das Problem, siehe RK-A1.
- §3.2.2 Env-Liste durchgegangen: `-p 127.0.0.1:3999:3000` gegen den `EXPOSE 3000` des Images (Dockerfile:89), `AUTH_URL` als eigene Zeile (compose.yaml:80 setzt sie nur ueber die Compose-Ersetzung, ein blankes `docker run` hat sie nicht), `AUTH_TRUST_HOST` (compose.yaml:82), kein `SUITE_SEED`, kein `SUITE_TRAEFIK_RULE`, keine Labels, nicht im `proxy`-Netz (compose.yaml:127) — jede Zeile traegt.
- W1 (`.backup` statt `cp`, Alt-Stack nicht anhalten) inhaltlich nachvollzogen: scripts/backup.sh:41-43 sichert jede `*.db` mit genau dieser Form und :32-35 bricht ohne Fund hart ab — die Hausform ist belegt, die Verschaerfung der Frist auf „vor dem ERSTEN Generalproben-Snapshot" ist richtig abgeleitet.
- W4 (fuenf Tabellen im Ziel), W6 (Muster ohne `^`, Fehlfall ist leere Ausgabe), W10 (Vorbedingung R/Z vor dem Entfernen von RADIO_HISTORIE_PURGE=0) und W3 (`<freeze_iso>` in beiden Armen statt `'now'`) durchgegangen — Entscheidung und Begruendung tragen, keine erneute Beanstandung. Die Konsistenz zwischen §4.5 Schritt 5 (a), §4.6 Nr. 4, §3.1.5.1 und §5.2.2 Abfrage A auf fuenf Tabellen ist durchgehalten.
- Anhang A A-3 (Postgres im Freeze nicht gestoppt, im Rueckweg gestartet) und A-4 (Stunde gegen zwei Wochen) nachgeprueft und nicht wieder aufgemacht: `start` auf einen laufenden Dienst ist idempotent, und §5.1.1 haelt die zwei Fristen sauber auseinander.
- §1.8 Glied (1)–(4) gelesen, weil §4.5 Schritt 2 darauf verweist: die Zaehlkette liefert fuer Glied (1) einen ausfuehrbaren Befehl gegen das Alt-Volume und trennt fuer Glied (4) Generalprobe und Fenster ausdruecklich (Z. 1516-1519) — die Luecke, die ich vermutet hatte, gibt es nicht; sie ist der Gegenbeleg zu RK-A4.
- §4.4.2 gegen den Quelltext geprueft: die drei Abbruchgruende aus `validateHostConfig` (hosts.ts:65-99) sind vollstaendig und richtig zitiert, und der Hinweis auf die Kollisions-Map, die Registry-Code-Defaults strukturell nicht sieht (hosts.ts:78-95 fuellt sie nur aus `envHostsFor`), stimmt — §4.2 Nr. 6 ist die richtige Gegenmassnahme.
- §4.6 Nr. 3 und Nr. 4 auf ihre Beweislast geprueft: `openModuleDatabase` legt Verzeichnis und Datei stumm an (src/core/db/index.ts:12-22) und `/api/health/radio` liefert 503 nur bei unbekanntem Key — die Warnung, dass Health gegen eine leere `radio.db` gruen ist, trifft zu, und `revision` aus src/app/api/health/[modul]/route.ts:23 ist tatsaechlich der einzige Beleg des ausgerollten Standes.
- §5.2.4 (Archivprobe) und §5.3 (Abbauliste mit den acht Sperren) durchgegangen: die Reihenfolge Bedingung-vor-Haekchen ist konsequent, die benannte Luecke §5.3.1 (U4/C.5) ist als Luecke gefuehrt und nicht als Vermutung, und Posten 12 (Repos archivieren statt loeschen) ist gegen die Belegpflicht beider Specs richtig begruendet.

## Linse v2:38161cb74006be1b8adb625cb65e2c447d6c94089a6e67233fc7b89dae7df98e

- W9 (die Zeilennummern von `parity.ts`) gegen scripts/import/parity.ts nachgezählt: canon :16-28, rowChecksum :30-32, multiset :34-41, checkParity :43-56 mit der Bedingung `source.length === target.length` in :50, assertParity :58-65 mit dem Text `Import ABORTED — no cutover.` in :63 — alle fünf Angaben stimmen zeichengenau.
- §1.2s Spaltenverschiebungstabelle gegen radio-admin@265abd5 nachgerechnet: 0000_confused_thena.sql erzeugt `devices` mit 23 Spalten, 0001 hängt `update_note` (24) an, 0004 `tei` (25). Jede der acht Tabellenzeilen trifft, einschließlich des teuersten Postens „Ziel 20 `loanable` ← Quelle 20 `created_at`" und „Ziel 22 `created_at` ← Quelle 22 `created_by`".
- Die Spaltenzahlen je Tabelle gegen die fünf Alt-Migrationen nachgezählt: `users` 3, `software_versions` 4 aus 0000 plus `sort_order`/`is_target` aus 0002 = 6, `devices` 25, `device_events` 8, `loans` 11 aus 0003 → 12 im Ziel. Jede Quellspalte kommt in genau einem der fünf `SELECT`s aus §1.4 vor; keine bleibt unbenannt, und die Auslassungen (`api_tokens` samt `created_by`, `zugangscodes`, `AdminUser`, die Kiosk-Setup-Mechanik) sind in §1.7 einzeln aufgeführt.
- Randbedingung 3 und W1 an der Quelle geprüft: radio-admin/server/src/index.ts:35 ruft `startRetentionSchedule`, retentionService.ts:47 purgt sofort und erst :48 setzt den Tagestimer; der Cutoff hängt an der Wanduhr (:9 `HISTORY_RETENTION_MONTHS = 2`, :17-21 `getRetentionCutoffMs` über `Date.now()`), und :41 schreibt die Erfolgszeile `[retention] purged N expired loan(s)`. Die Ableitung „jeder Start löscht Historie" trägt.
- Die Zeitachsen-Belege in schema.ts einzeln nachgeschlagen und alle bestätigt: :7 `issi`, :11 `tei`, :18 `last_updated_at`, :29 `alamos_integrated`, :32 `loanable`, :33-36 (`update_note` append-only, „never overwritten by the update flow"), :37-38, :48-51, :53-56, :62 („the plaintext is never stored"), :81, :88-90, :95, :96 (`source`-Enum), :103-104 („`borrowed_at`/`returned_at` are epoch-ms"), :106-110 (`device_id` absichtlich kein FK), :122, :125, :126-130.
- A10 gegen eine nachgebaute Quelle ausgeführt: zehn Summanden, sauberes `0`, und `NULL NOT BETWEEN …` ergibt NULL statt 1 — die NULL-Zeilen werden also tatsächlich nicht mitgezählt, wie §2.4.7 es beschreibt.
- A11 ausgeführt: `group by 2` in jedem Glied eines `UNION ALL`-Verbunds plus abschließendes `order by 1, 2` ist gültiges SQLite; die Ausgabe liefert zehn Beschriftungen, davon zwei mit zusätzlicher `'null'`-Gruppe (`devices.last_updated_at`, `loans.returned_at`) — genau die im Text ausgeschriebene Erwartung.
- `tagInBerlin` in Node nachgerechnet: alle vier Zusicherungen treffen (die drei Funktionstests im August, also Sommerzeit, und die ⛛-Verdrahtungszeile 1_740_871_800_000 → „2025-03-02" im März, also Winterzeit). `new Date(ms).toISOString().slice(0,10)` liefert bei dreien den falschen Tag — die Zusicherungen sind nicht vakuös, und beide UTC-Offsets sind abgedeckt.
- §2.2.1s diskriminierender Filter `last_updated_at % 86400000 >= 79200000` trifft die Formular-Zeilen (22:00/23:00 UTC) und lässt die CSV-Zeilen aus, die exakt auf UTC-Mitternacht liegen (Rest 0) — der Filter tut, was er soll; nur sein Sollwert fehlt (RK-A2).
- Die Faktor-Führung ist an allen vier Fundstellen gleich: A8 (§2.4.5) und Abfrage R (§5.2.2) rechnen im Quellarm mit `* 1000`, der Zielarm ohne; die W3-Tabelle beschriftet A8 als Vorhersage und R als Gegenprobe. Abfrage Z prüft beide Grenzen (946684800 / 4000000000) über neun Zahl- und eine Textspalte — zusammen zehn, die Zählung stimmt, und `devices.last_updated_at` ist dort richtig als Formatprobe geführt.
- §1.5.1s Einfügereihenfolge gegen die einzige FK-Kante geprüft: `FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE cascade` steht in 0000_confused_thena.sql:21 und ist die einzige der fünf Migrationen. Die Reihenfolge users → software_versions → devices → device_events → loans erfüllt sie; `zugangscodes` fehlt zu Recht, weil `loans.zugangscode_id` für jede importierte Zeile NULL ist.
- §2.5s A3-Bereinigung auf die NOT-IN/NULL-Falle geprüft: gemessen kann `NOT IN (select id from devices)` bei einem NULL in der Unterabfrage still null Zeilen löschen — hier aber nicht, weil `devices.id` in der Quelle `text PRIMARY KEY NOT NULL` ist (0000_confused_thena.sql:26). Die Bereinigung ist sicher.
- §5.2.3 gegen radio-inventar@f883ec4 nachgeprüft, alle Erwartungen treffen: apps/backend/prisma/migrations/ enthält genau **fünf** Verzeichnisse (P2s „5 abgeschlossene Migrationen"), 20260629120000_drop_loan/migration.sql führt `DROP TABLE "Loan"` (P2s `to_regclass` = NULL), und `create-session-table.sql` wird von nichts ausgeführt — apps/backend/src/main.ts:74-82 konfiguriert `express-session` **ohne** `store` (also MemoryStore), und `connect-pg-simple` steht in den devDependencies (package.json:17, :30), kommt also nicht ins Produktionsimage. P4s Erwartung „die Tabelle existiert nicht" trägt.
- Die übrigen Belege von §5.2.3 und §1.4.2 stimmen zeichengenau: radio-inventar/docker-compose.yml:7 (`${POSTGRES_USER:-radio}`), :10 (`POSTGRES_DB: radio_inventar`), :12 (`postgres_data`), apps/backend/src/config/env.config.ts:11 (`API_TOKEN` mit `min(32)`, ohne Default — die Wurzel von U4a), pocket-id.service.ts:134 (`pocketid:${userInfo.sub}`), softwareVersionRepo.ts:39 und :53 (`created_by` wird geschrieben), :63-71 (`getTargetVersion` ohne `ORDER BY`), :77-89 (die Invariante lebt in einer Anwendungstransaktion).
- compose.yaml:79, :99 und :221-223 — die drei Belege für „`$DATA_DIR/radio.db` gibt es auf dem Host nicht" treffen wörtlich; ebenso Randbedingung 9s Bestandsaufnahme von `scripts/import/` (feedback-time.ts, feedback.ts, parity.ts, portal.ts, je ein Test, `fixtures/` — kein `lagerbuch.ts`) und §1.8s Inhaltsangabe von 0000 (fünf `CREATE TABLE`, zwei Unique-Indizes, `device_events_device_id_idx`).

## Linse v2:36be0e677480afe42ce9a920f9acf169f11bb61af4b762ea21d5b888a9798c4e

- Beide Freeze-SHAs sind auflösbar: `git cat-file -e 265abd5^{commit}` in ../radio-admin und `f883ec4^{commit}` in ../radio-inventar laufen durch — die Belegkette beider Specs hat einen Anker.
- W9s Zeilentabelle für `scripts/import/parity.ts` stimmt zeichengenau: canon 16-28, rowChecksum 30-32, multiset 34-41, checkParity 43-56 mit der `ok`-Bedingung samt `source.length === target.length` in :50, assertParity 58-65 mit `Import ABORTED — no cutover.` in :63.
- W9s Korrektur ist auch angekommen: Kapitel 2 §2.1.1 (Zeilen 1591-1596) führt die neuen Zahlen, nicht mehr die alten :31-33/:35-43/:45-59/:61-69.
- W1 ist in die Kapitelrümpfe propagiert: `grep` über die Zeilen 562-4879 findet kein `cp /d/data.sqlite` mehr; §2.4 (1948-1959) und §4.5 Schritt 2 (3447-3455) benutzen `.backup` und §2.4 sagt ausdrücklich „⛔ ohne `docker compose stop`".
- W1s Fristverschärfung ist an beiden Zielorten angekommen: §4.2 Nr. 3 (3119-3120) und §3.6 Nr. 4 (3045-3046) sagen beide „vor dem ERSTEN Generalproben-Snapshot", nicht mehr „vor dem Cutover-Abend".
- W3 ist propagiert: `'now'` steht nur noch in A8 (2056) als Vorhersage und in der Generalproben-Gegenprobe (2443-2448, mit Begründung); §4.5 Schritt 5 (3620-3647) und §5.2.2 Abfrage R (4335-4350) rechnen mit `<freeze_iso>` in beiden Armen, und §4.5 Schritt 1 (3404) protokolliert ihn tatsächlich als ISO-UTC.
- W4 ist propagiert: keine Sechser-Schleife im Zielarm mehr — §2.6 (2228-2235), §3.1.5.1 (2412-2417), §4.5 Schritt 5 a (3591-3595) und §5.2.2 (4293-4298) zählen fünf; `api_tokens` steht überall nur noch im Quellarm als Protokollzeile.
- W6 ist propagiert: `grep -i '^radio:'` kommt in keinem Kapiteltext mehr vor (nur noch in W6 selbst als Zitat); §3.1.6, §4.5 Schritt 7 und §4.6 Nr. 9 filtern ohne `^` und protokollieren zusätzlich die erste Rohzeile.
- W8 ist propagiert: A10 heißt durchgehend zehnspaltig (§2.4.6, §3.1.4), und die Verwechslungspaare heißen durchgehend fünf (§2.2.3 Regel 3, §3.1.5.2, G4, §4.5 Schritt 5 b).
- W10 ist propagiert: §4.6 Nr. 14 (3904-3907) trägt die Vorbedingung „erst wenn R und Z grün protokolliert sind", und §5.1.1 (4229-4234) spiegelt sie als Verlängerungsgrund.
- W11 ist propagiert: §3.1.4 (2377-2391) ist auf A-Marken umgeschrieben, und §1.4.4 (1065-1067) führt `SELECT DISTINCT source` ausdrücklich als A5 und nicht als vierzehnte Abfrage.
- Die Zeitachse rechnet auf: zehn Quellspalten in epoch-Millisekunden (devices.created_at/updated_at/last_updated_at, software_versions.created_at, users.last_seen_at, device_events.changed_at, loans.borrowed_at/returned_at/created_at/updated_at) — nachgezählt gegen `radio-admin/server/src/db/schema.ts` bei 265abd5; mit den drei `api_tokens`-Spalten (:66, :68, :69) ergeben sich die dreizehn aus Spec 1 §8.2.1.
- Die Spaltenverschiebungstabelle in §1.2 (Zeilen 657-666) ist Position für Position richtig: `0000_confused_thena.sql` legt `devices` mit 23 Spalten an, `0001_cooing_overlord.sql:1` hängt `update_note` als 24. an, `0004_polite_redwing.sql:1` `tei` als 25. — Ziel 4 empfängt damit `serial_number`, Ziel 20 (`loanable`) empfängt `created_at`, Ziel 22 (`created_at`) empfängt `created_by`.
- Die Belegstellen in `radio-admin` bei 265abd5 stimmen: schema.ts:7/:11 (issi/tei), :18, :29, :30-32, :33-36, :37/:38, :46, :48-51, :53-56, :62, :79, :81, :88-90, :95, :96, :106-110, :122/:125, :126-130; index.ts:35; retentionService.ts:9, :19, :41, :47, :48; softwareVersionRepo.ts:39, :53, :63-70, :81-87.
- `radio-admin/server/src/routes/loanApi.ts` führt bei 265abd5 genau sechs `/v1`-Routen (:126, :133, :140, :148, :158, :187) — Randbedingung 2 und Entscheidung 15 sind gedeckt.
- Die Belegstellen in `radio-inventar` bei f883ec4 stimmen: pocket-id.service.ts:134 (`pocketid:${userInfo.sub}`), env.config.ts:11 (`API_TOKEN` mit `min(32)`, ohne Default), usePWA.ts:72-73 (Registrierung mit `scope: '/'`), public/sw.js:2 (`radio-inventar-v1`), :24 (`skipWaiting`), :40 (`clients.claim`), :78-96 (Navigationen network-first), :100-127 (alles Übrige cache-first) und die Precache-Liste :6-14, die genau die in §4.7 genannten sechs Dateien führt; docker-compose.yml:1, :3, :4, :7, :8, :9, :10, :12, :13, :26-27, :28, :33-39, :37, :40, :42-44.
- Beide eingecheckten Alt-Compose-Dateien enthalten die Zeichenkette `traefik` null Mal und veröffentlichen nur `ports:` — die Behauptung im Kopf ist unabhängig nachgeprüft.
- Die Suite-Seite ist dagegen wirklich Traefik-geführt (compose.yaml:146-155) und veröffentlicht selbst keinen Port — E7 und W5s Begründung „der reguläre Stack hat keinen veröffentlichten Port" sind gedeckt.
- Die Kern-Belegstellen der Suite stimmen: hosts.ts:20, :33-46, :52-57, :59-63, :65-99, :69-76, :81-85, :87-93, :78-95; routing.ts:12, :37, :57-67, :69; registry.ts:105, :137, :225-232, :226, :228, :239; db/index.ts:6, :8-10, :12-23, :19, :27-36; bootstrap.ts:92, :99-105; auth/redirect.ts:8; auth/devLogin.ts:10-11.
- Die Compose- und Dockerfile-Zitate stimmen: compose.yaml:79, :99, :127, :149-153, :153, :154, :155, :221-223; Dockerfile:36, :42-43, :85-86, :88, :89 — einzig `Dockerfile:72` meint die `RUN mkdir … chown`-Zeile, die tatsächlich auf :71 steht (:72 ist `VOLUME /data`); die Aussage bleibt richtig.
- Die vier Runbook-Vorbilder stimmen: portal-cutover.md:19-25 (positionales Argument + Snapshot-Pfad), :20 und :33 (`parity green`); lagerbuch-cutover.md:30-31, :33-34, :72, :102, :122, :158, :236, :267-284, :290-310, :409, :415, :420, :432, :452, :544; files-cutover.md:62, :167-170, :192-196, :309-310, :360-370, :368; suite-update-webfinger.md:43-45, :220.
- Die `.env.example`-Zitate stimmen: :112 führt bereits die auskommentierte Zeile `# SUITE_HOST_RADIO=`, :231-239 den lagerbuch-Cutover-Block, :252-258 die wertgleiche Übernahme von `HELFER_SESSION_SECRET`, :309 den Beginn des aufgaben-Blocks und :366-369 die `SUITE_TRAEFIK_RULE`-Zeile.
- Die Vorbilder aus `scripts/import` stimmen: portal.ts:46-48 (`!!row.is_public`), :61, :66-71, :73-76, :78-81, :102, :105-107; feedback.ts:63-65, :66-72 (`SELECT *`), :235-237, :238, :248-256, :264, :265, :266, :274-276; backup.sh:25-27 (nullglob), :32-36 (harter Abbruch), :41-43 (`.backup`).
- Die Randbedingung „das lagerbuch-Import-Skript ist nicht im Repo" ist nachgeprüft: `scripts/import/` führt feedback-time.ts, feedback.ts, parity.ts, portal.ts, je einen Test und `fixtures/` — kein `lagerbuch.ts`, kein `radio.ts`.
- Die Nichtexistenz von Spec 1s Bau ist nachgeprüft: `src/app/m/` führt alpha, aufgaben, beta, feedback, files, gamma, kioskdemo, lagerbuch, portal, qr — kein `radio`.
- §4.4.4s Redirect-Block ist in sich schlüssig geprüft (Middleware am Router, `permanent=false`, `$${1}` gegen die Compose-Interpolation, `SUITE_REDIRECT_RULE_RADIO_ADMIN` bewusst ohne `SUITE_HOST_`-Präfix wegen `PREFIX` in hosts.ts:20, `entrypoints=web` gleich dem Suite-Router in compose.yaml:154) — kein Fund.
- Die drei Prüfcontainer-Formen und ihre Abgrenzung (§3.2.2 Generalprobe, §2.2.2 nicht bootend, §4.5 Schritt 8 Fenster) sind durchgezogen: Schritt 8 nennt die zwei benannten Unterschiede aus W5, setzt `AUTH_DEV_LOGIN` ausdrücklich nicht und zitiert den §3.2.1-Textriegel mit Geltungsbereich.
- Anhang A und Anhang B wurden gelesen; die dort geführten sechs bzw. vier Fälle sind bewusst nicht erneut gemeldet — mit der einen Ausnahme der Spaltenzahl in A-5, die dort keine Entscheidung ist (RK-A6).

