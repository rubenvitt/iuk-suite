# Runbook — Einsatzbuch-Desktop-App: Release, Installation, Update

Ziel: Eine Version der Desktop-App ausliefern, sie auf einem Rechner unter Windows oder macOS
installieren und einrichten, Updates verstehen und im Fehlerfall zurücksetzen.

Beteiligte Dateien:

| Datei | Rolle |
|---|---|
| `.github/workflows/einsatzbuch.yml`, Jobs `release-bauen` und `release-veroeffentlichen` | baut, signiert und veröffentlicht aus einem Tag `einsatzbuch-vX.Y.Z` |
| `scripts/einsatzbuch-updater-json.mjs` | baut `latest.json`, das Manifest des Updaters |
| `scripts/einsatzbuch-signaturen-pruefen.mjs` | prüft vor dem Veröffentlichen jede `.sig` gegen den öffentlichen Schlüssel |
| `apps/einsatzbuch/src-tauri/tauri.conf.json` | Version, öffentlicher Updater-Schlüssel, Adresse des Manifests |
| `apps/einsatzbuch/src-tauri/tauri.release.conf.json` | Overlay nur für den Release-Lauf (`createUpdaterArtifacts`, Ad-hoc-Signatur für macOS) |
| `apps/einsatzbuch/src-tauri/build_pruefung.rs` | Riegel: kein Release-Build mit Platzhalter statt Schlüssel |
| `apps/einsatzbuch/src-tauri/src/updater.rs` | wann die App prüft und wann sie installiert |
| `apps/einsatzbuch/src/version.test.ts` | Versionsgleichheit der drei Dateien und des Lockfiles |

**Ehrliche Messaussage:** Bis heute (25.09.2026) gibt es kein einziges Einsatzbuch-Release. Kein
Schritt dieses Runbooks ist von Tag bis Update durchgelaufen. Geprüft sind der Workflow per
`actionlint`, das Manifest-Skript und die Versionsgleichheit per Test, der Platzhalter-Riegel per
`cargo test` und `cargo update -p einsatzbuch` in einer Kopie. Die Signaturprüfung ist gegen echte
Ausgaben von `tauri signer` mit Wegwerf-Schlüsseln getestet, die Ad-hoc-Signatur an einem lokalen
Debug-Bundle (`codesign` meldet `Signature=adhoc`). Die Texte der Warnungen von Windows und macOS
stammen nicht aus einer eigenen Installation. Den ersten Release-Lauf deshalb eng begleiten
und dieses Runbook danach an den gemessenen Stand anpassen.

## Überblick

Ein Tag `einsatzbuch-vX.Y.Z` startet den Workflow `einsatzbuch`. Die Prüfjobs `oberflaeche`,
`rust-kern` und `desktop` laufen mit. Erst wenn alle drei grün sind, baut `release-bauen` die
Release-Fassung:

- **macOS:** ein universelles Bundle für Apple Silicon und Intel. Die DMG ist für die Erstinstallation
  gedacht, `Einsatzbuch.app.tar.gz` mit `.sig` für den Updater.
- **Windows x64:** der NSIS-Installer `Einsatzbuch_X.Y.Z_x64-setup.exe` mit `.sig`. Er dient für die
  Erstinstallation und für den Updater.

Danach veröffentlicht `release-veroeffentlichen` zwei Releases:

| Release | Inhalt | Lebensdauer |
|---|---|---|
| `einsatzbuch-vX.Y.Z` | `Einsatzbuch_X.Y.Z_universal.dmg`, `Einsatzbuch.app.tar.gz` (+ `.sig`), `Einsatzbuch_X.Y.Z_x64-setup.exe` (+ `.sig`), `latest.json` | eines je Version |
| `einsatzbuch-updater` | nur `latest.json`, das Manifest der neuesten Version | **dauerhaft, nie löschen** |

**Warum `einsatzbuch-updater` nie gelöscht wird:** Jede installierte App fragt fest unter
`https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-updater/latest.json` nach
(`plugins.updater.endpoints` in `tauri.conf.json`). Die Adresse ist in jede ausgelieferte Version
einkompiliert. Fehlt das Release, findet keine App mehr ein Update. Zu sehen ist das nur in der
Verwaltung der App unter „Einstellungen“ → „Update“ („Suche nach Updates gescheitert: …“), also
nur, wenn dort jemand nachsieht. Der nächste Release-Lauf legt es zwar neu an, bis dahin steht aber
jede App still. Aus demselben Grund bleiben die Versions-Releases stehen, auf die `latest.json` zeigt:
Das Manifest verweist mit seinen Download-Adressen auf die Dateien dort.

**„Latest“ bleibt die Suite:** Beide Releases entstehen mit `--latest=false`, und die
Suite-Versionierung (`scripts/version.mjs`) zählt nur exakte `vX.Y.Z`-Tags (Runbook
`versionierung.md`). Ein Einsatzbuch-Release verschiebt also weder „Latest“ noch die Nummer der
Suite.

**Das Repository muss öffentlich bleiben.** Der Updater lädt ohne Anmeldung von github.com. Bei
einem privaten Repository scheitert jede Prüfung (Stand 25.09.2026: öffentlich).

**Stand beim Betreiber** (so gemeldet vom koordinierenden Lauf am 25.09.2026, hier nicht geprüft):
Das Schlüsselpaar wurde am 25.09.2026 erzeugt, und die Secrets `TAURI_SIGNING_PRIVATE_KEY` und
`TAURI_SIGNING_PRIVATE_KEY_PASSWORD` sind im Repository gesetzt. Den privaten Schlüssel verwahrt der
Betreiber im Passwortmanager. **Offen vor dem ersten Tag:** Der öffentliche Teil muss noch per PR in
`tauri.conf.json` eingetragen werden (Abschnitt „Updater-Schlüssel“, Schritt „Öffentlichen Teil eintragen“).

## Updater-Schlüssel

Der Updater nimmt nur Pakete an, die mit dem privaten Schlüssel signiert sind, der zum
öffentlichen Schlüssel in der installierten App passt (Minisign). Den privaten Schlüssel verwendet
nur die CI im Schritt `tauri build`. Der öffentliche steht in `tauri.conf.json` und wird in die App
einkompiliert.

### Öffentlichen Teil eintragen (einmalig, vor dem ersten Tag)

**Erledigt am 26.09.2026:** Schlüssel mit der Minisign-Key-ID `A135D2394A754A1D` ist eingetragen. Der private Teil liegt
als Secret `TAURI_SIGNING_PRIVATE_KEY` (samt `…_PASSWORD`) im Repo und beim Betreiber im Passwortmanager. Die Schritte
unten gelten weiter für einen späteren Schlüsselwechsel.


1. Den Inhalt der `.pub`-Datei aus der Erzeugung nehmen (bei der Erzeugung unten
   `~/.tauri/einsatzbuch.key.pub`). Das ist **eine** Zeile Base64, und genau diese Zeile gehört
   unverändert in `plugins.updater.pubkey` in `apps/einsatzbuch/src-tauri/tauri.conf.json`: ohne
   Zeilenumbruch, ohne Leerzeichen, nicht dekodiert.
2. **Nur in `tauri.conf.json` selbst**, weder in `tauri.release.conf.json` noch über `--config`.
   `build.rs` liest nur diese Datei und lehnt jeden Release-Build ab, dessen Schlüssel dort der
   Platzhalter oder kein gültiger öffentlicher Minisign-Schlüssel ist. Der Workflow prüft dasselbe
   vorher im Schritt „Updater-Schlüssel ist kein Platzhalter“.
3. Im selben PR den Test `echte_konfiguration_traegt_heute_den_platzhalter` in
   `apps/einsatzbuch/src-tauri/build_pruefung.rs` anpassen. Er hält den Platzhalter absichtlich
   fest, damit niemand ihn ohne dieses Runbook entfernt. Danach soll er zusichern, dass die echte
   Konfiguration den Riegel im Release-Profil passiert.
4. Tore: in `apps/einsatzbuch/src-tauri` `mise exec -- cargo test --workspace` (vorher
   `pnpm --filter einsatzbuch build`). `tauri build --debug` läuft weiter ohne privaten Schlüssel.

Ist die `.pub`-Datei nicht mehr da, vor dem ersten Release einfach ein neues Paar erzeugen (unten).
Solange keine App ausgeliefert ist, kostet ein Wechsel nichts.

### Neues Schlüsselpaar erzeugen (Erstanlage, Wechsel, Verlust)

```
pnpm --filter einsatzbuch tauri signer generate -w ~/.tauri/einsatzbuch.key
```

Das Kommando fragt zweimal nach einem Kennwort. **Das Kennwort darf nicht leer sein:** Der Workflow
lehnt ein leeres Secret ab, denn Tauri nähme in der CI sonst still ein leeres Kennwort. Es entstehen
`~/.tauri/einsatzbuch.key` (privat) und `~/.tauri/einsatzbuch.key.pub` (öffentlich).

Die Secrets aus einem Checkout des Repositorys setzen, sonst mit `--repo rubenvitt/iuk-suite`:

```
gh secret set TAURI_SIGNING_PRIVATE_KEY < ~/.tauri/einsatzbuch.key
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

Der zweite Aufruf fragt den Wert verdeckt ab. So landet das Kennwort nicht in der Shell-History.
Danach den privaten Schlüssel und das Kennwort im Tresor (Passwortmanager) ablegen, den
öffentlichen Teil eintragen wie oben und die Schlüsseldatei vom Rechner löschen.

**Wenn die Schlüssel nicht zusammenpassen:** `tauri build` warnt dann nur und bricht nicht ab (so
beschrieben, den Wortlaut der Warnung hat hier noch niemand gesehen).
Deshalb prüft `release-veroeffentlichen` im Schritt „Signaturen passen zum Updater-Schlüssel“ jede
`.sig` gegen den öffentlichen Schlüssel aus `tauri.conf.json`, bevor es irgendetwas veröffentlicht.
Passt eine nicht, scheitert der Lauf mit „Signiert mit Schlüssel …, tauri.conf.json nennt aber …“
und dem Verweis auf diesen Abschnitt; es entsteht weder das Versions-Release noch ein neues
`latest.json`. Abhilfe: Das Secret `TAURI_SIGNING_PRIVATE_KEY` (samt Kennwort) auf den privaten
Schlüssel setzen, der zum öffentlichen in `tauri.conf.json` gehört, und den Lauf per „Re-run all
jobs“ wiederholen. Hier ausnahmsweise alle Jobs: Die Pakete müssen neu signiert werden, und
veröffentlicht ist noch nichts (zur Regel „nur Re-run failed jobs“ siehe „Scheitert der Lauf“). Den
öffentlichen Schlüssel nur ändern, wenn noch keine App ausgeliefert ist; sonst gilt der Abschnitt
zum Verlust unten.

**Verlust des privaten Schlüssels:** Installierte Apps kennen nur den öffentlichen Schlüssel, mit
dem sie gebaut wurden, und lehnen jedes Update ab, das mit einem neuen Schlüssel signiert ist. Nach
einem Verlust gibt es also ein neues Paar, eine neue Version mit dem neuen öffentlichen Schlüssel und
auf **jedem** Rechner eine Neuinstallation von Hand (Abschnitte zur Installation). Dasselbe gilt für
einen Wechsel, bei dem die alte Version den neuen Schlüssel nicht kennt.

Ein **geplanter** Wechsel bei vorhandenem altem Schlüssel geht ohne Neuinstallation (nicht
gemessen): Zuerst eine Version ausliefern, die den **neuen** öffentlichen Schlüssel enthält, aber
noch mit dem **alten** privaten signiert ist. Warten, bis jeder Rechner das Update installiert hat. Die Suite zeigt
die installierte Version nicht an, deshalb an jedem Rechner selbst nachsehen. Erst dann die Secrets
auf das neue Paar umstellen.

## Suite-Adresse

Die Adresse der Suite wird beim Release-Build fest in die App eingebaut (`EINSATZBUCH_SUITE_URL`,
eingelesen als `SUITE_VORGABE` in `apps/einsatzbuch/src-tauri/kern/src/anmeldung.rs`). Ein echter
Rechner verbindet sich mit keiner anderen Adresse, und auf der Einrichtungsfrage ist das Feld
„Suite-Adresse“ für ihn nicht änderbar. Ein Testrechner darf eine andere eintragen.

Die Quelle ist die Repository-Variable `EINSATZBUCH_SUITE_URL` (GitHub → Settings → Secrets and
variables → Actions → Variables):

```
gh variable set EINSATZBUCH_SUITE_URL --body https://einsatzbuch.iuk-ue.de
```

Ohne Variable (oder mit leerem Wert) nimmt der Workflow `https://einsatzbuch.iuk-ue.de`, dieselbe
Vorgabe wie im Code. Ein Wert, der nicht mit `https://` beginnt oder Leerzeichen enthält, lässt den
Schritt „Signier-Secrets und Suite-Adresse sind gesetzt“ scheitern. Ein schon eingerichteter
Rechner hat die Adresse bei der Einrichtung gespeichert. Ein Umzug der Suite auf eine andere Adresse
ist in diesem Runbook nicht abgedeckt.

## Tags schützen (einmalig, empfohlen)

Wer Schreibrecht am Repository hat, kann einen Tag löschen oder auf einen anderen Commit
verschieben. Beim Dauer-Release `einsatzbuch-updater` hängt daran jede installierte App (Abschnitt
„Überblick“), bei `einsatzbuch-vX.Y.Z` die Zuordnung von Version und Quellstand. Ein Tag-Ruleset
verhindert beides (nicht gemessen, bei der Einrichtung einmal mit einem Test-Tag ausprobieren):

GitHub → Settings → Rules → Rulesets → „New ruleset“ → „New tag ruleset“:

- Name `einsatzbuch-tags`, Enforcement status „Active“.
- Target tags: „Include by pattern“ `einsatzbuch-*` (deckt `einsatzbuch-updater` und alle
  `einsatzbuch-vX.Y.Z`).
- Rules: „Restrict updates“, „Restrict deletions“ und „Block force pushes“ einschalten.
- **„Restrict creations“ nicht einschalten.** Der Betreiber legt die Versions-Tags an, und der erste
  Lauf von `release-veroeffentlichen` legt `einsatzbuch-updater` über `gh release create --target`
  selbst an. Das Hochladen von `latest.json` mit `--clobber` verschiebt den Tag nicht.

Dasselbe per API:

```
gh api repos/rubenvitt/iuk-suite/rulesets -X POST --input - <<'JSON'
{
  "name": "einsatzbuch-tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/einsatzbuch-*"], "exclude": [] } },
  "rules": [{ "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" }]
}
JSON
```

Das Ruleset schützt den Tag, nicht das Release: `gh release delete einsatzbuch-updater` ginge
weiterhin (ohne `--cleanup-tag` bleibt der Tag stehen). Deshalb gilt „nie löschen“ unverändert.

## Release taggen

1. **Versions-PR.** Dieselbe neue Nummer `X.Y.Z` eintragen in:
   - `apps/einsatzbuch/src-tauri/tauri.conf.json`, Feld `version`
   - `apps/einsatzbuch/package.json`, Feld `version`
   - `apps/einsatzbuch/src-tauri/Cargo.toml`, Abschnitt `[package]`, Feld `version`

   Danach in `apps/einsatzbuch/src-tauri` das Lockfile nachziehen:

   ```
   mise exec -- cargo update -p einsatzbuch --offline
   ```

   Das ändert in `Cargo.lock` genau eine Zeile, die Version der App (gemessen). Ohne diesen Schritt
   bricht jeder Job mit `--locked` ab. `pnpm --filter einsatzbuch test` prüft alle vier Stellen
   (`src/version.test.ts`). Die Kopfzeile des Commits entscheidet über die Nummer der **Suite**
   (Runbook `versionierung.md`). Für einen reinen Versionssprung deshalb
   `chore(einsatzbuch): Version X.Y.Z`, nicht `feat`.

   Die Nummer muss höher sein als jede schon ausgelieferte. Der Updater installiert nur eine höhere
   Version als die installierte.

2. **Tag nach dem Merge**, auf den Merge-Commit auf `main`:

   ```
   git fetch origin
   git tag einsatzbuch-vX.Y.Z <sha>
   git push origin einsatzbuch-vX.Y.Z
   ```

   Der Tag muss genau `einsatzbuch-vX.Y.Z` lauten, also ohne Zusatz wie `-rc1`. Der Workflow prüft
   die Form und die Gleichheit mit den drei Dateien („Tag und Version stimmen überein“) und bricht
   ab, wenn der Commit nicht auf `main` liegt („Tag zeigt auf einen Commit auf main“).

3. **Lauf beobachten:**

   ```
   gh run list --workflow einsatzbuch.yml --branch einsatzbuch-vX.Y.Z
   gh run watch <run-id> --exit-status
   ```

   Der Job `release-bauen` hat je Plattform höchstens 90 Minuten.

4. **Ergebnis prüfen:**

   ```
   gh release view einsatzbuch-vX.Y.Z
   gh release download einsatzbuch-updater --pattern latest.json --output - | jq .version
   gh release view --json tagName --jq .tagName
   ```

   Die zweite Zeile muss `"X.Y.Z"` zeigen. Die dritte zeigt das Release, das GitHub als „Latest“
   führt, und das muss weiterhin ein Suite-Release `vA.B.C` sein, **kein** `einsatzbuch-…`. Steht
   dort doch ein Einsatzbuch-Release, das Suite-Release wieder zu „Latest“ machen:
   `gh release edit vA.B.C --latest`.

**Scheitert der Lauf:** Einen vorübergehenden Fehler (Läufer, Netz) **nur per „Re-run failed
jobs“** wiederholen, **nie per „Re-run all jobs“**, sobald der Lauf schon etwas veröffentlicht hat
(das Release `einsatzbuch-vX.Y.Z` besteht). „Re-run failed jobs“ nimmt die schon gebauten Pakete
dieses Laufs (Artefakte, 7 Tage aufbewahrt) und lädt dieselben Dateien noch einmal hoch.
„Re-run all jobs“ baut dagegen neu, und die neuen Pakete sind nicht bytegleich mit den alten. Sie
ersetzen die Dateien am Versions-Release unter derselben Adresse, während `latest.json` am
Dauer-Release noch die Signaturen der alten Pakete trägt, bis der letzte Schritt durch ist. Scheitert
der Lauf dazwischen, bleibt es dabei. Solange lehnt jede App, die gerade herunterlädt, das Update als
falsch signiert ab. Die einzige Ausnahme steht unter „Wenn die Schlüssel nicht zusammenpassen“: Dort
ist noch nichts veröffentlicht. Sind die Artefakte abgelaufen, die Korrektur mit der nächsten Nummer
ausliefern. Braucht es eine Änderung am Code, den Tag nicht verschieben. Die Korrektur bekommt die
nächste Nummer. Meldet der Lauf „latest.json am Dauer-Release nennt schon …, neuer als …“, lief ein
älterer Tag nach einem neueren. Das Manifest bleibt dann absichtlich, wie es ist.

## Installation unter Windows

1. Vom Release `einsatzbuch-vX.Y.Z` (`https://github.com/rubenvitt/iuk-suite/releases`) die Datei
   `Einsatzbuch_X.Y.Z_x64-setup.exe` herunterladen und ausführen.
2. Die App ist nicht mit einem Windows-Zertifikat signiert. SmartScreen zeigt deshalb „Der Computer
   wurde durch Windows geschützt“. Dann „Weitere Informationen“ und „Trotzdem ausführen“ wählen.
3. Dem Installer folgen. Spätere Updates laufen ohne Rückfragen, nur mit Fortschrittsanzeige
   (`installMode: "passive"`), und starten die App danach neu.

## Installation unter macOS

1. Vom Release `einsatzbuch-vX.Y.Z` die Datei `Einsatzbuch_X.Y.Z_universal.dmg` herunterladen und
   öffnen. Sie läuft auf Apple Silicon und Intel.
2. „Einsatzbuch“ in den Ordner „Programme“ ziehen. **Nicht aus der DMG heraus starten:** Dort kann
   der Updater die App nicht ersetzen.
3. Die App ist nur ad hoc signiert (ohne Zertifikat von Apple, `signingIdentity: "-"` in
   `tauri.release.conf.json`) und nicht notarisiert. Beim ersten Öffnen erscheint deshalb eine
   Warnung, dass macOS die App nicht öffnet. Die Warnung schließen, dann **Systemeinstellungen →
   Datenschutz & Sicherheit** öffnen, im Abschnitt „Sicherheit“ bei „Einsatzbuch“ auf „Dennoch
   öffnen“ klicken und mit Kennwort oder Touch ID bestätigen. Ab macOS 15 umgeht „Öffnen“ per
   Rechtsklick die Sperre nicht mehr, deshalb nur dieser Weg.

   Ohne die Ad-hoc-Signatur meldete macOS auf Apple Silicon stattdessen, die App sei „beschädigt“
   und solle in den Papierkorb; dafür gibt es in den Systemeinstellungen keinen Knopf. Erscheint
   diese Meldung trotzdem (nicht gemessen), im Terminal
   `xattr -dr com.apple.quarantine /Applications/Einsatzbuch.app` ausführen und die App erneut
   öffnen. Das entfernt nur die Download-Markierung dieser einen App.

## Einrichtung als echter Rechner oder Testrechner

Wer einrichtet, braucht in der Suite Zugang zur Verwaltung des Einsatzbuchs.

1. **Einrichtungsfrage.** Beim ersten Start fragt die App „Diesen Rechner einrichten“:
   - „Echter Einsatzbuch-Rechner“: Genau ein Rechner führt die echte Einsatzkette. Die
     „Suite-Adresse“ ist fest (Abschnitt „Suite-Adresse“).
   - „Testrechner“: Er hat eine eigene Testdatenbank und einen eigenen Schlüssel, und die
     Suite-Adresse ist frei. Die App zeigt dauerhaft das Band „TESTBETRIEB — nichts hiervon ist ein
     echter Einsatz“.

   Dazu kommt der „Name des Rechners“, zum Beispiel das Fahrzeug. Dann „Mit Pocket ID anmelden und
   einrichten“ wählen.
2. **Anmeldung in der Suite.** Der Browser öffnet die Anmeldung der Suite, und die App wartet auf die
   Rückkehr.
3. **Ersetzen-Frage** (nur echt). Gibt es schon einen echten Rechner, fragt die Suite „Echten Rechner
   ersetzen?“. „Ersetzen“ widerruft den bisherigen: Er kann danach weder Stammdaten holen noch Anker
   melden. „Abbrechen“ lässt alles, wie es war.
4. **Autostart und Sicherung** (nur echt). Auf der Startseite „Verwaltung · Anmelden“ und „Mit
   Pocket ID anmelden“ wählen, dann in der Karte „Einstellungen“:
   - „Automatische Sicherung“ → „Ordner wählen“ und einen Ordner außerhalb des Rechners bestimmen.
   - „Autostart“ → „Beim Anmelden am Rechner starten“ einschalten.

   Danach „Sitzung sperren“. Solange jemand angemeldet ist, installiert die App kein Update.
5. **Kontrolle in der Suite.** Unter Einsatzbuch → „Rechner“ steht der Rechner mit „Letzter
   Kontakt“, ein echter nach der ersten Sicherung auch mit „Letzte Sicherung“.

## Update

- Nur die Release-Fassung prüft auf Updates, ein Entwicklerbuild nie. Die erste Prüfung kommt etwa
  30 Sekunden nach dem Start, danach alle 6 Stunden. Nach einer gescheiterten Prüfung, etwa ohne
  Netz, und nach einem gescheiterten Herunterladen oder Installieren versucht die App es nach
  15 Minuten erneut.
- Eine neuere Version wird zunächst nur **vorgemerkt**. Installiert wird sie erst, wenn kein
  Einsatz aussteht, niemand in der Verwaltung angemeldet ist, keine Anmeldung läuft und seit
  15 Minuten niemand an einem Entwurf geschrieben hat. Die App prüft das jede Minute, vor und nach
  dem Herunterladen. Ein Entwurf, der länger unverändert liegt, hält das Update nicht auf: Er
  übersteht den Neustart. Der Neustart nach der Installation wartet ebenfalls auf einen solchen
  ruhigen Moment.
- Wer in der Verwaltung angemeldet ist, sieht unter „Einstellungen“ → „Update“ den Hinweis „Update
  auf X.Y.Z ist vorgemerkt“. Genau diese Anmeldung hält das Update aber auf. Nach „Sitzung sperren“
  (oder 10 Minuten ohne Eingabe) installiert die App innerhalb etwa einer Minute, sofern nichts
  aussteht und kein Entwurf in Arbeit ist.
- **Früher prüfen lassen:** Die App beenden und neu starten. Das zieht nur die Prüfung auf etwa
  30 Sekunden nach dem Start vor. Die Regeln für die Installation gelten weiter, erzwingen lässt
  sich nichts.
- Unter Windows beendet der Installer die App selbst und startet sie danach neu.
- Scheitert die Installation (etwa an einer falschen Signatur), verwirft die App die Vormerkung und
  merkt bei der nächsten Prüfung, 15 Minuten später, neu vor.
- **Fehler sehen:** Eine Release-Fassung schreibt kein Log, das man einsehen könnte. Den letzten
  Fehler zeigt die Verwaltung der App unter „Einstellungen“ → „Update“, zum Beispiel „Suche nach
  Updates gescheitert: …“ oder „Update auf X.Y.Z nicht installiert: Die Signatur des Updates passt
  nicht zum Schlüssel dieser App.“ Ein Fehler beim Installieren bleibt dort stehen, bis ein Update
  gelingt oder keine neuere Version mehr angeboten wird; ein Fehler der Suche nur bis zur nächsten
  gelungenen Suche. Die Signatur-Meldung heißt: Das Update ist mit einem anderen Schlüssel signiert,
  als diese App kennt (Abschnitt „Updater-Schlüssel“).

## Rücksetzen

### Älteres Release installieren

Eine schlechte Version auf einem Rechner durch eine ältere ersetzen:

1. **Zuerst die Datenbank prüfen.** Eine ältere App verweigert eine Datenbank, die eine neuere
   Version schon auf ein höheres Schema gehoben hat, und zeigt dann nur einen Startfehler.
   Rücksetzen geht nur, wenn `SCHEMA_VERSION` in `apps/einsatzbuch/src-tauri/kern/src/buch.rs` bei
   beiden Tags gleich ist:

   ```
   git show einsatzbuch-vA.B.C:apps/einsatzbuch/src-tauri/kern/src/buch.rs | grep 'const SCHEMA_VERSION'
   git show einsatzbuch-vX.Y.Z:apps/einsatzbuch/src-tauri/kern/src/buch.rs | grep 'const SCHEMA_VERSION'
   ```

2. Den Installer der älteren Version wie bei der Erstinstallation ausführen (Windows) bzw. die ältere
   App aus ihrer DMG nach „Programme“ ziehen und die vorhandene ersetzen (macOS). Wie der Windows-
   Installer auf eine schon installierte neuere Version reagiert, ist nicht gemessen.
3. Ohne den nächsten Schritt bietet der Updater die neueste Version nach spätestens 6 Stunden
   wieder an und installiert sie.

### latest.json des Dauer-Release zurücksetzen

Damit die schlechte Version keinem Rechner mehr angeboten wird, das Manifest einer älteren Version
an das Dauer-Release legen. Jedes Versions-Release trägt sein eigenes `latest.json`:

```
tmp="$(mktemp -d)"
gh release download einsatzbuch-vA.B.C --pattern latest.json --dir "$tmp"
jq .version "$tmp/latest.json"
gh release upload einsatzbuch-updater "$tmp/latest.json" --clobber
```

`jq` muss `"A.B.C"` zeigen, bevor das Hochladen läuft. Der Workflow schreibt nie ein älteres
Manifest, deshalb ist das Handarbeit. Dabei gilt:

- Das Rücksetzen stuft keinen Rechner herunter. Wer die schlechte Version schon hat, behält sie, bis
  er per Installer zurückgesetzt wird oder eine höhere Version kommt.
- Die Korrektur bekommt eine **höhere Nummer als die schlechte Version**, sonst erreicht sie die
  Rechner nicht, die schon auf der schlechten Version sind.
- **Den Lauf des schlechten Tags danach nie wiederholen.** Die Sperre im Workflow hält nur ein
  Manifest auf, das älter als das vorhandene ist. Die schlechte Version ist neuer als `A.B.C` und
  stünde nach einem „Re-run“ wieder im Manifest.

### Testbetrieb beenden

Auf der Startseite des Testrechners „Testbetrieb beenden“ wählen und im Dialog „Testbetrieb beenden?“
mit „Testdatenbank löschen“ bestätigen. Die lokale Testdatenbank mit allen Testeinsätzen ist danach
weg, und die App steht wieder bei „Diesen Rechner einrichten“. Ist dabei jemand in der Verwaltung
angemeldet, löscht die App auch den Test-Rechner in der Suite. Sonst in der Suite unter „Rechner“ →
„Test-Rechner löschen“ → „Endgültig löschen“. Nach einem Widerruf bietet der Hinweis dafür den
Knopf „Testbetrieb beenden und neu einrichten“.

### Echte Einrichtung nach Widerruf

In der Suite unter „Rechner“ → „Rechner widerrufen“ → „Widerrufen“. Der Rechner kann danach weder
Stammdaten holen noch Anker melden, versiegelt aber weiter. Die App zeigt „Rechner muss neu
eingerichtet werden.“:

- **Derselbe Rechner** macht weiter: Mit „Neu einrichten“ meldet er sich wieder an. Art, Name,
  Suite, Kette und Schlüssel bleiben erhalten.
- **Ein anderer Rechner** übernimmt: Ihn als „Echter Einsatzbuch-Rechner“ einrichten. Ist der alte
  noch nicht widerrufen, fragt die Suite „Echten Rechner ersetzen?“. Die Einsätze kommen über die
  Sicherung auf ihn (nächster Abschnitt).

### Wiederherstellen aus der Sicherung

Das passiert in der Verwaltung der App, nicht in der Suite: Anmelden, dann in der Karte
„Einstellungen“ „Aus Sicherung wiederherstellen“ → „Datei wählen“ und die Sicherungsdatei aus dem
Sicherungsordner des alten Rechners wählen. Der Knopf erscheint nur, wenn diese Bedingungen gelten:

- Der Rechner ist echt.
- Jemand ist angemeldet.
- Auf dem Rechner ist noch kein Einsatz versiegelt.

Übernommen wird die Sicherung nur, wenn ihre Kette in sich stimmt und den Anker enthält, den die
Suite für diese Kette kennt.

## Was in diesem Runbook NICHT vorkommt

- **Signierung durch Apple oder mit einem Windows-Zertifikat.** macOS ist nur ad hoc signiert.
  Deshalb die Warnungen bei der Installation.
- **MSI-Pakete und Linux.** Ausgeliefert werden nur NSIS für Windows x64 und das universelle
  macOS-Bundle.
- **Ein Umzug der Suite auf eine andere Adresse** für schon eingerichtete Rechner.
