# Runbook — Einsatzbuch-Schlüssel

Ziel: Das eine echte Schlüsselpaar des Einsatzbuchs anlegen, seine Notfall-Sicherung sicher
verwahren und es im Verlustfall wiederherstellen. Ein Schlüsselwechsel gehört nicht dazu — dafür
gibt es in Stufe 2.0 keinen Weg, und `einsatzbuch:schluessel erzeugen` verweigert ein zweites Paar
ausdrücklich (`EchtesPaarVorhanden`).

## Vorbedingungen

- Die Suite läuft mit dem Stand der Stufe 2 bereits einmal (die Tabelle `schluesselpaar` muss
  existieren) — das Skript **migriert nicht**.
- Ein Checkout **desselben Stands**, aus dem heraus das Skript läuft: das Laufzeit-Image der Suite
  enthält weder `scripts/` noch `tsx` (Muster `docs/runbooks/feedback-cutover.md`).
- Zugriff auf das Datenvolume der Suite (`DATA_DIR` bzw. das Docker-Volume).
- `openssl` auf der Maschine, von der aus der KEK erzeugt wird.

## KEK erzeugen und setzen

```
openssl rand -base64 32
```

Den Wert als `EINSATZBUCH_SCHLUESSEL_KEK` in die Umgebung der Suite eintragen (Stack-`.env`) und
**getrennt vom Tresor der Notfall-Sicherung** ablegen — wer beides zusammen verwahrt, hat mit einem
einzigen Zugriff sowohl den Schlüssel zum Umschlag als auch den Umschlag selbst. Ohne diese
Variable zeigt die Übersicht einen Hinweis, und die Schlüsselfreigabe (Stufe 5) antwortet mit
Status 503.

## Schlüsselpaar erzeugen

Aus einem Einmal-Container gegen das Volume, **als uid 1001** (Muster
`docs/runbooks/feedback-cutover.md:143`), mit `-it`, damit das Kennwort verdeckt eingegeben werden
kann:

```
docker run --rm -it --user 1001:1001 -v suite_data:/data -v "$PWD":/repo -w /repo \
  -e DATA_DIR=/data -e EINSATZBUCH_SCHLUESSEL_KEK=<der oben erzeugte KEK> \
  node:22-alpine \
  sh -c 'corepack enable && pnpm install && pnpm einsatzbuch:schluessel erzeugen --ausgabe /data/einsatzbuch-schluessel'
```

Alternativ vom Host, wenn das Volume dort gemountet ist:

```
DATA_DIR=<volume-pfad> EINSATZBUCH_SCHLUESSEL_KEK=<der oben erzeugte KEK> \
  pnpm einsatzbuch:schluessel erzeugen --ausgabe <ausgabeordner>
```

Das Skript fragt das Notfall-Kennwort zweimal, verdeckt, ab (mindestens 16 Zeichen) und schreibt
**erst nach** der geschriebenen Sicherung die Datenbankzeile. Erwartete Ausgabe:

```
Schlüsselpaar <schluesselId> angelegt.
Notfall-Sicherung: <ausgabeordner>/einsatzbuch-notfall-<schluesselId>.json
Zum Ausdrucken:    <ausgabeordner>/einsatzbuch-notfall-<schluesselId>.html
Beide Dateien in den Tresor, danach von diesem Rechner löschen.
```

Danach zeigt die Einsatzbuch-Übersicht keinen Hinweis mehr — Voraussetzung ist, dass derselbe KEK
auch in der laufenden Suite gesetzt ist (nicht nur im Einmal-Container).

## Notfall-Sicherung ablegen

Beide Dateien — JSON und die druckbare Seite mit dem QR-Code — in den Tresor legen. Das Kennwort
**getrennt** davon verwahren (anderer Tresor, andere Person, anderes Medium): ohne beide Teile
zusammen lässt sich der private Schlüssel nicht wiederherstellen, aber wer nur eines der beiden in
die Hände bekommt, kann damit nichts anfangen. Danach die Dateien vom Rechner löschen, auf dem das
Skript lief — sie sollen nur im Tresor liegen.

## Wiederherstellen

Die Notfall-Sicherung scannen (QR) oder aus dem Tresor holen, den Inhalt als Datei ablegen und:

```
DATA_DIR=<volume-pfad> pnpm einsatzbuch:schluessel wiederherstellen <notfalldatei.json>
```

Zwei Fälle, in beiden wird ein **neuer** KEK gesetzt (der alte ist mit der verlorenen Ressource
verloren):

- **DB verloren** (neue, leere Datenbank nach Stufe-2-Migration): Das Skript legt die Zeile mit dem
  wiederhergestellten Schlüsselpaar und dem neuen KEK neu an.
- **KEK verloren** (Datenbank vorhanden, aber der private Schlüssel lässt sich mit keinem
  bekannten KEK mehr entschlüsseln): Das Skript ersetzt `privat_verschluesselt` der vorhandenen
  Zeile, verschlüsselt mit dem neuen KEK. Die `schluesselId` bleibt gleich — sie steht in der
  Notfall-Sicherung, nicht in der laufenden Datenbank.

In beiden Fällen den neuen KEK anschließend in der Umgebung der Suite setzen, sonst bleibt der
Hinweis auf der Übersicht stehen.

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
