# Runbook — Einsatzbuch-Schlüssel

Ziel: Das eine echte Schlüsselpaar des Einsatzbuchs anlegen, seine Notfall-Sicherung sicher
verwahren und es im Verlustfall wiederherstellen. Ein Schlüsselwechsel gehört nicht dazu — dafür
gibt es in v2.0 keinen Weg, und `einsatzbuch:schluessel erzeugen` verweigert ein zweites Paar
ausdrücklich (`EchtesPaarVorhanden`).

## Vorbedingungen

- Die Suite läuft mit dem Stand der Stufe 2 bereits einmal (die Tabelle `schluesselpaar` muss
  existieren) — das Skript **migriert nicht**.
- Ein Checkout **desselben Stands**, aus dem heraus das Skript läuft: das Laufzeit-Image der Suite
  enthält weder `scripts/` noch `tsx`.
- Node 26 und `pnpm@11.0.9` — dieselben Versionen wie in der `deps`-Stage des `Dockerfile`. Node 26
  bringt kein `corepack` mehr mit (`npm i -g pnpm@11.0.9` installieren, nicht `corepack enable`).
- Zugriff auf das Datenvolume der Suite. Den Mountpunkt findet man mit:
  ```
  docker volume inspect suite_data -f '{{ .Mountpoint }}'
  ```
- `openssl` auf der Maschine, von der aus der KEK erzeugt wird.

Hauptweg unten ist der **Host-Weg** — er ist gegen ein Wegwerf-Volume tatsächlich durchgemessen
worden. Der Container-Weg danach ist eine Alternative für den Fall, dass kein Zugriff auf den
Docker-Host selbst besteht; er ist **nicht** durchprobiert (siehe Warnhinweis dort).

## KEK erzeugen und setzen

```
openssl rand -base64 32
```

Den Wert als `EINSATZBUCH_SCHLUESSEL_KEK` in die Umgebung der Suite eintragen (Stack-`.env`) und
**getrennt vom Tresor der Notfall-Sicherung** ablegen — wer beides zusammen verwahrt, hat mit einem
einzigen Zugriff sowohl den Schlüssel zum Umschlag als auch den Umschlag selbst. Ohne diese
Variable zeigt die Übersicht einen Hinweis, und die Schlüsselfreigabe (Stufe 5) antwortet mit
Status 503.

Den KEK **nie** als Wert in eine Befehlszeile schreiben — er landet sonst im Klartext in der
Shell-History. Verdeckt einlesen und in der Sitzung weiterreichen:

```
read -rs EINSATZBUCH_SCHLUESSEL_KEK && export EINSATZBUCH_SCHLUESSEL_KEK
```

(Alternative: den Wert in eine Datei mit Modus 0600 legen und per `--env-file` an `docker run`
reichen, statt ihn mit `-e` auf der Befehlszeile zu übergeben.)

## Schlüsselpaar erzeugen — Host-Weg (gemessen)

Aus einem Checkout desselben Stands, direkt auf dem Docker-Host, der Skriptaufruf **als uid 1001**
(derselbe Nutzer, unter dem der Container später schreibt) — sonst legt das Skript root-eigene
`-wal`/`-shm`-Dateien im Volume an, die der laufende Container danach nicht mehr anfassen kann:

```
git checkout <commit-oder-tag>          # derselbe Stand wie die laufende Suite
npm i -g pnpm@11.0.9
pnpm install --frozen-lockfile

VOL=$(docker volume inspect suite_data -f '{{ .Mountpoint }}')
mkdir -m 0700 -p ~/einsatzbuch-schluessel   # AUSSERHALB des Volumes — sonst landet die Sicherung im Backup

read -rs EINSATZBUCH_SCHLUESSEL_KEK && export EINSATZBUCH_SCHLUESSEL_KEK
read -rs EINSATZBUCH_NOTFALL_KENNWORT && export EINSATZBUCH_NOTFALL_KENNWORT   # optional, sonst fragt das Skript zweimal, verdeckt

sudo -u '#1001' -g '#1001' env \
  DATA_DIR="$VOL" \
  EINSATZBUCH_SCHLUESSEL_KEK="$EINSATZBUCH_SCHLUESSEL_KEK" \
  EINSATZBUCH_NOTFALL_KENNWORT="$EINSATZBUCH_NOTFALL_KENNWORT" \
  pnpm einsatzbuch:schluessel erzeugen --ausgabe ~/einsatzbuch-schluessel
```

Der Ausgabeordner muss nicht vorher angelegt sein: Das Skript legt ihn selbst an (Modus 0700),
bevor es nach dem Kennwort fragt. Erwartete Ausgabe:

```
Schlüsselpaar <schluesselId> angelegt.
Notfall-Sicherung: <ausgabeordner>/einsatzbuch-notfall-<schluesselId>.json
Zum Ausdrucken:    <ausgabeordner>/einsatzbuch-notfall-<schluesselId>.html
Beide Dateien in den Tresor, danach von diesem Rechner löschen.
```

Danach zeigt die Einsatzbuch-Übersicht keinen Hinweis mehr — Voraussetzung ist, dass derselbe KEK
auch in der laufenden Suite gesetzt ist (nicht nur in dieser Sitzung auf dem Host).

## Schlüsselpaar erzeugen — Container-Weg (Alternative)

⚠️ **Nicht gemessen** — vor dem ersten echten Einsatz einmal gegen ein Wegwerf-Volume proben.
Abgeleitet aus der `deps`-Stage des `Dockerfile`: `node:22-alpine` hat weder `python3` noch einen
Compiler, und `better-sqlite3` ab Version 13 baut sein natives Binding immer aus den Quellen — ohne
`python3 make g++` bricht `pnpm install` mit einer Python-Fehlermeldung ab. Ein Bind-Mount des
Repos für `node_modules` scheidet aus: `pnpm install` im Alpine-Container würde die musl-Bindings
über die Host-`node_modules` schreiben und den nächsten `pnpm dev`/`pnpm build` auf dem Host
brechen — das Repo wird deshalb in den Container hinein **kopiert**, statt eingehängt zu werden.

```
docker run --rm -it \
  -v suite_data:/data \
  -v "$PWD":/repo-ro:ro \
  -v ~/einsatzbuch-schluessel:/ausgabe \
  -e DATA_DIR=/data \
  node:26-alpine \
  sh -c '
    set -e
    apk add --no-cache python3 make g++ su-exec
    npm i -g pnpm@11.0.9
    mkdir -p /repo && cp -r /repo-ro/. /repo/ && cd /repo
    pnpm install --frozen-lockfile
    read -rs EINSATZBUCH_SCHLUESSEL_KEK && export EINSATZBUCH_SCHLUESSEL_KEK
    su-exec 1001:1001 env HOME=/tmp DATA_DIR=/data \
      EINSATZBUCH_SCHLUESSEL_KEK="$EINSATZBUCH_SCHLUESSEL_KEK" \
      pnpm einsatzbuch:schluessel erzeugen --ausgabe /ausgabe
  '
```

`node:26-alpine` ist dasselbe Image wie in der `deps`-Stage, `su-exec` senkt die Rechte auf uid/gid
1001, ohne dass der Container einen eigenen Nutzer mit dieser ID anlegen muss (Muster:
`docs/runbooks/feedback-cutover.md`, Schritt „Import", Alternative ohne Host-Pfad — dort für ein
anderes Skript, hier auf `su-exec` statt `corepack enable` angepasst, weil Node 26 kein `corepack`
mehr mitbringt). `HOME=/tmp` gibt der abgesenkten uid 1001 ein beschreibbares Zuhause, das Alpine
ihr sonst nicht zuweist. Die Ausgabe landet über den eigenen Mount `~/einsatzbuch-schluessel` auf
dem Host, nicht im Datenvolume.

## Notfall-Sicherung ablegen

Beide Dateien — JSON und die druckbare Seite mit dem QR-Code — in den Tresor legen. Das Kennwort
**getrennt** davon verwahren (anderer Tresor, andere Person, anderes Medium): ohne beide Teile
zusammen lässt sich der private Schlüssel nicht wiederherstellen, aber wer nur eines der beiden in
die Hände bekommt, kann damit nichts anfangen. Danach die Dateien vom Rechner löschen, auf dem das
Skript lief — sie sollen nur im Tresor liegen.

## Wiederherstellen

Die Notfall-Sicherung scannen (QR) oder aus dem Tresor holen, den Inhalt als Datei ablegen.

**Der KEK muss vor dem Aufruf feststehen, nicht danach:** `wiederherstellen` liest
`EINSATZBUCH_SCHLUESSEL_KEK` genauso wie `erzeugen` aus der Umgebung, in der das Skript läuft, und
bricht ohne gültigen Wert mit Exit 2 ab, bevor es die Notfalldatei überhaupt öffnet.

1. **KEK festlegen**, je nach Fall:
   - **DB verloren** (neue, leere Datenbank nach einer frischen Stufe-2-Migration; das
     Schlüsselpaar selbst war nie kompromittiert): der bisherige KEK darf weitergelten, sofern er
     noch bekannt ist — diesen Wert wieder einlesen, keinen neuen erzeugen.
   - **KEK verloren** (die Datenbank ist vorhanden, aber der private Schlüssel lässt sich mit
     keinem bekannten KEK mehr entschlüsseln): einen **neuen** KEK erzeugen
     (`openssl rand -base64 32`).

   In beiden Fällen verdeckt einlesen, nie in die Befehlszeile schreiben:
   ```
   read -rs EINSATZBUCH_SCHLUESSEL_KEK && export EINSATZBUCH_SCHLUESSEL_KEK
   ```

2. **Wiederherstellen aufrufen** (Host- oder Container-Weg wie beim Erzeugen):
   ```
   DATA_DIR=<volume-pfad> pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>
   ```
   Erwartete Ausgabe, wörtlich, je nach Fall:
   - **DB verloren** (neue Zeile entsteht): `Schlüsselpaar <schluesselId> wiederhergestellt.`
   - **KEK verloren** (vorhandene Zeile wird neu verschlüsselt):
     `Schlüsselpaar <schluesselId>: privater Schlüssel mit dem aktuellen KEK neu abgelegt.`

   Meldet das Skript stattdessen
   `In der Suite liegt das Paar <vorhanden>, die Sicherung gehört zu <sicherung>.`
   (Fehlerfall `AnderesPaarVorhanden`), passt die Notfalldatei nicht zum Paar in diesem Volume —
   abbrechen und prüfen (falsches Volume? falsche Notfalldatei?), bevor irgendetwas geschrieben
   wird.

3. **Denselben KEK-Wert in der Umgebung der Suite setzen** (Stack-`.env`) **und die Suite neu
   starten.** Erst danach verschwindet der Hinweis auf der Übersicht — ein Neustart ohne diesen
   Schritt lässt die laufende Suite weiter mit dem alten (Fall „KEK verloren") bzw. mit gar keinem
   (Fall „DB verloren", frischer Stack) KEK laufen.

## Was bei Verlust verloren ist

Ohne privaten Schlüssel **und** ohne Notfall-Sicherung sind alle noch nicht exportierten Einsätze
unwiderruflich verloren — sie liegen ausschließlich auf dem Einsatzbuch-Rechner und lassen sich ohne
den privaten Schlüssel nicht freigeben. Bereits exportierte `.einsatzbuch`-Dateien bleiben lesbar:
sie tragen ihre eigenen CEKs im Umschlag und hängen nicht am Schlüsselpaar der Suite.

## Was in diesem Runbook NICHT vorkommt

- **Ein Schlüsselwechsel** bei weiterhin gültigem, nur ausgetauschtem Schlüsselpaar — dafür gibt es
  in dieser Stufe keinen Ablauf.
- **Test-Schlüsselpaare** (`art = "test"`, `rechnerId` gesetzt) — die legt erst Stufe 5 bei der
  Einrichtung eines Test-Rechners an.
