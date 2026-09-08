# Runbook — Versionsnummern und GitHub-Releases

Jeder Stand auf `main`, der ein Image ergibt, bekommt eine Versionsnummer `X.Y.Z`, einen
Git-Tag `vX.Y.Z`, ein GitHub-Release und ein Image-Tag `ghcr.io/rubenvitt/iuk-suite:X.Y.Z`.
Nichts davon ist Handarbeit. Was Handarbeit ist, steht in Teil E.

Beteiligte Dateien, in Reihenfolge der Kette:

| Datei | Rolle |
|---|---|
| `scripts/version.mjs` | rechnet die Nummer aus der Historie |
| `.github/workflows/ci.yml`, Job `version` | ruft das Skript, gibt `version` und `basis` aus |
| `.github/workflows/ci.yml`, Jobs `build` und `merge` | Build-Arg `SUITE_VERSION`, Image-Tag `:X.Y.Z` |
| `Dockerfile` | `ARG`/`ENV SUITE_VERSION` in der Runner-Stage |
| `src/core/version.ts` | `laufendeVersion()` |
| `src/app/api/health/[modul]/route.ts` | Feld `version` neben `revision` |
| `src/app/m/portal/profil/page.tsx` | Kasten „Diese Suite" auf der Profilseite |
| `.github/workflows/ci.yml`, Job `release` | Tag `vX.Y.Z` und GitHub-Release |

`scripts/deploy.test.ts` und `scripts/version.test.ts` halten die Kette zusammen.

---

# Teil A — Die Regel

**Die Nummer folgt aus der Historie seit dem letzten Tag `vX.Y.Z`, Schritt für Schritt.**
Ein Schritt ist ein Eintrag auf der First-Parent-Kette von `main`: ein Merge-Commit eines
PRs oder ein direkter Push. Jeder Schritt ist ein Sprung, und der Sprung ist der größte
über alle Commits, die der Schritt mitbringt (bei einem Merge die Commits des PRs):

| Commit-Nachricht | Sprung | Beispiel |
|---|---|---|
| `feat!:` / `fix(core)!:` / Fußzeile `BREAKING CHANGE:` | Major | 1.4.2 → 2.0.0 |
| `feat:` / `feat(modul):` | Minor | 1.4.2 → 1.5.0 |
| alles andere (`fix`, `docs`, `test`, `build`, ohne Präfix) | Patch | 1.4.2 → 1.4.3 |

Nur die **Kopfzeile** trägt den Typ. Ein `feat:` im Rumpf zählt nicht, `BREAKING CHANGE:`
zählt nur am Zeilenanfang einer Rumpfzeile.

Drei Folgen, die man kennen sollte:

* **Auch ein Doku- oder Dependabot-Merge ist eine Version.** Er ergibt ein Image, und ein
  Image ohne Nummer wäre wieder nur ein Commit-SHA. Der kleinste Sprung ist Patch.
* **Ein PR mit drei `feat`-Commits ist EIN Minor-Sprung**, nicht drei: der Schritt ist der
  Merge, nicht der Einzelcommit. Wer drei Nummern will, mergt drei PRs.
* **Lücken sind ehrlich.** Scheitert ein Lauf vor dem Tag (roter Build, roter Smoke), bleibt
  seine Nummer unbesetzt; der nächste Stand rechnet den gescheiterten Schritt mit und
  bekommt die übernächste Nummer. Eine fehlende Nummer heißt: dieses Image gab es nie.

**Solange es keinen Tag gibt, rechnet das Skript vom Anker aus:** einem fest
eingetragenen Commit (`ANKER` in `scripts/version.mjs`, der `main`-Stand, auf dem die
Versionierung gemergt wurde), der als `1.0.0` gilt. Das ist dasselbe wie ein Tag `v1.0.0`
auf diesem Commit, und der erste `main`-Lauf danach wird deshalb `1.0.1` oder `1.1.0`, je
nach Sprung — nicht `1.0.0`. Zwei gleichzeitige Läufe vor dem ersten Tag bekommen so
verschiedene Nummern. Ab dem ersten echten Tag ist der Anker ohne Wirkung und darf
entfernt werden.

**Nur exakte `vX.Y.Z`-Tags zählen.** Ein `v2`, `v1.2`, `v1.2.3+build` oder `v2.0.0-rc1`
wird übergangen, auch wenn er näher an `HEAD` liegt. Die Basis ist der nächste passende
Tag; bei zwei passenden auf demselben Commit der höhere.

`package.json` bleibt auf seiner alten Nummer und ist **nicht** die Quelle der Wahrheit.
Der Tag auf `main` ist es. Kein Bot-Commit, keine Datei, die nachgezogen wird.

---

# Teil B — Was bei jedem main-Lauf passiert

| Job | Schritt |
|---|---|
| `version` | `node scripts/version.mjs` mit voller Historie; Nummer in die Zusammenfassung des Laufs |
| `build` | `SUITE_VERSION=<Nummer>` als Build-Arg, in beiden Build-Schritten |
| `merge` | Manifest-Liste bekommt zusätzlich das Tag `:<Nummer>` — außer es existiert in der Registry schon (wiederholter oder überholter Lauf): dann bleibt `:<Nummer>` auf seinem ersten Digest, geprüft im Moment der Veröffentlichung |
| `release` | rechnet die Basis frisch (volle Historie), prüft, dass `v<Nummer>` noch nicht woanders existiert; legt Tag und Release an |
| `deploy` | unverändert; die Zusammenfassung nennt die Nummer aus `/api/health/portal` |

Warum die Nummer **vor** dem Build feststeht, der Tag aber erst **nach** `merge` entsteht:
das Image braucht die Nummer, und ein Tag vor dem Build stünde für ein Image, das es bei
einem roten Build nie gab. Beides zusammen geht nur, weil die Nummer aus der Historie folgt
und nicht aus dem Tag — `scripts/version.test.ts`, Fall „mit oder ohne Zwischentag dasselbe".

**Zwei Läufe kurz nacheinander kollidieren nicht.** Der spätere hat einen Schritt mehr in
seiner Historie und rechnet zwangsläufig eine andere Nummer, unabhängig davon, ob der
frühere seinen Tag schon gesetzt hat. `deploy` hängt nicht an `release`: scheitert der Tag
doch einmal (F2), läuft der Rollout trotzdem, und das Image trägt die Nummer.

Auf einem **PR** rechnet `version` dieselbe Nummer und schreibt sie nur in die
Zusammenfassung — so sieht man vor dem Merge, was er auslöst. `release` läuft dort nicht.

---

# Teil C — Wo die Nummer steht

* **In der App:** Nutzermenü oben rechts → Profil → Kasten „Diese Suite". Lokal und in
  einem Image ohne Build-Arg steht dort „Entwicklungsstand, keine Versionsnummer".
* **Von außen:** `curl -s https://iuk-ue.de/api/health/portal` → `"version":"1.4.2"`
  neben `"revision":"<commit>"`.
* **GitHub:** Releases-Seite; jedes Release nennt Image und Commit und listet die seit dem
  vorigen Tag gemergten PRs (GitHubs eigene Notizen, nach PR-Titeln — deshalb lohnt ein
  sprechender PR-Titel).
* **Registry:** `ghcr.io/rubenvitt/iuk-suite:1.4.2`, gleichwertig zu `:sha-…` und `:latest`.

Die Nummer ist **für Betreiber**. In den Neuigkeiten für Anwender kommt sie nicht vor
(`CLAUDE.md`, „Release Notes"), und der Rollout beweist weiterhin über die Revision.

---

# Teil D — Rollback auf eine Version

Derselbe Handgriff wie in `auto-rollout.md`, Teil D2 — nur mit lesbarem Ziel:

```bash
cd $SUITE_STACK_DIR
# Welcher Commit gehört zur Version? (aus dem Release oder aus dem Repo)
git -C /pfad/zum/repo rev-parse v1.3.0^{commit}

SUITE_STACK_DIR=$PWD SUITE_IMAGE_TAG=1.3.0 SUITE_REVISION_ERWARTET=<dieser Commit> \
  /pfad/zum/repo/scripts/deploy.sh
```

`deploy.sh` zieht dann `:1.3.0`, prüft die Revision und pinnt den Digest — mit allen
Sicherungen des normalen Rollouts. Die Warnung aus `auto-rollout.md` gilt unverändert:
**ein Image-Rollback holt keine Daten zurück**, Migrationen laufen nur vorwärts.

---

# Teil E — Handarbeit, die bleibt

* **Commit-Präfixe setzen.** Der Typ der Kopfzeile bestimmt den Sprung. Ein `feat`, das als
  `fix` eingecheckt wird, ist ein Patch; ein vergessenes `!` ist ein Minor statt Major. Es
  gibt kein Tor dafür — die Nummer ist dann kleiner als sie sein sollte, nicht falsch.
* **PR-Titel sprechend halten.** Sie sind die Zeilen im GitHub-Release.
* **Eine Vorabversion taggen** (`v2.0.0-rc1`): möglich, wird von der Rechnung übergangen
  (`--exclude "*-*"`). Der nächste `main`-Lauf rechnet weiter von `v1.x` aus.

---

# Teil F — Fehlerbilder

### F1 — `version` rot: „Kein Versionstag … und der Anker … ist kein Vorfahr"

Weder ein Tag `vX.Y.Z` noch der Anker-Commit liegen in der Historie des Checkouts. Zwei
Ursachen: die Historie ist unvollständig (`fetch-depth: 0` am Job prüfen,
`scripts/deploy.test.ts` hält es fest; von Hand `git fetch --unshallow --tags`) — oder sie
wurde umgeschrieben (Force-Push auf `main`, oder ein fremder Klon ohne diese Historie).
Im zweiten Fall einen Tag `vX.Y.Z` von Hand auf den gewünschten Stand setzen; ab dann
zählt der Tag, nicht der Anker.

### F2 — `release` rot: „Tag vX.Y.Z existiert bereits und zeigt auf … statt auf …"

Vorweg: ein Tag, der schon auf **denselben** Commit zeigt, ist kein Fehler — dann war es ein
wiederholter Lauf (`workflow_dispatch` auf `main`, „Re-run all jobs"), und `release` endet
grün mit „wiederholter Lauf, nichts zu tun". Rot wird es nur, wenn der Tag **woanders**
hinzeigt. Dafür zwei Erklärungen, in dieser Reihenfolge prüfen:

1. **Die Historie wurde umgeschrieben** (Force-Push auf `main`, ein Tag von Hand gesetzt).
   Dann rechnet das Skript von einem Tag aus, der nicht mehr auf der Kette liegt, oder eine
   Nummer ist vergeben. `git log --first-parent --oneline v<basis>..main` zeigt die Schritte;
   `git tag -l 'v*' --contains` die Lage der Tags.
2. **Ein Tag von Hand mit derselben Nummer.** Tag löschen oder umbenennen, Lauf wiederholen
   (`Re-run failed jobs` — der Job rechnet nicht neu, `version` steht als Ausgabe fest).
3. **Ein Tag von Hand auf einem Zweig-Commit**, der nie auf `main` lag (etwa `v2.0.1` auf
   einem Patch-Zweig). Er zählt nicht als Basis, belegt den Namen aber. Diesen Fall fängt
   schon der Job `version` ab („Die errechnete Nummer … ist schon vergeben"), also **vor**
   dem Build — es entsteht kein Image mit dieser Nummer. Tag entfernen oder umbenennen,
   Lauf wiederholen.

Verwandt: „Das Image trägt X, die Historie ergibt jetzt Y" in `release` heißt, dass sich
zwischen `version` und `release` ein Tag auf der Kette geändert hat. Das ist dieselbe
Ursache 1, nur später bemerkt; der Rollout läuft trotzdem, das Image trägt X.

Der Rollout ist davon nicht betroffen (`deploy` hängt nicht an `release`); das Image trägt
die Nummer schon.

### F3 — Profilseite zeigt „Entwicklungsstand" in Produktion

Das Build-Arg fehlt im Image. `docker image inspect <image> -f '{{.Config.Env}}'` muss
`SUITE_VERSION=…` enthalten. Fehlt es: `ci.yml` (beide Build-Schritte) und `Dockerfile`
prüfen — `scripts/deploy.test.ts` müsste rot sein; ist er grün, ist das Image älter als die
Versionierung.

### F4 — Nummer springt weiter, als der Merge rechtfertigt

Der Schritt bringt mehr Commits mit als gedacht: ein Merge von `main` in den PR-Zweig zählt
**nicht** doppelt (`scripts/version.test.ts`), aber ein Rebase auf eine alte Basis oder ein
Squash mit `feat!`-Rumpf sehr wohl. `git log <merge>^1..<merge> --format=%s` zeigt, was das
Skript gesehen hat; `node scripts/version.mjs <commit>` die Herleitung.
