# Plan 3 von 5 · Generalprobe und Verifikation ohne Parallelfenster — Umsetzungsplan (Spec 2, Kapitel 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/runbooks/radio-cutover.md` bekommt die Abschnitte, mit denen der Import nach `radio`
**vor** dem Cutover-Abend vollständig geprobt und gegen einen ephemeren Container ohne
Traefik-Labels verifiziert wird — obwohl die Endadresse `radio.iuk-ue.de` schon vom Alt-Kiosk
besetzt ist und es deshalb **kein Parallelfenster** gibt.

**Architecture:** Dieser Planteil erzeugt **keinen Code**. Er erzeugt **fünfzehn Runbook-Abschnitte**,
je Aufgabe einen, in der Reihenfolge, in der sie am Abend der Generalprobe gelesen werden: Eingaben →
Vorbedingungen → Schnappschuss → Vorabfragen → Wegwerf-Import → Gegenzählungen → Feldstichproben →
Zeitstempelprobe → Prüfcontainer → kopfgestützter Prüfsatz → browsergestützter Prüfsatz → Log →
Aufräumen → Abbruchpunkt → Übergabe an das Fenster. Die tragende Mechanik ist an **zwei** Stellen
konzentriert und alles andere hängt daran: (1) der Modul-Host wird über `SUITE_HOST_RADIO` und einen
vorgetäuschten `Host`-Kopf aufgelöst (`src/core/registry.ts:225-232`), (2) das Wegwerf-`DATA_DIR`
trennt die Probe physisch vom produktiven Volume (`src/core/db/index.ts:6-10`).

**Tech Stack:** Docker / Docker Compose · SQLite (`sqlite3`, better-sqlite3, WAL) · Next.js 16
standalone-Image `ghcr.io/rubenvitt/iuk-suite` · `curl` · bash (nicht fish) · Chromium oder Firefox

**Spec:** `docs/superpowers/specs/2026-08-18-radio-cutover-design.md`, Kapitel 3 (Zeilen 2272–3053),
Rahmen (1–561), Anhänge (4880–4914)

**Zieldatei aller Aufgaben:** `docs/runbooks/radio-cutover.md`

---

## Global Constraints

- **Dieser Planteil schreibt ein RUNBOOK, keinen Code.** Es entsteht keine `.ts`-Datei, kein Test,
  kein Commit an `src/`. Der Prüfschritt jeder Aufgabe ist deshalb **nicht** `pnpm vitest run`,
  sondern das Dreier-Tor aus dem nächsten Punkt.
- **Das Dreier-Tor. Jede Aufgabe ist genau dann angenommen, wenn alle drei Zeilen gelten:**
  1. **Jeder Befehl ist kopierbar** — in eine `bash`-Zeile einfügbar, ohne Umbau, ohne Auflösen einer
     Verschachtelung, ohne dass eine Variable aus einem anderen Abschnitt stillschweigend gesetzt sein
     muss (steht sie dort, wird sie **im Abschnitt selbst noch einmal gesetzt oder namentlich als
     Voraussetzung genannt**).
  2. **Jeder Platzhalter trägt seine Nummer** — `⬜ L<n>`, `E<n>`, `U<n>` oder `N<n>`, unmittelbar
     daneben, nicht in einer Fußnote.
  3. **Jeder Abbruchpunkt nennt seinen Rückweg** — was rot bedeutet und was danach zu tun ist, als
     Satz und nicht als Adjektiv.
- ⚠️ **Platzhalter in einem Runbook-Befehl sind Pflicht, Platzhalter in der Planprosa sind verboten.**
  `<port>`, `<id>`, `<E1>` in einer `curl`-Zeile sind die Hausform (`files-cutover.md:75-78`,
  `lagerbuch-cutover.md:197`) und **richtig**, solange sie ihre Nummer tragen. „TBD", „analog zu
  Aufgabe N", „Fehlerbehandlung ergänzen", „siehe oben" in **diesem** Plandokument sind es nicht:
  die Umsetzerin sieht immer nur ihre eigene Aufgabe.
- **Betriebswerte werden nicht erfunden** (`files-cutover.md:57-58`). Wo eine Zahl, ein Name oder ein
  Pfad erst der Bau oder der Server hergibt, steht die benannte Leerstelle — nie ein plausibel
  aussehender Beispielwert. Der Präzedenzfall ist vernarbt: die `lagerbuch`-Spec verlangte ein
  `cookies().delete()` in einer Server Component, wo es **wirft**.
- **Alle Blöcke sind `bash`.** Die Shell des Betreibers ist `fish` und kennt weder `for … do … done`
  noch diese `$( )`-Verschachtelungen (Spec 2 §3.1.2). Der erste Satz des Runbooks unter der
  Ablaufüberschrift lautet deshalb: **vorher einmal `bash` starten.**
- **Ein `§` ohne Präfix meint immer Spec 2.** Jeder Verweis in
  `docs/superpowers/specs/2026-08-17-radio-modul-design.md` trägt in diesem Plan und im Runbook das
  Präfix **`Spec 1 §…`** — ausnahmslos. (Re-Kritik RK-A5, dritter Block: elf blanke Verweise, sechs
  davon kollidieren mit Spec 2s eigener Nummerierung.)
- **Zeilenverweise auf Code stehen als `datei:zeile`**, nie als „siehe dort".
- **Kommandos in diesem Plan tragen `rtk`** (`rtk git add`, `rtk git commit`) — Hausform des jüngeren
  Plans (`docs/superpowers/plans/2026-08-15-aufgaben-koordination-aus-gruppe.md:35-36`).
- **Abschnittsmarken.** Dieser Planteil belegt in `docs/runbooks/radio-cutover.md` die Marken
  **§G0 bis §G14**. Sie sind **vorläufig**: die Zusammenführung der fünf Planteile vergibt die
  endgültigen §-Nummern. Deshalb trägt jeder Querverweis **zusätzlich** die Aufgabennummer dieses
  Plans (`§G7 / Aufgabe 8`), damit eine Umnummerierung keine Verweiskette bricht.
- **Zwei Abschnitte gehören anderen Planteilen und werden hier nur namentlich adressiert:**
  `§A` (die dreizehn Vorabfragen A1–A13, Kapitel 2) und `§I` (der Importer und seine Aufrufform,
  Kapitel 1). Wo dieser Plan sie braucht, verweist er **innerhalb derselben Datei** — mit der
  Begründung der Hausform: „Der vollständige Wortlaut jeder Zeile steht in §16.2 — dort und nur dort,
  damit es eine Fassung gibt und nicht zwei" (`lagerbuch-cutover.md:365-366`).
- **Die Reihenfolge der Aufgaben ist die Lesereihenfolge des Runbooks, aber keine Ausführungsordnung
  für die Umsetzerin.** Sie darf sie in beliebiger Reihenfolge schreiben; jede Aufgabe nennt in
  „Schnittstellen" vollständig, was sie voraussetzt.

---

## Die Leerstellen dieses Planteils

**Sie stehen vorn, nicht in einer Fußnote.** Jede Zeile ist eine **Ablesung**, keine Entscheidung.
Die Spalte „blockiert" nennt die Aufgabe dieses Plans, die ohne den Wert nicht ausführbar ist — nicht
die, in der der Wert nur erwähnt wird.

| Nr. | Was abzulesen ist | Quelle | Blockiert |
|---|---|---|---|
| ⬜ **L4** | `select count(*) from __drizzle_migrations;` in `radio.db` gegen die Zahl der Einträge in `src/app/m/radio/_db/migrations/meta/_journal.json` | Bau | Aufgabe 6 (§G5) |
| ⬜ **L5** | **reduziert, siehe unten** — der **Sollwert** des `revision`-Feldes von `/api/health/radio` | §4.2 Nr. 1 (Protokollzeile des ersten Deploys) | Aufgabe 10 (§G9), V3 |
| ⬜ **L6** | Die genaue **Abschlusszeile** von `scripts/import/radio.ts` samt Exit-Code | Bau | Aufgabe 5 (§G4) |
| ⬜ **L7** | Der vollständige `Location`-Kopf der `/admin`-Weiterleitung (307 oder 302, Protokoll, Host) | Bau / Abruf | Aufgabe 10 (§G9), V2 |
| ⬜ **L8** | Was `GET /m/radio` mit `Host: iuk-ue.de` liefern **soll** — 404 aus dem Host-Riegel oder eine gerenderte Fläche | Bau (Spec 1 §1.2 entscheidet es) | Aufgabe 10 (§G9), V7 — **abgelesen und protokolliert wird in jedem Fall** |
| ⬜ **L9** | Ob `/` oder `/t/<code>` doch eine **kamerabasierte** Fläche trägt | Bau | Aufgabe 11 (§G10) — Zweigwahl, nicht Blockade |
| ⬜ **L10** | Die Zeichenkette aus dem modul-eigenen Ausleih-Rahmen (Spec 1 §4.2), die im **Portal**-HTML nicht vorkommt | Bau | Aufgabe 10 (§G9), Portal-Fallback-Probe |
| **E2** | Der echte Volume-Name von `radio-admin` | Server | Aufgabe 3 (§G2) |
| **U8** | Volumengröße und Dump-Dauer beider Stacks | ⚠️ **entsteht HIER**, siehe „Zusagen" | — (Ausgabe, nicht Eingabe) |
| ⬜ **N4** | *neu* — der Pfad der `sw.js`-Route unter `src/app/m/radio/`, und damit die interne Form der URL (`/m/radio/sw.js`). Gebraucht für die **korrigierte** Fremdhost-Probe V6 | Bau, Spec 1 §7.1.3 | Aufgabe 10 (§G9), V6 |
| ⬜ **N3** | *neu* — die numerische Kennung, unter der der **produktive** Suite-Dienst läuft (`SUITE_USER` aus der Server-`.env` bzw. `docker compose config`), gegen die Kennung aus dem Image | Server | Aufgabe 5 (§G4), Aufgabe 9 (§G8) |

**Zu ⬜ L5 — eine begründete Reduktion, kein stilles Streichen.** Die ⬜-Tabelle des Rahmens
(Spec 2:185) verlangt „welches Feld den Modulnamen und welches den DB-Zugriff belegt" und nennt als
Quelle „Bau". **Beides ist heute im Repo lesbar und hängt an keiner radio-Bauform**, denn die Route
ist generisch:

* `src/core/health/index.ts:4-15` — `checkModuleHealth(key)` liefert
  `{ status: "ok" | "error", module: key, error?: string }`; `module` (`:10`) trägt den **Modulnamen**,
  und `status: "ok"` entsteht **erst nach** `openModuleDatabase(moduleDbPath(key))` plus
  `db.prepare("SELECT 1").get()` (`:8-9`) — das ist der **DB-Zugriff**.
* `src/app/api/health/[modul]/route.ts:23-26` — hängt `revision: laufendeRevision()` an und setzt
  `200` bzw. `503`.
* ⚠️ Der in Spec 2:185 zitierte Beleg `route.ts:11-18` zeigt **nicht** auf die Antwortform, sondern
  mitten in den Kommentarblock „BEWUSST NUR HIER UND NICHT IN `/api/health` …".

**Offen bleibt allein der WERT von `revision`** — und den liefert §4.2 Nr. 1 als Protokollzeile.
Dieser Planteil schreibt die Feldnamen deshalb wörtlich aus und führt L5 nur noch in dieser einen,
reduzierten Bedeutung. ⚠️ **Die ⬜-Tabelle des Rahmens ist nicht die Datei dieses Planteils** — die
Änderung wird der Zusammenführung **gemeldet** (siehe „Was dieser Planteil zusagt", Punkt 7) und
nicht eigenmächtig vollzogen.

**Was diesen Planteil ausdrücklich NICHT blockiert — damit die Zusammenführung nicht doppelt zählt:**

| Nicht blockierend | Warum |
|---|---|
| **E1** (Gruppenname für `SUITE_ADMIN_GROUP_RADIO`) | Die Generalprobe setzt `radio-verwaltung-gp`, einen frei erfundenen Wert, und das ist **richtig**: `AUTH_DEV_LOGIN` nimmt Gruppen als freies Feld an (`src/core/registry.ts:137`, `src/core/auth/devLogin.ts:10-11` — „force on (**even in production**)"). E1 blockiert die `.env` des Fensters (§4.4), nicht die Probe |
| ⬜ **L13 / L14** | Containername, Loopback-Port und die Frage „darf ein zweiter bootender Container auf `suite_data`?" gehören zu **§4.5 Schritt 8**. Die Generalprobe bootet gegen ein Wegwerf-Verzeichnis, auf dem kein zweiter Prozess hängt |
| ⬜ **L11 / L12** | Manifest-Abruf und Browser-Ablesepunkt nach dem Umschwenk — Kapitel 4 (§4.6, §4.7.2) |
| ⬜ **L1 / L2 / L3** | Typaliase, Treiberverpackung und Paritätssichten — Kapitel 1 |
| **C.6 / B4** (Updater-Rechtestufe) | Fachlich blockierend und **bewusst geparkt**. Fällt sie auf „zwei Rollen", kommt eine sechste Boot-Prüfung und eine sechste Env-Zeile hinzu — die Probe ist mit **einer** Rolle vollständig fahrbar, und die Env-Liste in §G8 bekommt dann eine Zeile, keinen neuen Abschnitt |

---

## Aufgabe 1 — §G0: Eingaben und Ablesungen der Generalprobe

Der Abschnitt, der alle Platzhalter dieses Kapitels an genau **einer** Stelle sammelt. Vorbild:
`files-cutover.md:39-58` (`| # | Wert | Eingetragen | Ohne ihn |`) — eine Tabelle, deren Spalte
„Eingetragen" **leer bleibt**, bis jemand einen echten Wert hineinschreibt.

**Dateien:**
- Anlegen: `docs/runbooks/radio-cutover.md` — **nur falls die Datei fehlt**, mit dem Kopf aus
  Schritt 1; sonst wird ausschließlich der Abschnitt §G0 ergänzt.
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G0 — Eingaben und Ablesungen der
  Generalprobe`, unmittelbar vor §G1)
- Test: das Dreier-Tor aus „Global Constraints", geprüft in Schritt 4.

**Schnittstellen:**
- Verbraucht: nichts (erste Aufgabe dieses Planteils).
- Liefert an **alle** übrigen Aufgaben dieses Planteils die Platzhalternamen, zeichengleich:
  `$IMG` · `$GP` · `$UID_APP` · `$GID_APP` · `<N3-kennung>` · `<E2-volume-radio-admin>` ·
  `./radio-admin-snapshot.sqlite` · `<L6-abschlusszeile>` · `<L4-migrationszahl>` ·
  `<L5-revision-sollwert>` · `<L7-location>` · `<L8-sollwert>` · `<L9-kamera>` ·
  `<L10-rahmen-zeichenkette>` · `<N4-swjs-pfad>`.
- Liefert an die Zusammenführung: die Zeile „⚠️ Der ⚠️-Kopf dieses Runbooks (‚was diesen Cutover von
  den vorigen unterscheidet‘) gehört Kapitel 4, nicht diesem Abschnitt."

- [ ] **Schritt 1: Die Datei anlegen, falls sie fehlt — mit dem Kopf der Hausform und nicht mehr**

  ```bash
  test -e docs/runbooks/radio-cutover.md && echo "existiert — nur §G0 ergaenzen" || echo "anlegen"
  ```

  Falls sie fehlt, genau dieser Kopf (Vorbild `files-cutover.md:1-7`), **ohne** ⚠️-Kopfabschnitt:

  ````markdown
  # Runbook — Radio-Cutover (`radio-admin` + `radio-inventar` → iuk-suite)

  Ziel: Bestand, Leihhistorie und Verwaltung der zwei Alt-Anwendungen wandern in das Suite-Modul
  `radio`, und die Domains `radio.iuk-ue.de` und `radio-admin.iuk-ue.de` schwenken im **selben**
  Fenster um.

  Grundlage: `docs/superpowers/specs/2026-08-18-radio-cutover-design.md` (Spec 2). Die Paragraphen
  dieses Runbooks verweisen dorthin — wer eine Begründung sucht, findet sie an der genannten Stelle.
  Ein `§` ohne Präfix meint immer Spec 2; jeder Verweis in
  `docs/superpowers/specs/2026-08-17-radio-modul-design.md` trägt das Präfix `Spec 1 §`.

  ⚠️ **Vor dem ersten Befehl einmal `bash` starten.** Die Blöcke sind bash-geschrieben; `fish` kennt
  weder `for … do … done` noch diese `$( )`-Verschachtelungen, und eine Fehlermeldung aus der
  falschen Shell kostet genauso viel Zeit wie eine echte.
  ````

  ⚠️ **Der ⚠️-Kopfabschnitt („die Dinge, die diesen Cutover von den vorigen unterscheiden",
  `files-cutover.md:11-35`) wird hier NICHT geschrieben.** Er trägt die neun harten Randbedingungen
  und gehört dem Planteil zu Kapitel 4. Wer ihn hier anlegt, erzeugt zwei Fassungen.

- [ ] **Schritt 2: Die Eingabentabelle schreiben — Werte, keine Fragen**

  ````markdown
  ## §G0 — Eingaben und Ablesungen der Generalprobe

  **Vor dem ersten Generalprobenlauf ausfüllen.** Jede Zeile ist ein **Wert**, keine Frage — solange
  hier ein Feld leer ist, beginnt der Lauf nicht, dem es fehlt. Die späteren Abschnitte verweisen auf
  diese Nummern. **Betriebswerte werden nicht erfunden**: ein Platzhalter aus einer anderen Maschine
  ist kein Wert (`files-cutover.md:57-58`).

  | # | Wert | Eingetragen | Ohne ihn |
  |---|---|---|---|
  | `$IMG` | Image-Referenz der Suite, mit der geprobt wird (`ghcr.io/rubenvitt/iuk-suite:latest` oder ein Digest) | | Die Probe läuft gegen ein anderes Image als der Cutover — V3 vergleicht dann zwei Revisionen, die nichts miteinander zu tun haben |
  | `$GP` | Pfad des Wegwerf-Verzeichnisses auf dem Host (Vorschlag `$HOME/gp-radio`) | | Der Import landet in `./.data/radio.db` und meldet Parität grün, ohne dass irgendetwas migriert wurde (`src/core/db/index.ts:6`) |
  | `$UID_APP` / `$GID_APP` | Numerische Kennung **aus dem Image** (§G4 / Aufgabe 5, Schritt 1) | / | Der Import schreibt `radio.db` als root, und die Migrationen beim Boot scheitern mit `SQLITE_CANTOPEN` |
  | ⬜ **N3** | Numerische Kennung, unter der der **produktive** Dienst läuft (`SUITE_USER` in der Server-`.env`; `compose.yaml:62` = `user: ${SUITE_USER:-1001:1001}`) | | Die Probe läuft unter einer anderen Kennung als die Produktion, und ein Rechteproblem des Fensters kann in der Probe nicht auftreten |
  | **E2** | Echter Volume-Name von `radio-admin` (`docker volume ls`) | | Ein erfundener Name legt ein **neues, leeres** Volume an; `sqlite3` liefert dann null Zeilen **ohne Fehler** |
  | ⬜ **L6** | Wortlaut der Abschlusszeile von `scripts/import/radio.ts` **und** der Exit-Code | / | Der Importschritt hat kein Abnahmekriterium; ein „sieht gut aus" ersetzt es nicht (`portal-cutover.md:33` grept auf `parity green`) |
  | ⬜ **L4** | Zahl der Einträge in `src/app/m/radio/_db/migrations/meta/_journal.json` | | Die Gegenprobe auf `__drizzle_migrations` hat keine rechte Seite |
  | ⬜ **L5** | **Sollwert** des `revision`-Feldes = der deployte Commit (Protokollzeile aus §4.2 Nr. 1) | | V3 liest ein Feld ab, das mit nichts vergleichbar ist — „200" allein heißt nur „irgendein Stand antwortet" |
  | ⬜ **L7** | Vollständiger `Location`-Kopf der `/admin`-Weiterleitung (Code, Protokoll, Host) | | V2 hat keinen Sollwert, und ein festgeschriebenes `302` wäre eine Zusage über eine Bauform, die Spec 1 nicht festlegt (W7) |
  | ⬜ **L8** | Sollwert von `GET /m/radio` mit `Host: iuk-ue.de` (404 aus dem Host-Riegel oder gerenderte Fläche) | | V7 ist nicht bewertbar — **abgelesen und protokolliert wird sie trotzdem in jedem Fall** |
  | ⬜ **L9** | Trägt `/` oder `/t/<code>` doch eine kamerabasierte Fläche? | | Die Zweigwahl in §G10 / Aufgabe 11 (sicherer Kontext als Pflicht oder nur wegen des Cookies) |
  | ⬜ **L10** | Die Zeichenkette aus dem Ausleih-Rahmen (Spec 1 §4.2), die im **Portal**-HTML **nicht** vorkommt | | Die Portal-Fallback-Probe in §G9 / Aufgabe 10 trifft nichts und ist grün, weil sie nichts prüft |
  | ⬜ **N4** | Pfad der `sw.js`-Route unter `src/app/m/radio/` → die interne URL-Form | | Die Fremdhost-Probe V6 erreicht den Handler nicht und misst den Portal-Login statt des Modul-Riegels |
  ````

  **Dazu eine Zeile, die KEINE Ablesung ist und deshalb keine Nummer trägt** — sie ist die
  Unterschrift des Laufs, und ohne sie erkennt der zweite Lauf den ersten nicht wieder:

  ````markdown
  > Generalprobe Lauf-Nr. ____ · gefahren von ____________________ · am ____________
  ````

- [ ] **Schritt 3: Die drei Sätze darunter, die die Tabelle bindend machen**

  ````markdown
  **Zu ⬜ L5 — die Feldnamen sind heute lesbar, der Sollwert nicht.** `/api/health/<modul>` liefert
  `{ status, module, error?, revision }`: `module` trägt den Modulnamen und `status: "ok"` entsteht
  erst nach `openModuleDatabase(...)` plus `db.prepare("SELECT 1").get()`
  (`src/core/health/index.ts:4-15`, insbesondere `:8-10`); `revision` hängt
  `src/app/api/health/[modul]/route.ts:23-26` an und entscheidet zugleich über 200 gegen 503.
  **Offen ist allein der WERT von `revision`**, und der steht in der Protokollzeile aus §4.2 Nr. 1.

  **Zu ⬜ N3 — die Kennung wird am Server abgelesen, nicht aus dem Image geschlossen.** `Dockerfile:42-43`
  legt `nodejs` (gid 1001) und `nextjs` (uid 1001) an, aber `adduser` bekommt **kein** `-G nodejs` —
  `USER nextjs` (`Dockerfile:88`) läuft deshalb als `1001:65533 (nogroup)`. Der Dienst startet
  dagegen als `user: ${SUITE_USER:-1001:1001}` (`compose.yaml:62`), und der Docblock darüber
  (`compose.yaml:50-59`) führt genau diese Messung. Ein Host mit abweichender clamav-gid setzt
  `SUITE_USER=1001:1000`. **Beide Zahlen ins Protokoll, und die Probe läuft unter der Server-Zahl.**

  **Zu ⬜ N4 — warum das eine eigene Nummer bekommt.** Die Fremdhost-Probe V6 muss den Handler des
  Moduls **erreichen**, um seinen Host-Riegel zu prüfen. Über den Host-Zweig erreicht sie ihn nicht
  (§G9 / Aufgabe 10 schreibt die Rechnung aus); über den internen Pfad `/m/radio/sw.js` erreicht sie
  ihn. **Wo diese Route liegt, entscheidet Spec 1 §7.1.3 und niemand sonst** — abgelesen wird sie nach
  dem Bau:
  ```bash
  rg --files src/app/m/radio | grep 'sw\.js'      # → der Pfad, aus dem die URL folgt
  ```
  ````

- [ ] **Schritt 4: Prüfschritt — das Dreier-Tor auf §G0 anwenden**

  Nacheinander, jede Antwort danebenschreiben (`files-cutover.md:194-196`: „Ergebnis
  danebenschreiben, nicht nur abhaken"):

  1. **Kopierbar:** Die einzige ausführbare Zeile des Abschnitts ist der `rg --files`-Aufruf.
     Einfügen, laufen lassen — sie darf heute **leer** ausgehen (`src/app/m/radio/` existiert nicht),
     sie darf nicht mit einem Syntaxfehler abbrechen.
  2. **Platzhalter:** Jede Zeile der Tabelle trägt entweder ein `$`-Symbol (Shell-Variable, im
     Abschnitt gesetzt) oder eine Nummer (`⬜ L…`, `E…`, `N…`). Gegenprobe:
     ```bash
     rg -n '^\|' docs/runbooks/radio-cutover.md | rg -v '⬜|E[0-9]|N[0-9]|U[0-9]|\$[A-Z]|^\|\s*#|---' 
     ```
     Erwartung: **nur** die Kopfzeile und die Trennzeile der Tabelle. Die Unterschriftszeile
     („gefahren von … am …") steht bewusst **außerhalb** der Tabelle, weil sie keine Ablesung ist.
  3. **Abbruchpunkt:** Die Spalte „Ohne ihn" ist in **jeder** Zeile gefüllt und nennt eine konkrete
     Ausfallwirkung, nicht „wird benötigt".

- [ ] **Schritt 5: Commit**

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G0 — Eingaben und Ablesungen der Generalprobe"
  ```

---

## Aufgabe 2 — §G1: Was vor der Generalprobe grün sein muss

Vier Voraussetzungen aus Spec 2 §3.6. **Keine davon ist durch eine Betriebsprobe ersetzbar**, und
eine davon hat eine Frist, die beide Vorlagen zu spät setzen.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G1 — Was vor der Generalprobe grün
  sein muss`, hinter §G0)
- Test: das Dreier-Tor, geprüft in Schritt 5.

**Schnittstellen:**
- Verbraucht: nichts aus diesem Planteil. Verbraucht aus **Kapitel 1**: den Mapping-Unit-Test
  (§1.3.4) und die zwei weiteren Tests aus §1.10 — namentlich, nicht als Code.
- Liefert: die Protokollzeile **„Retention neutralisiert oder Volume kopiert, am ______"**, auf die
  §G2 / Aufgabe 3 als Vorbedingung verweist; und den Haken „R36 ok", auf den §G9 / Aufgabe 10 (V8)
  verweist.

- [ ] **Schritt 1: Voraussetzung 1 — die drei Tests aus dem Repo**

  ````markdown
  ## §G1 — Was vor der Generalprobe grün sein muss

  Voraussetzungen, keine Zusagen. Alle vier laufen **im Repo bzw. am Server**, keine von ihnen ist
  durch eine Betriebsprobe ersetzbar (§3.6).

  **1. Die drei Tests aus Kapitel 1 sind grün — in der CI, nicht nur lokal.**

  ```bash
  rtk pnpm vitest run scripts/import/radio.test.ts
  ```

  Darin insbesondere der **Mapping-Unit-Test** mit **je Feld unterschiedlichen** Fixture-Werten
  (§1.3.4). Warum er hier steht und nicht bei den Betriebsproben: die Betriebsproben (§G7 /
  Aufgabe 8) sind die Probe **daneben**, nicht der Ersatz — beide Paritätsarme laufen durch dieselbe
  Mapping-Funktion, ein konsistenter Fehler hasht beidseitig gleich (`scripts/import/parity.ts:43-56`;
  `scripts/import/portal.ts:73-76` schreibt es selbst hin).

  **Abbruch:** Ist einer der drei rot, beginnt die Generalprobe nicht. Rückweg: der Fund gehört in
  Kapitel 1, nicht in einen zweiten Generalprobenlauf.
  ````

- [ ] **Schritt 2: Voraussetzung 2 — die Quelltext-Zusicherung zur Cookie-Domain**

  ````markdown
  **2. Die Quelltext-Zusicherung zur Cookie-Domain aus Spec 1 §3.8 ist grün.**

  Sie ist die **einzige** Absicherung gegen Falle 19, und sie ist es dauerhaft: ⚠️ **die Cookie-Domain
  ist nie per HTTP prüfbar — auch nicht nach dem Umschwenk.** Spec 1 §3.4.1 wörtlich: „Playwright kann
  diesen Fehler nicht sehen. Es fährt gegen **einen** Host, und dort verhält sich ein domain-weites
  Cookie **exakt** wie ein host-only." `pnpm build` und `pnpm typecheck` sehen ein zusätzliches
  `domain`-Feld nicht — es ist typkorrekt.

  **Die Hausform der Zusicherung ist gebaut und wird nicht neu erfunden**:
  `src/app/m/lagerbuch/_lib/helferSitzung.test.ts:283-307`. Sie prüft auf eine **Zuweisung**, nicht
  auf das Wort — `/^\s*domain\s*:/m` —, weil der Kopfkommentar der geprüften Datei die Wörter
  `domain` und `AUTH_COOKIE_DOMAIN` selbst führt (er erklärt ja gerade die Abwesenheit,
  `helferSitzung.ts:105-120`); und sie verbietet zusätzlich den **Import** von `@/core/auth/cookies`,
  weil das die naheliegende falsche Vorlage ist.

  ```bash
  rtk pnpm vitest run src/app/m/radio          # ⬜ Wartet auf: Spec 1 §3.8 — die Zusicherungsdatei
  ```

  **Abbruch:** Fehlt diese Zusicherung ganz, ist sie kein „nice to have", das nachgereicht wird —
  sie ist die einzige Stelle, an der der Fehler je auffallen kann. Rückweg: Kapitel 1 bzw. Spec 1
  §3.8, nicht die Generalprobe.
  ````

- [ ] **Schritt 3: Voraussetzung 3 — die Abwesenheitsprüfung R36**

  ````markdown
  **3. Die Abwesenheitsprüfung R36 läuft im Repo — vor der Generalprobe, nicht gegen den Container.**

  Spec 1 §7.1.1 entscheidet: „**`radio` erhält kein Manifest, keine Icon-Handler und keinen
  `<link rel="manifest">`**". Ein `curl` auf `…/manifest.webmanifest` prüfte damit die Abwesenheit von
  etwas, das kategorisch nicht entstehen kann: **immer grün, und liest sich als Zusage.** Verbindlich
  ist stattdessen:

  ```bash
  test ! -e src/app/m/radio/manifest.webmanifest/route.ts && echo "R36 ok"
  rg -n 'metadata.*manifest|rel="manifest"' src/app/m/radio/ || echo "R36 ok"
  ```

  **Beide Zeilen, und beide müssen `R36 ok` sagen.** → Ergebnis: ____________________

  **Abbruch:** Ein Treffer ist eine Moduländerung, kein Runbook-Fund. Rückweg: Spec 1 §7.1.1.
  ````

- [ ] **Schritt 4: Voraussetzung 4 — die Frist, die beide Vorlagen zu spät setzen**

  ````markdown
  **4. ⚠️ „Die Retention der Standby-Umgebung ist neutralisiert ODER das Volume ist kopiert" — und
  zwar VOR dem ERSTEN Generalproben-Schnappschuss, nicht „vor dem Cutover-Abend" (W1).**

  Der Grund ist eine Kette, die nirgends laut wird:
  `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, `retentionService.ts:47` führt
  `purge()` **sofort** aus (Quellkommentar: „clears any backlog, e.g. straight after a data
  migration"), erst `:48` setzt den Tagestimer — und der Cutoff hängt an der **Wanduhr** (`:9`, `:19`).
  **Jeder weitere Start löscht mehr als der vorige.** Es gibt dabei keinen Fehler und keinen roten
  Test, sondern eine **Erfolgszeile**: `[retention] purged N expired loan(s)`
  (`retentionService.ts:41`).

  Ab dem ersten Schnappschuss kann jemand den Alt-Stack anhalten, und **der nächste Start ist der
  Schaden**. Deshalb steht diese Zeile hier und nicht in §4.2.

  **Handgriff:** `HISTORY_RETENTION_MONTHS` in der Standby-Umgebung neutralisieren **oder** das
  Volume kopieren.

  > Retention neutralisiert ☐ / Volume kopiert ☐ · am ____________ · durch ____________

  **Abbruch:** Ohne diese Protokollzeile wird **kein** Schnappschuss gezogen (§G2 / Aufgabe 3 nennt
  sie als Vorbedingung). Rückweg: es gibt keinen — verlorene Historie ist verloren; deshalb steht die
  Zeile **vor** dem ersten Lauf.

  ⚠️ **Die Generalprobe hält den Alt-Stack NICHT an** (W1, §G2 / Aufgabe 3). Diese Vorbedingung
  schützt gegen den Fall, dass es trotzdem jemand tut.
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Die vier Blöcke einzeln in eine `bash`-Zeile einfügen. Die zwei `vitest`-Zeilen
     dürfen heute mit „No test files found" enden — das ist der Zustand vor dem Bau und wird als
     solcher protokolliert, nicht als Fehlschlag. Die zwei R36-Zeilen laufen heute durch und sagen
     `R36 ok`.
  2. **Platzhalter:** Voraussetzung 2 trägt „⬜ Wartet auf: Spec 1 §3.8". Voraussetzung 1 nennt
     `scripts/import/radio.test.ts` als Datei aus Kapitel 1.
  3. **Abbruchpunkt:** Alle vier tragen einen eigenen Abbruchsatz mit Rückweg; Voraussetzung 4 sagt
     ausdrücklich, dass ihr Rückweg keiner ist.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G1 — vier Voraussetzungen vor der Generalprobe"
  ```

---

## Aufgabe 3 — §G2: Der Schnappschuss der Alt-Datenbank

Die eine Datei, gegen die die ganze Generalprobe läuft. **Sie entsteht mit `.backup`, nie mit `cp`,
und der Alt-Stack wird dafür NICHT angehalten** (W1).

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G2 — Der Schnappschuss der
  Alt-Datenbank`, hinter §G1)
- Test: das Dreier-Tor, geprüft in Schritt 5.

**Schnittstellen:**
- Verbraucht: **E2** (echter Volume-Name von `radio-admin`, aus §G0 / Aufgabe 1) · die
  Protokollzeile „Retention neutralisiert oder Volume kopiert" aus §G1 / Aufgabe 2 Voraussetzung 4.
- Liefert: die Datei **`./radio-admin-snapshot.sqlite`** im Arbeitsverzeichnis des Hosts — der Name
  ist in ganz Spec 2 derselbe (§1.5.3) und wird von §G3 / Aufgabe 4, §G4 / Aufgabe 5 und §G6 /
  Aufgabe 7 zeichengleich verbraucht. Liefert außerdem die Messung **U8 (Dump-Dauer)** an Kapitel 4
  §4.2 Nr. 7.

- [ ] **Schritt 1: Den Abschnitt mit dem Verbot beginnen, nicht mit dem Befehl**

  ````markdown
  ## §G2 — Der Schnappschuss der Alt-Datenbank

  **Vorbedingung:** Die Protokollzeile aus §G1 Nr. 4 („Retention neutralisiert ☐ / Volume kopiert ☐")
  steht. Ohne sie wird kein Schnappschuss gezogen.

  ⚠️ **`cp` ist verboten, und der Fehlfall ist paritätsgrün.** `radio-admin` läuft im WAL-Modus (die
  Pragmas in `radio-admin/server/src/db/index.ts`, `foreign_keys = ON` dort in `:28`). Eine
  WAL-Datenbank besteht aus **drei** Dateien; ein `cp` der `.sqlite` allein verliert den Schwanz
  **aller committeten Transaktionen** — und eine abgeschnittene Quelle ist mit sich selbst vollkommen
  einig, also ist der Paritätscheck **grün**.

  ⚠️ **Der Alt-Stack wird für den Generalproben-Schnappschuss NICHT angehalten.** `.backup` arbeitet
  gegen die **laufende** Datenbank — genau dafür ist es da. Ein Stopp wäre nicht nur unnötig, er wäre
  **schädlich**: der **Neustart** danach löscht Historie (§G1 Nr. 4, `retentionService.ts:41`, `:47`).
  Das `docker compose -f radio-admin/docker-compose.yml stop app` gehört **ausschließlich** zum Freeze
  im Cutover-Fenster (§4.5 Schritt 1) und steht in diesem Abschnitt nicht.
  ````

- [ ] **Schritt 2: Die Volume-Ablesung, die dem Befehl vorausgeht**

  ````markdown
  **Zuerst den echten Volume-Namen ablesen und protokollieren (E2).** Compose präfixt deklarierte
  Volumes mit dem Projektnamen; ein erfundener Name legt ein **neues, leeres** Volume an, und der
  Befehl darunter meldet dann Erfolg über eine leere Datenbank.

  ```bash
  docker volume ls | grep -i radio
  VOL_ADMIN=<die Zeile aus dem Befehl oben>     # E2, ins Protokoll
  ```

  > **E2** = ____________________ · abgelesen am ____________
  ````

- [ ] **Schritt 3: Der Befehl — genau eine Form, und keine „gleichwertige" daneben**

  ````markdown
  ```bash
  docker run --rm -v "$VOL_ADMIN":/d -v "$PWD":/out alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
           sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
  ```

  ⚠️ **`/data/data.sqlite` wäre ein CONTAINER-Pfad von `radio-admin`; auf dem Host gibt es ihn nicht.**
  Deshalb das Alt-Volume auf `/d` und das Arbeitsverzeichnis des Hosts auf `/out` — dieselbe
  Mount-Form, die §4.5 Schritt 2 im Fenster fährt.

  ⚠️ **Es gibt genau EINE zulässige Form.** Eine „gleichwertige" Variante
  `sqlite3 /d/data.sqlite "VACUUM INTO '/out/…'"` steht hier **absichtlich nicht**: in die
  `sh -c '…'`-Zeile darüber wörtlich übernommen, beendet ihr erstes `'` die umschließende
  Zeichenkette, und der Schnappschuss bricht mit einem Syntaxfehler ab. Wer sie dennoch braucht,
  schreibt die Verschachtelung vollständig aus:
  ```bash
  docker run --rm -v "$VOL_ADMIN":/d -v "$PWD":/out alpine \
    sh -c "apk add --no-cache sqlite >/dev/null 2>&1; sqlite3 /d/data.sqlite \"VACUUM INTO '/out/radio-admin-snapshot.sqlite'\""
  ```
  **Empfohlen ist sie nicht** — `.backup` ist die Hausform (`scripts/backup.sh:41-43` sichert **jede**
  `*.db` unter `DATA_DIR` mit genau diesem Befehl und bricht ohne Treffer sogar **hart** ab,
  `scripts/backup.sh:32-36`), und eine Variante, die niemand fahren soll, ist eine Falle.

  **Die Dauer wird gemessen und protokolliert — sie ist die Hälfte von U8:**
  ```bash
  time docker run --rm -v "$VOL_ADMIN":/d -v "$PWD":/out alpine \
    sh -c 'apk add --no-cache sqlite >/dev/null 2>&1;
           sqlite3 /d/data.sqlite ".backup /out/radio-admin-snapshot.sqlite"'
  ls -la radio-admin-snapshot.sqlite
  ```

  > **U8 / `radio-admin`**: Dump-Dauer ________ · Dateigröße ________ · gemessen am ____________
  ````

- [ ] **Schritt 4: Die Gegenprobe auf die Datei selbst — und der Abbruchpunkt**

  ````markdown
  **Die Kopie wird gegengeprüft, bevor irgendetwas mit ihr geschieht:**

  ```bash
  sqlite3 -readonly radio-admin-snapshot.sqlite ".tables"
  sqlite3 -readonly radio-admin-snapshot.sqlite "pragma integrity_check;"
  ```

  **Erwartung:** `.tables` nennt `devices`, `software_versions`, `users`, `device_events`, `loans`,
  `api_tokens` und `__drizzle_migrations`; `integrity_check` sagt `ok`.

  ⚠️ **Fehlen `loans`, `users` oder `api_tokens`, ist die Quelle ein Stand VOR der Loan-Migration
  `0003`** — genau der Zustand der lokalen `radio-admin/data/data.sqlite`, die als Beleg unbrauchbar
  ist (`docs/radio-portierung-analyse.md:1865-1872`). **Abbruch:** dann wurde das falsche Volume
  gemountet. Rückweg: E2 erneut ablesen, Schnappschuss verwerfen (`rm radio-admin-snapshot.sqlite`),
  neu ziehen. Der Schnappschuss ist beliebig oft wiederholbar — er hält den Alt-Stack nicht an.

  **Vorbedingung des Hosts, im Protokoll daneben:** `sqlite3 --version` ≥ 3.27.
  > `sqlite3` auf dem Host: Version ________ · vorhanden ☐ ja ☐ nein (dann läuft jede Abfrage dieses
  > Kapitels über die `docker run … alpine`-Form)
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Alle fünf Blöcke einzeln einfügen. `docker volume ls | grep -i radio` läuft heute;
     die `docker run`-Zeilen laufen erst mit gesetztem `$VOL_ADMIN`, und genau deshalb steht die
     Ablesung **im selben Abschnitt** darüber. ⚠️ Gegenprobe auf das Quoting: die `.backup`-Zeile
     enthält genau **ein** Paar einfacher Anführungszeichen (um das `sh -c`-Argument) und keines darin.
  2. **Platzhalter:** `<die Zeile aus dem Befehl oben>` trägt `# E2`; die Dateigröße/Dauer tragen
     `U8`.
  3. **Abbruchpunkt:** Schritt 4 nennt den Fehlfall (fehlende Tabellen), was er bedeutet und den
     Rückweg (verwerfen und neu ziehen).

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G2 — Schnappschuss mit .backup, ohne Stopp des Alt-Stacks"
  ```

---

## Aufgabe 4 — §G3: Die dreizehn Abfragen gegen die Kopie, vor dem Import

Sie gehören in die Generalprobe, weil dort ein Treffer eine halbe Stunde Arbeit ist und im Echtlauf
ein Abbruch um 23 Uhr.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G3 — Die dreizehn Abfragen gegen die
  Kopie, vor dem Import`, hinter §G2)
- Test: das Dreier-Tor, geprüft in Schritt 4.

**Schnittstellen:**
- Verbraucht: `./radio-admin-snapshot.sqlite` aus §G2 / Aufgabe 3 · den Abschnitt **§A** (A1–A13 im
  Wortlaut), den der Planteil zu **Kapitel 2** in dieselbe Datei schreibt.
- Liefert: die **fünf Zeilenzahlen aus A1** als Paritäts-Sollwerte an §G5 / Aufgabe 6, und die
  `api_tokens`-Zahl als Protokollzeile an Kapitel 5 (Abfrage T). Liefert die **A8-Vorhersage** an
  §G7 / Aufgabe 8 (a).

- [ ] **Schritt 1: Die Zuordnungstabelle schreiben — und ausdrücklich sagen, warum hier kein SQL steht**

  ````markdown
  ## §G3 — Die dreizehn Abfragen gegen die Kopie, vor dem Import

  **Der vollständige Wortlaut aller dreizehn Abfragen steht in §A — dort und nur dort, damit es eine
  Fassung gibt und nicht zwei** (Hausform: `lagerbuch-cutover.md:365-366`). Dieser Abschnitt sagt,
  **gegen welche Datei** sie in der Generalprobe laufen, **welche** blockieren und **was** ein Treffer
  bedeutet.

  **Gegen welche Datei:** ausschließlich gegen `./radio-admin-snapshot.sqlite` aus §G2 — **nie** gegen
  den laufenden Alt-Stack. Der Alt-Kiosk ist bis zum Umschwenk der Betrieb (§2.2.2).

  ```bash
  sqlite3 -readonly radio-admin-snapshot.sqlite "<das SQL aus §A>"
  ```

  | A-Marke | Was | Blockierend? |
  |---|---|---|
  | **A1** | sechs Zeilenzahlen (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`) | nein — sie **sind** die Sollwerte (fünf davon Paritäts-Sollwerte, `api_tokens` Protokoll) |
  | **A2** | `software_versions where is_target = 1` MUSS genau 1 sein | ⛔ ja |
  | **A3** | verwaiste `device_events` MUSS 0 sein | ⛔ ja |
  | **A4** | doppelt aktive Leihen je Gerät MUSS leer sein | ⛔ ja |
  | **A5** | `device_events.source` — Teilmenge des Vierer-Enums | ⛔ ja |
  | **A6** | `min/max(created_at)` **dreizehnstellig** = Millisekunden | ⛔ ja — zehnstellig heißt: Absage, nicht Anpassung |
  | **A7** | Trigger/Views in `sqlite_master` MUSS leer sein | ⛔ ja |
  | **A8** | die Retention-Zahl als **Vorhersage** (ersetzt die Betreiber-Schätzung „< 100") | nein, aber Protokollpflicht |
  | **A9** | `dev-user` in Auditspalten (**U7**) | nein, Protokollpflicht |
  | **A10** | **zehn**spaltiger Plausibilitätsriegel `NOT BETWEEN 1e12 AND 4e12` MUSS 0 sein | ⛔ ja |
  | **A11** | `typeof()` je Zeitstempelspalte | ⛔ ja |
  | **A12** | Leihen ohne Gerät, getrennt nach AKTIV/abgeschlossen | nein, Protokollpflicht (AKTIV: dem Betreiber vorlegen) |
  | **A13** | `returned_at < borrowed_at` | nein, Protokollpflicht (⛔ **nur zusammen mit A10**) |

  ⚠️ **Der Riegel A10 ist ZEHNspaltig, nicht elf** (W8): neun Zeitstempelspalten plus
  `devices.last_updated_at`. Wer „elf" liest, sucht eine elfte Zeile und hält die Abfrage für
  gekürzt. ⚠️ Und **A8 trägt den Faktor 1000 absichtlich im SQL** (§2.4.5) — das ist kein Tippfehler,
  der „bereinigt" werden darf.

  > A1: devices ____ · software_versions ____ · api_tokens ____ · users ____ · device_events ____ ·
  > loans ____ · abgelesen am ____________
  ````

- [ ] **Schritt 2: Die Entscheidungsregel je Fund — als drei Klassen, nicht als Prosa**

  ````markdown
  **Was ein Treffer bedeutet — die Klasse entscheidet, nicht das Gefühl** (§3.5, ausführlich in
  §G13 / Aufgabe 14):

  * **A6 oder A7 → Klasse A, Absage.** Zehnstellige Zeitstempel heißen: die gesamte Import-Annahme ist
    falsch, und der Cutover wird **abgesagt, nicht angepasst**. Ein Trigger oder View ist Fachlogik,
    die kein Repo kennt. **Rückweg:** der Cutover-Termin wird verschoben; es gibt keinen Handgriff am
    Abend, der das behebt.
  * **A2 oder A3 → Klasse B, in der KOPIE bereinigen und die Bereinigung protokollieren.** Der
    Update-Stand ist berechnet, nicht gespeichert (`radio-admin/server/src/db/schema.ts:53-56`) — bei
    0 oder 2 `is_target`-Zeilen kippt der angezeigte Status **jedes** Geräts, und keine Parität sieht
    es. Bei A3 die Waisen löschen und die Anzahl notieren.
    ⚠️ **Die Bereinigung geschieht in der Kopie und wird im Echtlauf WIEDERHOLT, nicht vererbt.** Eine
    Bereinigung, die nur in der Generalprobe stattfand, ist ein Fund, den das Fenster erneut trifft.
    > A2 bereinigt: ☐ nein ☐ ja, von ____ auf 1 · A3 gelöschte Waisen: ____ · am ____________
  * **A4, A5, A10, A11 → Klasse C, reparieren und die Generalprobe VON VORN.** „Von vorn" ist wörtlich:
    `rm -rf "$GP"`, neu importieren (§G4 / Aufgabe 5). Ein Nachbessern auf dem bestehenden Stand prüft
    die Reparatur und nicht den Import.
  * **A12 im Fall AKTIV → dem Betreiber vorlegen.** Eine aktive Leihe auf einem nicht existierenden
    Gerät ist über die Oberfläche nicht zurückgebbar.
  * **A13 → protokollpflichtig; ⛔ blockierend NUR, wenn dieselbe Zeile zusätzlich in A10 auffällt.**
    Dann ist es kein Datenfehler von 2024, sondern ein Hinweis auf einen **beschädigten
    Schnappschuss** — Rückweg: Schnappschuss verwerfen und §G2 wiederholen.
  ````

- [ ] **Schritt 3: Die Zeile, die A9/U7 an Kapitel 5 bindet**

  ````markdown
  **A9 ist die einzige dieser Abfragen, deren Antwort nach dem Abbau nicht mehr zu bekommen ist.**
  Sie beantwortet **U7** („Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`?") und entscheidet über
  die Lesbarkeit der Auditspalten. Sie wird in §5.2.2 als Abfrage 8 **wiederholt**, aber gegen dann
  schon archivierte Daten — deshalb steht die Antwort **hier** im Protokoll, nicht erst dort.

  > **U7**: `dev-user` in Auditspalten gefunden ☐ ja, ____ Zeilen ☐ nein · abgelesen am ____________
  ````

- [ ] **Schritt 4: Prüfschritt und Commit**

  1. **Kopierbar:** Die eine ausführbare Zeile ist der `sqlite3 -readonly`-Aufruf mit `<das SQL aus
     §A>`; sie ist bewusst ein Rahmen und trägt ihre Quelle im Platzhalter. Gegenprobe: der Dateiname
     `radio-admin-snapshot.sqlite` ist zeichengleich zu §G2.
  2. **Platzhalter:** `<das SQL aus §A>` benennt seinen Fundort in derselben Datei; `U7` trägt seine
     Nummer; die Protokollzeile zu A1 hat für jede der sechs Zahlen ein eigenes Feld.
  3. **Abbruchpunkt:** Vier Klassen, jede mit Rückweg — Klasse A sagt ausdrücklich, dass ihr Rückweg
     die Verschiebung ist.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G3 — A1-A13 gegen die Snapshot-Kopie, mit Klassenzuordnung"
  ```

---

## Aufgabe 5 — §G4: Wegwerf-Aufbau und Import

Der Kern der Probe: ein `DATA_DIR`, das **nicht** das produktive Volume ist, und derselbe Importer,
den auch das Fenster fährt.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G4 — Wegwerf-Aufbau und Import`,
  hinter §G3)
- Test: das Dreier-Tor, geprüft in Schritt 6.

**Schnittstellen:**
- Verbraucht: `$IMG`, `$GP` (aus §G0 / Aufgabe 1) · `./radio-admin-snapshot.sqlite` (aus §G2 /
  Aufgabe 3) · ⬜ **L6** (Abschlusszeile) · ⬜ **N3** (Server-Kennung) · aus **Kapitel 1**: die
  Aufrufform `tsx scripts/import/radio.ts <radio-snapshot.db>` mit **einem** positionalen Argument,
  Ziel gesteuert über `DATA_DIR` (§1.5.3, Abschnitt §I dieses Runbooks).
- Liefert: `$UID_APP`, `$GID_APP`, die Datei `$GP/data/radio.db` sowie die **Zählzeile des Importers**
  (`Quelle: users=… software_versions=… devices=… device_events=… loans=…`) an §G5 / Aufgabe 6.
  Liefert die Regel „**jede Generalprobe beginnt mit einem leeren `DATA_DIR`**" an §G13 / Aufgabe 14.

- [ ] **Schritt 1: Handgriff 0 — die Kennung, ZWEIMAL abgelesen**

  ````markdown
  ## §G4 — Wegwerf-Aufbau und Import

  ### Handgriff 0 — die numerische Kennung, aus dem Image UND vom Server

  **Warum überhaupt:** `Dockerfile:88` startet den Prozess als `USER nextjs`, und `Dockerfile:71`
  (`RUN mkdir -p /data/files && chown nextjs:nodejs /data /data/files`) übereignet den Mountpunkt.
  Schreibt der Import als root in dasselbe Verzeichnis, gehört `radio.db` root — und die Migrationen
  beim Boot scheitern mit `SQLITE_CANTOPEN`. Laut, im Container-Log, kein stiller Fall. Aber ein
  verbrannter Durchlauf.

  ```bash
  IMG=<die Image-Referenz aus §G0>
  UID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -u')
  GID_APP=$(docker run --rm --entrypoint sh "$IMG" -c 'id -g')
  echo "Image: $UID_APP:$GID_APP"
  ```

  ⚠️ **Das Image ist NICHT die maßgebliche Zahl, und der Unterschied ist im Repo dokumentiert.**
  `Dockerfile:42-43` legt `addgroup --system --gid 1001 nodejs` und `adduser --system --uid 1001
  nextjs` an — **ohne `-G nodejs`**. `USER nextjs` läuft deshalb als **`1001:65533 (nogroup)`**, und
  der Docblock in `compose.yaml:50-59` führt genau diese Messung wörtlich. Der **Dienst** startet
  dagegen als `user: ${SUITE_USER:-1001:1001}` (`compose.yaml:62`), und ein arm64-Host mit
  abweichender clamav-gid soll laut `.env.example:210` `SUITE_USER=1001:1000` setzen.

  **Deshalb wird die Server-Zahl abgelesen (⬜ N3) und die Probe läuft unter ihr:**
  ```bash
  # auf dem Server, im Projektverzeichnis der Suite:
  grep -n '^SUITE_USER=' .env                     # ⬜ N3 — leer heisst: die Vorgabe 1001:1001 gilt
  docker compose config | grep -n 'user:'         # dieselbe Zahl, aufgeloest
  ```

  > **⬜ N3** Server-Kennung = ________ · Image-Kennung = ________ · gleich? ☐ ja ☐ nein ·
  > die Probe läuft unter ____________ · abgelesen am ____________

  **Weichen sie ab, gilt die Server-Zahl** — sonst prüft die Generalprobe eine Rechtelage, die es in
  der Produktion nicht gibt, und das Fenster trifft eine, die es in der Probe nicht gab. Beide Zahlen
  ins Protokoll; ein fest eingetragenes `1001:1001` wäre genau die Art Annahme, die dieses Kapitel
  überall sonst vermeidet.

  **Abbruch:** Ist `SUITE_USER` auf dem Server nicht ablesbar (kein Zugriff, keine Datei), ist das
  eine **Serverauskunft und keine Vermutung** — sie wird eingeholt. Rückweg bis dahin: die Probe läuft
  unter der Image-Zahl und trägt im Protokoll den Vermerk „unter Image-Kennung gefahren, Server-Zahl
  offen (⬜ N3)".
  ````

- [ ] **Schritt 2: Handgriff 1 — das Wegwerf-`DATA_DIR`, mit der richtigen Begründung**

  ````markdown
  ### Handgriff 1 — das Wegwerf-DATA_DIR

  ```bash
  GP=<der Pfad aus §G0>              # Vorschlag: $HOME/gp-radio
  rm -rf "$GP" && mkdir -p "$GP/data/files"
  ```

  ⚠️ **`data/files` MUSS mit angelegt werden, und der Grund ist ein Mount-Grund, kein files-Grund:**
  ein **Bind**-Mount erbt die Verzeichnisstruktur des Images **nicht**. Nur ein **leeres benanntes
  Volume** übernimmt Eigentümer und Modus des Mountpunkts aus dem Image, und auch das nur, wenn der
  Pfad dort existiert — `Dockerfile:64-71` schreibt diese Regel aus („Fehlt er, ist der Mountpunkt
  `0 0`", gemessen 30.07.2026, Docker 29.4.0).

  ⚠️ **Was hier ausdrücklich NICHT der Grund ist, obwohl es naheliegt:** eine Boot-Prüfung von `files`,
  die an einem fehlenden Verzeichnis scheitert. Die gibt es nicht. `filesBootFehler()` ruft
  `pruefeAblage()` **nur**, wenn `files` einen Prod-Host trägt (`src/app/m/files/_lib/boot.ts:82-95`)
  — die Env-Liste des Prüfcontainers (§G8 / Aufgabe 9) setzt **kein** `SUITE_HOST_FILES`, und der
  Code-Default ist leer (`src/core/registry.ts`, `files`: `prodHosts: []`). Und die Funktion, die den
  Pfad auflöst, behandelt sein Fehlen ausdrücklich als **keinen** Fehler:
  `src/app/m/files/_lib/boot.ts:420-432` („Ein fehlendes Verzeichnis ist KEIN Fehler … ein Lauf, der
  daran scheitert, protokollierte einen Fehler, der keiner ist"; `ENOENT` → `[]`).
  **Warum das dasteht:** wer bei einem Startabbruch des Prüfcontainers dieser falschen Fährte folgt,
  sucht bei `files` statt bei den fünf radio-Boot-Prüfungen aus §G8, die den Abbruch tatsächlich
  auslösen.

  ⚠️ **`rm -rf "$GP"` ist die Idempotenz dieser Probe — nicht die Konfliktstrategie des Importers**
  (§3.1.3). **Verbindlich: jede Generalprobe beginnt mit einem leeren `DATA_DIR`.** Wer stattdessen
  „nochmal importiert", prüft die Idempotenz des Skripts und nicht den Import — und walzt genau das
  platt, was die Probe erzeugt hat.
  ````

- [ ] **Schritt 3: Handgriff 2 — der Import, aus einem Repo-Checkout**

  ````markdown
  ### Handgriff 2 — der Import

  ```bash
  DATA_DIR="$GP/data" pnpm exec tsx scripts/import/radio.ts ./radio-admin-snapshot.sqlite
  echo "exit=$?"
  ```

  ⚠️ **Nicht aus dem App-Image.** Das standalone-Image enthält weder `scripts/` noch `tsx`
  (`docs/runbooks/portal-cutover.md:23-26`). `docker compose exec suite tsx …` ist der Reflex und er
  scheitert — im besten Fall.

  **Die Aufrufform ist dieselbe wie im Fenster: dasselbe Skript, dasselbe eine positionale Argument,
  dieselbe Schnappschuss-Datei — ein anderes `DATA_DIR` je Lauf** (§I / Kapitel 1, §1.5.3). ⚠️ **Nicht
  „zeichengleich":** der Pfad des `DATA_DIR` ist der einzige Unterschied, und wer „zeichengleich"
  wörtlich nimmt, sucht im Fenster nach einer Zeile, die es nicht gibt.

  **Abnahme dieses Handgriffs — beides, nicht eines von beiden:**
  * die **Abschlusszeile** ⬜ **L6** (bei `portal` ist es die Zeichenkette `parity green`,
    `portal-cutover.md:20`, `:33`)
  * der **Exit-Code 0**

  > ⬜ **L6** Abschlusszeile = ____________________ · exit = ____ · am ____________

  **Abbruch — und er ist der teuerste Fehlfall dieser Probe:** ⚠️ **ein roter Paritätscheck heißt
  NICHT „es ist nichts passiert".** `scripts/import/portal.ts:105-107` schreibt es aus: „A thrown
  parity error means the target was already mutated … not ‚nothing happened‘". **Rückweg ist die leere
  Ziel-DB, nie ein zweiter Lauf auf demselben Stand:** `rm -rf "$GP"` und von vorn (Handgriff 1).
  ````

- [ ] **Schritt 4: Handgriff 3 — Eigentumsübergabe, und Handgriff 4 — die Landeprobe**

  ````markdown
  ### Handgriff 3 — Eigentum an die Kennung übergeben

  ```bash
  sudo chown -R "$UID_APP:$GID_APP" "$GP/data"     # bzw. die Server-Kennung aus ⬜ N3
  ls -ln "$GP/data"
  ```

  **Erwartung:** `radio.db` trägt dieselbe numerische Kennung wie das Verzeichnis, und beide die aus
  Handgriff 0 protokollierte Zahl.

  ### Handgriff 4 — ist der Import überhaupt DORT gelandet?

  ⚠️ **Ein eigener Schritt, keine Fußnote am Importschritt** (§1.5.3). Wer `DATA_DIR` vergisst,
  importiert nach `./.data/radio.db` (`src/core/db/index.ts:6`), bekommt **Parität grün** und hat
  nichts migriert.

  ```bash
  ls -la "$GP/data/radio.db"
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from devices;"
  ls -la ./.data/radio.db 2>/dev/null && echo "⚠️ ACHTUNG: es gibt eine zweite radio.db unter ./.data"
  ```

  **Erwartung:** Die Zahl aus der zweiten Zeile ist zeichengleich die `devices=`-Zahl aus der
  **ersten Ausgabezeile des Importers** (`Quelle: users=… devices=… loans=…`, §1.5.3) und
  zeichengleich der `devices`-Zahl aus **A1** (§G3 / Aufgabe 4). **Drei Zahlen, eine Gleichung.**

  **Abbruch:** Steht eine `./.data/radio.db` da, ist der Lauf in das falsche Ziel gegangen.
  **Rückweg:** `rm -rf ./.data/radio.db* "$GP"`, Handgriff 1 und 2 wiederholen — **mit** gesetztem
  `DATA_DIR`.
  ````

- [ ] **Schritt 5: Die Lese-Regel für alle folgenden Abschnitte — sie steht hier, weil sie hier entsteht**

  ````markdown
  ### ⚠️ Wie ab jetzt auf `$GP/data/radio.db` gelesen wird — zwei Zustände, und der Unterschied ist kein Datenbefund

  SQLite braucht im WAL-Modus zum **Lesen** eine beschreibbare `-shm`-Datei. Daraus folgen **zwei**
  Formen, und welche gilt, hängt daran, **ob der Prüfcontainer aus §G8 gerade läuft**:

  | Zustand | Form | Grund |
  |---|---|---|
  | **`radio-gp` läuft nicht** (vor §G8, nach §G12) | `sqlite3 -readonly "$GP/data/radio.db" "<SQL>"` auf dem Host; `file:$GP/data/radio.db?immutable=1` ist zusätzlich zulässig | Kein Prozess hängt an der Datei |
  | **`radio-gp` läuft** (zwischen §G8 und §G12) | `sqlite3 -readonly "$GP/data/radio.db" "<SQL>"` auf dem Host, ⛔ **ohne `immutable=1`** | Der Prüfcontainer hält `radio.db` offen (Migrationen, Health, Boot-Haken). `immutable=1` sagt der Bibliothek zu, dass **niemand** schreibt — diese Zusage gilt dann nicht mehr |

  ⚠️ **Warum das hier steht und nicht bei den Abfragen:** §2.2.2 begründet `immutable=1` für die
  Generalprobe damit, dass „kein anderer Prozess an der Datei hängt". Das stimmt für die Läufe **vor**
  dem Start des Prüfcontainers und **nicht** für die danach — und der Prüfsatz aus §G9/§G10 läuft
  genau dann. Wer die Regel nicht kennt, liest ein „unable to open database file" oder einen
  veralteten Stand als **Datenbefund**, und das ist der teuerste Irrweg dieser Probe.

  ⚠️ **Und der Riegel, der beide Zustände überspannt — er wird nie ohne seinen Geltungsbereich
  zitiert:** **die `docker run`-Zeile DER GENERALPROBE enthält die Zeichenkette `suite_data` nicht.**
  Ein `-v suite_data:/data` ist ein Zeichen Unterschied und schreibt in die Produktion
  (`compose.yaml:252-254` nagelt den Namen ohne Projektpräfix fest). **Für den
  Fenster-Prüfcontainer (§4.5 Schritt 8) gilt dieser Riegel NICHT** — dort ist `suite_data` das
  Prüfobjekt (W5). Wer ihn ohne Geltungsbereich zitiert, macht Schritt 8 unausführbar.

  ```bash
  # Gegenprobe des Riegels — sie braucht den Pruefcontainer und laeuft deshalb
  # in §G8, sobald er gestartet ist. Hier steht sie, weil hier der Riegel steht:
  docker inspect radio-gp --format '{{json .Mounts}}' | grep -c suite_data   # MUSS 0 sein
  docker inspect radio-gp --format '{{json .Mounts}}'                        # zum Mitlesen
  ```
  ````

- [ ] **Schritt 6: Prüfschritt und Commit**

  1. **Kopierbar:** Sechs Blöcke. `IMG=` und `GP=` tragen ihren Wert aus §G0 als Platzhalter und sind
     **im Abschnitt selbst** gesetzt — keine Variable dieses Abschnitts stammt unsichtbar von
     woanders. Die `docker run --entrypoint sh`-Zeilen laufen heute gegen ein vorhandenes Image; die
     `pnpm exec tsx`-Zeile bricht heute mit „file not found" ab, weil `scripts/import/radio.ts` nicht
     existiert — das ist der Zustand vor dem Bau und wird so protokolliert.
  2. **Platzhalter:** `<die Image-Referenz aus §G0>`, `<der Pfad aus §G0>`, ⬜ **L6**, ⬜ **N3**.
  3. **Abbruchpunkt:** Vier Stück, jeder mit Rückweg — Handgriff 0 (Server-Zahl nicht ablesbar),
     Handgriff 2 (roter Paritätscheck → leere Ziel-DB), Handgriff 4 (falsches Ziel → `rm -rf` und
     wiederholen), und der Lese-Zustand als Verwechslungsfalle mit ausgeschriebener Auflösung.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G4 — Wegwerf-DATA_DIR, Import und die zwei Lese-Zustaende"
  ```

---

## Aufgabe 6 — §G5: Die Gegenzählungen im Ziel

Dieselbe Zahl vorher und nachher (Muster `lagerbuch-cutover.md:452`, `:544`). **Fünf Tabellen, nicht
sechs** — und zwei Prüfungen, die keine Zählung sind.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G5 — Die Gegenzählungen im Ziel`,
  hinter §G4)
- Test: das Dreier-Tor, geprüft in Schritt 5.

**Schnittstellen:**
- Verbraucht: `$GP` und die Lese-Regel aus §G4 / Aufgabe 5 Schritt 5 · die **fünf Sollwerte aus A1**
  (§G3 / Aufgabe 4) · ⬜ **L4**.
- Liefert: den Haken **G3** („fünf Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle —
  **paarweise**, nicht in der Summe") an §G13 / Aufgabe 14; und die vier Angaben der
  Retention-Kontrollgruppe an §G7 / Aufgabe 8.

- [ ] **Schritt 1: Die fünf Zählungen — und warum die sechste ein verbrannter Schritt wäre**

  ````markdown
  ## §G5 — Die Gegenzählungen im Ziel

  **Alle Befehle laufen gegen `$GP/data/radio.db` nach der Lese-Regel aus §G4 — kein Browser, keine
  Domain.**

  ```bash
  for t in devices software_versions users device_events loans; do
    printf '%s\t' "$t"
    sqlite3 -readonly "$GP/data/radio.db" "select count(*) from $t;"
  done
  ```

  ⚠️ **Fünf Tabellen, nicht sechs. `api_tokens` existiert im Ziel NICHT** (Entscheidung 13, B16, W4).
  Eine Sechser-Schleife bricht mit `Error: no such table: api_tokens` ab — in der Generalprobe eine
  Korrektur, im Cutover-Fenster ein **verbrannter Schritt**. `api_tokens` wird genau **einmal**
  gezählt: in der Quelle, als Protokollzeile (A1, §G3 / Aufgabe 4); sie belegt Entscheidung 13 und
  wird in Kapitel 5 (Abfrage T) wieder gebraucht.

  **Erwartung: paarweise gleich zu den fünf Sollwerten aus A1 — nicht „in der Summe".**

  > devices Q ____ / Z ____ · software_versions Q ____ / Z ____ · users Q ____ / Z ____ ·
  > device_events Q ____ / Z ____ · loans Q ____ / Z ____ · alle fünf Paare gleich? ☐ ja ☐ nein

  **Abbruch:** Ein ungleiches Paar ist **Klasse C** (§G13 / Aufgabe 14): reparieren, dann
  `rm -rf "$GP"` und die Generalprobe **von vorn**. Ein Nachbessern auf dem bestehenden Stand prüft
  die Reparatur und nicht den Import.

  ⚠️ **Ein leeres Ergebnis ist hier ein Verdacht, kein Befund.** `openModuleDatabase` legt das
  Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3
  die Datei — **ein vertipptes `DATA_DIR` ergibt eine nagelneue, leere `radio.db`, und jede Abfrage
  antwortet `0`, nicht „Datei fehlt".** Deshalb geht dieser Zählung Handgriff 4 aus §G4 voraus.
  ````

- [ ] **Schritt 2: Die drei Invarianten und die Spalte ohne Quelle**

  ````markdown
  **Die drei Invarianten, jetzt im ZIEL — Erwartung wie A2/A3/A4:**

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from software_versions where is_target = 1;"
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from device_events e left join devices d on d.id = e.device_id where d.id is null;"
  sqlite3 -readonly "$GP/data/radio.db" "select device_id, count(*) from loans where returned_at is null group by device_id having count(*) > 1;"
  ```

  **Erwartung:** genau `1` · `0` · **leer**.

  **Die zwei Spalten ohne Quelle MÜSSEN leer sein:**

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from zugangscodes;"
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from loans where zugangscode_id is not null;"
  ```

  **Beide `0`, und sie prüfen zwei verschiedene Dinge:**
  * `zugangscodes` ist **nicht Teil des Imports** (§1.4.6) — die Zeile prüft zugleich die Zusage aus
    §G8, dass **`SUITE_SEED` nicht gesetzt ist**. ⚠️ Bei `radio` ist das schärfer als bei jedem
    bisherigen Modul: ein geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum gesamten
    Bestand samt Ausleihernamen. Spec 1 §9.3.2 sagt zu, dass `seedLokal` **niemals** eine einlösbare
    Zugangszeile anlegt — **diese Zeile prüft die Zusage, statt ihr zu glauben.**
  * `loans.zugangscode_id` ist im Ziel **neu** (B6) und in der Quelle nicht vorhanden. Ein Wert ≠ NULL
    hieße, dass zwischen Import und Prüfung schon über die Suite ausgeliehen wurde — **im Fenster ein
    Alarm, kein Datenbefund.**

  **Abbruch:** `zugangscodes` ≠ 0 → `SUITE_SEED` war gesetzt. Rückweg: `rm -rf "$GP"`, Env prüfen,
  §G4 von vorn — nicht die Zeilen löschen.
  ````

- [ ] **Schritt 3: Der partielle Index — die Prüfung, die auf Struktur geht und nicht auf Text**

  ````markdown
  **Der partielle Unique-Index MUSS da sein — drizzle-kit erzeugt ihn nicht:**

  ```bash
  # (a) die STRUKTURELLE Zusicherung — sie entscheidet:
  sqlite3 -readonly "$GP/data/radio.db" \
    "select count(*) from pragma_index_list('loans') where name = 'loans_device_active_uidx' and partial = 1;"
  # (b) der Wortlaut, nur fuers Protokoll:
  sqlite3 -readonly "$GP/data/radio.db" \
    "select name, sql from sqlite_master where type = 'index' and name = 'loans_device_active_uidx';"
  ```

  **Erwartung:** (a) ist **genau `1`**. (b) liefert eine Zeile, deren `sql` **wörtlich ins Protokoll**
  geht.

  ⚠️ **Warum (a) die Zusicherung trägt und nicht (b):** `sqlite_master.sql` speichert die
  `CREATE`-Anweisung **zeichengleich so, wie sie ausgeführt wurde**. Die Quell-Migration, die
  zeichengleich übernommen wird, schreibt den Ausdruck **mit Backticks**
  (`radio-admin/server/drizzle/0003_kind_spot.sql`, letzte Zeile: ``… ON `loans` (`device_id`) WHERE
  `returned_at` IS NULL;``). Ein `instr(sql, 'WHERE returned_at IS NULL')` ergibt darauf **0** — der
  Riegel wäre **rot gegen eine vollkommen korrekte Migration**, und wer ihn daraufhin lockert,
  verliert die Unterscheidung Migrationsdefekt ↔ Importdefekt ganz.

  ⚠️ **Warum die Prüfung überhaupt nötig ist:** `loans_device_active_uidx` ist für das Drizzle-Schema
  **unsichtbar** — `0003_kind_spot.sql` sagt es selbst („it is invisible to the drizzle schema, so
  future `drizzle-kit generate` runs neither see nor drop it"). Fehlt er, ist **alles** grün: Build,
  Typecheck, Parität, jede Zählung oben. Sichtbar wird es erst, wenn ein Gerät zum **zweiten** Mal
  ausgeliehen wird.

  > Index vorhanden und partiell: ☐ ja (a) = 1 ☐ nein · Wortlaut (b): ____________________

  **Abbruch:** (a) ≠ 1 → **Migrationsdefekt, nicht Importdefekt.** Rückweg: die Handmigration
  `0001_loans_aktiv_uidx.sql` in Kapitel 1 / Spec 1 §2.9.1, danach `rm -rf "$GP"` und §G4 von vorn.
  ````

- [ ] **Schritt 4: Die zwei Ablesungen, die erst der Bau liefert — und die Zeile gegen den falschen Healthcheck**

  ````markdown
  **⬜ L4 — die Migrationszahl, beidseitig:**

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from __drizzle_migrations;"
  # Gegenwert: die Zahl der Eintraege in
  # src/app/m/radio/_db/migrations/meta/_journal.json  (⬜ L4)
  ```

  > ⬜ **L4** `__drizzle_migrations` = ____ · Einträge in `_journal.json` = ____ · gleich? ☐ ja ☐ nein

  **Die vier Angaben für die Retention-Kontrollgruppe** (sie gehen an §G7 / Aufgabe 8):

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" "select count(*) from loans where returned_at is not null;"
  sqlite3 -readonly "$GP/data/radio.db" "select id, returned_at, datetime(returned_at,'unixepoch') from loans where returned_at is not null order by returned_at desc limit 1;"
  sqlite3 -readonly "$GP/data/radio.db" "select id, returned_at, datetime(returned_at,'unixepoch') from loans where returned_at is not null order by returned_at asc  limit 1;"
  ```

  ⚠️ **Nie `/api/health` als Ersatz für diese Zählungen.** `src/app/api/health/route.ts` liefert
  konstant `{status:"ok"}` **ohne Modul und ohne Datenbank**. Und selbst `/api/health/radio` beweist
  weniger als sein Name: `SELECT 1` auf einer Datei, die bei Bedarf **neu angelegt** wird
  (`src/core/health/index.ts:8-9` gegen `src/core/db/index.ts:12-22`). **Die zählende Prüfung steht
  NEBEN dem Healthcheck, nicht an seiner Stelle.**
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Alle Blöcke benutzen `$GP` — im Abschnittskopf als Voraussetzung genannt („nach
     der Lese-Regel aus §G4"). Die `for`-Schleife ist bash und steht im `bash`-Block. Gegenprobe: kein
     `immutable=1` in diesem Abschnitt, weil die Abfragen sowohl vor als auch nach dem Start von
     `radio-gp` gefahren werden können.
  2. **Platzhalter:** ⬜ **L4** trägt seine Nummer an beiden Seiten der Gleichung.
  3. **Abbruchpunkt:** Vier Stück mit Rückweg — ungleiches Zählpaar (Klasse C), `zugangscodes` ≠ 0
     (Env, nicht Daten), Index fehlt (Migration, nicht Import), leeres Ergebnis als Verdacht.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G5 — fuenf Gegenzaehlungen, Invarianten und der partielle Index"
  ```

---

## Aufgabe 7 — §G6: Die fünf Verwechslungspaare, feldweise

Der Handgriff, der den blinden Fleck der Parität schließt. **Ein vertauschtes Spaltenpaar ändert
keine Zeilenzahl und keinen Hash** — es ändert nur, was die Oberfläche behauptet.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G6 — Die fünf Verwechslungspaare,
  feldweise`, hinter §G5)
- Test: das Dreier-Tor, geprüft in Schritt 6.

**Schnittstellen:**
- Verbraucht: `./radio-admin-snapshot.sqlite` (§G2 / Aufgabe 3) · `$GP` und die Lese-Regel (§G4 /
  Aufgabe 5) · die **fünf Auswahl-SQLs** aus **§A** (Kapitel 2, §2.2.3 Regel 3).
- Liefert: den Haken **G4** („die fünf Verwechslungspaare stimmen **zeilengenau**") an §G13 /
  Aufgabe 14; und die Regel „**die Stichproben-`id`s der Generalprobe sind Protokoll, keine Eingabe
  für den Echtlauf**" an Kapitel 4 §4.5 Schritt 5 (b).

- [ ] **Schritt 1: Die Protokollform und die zwei Arme**

  ````markdown
  ## §G6 — Die fünf Verwechslungspaare, feldweise

  **Warum feldweise und nicht als Zählung:** ein vertauschtes Spaltenpaar ändert **keine** Zeilenzahl
  und keinen Hash, wenn beide Arme dieselbe Vertauschung tragen — beide Paritätsarme laufen durch
  dieselbe Mapping-Funktion (`scripts/import/parity.ts:43-56`, `scripts/import/portal.ts:73-76`). Es
  ändert nur, was die Oberfläche behauptet.

  **Die Protokollform, je Stichprobe drei Zeilen** (§2.2.1):

  ````
  loans/returned_at  id=<id>
    quelle_ms = 1771000000000        (radio-admin-snapshot.sqlite)
    ziel_s    = 1771000000           (radio.db, $GP/data)
    rechnung  = quelle_ms / 1000 == ziel_s   -> ok
  ```

  Für ein **Textfeld** entfällt die Rechnung, und geprüft wird **zeichengleich**, nicht „sieht richtig
  aus".

  **Die zwei Arme, und ihre Lesebefehle sind verschieden:**

  | Arm | Befehl in der GENERALPROBE |
  |---|---|
  | **Quelle** | `sqlite3 -readonly radio-admin-snapshot.sqlite "<SELECT>"` — gegen die **Schnappschuss-Kopie**, nie gegen den laufenden Stack |
  | **Ziel** | `sqlite3 -readonly "$GP/data/radio.db" "<SELECT>"` — auf dem **Host**, weil `DATA_DIR` in der Generalprobe ein **Bind-Pfad** ist (§G4 / Aufgabe 5) |

  ⚠️ **Der Zielarm der Generalprobe liest NICHT über `$VOL_SUITE`.** Die `docker run … -v
  "$VOL_SUITE":/data alpine`-Form aus §2.2.2 gehört zum **Fenster**: dort liegt `radio.db` im
  produktiven Volume, und `$DATA_DIR/radio.db` gibt es auf dem Host nicht (`compose.yaml:79`, `:99`,
  `:221-223`). In der Generalprobe liegt die Datei unter `$GP/data` auf dem Host, und ein
  `-v suite_data:/data` bräche hier den Riegel aus §G4 Schritt 5 — **es läse die produktive
  Datenbank**. Wer die Fenster-Form hier fährt, bekommt entweder einen lauten Öffnungsfehler oder,
  nach dem ersten Deploy, **fünf Nullen aus einer leeren produktiven `radio.db`**, die wie ein
  misslungener Import aussehen.

  ⚠️ **Zweite Meinung erlaubt — mit EINER Ausnahme.** Auf dem Quellarm darf zusätzlich die
  Alt-Oberfläche befragt werden; sie läuft während der Generalprobe noch unter `radio.iuk-ue.de`.
  **Für `devices.last_updated_at` ist sie KEIN Schiedsrichter** — siehe Schritt 3.
  ```

- [ ] **Schritt 2: Die fünf Paare, die Auswahl auf dem Quellarm, die Spaltenliste auf dem Zielarm**

  ````markdown
  **Die fünf Auswahl-SQLs des Quellarms stehen in §A (Kapitel 2, Regel 3) — eine Fassung, nicht zwei.**
  Es sind **fünf** Paare bzw. Tripel, nicht vier (W8):

  `issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
  `borrower_name` · `alamos_integrated` ↔ `loanable` (**zwei 0/1-Integer, die niemandem auffallen**) ·
  `serial_number` ↔ `hiorg_id` ↔ `opta`

  **Der Zielarm braucht KEINE übersetzte Spaltenliste — und das ist ein Befund, keine Bequemlichkeit.**
  Die SQL-Spaltennamen sind auf **beiden** Armen zeichengleich (Spec 1 §2.5.1–§2.5.5 deklariert sie
  mit denselben snake_case-Zeichenketten wie die Quelle):

  ```sql
  -- identisch auf BEIDEN Armen — nichts wird von Hand uebersetzt:
  select id, issi, tei, serial_number, hiorg_id, opta, alamos_integrated, loanable
    from devices where id = '<id aus der Auswahl in §A>';

  select id, device_id, snapshot_call_sign, snapshot_serial_number, snapshot_device_type,
         borrower_name, borrowed_at, returned_at, return_note, created_at, updated_at
    from loans where id = '<id aus der Auswahl in §A>';

  -- Das dritte Tripel hat eine eigene Zeile, weil es in keiner der zwei Listen oben steht
  -- und weil seine drei Spalten ZWEI verschiedene Zieltypen haben:
  select id, created_at, updated_at, last_updated_at
    from devices where id = '<id aus der Auswahl in §A>';
  ```

  ⚠️ **Die dritte Abfrage ist keine Dopplung.** Die zwei Listen darüber führen `created_at`,
  `updated_at` und `last_updated_at` **nicht** — ohne sie hätte ausgerechnet das Tripel mit dem
  einzigen **Typwechsel** im ganzen Import keinen Zielarm-Handgriff, und Regel 3 wäre abgehakt, ohne
  ausgeführt worden zu sein. Auswertung: für `created_at` und `updated_at` gilt
  `quelle_ms / 1000 == ziel_s`; für `last_updated_at` gilt Schritt 3.

  ⚠️ **Warum die Zeichengleichheit ausdrücklich dasteht:** eine Spaltenliste von Hand nach camelCase
  zu übersetzen ist selbst eine Vertauschungsgelegenheit — in genau der Prüfung, die Vertauschungen
  fangen soll. Wer auf dem Zielarm `snapshotCallSign` schreibt, bekommt „no such column" (laut,
  harmlos); wer zwei Namen dabei vertauscht, bekommt eine **grüne Stichprobe** (still, teuer).
  ````

- [ ] **Schritt 3: `devices.last_updated_at` — der Sollwert, ausgeschrieben statt zwei Kandidaten**

  ````markdown
  **`devices.last_updated_at` ist der Sonderfall: die einzige Spalte mit Typwechsel** (`integer` ms →
  TEXT `YYYY-MM-DD`). `sqlite3` kennt `Europe/Berlin` nicht, und `'+1 hour'` ist über die
  Sommerzeitgrenze falsch — der erwartete Wert ist **nicht per SQL berechenbar**. Deshalb die zwei
  Kandidatentage nebeneinander, **und darunter die Regel, welcher von beiden der Sollwert ist**:

  ```sql
  -- QUELLE: die zwei moeglichen Kalendertage plus die Uhrzeit, die entscheidet.
  select id, last_updated_at,
         time(last_updated_at/1000, 'unixepoch')            as uhrzeit_utc,
         date(last_updated_at/1000, 'unixepoch')            as utc_tag,
         date(last_updated_at/1000, 'unixepoch', '+1 day')  as utc_tag_plus1
    from devices where id = '<id aus der Auswahl in §A>';
  ```

  ⚠️ **`utc_tag` und `utc_tag_plus1` sind ein Plausibilitätsrahmen, KEINE zwei zulässigen Antworten.**
  Der Sollwert ist der **Berliner** Kalendertag (Spec 1 §2.2.3, `tagInBerlin`), und er ist
  determiniert:

  > **Regel:** `uhrzeit_utc >= 22:00` (Sommerzeit) bzw. `>= 23:00` (Winterzeit) → Sollwert ist
  > **`utc_tag_plus1`**. Sonst → **`utc_tag`**.

  **Warum das ausgeschrieben dasteht:** ohne diese Regel besteht ein Mapper mit
  `new Date(ms).toISOString().slice(0,10)` die Produktionsstichprobe, weil `utc_tag` einer von zwei
  „akzeptierten" Kandidaten wäre — **genau der Mapper, den die Zusicherung in §1.3.4 verwirft.**

  ⚠️ **Und die Alt-Anwendung ist für DIESE eine Spalte keine zulässige zweite Meinung.** Sie
  widerspricht sich selbst: `radio-admin/server/src/routes/export.ts:49-51` formatiert
  `lastUpdatedAt` als **UTC**-Tag (`new Date(value).toISOString().slice(0,10)`, Kommentar `:42`),
  während `client/src/utils/format.ts:4` (`toLocaleString('de-DE')`) und
  `client/src/features/devices/DeviceEditForm.tsx:41`, `:61` ihn als **lokalen (Berliner)** Tag lesen
  und schreiben. Wer die Detailansicht öffnet, bekommt den Berliner Tag; wer den CSV-Export zieht, den
  UTC-Tag. **Für alle anderen Spalten bleibt die Alt-Oberfläche die zweite Meinung.**

  **Die diskriminierende Zeile finden — sie ist die einzige, die `tagInBerlin` überhaupt prüft:**

  ```sql
  select id, last_updated_at, time(last_updated_at/1000,'unixepoch') as uhrzeit_utc
    from devices
   where last_updated_at is not null
     and last_updated_at % 86400000 >= 79200000
   limit 1;
  ```

  ⚠️ **Findet dieser Filter keine Zeile, ist `tagInBerlin` an den Produktionsdaten NICHT prüfbar**, und
  die Zusage ruht allein auf den drei `tagInBerlin`-Unit-Tests (§1.3.4). **Das ist eine
  Protokollzeile, kein grüner Haken.** Und der Filter ist ein **Kandidaten**filter: im Winter liegt
  lokale Mitternacht bei 23:00 UTC. Deshalb steht neben dem Zielwert die **Uhrzeit** im Protokoll,
  nicht nur der Tag.

  > `last_updated_at` id=________ · `uhrzeit_utc` = ________ · Sollwert nach Regel = ________ ·
  > Zielwert = ________ · gleich? ☐ ja ☐ nein ☐ keine Zeile gefunden (dann: nur Unit-Test)
  ````

- [ ] **Schritt 4: Regel 4 — je Tabelle mindestens eine Zeile, und diese zwingend**

  ````markdown
  **Je Tabelle mindestens eine Stichprobe, und diese hier zwingend:**

  | Tabelle | Pflicht-Stichprobe | Grund |
  |---|---|---|
  | `devices` | die Zeile mit den meisten gesetzten Feldern + die **älteste** Zeile + die fünf Paar-Zeilen | 25 Spalten, alle Verwechslungspaare liegen hier. Die älteste Zeile ist die einzige, die den **Backfill- und NULL-Weg** durchläuft (`tei` kam erst mit Migration `0004`, `update_note` mit `0001`) |
  | `software_versions` | **die Zeile mit `is_target = 1`**, zwingend | Der Update-Stand ist berechnet, nicht gespeichert (`radio-admin/server/src/db/schema.ts:53-56`). Kippt diese eine Zeile, kippt der Status **jedes** Geräts |
  | `users` | die Zeile mit dem größten `last_seen_at` + eine mit dem kleinsten | 3 Spalten; `sub` ist PK und steht in sechs Auditspalten — ein verändertes `sub` entkoppelt das Journal von Personen |
  | `device_events` | **eine Zeile je vorkommendem `source`-Wert** (`select source, min(id) from device_events group by source;`) | `source` ist ein TS-Enum **ohne** DB-CHECK |
  | `loans` | eine **abgeschlossene** (`returned_at is not null`) **und** eine **aktive** (`returned_at is null`) | Die zwei Fälle verhalten sich unter dem Faktor-1000-Fehler **gegensätzlich** (§G7 / Aufgabe 8) |

  ⚠️ **Liefert eine Auswahl keine Zeile, ist das ein Protokolleintrag, kein Freibrief.** „Kein Gerät
  hat `alamos_integrated <> loanable`" heißt: die Vertauschung dieser zwei 0/1-Ganzzahlen ist an den
  Produktionsdaten **nicht prüfbar**, und das Tor bleibt allein der Unit-Test. **Das muss dastehen,
  sonst hält jemand später eine ungeprüfte Zusage für geprüft.**

  ⚠️ **Die Stichproben-`id`s der Generalprobe sind Protokoll, KEINE Eingabe für den Echtlauf**
  (§2.2.4). Im Fenster werden die Auswahl-SQLs **erneut** gefahren und die `id`s **neu** abgelesen —
  der Bestand hat sich bis dahin bewegt.

  **Abbruch:** Eine Stichprobe, deren Werte nicht übereinstimmen, ist **Klasse C**: reparieren, dann
  `rm -rf "$GP"` und die Generalprobe von vorn. ⚠️ Eine **vertauschte** Zuordnung ist dabei kein
  Runbook-Fund, sondern ein Mapper-Fund — der Rückweg führt nach Kapitel 1, nicht in einen zweiten
  Import auf demselben Stand.
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Die zwei Lesebefehle stehen als Tabellenzeilen mit vollständiger Befehlszeile; die
     SQL-Blöcke sind für beide Arme identisch und werden mit dem jeweiligen Befehl davor gefahren.
     Gegenprobe: `suite_data` und `$VOL_SUITE` kommen in diesem Abschnitt **ausschliesslich in der
     Warnung** vor, die sie fuer die Generalprobe verbietet — in **keiner** ausfuehrbaren Zeile.
  2. **Platzhalter:** `<id aus der Auswahl in §A>` benennt Herkunft **und** Fundort; die
     Protokollzeile zu `last_updated_at` hat für jeden Wert ein eigenes Feld.
  3. **Abbruchpunkt:** Drei Stück — falscher Zielarm-Lesebefehl (mit dem stillen Fehlfall „fünf
     Nullen"), keine Zeile gefunden (Protokoll statt Haken), Wertabweichung (Klasse C, Rückweg
     Kapitel 1).

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G6 — fuenf Verwechslungspaare feldweise, mit Berliner Sollwert"
  ```

---

## Aufgabe 8 — §G7: Die Gegenprobe gegen den Faktor 1000

Der teuerste Fehler dieses Ports ist **paritätsgrün UND löscht die Leihhistorie**. Diese drei Proben
sind die einzigen Betriebsproben, die ihn finden.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G7 — Die Gegenprobe gegen den Faktor
  1000`, hinter §G6)
- Test: das Dreier-Tor, geprüft in Schritt 5.

**Schnittstellen:**
- Verbraucht: `$GP` und die Lese-Regel (§G4 / Aufgabe 5) · die **A8-Vorhersage** aus §G3 / Aufgabe 4 ·
  die vier Angaben der Retention-Kontrollgruppe aus §G5 / Aufgabe 6.
- Liefert: den Haken **G5** („die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand") an §G13 /
  Aufgabe 14; und den **Wortlaut von Abfrage Z**, den Kapitel 5 §5.2.2 zeichengleich führen muss.

- [ ] **Schritt 1: Warum diese Probe existiert — die Kette in vier Sätzen**

  ````markdown
  ## §G7 — Die Gegenprobe gegen den Faktor 1000

  **Die Kette, die diesen Abschnitt trägt:** Quelle ist epoch-**Millisekunden**
  (`radio-admin/server/src/db/schema.ts:37-38`, `:126-130`; der Kommentar `:103-104` sagt es), Ziel ist
  Drizzle `mode: "timestamp"` = Unix-**Sekunden** (Entscheidung 11). Parität vergleicht Zeilen-Hashes
  aus **derselben** Mapping-Funktion auf **beiden** Armen — ein konsistenter Fehler hasht beidseitig
  gleich. Und `radio-admin/server/src/index.ts:35` startet einen Retention-Purge, der **sofort** läuft
  (`retentionService.ts:47`), Cutoff = jetzt minus zwei Monate. **Sekunden statt Millisekunden legt
  jedes `returned_at` ins Jahr 1970 → der nächste Boot löscht die komplette abgeschlossene
  Leihhistorie.** Aktive Leihen (`returned_at IS NULL`) überleben. **Der Import-Test bleibt grün.**

  ⚠️ **Diese drei Proben ersetzen den Mapping-Unit-Test nicht** (§1.3.4, Fixture-Werte **je Feld
  unterschiedlich**). Sie sind die Betriebsprobe **daneben**. Der Test läuft in der CI und muss **vor**
  der Generalprobe grün sein (§G1 / Aufgabe 2 Nr. 1).
  ````

- [ ] **Schritt 2: Probe (a) und (b)**

  ````markdown
  ### (a) Die Retention-Zahl aus A8 muss im Ziel wiederzufinden sein — in SEKUNDEN

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" \
    "select count(*) from loans
      where returned_at is not null
        and returned_at < strftime('%s','now','-2 months');"
  ```

  **Erwartung:** dieselbe Zahl wie die A8-Vorhersage aus §G3 / Aufgabe 4.

  ⚠️ **`'now'` ist HIER zulässig und im Fenster NICHT.** In der Generalprobe liegen beide Auswertungen
  Sekunden auseinander, und kein Freigabeschritt hängt daran. **Im Fenster wird derselbe Vergleich mit
  `<freeze_iso>` in BEIDEN Armen gefahren** (W3, Abfrage R in §5.2.2): eine Leihe, deren `returned_at`
  genau auf der Zwei-Monats-Grenze liegt, wechselt zwischen zwei `now`-Auswertungen die Seite, und die
  Erwartung „dieselbe Zahl wie vorhin" ist dann **rot ohne Fehler** — mitten im Fenster, neben einem
  Handgriff, der „Import verwerfen, `radio.db` löschen, Mapper korrigieren" lautet.

  > (a) A8-Vorhersage = ____ · Ziel = ____ · gleich? ☐ ja ☐ nein

  ### (b) Der Fingerabdruck — eine Zeile, eindeutig

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" \
    "select min(returned_at), max(returned_at), count(*)
       from loans where returned_at is not null;"
  ```

  Die Quelldaten stammen aus dem Betrieb dieser Anwendung; ein `max(returned_at)` unterhalb von etwa
  `1000000000` (2001) ist damit **ausgeschlossen**. Zeigt (b) einen 1970er-Stand, ist der
  Faktor-1000-Fehler **bewiesen** — und zwar **bevor** der erste Retention-Lauf ihn unsichtbar macht.

  > (b) min = ________ · max = ________ · count = ____ · `datetime(max,'unixepoch')` = ____________

  **Abbruch bei (a) oder (b):** **Klasse C** — Mapper korrigieren (Kapitel 1), dann `rm -rf "$GP"` und
  die Generalprobe **von vorn**. ⚠️ Kein Nachbessern der Zahlen in der Ziel-DB: das repariert die
  Anzeige und nicht den Import.
  ````

- [ ] **Schritt 3: Abfrage Z — ausgeschrieben, weil sie hier gefahren wird**

  ````markdown
  ### (c) Abfrage Z — die spaltengenaue Fassung derselben Probe

  (a) und (b) sagen **dass** etwas nicht stimmt. **Z sagt, WELCHE Spalte betroffen ist.** Sie wird
  deshalb auch in der Generalprobe gefahren, nicht erst beim Abbau.

  ⚠️ **In der GENERALPROBE liest Z auf dem Host** (`$GP/data/radio.db`, Bind-Pfad, §G4). **Im Fenster
  und beim Abbau** liest dieselbe Abfrage über die `docker run … -v "$VOL_SUITE":/data alpine`-Form
  (§2.2.2, §5.2.2) — dort liegt die Datei im Volume, und `$DATA_DIR/radio.db` gibt es auf dem Host
  nicht. **Es ist dieselbe Abfrage, aber nicht derselbe Lauf: der Generalproben-Lauf ist KEINE
  Abbau-Sperre.**

  ⚠️ **Der folgende Block ist eine von drei Fassungen derselben Abfrage im selben Runbook** — hier
  (§G7), in **§C Schritt 5 (d)** und in **§5.2** (Abbau). **Leitfassung ist §C Schritt 5 (d)**: die
  zehn Glieder sind in allen dreien zeichengleich, abweichen darf **allein** die Zugriffsform (Absatz
  oben). Wer hier eine Zeile ändert, ändert sie in allen dreien — sonst probt die Generalprobe eine
  andere Abfrage, als die zwei ⛔-Sperren im Fenster und beim Abbau fahren.

  ```bash
  sqlite3 -readonly "$GP/data/radio.db" "
  select 'loans.returned_at',        count(*) from loans
     where returned_at is not null and (returned_at < 946684800 or returned_at > 4000000000)
  union all
  select 'loans.borrowed_at',        count(*) from loans
     where borrowed_at  < 946684800 or borrowed_at  > 4000000000
  union all
  select 'loans.created_at',         count(*) from loans
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'loans.updated_at',         count(*) from loans
     where updated_at   < 946684800 or updated_at   > 4000000000
  union all
  select 'devices.created_at',       count(*) from devices
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'devices.updated_at',       count(*) from devices
     where updated_at   < 946684800 or updated_at   > 4000000000
  union all
  select 'software_versions.created_at', count(*) from software_versions
     where created_at   < 946684800 or created_at   > 4000000000
  union all
  select 'users.last_seen_at',       count(*) from users
     where last_seen_at < 946684800 or last_seen_at > 4000000000
  union all
  select 'device_events.changed_at', count(*) from device_events
     where changed_at   < 946684800 or changed_at   > 4000000000
  union all
  select 'devices.last_updated_at (Formatprobe)', count(*) from devices
     where last_updated_at is not null
       and last_updated_at not glob '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]';"
  ```

  * **Alle ZEHN Zeilen MÜSSEN `0` sein** — neun Zahlgrenzproben **plus** die Formatprobe auf
    `devices.last_updated_at`. ⚠️ Wer „drei" oder „neun" liest, kürzt unter Zeitdruck und lässt
    Spalten ungeprüft, die genau denselben Fehler tragen können.
  * `946684800` = 2000-01-01T00:00:00Z · `4000000000` = 2096-10-02T07:06:40Z.
  * ⚠️ **Beide Grenzen, und die obere ist nicht Zierrat:** `< 946684800` fängt Sekunden in einer
    Millisekunden-Quelle (**Jahr 1970**), `> 4000000000` fängt die **Gegenrichtung** — rohe
    Millisekunden, die ungeteilt in einer Sekundenspalte landen (**Jahr 57000**).
  * ⚠️ **Neun Spalten sind Zahlen, die zehnte ist Text.** `devices.last_updated_at` ist die einzige
    Spalte mit Typwechsel; für sie ist die Grenzprobe eine **Formatprobe**. **Sie sagt nichts über die
    Zone** — das tut nur die Zusicherung aus §1.3.4 und die Sollwert-Regel in §G6 / Aufgabe 7
    Schritt 3.

  > Z: zehn Zeilen abgelesen, alle `0`? ☐ ja ☐ nein — abweichende Zeile(n): ____________________
  ````

- [ ] **Schritt 4: Was eine Abweichung bedeutet, und was sie NICHT bedeutet**

  ````markdown
  **Abweichung in Z bedeutet:** genau der Faktor-1000-Fehler, und die Zeile sagt, in welcher Spalte.
  Der Mapper hat je Feld eine eigene Zeile — eine einzelne betroffene Spalte ist deshalb **plausibel**
  und nicht „dann stimmt gar nichts".

  **Rückweg:** Mapper in Kapitel 1 korrigieren · `rm -rf "$GP"` · §G4 von vorn. ⚠️ **Nicht** die Werte
  in der Ziel-DB umrechnen: der nächste Lauf schriebe sie wieder falsch, und die Korrektur stünde
  nirgends im Code.

  ⚠️ **Und der Fall, der wie ein Fehler aussieht und keiner ist:** ist `loans` leer oder trägt keine
  abgeschlossene Leihe, sind (a), (b) und Z **trivial grün**. Dann steht im Protokoll „nicht prüfbar",
  nicht „grün" — dieselbe Regel wie bei den Verwechslungspaaren (§G6 / Aufgabe 7 Schritt 4).
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Drei Blöcke, alle gegen `$GP/data/radio.db`. Das SQL von Z ist **ein**
     doppelt-gequotetes Argument und enthält nur einfache Anführungszeichen im Inneren — keine
     Verschachtelungsebene, die beim Einfügen bricht. Gegenprobe: die zehn `select`-Glieder einmal
     nachzählen.
  2. **Platzhalter:** Keine ⬜-Nummer nötig — alle Werte entstehen aus vorherigen Abschnitten dieses
     Kapitels und tragen dort ihre Nummer.
  3. **Abbruchpunkt:** Drei Stück mit Rückweg, dazu die ausdrückliche Regel, dass Z im Fenster/Abbau
     über eine **andere** Lesform läuft und der Generalproben-Lauf **keine** Abbau-Sperre ist.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G7 — Faktor-1000-Gegenprobe, Abfrage Z mit zehn Zeilen"
  ```

---

## Aufgabe 9 — §G8: Der ephemere Prüfcontainer

**Der einzige Weg, vor dem Umschwenk überhaupt etwas zu prüfen** — weil `radio.iuk-ue.de` schon
besetzt ist und zwei Router auf einer Domain eine physische Grenze sind, keine Vorsichtsregel.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G8 — Der ephemere Prüfcontainer`,
  hinter §G7)
- Test: das Dreier-Tor, geprüft in Schritt 7.

**Schnittstellen:**
- Verbraucht: `$IMG`, `$GP`, `$UID_APP`, `$GID_APP` bzw. ⬜ **N3** (aus §G0 / Aufgabe 1 und §G4 /
  Aufgabe 5).
- Liefert: den laufenden Container **`radio-gp`** auf `127.0.0.1:3999`, die Basis-Variablen
  **`B=http://127.0.0.1:3999`** und **`H='Host: radio.iuk-ue.de'`** an §G9 / Aufgabe 10, die
  Browser-Adresse **`http://localhost:3999`** an §G10 / Aufgabe 11, und den Lese-Zustand
  „`radio-gp` läuft" an §G5–§G7 (Regel aus §G4 / Aufgabe 5 Schritt 5).

- [ ] **Schritt 1: Warum ohne Labels, welches Netz, welches Volume**

  ````markdown
  ## §G8 — Der ephemere Prüfcontainer

  **Ohne Traefik-Labels.** Ein zweiter Router auf ``Host(`radio.iuk-ue.de`)`` ist ausgeschlossen, weil
  dieser Container **gar nicht an Traefik hängt** (Vorbild `docs/runbooks/portal-cutover.md:35-37`).
  Erreicht wird er über Loopback und Port.

  **Welches Netz: das Standard-Bridge-Netz. Ausdrücklich nicht `proxy`, ausdrücklich nicht `av`.** Der
  reguläre Dienst hängt in `networks: [proxy, av]` (`compose.yaml:127`); der Prüfcontainer braucht
  keines von beiden. `proxy` ist das Netz, über das Traefik die Container erreicht — ihn dort
  herauszuhalten ist der **zweite, unabhängige Riegel** neben den fehlenden Labels. `av` bedient
  ClamAV für `files`-Uploads und ist für `radio` ohne Bedeutung.

  **Welches Volume: ⚠️ in der GENERALPROBE niemals das produktive.** Prod ist `suite_data` —
  deterministisch, ohne Projektpräfix (`compose.yaml:252-254`). Der Prüfcontainer der Probe mountet
  das Wegwerf-Verzeichnis aus §G4. `files_data` und `aufgaben_data` werden ebenfalls **nicht**
  gemountet; der Container ist für die Dauer der Probe eine Suite ohne Dateien und ohne Aufgaben —
  **das ist richtig und kein Mangel.**

  > **Der Riegel, mit seinem Geltungsbereich:** die `docker run`-Zeile **DER GENERALPROBE** enthält die
  > Zeichenkette `suite_data` nicht. ⚠️ Für den **Fenster**-Prüfcontainer (§4.5 Schritt 8) gilt er
  > **nicht** — dort ist `suite_data` das Prüfobjekt (W5). Wer ihn ohne Geltungsbereich zitiert, macht
  > Schritt 8 unausführbar.
  ````

- [ ] **Schritt 2: Die `docker run`-Form — mit dem Host als KOMMALISTE**

  ````markdown
  ```bash
  IMG=<die Image-Referenz aus §G0>
  GP=<der Pfad aus §G0>
  UID_APP=<aus §G4 Handgriff 0>          # bzw. die Server-Kennung ⬜ N3
  GID_APP=<aus §G4 Handgriff 0>

  docker run --rm -d --name radio-gp \
    --user "$UID_APP:$GID_APP" \
    -p 127.0.0.1:3999:3000 \
    -v "$GP/data":/data \
    -e DATA_DIR=/data \
    -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
    -e SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp \
    -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
    -e RADIO_HISTORIE_PURGE=0 \
    -e AUTH_SECRET="$(openssl rand -hex 32)" \
    -e AUTH_URL=http://localhost:3999 \
    -e AUTH_TRUST_HOST=true \
    -e AUTH_DEV_LOGIN=true \
    "$IMG"
  ```

  ⚠️ **`SUITE_HOST_RADIO` trägt ZWEI Werte, und das ist der Unterschied zwischen einer Prüfung und
  einem Selbstbetrug.** Der kopfgestützte Prüfsatz (§G9 / Aufgabe 10) fährt
  `curl -H 'Host: radio.iuk-ue.de'`; der browsergestützte (§G10 / Aufgabe 11) fährt
  `http://localhost:3999`. **Mit nur `localhost` beansprucht `radio` genau den Host `localhost` — der
  Kopf `radio.iuk-ue.de` trifft dann KEIN Modul und fällt auf das Portal zurück.** Nachgerechnet:
  `moduleForHost` vergleicht **exakt** gegen `prodHostsFor` (`src/core/registry.ts:225-232`), das
  Portal führt `prodHosts: ["iuk-ue.de"]` als **Code-Default**, und `decideRoute` endet mit
  `moduleForHost(host) ?? getModule("portal")` und für `groups === null` in `{ action: "login" }`
  (`src/core/routing.ts:69-73`). Die kopfgestützten Zeilen prüften dann den **Portal-Login**, nicht
  `radio` — und zwei davon (V2 und V6) wären dabei **grün**, weil das Portal genau diese Antwort
  liefert.

  **Warum die Kommaliste zulässig ist, nachgeschlagen und nicht angenommen:**
  1. `envHostsFor` splittet auf `,` und trimmt (`src/core/hosts.ts:39-46`) — **Mehrfachhosts sind
     vorgesehen**, `files` fährt sie produktiv.
  2. `validateHostConfig` weist einen Wert nur ab, wenn er `/` oder `:` enthält
     (`src/core/hosts.ts:80-85`); **beide Werte enthalten keines von beiden**. Ein
     `SUITE_HOST_RADIO=localhost:3999` wäre dagegen ein Startabbruch.
  3. Die Doppelvergabeprüfung (`src/core/hosts.ts:86-95`) bleibt still: kein anderes Modul führt
     `localhost` oder `radio.iuk-ue.de` in seiner `SUITE_HOST_*`-Variable.
  4. `moduleForHost` schneidet den Port ab (`registry.ts:226`), also trifft `localhost:3999` →
     `localhost` → `radio`.
  5. `/login`, `/api/auth`, `/api/health` und `/_next` sind PASSTHROUGH (`src/core/routing.ts:12`) —
     der Dev-Login funktioniert weiter, obwohl `radio` beide Hosts beansprucht.

  **Zulässige Alternative, falls jemand nur einen Wert je Container will:** zwei getrennte
  `docker run` mit je einem Wert und je einem Port. **Nicht zulässig ist ein Container mit einem Wert
  und beiden Prüfsätzen.**
  ````

- [ ] **Schritt 3: Zeile für Zeile — jede ist eine Prüfung oder vermeidet eine Falle**

  ````markdown
  | Zeile | Warum sie so lautet |
  |---|---|
  | `--rm -d --name radio-gp` | benannt, damit `docker logs`/`docker stop` ohne ID gehen; `--rm`, damit kein Prüfcontainer liegen bleibt und irgendwann als „der läuft doch" gelesen wird |
  | `--user "$UID_APP:$GID_APP"` | §G4 Handgriff 0: der Import muss dieselbe Kennung benutzt haben wie der Prozess (`Dockerfile:88`, `:71`, `:42-43`). ⚠️ Weicht die Server-Kennung ⬜ **N3** ab, steht **sie** hier |
  | `-p 127.0.0.1:3999:3000` | ⚠️ **die Bindung an `127.0.0.1` ist Absicht.** Ohne sie ist die Probe von außen erreichbar — mit `AUTH_DEV_LOGIN=true` und einem Bestand samt Ausleihernamen darin. Der Container hört auf 3000 (`Dockerfile:89`, `compose.yaml:155`) |
  | `-v "$GP/data":/data` + `DATA_DIR=/data` | derselbe Pfad wie im regulären Stack (`compose.yaml:79`), nur ein anderes Ziel. `radio.db` liegt damit unter `DATA_DIR` — **eine** Datei, kein zweiter Store |
  | `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` | Schritt 2 — beide Prüfsätze aus **einem** Container |
  | `SUITE_ADMIN_GROUP_RADIO=radio-verwaltung-gp` | Pflicht, sonst startet die **gesamte** Suite nicht (Schritt 4). Der Wert ist frei erfunden und darf es sein: `AUTH_DEV_LOGIN` nimmt Gruppen als **freies Feld** an (`src/core/registry.ts:137`). **E1 blockiert diese Probe nicht** |
  | `RADIO_AUSLEIH_SITZUNG_SECRET` | Pflicht, ≥ 32 Zeichen, **≠ `AUTH_SECRET`** (Schritt 4) |
  | `RADIO_HISTORIE_PURGE=0` | §G11 / Aufgabe 12 |
  | `AUTH_SECRET` | frisch erzeugt, **nie** der Prod-Wert in einem Prüfcontainer |
  | **`AUTH_URL=http://localhost:3999`** | ⚠️ **die Zeile, die am leichtesten fehlt und deren Fehlen wie ein Moduldefekt aussieht.** Auth.js leitet seine `baseUrl` aus `AUTH_URL` ab — **immer** (`src/core/auth/redirect.ts:8`, `callbackUrl.ts:4`, `redirect.test.ts:7`). Im regulären Stack steht sie in `compose.yaml:80`, aber das greift über die compose-Ersetzung; ein `docker run` ohne die Zeile hat sie **nicht**. Sie muss **zeichengleich die Origin der Probe** sein, sonst führt der Dev-Login aus `localhost:3999` heraus und kommt nicht zurück |
  | **`AUTH_TRUST_HOST=true`** | im regulären Stack unbedingt gesetzt (`compose.yaml:82`). Fehlt sie, misstraut Auth.js dem Host der Probe |
  | `AUTH_DEV_LOGIN=true` | `src/core/auth/devLogin.ts:10-11`: „force on (**even in production**)". Nur so ist die Verwaltungsfläche ohne Pocket ID prüfbar — und weil Pocket ID ungefragt bleibt, braucht die Probe **kein** `POCKET_ID_*` |
  | **kein** `SUITE_SEED` | ein geseedeter Zugangscode wäre ein **gültiger anonymer Zugang** zum ganzen Bestand. Abgelesen wird die Zusage in §G5 / Aufgabe 6 (`select count(*) from zugangscodes;` MUSS 0 sein) |
  | **kein** `SUITE_TRAEFIK_RULE` | die Warnung „Host nicht in der Rule" feuert nur, wenn **beide** Variablen gesetzt sind. Ohne die Rule bleibt sie still — im Prüfcontainer richtig, weil die Labels auf dem Server leben |
  | **kein** `AUTH_COOKIE_DOMAIN` | ⚠️ **bewusst, mit einer benannten Folge:** der reguläre Stack setzt `AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}` (`compose.yaml:83`), die Probe nicht. Das **Suite**-Sitzungscookie ist in der Probe damit host-only und in Produktion domain-weit — **über diese eine Eigenschaft sagt die Probe deshalb nichts.** Das Ausleih-Cookie `radio_ausleihe` ist davon unberührt: es trägt **nie** ein `domain` (Spec 1 §3.4.1), und die Zusicherung dafür ist eine **Quelltext**-Zusicherung (§G1 / Aufgabe 2 Nr. 2), kein Abruf |
  | **keine** `labels:` | Schritt 1 |
  ````

- [ ] **Schritt 4: Die Env-Liste ist selbst eine Prüfung — und wird einmal absichtlich rot gefahren**

  ````markdown
  **Sobald `SUITE_HOST_RADIO` einen Wert hat, ist `radio` eingeschaltet.** `radioBootFehler()` steigt
  als erste Anweisung mit `prodHostsFor(getModule("radio"), env).length === 0` aus (Spec 1 §7.3.2), und
  mit `prodHosts: []` in der Registry ist dieser Schalter genau „der Betreiber hat radio
  eingeschaltet".

  Damit laufen im Prüfcontainer **dieselben fünf Boot-Prüfungen wie in der Produktion**, und jeder
  zurückgegebene String **ist** ein Startabbruch — `assertHostConfig` wirft bei `length > 0`
  (`src/core/bootstrap.ts:92`):

  * `SUITE_ADMIN_GROUP_RADIO` fehlt → **die Suite startet nicht.** Nicht `radio` allein: portal, qr,
    feedback, files, lagerbuch und aufgaben stehen mit.
  * `RADIO_AUSLEIH_SITZUNG_SECRET` fehlt, ist kürzer als 32 Zeichen **oder gleich `AUTH_SECRET`** →
    dasselbe.
  * `SUITE_ACCESS_GROUP_RADIO` gesetzt → dasselbe, und zwar richtig: der Wert wäre **still
    wirkungslos** (`canAccess` steigt für `requiresAuth: false` sofort mit `true` aus,
    `src/core/registry.ts:239`).
  * `RADIO_HISTORIE_MONATE=0` → dasselbe. `0` wird ausdrücklich abgewiesen und **nicht** als „aus"
    gelesen; `0` Monate löschte beim ersten Lauf die gesamte abgeschlossene Historie.

  **Das ist ein Gewinn, kein Hindernis.** Die Generalprobe ist die erste und einzige Gelegenheit, die
  Boot-Prüfungen unter echten Bedingungen feuern zu sehen — und ohne die Einhängung in
  `src/core/bootstrap.ts` laufen **alle** Prüfungen nie, die Tests dazu sind grün und `pnpm build`
  auch. **„Für die Boot-Haken gibt es kein Netz."**

  **Vorgeschriebener Handgriff — die Probe wird EINMAL absichtlich rot gefahren:**

  ```bash
  docker run --rm --name radio-gp-rot \
    --user "$UID_APP:$GID_APP" -p 127.0.0.1:3999:3000 \
    -v "$GP/data":/data -e DATA_DIR=/data \
    -e SUITE_HOST_RADIO=localhost,radio.iuk-ue.de \
    -e RADIO_AUSLEIH_SITZUNG_SECRET="$(openssl rand -hex 32)" \
    -e AUTH_SECRET="$(openssl rand -hex 32)" -e AUTH_URL=http://localhost:3999 \
    -e AUTH_TRUST_HOST=true \
    "$IMG"
  # ohne SUITE_ADMIN_GROUP_RADIO — ERWARTET: Startabbruch, Meldung im Vordergrund lesen
  ```

  > Abbruchmeldung wörtlich: ____________________ · gelesen am ____________

  **Wer diesen Abbruch nie gesehen hat, weiß am Cutover-Abend nicht, ob eine startende Suite die
  Prüfungen bestanden hat oder ob sie nie gelaufen sind.** Danach die Variable wieder setzen und den
  Container aus Schritt 2 starten.
  ````

- [ ] **Schritt 5: Startprobe statt blindem Warten**

  ````markdown
  **Der Container ist bereit, wenn er antwortet — nicht nach einer geschätzten Anzahl Sekunden:**

  ```bash
  for i in $(seq 1 30); do
    code=$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3999/api/health || true)
    [ "$code" = "200" ] && { echo "bereit nach ${i}s"; break; }
    sleep 1
  done
  docker logs radio-gp 2>&1 | tail -30
  ```

  ⚠️ **`/api/health` ist hier richtig und nur hier:** die Route ist PASSTHROUGH
  (`src/core/routing.ts:12`) und braucht deshalb **keinen** `Host`-Kopf, und sie liefert konstant
  `{status:"ok"}` **ohne Modul und ohne Datenbank** — als **Bereitschaftsprobe** genau richtig, als
  Moduländerungsbeleg wertlos. Der Modulbeleg ist `/api/health/radio` in §G9 / Aufgabe 10 (V3).

  **Abbruch:** Antwortet nach 30 Sekunden nichts, ist der Container **gestartet und wieder
  ausgestiegen** — das ist fast immer eine der fünf Boot-Prüfungen aus Schritt 4 und **kein
  Moduldefekt**. Rückweg: `docker logs radio-gp 2>&1 | tail -30` lesen, die genannte Env-Zeile
  ergänzen, neu starten. ⚠️ **Nicht** bei `files` suchen: `filesBootFehler()` prüft die Ablage nur bei
  gesetztem `SUITE_HOST_FILES` (`src/app/m/files/_lib/boot.ts:82-95`), und die Env-Liste oben setzt
  es nicht.
  ````

- [ ] **Schritt 6: Die drei Stufen — und was Stufe 3 ausdrücklich nicht beweist**

  ````markdown
  ### Wie der Modul-Host vorgetäuscht wird — drei Stufen, zwei davon verbindlich

  | Stufe | Form | Kauft | Kauft **nicht** |
  |---|---|---|---|
  | **1** | `curl -H 'Host: radio.iuk-ue.de'` gegen `127.0.0.1:3999` | jede HTTP-Aussage: Status, Header, Weiterleitung, Rumpf — mit dem **zeichengleichen** Prod-Host im Kopf | alles, was einen Browser braucht |
  | **2** | Browser auf `http://radio.localtest.me:3999` | Modulauflösung ohne jede Env-Zeile (`src/core/registry.ts:228`) | ⚠️ **kein sicherer Kontext** und damit **kein Secure-Cookie**. Der Ausleihweg **sieht dort kaputt aus, obwohl er es nicht ist** |
  | **3** | Browser auf `http://localhost:3999` | dasselbe **plus** vertrauenswürdiger Origin: sicherer Kontext, Secure-Cookies werden angenommen | den echten TLS-Handschlag, Cloudflare, den echten Hostwert |

  **Verbindlich ist Stufe 3 für alles Browsergestützte und Stufe 1 für alles Kopfgestützte.** Stufe 2
  steht hier nur, damit niemand sie für den bequemen Weg hält: **sie ist der Weg, der eine intakte
  Ausleihe als Fehler ausweist.**

  ⚠️ **Stufe 3 ist ZWEI zeichengleiche Werte, nicht einer:** `AUTH_URL` muss mitwandern und
  `http://localhost:3999` lauten. Der Präzedenzfall heißt im Haus anders und meint dasselbe:
  `docs/runbooks/lagerbuch-cutover.md:158` — „⚠️ `APP_BASE_URL` und `SUITE_HOST_LAGERBUCH` müssen
  ZEICHENGLEICH derselbe Host sein", dort „der teuerste Einzelposten aus dem Bau von Teil 4".

  ⚠️ **Was Stufe 3 ausdrücklich NICHT beweist — die wichtigste Einschränkung dieses Abschnitts.** Sie
  beweist, dass das Modul unter **einem beanspruchten Host** arbeitet. Sie beweist **nicht**, dass der
  Produktionswert `SUITE_HOST_RADIO=radio.iuk-ue.de` in der echten `.env` richtig gesetzt ist. Genau
  dieser Fehlfall ist **stumm**: die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host
  über **genau** diese Variable; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal,
  „ohne Fehler und ohne Meldung" — und, wörtlich: **„Ein curl sieht davon nichts"**
  (`src/core/hosts.ts:59-63`).

  **Die Wahl zwischen Weg A und Weg B fällt HIER und VOR dem Cutover-Abend, nicht an ihm:**
  * **Weg A** (Spec 1 §9.3.1 empfiehlt ihn): ein temporärer echter Host `radio-neu.iuk-ue.de` samt
    `SUITE_TRAEFIK_RULE`-Eintrag. ⚠️ „Beim Wechsel gilt **dieselbe** Prüfung noch einmal — der Rückweg
    hängt am **Wert**, nicht am Code."
  * **Weg B**: Nachprüfung als **erster** Schritt nach dem Umschwenk, mit `SUITE_HOST_RADIO=` leeren
    als benanntem Rückweg und einer **namentlich benannten** Person.

  > Gewählt: ☐ Weg A ☐ Weg B · entschieden am ____________ · Person ____________

  ⚠️ **Und ein zweiter Unterschied, der leicht verschwimmt:** Falle 61 ist bei Stufe 3 **nicht**
  bauartbedingt vermieden. Bei Weg A wird `/m/radio` auf dem Portal-Host gar nicht angefasst; bei
  Stufe 3 ist der interne Pfad weiter erreichbar — `decideRoute` behandelt `/m/<key>` in einem
  **eigenen Zweig**, der den Host **nicht** ansieht, und für ein Modul mit `requiresAuth: false`
  liefert `canAccess` sofort `true` (`src/core/routing.ts:57-67`, `src/core/registry.ts:239`).
  **Die Negativprobe ist deshalb Pflicht: V7 in §G9 / Aufgabe 10.**
  ````

- [ ] **Schritt 7: Die Escalation — benannt, damit sie im Fenster nicht erfunden wird**

  ````markdown
  ### Nur falls ein echter TLS-Handschlag gebraucht wird — benannt und NICHT empfohlen

  Stufe 3 liefert einen **sicheren Kontext** ohne TLS, weil `localhost` als vertrauenswürdiger Origin
  gilt. Was sie nicht liefert, ist ein echter Handschlag und der **Header-Vorlauf** eines
  Reverse-Proxys. Wer das braucht, stellt einen TLS-Abschluss davor, der `X-Forwarded-Host` setzt —
  und trifft damit den Zweig, den die Produktion wirklich benutzt (`src/core/routing.ts:37`,
  `x-forwarded-host` **vor** `host`):

  ```yaml
  # gp-compose.yaml — NUR fuer die Generalprobe. Keine traefik.*-Labels, kein proxy-Netz.
  services:
    app:
      image: ${IMG}
      user: "${UID_APP}:${GID_APP}"     # abgelesen in §G4, nicht eingetragen
      volumes: ["${GP}/data:/data"]
      environment:
        DATA_DIR: /data
        SUITE_HOST_RADIO: radio.iuk-ue.de   # ⚠️ nur zulaessig, weil KEIN Router hier haengt
        SUITE_ADMIN_GROUP_RADIO: radio-verwaltung-gp
        RADIO_AUSLEIH_SITZUNG_SECRET: ${GP_SECRET}
        RADIO_HISTORIE_PURGE: "0"
        AUTH_SECRET: ${GP_AUTH_SECRET}
        AUTH_URL: https://localhost:8443     # zeichengleich die Origin des Browsers
        AUTH_TRUST_HOST: "true"
        AUTH_DEV_LOGIN: "true"
    tls:
      image: caddy:2-alpine
      ports: ["127.0.0.1:8443:8443"]
      command: >
        caddy reverse-proxy --from https://localhost:8443 --to app:3000
        --header-up "X-Forwarded-Host: radio.iuk-ue.de"
  ```

  **Zwei Warnungen, ohne die diese Form gefährlich ist:**
  1. ⚠️ **`SUITE_HOST_RADIO=radio.iuk-ue.de` steht hier nur deshalb, weil dieser Stack keinen Router
     trägt. Dieselbe Zeile in der echten `.env` IST der Umschwenk.** Die Datei heißt
     `gp-compose.yaml` und **nicht** `compose.override.yaml`, damit ein `docker compose up -d` im
     Projektverzeichnis sie **nicht** einliest.
  2. Der Browser muss das Caddy-interne Zertifikat annehmen. **Eine durchgeklickte
     Zertifikatswarnung ist kein sicherer Kontext im Sinne des Cookie-Verhaltens** — wer prüfen will,
     ob das Cookie ankommt, prüft es **an dieser Stelle noch einmal** und glaubt nicht dem Erfolg auf
     Stufe 3.

  **Empfehlung: Stufe 3, nicht diese Form.** Ein Container statt zwei, eine Env-Zeile statt eines
  Zertifikats — und der Zweig, der hier zusätzlich getroffen wird (`x-forwarded-host`), ist nach dem
  Umschwenk in einem Atemzug nachprüfbar (§4.2 Nr. 8, §4.6). **Diese Form steht hier, damit sie im
  Fenster nicht erfunden wird.**
  ````

- [ ] **Schritt 8: Prüfschritt und Commit**

  1. **Kopierbar:** Die `docker run`-Zeile ist ein zusammenhängender Block mit Zeilenfortsetzungen und
     setzt ihre vier Variablen **im Abschnitt selbst**. Gegenprobe, zwingend: `grep -c suite_data` über
     den Abschnitt → **jedes Vorkommen steht in einer Warnung**, keines in einer `docker run`-Zeile.
     Zweite Gegenprobe, am laufenden Container und nicht am Gedächtnis (die Zeile aus §G4 / Aufgabe 5
     Schritt 5, hier ausgeführt):
     ```bash
     docker inspect radio-gp --format '{{json .Mounts}}' | grep -c suite_data   # MUSS 0 sein
     ```
     Dritte Gegenprobe: `SUITE_HOST_RADIO` trägt in **beiden** Blöcken (Start und Rot-Lauf) die
     Kommaliste.
  2. **Platzhalter:** `<die Image-Referenz aus §G0>`, `<der Pfad aus §G0>`, `<aus §G4 Handgriff 0>`,
     ⬜ **N3**; `${GP_SECRET}`/`${GP_AUTH_SECRET}` in der Escalation sind Shell-Variablen und als
     solche erkennbar.
  3. **Abbruchpunkt:** Zwei Stück mit Rückweg — der Startabbruch (Logs lesen, Env-Zeile ergänzen,
     ausdrücklich **nicht** bei `files` suchen) und der stumme Login-Rückweg (Weg A/Weg B, vor dem
     Abend zu entscheiden, mit Protokollzeile).

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G8 — ephemerer Pruefcontainer, Host als Kommaliste, drei Stufen"
  ```

---

## Aufgabe 10 — §G9: Der kopfgestützte Prüfsatz (Stufe 1)

Acht Prüfungen mit `curl` und vorgetäuschtem `Host`. **Alle Zeilen laufen, nicht nur die erste.**

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G9 — Der kopfgestützte Prüfsatz
  (Stufe 1)`, hinter §G8)
- Test: das Dreier-Tor, geprüft in Schritt 6.

**Schnittstellen:**
- Verbraucht: den laufenden Container `radio-gp` und `B`/`H` aus §G8 / Aufgabe 9 · ⬜ **L5**
  (Revision-Sollwert), ⬜ **L7** (Location), ⬜ **L8** (Sollwert V7), ⬜ **L10** (Rahmen-Zeichenkette),
  ⬜ **N4** (Pfad der `sw.js`-Route).
- Liefert: die V1–V8-Zeilen an den Haken **G6** (§G13 / Aufgabe 14) und die **Vorlage** für §4.5
  Schritt 8 — ⚠️ **mit zwei benannten Unterschieden dort: `-v suite_data:/data` statt `-v "$GP/data"`,
  und ⛔ kein `AUTH_DEV_LOGIN`** (W5).

- [ ] **Schritt 1: Der Block, mit der Portal-Fallback-Probe als erster Zeile**

  ````markdown
  ## §G9 — Der kopfgestützte Prüfsatz (Stufe 1)

  ```bash
  B=http://127.0.0.1:3999
  H='Host: radio.iuk-ue.de'

  # V0) DIE PROBE VOR ALLEN PROBEN: antwortet ueberhaupt `radio` — oder der Portal-Fallback?
  curl -s -H "$H" "$B/" | grep -c '<L10-Zeichenkette aus dem Ausleih-Rahmen>'   # MUSS >= 1
  curl -s -H "$H" "$B/" | grep -ci 'anmelden\|login'                            # zur Gegenlese

  # V1) Die Ausleihflaeche antwortet unter dem radio-Host.
  curl -si -H "$H" "$B/" | head -3                       # erwartet: 200

  # V2) /admin riegelt anonym ab — als WEITERLEITUNG in den Login, nicht als 404.
  curl -si -H "$H" "$B/admin" | grep -iE '^HTTP/|^location:'

  # V3) Health, mit Revision — der einzige Beleg, dass der NEUE Stand antwortet.
  curl -s -H "$H" "$B/api/health/radio"

  # V4) Der CSV-Export antwortet anonym 404, nicht 403.
  curl -s -o /dev/null -w '%{http_code}\n' -H "$H" "$B/admin/geraete/export"

  # V5) Der Abraeum-Worker liegt im Image und ist der richtige.
  curl -si -H "$H" "$B/sw.js" | head -5
  curl -s  -H "$H" "$B/sw.js" | grep -c 'registration.unregister'   # MUSS >= 1
  curl -s  -H "$H" "$B/sw.js" | grep -c 'caches.keys'               # MUSS >= 1
  curl -s  -H "$H" "$B/sw.js" | grep -c 'addEventListener("fetch"'  # MUSS 0 sein

  # V6) Der Modul-Riegel auf einem FREMDEN Host — ueber den INTERNEN Pfad, siehe unten.
  curl -si -H 'Host: iuk-ue.de' "$B/<N4: der interne Pfad der sw.js-Route, z. B. /m/radio/sw.js>" | head -3
  # Gegenstueck, das etwas ANDERES misst (siehe unten):
  curl -s -o /dev/null -w '%{http_code}\n' -H 'Host: iuk-ue.de' "$B/sw.js"

  # V7) Falle 61: der interne Pfad auf dem Portal-Host.
  curl -si -H 'Host: iuk-ue.de' "$B/m/radio" | head -3

  # V8) siehe §G1 Nr. 3 — R36 ist bei radio KEIN curl, sondern eine Abwesenheitspruefung im Repo.
  ```
  ````

- [ ] **Schritt 2: Zu V0 — warum eine Probe vor allen Proben steht**

  ````markdown
  **Zu V0, und diese Zeile ist neu gegenüber allen bisherigen Cutovern des Hauses.** Der
  Portal-Fallback ist **still**: trifft der `Host`-Kopf kein Modul, endet `decideRoute` mit
  `moduleForHost(host) ?? getModule("portal")` (`src/core/routing.ts:69`), und für einen anonymen
  Abruf mit `groups === null` folgt `{ action: "login" }` (`:70-73`). **Das Portal antwortet dann
  genau so, wie man es von einem funktionierenden Riegel erwartet** — V2 wäre grün, V6 wäre grün, und
  beide hätten nichts geprüft.

  **Deshalb misst V0 zuerst, WER antwortet**, und zwar an einer Zeichenkette, die **nur** der
  Ausleih-Rahmen des Moduls trägt (Spec 1 §4.2) und die im Portal-HTML **nicht** vorkommt. ⬜ **L10**
  liefert sie. ⚠️ **Eine erfundene Zeichenkette wäre ein Test, der grün ist, weil er nichts trifft** —
  und das ist genau der Fehlertyp, gegen den dieser ganze Abschnitt gebaut ist.

  **Abbruch:** V0 = 0 → der Kopf trifft kein Modul. **Rückweg:** `SUITE_HOST_RADIO` im laufenden
  Container prüfen (`docker inspect radio-gp --format '{{json .Config.Env}}' | tr ',' '\n' | grep
  SUITE_HOST`); es muss **beide** Werte tragen, `localhost` **und** `radio.iuk-ue.de` (§G8 /
  Aufgabe 9 Schritt 2). Kein einziger der Prüfsätze wird ausgewertet, bevor V0 grün ist.

  > V0: Treffer der ⬜ **L10**-Zeichenkette = ____ · Login-Wörter im selben Rumpf = ____
  ````

- [ ] **Schritt 3: Zu V2 und V4 — zwei Riegelformen, und der naheliegende Sollwert ist der falsche**

  ````markdown
  **Zu V2 und V4.** `requireRadioAdmin()` läuft in fester Reihenfolge (Spec 1 §3.6.1): Host, dann
  `viewerAusSession`, dann **Schritt 4** `redirect('/login?callbackUrl=' + verwaltungsZiel(kopf))` für
  **anonym**, und erst **Schritt 5** `notFound()` — „NICHT 403" — für **angemeldet ohne Gruppe**.

  | Fall | Erwartung | Wo geprüft |
  |---|---|---|
  | anonym auf `/admin` (**Seite**) | **Weiterleitung (3xx)** in den Login, mit `callbackUrl` — der genaue Code ist ⬜ **L7** | V2 |
  | angemeldet **ohne** `SUITE_ADMIN_GROUP_RADIO` auf `/admin` (**Seite**) | **404** | V11, §G10 / Aufgabe 11 |
  | anonym auf `/admin/geraete/export` (**Route Handler**) | **404**, nie 403 und nie ein Login-Umweg | V4 |

  Der Unterschied zwischen Zeile 1 und Zeile 3 ist keine Unsauberkeit, sondern **B11**: Seiten und
  Server Actions rufen `requireRadioAdmin()`, **Route Handler unter `admin/` rufen
  `radioHostOderNull` + `istRadioAdmin(await viewerOderNull())`** und bauen ihre Antwort selbst.
  ⚠️ **Wer V2 und V4 denselben Sollwert gibt, hat eine der beiden Bauformen kaputtgeprüft.** Wörtlich
  umgesetzt landete ein anonymer `GET` auf `/admin/geraete/export` sonst in einem Login-Umweg, und ein
  403 machte den Bestand an Verwaltungspfaden aufzählbar.

  ⚠️ **Ein festgeschriebenes `302` steht hier NICHT** (W7): `redirect()` aus einer Server Component
  liefert je nach Aufrufweg 307 oder 302, und ein Runbook-Schritt, der beim **richtigen** Verhalten
  rot wird, wird beim zweiten Mal ignoriert. **Protokolliert wird der vollständige `Location`-Wert.**
  ⚠️ Nennt die `callbackUrl` **nicht** den Host aus dem `Host`-Kopf, ist das derselbe stumme Fehlfall
  wie beim Login-Rückweg (§G8 / Aufgabe 9 Schritt 6).

  > V2: Statuscode ____ (⬜ **L7**) · `location:` = ____________________ ·
  > nennt sie den Host aus dem Kopf? ☐ ja ☐ nein
  > V4: Statuscode ____ (erwartet 404)

  **Abbruch:** V2 = 404 → **die Seite ruft den Riegel gar nicht**. V4 = 403 oder 3xx → der Handler
  benutzt die Seitenform. Beides ist **Klasse C**: Moduländerung in Kapitel 1 / Spec 1 §3.6, dann
  `rm -rf "$GP"` und die Generalprobe von vorn.
  ````

- [ ] **Schritt 4: Zu V3, V5, V6, V7 — je eine Erwartung mit Beleg**

  ````markdown
  **Zu V3, weil `200` allein zu wenig ist.** `/api/health/radio` wäre gegen eine frisch angelegte,
  **leere** `radio.db` grün. Was zählt, sind die Felder im Rumpf — **und sie sind heute lesbar**:

  * `module` trägt den **Modulnamen**, `status: "ok"` entsteht **erst nach**
    `openModuleDatabase(moduleDbPath(key))` plus `db.prepare("SELECT 1").get()` und belegt damit den
    **DB-Zugriff** (`src/core/health/index.ts:4-15`, insbesondere `:8-10`).
  * `revision` hängt `src/app/api/health/[modul]/route.ts:23-26` an; sie kommt aus
    `laufendeRevision()` und damit aus `SUITE_REVISION`, das `Dockerfile:85-86` in die **letzte
    Metadatenschicht** schreibt.
  * Dieselbe Zeile setzt **200** bzw. **503**. ⚠️ **Solange der Registry-Eintrag `radio` fehlt,
    antwortet die Route 503**, weil `getModule` bei unbekanntem Key wirft
    (`src/core/health/index.ts:7`). **200 heißt „das Modul ist im Image", 503 heißt „falsches Image".**
    Die billigste Image-Prüfung, die es gibt.

  **Offen ist allein der WERT von `revision`: ⬜ L5** — er steht in der Protokollzeile aus §4.2 Nr. 1
  (der Commit des Deploys, aus dem dieses Image gebaut wurde).

  > V3: `status` = ____ · `module` = ____ · `revision` = ____________ ·
  > Sollwert ⬜ **L5** = ____________ · gleich? ☐ ja ☐ nein

  **Abbruch V3 = 503:** **Klasse A — Absage, nicht Anpassung.** Falsches Image; kein Handgriff am
  Cutover-Abend behebt das, es braucht einen CI-Lauf. Vorbild derselben Härte:
  `docs/runbooks/suite-update-webfinger.md:43-45`.

  ---

  **Zu V5.** Der Handler ist in Spec 1 §7.1.3 vollständig ausgeschrieben, die Zusicherungen sind also
  keine Vermutung: `content-type: text/javascript; charset=utf-8`, `cache-control: no-cache`, im Rumpf
  `self.registration.unregister()` und `caches.keys()`, und **kein `fetch`-Handler** („Ein Worker ohne
  `fetch`-Handler lässt jede Anfrage unberührt zum Netz").

  > V5: content-type = ____________ · `registration.unregister` ____ · `caches.keys` ____ ·
  > `addEventListener("fetch"` ____ (MUSS 0)

  ---

  **Zu V6 — hier steht die Rechnung, weil die naheliegende Zeile den falschen Riegel misst.** Die
  Absicht ist: **der Modul-Riegel `hostAbweisung` (B13) liefert `/sw.js` auf einem fremden Host
  nicht aus** — als **nicht werfende** Absage, denn ein `notFound()` wäre eine HTML-Seite mit
  `Content-Type: text/html`, und der Browser meldete „manifest fetch failed" statt einer klaren
  Absage.

  ⚠️ **Über den Host-Zweig ist dieser Riegel nicht erreichbar.** `curl -H 'Host: iuk-ue.de'
  "$B/sw.js"` löst über `moduleForHost("iuk-ue.de")` → **portal** auf (Code-Default
  `prodHosts: ["iuk-ue.de"]`, `src/core/registry.ts:57-59`); `portal` ist `requiresAuth: true`, und
  für `groups === null` endet `decideRoute` in `{ action: "login" }` (`src/core/routing.ts:69-73`).
  **Der Handler des Moduls läuft dabei nie.** Die Antwort ist ein Portal-Login-3xx — sie erfüllt
  „liefert ihn nicht", aber aus dem falschen Grund, und sie wäre auch dann grün, wenn `radio` gar
  keinen Host-Riegel hätte.

  **Erreichbar ist der Handler über den INTERNEN Pfad**, denn `decideRoute` prüft `/m/<key>` in einem
  **eigenen Zweig vor** der Host-Auflösung und sieht den `Host`-Kopf dort **nicht** an
  (`src/core/routing.ts:57-67`); für `requiresAuth: false` liefert `canAccess` sofort `true`
  (`src/core/registry.ts:239`). Der Handler läuft, sieht `Host: iuk-ue.de` und weist ab.

  **⬜ N4 — abzulesen nach dem Bau**, weil der Pfad aus Spec 1 §7.1.3 folgt und aus nichts sonst:
  ```bash
  rg --files src/app/m/radio | grep 'sw\.js'    # → daraus die URL: /m/radio/<…>/sw.js
  ```

  > V6: interner Pfad (⬜ **N4**) = ____________________ · Antwort = ____ ·
  > Gegenstück `$B/sw.js` mit `Host: iuk-ue.de` = ____ (**dies misst den Portal-Fallback, nicht B13**)

  **Abbruch:** Liefert der interne Pfad den Worker-Rumpf aus, greift der Host-Riegel nicht — Klasse C,
  Rückweg Kapitel 1 / Spec 1 §7.1.3.

  ---

  **Zu V7:** hier steht **kein** Sollwert, weil er von einer Entscheidung abhängt, die dieses Kapitel
  nicht trifft (⬜ **L8**, Spec 1 §1.2 entscheidet sie). **Die Zeile bleibt trotzdem im Runbook:
  abgelesen und protokolliert wird sie in jedem Fall**, denn Falle 61 ist die zweite Herkunft, die in
  keinem Runbook steht.

  > V7: Statuscode ____ · erste Rumpfzeile ____________________ · Sollwert laut ⬜ **L8** = ________
  ````

- [ ] **Schritt 5: Der Satz, der diesen Abschnitt an §4.5 Schritt 8 bindet**

  ````markdown
  **Diese acht Zeilen sind die Vorlage für die Verifikation im Fenster (§4.5 Schritt 8) — mit genau
  zwei benannten Unterschieden am Container** (W5):
  1. `-v suite_data:/data` statt `-v "$GP/data":/data` — dort ist das produktive Volume das
     **Prüfobjekt**.
  2. ⛔ **`AUTH_DEV_LOGIN` wird dort NICHT gesetzt.** In der Generalprobe hängt der Dev-Login an einem
     **Wegwerf**-Bestand, im Fenster am **produktiven** Volume.

  ⚠️ **Der `notFound()`-Zweig von `requireRadioAdmin` (angemeldet, aber nicht in der Gruppe) ist mit
  `curl` gar nicht erreichbar** — er braucht eine echte Sitzung und ist damit V11 in §G10 /
  Aufgabe 11, **kein Statuscode in dieser Liste.**
  ````

- [ ] **Schritt 6: Prüfschritt und Commit**

  1. **Kopierbar:** Ein `bash`-Block, `B` und `H` **im Block selbst** gesetzt. Gegenprobe: jede der
     acht Zeilen trägt `-H "$H"` oder ein ausgeschriebenes `-H 'Host: …'` — **keine** Zeile läuft ohne
     Host-Kopf, denn ohne ihn läuft jede Anfrage auf den Portal-Fallback (V0).
  2. **Platzhalter:** ⬜ **L10** (V0), ⬜ **L7** (V2), ⬜ **L5** (V3), ⬜ **N4** (V6), ⬜ **L8** (V7) —
     jeder unmittelbar an seiner Zeile, jeder mit eigenem Protokollfeld.
  3. **Abbruchpunkt:** Fünf Stück mit Rückweg — V0 (Env prüfen, nichts auswerten), V2/V4 (Klasse C,
     Kapitel 1), V3 = 503 (**Klasse A, Absage**), V6 (Klasse C), und die ausdrückliche Notiz, dass V7
     ohne Sollwert **protokolliert und nicht bewertet** wird.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G9 — kopfgestuetzter Pruefsatz mit Portal-Fallback-Probe"
  ```

---

## Aufgabe 11 — §G10: Der browsergestützte Prüfsatz (Stufe 3)

Acht Schritte im Browser auf `http://localhost:3999`, **in dieser Reihenfolge** — sie folgt aus dem
Datenmodell und ist nicht wählbar.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G10 — Der browsergestützte Prüfsatz
  (Stufe 3)`, hinter §G9)
- Test: das Dreier-Tor, geprüft in Schritt 6.

**Schnittstellen:**
- Verbraucht: den laufenden Container `radio-gp` (§G8 / Aufgabe 9), die Gruppe
  `radio-verwaltung-gp` aus dessen Env, ⬜ **L9**.
- Liefert: die V9–V16-Zeilen an den Haken **G6** (§G13 / Aufgabe 14); den Ankündigungsposten zu
  **C.3 / E5** an Kapitel 4 §4.8; und die Zusage „**der erste Code der Produktion entsteht NACH dem
  Umschwenk**" (W2) an Kapitel 4 §4.8.2.

- [ ] **Schritt 1: Die Reihenfolge — und warum sie keine ist, die man umstellen darf**

  ````markdown
  ## §G10 — Der browsergestützte Prüfsatz (Stufe 3)

  **Browser: Chromium oder Firefox. Adresse: `http://localhost:3999` — nicht `radio.localtest.me`.**
  Warum, steht in §G8 / Aufgabe 9 Schritt 6: Stufe 2 ist der Weg, der eine **intakte** Ausleihe als
  Fehler ausweist.

  **`zugangscodes` ist nicht Teil des Imports** (§1.4.6). **Nach dem Import gibt es also keinen
  einzigen Code, der eingelöst werden könnte.** Daraus folgt die Reihenfolge — der **Verwaltungsweg
  ist Voraussetzung des Ausleihwegs**, nicht ein zweiter, unabhängiger Prüfpunkt:

  1. Anmelden als radio-admin (Dev-Login, Gruppe `radio-verwaltung-gp`).
  2. `/admin/geraete` — der Bestand steht da, mit echten Zeilen aus dem Import.
  3. `/admin/zugaenge` — **einen Code ausstellen.** Das ist der erste Code, den es überhaupt gibt.
  4. Den Code einlösen: einmal über `/t/<code>` (der gescannte Weg) **und** einmal über das
     Eingabefeld am Gate (der Ausweichweg, `_actions/gate.ts#einloesenAmGate`).
  5. Ausleihen, zurückgeben, Historie ansehen.
  6. Den Code sperren und die Einlösung erneut versuchen — sie muss scheitern, **und zwar mit dem
     vorgesehenen Text, nicht mit einem Stacktrace**.

  ⚠️ **In der PRODUKTION entsteht der erste Code NACH dem Umschwenk** (W2, §4.8.2). Die Reihenfolge
  oben ist die der **Probe**, wo ein Dev-Login auf `localhost:3999` möglich ist. Der Grund:
  `erstelleCode` verlangt `requireRadioAdmin()` als erste Anweisung (Spec 1 §3.2.3), also eine
  Anmeldung **auf dem radio-Host** — und bis zum Umschwenk bedient dieser Host den Alt-Kiosk. **Es
  gibt vor dem Umschwenk keinen Weg, in der Produktion einen Code auszustellen.**

  ⚠️ **Schritt 3 ist zugleich ein Ankündigungsposten, kein reiner Testschritt.** Die 1:1-Übernahme des
  heutigen QR-Mechanismus ist ausgeschlossen (Entscheidung 8) und damit eine **Verhaltensänderung mit
  Ankündigungspflicht**. Ob und wo gedruckte Aufsteller im Umlauf sind, weiß nur der Betreiber
  (**C.3 / E5**) — **die Frage muss vor dem Umschwenk beantwortet sein** (§4.8), weil „Bestandscodes
  zeichengleich übernehmen" ein **Druck**vorgang wäre und Papier für jedes Tor unsichtbar bleibt.
  ````

- [ ] **Schritt 2: Die acht Prüfungen als Tabelle mit Fehlfall**

  ````markdown
  | # | Schritt | Was ihn scheitern lässt, und wie man es merkt | Ergebnis |
  |---|---|---|---|
  | **V9** | `/login` → Dev-Login mit der Gruppe aus `SUITE_ADMIN_GROUP_RADIO` | fehlt `AUTH_DEV_LOGIN=true`, führt der Login gegen Pocket ID und die Rückleitung scheitert — sichtbar als Fehlerseite **des IdP**, nicht der Suite. Fehlt `AUTH_URL`, landet der Login **auf einem anderen Host**, und der Fehler sieht aus wie ein Riegel, der zu viel riegelt | ____ |
  | **V10** | `/admin/geraete` zeigt echte Zeilen aus dem Import | leere Tabelle bei nicht-leerem `select count(*)` → **Falle 9** (`columns[].render` aus einer Server Component), sichtbar **nur hier**, nie im Build | ____ |
  | **V11** | Negativprobe: abmelden, neu anmelden **ohne** die Admin-Gruppe → `/admin` ist **404** | eine gerenderte Verwaltungsseite heißt: der Riegel steht nicht in **jeder** Datei. Mit `requiresAuth: false` erbt `/admin` **kein** Middleware-Gating (Entscheidung 10) | ____ |
  | **V12** | `/admin/zugaenge`: Code ausstellen, Blatt drucken (Druckvorschau) | erbt das Druckblatt Kopfzeile, Navigation und `controlHeight: 44`, fehlen die zwei Route-Groups (B9) — **still, der Build ist grün, sichtbar nur auf Papier bzw. in der Vorschau** | ____ |
  | **V13** | `/t/<code>` aufrufen → 303 auf die Ausleihfläche, **und das Cookie steht danach in den DevTools** | Schritt 3 dieser Aufgabe | ____ |
  | **V14** | Ausleihen, zurückgeben, Historie | eine 500 hier ist ein Fund; **eine falsche Konfliktmeldung ist auch einer** (Spec 1 §4.3.5: sechs Ausgänge, heute vier Sätze) | ____ |
  | **V15** | Code sperren, Einlösung erneut versuchen | die Meldung muss aus dem **geschlossenen Satz** der vier Texte kommen (Spec 1 §3.3.4), nicht aus einem Stacktrace | ____ |
  | **V16** | Hell **und** dunkel je Fläche einmal ansehen | Vorbild `lagerbuch-cutover.md:267-284`: Ampelringe, Statuschips, Tabellenkanten. **Keine weiße Fremdfläche im Dunkelmodus, kein abgeschnittener Inhalt** | ____ |

  **Abbruch:** Jeder Fund aus V9–V16 ist **Klasse C** — reparieren, dann `rm -rf "$GP"` und die
  Generalprobe **von vorn** (§G13 / Aufgabe 14). ⚠️ Ein Fund in V9 ist dabei fast nie ein Moduldefekt,
  sondern eine fehlende Env-Zeile (`AUTH_URL`, `AUTH_DEV_LOGIN`); der Rückweg ist §G8 / Aufgabe 9,
  nicht Kapitel 1.
  ````

- [ ] **Schritt 3: V13 als Ablesung, nicht als Behauptungssatz**

  ````markdown
  ### Zu V13 — der echte Zwang zum sicheren Kontext ist das Secure-Cookie

  Die Ausleih-Sitzung setzt `secure: process.env.NODE_ENV === "production"` (Spec 1 §3.4.1), und
  `Dockerfile:36` setzt `ENV NODE_ENV=production`. **Im Prüfcontainer ist das Cookie also `Secure` —
  genau wie in der Produktion.** Ein `Secure`-Cookie von einem nicht vertrauenswürdigen Origin wird
  vom Browser **verworfen**; auf `http://radio.localtest.me:3999` (Stufe 2) ist der Ausleihweg damit
  **nicht benutzbar, obwohl er intakt ist**.

  ⚠️ **Das ist der teure falsche Schluss:** wer die Probe über Stufe 2 fährt, hält den Gate-Weg für
  kaputt und „repariert" ihn — oder er hält ihn für **geprüft**, weil die Seite ja erschien. Der
  zweite ist der teurere.

  > **Ablesung, nicht Behauptung:** Nach `GET /t/<code>` MUSS das Cookie **`radio_ausleihe`** in den
  > DevTools unter *Application → Cookies → `http://localhost:3999`* stehen, mit **`HttpOnly`**,
  > **`SameSite=Lax`**, **`Path=/`** und **ohne `Domain`-Eintrag**.
  >
  > Fehlt es, liegt die Ursache **am Origin und nicht am Modul** — dann ist der Ausleihweg in dieser
  > Probe **ungeprüft**, und die Probe wird auf Stufe 3 wiederholt, **nicht das Modul angefasst**.

  > V13: Cookie da? ☐ ja ☐ nein · HttpOnly ☐ · SameSite = ______ · Path = ______ ·
  > Domain-Eintrag vorhanden? ☐ nein (richtig) ☐ ja (⚠️ Fund)

  Der Name ist nachgeschlagen: `AUSLEIH_COOKIE = "radio_ausleihe"` (Spec 1 §3.4.1). Er kollidiert
  **nicht** mit dem Alt-Cookie `radio-inventar.sid`
  (`radio-inventar/packages/shared/src/constants/auth.constants.ts:29`) — auch das ist nachgeschlagen
  und nicht angenommen.

  ⚠️ **Ein fehlender `Domain`-Eintrag in den DevTools ist ein Indiz, kein Beweis.** Die Cookie-Domain
  ist **nie per HTTP prüfbar** (§G12 / Aufgabe 13, Übergabetabelle); der Beweis ist und bleibt die
  Quelltext-Zusicherung aus §G1 / Aufgabe 2 Nr. 2.
  ````

- [ ] **Schritt 4: Der gedruckte QR-Code — prüfbar ist die Nutzlast, nicht der Scan**

  ````markdown
  ### Zu V12 — was am gedruckten Code jetzt prüfbar ist und was nicht

  Ein gedruckter Code trägt eine **absolute** URL auf `https://radio.iuk-ue.de/t/<code>`. **Bis zum
  Umschwenk führt diese URL zum Alt-Kiosk** — der Scan ist also vorher **nicht** prüfbar, und keine
  Umgehung ändert das.

  **Was vorher prüfbar ist, und es ist nicht wenig: die Nutzlast als Text.** Den Code im ephemeren
  Container ausstellen, das Druckblatt öffnen, den QR mit einem beliebigen Leser als **Zeichenkette**
  auslesen und **zeichenweise** gegen die erwartete URL vergleichen. Ein Tippfehler im Host, ein
  fehlendes `https`, ein Modul-Pfad `/m/radio/t/…` statt `/t/…` — **alles drei fällt hier auf und
  keines davon nach dem Druck.**

  > Nutzlast als Text: ____________________________________ ·
  > erwartet: `https://radio.iuk-ue.de/t/<code>` · zeichengleich? ☐ ja ☐ nein

  ⚠️ **Reihenfolge, damit daraus kein Altpapier wird: gedruckt wird NACH dem Umschwenk.** Papier ist
  für jedes Tor unsichtbar. Der Druck des ersten Codesatzes ist ein eigener, protokollierter Schritt
  **nach** dem Umschwenk (§4.8) — und er ist zugleich die **Frist für C.1** (Bauform des
  Ausleih-Codes): ab dem Druck wird ein Wechsel ein Papieraustausch und keine Schemaänderung mehr.
  ````

- [ ] **Schritt 5: Der HTTPS-Punkt — derselbe Satz wie bei `lagerbuch`, aber aus einem anderen Grund**

  ````markdown
  ### Warum „die Generalprobe muss über HTTPS laufen" bei `radio` etwas anderes heißt

  Bei `lagerbuch` war dieser Satz ein eigener Runbook-Punkt (`lagerbuch-cutover.md:290-310`), und der
  Grund war die **Kamera**: `/verwaltung/geraete/scan` und `/verwaltung/bz/scan` mit einem eigenen
  `BarcodeScanner.tsx`, das über `http://` ausschließlich `KEIN_SICHERER_KONTEXT` zeigt.

  **Bei `radio` gibt es diese Fläche nach Spec 1 nicht** — nachgesehen, nicht angenommen: ein Scan über
  Spec 1 und die Portierungsanalyse findet **keine** Stelle mit `getUserMedia`, `BarcodeDetector`,
  `mediaDevices` oder einer Scanner-Komponente unter `src/app/m/radio/`. Der gescannte Code ist bei
  `radio` **ein GET aus der Adresszeile** (der Route Handler `t/[code]/route.ts`), und das Eingabefeld
  am Gate ist der Weg „für den Fall, dass die **Kamera-App des Telefons** nicht will" — nicht eine
  Fläche des Moduls.

  **Der Zwang zum sicheren Kontext bleibt trotzdem, und er heißt Secure-Cookie** (Schritt 3).

  ⬜ **L9** bleibt offen: ob `/` oder `/t/<code>` doch eine kamerabasierte Fläche trägt.
  ⚠️ **Warum das als Leerstelle steht und nicht als Zusage: eine Prüfzeile auf eine Fläche, die es
  nicht gibt, ist entweder immer grün oder immer rot — und beides wird als Aussage gelesen.**

  > ⬜ **L9**: kamerabasierte Fläche vorhanden? ☐ nein (dann trägt nur das Cookie den Zwang)
  > ☐ ja, auf ____________ (dann ist ein sicherer Kontext **Pflicht**, und Stufe 3 stellt ihn her)
  ````

- [ ] **Schritt 6: Prüfschritt und Commit**

  1. **Kopierbar:** Dieser Abschnitt trägt bewusst **keine** `bash`-Blöcke außer der Adresszeile — er
     ist ein Browser-Abschnitt. Gegenprobe: die Adresse steht ausgeschrieben (`http://localhost:3999`),
     der DevTools-Pfad ist vollständig benannt (*Application → Cookies → `http://localhost:3999``*),
     und die Gruppe für den Dev-Login ist genannt.
  2. **Platzhalter:** ⬜ **L9** mit eigenem Protokollfeld; `<code>` ist ein zur Laufzeit entstehender
     Wert und als solcher aus Schritt 3 der Reihenfolge erkennbar.
  3. **Abbruchpunkt:** Drei Stück mit Rückweg — jeder V-Fund ist Klasse C (Rückweg §G13), ein
     V9-Fund führt nach §G8 statt nach Kapitel 1, und ein fehlendes Cookie führt **zurück auf
     Stufe 3**, nicht ins Modul.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G10 — browsergestuetzter Pruefsatz, Reihenfolge und Cookie-Ablesung"
  ```

---

## Aufgabe 12 — §G11: Das Log der Probe

Der Retention-Arbeiter wird stillgelegt, und **die Art, wie er das meldet, ist selbst eine Prüfung**.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G11 — Das Log der Probe`, hinter
  §G10)
- Test: das Dreier-Tor, geprüft in Schritt 4.

**Schnittstellen:**
- Verbraucht: den laufenden Container `radio-gp` (§G8 / Aufgabe 9) mit `RADIO_HISTORIE_PURGE=0`.
- Liefert: die **erste Rohzeile des Logs** ins Protokoll — sie macht die Präfixform aktenkundig und
  wird von Kapitel 4 §4.6 Nr. 9 und Nr. 14 gebraucht; und die Regel „**`warn` = Stopp, `info` =
  Zustand**".

- [ ] **Schritt 1: Warum der Schalter überhaupt gesetzt ist**

  ````markdown
  ## §G11 — Das Log der Probe

  **`RADIO_HISTORIE_PURGE=0` gehört in die Env des ephemeren Containers** (§G8 / Aufgabe 9). Der
  Erstlauf steht auf **1440 Minuten** (B5), eine kurze Probe erreicht ihn also gar nicht — **aber eine
  Probe, die über Nacht läuft oder mehrfach neu startet, löschte genau die Historie, die §G7 /
  Aufgabe 8 gerade nachgewiesen hat.**

  Der Schalter ist **nicht stumm, und das ist beabsichtigt:** er meldet „Retention abgeschaltet" als
  **`console.info`**, nicht als `console.warn` (Spec 1 §7.3.4). Die Trennung ist scharf und prüfbar —
  **`warn` = Stopp, `info` = Zustand.** Die Generalprobe ist damit auch die Probe darauf, dass diese
  Trennung im Log wirklich so aussieht.
  ````

- [ ] **Schritt 2: Die zwei Befehle, und warum das Muster ohne `^` steht**

  ````markdown
  ```bash
  docker logs radio-gp 2>&1 | head -1              # die ROHZEILE ins Protokoll
  docker logs radio-gp 2>&1 | grep -i 'radio:'
  # erwartet: eine radio:-INFO-Zeile ("Retention abgeschaltet"), KEINE radio:-WARNUNG.
  ```

  ⚠️ **Das Muster steht OHNE `^`, und der Grund ist die RICHTUNG des Fehlfalls** (W6). `docker compose
  logs` stellt jeder Zeile den **Servicenamen** voran (`suite  | radio: …`), und eine so präfigierte
  Zeile kann `^radio:` **nicht** treffen. Der Befehl liefert dann **leere Ausgabe** — und leere Ausgabe
  liest sich als **„keine `radio:`-Warnung", also grün.** Eine Stopp-Bedingung, die bei falschem Muster
  still bestanden wird, ist keine.

  Ohne `^` ist der Befehl unter **beiden** Formen richtig: `docker logs radio-gp` (unpräfigiert,
  Generalprobe) und `docker compose logs suite` (präfigiert, Fenster).

  ⚠️ **Deshalb wird zusätzlich die erste Rohzeile protokolliert** — damit die Präfixform **aktenkundig**
  ist und der nächste Cutover sie nicht wieder raten muss.

  > Erste Rohzeile wörtlich: ____________________________________
  > `radio:`-Zeilen: INFO ____ · WARN ____
  ````

- [ ] **Schritt 3: Die zwei Warnungen, die legitim sind — und wann sie es nicht mehr sind**

  ````markdown
  ⚠️ **Zwei `warn`-Zeilen sind in der Probe legitim und dürfen NICHT als Stopp gelesen werden**,
  solange der Import (§G4 Handgriff 2) noch nicht gelaufen ist:

  * „`devices` ist leer"
  * „`radio.db` wurde neu angelegt"

  Spec 1 §7.3.4 sagt es selbst: „vor dem Import ist die Tabelle **legitim** leer".

  **Nach dem Import müssen beide verschwunden sein.** Sind sie es nicht, zeigt `DATA_DIR` woanders hin
  als der Import — **Analyse-Falle 29** (`docs/radio-portierung-analyse.md:1685-1696`).

  **Abbruch:** Eine `radio:`-WARN-Zeile nach dem Import ist ein Stopp. **Rückweg:** zuerst §G4
  Handgriff 4 („ist der Import überhaupt DORT gelandet?") wiederholen — in der Mehrzahl der Fälle
  liegt die Ursache dort und **nicht** im Modul. Erst wenn Handgriff 4 sauber ist, ist es ein Fund für
  Kapitel 1.
  ````

- [ ] **Schritt 4: Prüfschritt und Commit**

  1. **Kopierbar:** Zwei Zeilen, beide gegen den benannten Container `radio-gp` — keine ID, keine
     Variable von außerhalb. Gegenprobe: das `grep`-Muster enthält **kein** `^`.
  2. **Platzhalter:** Keine ⬜-Nummer nötig; die Rohzeile ist eine **Ablesung mit Protokollfeld**, kein
     Sollwert.
  3. **Abbruchpunkt:** Einer, mit einem Rückweg, der ausdrücklich **erst** die häufigere Ursache prüft
     (falsches `DATA_DIR`) und dann die seltenere (Moduldefekt).

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G11 — Log der Probe, Rohzeile und grep ohne Zeilenanfang"
  ```

---

## Aufgabe 13 — §G12: Aufräumen, und die zwei Messungen für das Fenster

Ein liegengebliebener Prüfcontainer ist ein Container mit `AUTH_DEV_LOGIN=true` und einem echten
Bestand. **Er hängt an keinem Router, also fällt er niemandem auf.**

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G12 — Aufräumen und die zwei
  Messungen`, hinter §G11)
- Test: das Dreier-Tor, geprüft in Schritt 4.

**Schnittstellen:**
- Verbraucht: `radio-gp`, `$GP` (§G8 / Aufgabe 9, §G4 / Aufgabe 5) · die Dump-Dauer aus §G2 /
  Aufgabe 3.
- Liefert: **U8** (Volumengröße und Dump-Dauer **beider** Stacks) an Kapitel 4 §4.2 Nr. 7 — ⚠️ **das
  ist eine Ausgabe dieses Kapitels, keine Eingabe**; und den Lese-Zustand „`radio-gp` läuft nicht"
  zurück an §G5–§G7 (Regel aus §G4 / Aufgabe 5 Schritt 5).

- [ ] **Schritt 1: Aufräumen — ein eigener Schritt mit eigener Protokollzeile**

  ````markdown
  ## §G12 — Aufräumen und die zwei Messungen

  ```bash
  docker stop radio-gp          # --rm entfernt ihn dabei
  docker ps -a | grep -c radio-gp    # MUSS 0 sein
  rm -rf "$GP"
  ```

  ⚠️ **Der Schritt gehört ins Protokoll wie jeder andere.** Ein liegengebliebener Prüfcontainer trägt
  `AUTH_DEV_LOGIN=true` und einen echten Bestand samt Ausleihernamen. Er hängt an keinem Router — also
  fällt er **niemandem** auf, bis jemand ihn findet.

  > Container gestoppt und entfernt (`docker ps -a` = 0) ☐ · `$GP` gelöscht ☐ · am ____________

  ⚠️ **Ab hier gilt wieder der Lese-Zustand „`radio-gp` läuft nicht"** (§G4 / Aufgabe 5 Schritt 5):
  `immutable=1` ist erst jetzt wieder zulässig — die Datei ist allerdings mit `rm -rf "$GP"` ohnehin
  weg. **Wer nach dem Aufräumen noch etwas nachlesen will, hat den Lauf verloren, nicht die Datei
  wiedergefunden**: das ist beabsichtigt und der Grund, warum jede Ablesung dieses Kapitels eine
  Protokollzeile hat.
  ````

- [ ] **Schritt 2: Die zwei Messungen, die am Cutover-Abend zu spät sind**

  ````markdown
  ### U8 — die zwei Messungen für die Bemessung des Fensters

  **Sie entstehen HIER und nirgends sonst.** Am Cutover-Abend sind sie zu spät: dann bemessen sie ein
  Fenster, das schon läuft.

  ```bash
  # Groesse beider Prod-Volumes (E2 = radio-admin, E3 = radio-inventar):
  docker system df -v | grep -E '<E2-volume-radio-admin>|<E3-volume-radio-inventar>'

  # Dauer des SQLite-Schnappschusses: aus §G2 uebernehmen (dort mit `time` gemessen).
  # Dauer des Postgres-Dumps von radio-inventar, EINMAL gemessen.
  # Der Datenbankname ist KEINE Leerstelle: POSTGRES_DB: radio_inventar ist hart gesetzt
  # (radio-inventar/docker-compose.yml:10). Nur POSTGRES_USER traegt einen Default (:7) und ist E3.
  time docker exec <radio-inventar-postgres-container, U4> \
    pg_dump -U <E3: POSTGRES_USER> -Fc -f /tmp/gp-probe.dump -d radio_inventar
  ```

  > **U8** · `radio-admin` Volume ________ · `.backup`-Dauer ________ (aus §G2)
  > **U8** · `radio-inventar` Volume ________ · `pg_dump`-Dauer ________
  > gemessen am ____________ · durch ____________

  ⚠️ **Der Containername von `radio-inventar` ist U4** — die teuerste offene Frage dieser Spec und
  die einzige, die **kein Befehl** beantwortet. Sie wird beim Betreiber eingeholt, nicht geraten.
  Bleibt sie offen, wird **nur** die `radio-admin`-Hälfte von U8 gemessen und die andere Hälfte im
  Protokoll als **offen** vermerkt — **nicht** geschätzt.

  **Abbruch:** keiner. Eine fehlende Messung stoppt die Generalprobe nicht; sie stoppt die
  **Fensterplanung** (§4.2 Nr. 7). Rückweg: die Messung nachholen, bevor ein Termin gesetzt wird.
  ````

- [ ] **Schritt 3: Die Regel für den zweiten und jeden weiteren Lauf**

  ````markdown
  ### Der nächste Lauf beginnt wieder bei §G2

  **Verbindlich: jede Generalprobe beginnt mit einem leeren `DATA_DIR`** (§G4 / Aufgabe 5 Schritt 2).
  Wer stattdessen „nochmal importiert", prüft die **Idempotenz des Skripts** und nicht den Import — und
  walzt genau das platt, was der vorige Lauf erzeugt hat.

  **Der Schnappschuss dagegen darf wiederverwendet werden**, solange er derselbe Lauf ist: `.backup`
  hält den Alt-Stack nicht an, ein neuer Schnappschuss ist also billig und **verändert nichts** — aber
  er verändert die **Zahlen**, gegen die A1 gesetzt wurde. **Entscheidungsregel:**

  * **Reparatur am Importer, Schema oder Mapper** → derselbe Schnappschuss, `rm -rf "$GP"`, ab §G3.
  * **Reparatur an den Quelldaten** (Klasse B, A2/A3) → **neuer** Schnappschuss ab §G2, weil die
    Bereinigung in der Kopie stattfand und die Kopie damit nicht mehr die Quelle abbildet.

  > Lauf-Nr. ____ · Schnappschuss vom ____________ wiederverwendet ☐ / neu gezogen ☐
  ````

- [ ] **Schritt 4: Prüfschritt und Commit**

  1. **Kopierbar:** Drei Blöcke. Der `pg_dump`-Aufruf trägt seine zwei unbekannten Werte als
     nummerierte Platzhalter im Befehl — er ist **absichtlich** nicht ausführbar, solange U4 und E3
     offen sind, und sagt das daneben. Der Datenbankname ist **kein** unbekannter Wert: er steht
     ausgeschrieben, mit seinem Beleg im Kommentar darüber.
  2. **Platzhalter:** `<E2-…>`, `<E3-…>`, `<…, U4>` — je mit Nummer; **U8** trägt seine Nummer an der
     Protokollzeile.
  3. **Abbruchpunkt:** Einer, ausdrücklich als **kein** Abbruch der Probe markiert, mit dem Rückweg
     „Messung nachholen, bevor ein Termin gesetzt wird" — plus die Entscheidungsregel für den nächsten
     Lauf.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G12 — Aufraeumen, U8-Messungen und die Regel fuer den naechsten Lauf"
  ```

---

## Aufgabe 14 — §G13: Der Abbruchpunkt — was rot macht und was rot bedeutet

**„Rot" heißt vier verschiedene Dinge, und die Unterscheidung ist der Zweck dieses Abschnitts.** Wer
sie im Fenster improvisiert, verschiebt entweder einen behebbaren Fund oder repariert einen, der eine
Absage ist.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G13 — Der Abbruchpunkt`, hinter §G12)
- Test: das Dreier-Tor, geprüft in Schritt 5.

**Schnittstellen:**
- Verbraucht: die Haken **G1** (§G3 / Aufgabe 4), **G2** (§G4 / Aufgabe 5), **G3** (§G5 / Aufgabe 6),
  **G4** (§G6 / Aufgabe 7), **G5** (§G7 / Aufgabe 8), **G6** (§G9 / Aufgabe 10 und §G10 / Aufgabe 11).
- Liefert: die Zusage „**es gibt keinen Cutover auf einer roten Generalprobe**" an Kapitel 4 §4.2, und
  die Klassenzuordnung A–D an §G3 / Aufgabe 4, die sie zitiert.

- [ ] **Schritt 1: Die zusammengesetzte Grün-Bedingung — sechs Zeilen, keine Auswahl**

  ````markdown
  ## §G13 — Der Abbruchpunkt

  ⚠️ **Der teuerste Fehler dieses Ports ist paritätsgrün** (Randbedingung 3). Die Grün-Bedingung ist
  deshalb **zusammengesetzt. Alle sechs Zeilen, nicht eine Auswahl:**

  | # | Messung | Wo | Ergebnis |
  |---|---|---|---|
  | **G1** | A1–A13 haben ihre Sollwerte, **alle acht blockierenden** (A2·A3·A4·A5·A6·A7·A10·A11) sind erfüllt | §G3 | ☐ |
  | **G2** | Der Importer endet mit **Exit-Code 0 UND** der Abschlusszeile ⬜ **L6** | §G4 | ☐ |
  | **G3** | **Fünf** Zeilenzahlen im Ziel entsprechen den Sollwerten der Quelle — **paarweise, nicht in der Summe** | §G5 | ☐ |
  | **G4** | Die **fünf** Verwechslungspaare stimmen **zeilengenau** | §G6 | ☐ |
  | **G5** | Die Zeitstempel-Gegenprobe zeigt keinen 1970er-Stand; **Abfrage Z: alle zehn Zeilen `0`** | §G7 | ☐ |
  | **G6** | Der ephemere Container besteht **V0–V16** | §G9, §G10 | ☐ |

  > **Die Abbruchbedingung in einem Satz:** *Die Generalprobe ist grün, wenn G1 bis G6 vollständig grün
  > sind. Ist eine Zeile rot, ist die Generalprobe rot — es gibt keine teilweise grüne Generalprobe,
  > und es gibt keinen Cutover auf einer roten.*
  ````

- [ ] **Schritt 2: Die vier Klassen**

  ````markdown
  ### Klasse A — Absagen, nicht anpassen

  | Fund | Warum Absage |
  |---|---|
  | **Zehnstellige Zeitstempel** in der Quelle (A6) | Spec 1 wörtlich: „ist die gesamte Import-Annahme falsch und der Cutover wird **abgesagt, nicht angepasst**". Die Einheitenentscheidung (11), die Mapping-Funktionen und der Riegel `[1e12, 4e12]` hängen daran |
  | **Trigger oder Views** in `sqlite_master` (A7) | „Ein Treffer ist Fachlogik, die kein Repo kennt." Der Grep-Beleg der Analyse gilt für den **Quelltext**, nicht für die laufende Datenbank |
  | **Der Registry-Eintrag fehlt im Image** (V3 antwortet 503) | Falsches Image. Kein Handgriff am Cutover-Abend behebt das; es braucht einen **CI-Lauf**. Vorbild derselben Härte: `docs/runbooks/suite-update-webfinger.md:43-45` |

  **Rückweg bei Klasse A: der Termin wird verschoben.** Es gibt keinen anderen.

  ### Klasse B — in der KOPIE bereinigen, Bereinigung protokollieren

  `software_versions where is_target = 1` ≠ 1 (**A2**): wird **vor** dem Import **in der Kopie**
  bereinigt und die Bereinigung protokolliert. Der Update-Stand ist **berechnet, nicht gespeichert**
  (`radio-admin/server/src/db/schema.ts:53-56`) — bei 0 oder 2 kippt der angezeigte Status **jedes**
  Geräts, und **keine Parität sieht es**. Ebenso **A3** (Waisen löschen, Anzahl ins Protokoll).

  ⚠️ **Die Bereinigung geschieht in der Kopie und wird im Echtlauf WIEDERHOLT, nicht vererbt.** Eine
  Bereinigung, die nur in der Generalprobe stattfand, ist ein Fund, den das Fenster **erneut** trifft.

  ### Klasse C — reparieren, dann Generalprobe von vorn

  A3 · A4 · A5 · A10 · A11 · **jeder** Fund aus V0–V16 · jedes ungleiche Zählpaar aus G3 · jede
  abweichende Stichprobe aus G4 · jede Abweichung aus G5.

  **„Von vorn" ist wörtlich zu nehmen:** `rm -rf "$GP"`, neu importieren. Ein Nachbessern auf dem
  bestehenden Stand prüft die **Reparatur** und nicht den **Import**.

  ### Klasse D — der Fund, der aussieht wie C und keiner ist

  **Ein roter Paritätscheck.** `scripts/import/portal.ts:105-107`: „A thrown parity error means the
  target was already mutated … not ‚nothing happened‘". **Der Rückweg ist die leere Ziel-DB, nie ein
  zweiter Lauf.** In der Generalprobe kostet das ein `rm -rf`; im Echtlauf ist es der Grund, warum
  Kapitel 4 gegen eine **leere** Ziel-DB importiert und nicht gegen eine „fast fertige".

  ### Und die Klasse, die keine ist: ein Startabbruch aus `radioBootFehler()`

  Fünf Meldungen (§G8 / Aufgabe 9 Schritt 4) brechen den Start der **gesamten** Suite ab. Das ist
  **kein Moduldefekt**, sondern eine **unvollständige Env** — behebbar in einer Zeile, und die Probe
  ist danach zu wiederholen. §G8 macht diesen Abbruch zum vorgeschriebenen Handgriff, damit er im
  Fenster **wiedererkannt** wird.
  ````

- [ ] **Schritt 3: Die Grenze — verschieben oder reparieren**

  ````markdown
  > **Verschoben wird bei Klasse A. Repariert wird bei B, C, D — aber NIEMALS im Cutover-Fenster.**
  > Jede Reparatur zieht eine **vollständige neue Generalprobe** nach sich, und eine vollständige
  > Generalprobe passt nicht in ein Fenster ohne Parallelbetrieb.

  **Der Grund steht in der Lage selbst:** es gibt **keinen Rückweg-Importer** (Suite → `radio-admin`)
  und kein Vorbild dafür (`docs/radio-portierung-analyse.md:626-628`). Der Point of no return ist der
  **erste fachliche Schreibvorgang in `radio.db` nach dem Umschwenk**. Ein Fund, der im Fenster
  „schnell" behoben wird, wird also entweder **vor** diesem Punkt behoben — oder er wird zu einem
  **Datenverlust mit bekanntem Umfang**.
  ````

- [ ] **Schritt 4: Die Erfüllungsliste dieses Kapitels**

  ````markdown
  ### Wann die Generalprobe erfüllt ist

  Vorbild `files-cutover.md:360-370`. **Alle Punkte, nicht die meisten:**

  - [ ] 1. Die vier Voraussetzungen aus **§G1** sind grün und **datiert** — insbesondere Nr. 4 (die
        Retention-Frist) **vor** dem ersten Schnappschuss.
  - [ ] 2. Der Schnappschuss aus **§G2** ist mit `.backup` entstanden, `integrity_check` sagte `ok`,
        und der Alt-Stack wurde dafür **nicht** angehalten.
  - [ ] 3. **G1 bis G6** sind vollständig grün und **einzeln** protokolliert.
  - [ ] 4. **Abfrage Z** wurde mit **zehn** abgelesenen Zeilen protokolliert, nicht mit dreien.
  - [ ] 5. Der **absichtlich rote Lauf** aus §G8 wurde einmal gefahren und seine Abbruchmeldung
        **wörtlich** notiert.
  - [ ] 6. **V0** war grün, **bevor** irgendeine andere V-Zeile ausgewertet wurde.
  - [ ] 7. Der Prüfcontainer ist gestoppt und **entfernt**, `$GP` ist gelöscht (**§G12**).
  - [ ] 8. **U8** ist gemessen (beide Hälften, oder die zweite ausdrücklich als **offen** vermerkt).
  - [ ] 9. Die Wahl **Weg A / Weg B** für den Login-Rückweg ist getroffen und mit **Person und Datum**
        protokolliert (§G8).
  - [ ] 10. Jede ⬜-Zeile aus **§G0** trägt entweder einen **Wert** oder den ausdrücklichen Vermerk
        „nicht prüfbar, weil ______" — **keine leere Zelle ohne Satz**.
  ````

- [ ] **Schritt 5: Prüfschritt und Commit**

  1. **Kopierbar:** Dieser Abschnitt trägt bewusst **keine** Befehle — er ist die Entscheidungsregel
     über die Befehle der anderen. Gegenprobe: jede Klasse nennt ihre Fundmenge **namentlich** (A-Marke
     bzw. V-Nummer bzw. G-Haken), keine mit „usw.".
  2. **Platzhalter:** ⬜ **L6** in G2; die Erfüllungspunkte tragen Datums- und Personenfelder.
  3. **Abbruchpunkt:** Der Abschnitt **ist** der Abbruchpunkt. Jede Klasse nennt ihren Rückweg, und
     Klasse A sagt ausdrücklich, dass ihrer die Verschiebung ist.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G13 — Gruen-Bedingung G1-G6, vier Klassen, Erfuellungsliste"
  ```

---

## Aufgabe 15 — §G14: Was am ephemeren Container nicht prüfbar ist

**Diese Tabelle ist der Grund, warum das Kapitel nicht mit dem Prüfsatz endet.** Sechs Punkte, je
Punkt: **wann** prüfbar, und **was der Ersatz vorher ist**.

**Dateien:**
- Ändern: `docs/runbooks/radio-cutover.md` (neuer Abschnitt `## §G14 — Was am ephemeren Container
  nicht prüfbar ist`, hinter §G13)
- Test: das Dreier-Tor, geprüft in Schritt 4.

**Schnittstellen:**
- Verbraucht: die Ergebnisse aus §G9 / Aufgabe 10 (V5, V6) und §G10 / Aufgabe 11 (V13).
- Liefert an **Kapitel 4**: die sechs Posten als **Eingangsliste für §4.6**, dazu die zwei
  Reihenfolgezusagen aus Schritt 3 (Alt-Host-Redirect, Login-Rückweg) und die Vorbedingung
  „Zonenregeln gelesen" (§4.2 Nr. 9).

- [ ] **Schritt 1: Die Tabelle**

  ````markdown
  ## §G14 — Was am ephemeren Container nicht prüfbar ist

  | Aussage | Warum nicht am Prüfcontainer | Wann prüfbar | Der Ersatz vorher |
  |---|---|---|---|
  | **Cloudflare lässt die Wege durch** | Der Container hängt an keinem Router und schon gar nicht am Rand. Bekannter Bestandsfall im Haus: `iuk-ue.de`/`qr.iuk-ue.de` zeigten Bot-Challenges | **nach** dem Umschwenk, erster Abruf von außen | keiner am Container. Der Ersatz ist ein **Vorabblick in die Zone**: trägt `radio.iuk-ue.de` heute Regeln, die der Alt-Kiosk brauchte (Bot Fight Mode, Cache-Regeln, Page Rules)? **Ein benannter Schritt „Zonenregeln gelesen und protokolliert" VOR dem Fenster** (§4.2 Nr. 9) |
  | **Echtes TLS, echtes Zertifikat, HSTS** | kein Router, kein ACME. Stufe 3 liefert einen *sicheren Kontext* **ohne** TLS | **nach** dem Umschwenk | Stufe 3 für alles, was nur einen sicheren Kontext braucht; notfalls die Escalation aus §G8 / Aufgabe 9 Schritt 7 |
  | **Der Header-Vorlauf des Randes** (`x-forwarded-host`) | ein `docker run` setzt ihn nicht; die Probe trifft den `host`-**Rückfall** in `src/core/routing.ts:37`, die Produktion den **Vorrangzweig**. Vernarbt: `lagerbuch-cutover.md:102` | **nach** dem Umschwenk, in einem Atemzug mit dem ersten Abruf | die Escalation aus §G8 setzt den Header und trifft denselben Zweig; dazu §4.2 Nr. 8 (am Server belegen, dass der Edge-Proxy ihn **setzt**, nicht durchreicht) |
  | **Gedruckte QR-Codes** | absolute URL auf die **besetzte** Endadresse | **nach** dem Umschwenk | die **Nutzlast als Text** vergleichen (§G10 / Aufgabe 11 Schritt 4) |
  | **Der Service Worker des Alt-Kiosk** | er lebt in **fremden Browsern**, nicht im Image. Er überlebt den Umschwenk, weil der Origin **zeichengleich** bleibt, und liefert HTTP 200 mit veraltetem Inhalt — **kein Build, kein Test, kein Healthcheck sieht das** | **nach** dem Umschwenk, auf einem Gerät, das den Alt-Kiosk kannte: **einmal neu laden** | **V5/V6**: der Abräum-Worker ist **im Image**, hat den richtigen Rumpf und wird auf Fremdhosts nicht ausgeliefert. ⚠️ Er gehört in den **ersten Deploy**, nicht in den Cutover (§4.2 Nr. 2) — bis zum Umschwenk holt ihn niemand ab, weil nichts in der Suite `register()` ruft. Worst Case bleibt **eine** veraltete Ansicht je Gerät |
  | **Die Cookie-Domain** (host-only, **kein** `.iuk-ue.de`) | ⚠️ **nie per HTTP prüfbar — auch nicht nach dem Umschwenk.** Spec 1 §3.4.1 wörtlich: „Playwright kann diesen Fehler nicht sehen. Es fährt gegen **einen** Host, und dort verhält sich ein domain-weites Cookie **exakt** wie ein host-only" (Falle 19). `pnpm build` und `pnpm typecheck` sehen ein zusätzliches `domain`-Feld nicht — es ist **typkorrekt** | **nie** durch einen Abruf | **die Quelltext-Zusicherung aus Spec 1 §3.8, und sie muss vor der Generalprobe grün sein** (§G1 / Aufgabe 2 Nr. 2). Das ist die **einzige** Absicherung. V13 liest zusätzlich ab, dass in den DevTools **keine** `Domain` steht — **ein Indiz, kein Beweis** |
  ````

- [ ] **Schritt 2: Der Zusatz, der die Cookie-Zeile für das SUITE-Cookie ergänzt**

  ````markdown
  ⚠️ **Eine siebte Aussage, die aus der Env-Liste des Prüfcontainers folgt und leicht übersehen wird:**
  der reguläre Stack setzt `AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}`
  (`compose.yaml:83`), die Probe setzt es **nicht** (§G8 / Aufgabe 9 Schritt 3). Das **Suite**-
  Sitzungscookie ist in der Probe damit **host-only** und in der Produktion **domain-weit** — die Probe
  sagt über diese eine Eigenschaft **nichts**, weder in die eine noch in die andere Richtung.

  **Das betrifft NICHT das Ausleih-Cookie `radio_ausleihe`**: es trägt **nie** ein `domain`
  (Spec 1 §3.4.1), und die Zusicherung dafür ist die Quelltext-Zusicherung in der Zeile darüber.
  Die Hausform dieser Zusicherung ist gebaut und wird nicht neu erfunden:
  `src/app/m/lagerbuch/_lib/helferSitzung.test.ts:283-307` prüft auf eine **Zuweisung**
  (`/^\s*domain\s*:/m`), nicht auf das Wort — weil der Kopfkommentar der geprüften Datei die Wörter
  selbst führt (`helferSitzung.ts:105-120`) — und verbietet zusätzlich den **Import** von
  `@/core/auth/cookies`, die naheliegende falsche Vorlage.
  ````

- [ ] **Schritt 3: Die zwei Reihenfolgezusagen, die aus dieser Tabelle folgen**

  ````markdown
  **Dazu zwei Zusagen, die hier stehen, weil sie aus der Unprüfbarkeit folgen — und nicht aufgeweicht
  werden:**

  * ⚠️ **Der Redirect vom Alt-Host `radio-admin.iuk-ue.de` darf vorher NICHT scharf sein.** Er zeigt
    auf `radio.iuk-ue.de/admin`, und dort liegt bis zum Umschwenk die **eigene Verwaltung des
    Alt-Kiosk** (`login.tsx`, `index.tsx`, `history.tsx`, `devices.tsx`, `settings.tsx`,
    `docs/radio-portierung-analyse.md:392-398`). Früh geschaltet führt er **jeden Verwaltenden aus
    einer funktionierenden Alt-Verwaltung in die Verwaltung einer anderen Anwendung** — schlechter, als
    nichts zu tun. **Der Redirect wird im SELBEN Fenster wie der Umschwenk scharf, und die drei `curl`
    laufen danach** (§4.6 Nr. 7).
  * ⚠️ **Der Login-Rückweg ist der einzige Fehlfall, der stumm ist** (§G8 / Aufgabe 9 Schritt 6). Er
    entscheidet über **Weg A oder Weg B**, und **diese Entscheidung fällt vor dem Fenster**, nicht in
    ihm.

  > Alt-Host-Redirect: heute scharf? ☐ nein (richtig) ☐ ja (⚠️ **Fund** — zurückstellen, bevor die
  > Generalprobe als grün gilt) · abgelesen am ____________
  ````

- [ ] **Schritt 4: Prüfschritt und Commit**

  1. **Kopierbar:** Dieser Abschnitt trägt keine eigenen Befehle — er benennt für jeden Posten den
     **Ersatz** und den Abschnitt, in dem dessen Befehl steht (§G8, §G10, §4.2, §4.6). Gegenprobe:
     jeder der sechs Posten nennt eine Spalte „Wann prüfbar" **und** eine Spalte „Ersatz vorher";
     keine ist leer.
  2. **Platzhalter:** Keine ⬜-Nummer nötig; die Zeile zum Alt-Host-Redirect trägt ein Protokollfeld
     mit Datum.
  3. **Abbruchpunkt:** Einer — ein **heute schon scharfer** Alt-Host-Redirect ist ein Fund, der
     zurückgestellt wird, bevor die Generalprobe als grün gilt. Rückweg: zurückstellen und die
     Ablesung wiederholen.

  ```bash
  rtk git add docs/runbooks/radio-cutover.md
  rtk git commit -m "docs(radio): Runbook §G14 — sechs Posten, die der Pruefcontainer nicht beantwortet"
  ```

---

## Was dieser Planteil den anderen Planteilen zusagt

Namen, Signaturen und Dateipfade, auf die sich die übrigen vier Teile verlassen dürfen — und die sie
**zeichengleich** führen müssen, damit die Zusammenführung nicht zwei Fassungen erzeugt.

1. **Die Runbook-Datei** ist `docs/runbooks/radio-cutover.md`. Dieser Teil belegt darin **§G0–§G14**.
   Legt er sie an, trägt sie **nur** Titel, Ziel, Grundlagenzeile und den bash-Hinweis (§G0 /
   Aufgabe 1 Schritt 1). ⚠️ **Der ⚠️-Kopfabschnitt („was diesen Cutover unterscheidet") gehört
   Kapitel 4** und wird hier nicht geschrieben.
2. **Der Name der Schnappschuss-Datei ist `./radio-admin-snapshot.sqlite`**, im Arbeitsverzeichnis des
   Hosts — in **allen** Kapiteln derselbe (§1.5.3). Kapitel 4 §4.5 Schritt 2 erzeugt dieselbe Datei
   mit demselben Befehl.
3. **Der Prüfcontainer der Generalprobe heißt `radio-gp`**, hört auf `127.0.0.1:3999` und mountet
   `-v "$GP/data":/data`. **Kapitel 4 §4.5 Schritt 8 erbt diese Form mit genau zwei Unterschieden:**
   `-v suite_data:/data` und ⛔ **kein `AUTH_DEV_LOGIN`** (W5). Alles Übrige — Env-Liste, Portbindung
   an `127.0.0.1`, keine Labels, kein `proxy`-Netz — ist zeichengleich.
4. ⚠️ **`SUITE_HOST_RADIO` trägt in BEIDEN Prüfcontainern eine Kommaliste:**
   `SUITE_HOST_RADIO=localhost,radio.iuk-ue.de`. Kapitel 4 §4.5 Schritt 8 muss dieselbe Zeile führen,
   sonst misst sein Prüfsatz den Portal-Login (§G8 / Aufgabe 9 Schritt 2, Rechnung ausgeschrieben).
5. **Die Zeile V0 (Portal-Fallback-Probe mit ⬜ L10) gehört in beide Prüfsätze** — in §G9 / Aufgabe 10
   **und** in §4.5 Schritt 8. Ohne sie ist der Portal-Fallback genau dort still, wo er am teuersten
   ist.
6. **Abfrage Z hat ZEHN Zeilen, und alle zehn müssen `0` sein** — neun Zahlgrenzproben plus die
   Formatprobe auf `devices.last_updated_at`. Kapitel 5 §5.2.2 führt denselben Wortlaut; die
   Erfüllungspunkte und Anhang A-5 müssen „**zehn**" sagen, nicht „drei". ⚠️ **Der
   Generalproben-Lauf von Z ist KEINE Abbau-Sperre** — andere Datei, anderer Lauf, andere Lesform.
7. ⚠️ **⬜ L5 wird reduziert.** Die Feldnamen sind heute belegbar (`src/core/health/index.ts:4-15`,
   `src/app/api/health/[modul]/route.ts:23-26`); der zitierte Beleg `route.ts:11-18` zeigt in einen
   Kommentarblock. **Vorschlag an die Zusammenführung:** L5 auf „der **Sollwert** von `revision`,
   Quelle §4.2 Nr. 1" zurückschneiden und die Feldnamen an den fünf Verwendungsstellen ausschreiben.
   **Die ⬜-Tabelle des Rahmens ist nicht die Datei dieses Teils — die Änderung ist gemeldet, nicht
   vollzogen.**
8. **Zwei neue Nummern, N4 und N3** (Begründung in „Die Leerstellen dieses Planteils"). Sie gehören in
   die ⬜- bzw. U-Tabelle des Rahmens, wenn die Zusammenführung sie einsammelt. **N3 wird auch von
   Kapitel 4 §4.5 Schritt 4 gebraucht** — dort ist die Frage schärfer als hier.
9. **U8 ist eine AUSGABE dieses Kapitels, keine Eingabe.** Die zwei Messungen entstehen in §G12 /
   Aufgabe 13 und bemessen das Fenster (§4.2 Nr. 7).
10. **E1 blockiert die Generalprobe nicht** (freier Gruppenwert unter `AUTH_DEV_LOGIN`,
    `src/core/registry.ts:137`). **⬜ L13/L14 blockieren sie ebenfalls nicht** — sie gehören zu §4.5
    Schritt 8. Wer sie hier als Sperre führt, blockiert doppelt.
11. **Die Abschnitte `§A` (A1–A13, Kapitel 2) und `§I` (der Importer, Kapitel 1) müssen in derselben
    Runbook-Datei existieren und diese Namen tragen** — §G3 / Aufgabe 4 und §G4 / Aufgabe 5 verweisen
    darauf, statt den Wortlaut ein zweites Mal zu führen.
12. **Die Frist aus W1 gehört in §G1, nicht nur in §4.2 Nr. 3:** „Retention neutralisiert oder Volume
    kopiert" gilt **vor dem ersten Generalproben-Schnappschuss**. Der Rückverweis in Spec 2 heißt
    korrekt **§3.6 Nr. 4**, nicht „§3.6 Zusage 12" — §3.6 führt vier nummerierte Voraussetzungen und
    keine Zusage-Nummerierung.

---

## Selbstprüfung gegen den Entwurf

| Abschnitt von Spec 2 Kapitel 3 | Aufgabe |
|---|---|
| §3.1.1 (was die Generalprobe ist, Alt-Stack nicht anhalten) | 2, 3 |
| §3.1.2 (Aufbau: Kennung, Wegwerf-DATA_DIR, Import, chown) | 5 |
| §3.1.3 (Idempotenz heißt Reset) | 5, 13 |
| §3.1.4 (A1–A13, Zuordnung zur Probe) | 4 |
| §3.1.5 / G1–G6 | 14 (Übersicht) · 4, 5, 6, 7, 8, 10, 11 (je Haken) |
| §3.1.5.1 (fünf Tabellen, nicht sechs) | 6 |
| §3.1.5.2 (fünf Verwechslungspaare) | 7 |
| §3.1.5.3 (Faktor-1000-Gegenprobe) | 8 |
| §3.1.6 (Retention stillgelegt, Log) | 12 |
| §3.1.7 (`SUITE_SEED` bleibt aus) | 6 (Ablesung), 9 (Env-Liste) |
| §3.1.8 (Reihenfolge der Probe) | 11 |
| §3.2.1 (ohne Labels, Netz, Volume, Textriegel) | 9 |
| §3.2.2 (die `docker run`-Form) | 9 |
| §3.2.3 (Env-Liste als Prüfung, absichtlich rot) | 9 |
| §3.2.4 (drei Stufen, Weg A/B, Falle 61) | 9 |
| §3.2.5 (Escalation, `gp-compose.yaml`) | 9 |
| §3.2.6 (Prüfsatz V1–V8, R36) | 10 · V8 zusätzlich in 2 |
| §3.2.6 (V9–V16, browsergestützt) | 11 |
| §3.2.7 (Aufräumen) | 13 |
| §3.3.1 (keine Kamerafläche, ⬜ L9) | 11 |
| §3.3.2 (Secure-Cookie, V13) | 11 |
| §3.3.3 (QR-Nutzlast als Text) | 11 |
| §3.4 (sechs nicht prüfbare Aussagen) | 15 |
| §3.5 (Klassen A–D, die Grenze) | 14 |
| §3.6 (vier Voraussetzungen, U8) | 2 · U8 in 13 |
| W1 (`.backup`, kein Stopp, die Frist) | 2, 3 |
| W5 (welcher Container, Residuum 2) | 5 (Lese-Zustände), 9, 10 |
| W6 (`grep` ohne `^`) | 12 |
| W7 (⬜ L7 statt 302) | 10 |
| W8 (zehn Spalten, fünf Paare) | 4, 7, 8 |

**Nicht abgedeckt und bewusst so:**
- **Der ⚠️-Kopfabschnitt des Runbooks** (die neun harten Randbedingungen) — er gehört Kapitel 4, weil
  er das ganze Fenster rahmt und nicht die Probe.
- **Der Wortlaut von A1–A13** und **der Wortlaut des Importers** — Kapitel 2 bzw. Kapitel 1, eine
  Fassung statt zwei (`lagerbuch-cutover.md:365-366`).
- **§4.5 Schritt 8** — die Fenster-Verifikation. Dieser Teil liefert ihre **Vorlage** und die zwei
  Unterschiede, schreibt den Schritt aber nicht.
- **⬜ L11, L12, L13, L14** — Manifest-Abruf, Browser-Ablesepunkt, Containername und die
  Zwei-Prozesse-Frage gehören ins Fenster.

**Namensgleichheit** (über alle fünfzehn Aufgaben zeichengleich geschrieben und einzeln nachgelesen):
`radio-gp` · `$GP` · `$IMG` · `$UID_APP` / `$GID_APP` · `./radio-admin-snapshot.sqlite` ·
`SUITE_HOST_RADIO=localhost,radio.iuk-ue.de` · `radio-verwaltung-gp` · `RADIO_HISTORIE_PURGE=0` ·
`B=http://127.0.0.1:3999` · `H='Host: radio.iuk-ue.de'` · `radio_ausleihe` · G1–G6 · V0–V16 ·
Klasse A/B/C/D.

---

## Bericht zur Re-Kritik — was eingearbeitet wurde, was eingeschränkt, was weitergegeben

⚠️ **Dieser Bericht ist Teil des Auftrags.** Sein Fehlen war der Mangel des Vorgängerdurchgangs: dort
war nicht dokumentiert, ob ein Fund mit Gegenbeleg verworfen oder stillschweigend übernommen wurde.

### A. Eingearbeitet — mit Fundort in diesem Plan

| Fund | Wo eingearbeitet | Wie |
|---|---|---|
| **Block 1 · RK-A1** (blockierend) — `SUITE_HOST_RADIO=localhost` gegen `curl -H 'Host: radio.iuk-ue.de'` | Aufgabe 9, Schritt 2; Aufgabe 10, Schritt 2 (V0) | **Kommaliste** `localhost,radio.iuk-ue.de` in **beiden** Prüfcontainern, mit der Rechnung ausgeschrieben (`registry.ts:225-232` exakt · `hosts.ts:39-46` splittet auf `,` · `validateHostConfig` `hosts.ts:80-95` hat gegen beide Werte nichts · `routing.ts:69-73` Portal-Fallback → Login). Zusätzlich die empfohlene **V0-Zeile** (`grep -c '<⬜ L10>'`) als **erste** Prüfung, vor deren Grün nichts ausgewertet wird. Die Alternative „zwei Container mit je einem Wert" ist benannt und zulässig |
| **Block 1 · RK-A9** und **Block 3 · RK-A6** — „Z alle drei `0`" gegen zehn Glieder | Aufgabe 8, Schritt 3; Aufgabe 14, Schritt 4 (Erfüllungspunkt 4) | Z **vollständig transkribiert**, „**alle ZEHN Zeilen MÜSSEN 0 sein**", die zehnte als **Formatprobe** eigens benannt. Zusage 6 verlangt dieselbe Zahl von Kapitel 5 und von Anhang A-5 |
| **Block 1 · RK-A11** — Quoting der „gleichwertigen" `VACUUM INTO`-Zeile | Aufgabe 3, Schritt 3 | Die Alternative steht **nicht mehr** als Einzeiler neben `sh -c '…'`. Sie ist entweder weg oder **vollständig mit aufgelöster Verschachtelung** ausgeschrieben, mit dem Satz, dass sie **nicht empfohlen** ist |
| **Block 2 · RK-A2** — `devices.last_updated_at` ohne Sollwert | Aufgabe 7, Schritt 3 | **Sollwert ausgeschrieben statt zwei Kandidaten**: „`uhrzeit_utc >= 22:00` (Sommer) bzw. `>= 23:00` (Winter) → `utc_tag_plus1`, sonst `utc_tag`"; `utc_tag`/`utc_tag_plus1` ausdrücklich als **Plausibilitätsrahmen, keine Alternativen**. Dazu der Satz, dass die Alt-Anwendung für **diese** Spalte kein Schiedsrichter ist, mit beiden Fundstellen (`export.ts:49-51` UTC gegen `format.ts:4` / `DeviceEditForm.tsx:41`, `:61` lokal) |
| **Block 2 · RK-A3** — ARRANGE-Riegel greppt Text, den Backticks tragen | Aufgabe 6, Schritt 3 | Die **Zusicherung** ist strukturell: `select count(*) from pragma_index_list('loans') where name = '…' and partial = 1;` **= 1**. Der `sql`-Text bleibt, aber **nur als Protokollzeile**, mit der Begründung (`0003_kind_spot.sql` schreibt den Ausdruck mit Backticks) |
| **Block 2 · RK-A5** — §2.2.2 verdrahtet den Zielarm fest auf `$VOL_SUITE` | Aufgabe 7, Schritt 1 | Für die **Generalprobe** ist der Zielarm-Lesebefehl `sqlite3 -readonly "$GP/data/radio.db"` **auf dem Host** (Bind-Pfad, §1.8 Glied 4). Die `$VOL_SUITE`-Form ist ausdrücklich als **Fenster**-Form markiert, samt dem stillen Fehlfall „fünf Nullen aus einer leeren produktiven `radio.db`" und dem §3.2.1-Riegel **mit** Geltungsbereich |
| **Block 2 · RK-A6** — kein Zielarm-Handgriff für `created_at ↔ updated_at ↔ last_updated_at` | Aufgabe 7, Schritt 2 | **Dritte symmetrische Abfrage** aufgenommen (`select id, created_at, updated_at, last_updated_at from devices where id = …`), mit dem Satz, warum sie keine Dopplung ist (die zwei Listen führen die drei Spalten **nicht**) und wie sie ausgewertet wird |
| **Block 3 · RK-A4** — ⬜ L5 als erfundene Leerstelle | „Die Leerstellen dieses Planteils"; Aufgabe 10, Schritt 4 | Feldnamen **wörtlich ausgeschrieben** mit `src/core/health/index.ts:4-15` und `src/app/api/health/[modul]/route.ts:23-26`; der falsche Beleg `route.ts:11-18` benannt. L5 **reduziert auf den Sollwert von `revision`** — und die Reduktion als **Vorschlag an die Zusammenführung** gemeldet, nicht eigenmächtig vollzogen (Zusage 7) |
| **Block 3 · RK-A5** — elf blanke §-Verweise, neun davon in Kapitel 3 | Global Constraints, dritter Aufzählungspunkt | Regel gesetzt und durchgehalten: **jeder** Verweis in Spec 1 trägt das Präfix `Spec 1 §`; ein `§` ohne Präfix meint immer Spec 2. Die Regel steht zusätzlich im **Runbook-Kopf** (Aufgabe 1, Schritt 1), damit sie den Abend überlebt |
| **Block 3 · RK-A8** — „§3.6 Zusage 12" existiert nicht | Zusage 12 | Auf **§3.6 Nr. 4** korrigiert, mit dem Befund daneben: §3.6 führt vier nummerierte Voraussetzungen und keine Zusage-Nummerierung |
| **Block 3 · RK-A10** — die Begründung zu `mkdir -p "$GP/data/files"` ist falsch | Aufgabe 5, Schritt 2 | **Der Handgriff bleibt, die Begründung wird ersetzt:** ein **Bind**-Mount erbt die Verzeichnisstruktur des Images nicht (`Dockerfile:64-71`). Der Verweis auf `boot.ts:425` ist **gestrichen**; stattdessen steht der korrekte Gegenbefund (`filesBootFehler` ruft `pruefeAblage` nur bei gesetztem `SUITE_HOST_FILES`, `boot.ts:82-95`; `boot.ts:420-432` behandelt ein fehlendes Verzeichnis ausdrücklich als **keinen** Fehler) — samt der Folge, dass man bei einem Startabbruch **nicht** bei `files` suchen soll |

### B. Eingeschränkt übernommen — mit Begründung der Einschränkung

| Fund | Was übernommen wurde, und was nicht |
|---|---|
| **Block 1 · RK-A6** — Kennung aus dem Image statt aus dem Compose-`user:` | **Übernommen**, aber mit einem **anderen Biss als in §4.5 Schritt 4.** Der Einwand ist dort scharf: die Erwartung „`radio.db` trägt dieselbe Kennung wie die übrigen Modul-DBs" ist auf einem Standardhost **zwangsläufig rot**, weil die anderen DBs der Compose-Prozess mit gid 1001 (bzw. 1000) schreibt und `radio.db` gid 65533 bekäme. **In §3.1.2 ist die Lage schwächer:** die Generalprobe ist **in sich konsistent**, weil **dieselben** abgelesenen Werte sowohl in den `chown` (Handgriff 3) als auch in `--user` des Prüfcontainers gehen — es gibt dort keine fremde Datei, gegen die verglichen wird. **Trotzdem übernommen**, und zwar aus einem zweiten Grund, den der Fund mitliefert: läuft die Produktion unter `1001:1000`, prüft die Generalprobe unter `1001:65533` eine Rechtelage, **die es in der Produktion nicht gibt**. Deshalb: ⬜ **N3** eingeführt, **beide** Zahlen ins Protokoll, und **die Probe läuft unter der Server-Zahl** (Aufgabe 5 Schritt 1, Aufgabe 9 Schritt 3). ⚠️ **Nicht übernommen** wurde die Empfehlung, den Containernamen über `docker inspect` abzulesen — das ist ⬜ L13 und gehört ins Fenster; für die Probe genügen `SUITE_USER` aus der `.env` und `docker compose config` |
| **Block 3 · RK-A3** — W5 Residuum 2, `immutable=1`, Vorschlag einer neuen ⬜ L15 | **Der Befund ist richtig und wird für Kapitel 3 NEU ZUGESCHNITTEN.** Der Fund argumentiert über den **regulären Stack** (hält er `radio.db` offen? — `bootstrap.ts:103` und `health/index.ts:13-15` schließen ihr Handle, der radio-Boot-Haken ist ungebaut), und das betrifft §2.2.2s **Fenster**-Zeile und §4.5 Schritt 4. **Für die Generalprobe ist die offene Frage eine andere und sie ist entscheidbar:** dort hängt **`radio-gp` selbst** an der Datei, sobald er läuft — und §2.2.2 begründet `immutable=1` für die Generalprobe genau damit, dass „kein anderer Prozess an der Datei hängt". Das stimmt vor dem Start und nicht danach. **Deshalb keine L15 in diesem Teil, sondern eine ausgeschriebene Zwei-Zustands-Regel** (Aufgabe 5, Schritt 5), die in den Schnittstellen von Aufgabe 9 und Aufgabe 13 wieder auftaucht — weil die Umsetzerin die Aufgaben in falscher Reihenfolge lesen darf und **genau dieser Fehlfall sich als Datenbefund liest**. Die Empfehlung, W5 Residuum 2 als **konservative Wahl** statt als Messung zu formulieren, ist damit für dieses Kapitel eingelöst; für §2.2.2 und §4.5 bleibt sie an die Zusammenführung weitergegeben |
| **Block 2 · RK-A1** — `gelesen_als_s` zeigt NULL, nicht 1970 | **Sachlich anerkannt, aber in diesem Teil nicht anwendbar** — und deshalb hier bewusst **nicht nachgebaut**: die Zwei-Lesarten-Spalte ist eine Konstruktion aus §2.3.1/§2.3.2 (Kapitel 2). §G7 / Aufgabe 8 arbeitet stattdessen mit **Grenzwerten** (`< 946684800` fängt die 1970er-Richtung, `> 4000000000` die 57000er-Richtung) und mit `min/max(returned_at)` — beides ist gegen den NULL-Effekt immun, weil kein `datetime(…, 'unixepoch')` als **Entscheidungs**wert dient. Die zwei `datetime`-Aufrufe in §G5 / Aufgabe 6 sind reine **Protokoll**zeilen auf **Sekunden**werten des Ziels und damit unbetroffen. **Weitergegeben** an den Planteil zu Kapitel 2 |

### C. Nicht mein Kapitel — weitergegeben, mit Zielort

| Fund | Gehört zu |
|---|---|
| **Block 1 · RK-A2** / **Block 3 · RK-A7** — §4.9 Nachtrag: `sqlite3` auf dem Host, und `<umschwenk_epoch_sekunden>` erzeugt kein Schritt | Kapitel 4 (§4.5 Schritt 9 protokolliert den Umschwenk-Zeitpunkt; §4.9 auf die `$VOL_SUITE`-Form) |
| **Block 1 · RK-A3** — `--profile full-app` fehlt im Rückweg 3b | Kapitel 4 (§4.9) |
| **Block 1 · RK-A4** / **Block 2 · RK-A4** / **Block 3 · RK-A2** — §5.2.2 Abfrage A liest auf dem Host | Kapitel 5 (§5.2.2) |
| **Block 1 · RK-A5** — §4.9 hat keine Rücklesung | Kapitel 4 (§4.9, `ps` + `curl` nach 3d) |
| **Block 1 · RK-A7** — Handgriff 3 löscht `radio.db` unter einem laufenden Container | Kapitel 4 (§4.5 Schritt 4 / Schritt 7) |
| **Block 1 · RK-A8** / **Block 3 · RK-A1** — Erfüllungspunkt 9 sagt „§4.2 Nr. 1–12", §4.2 hat dreizehn | Zusammenführung + Kapitel 4 |
| **Block 1 · RK-A10** — §4.6 Nr. 2 greppt in einen 3xx ohne Rumpf | Kapitel 4 (§4.6) |
| **Block 1 · RK-A12** — `scripts/backup.sh` bar aufgerufen bricht ab | Kapitel 4 (§4.6 Nr. 13) |
| **Block 2 · RK-A7** — „sieben" Millisekunden-Konstanten über einer Liste mit dreizehn | Kapitel 1 (§1.3.4) |
| **Block 2 · RK-A8** — `portal.ts:46-48` belegt `?? []`, nicht `!!` | Kapitel 1 (§1.3.5) |
| **Block 2 · RK-A9** — `feedback.ts:63-65` belegt nur die halbe Bauform | Kapitel 1 (§1.8) |
| **Block 2 · RK-A10** — kein Idempotenz-Fall D für `software_versions.is_target` | Kapitel 1 (§1.6.3) |
| **Block 3 · RK-A9** — `files-cutover.md:107-109` belegt etwas anderes (richtig: `:115-116`) | Kapitel 4 (§4.1) |
| **Block 3 · RK-A11** — „fünf (P1–P5)" gegen sechs, P6 fehlt im Sperrenkasten | Kapitel 4 (§4.5 Schritt 3) + Kapitel 5 (§5.3) |
| **Block 3 · RK-A12** — ⬜ L1 hat keinen Anker im Text | Kapitel 1 (§1.5.2) + Zusammenführung |

### D. Eigene Funde dieses Durchgangs — neu, nicht aus der Re-Kritik

| # | Fund | Beleg | Wo behandelt |
|---|---|---|---|
| **E-1** | ⚠️ **V6 misst den Portal-Login, nicht den Modul-Riegel.** `curl -H 'Host: iuk-ue.de' "$B/sw.js"` löst über `moduleForHost("iuk-ue.de")` auf **portal** auf; `portal` ist `requiresAuth: true`, und für `groups === null` endet `decideRoute` in `{ action: "login" }` — **der Handler des Moduls läuft nie**, `hostAbweisung`/B13 wird **nicht** ausgeübt, und die Erwartung „liefert ihn nicht" ist trivial erfüllt | `src/core/registry.ts:57-59` (portal: `requiresAuth: true`, `prodHosts: ["iuk-ue.de"]`) · `src/core/routing.ts:69-73` · `src/core/routing.ts:57-67` (der `/m/<key>`-Zweig sieht den Host **nicht** an) · `src/core/registry.ts:239` (`canAccess` → `true` bei `requiresAuth: false`) | Aufgabe 10, Schritt 4. **Ersatzzeile über den internen Pfad** (`/m/radio/sw.js`), die alte Zeile **bleibt**, aber umetikettiert auf das, was sie misst. Der Pfad ist ⬜ **N4**, weil ihn Spec 1 §7.1.3 entscheidet und niemand sonst |
| **E-2** | ⚠️ **`immutable=1` ist in der Generalprobe nur zwischen den Läufen zulässig.** §2.2.2 begründet es damit, dass „kein anderer Prozess an der Datei hängt" — **`radio-gp` hängt daran**, sobald er läuft | `src/core/db/index.ts:12-22` (WAL) · §3.2.2 (`-v "$GP/data":/data`) · W5 Residuum 2 (dieselbe Mechanik, andere Richtung) | Aufgabe 5, Schritt 5 — **Zwei-Zustands-Regel**, in den Schnittstellen von Aufgabe 9 und 13 wiederholt |
| **E-3** | Der Prüfcontainer setzt **kein** `AUTH_COOKIE_DOMAIN`, der reguläre Stack schon. Über die Domain des **Suite**-Sitzungscookies sagt die Probe damit **nichts** — weder so noch so | `compose.yaml:83` (`AUTH_COOKIE_DOMAIN=${AUTH_COOKIE_DOMAIN:-.iuk-ue.de}`) · `src/core/auth/cookies.ts:47` · §3.2.2 (Env-Liste ohne die Zeile) | Aufgabe 9, Schritt 3 (Zeilentabelle) und Aufgabe 15, Schritt 2 — als **siebte** nicht prüfbare Aussage, ausdrücklich getrennt vom Ausleih-Cookie |
| **E-4** | `sleep 15` ist eine Schätzung an der Stelle, an der ein **Startabbruch** aus `radioBootFehler()` am wahrscheinlichsten ist — und eine zu kurze Wartezeit liest sich wie ein Moduldefekt | `src/core/routing.ts:12` (`/api/health` ist PASSTHROUGH, braucht **keinen** Host-Kopf) · `src/app/api/health/route.ts` (konstant `{status:"ok"}`) | Aufgabe 9, Schritt 5 — **Bereitschaftsprobe als Schleife** statt blindem Warten, mit dem Rückweg „Logs lesen, Env-Zeile ergänzen — **nicht** bei `files` suchen" |
| **E-5** | Zitatfehler in Spec 2 §3.1.2: der `chown`-Befehl steht in **`Dockerfile:71`**, nicht `:72`; `:72` ist `VOLUME /data` | `Dockerfile:71`, `Dockerfile:72` — im Repo nachgezählt | Aufgabe 5, Schritt 1 — korrigiert übernommen. Genau die Klasse, für die W9 existiert |
| **E-6** | Die Hausform der Cookie-Domain-**Quelltext**-Zusicherung ist gebaut und wird in Spec 2 nicht benannt: sie prüft auf eine **Zuweisung** (`/^\s*domain\s*:/m`) statt auf das Wort, weil der erklärende Kommentar der geprüften Datei das Wort selbst führt | `src/app/m/lagerbuch/_lib/helferSitzung.test.ts:283-307` · `helferSitzung.ts:105-120` | Aufgabe 2, Schritt 2 und Aufgabe 15, Schritt 2 — als **Vorbild benannt statt neu erfunden** |
