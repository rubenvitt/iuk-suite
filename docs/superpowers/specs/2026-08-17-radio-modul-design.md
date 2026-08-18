# Modul `radio` — Spec 1: das Modul

**Stand 2026-08-18.** Grundlage: `docs/radio-portierung-analyse.md` @ `c47857a`.
Alt-Stände eingefroren: `radio-admin` @ `265abd5`, `radio-inventar` @ `f883ec4`.

**Was diese Spec ist:** die Bauvorschrift für das Suite-Modul `radio` — Datenmodell, Zugang,
beide Oberflächen, der Wegfall der HTTP-Grenze, Betrieb und Testplan.
**Was sie nicht ist:** der Cutover. Import, Umschwenk und Abbau sind Spec 2; Kapitel 9 ist die
verbindliche Übergabeliste dorthin.

---

## ⚠️ Zum Zustand dieses Dokuments — bitte zuerst lesen

Die neun Kapitel sind vollständig geschrieben (7428 Zeilen, je ein eigener Autor mit Belegpflicht).
**Nicht gelaufen sind: die neun Kapitel-Reviews, die maschinelle Zusammenführung und die
Vollständigkeitskritik** — sie wurden von einer Ausgabengrenze abgewiesen
(„You've hit your individual spend limit"), nachdem 2,65 Mio. Token verbraucht waren.

Konkret heißt das:

* Jedes Kapitel ist **einmal geschrieben und nicht gegengelesen**. Bei der `lagerbuch`-Spec fand die
  erste Kritik elf Punkte, die zweite noch zehn Einzeiler — mit dieser Größenordnung ist auch hier
  zu rechnen.
* Die Zusammenführung unten ist **von Hand** gemacht: die kapitelübergreifenden Zusagen wurden
  mechanisch extrahiert und gegeneinander geprüft (Kapitel B), die Kapiteltexte selbst sind
  **unverändert** übernommen.
* **Vor dem Bau fehlt ein Kritikdurchgang.** Er ist nachzuholen, sobald wieder Budget da ist.

---

## A. Die gesetzten Entscheidungen

Aus der Analyse und den Betreiberantworten vom 17.08.2026. Die Kapitel stehen auf ihnen.

| # | Entscheidung |
|---|---|
| 1 | **Ein** Prod-Host `radio.iuk-ue.de` über `SUITE_HOST_RADIO`; Ausleihe an `/`, Verwaltung an `/admin`; Registry `prodHosts: []` |
| 2 | Alt-Host `radio-admin.iuk-ue.de` bekommt pfaderhaltenden Traefik-`redirectRegex` auf `radio.iuk-ue.de/admin`, danach abgestellt |
| 3 | ⚠️ Der Alt-Kiosk läuft **bereits** unter `radio.iuk-ue.de` → gleicher Origin, **kein Parallelfenster**, Rückweg nur „Router zurück" |
| 4 | `requiresAuth: false`, weil die Ausleihe anonym erreichbar ist |
| 5 | **Kein Gerät, kein Geräte-Enrollment.** Zugriff per gescanntem QR-Code oder Anmeldung über die Suite |
| 6 | Bauform ist das `lagerbuch`-Muster: Code **dauerhaft und sperrbar** (nie löschbar), prägt beim Einlösen eine begrenzte Sitzung — ⚠️ **vorentschieden, siehe Kapitel C.1** |
| 7 | Ausstellen und sperren nur radio-admins; **ausleihen** darf jeder mit Zugriff, in der Sache anonym |
| 8 | Die 1:1-Übernahme des heutigen QR-Mechanismus ist **ausgeschlossen** (geteilter Token als URL-Parameter, unbefristet, unwiderruflich) → Verhaltensänderung mit Ankündigungspflicht |
| 9 | `SUITE_ADMIN_GROUP_RADIO`; `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern |
| 10 | Mit `requiresAuth: false` erbt `/admin` **kein** Middleware-Gating → Riegel und Host-Riegel in jeder Seite, Action und jedem Route Handler selbst |
| 11 | Zeitstempel: Quelle epoch-**Millisekunden**, Ziel Drizzle `mode: "timestamp"` (Sekunden); Schutz ist ein Mapping-Test mit **je Feld unterschiedlichen** Fixture-Werten |
| 12 | 2-Monats-Retention wird übernommen, aber **nicht** als Sofort-Purge beim Boot |
| 13 | `api_tokens` trägt produktiv genau einen Konsumenten (den Alt-Kiosk), der mit dem Port verschwindet |
| 14 | `AdminUser` aus radio-inventar wandert **nicht**; die Suite führt den rohen `sub` |
| 15 | Die HTTP-Grenze fällt erst, wenn die sechs `/v1`-Routen Drizzle-Aufrufe im selben Prozess sind; beide Domains ziehen im selben Fenster um |

**Ausdrücklich nicht Teil dieser Spec** (eigene Suite-Posten): `TZ=Europe/Berlin` · die
CWE-348-Umstellung in `core/ratelimit.ts` (**Voraussetzung** für das Gate, siehe Kapitel 3) · das
Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts` · das suiteweite Gating von `/m/*`.

---

## B. Widersprüche zwischen den Kapiteln

Gefunden beim Abgleich der Variablennamen und der „Zusage an Kapitel N"-Stellen über alle neun
Teile. **Vier Divergenzen; drei sind redaktionell und hier entschieden, eine ist fachlich und wird
geparkt.** Die Kapiteltexte tragen teilweise noch die alte Schreibweise — verbindlich ist diese
Tabelle.

| # | Divergenz | Entscheidung |
|---|---|---|
| B1 | **Sitzungsdauer-Variable:** Kapitel 3 nennt sie `RADIO_AUSLEIH_SITZUNG_STUNDEN`, Kapitel 7 und 9 `RADIO_ZUGANG_SITZUNG_STUNDEN` | **`RADIO_AUSLEIH_SITZUNG_STUNDEN`.** Der Präzedenzfall entscheidet: `.env.example` führt `LAGERBUCH_HELFER_SITZUNG_STUNDEN` — Rolle, dann `SITZUNG`, dann Einheit. „Ausleih" ist die Rolle, „Zugang" ist die Mechanik |
| B2 | **Sitzungsgeheimnis:** Kapitel 3 `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS`, Kapitel 7 und 9 `RADIO_ZUGANG_SITZUNG_SECRET` | **`RADIO_AUSLEIH_SITZUNG_SECRET`** — Stamm aus B1, Endung nach dem Präzedenzfall `LAGERBUCH_HELFER_SITZUNG_SECRET`. Das Projekt schreibt `SECRET` englisch, auch in sonst deutschen Namen |
| B3 | **radio-admin-Adresse:** Kapitel 6 `RADIO_ADMIN_URL`, Kapitel 7 `RADIO_ADMIN_API_URL` | **`RADIO_ADMIN_URL`** — so heißt sie wirklich (`radio-inventar/apps/backend/src/config/env.config.ts:22`). Kapitel 7 hat sie erfunden. ⚠️ Die Variable stirbt ohnehin mit der HTTP-Grenze; sie zählt nur im Übergangsfenster |
| B4 | **Zwei Rollen oder eine:** Kapitel 5 führt `SUITE_UPDATER_GROUP_RADIO` und eine Updater-Stufe ein, kein anderes Kapitel kennt sie | ⛔ **Nicht entschieden — fachlich, geparkt.** Die Trennung ist im Bestand echt (`radio-admin/shared/src/role.test.ts:4`: `adminGroup`/`updaterGroup`, `mapGroupsToRole`), hat im Ziel aber keinen Träger. Das ist Entscheidung 14 der Analyse und war dort schon blockierend. Siehe Kapitel C.6 |

⚠️ **Die Kapitel 3 und 7 widersprechen sich außerdem im Zuschnitt der Gate-Schranke** (Kapitel 3
führt drei `RADIO_GATE_*`-Variablen nach `lagerbuch`-Vorbild, Kapitel 7 nennt nur ein Präfix
`RADIO_GATE_`). Das ist keine Divergenz, sondern eine Auslassung in Kapitel 7 — verbindlich sind die
drei Namen aus Kapitel 3, sie sind zeichengleich zum Präzedenzfall in `.env.example`.

---

## C. Was zu bestätigen bleibt

Die Liste für den Betreiber. **C.1 und C.6 sind die, bei denen ohne Antwort gebaut würde.**

| # | Frage | Stand |
|---|---|---|
| **C.1** | **Bauform des Ausleih-Codes:** dauerhaft und sperrbar (Vorschlag) — oder rotierend, oder Sitzung je Scan? | ⚠️ **Von mir vorentschieden**, nicht vom Betreiber. Begründung: dauerhaft + sperrbar ist die am wenigsten festlegende Wahl — gedruckte Codes überleben, Kompromittierung bleibt behebbar. Ein Wechsel auf „Sitzung je Scan" ändert eine Stelle im Schema und eine im Gate, nicht das Modul |
| **C.2** | **Sitzungsdauer:** 12 h wie `lagerbuch`? | Vorschlag 12 h (`helferSitzung.ts:50-57`). Betriebsentscheidung, keine Rechnung; kein Test wartet 12 Stunden |
| **C.3** | **Sind gedruckte Aufsteller im Umlauf, und wo?** | Falls ja: Bestandscodes zeichengleich übernehmen, und die Ausgabe des ersten Satzes ist ein **Druck**vorgang. Falls nein: alle Codes entstehen in der Suite. Papier ist für jedes Tor unsichtbar |
| **C.4** | **Benutzername beim Ausleihen vorausfüllen — überhaupt?** | Entscheidung 7 lässt es offen. Die Ausleihe bleibt in der Sache anonym; der Vorschlag ist „vorbelegt, überschreibbar" |
| **C.5** | **Wie wird das radio-inventar-Frontend heute ausgeliefert?** | `radio-inventar/docker-compose.yml` führt nur `postgres` und `backend` (letzteres hinter einem Profil) — wer liefert das Frontend aus? Betrifft den Abbau |
| **C.6** | **Zwei Rollen oder eine?** (siehe B4) | ⛔ Blockierend. Im Bestand echt, im Ziel ohne Träger. Ohne Antwort baut Kapitel 5 eine Rechtestufe, die kein anderes Kapitel kennt |
| **C.7** | **Muss offline geschrieben werden können?** | Betreiberfrage 8 der Analyse, unbeantwortet. Mit „kein Tablet" verschiebt sie sich zu „Telefon im Funkraum mit schlechtem Empfang" |

---

## Die Kapitel


---

# 1. Zuschnitt, Registry, Routing und der Host-Riegel

Dieses Kapitel legt den Rahmen: eine Registry-Zeile, eine Routenkarte, zwei Hüllen auf einem Host,
ein Host-Riegel und ein Zugriffsriegel. Alles andere im Modul steht darin.

## 1.1 Der Registry-Eintrag

### Die Zeile, ausgeschrieben

Sie gehört in `src/core/registry.ts` **direkt nach `aufgaben`** (heute `registry.ts:170-173`) und
**vor** die Wegwerf-Module `alpha`/`gamma`/`beta`/`kioskdemo` (`:174-186`) — die echten Module bleiben
zusammen. Die Position ist für die Auflösung ohne Bedeutung, solange `prodHosts` leer ist
(Begründung unter 1.4.5), und sie ist die einzige Stelle, an der Reihenfolge überhaupt wirkt.

```ts
  // radio: EIN Prod-Host (radio.iuk-ue.de), und er steht AUSSCHLIESSLICH in
  // SUITE_HOST_RADIO — dieselbe Auflage wie bei lagerbuch (registry.ts:106-108).
  // prodHosts bleibt deshalb leer, wie bei qr, feedback, files und lagerbuch.
  //
  // requiresAuth MUSS false bleiben: /t/<code> ist der Weg, den ein gescannter
  // QR-Code nimmt, und das Gate auf / ist der Einstieg der anonymen Ausleihe.
  // Mit requiresAuth: true schickte decideRoute (routing.ts:71-73) JEDEN anonymen
  // Aufruf in den Login — und zwar sofort beim Umschwenk des Routers, ohne
  // Parallelfenster.
  // Dadurch liest canAccess() requiredGroups hier NIE (frueher Ausstieg,
  // registry.ts:239), und /m/radio/admin/... erbt KEIN Middleware-Gating.
  // Durchgesetzt wird der Verwaltungszugang modulintern in _lib/zugang.ts, der
  // Host in _lib/host.ts.
  //
  // switcherGroupSources: [] und NICHT ["admin"] wie lagerbuch — die Kachel im
  // App-Umschalter IST der zweite Zugangsweg zur Ausleihe (Betreiberentscheidung
  // 5), auch fuer Personen ohne Verwaltungsgruppe. Ein ["admin"] hier verbaute
  // genau diesen Weg (visibleSwitcherModules, registry.ts:250-258).
  { key: "radio", title: "Funkgeräte", icon: "WifiOutlined", shell: "full",
    requiresAuth: false, requiredGroups: [], adminGroups: ["iuk-radio-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
```

### Feld für Feld gegen `lagerbuch` (`registry.ts:119-121`) und `files` (`:103-105`)

| Feld | `radio` | `lagerbuch` | `files` | Abweichung und Grund |
|---|---|---|---|---|
| `key` | `"radio"` | `"lagerbuch"` | `"files"` | Der Key ist zugleich das URL-Segment (`/m/radio/*`), der Env-Suffix (`SUITE_HOST_RADIO`, `SUITE_ADMIN_GROUP_RADIO`), der Dev-Host `radio.localtest.me` (`registry.ts:228`) und der Verzeichnisname unter `notizen/<modul>/`. Vier Verwendungen, ein Wort — keine Wahlfreiheit mehr, nachdem die Analyse ihn durchgehend so führt. |
| `title` | `"Funkgeräte"` | `"Lagerbuch"` | `"Dateien"` | Deutsch wie alle echten Module. **Nicht `"Radio"`** — das Wort liest sich in Kopfzeile und Kachel als Rundfunk; die Sache sind Handfunkgeräte. Der Titel steht ausschließlich hier und wird in Release-Notizen nicht wiederholt (`CLAUDE.md:208-210`); eine andere Betreiber-Wortwahl kostet eine Zeile und keinen Code. |
| `icon` | `"WifiOutlined"` | `"ContainerOutlined"` | `"FolderOutlined"` | Siehe 1.1.3 — der Name muss **zusätzlich** in `ICONS` eingetragen werden. |
| `shell` | `"full"` | `"full"` | `"full"` | Keine Abweichung, aber aus eigenem Grund — siehe 1.1.4. Insbesondere **nicht** `"kiosk"`, obwohl der Ausleih-Zweig ein Kiosk ist. |
| `requiresAuth` | `false` | `false` | `false` | Gleich, und aus derselben Familie von Gründen: ein anonymer Teilpfad. Bei `lagerbuch` ist es `/t/<code>` und `/g/<code>`, bei `files` `/s/<id>` und `/u/<token>`, bei `radio` der gescannte QR-Code auf `/t/<code>` und das Gate auf `/`. Der Preis ist derselbe und in beiden Bestandskommentaren ausgeschrieben (`registry.ts:85-89`, `:116-118`): `canAccess` steigt sofort mit `true` aus (`:239`), also gibt es **null** Middleware-Gating für `/admin`. |
| `requiredGroups` | `[]` | `[]` | `[]` | Gleich. Der Wert ist unter `requiresAuth: false` für das Gating **wirkungslos** — `canAccess` erreicht ihn nie. Er leer zu lassen ist deshalb die einzige ehrliche Form: eine gefüllte Liste behauptete eine Wirkung, die es nicht gibt. ⚠️ Folge: `SUITE_ACCESS_GROUP_RADIO` ist als Gating-Schalter ebenfalls wirkungslos; wer es später als zweite Rolle (updater) zweckentfremden will, baut sie modulintern — das ist nicht Sache dieses Kapitels. |
| `adminGroups` | `["iuk-radio-admin"]` | `["lagerbuch_nutzer"]` | `["iuk-files-admin"]` | Muster `iuk-<modul>-admin` wie `qr` (`:64`), `files` (`:104`) und `aufgaben` (`:172`); `lagerbuch_nutzer` ist der historische Ausreißer und kein Vorbild. **Vorgabe, keine Festschreibung** — `SUITE_ADMIN_GROUP_RADIO` gewinnt, gelesen über `adminGroupsFor()`, nie über das Feld (`core/groups.ts:100-109`). ⚠️ **Nicht** über den Zeiger in `registry.ts:25` gehen: der Feldkommentar sagt „nicht direkt lesen, sondern über `isModuleAdmin()`" — und genau `isModuleAdmin` ist für `radio` die falsche Funktion (Entscheidung 9, Begründung in 1.5). Die Registry beschreibt hier den Regelfall, nicht den von `radio`. |
| `prodHosts` | `[]` | `[]` | `[]` | Gleich — Betreiberentscheidung 1 nennt `SUITE_HOST_RADIO` als Quelle. Nur `portal` führt eine Domain in der Registry (`"iuk-ue.de"`, `:59`), und genau die ist der Kollisionsfall aus 1.4.5. |
| `showInSwitcher` | `true` | `true` | `true` | Gleich, aber hier **erzwungen statt kosmetisch**: die Kachel ist Zugangsweg 2 aus Entscheidung 5. Sie entscheidet zusätzlich, wer Release-Notizen zum Modul sieht (`portal/_lib/neuigkeiten/auswahl.ts:48` filtert über `visibleSwitcherModules`). |
| `switcherGroupSources` | `[]` | `["admin"]` | `["access","admin"]` | **Die schärfste Abweichung.** `lagerbuch` versteckt die Kachel vor allen, die nicht in der Verwaltungsgruppe sind, weil dort der Switcher-Link auf den geschützten Einstieg zeigt (`registry.ts:40-47`). Bei `radio` zeigt er auf `/` — die Ausleihe, die laut Entscheidung 7 **jeder mit Zugriff** benutzen darf. Mit `["admin"]` sähe die Kachel niemand außer den radio-admins, und Zugangsweg 2 wäre tot. Mit `[]` fällt `visibleSwitcherModules` sofort auf `return true` (`:252-253`), weil `canAccess` unter `requiresAuth: false` bereits `true` liefert: jede angemeldete Person sieht die Kachel. Das ist gewollt. |

⚠️ **Reihenfolge beim Ausrollen: erst Registry-Eintrag, dann Env.** `validateGroupConfig` prüft jeden
`SUITE_ADMIN_GROUP_*`/`SUITE_ACCESS_GROUP_*`-Namen gegen die bekannten Modul-Keys und meldet einen
unbekannten Suffix als Startabbruch (`core/groups.ts:141-153` über `core/bootstrap.ts:85-86`). Ein
`SUITE_ADMIN_GROUP_RADIO` in der `.env` **vor** dieser Zeile hält den Container an.

⚠️ **Und die stille Hälfte davon:** `SUITE_ADMIN_GROUP_RADIO` **leer gesetzt** ist eine gültige
Aussage und wird nicht gemeldet — die Leer-Meldung greift nur bei `ACCESS`
(`core/groups.ts:154-160`, begründet in `:136-140`: „Bei den Admin-Gruppen ist leer dagegen eine
gültige Aussage und wird nicht gemeldet"). Zusammen mit dem `.some()` aus 1.5 sperrt das die
Verwaltung für **alle** aus, den Betreiber eingeschlossen. Der Rückweg ist nicht die
Suite-Admin-Gruppe (die ignoriert `radio` modulintern, Entscheidung 9), sondern nur ein Neustart mit
korrektem Wert. Das gehört als Zeile in die `.env.example` und ins Runbook — **und als
Protokollzeile in den Riegel selbst**: `meldeFehlendeGruppe` aus 1.5 ist die einzige Stelle, an der
dieser Zustand überhaupt sichtbar wird.

**Zu bestätigen (nur der Betreiber weiß es):** wie die Pocket-ID-Gruppe wirklich heißt. Die Gruppe
**muss in Pocket ID existieren, bevor `/admin` produktiv erreichbar ist** — ein Tippfehler sperrt
jeden aus, und der Fehler ist still.

### Das Icon: die Registry-Zeile allein genügt nicht

`icon` ist **kein** beliebiger `@ant-design/icons`-Name, sondern ein Schlüssel der Map `ICONS` in
`src/core/shell/icons.ts:136-147`. Heute stehen dort zehn Namen (`:1-11` der Import-Block), und
`WifiOutlined` ist **nicht** darunter. Ein fehlender Eintrag fällt bei beiden Konsumenten still auf
`AppstoreOutlined` zurück (`AppUmschalter.tsx:141` für das Panel, `DiensteRaster.tsx:105` für das
Portal-Raster) — „Funkgeräte" wäre dann vom „Portal" nicht zu unterscheiden. Der Dateikopf
(`icons.ts:21-27`) nennt genau diesen Vorfall aus dem `files`-Eintrag vom 2026-07-30.

**Also zwei Änderungen, nicht eine:**

1. `WifiOutlined` in den Import-Block (`icons.ts:1-11`, alphabetisch nach `ScheduleOutlined`),
2. `WifiOutlined` in das Map-Literal (`icons.ts:136-147`).

Das ist die eine Stelle im Kapitel, an der ein Gate mitliest: ein **nicht existierender**
antd-Name ist ein lauter `pnpm typecheck`-Fehler im Import, und die **fehlende Map-Zeile** fängt
`src/core/shell/AppUmschalter.test.tsx`, das die Map gegen die echte `MODULES`-Liste prüft
(`icons.ts:25-27`). ⚠️ `src/core/shell/icons.test.ts` riegelt zusätzlich ab, dass Icons **nur** hier
und nur client-seitig importiert werden (Falle 7 aus `CLAUDE.md:31-44`): keine Server Component im
Modul `radio` importiert `ICONS` oder `@ant-design/icons` direkt. Wo im Modul ein Zeichen in einer
Server Component gebraucht wird, ist es ein Inline-SVG oder eine Client-Insel.

### `shell: "full"` — drei Wirkungen, und keine davon ist „Verpackung"

`registry.shell` packt nichts ein: `src/core/shell/Shell.tsx` ist eine Komponente mit `variant`-Prop,
und das Modul-Layout entscheidet, ob es sie überhaupt rendert (`lagerbuch/layout.tsx:27-29` rendert
gar keine, `kioskdemo/layout.tsx` rendert `<Shell variant={mod.shell} …>`). Der Wert ist trotzdem
**wirksam**, dreifach:

1. **Er ist das, was der Verwaltungszweig rendert.** Der Rahmen liest ihn: `lagerbuch`s
   `_ui/VerwaltungsRahmen.tsx:16-18` gibt `variant={mod.shell}` an `<Shell>` weiter, und `radio`
   übernimmt diese Form (1.3). Mit `"kiosk"` bekäme `/admin` eine Kiosk-Hülle **und keine
   Navigationsleiste** — `Shell.tsx` reicht bei `kiosk` kein `nav` durch
   (`core/shell/navAbschnitte.test.ts:48-49`). Die Verwaltung braucht die Leiste.
2. **`core/shell/navAbschnitte.test.ts:58` scannt jedes Modul mit `shell !== "full"`** auf
   `abschnitt:` in `_lib/nav.ts*` und lässt es rot werden. Die Verwaltungsnavigation von `radio`
   gliedert (Bestand, Ausleihen, Import, Software, Zugänge) — mit `"kiosk"` oder `"minimal"` wäre
   diese Gliederung ein roter Test statt einer Entscheidung.
3. **`core/shell/SuiteHeader.test.tsx:52` bildet seine Erwartungsmenge aus `full|minimal`.** Mit
   `"full"` tritt `radio` in diese Menge ein: die Kopfzeile muss den Modultitel rendern. Das ist der
   Test, der die Zeile `title: "Funkgeräte"` überhaupt prüft.

**Für den Ausleih-Zweig hat der Wert keine Wirkung**, weil dort gar keine Shell entsteht (1.3). Genau
deshalb kann ein Modul mit **zwei** Bedienregimen auf einem Host durch **ein** Feld beschrieben
werden, ohne zu lügen: das Feld beschreibt den Zweig, der eine Hülle hat.

⚠️ **Berührte Falle 4** (`CLAUDE.md:18-22`): `FullShell`-Inhalte tragen `controlHeight: 44`
(`ARBEITSDICHTE`, `core/theme/theme.ts:207-211`), alles ohne Shell behält 56/72. Der
Verwaltungszweig läuft damit auf 44/48, der Ausleih-Zweig auf 56/72 — das ist die gewollte
Aufteilung und der eigentliche Grund für zwei Hüllen.

## 1.2 Die Routenkarte

Alles liegt unter `src/app/m/radio/`. Äußerer Pfad heißt: was der Browser auf
`radio.iuk-ue.de` sieht; der interne Pfad ist derselbe mit `/m/radio` davor
(`core/routing.ts:78-79`).

### Der Ausleih-Zweig — äußerer Pfad `/`

| Datei | Äußerer Pfad | Rolle | Riegel |
|---|---|---|---|
| `layout.tsx` | — | trägt `children`, sonst nichts (1.3) | **keiner** |
| `page.tsx` | `/` | **Gate**: Codefeld für einen anonymen Zugang; eine bereits angemeldete Person wird in den Ausleih-Bereich geleitet, ein radio-admin nach `/admin` | `requireRadioHost` |
| `t/[code]/route.ts` | `/t/<code>` | **Der gescannte QR-Code.** GET, prägt die Sitzung, antwortet 303 | `radioHostOderNull` |
| `abmelden/route.ts` | `/abmelden` | Sitzung beenden bzw. totes Cookie räumen. GET, 303 | `radioHostOderNull` |
| `(ausleihe)/layout.tsx` | — | Riegel, **kein** Rahmen | Zugangsprädikat (Kapitel Zugang) |
| `(ausleihe)/geraete/page.tsx` | `/geraete` | Bestandsliste — Alt-Kiosk `/` (`radio-inventar/apps/frontend/src/routes/index.tsx:4`) | erbt, ruft zusätzlich selbst |
| `(ausleihe)/ausleihen/page.tsx` | `/ausleihen` | Ausleihe — Alt-Kiosk `/loan` (`routes/loan.tsx:16`) | dito |
| `(ausleihe)/rueckgabe/page.tsx` | `/rueckgabe` | Rückgabe — Alt-Kiosk `/return` (`routes/return.tsx:13`) | dito |

Die Route-Group `(ausleihe)` steht für die Bequemlichkeit eines gemeinsamen Riegels und für die
Abgrenzung gegen das Gate, das **außerhalb** liegen muss (auf dem Gate ist „keine Sitzung" der
Regelfall). ⚠️ Eine Group-Grenze ist **keine** Sicherheitsgrenze; die tragende Zusage sind die
aufrufbaren Funktionen (`lagerbuch/helfer/layout.tsx:7-9`). Deshalb rufen die drei Seiten das
Zugangsprädikat selbst — nicht aus Misstrauen, sondern weil ein Layout einer Seite keine Props
reichen kann.

**Ersatzlos gestrichen** aus dem Alt-Kiosk: `/setup` (`routes/setup.tsx:9`), `/token-setup`
(`routes/token-setup.tsx:12`) und `/qr-code` (`routes/qr-code.tsx:4`). Die ersten zwei sind
Erstinstallation und Eingabe des geteilten Geheimnisses — beides fällt mit Entscheidung 8. Der
QR-Aussteller wandert in die Verwaltung (`/admin/zugaenge`), weil nur radio-admins ausstellen dürfen
(Entscheidung 7).

### Der Verwaltungszweig — äußerer Pfad `/admin`

| Datei | Äußerer Pfad | Herkunft | Riegel |
|---|---|---|---|
| `admin/(arbeit)/layout.tsx` | — | neu: Riegel **+ Rahmen** | `requireRadioHost`, dann `requireRadioAdmin` |
| `admin/(arbeit)/page.tsx` | `/admin` | radio-admin `/` (`radio-admin/client/src/routes/router.tsx:24`) | erbt + eigener Aufruf in jeder Action |
| `admin/(arbeit)/geraete/page.tsx` | `/admin/geraete` | radio-admin `/devices` (`router.tsx:25`) | dito |
| `admin/(arbeit)/geraete/[id]/page.tsx` | `/admin/geraete/<id>` | radio-admin `/devices/:id` (`router.tsx:26`) | dito |
| `admin/(arbeit)/ausleihen/page.tsx` | `/admin/ausleihen` | radio-admin `/ausleihen` (`router.tsx:27`) **und** Alt-Kiosk `/admin/history` (`routes/admin/history.tsx:37`) — die zweite Verwaltung des Kiosk verschwindet, ihre Ansicht landet hier | dito |
| `admin/(arbeit)/import/page.tsx` | `/admin/import` | radio-admin `/import` (`router.tsx:29`); bleibt **zweiphasig** | dito |
| `admin/(arbeit)/software/page.tsx` | `/admin/software` | radio-admin `/update` (`router.tsx:28`) | dito |
| `admin/(arbeit)/einstellungen/page.tsx` | `/admin/einstellungen` | radio-admin `/einstellungen` (`router.tsx:30`) **und** Alt-Kiosk `/admin/settings` (`routes/admin/settings.tsx:12`) | dito |
| `admin/(arbeit)/zugaenge/page.tsx` | `/admin/zugaenge` | neu: Codes ausstellen und sperren; ersetzt Alt-Kiosk `/qr-code` und die Token-Verwaltung von radio-admin | dito |
| `admin/(druck)/layout.tsx` | — | neu: Riegel, **kein** Rahmen | `requireRadioHost`, dann `requireRadioAdmin` |
| `admin/(druck)/zugaenge/blatt/page.tsx` | `/admin/zugaenge/blatt` | neu: das druckbare Blatt mit den QR-Codes der ausgestellten Zugänge | dito |

⚠️ **Zwei Route-Groups unter `admin/`, und die Trennung ist keine Ordnungsliebe.** Ein ausgestellter
QR-Code muss auf etwas Gegenständliches — ein Kärtchen am Regal, ein Blatt an der Tür. Läge das Blatt
unter einem gemeinsamen `admin/layout.tsx`, erbte es die Kopfzeile, die Navigationsleiste und
`controlHeight: 44` **auf Papier**. Genau deshalb trennt `lagerbuch` seine
`verwaltung/(arbeit)/layout.tsx` von `verwaltung/(druck)/layout.tsx`. Beide Groups sind in der URL
unsichtbar: die `PASSTHROUGH`-Prüfung aus 1.2.3 ist davon unberührt, und der Riegel steht in **beiden**
Layouts (1.4.3). Wie das Blatt aussieht und welche Codes es zeigt, gehört in das Kapitel Zugang — die
zwei Groups entstehen aber **hier**, damit jenes Kapitel eine Seite hinzufügen kann, ohne dieses
Layout zu brechen.

**Nicht übernommen:** `/login` und `/403` aus `radio-admin/client/src/routes/router.tsx:15-16`.
`/login` **kann** es im Modul nicht geben (1.2.3), und `/403` gibt es in dieser Suite als Muster
nicht: was nicht freigegeben ist, sieht aus wie etwas, das es nicht gibt (`notFound()`, 1.5).
`/admin/login` aus dem Alt-Kiosk (`routes/admin/login.tsx:18`) fällt mit dem eigenen
Kiosk-Admin-Anmeldeweg weg; angemeldet wird über die Suite.

**Der Kiosk-Pfad `/admin` und der Suite-Pfad `/admin` sind zeichengleich** — das ist ein
glücklicher Zufall und kein Entwurf: der Alt-Kiosk führte seine zweite Verwaltung schon unter
`/admin` (`routes/admin.tsx:23`). Ein Lesezeichen auf `/admin` landet nach dem Umschwenk auf der
richtigen Seite und wird dort nach Anmeldung gefragt. Die **Unterpfade** unterscheiden sich
(`/admin/devices` vs. `/admin/geraete`) — siehe 1.2.4.

### Die `PASSTHROUGH`-Prüfung, Pfad für Pfad

`core/routing.ts:12` führt `PASSTHROUGH = ["/api/auth", "/api/health", "/login", "/_next",
"/favicon.ico", "/.well-known"]`, geprüft als `pathname === p || pathname.startsWith(p + "/")`
(`:50-52`). Ein Treffer ergibt `next` — der Pfad erreicht das Modul **nie**, auf keinem Host. Jeder
Pfad aus 1.2.1 und 1.2.2 ist dagegen gefahren:

* `/`, `/t/<code>`, `/abmelden`, `/geraete`, `/ausleihen`, `/rueckgabe` — **frei.**
* `/admin` und alle acht Unterpfade — **frei.**
* ⛔ **`/login` ist Passthrough.** Es gibt deshalb **kein** `src/app/m/radio/login/page.tsx`, und es
  kann keines geben. Der Verwaltungsriegel leitet auf die **Suite-Anmeldung** um:
  `redirect(\`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}\`)`, wörtlich die Form
  aus `lagerbuch/_lib/zugang.ts:254`. Wer hier eine modul-eigene Anmeldeseite vorsieht, baut eine
  Datei, die nie gerendert wird — typkorrekt, lint-sauber, still.
* ⛔ **`/api/health/*` ist Passthrough.** `/api/health/radio` wird von `core` beantwortet, nicht vom
  Modul. Es entsteht **kein** `src/app/m/radio/api/health/…`.
* ⛔ `/api/auth/*`, `/_next/*`, `/favicon.ico`, `/.well-known/*` — kein Modul-Pfad trägt diese
  Namen.
* ✅ **Jeder andere Pfad unter `/api/*` wird in das Modul umgeschrieben.** Route Handler unter
  `src/app/m/radio/api/…` funktionieren also — solange sie nicht `api/auth/**` oder `api/health/**`
  heißen. Dieses Kapitel legt keinen an; die Zusage nach hinten steht in 1.7.

⚠️ **Warum diese Prüfung hier steht und nicht als Nebensatz:** bei `lagerbuch` hat genau sie die
gedruckten Etiketten gerettet — ein Pfad auf einem laminierten Kärtchen, der in die
Passthrough-Liste fällt, ist nach dem Druck nicht mehr korrigierbar. Für `radio` gilt das für
**`/t/<code>`**: das ist der Pfad, den ein ausgedruckter QR-Code trägt. Er ist frei, und er darf
**nach dem ersten Druck nicht mehr umbenannt werden**. Dasselbe für `/abmelden` — es steht auf
keinem Gegenstand und ist deshalb frei wählbar, aber es darf **nicht** unter `t/` liegen: ein
`t/abmelden/route.ts` gewänne zwar gegen das dynamische Segment (statisch schlägt dynamisch), legte
aber eine Falle in einen gedruckten Pfad (`lagerbuch/abmelden/route.ts:23-27`).

⚠️ **Auf `/abmelden` gehört kein `<Link>`.** Nexts Prefetch fordert das Ziel beim bloßen
Darüberfahren an und beendete die Sitzung ungefragt (`lagerbuch/abmelden/route.ts:34-37`). Der
sichtbare Abmelden-Weg ist ein POST-Formular auf eine Server Action.

### Was mit den alten Pfaden auf demselben Host geschieht

Der Alt-Kiosk läuft **bereits** unter `radio.iuk-ue.de` (Betreiberantwort 1). Es gibt kein
Parallelfenster; im Moment des Umschwenks gelten die Suite-Pfade. Damit ist entschieden:

* **Ausgedruckte QR-Codes des Alt-Kiosk landen weich.** Ihre URL ist
  `${origin}/?token=<base64>` — der Wurzelpfad mit Query-Parameter
  (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:8`, `:20-23`). Nach dem
  Umschwenk trifft sie `/`, wird auf `/m/radio` umgeschrieben, der `token`-Parameter wird **ignoriert
  und nirgends gelesen**, und die Besucherin steht auf dem Gate und wird nach einem Code gefragt. Das
  ist die konkrete Form der Verhaltensänderung aus Entscheidung 8: kein 500, kein leerer Bildschirm,
  eine Frage. Die Ankündigungspflicht bleibt, weil die Antwort auf diese Frage vorher niemand hat.
* **Alte Deeplinks des Kiosk ergeben 404**, namentlich `/loan`, `/return`, `/qr-code`, `/setup`,
  `/token-setup`, `/admin/devices`, `/admin/history`, `/admin/settings`, `/admin/login`. Es wird
  **keine** Umschreibungstabelle für sie gebaut: eine Tabelle mit neun Zeilen, die niemand pflegt,
  ist teurer als der Schaden, und der Alt-Kiosk wurde von `/` aus durchgetippt — das ist der Pfad,
  der überlebt. **Zu bestätigen (nur der Betreiber weiß es):** ob gedruckte Aufsteller oder
  Wandkärtchen mit einem **anderen** Pfad als `/` im Umlauf sind. Wenn ja, wird aus diesem Absatz
  ein Redirect im Runbook, kein Code im Repo.
* **Der Alt-Verwaltungshost `radio-admin.iuk-ue.de`** bekommt einen pfaderhaltenden
  Traefik-`redirectRegex` auf `radio.iuk-ue.de/admin` (Entscheidung 2). ⚠️ Daraus folgt ein
  benannter Nebeneffekt: ein Lesezeichen auf `radio-admin.iuk-ue.de/login` wird zu
  `radio.iuk-ue.de/admin/login` — und **das** ist kein Passthrough (`/admin/login` beginnt nicht mit
  `/login`), wird also in das Modul umgeschrieben und ergibt 404. Das ist hingenommen: der Weg zur
  Anmeldung führt ab dem Cutover über `/admin`, und der Riegel dort leitet selbst weiter. Die Zeile
  gehört ins Runbook, nicht in den Code.

## 1.3 Zwei Hüllen auf einem Host

**Das Modul-Layout `src/app/m/radio/layout.tsx` rendert `children` und sonst nichts.** Es trägt einen
Kommentarkopf, der genau das begründet — die Datei existiert, damit die nächste Person keine Hülle
hineinschreibt. Vorbild und Begründung stehen wörtlich in `lagerbuch/layout.tsx:3-22`:

* **Keine Shell.** Ein Layout ohne Group-Klammer ist Vorfahr **aller** Kinder, also auch des
  Ausleih-Zweigs. Der erbte damit `controlHeight: 44` statt 56/72 (Falle 4, `CLAUDE.md:18-22`), und
  `pnpm build` findet das nicht.
* **Kein Riegel.** Er umschlösse weder `t/[code]/route.ts` noch `abmelden/route.ts` — Route Handler
  haben **kein** Layout über sich —, und er könnte zwischen Ausleih- und Verwaltungsklasse nicht
  unterscheiden.
* **Kein `viewport`-Export.**
* **Und, anders als bei `lagerbuch`: kein `metadata.manifest` und keine Icon-Handler.** `lagerbuch`
  trägt hier den Manifest-Verweis, weil sein Helferzweig eine PWA ist. `radio` hat nach
  Entscheidung 5 **kein Gerät und kein Tablet**; es gibt nichts zu installieren. Die fünf Handler
  von `lagerbuch` (`manifest.webmanifest`, `pwa-icon.svg`, drei Icon-Routen) wandern **nicht** mit.
  Wer sie aus Analogie mitnimmt, bewirbt eine PWA, die niemand braucht — und ein Manifest im
  Root-Layout bewürbe sie auf jedem Suite-Host.

**Welcher Zweig welche Hülle rendert:**

* **Verwaltung, Arbeitsflächen:** `admin/(arbeit)/layout.tsx` ruft `requireRadioHost(kopf)`, dann
  `await requireRadioAdmin()`, und rendert
  `<RadioVerwaltungsRahmen nav={RADIO_NAV}>{children}</RadioVerwaltungsRahmen>` — Form
  und Reihenfolge 1:1 aus `lagerbuch/verwaltung/(arbeit)/layout.tsx:16-25`. Der Rahmen
  (`_ui/RadioVerwaltungsRahmen.tsx`) liest `getModule("radio")` und gibt
  `<Shell variant={mod.shell} moduleKey="radio" nav={nav}>` weiter, wie
  `lagerbuch/_ui/VerwaltungsRahmen.tsx:13-21`. **Der äußere Host-Riegel läuft vor dem
  Personen-Riegel**, damit ein anonymer Aufruf auf einem fremden Host die Verwaltungsroute nicht
  über einen vorgeschalteten Login-Umweg verrät (`lagerbuch/verwaltung/(arbeit)/layout.tsx:7-10`).
* **Verwaltung, Druck:** `admin/(druck)/layout.tsx` ruft dieselben zwei Riegel in derselben
  Reihenfolge und rendert `<>{children}</>` — **keine Shell, kein Rahmen, keine Navigation.** Der
  Riegel ist hier nicht weniger streng, sondern gleich streng; nur die Hülle fehlt, weil das Blatt in
  den Drucker geht und nicht in ein Browserfenster.
* **Ausleihe:** `(ausleihe)/layout.tsx` trägt **nur** den Riegel und rendert `<>{children}</>` — wie
  `lagerbuch/helfer/layout.tsx:44-47`. Keine Shell, damit 56/72 erhalten bleibt. Die 64er-Stufe des
  Alt-Kiosk (`radio-inventar/apps/frontend/src/globals.css:85-100`) ist eine eigene
  `ConfigProvider`-Ebene innerhalb dieses Zweigs; ihre Bauform gehört in das Kapitel zur
  Kiosk-Oberfläche.
* **Gate `/`:** ebenfalls ohne Hülle. Es ist die Seite, die eine anonyme Person zuerst sieht.

⚠️ **Eine Route-Group ohne eigenes Layout gibt es hier nicht** — jede der drei Ebenen, die eine
Hülle oder einen Riegel trägt, hat ihr Layout. Und **im Gegenzug**: eine Group-Grenze allein trägt
nichts (Falle 17 der lagerbuch-Zählung, `lagerbuch/helfer/layout.tsx:7-9`).

## 1.4 Der Host-Riegel: `src/app/m/radio/_lib/host.ts`

**Kein `"use client"`** — Server Components **und** Route Handler lesen hier
(`lagerbuch/_lib/host.ts:10-11`).

### 1.4.1 Warum es ihn gibt

`decideRoute` gatet einen internen Pfad `/m/<key>/...` **nach dem Modul aus dem Segment**, ohne
jeden Hostbezug (`core/routing.ts:58-66`), und `canAccess` steigt für ein Modul ohne Auth-Pflicht
sofort mit `true` aus (`core/registry.ts:239`). **Jeder Host, der auf den Suite-Container
terminiert, antwortet damit auf `/m/radio/*`** — **Falle 61 der lagerbuch-Zählung.** ⚠️ Die
Nummer stammt **nicht** aus den zwölf Fallen in `CLAUDE.md`, die nur bis 12 reichen; die Analyse
zählt an dieser Stelle die längere lagerbuch-Liste und weist es selbst einmal so aus
(`docs/radio-portierung-analyse.md:1505`). Wo dieses Kapitel eine **bare** Nummer nennt (Falle 4,
Falle 7), ist immer `CLAUDE.md` gemeint. Ohne diese Datei beantwortet ein fremder
Suite-Host `/m/radio/t/<code>`, und das Einlösen hat **Datenwirkung** (es prägt eine Sitzung und
rührt die Codezeile an). Das Sitzungscookie läge host-only auf dem fremden Host, und `radio` liefe
dort vollständig: eine zweite Herkunft, die in keinem Runbook steht, aus der echte Leihvorgänge in
die Datenbank laufen.

⚠️ Verschärfend gegenüber `lagerbuch`: der Alt-Kiosk legte seinen Zugang im `localStorage` ab
(`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`), also origin-gebunden — die
Fehlerrichtung war ein **stiller Ausfall**. Die Suite-Fassung nimmt ein **Cookie**, und damit kehrt
sich die Richtung um: ein Cookie mit `domain` reiste über alle Subdomains. **Das
Ausleih-Cookie trägt deshalb kein `domain`** (`lagerbuch/_lib/helferSitzung.ts:137-145` als Vorbild;
die naheliegende Vorlage `core/auth/cookies.ts:46-59` ist die **falsche**, sie setzt `domain` aus
`AUTH_COOKIE_DOMAIN` und ist genau für die Suite-Sitzung richtig). Die Bauform des Cookies ist Sache
des Zugangs-Kapitels; dass es kein `domain` tragen darf, ist eine Bedingung dieses Riegels und steht
als Zusage in 1.7.

**Kein Gate findet das:** `core/routing.test.ts` schreibt das Middleware-Verhalten sogar ausdrücklich
fest, und Playwright fährt gegen genau **einen** `baseURL`. Eine vergessene Stelle ist typkorrekt
und lint-sauber.

### 1.4.2 Die drei Signaturen

```ts
/** Ist das der Radio-Host? */
export function istRadioHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "radio";
}

/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft notFound(). */
export function requireRadioHost(headers: Headers): void {
  if (!istRadioHost(headers)) notFound();
}

/** Fuer ROUTE HANDLER. Wirft NIE — der Handler baut seine 404 selbst. */
export function radioHostOderNull(headers: Headers): "radio" | null {
  return istRadioHost(headers) ? "radio" : null;
}
```

Drei Funktionen, nicht sechs wie bei `files` (`m/files/_lib/hostRolle.ts:90-121`): `radio` hat **eine
Rolle je Host**, die Unterscheidung Ausleihe/Verwaltung steckt im **Pfad**, nicht in einem
Host-Index.

**Warum `moduleForHost(resolveHost(headers))?.key` und nicht ein Vergleich gegen `prodHostsFor`**
(`lagerbuch/_lib/host.ts:26-40`):

* `moduleForHost` trifft `radio.localtest.me` **vor und unabhängig von** `prodHostsFor`
  (`core/registry.ts:228`). Damit läuft derselbe Code-Pfad in Dev, E2E und Produktion, **ohne** dass
  `SUITE_HOST_RADIO` lokal gesetzt sein muss.
* `resolveHost` wird **wiederverwendet, nicht nachgebaut** (`core/routing.ts:36-41`): seine
  Vorrangregel `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware die einzig
  richtige — und nach einem `redirect()` aus einer Server Action trägt `host` die interne Adresse
  `localhost:<port>` (`core/routing.ts:16-24`). Eine zweite Auflösung wäre der Ort, an dem beide
  auseinanderlaufen.

**Kein `notFound()`-Ersatz durch 403:** die Existenz eines Pfades auf dem falschen Host wird nicht
verraten (`lagerbuch/_lib/host.ts:46-47`).

**Warum die nicht-werfende Form:** ein `notFound()`-Wurf ist im Antwortweg eines Route Handlers
keine brauchbare Antwort auf einen gescannten QR-Code (`m/files/_lib/hostRolle.ts:30-32`,
`lagerbuch/abmelden/route.ts:45-50`). Der Handler antwortet
`new Response("Not found", { status: 404 })`.

### 1.4.3 Die drei Verankerungsstellen — und warum die dritte trägt

Die Aufruftabelle gehört als Kommentarblock **in `host.ts`**, nach dem Vorbild
`lagerbuch/_lib/host.ts:58-96`:

| Stelle | Form | Schicht |
|---|---|---|
| `page.tsx` (Gate) | `requireRadioHost` | (i) Seite |
| `(ausleihe)/layout.tsx` | *keiner* — das Zugangsprädikat ruft ihn intern | (iii) |
| `(ausleihe)/geraete`, `/ausleihen`, `/rueckgabe` | *keiner* — dito | (iii) |
| `admin/(arbeit)/layout.tsx` | `requireRadioHost`, dann `requireRadioAdmin` | (i) + (iii) |
| `admin/(druck)/layout.tsx` | `requireRadioHost`, dann `requireRadioAdmin` | (i) + (iii) |
| `t/[code]/route.ts` | `radioHostOderNull` | (ii) **Tür mit Datenwirkung** |
| `abmelden/route.ts` | `radioHostOderNull` | (ii) |
| `requireRadioAdmin` | `requireRadioHost` als **erste Anweisung** | (iii) |
| Zugangsprädikat der Ausleihe (lesend **und** schreibend) | `requireRadioHost` als **erste Anweisung** | (iii) |
| `viewerOderNull` | **absichtlich keiner** — Gegenregel, 1.4.4 | — |

**(i) Layouts und Seiten sind Bequemlichkeit, keine Sicherheitsgrenze.** Route-Group-Grenzen sind
keine Grenzen; eine Seite kann jederzeit aus einer Group herauswachsen, und ein Layout schützt nichts,
was es nicht umschließt.

**(ii) Jeder Route Handler braucht seine eigene Zeile, weil Handler kein Layout über sich haben.**
Bei `radio` sind das genau zwei — `t/[code]` und `abmelden` — und der erste ist die Tür mit
Datenwirkung.

**(iii) Innen, im Zugangsprädikat selbst, ist die tragende Stelle.** Der Grund ist nicht
Redundanz-Liebe, sondern eine Konstruktion: **eine Server Action hat kein Layout über sich.** Ein
Ausleih-Cookie, das über einen fremden Suite-Host entstanden ist, wäre in einer Server Action ohne
diese Zeile ein vollgültiger Ausweis — das Prädikat prüft Cookie-Signatur und Codezeile, **keinen
Host**. Weil der Host-Riegel **innen** sitzt, ist die Zusage „jede Ausleih-Aktion und jede
Verwaltungs-Aktion ist host-gebunden" durch **Konstruktion** wahr und nicht durch eine Liste, die
die nächste Action vergisst (`lagerbuch/_lib/host.ts:75-87`, `_lib/zugang.ts:220-226`).

⚠️ **Wer die Zeile in `requireRadioAdmin` für doppelt hält und entfernt**, öffnet genau diese Lücke.
Für die Verwaltung ist sie **kein Autorisierungsgewinn** — der Zugriffsriegel ist host-blind und
vollständig, eine Admin-Action auf fremdem Host verlangt dieselbe Gruppe wie auf der eigenen Domain.
Sie verhindert die **zweite funktionierende Herkunft** des Moduls, und das ist die strengere
Richtung.

### 1.4.4 Die Gegenregel

**Nicht-werfende Prädikate rufen den Host-Riegel absichtlich NICHT.** `viewerOderNull` (1.5) ist die
Form für die Weichen, auf denen „keine Sitzung" ein **gültiger** Fall ist — das Gate. Ein
`requireRadioHost` darin verwandelte das Prädikat zurück in einen Wurf, und ein
`requireRadioAdmin()` an dieser Weiche schickte jeden anonymen Scan nach `/login` statt aufs Gate —
genau der Ausfall, den `requiresAuth: false` verhindern soll, und er wäre typkorrekt, lint-sauber
und für `pnpm build` unsichtbar (`lagerbuch/_lib/zugang.ts:59-74`, wörtlich).

**Und die Umkehrung:** wer das Zugangsprädikat benutzt, ruft den Host-Riegel **nicht noch einmal**.
Ein zweiter Aufruf im `(ausleihe)/layout.tsx` wäre keine Härtung, sondern die Behauptung, der Riegel
sei host-blind — und genau die Behauptung macht die Konstruktions-Zusage wieder zu einer Liste
(`lagerbuch/helfer/layout.tsx:16-31`).

### 1.4.5 Kein `validateRadioHosts`, kein Durchlass-Zweig, und was `validateHostConfig` nicht sieht

**Kein `validateRadioHosts`.** `files` bricht beim Boot ab, wenn nicht genau zwei Hosts konfiguriert
sind (`m/files/_lib/hostRolle.ts:183-196`), weil dort der Index die Rolle trägt. Bei `radio` sind
**0, 1 und ≥ 2** Hosts alle erlaubt: 0 vor dem Cutover, 1 im Normalfall, ≥ 2 falls
`radio-admin.iuk-ue.de` übergangsweise mitläuft (Entscheidung 2). Eine solche Prüfung wäre ein
Startabbruch am schlechtesten Tag. Tippfehler, Protokoll oder Port im Wert und doppelt vergebene
ENV-Hosts fängt bereits `validateHostConfig` (`core/hosts.ts:65-100`).

**Kein „kein Prod-Host konfiguriert → durchlassen"-Zweig.** Er wäre die Sperre, die sich selbst
abschaltet: solange `SUITE_HOST_RADIO` fehlt, wäre genau der Zustand offen, gegen den die Datei
gebaut ist. Die Prädikatsform deckt den Dev-Host ohne jede Env ab und macht den Zweig überflüssig
(`lagerbuch/_lib/host.ts:37-40`).

⚠️ **Ordnungsfolge daraus:** solange `SUITE_HOST_RADIO` nicht gesetzt ist, antwortet `radio` **nur**
auf `radio.localtest.me` und liefert in Produktion 404. Das ist gewollt — und es macht „Env setzen
**vor** Router umschwenken" zu einer harten Reihenfolge im Runbook, nicht zu einer Empfehlung. Es
gibt kein Parallelfenster (Entscheidung 3); der Rückweg ist „Router zurück".

⚠️ **Was `validateHostConfig` nicht auffällt:** ein Host, den ein **anderes** Modul über
`prodHosts` in der Registry führt. Die Kollisions-Map wird ausschließlich aus `envHostsFor` gefüllt
(`core/hosts.ts`) — ein Registry-`prodHosts`-Eintrag erreicht sie nie. Stünde `SUITE_HOST_RADIO`
zufällig auf einer Domain, die ein **vor** `radio` gelistetes Modul per `prodHosts` führt (heute nur
`portal` mit `"iuk-ue.de"`, `core/registry.ts:59`), bestünde die Boot-Prüfung fehlerfrei, und
`moduleForHost` lieferte dennoch das fremde Modul — dort entscheidet die Registry-Reihenfolge, nicht
die Env (`lagerbuch/_lib/host.ts:98-104`). Für `radio.iuk-ue.de` ist das heute kein Fall; es ist der
Grund, warum die Registry-Position aus 1.1.1 überhaupt genannt wird.

## 1.5 Der Zugriffsriegel für `/admin`

**Er muss existieren, weil `requiresAuth: false` nichts gatet.** `core/routing.ts:58-66`
unterscheidet `/m/radio/` und `/m/radio/admin/...` **nicht**; für ein Modul ohne Auth-Pflicht steigt
`canAccess` mit `true` aus. Jede Verwaltungsseite, jede Verwaltungs-Action und jeder
Verwaltungs-Route-Handler ruft den Riegel **selbst als erste Anweisung** — die Registry sagt genau
das für `lagerbuch` (`core/registry.ts:116-118`) und für `files` (`:85-89`) wörtlich.

**Ort:** `src/app/m/radio/_lib/zugang.ts`. Signaturen, nach `lagerbuch/_lib/zugang.ts`:

```ts
export type RadioViewer = { sub: string; name: string | null; groups: string[] };

/** Reine Abbildung, ohne IO — damit der Test sie ohne auth()-Mock fahren kann. */
export function viewerAusSession(session: Session | null): RadioViewer | null;

/** DIE NICHT-WERFENDE FORM — fuer das Gate. Ruft requireRadioHost ABSICHTLICH NICHT (1.4.4). */
export async function viewerOderNull(): Promise<RadioViewer | null>;

/** Das Praedikat. adminGroupsFor(getModule("radio")) + .some() — NICHT isModuleAdmin, NICHT canAccess. */
export function istRadioAdmin(viewer: RadioViewer | null): boolean;

/** Absolutes Ziel fuer die callbackUrl der Suite-Anmeldung: <proto>://<host>/admin. */
export function verwaltungsZiel(headers: Headers): string;

/** DER AUTH-BACKSTOP: admin/layout.tsx UND jede Verwaltungs-Action. */
export async function requireRadioAdmin(): Promise<RadioViewer>;
```

**Der Körper von `requireRadioAdmin`, in dieser Reihenfolge** (Form 1:1 aus
`lagerbuch/_lib/zugang.ts:250-261`):

1. `const kopf = await headers();`
2. `requireRadioHost(kopf);` — **erst der Host, dann die Person** (1.4.3, Stelle iii),
3. `const viewer = viewerAusSession(await auth());`
4. kein Viewer → `redirect(\`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}\`)`,
5. kein Admin → `notFound()`.

**Drei Festlegungen, jede gegen einen stillen Fehler:**

* **`adminGroupsFor(getModule("radio"))` und nie `mod.adminGroups` direkt** — sonst ist
  `SUITE_ADMIN_GROUP_RADIO` an genau dieser Stelle wirkungslos (`core/registry.ts:24-27`).
* **`.some()` und nicht `canAccess`** — `canAccess` steigt bei leerer Liste mit `true` aus
  (`core/registry.ts:242`). Eine leere Admin-Liste muss **nichts** gewähren, sonst ist die
  Verwaltung für jeden Eingeloggten offen, und der Fehler ist still.
* **`isModuleAdmin` wird modulintern ignoriert** (Entscheidung 9): es lässt die Suite-Admin-Gruppe
  durch (`core/groups.ts:125`, Vorgabe `dashboard-admins`). `feedback`
  (`m/feedback/_lib/access.ts:10-34`) und `lagerbuch` (`_lib/zugang.ts:79-115`) nehmen davon
  ausdrücklich Abstand, weil sie Betrieb und Einsicht trennen (`core/registry.ts:46`). `radio`
  gehört in dieselbe Menge, mit eigenem Anlass: hinter `/admin` liegen **Klarnamen der Ausleihenden
  samt Bewegungshistorie** und die Stelle, an der Zugangscodes ausgestellt und angezeigt werden.
  `session.user.isAdmin` kommt im Modul nirgends vor. **Folge: wer `radio` verwalten soll, gehört in
  `SUITE_ADMIN_GROUP_RADIO` — auch der Betreiber selbst.**

**`notFound()` statt 403:** was nicht freigegeben ist, sieht in dieser Suite genauso aus wie etwas,
das es nicht gibt (`lagerbuch/_lib/zugang.ts:228-233`). Der hingenommene Verlust ist die
Benennbarkeit; der Gegenwert ist, dass die Existenz von `/admin` und `/admin/zugaenge` nicht
verraten wird. Es gibt **keine** `/admin/kein-zugriff`-Seite.

⚠️ **Frische: bis zu eine Stunde Verzug.** Gruppen im JWT sind nur so frisch wie der letzte
erfolgreiche Token-Refresh; der Takt ist die Access-Token-Lebensdauer von Pocket ID, nicht die
Sitzungsdauer (`CLAUDE.md:151-156`). Der Verzug wird für die Verwaltung **hingenommen** — es gibt
eine Rolle und keine Objekt-Zugehörigkeit, an der man ihn auflösen könnte. Der **Sofort-Widerruf
existiert dort, wo er gebraucht wird**: beim anonymen Code-Zugang, über den Datenbank-Recheck auf
jedem Lesepfad (Kapitel Zugang).

## 1.6 Die Tests, die diese Zusagen halten

`registry.test.ts` hat einen Präzedenzfall im Repo (`src/app/m/aufgaben/registry.test.ts`, 2,5 KB,
zitiert in `core/registry.ts:164`); `host.test.ts` ebenfalls
(`src/app/m/lagerbuch/_lib/host.test.ts`, 3,6 KB).

| Datei | Was sie festhält |
|---|---|
| `src/app/m/radio/registry.test.ts` | Die Feldwerte der Zeile aus 1.1.1 einzeln: `requiresAuth === false`, `requiredGroups` leer, `prodHosts` leer, `switcherGroupSources` leer, `shell === "full"`, `showInSwitcher === true` — **und** `ICONS[mod.icon]` ist definiert (der stille Rückfall aus 1.1.3). Je Feld eine Behauptung mit der Begründung im Testnamen, damit ein späteres Umsetzen ein bewusster Akt ist. |
| `src/app/m/radio/_lib/host.test.ts` | `istRadioHost` trifft `radio.localtest.me` **ohne** gesetzte Env · `x-forwarded-host` gewinnt über `host` · Kommaliste → erster Wert · fremder Suite-Host → `requireRadioHost` wirft `notFound()`, `radioHostOderNull` liefert `null` · **Quelltext-Zusicherung**: `host.ts` enthält keinen Zweig, der bei leerem `prodHostsFor` durchlässt. |
| `src/app/m/radio/_lib/zugang.test.ts` | `istRadioAdmin` mit **leerer** Admin-Liste → `false` (das `.some()`-Argument) · `SUITE_ADMIN_GROUP_RADIO` greift, das Registry-Feld allein entscheidet nicht · Viewer nur mit `dashboard-admins` → `false` (Entscheidung 9) · `verwaltungsZiel` baut `<proto>://<host>/admin` und fällt ohne Host auf `/m/radio/admin` zurück. |
| `src/app/m/radio/riegel.test.ts` | **Der Test, der die `requiresAuth: false`-Lücke hält, und der einzige, der nicht Datei für Datei zählt.** Ein Quelltext-Scan über das Modulverzeichnis: (a) jede `admin/**/layout.tsx` nennt `requireRadioHost` **und** `requireRadioAdmin`; (b) jede Datei unter `_actions/` nennt `requireRadioAdmin` oder das Ausleih-Prädikat; (c) jede `route.ts` nennt `radioHostOderNull` und **nicht** `requireRadioHost` (`not.toMatch`); (d) `viewerOderNull` ruft `requireRadioHost` **nicht** (`not.toMatch`, Gegenregel 1.4.4). Die Form ist die von `lagerbuch`s T75-Zusicherungen. |
| `src/app/m/radio/_lib/routen.test.ts` | **Die `PASSTHROUGH`-Prüfung als Test, nicht als Absatz.** Eine Liste aller äußeren Pfade aus 1.2.1/1.2.2 wird durch `decideRoute({ host: "radio.localtest.me", pathname, groups: null })` gefahren und muss je `{ action: "rewrite", target: "/m/radio…" }` liefern; `/login` und `/api/health/radio` müssen `{ action: "next" }` liefern. Ohne Vorbild im Repo — neu, und die Stelle, an der eine spätere Pfad-Umbenennung in die Passthrough-Liste auffällt. |
| `src/core/shell/AppUmschalter.test.tsx` (bestehend) | Fängt die fehlende `ICONS`-Zeile aus 1.1.3, sobald die Registry-Zeile steht — keine Änderung nötig, nur zu kennen. |
| `e2e` | ⚠️ **Kann den Host-Riegel nicht halten.** Playwright fährt gegen genau einen `baseURL`; ein zweiter Host existiert im Lauf nicht. Deshalb steht die Absicherung in `host.test.ts` und `riegel.test.ts` und nicht in einem e2e-Fall. |

## 1.7 Zusagen an andere Kapitel

* **An das Kapitel Zugang (Codes, Sitzung, Gate):** Der Host-Riegel liefert `requireRadioHost` und
  `radioHostOderNull` aus `_lib/host.ts` mit den Signaturen aus 1.4.2. **Jedes** Zugangsprädikat —
  lesend wie schreibend — ruft `requireRadioHost` als **erste Anweisung**; `viewerOderNull` ruft ihn
  **nicht**. Das Ausleih-Cookie trägt **kein `domain`**, und gelöscht wird über dieselbe
  Optionen-Funktion mit `maxAge: 0`. Die beiden Pfade `/t/<code>` und `/abmelden` sind gegen
  `PASSTHROUGH` geprüft und stehen fest; `/t/<code>` ist nach dem ersten Druck nicht mehr
  umbenennbar. `/abmelden` ist ein **Route Handler**, kein Server-Component-Weg.
* **An das Kapitel Verwaltung:** `requireRadioAdmin` aus `_lib/zugang.ts` ist der einzige
  Verwaltungsriegel; jede Server Action ruft ihn als erste Anweisung, und `riegel.test.ts` prüft das
  als Quelltext-Scan. Die neun Verwaltungspfade aus 1.2.2 sind vergeben, verteilt auf die zwei Route-Groups `admin/(arbeit)` (mit Rahmen) und `admin/(druck)` (ohne); `admin/zugaenge` ist der
  Ort, an dem Codes ausgestellt und gesperrt werden. Die Verwaltungsnavigation liegt in
  `_lib/nav.ts` und darf `abschnitt:` vergeben, weil `shell: "full"` gilt (1.1.4).
* **An das Kapitel Kiosk-Oberfläche:** Der Ausleih-Zweig rendert **keine** Shell; 56/72 wird geerbt,
  44/48 sind Token-gedeckt, **64 ist eine eigene `ConfigProvider`-Ebene** innerhalb des Zweigs. Kein
  `@ant-design/icons`-Import in einer Server Component dieses Zweigs (Falle 7).
* **An das Kapitel Daten — das Dreieck ist dort zu bauen, nicht hier:** `radio.db` macht `radio` zu
  einem Modul mit eigener Datenbank, und das verlangt **drei** zusammenpassende Einträge
  (`CLAUDE.md:127-137`): das Migrationsverzeichnis unter `src/app/m/radio/_db/`, die Zeile in
  `MODULE_MIGRATIONS` (`core/bootstrap.ts`) und die `COPY`-Zeile im `Dockerfile`. ⚠️ Fehlt der dritte,
  läuft es lokal und bricht im Container. Dazu **zwingend** ein `src/app/m/radio/_lib/seedLokal.ts`:
  `scripts/seed-lokal.test.ts` verlangt für jeden Eintrag in `MODULE_MIGRATIONS` einen lokalen Seed,
  ein fehlender ist ein **roter Test**, keine stille Auslassung. `radio` gehört in
  `MODULE_MIGRATIONS`, **nicht** in `CORE_MIGRATIONS` — dort stehen nur Datenbanken, die `core` selbst
  führt. Dieses Kapitel registriert das Modul in der Registry und benennt das Dreieck deshalb
  ausdrücklich, baut es aber nicht.
* **An das Kapitel Daten:** Dieses Kapitel legt **keinen** Route Handler unter `api/` an. Wer einen
  braucht (etwa einen CSV-Export), darf jeden Namen unter `src/app/m/radio/api/` außer `auth/**` und
  `health/**` verwenden — beides ist Passthrough und erreicht das Modul nie. `/api/health/radio`
  gehört `core`.
* **Übergabe an Spec 2 (Runbook), vier Zeilen:** (1) `SUITE_HOST_RADIO=radio.iuk-ue.de` **vor** dem
  Umschwenk setzen — vorher liefert Produktion 404, und ein Parallelfenster gibt es nicht. (2)
  `SUITE_ADMIN_GROUP_RADIO` gesetzt **und nicht leer**, Gruppe in Pocket ID vorhanden. (3) Der
  pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` lebt auf dem
  Server; `radio-admin.iuk-ue.de` darf **nicht** in `SUITE_TRAEFIK_RULE` stehen. (4) Nach dem
  Umschwenk gilt von den alten Kiosk-Pfaden nur `/`; alte QR-Codes landen auf dem Gate und werden
  nach einem Code gefragt — das ist der Text, den die Ankündigung tragen muss.
* **An das Kapitel Cutover / Release-Notizen:** Der Registry-Eintrag mit `showInSwitcher: true`
  entscheidet mit, **wer** die Release-Notizen zum Modul sieht
  (`portal/_lib/neuigkeiten/auswahl.ts:48`). Die Notiz braucht eine Zeile in `register.ts`, sonst ist
  der Cutover ein roter Test (`CLAUDE.md:197-202`). Modultitel und Zeichen stehen in der Registry und
  werden in der Notiz nicht wiederholt.

## 1.8 Zu bestätigen — nur der Betreiber weiß es

1. **Der Name der Pocket-ID-Gruppe** für die Verwaltung (Vorschlag `iuk-radio-admin`). Sie muss
   existieren, bevor `/admin` produktiv erreichbar ist; ein Tippfehler oder ein leerer Wert sperrt
   jeden aus, inklusive Betreiber, und der leere Wert wird **nicht** gemeldet.
2. **Sind Aufsteller, Wandkärtchen oder Lesezeichen mit einem anderen Pfad als `/` im Umlauf?**
   Wenn ja, wird aus 1.2.4 eine Redirect-Zeile im Runbook. Wenn nein, ist der 404 auf `/loan`,
   `/return` und den vier alten `/admin/*`-Unterpfaden hingenommen.
3. **Das Wort für den Modultitel** — `Funkgeräte` ist gesetzt; eine andere Betreiber-Wortwahl kostet
   eine Zeile in der Registry und keinen Code. Kein blockierender Posten, aber einer, der vor dem
   ersten Screenshot in einer Release-Notiz geklärt sein sollte.

---

# 2. Datenmodell, Migrationen, Zeitstempel und Retention

## 2.1 Der Zuschnitt der Datenhaltung

`radio` führt **eine** SQLite-Datei, `radio.db`, für **beide** Domänen — Verwaltung an `/admin` und
Ausleihe an `/`. Der Pfad entsteht wie bei jedem Modul aus `moduleDbPath("radio")` →
`${DATA_DIR}/radio.db` (`src/core/db/index.ts:8-10`); im Container ist `DATA_DIR=/data`
(`Dockerfile:40`).

Das ist nicht Bequemlichkeit, sondern die **strukturelle Voraussetzung für Entscheidung 15**: die sechs
`/v1`-Routen aus `radio-admin/server/src/routes/loanApi.ts` dürfen erst als HTTP-Grenze fallen, wenn
Ausleihe und Rückgabe Drizzle-Aufrufe **im selben Prozess auf derselben Verbindung** sind. Zwei
Datenbanken hätten die Grenze nur verschoben (Postgres → zweite SQLite).

**Zum Ausfall-Puffer `STALE_GRACE_MS = 5 * 60_000`**
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`): er wird nach
Entscheidung 15 als **Fachlichkeit** mitgenommen — die Datenseite sagt dazu nur, dass er **keine Spalte,
keine Tabelle und kein Zwischenspeicher-Artefakt** in `radio.db` braucht. Das ist keine Absage: der
Puffer hält Ausleihe, Rückgabe und Historie bei kurzer Störung bedienbar, und beim naiven Port fiele er
weg. *Zusage an das Kapitel, das Ausleihe, Rückgabe und Historie entwirft: das Verhalten gehört dorthin,
das Schema stellt ihm nichts bereit und nimmt ihm nichts.*

Die Verbindung kommt aus dem gewöhnlichen `getModuleDb` — **kein** eigener Opener:

```ts
// src/app/m/radio/_db/client.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export function getDb() {
  return getModuleDb("radio", schema);
}

export type DB = ReturnType<typeof getDb>;
```

**Warum kein `client.ts` in der `lagerbuch`-Bauform** (`src/app/m/lagerbuch/_db/client.ts:1-45`):
`lagerbuch` braucht einen eigenen Opener allein, weil es eine benutzerdefinierte SQLite-Funktion
`lb_falte` registrieren muss — die Suche faltet dort in **SQL**. Die Suche des Kiosk faltet in
**JavaScript** (`radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`, NFD +
Diakritika-Entfernung + ß→ss), und der Gerätebestand ist klein genug, dass sie das weiter tun kann.

> **Zusage an Kapitel 3 und an das Kapitel, das die Geräte-Übersicht und die Rückgabesuche entwirft:**
> die Faltung bleibt in JS, deshalb reicht `getModuleDb`. **Wird die Suche in SQL gezogen** (`LIKE`
> gegen eine gefaltete Spalte oder gegen eine SQLite-Funktion), kippt diese Entscheidung und `radio`
> braucht einen eigenen Opener nach `lagerbuch`-Muster — dann fällt außerdem der Ausschluss aus
> `seedAllModules()` aus §2.9 mit einer **zweiten** Begründung zusammen (`getModuleDb` kennte die
> Funktion nicht).

Die vier Pragmas (`journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`,
`synchronous = NORMAL`) setzt `openModuleDatabase` (`src/core/db/index.ts:12-22`). **`foreign_keys = ON`
ist scharf** — der eine Fremdschlüssel dieses Schemas (§2.5.4) wird durchgesetzt, und damit ist die
Einfügereihenfolge des Importers (§2.8.2) Pflicht, nicht Stil.

## 2.2 Zeitstempel: Millisekunden in der Quelle, Sekunden im Ziel

### 2.2.1 Die Einheit ist entschieden: Sekunden

**Alle** Zeitstempelspalten von radio-admin sind epoch-**Millisekunden**; belegt ist das an jedem
einzelnen Schreibpfad, nicht am Schema: `devices.created_at/updated_at`
(`radio-admin/server/src/repos/deviceRepo.ts:13`, `:78`), `device_events.changed_at`
(`deviceRepo.ts:230`), `software_versions.created_at`
(`radio-admin/server/src/repos/softwareVersionRepo.ts:36`, `:53`), `users.last_seen_at`
(`radio-admin/server/src/repos/userRepo.ts:12`), `loans.borrowed_at/returned_at/created_at/updated_at`
(`radio-admin/server/src/repos/loanRepo.ts:75`, `:104`). Im Schema steht es **nur** für `loans`
(`radio-admin/server/src/db/schema.ts:103-104`: „`borrowed_at`/`returned_at` are epoch-ms").

Das Ziel ist `integer(mode: "timestamp")`, und das speichert Unix-**Sekunden**. Kein Suite-Modul weicht
davon ab (`src/app/m/feedback/_db/schema.ts:22`, `src/app/m/lagerbuch/_db/schema.ts:409`,
`:414`), und `scripts/import/portal.ts:66-71` trägt die Normalisierung mit Begründung bereits vor.
`radio` weicht **nicht** ab: eine Millisekundenspalte in `radio.db` wäre die einzige der Suite, und
jede spätere Wiederverwendung eines core-Bausteins (Retention, Export, Anzeige) müsste die Ausnahme
kennen.

**Der Preis ist die Falle**, und sie ist im Zielsystem gefährlicher als in der Quelle: ein
Faktor-1000-Fehler ist **paritätsgrün** — `scripts/import/parity.ts:43-56` vergleicht Multimengen von
Zeilen-Hashes, und `portal.ts:73-76` schreibt selbst hin, dass **beide Paritätsarme aus derselben
Mapping-Funktion** ableiten. `docs/runbooks/lagerbuch-cutover.md:411` sagt denselben Satz in einer
Zeile: „⚠️ Ein Faktor-1000-Fehler ist paritätsgrün."

Und er ist **datenvernichtend**, sobald die Retention läuft: mit `returned_at` in Sekunden landet jeder
Wert im Jahr 1970, also weit unter jedem Cutoff. In radio-admin genügte dafür der **nächste Boot**
(`radio-admin/server/src/index.ts:35` → `startRetentionSchedule` → `retentionService.ts:47` `purge()`
**vor** dem Timer). Wie §2.7 den Purge aus dem Boot herausnimmt, ist die direkte Antwort darauf.

### 2.2.2 Drei Verteidigungslinien, in dieser Reihenfolge

1. **Empirisch, vor dem Import** (Abfrage 5 aus §2.8.3): `SELECT MIN(created_at), MAX(created_at) FROM
   devices;` — dreizehnstellig heißt Millisekunden. Das ist die einzige Prüfung, die die *Quelle*
   befragt statt den Code.
2. **Ein Riegel in der Mapping-Funktion selbst.** `radio-admin/server/src/import/commit-service.ts:45-47`
   nimmt jede numerische Zeichenkette nur mit `Number.isFinite`, **ohne Plausibilitätsspanne** — so
   passiert `"1700000000"` (Sekunden) wörtlich. Der neue Mapper **wirft** statt zu übernehmen.
3. **Der Unit-Test mit je Feld unterschiedlichen Fixture-Werten** (§2.2.5). Er ist die *zweite* Linie,
   nicht die erste, und er ist die einzige, die auch eine **Feldvertauschung** fängt.

### 2.2.3 `devices.last_updated_at` wird eine TEXT-Datumsspalte

`devices.last_updated_at` ist in der Quelle `integer`, nullable, epoch-ms
(`radio-admin/server/src/db/schema.ts:18`) — semantisch aber ein reines **Kalenderdatum**, und die drei
Schreibwege sind sich über die Zeitzone uneinig:

| Schreibweg | Beleg | tatsächlich gespeichert |
|---|---|---|
| CSV-Import | `commit-service.ts:40-56` (`isoToUtcMs` → `Date.UTC(y, m-1, d)`) | **UTC**-Mitternacht |
| Verwaltungsformular | `radio-admin/client/src/features/devices/DeviceFields.tsx:163-164` (antd `DatePicker`) → `DeviceFormModal.tsx:63` / `DeviceEditForm.tsx:61` (`values.lastUpdatedAt.valueOf()`) | **lokale** Mitternacht = 22:00/23:00 UTC des **Vortags** |
| Update-Karte | `radio-inventar`-fremder Pfad: `radio-admin/client/src/features/update/UpdateDeviceCard.tsx:24` (`lastUpdatedAt: Date.now()`) | echte **Uhrzeit** |
| CSV-Export | `radio-admin/server/src/routes/export.ts:49-51` (`toISOString().slice(0,10)`) | liest als **UTC** |

Serverseitig ist nichts davon geschützt: `radio-admin/shared/src/schemas.ts:29`, `:61`, `:87`
typisieren `z.number().int().nullable()` ohne `min`/`max`.

**Entscheidung: `text("last_updated_at")` im Format `YYYY-MM-DD`, nullable.** Begründung, in dieser
Ordnung:

* Sie löst den Zeitzonenkonflikt **strukturell** statt durch Disziplin. Eine Integer-Spalte verlangt,
  dass jeder künftige Schreibweg dieselbe Mitternachtskonvention einhält — genau die Zusage, die die
  Quelle in drei Wegen dreimal anders gehalten hat.
* Sie hängt **nicht** an `TZ=Europe/Berlin`. Das Setzen von `TZ` ist ausdrücklich ein eigener
  Suite-Posten und nicht Teil dieser Spec; eine Spalte, deren Richtigkeit von einer
  Prozess-Umgebungsvariable abhängt, die woanders gesetzt wird, ist eine stille Kopplung.
* Der CSV-Export wird trivial und rundlauffest: die Zelle **ist** der Spaltenwert, kein
  `new Date(...)`-Umweg, also auch kein zweiter Ort, an dem eine Zeitzone entscheidet.
* Der Verlust ist benannt und klein: der Uhrzeitanteil, den **ein** Schreibweg
  (`UpdateDeviceCard.tsx:24`) versehentlich mitschreibt. Er wird heute nirgends angezeigt — der Export
  schneidet ihn ab (`export.ts:49-51`), und die Anzeige ist ein Datum.

**Der Import konvertiert in `Europe/Berlin`, nicht in UTC.** Der Diskriminator ist nachrechenbar: eine
UTC-Kürzung ist für **einen** der drei Schreibwege richtig (CSV-Import) und für die anderen zwei falsch
(Formularwerte rutschen einen Tag zurück, `Date.now()`-Werte abends ebenfalls). Eine Berlin-Kürzung ist
für **alle drei** richtig — UTC-Mitternacht ist in Berlin 01:00/02:00 desselben Tages, lokale
Mitternacht ist per Konstruktion derselbe Tag, und eine echte Uhrzeit ergibt den Berliner Kalendertag.
Dass der heutige CSV-Export für Formularwerte einen Tag zu früh anzeigt, ist der **Fehler**, den die
Analyse als Fehler benennt, nicht das zu erhaltende Verhalten.

> **Zusage an das Kapitel, das die Geräteverwaltung an `/admin` entwirft:** `last_updated_at` ist
> `string | null` im Format `YYYY-MM-DD`. Das Formular übergibt die **Zeichenkette**
> (`dayjs(...).format("YYYY-MM-DD")`), nie einen Zeitstempel; die Server Action nimmt
> `z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()`. Der CSV-Export gibt die Zelle unverändert
> weiter. Wer einen `DatePicker` an einen `number` bindet, hat den Zeitzonenkonflikt zurückgeholt.

### 2.2.4 Die Mapping-Funktionen — `scripts/import/radio.ts`

`scripts/import/` enthält heute genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts`
(plus je einen Test und `fixtures/`) — **kein `lagerbuch.ts`, kein `radio.ts`**. `radio.ts` **muss**
ins Repo: nur eine committete Mapping-Funktion ist testbar, und nur der Test fängt den
Faktor-1000-Fehler (`docs/radio-portierung-analyse.md:764-774`).

```ts
// scripts/import/radio.ts  (Auszug: die Zeitachse)

/**
 * Plausibilitaetsspanne fuer epoch-MILLISEKUNDEN. 1e12 = 2001-09-09, 4e12 = 2096-10-02.
 * Jeder echte radio-admin-Wert liegt in dieser Spanne; ein Sekundenwert (~1.7e9) liegt
 * darunter und WIRFT, statt als 1970 durchzulaufen. Das ist der Riegel, der
 * `commit-service.ts:45-47` fehlt.
 */
const MS_MIN = 1_000_000_000_000;
const MS_MAX = 4_000_000_000_000;

export function msZuDatum(feld: string, ms: number): Date {
  if (!Number.isFinite(ms) || !Number.isInteger(ms)) {
    throw new Error(`${feld}: kein ganzzahliger Zeitstempel (${ms})`);
  }
  if (ms < MS_MIN || ms > MS_MAX) {
    throw new Error(
      `${feld}: ${ms} liegt ausserhalb der Millisekunden-Spanne — Sekunden statt Millisekunden?`,
    );
  }
  return new Date(ms);
}

export function msZuDatumOptional(feld: string, ms: number | null | undefined): Date | null {
  return ms === null || ms === undefined ? null : msZuDatum(feld, ms);
}

/**
 * epoch-ms → Berliner Kalendertag `YYYY-MM-DD` (§2.2.3). Die Zone steht HIER, nicht in
 * `TZ`: das Setzen von `TZ=Europe/Berlin` ist ein eigener Suite-Posten, und diese Funktion
 * muss auch ohne ihn richtig rechnen. `formatToParts` statt einer Locale-Formatzeichenkette,
 * weil die Reihenfolge der Teile so nicht von Locale-Daten abhaengt.
 */
const BERLIN = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function tagInBerlin(feld: string, ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined) return null;
  const d = msZuDatum(feld, ms);
  const t = Object.fromEntries(BERLIN.formatToParts(d).map((p) => [p.type, p.value]));
  return `${t.year}-${t.month}-${t.day}`;
}
```

Die Zeilen-Mapper daneben (`toNeuesGeraet`, `toNeueSoftwareVersion`, `toNeuenBenutzer`,
`toNeuesGeraeteEreignis`, `toNeueLeihe`) sind reine Funktionen `AltZeile → New<Tabelle>` und rufen
ausschließlich die drei Funktionen oben. Zwei Sonderfälle stehen dort:

* `toNeuesGeraeteEreignis` prüft `source` gegen die vier bekannten Werte und **wirft** bei allem
  anderen. `device_events.source` ist in Drizzle ein Enum
  (`radio-admin/server/src/db/schema.ts:96`), in SQL aber nur `` `source` text NOT NULL `` — die DB
  akzeptiert jeden String, und ein fünfter Wert passiert Datenbank und Typprüfung unbeanstandet und
  bricht erst in einem erschöpfenden Switch der Oberfläche.
* `alamos_integrated` und `loanable` sind zwei 0/1-Integer, die sich verwechseln lassen, ohne dass es
  auffällt (`radio-admin/server/src/db/schema.ts:29`, `:32`). Der Mapper liest sie namentlich, nie
  positionell.

**Die Paritätssicht rechnet auf Sekunden zurück** — beide Arme, sonst scheitert ein
zeichengleicher Import allein an Präzision (`scripts/import/portal.ts:64-71`):

```ts
export function paritaetsSichtGeraet(r: NeuesGeraet | Geraet) {
  return {
    // … alle 25 Spalten namentlich, keine Auswahl …
    lastUpdatedAt: r.lastUpdatedAt ?? null,          // TEXT, keine Umrechnung
    createdAt: sekunden(r.createdAt),
    updatedAt: sekunden(r.updatedAt),
  };
}
const sekunden = (d: Date | null) => (d ? Math.floor(d.getTime() / 1000) : null);
```

### 2.2.5 Der Test, der den Faktor-1000-Fehler fängt

`scripts/import/radio.test.ts`. **Jedes Zeitfeld einer Zeile trägt einen anderen Fixture-Wert** —
sonst ist der Test vakuös: gleiche Werte bestehen jede Vertauschung, und eine durchgängige Division
durch 1000 hasht beidseitig gleich.

```ts
const ALT_GERAET = {
  id: "g-1",
  issi: "1234567",          // ≠ tei
  tei: "7654321",           // ≠ issi
  serial_number: "SN-001",
  hiorg_id: "HO-002",
  opta: "OPTA-003",
  alamos_integrated: 1,     // ≠ loanable
  loanable: 0,              // ≠ alamos_integrated
  created_at: 1_735_689_600_000,      // 2025-01-01T00:00:00Z
  updated_at: 1_738_368_000_000,      // 2025-02-01T00:00:00Z
  last_updated_at: 1_740_787_200_000, // 2025-03-01T00:00:00Z
  // …
};
```

Die Testnamen, verbindlich:

| Test | fängt |
|---|---|
| `toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden` (`getTime()` je Feld exakt gegen die drei Konstanten, plus `getUTCFullYear() === 2025`) | Faktor 1000 (1970) **und** Vertauschung von `created_at`/`updated_at`/`last_updated_at` |
| `msZuDatum wirft bei einem Sekundenwert (1735689600)` | die offene Übernahme aus `commit-service.ts:45-47` |
| `msZuDatum wirft bei 0 und bei null-artigen Werten in einer NOT-NULL-Spalte` | „fehlender Zeitstempel" als 1970 |
| `tagInBerlin: 2026-08-16T22:00:00Z (Formular-Mitternacht) ergibt 2026-08-17` | die UTC-Kürzung, die den Tag zurückschiebt |
| `tagInBerlin: 2026-08-17T00:00:00Z (CSV-Weg) ergibt 2026-08-17` | die Gegenrichtung |
| `tagInBerlin: 2026-08-17T14:35:00Z (Date.now()-Weg) ergibt 2026-08-17` | die dritte Semantik |
| `toNeueLeihe: snapshot_call_sign und borrower_name werden nicht vertauscht` | das Paar aus Pflicht 4 der Analyse |
| `toNeuesGeraet: alamos_integrated und loanable werden nicht vertauscht` | die zwei 0/1-Integer |
| `toNeuesGeraeteEreignis wirft bei source="importiert"` | der fünfte Enum-Wert ohne DB-CHECK |
| `paritaetsSichtGeraet liefert Sekunden fuer beide Arme` | Paritätsrot allein aus Präzision |
| `Import ist asymmetrisch idempotent: Zielzeile geaendert, erneut importiert` | §2.8.4 |

⚠️ Ein Test, der **zweimal dieselbe Quelle** importiert, ist bei Upsert-per-Primärschlüssel **immer**
grün und beweist nichts (`docs/radio-portierung-analyse.md:1292-1301`). Der letzte Test der Tabelle
stellt den asymmetrischen Fall her.

## 2.3 Bestandsaufnahme: was aus radio-admin herüberkommt

Die Quelle ist `radio-admin/server/src/db/schema.ts` (137 Zeilen) plus die fünf Migrationen unter
`radio-admin/server/drizzle/`. Sie führt **sechs Tabellen mit 61 Spalten**:

| Tabelle | Spalten | wandert? |
|---|---|---|
| `devices` | 25 | ja, vollständig |
| `software_versions` | 6 | ja, vollständig (inkl. der toten `created_by`, §2.10) |
| `users` | 3 | ja, 1:1 (§2.10) |
| `device_events` | 8 | ja, vollständig |
| `loans` | 11 | ja, vollständig |
| `api_tokens` | 8 | **nein** (§2.10) |

Vier gemessene Eigenschaften der Quelle, die das Zielschema bindend prägen:

1. **Genau ZWEI SQL-`DEFAULT`s**, beide aus `0002_numerous_mandroid.sql`
   (`software_versions.sort_order` und `software_versions.is_target`). Über alle fünf Migrationen
   erscheint das Schlüsselwort sonst nirgends. Jede `id` bekommt ihren Wert aus `$defaultFn(newId)`
   **in der Anwendung** (`radio-admin/server/src/db/schema.ts:5`, `:44`, `:60`, `:87`, `:120`);
   `created_at`/`updated_at` haben nirgends `CURRENT_TIMESTAMP`. **Folge für den Import: jede Zeile
   muss `id` UND Zeitstempel selbst mitbringen.**
2. **Genau EIN Fremdschlüssel:** `device_events.device_id → devices.id ON DELETE CASCADE`
   (`radio-admin/server/src/db/schema.ts:88-90`; in `0000` die einzige `FOREIGN KEY`-Zeile aller fünf
   Migrationen).
3. **Null Trigger, null CHECK-Constraints.** `rg -rn "CREATE TRIGGER|CHECK *\("` über
   `radio-admin/{server,shared,client,scripts,docker}` liefert 0 Treffer. Die `lagerbuch`-Präzedenz
   „`onConflictDoUpdate` bricht an Append-only-Triggern" trifft hier **nicht** zu.
4. **Sieben Indizes**, davon einer **partiell** und für `drizzle-kit` unsichtbar (§2.6).

**Alle Primärschlüssel sind `text`** — `newId()` bzw. bei `users` der OIDC-`sub`
(`radio-admin/server/src/db/schema.ts:79`). Sie werden **1:1 übernommen**, wie `scripts/import/portal.ts:36`
es vormacht. Es gibt keinen Grund und keine Möglichkeit, sie neu zu vergeben: `loans` und
`device_events` zeigen darauf, und die `sub`s stehen in sechs Auditspalten.

**Die FK-Freiheit von `loans.device_id` ist eine Zusage, keine Nachlässigkeit.** Sie steht im Quelltext
begründet (`radio-admin/server/src/db/schema.ts:106-110`): „returned loans are retained as history and
must outlive a later device deletion (a cascade FK would wipe that history; a restrict FK would block
deleting a device that merely has old returned loans). Historical accuracy is provided by the immutable
display snapshot copied at borrow time, not by a live join." **Pflicht: diesen FK nicht „der Ordnung
wegen" nachziehen.** Mit `CASCADE` löscht die erste Geräteausmusterung die Historie, mit `RESTRICT`
blockiert jede alte Rückgabe das Ausmustern. `devices`↔`device_events` und `devices`↔`loans` sehen
gleich aus und sind **gegensätzlich**: das erste Paar **ist** ein Cascade-FK und muss einer bleiben.
Dasselbe gilt für die Auditspalten: **kein FK auf `users.sub`** — er bräche jeden Kaltimport, dessen
`sub`-Werte in der Suite noch nie eingeloggt waren, also alle.

## 2.4 Der Zugang: welche Spalten der Ausleihweg braucht

Kapitel 3 entwirft die Semantik (Codeformat, Einlöseweg, Sitzungsdauer, Gate-Texte). Dieses Kapitel
entwirft die Spalten, und der Rahmen ist Entscheidung 6: **dauerhaft, sperrbar, nicht löschbar**, und
der Code prägt beim Einlösen eine zeitlich begrenzte Sitzung. Vorbild ist
`src/app/m/lagerbuch/_db/schema.ts:376-415` (Tabelle `tokens`).

**Eine Tabelle genügt: `zugangscodes`.** Der zweite Zugangsweg — Anmeldung über die Suite, Zugriff aus
der Kachel — schreibt hier **nichts**: seine Sitzung ist die Auth.js-Sitzung, und es gibt kein
Objekt, das ausgestellt oder gesperrt werden könnte. *Zusage an Kapitel 3.*

Die Spaltenentscheidungen einzeln:

* **`id` ist der Wert, der in der Sitzung steckt, nicht `code`.** Das ist die Bauform, die `lagerbuch`
  nach §3.4.3 erst erlaubt hat, das Klartext-Geheimnis aus dem Cookie zu entfernen
  (`src/app/m/lagerbuch/_db/schema.ts:377-378`, `src/app/m/lagerbuch/_lib/helferZugang.ts:29-31`). Der
  Riegel schlägt bei jedem Aufruf über den Primärschlüssel nach; das ist ein Indexzugriff auf derselben
  Verbindung, die die Seite ohnehin öffnet.
* **`code` wird zeichengleich gespeichert und nie normalisiert.** Er ist gleichzeitig QR-Nutzlast und
  Gate-Eingabe; eine Umkodierung beim Import oder beim Schreiben macht gedruckte Kärtchen ungültig
  (`src/app/m/lagerbuch/_db/schema.ts:379-383` sagt genau das für `lagerbuch`).
  **Kein `COLLATE NOCASE`:** wenn Kapitel 3 die Eingabe unempfindlich gegen Groß-/Kleinschreibung
  macht, normalisiert es die **Eingabe** vor dem Nachschlagen — eine Collation auf der Spalte änderte
  still die Bedeutung von „exakt".
  *Zusage an Kapitel 3:* Länge und Alphabet des Codes gehören dorthin; die Spalte ist `text` mit
  `unique()` und schreibt kein Format vor.
* **`label` ist das Anzeigefeld.** Der Code allein sagt niemandem etwas — die Verwaltungsliste braucht
  „Aufsteller Fahrzeughalle", nicht „418-207".
* **`aktiv` ist der einzige Widerruf, den es gibt.** Kein Löschweg, keine `revoked_at`-Nachbildung von
  `api_tokens`: `false` ist endgültig genug und lässt die Zeile stehen.
* **`gesperrtAm`/`gesperrtVon` gehen über das `lagerbuch`-Vorbild hinaus, mit Grund.** Weil die Zeile
  **dauerhaft** in der Liste steht, muss sie erklären, warum sie tot ist; `aktiv = false` allein
  verlangt vom Betreiber, sich das zu merken. Beide sind nullable und werden ausschließlich von der
  Sperr-Action geschrieben.
* **`lastUsedAt` ist reine Anzeige** und hat **keinen** Einfluss auf Gültigkeit — wie in `lagerbuch`
  (`src/app/m/lagerbuch/_db/schema.ts:412-414`).

**„Nicht löschbar" braucht einen Mechanismus, keinen Satz.** radio-admin hat null Trigger (§2.3), und
`lagerbuch` erzwingt es ebenfalls nicht in SQL. Die Durchsetzung ist deshalb dreiteilig und gehört
ausgeschrieben in den Plan:

1. **Es gibt keinen Löschweg.** Keine Server Action, kein Route Handler, kein `db.delete(zugangscodes)`
   im ganzen Modul. Kapitel 3 baut die Sperrung, nicht ein Löschen.
2. **Ein Quelltext-Scan hält das fest** — `src/app/m/radio/_db/append.test.ts`, Test
   `"kein Löschweg auf zugangscodes"`: liest alle `.ts`-Dateien unter `src/app/m/radio` und verlangt,
   dass `delete(zugangscodes)` nirgends vorkommt. Dasselbe Mittel, mit dem
   `scripts/seed-lokal.test.ts:56` die Boot-Verdrahtung des Seeds verbietet. Er fängt die naheliegende
   Verdrahtung, nicht jede denkbare — das ist bekannt und akzeptiert.
3. **Der Grund steht als Kommentar in der Spalte selbst** (siehe §2.5.6): ein gelöschter Code kann an
   ein später ausgestelltes Kärtchen zurückfallen, und dann erscheinen **historische** Journal- und
   Verwaltungszeilen unter dem neuen Label. Das ist genau der Schaden, den `lagerbuch` bei seiner
   toten Spalte beschreibt (`src/app/m/lagerbuch/_db/schema.ts:391-394`): der Import hat keinen zweiten
   Versuch.

**`loans` bekommt KEINE Spalte für den Zugangsweg.** Weder `zugangscode_id` noch ein `quelle`-Feld.
Drei Gründe: (a) die Spalte existiert in der Quelle nicht, hat also keinen Importwert; (b) Entscheidung 7
macht die Ausleihe auf **beiden** Wegen „anonym in der Sache" — eine Spalte, die die Wege
unterscheidbar macht, lädt eine Verwaltungsansicht ein, die sie ungleich behandelt; (c) es gibt heute
keinen benannten Leser, und `lagerbuch` führt den Code im Journal nur, weil dort eine Buchung
zurechenbar sein **muss**, während hier `borrower_name` das Wer trägt. Braucht die Verwaltung die
Unterscheidung später, ist das eine **additive** Migration `0002`, keine Änderung dieses Entwurfs.
*Zusage an das Kapitel, das die Ausleihliste an `/admin` entwirft.*

**Die Vorbelegung des Entleihernamens ändert am Schema nichts.** Entscheidung 7 lässt offen (⚠️ **zu
bestätigen**), ob der Benutzername beim angemeldeten Weg vorausgefüllt wird. `loans.borrower_name`
bleibt in jedem Fall `text NOT NULL`: ein vorausgefüllter Name ist eine Zeichenkette wie eine getippte,
und die Retention löscht ihn nach zwei Monaten unabhängig davon, woher er kam. *Zusage an Kapitel 3: die
Vorbelegung ist eine Frage des Formulars, keine des Schemas — es entsteht dafür weder eine Spalte noch
eine Verbindung zur Auth.js-Identität.*

⚠️ **Zwei Punkte bleiben zu bestätigen** (nur der Betreiber weiß sie):
* **Sitzungsdauer.** Vorschlag **12 h**, wie `lagerbuch` (`helferGueltigkeitSekunden()`,
  `src/app/m/lagerbuch/_lib/helferSitzung.ts:50-57`). Sie hat **keine** Spalte in diesem Schema — der
  Ablauf steht im Cookie, die Sperrung in der Datenbank; das ist die Bauform, nicht der Wert.
* **Sind gedruckte Aufsteller im Umlauf?** Falls ja, ist der `code`-Wert der Bestandscodes beim
  Ausstellen zeichengleich zu übernehmen und die Ausgabe des ersten Satzes ist ein Druckvorgang, kein
  Bildschirmvorgang. Falls nein, entstehen alle Codes in der Suite.

## 2.5 Das Zielschema — `src/app/m/radio/_db/schema.ts`

**Die SQL-Spaltennamen sind zeichengleich zur Quelle**, und die TypeScript-Bezeichner bleiben ebenfalls
die der Quelle (`snapshotCallSign`, `issi`, `loanable` …), obwohl die jüngeren Suite-Module deutsch
benennen. Grund: der Importer ordnet 61 Spalten zu, und jede Umbenennung ist eine
Verwechslungsgelegenheit, die kein Gate sieht (`docs/radio-portierung-analyse.md:743-747` listet die vier
Paare, die sich verwechseln lassen). Die **neue** Tabelle `zugangscodes` ist deutsch benannt — sie hat
keine Quelle, die sie binden würde.

**IDs.** Bestehende Primärschlüssel wandern **zeichengleich** (cuid2 aus
`radio-admin/server/src/db/id.ts`). Für **neue** Zeilen erzeugt die Suite `nanoid()` — Präzedenz im
Repo: `src/app/m/portal/_db/schema.ts:2` und `src/app/m/aufgaben/_db/schema.ts:2` importieren es genau
so in ihrer Schemadatei (`package.json:32`, `nanoid ^6.0.1`). Es gibt keinen Grund,
`@paralleldrive/cuid2` als Abhängigkeit aufzunehmen: gemessen prüft, filtert und sortiert **nichts** die
Form einer id — `rg -n 'cuid|regex|length\(' radio-admin/shared/src/schemas.ts` liefert **0 Treffer**,
es gibt also nicht einmal einen Zod-Validator, der eine Länge oder ein Alphabet festlegte. Beide
Kennungsräume koexistieren als Primärschlüssel derselben Tabelle; dieselbe Begründung trägt in
`lagerbuch` (`src/app/m/lagerbuch/_db/schema.ts:428-430`).

**Kein `"use client"` in dieser Datei und in keiner Datei unter `_db/`** — Falle 6.

### 2.5.1 `devices` (25 Spalten)

```ts
import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { nanoid } from "nanoid";

export const devices = sqliteTable("devices", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  rufname: text("rufname"),
  issi: text("issi").notNull().unique(),
  // TEI = die im Geraet gebrannte Hardware-Identitaet, im Gegensatz zur umprogrammierbaren
  // issi. Optional und AUSDRUECKLICH NICHT unique: Geraete ohne erfasste TEI sind der
  // Normalfall (radio-admin/server/src/db/schema.ts:8-11). Ein `unique()` hier bricht den
  // Import beim zweiten NULL-freien Duplikat und ist fachlich falsch.
  tei: text("tei"),
  serialNumber: text("serial_number"),
  deviceType: text("device_type"),
  status: text("status"),
  location: text("location"),
  assignedTo: text("assigned_to"),
  softwareVersion: text("software_version"),
  // KALENDERDATUM `YYYY-MM-DD`, kein Zeitstempel (§2.2.3). Die Quelle fuehrt hier
  // epoch-ms mit drei widerspruechlichen Zeitzonen-Semantiken; der Import kuerzt in
  // Europe/Berlin.
  lastUpdatedAt: text("last_updated_at"),
  notes: text("notes"),
  // Kundenstammdaten, alle nullable.
  hiorgId: text("hiorg_id"),
  opta: text("opta"),
  funktion: text("funktion"),
  hersteller: text("hersteller"),
  bedieneinheit: text("bedieneinheit"),
  // Klartext, komma-verbundene Teilmenge von DEVICE_MODES, z. B. "TMO,DMO". KEINE
  // Normalisierung beim Import — der Wert wird an einer Stelle gelesen und gesplittet.
  deviceModes: text("device_modes"),
  alamosIntegrated: integer("alamos_integrated", { mode: "boolean" }),
  // STAMMDATUM. Entscheidet, ob das Geraet ausleihbar ist, und war in radio-admin nie in
  // UPDATER_EDITABLE_FIELDS (radio-admin/server/src/db/schema.ts:30-32).
  loanable: integer("loanable", { mode: "boolean" }),
  // APPEND-ONLY Update-Anmerkung, getrennt von `notes`: der Update-Weg haengt an, er
  // ueberschreibt nie (radio-admin/server/src/db/schema.ts:33-36). ⚠️ Genau diese Spalte
  // walzt ein `onConflictDoUpdate` beim Zweitimport platt (§2.8.4).
  updateNote: text("update_note"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub`, OHNE FK auf users.sub (§2.3).
  createdBy: text("created_by"),
  updatedBy: text("updated_by"),
});
```

### 2.5.2 `software_versions` (6 Spalten)

```ts
export const softwareVersions = sqliteTable("software_versions", {
  id: text("id").primaryKey().$defaultFn(nanoid),
  value: text("value").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  /**
   * TOTE SPALTE, WANDERT TROTZDEM. Geschrieben an zwei Stellen
   * (radio-admin/server/src/repos/softwareVersionRepo.ts:39, :53), in KEINER Projektion
   * selektiert (`listSoftwareVersions` :141-148, `getTargetVersion` :65). Es gibt also
   * Werte, und eine weggelassene Spalte macht einen vorhandenen Wert unwiederbringlich —
   * der Import hat keinen zweiten Versuch (dieselbe Begruendung wie
   * src/app/m/lagerbuch/_db/schema.ts:386-395). Es wird KEIN Leser gebaut.
   */
  createdBy: text("created_by"),
  // Reine Anzeigereihenfolge. Leitet den Ziel-Stand AUSDRUECKLICH NICHT ab: eine neu
  // erfasste Version, die oben landet, wird nie automatisch Ziel
  // (radio-admin/server/src/db/schema.ts:48-51).
  sortOrder: integer("sort_order").notNull().default(0),
  // Der Update-Stand eines Geraets ist BERECHNET, nicht gespeichert, und haengt allein an
  // dieser Marke. Genau EINE Zeile darf sie tragen — und es gibt keinen DB-Constraint dafuer
  // (§2.6). Der Leser `getTargetVersion` hat kein ORDER BY
  // (radio-admin/server/src/repos/softwareVersionRepo.ts:63-70): bei zwei Marken entscheidet
  // die Reihenfolge, in der SQLite zufaellig liefert, ueber den angezeigten Stand JEDES Geraets.
  isTarget: integer("is_target", { mode: "boolean" }).notNull().default(false),
});
```

### 2.5.3 `users` (3 Spalten) — wandert 1:1, ohne Zuordnungstabelle

```ts
/**
 * Reine Nachschlagetabelle fuer die ANZEIGE: sechs Auditspalten speichern die stabile
 * OIDC-Identitaet `sub` (devices.created_by/updated_by, device_events.changed_by,
 * software_versions.created_by), und ohne diese Tabelle rendert jede Auditzeile und jedes
 * Geraeteereignis eine nackte UUID.
 *
 * `sub` IST der Primaerschluessel und wird ROH gefuehrt — radio-admin schreibt ihn schon
 * roh (radio-admin/server/src/db/schema.ts:79). Der Praefix `pocketid:` ist ein Artefakt des
 * KIOSK (radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134) und
 * kommt hier nie an; Entscheidung 14 wird davon nicht beruehrt.
 *
 * KEINE Zuordnungstabelle alt_sub → neu_sub: die Pocket-ID-Instanz fuehrt
 * `subject_types_supported: ["public"]` (gemessen, src/app/m/lagerbuch/_db/schema.ts:431-432),
 * der `sub` ist also ueber beide OIDC-Clients identisch.
 */
export const users = sqliteTable("users", {
  sub: text("sub").primaryKey(),
  name: text("name").notNull(),
  lastSeenAt: integer("last_seen_at", { mode: "timestamp" }).notNull(),
});
```

⚠️ `select count(*) from users` ist **keine** Personenzahl und gehört in keine Oberfläche, die eine
Personenzahl anzeigen will.

### 2.5.4 `device_events` (8 Spalten) — der einzige Fremdschlüssel

```ts
export const deviceEvents = sqliteTable(
  "device_events",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    // DER EINZIGE FK DES SCHEMAS, und er MUSS ein Cascade-FK bleiben
    // (radio-admin/server/src/db/schema.ts:88-90). `foreign_keys = ON` ist gesetzt
    // (src/core/db/index.ts:19) — ein Ereignis-Insert vor dem passenden Geraet bricht hart ab.
    deviceId: text("device_id")
      .notNull()
      .references(() => devices.id, { onDelete: "cascade" }),
    field: text("field").notNull(),
    oldValue: text("old_value"),
    newValue: text("new_value"),
    changedBy: text("changed_by"),
    changedAt: integer("changed_at", { mode: "timestamp" }).notNull(),
    // Drizzle-Enum OHNE DB-CHECK — in SQL steht nur `text NOT NULL`. Die Datenbank
    // akzeptiert jeden String; der Importer prueft (§2.2.4), die DB tut es nicht.
    source: text("source", {
      enum: ["manual", "csv-import", "create", "update-note"],
    }).notNull(),
  },
  (t) => [index("device_events_device_id_idx").on(t.deviceId)],
);
```

### 2.5.5 `loans` (11 Spalten) — FK-frei mit Absicht

```ts
/**
 * Ausleihen. `returned_at IS NULL` heisst „aktive Leihe".
 *
 * `device_id` ist ABSICHTLICH KEIN Fremdschluessel (§2.3, Wortlaut der Quelle in
 * radio-admin/server/src/db/schema.ts:106-110). Die historische Richtigkeit traegt der
 * unveraenderliche Anzeige-Schnappschuss, der beim Ausleihen kopiert wird, nicht ein
 * lebender Join.
 *
 * `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention (§2.7).
 */
export const loans = sqliteTable(
  "loans",
  {
    id: text("id").primaryKey().$defaultFn(nanoid),
    deviceId: text("device_id").notNull(),
    snapshotCallSign: text("snapshot_call_sign").notNull(),
    snapshotSerialNumber: text("snapshot_serial_number"),
    snapshotDeviceType: text("snapshot_device_type"),
    borrowerName: text("borrower_name").notNull(),
    borrowedAt: integer("borrowed_at", { mode: "timestamp" }).notNull(),
    returnedAt: integer("returned_at", { mode: "timestamp" }),
    returnNote: text("return_note"),
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [
    index("loans_device_id_idx").on(t.deviceId),
    index("loans_borrowed_at_idx").on(t.borrowedAt),
    index("loans_returned_at_idx").on(t.returnedAt),
    // Der PARTIELLE Unique-Index steht hier NICHT und kann hier nicht stehen (§2.6).
  ],
);
```

### 2.5.6 `zugangscodes` (9 Spalten) — neu

```ts
/**
 * Der dauerhafte, sperrbare Ausleih-Zugang (Entscheidung 6). Vorbild in Bauform und
 * Begruendung: src/app/m/lagerbuch/_db/schema.ts:376-415.
 *
 * NICHT LOESCHBAR — und der Grund ist kein Ordnungsargument: ein geloeschter Code kann an
 * ein spaeter ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE
 * Zeilen unter dem neuen Label. Durchgesetzt durch Abwesenheit jedes Loeschwegs plus den
 * Quelltext-Scan in _db/append.test.ts (§2.4).
 */
export const zugangscodes = sqliteTable("zugangscodes", {
  // Steckt im Sitzungs-Cookie JEDER laufenden Ausleih-Sitzung — nicht neu vergeben.
  // Der Riegel schlaegt bei jedem Aufruf hierueber nach, nicht ueber `code`; nur so muss
  // das Klartext-Geheimnis nicht im Cookie stehen.
  id: text("id").primaryKey().$defaultFn(nanoid),
  // ZUGLEICH QR-Nutzlast UND Gate-Eingabe. Zeichengleich gespeichert, nie normalisiert,
  // nie umkodiert — gedruckte Kaertchen sind sonst ungueltig. KEIN `COLLATE NOCASE`:
  // eine unempfindliche Eingabe normalisiert die EINGABE, nicht die Spalte.
  // Laenge und Alphabet: Kapitel 3.
  code: text("code").notNull().unique(),
  // Der Anzeigename in der Verwaltung — der Code allein sagt niemandem etwas.
  label: text("label").notNull(),
  // DER EINZIGE WIDERRUF, DEN ES GIBT. Ein Import oder ein Seed, der alles als aktiv
  // anlegt, reaktiviert still jeden gesperrten Code — und zwar genau die, die gesperrt
  // wurden, weil ein Kaertchen verschwunden ist.
  aktiv: integer("aktiv", { mode: "boolean" }).notNull().default(true),
  // Nur von der Sperr-Action geschrieben. Sie existieren, WEIL die Zeile dauerhaft in der
  // Liste steht und erklaeren muss, warum sie tot ist.
  gesperrtAm: integer("gesperrt_am", { mode: "timestamp" }),
  gesperrtVon: text("gesperrt_von"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  // OIDC-`sub` des ausstellenden radio-admins (Entscheidung 7). Reines Auditfeld.
  createdBy: text("created_by").notNull(),
  // NULL = „nie eingeloest". REINE ANZEIGE, ohne Einfluss auf Gueltigkeit.
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
});
```

**Kein Index auf `aktiv`.** Die Verwaltungsliste ist die einzige Abfrage über diese Spalte, und die
Tabelle liegt in der Größenordnung „Zahl der Aufsteller" — ein Index kostet hier mehr Schreibarbeit
als er an Lesezeit einspart. Der Riegel selbst liest über den Primärschlüssel.

## 2.6 Indizes — und der eine, den `drizzle-kit` nicht erzeugen kann

Acht Indizes im Ziel: die sieben der Quelle plus `zugangscodes_code_unique`.

| Index | Herkunft | erzeugt durch |
|---|---|---|
| `devices_issi_unique` | `0000` | `.unique()` auf `devices.issi` |
| `software_versions_value_unique` | `0000` | `.unique()` auf `software_versions.value` |
| `device_events_device_id_idx` | `0000` | Tabellenausdruck `deviceEvents` |
| `loans_device_id_idx` | `0003` | Tabellenausdruck `loans` |
| `loans_borrowed_at_idx` | `0003` | Tabellenausdruck `loans` |
| `loans_returned_at_idx` | `0003` | Tabellenausdruck `loans` |
| **`loans_device_active_uidx`** | `0003`, **handgeschrieben** | **eigene Migration, von Hand** |
| `zugangscodes_code_unique` | neu | `.unique()` auf `zugangscodes.code` |

**`loans_device_active_uidx` ist der einzige Riegel für die Invariante „höchstens eine aktive Ausleihe
je Gerät".** Er ist **partiell**, und `drizzle-kit` kann partielle Indizes nicht emittieren — deshalb
steht er in der Quelle von Hand am Ende von `radio-admin/server/drizzle/0003_kind_spot.sql`, mit dieser
Begründung im Dateikopf: „Hand-added because drizzle-kit cannot emit partial indexes; it is invisible to
the drizzle schema, so future `drizzle-kit generate` runs neither see nor drop it."

**Er wandert zeichengleich, aber in eine EIGENE Migrationsdatei** (`0001_loans_aktiv_uidx.sql`, §2.9.1),
nicht angehängt an die generierte `0000`. Zwei Gründe: eine generierte Datei darf nie von Hand
nachbearbeitet werden, weil der nächste `drizzle-kit generate`-Lauf sie neu schreibt und ihr Hash
wandert; und eine eigene Datei mit sprechendem Namen sagt beim Durchblättern, dass hier etwas steht,
das kein Generator kennt.

```sql
-- src/app/m/radio/_db/migrations/0001_loans_aktiv_uidx.sql
-- Partieller Unique-Index: hoechstens EINE aktive Leihe (returned_at IS NULL) je Geraet.
-- Von Hand, weil drizzle-kit partielle Indizes nicht emittieren kann. Er ist dem
-- Drizzle-Schema UNSICHTBAR — kuenftige `drizzle-kit generate`-Laeufe sehen ihn nicht und
-- entfernen ihn nicht. Diese Datei NICHT neu erzeugen: ihr Hash steht in
-- `__drizzle_migrations`, und ein geaenderter Hash laesst bereits migrierte Datenbanken in
-- eine Absturzschleife laufen.
CREATE UNIQUE INDEX `loans_device_active_uidx` ON `loans` (`device_id`) WHERE `returned_at` IS NULL;
```

**Zwei Folgen, beide gateblind:**

* **(a) Wird der Index vergessen, ist der Riegel weg — und der Import ist grün.** Die Altdaten erfüllen
  die Invariante, also fällt nichts auf. Sichtbar wird es erst, wenn ein zweites Mal dasselbe Gerät
  ausgeleiht wird. `pnpm typecheck` und `pnpm build` fassen Migrationen nicht an.
* **(b) Ein Upsert kann diesen Index nicht als Konfliktziel treffen.** SQLite verlangt, dass das
  Konfliktziel einen Unique-Index trifft, und bei einem partiellen Index muss das Ziel dieselbe
  `WHERE`-Klausel tragen: `onConflictDoUpdate({ target: loans.deviceId })` trifft
  `loans_device_active_uidx` nie. Historie im Bulk zu importieren ist gefahrlos (dort ist
  `returned_at NOT NULL`, der Index greift nicht); **zwei aktive Leihen für dasselbe Gerät schlagen hart
  fehl** — deshalb Abfrage 4 aus §2.8.3 **vor** dem Import.

**Der Test, der die Zeile hält** — `src/app/m/radio/_db/migrations.test.ts`:

| Test | prüft |
|---|---|
| `zwei aktive Leihen auf dasselbe Geraet werden abgewiesen` | migriert eine `:memory:`-DB, legt eine Leihe mit `returnedAt: null` an, erwartet beim zweiten Insert einen Wurf |
| `eine zurueckgegebene und eine aktive Leihe auf dasselbe Geraet sind erlaubt` | die Partialität selbst — sonst wäre ein gewöhnlicher Unique-Index „grün" |
| `zwei zurueckgegebene Leihen auf dasselbe Geraet sind erlaubt` | dass der Index die Historie nicht sperrt |
| `loans_device_active_uidx existiert in sqlite_master` | die Zeile direkt, damit ein `drizzle-kit generate` sie nicht still verlieren kann |

**Was das Schema NICHT durchsetzt und wo der Ersatz liegt:**

* **„Genau eine `is_target`-Zeile"** ist eine Behauptung des Anwendungscodes, kein Constraint. Erzwungen
  wird sie in einer Transaktion (`radio-admin/server/src/repos/softwareVersionRepo.ts:81-87`), und der
  Leser ist wehrlos (`:63-70`, `.limit(1)` **ohne** `orderBy`). Ein Import, der `is_target` je Zeile aus
  einer Quelle mappt, kann schweigend zwei Marken setzen, und danach hängt der angezeigte
  Update-Stand **jedes** Geräts daran, welche Zeile SQLite zufällig zuerst liefert. **Kein zweiter
  partieller Index dagegen** — er würde das Setzen der Marke von einer Zweischritt-Transaktion in einen
  Konflikt verwandeln und den bestehenden Schreibweg brechen. Ersatz ist Abfrage 2 aus §2.8.3, und sie
  ist **blockierend**.
* **`device_events.source`** hat kein DB-CHECK (§2.5.4). Ersatz ist die Prüfung im Mapper.
* **Kein Append-only-Trigger auf `device_events`**, obwohl die Tabelle fachlich ein Journal ist. Die
  Quelle hat keinen (§2.3), und einer im Ziel wäre eine Verhaltensänderung, die dem Import den
  `INSERT OR IGNORE`-Weg nicht erleichtert, sondern erschwert. Der Ersatz ist, dass es keinen
  Schreibweg außer „anhängen" gibt.

## 2.7 Retention — übernommen, aber nicht am Boot

Übernommen wird die Regel: **zurückgegebene Leihen älter als zwei Monate werden gelöscht**
(`HISTORY_RETENTION_MONTHS = 2`, `radio-admin/server/src/services/retentionService.ts:9`). Der Grund
steht dort im Kommentar und ist der einzige, der zählt: `borrower_name` ist personenbezogen, und das
Löschen ist eine **ausdrückliche geplante Richtlinie**, keine Nebenwirkung davon, dass jemand die
Historie liest. Betreiberantwort 4 bestätigt die Übernahme; betroffen sind **< 100 Leihen** — eine
Schätzung des Betreibers, **keine Zählung** (die Zahl fällt beim Cutover an, §2.8.3).

### 2.7.1 Wo sie läuft

Ein modul-eigener Hintergrund-Takt, `starteRadioRetentionTakt()` in `src/app/m/radio/_lib/boot.ts`,
gerufen aus `startBackgroundWork()` (`src/core/bootstrap.ts`, §2.9.3). Vorbild in Bauform und
Begründung ist der Aufräum-Takt von `files` (`src/app/m/files/_lib/boot.ts:113-180`):

```ts
// src/app/m/radio/_lib/boot.ts   — KEIN "use client" (Falle 6)
const MS_PRO_TAG = 86_400_000;
let uhr: ReturnType<typeof setInterval> | undefined;

/** Der Cutoff als DATE, nicht als Millisekundenzahl (§2.7.4). Rein und testbar. */
export function retentionGrenze(jetzt: Date = new Date()): Date {
  const d = new Date(jetzt.getTime());
  d.setUTCMonth(d.getUTCMonth() - 2);
  return d;
}

/** Ein Lauf. Gibt die Zahl geloeschter Zeilen zurueck. Wirft nicht. */
export function raeumeLeihhistorie(db: DB, jetzt?: Date): number {
  const grenze = retentionGrenze(jetzt);
  const ergebnis = db
    .delete(loans)
    .where(and(isNotNull(loans.returnedAt), lt(loans.returnedAt, grenze)))
    .run();
  return ergebnis.changes;
}

export function starteRadioRetentionTakt(): void {
  // Idempotent, weil `register()` unter HMR mehr als einmal laeuft: zwei Timer waeren
  // zwei Laeufe je Takt. Ein Container, ein Timer — `compose.yaml` hat kein `replicas:`.
  if (uhr !== undefined) return;
  // `setInterval` und NICHT `setTimeout`: der erste Lauf ist damit um einen VOLLEN Takt
  // VERZOEGERT. Das ist der Kern dieser Entscheidung, siehe §2.7.2.
  uhr = setInterval(() => {
    try {
      const geloescht = raeumeLeihhistorie(getDb());
      if (geloescht > 0) console.info(`[radio] Retention: ${geloescht} Leihe(n) geloescht`);
    } catch (grund) {
      console.error("[radio] Retention fehlgeschlagen:", grund);
    }
  }, MS_PRO_TAG);
  // `unref`, damit ein Skript, das die Suite nur laedt, nicht am Timer haengt.
  uhr.unref?.();
}

/** Haelt den Takt an. Exportiert, weil ein Modulzustand sonst den Test ueberlebt. */
export function stoppeRadioRetentionTakt(): void {
  if (uhr !== undefined) clearInterval(uhr);
  uhr = undefined;
}
```

**Kein Host-Riegel davor.** `files` prüft vor dem Start, ob das Modul konfiguriert ist, weil sein
Arbeiter sonst in eine unbegrenzte Fehlerschleife läuft (`src/app/m/files/_lib/boot.ts:114-129`, an
einem 75-Sekunden-Lauf gemessen). Dieser Takt braucht keine Konfiguration — er braucht nur die Tabelle,
und die existiert nach der Migration immer. Ein Riegel auf `SUITE_HOST_RADIO` wäre hier sogar
**schädlich**: eine vergessene Variable schaltete die Löschrichtlinie still ab. Statt eines Riegels
steht ein `try`/`catch` um den Lauf — **er darf nie werfen**, sonst nimmt er `portal`, `qr`, `feedback`,
`files` und `aufgaben` mit (dieselbe Zusage, die `lagerbuchBootFehler()` in
`src/core/bootstrap.ts` trägt).

### 2.7.2 Ausdrücklich NICHT sofort beim Boot

radio-admin führt `purge()` **sofort** aus, vor dem Tagestimer
(`radio-admin/server/src/services/retentionService.ts:47`), und der Quellkommentar nennt als Anlass
wörtlich „clears any backlog, e.g. straight after a data migration"
(`retentionService.ts:29-30`). **Genau dieser Anlass ist der Grund, es nicht zu tun.** Kommt der Import
mit einem Faktor-1000-Fehler durch (§2.2), liegt jedes `returned_at` im Jahr 1970 — und ein Boot-Purge
löscht die vollständige abgeschlossene Leihhistorie **im selben Moment, in dem der Container zum ersten
Mal hochkommt**, also vor jeder menschlichen Sichtprüfung und vor jeder feldweisen Stichprobe des
Runbooks.

**Die Taktverzögerung IST das Rücknahmefenster.** Ein voller Tag zwischen Deploy und erstem Löschlauf
ist genau die Zeit, in der die Verifikation gegen den ephemeren Container und die Stichproben laufen —
und in der der Rückweg „Router zurück" noch einen intakten Bestand vorfindet. Der Preis ist ein
Rückstand von bis zu 24 Stunden bei den ohnehin gelöschten Zeilen; das ist gegen die DSGVO-Frist von
zwei Monaten kein Betrag.

**Der Test dazu** — `src/app/m/radio/_lib/boot.test.ts`, mit `vi.useFakeTimers()`:

| Test | prüft |
|---|---|
| `starteRadioRetentionTakt loescht beim Start NICHTS` | eine überfällige Leihe steht nach `starteRadioRetentionTakt()` und `vi.advanceTimersByTime(0)` **noch da** — das ist die Regressionssperre gegen den zurückgebauten Sofort-Purge |
| `nach 24 h laeuft der erste Lauf` | dieselbe Leihe ist nach `advanceTimersByTime(MS_PRO_TAG)` weg |
| `zweimaliger Aufruf startet nur einen Timer` | HMR-Idempotenz: nach zwei Aufrufen und einem Takt genau **ein** Lauf |
| `ein Fehler im Lauf wirft nicht aus dem Takt heraus` | eine geschlossene Verbindung erzeugt eine Protokollzeile, keinen `unhandledRejection` |

### 2.7.3 Was passiert, wenn sie nie läuft — und wenn sie zu oft läuft

**Zu oft ist harmlos, der Cutoff ist das Risiko.** In diesen Worten:

* **Nie:** `borrower_name` sammelt sich über die Zwei-Monats-Richtlinie hinaus an. Das ist eine
  **Richtlinien-Abweichung**, kein Funktionsausfall — nichts bricht, keine Anzeige wird falsch, die
  Historie wird nur länger. Feststellbar mit einer Abfrage:
  `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < unixepoch('now','-2 months');`
  Sie gehört als wiederkehrende Prüfung ins Runbook (**Zusage an Spec 2**), weil ein stehengebliebener
  Timer sich nicht von selbst meldet.
* **Zu oft:** nichts Neues wird gelöscht. Der Cutoff ist zeitbasiert und der `DELETE` idempotent; zwei
  Läufe in einer Minute löschen dieselbe leere Menge. Die Kosten sind ein indizierter `DELETE` über
  `loans_returned_at_idx`.
* **Die eigentliche Gefahr ist ein falscher Cutoff**, und sie hat zwei Gestalten: die Einheit (deshalb
  rechnet `retentionGrenze` mit `Date` und nie mit Millisekunden — eine `Date`-Grenze kann keinen
  Faktor 1000 tragen, weil Drizzle die Umrechnung selbst besorgt) und das Vorzeichen. `retentionGrenze`
  ist deshalb **rein und einzeln getestet** (`retention.test.ts`):
  `retentionGrenze auf 2026-08-17 ergibt 2026-06-17` · `eine am Cutoff-Tag zurueckgegebene Leihe
  bleibt` · `eine einen Tag vor dem Cutoff zurueckgegebene Leihe geht` · `eine AKTIVE Leihe bleibt,
  egal wie alt ihr borrowed_at ist`.

**Der Monatsende-Überlauf ist übernommenes Verhalten und wird als solches festgeschrieben.**
`setUTCMonth(getUTCMonth() - 2)` auf dem 30. April ergibt „30. Februar" und normalisiert auf den
**2. März** — der Cutoff wandert also an solchen Tagen bis zu zwei Tage **nach vorn** und löscht ein
wenig mehr, als die Richtlinie wörtlich sagt. Die Quelle rechnet zeichengleich so
(`radio-admin/server/src/services/retentionService.ts:17-21`), und Parität ist hier das stärkere
Argument als arithmetische Eleganz: eine korrigierte Monatsarithmetik ließe im Ziel Zeilen stehen, die
die Alt-App gelöscht hätte, und die Abweichung fiele niemandem auf. Ein fünfter Test hält die
Entscheidung fest, damit sie nicht als Fehler „repariert" wird:
`retentionGrenze auf 2026-04-30 ergibt 2026-03-02 — die Monatsende-Verschiebung der Quelle wird
uebernommen`.

### 2.7.4 Aktive Leihen bleiben, immer

`returned_at IS NULL` ist keine Zeit und fällt nie unter einen Cutoff — auch nicht bei einer
Jahre alten aktiven Leihe. Das ist das Verhalten der Quelle
(`radio-admin/server/src/repos/loanRepo.ts:191-196`: `DELETE FROM loans WHERE returned_at IS NOT NULL
AND returned_at < cutoff`) und wird zeichengleich übernommen. Ein „aufräumen, was zu lange draußen ist"
gibt es nicht und darf hier nicht entstehen: eine verschwundene aktive Leihe ist der Verlust der
Information, wer ein Gerät hat.

## 2.8 Der Importer — `scripts/import/radio.ts`

### 2.8.1 Aufbau und Aufrufform

Muster der beiden vorhandenen Importer (`scripts/import/portal.ts`, `scripts/import/feedback.ts`): reine
Mapping-Funktionen (§2.2.4), eine `importiere…`-Funktion je Tabelle, eine Paritätssicht je Tabelle,
`scripts/import/parity.ts` als Vergleicher. Die Quelle ist **kein NDJSON aus Postgres wie bei `portal`,
sondern die Alt-SQLite selbst** — `radio-admin`s `/data/data.sqlite`, per `better-sqlite3` **lesend**
geöffnet, Spalten **namentlich**, nie `SELECT *`
(`docs/runbooks/lagerbuch-cutover.md:30-31` macht das zur Regel; die vollständigen Spaltenlisten stehen
in §2.5).

Ausdrücklich: **`scripts/import/radio.ts` MUSS committet sein.** Ein Runbook ist nicht ausführbar und
nicht gegenlesbar, und die Mapping-Funktion ist die einzige Stelle, an der der Faktor-1000-Fehler
überhaupt gefangen werden kann. ⚠️ Wie der `lagerbuch`-Import stattdessen ablief, ist aus dem Repo
nicht ableitbar — `scripts/import/` enthält kein `lagerbuch.ts`. Das ist kein Vorbild, dem zu folgen
wäre.

### 2.8.2 Einfügereihenfolge — Pflicht, nicht Stil

`foreign_keys = ON` ist in **beiden** Datenbanken gesetzt (`radio-admin/server/src/db/index.ts:28` und
`src/core/db/index.ts:19`). Die Kante `device_events.device_id → devices.id` bricht also hart ab, wenn
ein Ereignis vor seinem Gerät eingefügt wird.

1. `users`, `software_versions` (frei, keine Abhängigkeit)
2. `devices`
3. `device_events` — **nach** `devices`, erzwungen durch die FK-Kante
4. `loans` — formal frei (kein FK), fachlich nach `devices`
5. `zugangscodes` — **nicht Teil des Imports.** Es gibt in der Quelle nichts, was ihnen entspräche: der
   heutige QR-Mechanismus trägt den einen geteilten API-Token base64-kodiert als URL-Parameter
   (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne Ablauf und
   ohne Widerruf. Es gibt also keine Zeile zu übernehmen, sondern eine **Verhaltensänderung mit
   Ankündigungspflicht** — der erste Satz Codes entsteht in der Suite, ausgestellt von einem
   radio-admin. *Zusage an Kapitel 3 und an Spec 2.*

`api_tokens` fehlt in dieser Liste, und das ist Absicht (§2.10).

### 2.8.3 Sechs Abfragen gegen die Alt-SQLite, **vor** dem Import

Muster `docs/runbooks/lagerbuch-cutover.md:452`, `:544` — dieselbe Zahl vorher und nachher. Diese sechs
gehören ins Runbook (**Zusage an Spec 2**); Nummer 2, 4 und 6 sind **blockierend**:

1. `SELECT COUNT(*) FROM devices;` … `software_versions; … users; … device_events; … loans;` — fünf
   Paritäts-Sollwerte. Dazu `SELECT COUNT(*) FROM api_tokens;` als Protokollzeile (§2.10).
2. **`SELECT COUNT(*) FROM software_versions WHERE is_target = 1;` — MUSS genau 1 sein.** Bei 0 oder 2
   kippt der angezeigte Update-Stand **jedes** Geräts, und keine Parität sieht es (§2.6).
3. `SELECT COUNT(*) FROM device_events e LEFT JOIN devices d ON d.id = e.device_id WHERE d.id IS NULL;`
   — muss 0 sein, sonst scheitert der Import an der FK-Kante.
4. **`SELECT device_id, COUNT(*) FROM loans WHERE returned_at IS NULL GROUP BY device_id HAVING
   COUNT(*) > 1;` — muss leer sein**, sonst lässt sich `loans_device_active_uidx` im Ziel nicht anlegen.
5. `SELECT MIN(created_at), MAX(created_at) FROM devices;` — dreizehnstellig heißt Millisekunden. Die
   empirische Bestätigung von §2.2.1.
6. **Der Riegel aus §2.2.4 wirft — also muss er VOR dem Cutover-Fenster feuern, nicht darin.**
   `msZuDatum` bricht bei jedem Wert außerhalb `[1e12, 4e12]` ab, und Abfrage 5 sieht nur die Spanne
   **einer** Spalte. Diese Abfrage sieht **alle elf** und **muss 0 ergeben** — sie ist blockierend wie
   Nummer 2 und 4:

   ```sql
   SELECT
     (SELECT COUNT(*) FROM devices  WHERE created_at      NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM devices  WHERE updated_at      NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM devices  WHERE last_updated_at IS NOT NULL
                                      AND last_updated_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM device_events     WHERE changed_at   NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM software_versions WHERE created_at   NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM users             WHERE last_seen_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE borrowed_at NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE created_at  NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE updated_at  NOT BETWEEN 1000000000000 AND 4000000000000)
   + (SELECT COUNT(*) FROM loans   WHERE returned_at IS NOT NULL
                                    AND returned_at  NOT BETWEEN 1000000000000 AND 4000000000000)
     AS unplausible_zeitstempel;
   ```

   Ein Treffer ist eine `0`, ein Sekundenwert oder ein Ausreißer in **einer** Zeile — und er ist in der
   Generalprobe eine halbe Stunde Arbeit, im Echtlauf ein Abbruch um 23 Uhr.

Dazu die Zahl, die die Retention-Schätzung ersetzt (Betreiberantwort 4, „< 100" ist ungezählt):
`SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < <cutoff_ms>;` — sie sagt,
wie viele Zeilen der erste Lauf nach 24 Stunden löschen wird, und gehört ins Cutover-Protokoll, **bevor**
er läuft.

### 2.8.4 Idempotenz — der asymmetrische Fall

Beide vorhandenen Importer nutzen Upsert per Primärschlüssel
(`scripts/import/portal.ts:57-63`, `.onConflictDoUpdate({ target: schema.services.id, set: v })`). Ein
Test, der **zweimal dieselbe Quelle** importiert, ist damit immer grün. Der echte Fall geht in **beide**
Richtungen falsch:

* `onConflictDoUpdate` walzt eine Zeile platt, die in der **Suite** nach der Generalprobe entstanden ist.
  Bei `devices` trifft das `update_note`, das append-only ist
  (`radio-admin/server/src/db/schema.ts:33-36`); bei `loans` trifft es `returned_at` — eine in der Suite
  zurückgegebene Ausleihe wird **wieder aktiv** und kollidiert dann mit `loans_device_active_uidx`.
* `onConflictDoNothing` lässt dafür eine in der **Alt-App** geänderte Zeile stehen.

**Die belastbare Lösung ist der Ablauf, nicht die Konfliktstrategie:** Generalprobe gegen eine
Schnappschuss-Kopie, Echtimport gegen eine **leere** Ziel-DB nach dem Freeze. Verbindlich für die vier
Tabellen:

| Tabelle | Strategie | Grund |
|---|---|---|
| `users`, `software_versions`, `devices`, `loans` | `onConflictDoUpdate` per Primärschlüssel | Zielt auf die leere Ziel-DB; der Upsert ist die Sicherung gegen einen abgebrochenen Lauf |
| `device_events` | **`INSERT OR IGNORE`** (`onConflictDoNothing`) | Die Tabelle ist ein **Journal**; ein Upsert ist dort fachlich falsch (`docs/runbooks/lagerbuch-cutover.md:409` unterscheidet genau das) |

⚠️ `scripts/import/portal.ts:105-107` warnt selbst: „parity runs AFTER this (idempotent) write. A thrown
parity error means the target was already mutated … not ‚nothing happened'". Ein roter Paritätscheck ist
also **kein** „es ist nichts passiert" — der Rückweg ist die leere Ziel-DB, nicht ein zweiter Versuch.

## 2.9 Migrationen, das Registrierungs-Dreieck und der Seed

### 2.9.1 Die Dateien unter `_db/`

```
src/app/m/radio/_db/
  schema.ts                      (§2.5)
  client.ts                      (§2.1)
  drizzle.config.ts
  append.test.ts                 (§2.4, Quelltext-Scan gegen einen Loeschweg)
  migrations.test.ts             (§2.6)
  migrations/
    0000_<von drizzle-kit generiert>.sql   sechs Tabellen, sieben Indizes
    0001_loans_aktiv_uidx.sql              der partielle Unique-Index, VON HAND (§2.6)
    meta/                                  drizzle-kit-Snapshot, mit committen
```

```ts
// src/app/m/radio/_db/drizzle.config.ts
// Pfade repo-root-relativ (drizzle-kit loest gegen cwd auf), nicht relativ zu dieser Datei.
import type { Config } from "drizzle-kit";

export default {
  schema: "./src/app/m/radio/_db/schema.ts",
  out: "./src/app/m/radio/_db/migrations",
  dialect: "sqlite",
  dbCredentials: { url: "./.data/radio.db" },
} satisfies Config;
```

⚠️ **Migrationen sind append-only.** Der Hash jeder Datei steht in `__drizzle_migrations`; wird eine
bestehende Datei neu erzeugt, versucht Drizzle sie auf bereits migrierten Datenbanken erneut anzuwenden
und der Container läuft in eine Absturzschleife. Das hat in radio-admin **einmal die Produktion
lahmgelegt** (`radio-admin/CLAUDE.md`, Abschnitt „Datenbank-Migrationen — APPEND-ONLY (kritisch)"). Der
Name der generierten `0000` wird von `drizzle-kit` gewürfelt und **nicht** nachträglich umbenannt.

### 2.9.2 Die drei Ecken

**Ecke 1 — Migrationsverzeichnis:** `src/app/m/radio/_db/migrations` (oben).

**Ecke 2 — `MODULE_MIGRATIONS` in `src/core/bootstrap.ts`**, hinter `aufgaben`:

```ts
  // radio: bewusst OHNE Schema-Import und OHNE Seed in `seedAllModules()`. Der
  // Schema-Import waere toter Code (`migrateAllModules()` migriert schema-frei), und der
  // Seed-Ausschluss hat denselben harten Grund wie bei `files`: `shouldSeed()` ist bei
  // `SUITE_SEED=1` auch in der GENERALPROBE wahr, und eine geseedete Zeile in
  // `zugangscodes` ist ein gueltiger ANONYMER SCHREIBZUGANG — jemand kann damit ohne
  // Anmeldung Geraete ausleihen und zurueckgeben. Das lokale Seed-Skript deckt den
  // Entwicklungsbetrieb vollstaendig ab.
  { key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" },
```

**Ecke 3 — `COPY`-Zeile im `Dockerfile`**, hinter der `aufgaben`-Zeile (`Dockerfile:56`):

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/radio/_db/migrations ./src/app/m/radio/_db/migrations
```

Fehlt die dritte Ecke, **läuft es lokal und bricht im Container** — `bootstrap.test.ts` prüft das
Dreieck über beide Listen.

### 2.9.3 `startBackgroundWork()`

```ts
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  starteAufgabenScanArbeiter();
  // Taegliche Retention der Leihhistorie. Erster Lauf um einen VOLLEN Takt verzoegert
  // (§2.7.2) und wirft nie — ein Wurf hier naehme alle anderen Module mit.
  starteRadioRetentionTakt();
}
```

Kein Eintrag in `assertHostConfig()`: `radio` hat keine modul-eigene Boot-Prüfung. Die Host-Prüfung
leistet `validateHostConfig`/`validateGroupConfig` über die Registry.

### 2.9.4 Der lokale Seed — Pflicht, nicht Kür

`scripts/seed-lokal.test.ts:41-42` verlangt **Gleichheit der Schlüsselmengen** von `SEED_MODULE` und
`MODULE_MIGRATIONS`. Ein Eintrag in `MODULE_MIGRATIONS` ohne `seedLokal…` ist damit ein **roter Test**,
keine stille Auslassung. Also beides:

```ts
// scripts/seed-lokal.ts — Importe
import * as radioSchema from "@/app/m/radio/_db/schema";
import { seedLokalRadio } from "@/app/m/radio/_lib/seedLokal";

// scripts/seed-lokal.ts — SEED_MODULE, hinter `aufgaben`
  { key: "radio", lauf: () => seedLokalRadio(getModuleDb("radio", radioSchema)) },
```

`seedLokalRadio` ist **idempotent pro Entität** (nicht ein gemeinsames Gate: ein abgebrochener Lauf
ergänzt sich beim nächsten Aufruf selbst) und **rein additiv** (`.data/` enthält lokal gewachsene
Daten). Inhalt, gerade so viel, dass jede Fläche ohne Handarbeit sichtbar ist:

* **drei Softwareversionen**, davon **genau eine** mit `isTarget: true` — sonst zeigt die
  Verwaltungsliste einen Update-Stand, den §2.6 als unbestimmt beschreibt;
* **acht Geräte**: ausleihbar/nicht ausleihbar, mit und ohne `tei`, eines mit `updateNote`, eines mit
  einem Rufnamen mit Umlaut (**„Mühlheim 1/83"**) — ohne Umlaut-Testdaten sieht kein Test, dass die
  Suchfaltung fehlt (`radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31`);
* **je eine aktive und drei zurückgegebene Leihen**, eine davon mit `returnedAt` **älter als zwei
  Monate**, damit der Retention-Lauf lokal überhaupt etwas zu tun hat;
* **zwei `zugangscodes`**: einer `aktiv`, einer gesperrt mit `gesperrtAm`/`gesperrtVon` — die
  Verwaltungsliste muss beide Zustände zeigen können;
* **eine `users`-Zeile** auf den `sub` des Dev-Kontos, damit Auditspalten einen Namen auflösen.

Das Protokoll nennt den erzeugten Code im Klartext — wie bei den übrigen Modulen, das ist der Zweck des
Skripts.

⚠️ **`seedAllModules()` bekommt KEINE `radio`-Zeile**, und `src/core/bootstrap.ts` bekommt **keinen**
`radio`-Schema-Import. Beides ist oben im Kommentar begründet und wird von
`scripts/seed-lokal.test.ts:56` (Quelltext-Scan gegen die Namen `seedLokal`/`seed-lokal` in
`bootstrap.ts` und `instrumentation.ts`) zusätzlich gehalten — er fängt die naheliegende Verdrahtung,
nicht jede denkbare.

## 2.10 Was NICHT wandert

**1. `api_tokens` — die ganze Tabelle.** Entscheidung 13: produktiv trägt sie genau **einen**
Konsumenten, den Alt-Kiosk mit statischem `RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3), und der
verschwindet mit dem Port. Gemessen: `rg -n 'api_tokens|apiTokens' radio-admin/server/src
--glob '!*.test.ts'` liefert 17 Treffer, **alle** in `db/schema.ts` und `repos/apiTokenRepo.ts` — keine
andere Tabelle referenziert `api_tokens.id`, es gibt keine Auditkante, keine Historie hängt daran.
`created_by` ist zusätzlich eine tote Spalte (geschrieben `apiTokenRepo.ts:50`, in `listApiTokens`
`:79-86` nicht gelesen). Der Klartext ist nie gespeichert, eine mitgenommene Zeile wäre also ohnehin
nicht einlösbar. **Ersatz statt Migration:** vor dem Archivieren des Volumes wandert
`SELECT id, name, prefix, created_at, last_used_at, revoked_at FROM api_tokens;` als Textausgabe ins
Cutover-Protokoll, und der Volume-Schnappschuss steht die zwei Wochen Standby ohnehin
(**Zusage an Spec 2**). Damit ist nichts vernichtet und keine Tabelle ohne Leser gebaut.

**2. `AdminUser` aus radio-inventar — und damit der gesamte Postgres.** Entscheidung 14. Im
Pocket-ID-Betrieb schreibt der OIDC-Weg nicht in die Tabelle, sondern baut die Kennung als
`pocketid:${sub}` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Die
Suite führt den **rohen** `sub`; der Präfix verschwindet. Der Kiosk hält ohnehin keine eigenen Geräte-
oder Leihdaten — radio-admin ist das führende System und der Kiosk schreibt über die S2S-Leih-API durch
(`radio-admin/server/src/db/schema.ts:101-103`). Es gibt also **nichts** aus Postgres zu übernehmen.

**3. `prisma/create-session-table.sql`.** Erzeugt eine Tabelle **außerhalb** der Prisma-Migrationen und
wird von nichts ausgeführt — kein Import, kein Dockerfile-Schritt, kein `package.json`-Script
(`rg -rn "create-session-table" radio-inventar/apps/backend` → leer). Es gibt nach Codelage keinen
Postgres-Sitzungsspeicher. ⚠️ Methodenhinweis, nicht Baufalle: aus einem Repository lässt sich der
Prod-Tabellenbestand grundsätzlich nicht ableiten; `pg_tables` ist die einzige verlässliche Quelle. Das
betrifft das **Schließen** des Postgres (Spec 2), nicht dieses Schema.

**4. Die Weiterleitungs- und Setup-Mechanik des Kiosk.** `prisma.adminUser.count()`
(`radio-inventar/apps/backend/src/modules/setup/setup.repository.ts:17`) trägt einen Setup-Status, an
dem zwei harte Client-Weiterleitungen hängen (`apps/frontend/src/routes/__root.tsx:89-91`, `:100-112`).
Ohne `AdminUser` ist der Alt-Kiosk **vollständig unbenutzbar** — das ist der Grund, warum es **kein
Parallelfenster** gibt (Entscheidung 3) und der Rückweg „Router zurück" heißt. In `radio.db` entsteht
dafür **keine** Statuszeile und **keine** Setup-Tabelle: die Suite hat kein Erstinbetriebnahme-Gate,
und ein nachgebautes wäre eine zweite Sperre ohne Träger.

**5. Zwei tote Spalten — mit unterschiedlichem Ergebnis.** `software_versions.created_by` **wandert**
(§2.5.2): sie ist geschrieben, es gibt Werte, und eine weggelassene Spalte macht einen vorhandenen Wert
unwiederbringlich. `api_tokens.created_by` wandert nicht, weil die ganze Tabelle nicht wandert. Das
Unterscheidungskriterium ist **„wird sie geschrieben?"**, nicht „wird sie gelesen?" — ein Leser lässt
sich nachbauen, ein verlorener Wert nicht.

**6. Kein Fremdschlüssel wird nachgezogen.** Weder auf `loans.device_id` noch von einer Auditspalte auf
`users.sub` (§2.3). Ein zusätzlicher FK ist gültiges Drizzle, gültiges SQL und **paritätsgrün**; der
Schaden entsteht Monate später, bei der ersten Geräteausmusterung.

## 2.11 Zusagen und Tests dieses Kapitels

**Zusagen an andere Kapitel** (die Zusammenführung prüft sie gegeneinander):

| # | Zusage | an |
|---|---|---|
| 1 | Die Suchfaltung bleibt in JavaScript; deshalb reicht `getModuleDb` und es gibt keinen eigenen Opener. Wird die Suche in SQL gezogen, kippt §2.1. | Kapitel 3 · das Kapitel der Geräte-Übersicht und Rückgabesuche |
| 2 | `zugangscodes` ist die **einzige** neue Tabelle. Der Weg „angemeldet über die Suite" schreibt in ihr **nichts**. | Kapitel 3 |
| 3 | `code` wird zeichengleich gespeichert, nie normalisiert, keine Collation. Länge und Alphabet entscheidet Kapitel 3; das Schema schreibt kein Format vor. | Kapitel 3 |
| 4 | Die Sitzungsdauer hat **keine** Spalte — Ablauf im Cookie, Sperrung in `zugangscodes.aktiv`. Der Riegel schlägt über `zugangscodes.id` nach. | Kapitel 3 |
| 5 | Es gibt **keinen** Löschweg auf `zugangscodes`; Kapitel 3 baut die Sperrung (`aktiv`, `gesperrtAm`, `gesperrtVon`). | Kapitel 3 |
| 6 | `devices.last_updated_at` ist `string \| null` im Format `YYYY-MM-DD`. Formular und CSV-Export arbeiten mit der Zeichenkette, nie mit einem Zeitstempel. | das Kapitel der Geräteverwaltung an `/admin` |
| 7 | `loans` bekommt **keine** Spalte für den Zugangsweg. Wird sie gebraucht, ist das eine additive Migration `0002`. | das Kapitel der Ausleihliste an `/admin` |
| 8 | Die sechs Vorab-Abfragen aus §2.8.3 (Nr. 2, 4 und 6 blockierend), die Zählung der Retention-Kandidaten und der `api_tokens`-Auszug gehören ins Runbook. | Spec 2 |
| 9 | Der erste Satz `zugangscodes` entsteht in der Suite und wird nicht importiert — Verhaltensänderung mit Ankündigungspflicht. | Kapitel 3 · Spec 2 |
| 10 | `STALE_GRACE_MS` braucht in `radio.db` keine Spalte, keine Tabelle und kein Zwischenspeicher-Artefakt; das Verhalten selbst gehört ins Fachkapitel. | das Kapitel für Ausleihe, Rückgabe, Historie |
| 11 | Die Vorbelegung des Entleihernamens ist eine Formularfrage; `borrower_name` bleibt `notNull`, es entsteht keine Spalte und keine Verbindung zur Auth.js-Identität. | Kapitel 3 |

**Voraussetzung außerhalb dieses Kapitels:** die CWE-348-Umstellung in `core/ratelimit.ts`. Sie ist
**nicht** Teil dieser Spec, aber der Einlöse-Endpunkt aus Kapitel 3 hängt daran — und ohne
Ratenbegrenzung ist ein sechsstelliger Code ratbar.

**Neue Dateien dieses Kapitels:**

```
src/app/m/radio/_db/schema.ts · client.ts · drizzle.config.ts
src/app/m/radio/_db/migrations/0000_<generiert>.sql · 0001_loans_aktiv_uidx.sql · meta/
src/app/m/radio/_db/migrations.test.ts · append.test.ts
src/app/m/radio/_lib/boot.ts · boot.test.ts · retention.test.ts
src/app/m/radio/_lib/seedLokal.ts
scripts/import/radio.ts · scripts/import/radio.test.ts · scripts/import/fixtures/radio-*.json
```

**Geänderte Dateien:** `src/core/bootstrap.ts` (`MODULE_MIGRATIONS` + `startBackgroundWork`) ·
`Dockerfile` (eine `COPY`-Zeile) · `scripts/seed-lokal.ts` (zwei Importe + eine `SEED_MODULE`-Zeile).

**Die Tests dieses Kapitels, gesammelt:** `scripts/import/radio.test.ts` (11 Tests, §2.2.5) ·
`_db/migrations.test.ts` (4 Tests, §2.6) · `_db/append.test.ts` (1 Quelltext-Scan, §2.4) ·
`_lib/boot.test.ts` (4 Tests mit Fake-Timern, §2.7.2) · `_lib/retention.test.ts` (5 Tests, §2.7.3).
Die drei, ohne die dieses Kapitel keinen Schutz hat, sind
`toNeuesGeraet: jedes Zeitfeld behaelt SEINEN Wert in Millisekunden`,
`zwei aktive Leihen auf dasselbe Geraet werden abgewiesen` und
`starteRadioRetentionTakt loescht beim Start NICHTS`.

---

# 3. Der Ausleih-Code, die Sitzung und die zwei Rechteebenen

Dieses Kapitel legt fest, wie eine Person überhaupt an die Ausleihe kommt, und wie eine Person an die
Verwaltung kommt. Es ist die einzige Stelle der Spec, an der eine Zugangsentscheidung getroffen wird;
jede Fläche, jede Server Action und jeder Route Handler aus den anderen Kapiteln ruft eine der hier
benannten Funktionen als **erste Anweisung**.

**Zur Benennung — drei Nummerierungen kollidieren.** Die Konvention der Analyse
(`docs/radio-portierung-analyse.md:1189-1194`) gilt hier unverändert: „**Suite-Falle N**" meint die
zwölf Fallen aus `CLAUDE.md`; „**Falle N (lagerbuch-Zählung)**" meint
`docs/lagerbuch-portierung-analyse.md`; ein Verweis auf einen Eintrag der Portierungsanalyse heißt
ausgeschrieben „**Eintrag N aus Kapitel 5 der Analyse**". Eine nackte Zahl gibt es in diesem Kapitel
nicht.

**Das Vorbild ist produktiver Suite-Code, kein Entwurf.** Portiert wird das Helfer-Muster aus
`lagerbuch`: `src/app/m/lagerbuch/_lib/helferSitzung.ts`,
`src/app/m/lagerbuch/_lib/helferZugang.ts`, `src/app/m/lagerbuch/_lib/gateSchranke.ts`,
`src/app/m/lagerbuch/_lib/gateTexte.ts`, `src/app/m/lagerbuch/_lib/code.ts`,
`src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts`,
`src/app/m/lagerbuch/t/[code]/route.ts`, `src/app/m/lagerbuch/abmelden/route.ts`,
`src/app/m/lagerbuch/_actions/gate.ts`, `src/app/m/lagerbuch/helfer/layout.tsx`,
`src/app/m/lagerbuch/_lib/zugang.ts`, `src/app/m/lagerbuch/_lib/host.ts`. Wo `radio` abweicht, steht
der Grund dabei — **eine Abweichung ohne Grund ist ein Fehler, und eine übernommene Abweichung ohne
ihren Grund ebenfalls.**

---

## 3.1 Die Dateien, die entstehen

| Datei | Inhalt | Abschnitt |
|---|---|---|
| `src/app/m/radio/_lib/host.ts` | `istRadioHost`, `requireRadioHost`, `radioHostOderNull` | 3.6.2 |
| `src/app/m/radio/_lib/code.ts` | `CODE_ALPHABET`, `erzeugeCode`, `normalisiereCode`, `istCodeForm` | 3.2.1 |
| `src/app/m/radio/_lib/ausleihSitzung.ts` | `AUSLEIH_COOKIE`, `AusleihPayload`, `createAusleihSitzung`, `verifyAusleihSitzung`, `ausleihCookieOptionen`, `ausleihGueltigkeitSekunden` | 3.4 |
| `src/app/m/radio/_lib/ausleihZugang.ts` | `AusleihZugang`, `SperrGrund`, `ausleihZugangOderNull`, `requireAusleihZugang`, `requireAusleihSchreibend` | 3.5.1 |
| `src/app/m/radio/_lib/zugang.ts` | `Viewer`, `viewerAusSession`, `viewerOderNull`, `istRadioAdmin`, `requireRadioAdmin`, `verwaltungsZiel` | 3.6.1 |
| `src/app/m/radio/_lib/gateSchranke.ts` | `gateGesperrt`, `gateFehlversuchBuchen` | 3.7.2 |
| `src/app/m/radio/_lib/gateTexte.ts` | `GateGrund`, `GATE_GRUENDE`, `istGateGrund`, `gateMeldung` | 3.3.4 |
| `src/app/m/radio/_lib/returnTo.ts` | `sanitizeReturnTo` | 3.3.5 |
| `src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts` | `loeseCodeEin` | 3.3.2 |
| `src/app/m/radio/t/[code]/route.ts` | GET, 303, Cookie — der gescannte QR | 3.3.2 |
| `src/app/m/radio/abmelden/route.ts` | GET, 303, Cookie-Löschung | 3.4.5 |
| `src/app/m/radio/_actions/gate.ts` | `einloesenAmGate` (`useActionState`) | 3.3.3 |
| `src/app/m/radio/_actions/sitzung.ts` | `beenden` (freiwillige Abmeldung, POST) | 3.4.5 |
| `src/app/m/radio/_actions/codes.ts` | `erstelleCode`, `setzeCodeAktiv` | 3.2.3, 3.2.4 |
| `src/app/m/radio/(ausleihe)/layout.tsx` | ein Aufruf: `requireAusleihZugang(getDb())` | 3.5.5 |
| `src/app/m/radio/admin/layout.tsx` | ein Aufruf: `requireRadioAdmin()` | 3.6.1 |

**KEINE dieser `_lib`-Dateien trägt `"use client"` — Suite-Falle 6.** Server Components und Route
Handler lesen hier Werte; ein `WERT` aus einem Client-Modul kommt in einer Server Component nicht an
(HTTP 500 für die ganze Seite), und `pnpm build` wie Vitest sind dafür strukturell blind. Jede der
zwölf lagerbuch-Vorlagen trägt den Satz im Dateikopf; er wandert mit.

Vier Env-Einträge kommen dazu, in `src/app/m/radio/_lib/grenzen.ts` (Muster
`src/app/m/lagerbuch/_lib/grenzen.ts:73-86`, mit `min`/`max`/`vorgabe` je Eintrag):

| Variable | Einheit | min | max | Vorgabe |
|---|---|---|---|---|
| `RADIO_AUSLEIH_SITZUNG_STUNDEN` | Stunden | 1 | 24 | **12** (zu bestätigen, 3.4.3) |
| `RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN` | Anzahl/min | 1 | 60 | 5 |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN` | Anzahl/min | 1 | 600 | 30 |
| `RADIO_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` | Anzahl/h | 1 | 3600 | 300 |

Dazu das Geheimnis `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS` (Pflicht, keine Vorgabe). **Es wird in einem
Thunk gelesen, nicht auf Modulebene** — `const SCHLUESSEL = new TextEncoder().encode(...)` am
Dateikopf bricht `pnpm build`, weil `next build` mit `NODE_ENV=production` und **ohne** Secrets läuft
und Modulebene auswertet (`src/app/m/lagerbuch/_lib/helferSitzung.ts:39-49` schreibt denselben Befund
aus). Die vier Zahlen dürfen dagegen auf Modulebene stehen: sie haben alle eine Vorbelegung
(`src/app/m/lagerbuch/_lib/gateSchranke.ts:8-21`).

---

## 3.2 Der Code

### 3.2.1 Gestalt: 28 Zeichen Crockford-Base32, in sieben Gruppen

**Kanonische Form: `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`**, 28 Zeichen aus dem
Crockford-Base32-Alphabet, in sieben Gruppen von vier, mit Bindestrichen. Beispiel:
`A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW`. **Der Bindestrich ist Teil des
gespeicherten Werts**, nicht der Anzeige — genauso wie in `lagerbuch`
(`src/app/m/lagerbuch/_db/schema.ts:379-383`: „sechs Ziffern MIT Bindestrich … die Suche ist exakt").

```ts
/** 32 Zeichen. Crockford-Base32: OHNE I, L, O, U. */
export const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
```

**Warum nicht sechs Ziffern wie `lagerbuch`.** `lagerbuch`s Coderaum ist auf einen Menschen
zugeschnitten, der zu Schichtbeginn am Regal steht und eintippt (`_lib/code.ts:11-14`: „Eine
Bereitschaft, die zu Schichtbeginn von Hand eintippt"). Bei `radio` **scannt** die Person
(Betreiberantwort 5) — es gibt kein Gerät und keinen Ort, an dem Handeingabe der Regelweg ist. Damit
entfällt der einzige Grund für einen kurzen Code, und der lange Code wird zur tragenden
Sicherheitsmaßnahme (Rechnung in 3.7.1).

**Warum Crockford-Base32 und nicht Hex oder Base64url — das ist die Antwort auf
Verwechslungsfestigkeit, und sie kostet keine Entropie:**

* **`I`, `L`, `O`, `U` fehlen im Alphabet.** `1`/`I`/`l`, `0`/`O` und das versehentlich gelesene `U`
  sind damit konstruktiv nicht verwechselbar. Base64url kann das nicht (`I` und `l` liegen beide
  drin), Hex kann es nur durch einen viel längeren String.
* **`normalisiereCode` bildet zurück**, statt zu verwerfen: `I`→`1`, `L`→`1`, `O`→`0`. Wer von einem
  Ausdruck abliest und `O` statt `0` tippt, bekommt einen Treffer, keinen Fehler.
* **Groß-/Kleinschreibung ist gleichgültig** (`toUpperCase()` vor der Suche).
* 28 Zeichen × 5 bit = **140 bit Entropie**. Die Zahl ist nicht gegriffen: sie ist die kleinste
  Vielfache-von-vier-Länge über der 128-bit-Schwelle, die
  `docs/radio-portierung-analyse.md:476-480` als Bedingung (1) nennt (24 Zeichen wären 120 bit und
  rissen sie, 26 träfen 130 bit und brächen die Vierergruppierung). Was die Länge kostet, ist der
  **Ausweichweg** Handeingabe, nicht der Regelweg Scan — und 34 Zeichen mit Bindestrichen sind ein
  WLAN-Passwort, kein Hindernis.

```ts
/** Kryptografisch, NICHT `Math.random`. 28 Zeichen aus CODE_ALPHABET, gruppiert. */
export function erzeugeCode(): string;

/**
 * Eingabe → Erzeugerform. WIRFT NIE (der Wert kommt aus einer URL oder einem
 * Formularfeld; ein Wurf machte aus einem Tippfehler einen 500 im Route Handler).
 * Reihenfolge: trim → toUpperCase → I/L→1, O→0 → alles außer [0-9A-Z] entfernen →
 * bei genau 28 Zeichen in sieben Vierergruppen setzen, sonst unverändert zurück.
 */
export function normalisiereCode(roh: string): string;

/** Praedikat auf die kanonische Form. Fuer die Formularvalidierung in Kapitel 5. */
export function istCodeForm(wert: string): boolean;
```

**Die Normalisierung darf nur Treffer hinzufügen, nie einen bestehenden verlieren** — genau deshalb
ist sie sicher (`src/app/m/lagerbuch/_lib/code.ts:4-8`). Die Suche läuft auf **Gleichheit** gegen
`ausleih_codes.code`; die Spalte wird nicht aufgeweicht.

**`erzeugeCode` benutzt `crypto.randomUUID`/`crypto.getRandomValues`, nie `Math.random`.** Kein Gate
sieht den Unterschied: `Math.random()` ist typkorrekt, liefert 16 plausible Zeichen und besteht jeden
Formattest — die Vorhersagbarkeit ist erst mit Kenntnis mehrerer ausgestellter Codes messbar. Der
Unit-Test dagegen kann es (3.8, `code.test.ts`, „Alphabet ohne I/L/O/U" und „zwei Aufrufe sind
verschieden" fangen es nicht; der **Quelltext-Scan** auf `Math.random` fängt es).

**QR-Nutzlast ist die vollständige äußere URL:** `https://radio.iuk-ue.de/t/A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW`.
Kein Parameter, kein Base64, kein Token im Query-String — genau der Mechanismus, der nach
Entscheidung 8 ausgeschlossen ist
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23` setzt heute
`url.searchParams.set('token', btoa(token))` mit dem Kommentar „Base64-encode the token to avoid
plaintext exposure in URLs"; Base64 ist keine Verschleierung). Ein Pfadsegment statt eines Parameters
hat zwei nachprüfbare Vorteile: es steht nicht im `Referer` einer weiterführenden Anfrage, und der
Wert wird nach der Einlösung durch den 303 aus der Adresszeile **entfernt** — nach dem Redirect steht
dort `/`, nicht mehr der Code.

### 3.2.2 Die Tabelle `ausleih_codes` — Vorgabe an das Datenmodell

**Zusage an Kapitel 2 (Datenmodell, Schema, Migration, Import) — Teil 1 von 2.** Dieses Kapitel
verlangt genau eine neue Tabelle. Sie hat **kein** Gegenstück im Altbestand (`radio-inventar` führt
über alle fünf Migrationen hinweg nur `Device`, `Loan`, `AdminUser` —
Analyse `docs/radio-portierung-analyse.md:230-233`), wird also **nicht importiert, sondern angelegt.**

| Spalte | Typ | Anmerkung |
|---|---|---|
| `id` | `text` PK | **Steckt im Cookie jeder laufenden Sitzung — wird nie neu vergeben.** |
| `code` | `text` NOT NULL **UNIQUE** | kanonische Form aus 3.2.1. Nie umkodiert, nie normalisiert. |
| `bezeichnung` | `text` NOT NULL | Anzeigename („Funkraum Wache", „Aufsteller MTW 1"). Der Code allein sagt niemandem etwas. |
| `aktiv` | `integer` (`mode: "boolean"`) NOT NULL DEFAULT true | **der einzige Widerruf, den es gibt** |
| `created_at` | `integer` (`mode: "timestamp"`) NOT NULL | Sekunden, wie jedes Suite-Modul |
| `created_by` | `text` NOT NULL | **roher** OIDC-`sub`, **ohne** `pocketid:`-Präfix (gesetzte Entscheidung 14) |
| `last_used_at` | `integer` (`mode: "timestamp"`) NULL | NULL = „nie eingelöst". Reines Anzeigefeld, ohne Einfluss auf Gültigkeit. |

**Ausdrücklich NICHT übernommen: `zielTyp`/`zielId`.** `lagerbuch`s Token trägt ein hinterlegtes Ziel
und ist dafür „BEWUSST POLYMORPH, OHNE FK" (`src/app/m/lagerbuch/_db/schema.ts:397-401`, samt
ausgeschriebenem Waisenrisiko). `radio` hat **eine** Ausleihfläche und keine Zuordnung von Codes zu
Fahrzeugen; ein naiver Port schleppte zwei Spalten samt Waisenrisiko mit, die niemand liest.
Ebenfalls nicht übernommen: `scope_lagerort_id` (in `lagerbuch` eine tote Spalte, dort nur aus
Import-Gründen erhalten — `schema.ts:386-395`).

**Zusage an Kapitel 2 — Teil 2 von 2, und sie ist die Hälfte der Begründung aus 3.2.4:** `loans`
bekommt eine Spalte `ausleih_code_id text NULL REFERENCES ausleih_codes(id)` — **ohne** `ON DELETE
CASCADE` und ohne `ON DELETE SET NULL`. Sie ist NULL für alle importierten Alt-Leihen und für jede
Leihe über den Suite-Weg (3.5). Sie ist **nicht** die Identität des Ausleihenden (der Vorgang bleibt
anonym, 3.5.4), sondern die Herkunft des Zugangs: „diese Leihe entstand über den Aufsteller im
Funkraum". Über sie löst die Anzeige `bezeichnung` auf.
⚠️ Das ist **nicht** derselbe Fall wie der Fremdschlüssel auf `loans.device_id`, der nach Eintrag 3
aus Kapitel 5 der Analyse die Ausleih-Historie zerstört: dort zeigt der FK auf eine Tabelle, aus der
**ausgemustert** wird. Aus `ausleih_codes` wird nach 3.2.4 **niemals gelöscht** — der Zeiger kann
konstruktiv nicht ins Leere fallen. Wer 3.2.4 aufweicht, holt Eintrag 3 zurück.

### 3.2.3 Ausstellung

```ts
// src/app/m/radio/_actions/codes.ts
"use server";
export async function erstelleCode(bezeichnung: string): Promise<{ code: string }>;
```

Erste Anweisung: `const viewer = await requireRadioAdmin();` (3.6.1). Danach `erzeugeCode()`,
`created_by = viewer.sub`, `aktiv = true`, `created_at = new Date()`. Der erzeugte Code wird
**einmal** zurückgegeben und danach in der Verwaltungsliste im Klartext angezeigt und gedruckt — er
ist kein Einmalgeheimnis, sondern ein Dauerausweis (3.2.4).

**Kollisionsbehandlung, ausgeschrieben, weil sie sonst als „kann nicht passieren" wegfällt:** der
`UNIQUE`-Index auf `code` ist der Riegel; bei einem Konflikt wird **einmal** neu erzeugt und erneut
eingefügt, bei einem zweiten Konflikt bricht die Action mit einem benannten Fehler ab. Bei 140 bit
ist der zweite Konflikt kein Betriebsfall, sondern ein Hinweis darauf, dass `erzeugeCode` nicht
zufällig ist — und genau deshalb darf er nicht still in einer Schleife verschwinden.

Wer ausstellen darf: **nur `radio`-Admins** (gesetzte Entscheidung 7). Keine zweite Rechtestufe,
keine Zugehörigkeitsprüfung zwischen Verwaltenden; `created_by` ist Nachweis und Anzeige, nie
Berechtigung (Vorbild `src/app/m/lagerbuch/_lib/zugang.ts:82-86`).

### 3.2.4 Sperrung — und warum es keine Löschung gibt

```ts
// src/app/m/radio/_actions/codes.ts
export async function setzeCodeAktiv(codeId: string, aktiv: boolean): Promise<void>;
```

Erste Anweisung: `await requireRadioAdmin();`. Ein `UPDATE` auf `aktiv`. **Es gibt keine
Löschfunktion — nicht in der Action-Datei, nicht in der Oberfläche, nicht als „Aufräumen" im
Betrieb.** Die Begründung steht hier ausgeschrieben, weil sie sonst beim ersten Aufräum-Ticket
verlorengeht:

1. **Ein gelöschter Code gibt seinen `code`-Wert frei.** Der `UNIQUE`-Index verhindert nur die
   *gleichzeitige* Doppelvergabe. Nach einer Löschung kann `erzeugeCode()` denselben Wert
   theoretisch erneut ziehen, und — praktisch viel wichtiger — eine Adminin kann ihn bei einer
   Wiederherstellung von Hand erneut eintragen.
2. **Der Code ist der Anzeigeschlüssel der Leihhistorie.** Über `loans.ausleih_code_id` löst die
   Anzeige `bezeichnung` auf (3.2.2). Fällt die Zeile weg und kommt der Wert an einem später
   ausgestellten Kärtchen zurück, **erscheinen historische Journalzeilen unter dem neuen Label** —
   „Aufsteller MTW 1" für Leihen, die im Funkraum entstanden sind. Das ist keine Anzeige-Kosmetik,
   sondern eine falsche Auskunft über einen abgeschlossenen Vorgang.
3. **Die zwei Hälften tragen nur zusammen.** „Nie löschen" ohne den Verweis in `loans` wäre eine
   Regel ohne Schaden; der Verweis in `loans` ohne „nie löschen" wäre der Fremdschlüssel aus
   Eintrag 3 in Kapitel 5 der Analyse. Beides oder nichts.

⚠️ **`lagerbuch` ist hier ausdrücklich KEINE Präzedenz, sondern der Gegenfall.** Dort ist
`lastUsedAt` „reines Anzeigefeld, OHNE Einfluss auf Gueltigkeit und (nach Entscheidung 8-F) auch
**ohne Einfluss auf Loeschbarkeit**" (`src/app/m/lagerbuch/_db/schema.ts:412-413`), und
`src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts` streicht die gegenteilige Begründung
ausdrücklich als „NICHT MEHR GUELTIG". Wer `lagerbuch` als Beleg für „nicht löschbar" zitiert, zitiert
falsch. `radio`s Grund ist ein eigener und steht in den Punkten 1–3.

**Die Sperrung wirkt binnen des nächsten Aufrufs, lesend wie schreibend** — das ist der
DB-Recheck aus 3.5.1. Ohne ihn liest ein gesperrter Code bis zum Ablauf der Sitzung weiter den
gesamten Gerätebestand (`src/app/m/lagerbuch/_lib/helferZugang.ts:17-25` schreibt genau diese
Erwägung aus).

**Was bei einem verlorenen Code passiert** — der Fall, der Betreiberantwort 6 ersetzt hat („was
passiert, wenn ein QR-Code in falsche Hände gerät"): `aktiv = false`, ein Klick. Kein anderer Code
ist betroffen, kein Geheimnis wird rotiert, kein zweiter Aufsteller muss neu bedruckt werden. Heute
ist derselbe Vorfall die Rotation **des einen** `API_TOKEN` auf **jedem** Gerät
(`docs/radio-portierung-analyse.md:235-238`).

### 3.2.5 Wer darf was — die Tabelle

| | Code ausstellen | Code sperren | Codes ansehen (Klartext) | Ausleihen / zurückgeben |
|---|---|---|---|---|
| anonym, ohne Code | – | – | – | – |
| anonym, mit gültigem Code | – | – | – | **ja** |
| angemeldet, Suite-Sitzung | – | – | – | **ja** |
| angemeldet, `radio`-Admin | **ja** | **ja** | **ja** | ja |

Die dritte Spalte ist der Grund, warum die Verwaltung nicht am Suite-Betreiberflag hängt (3.6.1): die
Codeliste **ist** das Geheimnis.

---

## 3.3 Das Gate — wie ein Code zur Sitzung wird

### 3.3.1 Drei Flächen, dieselben Riegel in derselben Reihenfolge

Es gibt genau drei Stellen, die eine Ausleih-Sitzung ausstellen. Alle drei tragen dieselben sechs
Schritte in derselben Reihenfolge (Vorbild `src/app/m/lagerbuch/_actions/gate.ts:19-22`):

1. **Host-Riegel** (3.6.2) — vor allem anderen
2. **`gateGesperrt(absender)`** — Sperrzeit lesen, **ohne** Datenbankzugriff
3. **`normalisiereCode(...)`** — als eigene Anweisung, nicht inline
4. **`loeseCodeEin(code, db)`** — Treffer und `aktiv` in einem Doppeltest
5. bei Erfolg: Cookie setzen, 303/`redirect` — **kein** Budgetverbrauch
6. bei Misserfolg: `gateFehlversuchBuchen(absender)`, benannter Grund

Zu Schritt 3: **`normalisiereCode` steht als eigene Anweisung da, nicht inline im Einlöseaufruf.**
Das ist keine Formatierungsfrage — der Reihenfolge-Scan vergleicht **Textpositionen**, und in
`loeseCodeEin(normalisiereCode(x), db)` steht `loeseCodeEin(` textlich **vor** `normalisiereCode(`;
der Scan meldet dann „Einlösung steht VOR normalisieren" für eine Datei, die sachlich richtig ist
(gemessen in `lagerbuch`, `src/app/m/lagerbuch/t/[code]/route.ts:69-76`).

### 3.3.2 Der gescannte Code: ein Route Handler, kein Server Action

**`src/app/m/radio/t/[code]/route.ts` — `GET`, äußerer Pfad `/t/<code>`.**

**Warum Route Handler und nicht Server Action:** ein gescannter QR-Code ist ein **GET aus der
Adresszeile**. Eine Server Action ist ein POST auf eine React-Referenz und aus einem Kamera-Scan
nicht auslösbar. Es gibt hier keine Wahl, sondern nur die Frage, ob man sie richtig trifft.

**Die Antwortform, verbindlich:**

* **303, nicht 302.** Die Antwort auf ein GET soll auch nach dem Folgen ein GET sein, und 303 sagt
  das ausdrücklich statt es dem Browser zu überlassen.
* **Relatives `Location`, in JEDEM Zweig.** Ausdrücklich **nicht** `NextResponse.redirect(...)`: das
  verlangt eine absolute URL, und jede absolute URL hier ist entweder aus einer Basisvariablen
  geraten oder aus `req.url` gebaut — und `req.url` trägt nach dem Rewrite den **inneren** Pfad
  (`src/app/m/files/_lib/hostRolle.ts:137-139` schreibt es aus). Ein relatives `Location` löst der
  Browser gegen die URL auf, die **er** sah (RFC 7231 §7.1.2). **Cookie und Landung können damit
  konstruktiv nicht auseinanderfallen.**
  ⚠️ Was der Bruch kostet, ist bei `radio` genau derselbe Schaden wie bei `lagerbuch`
  (`src/app/m/lagerbuch/t/[code]/route.ts:109-118`): das Cookie gilt für den einen Host, die Landung
  passiert auf dem anderen, die Person kommt **ohne** Sitzung am Gate an — bei **jedem** Versuch
  erneut, für **alle** gleichzeitig, ohne Fehlermeldung, die auf die Ursache zeigt. Bei `radio` ist
  es teurer als dort, weil es **kein Parallelfenster** gibt (gesetzte Entscheidung 3): der einzige
  Rückweg ist „Router zurück".
* **Cookie auf DERSELBEN Antwort**, die den 303 trägt (`antw.cookies.set(...)`), nicht auf einer
  vorangehenden.

**Der Host-Riegel steht VOR der Einlösung, nicht dahinter.** Ein Riegel dahinter antwortete genauso
mit 404, hätte aber `last_used_at` auf dem fremden Host schon geschrieben und die Sitzung für die
fremde Herkunft ausgestellt. Benutzt wird die **nicht-werfende** Form `radioHostOderNull(kopf)`; der
Handler baut seine 404 selbst, denn ein `notFound()`-Wurf ist keine brauchbare Antwort auf einen
gescannten QR-Code.

**Der Schreibpfad:**

```ts
// src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts
export type Einloesung =
  | { ok: true; cookieValue: string; codeId: string }
  | { ok: false };

/**
 * @param code Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert NICHT.
 * @param db   PFLICHT, kein Vorgabewert.
 */
export async function loeseCodeEin(code: string, db: DB): Promise<Einloesung>;
```

Sie liegt unter `_lib/schreibpfade/`, **weil sie schreibt**: `last_used_at`. Sie setzt `last_used_at`
**nur bei einem Treffer** — ein gesperrter Code trüge sonst nach jedem Scanversuch eine frische
Spur, und die Verwaltung zeigte Aktivität, die es nicht gibt
(`src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts`, Kommentar am `db.update`). Sie
**nimmt** das DB-Handle, sie holt sich keins.

**Der Code bleibt nach der Einlösung einlösbar.** Kein `eingeloestAm`, kein Verbrennen. Der Aufsteller
im Funkraum wird jede Schicht gescannt, von wechselnden Personen — ein Einmalcode wäre nach dem
ersten Scan Altpapier. (Der Enrollment-Entwurf in
`docs/radio-portierung-analyse.md:445-450` verlangt das Gegenteil, weil er ein **Gerät** enrollt; er
ist mit Betreiberantwort 5 gegenstandslos.)

**Der Nicht-Treffer ist EINE einzige Form.** „unbekannt" und „gesperrt" sind von außen nicht
unterscheidbar — ein Rückgabewert, der sie trennte, wäre ein Orakel darüber, welche der 2¹⁴⁰
Zeichenfolgen je vergeben waren.

### 3.3.3 Das Eingabefeld: eine Server Action

**`einloesenAmGate` in `src/app/m/radio/_actions/gate.ts`** — für den Fall, dass die Kamera nicht
will, der Code von einem Ausdruck abgelesen wird oder der Scan im Browser nicht ankommt.

```ts
export type GateZustand = { fehler?: string };

export async function einloesenAmGate(
  _vorher: GateZustand,
  formData: FormData,
): Promise<GateZustand>;
```

⚠️ **Die `useActionState`-Signatur ist bindend.** Die Gate-Insel ruft
`useActionState<GateZustand, FormData>(einloesenAmGate, {})`; der erste Parameter ist der vorherige
Zustand und wird nicht gelesen. Eine Signatur **ohne** ihn ist typkorrekt kompilierbar und bekäme zur
Laufzeit `FormData` im falschen Parameter — die Eingabe wäre dann **immer leer**, und das Gate
antwortete auf **jeden** Code mit „unbekannt". `pnpm build` sieht das nicht
(`src/app/m/lagerbuch/_actions/gate.ts:29-35`).

⚠️ **Diese Action gehört auf die Ausnahmeliste des Guard-Scans (Eintrag 1).** Sie **erzeugt** die
Sitzung; ein Sitzungsriegel davor wäre die Tür, die sich selbst abschließt. Wer den Scan
„vervollständigt", indem er hier `requireAusleihSchreibend` einsetzt, macht das Gate unbenutzbar — und
der Fehler sieht wie eine Verbesserung aus (`src/app/m/lagerbuch/_actions/gate.ts:23-27`).

**Der Host-Riegel WIRFT hier** (`requireRadioHost(kopf)`), anders als im Route Handler. Das ist die
eine Ausnahme vom Grundsatz „Actions werfen nicht, sie geben zurück": ein Action-POST auf dem falschen
Host ist kein Betriebsfall, den ein Formular anzeigen müsste, sondern ein manipulierter.

Bei Erfolg: Cookie über `(await cookies()).set(...)`, dann `redirect(returnTo ?? "/")`.

### 3.3.4 Die Fehlermeldungen — ein geschlossener Satz, vier Texte, eine Stelle

```ts
// src/app/m/radio/_lib/gateTexte.ts
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";
export const GATE_GRUENDE: readonly GateGrund[] = ["code", "gesperrt", "abgelaufen", "zuviele"];
export function istGateGrund(roh: string | null | undefined): roh is GateGrund;
export function gateMeldung(roh: string | null | undefined, sperrSekunden: number | null): string | null;
```

| Grund | Text | Wann |
|---|---|---|
| `code` | „Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung." | unbekannt **oder** gesperrt am Einlöseweg — mehr weiß der Einlöseweg nicht |
| `gesperrt` | „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." | der DB-Recheck einer **laufenden** Sitzung schlägt an — hier darf es benannt werden, denn die Sitzung war gültig |
| `abgelaufen` | „Dein Zugang ist abgelaufen. Scanne den QR-Code erneut oder melde dich über die Suite an." | Cookie fehlt, ist ungültig signiert oder `exp` ist vorbei |
| `zuviele` | „Zu viele Fehlversuche. Bitte in `n` Sekunden erneut versuchen." — bei `n = 1` „in einer Sekunde", ohne Zahl „Bitte in einer Minute erneut versuchen." | `gateGesperrt` liefert eine Restzeit |

Die Texte stehen an **genau einer** Stelle und sind gegenüber `lagerbuch`
(`src/app/m/lagerbuch/_lib/gateTexte.ts:66-83`) an zwei Wörtern geändert: „Kärtchen" → „QR-Code", und
`abgelaufen` nennt den **zweiten Weg** mit (3.5) — bei `lagerbuch` gibt es ihn nicht.

**Der Grund wandert über die URL, die Zahl nicht.** `/?grund=zuviele`; die Gate-Fläche fragt
`gateGesperrt` mit denselben Absender-Kopfzeilen selbst. **Der Satz ist geschlossen und wird nie
durchgereicht**: ein `searchParams`-Wert ist Nutzereingabe, und er landet in einem `Location`-Kopf,
wo keine React-Entkommung schützt — deshalb `istGateGrund` als Typwächter vor jeder Verwendung.

**Kein Rückfalltext.** `gateMeldung` gibt für einen unbekannten Grund `null` zurück, und die Fläche
zeigt dann **keine** Meldung. Ein „Etwas ist schiefgelaufen" auf einer Seite, auf der nichts
schiefgelaufen ist, ist schlechter als Schweigen.

### 3.3.5 Was bei gesperrt, unbekannt, abgelaufen passiert — der Ablauf

| Lage | Wo es auffällt | Antwort |
|---|---|---|
| **unbekannt** | `loeseCodeEin` → `{ ok: false }` | Fehlversuch buchen, `303 → /?grund=code` (bzw. `{ fehler }` am Formular) |
| **gesperrt, beim Einlösen** | derselbe Doppeltest `!zeile \|\| !zeile.aktiv` | identisch zu „unbekannt" — von außen nicht unterscheidbar |
| **gesperrt, während laufender Sitzung** | DB-Recheck in `ausleihZugangOderNull` | `redirect("/abmelden?grund=gesperrt")`, Cookie wird dort geräumt |
| **abgelaufen / ungültig signiert** | `verifyAusleihSitzung` → `null` | `redirect("/abmelden?grund=abgelaufen")` |
| **Cookie fehlt ganz** | `befund` → `hatteCookie: false` | `redirect("/")` **unmittelbar** — es gibt nichts zu räumen, und auf einem Telefon ist das eine Runde statt zwei |
| **zu viele Fehlversuche** | `gateGesperrt` ≠ `null`, **vor** dem DB-Zugriff | `303 → /?grund=zuviele`, **kein** weiterer Fehlversuch gebucht (sonst verlängerte jeder Versuch die Sperre) |
| **Sitzung läuft zwischen Eingabe und Absenden ab** | `requireAusleihSchreibend` in der Action | **benannter Fehlerzustand AM FORMULAR** (`useActionState`), **nie** `redirect()` |

Die letzte Zeile ist die teuerste: ein `redirect()` aus einer schreibenden Action verwürfe die
eingetragenen Werte — genau der Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus
Server-Actions am Feld an?" ausschließt (`src/app/m/lagerbuch/_lib/helferZugang.ts:163-168`).

`sanitizeReturnTo` in `src/app/m/radio/_lib/returnTo.ts` wird 1:1 aus
`src/app/m/lagerbuch/_lib/returnTo.ts` übernommen und lässt **nur lokale Pfade** durch. Grund: der
Wert kommt aus `?returnTo=` und landet in einem `Location`-Kopf.

---

## 3.4 Die Sitzung

### 3.4.1 Träger: ein host-only Cookie, **kein** `domain`

```ts
// src/app/m/radio/_lib/ausleihSitzung.ts
export const AUSLEIH_COOKIE = "radio_ausleihe";

export function ausleihCookieOptionen(gueltigkeitSekunden: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: gueltigkeitSekunden,
  };
}
```

**Das Cookie ist host-only. Es trägt KEIN `domain`. Es liegt NICHT auf `.iuk-ue.de`.** Das ist die
Zeile, an der bei diesem Port am meisten hängt, und sie hat zwei unabhängige Begründungen:

1. **Die naheliegende Vorlage ist die falsche.** `src/core/auth/cookies.ts:46-59` setzt `domain` aus
   `AUTH_COOKIE_DOMAIN` — die Datei heißt `auth/cookies.ts`, der Griff liegt nahe, und sie ist für
   die **Suite**-Sitzung richtig. Kopiert man das hierher, wird aus einer host-gebundenen
   Ausleih-Sitzung ein Cookie, das an **jeden** Modul-Host geschickt wird: an `files.`, an
   `feedback.`, an `lagerbuch.`, an jeden weiteren. Es entstünde keine Rechteausweitung (kein anderes
   Modul liest den Namen), aber Exposition in jedem Header und in jedem Log, das Cookies führt
   (`src/app/m/lagerbuch/_lib/helferSitzung.ts:106-121`).
2. **Falle 61 (lagerbuch-Zählung) bliebe damit auch nach der Einlösung offen.** Eintrag 19 aus
   Kapitel 5 der Analyse schreibt es aus: ein `domain`-Cookie wäre auf jedem Suite-Host ein
   vollgültiger Ausweis, und `radio` liefe dort vollständig — eine zweite Herkunft, die in keinem
   Runbook steht.

⚠️ **Playwright kann diesen Fehler nicht sehen.** Es fährt gegen **einen** Host, und dort verhält sich
ein domain-weites Cookie **exakt** wie ein host-only (Falle 19, lagerbuch-Zählung). `pnpm build` und
`pnpm typecheck` sehen ein zusätzliches `domain`-Feld nicht — es ist typkorrekt. **Die einzige
Absicherung ist eine Quelltext-Zusicherung im Unit-Test** (3.8).

⚠️ **Der Alt-Kiosk macht heute genau das Gegenteil, auf demselben Host.**
`radio-inventar/apps/backend/src/config/session.config.ts:16-28` leitet in Produktion
`cookieDomain = '.' + parts.slice(-2).join('.')` ab, also **`.iuk-ue.de`**, dazu `sameSite: 'none'`
(`:39`) und `secure` (`:37`), unter dem Namen `radio-inventar.sid`
(`radio-inventar/packages/shared/src/constants/auth.constants.ts:29`; Eintrag 18 aus Kapitel 5 der
Analyse). Zwei Folgen: **(a)** der Name kollidiert nicht mit `radio_ausleihe` — nachgeschlagen, nicht
angenommen; **(b)** das Alt-Cookie wird nach dem Umschwenk **weiterhin an
`radio.iuk-ue.de` mitgeschickt**, weil es auf der Elterndomain liegt und die Suite es nicht löschen
kann (fremder Name, fremder Scope). Es ist für die Suite wirkungslos, aber es steht in jedem Request.
→ **Zusage an Kapitel 6 (Runbook, Cutover, Abbau): ein Schritt „`radio-inventar.sid` je Gerät löschen
bzw. beim Abbau serverseitig invalidieren", zusammen mit dem Schritt für den alten Service Worker
(Eintrag 30 aus Kapitel 5 der Analyse).**

**`path: "/"`, und daraus folgt eine ausdrückliche Zusage:** das anonyme Cookie wird damit auch an
`/admin` mitgeschickt. Das ist keine Rechteausweitung, sondern eine Eigenschaft des Scopes — aber die
Zusage muss dastehen, sonst liest sie irgendwann jemand als Berechtigung:
**⚠️ KEINE Entscheidung unter `/admin` liest `AUSLEIH_COOKIE`. Kein Layout, keine Seite, keine Action,
kein Route Handler.** `requireRadioAdmin` kennt den Namen nicht und importiert
`ausleihSitzung.ts` nicht. Der Quelltext-Scan aus 3.8 hält das fest.

**Der Name ist präfigiert, und das ist eine bewusste Abweichung von `lagerbuch`.** Dort heißt das
Cookie `helfer_session`, ohne Präfix, und der Grund steht ausgeschrieben: eine **laufende
Feld-Sitzung** sollte den Cutover überleben, weil das Geheimnis der Alt-App übernommen wurde
(`src/app/m/lagerbuch/_lib/helferSitzung.ts:9-17`). **Bei `radio` gibt es nichts zu erhalten:** der
Alt-Kiosk hält seinen Zugang im `localStorage` und im QR-Parameter
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), und ein
`localStorage`-Wert wird von **keinem** Request mitgeschickt — er erreicht weder eine Server Component
noch einen Route Handler. Der Hausstil (Präfix) gilt also ungebrochen. Wer `helfer_session`s
Namensform abschreibt, übernimmt eine Abweichung **ohne ihren Grund**.

### 3.4.2 Signatur und Nutzlast

```ts
export type AusleihPayload = { codeId: string };
export type AusleihSitzung = AusleihPayload & { laeuftAb: Date };

export async function createAusleihSitzung(p: AusleihPayload): Promise<string>;
export async function verifyAusleihSitzung(value: string): Promise<AusleihSitzung | null>;
```

Ein `jose`-JWT, HS256, Geheimnis aus `RADIO_AUSLEIH_SITZUNG_GEHEIMNIS`, gelesen im Thunk (3.1).

* **Die Nutzlast trägt NUR `codeId`.** Kein `code`, keine `bezeichnung`. Beides kommt aus der
  DB-Zeile — dort steht es ohnehin und dort ist es **aktuell**, während ein Cookie es zwölf Stunden
  lang einfriert. Das ist zugleich der Grund, warum das Geheimnis selbst nicht im Cookie steht.
* **`algorithms: ["HS256"]` steht ausdrücklich da.** Ohne diese Angabe akzeptieren manche Aufrufwege
  ein Token mit `alg: none`.
* **Fehlt `exp`, ist die Sitzung ungültig.** `exp` ist kein Feld der Nutzlast, sondern der
  registrierte Claim, den `setExpirationTime` setzt; er wird herausgereicht, weil er der **einzige**
  Datenpfad einer Restzeit-Anzeige ist und keinen zusätzlichen Zugriff kostet.
* **`verifyAusleihSitzung` WIRFT NIE.** Der Wert kommt aus einem Cookie und ist Nutzereingabe; ein
  Wurf machte aus einem manipulierten Cookie einen HTTP 500 auf **jeder** Ausleihseite.
* **Die Feldprüfung ist STRIKT** (`typeof codeId === "string" && codeId !== ""`, plus `exp`).
  `lagerbuch` prüft dort absichtlich lax und ignoriert überzählige Felder, damit Alt-Cookies den
  Cutover überleben (`helferSitzung.ts:68-80`) — eine Rückwärtskompatibilität, die `radio` nach 3.4.1
  nicht braucht. Auch das ist eine Abweichung, die man nur mit ihrem Grund übernimmt.

### 3.4.3 Laufzeit: 12 Stunden — **zu bestätigen**

```ts
/** Die Gueltigkeit steht ZWEIMAL in derselben Sitzung: als JWT-`exp` und als
 *  Cookie-`maxAge`. Zwei Umrechnungen waeren zwei Wahrheiten. Deshalb EINE Funktion. */
export function ausleihGueltigkeitSekunden(): number {
  return grenzen().ausleihSitzungStunden * 3600;
}
```

**Vorschlag 12 Stunden, wie `lagerbuch`** (`src/app/m/lagerbuch/_lib/grenzen.ts:73`), über
`RADIO_AUSLEIH_SITZUNG_STUNDEN`. ⚠️ **Zu bestätigen — nur der Betreiber weiß, ob eine Schicht länger
läuft.**

**Der Einwand aus der Analyse ist mit Betreiberantwort 5 erledigt, und das muss dastehen, weil er
sonst als offener Widerspruch stehen bleibt.** `docs/radio-portierung-analyse.md:537-548` verwirft die
12 Stunden mit einem einzigen Argument: „**Ein Tablet tippt nicht neu** — es steht im MTW, und wer
davorsteht, hat den Enrollment-Code nicht", und schlägt stattdessen 365 Tage plus einen
Rotationspfad vor. **Es gibt kein Tablet** (Betreiberantwort 5). Wer vor dem Aufsteller im Funkraum
steht, hat den QR-Code **in Sichtweite** und scannt in zwei Sekunden neu. Damit fällt die Begründung
für eine langlebige Sitzung, und mit ihr die „zusätzliche Entscheidung" Rotationspfad aus
`:454-459`. Übernommen wird — wie die Analyse es verlangt — die **Bauform**: eine Funktion für beide
Ablaufangaben, Ablauf aus dem Cookie, Sperrung aus der Datenbank.

**Zweiter Punkt, zu bestätigen:** **sind gedruckte Aufsteller im Umlauf, und wo?** Davon hängt der
Ausstellungsplan am Cutover-Abend ab (3.9 und die Zusage an Kapitel 6) und die Frage, wie viele
Codes überhaupt entstehen. Der Betreiber hat „ist kein Tablet" gesagt, nicht „es gibt keinen
Ausdruck".

### 3.4.4 Keine Verlängerung — entschieden, mit Begründung

**Die Sitzung wird nicht verlängert. Weder gleitend noch bei Aktivität.**

* **Gleitend ist technisch unmöglich.** In einer Server Component ist `cookies()` versiegelt:
  `set`, `delete` und `clear` sind durch einen werfenden Proxy ersetzt
  (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` trägt den Satz „Cookies can
  only be modified in a Server Action or Route Handler" wörtlich, `:171` hängt den Riegel an
  `cookies().delete`; nachgeschlagen im Arbeitsbaum, Next 16.2.11 — zitiert nach
  `src/app/m/lagerbuch/_lib/helferZugang.ts:117-131`). Verlängern könnten nur Route Handler und
  Server Actions.
* **Und sie wird auch dort nicht gebaut.** Der Preis eines Ablaufs ist ein Scan. Bei einem Gerät ohne
  Bedienpersonal wäre ein stiller Ablauf ein Ausfall mitten im Einsatz — bei einem Aufsteller, vor
  dem eine Person steht, ist er eine Unterbrechung von zwei Sekunden. Eine Rotationsmechanik, die
  niemand braucht, ist eine Mechanik, deren Fehlfunktion niemand bemerkt.
* **Was stattdessen gebaut wird, ist die Wiedereingabe am Formular.** Läuft die Sitzung zwischen
  Eingabe und Absenden ab, antwortet die Action mit einem benannten Fehlerzustand am Formular
  (3.3.5), und die Fläche bietet **inline** ein Codefeld an, das die Sitzung erneuert, **ohne die
  eingetragenen Werte zu verlieren**. Vorbild: `erneuereSitzung` in
  `src/app/m/lagerbuch/_actions/sitzung.ts:51`. → **Zusage an Kapitel 4 (Ausleihfläche): die
  Inline-Erneuerung wird nur bei `grund === "sitzung"` angeboten, nie bei `grund === "gesperrt"` —
  bei einem gesperrten Code scheitert dieselbe Eingabe genauso, und ein Feld, das nicht helfen kann,
  ist schlimmer als eine klare Absage** (die Unterscheidung ist genau deshalb im Typ, siehe 3.5.1).

### 3.4.5 Abmeldung — der Route Handler ist Pflicht, nicht Stil

**`src/app/m/radio/abmelden/route.ts`, `GET`, äußerer Pfad `/abmelden`.**

⚠️ **Es MUSS ein Route Handler sein.** `requireAusleihZugang` wird aus
`(ausleihe)/layout.tsx` gerufen, und das ist eine **Server Component** — dort ist
`cookies().delete(...)` **kein Stilfehler, sondern ein Laufzeitfehler** (Belegstelle in 3.4.4). Ein
totes Cookie darf nicht liegen bleiben: es sorgte sonst bei **jedem** weiteren Aufruf für denselben
Umweg. Eintrag 20 aus Kapitel 5 der Analyse nennt dieselbe Konstruktion ausdrücklich für `radio`.

Die Form:

* `radioHostOderNull(kopf)` — die **nicht-werfende** Form, eigene 404.
* `grund` aus `searchParams` **nur** durch `istGateGrund` hindurch (geschlossener Satz, nie
  durchgereicht — der Wert landet in einem `Location`-Kopf).
* `303` mit **relativem** `Location`: `/?grund=<grund>` bzw. `/`.
* **Gelöscht wird über `ausleihCookieOptionen(0)`, nicht über `cookies.delete(...)`.** Die Attribute
  müssen beim Löschen **dieselben** sein wie beim Setzen (`path`, kein `domain`), und die eine
  Funktion, die das garantiert, gibt es schon. ⚠️ Ein Löschen mit abweichenden Attributen bleibt
  **wirkungslos, und der Browser meldet das nicht**: die Sitzung sähe weiterhin gültig aus, und der
  Riegel schickte bei jedem Aufruf erneut hierher — eine Schleife aus zwei 303, die erst auffällt,
  wenn jemand das Protokoll liest (`src/app/m/lagerbuch/abmelden/route.ts:80-90`).
* **`/abmelden` liegt NICHT unter `t/`.** Ein `t/abmelden/route.ts` gewänne zwar gegen das dynamische
  Segment (statisch schlägt dynamisch), legte aber eine Falle in einen Pfad, der auf gedruckten
  Aufstellern steht.

⚠️ **Ein `<Link href="/abmelden">` ist falsch.** Nexts Prefetch fordert das Ziel beim bloßen
Darüberfahren an und beendete die Sitzung ungefragt. **Der sichtbare Abmeldeweg ist ein
POST-Formular** auf die Server Action `beenden` in `src/app/m/radio/_actions/sitzung.ts` (Vorbild
`src/app/m/lagerbuch/_actions/sitzung.ts:133`). → **Zusage an Kapitel 4 (Ausleihfläche): der Knopf
„Zugang beenden" ist ein `<form action={beenden}>`, kein Link.**

**Angenommene Restlücke, benannt statt weggeschrieben:** ein GET-Endpunkt, der ein Cookie räumt, ist
von fremden Seiten auslösbar (ein `<img src=…>` genügt; `SameSite=Lax` verhindert das **Setzen** des
`Set-Cookie` nicht). Der Schaden ist genau: erneut scannen. Ein CSRF-Token auf einem Abmeldeweg wäre
teurer als der Schaden.

**⚠️ `/abmelden` räumt AUSSCHLIESSLICH `AUSLEIH_COOKIE`. Es fasst die Suite-Sitzung nicht an.** Kein
`signOut()`, kein Auth.js-Cookie, keine Weiterleitung nach `/api/auth/signout`. Der naheliegende
Fehler ist, aus „abmelden" eine Abmeldung zu machen: eine angemeldete Person, die den anonymen
Zugang beendet, verlöre sonst ihre Suite-Sitzung auf **allen** Modul-Hosts — und käme über Weg 2
(3.5) ohnehin sofort wieder herein, sodass der Knopf wirkungslos **aussähe** und trotzdem Schaden
anrichtete. Der Quelltext-Scan aus 3.8 hält es fest.

### 3.4.6 Was daraus für Falle 61 (lagerbuch-Zählung) folgt

Falle 61 (lagerbuch-Zählung) ist: `/m/<modul>/*` antwortet auf **jedem** Host, der auf den
Suite-Container terminiert, weil `decideRoute` nach dem **Modul aus dem Segment** gatet, nicht nach
dem Host (`src/core/routing.ts:56-68`), und für ein Modul mit `requiresAuth: false` sofort mit `true`
aussteigt. Bei `radio` hat das **Datenwirkung** (Eintrag 12 aus Kapitel 5 der Analyse): ohne
Host-Riegel schriebe `loeseCodeEin` `last_used_at`, und `radio` liefe auf einer zweiten Herkunft
vollständig.

Das host-only-Cookie ist die **zweite Hälfte** dieses Riegels, und sie greift genau dort, wo die
erste versagt: entstünde die Sitzung doch einmal auf einem fremden Host, bliebe sie **dort** — sie
wäre auf `radio.iuk-ue.de` kein Ausweis. Mit einem `domain`-Cookie wäre sie auf beiden gültig, und
der Host-Riegel schützte nur noch die Tür, nicht mehr den Raum. Beide Hälften, oder keine.

---

## 3.5 Der zweite Weg: angemeldet über die Suite

### 3.5.1 Eine Zugangsentscheidung, zwei Wege — `ausleihZugang.ts`

Die tragende Konstruktion dieses Kapitels: **zwei Wege, eine Funktion, ein Ergebnistyp.** Nicht zwei
Riegel, die jede Fläche einzeln nebeneinanderstellt — das wäre die Liste, die die nächste Datei
vergisst.

```ts
// src/app/m/radio/_lib/ausleihZugang.ts

export type AusleihZugang =
  | { weg: "code"; codeId: string; bezeichnung: string; laeuftAb: Date }
  | { weg: "suite"; sub: string; name: string | null };

/** Die zwei Gruende, mit denen eine schreibende Ausleih-Action abgewiesen wird.
 *  NICHT KOSMETISCH: bei "sitzung" hilft ein erneuter Scan, bei "gesperrt" NICHT —
 *  derselbe Code scheitert genauso. Daran haengt, ob die Inline-Erneuerung aus
 *  3.4.4 ueberhaupt angeboten wird. */
export type SperrGrund = "sitzung" | "gesperrt";

/** DAS PRAEDIKAT. Leitet NICHT um und loescht NICHTS. Fuer `page.tsx` (die Weiche
 *  Gate-oder-Ausleihe) und fuer jede Fläche mit einem dritten gueltigen Fall. */
export async function ausleihZugangOderNull(db: DB): Promise<AusleihZugang | null>;

/** Fuer LAYOUTS UND SEITEN. Leitet ans Gate um, mit benanntem Grund.
 *  AUFRUFER: `(ausleihe)/layout.tsx` und die Seiten darunter. */
export async function requireAusleihZugang(db: DB): Promise<AusleihZugang>;

/** Fuer SCHREIBENDE ACTIONS. WIRFT NICHT (ausser am Host-Riegel), sondern gibt
 *  ein Ergebnis zurueck — ein Redirect verwuerfe die eingetragenen Werte (3.3.5). */
export async function requireAusleihSchreibend(
  db: DB,
): Promise<{ ok: true; zugang: AusleihZugang } | { ok: false; grund: SperrGrund }>;
```

**Alle drei rufen `requireRadioHost(await headers())` als ERSTE Anweisung, intern.** Nur so ist die
Zusage „jede Ausleih-Action ist host-gebunden" durch **Konstruktion** wahr und nicht durch eine
Liste. Wer sie benutzt, ruft den Host-Riegel **nicht noch einmal** — ein zweiter Aufruf wäre keine
Härtung, sondern die Behauptung, der Riegel sei host-blind
(`src/app/m/lagerbuch/helfer/layout.tsx:14-27` schreibt genau diesen Befund aus).

**Der gemeinsame Rumpf `befund(db)`, in genau dieser Reihenfolge:**

```
1. requireRadioHost(await headers())                     — Host, vor allem anderen
2. viewerAusSession(await auth())  → Viewer?              — SUITE-SITZUNG, KEIN DB-Zugriff
   → wenn Viewer: { ok: true, zugang: { weg: "suite", sub, name } }   FERTIG
3. cookies().get(AUSLEIH_COOKIE)  → fehlt?                — { ok:false, "sitzung", hatteCookie:false }
4. verifyAusleihSitzung(roh)      → null?                 — { ok:false, "sitzung", hatteCookie:true }
5. SELECT … FROM ausleih_codes WHERE id = codeId          — DER RECHECK
   → !zeile || !zeile.aktiv                               — { ok:false, "gesperrt", hatteCookie:true }
6. { ok: true, zugang: { weg: "code", codeId, bezeichnung, laeuftAb } }
```

**Schritt 5 ist der DB-Recheck, und er steht auf JEDEM Lesepfad, nicht nur vor Schreibvorgängen.**
`bezeichnung` kommt aus **dieser** Zeile, nicht aus der Cookie-Nutzlast. Ein manipuliertes `codeId` in
einem gültig signierten Cookie verhält sich damit wie ein gesperrter Code — derselbe Doppeltest
`!zeile || !zeile.aktiv`, den `loeseCodeEin` führt. Ohne den Recheck liest ein gesperrter Code bis zu
zwölf Stunden weiter den gesamten Gerätebestand. Der Lookup geht über den Primärschlüssel und liegt in
derselben SQLite-Verbindung, die die Seite ohnehin öffnet.

### 3.5.2 Warum die Suite-Sitzung ZUERST geprüft wird

Die Reihenfolge ist das ganze Spiel, und sie ist nicht beliebig:

* **Ein angemeldetes Mitglied mit einem abgelaufenen oder gesperrten Code-Cookie im Browser** ist der
  Regelfall, nicht die Ausnahme: wer heute den Aufsteller gescannt hat und morgen aus der Kachel
  kommt, trägt beides. Prüfte `befund` den Code **zuerst**, lieferte er `grund: "gesperrt"`, das
  Layout leitete auf `/abmelden?grund=gesperrt`, und die Person landete am Gate — **obwohl Weg 2 sie
  vollständig berechtigt.** Genau das ist „einer hebelt den anderen aus", und es wäre typkorrekt,
  lint-sauber und für `pnpm build` unsichtbar.
* **Weg 2 kostet keinen Datenbankzugriff.** `auth()` liest das Suite-JWT; der Code-Weg braucht einen
  Lookup. Die billigere Prüfung zuerst ist zugleich die richtige.
* **Folge, die dastehen muss:** ein totes Code-Cookie einer angemeldeten Person wird **nicht**
  geräumt, weil `befund` nach Schritt 2 aussteigt. Es läuft von selbst ab (`maxAge`), und bis dahin
  ist es ein Header ohne Wirkung. Das ist der Preis der Reihenfolge, und er ist der kleinere.

### 3.5.3 Wie verhindert wird, dass ein Weg den anderen aushebelt

Vier Zusicherungen, jede mit dem Fehler, den sie ausschließt:

1. **`weg: "suite"` entsteht AUSSCHLIESSLICH aus `viewerAusSession(await auth())`.** Es gibt keinen
   Cookie, keinen Header und keinen Formularwert, der ihn erzeugen kann. Ohne `session.user.id` gibt
   es keinen Viewer (`src/app/m/lagerbuch/_lib/zugang.ts:44-56`).
2. **`weg: "code"` entsteht AUSSCHLIESSLICH aus einem signaturgeprüften Cookie PLUS dem DB-Recheck.**
   Ein gültig signiertes Cookie allein genügt nicht.
3. **Der Typ ist eine unterscheidende Vereinigung, kein Objekt mit optionalen Feldern.**
   `{ weg: "code" | "suite"; codeId?: string; sub?: string }` wäre der Ort, an dem eine Fläche
   `codeId` liest, `undefined` bekommt und still den falschen Zweig nimmt. Mit der Vereinigung
   erzwingt `pnpm typecheck` an jeder Verwendung eine Fallunterscheidung.
4. **Es gibt keine dritte Quelle.** Kein Bearer-Header, kein `?token=`-Parameter, kein
   `localStorage`. Der Alt-Mechanismus (ein geteilter Bearer aus `localStorage`,
   `radio-inventar/apps/backend/src/common/guards/api-token.guard.ts:21`, `:43-50`) wird **nicht**
   übergangsweise mitakzeptiert. Eine Doppelakzeptanz brauchte ein Ablaufdatum, das niemand setzt —
   und sie wäre genau der unbefristete, unwiderrufliche Zugang, den Entscheidung 8 ausschließt.

**Was NICHT geprüft wird, und warum:** für `weg: "suite"` wird **keine Gruppe** verlangt. Jede
Suite-Sitzung genügt. Begründung: `radio` steht mit `requiresAuth: false` und ohne `requiredGroups`
in der Registry, die Kachel ist für jede angemeldete Person sichtbar, und die Ausleihe ist **absichtlich
anonym** (Betreiberantwort 6). Eine Gruppenprüfung genau hier wäre eine zweite Rechtequelle, die
niemand pflegt — und sie stünde in unlösbarem Widerspruch dazu, dass derselbe Vorgang **ohne jede
Anmeldung** per QR-Code erlaubt ist. Wer über einen Code hereinkommt, ist niemandem zugeordnet; ein
angemeldetes Mitglied weniger zu berechtigen als einen anonymen Scanner wäre keine Härtung, sondern
ein Widerspruch.

### 3.5.4 Der Vorgang bleibt anonym — der Benutzername ist optional vorausfüllbar

**Zusage an Kapitel 4 (Ausleihfläche) und Kapitel 2 (Datenmodell), verbindlich:**

* **`weg: "suite"` schreibt `sub` NICHT in die Leihzeile.** Kein `entliehen_von_sub`, kein
  `created_by` auf `loans`. Der Ausleihvorgang ist fachlich anonym, in **beiden** Wegen
  (Betreiberantwort 6: „eingeloggt über die Suite, dort ebenfalls ‚anonym'").
* **Der Name des Ausleihenden ist und bleibt der freie Textwert aus dem Formular** — dieselbe
  Fachlichkeit wie heute.
* **`sub` und `name` aus `weg: "suite"` dürfen ausschließlich das Feld VORAUSFÜLLEN.** Ein
  `defaultValue`, überschreibbar, kein `readOnly`, keine Herkunftsmarkierung in der Zeile. Was
  gespeichert wird, ist ausschließlich das **abgesendete** Feld.

⚠️ **Zu bestätigen: soll vorausgefüllt werden?** Der Betreiber hat „könnten wir, optional" gesagt
(Betreiberantwort 6) — das ist keine Entscheidung. Beide Zustände sind mit dem Rest dieses Kapitels
vereinbar; **Vorschlag: ja, vorausfüllen**, weil es den einzigen sichtbaren Vorteil des zweiten Wegs
gegenüber dem Scan darstellt. Wird es abgelehnt, entfällt genau ein `defaultValue`; nichts anderes an
diesem Kapitel ändert sich.

### 3.5.5 Wo die Riegel gerufen werden — verbindlich

⚠️ **Route-Group-Grenzen sind KEINE Sicherheitsgrenzen (Falle 17, lagerbuch-Zählung), und mit
`requiresAuth: false` erbt `/admin` KEIN Middleware-Gating (gesetzte Entscheidung 10, Eintrag 22 aus
Kapitel 5 der Analyse).** Ein Layout ist eine Bequemlichkeit; die tragende Zusage sind die
aufrufbaren Funktionen. Deshalb steht der Riegel **in jeder Datei** als erste Anweisung, auch wenn ein
Layout darüber ihn schon gerufen hat.

| Datei | Aufruf | Form |
|---|---|---|
| `page.tsx` (die Weiche Gate-oder-Ausleihe) | `requireRadioHost` + `ausleihZugangOderNull` | Prädikat — „kein Zugang" ist der **Regelfall** |
| `(ausleihe)/layout.tsx` | `requireAusleihZugang(getDb())` | werfend/umleitend |
| jede Seite unter `(ausleihe)/` | `requireAusleihZugang(getDb())` | werfend/umleitend, **erneut** |
| jede schreibende Ausleih-Action | `requireAusleihSchreibend(getDb())` | Rückgabewert, **erste Anweisung** |
| `t/[code]/route.ts` | `radioHostOderNull` | nicht-werfend, eigene 404 — **Tür mit Datenwirkung** |
| `abmelden/route.ts` | `radioHostOderNull` | nicht-werfend, eigene 404 |
| `_actions/gate.ts#einloesenAmGate` | `requireRadioHost` | werfend; **kein** Sitzungsriegel (3.3.3) |
| `_actions/sitzung.ts#beenden` | `requireRadioHost` | werfend |
| `admin/layout.tsx`, jede Admin-Seite | `requireRadioAdmin()` | werfend |
| **jede** Verwaltungs-Action | `requireRadioAdmin()` | werfend, **erste Anweisung** |
| Manifest- und Icon-Handler | `radioHostOderNull` | nicht-werfend (Kapitel 4) |

⚠️ **`requireAusleihSchreibend` WIRFT NICHT, und das ist die gefährlichste Eigenschaft dieses
Kapitels.** `await requireAusleihSchreibend(db)` **ohne** Prüfung des Ergebnisses ist typkorrekt,
lint-sauber und öffnet die Action für jeden. Das einzige Netz dagegen sind der Guard-Scan und der
e2e-Test aus 3.8 — deshalb steht der Aufruf in **jeder** schreibenden Action als erste Anweisung, mit
ausgeschriebenem Kommentar.

---

## 3.6 Die zweite Rechteebene: `/admin`

### 3.6.1 `requireRadioAdmin` — eine Stelle, zwei Aufrufergruppen

```ts
// src/app/m/radio/_lib/zugang.ts
export type Viewer = { sub: string; groups: string[]; name: string | null; email: string | null };

export function viewerAusSession(session: /* … */): Viewer | null;
export async function viewerOderNull(): Promise<Viewer | null>;
export function istRadioAdmin(viewer: Viewer | null): boolean;
export function verwaltungsZiel(headers: Headers): string;
export async function requireRadioAdmin(): Promise<Viewer>;
```

`requireRadioAdmin` in genau dieser Reihenfolge — Vorbild
`src/app/m/lagerbuch/_lib/zugang.ts:250-262`:

```
1. const kopf = await headers();
2. requireRadioHost(kopf);                     // erst der Host, dann die Person
3. const viewer = viewerAusSession(await auth());
4. if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
5. if (!istRadioAdmin(viewer)) notFound();     // NICHT 403
6. return viewer;
```

**`istRadioAdmin` — vier Festlegungen, jede mit dem Fehler, den sie ausschließt:**

1. **`adminGroupsFor(getModule("radio"))`, NIE `mod.adminGroups`.** Der direkte Feldzugriff macht
   `SUITE_ADMIN_GROUP_RADIO` an genau dieser Stelle **wirkungslos** (`src/core/registry.ts:29-35`
   schreibt dieselbe Falle für `prodHosts` aus).
2. **`viewer.groups.some(...)`, NICHT die `canAccess`-Verknüpfung.** `canAccess`
   (`src/core/registry.ts:234-242`) hat **zwei** Zweige, die hier tödlich wären: `:239`
   (`if (!mod.requiresAuth) return true;`) — und `radio` hat `requiresAuth: false`, die Funktion
   stiege also **sofort** mit `true` aus — sowie `:241` (`if (erlaubt.length === 0) return true;`),
   eine leere Liste als Freigabe. `src/core/registry.ts:212-216` nennt das wörtlich „eine stille
   Öffnung für alle Eingeloggten". Wer `canAccess` hier abschreibt, öffnet die Verwaltung für
   **jeden**, und der Fehler ist still. `some()` gewährt bei leerer Liste **nichts**.
3. **`session.user.isAdmin` kommt in diesem Modul NIRGENDS vor.** `radio` ignoriert den
   `isModuleAdmin`-Kurzschluss modulintern, wie `feedback` und `lagerbuch` (gesetzte
   Entscheidung 9) — vorwärtskompatibel zur Umstellung des Admin-Modells vom 03.08. Der eigene
   Anlass steht in 3.2.5: hinter `/admin` liegt **die Codeliste im Klartext**, also das Geheimnis
   selbst. Betrieb und Einsicht sind zwei Rollen; wer den Server betreibt, hat damit keinen Anlass,
   Zugangscodes zu drucken.
4. **`requiredGroupsFor` wird NICHT mitgelesen.** Das wäre eine stille zweite Tür.

**`notFound()` statt 403.** Was nicht freigegeben ist, sieht in dieser Suite genauso aus wie etwas,
das es nicht gibt. Der hingenommene Verlust ist die Benennbarkeit; der Gegenwert ist, dass die
**Existenz** von `/admin` nicht verraten wird — bei einer Fläche, die Zugangscodes im Klartext zeigt,
ist das mehr wert. **Es gibt keine `/admin/kein-zugriff`-Seite.**

**⚠️ Frische: bis zu eine Stunde Verzug.** Gruppen im JWT sind nur so frisch wie der letzte
erfolgreiche Token-Refresh; der Takt ist die Access-Token-Lebensdauer von Pocket ID (heute eine
Stunde), nicht die Sitzungsdauer (`CLAUDE.md`, Abschnitt „Zugriffsschutz"). **Der Verzug wird
hingenommen**, und die Begründung ist dieselbe wie in `lagerbuch`: es gibt **eine** Verwaltungsrolle
und keine Objekt-Zugehörigkeit, an der man die Berechtigung aus der Datenbank auflösen könnte. Der
Sofort-Widerruf existiert dort, wo er gebraucht wird — bei den Ausleih-Codes, über `aktiv`, lesend
wie schreibend (3.5.1). **Der Zustand ist deutlich besser als heute:** der Alt-Kiosk baut die Kennung
im Pocket-ID-Betrieb synthetisch als `pocketid:${sub}`
(`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`) und führt neben dem
OIDC-Weg einen lokalen Passwort-Login (`modules/admin/auth/auth.controller.ts:55`).

**`verwaltungsZiel(headers)` wird exportiert, obwohl außer dem Test niemand sie ruft** — nur so ist
der Zweig „Prod-Host gegen angefragten Host" prüfbar, ohne einen `redirect()`-Wurf zu zerlegen
(`src/app/m/lagerbuch/_lib/zugang.ts:198-205`). Sie liefert `<proto>://<prodHost>/admin`, mit
Rückfall auf den angefragten Host und `/m/radio/admin` als letzten Rückfall. Der Umweg über einen
absoluten `callbackUrl` ist nötig, weil auf `returnTo` allein kein Verlass ist: Auth.js merkt sich
die `callbackUrl` in einem reinen Session-Cookie, und überlebt das den Umweg über Pocket ID nicht —
auf Mobilgeräten der Regelfall —, fällt Auth.js auf `url.origin` zurück.

**Es gibt genau EINE Verwaltungsstufe.** Kein zweites Prädikat, keine Zugehörigkeitsprüfung zwischen
Verwaltenden. `created_by` ist Nachweis und Anzeige, nie Berechtigung. Wer einen
`assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn nicht, und das ist Absicht — `radio`
hat keine Zuordnung von Verwaltenden zu Fahrzeugen oder Geräten.

⚠️ **`SUITE_ADMIN_GROUP_RADIO` LEER gesetzt ist eine stille Aussperrung** (Eintrag 23 aus Kapitel 5
der Analyse): mit `some()` gewährt die leere Liste nichts, und niemand kommt mehr in die Verwaltung —
`pnpm build` und der Boot sind grün. → **Zusage an Kapitel 1 (Zuschnitt, Registry, Hosts): der
Registry-Eintrag `radio` führt `adminGroups` mit einem nicht-leeren Vorgabewert, und die
Env-Überschreibung wird beim Boot auf „nicht leer" geprüft.**

### 3.6.2 Der Host-Riegel: die `lagerbuch`-Form, nicht die `files`-Form

```ts
// src/app/m/radio/_lib/host.ts
export function istRadioHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "radio";
}
/** Fuer LAYOUTS UND SEITEN, erste Anweisung. Wirft (notFound). */
export function requireRadioHost(headers: Headers): void;
/** Fuer ROUTE HANDLER. Wirft NIE — der Handler baut seine 404 selbst. */
export function radioHostOderNull(headers: Headers): "radio" | null;
```

**Drei Funktionen, nicht sechs** (gesetzte Entscheidung 10): `files` braucht sechs, weil es zwei
Rollen auf **zwei** Hosts hat. Bei `radio` liegen **beide** Rollen auf **einem** Host, und die Rolle
steckt im **Pfad** (`/` gegen `/admin`) — der Host unterscheidet sie nicht und darf es nicht
versuchen.

* **`moduleForHost(resolveHost(headers))?.key`, kein direkter Vergleich gegen `prodHostsFor`.**
  `moduleForHost` trifft `radio.localtest.me` **vor und unabhängig von** `prodHostsFor`; damit läuft
  derselbe Codepfad in Dev, e2e und Produktion, **ohne** dass `SUITE_HOST_RADIO` lokal gesetzt sein
  muss. `resolveHost` wird **wiederverwendet, nicht nachgebaut**: seine Vorrangregel
  `x-forwarded-host` vor `host` ist nach dem Rewrite der Middleware die einzig richtige
  (`src/core/routing.ts:36-41`); eine zweite Auflösung wäre der Ort, an dem beide auseinanderlaufen.
* **ES GIBT KEINEN „kein Prod-Host konfiguriert → durchlassen"-ZWEIG.** Er wäre die Sperre, die sich
  selbst abschaltet: solange `SUITE_HOST_RADIO` fehlt, wäre genau der Zustand offen, gegen den die
  Datei gebaut ist. Die Prädikatsform deckt den Dev-Host ohne jede Env und macht ihn überflüssig.
* **KEIN `validateRadioHosts`.** Eine Boot-Prüfung nach `files`-Vorbild bräche den Zustand **vor**
  dem Cutover (0 Hosts) und den Zustand „abgelöste Domain läuft mit" (≥ 2 Hosts) — bei `radio` sind
  **beide erlaubt**, und der Fehler zeigte sich als **Startabbruch am schlechtesten Tag**, den kein
  Test vorher herstellt (Eintrag 21 aus Kapitel 5 der Analyse). Tippfehler, Protokoll oder Port im
  Wert und doppelt vergebene Env-Hosts fängt `validateHostConfig` (`src/core/hosts.ts:65-100`)
  bereits.

⚠️ **Kein Gate findet das Fehlen dieser Datei.** `src/core/routing.test.ts:60-66` schreibt das
durchlassende Verhalten sogar ausdrücklich fest, und Playwright fährt gegen genau **einen** `baseURL`
(Falle 57, lagerbuch-Zählung).

### 3.6.3 Die Trennlinie zwischen den zwei Ebenen — vier Zusicherungen

1. **Keine Admin-Entscheidung liest `AUSLEIH_COOKIE`** (3.4.1). `zugang.ts` importiert
   `ausleihSitzung.ts` nicht.
2. **Keine Ausleih-Entscheidung liest Gruppen.** `ausleihZugang.ts` importiert `adminGroupsFor` nicht
   und `istRadioAdmin` nicht.
3. **Ein `radio`-Admin bekommt über `weg: "suite"` Zugang zur Ausleihe** — nicht als Admin, sondern
   als angemeldete Person. Es gibt keine Admin-Abkürzung in `ausleihZugang.ts` und keinen Bedarf
   dafür.
4. **Die Ausleihfläche zeigt nie einen Verwaltungsweg an eine Person ohne `istRadioAdmin`.** Das ist
   eine Anzeige-Entscheidung, keine Berechtigung — der Riegel sitzt ohnehin in jeder Admin-Datei. →
   **Zusage an Kapitel 4 (Ausleihfläche): der Link nach `/admin` hängt am Prädikat
   `istRadioAdmin(await viewerOderNull())`, nicht an `requireRadioAdmin()`.** Ein werfender Riegel an
   dieser Stelle schickte **jeden anonymen Scan** nach `/login`, bevor die Person die Ausleihe je
   sähe — genau der Ausfall, den `requiresAuth: false` verhindern soll, und er wäre typkorrekt,
   lint-sauber und für `pnpm build` unsichtbar
   (`src/app/m/lagerbuch/_lib/zugang.ts:58-70` schreibt dieselbe Erwägung aus).

**Die Gate-/Ausleih-Fläche ist eine Server Component.** → **Zusage an Kapitel 4: Suite-Falle 1** (kein
Compound-Zugriff wie `Typography.Title`, `Form.Item`, `Input.TextArea` in RSC — HTTP 500) und
**Suite-Falle 7** (`@ant-design/icons` in RSC ist HTTP 500, und `"use client"` behebt es nicht,
sondern macht es still) gelten für das Codefeld und den Absendeknopf. Das Codefeld braucht ohnehin
eine `"use client"`-Insel, weil `useActionState` dort lebt (3.3.3).

---

## 3.7 Rate-Limit am Gate

### 3.7.1 Was der Coderaum wert ist — die Rechnung, beide Wege

**Der Ausgangspunkt: das Limit ist fälschbar.** `src/core/ratelimit.ts:57-62` nimmt
`cf-connecting-ip`, sonst den **ersten (linkesten)** Eintrag aus `x-forwarded-for`, also den vom
Client behaupteten. Die Datei sagt es selbst: „wer den Container direkt erreicht, kann ihn fälschen"
(`:52-55`), und in der Datenbank heißt der Wert `client_ip_unbestaetigt`. **Eine
„rechteste-vertrauenswürdige"-Auswahl existiert hier nicht** — die Wahl des linkesten Eintrags **ist**
der CWE-348-Mangel. Ein Angreifer setzt pro Versuch einen neuen ersten XFF-Wert und hat pro Versuch
einen **neuen Zählerschlüssel**.

Dazu kommt: die Treffer liegen in einer `Map` im **Prozessspeicher** (`src/core/ratelimit.ts:6-10`).
Nach einem Neustart sind sie weg, und bei mehreren Instanzen führt jede ihren eigenen. Ein
Verwaltungs-Deploy löscht also jede laufende Sperre.

**Rechnung A — sechs Ziffern, wie `lagerbuch`.** 10⁶ = 1.000.000 Möglichkeiten ≈ 2¹⁹,⁹. Der
Absender-Eimer ist wegen der Fälschbarkeit **wertlos**; es zählt allein der modulweite Stundendeckel
von 300 Fehlversuchen. Für 50 % Treffwahrscheinlichkeit braucht es 500.000 Versuche:

> 500.000 ÷ 300 h⁻¹ = **1.667 Stunden ≈ 69 Tage** — und das ist die **obere** Schranke, denn jeder
> Neustart setzt die `Map` zurück, jede zusätzliche Instanz vervielfacht das Budget, und ein Angreifer
> muss den Code nicht erraten, sondern nur **einen** von N ausgestellten treffen (bei 20 Aufstellern
> sinkt die Zahl auf ~3,5 Tage).

Bei sechs Ziffern wäre der fälschbare XFF-Eintrag also **das Einzige** zwischen einem Angreifer und
dem Durchprobieren — genau der Fall, für den
`docs/radio-portierung-analyse.md:482-485` die CWE-348-Umstellung zur **Voraussetzung** erklärt, plus
einen Versuchszähler in der Datenbank.

**Rechnung B — 28 Zeichen Crockford-Base32 (3.2.1).** 32²⁸ = 2¹⁴⁰ ≈ 1,4 × 10⁴². Für 50 %:
7 × 10⁴¹ Versuche.

> * bei 300 Fehlversuchen pro Stunde: 2,3 × 10³⁹ Stunden ≈ **2,7 × 10³⁵ Jahre**
> * **ohne jede Schranke**, bei 10⁶ Versuchen pro Sekunde: 7 × 10³⁵ Sekunden ≈ **2,2 × 10²⁸ Jahre**
> * auch bei 1.000 gleichzeitig gültigen Codes bleiben **2,2 × 10²⁵ Jahre**.

**Verdikt: der Coderaum trägt die Sicherheit, die Schranke ist eine Notbremse.** Die zweite Zeile ist
die entscheidende: das Verfahren hält **auch dann**, wenn das Limit vollständig umgangen wird.

**Bedingung (1) aus `docs/radio-portierung-analyse.md:476-480` ist damit wörtlich erfüllt**, nicht
sinngemäß: „ein hochentropisches Einmalgeheimnis (mind. 128 bit, nicht menschlich erratbar)" — 140
bit liegen darüber. **Genau deshalb sind es 28 Zeichen und nicht 16.** 80 bit wären gegen einen
Online-Angriff gegen einen zählenden Server um Größenordnungen mehr als nötig und ließen sich
sachlich verteidigen; sie unterschritten aber die Zahl, die die Analyse als Bedingung ihres eigenen
Verdikts nennt — und ein Kapitel, das die Bedingung reißt und die Schlussfolgerung behält, ist ein
Kapitel mit einem Loch. Die vier zusätzlichen Gruppen kosten nichts, was hier zählt: gescannt wird
ein Pfadsegment, dessen Länge niemand liest.

**Bedingung (1) ist zugleich der einzige Punkt, an dem dieses Kapitel dem Enrollment-Entwurf der
Analyse widerspricht, und der Widerspruch ist benannt:** dort ist der Code ein **Einmal**geheimnis
(`:445-450`, „verbrennt den Code"), hier ein dauerhafter, sperrbarer Ausweis (3.2.4, 3.3.2). Die
Entropieforderung überlebt diesen Unterschied unverändert — sie ist gegen Raten gerichtet, nicht
gegen Wiederverwendung. Was den Unterschied trägt, ist die Sperrbarkeit: ein Einmalcode schützt sich
durch Verbrauch, dieser durch `aktiv = false`.

**Bedingung (2) derselben Stelle — der Versuchszähler in der Datenbank — entfällt damit
ausdrücklich.** Sie ist an Rechnung A gebunden („entscheidet der Betreiber sich für einen kurzen, per
Hand tippbaren Code"). Ein DB-Zähler wäre hier ein Schreibvorgang pro Fehlversuch auf einem anonymen,
unauthentifizierten Pfad — er machte aus einem Ratespiel einen Schreibangriff und wäre **teurer als
der Schaden, den er verhindert**. Der Zähler bleibt im Prozessspeicher.

### 3.7.2 Die Schranke: drei Zähler, und sie zählen nur Fehlversuche

`src/app/m/radio/_lib/gateSchranke.ts`, 1:1 nach
`src/app/m/lagerbuch/_lib/gateSchranke.ts` (dort vollständig begründet):

```ts
export function gateGesperrt(absender: string): number | null;   // LIEST NUR, kein DB-Zugriff
export function gateFehlversuchBuchen(absender: string): void;   // NUR Fehlversuche
```

* **je Absender: 5 Fehlversuche pro Minute** (`RADIO_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN`)
* **modulweit: 30 Fehlversuche pro Minute** — die Burst-Kappe gegen Rotation des
  Absenderschlüssels, = sechs Absender-Budgets
* **modulweit: 300 Fehlversuche pro Stunde** — der tragende Zähler; = 5/min × 60 und stellt genau
  die Zusage wieder her, die das Per-IP-Limit nur unter der Annahme einer wahrhaftigen Adresse je
  hatte

Vier Eigenschaften, die mitwandern müssen, weil ohne sie der Deckel etwas anderes tut als er soll:

1. **`gateGesperrt` liest nur** und braucht keinen Datenbankzugriff — **und sie ist es, die den
   Datenbankzugriff schützt**, nicht der Absender-Eimer: wer den Absenderschlüssel rotiert, startet
   jeden Versuch mit **leerem** Eimer und bekäme so oder so genau einen Lookup. Gedeckelt wird das
   ausschließlich durch die beiden modulweiten Zähler, und die lesen ihre Sperrzeit **vor** jedem
   Datenbankzugriff.
2. **Die Rückgabe ist `number | null`, nie `0`.** Ein `if (gateGesperrt(x))` wäre in der letzten
   Sekunde still falsch; die Aufrufer prüfen ausdrücklich gegen `null`.
3. **Die Kette ist kurzschließend, und zwar an JEDER Stufe gegen dieselbe FESTE Deadline** (die
   `gesperrtBis`-Map), nie gegen den Rückgabewert von `RateLimiter.check()` allein. `check()` ist ein
   **gleitendes** Fenster und öffnet früher als die feste Deadline abläuft; fragte der Kurzschluss in
   dieser Lücke erneut nur `check()`, verbrauchte ein längst gesperrter Absender das **nächste**
   Budget mit — ein einzelner gesperrter Klopfer legte die Ausgabe für alle lahm, bei der
   Minutenbremse sogar für eine ganze Stunde
   (`src/app/m/lagerbuch/_lib/gateSchranke.ts:126-145`).
4. **`grenzen()` steht auf Modulebene, und die drei Grenzen sind ab dem ersten Import eingefroren.**
   Eine geänderte `.env` wirkt erst nach einem Neustart. Das ist inhärent — die Zähler sind
   Singletons und müssen es sein, sonst zählte jeder Aufruf in einen frischen Eimer.

Der Absender kommt aus `clientIpAus(kopf)` (`src/core/ratelimit.ts:57`), **unmittelbar**. `lagerbuch`
legt dafür `_lib/absender.ts` dazwischen; `radio` braucht die Zwischenschicht nicht — es hat eine
Gate-Rolle und einen Aufrufweg.

### 3.7.3 Nur Fehlversuche werden gebucht — und das ist der teuerste Satz

**Der Budgetverbrauch liegt HINTER der Codeprüfung. Ein richtiger Code kostet nichts, auch nicht
während einer laufenden Sperre.** Genau das macht einen modulweiten Deckel überhaupt vertretbar:
zählten Erfolge mit, wäre ein modulweites Limit ein **Ausfall der Ausleihe**. So ist der Sprengradius
scharf umrissen — wer sich vertippt, wartet bis zu eine Minute; wer richtig scannt, kommt herein.

⚠️ **Der Bestand macht es falsch, und der Fehler ist in dieser Suite schon produktiv eingetreten.** In
`lagerbuch` lag der Verbrauch **vor** der Codeprüfung, und eine Bereitschaft hinter einem gemeinsamen
Uplink verbrauchte ihre fünf Versuche mit **erfolgreichen** Scans; derselbe Fehler traf `feedback` mit
15 Ehrenamtlichen aus einem Vereins-WLAN
(`src/app/m/files/api/u/[token]/upload/route.ts:145-156` schreibt den Vorfall aus,
`src/app/m/lagerbuch/_lib/gateSchranke.ts:119-124` zitiert ihn).

**Bei `radio` ist dieser Fall der Regelfall, nicht die Ausnahme.** Ein Funkraum voller Personen, die
nacheinander **denselben** Aufsteller scannen, teilt sich **einen** Uplink und damit **einen**
Absenderschlüssel. Wäre der Verbrauch vor der Prüfung, schlösse sich das Gate nach dem fünften
richtigen Scan.

### 3.7.4 Die CWE-348-Umstellung: Voraussetzung, aber keine Abhängigkeit

**Benannt als Voraussetzung, wie im Auftrag verlangt, und ausdrücklich NICHT Teil dieser Spec:** die
Umstellung von `clientIpAus` (`src/core/ratelimit.ts:58-64`) auf eine
rechteste-vertrauenswürdige-Auswahl ist ein eigener Suite-Posten. Sie betrifft `feedback`, `files`
und `lagerbuch` gleichermaßen und gehört nicht in ein Modulkapitel.

**Und das steht hier genauso deutlich: dieses Kapitel hängt nicht daran.** Nach Rechnung B in 3.7.1
hält der Zugang **auch ohne jede Schranke**. Die Umstellung macht die Notbremse wirksamer; sie ist
nicht die Mauer. Wer diese Spec mit der Begründung „CWE-348 ist noch offen" zurückhält, hält sie ohne
Sicherheitsgewinn zurück. Wer umgekehrt den Coderaum aus 3.2.1 verkürzt, macht sie zur echten
Voraussetzung — **dann gilt Rechnung A, und dann ist die Umstellung blockierend.** Die zwei
Entscheidungen hängen aneinander und dürfen nicht getrennt geändert werden.

---

## 3.8 Tests — mit Namen

**Unit (Vitest).** Kein Test in diesem Abschnitt braucht einen Browser.

| Datei | Testname | Was er fängt |
|---|---|---|
| `_lib/code.test.ts` | „Alphabet enthält kein I, L, O, U" | Verwechslungsfestigkeit als Zusicherung, nicht als Absicht |
| | „normalisiereCode bildet I und L auf 1 und O auf 0 ab" | abgetippte Codes vom Ausdruck |
| | „normalisiereCode setzt 28 Zeichen in sieben Vierergruppen" | Gleichheitssuche findet den Code ohne Bindestriche |
| | „normalisiereCode wirft nie" — Tabelle aus `""`, `"---"`, 500 Zeichen, Emoji | HTTP 500 aus einem Tippfehler |
| | **Quelltext-Scan: `erzeugeCode` nennt `Math.random` nicht** | vorhersagbare Codes, für jedes andere Gate unsichtbar |
| | „erzeugeCode liefert 28 Zeichen aus CODE_ALPHABET" (1.000 Läufe, Alphabet-Zusicherung) | ein Alphabetfehler, der nur selten sichtbar wird |
| `_lib/ausleihSitzung.test.ts` | **„ausleihCookieOptionen führt KEIN domain-Feld"** (`expect(o).not.toHaveProperty("domain")`) | Falle 19 (lagerbuch-Zählung) — **Playwright kann das nicht sehen** |
| | „Löschen benutzt dieselben Attribute wie Setzen, nur maxAge 0" | wirkungsloses Löschen, das der Browser nicht meldet |
| | „verifyAusleihSitzung gibt null zurück statt zu werfen" — falsche Signatur, `alg: none`, Müll, leerer String | HTTP 500 auf jeder Ausleihseite |
| | „ohne exp ungültig" | eine Sitzung ohne Ablauf |
| | „exp und maxAge stammen aus einer Quelle" (`ausleihGueltigkeitSekunden`) | zwei Wahrheiten über die Laufzeit |
| `_lib/ausleihZugang.test.ts` | **„Suite-Sitzung schlägt ein gesperrtes Code-Cookie" (beide gleichzeitig gesetzt → `weg: "suite"`)** | genau der Aushebelungsfall aus 3.5.2 |
| | „ohne Suite-Sitzung und mit gesperrtem Code → grund `gesperrt`" | der DB-Recheck |
| | „manipuliertes codeId in gültig signiertem Cookie verhält sich wie gesperrt" | Cookie-Manipulation |
| | **„der Host-Riegel läuft, BEVOR das Cookie angefasst wird"** (Kopfzeilen genau einmal gelesen) | Falle 61 (lagerbuch-Zählung) |
| | „fehlendes Cookie → Redirect auf `/`, nicht auf `/abmelden`" | eine Runde statt zwei auf dem Telefon |
| | „requireAusleihSchreibend wirft bei abgelaufener Sitzung nicht, sondern gibt `{ok:false}`" | verworfene Formulareingaben |
| `_lib/gateSchranke.test.ts` | „ein Erfolg verbraucht kein Budget" | der `feedback`-Vorfall, 3.7.3 |
| | „während einer Sperre wird kein weiterer Fehlversuch gebucht" | selbstverlängernde Sperre |
| | „gateGesperrt liefert nie 0" | die still falsche letzte Sekunde |
| | „ein gesperrter Absender verbraucht das modulweite Budget nicht" | die gleitende-Fenster-Lücke, 3.7.2 Punkt 3 |
| `_lib/gateTexte.test.ts` | „vier Gründe, vier Texte, kein Rückfalltext" · „Singular bei genau einer Sekunde" | „in 1 Sekunden" |
| `_lib/schreibpfade/codeEinloesung.test.ts` | **„bleibt nach der Einlösung einlösbar"** | ein verbrannter Code auf einem gedruckten Aufsteller |
| | „gesperrter Code schreibt kein last_used_at" | Aktivität in der Verwaltung, die es nicht gibt |
| | „unbekannt und gesperrt liefern dieselbe Form" | das Orakel über vergebene Codes |
| `_lib/zugang.test.ts` | **„leere adminGroups gewähren NICHTS"** | die stille Öffnung aus `canAccess` |
| | **Quelltext-Scan: `zugang.ts` nennt `isAdmin` nicht** | gesetzte Entscheidung 9 |
| | **Quelltext-Scan: `zugang.ts` importiert `ausleihSitzung` nicht** | die Trennlinie 3.6.3 Punkt 1 |
| | „istRadioAdmin liest adminGroupsFor, nicht mod.adminGroups" | wirkungsloses `SUITE_ADMIN_GROUP_RADIO` |
| `_lib/host.test.ts` | „`radio.localtest.me` ist der radio-Host, ohne gesetzte Env" · „fremder Host → false" · **Quelltext-Scan: kein „kein Prod-Host → durchlassen"-Zweig** | die Sperre, die sich selbst abschaltet |
| `_lib/bauform.test.ts` | **Reihenfolge-Scan** über `t/[code]/route.ts`, `_actions/gate.ts`, `_actions/sitzung.ts`: Host **vor** Schranke **vor** `normalisiereCode` **vor** `loeseCodeEin` | eine vertauschte Riegelreihenfolge |
| | **Quelltext-Scan: `abmelden/route.ts` nennt `signOut` nicht** | 3.4.5, letzter Absatz |
| | **Quelltext-Scan: keine Datei unter `admin/` nennt `AUSLEIH_COOKIE`** | 3.4.1, `path: "/"` |
| `_actions/guards.test.ts` | jede Datei unter `_actions/` ruft in **jeder** exportierten Action einen Riegel als erste Anweisung; **Ausnahmeliste: `gate.ts#einloesenAmGate`** (Eintrag 1, mit Begründung im Test) | die vergessene Riegelzeile — typkorrekt und lint-sauber |

**e2e (Playwright).** → **Zusage an Kapitel 6 (Tests, Runbook, Cutover): diese fünf Namen sind
gesetzt.**

| Name | Was er nachweist |
|---|---|
| `radio-gate.spec.ts` → „gescannter QR-Code führt in die Ausleihe" | 303, relatives `Location`, Cookie auf derselben Antwort — der Weg hat in `lagerbuch` **null** e2e (Falle 32, lagerbuch-Zählung) |
| „gesperrter Code wird an der Ausleihe abgewiesen" | der DB-Recheck, der einzige Nachweis dafür, dass `requireAusleihSchreibend` geprüft **wird** |
| „abgelaufene Sitzung verliert die eingetragenen Werte nicht" | 3.3.5, letzte Zeile |
| „angemeldet über die Suite, ohne Code, direkt in der Ausleihe" | Weg 2 |
| „`/admin` ist für eine angemeldete Person ohne Gruppe ein 404, nicht ein 403" | 3.6.1 |

⚠️ **Was Playwright strukturell NICHT sehen kann und deshalb im Unit-Test steht:** das fehlende
`domain` (ein Host, identisches Verhalten — Falle 19, lagerbuch-Zählung) und der Host-Riegel (ein
`baseURL` — Falle 57, lagerbuch-Zählung). Ein e2e-Test, der behauptet, das zu prüfen, prüft etwas
anderes als sein Name sagt.

⚠️ **Suite-Falle 10 gilt für jeden e2e-Test, der `/t/<code>` oder `/abmelden` anfährt:** Route Handler
werden unter `next dev` beim **ersten** Treffer kompiliert, und ein Aufruf in diesem Fenster kann
abgebrochen werden. Ein **Warmlauf-GET** auf dieselbe Route geht dem ersten echten Aufruf voraus, und
jeder Test **prüft die Antwort** (`page.waitForResponse`) statt nur auf eine spätere
Zustandsänderung zu warten.

⚠️ **Suite-Falle 12 gilt für die beiden angemeldeten e2e-Tests** („angemeldet über die Suite …" und
„`/admin` ist … ein 404"): sobald eine Suite-Sitzung im Spiel ist, holt `SessionProvider`
`/api/auth/session` nach, die Navigation wechselt von der Platzhalter- auf die volle Spalte, und der
Inhalt rutscht ~240 px — **nach** `load` und **nach** Playwrights eigener Stabilitätsprobe. Ein
`.click()` auf einen echten Anker navigiert dann nicht, und kein größeres Zeitbudget heilt es. **Jeder
Klick nach einer Anmeldung läuft über `klickeWennRuhig` aus `e2e/fixtures.ts`.** Lokal ist der Fehler
unsichtbar (warmes `.next`), in der CI reproduzierbar.

---

## 3.9 Die Ankündigung

Entscheidung 8 macht aus dieser Spec eine **Verhaltensänderung mit Ankündigungspflicht**: ein
QR-Code, der heute für immer gilt, wird künftig sperrbar und die Sitzung dahinter endet. Wer heute
einen abfotografierten Code hat, behält den Zugang; wer morgen einen gesperrten hat, verliert ihn.
Das ist bemerkbar, also braucht es eine Notiz.

**Datei:** `src/app/m/portal/_lib/neuigkeiten/notizen/radio/<YYYY-MM-DD>-zugang-ueber-code.ts`, plus
**eine Zeile** in `src/app/m/portal/_lib/neuigkeiten/notizen/register.ts`. Das Dreieck ist Dateiname ↔
Felder (`modul`, `datum`, `slug`) ↔ Registerzeile; `register.test.ts` hält alle drei zusammen. `datum`
ist der Tag des **Rollouts**, nicht des Commits — er steht deshalb hier nicht, sondern wird beim
Cutover gesetzt (→ **Zusage an Kapitel 6 (Runbook): das Setzen von `datum` und die Registerzeile sind
ein Runbook-Schritt am Rollout-Tag, kein Vorab-Commit**).

**Kein Markdown im Text.** Er wird als Textknoten gerendert; `**fett**` käme mit Sternchen auf dem
Bildschirm an, und `register.test.ts` prüft es. Der Text steht deshalb unten als reiner Klartext.

**Titel:** `Zugang über QR-Code oder Anmeldung`

⚠️ **Der Titel wiederholt den App-Namen nicht** (`CLAUDE.md`, Release-Notes-Regel: Modultitel und
Zeichen stehen in `core/registry.ts` und werden in der Notiz **nicht** wiederholt). → **Zusage an
Kapitel 1 (Zuschnitt, Registry, Hosts): der Titel dieser Notiz darf keines der Wörter enthalten, die
Kapitel 1 als `title` des Registry-Eintrags `radio` setzt.** Steht dort „Funkgeräte", ist der obige
Titel richtig; stünde dort „Zugang", müsste er umformuliert werden — deshalb ist er kurz.

**Text (drei Absätze, kein `hinweis`):**

```
Du kommst auf zwei Wegen an die Ausleihe: Du scannst den QR-Code am Aufsteller, oder Du meldest
Dich an der iuk-Suite an und öffnest die Kachel. Beide Wege führen auf dieselbe Fläche, und in
beiden bleibt der Vorgang anonym — es wird weiterhin nur der Name eingetragen, den Du selbst ins
Feld schreibst.

Neu ist, dass ein gescannter Zugang endet. Nach dem Scan bist Du <N> Stunden angemeldet, danach
scannst Du erneut. Und die Leitung kann einen einzelnen Code sperren, wenn ein Aufsteller
verschwindet oder ein Foto davon in falsche Hände gerät. Bisher galt ein einmal abfotografierter
Code unbegrenzt weiter, und es gab keine Möglichkeit, ihn zurückzuziehen.

Gerätebestand, Ausleihen und die Rückgabe bleiben, wie Du sie kennst. Wenn Du Dich über die Suite
anmeldest, brauchst Du keinen Code — der Zugang läuft dann über Deine Anmeldung und endet mit ihr.
Funktioniert ein Scan nicht, tippst Du den Code vom Aufsteller in das Feld auf der Startseite;
Groß- und Kleinschreibung sind dabei gleichgültig.
```

⚠️ **`<N>` ist der einzige Platzhalter dieses Kapitels, und er ist einer mit Grund:** die
Sitzungsdauer ist nach 3.4.3 **zu bestätigen**, und eine Anwendernotiz, die eine unbestätigte Zahl
behauptet, ist eine falsche Auskunft, die niemand mehr korrigiert. → **Zusage an Kapitel 6 (Runbook):
`<N>` wird am Rollout-Tag aus dem tatsächlich gesetzten `RADIO_AUSLEIH_SITZUNG_STUNDEN` eingesetzt —
im selben Schritt wie `datum` und die Registerzeile.** Steht dort 12, heißt es „zwölf Stunden",
ausgeschrieben.

Warum genau diese drei Absätze: der erste sagt, **was jetzt anders ist** (zwei Wege), der zweite
nennt den **Verlust** und die **Begründung dazu** statt eines Adjektivs davor, der dritte sagt, **was
gleich bleibt** — die häufigste stille Sorge nach einer Änderung. **Es gibt keinen `hinweis`**, und
das ist Absicht: ein `hinweis` steht nur da, wo wirklich etwas zu tun ist. Hier ist nichts zu tun —
der Ausweichweg Handeingabe ist eine Auskunft, keine Aufforderung, und gehört deshalb in den dritten
Absatz. Keine Dateinamen, keine Versionsnummern, kein Framework, keine Werbewörter, keine
Ausrufezeichen, keine Emoji.

**Was die Notiz nicht sagt, und das ist Absicht:** sie nennt keine Codelänge und kein
Sperr-Verfahren. Wer eine Notiz liest, soll wissen, was ihn betrifft; die Codegestalt betrifft ihn
nicht.

---

## 3.10 Zusagen an andere Kapitel — gesammelt

Die Kapitelnummern sind eine Annahme; **der in Klammern genannte Gegenstand ist verbindlich** und
entscheidet bei einer Abweichung, an welches Kapitel die Zusage geht.

1. **Kapitel 2 (Datenmodell, Schema, Migration, Import):** die Tabelle `ausleih_codes` mit den sieben
   Spalten aus 3.2.2, **ohne** `zielTyp`/`zielId`/`scope_lagerort_id`; `code` mit `UNIQUE`;
   `created_by` als **roher** `sub`. **Keine** Löschmigration, **keine** Löschfunktion.
2. **Kapitel 2:** `loans.ausleih_code_id text NULL REFERENCES ausleih_codes(id)`, ohne `ON DELETE`.
   Nullable für alle importierten Leihen und für jede Leihe über den Suite-Weg.
3. **Kapitel 2:** `loans` bekommt **keine** Spalte, die den Suite-`sub` des Ausleihenden führt
   (3.5.4).
4. **Kapitel 1 (Zuschnitt, Registry, Hosts):** `SUITE_ADMIN_GROUP_RADIO` mit nicht-leerer Vorgabe im
   Registry-Eintrag, und eine Boot-Prüfung „nicht leer" — leer gesetzt ist eine stille Aussperrung
   (3.6.1).
5. **Kapitel 1:** kein `validateRadioHosts`, und 0, 1 sowie ≥ 2 Hosts in `SUITE_HOST_RADIO` sind alle
   erlaubt (3.6.2).
6. **Kapitel 4 (Ausleihfläche):** `page.tsx` ist die Weiche Gate-oder-Ausleihe und benutzt das
   **Prädikat** `ausleihZugangOderNull`, nie einen werfenden Riegel (3.5.5). Der Link nach `/admin`
   hängt am Prädikat `istRadioAdmin(await viewerOderNull())` (3.6.3).
7. **Kapitel 4:** „Zugang beenden" ist ein `<form action={beenden}>`, **kein** `<Link>` — Prefetch
   beendete die Sitzung beim Darüberfahren (3.4.5).
8. **Kapitel 4:** die Inline-Erneuerung der Sitzung wird **nur** bei `grund === "sitzung"` angeboten,
   nie bei `"gesperrt"` (3.4.4).
9. **Kapitel 4:** der Benutzername wird bei `weg: "suite"` nur **vorausgefüllt** (`defaultValue`,
   überschreibbar) — ⚠️ **zu bestätigen**, ob überhaupt (3.5.4).
10. **Kapitel 5 (Verwaltung `/admin`):** jede Verwaltungsseite, jede Verwaltungs-Action und jeder
    Verwaltungs-Route-Handler ruft `requireRadioAdmin()` als **erste Anweisung**, weil
    `requiresAuth: false` kein Middleware-Gating vererbt (3.5.5, 3.6.1).
11. **Kapitel 5:** die Codeliste zeigt `code` im Klartext, `bezeichnung`, `aktiv`, `created_at`,
    `last_used_at` und einen Umschalter auf `setzeCodeAktiv` — **keinen Löschknopf** (3.2.4). Der
    QR-Druck erzeugt die URL `https://<SUITE_HOST_RADIO>/t/<code>`, ohne Parameter (3.2.1).
    ⚠️ **Suite-Falle 9:** diese Liste ist eine antd-`Table` mit `columns[].render` (Umschalter,
    Zeitformatierung, Codespalte). Eine `render`-Funktion, die in einer Server Component entsteht,
    ist eine gewöhnliche Funktion und wird von React **abgelehnt** („Functions cannot be passed
    directly to Client Components"). Die Tabelle gehört in eine eigene `"use client"`-Komponente,
    die **nur serialisierbare** Daten als Prop bekommt und ihre `render`-Funktionen selbst
    definiert; `setzeCodeAktiv` wird dort **direkt importiert**, nicht als Prop durchgereicht.
    Vorbild `src/app/m/lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx`. Weder `pnpm build`
    noch ein `mount()` in jsdom sehen das — nur ein echter Abruf.
12. **Kapitel 6 (Tests, Runbook, Cutover):** die fünf e2e-Namen aus 3.8.
13. **Kapitel 6:** ein Schritt „Alt-Cookie `radio-inventar.sid` je Gerät löschen bzw. beim Abbau
    serverseitig invalidieren" — es liegt auf `.iuk-ue.de` und wird nach dem Umschwenk weiter an
    `radio.iuk-ue.de` mitgeschickt (3.4.1).
14. **Kapitel 6:** `datum` und die Registerzeile der Release-Notiz werden am Rollout-Tag gesetzt
    (3.9).
15. **Kapitel 6 — die Folge, die dieses Kapitel erzeugt und nach oben schuldet:** weil es **kein
    Parallelfenster** gibt (gesetzte Entscheidung 3) und das Ausstellen hinter `/admin` und damit
    hinter Suite-SSO liegt (3.2.3), können **die ersten Codes erst in den Minuten nach dem Umschwenk
    entstehen**. Das Runbook braucht eine **namentlich benannte Person mit
    `SUITE_ADMIN_GROUP_RADIO`, vor Ort, am Cutover-Abend**, und einen Schritt „Aufsteller neu
    bedrucken oder bekleben". **Die Milderung liefert dieses Kapitel mit:** wer eine Suite-Anmeldung
    hat, leiht über Weg 2 **sofort** aus, ohne Code — der Ausfall trifft ausschließlich anonyme
    Zugänge, und er endet mit dem ersten ausgestellten Code, nicht mit dem letzten.

---

## 3.11 Was in diesem Kapitel ausdrücklich zu bestätigen ist

| # | Frage | Vorschlag | Warum nur der Betreiber es weiß |
|---|---|---|---|
| 1 | **Sitzungsdauer** | **12 Stunden**, wie `lagerbuch` | Ob eine Schicht länger läuft, steht in keinem Repo. Die Bauform ändert sich nicht, nur `RADIO_AUSLEIH_SITZUNG_STUNDEN`. |
| 2 | **Sind gedruckte Aufsteller im Umlauf, und wo?** | — | Davon hängen die Zahl der auszustellenden Codes und der Nachdruck-Schritt am Cutover-Abend ab (Zusage 15). „Ist kein Tablet" heißt nicht „es gibt keinen Ausdruck". |
| 3 | **Benutzername bei angemeldeten Nutzern vorausfüllen?** | **ja** | Betreiber: „könnten wir, optional". Kostet genau ein `defaultValue`; nichts anderes ändert sich (3.5.4). |

Alles andere in diesem Kapitel ist entschieden.

---

# 4. Die Ausleih-Oberfläche an der Wurzel

Dieses Kapitel legt die Fläche fest, die ein Mensch **ohne Anmeldung** bedient: die Geräteübersicht,
die Ausleihe, die Rückgabe und die Suche. Sie liegt am äußeren Pfad `/` auf `radio.iuk-ue.de`, intern
unter `src/app/m/radio/(ausleihe)/`. Fachliche Quelle ist der heutige Kiosk
`radio-inventar/apps/frontend/src` @ `f883ec4`; sein Umfang steht vollständig in der Bodennavigation
(`components/features/Navigation.tsx:6-11`: `/loan` Ausleihen, `/return` Zurückgeben, `/` Übersicht,
`/qr-code`).

Die Gegenseite ist die Verwaltung an `/admin` — sie gehört dem Verwaltungs-Kapitel. Der Zugang selbst
(Code, Gate, Sitzung, Host-Riegel) gehört dem Zugangs-Kapitel; dieses Kapitel **ruft** ihn und
entscheidet nur, **wo** er gerufen wird und **was die Fläche sagt**, wenn er nicht trägt.

> **Zur Zitierweise der Nachbarkapitel.** Die endgültigen Kapitelnummern stehen erst nach der
> Zusammenführung fest. Alle Zusagen und Verweise sind deshalb nach **Gegenstand** benannt
> („Zugangs-Kapitel", „Daten-Kapitel", „Verwaltungs-Kapitel", „Test-/Cutover-Kapitel"), damit die
> Zusammenführung sie eindeutig zuordnen kann, ohne dass hier eine Nummer erfunden wird.

> **Lesehilfe für die Belege dieses Kapitels.** Ein bloßer Komponentenname (`DeviceRow.tsx:53`) meint
> `radio-inventar/apps/frontend/src/components/features/<Name>` — **dort liegen alle**, nicht im
> Wurzelverzeichnis. `api/…`, `lib/…`, `routes/…`, `components/ui/…` und `globals.css` sind relativ zu
> `radio-inventar/apps/frontend/src`. Ein nacktes `:NN` ohne Dateinamen setzt die zuletzt genannte
> Datei fort. Alles außerhalb dieser Wurzel steht mit vollem Pfad.
>
> **Und zur Fallennummerierung**, weil hier drei kollidieren
> (`docs/radio-portierung-analyse.md:1189-1193`): „**Falle N**" ohne Zusatz meint in diesem Kapitel
> immer die **zwölf Suite-Fallen aus `iuk-suite/CLAUDE.md`**. Die eine Stelle, an der die
> lagerbuch-Zählung gemeint ist, trägt den Zusatz ausgeschrieben.

---

## 4.1 Die Seitenlandkarte — vier äußere Pfade, drei Seiten

Der heutige Kiosk hat sieben Routen (`routes/`): `index.tsx`, `loan.tsx`, `return.tsx`, `qr-code.tsx`,
`setup.tsx`, `token-setup.tsx`, `admin.tsx` (+ `admin/*`). Auf der anonymen Fläche bleiben **drei**.

| # | äußerer Pfad | innerer Pfad | Was sie tut | Form |
|---|---|---|---|---|
| 1 | `/` | `m/radio/(ausleihe)/page.tsx` | Geräteübersicht: Liste aller Geräte mit Status, Suche, Statusfilter, Gruppierung nach Standort; ein Tap auf ein freies Gerät führt nach `/ausleihen?geraete=<id>` | **RSC + eine Insel** (`GeraeteListe`) |
| 2 | `/ausleihen` | `m/radio/(ausleihe)/ausleihen/page.tsx` | Auswahl eines oder mehrerer freier Geräte, Entleihername mit Vorschlägen, ein Bestätigungsknopf | **RSC + eine Insel** (`AusleihVorgang`) |
| 3 | `/rueckgabe` | `m/radio/(ausleihe)/rueckgabe/page.tsx` | Liste der offenen Ausleihen, Suche über Rufname **und** Entleihername, Rückgabe über Dialog mit optionaler Zustandsnotiz | **RSC + eine Insel** (`RueckgabeListe`) |
| — | `/abmelden` | `m/radio/abmelden/route.ts` | Räumt das Sitzungscookie und leitet auf `/` | **Route Handler**, gehört dem Zugangs-Kapitel |

Die vierte Kachel der heutigen Bodennavigation, `/qr-code` (`routes/qr-code.tsx`), **fällt von dieser
Fläche weg**: Codes ausstellen dürfen nur die `radio`-Admins (gesetzte Entscheidung 7), die Ansicht
lebt künftig unter `/admin`. `setup.tsx` und `token-setup.tsx` verschwinden ganz (§4.9).

**Der Grundsatz je Seite ist der der Suite: die Seite lädt und rechnet, die Insel bedient**
(`src/app/m/files/(verwaltung)/zugangslinks/page.tsx:15`, im Kopfkommentar `:11-35`, und so hält es die ganze
`lagerbuch`-Verwaltung). Für diese Fläche heißt das drei Dinge konkret:

1. **Was an einer Uhr hängt, entsteht auf dem Server.** „Seit 14:20 Uhr" (heute
   `DeviceRow.tsx:20-26`, `toLocaleTimeString('de-DE')` im Browser) und „Ausgeliehen am …" (heute
   `LoanedDeviceCard.tsx:63` über `lib/formatters.ts`) werden serverseitig zu fertigen Zeichenketten.
   Sonst entscheiden Server und Client an der Tagesgrenze verschieden, und gegen die Zone des
   Endgeräts systematisch. Die Zonenrechnung liegt in `_lib/anzeige.ts`.
2. **Die Insel bekommt nur die Felder, die sie zeigt.** Der heutige Kiosk zieht `serialNumber` mit
   (`api/devices.ts:16`), nur um darin zu suchen (`lib/device-filter.ts:36`). Auf einem privaten
   Telefon in einer Sitzung ohne Konto landete das im RSC-Payload, ohne dass die Fläche es zeigt —
   dieselbe Erwägung, mit der `lagerbuch/helfer/page.tsx:38-48` seine Artikelliste beschneidet.
   **Entscheidung: die Seriennummer wandert nicht in den Client.** Sie bleibt Suchfeld — die Suche
   läuft dafür serverseitig (§4.5.2).
3. **Keine Seite fasst einen antd-Compound an** (Falle 1). Überschriften sind nacktes `<h1>`/`<h2>`
   mit einer Typografie-Rolle aus dem CSS-Modul, nicht `Typography.Title`. `Input.TextArea` (die
   Zustandsnotiz) steht ausschließlich **in** der Client-Insel.

---

## 4.2 Der Rahmen: keine `Shell`, ein modul-eigener Rahmen

**Entscheidung: die Ausleih-Fläche rendert keine `<Shell>`** — weder `full` noch `minimal` noch
`kiosk`. Sie bekommt einen modul-eigenen Rahmen `_ui/AusleihRahmen.tsx` plus
`_ui/ausleihe.module.css`, wörtlich in der Bauform von `lagerbuch/_ui/HelferRahmen.tsx` (Kopfzeile,
Fußnavigation, Restzeit der Sitzung, alles ohne antd, alles ohne `"use client"` außer der
Restzeit-Anzeige).

Drei Gründe, jeder belegt:

1. **Bediendichte.** `buildTheme` setzt am Wurzelprovider `controlHeight: TAP` = 56 und
   `controlHeightLG: TAP_XL` = 72 (`src/core/theme/theme.ts:50-51`, Begründung im Kopf `:139`).
   `FullShell` legt darüber `ARBEITSDICHTE` mit `controlHeight: 44` (`theme.ts:207-209`) — die
   Schreibtischdichte. Auf einer Fläche, die mit Handschuhen bedient wird, ist 44 der falsche
   Vorgabewert. Ohne Hülle erbt die Fläche 56, und **`size` wird auf keinem Bedienelement gesetzt**
   (Falle 4: `size="large"` ist 72).
2. **Der Rahmen von `MinimalShell` passt nicht.** Sie rendert `SuiteRahmen` — App-Umschalter,
   Benutzermenü, Seitenleiste — und begrenzt auf `maxWidth: 640`
   (`src/core/shell/MinimalShell.tsx:26-31`). Für eine Besucherin ohne Sitzung ist eine
   Suite-Kopfzeile mit Kachelliste kein Rahmen, sondern ein Rätsel. `KioskShell` fällt aus dem
   Gegengrund weg: `height: 100dvh; overflow: hidden` (`src/core/shell/KioskShell.tsx:14`) ist
   Vollbild ohne Scrollen — eine Geräteliste scrollt.
3. **Falle 8 wird nicht berührt.** Sie hängt an `.ant-layout-header` und damit an `SuiteRahmen`; ein
   eigener Kopf aus eigenem Markup erbt keine 64px-Zeilenhöhe.

**Was der Rahmen trägt** (alles Server, keine Ausnahme außer der Restzeit):

* Wortmarke „Funkgeräte" und darunter das Sitzungsetikett — bei Code-Zugang „Zugang: Code `<label>`",
  bei angemeldeter Sitzung der Anzeigename. Die Zeichenkette kommt vom Riegel, wie
  `lagerbuch/helfer/page.tsx:53` sie sich holt.
* **Die Restzeit der Sitzung** als Client-Insel `_ui/Restzeit.tsx` (Vorbild
  `lagerbuch/_ui/Restzeit.tsx`), gefüttert mit einem Server-Zeitstempel.
* Die Fußnavigation mit **drei** Zielen: Übersicht, Ausleihen, Zurückgeben. Tap-Maß 64 (§4.6.3),
  Aktivmarkierung als **Server-Prop** `aktiv={"uebersicht" | "ausleihen" | "rueckgabe"}` — nicht
  `usePathname`, sonst wird der Rahmen zur Client-Grenze.
* **Ein Rückweg in die Suite, aber nur mit Sitzung.** Wer über die Kachel kam, findet einen
  `next/link` auf `/` des Portals; wer über einen QR-Code kam, sieht ihn nicht. Ein sichtbarer Weg
  dorthin, wo die aufrufende Person nicht hindarf, verletzt die Gegenprobe aus
  `docs/design/README.md:420`. Kein `signOut`-Formular auf dieser Fläche — die Abmeldung der
  Code-Sitzung ist der Route Handler `/abmelden` (Zugangs-Kapitel), und `cookies().delete()` wirft in
  einer Server Component.

**Kein `viewport`-Export und kein `manifest.webmanifest` in Spec 1** (§4.9.4).

### 4.2.1 Wo der Riegel gerufen wird

`(ausleihe)/layout.tsx` ruft `requireRadioZugang(...)` als **erste Anweisung** und trägt sonst nichts
(Vorbild `lagerbuch/helfer/layout.tsx:41-45`). **Das ist eine Bequemlichkeit, keine
Sicherheitsgrenze:** Route-Group-Grenzen sind keine, und ein Layout kann einer Seite keine Props
reichen. Deshalb ruft **jede** der drei Seiten den Riegel selbst noch einmal — sie braucht
Sitzungsetikett und Ablaufzeitpunkt für den Rahmen. Ebenso **jede** Server Action in
`_actions/ausleihe.ts`, als erste Anweisung, vor jedem Lesen von `formData`.

Der Host-Riegel wird hier **nicht** zusätzlich gerufen: `requireRadioZugang` ruft ihn intern als
erste Anweisung, in der `lagerbuch`-Form (`src/app/m/lagerbuch/_lib/host.ts:42-56`, `notFound()`
statt 403). Ein zweiter Aufruf wäre die Behauptung, der Riegel sei hostblind — genau die Behauptung,
die die Zusage „hostgebunden durch Konstruktion" wieder zu einer Liste macht, die die nächste Datei
vergisst. Das ist Entscheidung 10: mit `requiresAuth: false` erbt diese Fläche **kein**
Middleware-Gating.

---

## 4.3 Fluss A: Ausleihen

### 4.3.1 Was der Mensch tut und sieht

| Schritt | Was der Mensch sieht | Was serverseitig passiert |
|---|---|---|
| 1 | Er scannt den QR-Code oder öffnet die Kachel. Es erscheint die Geräteübersicht mit Kopf „Funkgeräte", der Suchzeile, vier Statuschips und den Geräten, gruppiert nach Standort | Gate löst den Code ein und prägt die Sitzung (Zugangs-Kapitel), dann `/` als RSC: `requireRadioZugang` → Lesepfad `geraeteMitLeihstand(db)` → fertige Zeilen |
| 2 | Er tippt ein Gerät mit grünem Punkt an. Ein Gerät mit anderem Status reagiert nicht (60 % Deckkraft, `aria-disabled`) | Navigation nach `/ausleihen?geraete=<id>` (`<Link>`, kein Client-Handler) |
| 3 | Seite „Gerät ausleihen": Schritt 1 „Gerät(e) wählen" mit der Auswahlliste (das Gerät aus Schritt 2 ist bereits markiert), Schritt 2 „Empfänger angeben" | RSC liest `?geraete=`, prüft **serverseitig**, dass jede ID existiert und frei ist, und wirft ungültige IDs mit einem sichtbaren Hinweis heraus (§4.3.3) |
| 4 | Er tippt weitere Geräte an oder wieder ab; die Zahl im Knopf ändert sich („2 Geräte ausleihen") | Die Insel schreibt die Auswahl mit `router.replace` in `?geraete=` zurück — reload- und zurück-fest |
| 5 | Er tippt zwei Buchstaben in „Name eingeben". Unter dem Feld erscheinen bis zu zehn Namen mit dem Datum der letzten Ausleihe | Server Action `entleiherVorschlaege(suchtext)`, ab zwei Zeichen, Deckel 10 (§4.3.4) |
| 6 | Er drückt „Gerät ausleihen" / „Geräte ausleihen". Der Knopf zeigt sofort „Wird gespeichert …", ist gesperrt | Server Action `ausleiheAnlegen` — **eine** Transaktion über alle gewählten Geräte (§4.3.2) |
| 7 | Er landet auf der Übersicht. Oben steht eine grüne Zeile: „2 Geräte an Max Mustermann ausgeliehen." Die Geräte stehen jetzt gelb mit Namen und Uhrzeit | `revalidatePath` auf `/` und `/rueckgabe`, `redirect("/?gebucht=2")`; die Erfolgszeile rendert die Seite (§4.6.5) |

Der Bestand für Schritt 6 ist `ConfirmLoanButton.tsx:42-66`: sofortige Sperre über `isSubmitting`,
Beschriftungswechsel `:68` je nach Anzahl. Das bleibt wörtlich — nur wird aus dem `useState` ein
`useActionState`, dessen `pending` dasselbe leistet.

### 4.3.2 Eine Transaktion statt N Anfragen — eine gewollte Verhaltensänderung

Heute feuert der Knopf **N unabhängige POSTs**:
`Promise.all(deviceIds.map((deviceId) => mutateAsync({ deviceId, borrowerName })))`
(`ConfirmLoanButton.tsx:55-59`). Scheitert der dritte von vier, sind drei Geräte ausgeliehen, eines
nicht, und die Oberfläche zeigt **einen** Fehlertoast ohne Angabe, welches (`routes/loan.tsx:59-63`).

**Entscheidung: im Monolithen ist das eine Drizzle-Transaktion — alles oder nichts.** Die Signatur
nimmt die Liste, nicht das einzelne Gerät:

```ts
// src/app/m/radio/_actions/ausleihe.ts   "use server"
export type AusleihErgebnis =
  | { ok: true; anzahl: number; entleiher: string }
  | { ok: false; grund: "keine-auswahl" | "kein-name" | "nicht-verfuegbar" | "verschwunden" | "unbekannt";
      text: string; betroffen: { rufname: string; status: string }[] };

export async function ausleiheAnlegen(
  _vorher: AusleihErgebnis | null,
  formular: FormData,
): Promise<AusleihErgebnis>;
```

**Rückgabewert statt Wurf** — ein Wurf in einer Server Action erreicht die Fläche als generischer
Fehler und verliert genau die Information, die der Mensch braucht. Was der Mensch bei einem Konflikt
sieht: „**Rufname 41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts gebucht.**" —
mit dem Rufnamen im Satz, weil ohne ihn bei vier gewählten Geräten niemand weiß, welches gemeint ist.

Der Riegel gegen das Doppelbuchen bleibt der partielle Unique-Index (Daten-Kapitel), nicht ein
`SELECT` vor dem `INSERT`.

### 4.3.3 Die Auswahl steht in der URL — mit einem Vertrag

Heute liegt die Auswahl als `deviceIds` in den Suchparametern und muss im Client normalisiert werden,
weil TanStack Router `z.union([z.string(), z.array(z.string())])` liefert (`routes/loan.tsx:12-31`).
Dieselbe Zweideutigkeit hat Next: `searchParams` gibt `string | string[] | undefined`.

**Entscheidung: EIN Parameter `geraete`, kommagetrennt** (`/ausleihen?geraete=abc,def`), nicht der
wiederholte Parameter. Drei Gründe: die RSC-Seite hat einen Typ statt drei Fälle; die URL bleibt
kurz genug für einen QR-Code auf einem Aufsteller; und die Reihenfolge ist stabil, was den Vergleich
in `router.replace` billig macht. `_lib/auswahl.ts` besitzt beide Richtungen:

```ts
export function auswahlLesen(rohwert: string | string[] | undefined): string[]; // dedupliziert, max 20
export function auswahlSchreiben(ids: string[]): string;                        // stabile Reihenfolge
```

Der Deckel 20 ist neu und sichtbar: mehr Geräte als 20 in einem Vorgang nimmt die Fläche nicht an,
und sie sagt es („Höchstens 20 Geräte in einem Vorgang."). Heute gibt es keinen Deckel — 200 IDs in
der URL wären 200 POSTs (`ConfirmLoanButton.tsx:55`).

**Ungültige IDs werden serverseitig aussortiert und der Verlust wird angezeigt**, nicht verschluckt:
„Ein vorgewähltes Gerät ist nicht mehr frei und wurde aus der Auswahl entfernt." Heute prüft die
Seite gar nichts, der Fehler fällt erst beim Buchen auf.

### 4.3.4 Die Namensvorschläge — ein anonymer Blick in vergangene Ausleihen

Der Bestand: `BorrowerInput.tsx` ist 312 Zeilen mit vollständigem ARIA-Combobox-Muster
(`:200-226`), Tastaturnavigation über `ArrowDown/Up/Enter/Home/End/Tab/Escape` (`:128-185`),
`useDeferredValue` als Entprellung (`:63`), 200 ms Blur-Verzögerung, damit ein Tap noch ankommt
(`:31`, `:188-195`), Ladezustand, Fehlerzustand mit „Erneut versuchen", Leerzustand. Gespeist wird es
von `GET /api/borrowers/suggestions?q=…&limit=…` (`api/borrowers.ts:44-46`), ab zwei Zeichen
(`:6`, `:64`), `limit` auf 1..50 geklemmt (`:41`).

**Entscheidung: antds `AutoComplete` in der Client-Insel** — es gibt dieses Muster in der Suite
bereits (`src/app/m/feedback/_ui/Zuordnung.tsx:11`), und es bringt ARIA, Tastatur, Fokusring und den
Tap-auf-Vorschlag mit. Die 312 Zeilen fallen damit auf ~40. Was **nicht** antd trägt und
Nachbau bleibt: die Zwei-Zeichen-Schwelle, die Nebenzeile „zuletzt am 14.06." je Vorschlag
(`options[].label` als eigenes Markup) und das Tap-Maß 44 je Zeile.

**Datenschutz-Entscheidung: die Vorschläge bleiben, und die Begründung wird ausgeschrieben.** Es ist
ein anonymer Lesezugriff auf die Namen vergangener Entleiher; der Endpunkt ist heute `@Public()`
(`radio-inventar/apps/backend/src/modules/loans/loans.controller.ts:15` für die Leihe, dasselbe
Muster bei den Vorschlägen). Wer den Code hat, sieht auf der Übersicht ohnehin **jeden aktiven
Entleihernamen** samt Uhrzeit (`DeviceRow.tsx:20-26`) — die Vorschläge erweitern das um vergangene
Namen, nicht um eine neue Klasse. Die Einhegung ist benannt und geprüft: ab zwei Zeichen, Deckel 10,
**keine** Auflistung ohne Suchtext, und die Antwort trägt nur `{ name, zuletzt }` — kein Gerät, kein
Zeitstempel in Millisekunden, keine ID.

Die Vorschläge kommen über eine **Server Action**, nicht über einen Route Handler: ein zweiter
anonymer GET-Endpunkt bräuchte seine eigene Ratenbegrenzung, und der Suchtext stünde in jeder
Zugriffszeile des Proxys.

### 4.3.5 Die Konfliktsprache — sechs Ausgänge, heute vier Sätze

Der Bestand kennt am Master genau sechs fachliche Ausgänge
(`radio-admin/server/src/routes/loanApi.ts:158-198`): `device_not_found` 404 (`:165`),
`device_not_loanable` 409 (`:166`), `device_not_available` 409 mit `condition` (`:168`),
`device_already_on_loan` 409 (`:180`), `loan_already_returned` 409 (`:196`), `loan_not_found` 404
(`:197`). Auf dem Weg zum
Bildschirm werden daraus **vier** Sätze und dann **zwei**: der Kiosk faltet je zwei Codes auf eine
Meldung (`radio-inventar/apps/backend/src/modules/loans/loans.repository.ts:98-107`), und die
Oberfläche faltet danach **jeden** 409 auf einen einzigen Satz
(`lib/error-messages.ts:24-26`, ein zweites Mal für unstrukturierte Fehler `:65-67`):
„Dieses Gerät ist bereits ausgeliehen oder nicht verfügbar." — ohne Rufname, ohne Unterscheidung
zwischen „schon vergeben", „defekt" und „nicht ausleihbar".

**Entscheidung: im Monolithen gibt es keine HTTP-Codes mehr, sondern die typisierten `grund`-Werte aus
§4.3.2 — und jeder trägt seinen eigenen Satz, mit dem Rufnamen darin.** Die Sätze stehen an **einer**
Stelle, `_lib/meldungen.ts` (kein `"use client"`, Falle 6), damit Aktion und Fläche dieselbe Wahrheit
lesen:

| Fachlicher Ausgang | heute auf dem Bildschirm | künftig |
|---|---|---|
| Gerät ist inzwischen vergeben | „Dieses Gerät ist bereits ausgeliehen oder nicht verfügbar." | „41/12 ist inzwischen an Anna Beispiel ausgeliehen. Es wurde nichts gebucht." |
| Gerät steht auf Defekt/Wartung | derselbe Satz | „41/12 steht auf Defekt und kann nicht ausgeliehen werden." |
| Gerät ist nicht mehr ausleihbar gestellt | derselbe Satz (über 404 → „nicht gefunden") | „41/12 ist zurzeit nicht zum Ausleihen freigegeben." |
| Gerät existiert nicht mehr | „Die angeforderten Daten wurden nicht gefunden." | „41/12 steht nicht mehr in der Liste. Die Liste wurde aktualisiert." |
| Ausleihe existiert nicht mehr | derselbe Satz | „Diese Ausleihe gibt es nicht mehr. Die Liste wurde aktualisiert." |
| Ausleihe war schon zurückgegeben | „Dieses Gerät ist bereits ausgeliehen oder nicht verfügbar." | „41/12 wurde zwischenzeitlich von jemand anderem zurückgegeben." |
| Verbindung/Server | „Der Server ist momentan nicht erreichbar…" bzw. „Keine Verbindung…" | wörtlich übernommen, ergänzt um „Es wurde **nichts** gebucht." (§4.7) |

Zwei Regeln dazu, beide aus dem Bestand begründet: **der Rufname steht im Satz** (bei vier gewählten
Geräten ist ein Satz ohne Rufnamen unbrauchbar), und **keine technische Kennung erscheint** — die
heutige Regel „keine Details nach außen" (`api/loans.ts:8-12`) bleibt, `grund` ist ein interner
Schlüssel, nie Bildschirmtext.

---

## 4.4 Fluss B: Zurückgeben

| Schritt | Was der Mensch sieht | Was serverseitig passiert |
|---|---|---|
| 1 | „Zurückgeben" in der Fußnavigation. Es erscheint „Geräte zurückgeben" und die Liste der offenen Ausleihen als Karten: Rufname fett, darunter „Ausgeliehen am 14.06.2026, 09:12 Uhr" | RSC: `requireRadioZugang` → `offeneAusleihen(db)` → fertige Zeichenketten |
| 2 | Bei mehr als einer Ausleihe steht darüber eine Suchzeile „Rufname oder Name…" | Die Suchzeile erscheint heute nur bei `loans.length > 0` (`routes/return.tsx:60`); das bleibt |
| 3 | Er tippt eine Karte an. Ein Dialog öffnet: „41/12 zurückgeben", darunter ein Notizfeld „Optional: Zustandsnotiz hinterlassen", Zähler „0 / 500", zwei Knöpfe „Abbrechen" und „Zurückgeben" | antd `Modal` in der Insel; Zeichengrenze aus `_lib/grenzen.ts` (heute `LOAN_FIELD_LIMITS.RETURN_NOTE_MAX`, `ReturnDialog.tsx:76`, `:93`) |
| 4 | Er drückt „Zurückgeben". Der Knopf zeigt „Wird zurückgegeben …" | Server Action `rueckgabeBuchen` — ein `UPDATE` mit `returned_at`, atomar |
| 5 | Der Dialog schließt, die Karte verschwindet, oben steht „41/12 zurückgegeben." | `revalidatePath("/rueckgabe")` und `"/"`; die Erfolgszeile rendert die Seite |
| 6 | War die Liste leer: „Keine Geräte ausgeliehen" (antd `Empty`) | `LoanedDeviceList.tsx:54-63` wörtlich |

```ts
export type RueckgabeErgebnis =
  | { ok: true; rufname: string }
  | { ok: false; grund: "schon-zurueck" | "unbekannt-geworden" | "notiz-zu-lang" | "unbekannt"; text: string };

export async function rueckgabeBuchen(
  _vorher: RueckgabeErgebnis | null,
  formular: FormData,   // ausleiheId, zustandsnotiz
): Promise<RueckgabeErgebnis>;
```

**Drei Feinheiten des Bestands, die beim naiven Port sterben:**

1. **Die Notiz wird beim Wechsel der Ausleihe zurückgesetzt, aber nicht beim Fehlerschluss**
   (`ReturnDialog.tsx:45-47`, `:66-73` — der Kommentar nennt es „H3 + M1"). Wer eine lange Notiz
   tippt und einen Konflikt bekommt, verliert sie sonst. Das Verhalten wird übernommen: der Dialog
   bleibt bei `ok: false` offen **mit** Notiz.
2. **`maxLength` am Feld UND eine Prüfung beim Bestätigen** (`:53-55`, `:93`). Der Server prüft
   erneut — eine Regel, die nur im Client steht, ist keine Regel.
3. **Der Zeichenzähler** (`:98-100`) ist die einzige Stelle, an der die Fläche die Grenze überhaupt
   nennt. Er bleibt.

**Was NICHT übernommen wird:** `sanitizeForDisplay` auf dem Weg **in** die Datenbank
(`ReturnDialog.tsx:58`, ebenso `ConfirmLoanButton.tsx:52`). React escaped beim Rendern; eine
Bereinigung vor dem Schreiben verändert dauerhaft die gespeicherte Zeichenkette und ist bei einem
Namen wie „Müller & Sohn" ein Datenschaden, kein Schutz. Die Prüfung beim Schreiben ist **Länge und
Nichtleere**, nicht Umschreiben. Das ist eine Verhaltensänderung an den Daten und gehört als
Feldabgleich ins Cutover-Protokoll — **Zusage an das Test-/Cutover-Kapitel.**

---

## 4.5 Fluss C: Suchen und Filtern

### 4.5.1 Was der Bestand kann

`lib/device-filter.ts` ist der Kern und wandert **fachlich unverändert** mit:

* `normalizeSearchText` (`:24-31`): klein, NFD, kombinierende Diakritika weg, `ß → ss`. Ein Suchen
  nach „muller" findet „Müller", „strasse" findet „Straße".
* **Alle Begriffe müssen treffen** (`:40`, `terms.every`), Heuhaufen aus Rufname, Gerätetyp,
  Seriennummer und Standort (`:36`).
* Vier Statusfilter (`:43-54`): `ALL`, `AVAILABLE`, `ON_LOAN`, `UNAVAILABLE` — der letzte fasst
  `DEFECT` und `MAINTENANCE` zusammen und heißt auf dem Bildschirm „Defekt·Wartung"
  (`DeviceFilterBar.tsx:10`).
* **Gruppierung nach Standort** (`:71-95`): benannte Standorte alphabetisch mit `localeCompare(…, 'de')`,
  „Ohne Standort" immer zuletzt. Eine einzige Gruppe wird **flach ohne Kopfzeile** gerendert
  (`DeviceGroupedList.tsx:34-36`); bei aktivem Suchtext sind alle Gruppen zwangsweise offen und ihre
  Kopfzeilen nicht klickbar (`:31`, `DeviceGroup.tsx:15`, `:22`).
* Die Trefferzeile „7 von 23 Geräten" bzw. „23 Geräte" mit `role="status" aria-live="polite"`
  (`DeviceFilterBar.tsx:88-90`).
* Die Sortierung nach Statuspriorität AVAILABLE → ON_LOAN → DEFECT → MAINTENANCE
  (`api/devices.ts:44-49`).
* Auf `/rueckgabe` ein eigener, kleinerer Filter über Rufname **und** Entleihername
  (`lib/loan-filter.ts:8`), der `normalizeSearchText` mitbenutzt.

### 4.5.2 Wo die Suche künftig läuft

**Entscheidung: die Suche und der Statusfilter laufen im Client, die Grundmenge kommt vom Server —
mit einer Ausnahme.** Bei der gemessenen Größenordnung (unter hundert Geräte) ist eine Filterung im
Browser sofort und ohne Netz; ein Server-Roundtrip je Tastendruck wäre auf einem Telefon spürbar
langsamer. Die Ausnahme ist die **Seriennummer**: sie soll nach §4.1 nicht in den Client. Also:

* `_lib/filter.ts` (kein `"use client"`, Falle 6) enthält `normalisiereSuchtext`, `filtereGeraete`,
  `gruppiereNachStandort` — wörtlich portiert, damit die vorhandenen Testfälle mitwandern.
* Die Seite berechnet je Gerät ein **`suchschluessel`**-Feld: die schon normalisierte Verkettung aus
  Rufname, Gerätetyp, **Seriennummer** und Standort. Die Insel sucht darin, die Seriennummer selbst
  reist nicht mit. Nebeneffekt: die Normalisierung läuft einmal je Gerät, nicht einmal je Tastendruck
  je Gerät.
* **Der Suchtext steht nicht in der URL.** Er ist flüchtig, und ein Rufname oder Entleihername im
  Verlauf eines geteilten Telefons ist eine Spur, die niemand braucht. Nur `?geraete=` ist
  URL-Zustand (§4.3.3).

---

## 4.6 Von Radix/Tailwind/lucide nach antd 6

Die Suite hat Tailwind, lucide, `clsx` und `class-variance-authority` **nicht** — es gibt sie in
`package.json` nicht. Jede der 15 `components/ui/*.tsx` des Kiosk ist damit zu ersetzen oder
nachzubauen. Vorher lesen: `docs/design/README.md` und `docs/design/feedback-oeffentliche-ansicht.md`
(loginfreie Ansichten).

### 4.6.1 Die Zuordnung, Baustein für Baustein

| Heute (Kiosk) | Künftig | Server/Client | Anmerkung |
|---|---|---|---|
| `ui/input.tsx` (Suche) | antd `Input` | Client | `size` **nicht** setzen → 56 (Falle 4). Löschkreuz: `allowClear` statt eigenem 44er-Knopf (`DeviceFilterBar.tsx:54-63`) |
| `ui/button.tsx` + `ui/touch-button.tsx` | antd `Button` | Client | `size` nicht setzen. `min-width` und `touch-action: manipulation` sind **Nachbau** (antd setzt Höhe, nicht Breite) |
| `ui/dialog.tsx` (Radix) | antd `Modal` | Client | bringt Escape, Klick daneben, Fokusfalle mit — `ReturnDialog.tsx:23` beschreibt genau das als Radix-Leistung |
| `ui/textarea.tsx` | `Input.TextArea` mit `showCount maxLength` | **nur Client** | Compound → Falle 1. Der Zähler „0 / 500" kommt damit von antd |
| `ui/card.tsx` (Rückgabekarten) | antd `Card` | Server **oder** Client | `Card` ist RSC-sicher; `Card.Meta` nicht (Falle 1) |
| `ui/badge.tsx` + `StatusBadge.tsx` | **Nachbau** `_ui/StatusChip.tsx` | Server | §4.6.2 — Falle 3 |
| `ui/select.tsx`, `ui/label.tsx`, `ui/tooltip.tsx`, `ui/alert-dialog.tsx`, `ui/table.tsx`, `ui/skeleton.tsx` | **wandern nicht** | — | auf dieser Fläche unbenutzt |
| `BorrowerInput.tsx` (312 Z.) | antd `AutoComplete` + Nachbau der Nebenzeile | Client | §4.3.4 |
| `DeviceRow.tsx` / `DeviceGroup.tsx` | **Nachbau** im CSS-Modul | Client (Insel) | 64px-Zeile, Statuspunkt, zwei Textzeilen — kein antd-Baustein passt |
| `LoadingState` / `ui/skeleton.tsx` | antd `Card loading` bzw. `Spin` | Client | **kein** `Skeleton.Button` — Compound (`m/files/_ui/SharesTabelle.tsx:274` schreibt genau das aus) |
| `ErrorState.tsx` | antd `Result` | Server | `Result` ist RSC-sicher |
| Leerzustände | antd `Empty` | Server | wie `lagerbuch/verwaltung/(arbeit)/page.tsx:130` |
| `sonner` / `toast.*` | **entfällt** | — | §4.6.5 |
| `lucide-react` (18 Ikonen) | **ein Inline-SVG-Modul** | Server | §4.6.4 |
| `ThemeToggle` (localStorage, `defaultTheme="dark"`) | **entfällt** | — | §4.9.5 |

**Keine `Table` auf dieser Fläche.** Die Geräteliste ist heute schon kartenförmig
(`DeviceRow.tsx:44-74`), nicht tabellarisch, und eine `Table` mit `columns[].render` aus einer Server
Component ist ein HTTP 500 (Falle 9). Der Verzicht ist damit keine Stilfrage, sondern eine
vermiedene Falle — und für ein Telefon ist die Karte ohnehin die richtige Form.

### 4.6.2 Der Statuschip — Falle 3 mit voller Wucht

Vier Zustände, und zwei davon sind heute rot bzw. grau:
`AVAILABLE #22c55e`, `ON_LOAN #f59e0b`, `DEFECT #ef4444`, `MAINTENANCE #6b7280`
(`StatusBadge.tsx:23-53`). In der Suite ist `colorError === colorPrimary === FARBEN.rot`
(`src/core/theme/theme.ts:32-33`) — **Rot ist die Primäraktion.** Ein `Tag color="error"` für „Defekt"
sähe aus wie der Knopf, den man drücken soll, und ein `Alert type="error"` auf der Datenfläche wäre
dasselbe.

**Entscheidung: eigener Chip, eigene Hexwerte, kein antd `Tag`, kein `Alert type="error"` auf dieser
Fläche** — dieselbe Antwort, die `lagerbuch` für seine Ampel gefunden hat (Chip statt `Tag`, Töne in
`_lib/ampel.ts`). Der Ort ist `_lib/status.ts` **ohne `"use client"`** (Falle 6), damit die Seite die
Werte lesen kann:

```ts
export type StatusTon = "frei" | "vergeben" | "defekt" | "wartung";
export function statusTon(status: GeraeteStatus): StatusTon;
export function statusEtikett(status: GeraeteStatus): string; // "Verfügbar" | "Ausgeliehen" | "Defekt" | "Wartung"
```

Die vier Hexwerte werden aus `StatusBadge.tsx:23-53` übernommen (Hell- und Dunkelvariante je Zustand
stehen dort schon), **nicht** aus antd-Tokens abgeleitet. Wichtig: sie stehen als **eigene**
CSS-Variablen im Modul-Stylesheet, nicht als `--ant-*` — antd deklariert seine Variablen auf seiner
Scope-Klasse, eigenes Markup sieht sie nicht, und der Fehler ist still (Falle 2).

Der Statuspunkt links in der Zeile (`DeviceRow.tsx:61-64`, 10px, `aria-hidden`) bleibt: er trägt die
Farbe, und das Etikett rechts trägt das Wort. Farbe ist nie der einzige Träger.

### 4.6.3 Tap-Maße — was gemessen ist, und die Falle im Bestand

Die vier Utility-Klassen sind 44/48/64/72, je `min-height` **und** `min-width`
(`radio-inventar/apps/frontend/src/globals.css:85-100`). ⚠️ **Daneben liegt ein zweiter, anderer
Satz:** `lib/touch-targets.ts:2-8` führt `sm: 44, md: 56, lg: 64, xl: 88` — und `TouchButton`
benutzt davon **nur die Schlüssel**, gemappt auf die Klassennamen
(`components/ui/touch-button.tsx:9-14`). `touchSize="md"` heißt also **48**, nicht 56, und `"xl"`
heißt 72, nicht 88. **Portiert wird die Semantik der Klassen, nicht die der Konstante.** Wer die
Konstante liest, baut zwei Maße falsch.

Was tatsächlich im Einsatz ist, gemessen:

| Fläche | heute | Beleg | künftig |
|---|---|---|---|
| Gerätezeile | 56 | `DeviceRow.tsx:53` | **64** (Nachbau) — der Haupt-Tap mit Handschuh |
| Fußnavigation je Eintrag | 64 | `Navigation.tsx:29` | **64** (Nachbau) |
| Statuschips im Filter | 44 | `DeviceFilterBar.tsx:76` | **44** (Nachbau; WCAG 2.5.5 AAA) |
| Löschkreuz in der Suche | 44 | `DeviceFilterBar.tsx:59` | antd `allowClear` |
| Gruppenkopf | 44 | `DeviceGroup.tsx:24` | **44** (Nachbau) |
| Namensfeld | 56 | `BorrowerInput.tsx:220` | **geerbt** (56, `theme.ts:50`) |
| Vorschlagszeile | 44 | `BorrowerInput.tsx:283` | **44** (Nachbau) |
| Kopfknöpfe (Aktualisieren u. a.) | 64 | `DeviceList.tsx:109`, `:123`, `:133` | **geerbt** (56) — §4.9.1 und §4.9.6 nehmen zwei davon ganz weg |
| Dialogknöpfe | 44 | `ReturnDialog.tsx:108`, `:115` | **geerbt** (56) |
| Bestätigungsknopf | `size="lg"` | `ConfirmLoanButton.tsx:74` | **geerbt** (56) — `size` fällt weg (Falle 4) |

Nachbau ist damit **44 und 64**, dazu `min-width` und `touch-action: manipulation`
(`touch-button.tsx:35`) — für beides gibt es kein antd-Token. **72 wird nirgends gesetzt**, weil das
`size="large"` wäre. 56 wird nirgends geschrieben, es wird geerbt.

### 4.6.4 Ikonen — ein Inline-SVG-Modul, kein `@ant-design/icons`

Auf dieser Fläche sind 18 lucide-Ikonen im Eins: `PackageOpen`, `RefreshCw`, `AlertCircle`, `X`,
`Lock`, `Printer`, `Loader2` (`DeviceList.tsx:11`), `Check`, `User`, `Wrench` (`StatusBadge.tsx:1`),
`Search` (`DeviceFilterBar.tsx:1`), `ChevronDown`, `MapPin` (`DeviceGroup.tsx:2`), `CheckCircle2`
(`ConfirmLoanButton.tsx:3`), `Radio`, `RotateCcw`, `LayoutGrid`, `QrCode` (`Navigation.tsx:2`).

**Entscheidung: ein einziges Modul `_ui/ikonen.tsx` mit Inline-SVG, ohne `"use client"`, in der
Bauform von `lagerbuch/_ui/ikonen.tsx`** — eine `Ikone`-Komponente mit einer Namensunion. **Kein
`@ant-design/icons` in irgendeiner Datei unter `m/radio/`**, auch nicht in einer Client-Insel: der
nackte Spezifizierer ergibt in RSC einen 500 schon beim Import, und `"use client"` behebt das nicht,
es macht es still (Falle 7). `src/core/shell/icons.test.ts` riegelt das repo-weit ab; geht der Test
rot, liegt die Ursache in der Datei, die die Meldung nennt.

Von den 18 überleben 12: `Printer`, `Lock`, `QrCode` fallen mit ihren Flächen weg (§4.9), `Loader2`
wird von antds `loading`-Zustand ersetzt, `AlertCircle` von `Result`/`Alert`.

⚠️ **`RefreshCw` fällt mit, obwohl der Knopf bleibt** (§4.7). Der Grund ist Falle 7: es gibt für ihn
keinen antd-Ersatz, weil `@ant-design/icons` unter `m/radio/` nicht vorkommt, und eine dreizehnte
Inline-SVG-Ikone für einen einzelnen Knopf ist der schlechtere Tausch. **Entscheidung: der Knopf wird
beschriftet — „Aktualisieren", ohne Zeichen.** Er ist nach §4.9.6 der einzige Knopf im Kopf; ein Wort
ist dort verständlicher als ein Kreispfeil, und der Ladezustand kommt aus antds `loading`, das die
Beschriftung stehen lässt. Der Bestand trug ihn nur als `aria-label`
(`DeviceList.tsx:137`) — jetzt steht die Beschriftung auf dem Bildschirm, nicht nur in der
Vorleseanwendung.

### 4.6.5 Rückmeldungen: `sonner`-Toasts fallen weg

Heute laufen sechs Rückmeldungen über `toast.*` (`routes/loan.tsx:48`, `:60`; `routes/return.tsx:43`,
`:48`; `DeviceList.tsx:59`, `:61`). **In `src/app` der Suite gibt es keinen einzigen Aufruf von
`message.*`, `notification.*` oder `App.useApp()`** — es gibt kein Toast-Muster, an das man
anschließen könnte.

**Entscheidung: keine Toasts. Erfolg und Fehler rendert die Seite.**

* **Erfolg** nach Ausleihe/Rückgabe: `redirect` auf die Zielseite mit einem Ergebnisparameter, den
  die RSC-Seite in eine Zeile über der Liste auflöst („2 Geräte an Max Mustermann ausgeliehen.").
  Sie steht in einem `role="status" aria-live="polite"`-Bereich — ein Toast, der nach der Navigation
  verschwindet, erreicht eine Vorleseanwendung nicht zuverlässig.
* **Fehler einer Aktion**: am Ort der Aktion, aus dem `AusleihErgebnis`/`RueckgabeErgebnis` (§4.3.2,
  §4.4). Der Dialog bleibt offen, das Formular behält seine Eingaben.
* **Fehler beim Laden**: antd `Result` statt `ErrorState.tsx`.
* **Nie `Alert type="error"` auf einer Datenfläche** (Falle 3) — Warnungen sind
  `Alert type="warning"`.

Die Erfolgsfarbe ist grün und stammt aus dem Chip-Satz (§4.6.2), nicht aus `colorSuccess`, damit auf
dieser Fläche genau **ein** Farbsystem gilt.

---

## 4.7 Der Ausfall-Puffer als Fachlichkeit

**Was `STALE_GRACE_MS` wirklich tut — und was der eigene Kommentar zu viel behauptet.** Der Konstante
steht als Begründung „loans/return/history stay operational on a brief outage"
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:44-48`). Nachgeschlagen
schützt sie **genau einen Lesepfad**: `fetchLoanableDevices` bedient bei einem Fehlschlag den nicht
zu alten Cache weiter (`:123-125`), und der Cache existiert nur für Geräte (`:66`, gesetzt `:161`).

Was **nicht** geschützt ist, im selben Dienst nachgelesen:

* `fetchActiveLoans` (`:247`) — kein Cache, kein Puffer. Fällt `radio-admin` aus, ist die Liste der
  offenen Ausleihen sofort weg, und `/rueckgabe` ist unbedienbar.
* `createLoan` (`:228`) und `returnLoan` (`:234`) laufen über `loanRequest` (`:171-206`), und dort gibt
  es keinen Puffer, sondern nur die Umsetzung: unerreichbar → 503, 5xx → 503, 4xx →
  `RadioAdminLoanError` (`:198-205`).
* Die Geräteliste überlebt den Ausfall also **als Anzeige**, aber jede Buchung scheitert. Der
  Kiosk zeigt in diesem Fenster eine vollständige Liste mit grünen Punkten, auf die niemand buchen
  kann. Immerhin: `useDevices` degradiert bewusst — scheitert nur der Leihstand, erscheinen die
  Geräte ohne Entleiher statt einer Fehlerseite (`api/devices.ts:101-110`).

**Was im Monolithen an seine Stelle tritt: nichts, und das ist die richtige Antwort.** Mit
Entscheidung 15 sind die sechs `/v1`-Routen Drizzle-Aufrufe im selben Prozess auf **eine** Datei
`radio.db`. Die Störungsklasse, gegen die der Puffer gebaut war — ein Netzweg zwischen zwei
Containern, ein Token-Endpunkt, ein Proxy —, **existiert danach nicht mehr**. Ein Puffer gegen sie
wäre eine Vorrichtung ohne Gegner, mit einem eigenen Fehlermodus (veraltete Anzeige) und ohne Nutzen.

**Was als Störung übrig bleibt, und was die Fläche dazu sagt:**

| Störung | Wirkung | Was die Fläche sagt |
|---|---|---|
| Der Browser ist offline (Funkloch im Gerätelager) | Server Action erreicht den Server nicht | „Keine Verbindung. Die Ausleihe ist **nicht** gespeichert. Bitte erneut versuchen." — die Wortwahl aus `lib/error-messages.ts:45-47`, ergänzt um den entscheidenden Satz, dass nichts gebucht wurde |
| Schreibsperre auf SQLite (paralleler Schreiber, Backup) | Aktion scheitert nach dem Timeout | dieselbe Klasse: „Gerade ist zu viel gleichzeitig los. Bitte in einem Moment erneut versuchen." |
| Datenbankdatei fehlt / Migration ausstehend | Boot scheitert; die Fläche kommt nie hoch | Sache des Bootstrap, nicht dieser Fläche |
| Anzeige veraltet, weil zwei Menschen gleichzeitig buchen | Konflikt beim Schreiben | §4.3.2 — der Konflikt wird beim Buchen **benannt**, mit Rufname, und die Liste ist danach frisch |
| Sitzung abgelaufen oder Code gesperrt | Riegel greift | Weiterleitung auf `/abmelden`, dort die Erklärung — Zugangs-Kapitel |

**Der Aktualisieren-Knopf bleibt** (`DeviceList.tsx:132-140`), denn ohne TanStack Query gibt es kein
Hintergrund-Refetch mehr. Er wird ein `<form action>` auf eine Server Action mit `revalidatePath`,
mit `useFormStatus` für den sperrenden Zustand — kein `useState`-Fehlerkasten mit
Fünf-Sekunden-Selbstschluss mehr (`DeviceList.tsx:19`, `:35-49`, `:143-165`): ein fehlgeschlagenes
Neuladen ist genau der Fall, den man nicht nach fünf Sekunden verstecken sollte.

**Kein Offline-Schreibpuffer, keine Warteschlange, kein optimistisches Buchen.** Der heutige Kiosk
sieht offlinefähig aus (`PWAOfflineIndicator`, `PWAInstallBanner`, `PWAUpdateNotification` in
`routes/__root.tsx:46`, `:52-53`), hält aber keine Leihdaten. Eine Warteschlange wäre neue
Fachlichkeit mit einer offenen Frage („wer haftet für eine Buchung, die drei Stunden später
einläuft?") und ist ausdrücklich nicht Teil dieser Spec.

**Der `staleTime: 30_000` aus `api/devices.ts:96` und `api/borrowers.ts:65` fällt weg**, ebenso
`keepPreviousData` (`:154`, `:66`). Ersatz ist die RSC-Anforderung `dynamic = "force-dynamic"` je
Seite: eine Bestandsliste, die 30 Sekunden alt sein darf, ist auf einer Fläche mit zwei Menschen am
gleichen Regal genau die Ursache des Konflikts aus §4.3.2.

---

## 4.8 Zwei Wege herein, eine Fläche

Es gibt keinen Kiosk-Modus und keinen Anmelde-Modus, sondern **eine** Fläche mit zwei Eingängen
(gesetzte Entscheidung 5). Was sich unterscheidet, ist genau dreierlei, und sonst nichts:

| | über den QR-Code | über die Suite-Kachel |
|---|---|---|
| Sitzungsetikett im Kopf | „Zugang: Code `Fahrzeughalle`" | der Anzeigename der angemeldeten Person |
| Rückweg in die Suite | **nicht sichtbar** | `next/link` auf das Portal (§4.2) |
| Namensfeld beim Ausleihen | leer | **kann** vorbelegt sein — ⚠️ **zu bestätigen** (§4.10) |

**In der Sache ist beides anonym.** Die Ausleihe schreibt genau ein Namensfeld, und das ist die
Eingabe des Menschen, nicht die Kennung der Sitzung. Auch bei angemeldetem Zugang wird **keine**
Benutzerkennung an die Ausleihe geschrieben — sonst entstünde aus einer bewusst anonymen Fachlichkeit
zwei verschiedene Datenqualitäten in derselben Spalte, je nachdem, welchen Weg jemand genommen hat.
Das Namensfeld bleibt frei überschreibbar; eine Vorbelegung ist ein Vorschlag, keine Zuschreibung.

---

## 4.9 Was hier bewusst NICHT geht — und wie die Fläche das sagt

Der Leitsatz: **eine Fähigkeit, die verschwindet, verschwindet mit einem Satz, nicht mit einem
fehlenden Knopf.** Wo der Satz auf der Fläche keinen Ort hat, ist er eine Release-Notiz.

### 4.9.1 Der PDF-Druck der Geräteliste

Heute ein Druckersymbol im Kopf, `className="hidden md:flex"` — also **nur am Schreibtisch sichtbar,
auf dem Telefon nie** (`DeviceList.tsx:108-121`), anonym abrufbar über
`downloadPublicPrintTemplate()` (`api/print.ts`). **Entscheidung: nicht auf der anonymen Fläche.**
Eine PDF-Liste des gesamten Gerätebestands ist genau die Klasse, die die Suite anderswo bereits
einhegt; dass die Fähigkeit heute nur auf breiten Bildschirmen sichtbar ist, macht sie nicht
harmlos, sondern nur unauffällig. Sie zieht nach `/admin` — **Zusage an das Verwaltungs-Kapitel:
dort entsteht der Druckweg, hier fällt der Knopf weg.** Die Fläche sagt dazu nichts (es gibt kein
Element mehr, an dem ein Satz hängen könnte); die Ankündigung ist eine Release-Notiz (§4.9.6).

### 4.9.2 Der QR-Code für andere

`/qr-code` (`routes/qr-code.tsx`) ist heute für jeden am Kiosk erreichbar und erzeugt den Code, der
den geteilten API-Token base64-kodiert in der URL trägt
(`components/features/admin/AppQRCode.tsx:11-23`). **Ausstellen und Sperren dürfen nur die
`radio`-Admins** (Entscheidung 7); die 1:1-Übernahme des Mechanismus ist ohnehin ausgeschlossen
(Entscheidung 8). Der vierte Eintrag der Fußnavigation fällt damit weg. **Wie die Fläche es sagt:**
gar nicht auf der Ausleih-Fläche — aber sie sagt es dort, wo jemand danach sucht, nämlich als
Release-Notiz mit dem Weg unter seinem neuen Namen (§4.9.6). Dass sich die **Lebensdauer** des
Zugangs ändert, ist eine Verhaltensänderung mit Ankündigungspflicht und gehört ins Runbook —
**Zusage an das Zugangs-Kapitel und an das Test-/Cutover-Kapitel.**

### 4.9.3 `/token-setup` und `/setup`

`routes/__root.tsx:88-91` leitet jeden ohne `localStorage`-Token auf `/token-setup`, und `:110-112`
jeden auf `/setup`, solange die Einrichtung nicht abgeschlossen ist. **Beides verschwindet:**
`token-setup` wird durch das Gate ersetzt (Zugangs-Kapitel), `setup` ist Verwaltung. Damit fällt auch
das Muster „Zugang liegt im `localStorage`" — mit ihm die origin-Bindung, die heute den stillen
Ausfall auf dem falschen Host erzeugt hat.

**Wie die Fläche es sagt:** wer ohne gültige Sitzung kommt, bekommt **eine** Seite mit **einem**
Satz — nicht mehr eine Eingabemaske für einen Token. Die genaue Form dieser Seite gehört dem
Zugangs-Kapitel; dieses Kapitel sagt nur: sie darf keinen Weg in die Ausleihe anbieten, den es nicht
gibt, und sie nennt den analogen Weg („QR-Code am Aufsteller scannen oder über die Suite anmelden").

### 4.9.4 PWA: Installationsbanner, Aktualisierungshinweis, Offline-Anzeige

Drei Bausteine im Wurzel-Layout (`routes/__root.tsx:46`, `:52-53`), dazu `hooks/usePWA.ts` und die
Wiederherstellung nach veralteten Chunks (`lib/chunk-load-recovery.ts`, sichtbar in
`__root.tsx:12-16`). **Entscheidung: nicht in Spec 1.** Kein `manifest.webmanifest`, kein
`viewport`-Export, kein Service Worker, kein Installationsbanner. Grund: der heutige Verbund
suggeriert Offlinefähigkeit, die für Leihdaten nie bestand (§4.7) — und eine PWA, die im Funkloch
eine Liste zeigt, auf die man nicht buchen kann, ist schlimmer als keine.

**Wie die Fläche es sagt:** durch die Fehlermeldung aus §4.7, die den Satz „**nicht** gespeichert"
ausdrücklich trägt. Ein späteres Nachziehen (`lagerbuch` hat ein Manifest und Ikonen) bleibt möglich
und ist ein eigener Posten.

### 4.9.5 Der Dunkel-Hell-Umschalter und die dunkle Vorgabe

Der Kiosk läuft heute auf `defaultTheme="dark"` mit eigenem `localStorage`-Schlüssel
`radio-inventar-theme` (`routes/__root.tsx:44`) und trägt einen `ThemeToggle` in der Fußnavigation
(`Navigation.tsx:41`). Die Suite fährt Hell/Dunkel über `<html data-theme>` aus zwei Cookies
(`iuk-theme-pref`, `iuk-theme-system`). **Entscheidung: kein modul-eigener Umschalter** — ein zweites
Umschaltmodell neben dem der Suite wäre zwei Wahrheiten über dieselbe Frage; die dunkle Vorgabe
entfällt mit ihm. Eine anonyme Besucherin ohne Cookies bekommt damit **hell**, wo sie heute dunkel
bekam. Das ist bemerkbar und gehört in eine Release-Notiz (§4.9.6). Alle vier Chipfarben tragen ihre
Dunkelvariante trotzdem mit (§4.6.2) — für die Person, die ihre Wahl in der Suite getroffen hat.

### 4.9.6 Was noch wegfällt — und die drei Release-Notizen

* **„Geräte verwalten" im Leerzustand** (`DeviceList.tsx:89-98`) — ein Knopf auf `/admin` auf einer
  anonymen Fläche. Er wird zu einem **Satz ohne Verweis**: „Es sind noch keine Geräte erfasst. Das
  erledigt die Verwaltung." Ein sichtbarer Weg dorthin, wo die aufrufende Person nicht hindarf,
  verletzt `docs/design/README.md:420`.
* **Das Schlosssymbol im Kopf** (`DeviceList.tsx:122-131`, Verweis auf `/admin`) — aus demselben
  Grund weg. Wer verwalten darf, kommt über die Suite-Kachel.
* **„Meine Ausleihen" (`useMyLoans`)** wird **nicht** portiert: die Funktion existiert
  (`api/loans.ts:80-93`), wird aber ausschließlich von ihrem eigenen Test benutzt
  (`api/loans.spec.tsx:5`, `:35`) — keine Route importiert sie. Toter Code wandert nicht mit.
* **Mehrfach-Rückgabe** gibt es heute nicht (eine Karte, ein Dialog, eine Ausleihe) und bekommt sie
  hier auch nicht. Die Fläche verspricht sie nicht.
* **Seitenblätterung** auf `/rueckgabe`: die Alt-API kennt `take`/`skip`
  (`loans/loans.controller.ts:27-40`), die Oberfläche benutzt sie nicht. Bleibt so; bei unter hundert
  Leihen wäre ein Blätterwerk Mechanik ohne Anlass.

**Drei Release-Notizen, je eine Datei plus je eine Zeile in `register.ts`** (`CLAUDE.md:197-203`),
unter `src/app/m/portal/_lib/neuigkeiten/notizen/radio/`:

1. `<rollout>-funkgeraete-neue-adresse.ts` — Ausleihen und Zurückgeben liegen jetzt unter einer
   Adresse zusammen mit der Verwaltung; die Wege heißen „Übersicht", „Ausleihen", „Zurückgeben".
2. `<rollout>-zugang-per-code.ts` — der Zugang läuft über einen Code, der ausgestellt und gesperrt
   werden kann und dessen Sitzung nach einer festen Zeit endet; **der Grund gehört in den Text**
   (ein alter Code galt unbegrenzt und ließ sich nicht zurücknehmen). Ankündigungspflicht aus
   Entscheidung 8.
3. `<rollout>-geraeteliste-als-pdf-in-der-verwaltung.ts` — die Liste als PDF gibt es weiterhin, jetzt
   in der Verwaltung; dazu der Satz, dass Hell/Dunkel der Einstellung der Suite folgt.

Der `datum`-Wert ist der Tag des **Rollouts**, nicht des Commits. Kein Markdown im Text, höchstens
ein `hinweis` je Notiz — `register.test.ts` erzwingt beides.

---

## 4.10 Was nur der Betreiber wissen kann

**Genau eine Frage gehört dieser Fläche:**

> **Soll das Namensfeld beim Ausleihen für eine angemeldete Person mit ihrem Anzeigenamen vorbelegt
> sein?** (⚠️ zu bestätigen; Entscheidung 7 lässt es ausdrücklich offen.) Der Vorschlag dieser Spec
> ist **ja, vorbelegt und frei überschreibbar**: es spart auf dem Telefon den häufigsten Tippweg, und
> weil das Feld überschreibbar bleibt, ändert es die Fachlichkeit nicht. Der Gegengrund ist real und
> soll genannt werden: wer für eine Kollegin ausleiht, bucht sonst versehentlich auf den eigenen
> Namen. Fällt die Antwort auf **nein**, ändert sich genau eine Zeile in `ausleihen/page.tsx` (die
> Vorbelegung des `defaultValue`) — nichts weiter hängt daran.

Alle übrigen offenen Punkte der Ausleih-Fläche (Sitzungsdauer, gedruckte Aufsteller im Umlauf) hängen
am Zugang und stehen dort.

---

## 4.11 Die Dateien, die entstehen

```
src/app/m/radio/
  (ausleihe)/
    layout.tsx                  # nur der Riegel, kein Rahmen (§4.2.1)
    page.tsx                    # Übersicht, RSC + Insel GeraeteListe
    page.test.tsx
    ausleihen/page.tsx          # RSC + Insel AusleihVorgang
    ausleihen/page.test.tsx
    rueckgabe/page.tsx          # RSC + Insel RueckgabeListe
    rueckgabe/page.test.tsx
  _actions/
    ausleihe.ts                 # "use server": ausleiheAnlegen, rueckgabeBuchen,
                                #   entleiherVorschlaege, listeAktualisieren
    ausleihe.test.ts
  _ui/
    AusleihRahmen.tsx           # Server, kein antd
    Restzeit.tsx                # "use client", nur die Uhr
    ikonen.tsx                  # Inline-SVG, kein "use client" (§4.6.4)
    StatusChip.tsx              # Server (§4.6.2)
    GeraeteListe.tsx            # "use client": Suche, Statusfilter, Gruppen, Zeilen
    GeraeteListe.test.tsx
    GeraeteZeile.tsx            # "use client", 64px (§4.6.3)
    AusleihVorgang.tsx          # "use client": Auswahl + Name + useActionState
    AusleihVorgang.test.tsx
    EntleiherFeld.tsx           # "use client": antd AutoComplete (§4.3.4)
    RueckgabeListe.tsx          # "use client": Suche + Karten
    RueckgabeDialog.tsx         # "use client": antd Modal + Input.TextArea
    RueckgabeDialog.test.tsx
    ausleihe.module.css         # die vier Chipfarben, 44/64, touch-action, Typografie
  _lib/
    filter.ts                   # normalisiereSuchtext, filtereGeraete, gruppiereNachStandort
    filter.test.ts
    status.ts                   # statusTon, statusEtikett
    status.test.ts
    meldungen.ts                # die Sätze zu jedem `grund` (§4.3.5)
    meldungen.test.ts
    auswahl.ts                  # auswahlLesen, auswahlSchreiben (§4.3.3)
    auswahl.test.ts
    anzeige.ts                  # uhrzeit(), datumMitUhrzeit() — Europe/Berlin, serverseitig
    anzeige.test.ts
```

Nicht in diesem Kapitel, aber von ihm benutzt: `_lib/zugang.ts` (Riegel), `_lib/host.ts` (Falle 61),
`_db/` und die Lesepfade (`geraeteMitLeihstand`, `offeneAusleihen`, `entleiherVorschlaege`).

### 4.11.1 Die Tests, mit Namen

DOM-Verhalten läuft über das etablierte Harness `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`) — **kein zweites erfinden** (`CLAUDE.md:250-251`).

| Datei | Testname | Aussage |
|---|---|---|
| `_lib/filter.test.ts` | „findet Müller über muller und Straße über strasse" | `normalisiereSuchtext` 1:1 aus `device-filter.ts:24-31` |
| | „verlangt, dass ALLE Begriffe treffen" | `terms.every` (`:40`) |
| | „legt Geräte ohne Standort in die letzte Gruppe" | `:90-92` |
| | „sortiert benannte Standorte nach de-Kollation" | `:87` |
| `_lib/status.test.ts` | „kein Statuston benutzt colorError oder colorPrimary" | Falle 3, prüft gegen `FARBEN.rot` |
| | „jeder der vier Zustände hat Etikett UND Ton" | Vollständigkeit über die Union |
| `_lib/auswahl.test.ts` | „dedupliziert, hält die Reihenfolge und deckelt bei 20" | §4.3.3 |
| | „liest ein Array aus searchParams ohne zu werfen" | die `string \| string[]`-Falle |
| `_lib/anzeige.test.ts` | „formatiert 23:30 UTC als Berliner Datum des Folgetags" | Zonenrechnung, serverseitig |
| `_lib/meldungen.test.ts` | „jeder `grund` hat genau einen Satz, und keiner nennt einen Schlüssel" | §4.3.5, Vollständigkeit über die Union |
| | „der Satz zum vergebenen Gerät enthält den Rufnamen" | §4.3.5, erste Regel |
| `_actions/ausleihe.test.ts` | „bucht vier Geräte in EINER Transaktion" | §4.3.2 |
| | „bucht KEIN Gerät, wenn eines inzwischen vergeben ist, und nennt seinen Rufnamen" | Alles-oder-nichts |
| | „ruft den Zugangsriegel als erste Anweisung, vor dem Lesen von formData" | Entscheidung 10 |
| | „verweigert eine Zustandsnotiz über der Zeichengrenze serverseitig" | §4.4 Punkt 2 |
| | „schreibt den Entleihernamen unverändert, ohne Umschreiben" | §4.4, Ende |
| | „liefert höchstens zehn Vorschläge und nichts unter zwei Zeichen" | §4.3.4 |
| `_ui/GeraeteListe.test.tsx` | „zeigt 7 von 23 Geräten in der Trefferzeile" | `DeviceFilterBar.tsx:88-90` |
| | „rendert eine einzelne Gruppe flach ohne Kopfzeile" | `DeviceGroupedList.tsx:34-36` |
| | „hält bei aktivem Suchtext alle Gruppen offen und die Köpfe unklickbar" | `:31`, `DeviceGroup.tsx:22` |
| | „macht ein vergebenes Gerät nicht antippbar" | `DeviceRow.tsx:47`, `:49-50` |
| | „reicht die Seriennummer nicht in die Zeile, findet sie aber über den Suchschlüssel" | §4.5.2 |
| `_ui/RueckgabeDialog.test.tsx` | „behält die Notiz, wenn die Rückgabe an einem Konflikt scheitert" | `ReturnDialog.tsx:66-73` |
| | „leert die Notiz beim Wechsel auf eine andere Ausleihe" | `:45-47` |
| `(ausleihe)/page.test.tsx` | „rendert OHNE Layout auf fremdem Host nicht" | die Seite ruft den Riegel selbst |
| | „liest die Kopfzeilen genau einmal" | kein doppelter Host-Riegel (§4.2.1) |
| `e2e/radio-ausleihe.spec.ts` | „Code einlösen → Gerät ausleihen → in der Übersicht gelb → zurückgeben" | der ganze Weg |

Für den e2e-Test drei Auflagen aus den Testfallen: ein **Warmlauf-GET** auf jede Route, bevor die
erste Aktion feuert (Falle 10); **jede** ausgelöste Anfrage wird über ihre **Antwort** geprüft
(`page.waitForResponse`), nicht über eine spätere Zustandsänderung (Falle 10, zweite Regel); und
jeder Klick auf einen Anker läuft über `klickeWennRuhig` aus `e2e/fixtures.ts` (Falle 12) — diese
Fläche wechselt beim Eintreffen der Sitzung genau die Kopfzeile, die den Umbruch auslöst.

---

## 4.12 Zusagen an andere Kapitel

Nach Gegenstand benannt (siehe Kasten am Kapitelanfang); die Zusammenführung prüft sie gegeneinander.

**An das Zugangs-Kapitel:**
1. Der Riegel heißt `requireRadioZugang` und liefert **drei** Dinge zurück, weil der Rahmen sie
   braucht: ein anzeigbares Sitzungsetikett, den Ablaufzeitpunkt der Sitzung und ein Kennzeichen
   „über Code" / „angemeldet" (§4.2, §4.8). Ohne diese drei Felder kann diese Fläche ihren Kopf nicht
   bauen.
2. Er ruft den Host-Riegel **intern als erste Anweisung**; diese Fläche ruft ihn nirgends zusätzlich
   (§4.2.1).
3. Ablauf und Sperre führen auf den Route Handler `/abmelden`, als **String**, nicht als Import
   (`cookies().delete()` wirft in einer Server Component).
4. Die anonymen Server Actions dieses Kapitels brauchen eine Ratenbegrenzung. Sie ist **nicht** Teil
   dieser Spec: `core/ratelimit.ts` hängt an der CWE-348-Umstellung, die als eigener Suite-Posten
   benannt ist. Dieses Kapitel nennt sie als **Voraussetzung** und setzt sie nicht um.
5. Der Zugang lebt in einem **Cookie**, nicht im `localStorage`. Damit ist Falle 61 nicht mehr nur
   ein stiller Ausfall, sondern die schlimmere Richtung — der Host-Riegel ist die tragende Zusage.

**An das Daten-Kapitel:**
6. Die Lesepfade, die diese Fläche braucht, mit ihren Feldern: `geraeteMitLeihstand(db)` →
   `{ id, rufname, geraetetyp, standort, status, suchschluessel, entleiher?, seit? }` (fertige
   Zeichenketten, **kein** `Date`, **keine** Seriennummer); `offeneAusleihen(db)` →
   `{ id, rufname, entleiher, seitText }`; `entleiherVorschlaege(db, suchtext, 10)` →
   `{ name, zuletztText }`.
7. Der Riegel gegen zwei aktive Ausleihen auf einem Gerät ist der **partielle Unique-Index**, nicht
   eine Prüfung in der Aktion (§4.3.2).
8. Die Uhrzeit-Anzeige dieser Fläche liest `mode: "timestamp"` (Sekunden). Läuft der Import mit dem
   Faktor-1000-Fehler, zeigt die Fläche „Ausgeliehen am 01.01.1970" — sie ist damit die **einzige
   Stelle, an der der Fehler sichtbar wird**, und zwar erst nach dem Umschwenk. Der Schutz bleibt der
   Unit-Test auf der Mapping-Funktion mit je Feld unterschiedlichen Fixture-Werten.
9. Die Entleihernamen werden **unverändert** gespeichert (kein `sanitizeForDisplay` auf dem
   Schreibweg, §4.4) — der Feldabgleich im Cutover muss das wissen.

**An das Verwaltungs-Kapitel:**
10. Von dieser Fläche wandern dorthin: der PDF-Druck der Geräteliste (§4.9.1), die QR-Ansicht
    (§4.9.2), die Einrichtung (§4.9.3) und der Zugang zur Gerätepflege (§4.9.6). Diese Fläche trägt
    dafür **keinen sichtbaren Weg** — kein Schloss, kein „Geräte verwalten"-Knopf.
11. `_ui/ikonen.tsx`, `_lib/status.ts` und `_lib/filter.ts` sind für **beide** Flächen gebaut und
    liegen deshalb nicht unter `(ausleihe)/`. Die Verwaltung darf sie mitbenutzen; sie darf ihre
    Statusfarben nicht ein zweites Mal definieren.

**An das Test-/Cutover-Kapitel:**
12. Drei Release-Notizen mit ihren Dateinamen (§4.9.6), `datum` = Rollout-Tag.
13. Weil der Alt-Kiosk **schon** unter `radio.iuk-ue.de` läuft, gibt es kein Parallelfenster: der
    e2e-Weg aus §4.11.1 ist die letzte Prüfung **vor** dem Umschwenk, gegen einen ephemeren
    Container ohne Traefik-Labels — danach ist der Rückweg „Router zurück", und jede in der Suite
    gebuchte Ausleihe ist beim Rollback verloren.
14. Der Feldabgleich muss die Anzeige einer echten Ausleihe (Rufname, Entleiher, Uhrzeit) gegen die
    Alt-Anwendung stellen — Parität beweist den Rundlauf, nicht die Feldzuordnung.

---

## 4.13 Verworfene Alternativen

| Verworfen | Warum |
|---|---|
| `MinimalShell` für die Ausleihe | `SuiteRahmen` mit App-Umschalter und Benutzermenü ist für eine Besucherin ohne Sitzung kein Rahmen; `maxWidth: 640` schneidet die Standortgruppen ein (§4.2) |
| `KioskShell` | `height: 100dvh; overflow: hidden` (`KioskShell.tsx:14`) — eine Geräteliste scrollt |
| `FullShell` mit gesetztem `size` je Knopf | doppelt falsch: `ARBEITSDICHTE` zieht auf 44, und `size` zu setzen ist Falle 4 |
| antd `Table` für die Geräteliste | `columns[].render` aus einer Server Component ist HTTP 500 (Falle 9), und die Karte ist auf dem Telefon die richtige Form |
| antd `Tag color="error"` für „Defekt" | `colorError === colorPrimary` (Falle 3): der Defekt sähe aus wie die Primäraktion |
| `sonner` weiter betreiben (oder antd `message`) | in `src/app` gibt es kein Toast-Muster; ein Toast nach der Navigation erreicht Vorleseanwendungen nicht zuverlässig (§4.6.5) |
| Route Handler `GET /api/entleiher?q=` für die Vorschläge | zweiter anonymer Endpunkt mit eigener Ratenbegrenzung, und der Suchtext stünde in jeder Zugriffszeile (§4.3.4) |
| N Server-Action-Aufrufe wie heute N POSTs | ein Teilausfall lässt einen halb gebuchten Vorgang zurück, den niemand sieht (§4.3.2) |
| Suchtext in der URL halten | Rufnamen und Entleihernamen im Verlauf eines geteilten Telefons (§4.5.2) |
| Einen `STALE_GRACE_MS`-Ersatz in den Monolithen bauen | Vorrichtung ohne Gegner mit eigenem Fehlermodus; die Störungsklasse verschwindet strukturell (§4.7) |
| Offline-Warteschlange für Buchungen | neue Fachlichkeit mit offener Haftungsfrage, ausdrücklich nicht Teil dieser Spec (§4.9.4) |
| `lib/touch-targets.ts` als Maßquelle portieren | die Konstante (44/56/64/88) widerspricht den Klassen, die tatsächlich wirken (44/48/64/72) — zwei Maße wären falsch (§4.6.3) |
| `useMyLoans` mitnehmen | toter Code, nur im eigenen Test benutzt (§4.9.6) |

---

# 5. Die Verwaltung unter /admin

## 5.1 Was dieses Kapitel entscheidet

Die Verwaltung ist die Alt-Anwendung `radio-admin` — sieben Flächen, fünf Tabellen, 31 gemessene
`render`-Funktionen und **zwei** Rollen. Dieses Kapitel legt fest: welche Suite-Route jede Alt-Route
erbt, welche Datei entsteht, welche Client-Insel welche Props bekommt, was aus jeder der 13
TanStack-Query-Verwendungen wird, und welche Anweisung in jeder Datei **an erster Stelle** steht.

Nicht in diesem Kapitel: die Spalten selbst und ihre Einheiten (Kapitel 4), der Mechanismus des
Ausleih-Codes (Kapitel 3), der Ausleih-Zweig an `/` und der Ausfall-Puffer `STALE_GRACE_MS`
(Kiosk-Kapitel), das Runbook (Spec 2).

## 5.2 Die Flächen: sechs Alt-Menüpunkte, acht Suite-Routen

Der Bestand führt genau sechs Menüpunkte (`radio-admin/client/src/layout/AppLayout.tsx:31-36`) und
neun Routen (`radio-admin/client/src/routes/router.tsx:14-33`):

| Alt-Route | Alt-Datei | Suite-Pfad unter `radio.iuk-ue.de` | Suite-Datei unter `src/app/m/radio/admin/` |
|---|---|---|---|
| `/` Dashboard | `pages/DashboardPage.tsx` → `features/dashboard/Dashboard.tsx` | `/admin` | `page.tsx` |
| `/devices` Geräte | `features/devices/DeviceList.tsx` + `deviceColumns.tsx` | `/admin/geraete` | `geraete/page.tsx` + `geraete/GeraeteTabelle.tsx` |
| `/devices/:id` (Drawer) | `features/devices/DeviceDetailDrawer.tsx` | `/admin/geraete/[id]` | `geraete/[id]/page.tsx` |
| — (Endpunkt ohne Oberfläche, §5.10) | `server/src/routes/devices.ts:66` | `/admin/geraete/[id]/ereignisse` | `geraete/[id]/ereignisse/page.tsx` |
| `/ausleihen` | `features/loans/LoanList.tsx` | `/admin/ausleihen` | `ausleihen/page.tsx` |
| `/update` Update-Modus | `features/update/UpdateMode.tsx` | `/admin/update` | `update/page.tsx` |
| `/import` | `features/import/ImportWizard.tsx` | `/admin/import` | `import/page.tsx` |
| `/einstellungen` Tab 1 | `features/settings/SoftwareVersionsPage.tsx` | `/admin/versionen` | `versionen/page.tsx` |
| `/einstellungen` Tab 2 „API-Zugriff" | `features/settings/ApiTokensPage.tsx` | **entfällt** | — |
| — (neu, Kapitel 3) | — | `/admin/codes` | `codes/page.tsx` |
| CSV-Export (Anker, kein Menüpunkt) | `DeviceList.tsx:104-111` → `server/src/routes/export.ts:71` | `/m/radio/admin/geraete/export` | `geraete/export/route.ts` |
| `/login`, `/403`, `*` | `pages/LoginPage.tsx`, `ForbiddenPage.tsx`, `NotFoundPage.tsx` | **entfallen** | — |

**Vier Entscheidungen stecken in dieser Tabelle.**

1. **Die Tab-Leiste „Einstellungen" fällt.** Sie trägt heute genau zwei Reiter
   (`pages/SettingsPage.tsx:11-15`): „Softwareversionen" und „API-Zugriff". Der zweite entfällt mit
   Entscheidung 13 — `api_tokens` hat produktiv genau einen Konsumenten, den Alt-Kiosk, und der
   verschwindet mit dem Port. Ein Reiterpaar, von dem eine Hälfte wegfällt, ist keine Reiterleiste;
   „Softwareversionen" wird eine eigene Route. Nebenwirkung, die zählt: `Tabs` ist ein
   Client-Bauteil, `/admin/versionen` als eigene Seite ist eine Server Component mit **einer** Insel.
2. **Aus dem Detail-Drawer wird eine Seite.** Der Bestand rendert `/devices/:id` über dieselbe
   `DevicesPage` und legt einen `Drawer` darüber (`router.tsx:26`,
   `features/devices/DeviceDetailDrawer.tsx:128-136` mit `open` fest ohne Wert, also `true` (`:130`)) — der Drawer ist
   also schon heute eine eigene Route und kein Overlay-Zustand. In RSC ist die eigene Seite die
   einfachere Wahrheit: sie liest ihr Gerät serverseitig, statt es über einen zweiten Abruf
   nachzuladen. Der Schließen-Knopf (`DeviceDetailDrawer.tsx:49` `navigate('/devices')`) wird ein
   `next/link` zurück auf `/admin/geraete`.
3. **`/login`, `/403` und `*` entfallen ersatzlos.** Die Suite hat einen zentralen Login und
   antwortet auf fehlende Modulgruppe mit `notFound()` — nicht mit einer eigenen 403-Seite, weil die
   Existenz einer Verwaltungsroute auf dem falschen Host oder ohne Gruppe nicht verraten wird
   (`src/app/m/lagerbuch/_lib/host.ts:46-50`).
4. **`/admin/geraete/[id]/ereignisse` ist neu** und die einzige Fläche dieses Kapitels ohne Vorbild
   im Bestand — Begründung in §5.10.

Der Navigationsslot der Verwaltung trägt damit **sieben** Einträge (`_lib/nav.ts`, Vorbild
`src/app/m/lagerbuch/_lib/nav.ts`, gerendert über `VerwaltungsRahmen`, vgl.
`src/app/m/lagerbuch/_ui/VerwaltungsRahmen.tsx:6-17`): Übersicht · Geräte · Ausleihen ·
Update-Modus · Import · Softwareversionen · Codes. **Drei davon sind nur für die Admin-Stufe
sichtbar: Import, Softwareversionen und Codes** (§5.5) — `radioNav(stufe: RadioRolle)` nimmt die
Stufe als Parameter, statt eine feste Liste zu liefern. Das ist keine Erfindung, sondern
Wiederherstellung: der Bestand markiert `/einstellungen` schon heute mit `adminOnly: true`
(`radio-admin/client/src/layout/AppLayout.tsx:36`). Ohne diesen Parameter sieht eine Person der
Updater-Stufe drei Menüpunkte, die sie in ein `notFound()` führen — die Seiten dahinter rufen
`requireRadioAdmin()`, das Layout nur `requireRadioVerwaltung()`. `_lib/nav.test.ts` hält die
Zusage fest: **jeder für eine Stufe sichtbare Eintrag ist von dieser Stufe erreichbar**, geprüft
gegen die Rechtetabelle in §5.5.

**Zwei Formen desselben Pfades, und sie werden nie vermischt.** Die `href`-Werte der Navigation
tragen die **äußere** Form (`/admin`, `/admin/geraete`, …) — so hält es `lagerbuch/_lib/nav.ts:6-7`
ausdrücklich fest, damit `aktiverEintrag` sie per Suffix sowohl gegen äußere als auch gegen
umgeschriebene Pfade auflösen kann. `revalidatePath` dagegen bekommt **immer** die innere Form
`/m/radio/...` (§5.7), weil es den Router-Cache adressiert, nicht die Adresszeile.

**Jeder Eintrag braucht ein Zeichen, und das Zeichen ist typgebunden.** `SuiteNavItem.ikon` ist vom
Typ `NavIkonName` — eine **String-Union** in `src/core/shell/types.ts:18-21`, heute mit genau
fünfzehn Namen, alle aus `lagerbuch`. Vier davon passen wörtlich (`uebersicht`, `geraete`,
`import`, `tokens` für Codes); **drei kommen neu dazu**: `ausleihen`, `update`, `versionen`. Sie
werden in `types.ts` in die Union und in `src/core/shell/navIkonen.tsx:22-38` in `NAV_IKONEN`
eingetragen — Phosphor, wie die fünfzehn bestehenden. Das Paar ist **typerzwungen**
(`NAV_IKONEN: Record<NavIkonName, IconType>`), ein Union-Mitglied ohne Map-Eintrag ist ein
`typecheck`-Fehler; hierfür entsteht **kein** eigener Test. Was `navIkonen.test.tsx` heute prüft,
prüft es nur gegen die Lagerbuch-Navigation — der Riegel „jeder gesetzte Schlüssel hat eine
Komponente" wächst dort um `radioNav`, sonst deckt ihn niemand.
⚠️ `src/core/shell/icons.ts` ist etwas **anderes** und nicht der Ort dafür: jene Map bildet
`ModuleDef.icon` (ein Zeichen **je Modul**) auf `@ant-design/icons` für den App-Umschalter ab und
ist client-only. Der Registry-Eintrag von `radio` braucht dort seine Zeile (Kapitel 1) — fehlt sie,
trägt die Kachel **still** das Portal-Icon; genau das ist `files` am 30.07.2026 passiert
(`src/core/shell/icons.ts:21-27`).

## 5.3 Der Verzeichnisbaum

```
src/app/m/radio/admin/
  layout.tsx                          Host- + Personen-Riegel, VerwaltungsRahmen
  page.tsx                            Übersicht (Kennzahlen + veraltete Geräte)   §5.11
  actions.ts                          alle Verwaltungs-Server-Actions             §5.8
  geraete/
    page.tsx                          Lesepfad + Suchparameter-Vertrag
    GeraeteTabelle.tsx                "use client" — Insel 1 (die grosse)         §5.6
    GeraeteWerkzeugleiste.tsx         "use client" — Teil derselben Insel
    SpaltenWahl.tsx                   "use client" — Spalten-/Suchfeldauswahl
    FilterSchublade.tsx               "use client" — Drawer mit 10 Filtern
    NeuGeraetModal.tsx                "use client" — Anlegen (Formular)
    export/route.ts                   CSV-Export, Route Handler                   §5.9
    [id]/
      page.tsx                        Kopfdaten + Formular + Notiz + Löschen
      GeraetFormular.tsx              "use client" — Insel 6 (Falle 1)            §5.6
      NotizFeld.tsx                   "use client" — append-only Notiz
      GeraetLoeschen.tsx              "use client" — Popconfirm
      ereignisse/
        page.tsx                      Ereignisliste eines Geräts                  §5.10
        EreignisTabelle.tsx           "use client" — Insel 5
  ausleihen/
    page.tsx
    AusleihenTabelle.tsx              "use client" — Insel 2
  update/
    page.tsx
    UpdateSuche.tsx                   "use client" — Insel 7 (Suche + Karten)
  import/
    page.tsx
    ImportAssistent.tsx               "use client" — Insel 4 (vier Schritte)
  versionen/
    page.tsx
    VersionenTabelle.tsx              "use client" — Insel 3
    NeuVersion.tsx                    "use client" — Eingabe + Anlegen
  codes/                              Kapitel 3 (Fläche hier, Mechanik dort)
    page.tsx
    CodeTabelle.tsx                   "use client" — Insel 8

src/app/m/radio/_lib/
  host.ts                             istRadioHost / requireRadioHost / radioHostOderNull
  zugang.ts                           requireRadioAdmin / requireRadioVerwaltung (werfend)
                                      viewerOderNull / istRadioAdmin / istRadioUpdater (Praedikate)
  nav.ts                              radioNav(stufe) — drei Eintraege nur fuer die Admin-Stufe
  rollen.ts                           RADIO_ROLLE, UPDATER_FELDER, filterSchreibbareFelder
  lesepfade/geraete.ts                geraeteListe, geraet, geraeteKennzahlen, vorschlaege
  lesepfade/ausleihen.ts              ausleihenListe
  lesepfade/versionen.ts              versionenMitGeraetezahl, zielVersion
  lesepfade/ereignisse.ts             ereignisseFuerGeraet
  geraeteDiff.ts                      diffGeraet (aus radio-admin/shared/src/diff-device.ts)
  updateStand.ts                      berechneUpdateStand
  notiz.ts                            haengeNotizAn
  csv/spalten.ts                      EXPORT_SPALTEN, formatiereZelle
  csv/kopfzeilen.ts                   automatischeSpaltenzuordnung, IMPORTIERBARE_FELDER
  csv/einlesen.ts                     Kodierungserkennung (chardet/iconv-lite), Zeilen
  csv/klassifizieren.ts               klassifiziereZeile, klassifiziereZeilen
  _ui/verwaltung.module.css           eigene Klassen statt --ant-*-Variablen (Falle 2)
```

`_lib/` trägt **kein** `"use client"` — dort liegen die Werte und Konstanten, die Server Components
lesen (Falle 6: ein `WERT` aus einem als Client markierten Modul kommt in einer Server Component
nicht an, HTTP 500 für die ganze Seite, und Vitest kann es strukturell nicht sehen).

## 5.4 Der Riegel: erste Anweisung je Datei

Mit `requiresAuth: false` (Entscheidung 4) gibt es für `/m/radio/admin/*` **null** Middleware-Gating
— `decideRoute` gatet nach dem Modul aus dem Segment, nicht nach dem Host
(`src/core/routing.ts:58-66`), und `canAccess` steigt für ein Modul ohne Auth-Pflicht sofort mit
`true` aus (`src/core/registry.ts:239`). Das ist Falle 61 in der lagerbuch-Zählung, und sie trifft
hier **beide** Riegel: Host und Person.

`_lib/host.ts` ist die `lagerbuch`-Form, nicht die `files`-Form — drei Funktionen, weil beide Rollen
(Ausleihe an `/`, Verwaltung an `/admin`) auf **einem** Host liegen und die Rolle im **Pfad** steckt
(vgl. `src/app/m/lagerbuch/_lib/host.ts:42-56`):

```ts
export function istRadioHost(headers: Headers): boolean {
  return moduleForHost(resolveHost(headers))?.key === "radio";
}
export function requireRadioHost(headers: Headers): void {   // Layouts, Seiten — wirft notFound()
  if (!istRadioHost(headers)) notFound();
}
export function radioHostOderNull(headers: Headers): "radio" | null {  // Route Handler — wirft nie
  return istRadioHost(headers) ? "radio" : null;
}
```

**Kein `validateRadioHosts`** (0, 1 und ≥ 2 Hosts sind alle erlaubt — `radio-admin.iuk-ue.de` läuft
übergangsweise als Redirect-Ziel mit, Entscheidung 2; vgl. `lagerbuch/_lib/host.ts:94-97`) und
**kein** „kein Prod-Host konfiguriert → durchlassen"-Zweig (er wäre die Sperre, die sich selbst
abschaltet; `lagerbuch/_lib/host.ts:37-40` verzichtet ausdrücklich darauf). Das Prädikat über
`moduleForHost(resolveHost(...))` deckt `radio.localtest.me` in Dev und e2e ohne jede Env.

`_lib/zugang.ts` trägt den Personen-Riegel, `requireRadioHost` als **erste** Anweisung — Vorbild
`src/app/m/lagerbuch/_lib/zugang.ts:250-261`:

```ts
export async function requireRadioAdmin(): Promise<Viewer> {          // Admin-Stufe
  const kopf = await headers();
  requireRadioHost(kopf);                                  // erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel(kopf))}`);
  if (!istRadioAdmin(viewer)) { meldeFehlendeGruppe(viewer.sub, viewer.groups); notFound(); }
  merkeNutzer(getDb(), viewer);                            // NACH dem Riegel
  return viewer;
}

export async function requireRadioVerwaltung(): Promise<{ viewer: Viewer; rolle: RadioRolle }> {
  // identisch, aber istRadioAdmin(viewer) ODER istRadioUpdater(viewer); liefert die Stufe mit
}
```

`merkeNutzer` steht **nach** dem Riegel und ist keine Kür: sechs Audit-Spalten speichern den `sub`
und werden über `users` in einen Namen aufgelöst (`radio-admin/server/src/db/schema.ts:72-82`) —
ohne diese Zeile rendert jede Ereigniszeile eine nackte UUID.

**Die Aufruftabelle — verbindlich.** Route Handler haben **kein** Layout; Server Actions haben
keines über sich. Deshalb ruft jede Datei ihren Riegel selbst (Entscheidung 10):

| Datei | erste Anweisung |
|---|---|
| `admin/layout.tsx` | `requireRadioHost(await headers())`, danach `await requireRadioVerwaltung()` |
| `admin/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/geraete/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/geraete/[id]/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/geraete/[id]/ereignisse/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/ausleihen/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/update/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/import/page.tsx` | `await requireRadioVerwaltung()` |
| `admin/versionen/page.tsx` | `await requireRadioAdmin()` |
| `admin/codes/page.tsx` | `await requireRadioAdmin()` |
| `admin/geraete/export/route.ts` | `if (radioHostOderNull(request.headers) === null) return new Response(null, { status: 404 })`, danach `if (!istRadioAdmin(await viewerOderNull())) return new Response(null, { status: 403 })` — **beide nicht-werfend**, der Handler baut seine Antwort selbst |
| jede Action in `admin/actions.ts` | `await requireRadioVerwaltung()` bzw. `await requireRadioAdmin()` (Liste in §5.8) |

Die Zeile im Layout ist **keine** Redundanz zu den Seiten: sie hält den Aufruf auf einem fremden
Host von der Login-Weiche fern, damit ein anonymer Aufruf die Verwaltungsroute nicht über einen
vorgeschalteten Login-Umweg verrät (`lagerbuch/verwaltung/(arbeit)/layout.tsx:7-14` begründet
genau das). Die Zeile in jeder Action ist ebenfalls keine Redundanz — wer sie für doppelt hält und
entfernt, öffnet die Lücke, gegen die der Riegel gebaut ist.

*Kein Gate:* `src/core/routing.test.ts` schreibt das Middleware-Verhalten sogar ausdrücklich fest,
und Playwright fährt gegen **einen** `baseURL`. Eine vergessene Stelle ist typkorrekt und
lint-sauber. Der Schutz ist ein Quelltext-Scan (§5.13).

## 5.5 Zwei Stufen, weil der Bestand zwei Gruppen führt

**Der Befund.** `radio-admin` kennt zwei Rollen, und sie sind zwei **Pocket-ID-Gruppen**:
`OIDC_ADMIN_GROUP` mit Vorgabe `admin` und `OIDC_UPDATER_GROUP` mit Vorgabe `personal`
(`radio-admin/server/src/config.ts:28-29`). Die Abbildung ist eine reine Reihenfolge —
`radio-admin/shared/src/role.ts` gibt `admin` zurück, wenn die Admin-Gruppe dabei ist, sonst
`updater`, sonst `null`; `null` endet in `/403` (`radio-admin/server/src/auth/routes.ts:72`, `:76`).
Die Rolle steht danach im Sitzungs-JWT (`server/src/auth/session.ts:14`, geprüft `:27`).

**Die Rolle ist nicht kosmetisch, sie ist der Autorisierungsriegel auf Feldebene.**
`UPDATER_EDITABLE_FIELDS = ['softwareVersion', 'lastUpdatedAt', 'status']`
(`radio-admin/shared/src/editable-fields.ts:3`), erzwungen serverseitig über `filterEditableFields`;
`PATCH /devices/:id` trägt **kein** `requireRole`, und der Quellkommentar sagt warum: „the field
allowlist (not a route guard) is the authorization boundary — disallowed fields are silently
dropped, not rejected" (`radio-admin/server/src/routes/devices.ts:124-125`, Handler ab `:126`). Die
drei anderen Wege sind rollengegattert: `POST /devices` und `DELETE /devices/:id` verlangen
`requireRole('admin')` (`devices.ts:99`, `:188`), `POST /devices/:id/update-note` ist offen für beide
Rollen (`:162`), der CSV-Export verlangt `admin` (`server/src/routes/export.ts:71`).

**Die Entscheidung: zwei Stufen, und die Zweiteilung ist nicht wegzulassen.** Eine einzige Gruppe
hätte genau zwei Ausgänge, und beide sind falsch — entweder verliert die `personal`-Kohorte den
Update-Modus, oder sie bekommt Anlegen, Löschen und Export dazu. Also:

* Die **Admin-Stufe** hängt an `SUITE_ADMIN_GROUP_RADIO` (Entscheidung 9), gelesen über
  `requiredGroupsFor("radio")` aus der Registry.
* Die **Updater-Stufe** hängt an einer **zweiten, modulinternen** Gruppe. `src/core/registry.ts`
  kennt genau zwei Überschreibungen je Modul, `SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>`
  (`iuk-suite/CLAUDE.md:139-140`) — eine zweite Gruppe ist dort **nicht** vorgesehen. Sie ist damit
  ein **neuer Mechanismus mit eigener Datei und eigenem Test**: `_lib/rollen.ts` liest
  `process.env.SUITE_UPDATER_GROUP_RADIO`, und `_lib/rollen.test.ts` hält fest, dass ein leerer oder
  fehlender Wert die Updater-Stufe **schliesst** (niemand ist Updater), nicht öffnet.
* `radio` ignoriert den `isModuleAdmin`-Kurzschluss über `session.user.isAdmin` modulintern, wie
  `feedback` und `lagerbuch` (Entscheidung 9) — auf **beiden** Stufen. Ein Betreiber-Flag darf keine
  Updater-Rechte erzeugen.

⚠️ **Zu bestätigen (nur der Betreiber weiss es): die beiden Gruppennamen in Produktion.** `admin`
und `personal` sind **Vorgabewerte** in `config.ts:28-29`; die Produktionsumgebung kann beide
überschreiben. Ohne die echten Werte kann `SUITE_ADMIN_GROUP_RADIO`/`SUITE_UPDATER_GROUP_RADIO` nicht
gesetzt werden, und der Cutover sperrt entweder alle oder niemanden aus.

**Der Feldriegel wandert 1:1, samt stillem Verwerfen.** `_lib/rollen.ts` führt
`UPDATER_FELDER = ["softwareVersion", "lastUpdatedAt", "status"] as const` und
`filterSchreibbareFelder(rolle, patch)`; unerlaubte Felder werden **verworfen, nicht abgelehnt** —
genau wie heute. Begründung für die Übernahme: das Formular zeigt gesperrte Felder als `disabled`
(`radio-admin/client/src/features/devices/DeviceFields.tsx:67`, `:73`, `:80` … über alle
`Form.Item`s), ein Fehler statt eines Verwerfens wäre also nur bei manipulierten Anfragen
erreichbar und würde dort einen Riegel verraten, den ein Verwerfen still hält. Test:
`_lib/rollen.test.ts` — „updater: fremde Felder werden verworfen, erlaubte bleiben", mit **je Feld
unterschiedlichen** Werten, sonst besteht eine Vertauschung den Test.

**Was die Stufen dürfen** (Ableitung aus den vier Alt-Endpunkten, plus die neuen Flächen):

| Fläche / Aktion | Admin | Updater |
|---|---|---|
| Übersicht, Geräteliste, Gerätedetail, Ereignisse, Ausleihen | ja | ja |
| Update-Modus (`softwareVersion`, `lastUpdatedAt`, `status`) | ja | ja |
| Notiz anfügen | ja | ja |
| Gerät anlegen / löschen | ja | **nein** |
| Alle übrigen Gerätefelder ändern | ja | **nein** (Feldriegel) |
| CSV-Import (`classifyRows` nimmt die Rolle, `server/src/routes/import.ts:54`) | ja | **nein** |
| CSV-Export | ja | **nein** |
| Softwareversionen anlegen / Ziel setzen / löschen / sortieren | ja | **nein** |
| Code-Verwaltung | ja | **nein** |

**Zusage an Kapitel 3:** die Updater-Stufe erreicht die Code-Verwaltung **nicht**. Jede
codebezogene Seite und jede codebezogene Action ruft `requireRadioAdmin()` — nicht
`requireRadioVerwaltung()` —, weil Ausstellen und Sperren laut Betreiberantwort 6 allein den
radio-admins gehören.

**Der Frischegrad der Gruppen ist hingenommen, nicht übersehen.** Gruppen im JWT sind nur so frisch
wie der letzte erfolgreiche Token-Refresh, Takt also bis zu eine Stunde
(`iuk-suite/CLAUDE.md:151-156`). Für die Verwaltung ist das akzeptiert: der Zustand ist besser als
heute, denn `radio-admin` schreibt die Rolle **einmal beim Login** in ein eigenes HS256-Sitzungs-JWT
(`server/src/auth/routes.ts:85`) und zieht sie nie nach. Wo ein Sofortwiderruf wirklich gebraucht
wird, existiert er: bei den Ausleih-Codes über das Sperr-Flag mit DB-Nachprüfung (Kapitel 3).

## 5.6 Falle 9: die Client-Inseln

**31 ist eine Untergrenze, keine Zahl.** Gezählt wurden `render:`-Vorkommen:
`features/devices/deviceColumns.tsx` 15, `features/loans/LoanList.tsx` 5 (`:21`, `:28`, `:34`,
`:39`, `:45`), `features/settings/ApiTokensPage.tsx` 5, `features/settings/SoftwareVersionsPage.tsx`
4, `features/import/ImportWizard.tsx` 2 (`:271`, `:284`). Und die `<Table`-Träger sind eine
**andere** Fünferliste: `deviceColumns.tsx` hat 15 `render` und **kein** `<Table`, `DeviceList.tsx`
hat ein `<Table` (`:175`) und **kein** `render:`.

Dieselbe Fehlerklasse, aber **nicht** in den 31 enthalten — jede dieser Stellen reicht ebenfalls eine
gewöhnliche Funktion über die RSC-Grenze:

* `DeviceList.tsx:198` `renderItem={(device) => …}` — der mobile `<List>`-Zweig; ebenso
  `LoanList.tsx:95` und `features/dashboard/Dashboard.tsx` (`renderItem` der Liste veralteter Geräte).
* `DeviceList.tsx:182-185` `onRow={(record) => ({ onClick: …, style: … })}` — gibt einen Handler
  zurück.
* `DeviceList.tsx:181` `onChange={handleTableChange}` und `:192-197` `pagination.onChange`;
  `LoanList.tsx:82` dasselbe.
* Die Spalten-`render` in `SoftwareVersionsPage.tsx`, die `handleMove`, `handleDelete`,
  `handleSetTarget`, `rows.length` und `reorder.isPending` **einfangen** — sie sind nicht nur
  Funktionen über die Grenze, sie schleppen Zustand mit.

**Daraus die Regel dieses Kapitels: die Inselgrenze ist die Fläche, nicht die Spaltenliste.** Alles
von der Werkzeugleiste bis einschliesslich des Tabellen-/Listenzweigs liegt in **einer**
`"use client"`-Insel je Fläche; die Insel bekommt ausschliesslich **serialisierbare** Zeilen und
definiert ihre `render`-Funktionen selbst. Das ist zugleich der einzige Zuschnitt, in dem
`Grid.useBreakpoint()` (`DeviceList.tsx:36`) und `usePersistentState` (`:49-54`) überhaupt leben
können — beide sind Client-Hooks. Server Actions dürfen als einzige über die Grenze, aber
**direkt importiert**, nicht als Prop durchgereicht (Vorbild
`src/app/m/aufgaben/_ui/RoutinenTabelle.tsx:4` importiert `routineRuhenAction` selbst).

### 5.6.1 Die acht Inseln

| # | Datei | Props (nur serialisierbar) | erbt von | erzwungen durch |
|---|---|---|---|---|
| 1 | `geraete/GeraeteTabelle.tsx` (+ `GeraeteWerkzeugleiste`, `SpaltenWahl`, `FilterSchublade`, `NeuGeraetModal` im selben Client-Teilbaum) | `{ zeilen: GeraetZeile[]; gesamt: number; seite: number; seitenGroesse: number; sortierung: string \| null; filter: GeraetFilter; vorschlaege: Record<Vorschlagsfeld, string[]>; darfAnlegen: boolean; darfExportieren: boolean }` | `deviceColumns.tsx` (15 `render`) **+** `DeviceList.tsx` | Falle 9 |
| 2 | `ausleihen/AusleihenTabelle.tsx` | `{ zeilen: AusleihZeile[]; gesamt: number; seite: number }` | `LoanList.tsx` (5 `render`, `:11-13` `StatusTag`) | Falle 9 |
| 3 | `versionen/VersionenTabelle.tsx` | `{ zeilen: VersionZeile[] }` | `SoftwareVersionsPage.tsx` (4 `render`) | Falle 9 |
| 4 | `import/ImportAssistent.tsx` | `{}` — der Assistent hält seinen Schrittzustand selbst | `ImportWizard.tsx` (2 `render`, `:33-35` vier Schritte) | Falle 9 + Falle 1 |
| 5 | `geraete/[id]/ereignisse/EreignisTabelle.tsx` | `{ zeilen: EreignisZeile[] }` | neu (§5.10) | Falle 9 |
| 6 | `geraete/[id]/GeraetFormular.tsx` | `{ geraet: GeraetFormWerte; rolle: RadioRolle; vorschlaege: Record<Vorschlagsfeld, string[]> }` | `DeviceFields.tsx` + `DeviceEditForm.tsx` + `DeviceFormModal.tsx` | **Falle 1** (nicht 9) |
| 7 | `update/UpdateSuche.tsx` | `{ versionen: string[]; zielVersion: string \| null; gesamt: number; aufZiel: number }` | `UpdateMode.tsx` + `UpdateDeviceCard.tsx` | Falle 1 (`Input.Search`, `Typography.Title`) |
| 8 | `codes/CodeTabelle.tsx` | Kapitel 3 | — | Falle 9 |

**Insel 1 ist der teuerste Posten der Spec, und ihr Zuschnitt ist die eine Stelle, an der man ihn
verfehlt.** Die Geräteliste ist heute auf zwei Dateien aufgeteilt: `deviceColumns.tsx` hält die 15
`render`-Funktionen in `COLUMN_DEFS` (Einträge auf `:17-34`, davon drei ohne `render`), `DeviceList.tsx`
hält das `<Table>` und ruft `buildColumns(visibleColumns)` (`DeviceList.tsx:55`,
`deviceColumns.tsx:43-46`). **Beide gehören in dieselbe Insel.** Bleibt `deviceColumns.tsx` ein
serverseitiges Modul, wandern die 15 Funktionen weiter als Prop über die Grenze und ergeben genau
`Error: Functions cannot be passed directly to Client Components`
(`iuk-suite/CLAUDE.md:52-70`). `COLUMN_DEFS` wird also Teil von `GeraeteTabelle.tsx` bzw. eines
`"use client"`-Nachbarmoduls — und **nicht** von `_lib/`, weil `_lib/` bewusst client-frei ist
(Falle 6).

**Insel 6 entsteht unabhängig von jeder Tabelle.** `DeviceFields.tsx` ist 194 Zeilen fast
ausschliesslich `Form.Item` (`:44`, `:61`, `:71`, `:79`, `:84`, `:107`, `:129`, `:138`, `:143`,
`:152` …) — Compound-Zugriff auf antd, in einer Server Component HTTP 500 (Falle 1). Dasselbe
betrifft `Input.Search` (`DeviceList.tsx:136`, `UpdateMode.tsx`), `Space.Compact`
(`DeviceList.tsx:135`, `SoftwareVersionsPage.tsx`), `Descriptions.Item`
(`DeviceDetailDrawer.tsx:78-100`), `List.Item`/`List.Item.Meta` (`DeviceList.tsx:199`,
`Dashboard.tsx`), `Typography.Title`/`Typography.Text`/`Typography.Link`, `Upload.Dragger`
(`ImportWizard.tsx:150`) und `Tabs` (`SettingsPage.tsx:11` — entfällt mit §5.2). `Card`,
`Statistic`, `Result`, `Progress`, `Table`, `Tag` sind sicher (`iuk-suite/CLAUDE.md:13`) — deshalb
braucht die Übersicht in §5.11 **keine** Insel.

### 5.6.2 Was „serialisierbar" hier heisst

Jede Insel bekommt vorformatierte Zeilen, keine Rohdaten und keine `Date`-Objekte — Vorbild
`src/app/m/lagerbuch/verwaltung/(arbeit)/LetzteBuchungenTable.tsx:7-14`, dessen
`UebersichtJournalZeile` bereits `zeitText` und `deltaTon` trägt statt eines Zeitstempels und einer
Farbe. Für `radio`:

```ts
export type GeraetZeile = {
  id: string; issi: string; tei: string | null; rufname: string | null; opta: string | null;
  funktion: string | null; geraeteTyp: string | null; status: string; lagerort: string | null;
  hersteller: string | null; bedieneinheit: string | null; geraeteFunktionen: string | null;
  zuordnung: string | null; seriennummer: string | null;
  ausleihbar: boolean; alamos: boolean;
  softwareVersion: string | null;
  updateStand: "aktuell" | "veraltet" | "unbekannt";
  hatAbweichung: boolean;
  letztesUpdateText: string;            // vorformatiert, siehe Kapitel 4 zur Spalte
};
```

`updateStand` wandert **als Wort**, nicht als Farbe — die Farbzuordnung liegt in der Insel
(`components/UpdateStatusBadge.tsx` hält heute `green`/`red`/`default`). ⚠️ **Falle 3:**
`colorError === colorPrimary === #c8000f`; ein rotes Statuszeichen auf einer Datenfläche sieht aus
wie eine Primäraktion. Entscheidung: „veraltet" trägt in der Suite `color="warning"`, „aktuell"
`color="success"`, „unbekannt" `default`; Rot bleibt **allein** den zerstörenden Knöpfen (`danger`
auf Löschen, `DeviceDetailDrawer.tsx:119`, `SoftwareVersionsPage.tsx` Löschen-Knopf). Der Alt-Rotton
`#cf1322` in `Dashboard.tsx` (Kennzahl „Veraltet") entfällt aus demselben Grund.

### 5.6.3 Icons: 17 Einzelvorgänge, kein Suchen-und-Ersetzen

`radio-admin` benutzt `react-icons ^5.4.0` (`radio-admin/client/package.json:22`), in der Suite ohne
Entsprechung. Gemessene Verwendungen: `FiAlertTriangle`, `FiCheck`, `FiFilter`, `FiPlus`,
`FiDownload`, `FiColumns`, `FiArrowUp`, `FiArrowDown`, `FiTarget`, `FiTrash2`, `FiUpload`, `FiRadio`,
`FiCheckCircle`, `FiHelpCircle`, `FiRefreshCw`, `FiGrid`, `FiSettings`, `FiClipboard`. Jedes davon
wird ein Eintrag in `src/core/shell/icons.ts` **oder** ein Inline-SVG in der Insel — ⚠️ **Falle 7:**
`@ant-design/icons` in einer Server Component ergibt HTTP 500 **beim Import**, und `"use client"`
behebt das nicht, es macht es still. Weil alle 18 Symbole ohnehin in Inseln sitzen, ist der Weg hier
frei; `src/core/shell/icons.test.ts` riegelt es repo-weit ab. **Regel für dieses Kapitel:** kein
Symbol wird in einer Datei ohne `"use client"` importiert, auch nicht in `_lib/`.

⚠️ **Falle 4:** `SoftwareVersionsPage.tsx` setzt `size="small"` auf allen Knöpfen der Aktionsspalte.
`size` wird auf Bedienelementen **gar nicht** gesetzt; die Verwaltung läuft in `FullShell` mit
`controlHeight: 44` (`ARBEITSDICHTE` in `core/theme/theme.ts`), und das gilt auch auf dem Telefon.
Die vier Knöpfe der Reihenfolge-/Aktionsspalte bekommen stattdessen `scroll={{ x: "max-content" }}`
Platz (ohne `scroll` bricht eine antd-Tabelle auf 390 px, `RoutinenTabelle.tsx:33-34`).

## 5.7 TanStack Query fällt weg — 13 Verwendungen, je Fall

**Gezählt und geprüft:** `radio-admin/client/src/app/queryClient.ts:8-9` setzt
`staleTime: 30_000` und **`refetchOnWindowFocus: false`**; `refetchInterval`,
`useInfiniteQuery`, `networkMode` und `gcTime` kommen im Client **nirgends** vor. Damit ist der
Befund für dieses Kapitel eng und positiv: **`revalidatePath` ist für die Verwaltung ein
vollständiger Ersatz.** Die in der Portierungsanalyse beschriebene Frischhaltung über
`refetchOnWindowFocus: 'always'`/`refetchOnReconnect: 'always'`, `gcTime` 24 h und
`networkMode: 'offlineFirst'` gehört zu `radio-inventar/apps/frontend/src/lib/queryClient.ts`, also
zum **Kiosk** — nicht zu `radio-admin`. **Zusage an das Kiosk-Kapitel:** die Frage „was ersetzt
Fokuswechsel, Reconnect und Cache-zuerst" wird dort entschieden, nicht hier; für `/admin` entsteht
kein Ersatzbedarf. Einzige Ausnahme mit Auswirkung auf die Verwaltung: das drei- bis
fünfsekündige Fenster nach einer Änderung, in dem der Bestand optimistisch anzeigte (siehe unten).

| Alt-Hook / Stelle | Art | wird in der Suite zu | `revalidatePath` |
|---|---|---|---|
| `hooks/useDevices.ts:62` `['devices', params]` | Query | RSC-Lesepfad `geraeteListe(db, params)` in `geraete/page.tsx`; Parameter aus `searchParams` | — |
| `hooks/useDevice.ts:19` `['device', id]` | Query | RSC-Lesepfad `geraet(db, id)` in `geraete/[id]/page.tsx` | — |
| `hooks/useLoans.ts:27` `['loans', params]` | Query | RSC-Lesepfad `ausleihenListe(db, params)` | — |
| `hooks/useSuggestions.ts:9` `['suggestions', field]` (`staleTime: 60_000`, `:17`) | Query | **ein** Lesepfad `vorschlaege(db)` liefert alle acht Feldlisten in einem Aufruf statt in acht; er wird pro Seite gerufen (Liste und Detail sind zwei Routen, also zwei Lesevorgänge) und als Prop in Insel 1 bzw. 6 gereicht; kein Client-Abruf mehr | — |
| `hooks/useDashboardStats.ts:17-20` | 4 Queries mit `pageSize: 1` | **eine** Abfrage mit `GROUP BY` (`geraeteKennzahlen(db)`). Die vier Rundläufe waren eine Folge der HTTP-Grenze, nicht der Fachlichkeit | — |
| `hooks/useSoftwareVersions.ts:20` `versionsQueryKey` (`staleTime: 60_000`, `:22`) | Query | RSC-Lesepfad `versionenMitGeraetezahl(db)` | — |
| `hooks/useApiTokens.ts:32` `tokensQueryKey` | Query | **entfällt** (Entscheidung 13) | — |
| `auth/useAuth.ts:23` (`staleTime: 5 * 60_000`) | Query | **entfällt** — die Rolle kommt aus `auth()` bzw. `requireRadioVerwaltung()` | — |
| `hooks/useCreateDevice.ts` (invalidiert `devices`, `suggestions`, `software-versions`, `:11-13`) | Mutation | `geraetAnlegenAction` | `/m/radio/admin/geraete`, `/m/radio/admin`, `/m/radio/admin/versionen` |
| `hooks/useUpdateDevice.ts` (invalidiert `['device', id]` + `devices`, `:38-39`) | Mutation | `geraetAendernAction` | `/m/radio/admin/geraete/[id]`, `/m/radio/admin/geraete`, `/m/radio/admin` |
| `hooks/useDeleteDevice.ts:14-15` | Mutation | `geraetLoeschenAction` | `/m/radio/admin/geraete`, `/m/radio/admin`; danach `redirect("/m/radio/admin/geraete")` |
| `hooks/useUpdateNote.ts:15-16` | Mutation | `notizAnfuegenAction` | `/m/radio/admin/geraete/[id]`, `/m/radio/admin/geraete` |
| `hooks/useSoftwareVersions.ts:36`, `:44`, `:52`, `:60` (4 Mutationen, alle über `invalidateVersionsAndDevices`, `:30-32`) | Mutationen | `versionAnlegenAction`, `versionZielSetzenAction`, `versionLoeschenAction`, `versionenSortierenAction` | `/m/radio/admin/versionen`, `/m/radio/admin/geraete`, `/m/radio/admin` |
| `hooks/useImportParse.ts`, `hooks/useImportCommit.ts`, `ImportWizard.tsx:128` | Mutationen | `importVorschauAction`, `importSchreibenAction` (§5.9) | nach dem Schreiben: `/m/radio/admin/geraete`, `/m/radio/admin`, `/m/radio/admin/versionen` |

Der `invalidateQueries`-Fächer ist die Vorlage für die `revalidatePath`-Listen: dass
`useCreateDevice.ts:11-13` **drei** Schlüssel invalidiert, ist die gemessene Aussage „ein neues
Gerät verändert Liste, Vorschläge und Versionsliste" — sie steht in der Suite als drei
`revalidatePath`-Aufrufe da, nicht als einer.

**Zwei bewusste Verluste, ausgeschrieben.**

1. **Die optimistische Anzeige entfällt.** `useUpdateDevice.ts:15-30` schreibt den Patch sofort in
   den Cache und nimmt `softwareVersion`/`lastUpdatedAt` bewusst aus, weil das abgeleitete
   `updateStatus`-Zeichen sonst veraltet stehenblieb (Kommentar `:20-23`). Mit Server Action und
   `revalidatePath` ist der Grund des Ausschlusses weg — derselbe Prozess rechnet den Update-Stand
   neu, während die Antwort entsteht. Der Preis: das Formular quittiert erst nach dem Rundlauf. Bei
   einer SQLite im selben Prozess ist das der bessere Tausch als eine zweite Wahrheit im Client.
2. **`usePersistentState` bleibt — aber nur für Darstellung.** `ra-device-columns` (sichtbare
   Spalten) und `ra-device-search-fields` (Suchfelder) liegen heute im `localStorage`
   (`DeviceList.tsx:49-54`). Die sichtbaren Spalten sind reine Darstellung und bleiben lokal. Die
   **Suchfelder nicht:** sie gehen als `params.searchFields` an den Server
   (`DeviceList.tsx:70-71`), also muss der Server sie sehen. Sie wandern in die Suchparameter.

### 5.7.1 Der Suchparameter-Vertrag von `/admin/geraete`

Der Bestand hält Suche, Filter, Sortierung und Seite in `useState` (`DeviceList.tsx:42-63`) und
schiebt sie per Effekt in die Abfrage. In RSC liest die Seite sie aus `searchParams`:

`q` (Freitext, 300 ms entprellt in der Insel — `DeviceList.tsx:66-75`) · `sf` (Suchfelder,
kommagetrennt) · `seite` · `sortierung` (`schluessel:asc|desc`, gebaut wie
`DeviceList.tsx:120-123`) · die zehn Filter aus `DeviceFilterDrawer` (`updateStand`, `status`,
`lagerort`, `geraeteTyp`, `funktion`, `hersteller`, `geraeteFunktionen`, `ausleihbar`, `alamos`,
`hatAbweichung` — die Liste ist gemessen an `DeviceList.tsx:82-91`, wo jeder Schlüssel **einzeln**
abgebildet wird und ausdrücklich nicht per Spread, „so that clearing a filter actually removes it").
Seitengrösse bleibt fest bei 20 (`DeviceList.tsx:28`, `showSizeChanger: false` `:168`).

`export const dynamic = "force-dynamic"` in `geraete/page.tsx`, wie
`lagerbuch/verwaltung/(arbeit)/journal/page.tsx:24`.

## 5.8 Die Server Actions

Alle in `admin/actions.ts`, jede mit ihrer ersten Anweisung, jede mit `"use server"` am Dateikopf.
Rückgabe durchgehend `{ ok: true } | { ok: false; fehler: string }` — Meldungstexte wörtlich aus dem
Bestand (§5.12).

| Action | Signatur | erste Anweisung | Ereignis-`quelle` |
|---|---|---|---|
| `geraetAnlegenAction` | `(werte: GeraetEingabe) => Promise<Ergebnis<{ id: string }>>` | `await requireRadioAdmin()` | `create` |
| `geraetAendernAction` | `(id: string, patch: GeraetPatch) => Promise<Ergebnis>` | `const { viewer, rolle } = await requireRadioVerwaltung()` | `manual` |
| `geraetLoeschenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `notizAnfuegenAction` | `(id: string, text: string) => Promise<Ergebnis>` | `await requireRadioVerwaltung()` | `update-note` |
| `versionAnlegenAction` | `(wert: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionZielSetzenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionLoeschenAction` | `(id: string) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `versionenSortierenAction` | `(ids: string[]) => Promise<Ergebnis>` | `await requireRadioAdmin()` | — |
| `importVorschauAction` | `(datei: FormData) => Promise<Ergebnis<VorschauErgebnis>>` | `await requireRadioAdmin()` | — |
| `importSchreibenAction` | `(zuordnung: Spaltenzuordnung, zeilen: string[][]) => Promise<Ergebnis<ImportBilanz>>` | `await requireRadioAdmin()` | `csv-import` |

**Die vier `quelle`-Werte sind abschliessend** — `manual | csv-import | create | update-note`
(`radio-admin/server/src/repos/deviceRepo.ts:219`). Jeder Schreibweg setzt seinen Wert **bewusst**;
ein fünfter Wert ist ein Datenmodellbruch. **Zusage an Kapitel 4:** die Spalte trägt genau diese
vier Werte, und die Action-Tabelle oben ist die vollständige Liste der Erzeuger.

**Jede Änderung schreibt Ereigniszeilen, eine je Feld** (`deviceRepo.ts:222-244`), und **eine
Änderung ohne echten Wertunterschied erzeugt kein Ereignis** (`if (diffs.length === 0) return;`).
`geraetAendernAction` folgt der Alt-Reihenfolge exakt, weil sie eine Transaktion ist
(`server/src/routes/devices.ts:146-153`): Rolle-Filter → `diffGeraet` → bei leerem Diff **früher
Ausstieg mit dem unveränderten Gerät** → sonst in **einer** Transaktion neue Softwareversion
registrieren, Gerät schreiben, Ereignisse schreiben. Der Grund für die Transaktion steht im
Bestand: eine ISSI-Kollision muss das Ganze zurückrollen.

**`notizAnfuegenAction` ist kein Sonderfall von „ändern".** Sie hat im Bestand einen eigenen
Endpunkt (`devices.ts:162`), einen eigenen `quelle`-Wert und eine eigene Regel: sie **hängt an**,
überschreibt nie, und benutzt **einen** Zeitstempel für die angehängte Zeile und ihr Ereignis, damit
beide nicht über eine Mitternachtsgrenze auseinanderlaufen (`devices.ts:172-176`). Beides wandert
wörtlich mit, inklusive des Ereignisses mit `oldValue = bisherige Notiz` und `newValue = nur die
neue Zeile` (`devices.ts:180`).

⚠️ **Was `geraetLoeschenAction` anrichtet, entscheidet Kapitel 4.** `DELETE /devices/:id`
(`devices.ts:188`) löscht die Zeile; `device_events` hängt am Gerät, **Leihen tragen keinen
Fremdschlüssel**, ein gelöschtes Gerät kann also eine Leihzeile verwaisen lassen. **Zusage an
Kapitel 4:** dieses Kapitel setzt voraus, dass dort entschieden ist, ob das Löschen bei aktiver
Leihe **abgelehnt** wird; die Fläche ist darauf vorbereitet — `GeraetLoeschen.tsx` zeigt die
Ablehnung als Meldung im `Popconfirm`-Zweig, statt den Knopf zu verstecken.

## 5.9 CSV: Import zweiphasig, Export als Route Handler

**Der Import bleibt zweiphasig, und das ist keine Formsache.** Der Bestand hat
`POST /import/parse` (Vorschau) und `POST /import/commit` (Schreiben)
(`radio-admin/server/src/routes/import.ts:17`, `:40`), dazwischen
`classifyRows({ rows, mapping, existingByIssi, role })` (`:54`). Der Assistent führt vier Schritte
(`ImportWizard.tsx:33-35`: `upload | mapping | preview | done`) und ruft `commit` **zweimal**: einmal
mit `dryRun: true` für die Vorschau (`:107`), einmal mit `false` zum Schreiben (`:123`). Eine
einphasige Suite-Fassung („Datei hoch, fertig") ist kein Port, sondern ein anderes Produkt — der
Import ist der Weg, über den Geräte tatsächlich in den Bestand kommen.

In der Suite: `importVorschauAction` liest die Datei (Kodierungserkennung über `chardet`/`iconv-lite`
wandert als echte Fachlogik mit, `_lib/csv/einlesen.ts`), gibt Spaltennamen und Rohzeilen zurück und
schreibt **nichts**; `ImportAssistent.tsx` hält Schritt und Zuordnung; `importSchreibenAction`
klassifiziert erneut und schreibt in **einer** Transaktion. `Upload.Dragger` verhindert wie heute
den Auto-POST (`ImportWizard.tsx:156` `return false`), aber die Datei geht jetzt als `FormData` in
die Action statt an einen Endpunkt.

Die automatische Spaltenzuordnung (`autoMapColumns`, `ImportWizard.tsx:98`) und die Klassifikation
je Zeile wandern nach `_lib/csv/`. ⚠️ Die **Wörter** der Klassifikation (neu / geändert /
unverändert) sind aus `classify-import-row.ts` zu übernehmen, nicht zu erfinden; sie stehen als
Text in der Vorschauspalte (`ImportWizard.tsx:271`).

**Der Export ist ein Route Handler, keine Action.** Heute ist es ein programmatischer
gleichherkünftiger GET-Anker (`DeviceList.tsx:104-111`) auf
`GET /api/devices/export` mit `requireRole('admin')` (`server/src/routes/export.ts:71`). In der
Suite: `admin/geraete/export/route.ts`, erste Anweisung `radioHostOderNull(request.headers)` — die
**nicht-werfende** Form mit eigener 404, weil `notFound()` keine brauchbare Antwort auf einen
Dateiabruf ist (`lagerbuch/_lib/host.ts:52-56`).

⚠️ **Die Zugangsprüfung im Handler ist ebenfalls nicht-werfend, und das ist der Punkt, an dem ein
naiver Plan falsch abbiegt.** `requireRadioAdmin()` wirft — `redirect()` bei fehlender Sitzung,
`notFound()` bei fehlender Gruppe —, und keines von beiden ist eine brauchbare Antwort auf einen
Dateiabruf. Der Handler benutzt deshalb das **Prädikat**
`istRadioAdmin(await viewerOderNull())` (Bauform wie `lagerbuch/_lib/zugang.ts:74`, `:112`) und
baut seine `403` selbst. Dieselbe Trennung wie bei den Host-Funktionen: werfende Form für Seiten,
Prädikat für Handler.

**Der Rundlauf-Vertrag ist tragend und wandert wörtlich:** `EXPORT_SPALTEN` in fester Reihenfolge
mit deutschen Kopfzeilen, die über die automatische Zuordnung **zurück** auf ihr Feld abbilden
(`export.ts:16` mit 19 Einträgen, Begründung `:11-15`: „so that the exported file re-imports cleanly
through the wizard"); Trennzeichen `;`; führendes UTF-8-BOM, damit Excel die Datei richtig öffnet
(`export.ts:9`); `formatiereZelle` mit drei Regeln (`export.ts:45-52`): Wahrheitswerte → `x` bzw.
leer (nur `true` und `null` laufen rund), `lastUpdatedAt` → UTC-`YYYY-MM-DD`, alles andere wörtlich,
`null` → leer.

⚠️ **Die Zeitzone des Datumsfeldes ist ein Spaltenproblem, nicht ein Flächenproblem.** Export und
Import rechnen heute in UTC (`export.ts:51`), die Oberfläche aber schreibt **lokale** Mitternacht
(`DeviceFields.tsx:163-164` `DatePicker`, gesendet als `values.lastUpdatedAt.valueOf()` in
`DeviceFormModal.tsx:63` und `DeviceEditForm.tsx:61`) — in Europe/Berlin der Vortag. **Kapitel 4
entscheidet die Spalte.** Dieses Kapitel schuldet dazu genau zwei Zusagen: das Formularfeld sendet
den Tag als Zeichenkette `YYYY-MM-DD`, **nicht** als Millisekundenwert eines dayjs-Tagesanfangs; und
`formatiereZelle` und das Formular lesen ihre Umrechnung aus **einer** Funktion in
`_lib/csv/spalten.ts`, nicht aus zwei.

Test: `_lib/csv/rundlauf.test.ts` — „exportiere 3 Geräte, lies das Ergebnis mit der
Spaltenerkennung zurück, erhalte dieselben Felder", mit **je Feld unterschiedlichen** Werten. Der
Bestand hat diesen Test (`exportRoundTrip`, benannt in `export.ts:14`); er wandert mit.

## 5.10 Geräte-Ereignisse: der Endpunkt ohne Oberfläche

**Befund.** `GET /devices/:id/events` existiert (`radio-admin/server/src/routes/devices.ts:66`), und
`rg -n 'events' radio-admin/client/src` liefert **keinen** Konsumenten — der einzige Treffer ist ein
Kommentar über antd-Tabellenereignisse (`DeviceList.tsx:113`). Die Alt-Anwendung schreibt also seit
Anfang an eine Ereigniszeile je geändertem Feld (`deviceRepo.ts:222-244`) und zeigt sie **nirgends**.

**Entscheidung: die Fläche entsteht.** Begründung: Kapitel 4 importiert `device_events` als
Historie, und eine importierte Tabelle, die niemand lesen kann, ist ein Datenfriedhof mit
Wartungskosten. Die Fläche kostet eine Seite und eine Insel; sie beantwortet die Frage, die in der
Verwaltung eines Geräteparks am häufigsten gestellt wird („wer hat das wann geändert"). **Sie ist
ausdrücklich neu, kein 1:1-Port** — es gibt kein Vorbild, gegen das man sie prüfen könnte, also
prüft sie sich gegen das Datenmodell: sechs Spalten (`field`, `oldValue`, `newValue`, `changedBy`,
`changedAt`, `source`, `deviceRepo.ts:230`).

`geraete/[id]/ereignisse/page.tsx` liest `ereignisseFuerGeraet(db, id, grenze)` — Grenze 200,
neueste zuerst, ohne Blätterung (bei einer Zwei-Monats-Retention auf den Leihen und wenigen hundert
Geräten ist eine Blätterung Ballast). `EreignisTabelle.tsx` zeigt vier Spalten: Zeit (vorformatiert),
Feld (deutsches Etikett aus derselben Etikettenliste, die das Formular benutzt —
`DeviceFields.tsx` hält sie heute als `label`-Attribute), Änderung („alt → neu", leere Werte als
`—`), Wer (aufgelöster Name aus `users`, roher `sub` nur im `title`). `source` wird als `Tag`
gezeigt, mit den vier Wörtern in Klartext: „von Hand", „CSV-Import", „angelegt", „Abweichung".

Verlinkt wird sie von `geraete/[id]/page.tsx` als Textlink „Änderungen anzeigen" — nicht als Reiter,
weil `Tabs` eine Insel erzwingen würde, die die Detailseite sonst nicht braucht.

## 5.11 Auswertungen: die Übersicht

Der Bestand zeigt vier Kennzahlenkarten (Geräte gesamt · Aktuell · Veraltet · Unbekannt) und eine
Liste der fünf jüngsten veralteten Geräte (`features/dashboard/Dashboard.tsx`). Die vier Kennzahlen
entstehen heute aus **vier** Abfragen mit `pageSize: 1`, von denen nur `total` gelesen wird
(`hooks/useDashboardStats.ts:17-20`); im selben Prozess ist das **eine** Abfrage mit `GROUP BY`
(`geraeteKennzahlen(db)`).

`admin/page.tsx` bleibt **ohne Insel**: `Card`, `Statistic` und `Tag` sind in einer Server Component
sicher (`iuk-suite/CLAUDE.md:13`). Damit das so bleibt, werden die klickbaren Karten **Links** statt
`onClick`-Karten (`Dashboard.tsx:58-62` benutzt heute `onClick` + `navigate`): `next/link` um die
`Card`, Ziel `/m/radio/admin/geraete?updateStand=veraltet`. Dasselbe für „Alle veralteten anzeigen"
(heute `Typography.Link` mit `onClick`). Die Liste der fünf Geräte wird eine schlichte
`<ul>`-Struktur mit Links — **kein** `List.Item.Meta` (Falle 1) und kein `renderItem` (Falle 9).

Weitere Auswertungen entstehen nicht. Der Update-Fortschritt („x von y auf Zielversion" mit
`Progress`, `UpdateMode.tsx`) bleibt dort, wo er hingehört: im Update-Modus.

## 5.12 Trägt „Vorlage statt Wegwerfware"? Für Semantik ja, für Code nein

`radio-admin` sitzt auf **antd `^5.22.0`** (`radio-admin/client/package.json:18`), die Suite auf
**`^6.5.3`** (`iuk-suite/package.json:25`) — ein Major-Sprung. Der Major ist aber der **kleinere**
Bruch. Die grösseren sind drei:

1. **Das Ausführungsmodell.** `radio-admin` ist eine Vite-SPA mit `react-router-dom ^7.1.0`
   (`package.json:23`) und `@tanstack/react-query ^5.62.0` (`:17`); **alle** 37 `.tsx` sind
   Client-Komponenten mit imperativem Datenholen. Die Suite ist RSC-first (`next` 16.3.0,
   `iuk-suite/package.json:33`). Jede der oben aufgeführten `render`-Stellen muss in eine Insel
   gehoben werden — das ist Umbau, nicht Umzug.
2. **`@ant-design/v5-patch-for-react-19` (`radio-admin/client/package.json:15`) wird mit antd 6
   gegenstandslos** und darf nicht mitkopiert werden.
3. **`react-icons` hat keine Entsprechung** (§5.6.3), 18 Einzelvorgänge.

**Ehrliches Urteil: die bestehende SPA ist Lesequelle, nicht Codebasis.** Sie trägt als Vorlage
für **WAS** gezeigt wird — und da trägt sie viel, präziser als jede Nacherzählung. Wörtlich
übernommen werden:

* die 18 Spaltendefinitionen samt Etiketten und Sortierbarkeit (`deviceColumns.tsx:17-34`,
  sortierbar: `rufname`, `issi`, `updateStatus`, `status`, `location`, `softwareVersion` — die
  Kommentarzeile `:12-15` nennt die Server-Sortier-Allowlist, sie ist der Vertrag);
* die acht Vorgabespalten (`deviceColumns.tsx:37-39`) und die Vorgabe-Suchfelder
  (`SearchFieldPicker.tsx`);
* die sieben Spalten der Ausleihenliste (`LoanList.tsx:15-46`) inklusive der Ableitung „aktiv, wenn
  `returnedAt === null`" (`:11-13`);
* die Fehler- und Hinweistexte wörtlich: „Diese Version existiert bereits" (409),
  „Version wird noch von N Gerät(en) genutzt", „Wird von N Gerät(en) genutzt — erst umstellen",
  „Zielversion gesetzt", „Version angelegt", „ISSI-Spalte muss zugeordnet sein"
  (`ImportWizard.tsx:109`), „Datei konnte nicht gelesen werden" (`:101`), „Vorschau fehlgeschlagen"
  (`:117`), „Import fehlgeschlagen" (`:131`), „Gerät gelöscht" / „Löschen fehlgeschlagen"
  (`DeviceDetailDrawer.tsx:54`, `:57`);
* der erklärende Hinweis über der Versionsliste, wörtlich: „Die als ‚Ziel' markierte Version
  bestimmt, welche Geräte als ‚aktuell' gelten. Neu angelegte Versionen werden nicht automatisch
  zum Ziel — die Reihenfolge dient nur der Anzeige." (`SoftwareVersionsPage.tsx:182-185`);
* der Hinweis im Update-Modus, wörtlich: „Gerät suchen, mit einem Tap auf die Zielversion setzen.
  Nur die Geräte, die du wirklich aktualisiert hast." (`UpdateMode.tsx`).

Nicht übernommen wird die Datei-für-Datei-Struktur: aus 14 Dateien unter `features/devices/` werden
sieben unter `admin/geraete/`, weil ColumnPicker, CheckboxDropdown, SearchFieldPicker und
FilterDrawer in einer Insel keine eigene Schichtung mehr brauchen.

## 5.13 Tests: wer welche Aussage besitzt

**Vitest — Fachlogik ohne Oberfläche** (je Datei ein `.test.ts` neben ihr):

* `_lib/rollen.test.ts` — Stufenabbildung (Admin gewinnt vor Updater, keine Gruppe ⇒ keine Stufe);
  `filterSchreibbareFelder("updater", …)` verwirft fremde Felder still und behält die drei erlaubten,
  **mit je Feld unterschiedlichen Werten**; fehlendes `SUITE_UPDATER_GROUP_RADIO` **schliesst** die
  Stufe.
* `_lib/geraeteDiff.test.ts` — „gleicher Wert ⇒ leere Diff-Liste ⇒ kein Ereignis".
* `_lib/updateStand.test.ts` — `aktuell` nur gegen die als Ziel markierte Version; keine Ableitung
  aus `createdAt`.
* `_lib/notiz.test.ts` — Anhängen überschreibt nie; ein Zeitstempel für Zeile und Ereignis.
* `_lib/csv/rundlauf.test.ts` — der Export-Import-Rundlauf (§5.9).
* `_lib/csv/klassifizieren.test.ts` — neu / geändert / unverändert je Zeile, und dass die Rolle die
  Klassifikation begrenzt.
* `admin/actions.test.ts` — **Quelltext-Scan**: jede exportierte Action in `admin/actions.ts`
  enthält `requireRadioAdmin` oder `requireRadioVerwaltung` als erste Anweisung. Vorbild für die
  Bauform: die Scans in `scripts/seed-lokal.test.ts` und
  `src/app/m/portal/_lib/neuigkeiten/register.test.ts`. Dieser Test ist der einzige Wächter der
  Aufruftabelle aus §5.4 — kein anderes Gate sieht eine vergessene Zeile.
* `_lib/host.test.ts` — Prädikat trifft `radio.localtest.me`; kein Durchlass ohne Env.
* `_lib/nav.test.ts` — jeder für eine Stufe sichtbare Navigationseintrag ist von dieser Stufe
  erreichbar (§5.2); Import, Softwareversionen und Codes fehlen in der Updater-Navigation.

**Vitest — Inseln im DOM**, über das bestehende Harness `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`); **kein zweites erfinden**
(`iuk-suite/CLAUDE.md:250-251`). Je Insel eine Datei: `GeraeteTabelle.test.tsx` (Spaltenauswahl
schaltet Spalten, Filterzähler stimmt), `AusleihenTabelle.test.tsx` (Statuszeichen aus
`rueckgabeAm === null`), `VersionenTabelle.test.tsx` (Löschen ist gesperrt, solange Geräte hängen —
inklusive des Hinweistextes), `ImportAssistent.test.tsx` (die vier Schritte, und „ISSI-Spalte muss
zugeordnet sein" blockiert den Übergang), `GeraetFormular.test.tsx` (als Updater sind alle Felder
aussser den dreien `disabled`), `EreignisTabelle.test.tsx` (leere Werte als `—`).

⚠️ **Diese Tests können Falle 9 strukturell nicht finden** — jsdom ist ein einziger JS-Prozess ohne
RSC-Grenze. Sie prüfen Verhalten, nicht Serialisierbarkeit.

**Playwright — je Tabelle ein echter HTTP-Abruf.** Das ist Pflichtbestandteil, nicht Nachbesserung:
nur ein echter Abruf zeigt Falle 9 und Falle 1. `e2e/radio-verwaltung.spec.ts`:

1. `/admin` → 200, vier Kennzahlen sichtbar, „Veraltet" ist **nicht** rot.
2. `/admin/geraete` → 200, Tabelle mit Kopfzeile, ein Filter gesetzt ⇒ die URL trägt ihn.
3. `/admin/geraete/<id>` → 200, Formular sichtbar (Falle 1).
4. `/admin/geraete/<id>/ereignisse` → 200.
5. `/admin/ausleihen`, `/admin/versionen`, `/admin/import`, `/admin/update`, `/admin/codes` → je 200
   mit sichtbarer Tabelle bzw. Assistent.
6. `/admin/geraete/export` → 200, `text/csv`, Antwort beginnt mit dem BOM.
7. Ein Schreibvorgang je Action-Familie: Version anlegen · Gerät ändern · Notiz anfügen · Import
   schreiben.
8. `/admin` auf einem **fremden** Suite-Host ⇒ 404 (Falle 61). Erfordert einen zweiten `baseURL` im
   Testaufbau — mit **einem** `baseURL` ist diese Aussage nicht prüfbar (Falle 57 in der
   lagerbuch-Zählung).

⚠️ **Zwei Testregeln aus Falle 10, verbindlich:** vor dem ersten echten POST auf einen Route Handler
oder eine Action ein **Warmlauf-GET** auf dieselbe Route (`next dev` kompiliert beim ersten Treffer,
und der HMR-Reload bricht die laufende Anfrage mit `net::ERR_ABORTED` ab — nie eine Antwort); und
jeder Test, der eine Anfrage auslöst, **prüft ihre Antwort** mit `page.waitForResponse`, statt auf
eine spätere Zustandsänderung zu warten. Für Klicks auf Links in der Navigation gilt Falle 12:
`klickeWennRuhig` aus `e2e/fixtures.ts`, nicht `.click()`.

## 5.14 Zusagen an andere Kapitel

* **An Kapitel 3 (Zugang/Codes):** `/admin/codes` liegt in diesem Kapitel als Route, Riegel und
  Insel 8; die Mechanik des Codes gehört Kapitel 3. Jede codebezogene Seite und Action ruft
  `requireRadioAdmin()`, **nie** `requireRadioVerwaltung()` — die Updater-Stufe erreicht die
  Code-Verwaltung nicht (Entscheidung 7).
* **An Kapitel 4 (Datenmodell):** die vier `quelle`-Werte sind abschliessend, und §5.8 listet
  vollständig, welche Action welchen Wert setzt. Die Einheit von `lastUpdatedAt` und der Umgang mit
  einer verwaisten Leihzeile beim Gerätelöschen werden dort entschieden; §5.9 und §5.8 sind darauf
  vorbereitet.
* **An das Kiosk-Kapitel:** `refetchOnWindowFocus`, `refetchOnReconnect`, `gcTime` und
  `networkMode: 'offlineFirst'` sind **Kiosk**-Konfiguration, nicht `radio-admin`
  (`radio-admin/client/src/app/queryClient.ts:8-9` setzt `refetchOnWindowFocus: false`). Der
  Ausfall-Puffer `STALE_GRACE_MS` gehört ebenfalls dorthin. Für `/admin` entsteht kein Ersatzbedarf.
* **An Spec 2 (Runbook):** die zwei Gruppennamen in Produktion sind vor dem Umschwenk zu erfragen
  und als `SUITE_ADMIN_GROUP_RADIO`/`SUITE_UPDATER_GROUP_RADIO` zu setzen — ohne sie sperrt der
  Cutover entweder alle oder niemanden aus. Der pfaderhaltende Traefik-Redirect von
  `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` ist eine Runbook-Zeile, kein Repo-Artefakt.
* **An die Release-Notizen:** „Die Verwaltung liegt jetzt unter derselben Adresse wie die Ausleihe"
  ist eine bemerkbare Änderung und braucht eine Notiz plus Registerzeile. Ebenso das Wegfallen des
  Reiters „API-Zugriff" und die neue Fläche „Änderungen anzeigen".

**Ausdrücklich nicht Teil dieses Kapitels:** `TZ=Europe/Berlin` setzen · die CWE-348-Umstellung in
`core/ratelimit.ts` (Voraussetzung für den Code-Endpunkt in Kapitel 3, nicht für `/admin`) · das
Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts` · das suiteweite Gating von `/m/*` ·
der Import selbst (Kapitel 4) · die Ausleihfläche an `/`.

## 5.15 Zu bestätigen

Genau ein Punkt, und nur der Betreiber kennt ihn: **die beiden Pocket-ID-Gruppennamen in
Produktion.** `admin` und `personal` sind Vorgabewerte in `radio-admin/server/src/config.ts:28-29`;
ob die Produktionsumgebung sie überschreibt, steht in keinem Repository. Alles andere in diesem
Kapitel ist entschieden.

---

# 6. Der Wegfall der HTTP-Grenze und was aus der oeffentlichen API wird

Heute stehen zwischen einem Klick auf „Ausleihen" und der Zeile in `loans` **zwei** HTTP-Spruenge und
**zwei** Auth-Systeme: Browser → NestJS (`Authorization: Bearer <API_TOKEN>`), NestJS → radio-admin
(S2S-Bearer auf `api/v1/*`). Der Port loescht beide Spruenge. Dieses Kapitel schreibt aus, was an ihre
Stelle tritt, was ersatzlos verschwindet, was von der Fachlichkeit der Grenze gerettet werden muss, und
in welcher Reihenfolge das gebaut wird — die Reihenfolge ist hier kein Ratschlag, sondern die
Bedingung dafuer, dass der Cutover ueberhaupt deploybar ist.

> **Zu den Verweisen auf andere Kapitel:** die endgueltige Kapitelnummerierung entsteht erst bei der
> Zusammenfuehrung. Zusagen sind deshalb nach **Gegenstand** adressiert („Zusage an das
> Datenmodell-Kapitel"), nicht nach Nummer. Fallennummern sind **zweigleisig**: 1–12 sind die aus
> `iuk-suite/CLAUDE.md`; die Zaehlung 57/60/61 ist die des `lagerbuch`-Vorgaengers und steht **nicht**
> in `docs/design/README.md` (dort sind die Fallen unnummeriert) — sie wird ueber
> `docs/lagerbuch-portierung-analyse.md` und `src/app/m/lagerbuch/_lib/host.ts` gefuehrt, die
> Nachbarkapitel benutzen sie ebenso. Dieses Kapitel beruehrt **Falle 61** (Host-Riegel — hier in der
> Form „er wird **nicht** ein zweites Mal gerufen", 6.1), **Falle 6** (die Lesefunktionen liegen in
> einem Modul ohne `"use client"`), **Falle 9** (die Vorschlags-Action wird importiert, nicht als Prop
> gereicht, 6.2), **Falle 10** (abgebrochener POST waehrend der Erstkompilierung — betrifft nur den
> e2e-Test) und in 6.7 **Falle 7** als Grund, warum Abschnitt D einen echten Abruf verlangt. Mehr wird
> hier nicht behauptet.

## 6.1 Die sechs `/v1`-Routen und ihr Ersatz

Alle sechs liegen in **einer** Datei, `radio-admin/server/src/routes/loanApi.ts`, und sind
ankerfest gezaehlt:

```
grep -n "r\.\(get\|post\|patch\|put\|delete\)('" radio-admin/server/src/routes/loanApi.ts
126:  r.get('/v1/loan-devices', auth, (c) => {
133:  r.get('/v1/active-loans', auth, (c) => {
140:  r.get('/v1/loans/history', auth, (c) => {
148:  r.get('/v1/borrowers/suggestions', auth, (c) => {
158:  r.post('/v1/loans', auth, async (c) => {
187:  r.patch('/v1/loans/:loanId', auth, async (c) => {
```

Gemountet werden sie **vor** dem Sitzungs-Riegel (`radio-admin/server/src/app.ts:51`,
`app.route('/api', loanApiRoutes(db, cfg))`) — daher der Praefix `api/v1/...` auf der Aufruferseite.
Der einzige Aufrufer ist `RadioAdminService` im Kiosk-Backend
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:146`, `:229`, `:240`,
`:248`, `:266`, `:276`), und der wird aus vier Stellen gerufen:
`modules/devices/devices.service.ts`, `modules/loans/loans.repository.ts`,
`modules/borrowers/borrowers.repository.ts`, `modules/admin/history/history.repository.ts`.

| Alt-Route (`loanApi.ts`) | Was sie tut | Wer sie heute ruft | Ersatz im Monolithen | Warum diese Form |
|---|---|---|---|---|
| `GET /v1/loan-devices` (`:126`) | `listLoanableDevices(db)`, projiziert per `toLoanDevice` (`:47-61`) — verleihbare Geraete, Teilmenge ohne Audit-/Software-Felder | `radio-admin.service.ts:146` (`refreshDevices`), von dort `devices.service.ts` und indirekt `getDeviceById` (`:138-141`) | **Interne Lesefunktion**, aus der Server Component (RSC) direkt gerufen | Lesen braucht keine Server Action. Der Aufruf sitzt im Render-Pfad der Ausleihe-Seite; jede Action-Form waere ein zusaetzlicher POST ohne Nutzen. |
| `GET /v1/active-loans` (`:133`) | `findActiveLoans(db)`, projiziert per `toActiveLoan` (`:98-107`) — Statusquelle fuer Geraete-Overlay und Dashboard. Bewusst **nicht** in `/loan-devices` gefaltet (Kommentar `:130-132`: sonst verschwindet eine Leihe auf einem seit dem Verleih un-verleihbar gemachten Geraet) | `radio-admin.service.ts:248` → `loans.repository.ts` | **Interne Lesefunktion** aus RSC | wie oben. ⚠️ Die Nicht-Faltung ist eine **fachliche** Entscheidung, keine Routenaufteilung — sie muss die Grenze ueberleben (6.3, Posten 2). |
| `GET /v1/loans/history` (`:140`) | `listLoans(db, params)` nach `loanHistoryParamsSchema` (aktiv + zurueckgegeben, paginiert). Kommentar `:137-139`: Retention ist ein Job, Lesen purgt nicht | `radio-admin.service.ts:266` → `admin/history/history.repository.ts` | **Interne Lesefunktion** aus RSC, Filter/Seite ueber `searchParams` | Historie ist eine verlinkbare, teilbare Ansicht. Der Zustand gehoert in die URL, nicht in einen Client-Cache — TanStack Query faellt weg. |
| `GET /v1/borrowers/suggestions` (`:148`) | `findBorrowerSuggestions(db, q, limit)` nach `borrowerSuggestionsQuerySchema` — Namens-Vorschlaege beim Tippen | `radio-admin.service.ts:276` → `borrowers.repository.ts` | **Server Action**, aus der Client-Insel des Ausleih-Formulars gerufen | Der **einzige** Fall, der wirklich offen war — Begruendung in 6.2. |
| `POST /v1/loans` (`:158`) | Rumpf nach `createLoanSchema`; dann `getDeviceById` → `loanable` → `mapDeviceCondition(device.status) === 'AVAILABLE'` → `createLoan` mit Snapshot-Feldern; `LoanConflictError` → 409 | `radio-admin.service.ts:229` → `loans.repository.ts` | **Server Action** `ausleiheAnlegen` (→ `bucheAusleihe`) | Schreibvorgang aus einem Formular, `revalidatePath` danach. Genau der Fall, fuer den eine Action da ist. ⚠️ Ein POST **je Gerät** wird zu **einer** Transaktion ueber die ganze Auswahl (siehe Signaturblock). |
| `PATCH /v1/loans/:loanId` (`:187`) | Rumpf nach `returnLoanSchema`; `returnLoan(db, loanId, returnNote)`; `updated`/`alreadyReturned` unterscheidet 200/409/404 | `radio-admin.service.ts:240` → `loans.repository.ts` | **Server Action** `rueckgabeBuchen` (→ `bucheRueckgabe`) | wie oben. |

**Es bleibt kein Route Handler.** Die drei Lesefunktionen laufen im Render, die drei Schreib-/
Tippfunktionen sind Server Actions. Damit entsteht durch die sechs Routen **kein** neuer Pfad, der den
Cordon aus Entscheidung 10 von Hand tragen muesste, und **kein** neuer Pfad, der Falle 61 beruehrt.

### Zusage an das Datenmodell- und Fachlogik-Kapitel: die sechs Ersatz-Signaturen

Die Lesefunktionen liegen in **einem** Modul ohne `"use client"` (Falle 6), die Actions in einem Modul
mit `"use server"`.

⚠️ **Namensabgleich — diese Namen sind nicht in diesem Kapitel entschieden.** Die drei Actions, ihre
Ergebnistypen und die beiden Lesepfade der Ausleihe-Flaeche gehoeren dem **Ausleihe-Kapitel**, das sie
mit Bildschirmtexten und Testnamen ausschreibt (`ausleiheAnlegen`, `rueckgabeBuchen`,
`entleiherVorschlaege`, `AusleihErgebnis`/`RueckgabeErgebnis`, Datei `_actions/ausleihe.ts`). Dieses
Kapitel uebernimmt sie **woertlich**, damit die Zusammenfuehrung nicht zwei Namen fuer dieselbe
Funktion liest; sein eigener Beitrag ist die Abbildung Alt-Route → Ersatzfunktion, die Fehler-Abbildung
in 6.3 und die Reihenfolge in 6.7. Neu benannt sind hier nur die drei Ersaetze, fuer die kein anderes
Kapitel einen Namen fuehrt: `leihhistorie` (die Verwaltungs-Ansicht der Historie) sowie `bucheAusleihe`,
`bucheRueckgabe` und `sucheEntleiher` — die **Datenfunktionen** unter den drei Actions. Die Trennung ist
nicht kosmetisch: die Action traegt Riegel, `FormData` und `revalidatePath`, die Datenfunktion traegt die
Transaktion und ist ohne Next-Laufzeit testbar (6.6). ⚠️ Sie darf auch **nicht** denselben Namen tragen
wie die Action: `_actions/ausleihe.ts` **importiert** die Datenfunktion und **exportiert** die Action —
gleiche Namen kollidieren in derselben Datei. Deshalb heisst die Datenseite der Vorschlaege
`sucheEntleiher` und nicht noch einmal `entleiherVorschlaege`.

`src/app/m/radio/_db/leihen.ts` — kein `"use client"`, kein `"use server"`, reine Datenzugriffe. **Alle
nehmen `db` als ersten Parameter**, nach dem Muster, das die Suite in diesem Modul bereits setzt
(`raeumeLeihhistorie(db, jetzt?)` im Datenmodell-Kapitel, dort mit dem Aufrufer
`raeumeLeihhistorie(getDb())`) — die Funktion holt sich die Verbindung nicht selbst, sonst ist sie im
Test nicht gegen eine eigene Datei zu haengen (6.6). `RadioDb` ist der Typ aus `_db/client.ts`
(Datenmodell-Kapitel):

```ts
export function geraeteMitLeihstand(db: RadioDb): GeraetMitLeihstand[];   // ersetzt GET /v1/loan-devices
export function offeneAusleihen(db: RadioDb): OffeneAusleihe[];           // ersetzt GET /v1/active-loans
export function leihhistorie(db: RadioDb, f: LeihhistorieFilter): LeihhistorieSeite;
export function sucheEntleiher(db: RadioDb, suchtext: string, deckel: number): Vorschlag[];
export function bucheAusleihe(db: RadioDb, e: AusleihEingabe): AusleihErgebnis;
export function bucheRueckgabe(db: RadioDb, ausleiheId: string, notiz: string | null): RueckgabeErgebnis;
```

⚠️ **`Vorschlag` ist kein `string`.** `findBorrowerSuggestions` gibt heute
`BorrowerSuggestion[]` = `{ name, lastUsed }` zurueck (`radio-admin/server/src/repos/loanRepo.ts:168`
und `:184`, Schema `radio-admin/shared/src/loan.ts:126-129`) — `lastUsed` ist der letzte Ausleihzeitpunkt
und traegt die Nebenzeile „zuletzt am 14.06." im Vorschlag. Eine Signatur `string[]` waere genau der
Posten aus 6.3, der beim Port **still** verschwindet, hier im eigenen Vertrag. Nach der Entscheidung des
Ausleihe-Kapitels ist `Vorschlag` = `{ name: string; zuletztText: string }` — eine **fertige
Zeichenkette**, kein Zeitstempel. Damit beruehrt dieser Pfad Entscheidung 11 gar nicht: die epoch-ms
aus der Quelle erreichen die Fläche nie als Zahl.

`src/app/m/radio/_actions/ausleihe.ts` — `"use server"`, ruft ausschliesslich nach oben (Signaturen
woertlich aus dem Ausleihe-Kapitel, `_vorher` weil beide an `useActionState` haengen):

```ts
export async function ausleiheAnlegen(_v: AusleihErgebnis | null, f: FormData): Promise<AusleihErgebnis>;
export async function rueckgabeBuchen(_v: RueckgabeErgebnis | null, f: FormData): Promise<RueckgabeErgebnis>;
export async function entleiherVorschlaege(suchtext: string): Promise<Vorschlag[]>;
```

⚠️ **`bucheAusleihe` nimmt eine Liste, nicht ein Gerät.** Das Ausleihe-Kapitel hat den Vorgang als
**eine** Drizzle-Transaktion ueber alle gewaehlten Geraete entschieden (alles oder nichts, Deckel 20).
Die Alt-Route ist ein POST je Gerät, und sie feuert alle **gleichzeitig**:
`await Promise.all(deviceIds.map((deviceId) => mutateAsync({ deviceId, borrowerName })))`
(`radio-inventar/apps/frontend/src/components/features/ConfirmLoanButton.tsx:55-59`). Damit ist der
Teilerfolg heute der Normalfall — scheitert der dritte von vier, sind die anderen drei gebucht und die
Fläche meldet trotzdem einen Fehler. Ein Ersatz mit Einzelgeraet-Signatur zoege genau diese Form still
wieder ein und koennte die Zusage „es wurde nichts gebucht" nicht halten. Die drei Master-Pruefungen aus
6.3 laufen deshalb **je Gerät innerhalb** der einen Transaktion.

Jede der drei Actions ruft als **erste Anweisung** `requireRadioZugang` (Entscheidung 10). ⚠️ **Sie
ruft den Host-Riegel NICHT zusaetzlich:** `requireRadioZugang` ruft ihn **intern** als erste Anweisung,
und das Ausleihe-Kapitel sagt dieselbe Zusage zu und prueft sie („liest die Kopfzeilen genau einmal").
Genau so steht es im Vorbild: `requireLagerbuchHost` liegt **innerhalb** von
`requireLagerbuchAdmin`/`requireHelferSitzung` und nicht in einer Liste, die die naechste Action
vergisst (`src/app/m/lagerbuch/_lib/host.ts`, Abschnitt „WO DIESE FUNKTIONEN GERUFEN WERDEN"). Ein
zweiter Aufruf waere keine zweite Sicherung, sondern ein zweites Lesen der Kopfzeilen — und damit ein
roter Test im Nachbarkapitel. Wie die anonyme Ausleihe von der Verwaltung unterschieden wird,
entscheidet das **Zugangs-Kapitel**; dieses Kapitel sagt nur: es gibt keinen Aufruf ohne Riegel als
erste Zeile, und `ausleiheAnlegen`/`rueckgabeBuchen` sind die **anonyme** Stufe, nicht die Admin-Stufe.

**Zusage an das Datenmodell-Kapitel:** `bucheAusleihe` verlaesst sich auf den **partiellen Unique-Index**
gegen den gleichzeitigen Zweitverleih. Heute ist er der einzige atomare Schutz („The partial unique index
is the atomic guard against a concurrent borrow (no SELECT-then-insert race)", `loanApi.ts:154-157`) und
seine Verletzung kommt als `LoanConflictError` (`loanApi.ts:13`, `:180`) zurueck. Der Index gehoert ins
Datenmodell-Kapitel; hier wird er **benannt, nicht entworfen**. Faellt er weg und wird durch ein
`SELECT`-dann-`INSERT` ersetzt, ist der Port fachlich falsch, und kein Test in diesem Kapitel wuerde es
sehen.

⚠️ **Er heisst `loans_device_active_uidx`, und kein Generator erzeugt ihn.** In der Quelle steht er von
Hand am Ende von `radio-admin/server/drizzle/0003_kind_spot.sql`, mit der Begruendung im Schema selbst:
„enforced by a PARTIAL unique index `loans_device_active_uidx` ON (device_id) WHERE returned_at IS NULL,
hand-added in the migration because drizzle-kit cannot emit partial indexes"
(`radio-admin/server/src/db/schema.ts:112-115`). Das Ziel benutzt dasselbe `drizzle-kit`, also gilt
dieselbe Grenze — der Index ist dem Drizzle-Schema unsichtbar, `drizzle-kit generate` sieht ihn nicht
und entfernt ihn nicht. Das Datenmodell-Kapitel legt ihn deshalb in eine **eigene, handgeschriebene**
Migrationsdatei. Diese Zeile steht hier, weil die tragende Zusage dieses Kapitels („`bucheAusleihe`
braucht kein `SELECT` vor dem `INSERT`") an einem Objekt haengt, das kein Gate und kein Generator
herstellt.

## 6.2 Der eine offene Fall: die Ausleiher-Vorschlaege

`GET /v1/borrowers/suggestions` ist der einzige der sechs, der aus einer **Client-Insel waehrend des
Tippens** gerufen wird. Zwei Formen waren moeglich:

* **Route Handler** (`src/app/m/radio/api/vorschlaege/route.ts`): GET, `fetch` aus der Insel,
  HTTP-cachebar. **Preis:** ein Route Handler hat kein Layout ueber sich, also truege er den
  Zugangs-Riegel **und** den Host-Riegel (Falle 61) von Hand — dauerhaft, bei jeder spaeteren
  Aenderung neu. Dazu die zweite Testpflicht aus Falle 10 (Warmlauf-GET vor dem ersten echten Treffer
  unter `next dev`, `page.waitForResponse` statt Warten auf eine Zustandsaenderung).
* **Server Action** aus der Insel: `entleiherVorschlaege(suchtext)`. POST, nicht HTTP-cachebar.
  **Preis:** ein POST je Tastendruck-Fenster.

**Entschieden: Server Action.** Die Begruendung ist projektspezifisch und nicht Geschmack: mit
`requiresAuth: false` (Entscheidung 4) erbt **kein** Pfad dieses Moduls ein Middleware-Gating, also ist
jeder ueberlebende HTTP-Endpunkt eine Flaeche, die den Cordon fuer immer selbst traegt. Der einzige
Vorteil des Handlers waere HTTP-Caching — und der ist hier wertlos: die Antwort haengt am Tippstand,
ist personenbezogen (Namen von Ausleihern) und darf gar nicht in einem Shared Cache landen. Die
Datenmenge ist klein (Entscheidung 12 nennt < 100 Leihen im Retentionsfenster als Schaetzung), die
Abfrage ist ein `SELECT DISTINCT` im selben Prozess.

⚠️ **Damit uebernimmt diese Action die Einhegung, die vorher das Query-Schema trug — und sie muss sie
verschaerfen.** Heute steht sie in `borrowerSuggestionsQuerySchema`: `q: z.string().trim().min(1)` und
`limit` mit Vorgabe 10 (`radio-admin/shared/src/loan.ts:116-119`), geklemmt auf 1..50 im Repo
(`radio-admin/server/src/repos/loanRepo.ts:169`). **Eine Server Action hat kein Query-Schema.** Ohne
eigene Pruefung laeuft `entleiherVorschlaege("")` in ein `LIKE '%%'` (`loanRepo.ts:174-179`) und liefert
einem **anonymen** Aufrufer die vollstaendige Namensliste des Retentionsfensters. Verbindlich deshalb,
als erste Anweisungen der Action **nach** dem Riegel:

1. `suchtext.trim().length < 2` → sofort `[]`. **Zwei** Zeichen, nicht eines: das Ausleihe-Kapitel
   stuetzt seine Datenschutz-Begruendung ausdruecklich auf „keine Auflistung ohne Suchtext", und die
   Alt-Fläche hat dieselbe Schwelle.
2. Der Deckel steht **serverseitig fest** bei 10 und ist kein Parameter der Action — ein von aussen
   gesetztes `limit` gaebe es nur, damit es jemand auf 50 dreht.
3. Zurueck geht `{ name, zuletztText }`, nie `lastUsed` als Zahl — kein Zeitstempel in Millisekunden
   verlaesst den Server.

Die Insel entprellt (`~200 ms`) und verwirft veraltete Antworten anhand des zuletzt gesendeten `q` —
Server Actions sind **nicht** reihenfolgegarantiert, und ohne diese Zeile blinkt die Vorschlagsliste
zurueck auf einen aelteren Tippstand. Das ist die Stelle, an der TanStack Querys
`keepPreviousData`/`isFetching` wegfaellt, ohne dass jemand es merkt.

**Zusage an das Ausleihe-Kapitel:** die Vorschlagsliste ist eine `"use client"`-Insel, die
`entleiherVorschlaege` **direkt importiert** — nicht als Prop durchgereicht (Falle 9: nur Server
Actions duerfen die RSC-Grenze passieren, und auch die nur per Import). Die Bauform der Insel
(`AutoComplete` mit Nebenzeile) ist dort bereits entschieden; dieses Kapitel legt nur fest, dass hinter
ihr eine Action und kein Endpunkt liegt.

## 6.3 Was ersatzlos verschwindet — und was dabei stillschweigend mitverschwinden wuerde

### Gezaehlt, nicht geschaetzt

| Posten | Zahl | Befehl |
|---|---:|---|
| NestJS-Querschnittsdateien in `common/` ohne Specs | **14** Dateien / **505** Zeilen | `find radio-inventar/apps/backend/src/common -name '*.ts' -not -name '*.spec.ts'` |
| davon Guards | 2 | `common/guards/{api-token,session-auth}.guard.ts` |
| davon Pipes | 2 | `common/pipes/{parse-cuid2,zod-validation}.pipe.ts` |
| davon Interceptor / Filter | 1 / 1 | `common/interceptors/transform.interceptor.ts`, `common/filters/http-exception.filter.ts` |
| davon Decorators | 2 | `common/decorators/{bypass-api-token,public}.decorator.ts` |
| davon Barrel-`index.ts` | 4 | `decorators/`, `guards/`, `pipes/`, `utils/` |
| davon **kein** Grenzposten | 2 | `common/middleware/request-id.middleware.ts` (Betriebs-Telemetrie), `common/utils/string-transform.util.ts` (Hilfsfunktion — vor dem Loeschen pruefen, ob Fachlogik darin steckt) |
| dritter Guard, ausserhalb `common/` | 1 | `radio-inventar/apps/backend/src/modules/setup/guards/setup.guard.ts` |
| DTO-Dateien | **14** | `find radio-inventar/apps/backend/src -name '*.dto.ts'` |
| Zod-Schemadateien im Kiosk-`shared` | **8** | `radio-inventar/packages/shared/src/schemas/` |

⚠️ **Zahlenabgleich mit der Analyse, damit die Zusammenfuehrung keinen Widerspruch liest:**
`docs/radio-portierung-analyse.md:1082` nennt „7 NestJS-Querschnittsdateien
(Guards/Pipes/Interceptor/Filter) + 2 Barrel-`index.ts`" = 9 Dateien / 351 Zeilen. Das ist dieselbe
Menge, anders geschnitten: die 7 sind 3 Guards (inklusive `setup.guard.ts`) + 2 Pipes + 1 Interceptor
+ 1 Filter, die 2 Barrels sind `guards/index.ts` und `pipes/index.ts`. Meine 14 sind **alles** unter
`common/` ohne Specs, also zusaetzlich die 2 Decorators, die 2 weiteren Barrels und die zwei
Nicht-Grenzposten. Beide Zahlen sind richtig; wer sie vergleicht, muss den Schnitt mitlesen.

### Die doppelten Schemata

Die 14 DTO-Dateien existieren **ausschliesslich**, weil ein Schema die HTTP-Grenze zweimal beschreiben
muss: einmal als Zod-Schema in `radio-inventar/packages/shared/src/schemas/` (8 Dateien, darunter
`radio-admin-loan.schema.ts` mit 6 Exporten und `radio-admin-device.schema.ts` mit 2 — die
Spiegelbilder von `@ra/shared`), einmal als DTO-Klasse fuer den Controller. Ohne Grenze bleibt **ein**
Schema. Dazu faellt die dritte Beschreibung derselben Sache: `LoanDevice`/`ActiveLoan` als
Projektions-Interfaces in `loanApi.ts:34-45` bzw. in `@ra/shared`.

Weiter ersatzlos:

* **Der API-Client des Kiosks** (12 `api/*.ts`, 1.859 Zeilen; Analyse `:1079`) und `lib/queryClient.ts`.
* **CORS** — `app.enableCors` (`radio-inventar/apps/backend/src/main.ts:68`) und die Origin-Liste ab
  `:54`, gefuettert aus `ALLOWED_ORIGINS` (`config/env.config.ts:9`,
  `z.string().optional().default('')`). Im Monolithen gibt es keinen Cross-Origin-Aufruf mehr; die
  Variable verschwindet aus jeder Umgebung.
* **Der zweite HTTP-Sprung samt Auth-Apparat:** `getAuthHeader` (`radio-admin.service.ts:88-92`), der
  client_credentials-Weg (`requestToken` `:293`, `discoverTokenEndpoint` `:336`,
  `TOKEN_REFRESH_SKEW_MS`, `DEFAULT_TOKEN_TTL_SECONDS`), die Token- und Discovery-Caches, die
  In-Flight-Deduplizierung — und auf der Gegenseite `verifyApiToken` und `verifyLoanJwt`
  (`loanApi.ts:5-6`) samt `auth/loan-api-jwt.ts`.
* **Der eigene HTTP-Server** von radio-admin (`server/src/index.ts`, 56 Zeilen; Hono + `@hono/node-server`).
* **Der `RADIO_ADMIN_*`-Env-Block** des Kiosks: `RADIO_ADMIN_URL`, `RADIO_ADMIN_API_TOKEN`,
  `RADIO_ADMIN_ISSUER_URL`, `RADIO_ADMIN_CLIENT_ID`, `RADIO_ADMIN_CLIENT_SECRET`,
  `RADIO_ADMIN_CACHE_TTL_MS` (`radio-inventar/apps/backend/src/config/env.config.ts:28`, `:106-131`;
  `:129` nennt radio-admin ausgeschrieben „the device & loan source"). **Zusage an Spec 2 (Runbook):**
  dieser Block wird beim Abstellen des Alt-Kiosks aus der Compose-Datei entfernt, nicht auskommentiert
  — ein stehengelassener `RADIO_ADMIN_URL` auf `radio.iuk-ue.de` laesst einen versehentlich
  neugestarteten Alt-Container gegen die Suite laufen.

### Die vier Dinge, die beim naiven Port still mitverschwinden

**1. Das Fehlercode-Vokabular.** Acht maschinenlesbare Codes gehen heute ueber die Grenze und werden
vom Client zu HttpExceptions gemappt (`RadioAdminLoanError`, `radio-admin.service.ts:23-31`,
Auswertung `:198-212`). Der Monolith hat keine HTTP-Antwort mehr, in die sie passen — sie werden zur
**diskriminierten Union** als Rueckgabewert der Server Action. Die Union ist im Ausleihe-Kapitel
entschieden (`AusleihErgebnis` / `RueckgabeErgebnis`, Diskriminator `grund`, dazu `text` und bei der
Ausleihe `betroffen: { rufname, status }[]`); dieses Kapitel liefert die **Abbildung**, damit kein
Ausgang beim Port unbemerkt zusammenfaellt:

| Alt-Code (`loanApi.ts`) | Status | Ursache | Neue Form |
|---|---:|---|---|
| `invalid_body` (`:161` POST, `:191` PATCH), `invalid_query` (`:142`, `:150`) | 400 | Schema-Verletzung | kein eigener `grund`, sondern der **feldnahe** der beiden Unions: `keine-auswahl` / `kein-name` (Ausleihe), `notiz-zu-lang` (Rueckgabe) — Feldfehler am Formularfeld, nicht als Seitenmeldung |
| `device_not_found` (`:165`) | 404 | Geraete-Id unbekannt | `grund: "verschwunden"` |
| `device_not_loanable` (`:166`) | 409 | `loanable = false` | `grund: "nicht-verfuegbar"`, Gerät in `betroffen` |
| `device_not_available` (`:168`) | 409 | `mapDeviceCondition(status) !== 'AVAILABLE'` | `grund: "nicht-verfuegbar"`, `betroffen[].status` traegt den Zustand |
| `device_already_on_loan` (`:180`) | 409 | Unique-Index / `LoanConflictError` | `grund: "nicht-verfuegbar"`, `betroffen[].status` sagt „ausgeliehen"; der Satz nennt Rufname und Entleiher |
| `loan_already_returned` (`:196`) | 409 | `returnedAt` gesetzt | `grund: "schon-zurueck"` |
| `loan_not_found` (`:197`) | 404 | Leih-Id unbekannt | `grund: "unbekannt-geworden"` |

⚠️ **Zahlenabgleich fuer die Zusammenfuehrung:** dieses Kapitel zaehlt **acht** Codes (`loanApi.ts`
gibt sie aus), das Ausleihe-Kapitel **sechs** Ausgaenge. Beide stimmen: die sechs sind die **fachlichen**
Ablehnungen, `invalid_body` und `invalid_query` sind Schema-Verletzungen und in der neuen Form gar keine
eigene Klasse mehr, weil die Action ihr Formular selbst validiert. Wer die Zahlen vergleicht, muss den
Schnitt mitlesen.

⚠️ **Der Diskriminator ist gröber als das Alt-Vokabular, und das ist die Stelle zum Hinsehen.** Drei
Alt-Codes (`device_not_loanable`, `device_not_available`, `device_already_on_loan`) fallen auf **einen**
`grund: "nicht-verfuegbar"`. Was sie auseinanderhaelt, ist `betroffen[].status` und der Satz — nicht der
Typ. **Deshalb bleiben die drei Pruefungen im Server getrennt** (Posten 3) und der Test dort prueft sie
einzeln; faellt die Trennung *dort* zusammen, merkt es niemand mehr an der Union.

⚠️ **Der leichteste Verlust ist das Feld `condition` im 409-Rumpf** (`loanApi.ts:168`:
`c.json({ error: 'device_not_available', condition }, 409)`). Es ist das einzige, das dem Kiosk sagt,
**warum** ein Geraet nicht verfuegbar ist — ohne es steht auf dem Bildschirm „nicht verfuegbar" und die
Person am Kiosk sucht das Geraet weiter. Sein Platz in der neuen Form ist **`betroffen[].status`**; das
Feld existiert in der Union des Ausleihe-Kapitels bereits, es muss nur gefuellt werden. Ein
`betroffen`-Eintrag ohne `status` ist derselbe Verlust in neuer Schreibweise.
**Zusage an das Ausleihe-Kapitel:** die Union ist die Rueckgabeform beider Schreib-Actions, und **jeder**
`grund` braucht dort einen Text. Kein `throw` fuer fachliche Ablehnungen — ein geworfener Fehler aus
einer Server Action kommt in Produktion als anonymisierte Meldung an und ist damit genau der Fall
`device_not_available` ohne `condition`.

**2. Die Projektionen `toLoanDevice` (`:47-61`) und `toActiveLoan` (`:98-107`).** Ihr Kommentar sagt
ausdruecklich, was sie sind: „a deliberate subset, no audit/software fields" (`:27-32`). Im selben
Prozess gibt es dafuer **keinen Sicherheitsgrund mehr** — und genau deshalb ist das der Posten, der
still verschwindet: wer `geraeteMitLeihstand` als „alle Spalten aus `devices`" baut, bekommt eine
Ausleihe-Flaeche, auf der ploetzlich Software-Version, Audit-Spalten und `tei` stehen (die Quelltabelle
hat 25 Spalten, siehe Datenmodell-Kapitel). Die **fachliche** Entscheidung „die Ausleihe zeigt Geraet,
nicht Geraeteakte" muss als **Lesemodell** weiterleben: die elf Felder aus `loanApi.ts:34-44`
(`id`, `issi`, `opta`, `rufname`, `status`, `location`, `deviceType`, `serialNumber`, `hersteller`,
`bedieneinheit`, `funktion`) sind die **Obergrenze**, die sechs aus `:100-105` die der aktiven Leihe.
Der Kommentar auf `:29-31` begruendet auch, **warum `id` und nicht `issi` der Schluessel ist** („issi is
mutable (a device can be reprogrammed) and unsuitable as a foreign key") — diese Begruendung wandert als
Kommentar mit, sonst ist der naechste naheliegende Umbau ein Join auf `issi`.

⚠️ **Das Ausleihe-Kapitel schneidet noch enger, und das ist kein Widerspruch, sondern die Richtung, in
die dieser Posten zeigt.** Sein `geraeteMitLeihstand(db)` liefert
`{ id, rufname, geraetetyp, standort, status, suchschluessel, entleiher?, seit? }` — die Seriennummer
steht **nicht** in der Zeile, sondern nur im Suchschluessel. Die Regel dieses Kapitels ist deshalb
„**hoechstens** die elf", nicht „genau die elf": jede Spalte, die weder in `loanApi.ts:34-44` noch im
Feldsatz des Ausleihe-Kapitels steht, ist ein Regelbruch.

**Test:** `src/app/m/radio/_db/leihen.test.ts` → `reicht keine Audit- und keine Software-Spalte an die
Ausleihe durch`: prueft `Object.keys()` des ersten Elements von `geraeteMitLeihstand(db)` gegen den
**exakten** Feldsatz des Ausleihe-Kapitels (Gleichheit, nicht Teilmenge — eine Teilmengenpruefung faengt
genau den Fall nicht, gegen den der Test steht) und zusaetzlich, dass keiner der Namen
`softwareVersion`, `tei`, `createdBy`, `updatedAt` darunter ist.

**3. Die Master-Pruefungen bleiben, sie wandern nur.** Der Kommentar auf `:154-157` begruendet sie mit
„Device existence + loanable + condition are gated HERE at the master: the kiosk is open, so the caller
is not trusted to enforce these." Es ist verfuehrerisch, das nach dem Wegfall der Grenze als
„jetzt ist der Aufrufer ja wir selbst" zu lesen — falsch: der **anonyme Ausleiher** und sein Formular
sind unveraendert unvertraut, und mit Entscheidung 4/10 ist die Flaeche sogar breiter erreichbar als
vorher. Geraet lesen → `loanable` → `mapDeviceCondition` bleiben die ersten Anweisungen von
`bucheAusleihe`, in dieser Reihenfolge und **je gewaehltem Gerät innerhalb der Transaktion**, mit
denselben drei unterscheidbaren Ergebnissen.
**`mapDeviceCondition` ist Fachlogik** (heute aus `@ra/shared`, `loanApi.ts:21`) und wandert mit
Testabdeckung mit — sie ist die Abbildung des freien `devices.status`-Textes auf den Leihzustand und
die einzige Stelle, an der „reserviert", „defekt" und „verfuegbar" auseinandergehalten werden.

**Test:** `src/app/m/radio/_db/leihen.test.ts` — vier Faelle mit je einem Namen:
`lehnt ein unbekanntes Geraet ab`, `lehnt ein nicht verleihbares Geraet ab`,
`lehnt ein Geraet in nicht verleihbarem Zustand ab und nennt den Zustand in betroffen`,
`lehnt den zweiten gleichzeitigen Verleih ueber den Unique-Index ab`. ⚠️ Die vier pruefen die
**Server**-Seite und muessen unterscheidbar bleiben, auch wenn drei von ihnen auf denselben `grund`
laufen — sonst ist die Gröbung des Diskriminators aus Posten 1 unbemerkt bis in die Fachlogik
durchgeschlagen.

**4. `X-API-Key` neben `Authorization: Bearer`.** `extractToken` (`loanApi.ts:67-74`, Kommentar ab
`:63`) akzeptiert
**beide** Koepfe. Das ist hier nur eine Zeile wert, aber es ist die dokumentierte Bruchstelle jedes
naiven Ports (Analyse `:2388`, `RA-LOAN-1`): wer die Grenze „erstmal 1:1 nachbaut" und dabei nur
`Authorization` liest, bricht jeden `X-API-Key`-Aufrufer — lautlos, mit 401. Da dieses Kapitel die
Grenze **loescht** statt sie nachzubauen, ist der Posten erledigt; er steht hier, damit niemand ihn
als „noch zu portieren" wiederentdeckt.

## 6.4 Bleibt eine oeffentliche API? Nein.

**Entschieden: die oeffentliche Loan-API wird ersatzlos gestrichen.** Es gibt keinen externen
Konsumenten (Entscheidung 13, Betreiberantwort 3), und der eine produktive Konsument — der Alt-Kiosk —
stirbt mit dem Port.

**Was mit ihr faellt**, vollstaendig aufgezaehlt, damit ein Plan-Autor daraus Loeschtasks schneiden kann:

* `radio-admin/server/src/routes/loanApi.ts` (die sechs Routen, `requireLoanApiAuth` `:83-95`,
  `extractToken` `:67-74`, beide Projektionen)
* `radio-admin/server/src/routes/tokens.ts` (3 Endpunkte: anlegen, listen, widerrufen)
* `radio-admin/server/src/repos/apiTokenRepo.ts` (`verifyApiToken`, `mintToken`, `listTokens`, `revokeToken`)
* `radio-admin/server/src/auth/loan-api-jwt.ts` (`verifyLoanJwt`, JWKS-Resolver)
* die Tabelle `api_tokens` (`radio-admin/server/src/db/schema.ts:59-70`) — siehe 6.5
* `radio-admin/client/src/features/settings/ApiTokensPage.tsx` (5 `render`-Funktionen, damit auch 5
  Posten von der Falle-9-Rechnung der Analyse `:300`) und `client/src/hooks/useApiTokens.ts`,
  plus der Einsprung aus `client/src/pages/SettingsPage.tsx`
* auf der Kiosk-Seite der ganze `RADIO_ADMIN_*`-Block (6.3) und `modules/radio-admin/` als Ganzes

**Der Preis dieses Wegs, ausgeschrieben:** eine gestrichene API ist eine Tuer, die man spaeter neu
bauen muss. Konkret kostet ein spaeterer Neubau (a) einen Route Handler unter
`src/app/m/radio/api/…`, (b) eine Widerrufstabelle mit `token_hash`/`prefix`/`revoked_at` — also
funktional genau das, was hier geloescht wird —, und (c) neu hinzu: den Cordon von Hand, weil das
Modul `requiresAuth: false` fuehrt.

**Der Preis des Gegenwegs — „als Modul-Route erhalten" — ist hoeher, und zwar dauerhaft:** eine API
ohne Konsument ist Angriffsflaeche ohne Nutzen. Mit `requiresAuth: false` (Entscheidung 4) erbt sie
**kein** Middleware-Gating; jeder Endpunkt traegt Zugangs- und Host-Riegel selbst, bei jeder spaeteren
Aenderung neu, und Falle 61 ist genau der Fehler, den man dabei macht — `src/app/m/lagerbuch/_lib/host.ts`
beschreibt ihn ausgeschrieben. Dazu kommt der Kern von Entscheidung 8: der heutige Zugang ist ein
**unbefristetes, unwiderrufliches** geteiltes Geheimnis. Eine „erhaltene" API muesste entweder dieses
Modell mitschleppen (ausgeschlossen) oder ein neues Token-Modell **mitbauen**, das niemand ruft. Man
zahlt (b) und (c) also sofort, nicht spaeter, und ohne einen Nutzer, der es rechtfertigt.

**Damit gilt:** nach dem Port hat das Modul `radio` **keinen** HTTP-Endpunkt, der von aussen
authentifiziert wird. Der einzige nicht angemeldete Zugang ist der gescannte QR-Code (Entscheidungen 5
und 6), und der ist Sache des Zugangs-Kapitels, nicht dieses hier. **Zusage an das Zugangs-Kapitel:**
dieses Kapitel erzeugt keinen Route Handler und beansprucht keinen Pfad unter `src/app/m/radio/api/`.

## 6.5 `api_tokens`, wenn ihr einziger Konsument stirbt

Die Tabelle traegt acht Spalten (`radio-admin/server/src/db/schema.ts:59-70`): `id`, `name`,
`token_hash` (sha256-hex, „the plaintext is never stored"), `prefix` (erste ~11 Zeichen fuer die
Anzeige), `created_at`, `created_by`, `last_used_at`, `revoked_at`.

**Sie wandert nicht.** Und anders als bei den Leihdaten haengt daran **keine** Historie — das ist
belegbar, nicht geschaetzt:

```
grep -n "export const loans" -A 30 radio-admin/server/src/db/schema.ts
grep -n "changed_by\|export const " radio-admin/server/src/db/schema.ts
```

* `loans` (`schema.ts:117-137`) fuehrt **keine** Token-, Konsumenten- oder Herkunftsspalte: `id`,
  `device_id`, drei `snapshot_*`, `borrower_name`, `borrowed_at`, `returned_at`, `return_note`,
  `created_at`, `updated_at`. Wer eine Leihe erzeugt hat, steht dort nicht — **keine Journalzeile zeigt
  auf einen Token.**
* `device_events.changed_by` (`schema.ts:94`) ist die einzige Herkunftsspalte im Schema und speichert
  einen `sub` (`schema.ts:73-77`: „audit columns (which store `sub`)"), keinen Token. Und der
  Leih-API-Pfad schreibt ohnehin keine Geraete-Ereignisse.
* `api_tokens.created_by` ist eine **tote Spalte** — geschrieben und nie gelesen (Analyse `:1255-1259`,
  mit der ausdruecklichen Korrektur auf `:888`, dass sie **nicht** zu den Audit-Spalten gehoert, die
  ueber `users` aufgeloest werden).

**Folge:** `api_tokens` kann fallen, ohne eine einzige Zeile zu verwaisen. Es gibt keine
Fremdschluesselbeziehung, keinen Bericht, keine Anzeige, die einen Token-Namen neben einer Leihe zeigt.

**Import:** die Tabelle wird **nicht** angelegt und **nicht** gelesen.
**Zusage an das Datenmodell- und das Import-Kapitel:** `api_tokens` erscheint nicht im Suite-Schema und
nicht im Import. Das Datenmodell-Kapitel fuehrt sie ausdruecklich als „wandert nicht" und haelt dieselbe
Protokoll-statt-Paritaet-Regel.

⚠️ **Zusage an das Uebergabe-/Runbook-Kapitel, und hier liegt ein Widerspruch, den die Zusammenfuehrung
aufloesen muss.** `api_tokens` darf **nicht** in den Paritaetscheck: ein Paritaetscheck vergleicht
`SELECT COUNT(*)` auf **beiden** Seiten, und auf der Zielseite gibt es die Tabelle nicht — die Abfrage
scheitert nicht mit „ungleich", sondern mit `no such table`, also mit einem Abbruch mitten im Cutover,
zu dem Schritt und Uhrzeit im Runbook stehen. Die Zaehlreihe der Analyse fuehrt sie noch mit
(`docs/radio-portierung-analyse.md:751-752`, sechs Paritaets-Sollwerte inklusive `api_tokens`), und die
Uebergabe hat sie von dort uebernommen. Mit Entscheidung 13 ist diese Zeile **gestrichen**: die
Zeilenzahl der **Quell**tabelle wird beim Snapshot **protokolliert** (eine Zeile im Runbook, „so viele
Tokens waren zum Freeze aktiv"), damit die Loeschung nachvollziehbar ist, aber **nicht** verglichen.
Aus sechs Paritaets-Sollwerten werden damit **fuenf**: `devices`, `software_versions`, `users`,
`device_events`, `loans`.

Ebenfalls **nicht** portiert wird `AdminUser` aus radio-inventar (Entscheidung 14) — hier nur der
Grenzbezug: die Tabelle war Traeger eines **zweiten** Identitaetssystems neben Pocket ID, und sie ist im
OIDC-Betrieb ohnehin unbeschrieben (`pocket-id.service.ts:134` baut `pocketid:${sub}` statt zu
schreiben). Mit dem Wegfall der Grenze faellt der Grund, ueberhaupt zwei Identitaetssysteme zu haben.

## 6.6 Der Ausfall-Puffer `STALE_GRACE_MS` — weder portieren noch stillschweigend streichen

Heute haelt `STALE_GRACE_MS = 5 * 60_000` (`radio-admin.service.ts:48`, angewandt auf `:123`) den Kiosk
bei einer kurzen Stoerung von radio-admin bedienbar: nach Ablauf der Cache-TTL wird ein nicht zu alter
Geraete-Cache weiter ausgeliefert, statt hart zu scheitern. Die Begruendung steht auf `:43-47`:
„loans/return/history stay operational on a brief outage instead of hard-failing."

**Portieren geht nicht — der Puffer hat im Monolithen strukturell keine Funktion.** Er puffert genau
einen Ausfallmodus: einen **unerreichbaren fremden Host** (`fetch` wirft → `:190-196`, oder non-2xx →
`:151-153` `ServiceUnavailableException`). Diesen Modus gibt es nach dem Wegfall der Grenze nicht mehr.
Ein 1:1-Port waere ein In-Memory-Cache, der einen Fehler abfedert, der nicht eintreten kann — und der
dabei die Frischezusage der Geraeteliste aufgibt, die heute die TTL traegt.

**Streichen ohne Ersatz geht auch nicht**, weil die **fachliche** Zusage ueberlebt: „Ausleihe, Rueckgabe
und Historie bleiben bei einer kurzen Stoerung bedienbar." Die Frage, die das entscheidet, ist: welcher
Ausfallmodus tritt in-process an die Stelle des unerreichbaren Hosts? Antwort: **eine belegte
SQLite-Datenbank** (`SQLITE_BUSY` unter gleichzeitigem Schreibzugriff), nicht ein Netzwerkfehler. Und
den deckt der DB-Helfer der Suite bereits ab:

```
src/core/db/index.ts:18   sqlite.pragma("journal_mode = WAL");
src/core/db/index.ts:19   sqlite.pragma("foreign_keys = ON");
src/core/db/index.ts:20   sqlite.pragma("busy_timeout = 5000");
src/core/db/index.ts:21   sqlite.pragma("synchronous = NORMAL");
```

WAL erlaubt Lesern, waehrend eines Schreibvorgangs weiterzulesen — die drei **Lesepfade**
(Geraeteliste, aktive Leihen, Historie) sind damit von einem laufenden Schreibvorgang gar nicht
betroffen. `busy_timeout = 5000` gibt einem **Schreibvorgang** fuenf Sekunden Wartezeit, bevor er
scheitert. Das ist der ganze Ersatz, und er ist bereits gebaut; es entsteht **kein** modul-eigener
Cache und **kein** modul-eigener Retry.

**Was dieses Kapitel daraus als Auflage macht:** der Ausfall-Puffer wird als Zeile im Kommentarkopf von
`_db/leihen.ts` **festgehalten**, mit Verweis auf `radio-admin.service.ts:43-48`, damit die
Streichung eine dokumentierte Entscheidung ist und nicht eine Auslassung, die beim naechsten Blick in
die Alt-App als „vergessen" wiederentdeckt wird. Fuenf Minuten Toleranz gegen einen Netzwerkausfall
werden **nicht** zu fuenf Minuten veralteter Geraeteliste ohne Grund.

**Test:** `src/app/m/radio/_db/leihen.test.ts` → `liest die Geraeteliste waehrend eines offenen
Schreibvorgangs`. Der Test gehoert hierher und nicht ins Datenmodell-Kapitel, weil er die **fachliche
Zusage aus der Grenze** prueft, nicht das Schema. Seine Bauform ist verbindlich, und zwar in drei
Punkten — **die naheliegende Form kann die Zusage nicht halten und ist trotzdem gruen:**

1. **Zwei getrennte Verbindungen, nicht eine.** `better-sqlite3` ist synchron und
   verbindungsgebunden: ein Lesen auf **demselben** Handle innerhalb der eigenen offenen Transaktion
   sieht deren eigenen Zustand und kann gar nicht in Konkurrenz geraten. Ein Test, der eine
   Transaktion oeffnet und danach auf derselben Verbindung liest, **kann nicht rot werden** — er
   prueft nichts. Also: `const schreiber = openModuleDatabase(pfad)` und
   `const leser = openModuleDatabase(pfad)`, auf dem Schreiber `BEGIN IMMEDIATE` plus ein `INSERT` in
   `loans`, und **auf dem Leser** `geraeteMitLeihstand(leser)`.
2. **Eine Datei, kein `:memory:`.** Zwei `:memory:`-Handles sind zwei **verschiedene** Datenbanken;
   der Test liefe dann an der Frage vorbei. Der Pfad kommt aus `os.tmpdir()` und wird im `afterEach`
   entfernt.
3. **Der Test prueft seine eigene Voraussetzung.** Erste Zusicherung:
   `expect(leser.pragma("journal_mode", { simple: true })).toBe("wal")`. Damit haengt die Aussage
   nicht an einer Behauptung ueber `openModuleDatabase`, sondern misst sie — und wenn ein spaeterer
   Umbau von `src/core/db/index.ts:18` WAL entfernt, faellt genau dieser Test, statt still
   weiterzulaufen.

Der zweite Fall in derselben Datei heisst `wartet auf eine belegte Datenbank, statt sofort zu
scheitern` und prueft die andere Haelfte des Ersatzes: bei offener Schreibtransaktion auf dem einen
Handle scheitert ein Schreibversuch auf dem anderen **nicht sofort**, sondern erst nach
`busy_timeout` (`src/core/db/index.ts:20`).

## 6.7 Die Reihenfolge-Auflage als Bauabschnitte

Entscheidung 15 klingt wie eine Empfehlung zur Bauplanung. Sie ist schaerfer, und der Grund ist
Entscheidung 3: **der Alt-Kiosk laeuft heute schon unter `radio.iuk-ue.de`.** Es gibt kein
Parallelfenster. Damit **ist der Router-Schwenk der Fall der HTTP-Grenze** — kein Schritt danach. Alles,
was Entscheidung 15 verlangt, muss **vor** dem Schwenk fertig sein, und beide Domains ziehen im selben
Fenster um (Analyse `:283-284`). **Keine Halb-Migration ist deploybar.**

| Abschnitt | Was fertig sein muss | Woran man es sieht |
|---|---|---|
| **A — Datenmodell und Import** | `loans` und `devices` im Suite-Schema, Import mit normalisierten Zeitstempeln (Entscheidung 11), Unique-Index gegen Doppelverleih | Import laeuft gegen die Snapshot-Kopie, Paritaetscheck **plus** feldweise Stichprobe (`CLAUDE.md`, „Cutover einer Alt-Anwendung") |
| **B — die sechs Ersatzfunktionen** | `_db/leihen.ts` vollstaendig, alle sechs als Drizzle-Aufrufe **im selben Prozess**; `mapDeviceCondition` mitgewandert; die Abbildung der acht Codes auf die beiden Unions vollstaendig | `src/app/m/radio/_db/leihen.test.ts` gruen — die vier Riegel-Faelle, das Lesemodell und die beiden WAL-Faelle |
| **C — beide Oberflaechen auf B** | Ausleihe an `/` und Verwaltung an `/admin` rufen **ausschliesslich** `_db/leihen.ts` (ueber `_actions/ausleihe.ts`, wo geschrieben wird); kein `fetch` gegen einen fremden Host im Modul | `rg -n "RADIO_ADMIN_\|api/v1/" src/app/m/radio` liefert **nichts** — der Abnahmebefehl fuer diesen Abschnitt |
| **D — Router-Schwenk** | A–C gruen. Traefik-Router fuer `radio.iuk-ue.de` zeigt auf den Suite-Container; der pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin` steht (Entscheidung 2) | ein echter Abruf von `/` und `/admin` auf dem Prod-Host — nicht `pnpm build`; die Falle-61-Klasse und Falle 7 zeigen sich **nur** im echten Abruf |
| **E — Abbau** | Alt-Kiosk und Alt-Verwaltung abgestellt, `RADIO_ADMIN_*` aus der Compose-Datei entfernt, Alt-Volumes 2 Wochen im Standby | `docker ps` ohne die beiden Alt-Container, Volumes noch vorhanden |

**Der Rueckweg ist „Router zurueck"** (Entscheidung 3), und er ist nur bis E moeglich: solange die
Alt-Container samt Volume stehen, ist ein Schwenk zurueck eine Traefik-Aenderung. Nach E ist er ein
Restore. **Zusage an Spec 2 (Runbook):** D und E sind zwei getrennte Runbook-Schritte mit mindestens
zwei Wochen dazwischen, und die Zeile fuer den `redirectRegex` lebt auf dem Server, nicht im Repo.

### Wenn jemand die Reihenfolge tauscht

⚠️ **Verwaltung zuerst geschwenkt (Suite bedient `radio.iuk-ue.de`, Alt-Kiosk laeuft weiter).** Der
Alt-Kiosk zeigt mit `RADIO_ADMIN_URL` auf einen Host, der jetzt die Suite bedient. `api/v1/loan-devices`
antwortet 404 → `refreshDevices` wirft `ServiceUnavailableException` (`:151-153`). Der Ausfall ist
zunaechst **unsichtbar**: der Geraete-Cache traegt noch, und `:123` haelt ihn nach Ablauf der TTL weitere
fuenf Minuten. Erst danach faellt der Kiosk hart aus. Schlimmer als der Ausfall ist das Fenster davor:
Ausleihen und Rueckgaben, die in dieser Zeit ausgeloest werden, laufen ueber `loanRequest` (`:171`) gegen
denselben toten Endpunkt und landen **nirgends** — nicht in der alten Datenbank, denn radio-inventar
„never writes back" (`:51-54`: „radio-admin is the master for device data; radio-inventar never writes
back"), und nicht in der neuen. Genau der Ausfall-Puffer, der im Normalbetrieb
hilft, verzoegert hier die Entdeckung um bis zu TTL + 5 Minuten.

⚠️ **Kiosk zuerst geschwenkt (Suite bedient die Ausleihe, Alt-Verwaltung laeuft weiter).** Die
Suite-Ausleihe zeigt eine leere oder veraltete Geraeteliste, weil der Bestand weiter in der alten SQLite
gepflegt wird; jede Aenderung der Alt-Verwaltung (neues Geraet, `loanable`-Umschaltung,
Statusaenderung) laeuft in eine Datenbank, die nach dem Cutover ueberschrieben wird. Ergebnis: stille
**Divergenz** — die Suite verleiht auf einem Bestand, den niemand mehr pflegt, und der Import beim
echten Cutover ueberschreibt entweder die neuen Leihen oder die alten Bestandsaenderungen. Beides ist
Datenverlust ohne Fehlermeldung.

**Beide Bilder haben dieselbe Ursache:** radio-admin ist Master fuer Geraete **und** Leihen, und
radio-inventar schreibt ausschliesslich dorthin. Wer nur eine der beiden Domains schwenkt, trennt
Master und Schreiber. Deshalb ist die Auflage nicht „erst B, dann D", sondern **„D ist ein einziger
Schnitt fuer beide Domains"**.

---

# 7. PWA, Health, Boot-Pruefungen und Konfiguration

Dieses Kapitel traegt alles, was `radio` **ausserhalb** einer Seite braucht: den Umgang mit dem
Service Worker des Alt-Kiosks, den Endpunkt, den der Monitor abfragt, die Pruefungen beim Start, die
Umgebungsvariablen und die Sicherung.

**Zu den Fallen-Nummern:** in diesem Projekt zaehlen drei Systeme parallel. „Suite-Falle N" meint die
zwoelf aus `CLAUDE.md:8-114`. „Analyse-Falle N" meint die 31 aus
`docs/radio-portierung-analyse.md:1187-1756`. „lagerbuch-Falle N" meint die Nummerierung der
Lagerbuch-Spec (55/56/57/61), die der Auftrag zitiert. Jede Nennung unten traegt ihre Quelle mit.

**Zu den Kapitelnummern:** wo dieses Kapitel eine Zusage an ein anderes macht, steht sie als
„**Zusage an das \<Sache\>-Kapitel**". Die Nummer setzt die Zusammenfuehrung ein — sie steht hier
bewusst nicht geraten da. Gesammelt in §7.7.

---

## 7.1 PWA: `radio` bekommt keine — und braucht dafuer einen Abraeum-Worker

### 7.1.1 Die Entscheidung

**`radio` erhaelt kein Manifest, keine Icon-Handler und keinen `<link rel="manifest">`.** Es entsteht
weder `src/app/m/radio/manifest.webmanifest/route.ts` noch ein Icon-Handler, und das Modul-Layout
setzt **kein** `metadata.manifest`.

Begruendung, in der Reihenfolge der Tragfaehigkeit:

1. **Der Nutzungsfall ist weg.** Betreiberantwort 5 (`docs/radio-portierung-analyse.md:1774`,
   woertlich „Ist kein Tablet.") beschreibt zwei Zugangswege: ein gescannter QR-Code, oder die
   Anmeldung ueber die Suite mit Zugriff aus der Kachel. Beide enden in einem **Browser-Tab**. Eine
   PWA loest genau ein Problem, das hier keins ist: das wiederholte Starten **ohne** Adresszeile auf
   **einem** Geraet. Wer einen QR-Code scannt, installiert nichts; wer aus der Suite-Kachel kommt,
   hat die Suite schon offen.
2. **Ein Manifest ohne Installationsabsicht ist eine Zusage, die niemand einloest.** `display:
   standalone` und ein `start_url` sind Werte, die beim Installieren **eingebrannt** werden — der
   Kopfkommentar von `src/app/m/lagerbuch/manifest.webmanifest/route.ts:38-41` schreibt genau das
   aus („SIE WERDEN BEIM INSTALLIEREN EINGEBRANNT. Ein spaeterer Tausch erreicht kein Geraet, auf dem
   die App schon liegt."). Fuer ein Modul, dessen Bedienung mit dem Zurueckgeben endet, ist das
   Risiko ohne Gegenwert.
3. **Offline schreiben ist offen** (Betreiberfrage 8, `docs/radio-portierung-analyse.md:1782`). Ein
   Service Worker mit Cache, der heute gebaut wird, verspricht genau die Faehigkeit, die diese Spec
   nicht zusagen darf — siehe §7.1.6.

**Damit ist lagerbuch-Falle 56 („jeder Suite-Host bewirbt eine Modul-PWA") durch Abwesenheit
beantwortet.** Das ist die staerkste Form: es gibt keinen Pfad an der Wurzel, der sie ausloesen
koennte, und keinen Host-Riegel, den ein spaeterer Umbau vergessen kann.

**Folge, ausdruecklich, damit sie nicht als Auslassung gelesen wird:** die drei PWA-Bauteile des
Alt-Kiosks — `PWAInstallBanner.tsx`, `PWAOfflineIndicator.tsx`, `PWAUpdateNotification.tsx` in
`radio-inventar/apps/frontend/src/components/pwa/` — wandern **nicht mit**. Ebenso nicht der Hook
`radio-inventar/apps/frontend/src/hooks/usePWA.ts` (153 Zeilen). **Suite-Falle 7** (`CLAUDE.md:31-44`,
`@ant-design/icons` in einer Server Component ergibt HTTP 500) wird von diesem Kapitel deshalb
**nicht beruehrt** — es entsteht hier kein Icon und kein Symbol. Das ist eine Folge der Entscheidung,
keine Luecke.

### 7.1.2 Was der Alt-Kiosk hinterlaesst — gemessen

Die Analyse fuehrt an zwei Stellen ausdruecklich „**nicht gemessen**": Analyse-Falle 30 (i)
(`docs/radio-portierung-analyse.md:1712-1714`, „Der Scope des **Alt**-Kiosks … ist **nicht
gemessen**") und offene Messung 36 (`:2149-2150`). **Beide sind jetzt gemessen.** Es gibt kein
Vite-PWA-Plugin — `radio-inventar/apps/frontend/vite.config.ts` enthaelt weder `VitePWA` noch
`workbox`; der Worker ist handgeschrieben und liegt statisch in `public/`:

| Tatsache | Beleg |
| --- | --- |
| Registrierung mit **Root-Scope** | `radio-inventar/apps/frontend/src/hooks/usePWA.ts:72-73` — `navigator.serviceWorker.register('/sw.js', { scope: '/' })` |
| Auslieferungspfad `/sw.js`, statisch | `radio-inventar/apps/frontend/public/sw.js` (3,6 kB, kein Build-Schritt) |
| Cache-Name | `sw.js:2` — `const CACHE_NAME = 'radio-inventar-v1'` |
| Uebernahme **sofort**, ohne Reload | `sw.js:24` `self.skipWaiting()`, `sw.js:40` `self.clients.claim()` |
| Vorgeladen: `/`, `/offline.html`, `/manifest.json`, `/favicon.svg`, `/apple-touch-icon.svg`, drei Icons | `sw.js:6-15` |
| Manifest an der Wurzel, `scope: "/"`, `start_url: "/"` | `radio-inventar/apps/frontend/public/manifest.json` |
| `<link rel="manifest" href="/manifest.json">` | `radio-inventar/apps/frontend/index.html:7` |

**Und die Strategie je Anfrageart — das ist der Teil, der Analyse-Falle 30 (ii) praezisiert:**

* **Navigationen** (`request.mode === 'navigate'`): **network-first**, Cache nur im `.catch()`
  (`sw.js:78-96`).
* **`/api/*`**: ebenfalls **network-first**, Cache nur im `.catch()` (`sw.js:56-77`) — und
  erfolgreiche Antworten werden per `cache.put` mitgeschrieben (`sw.js:63-68`).
* **Alles andere** (JS, CSS, Bilder, `/manifest.json`, Icons): **cache-first**, mit
  Hintergrund-Nachladen (`sw.js:100-127`).

**Daraus folgt die Gefahrenlage nach dem Umschwenk praeziser als in der Analyse.** Der Origin bleibt
zeichengleich (Betreiberantwort 1) und es gibt **kein Parallelfenster** (gesetzte Entscheidung 3) —
jedes Telefon, das den Alt-Kiosk je geoeffnet hat, traegt den alten Worker weiter, und er ist
`clients.claim()`-aktiv. Was das konkret heisst:

* **Kein dauerhaft veraltetes HTML.** Navigationen sind network-first; solange Netz da ist, kommt die
  Suite-Antwort durch. Die Analyse hielt hier das Schlimmere fuer moeglich (`:1716-1721`); gemessen
  ist es der guenstigere Fall.
* **Aber:** ohne Netz liefert der alte Worker `/` aus seinem Cache — die **Alt-Oberflaeche**, gegen
  ein Backend, das es nicht mehr gibt. Und `cache-first` betrifft dauerhaft `/manifest.json`,
  `/favicon.svg`, `/apple-touch-icon.svg` und die drei Icons: **eine installierte Alt-PWA bewirbt
  sich nach dem Cutover mit dem alten Manifest weiter**, weil das Manifest aus dem Cache kommt und
  nie neu geholt wird.
* **Dazu die zwischengespeicherten `/api`-Antworten.** Der alte Worker hat Bestands- und
  Ausleihdaten in seinem Cache liegen; sie sind fuer die Suite bedeutungslos, gehoeren aber nicht auf
  ein fremdes Telefon.

**Kein Gate sieht davon etwas** (`docs/radio-portierung-analyse.md:1723-1724`): ein Service Worker
mit veraltetem Cache antwortet mit HTTP 200.

### 7.1.3 Der Abraeum-Worker

**Es entsteht genau eine PWA-Route, und ihr einziger Zweck ist die Loeschung.**

Dateien:

* `src/app/m/radio/_lib/sw-quelle.ts` — exportiert `export const RADIO_SW_ABRAEUM_QUELLE: string`.
  **Kein `"use client"`** (Suite-Falle 6, `CLAUDE.md:27-30`): ein Wert aus einem Client-Modul kaeme
  im Route Handler als Client-Referenz an, HTTP 500. Vorbild fuer die Trennung Quelle/Handler:
  `src/app/m/qr/sw.js/route.ts:1` liest `SW_SOURCE` aus `@/app/m/qr/_lib/sw-source` mit der
  Begruendung „damit er testbar ist".
* `src/app/m/radio/sw.js/route.ts` — `export function GET(req: Request): Response`.

Der Handler, vollstaendig:

```ts
import { hostAbweisung } from "../_lib/hostRiegel";
import { RADIO_SW_ABRAEUM_QUELLE } from "../_lib/sw-quelle";

export function GET(req: Request): Response {
  return (
    hostAbweisung(req) ??
    new Response(RADIO_SW_ABRAEUM_QUELLE, {
      headers: {
        "content-type": "text/javascript; charset=utf-8",
        "cache-control": "no-cache",
      },
    })
  );
}
```

`hostAbweisung` ist die **nicht werfende** Riegelform (`Response | null`, mit `??`
kurzgeschlossen) — genau die Bauform aus `src/app/m/lagerbuch/_lib/hostRiegel.ts`, und aus demselben
Grund: ein `notFound()` waere eine HTML-Fehlerseite mit `Content-Type: text/html`, und der Browser
meldete „manifest fetch failed" bzw. brach die Worker-Registrierung mit einer irrefuehrenden Meldung
ab. Der Riegel steht **strukturell** als erste Anweisung, nicht nur konventionell: der rechte
`??`-Zweig wird erst ausgewertet, wenn der linke `null` ist. **Zusage an das Zugangs-Kapitel:**
`hostAbweisung` liegt in `src/app/m/radio/_lib/hostRiegel.ts` und ruft die nicht werfende
Praedikatsform aus `src/app/m/radio/_lib/host.ts` (dort in der lagerbuch-Form, ohne
„kein Prod-Host konfiguriert → durchlassen"-Zweig, gesetzte Entscheidung 10). Dieses Kapitel legt
`host.ts` nicht an, es benutzt es.

Der Quelltext in `sw-quelle.ts` — verbindlich, drei Eigenschaften und **kein Zeichen mehr**:

```js
// Abraeum-Worker: ersetzt den Service Worker des Alt-Kiosks und traegt sich aus.
// KEIN fetch-Handler. Dieser Worker beantwortet nichts.
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // ALLE Cache-Namen, nicht nur 'radio-inventar-v1': aeltere Staende koennen
      // weitere hinterlassen haben, und dieser Origin gehoert ab jetzt der Suite.
      const namen = await caches.keys();
      await Promise.all(namen.map((n) => caches.delete(n)));
      await self.clients.claim();
      await self.registration.unregister();
    })(),
  );
});
```

**Die drei Eigenschaften und warum jede einzelne noetig ist:**

1. **Kein `fetch`-Handler.** Ein Worker ohne `fetch`-Handler laesst jede Anfrage unberuehrt zum Netz.
   Das ist die einzige Form, die keine neue Cache-Semantik einfuehrt — und sie macht Betreiberfrage 8
   nicht vor.
2. **`caches.keys()` statt eines festen Namens.** Der gemessene Name ist `radio-inventar-v1`
   (`radio-inventar/apps/frontend/public/sw.js:2`), aber die `activate`-Logik des Alten loescht
   selbst nur fremde Namen (`sw.js:33-36`, `:35`) — ueber frueheren Staenden auf dem jeweiligen Telefon sagt
   das nichts. Ein fester Name ist eine Annahme; `caches.keys()` ist keine.
3. **`skipWaiting()` + `clients.claim()` vor `unregister()`.** Ohne beides bliebe der **alte** Worker
   der aktive, bis alle Tabs geschlossen sind — und `unregister()` eines Workers, der nie aktiv
   wurde, entfernt die falsche Registrierung nicht.

**Zwei Betriebsfolgen, auf die das Runbook baut:**

* **Nichts in der Suite ruft `navigator.serviceWorker.register()`.** Diese Route wird also
  ausschliesslich von der **Update-Pruefung eines schon registrierten Workers** abgeholt: Browser
  holen das Worker-Skript bei einer Navigation im Scope neu und vergleichen die Bytes. Sie
  unterscheiden sich, der Abraeum-Worker installiert sich, raeumt auf, traegt sich aus. **Auf einem
  Geraet, das den Alt-Kiosk nie geoeffnet hat, wird die Route nie abgerufen** — das ist richtig und
  kein Fehler.
* **Der erste Seitenaufruf nach dem Umschwenk kann noch vom alten Worker bedient werden.** Der
  Worst Case ist **eine** veraltete Seitenansicht je Geraet, danach ist der Origin frei. Das gehoert
  in die Ankuendigung, die die gesetzte Entscheidung 8 ohnehin verlangt — **Zusage an das
  Zugangs-Kapitel** (das die Ankuendigung fachlich fuehrt) und **Zusage an Spec 2** (Runbook-Zeile:
  „Nach dem Umschwenk ein Telefon, das den Alt-Kiosk kannte, einmal neu laden und pruefen, dass die
  Suite-Oberflaeche erscheint").

### 7.1.4 Warum `/sw.js` trotz Modulpfad Root-Scope hat

Ein Service Worker beansprucht nur seinen **eigenen Pfad und darunter** — Analyse-Falle 30 (i)
(`docs/radio-portierung-analyse.md:1709-1711`) ist richtig, und die Antwort ist der Rewrite:

`decideRoute` in `src/core/routing.ts:43-79` prueft zuerst die Passthrough-Liste (`:50-52`), dann
einen bereits internen `/m/<key>`-Pfad (`:58-66`), und rewritet erst danach nach Host:
`return { action: "rewrite", target: `/m/${mod.key}${rest}`, moduleKey: mod.key }` (`:79`). Der
Browser sieht auf `radio.iuk-ue.de` also die Adresse **`/sw.js`** — Root-Scope, ohne
`Service-Worker-Allowed`-Header —, waehrend intern `/m/radio/sw.js` antwortet. Genau derselbe
Mechanismus tragt heute `qr` (`src/app/m/qr/sw.js/route.ts:3-8`, woertlich: „extern liegt er auf
`qr.<domain>/sw.js` (Root-Scope, ohne `Service-Worker-Allowed`-Header), intern unter `/m/qr/sw.js`").

**Bedingung:** `SUITE_HOST_RADIO` muss gesetzt sein, sonst greift der Rewrite nicht und `/sw.js` auf
`radio.iuk-ue.de` landet im Portal-Modul (§7.4.4, erster stiller Fall). Auf **jedem anderen**
Suite-Host rewritet `/sw.js` in dessen Modul; die radio-Route ist dort nicht erreichbar, und wo sie
es doch waere (interner Pfad `/m/radio/sw.js`), antwortet der Host-Riegel mit 404.

### 7.1.5 Die `releaseBody()`-Lehre — warum sie hier nicht greift

Der Service Worker des `qr`-Moduls war latent kaputt, weil er Bodies nicht gecachter Antworten
ungelesen liess; die Abhilfe steht dort heute als `releaseBody(res)`
(`src/app/m/qr/_lib/sw-source.ts:100`, `:150`, Definition `:212`; Entscheidungslog vom 23.07.).

**Der Abraeum-Worker kann diesen Fehler strukturell nicht haben: er hat keinen `fetch`-Handler und
liest niemals eine Antwort.** Die Lehre wird also nicht abgeschrieben, sondern **eingehalten, indem
die Ursache fehlt**. Ein `releaseBody` in dieser Datei waere toter Code — und ein Signal, dass hier
doch Antworten verarbeitet werden.

**Die Lehre wird trotzdem verbindlich weitergegeben:** sollte `radio` je einen cachenden Worker
bekommen (nur unter einer Antwort auf Betreiberfrage 8, §7.1.6), gilt ab der ersten Zeile: jede
Antwort, die **nicht** in den Cache geht, wird ausgelesen oder verworfen. Der Satz gehoert dann in
den Kopfkommentar von `sw-quelle.ts`, nicht in ein Review.

### 7.1.6 Offline **schreiben** — Betreiberfrage 8, offen. Nicht entschieden.

Betreiberfrage 8 (`docs/radio-portierung-analyse.md:1782`) ist die einzige der acht, die offen
geblieben ist: „Muss der Kiosk offline **schreiben** koennen?" Mit Antwort 5 hat sie sich verschoben —
nicht „Wandtablet ohne Netz", sondern „Telefon im Funkraum mit schlechtem Empfang".

**Dieses Kapitel entscheidet sie nicht und baut nichts, was sie vorwegnimmt.** Was hier zugesagt
wird, ist nur, was eine spaetere Antwort **nicht verbaut**:

* Der Abraeum-Worker fuehrt keinen Cache und keine Queue ein. Eine spaetere Offline-Faehigkeit
  ersetzt ihn, sie muss ihn nicht rueckbauen.
* Die Adresse `/sw.js` auf dem radio-Host ist damit **belegt und erprobt**. Ein spaeterer Worker
  erbt Route, Host-Riegel und Test.
* Was ein „Ja" kosten wuerde, gehoert benannt, damit die Frage entscheidbar bleibt: eine
  Schreib-Warteschlange auf dem Geraet heisst **Ausleihen ohne Serverpruefung**, also einen
  Konfliktfall „zwei Telefone leihen dasselbe Geraet offline aus". Der partielle Unique-Index auf
  offene Leihen (Analyse-Falle 2, `docs/radio-portierung-analyse.md:1208`) faengt das beim
  Nachtragen mit einem **Fehler**, nicht mit einer Loesung — die Aufloesung waere fachlich zu
  entscheiden. Deshalb ist „offline lesen" beantwortbar, „offline schreiben" nicht nebenbei.

**Was heute gilt:** ohne Netz ist `radio` nicht bedienbar. Das ist der Zustand des Alt-Kiosks beim
Schreiben ebenfalls (`docs/radio-portierung-analyse.md:2289-2294`), also **keine
Verhaltensaenderung** und **keine Ankuendigung**.

⚠️ **Nicht zu verwechseln mit dem Ausfall-Puffer.** `STALE_GRACE_MS = 5 * 60_000`
(`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`, gesetzte
Entscheidung 15) ist **serverseitig** und hat mit dem Service Worker nichts zu tun: er haelt
Ausleihe/Rueckgabe/Historie bedienbar, wenn die **HTTP-Grenze zur Verwaltung** kurz stoert, nicht
wenn das Telefon kein Netz hat. Beim naiven Port fiele er weg. Er wird in dem Kapitel gefuehrt, das
den Datenweg traegt — **Zusage an das Ausleih-Kapitel**: dieses Kapitel baut keinen Ersatz dafuer und
kein Offline-Verhalten, das ihn ueberdeckt.

### 7.1.7 Tests

| Datei | Testname | Prueft |
| --- | --- | --- |
| `src/app/m/radio/_lib/sw-quelle.test.ts` | `"der Abraeum-Worker registriert keinen fetch-Handler"` | Quelle in einem Fake-`self` ausfuehren (`new Function("self", "caches", RADIO_SW_ABRAEUM_QUELLE)`), die aufgezeichneten `addEventListener`-Namen sind genau `["install", "activate"]` |
| " | `"er loescht ALLE Cache-Namen, nicht nur radio-inventar-v1"` | Fake-`caches.keys()` liefert `["radio-inventar-v1", "radio-inventar-v0", "sonstiges"]`; nach `activate` ist `caches.delete` fuer **alle drei** gerufen. **Drei unterschiedliche Namen, keiner davon Praefix des anderen** — ein Test mit nur `radio-inventar-v1` liesse eine fest verdrahtete Loeschung durch |
| " | `"er beansprucht die Clients und traegt sich danach aus"` | `clients.claim` wird gerufen, **danach** `registration.unregister`; Reihenfolge ueber eine gemeinsame Aufrufliste geprueft, nicht ueber zwei getrennte Spies |
| `src/app/m/radio/sw.js/route.test.ts` | `"auf fremdem Host 404, und nicht als HTML"` | `GET` mit `host: portal.localtest.me` → Status 404, Body `"Not found"`, **kein** `text/html` |
| " | `"auf dem radio-Host 200 mit text/javascript"` | `host: radio.localtest.me` → 200, `content-type` beginnt mit `text/javascript`, `cache-control: no-cache` |
| `src/app/m/radio/_lib/keine-pwa.test.ts` | `"radio bewirbt keine PWA"` | **Quelltext-Scan** ueber `src/app/m/radio`: keine Vorkommen von `serviceWorker.register`, `manifest.webmanifest`, `rel="manifest"`, `metadata.manifest`, `beforeinstallprompt`. Begruendung im Test: die Entscheidung „keine PWA" ist eine **Abwesenheit**, und Abwesenheiten haben sonst kein Gate — ein spaeter nachgeruesteter Banner waere lokal gruen und bewaerbe auf jedem Suite-Host eine radio-PWA |

**Kein e2e fuer den Fremd-Host.** Playwright fahrt gegen genau einen `baseURL` (lagerbuch-Falle 57);
der Fremd-Host-Fall ist deshalb ein Vitest-Routentest, nicht ein Playwright-Test. Ein e2e-Fall
`e2e/radio-sw.spec.ts` mit dem Namen `"GET /sw.js liefert den Abraeum-Worker"` ist sinnvoll, sobald
der Zwei-Host-Aufbau des Moduls steht — **Zusage an das Test-Kapitel**, das die e2e-Aufstellung
fuehrt: dieses Kapitel verlangt dort genau einen Fall, und er prueft die **Antwort**
(`page.waitForResponse` bzw. `request.get`), nicht eine Folgewirkung (Suite-Falle 10, zweite
Testregel, `CLAUDE.md:82-85`).

---

## 7.2 Health

### 7.2.1 Was der Monitor abfragt

**Der externe Monitor fragt `https://radio.iuk-ue.de/api/health/radio` ab. Nie `/api/health`.**

Der Grund ist keine Vorliebe: `src/app/api/health/route.ts` ist zwei Zeilen und liefert konstant
`{ status: "ok", timestamp }` — kein Modul, kein Parameter, keine Datenbank. Nach dem Cutover
antwortet `radio.iuk-ue.de/api/health` also weiter `ok`, **ohne ueber `radio` irgendetwas zu sagen**
(Analyse-Falle 29, `docs/radio-portierung-analyse.md:1677-1683`). Der `[modul]`-Handler sagt selbst,
warum er der richtige ist (`src/app/api/health/[modul]/route.ts:12-17`).

Erwartete Antwort: `{ status: "ok", module: "radio", revision: "<sha>" }` mit HTTP 200; bei Fehler
`status: "error"` und HTTP 503 (`src/app/api/health/[modul]/route.ts:27-30`). Die `revision` traegt
nur dieser Handler und nicht `/api/health` — begruendet ebendort (`:12-17`: die parameterfreie Route
kann Next prerendern, dort stuende der Bauzeit-Wert `unbekannt`). **Zusage an Spec 2:** die
Rollout-Verifikation von `radio` liest `revision` aus **dieser** Antwort.

`/api/health` und `/api/health/radio` sind beide unauthentifiziert erreichbar — `src/core/routing.ts:12`
fuehrt `/api/health` in `PASSTHROUGH`, und `decideRoute` steigt dort mit `{ action: "next" }` aus
(`:50-52`). Das gilt **hostunabhaengig**: `/api/health/radio` antwortet auch auf `iuk-ue.de`. Fuer
einen Monitor ist das bequem; fuer den Cutover ist es wichtig, dass er trotzdem den **radio-Host**
abfragt, weil nur das den Router mitprueft.

### 7.2.2 Der Container-Healthcheck bleibt unveraendert

`compose.yaml:140-144` prueft `http://127.0.0.1:3000/api/health/portal`. **Das bleibt so, und es ist
richtig:** der Healthcheck entscheidet ueber Container-Neustart und `depends_on`; er beantwortet „ist
der Prozess ansprechbar", nicht „ist radio in Ordnung". Wuerde er auf `radio` umgestellt, riss ein
Datenproblem eines einzelnen Moduls **die ganze Suite** in den Neustart — portal, qr, feedback, files,
lagerbuch und aufgaben mit.

**Die Kehrseite gehoert ausgesprochen:** ein kaputtes `radio.db` laesst den Container „healthy". Es
gibt in dieser Aufstellung **keinen** Weg, auf dem der Zustand von `radio` von allein auffaellt —
genau deshalb ist der externe Monitor aus §7.2.1 nicht optional, sondern der einzige Melder.

**Kein Eintrag in `compose.yaml` wird fuer `radio` gebraucht** — kein zweiter Healthcheck, kein
neues Volume (eine Datei `radio.db` unter `DATA_DIR`, gesetzter Zuschnitt), kein neuer Service.
Einzige compose-Beruehrung ist `SUITE_TRAEFIK_RULE` (§7.4.3), und die lebt in der `.env`.

### 7.2.3 Was `/api/health/radio` **nicht** beweist — der zaehlende Check

`checkModuleHealth` (`src/core/health/index.ts:4-17`) tut genau drei Dinge: `getModule(key)`,
`openModuleDatabase(moduleDbPath(key))`, `SELECT 1`. **`openModuleDatabase` legt das Verzeichnis bei
Bedarf neu an, und better-sqlite3 legt die Datei an, wenn sie fehlt.** Ein vertipptes `DATA_DIR` oder
ein nicht gemountetes Volume ergibt damit eine **nagelneue, leere `radio.db`, auf der `SELECT 1`
klaglos gelingt — health gruen, null Geraete** (Analyse-Falle 29,
`docs/radio-portierung-analyse.md:1685-1696`). Der Healthcheck **ist** das Gate, und er ist gruen.

**Der Gegenzug ist kein zweiter Endpunkt, sondern ein Runbook-Schritt.** Ein zaehlender
HTTP-Endpunkt waere ein unauthentifizierter Zaehler ueber den Geraetebestand — nicht schlimm, aber
auch nicht noetig, weil die Freigabe nach dem Cutover ohnehin ein Mensch mit `sqlite3` erteilt.

**Zusage an Spec 2 (Runbook) und an das Import-Kapitel:** die Freigabe nach dem Import prueft die
**Zaehl-Abfragen aus Pflicht 4** der Analyse (`docs/radio-portierung-analyse.md:748-763`) gegen die
Alt-Werte, nicht `status: "ok"`. Das sind fuenf Abfragen; die erste liefert **sechs** Zahlen
(`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`, `:751-752`) — daher
die Rede von „den sechs Zahlen" in Falle 29. Die verbindliche Liste fuehrt das Import-Kapitel; dieses
Kapitel sagt nur zu, dass **`/api/health/radio` sie nicht ersetzt** und dass der Monitor sie nicht
kennt.

Ein Nebenbefund, der die Runbook-Zeile praeziser macht: `api_tokens` traegt produktiv genau einen
Konsumenten, den Alt-Kiosk (gesetzte Entscheidung 13). Die Zahl bleibt trotzdem eine
Paritaets-Sollzahl — sie zaehlt Historie, nicht Zukunft.

### 7.2.4 Nebenwirkung, die als Vor-Cutover-Pruefung taugt

`checkModuleHealth` ruft `getModule(key)` als erstes, und `getModule` wirft bei unbekanntem Key
(Kommentar ebendort: „throws on unknown; not yet opened, so nothing to close"). **Bis der
Registry-Eintrag `radio` existiert, antwortet `/api/health/radio` also mit HTTP 503** und der
Fehlermeldung von `getModule`. Das ist kein Fehler, sondern die billigste Pruefung, dass ein Image den
Modul-Eintrag wirklich enthaelt: **Zusage an Spec 2** — vor dem Umschwenk einmal
`curl -s -o /dev/null -w '%{http_code}' https://iuk-ue.de/api/health/radio` gegen den **laufenden**
Container; 200 heisst „das Modul ist im Image", 503 heisst „falsches Image".

`src/core/health/index.test.ts` braucht **keinen** radio-spezifischen Fall: die Funktion ist
modul-agnostisch, und ein Test je Modul waere eine Liste, die das naechste Modul vergisst.

---

## 7.3 Boot-Pruefungen

### 7.3.1 Die Einhaengung — ohne sie laufen die Pruefungen nie

**Verbindlich: in `src/core/bootstrap.ts` wird die Fehlerliste um eine Zeile erweitert**, unmittelbar
nach der lagerbuch-Zeile (`:90`):

```ts
    ...(await lagerbuchBootFehler()),
    // radio: greift nur bei gesetztem SUITE_HOST_RADIO und WIRFT NIE (§7.3.2).
    ...(await radioBootFehler()),
```

dazu der Import neben `:14`:

```ts
import { radioBootFehler } from "@/app/m/radio/_lib/boot";
```

⚠️ **Das ist der stillste Posten dieses Kapitels.** Ohne diese Zeile laufen alle Pruefungen unten
**nie** — die Datei existiert, die Tests dazu sind gruen, `pnpm build` ist gruen, und beim Cutover
faellt niemandem auf, dass nichts geprueft wurde. `src/core/bootstrap.test.ts` koppelt nur das
Migrations-Dreieck (Migrationsordner ↔ `MODULE_MIGRATIONS`/`CORE_MIGRATIONS` ↔ `COPY` im
`Dockerfile`); **fuer die Boot-Haken gibt es kein Netz.** Deshalb schuldet dieses Kapitel selbst
einen Test dafuer, §7.3.7, letzte Zeile.

Reihenfolge im Boot, gemessen: `src/instrumentation.ts:55` `await assertHostConfig()`, **dann** `:56`
`migrateAllModules()`, dann `:57` der Seed, dann `:60` `startBackgroundWork()`. Das `await` in `:55`
ist Pflicht — der Kommentar `:51-54` schreibt aus, was sonst passiert; `assertHostConfig` wiederholt
es (`src/core/bootstrap.ts:78-81`): ohne `await` wird aus dem Startabbruch eine unbehandelte
Rejection, die **nichts** abbricht.

**Folge fuer den Zuschnitt der Pruefungen:** `radioBootFehler()` laeuft **vor den Migrationen**. Es
darf deshalb **keine Tabelle lesen** — auf einem frischen Volume gibt es sie noch nicht, und ein
`no such table` waere ein Startabbruch mit einer Meldung, die in die Irre fuehrt. Alles, was Daten
sehen muss, liegt in `starteRadioHintergrund()` (§7.3.5), das **nach** den Migrationen laeuft.

### 7.3.2 `radioBootFehler()` — Datei, Signatur, Schalter

Datei: `src/app/m/radio/_lib/boot.ts`. Kein `"use client"`, kein Icon-Import — die Datei laeuft im
Instrumentation-Hook, bevor irgendetwas rendert (Vorbild und Begruendung:
`src/app/m/lagerbuch/_lib/boot.ts:1-27`).

```ts
type EnvLike = Record<string, string | undefined>;

export async function radioBootFehler(env: EnvLike = process.env): Promise<string[]>;
```

**`async` und `Promise<string[]>`, obwohl nichts darin asynchron ist.** Die Naht daneben sieht so aus
(`...(await filesBootFehler())`, `...(await lagerbuchBootFehler())`, `src/core/bootstrap.ts:87-90`);
eine synchrone Funktion an derselben Stelle laedt dazu ein, das `await` beim naechsten Umbau zu
vergessen — und aus einem Startabbruch wuerde eine unbehandelte Rejection, die nichts abbricht.
Dieselbe Begruendung steht bei lagerbuch (`_lib/boot.ts:21-26`); sie wird hier nicht neu erfunden,
sondern uebernommen.

**Sie wirft nie selbst.** Sie **liefert** Meldungen; `assertHostConfig` entscheidet einmal, ob daraus
ein Abbruch wird (`src/core/bootstrap.ts:92-94`). Ein `throw` von hier naehme portal, qr, feedback,
files, lagerbuch und aufgaben mit, und die Meldung naennte nicht einmal das ausloesende Modul.

**Der Schalter ist die erste Anweisung:**

```ts
  if (prodHostsFor(getModule("radio"), env).length === 0) return [];
```

`prodHostsFor` liest `SUITE_HOST_RADIO` und faellt sonst auf `mod.prodHosts` zurueck
(`src/core/registry.ts:207-209`); mit `prodHosts: []` (gesetzter Zuschnitt 1) ist der Schalter genau
**„der Betreiber hat radio eingeschaltet"**. Das ist keine Milderung, sondern eine Notwendigkeit:
eine unbedingte Pflicht hiesse, dass die Suite ab dem ersten Image mit `radio` nicht mehr startet,
bis die `.env` ergaenzt ist — dieses Modul blockierte damit **jeden unbeteiligten Deploy** im Fenster
zwischen Merge und Cutover. Es ist **dieselbe** Variable, die das Modul einschaltet; einen zweiten,
vergessbaren gibt es nicht (Begruendung woertlich uebernommen aus
`src/app/m/lagerbuch/_lib/boot.ts:13-19`).

### 7.3.3 Was **wirft** (also: als String zurueckkommt)

⚠️ **Wichtig fuer die Lesart:** *jeder* zurueckgegebene String **ist** ein Startabbruch — `errors`
ist eine Liste, und `assertHostConfig` wirft bei `length > 0` (`src/core/bootstrap.ts:92`). „Nur
melden" kann daher **nie** ein Rueckgabewert sein, sondern nur eine Protokollzeile (§7.3.4).

Die Grenze zwischen beiden Listen ist eine Regel, nicht ein Gefuehl:

> **Werfen darf nur, was `radio` fuer seine eigenen Nutzer falsch macht und im Repo bzw. in der `.env`
> behebbar ist. Alles, was erst am Server sichtbar wird und dort behoben werden muss, meldet — sonst
> steht die Suite am Cutover-Abend still, weil eine Traefik-Zeile fehlt.**

| Nr. | Pruefung | Meldung/Grund | Beleg |
| --- | --- | --- | --- |
| **1** | `SUITE_ADMIN_GROUP_RADIO` fehlt oder ist leer | Ohne sie greift der Entwicklungs-Vorgabewert aus der Registry; ist in Pocket ID niemand in dieser Gruppe, ist die Folge ein **stummes 404 fuer ALLE Verwaltenden** — fuer `radio` gibt es bewusst **keine** Suite-Admin-Rueckfallebene (gesetzte Entscheidung 9). ⚠️ **Gelesen wird die Variable direkt**, nicht ueber `adminGroupsFor`: das faellt bei fehlender Variable auf `mod.adminGroups` zurueck (`src/core/groups.ts:102-108`) und meldete nichts. Und `validateGroupConfig` meldet den **leeren** Admin-Wert bewusst nicht — „bei den Admin-Gruppen ist leer dagegen eine gueltige Aussage und wird nicht gemeldet" (`src/core/groups.ts`, Kopfkommentar von `validateGroupConfig`) | Analyse-Falle 23, `docs/radio-portierung-analyse.md:1570-1575`; Vorbild `src/app/m/lagerbuch/_lib/boot.ts:49-69` |
| **2** | `SUITE_ACCESS_GROUP_RADIO !== undefined` | Ein gesetzter Wert waere **still wirkungslos**: `canAccess` steigt fuer `requiresAuth: false` sofort mit `true` aus (`src/core/registry.ts:239`) und liest `requiredGroups` nie. `validateGroupConfig` meldet nur den **leer** gesetzten Fall (`src/core/groups.ts:156`) — der Betreiber setzte also eine Zugangsgruppe, bekaeme keine Warnung, und das Modul blieb fuer jeden offen. Ausweg in der Meldung: **die Zeile ersatzlos entfernen**; wer den Verwaltungszugang steuern will, setzt `SUITE_ADMIN_GROUP_RADIO` | Vorbild `src/app/m/lagerbuch/_lib/boot.ts:71-86`; die dortige Zeilenangabe `registry.ts:155` ist **veraltet**, heute `:239` (nachgemessen) |
| **3** | `RADIO_ZUGANG_SITZUNG_SECRET` fehlt oder ist kuerzer als 32 Zeichen | Ohne den Wert kann keine zeitlich begrenzte Sitzung ausgestellt oder geprueft werden; ein kurzer Wert ist eine Signatur, die aussieht wie eine. **Zusaetzlich:** Wert **gleich** `AUTH_SECRET` → eigene Meldung. Dieselbe Signatur fuer Suite- und Zugangs-Sitzung hebt die Domaenentrennung auf, die das eigene Geheimnis begruendet | Bauform woertlich lagerbuch (gesetzte Entscheidung 6); Vorbild `.env.example:250-258` |
| **4** | `RADIO_HISTORIE_MONATE` ist gesetzt, aber keine ganze Zahl ≥ 1 | **`0` wird ausdruecklich abgewiesen** und nicht als „aus" gelesen: `0` Monate Retention loescht beim ersten Lauf die **gesamte** abgeschlossene Leihhistorie. Wer die Retention abschalten will, laesst die Variable weg — dann gilt die Vorbelegung 2 (gesetzte Entscheidung 12) — und schaltet den Arbeiter ueber `RADIO_HISTORIE_PURGE=0` ab (§7.3.5) | Alt-Wert `HISTORY_RETENTION_MONTHS = 2`, `radio-admin/server/src/services/retentionService.ts:9` |
| **5** | `RADIO_ZUGANG_SITZUNG_STUNDEN` ist gesetzt, aber keine ganze Zahl in `1..168` | Eine Sitzungsdauer von `0` machte jeden gescannten Code sofort wertlos, eine von `100000` machte „zeitlich begrenzt" zur Behauptung. Obergrenze eine Woche | Vorbelegung 12 (lagerbuch: `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`, `.env.example:265`) — ⚠️ **zu bestaetigen**, §7.6 |

Die Zahlenpruefungen 4 und 5 laufen ueber **einen** Helfer in derselben Datei, damit die naechste Zahl
nicht als handgeschriebene Kopie dazukommt:

```ts
function zahlFehler(
  name: string, roh: string | undefined, min: number, max: number,
): string | null;
```

`roh === undefined` → `null` (Vorbelegung gilt). Sonst: `Number.isInteger` und Bereich, sonst eine
Meldung, die **Name, gelesenen Wert und erlaubten Bereich** nennt. **Zusage an das Zugangs-Kapitel:**
weitere `RADIO_GATE_*`-Zahlen (Bremse am Einlöse-Gate) werden von **diesem** Helfer geprueft; das
Zugangs-Kapitel legt Namen, Vorbelegung und Bereich fest, dieses Kapitel prueft sie beim Boot und
schreibt sie in `.env.example`.

⚠️ **Voraussetzung, nicht Teil dieser Spec:** die Bremse am Einlöse-Gate haengt an der
CWE-348-Umstellung in `src/core/ratelimit.ts` (eigener Suite-Posten). Solange sie offen ist, ist die
Absenderkennung am Gate faelschbar. **Das wird hier benannt und nicht umgesetzt** — und es ist keine
Boot-Pruefung: eine Env-Variable kann das nicht sehen.

### 7.3.4 Was nur **meldet**

Alles hier schreibt eine Zeile mit `console.warn` **innerhalb** von `radioBootFehler()` bzw.
`starteRadioHintergrund()` und gibt **keinen** String zurueck.

| Pruefung | Warum melden und nicht werfen | Beleg |
| --- | --- | --- |
| `SUITE_HOST_RADIO` ist gesetzt, kommt aber in `SUITE_TRAEFIK_RULE` nicht vor (beide gesetzt, sonst still) | Der Host erreicht den Container dann gar nicht erst; die Domain ist tot, ohne dass etwas kaputt aussieht. **Nicht werfen:** die Labels leben in der `.env` **auf dem Server**, ein Dev-Container hat die Variable legitim nicht, und ein Abbruch traefe genau in dem Moment, in dem der Betreiber die `.env` gerade umstellt | `compose.yaml:149-153`; die Variable kommt per `env_file` in den Prozess (`compose.yaml:88`) |
| `SUITE_TRAEFIK_RULE` enthaelt einen Host, der mit `radio-admin.` beginnt | Der Alt-Host darf dort **ausdruecklich nicht** stehen: er erreicht dann den Container, kein `SUITE_HOST_*` beansprucht ihn, `moduleForHost` liefert **portal** — und `radio-admin.iuk-ue.de` zeigt das **Portal** statt des Redirects. Melden statt werfen aus demselben Grund wie oben | Analyse-Falle 28, `docs/radio-portierung-analyse.md:1646-1652` |
| `devices` ist leer (in `starteRadioHintergrund()`, nach den Migrationen) | Das ist das Symptom aus Analyse-Falle 29: vertipptes `DATA_DIR` oder nicht gemountetes Volume ergibt eine frische, leere `radio.db`. **Niemals werfen:** vor dem Import ist die Tabelle **legitim** leer — in der Generalprobe und in jedem Dev-Container —, und ein Wurf naehme sechs unbeteiligte Module mit | `docs/radio-portierung-analyse.md:1685-1696` |
| `radio.db` existierte vor diesem Start nicht (Datei neu angelegt) | Dieselbe Familie, aber eine Stufe frueher und deutlich aussagekraeftiger: `openModuleDatabase` legt Verzeichnis **und** Datei stumm an (`src/core/health/index.ts:9-11` nutzt genau diesen Weg). Die Zeile lautet sinngemaess „radio.db wurde neu angelegt — bei einem Cutover ist das der Hinweis auf ein nicht gemountetes Volume" | s. o. |

**Warum eine Protokollzeile hier ueberhaupt etwas wert ist:** sie steht im Container-Log direkt neben
`docker compose up -d`, also genau dort, wo beim Cutover jemand hinsieht. **Zusage an Spec 2:** das
Runbook liest nach dem Start einmal `docker compose logs --since 2m suite` und erwartet **keine**
`radio:`-**Warnung**; eine gefundene Warnung ist ein Stopp-Punkt, kein Hinweis.

⚠️ **Eine `radio:`-Zeile ist im Cutover-Fenster erwartet und darf deshalb keine Warnung sein:**
`RADIO_HISTORIE_PURGE=0` (§7.3.5) meldet „Retention abgeschaltet". Sie geht als **`console.info`**
ins Log, nicht als `console.warn` — sonst tritt der vorgeschriebene Cutover-Zustand die eigene
Stopp-Bedingung aus. Die Trennung ist damit scharf und pruefbar: **`warn` = Stopp, `info` = Zustand.**
Und sie wird **bei jedem Start neu geschrieben**, nicht nur beim ersten: ein nach dem Fenster
vergessenes `RADIO_HISTORIE_PURGE=0` ist sonst ein **stiller** Verlust der Retention — die Zeile ist
das einzige, was ihn findbar haelt. **Zusage an Spec 2:** der Schritt „Retention wieder einschalten"
endet mit einem zweiten Log-Blick, in dem die Info-Zeile **fehlt**.

### 7.3.5 Der Retention-Arbeiter — und warum er **nicht** beim Boot purgt

`startBackgroundWork()` (`src/core/bootstrap.ts:121-126`) ist der Ort fuer alles, was ein Modul
einmal je Prozess im Hintergrund startet; der Kopfkommentar `:112-120` sagt, warum es von
`migrateAllModules()` getrennt ist und dass es **danach** laeuft (`src/instrumentation.ts:56` vor
`:60`). **Verbindlich: eine Zeile mehr dort**, plus Import:

```ts
export function startBackgroundWork(): void {
  starteFilesHintergrund();
  starteAufgabenScanArbeiter();
  // radio: Retention-Timer + Bestandswarnung. Purgt NICHT bei t=0 (§7.3.5).
  starteRadioHintergrund();
}
```

`starteRadioHintergrund(): void` liegt in `src/app/m/radio/_lib/boot.ts` (dieselbe Datei, damit
Boot-Wissen nicht auf zwei Dateien faellt), ist **synchron** und **wirft nie** — ein Wurf hier naehme
den Start der ganzen Suite mit, nachdem die Migrationen schon liefen. Vorbild fuer beides:
`starteAufgabenScanArbeiter()` („synchron und wirft nie", `src/core/bootstrap.ts:123-125`).

Sie tut genau drei Dinge:

1. **Aussteigen, wenn das Modul nicht eingeschaltet ist** — derselbe `prodHostsFor(...).length === 0`
   -Schalter wie in §7.3.2. Kein Timer in einem Container, der `radio` gar nicht bedient.
2. **Die Bestandswarnung aus §7.3.4** (`devices` leer, Datei neu) — hier, weil erst hier die Tabellen
   existieren.
3. **Den Retention-Timer registrieren.** `setInterval(purge, 24 * 60 * 60 * 1000)` mit `.unref()`,
   **und der erste Lauf ist nicht t=0.**

⚠️ **Das ist der Kern und der Unterschied zur Alt-App.** `radio-admin/server/src/index.ts:35` ruft
`startRetentionSchedule`, und `radio-admin/server/src/services/retentionService.ts:47` fuehrt
`purge()` **sofort** aus, erst `:48` setzt den Timer — mit dem Kommentar „straight after a data
migration". Die Folge steht in der Analyse (`docs/radio-portierung-analyse.md:823-831`): weil der
Cutoff an der **Wanduhr** haengt und nicht am Cutover-Zeitpunkt, **loescht jeder weitere Start mehr
als der vorige**. In der Suite kommt ein zweiter Verstaerker dazu: ein Faktor-1000-Fehler in der
Zeitstempel-Normalisierung (gesetzte Entscheidung 11) ist **paritaetsgruen**, und ein Purge beim Boot
verwandelt ihn im selben Atemzug in Datenverlust — der Import ist dann fertig, die Historie weg, und
die Paritaetspruefung hat gelaechelt.

Deshalb verbindlich:

* **Kein Purge bei t=0.** Der erste Lauf ist um `RADIO_HISTORIE_ERSTLAUF_MINUTEN` (Vorbelegung **60**)
  verzoegert. Eine Stunde ist lang genug, dass ein Import, eine Stichprobe und ein „Halt, das sieht
  falsch aus" dazwischenpassen, und kurz genug, dass die Retention in jedem realistischen
  Prozessleben ueberhaupt greift.
* **`RADIO_HISTORIE_PURGE=0` schaltet den Purge ganz ab** — der Timer wird dann nicht registriert und
  eine **`console.info`**-Zeile ins Log geschrieben, bei **jedem** Start neu (Begruendung am Ende von
  §7.3.4: als `warn` traete der vorgeschriebene Cutover-Zustand die eigene Stopp-Bedingung, und ohne
  Wiederholung waere ein vergessenes `0` ein stiller Verlust der Retention).
  **Zusage an Spec 2:** im Cutover-Fenster steht `RADIO_HISTORIE_PURGE=0`
  in der `.env`; die Zeile wird erst nach der bestandenen Stichprobe entfernt und der Container einmal
  neu gestartet. Das ist die einzige Massnahme, die den Verlust **strukturell** ausschliesst statt ihn
  zu bewetten.
* **Der Cutoff wird bei jedem Lauf neu gerechnet**, nie beim Registrieren gemerkt — ein Prozess laeuft
  wochenlang.
* **`.unref()`** auf dem Timer, damit ein Skript-Aufruf (`scripts/import/*.ts`) nicht am Timer haengt.

**Zusage an das Daten-Kapitel:** dieses Kapitel traegt **Registrierung, Verzoegerung, Abschalter und
Takt**; die **Purge-Abfrage selbst** (welche Zeilen, welche Tabelle, welches Feld, `returned_at IS NOT
NULL`) und die Uebernahme der 2-Monats-Regel (gesetzte Entscheidung 12, Betreiberantwort 4, betroffen
< 100 Leihen — **Schaetzung**, keine Zaehlung) gehoert dorthin. `starteRadioHintergrund()`
**importiert** die Purge-Funktion, sie definiert sie nicht.

**Zusage an Spec 2 (Standby):** die Analyse haelt fest, dass der Standby-Alt-Stack beim Start genau
die Quelle zerstoert, fuer die er steht (`docs/radio-portierung-analyse.md:823-834`). Die zwei Regeln
dort gelten unveraendert und stehen im Runbook: feldweise Nachpruefungen laufen per `sqlite3` gegen die
**Snapshot-Kopie**, nie gegen einen gebooteten Alt-Stack; muss die Alt-App doch laufen, wird
`HISTORY_RETENTION_MONTHS` vorher hochgesetzt.

### 7.3.6 Seed am Boot — die Regel, die dieses Kapitel dazu haelt

`shouldSeed()` ist `SUITE_SEED === "1" || NODE_ENV === "development"`
(`src/core/bootstrap.ts:108-110`), aufgerufen aus `src/instrumentation.ts:57`. **`SUITE_SEED=1` ist
der Generalproben-Schalter, nicht nur der Lokalschalter** — `src/core/bootstrap.ts:45` schreibt das
aus, `CLAUDE.md:180-188` ebenso.

**Regel fuer `radio`, verbindlich:** `radio` bekommt **keinen** Eintrag in `seedAllModules()`
(`src/core/bootstrap.ts:128-132`) — wie `files`, `lagerbuch` und `aufgaben`, mit einer eigenen
Begruendung: **ein geseedeter Zugangscode waere in der Generalprobe ein gueltiger anonymer Zugang zum
gesamten Geraetebestand samt Ausleihernamen** (Analyse-Falle 31,
`docs/radio-portierung-analyse.md:1740-1749`). Der Kommentar dazu gehoert in die
`MODULE_MIGRATIONS`-Liste, neben die drei bestehenden Ausnahmen.

`src/app/m/radio/_lib/seedLokal.ts` **muss** es trotzdem geben — `scripts/seed-lokal.test.ts` verlangt
fuer jeden `MODULE_MIGRATIONS`-Eintrag einen Seed (`CLAUDE.md:183-188`). **Zusage an das
Zugangs-Kapitel:** dieser Seed legt Geraete und Stammdaten an und **niemals eine einloesbare
Zugangszeile**; die Code-Tabelle bleibt beim Seed **leer**. Wer lokal einen Code braucht, stellt ihn
ueber die Verwaltungsflaeche aus — das ist derselbe Weg wie in Produktion und deshalb der bessere Test.

### 7.3.7 Tests

| Datei | Testname | Prueft |
| --- | --- | --- |
| `src/app/m/radio/_lib/boot.test.ts` | `"ohne SUITE_HOST_RADIO meldet radioBootFehler nichts"` | Env ohne die Variable, auch ohne `SUITE_ADMIN_GROUP_RADIO` → `[]` |
| " | `"fehlende Admin-Gruppe ist ein Startabbruch"` | `SUITE_HOST_RADIO` gesetzt, `SUITE_ADMIN_GROUP_RADIO` fehlt → genau eine Meldung, die den Variablennamen enthaelt |
| " | `"leere Admin-Gruppe ist derselbe Startabbruch"` | `SUITE_ADMIN_GROUP_RADIO=" , "` → Meldung. **Eigener Fall**, weil `validateGroupConfig` diesen Zustand bewusst nicht meldet |
| " | `"eine gesetzte Zugangsgruppe ist ein Startabbruch"` | `SUITE_ACCESS_GROUP_RADIO=""` **und** `=irgendwas` → je eine Meldung; beide Faelle, weil `!== undefined` und nicht „leer" geprueft wird |
| " | `"RADIO_HISTORIE_MONATE=0 wird abgewiesen"` | eigener Fall, nicht in einer Tabelle mit `-1` und `abc` versteckt — `0` ist der Wert, den jemand fuer „aus" haelt |
| " | `"RADIO_ZUGANG_SITZUNG_SECRET gleich AUTH_SECRET ist ein Startabbruch"` | beide auf denselben 40-Zeichen-Wert → Meldung, die **beide** Namen nennt |
| " | `"radioBootFehler wirft nie"` | Env mit **allen** Fehlern gleichzeitig → die Funktion laeuft durch und liefert eine Liste mit mehr als einem Eintrag; `await expect(...).resolves` statt `rejects` |
| `src/core/bootstrap.test.ts` (Ergaenzung) | `"jeder Modul-Boot-Haken ist in assertHostConfig eingehaengt"` | **Quelltext-Scan** ueber `src/app/m/*/_lib/boot.ts`: fuer jede gefundene exportierte `*BootFehler`-Funktion muss ihr Name in `src/core/bootstrap.ts` vorkommen. **Das ist das fehlende Netz aus §7.3.1** — und es faengt nicht nur `radio`, sondern jedes kuenftige Modul |
| " | `"jeder Hintergrundstarter ist in startBackgroundWork eingehaengt"` | dasselbe fuer `starte*Hintergrund`/`starte*Arbeiter` |

Die letzten zwei Zeilen sind **Zusage an das Test-Kapitel** und gehoeren in `bootstrap.test.ts`, nicht
in eine radio-eigene Datei: eine radio-eigene Pruefung, dass radio eingehaengt ist, waere ein Test,
den das naechste Modul wieder nicht hat.

---

## 7.4 Konfiguration

### 7.4.1 Die Variablen

| Variable | Pflicht | Vorbelegung | Wirkung |
| --- | --- | --- | --- |
| `SUITE_HOST_RADIO` | **zum Cutover ja** | keine (`prodHosts: []`) | Setzt die Prod-Domain: `radio.iuk-ue.de`. Schaltet zugleich alle Boot-Pruefungen aus §7.3.3 und den Hintergrundarbeiter §7.3.5 ein |
| `SUITE_ADMIN_GROUP_RADIO` | **ja, nicht leer** | Registry-Vorgabe (Entwicklung) | Wer `/admin` bedienen darf. Leer = **stumme Aussperrung aller**, weil `radio` den Suite-Admin-Kurzschluss modulintern ignoriert (gesetzte Entscheidung 9) |
| `SUITE_ACCESS_GROUP_RADIO` | **darf nicht gesetzt sein** | — | Waere still wirkungslos (`requiresAuth: false`). Gesetzt = Startabbruch, §7.3.3 Nr. 2 |
| `RADIO_ZUGANG_SITZUNG_SECRET` | **ja**, ≥ 32 Zeichen | keine | Signiert die zeitlich begrenzte Sitzung, die ein eingeloester Code praegt. **Nicht** gleich `AUTH_SECRET` |
| `RADIO_ZUGANG_SITZUNG_STUNDEN` | nein | **12** ⚠️ zu bestaetigen | Lebensdauer dieser Sitzung |
| `RADIO_HISTORIE_MONATE` | nein | **2** | Retention der abgeschlossenen Leihen (Betreiberantwort 4). `0` ist verboten, §7.3.3 Nr. 4 |
| `RADIO_HISTORIE_PURGE` | nein | **1** | `0` schaltet den Purge-Timer ab. Im Cutover-Fenster auf `0`, §7.3.5 |
| `RADIO_HISTORIE_ERSTLAUF_MINUTEN` | nein | **60** | Verzoegerung des ersten Purge-Laufs. Nie `0` |
| `SUITE_TRAEFIK_RULE` | **ja, erweitern** | `Host(\`iuk-ue.de\`)` | Um `Host(\`radio.iuk-ue.de\`)` erweitern — **ohne** `radio-admin.iuk-ue.de`, §7.4.3 |

**Was ausdruecklich nicht entsteht:** kein `RADIO_ADMIN_API_TOKEN` und kein `RADIO_ADMIN_API_URL`.
`api_tokens` traegt produktiv genau einen Konsumenten, den Alt-Kiosk (Betreiberantwort 3, gesetzte
Entscheidung 13), und der verschwindet mit dem Port; die HTTP-Grenze zwischen Kiosk und Verwaltung
faellt im selben Fenster (gesetzte Entscheidung 15). Eine Variable dafuer waere ein Angebot an einen
Konsumenten, den es nicht gibt. Ebenso **kein** `POCKET_ID_*` fuer `radio`: `/admin` laeuft ueber
Auth.js v5 gegen den **einen** Suite-Client, und `AdminUser` aus radio-inventar wandert nicht
(gesetzte Entscheidung 14).

Ebenfalls nicht hier: `TZ=Europe/Berlin`. Es ist ein **eigener Suite-Posten** (nicht Teil dieser
Spec), betrifft aber `radio` unmittelbar — der CSV-Export der Alt-App formatiert Datumswerte
(`radio-admin/server/src/routes/export.ts:49-51`), und ohne gesetzte Zeitzone ist die Tagesgrenze im
Container UTC. **Zusage an Spec 2:** das Runbook nennt `TZ` als Voraussetzung des Cutovers, ohne sie
in dieser Spec zu setzen.

### 7.4.2 `.env.example`

`SUITE_HOST_RADIO` steht **bereits** als kommentierte Zeile in der Datei (`.env.example:112`, im Block
„Prod-Domains der Module") — sie wird dort **nicht verschoben**, sondern nur mit der echten Domain
gefuellt, wenn der Cutover kommt. Der Block „Modul lagerbuch" macht genau das vor
(`.env.example:231-239`) und schreibt aus, warum die Host-Zeile oben und nicht im Modulblock steht.

Neu entsteht ein Block **„── Modul radio ──"** nach dem lagerbuch-Block (also vor
`# ─── Modul aufgaben ───`, heute `.env.example:309`). Inhalt, verbindlich:

* Ein Verweis nach oben auf `SUITE_HOST_RADIO` (`:112`), mit dem Satz, dass sie **zum Cutover Pflicht**
  ist, auch wenn der Host-Riegel sie nicht braucht (er trifft `radio.localtest.me` ohne jede Env) —
  weil die Boot-Pruefungen aus §7.3.3 an `prodHostsFor(...).length > 0` haengen und der
  Login-Rueckweg ohne sie den **angefragten** statt des kanonischen Hosts nimmt.
* `SUITE_ADMIN_GROUP_RADIO=<Wert aus der alten stack.env>` — **ohne** Vorbelegung im Beispiel, mit dem
  Hinweis, dass leer eine stumme Aussperrung ist.
* Ein ⚠️-Absatz: **`SUITE_ACCESS_GROUP_RADIO` darf nicht gesetzt werden** (Boot-Abbruch, Grund in
  einem Satz).
* `# RADIO_ZUGANG_SITZUNG_SECRET=<neu erzeugen, openssl rand -base64 32>` — **auskommentiert und ohne
  Wert.** Ein aus der Vorlage mitgeschleppter Wert waere ein oeffentlich nachlesbares Geheimnis; bei
  lagerbuch steht die Begruendung woertlich (`.env.example:250-258`). **Anders als bei lagerbuch gibt
  es hier keinen Alt-Wert zu uebernehmen** — der Alt-Kiosk kannte keine solche Sitzung, sein
  Zugangsmittel war der geteilte API-Token im QR-Parameter
  (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`).
* Die vier `RADIO_*`-Zahlen **ausgeschrieben mit ihren Vorbelegungen**, wie es der lagerbuch-Block
  fuer seine sechs Zahlen tut (`.env.example:261-274`, dort woertlich: „Sie stehen ausgeschrieben da,
  weil ein Betreiber sie sonst nur im Quelltext findet").
* Ein Absatz zu `RADIO_HISTORIE_PURGE=0` als **Cutover-Schalter** mit dem Satz, wann er wieder
  entfernt wird.
* Ein Dev/E2E-Unterblock nach dem Muster `.env.example:276-290`: `# SUITE_HOST_RADIO=radio.localtest.me`
  (woertlich dieser Host — `moduleForHost` prueft `${key}.localtest.me`, damit lokal derselbe Code-Pfad
  laeuft) und ein **Wegwerf**-Geheimnis mit dem Hinweis, dass es in diesem Repository steht und damit
  oeffentlich ist.
* Der Redirect-Block fuer den Alt-Host als **kommentierte Traefik-Labels** neben der
  `SUITE_TRAEFIK_RULE`-Zeile (`.env.example:369`) — siehe §7.4.3.

### 7.4.3 Traefik: eine Zeile erweitern, eine Zeile **nicht**

`compose.yaml:153` definiert **einen** Router:
``traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(`iuk-ue.de`)}``, und der Kommentar
`:149-152` sagt, dass diese Regel **dieselben** Hosts fuehren muss wie die `SUITE_HOST_*`-Variablen —
sonst erreicht die Domain den Container gar nicht erst.

**Erweitern:** `SUITE_TRAEFIK_RULE=Host(\`iuk-ue.de\`) || … || Host(\`radio.iuk-ue.de\`)`.

⚠️ **`radio-admin.iuk-ue.de` darf dort ausdruecklich NICHT stehen.** Wer den Alt-Host mit aufnimmt,
bekommt **nicht** den Redirect, sondern den stillen Portal-Fallback: der Host erreicht den Container,
kein `SUITE_HOST_*` beansprucht ihn, `moduleForHost` liefert **portal** — `radio-admin.iuk-ue.de`
zeigt dann das Portal (Analyse-Falle 28, `docs/radio-portierung-analyse.md:1646-1652`). Genau diesen
Fall meldet die Boot-Warnung aus §7.3.4.

Der pfaderhaltende Redirect (gesetzte Entscheidung 2) braucht einen **zweiten, eigenen Router** mit
eigener `redirectregex`-Middleware auf denselben Service — Middleware haengt am **Router**, nicht am
Service, nur so trifft der Redirect nicht auch die Suite —, **302 statt 301** (ein 301 liegt im Cache
jedes Geraets und macht den Rueckweg praktisch unmoeglich), in compose mit doppeltem `$$` gegen die
Interpolation (`docs/radio-portierung-analyse.md:1654-1657`). ⚠️ **Es gibt im Repo kein erprobtes
Vorbild** — `grep -rn redirectregex compose.yaml docs/` bleibt leer (`:1659-1661`). **Zusage an
Spec 2:** die Label-Zeilen gehoeren als **Runbook-Zeile** und als kommentierter Block in
`.env.example` neben `SUITE_TRAEFIK_RULE`; sie leben auf dem Server, nicht im Repo (gesetzte
Entscheidung 2). ⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss bleiben, solange der Redirect
steht** — er ist die Abhaengigkeit des Redirects, kein Abbau-Posten (`:1669-1670`).

### 7.4.4 Was den Boot abbricht — und die drei stillen Faelle

`validateHostConfig` (`src/core/hosts.ts:65-99`) bricht den Boot bei **genau drei** Dingen ab: ein
`SUITE_HOST_*`, dessen Suffix zu keinem Modul-Key passt (`:69-76`), ein Wert mit `/` oder `:`
(`:81-85`), ein Host, den **zwei per Env gesetzte** Module beanspruchen (`:87-93`).
`validateGroupConfig` tut dasselbe fuer `SUITE_ADMIN_GROUP_*`/`SUITE_ACCESS_GROUP_*`
(`src/core/groups.ts:141-155`), und beide Listen laufen in denselben Wurf (`src/core/bootstrap.ts:84-94`).

⚠️ **Daraus folgt eine Reihenfolge, und sie ist der einzige Startabbruch, den ein Cutover selbst
ausloesen kann: erst der Registry-Eintrag, dann die `.env`.** Solange `key: "radio"` in
`src/core/registry.ts` fehlt, passt das Suffix `RADIO` zu keinem Modul-Key — `SUITE_HOST_RADIO` **oder**
`SUITE_ADMIN_GROUP_RADIO` in der `.env` eines Images ohne den Eintrag bricht den Start der **ganzen
Suite** ab, mit einer allerdings selbsterklaerenden Meldung („passt zu keinem Modul. Bekannt: …").
Analyse-Falle 23 (`docs/radio-portierung-analyse.md:1555-1556`) schreibt dieselbe Reihenfolge aus.
**Zusage an Spec 2:** die `.env`-Zeilen werden erst gesetzt, **nachdem** das Image mit dem
Registry-Eintrag laeuft — nachweisbar ueber die Vor-Cutover-Pruefung aus §7.2.4 (dort 200 statt 503).

**Alles andere faellt still** — und zwar in drei Ausprägungen, jede mit ihrem eigenen Handgriff.
Alle drei sind **Zusage an Spec 2**, weil keine davon von einem Test oder vom Boot gefunden werden
kann:

1. **Richtig geschriebener, falscher Hostname.** `SUITE_HOST_RADIO=falsch.example.com` ist von einem
   Tippfehler nicht zu unterscheiden; `moduleForHost` faellt auf **portal** zurueck, und
   `radio.iuk-ue.de` zeigt stillschweigend das Portal (`src/core/hosts.ts:52-57`, woertlich).
   ⚠️ **Fuer `radio` schaerfer als sonst:** unter derselben Domain liegen zwei Zugangswelten, und ein
   Portal-Fallback ueberdeckt die **Ausleihe** — die anonyme Flaeche, die kein Anmeldefenster zeigt,
   an dem jemand den Fehler bemerkt.
   **Handgriff:** `curl -s https://radio.iuk-ue.de/api/health/radio` muss `"module":"radio"` und HTTP
   200 liefern, **und** ein `curl -sI https://radio.iuk-ue.de/` darf keine Portal-Seite ergeben.
   Zusaetzlich `curl -s https://radio.iuk-ue.de/sw.js | head -3` — kommt dort **nicht** der
   Abraeum-Worker, greift der Rewrite nicht (§7.1.4).
2. **Der Login-Rueckweg, den kein `curl` sieht.** Die Allowlist in `src/core/auth/redirect.ts`
   erkennt einen Modul-Host ueber genau diese Variable; fehlt sie, wirft Auth.js den Nutzer nach dem
   Login **aufs Portal**, ohne Fehler und ohne Meldung — „ein curl sieht davon nichts"
   (`src/core/hosts.ts:59-63`, woertlich). Betrifft `radio` nur ueber `/admin`, aber genau die
   Personen, die den Cutover verantworten.
   **Handgriff:** **einmal von `radio.iuk-ue.de/admin` aus anmelden** und pruefen, dass man dort
   wieder landet. Handarbeit, nicht automatisierbar.
3. **Die Kollision, die `validateHostConfig` strukturell nicht sehen kann.** Die Kollisions-Map wird
   ausschliesslich aus `envHostsFor` gefuellt (`src/core/hosts.ts:78-95`) — ein Host, den ein anderes
   Modul per Registry-`prodHosts` im **Code-Default** fuehrt, erreicht sie **nie** und kollidiert
   ohne jede Meldung (`docs/radio-portierung-analyse.md:798-804`). `moduleForHost` entscheidet dann
   nach **Registry-Reihenfolge**, nicht nach Env.
   **Handgriff:** vor dem Cutover einmal `grep -n 'prodHosts' src/core/registry.ts` und die
   Code-Defaults gegen die gesetzten `SUITE_HOST_*` von Hand vergleichen. Betrieblich sofort relevant,
   weil `radio-admin.iuk-ue.de` uebergangsweise weiterlebt.

**Rollback ist die leere Zeile, nicht die geloeschte:** `SUITE_HOST_RADIO=` ergibt `[]` (bewusst keine
Prod-Hosts), das **Entfernen** der Variable ergibt `null` und damit den Code-Default aus der Registry
(`src/core/hosts.ts:33-46`, `:39-46`). Mit `prodHosts: []` (gesetzter Zuschnitt 1) ist der Unterschied
heute wirkungsgleich — aber nur heute, und die leere Zeile ist die Form, die sagt, was gemeint ist.
⚠️ **Der Rueckweg ist ausschliesslich „Router zurueck"** (gesetzte Entscheidung 3): es gibt kein
Parallelfenster, weil Alt-Kiosk und Suite denselben Host nicht gleichzeitig halten koennen.

### 7.4.5 Das Dreieck

`radio` fuehrt eine eigene Datenbank und braucht deshalb **drei** zusammenpassende Eintraege
(`CLAUDE.md:127-131`), sonst laeuft es lokal und bricht im Container:

1. `src/app/m/radio/_db/migrations`
2. `{ key: "radio", migrationsFolder: "src/app/m/radio/_db/migrations" }` in `MODULE_MIGRATIONS`
   (`src/core/bootstrap.ts:20-49`) — **mit** dem Seed-Ausnahmekommentar aus §7.3.6
3. Eine **eigene `COPY`-Zeile** im `Dockerfile` neben `:51-56`:
   `COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/radio/_db/migrations ./src/app/m/radio/_db/migrations`
   — es gibt **kein** Sammel-`COPY`, das ein neues Modul automatisch mitnimmt (gemessen:
   `Dockerfile:51-58` fuehrt je Modul eine Zeile plus eine fuer `core/konto`)

`src/core/bootstrap.test.ts` prueft dieses Dreieck ueber beide Listen (`CLAUDE.md:133-137`) — es ist
damit der **einzige** Teil der Modul-Anmeldung mit einem Netz. **Zusage an das Daten-Kapitel:** der
Migrationsordner und sein Inhalt gehoeren dorthin; dieses Kapitel sagt Punkt 2 und 3 zu und traegt
den Kommentar, der die Seed-Ausnahme begruendet.

---

## 7.5 Backup: `scripts/backup.sh` reicht — geprueft, nicht angenommen

**`radio.db` faellt ohne jede Skriptaenderung ins Backup.** `scripts/backup.sh:25-27` sammelt
`dbs=("$DATA_DIR"/*.db)` per `nullglob`, `:41-43` sichert jede gefundene Datei per
`sqlite3 "$db" ".backup ..."`. Mit der gesetzten Ein-Datei-Regel (`radio.db` unter `DATA_DIR`) ist das
vollstaendig. Der harte Abbruch bei „keine `*.db` gefunden" (`:29-35`, Meldung „no *.db in $DATA_DIR —
aborting (misconfigured DATA_DIR?)") gilt fuer `radio` mit.

**Gibt es Blobs? Nein — nachgesehen, in beiden Alt-Apps:**

| Gepruefte Stelle | Befund |
| --- | --- |
| CSV-**Export** der Verwaltung | Baut den Text im Speicher (`radio-admin/server/src/routes/export.ts:56-62`, `buildExportCsv` liefert einen String) und liefert ihn als Antwort mit `Content-Disposition: attachment` (`:74`). **Keine Datei auf Platte** |
| CSV-**Import** | `Buffer.from(await file.arrayBuffer())` (`radio-admin/server/src/routes/import.ts:23`) — im Speicher, kein Temp-Pfad. Gesucht wurde in `radio-admin/server/src`, `radio-admin/client/src`, `radio-inventar/apps/backend/src` und `radio-inventar/apps/frontend/src` nach `writeFileSync`, `createWriteStream`, `fs.promises.writeFile`, `multer`, `diskStorage`, `FileInterceptor`, `formidable`, `busboy`, `tmpdir`, `mkdtemp`, `multipart`. **Treffer: zwei, beide harmlos** — ein Kommentar (`import.ts:14`) und ein Testhelfer (`radio-admin/server/src/db/smoke.test.ts:18`, `mkdtempSync` fuer eine Wegwerf-DB) |
| Anhaenge, Bilder | Keine. Weder in `radio-admin` noch im Kiosk gibt es einen Upload-Pfad ausser dem CSV-Import; die einzigen Bilddateien sind die **statischen** PWA-Icons des Kiosks (`radio-inventar/apps/frontend/public/icons/`, drei SVG), und die wandern nach §7.1.1 nicht mit |
| Volumes der Alt-Apps | `radio-admin/docker-compose.yml:13-14` `radio-data:/data` mit `DATABASE_PATH=/data/data.sqlite` (`:11`) — nur die SQLite-Datei. `radio-inventar/docker-compose.yml:11-12` `postgres_data:/var/lib/postgresql/data` |

**Es entsteht also kein `BLOB_DIR`-Aequivalent und keine Aenderung an `scripts/backup.sh`.** Der
files-spezifische Zaehl-Riegel (`:69-99`) haengt an `-f "$work/files.db"` und beruehrt `radio` nicht.

⚠️ **Zwei Saetze, die trotzdem ins Runbook gehoeren:**

* **Der Kiosk-Postgres faellt aus jeder Sicherung heraus, die dieses Repo kennt.** Das Skript kennt
  `*.db` und `BLOB_DIR` (`:15-21`); solange der Alt-Kiosk laeuft, haengt `postgres_data` an **keiner**
  Sicherung der Suite (`docs/radio-portierung-analyse.md:810-812`). Ein letztes `pg_dump` in die
  Archivablage ist Abbau-Voraussetzung — auch weil erst eine Zaehlung dort die Frage nach `AdminUser`
  endgueltig belegt (Betreiberantwort 7, gesetzte Entscheidung 14), und **ein geloeschtes Volume nimmt
  die Antwort mit** (`:814-816`).
* **`BACKUP_KEEP` bleibt unveraendert.** `radio.db` ist eine kleine SQLite-Datei; sie multipliziert die
  Ablage nicht wie die files-Blobs (`scripts/backup.sh:10-13`). Kein Grund, an der Rotation zu drehen.

**Zusage an Spec 2:** nach dem Import laeuft `scripts/backup.sh` **einmal von Hand**, und das Tarball
wird auf die Anwesenheit von `radio.db` geprueft (`tar -tzf … | grep radio.db`). Der Glob ist bewiesen
erst, wenn er einmal gelaufen ist.

---

## 7.6 Zu bestaetigen (nur der Betreiber weiss es)

1. **Sitzungsdauer nach dem Einloesen eines Codes.** Vorschlag **12 Stunden**, woertlich wie lagerbuch
   (`.env.example:265`, `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`). Der Nutzungsfall ist anders — ein
   Telefon, das einen QR-Code scannt und nach einer Ausleihe fertig ist —, was auch fuer **deutlich
   kuerzer** sprechen koennte. Umsetzung ist eine Zahl in der `.env`
   (`RADIO_ZUGANG_SITZUNG_STUNDEN`), also billig zu aendern; die Vorbelegung 12 gilt, bis der Betreiber
   widerspricht.
2. **Sind gedruckte Aufsteller mit QR-Codes im Umlauf, und wo?** Entscheidet nichts am Code, aber
   alles am Cutover-Abend: ein dauerhafter, sperrbarer Code loest jedes gedruckte Kaertchen ein — ein
   Code, der auf einem Aufsteller im Funkraum klebt und den heutigen Token traegt, hoert mit dem Port
   auf zu funktionieren (der heutige QR-Code traegt den geteilten API-Token base64-kodiert als
   URL-Parameter, `radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`).
   **Gebraucht wird:** Anzahl, Ort, und wer sie ersetzen kann. Ohne diese Antwort ist die
   Ankuendigungspflicht aus der gesetzten Entscheidung 8 nicht adressierbar.
3. **Vorausgefuellter Benutzername fuer angemeldete Ausleihen** (Betreiberantwort 6: „koennte …,
   optional"). Ja oder nein entscheidet der Betreiber. Betriebliche Folge, die in die Entscheidung
   gehoert: **ja** heisst, dass eine anonyme Ausleihe und eine angemeldete Ausleihe im Journal
   unterschiedlich aussehen, und dass der Suite-Name in eine Zeile geraet, deren Fach-Semantik
   „anonym" ist. Fuer dieses Kapitel folgt daraus **nichts** — es entsteht keine Variable dafuer, weil
   es keine Betriebsentscheidung, sondern eine Fach-Entscheidung ist. **Zusage an das Ausleih-Kapitel:**
   wenn dort ein Schalter gewuenscht ist, kommt er als `RADIO_*`-Variable in §7.4.1 und bekommt eine
   Boot-Zahl/Bool-Pruefung nach §7.3.3.
4. **Offline schreiben** — Betreiberfrage 8, unveraendert offen. §7.1.6 sagt, was heute gilt und was
   ein „Ja" kosten wuerde. **Hier nicht entschieden.**

---

## 7.7 Zusagen an andere Kapitel — gesammelt

Die Kapitelnummern setzt die Zusammenfuehrung ein; die Sache ist eindeutig benannt.

| An | Zusage |
| --- | --- |
| **Zugangs-Kapitel** (Host-Riegel, Codes, Sitzung) | Dieses Kapitel legt `_lib/host.ts` **nicht** an, sondern ruft `hostAbweisung` aus `_lib/hostRiegel.ts` (§7.1.3). Es setzt die Variablennamen `RADIO_ZUGANG_SITZUNG_SECRET` und `RADIO_ZUGANG_SITZUNG_STUNDEN` (§7.4.1) und prueft sie beim Boot (§7.3.3 Nr. 3, 5). ⚠️ **Der Name ist hier gesetzt, nicht das Verfahren:** waehlt das Zugangs-Kapitel ein anderes Signaturverfahren, wandert die Pruefung auf **dessen** Variable und behaelt die Form (vorhanden, ≥ 32 Zeichen, nicht gleich `AUTH_SECRET`). Was **nicht** verhandelbar ist: es gibt eine solche Pflichtvariable und sie wird beim Boot geprueft — eine werfende Pruefung auf einen Namen, den niemand setzt, waere ein Startabbruch am Cutover-Abend. Weitere `RADIO_GATE_*`-Zahlen werden vom Helfer `zahlFehler` geprueft und in `.env.example` geschrieben. `seedLokal` legt **keine** einloesbare Zugangszeile an (§7.3.6). Die Ankuendigung der Verhaltensaenderung braucht den Satz aus §7.1.3 („eine veraltete Seitenansicht je Geraet") |
| **Daten-Kapitel** (Schema, Retention-Abfrage) | Dieses Kapitel traegt Registrierung, 60-Minuten-Verzoegerung, Abschalter und Takt des Retention-Arbeiters; die **Purge-Abfrage** und die 2-Monats-Regel gehoeren dorthin (§7.3.5). Migrationsordner: dieses Kapitel sagt `MODULE_MIGRATIONS`-Eintrag und `COPY`-Zeile zu (§7.4.5) |
| **Import-Kapitel** | Die Freigabe nach dem Import laeuft ueber die Zaehl-Abfragen aus Pflicht 4, **nicht** ueber `/api/health/radio` (§7.2.3). Der Mapping-Unit-Test mit je Feld **unterschiedlichen** Fixture-Werten (gesetzte Entscheidung 11) ist dort zu fuehren; §7.3.5 begruendet, warum `RADIO_HISTORIE_PURGE=0` im Cutover-Fenster die zweite Halbe der Absicherung ist |
| **Ausleih-Kapitel** | Dieses Kapitel baut **kein** Offline-Verhalten und keinen Ersatz fuer `STALE_GRACE_MS` (§7.1.6). Wenn ein Schalter fuer den vorausgefuellten Namen gewuenscht ist, kommt er als `RADIO_*`-Variable hierher (§7.6 Nr. 3) |
| **Verwaltungs-Kapitel** | `/admin` erbt mit `requiresAuth: false` **kein** Middleware-Gating (gesetzte Entscheidung 10). Dieses Kapitel liefert nur den Boot-Riegel gegen die **leere** Admin-Gruppe (§7.3.3 Nr. 1) — er ersetzt keine einzige Pruefung in einer Seite, Action oder Route |
| **Test-Kapitel** | Zwei Ergaenzungen in `src/core/bootstrap.test.ts` (Boot-Haken und Hintergrundstarter sind eingehaengt, §7.3.7) und genau ein e2e-Fall fuer `/sw.js`, der die **Antwort** prueft (§7.1.7) |
| **Spec 2 (Runbook)** | Redirect-Labels fuer `radio-admin.iuk-ue.de` (302, `redirectregex`, eigener Router, `$$`, DNS bleibt) · `SUITE_TRAEFIK_RULE` erweitern, Alt-Host **nicht** aufnehmen · `RADIO_HISTORIE_PURGE=0` im Fenster, danach entfernen und neu starten · Monitor auf `/api/health/radio` · Vor-Cutover-`curl` auf `/api/health/radio` gegen den laufenden Container (503 = falsches Image) · die drei stillen Faelle aus §7.4.4 als drei getrennte Schritte · `docker compose logs --since 2m suite` ohne `radio:`-Warnung · `scripts/backup.sh` einmal von Hand plus `tar -tzf | grep radio.db` · letztes `pg_dump` des Kiosk-Postgres vor dem Abbau · nach dem Umschwenk ein Telefon, das den Alt-Kiosk kannte, einmal neu laden · `TZ=Europe/Berlin` als Voraussetzung |

---

# 8. Testplan: was jedes Tor sieht und was keines sieht

## 8.1 Warum dieses Kapitel vier Ebenen führt und nicht drei

Die Zusagen des Moduls `radio` liegen fast alle in genau dem Bereich, den die vorhandenen Tore
**strukturell** nicht sehen können. Das ist keine Klage, sondern die Begründung für den Zuschnitt:

* **`pnpm typecheck` und `pnpm lint`** sehen keinen Unterschied zwischen zwei `number` — der
  Faktor-1000-Fehler ist für sie unsichtbar (Entscheidung 11). Eine fehlende Guard-Zeile in einer
  neuen Server Action ist typkorrekt und lint-sauber (Entscheidung 10).
* **`pnpm build`** prüft Modulgrenzen **statisch**, nicht die tatsächliche Serialisierung eines
  Requests (`CLAUDE.md:61-64`). Falle 9 und Falle 7 sind für den Build unsichtbar, Falle 6 ist HTTP
  200 mit falschem Inhalt und damit für **jedes** Tor unsichtbar (`CLAUDE.md:41-44`).
* **Vitest** läuft in jsdom, also in **einem** JS-Prozess ohne RSC-Grenze überhaupt
  (`CLAUDE.md:62-64`). Dort ist `"use client"` ein wirkungsloser String (`CLAUDE.md:29-30`), und
  `@ant-design/icons` lädt über die `default`-Bedingung und rendert klaglos (`CLAUDE.md:35-36`).
  Vitest kann Falle 6, 7 und 9 **nicht** finden, und zwar nicht aus Nachlässigkeit.
* **Playwright** fährt gegen genau **einen** `baseURL` (`playwright.config.ts:64`:
  `http://portal.localtest.me:3100`). Der Host-Riegel ist damit nur mit **absoluter** Navigation auf
  einen zweiten Host darstellbar.
* **Der Paritätscheck des Imports** ist strukturell blind: `scripts/import/parity.ts:43-56`
  vergleicht Multimengen von Zeilen-Hashes, und `scripts/import/portal.ts:72-75` schreibt selbst
  hin, dass **beide Paritäts-Arme aus derselben Mapping-Funktion** ableiten. Ein konsistenter
  Mapping-Fehler hasht auf beiden Seiten gleich (`CLAUDE.md:241-243` sagt dasselbe für den Cutover).
* **Der Healthcheck ist selbst das Tor und ist grün**, auch gegen eine frisch angelegte, leere
  `radio.db` (§8.5).

Daraus folgen vier Ebenen. Die vierte ist keine Verlegenheitslösung, sondern der Ort, an dem eine
Zusage **ehrlich** landet, die kein Laufzeittest tragen kann:

| Ebene | Besitzt | Ort |
|---|---|---|
| **Vitest (Einheit)** | reine Rechnungen, Prädikate, Riegel-Funktionen, DOM-Verhalten von Client-Inseln | §8.2 |
| **Quelltext-Zusicherungen** | „diese **Bauform** ist eingehalten" — Regeln, deren Bruch typkorrekt, lint-sauber und laufzeitgrün ist | §8.3 |
| **Playwright (e2e)** | alles, was nur ein **echter Abruf** über eine **echte RSC-Grenze** zeigt, und alles Hostabhängige | §8.4 |
| **Kein Test** | alles, was einen echten Host, einen echten Dump, ein echtes Tablet oder ein Blatt Papier braucht | §8.5 |

**Die Falsifikationsregel ist verbindlich und gilt für jede Zeile jeder Tabelle unten.** Jede
Tabelle führt die Spalte „**Mutation, die ohne den Test grün bliebe**" — dieselbe Form, die die
`lagerbuch`-Spec in `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md:2451-2459`
etabliert hat. Diese Spalte **ist** die Falsifikation; es gibt kein zweites Verfahren daneben. Die
Regel dazu:

> Ein Pflichtstück gilt als abgenommen, wenn **jede** in seiner Zeile genannte Mutation den Test
> **rot** macht. Ein Test, der eine der genannten Mutationen überlebt, ist **vakuös** und wird
> gelöscht oder neu geschrieben — nicht ergänzt. Das Verfahren dazu steht in §8.6.

Der Grund für diese Härte steht im Projekt bereits: im `radio-admin`-Bestand ist
`software_versions.created_by` eine **tote** Spalte, die trotzdem geschrieben wird (Kapitel 4 der
Analyse, Pflicht 1, Falle 4) — genau die Klasse Zustand, die eine grüne, leere Suite entstehen
lässt.

## 8.2 Vitest — welche Einheiten, mit welchen Namen

Vitest besitzt hier **reine Funktionen und Prädikate**, nichts Hostabhängiges am echten Server und
keine RSC-Grenze. Wo eine Aussage nur über eine RSC-Grenze wahr oder falsch wird, steht sie in §8.4;
wo sie eine Bauform ist, steht sie in §8.3. Diese Trennung ist der ganze Zweck der Aufteilung: ein
Vitest, der eine RSC-Aussage zu tragen behauptet, ist eine grüne Lüge.

### 8.2.1 Die Zeitstempel-Abbildung — das teuerste Pflichtstück (Entscheidung 11)

**Datei: `scripts/import/radio.test.ts`** gegen **`scripts/import/radio.ts`.** Es gibt heute in
`scripts/import/` genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts` je mit Test und
`fixtures/` — kein `radio.ts` (Kapitel 4 der Analyse, Pflicht 5). Der Importer entsteht also neu und
bringt seinen Test mit.

**Die Signaturen, die dieser Test verlangt** (Zusage an Kapitel Datenmodell und Import):

```ts
/** Epoch-MILLISEKUNDEN → Unix-SEKUNDEN. NULL bleibt NULL. */
export function sekundenAusMs(wert: number | null): number | null;

/** Wirft, wenn der Wert nicht plausibel dreizehnstellig ist. */
export function pruefeMs(wert: number, feld: string): number;

export function mappeGeraet(zeile: AltGeraet): NeuesGeraet;
export function mappeGeraeteEreignis(zeile: AltEreignis): NeuesEreignis;
export function mappeSoftwareVersion(zeile: AltVersion): NeueVersion;
export function mappeApiToken(zeile: AltToken): NeuesToken;
export function mappeNutzer(zeile: AltNutzer): NeuerNutzer;
export function mappeLeihe(zeile: AltLeihe): NeueLeihe;
```

**Die Fixture-Regel ist die eigentliche Zusage, nicht der Test.** `scripts/import/portal.ts:72-75`
schreibt sie wörtlich aus („keep its fixture values **distinct per field**"), und sie gilt hier für
**dreizehn** Zeitstempel-Spalten: `devices.created_at`, `devices.updated_at`,
`devices.last_updated_at`, `device_events.changed_at`, `software_versions.created_at`,
`api_tokens.created_at`, `api_tokens.last_used_at`, `api_tokens.revoked_at`, `users.last_seen_at`,
`loans.borrowed_at`, `loans.returned_at`, `loans.created_at`, `loans.updated_at`. Belegt sind alle
als Millisekunden an ihrem jeweiligen Schreibpfad: `radio-admin/server/src/repos/deviceRepo.ts:13`,
`:78`, `:230`; `radio-admin/server/src/repos/softwareVersionRepo.ts:36`, `:53`;
`radio-admin/server/src/repos/apiTokenRepo.ts:49`, `:71`, `:72`, `:96`;
`radio-admin/server/src/repos/userRepo.ts:12`; `radio-admin/server/src/repos/loanRepo.ts:75`, `:104`
— im Schema steht es **nur** für `loans` (`radio-admin/server/src/db/schema.ts:103-104`: „epoch-ms").

Die Fixture trägt **dreizehn verschiedene, per Auge unterscheidbare** Werte, in der Sekundenachse
mindestens einen Tag auseinander. Verbindlich als Konstruktion, damit niemand sie „aufräumt":

```ts
// Basis 2025-01-01T00:00:00Z in ms; je Feld ein eigener Tagesoffset.
const MS_BASIS = 1_735_689_600_000;
const TAG_MS = 86_400_000;
const feldWert = (n: number) => MS_BASIS + n * TAG_MS; // n = 1 … 13, je Feld genau ein n
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `sekundenAusMs teilt durch 1000 und rundet ab` | `1_735_689_600_000 → 1_735_689_600` | `* 1000` statt `/ 1000`; Durchleitung ohne Rechnung (**genau der Bestandsfehler**: `radio-admin/server/src/import/commit-service.ts:45-47` nimmt jede numerische Zeichenkette nur mit `Number.isFinite`, ohne Plausibilitätsspanne) |
| `sekundenAusMs lässt NULL NULL und macht daraus NICHT 0` | `null → null` | `?? 0` als „Sicherheitsnetz". **Das ist die zweitschlimmste Mutation des ganzen Plans:** eine `loans.returned_at = 0` ist eine *abgeschlossene* Leihe im Jahr 1970, liegt unter jedem Retention-Cutoff und wird beim nächsten Lauf gelöscht — aus einer **aktiven** Leihe wird eine gelöschte |
| `pruefeMs weist einen Sekundenwert ab` | `1_700_000_000` (zehnstellig) wirft mit Feldnamen | Plausibilitätsspanne entfernt; `Number.isFinite` als einzige Prüfung (= Bestandsverhalten) |
| `mappeGeraet ordnet created_at, updated_at und last_updated_at NICHT gegeneinander um` | drei paarweise verschiedene Werte landen feldweise richtig | zwei der drei Felder vertauschen — **bei gleichen Fixture-Werten unsichtbar**, und die Parität hasht identisch |
| `mappeLeihe hält borrowed_at und returned_at getrennt` | zwei verschiedene Werte, richtige Zuordnung | `returned_at: zeile.borrowed_at` — die Leihe sieht aus wie am Ausleihtag zurückgegeben |
| `mappeLeihe schreibt snapshot_call_sign und borrower_name nicht ineinander` | zwei verschiedene Zeichenketten, richtige Zuordnung | Vertauschung. Das ist eines der vier verwechselbaren Paare aus Pflicht 4 der Analyse; `borrower_name` ist personenbezogen und der DSGVO-Grund der Retention |
| `mappeGeraet hält alamos_integrated und loanable getrennt` | `1` / `0` unterschiedlich belegt | Vertauschung zweier 0/1-Integer, „die niemandem auffallen" (Pflicht 4). `loanable` ist Stammdatum (`radio-admin/server/src/db/schema.ts:30-32`) — vertauscht verschwinden Geräte aus der Ausleihe |
| `mappeGeraeteEreignis weist ein unbekanntes source-Wort ab` | `source` außerhalb `manual\|csv-import\|create\|update-note` wirft | den Wert durchleiten. `radio-admin/server/src/db/schema.ts:96` ist ein Drizzle-Enum **ohne DB-CHECK**: die Altdaten dürfen fremde Werte tragen, das Ziel nicht (Pflicht 3) |
| `keine Mapping-Funktion liefert für zwei Ausgabefelder dasselbe Quellfeld` | Schleife über alle sechs Mapper: die Werte-Multimenge der Ausgabe ist **duplikatfrei** — ⚠️ **`null` ausgenommen**, denn `loans.returned_at` ist rechtmäßig `null` und wäre sonst mit jedem zweiten Null-Feld ein roter Test gegen einen richtigen Mapper | genau das, was gleiche Fixture-Werte verbergen. Diese eine Zeile ist die maschinelle Fassung der Fixture-Regel und darf nicht entfallen, wenn jemand später ein Feld ergänzt |

⚠️ **Was dieser Test NICHT beweist**: dass der echte Dump dreizehnstellige Werte trägt. Das ist
Abfrage 5 aus Pflicht 4 (`SELECT MIN(created_at), MAX(created_at) FROM devices;`) und gehört ins
Runbook (§8.5). Die lokale `radio-admin/data/data.sqlite` beantwortet die Frage **nicht** — sie ist
leer und führt `loans`, `api_tokens`, `users` überhaupt nicht (Kapitel 6 der Analyse, Frage 2).

### 8.2.2 Der Code-Einlöser — drei Gründe, und sie müssen benennbar sein

Bauform ist wörtlich das `lagerbuch`-Muster (Entscheidung 6): der Code ist **dauerhaft und
sperrbar**, nicht löschbar, und prägt beim Einlösen am Gate eine **zeitlich begrenzte** Sitzung.
Vorbilder im Quelltext: `src/app/m/lagerbuch/_lib/helferZugang.ts:110` (Prädikat), `:135` (werfende
Form für Layouts), `:170` (Ergebnisform für schreibende Actions).

**Zusage an Kapitel Zugang — die tragende Schnittstellenauflage dieses Kapitels:** die drei
Ablehnungsgründe sind **eine exportierte, benannte Literal-Union**, kein `boolean`, kein Wurf und
keine Fehlermeldung als Zeichenkette. Ohne sie lässt sich „gesperrt" von „unbekannt" von
„abgelaufen" schlicht nicht **auseinander** prüfen, und der Testplan wird zur Behauptung. Vorbild ist
`SperrGrund` in `src/app/m/lagerbuch/_lib/helferZugang.ts:63` — und dort steht auch die Begründung,
warum es **eine** Union sein muss und nicht zwei: zwei getrennte Unions für dieselben Wörter fallen
erst auf, wenn jemand eine davon erweitert (`:53-60`).

```ts
// src/app/m/radio/_lib/zugang.ts
export type ZugangGrund = "unbekannt" | "gesperrt" | "abgelaufen";
export function einloesenAmGate(db: DB, roh: string):
  | { ok: true; zielPfad: string }
  | { ok: false; grund: Extract<ZugangGrund, "unbekannt" | "gesperrt"> };
export async function kioskZugangOderNull(db: DB): Promise<KioskZugang | null>;
export async function requireKioskZugang(db: DB): Promise<KioskZugang>;
export async function requireKioskSchreibend(db: DB):
  Promise<{ ok: true; zugang: KioskZugang } | { ok: false; grund: ZugangGrund }>;
```

⚠️ **Die Unterscheidung ist nicht kosmetisch**, und das ist derselbe Grund wie bei `lagerbuch`
(`helferZugang.ts:56-62`): bei `abgelaufen` hilft erneutes Einlösen, bei `gesperrt` **nicht** —
derselbe Code scheitert genauso. Nur daran hängt, ob die Oberfläche das Feld zur Code-Erneuerung
überhaupt anbietet.

**Dateien: `src/app/m/radio/_lib/code.test.ts`** (Kanonisierung) und
**`src/app/m/radio/_lib/zugang.test.ts`** (Einlösung und Recheck).

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `ein unbekannter Code ergibt grund "unbekannt"` | kein Treffer in der Codetabelle | `grund: "gesperrt"` für beides — die Oberfläche bietet dann Erneuerung an, wo keine hilft |
| `ein gesperrter Code ergibt grund "gesperrt", nicht "unbekannt"` | Zeile existiert, `aktiv = 0` | `WHERE aktiv = 1` in der Suchabfrage: der gesperrte Code verhält sich wie ein Tippfehler, und niemand erfährt, dass eine **Sperre** gegriffen hat |
| `ein gesperrter Code blockt auch den LESEPFAD, nicht nur den Schreibpfad` | `kioskZugangOderNull` liefert `null`, sobald `aktiv = 0` — **auch mit gültig signiertem Cookie** | den DB-Recheck aus dem Lesepfad entfernen. **Das ist der Bestandszustand von `lagerbuch` vor der Portierung** (`helferZugang.ts:22-27` schreibt es aus) und bleibt in jedem Test grün, der nur schreibt: ein gesperrter Code liest sonst bis zum Sitzungsende den gesamten Bestand samt Ausleihernamen weiter |
| `ein manipuliertes tokenId in einem gültig signierten Cookie verhält sich wie gesperrt` | kein Treffer auf dem Primärschlüssel → `gesperrt` | `!zeile` als „unbekannt" oder als `ok: true` behandeln — der Doppeltest `!zeile \|\| !zeile.aktiv` ist genau deshalb einer (`helferZugang.ts:83-85`) |
| `eine abgelaufene Sitzung ergibt grund "abgelaufen" und KEINEN Wurf` | `requireKioskSchreibend` gibt zurück, wirft nicht | zum Wurf oder `redirect()` umbauen. Ein `redirect()` verwürfe die schon eingetragenen Felder — genau der Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus Server-Actions am Feld an?" ausschließt |
| `code, label und Ablauf kommen aus der DB-Zeile, der Ablauf aus dem Cookie` | Sperrung wirkt **sofort** (DB), Ablauf steht seit Ausstellung fest (Cookie) | `label` aus der JWT-Nutzlast lesen: ein umbenannter Code trägt dann bis zum Sitzungsende sein alten Namen in jede Journalzeile |
| `einloesenAmGate verbraucht keinen Code` | die Zeile ist nach der Einlösung **weiter einlösbar**, nur ihr Nutzungsdatum wandert | den Code beim Einlösen entwerten oder löschen. **Entscheidung 6 verbietet das Löschen ausdrücklich**: ein gelöschter Code kann an ein später ausgestelltes Kärtchen zurückfallen, und historische Journalzeilen erschienen danach unter dem neuen Label |
| `123456, 123-456 und " 123 - 456 " ergeben denselben kanonischen Wert` | Kanonisierung vor der Suche | die Bindestrich-Ergänzung entfernen — sie liefert `{ok:false}`, also genau das, was ein falscher Code liefern soll, und hat damit **keine Fehlerform** (übernommen aus `src/app/m/lagerbuch/_lib/code.test.ts`) |

⚠️ **Zu bestätigen (nur der Betreiber weiß es):** die **Sitzungsdauer**. Vorschlag **12 Stunden** wie
bei `lagerbuch` (dort als `LAGERBUCH_HELFER_SITZUNG_STUNDEN` geführt, `e2e/helpers/lagerbuch.ts`
setzt den E2E-Wert auf `"12"` mit dem Vermerk „kürzer bringt nichts, weil kein Test 12 h wartet").
Der Test prüft die **Grenze relativ zum konfigurierten Wert**, nie die Zahl 12 — sonst wandert die
Entscheidung in eine Testdatei.

### 8.2.3 Der Host-Riegel in allen drei Formen (Falle 61)

**Datei: `src/app/m/radio/_lib/host.test.ts`,** gebaut nach
`src/app/m/lagerbuch/_lib/host.test.ts`. Geprüft werden die drei Funktionen
`istRadioHost` / `requireRadioHost` / `radioHostOderNull` — Vorbild
`src/app/m/lagerbuch/_lib/host.ts:42`, `:48`, `:54`. `notFound()` wird gemockt, weil es in der
echten Laufzeit einen Next-internen Fehler wirft; geprüft wird, **dass** geworfen wird.

Warum der Riegel überhaupt existiert, ist keine Vermutung: `src/core/routing.ts:58-67` gatet einen
internen Pfad `/m/<key>/…` **nach dem Modul aus dem Segment**, ohne jeden Hostbezug, und
`src/core/registry.ts:239` steigt für ein Modul ohne Auth-Pflicht sofort aus
(`if (!mod.requiresAuth) return true;`). `radio` führt `requiresAuth: false` (Entscheidung 4). Also
antwortet **jeder** Suite-Host auf `/m/radio/*`, wenn das Modul seinen eigenen Riegel nicht trägt.

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `istRadioHost trifft den Dev-Host OHNE jede Env` | `radio.localtest.me` → `true`, `SUITE_HOST_RADIO` gelöscht | direkter Vergleich gegen `prodHostsFor` statt `moduleForHost(resolveHost(headers))?.key === "radio"` — der Dev-Host fällt heraus, und **alle** lokalen Läufe und die ganze E2E-Suite werden 404 |
| `istRadioHost trifft den konfigurierten Prod-Host` | `SUITE_HOST_RADIO = "radio.iuk-ue.de"` → `true` | `resolveHost` nachbauen statt wiederverwenden — die Vorrangregel läuft dann auseinander |
| `istRadioHost weist einen FREMDEN Suite-Host ab` | `feedback.localtest.me` → `false`, `iuk-ue.de` → `false` | Prädikat auf `true` verkürzen, „weil der Riegel ja in der Middleware sitzt" — er sitzt dort nicht (`routing.ts:58-67`) |
| `istRadioHost bevorzugt x-forwarded-host vor host` | beide Richtungen geprüft | Reihenfolge tauschen. Nach dem Rewrite der Middleware ist `x-forwarded-host` die einzig richtige Quelle |
| `istRadioHost ignoriert einen Port` | `radio.localtest.me:3000` → `true` | Port mitvergleichen: lokal grün (Port 3100 in beiden), in Produktion hinter Traefik rot |
| `istRadioHost hat KEINEN "kein Prod-Host konfiguriert → durchlassen"-Zweig` | ohne `SUITE_HOST_RADIO` ist `irgendwas.example.org` **falsch** | genau diesen Zweig einbauen. Er ist die Sperre, die sich selbst abschaltet: **vor** dem Cutover ist `SUITE_HOST_RADIO` nicht gesetzt, und genau dann stünde offen, wogegen die Datei gebaut ist. Entscheidung 10 verbietet ihn ausdrücklich |
| `requireRadioHost wirft auf fremdem Host — notFound(), KEIN 403` | Wurf | `forbidden()`/403: die Existenz eines Pfades auf dem falschen Host wird nicht verraten |
| `radioHostOderNull wirft NIE` | `"radio"` / `null` / `null` bei leeren Headers | die werfende Form auch in Route Handlern verwenden — ein `notFound()` ist keine brauchbare Antwort auf einen gescannten QR-Code; der Handler baut seine 404 selbst |

⚠️ **Es gibt kein `validateRadioHosts`.** 0, 1 und ≥ 2 Hosts sind alle erlaubt: 0 vor dem Cutover, 1
im Normalfall, ≥ 2 solange `radio-admin.iuk-ue.de` mitläuft (Entscheidung 2). Die `files`-Form mit
Rollenzuordnung über den Index in `SUITE_HOST_FILES` ist hier **falsch** — bei `radio` liegen beide
Rollen auf **einem** Host und die Rolle steckt im **Pfad** (Entscheidung 10). Der Scan, der die
`files`-Form fernhält, steht in §8.3.

### 8.2.4 Der Pfad-Riegel für `/admin` — der Test, den `lagerbuch` nicht hat

Dies ist **kein** Host-Test, und die Verwechslung ist die naheliegendste Fehlerquelle des ganzen
Moduls: Ausleihe und Verwaltung liegen auf **demselben** Host (Entscheidung 1), der Host-Riegel lässt
also beide durch. Was `/admin` schützt, ist ausschließlich der Zugriffsriegel, den jede Seite, jede
Server Action und jeder Route Handler **selbst als erste Anweisung** ruft (Entscheidung 10).

**Datei: `src/app/m/radio/_lib/zugang.test.ts`** (derselbe Modul-Namensraum wie §8.2.2, andere
`describe`-Blöcke) — Vorbild `src/app/m/lagerbuch/_lib/zugang.test.ts`.

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `Mitglied von adminGroupsFor darf verwalten` | Gruppe aus `SUITE_ADMIN_GROUP_RADIO` bzw. Registry-Vorgabe | `mod.adminGroups` direkt lesen statt `adminGroupsFor` — die Env-Überschreibung wird wirkungslos, und niemand merkt es, weil der Registry-Vorgabewert lokal stimmt |
| `Suite-Admin OHNE radio-Gruppe bekommt 404` | `session.user.isAdmin` zählt **nicht** | auf `isModuleAdmin` oder `session.user.isAdmin` umstellen. **Beide Dev-Logins setzen `isAdmin = true`** — die gesamte E2E-Suite bliebe grün, während die Verwaltung für jeden Suite-Betreiber offen stünde. Entscheidung 9 verlangt, dass `radio` den Kurzschluss modulintern ignoriert, wie `feedback` und `lagerbuch` |
| `eine leere adminGroups-Liste gewährt NICHTS` | `[]` → 404 | die Prüfung mit der `canAccess`-Verknüpfung aufbauen: `src/core/registry.ts:242` steigt bei leerer Liste mit `true` aus (`if (erlaubt.length === 0) return true;`) — richtig für Modulzugang, **falsch** für Verwaltungszugang |
| `keine Sitzung auf /admin → Umleitung auf /login mit absolutem callbackUrl` | nur der `/admin`-Ast leitet um | relativen `callbackUrl` bauen: die Rückkehr landet auf dem Portal-Host statt auf `radio.iuk-ue.de` |
| `der Riegel steht NICHT auf dem anonymen Ausleih-Ast` | `requireRadioAdmin` kommt in keiner Datei außerhalb von `admin/` und `_actions/` vor | den Riegel „aus Konsistenz" ins Modul-Layout heben. **Das schickt jeden anonymen Scan nach `/login`** — genau den Ausfall, gegen den `requiresAuth: false` gebaut ist. Typkorrekt, lint-sauber, und ein e2e fände es nur mit einem Abruf **ohne** Cookie |
| `requireRadioAdmin ruft requireRadioHost als erste Anweisung` | Host-Riegel liegt **innen** | die Zeile als „doppelt zu den Layouts" entfernen. Eine Server Action hat **kein** Layout über sich; die Zusage „jede Verwaltungs-Action ist host-gebunden" ist nur **durch Konstruktion** wahr, nicht durch eine Liste, die die nächste Action vergisst (`src/app/m/lagerbuch/_lib/helferZugang.ts:13-15` schreibt genau das aus) |

### 8.2.5 Die Retention-Auswahl (Entscheidung 12)

**Datei: `src/app/m/radio/_lib/retention.test.ts`.** Die Auswahl ist eine **reine Funktion**, getrennt
von der Ausführung — nur so ist sie ohne Datenbank prüfbar und nur so lässt sich der Boot-Pfad
ausschließen:

```ts
export const RETENTION_MONATE = 2;
export function retentionGrenze(jetzt: Date, monate?: number): number; // Unix-SEKUNDEN
export function waehleAbgelaufeneLeihen(zeilen: LeiheZeile[], grenze: number): string[];
export function purgeAbgelaufeneLeihen(db: DB, jetzt: Date): number; // ruft die beiden oben
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `eine aktive Leihe (returned_at NULL) wird NIE ausgewählt` | `null` fällt raus, egal wie alt `borrowed_at` ist | die `IS NOT NULL`-Bedingung streichen. Der Bestand hat sie (`radio-admin/server/src/repos/loanRepo.ts:191-196`: `WHERE returned_at IS NOT NULL AND returned_at < cutoffMs`), und ohne sie löscht der erste Lauf **jede laufende Ausleihe** |
| `returned_at = 0 wird ausgewählt — und deshalb darf NULL nie zu 0 werden` | die Kopplung zu §8.2.1 ist ausgeschrieben und im Test **verlinkt** | keine. Diese Zeile ist absichtlich unangenehm: sie hält die beiden Pflichtstücke aneinander. Wer die `?? 0`-Mutation aus §8.2.1 einbaut, macht **diesen** Test rot |
| `die Grenze rechnet in SEKUNDEN, nicht in Millisekunden` | `retentionGrenze` gegen einen festen Zeitpunkt, Erwartung zehnstellig | die Millisekunden-Rechnung des Bestands übernehmen (`radio-admin/server/src/services/retentionService.ts:9`, `:17-21`). In Sekunden verglichen liegt die Grenze im Jahr 1970 — es wird **nichts** gelöscht, und der Fehler ist stumm und harmlos, bis jemand die Einheit an einer Stelle korrigiert |
| `genau auf der Grenze wird nicht gelöscht` | `<`, nicht `<=` | Vergleich kippen. Ein Tag Unterschied fällt niemandem auf |
| `waehleAbgelaufeneLeihen greift ohne Datenbank und ohne Uhr` | reine Funktion, Zeit als Parameter | `Date.now()` in die Funktion ziehen; der Test wird dann unfälschbar grün |

⚠️ **Die Ausführung hängt NICHT am Boot**, und das ist der Kern von Entscheidung 12. Der Bestand
macht es anders: `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`, und
`radio-admin/server/src/services/retentionService.ts:47` führt `purge()` **sofort** aus, vor dem
Tagestimer — der Quellkommentar auf `:29-30` nennt als Anlass wörtlich „straight after a data
migration". Genau diese Reihenfolge macht einen Faktor-1000-Fehler im Import zur **Datenvernichtung**
beim nächsten Start. Dass der Boot die Funktion nicht ruft, ist eine **Bauform** und steht als
Quelltext-Scan in §8.3.

⚠️ **Zu bestätigen ist nicht die Retention, sondern ihr Umfang:** „betroffen < 100 Leihen" ist eine
Schätzung des Betreibers, keine Zählung (Entscheidung 12). Die Zählung ist ein Runbook-Schritt
(§8.5).

### 8.2.6 Der Ausfall-Puffer — die Fachlichkeit, die beim naiven Port wegfällt

Entscheidung 15 verlangt, `STALE_GRACE_MS` als **Fachlichkeit** mitzunehmen. Der Beleg ist
`radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`
(`const STALE_GRACE_MS = 5 * 60_000;`), angewandt auf `:123`
(`now - this.deviceCache.fetchedAt < ttl + STALE_GRACE_MS`). Fällt die HTTP-Grenze zwischen Kiosk und
Verwaltung weg — und sie darf erst fallen, wenn die sechs `/v1`-Routen
(`radio-admin/server/src/routes/loanApi.ts:126`, `:133`, `:140`, `:148`, `:158`, `:187`) Drizzle-Aufrufe
im selben Prozess sind —, dann verschwindet der Puffer beim naiven Port lautlos: es gibt keinen
`fetch` mehr, an dem er hängen könnte. Die **Aussage** bleibt aber: Ausleihe, Rückgabe und Historie
bleiben bei einer kurzen Störung bedienbar, statt eine Fehlerseite zu zeigen.

**Datei: `src/app/m/radio/_lib/stand.test.ts`.**

```ts
export const AUSFALL_PUFFER_MS = 5 * 60_000;
export function standNochBedienbar(alterMs: number, ttlMs: number): boolean;
```

| Testname (`it`) | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `innerhalb der TTL ist der Stand frisch` | `alter < ttl` → `true` | keine — dieser Fall ist der harmlose und steht nur als Kontrast da |
| `zwischen TTL und TTL plus Puffer ist der Stand NOCH bedienbar` | `ttl + 1` → `true` | den Puffer-Summanden entfernen (`< ttl` statt `< ttl + AUSFALL_PUFFER_MS`). **Das ist der naive Port**, und er ist grün in jedem Test, der nur den frischen und den ganz alten Fall kennt |
| `jenseits von TTL plus Puffer ist der Stand NICHT mehr bedienbar` | `ttl + AUSFALL_PUFFER_MS + 1` → `false` | `return true` — der Kiosk zeigt dann beliebig alte Bestände als aktuell an, und **kein** Test und **kein** Blick auf den Bildschirm unterscheidet das vom Normalfall |
| `AUSFALL_PUFFER_MS ist fünf Minuten` | die Konstante selbst | die Konstante auf `0` kippen. Ohne diese Zeile ist die Zusage „5 Minuten Störung sind gedeckt" nicht geprüft, sondern nur aufgeschrieben |

### 8.2.7 DOM-Verhalten — das Harness ist gesetzt

Für DOM-Verhalten gilt `src/app/m/qr/_lib/test-dom.tsx` (`CLAUDE.md:250-251`: „kein zweites
erfinden"). Die verfügbaren Bausteine: `mount` (`:24`), `hydrate` (`:47`), `rerender` (`:69`),
`unmount` (`:77`), `query` (`:114`), `queryAll` (`:120`), `exists` (`:124`), `fill` (`:139`), `click`
(`:149`), `clickElement` (`:156`), `submitForm` (`:167`), `queryPortal` (`:187`), `existsPortal`
(`:193`), `clickPortal` (`:197`). Die `*Portal`-Varianten sind für antd-Overlays (Modal, Select,
Dropdown) und der Grund, warum kein zweites Harness nötig ist.

⚠️ **Was hier NICHT geprüft werden darf, und das ist die wichtigste Zeile des Abschnitts:** jsdom hat
**keine RSC-Grenze** (`CLAUDE.md:62-64`). Ein Test, der eine `"use client"`-Tabelleninsel mountet,
beweist über Falle 9 **nichts** — er würde die kaputte Fassung genauso grün mounten. Diese Tests
besitzen Formatierung, Feldzustände und Overlay-Verhalten, nie die Grenze.

| Datei | Besitzt die Aussage | Mutation, die ohne den Test grün bliebe |
|---|---|---|
| `src/app/m/radio/_ui/AusleiheForm.test.tsx` | ein leerer Ausleihername wird am Feld abgewiesen; der **vorausgefüllte** Name ist überschreibbar und wird nicht erzwungen | Vorbelegung als `readonly` bauen. Entscheidung 7: die Ausleihe ist auch für Angemeldete **in der Sache anonym**, der Name **kann** vorausgefüllt werden. ⚠️ Ob die Vorbelegung überhaupt kommt, ist **zu bestätigen** — der Test prüft die Überschreibbarkeit, nicht die Existenz |
| `src/app/m/radio/_ui/GateForm.test.tsx` | ein abgelehnter Code erzeugt eine **benannte deutsche Meldung am Feld**, drei Gründe drei Texte; die Eingabe bleibt stehen | alle drei Gründe auf einen Text abbilden — die Oberfläche bietet Erneuerung dann im gesperrten Fall an, wo sie nicht hilft (§8.2.2) |
| `src/app/m/radio/_ui/CodeSperrenDialog.test.tsx` | „Sperren" ist bestätigungspflichtig; es gibt **kein** „Löschen" | einen Löschknopf anbieten. Entscheidung 6 verbietet Löschen — der Test hält die Abwesenheit fest, weil eine hinzugefügte Aktion sonst niemandem auffällt |
| `src/app/m/radio/_ui/GeraeteTabelle.test.tsx` | die 15 `render`-Funktionen formatieren richtig (Status, Fälligkeit, Modi als Liste statt Klartextkomma) | `device_modes` ungeteilt anzeigen (Bestandsformat ist eine komma-verbundene Zeichenkette wie „TMO,DMO") |

## 8.3 Quelltext-Zusicherungen — die ehrliche Ebene für „diese Bauform ist eingehalten"

Sie belegen nicht, dass etwas **wirkt**, sondern dass eine Bauform **eingehalten** ist. Genau dafür
sind sie hier die richtige Ebene, und die Suite benutzt sie an vergleichbaren Stellen längst:
`src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab (`CLAUDE.md:38-40`), und
`scripts/seed-lokal.test.ts:46-56` liest `src/core/bootstrap.ts` und `src/instrumentation.ts` als
**Text** und verbietet dort drei Namen. Diese Ebene existiert also, sie wird hier nur ausdrücklich
benannt.

Der Grund, sie für `radio` besonders schwer zu belasten, ist Entscheidung 10: mit
`requiresAuth: false` erbt `/admin` **kein** Middleware-Gating, also ruft jede Seite, jede Action und
jeder Handler den Riegel selbst. Eine fehlende Guard-Zeile in einer **neu hinzugefügten** Action ist
typkorrekt, lint-sauber, sieht wie ein Erfolg aus — und **es gibt keinen Laufzeittest, der eine
Action ohne Sitzung aufruft.** Ohne die folgende Tabelle bleibt „jede Verwaltungsstelle ist bewacht"
eine Absichtserklärung.

**Datei: `src/app/m/radio/_lib/bauform.test.ts`** (ein Vorbild derselben Bauart liegt als
`src/app/m/lagerbuch/_lib/bauform.test.ts` im Repo).

| Zusicherung | Warum sie kein Laufzeittest sein kann |
|---|---|
| **Kein `user.isAdmin` / `session.user.isAdmin` in `src/app/m/radio/`** | Beide Felder sind `boolean`, ein Umbau ist typkorrekt und baut durch — und **beide Dev-Logins setzen `isAdmin = true`**, die E2E bliebe grün, während die Verwaltung für jeden Suite-Betreiber offen stünde (Entscheidung 9) |
| **Kein `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound`, `canAdminModule` in `src/app/m/radio/`** | Die Funktionen sind fertig, gut und die falschen für dieses Modul: `radio` ignoriert den Suite-Admin-Kurzschluss modulintern (Entscheidung 9). Ein Import sieht wie Wiederverwendung aus |
| **Kein `validateRadioHosts`, und in `_lib/host.ts` kein `prodHostsFor`-Vergleich** | Die `files`-Form (`SUITE_HOST_FILES`, Rolle über den Index) ist die naheliegende Vorlage und für `radio` falsch — beide Rollen liegen auf **einem** Host (Entscheidung 10). Ein Nachbau ist grün, solange genau ein Host konfiguriert ist, und kippt beim zweiten (Entscheidung 2 lässt zwei zu) |
| **Jede `page.tsx`, `layout.tsx` und `route.ts` unter `src/app/m/radio/admin/` nennt `requireRadioAdmin` bzw. `radioHostOderNull`** — Zählung gegen die Seitenliste des Kapitels Verwaltungsoberfläche | Route Handler haben **kein** Layout; die Sperre erreicht sie über kein Group-Layout. Route-Group-Grenzen sind keine Sicherheitsgrenzen |
| **Jede exportierte Funktion in `src/app/m/radio/_actions/*.ts` ruft `requireRadioAdmin` oder `requireKioskSchreibend` — oder steht auf einer Ausnahmeliste mit GENAU ZWEI Einträgen** | Der Scan zählt die Ausnahmen mit: wächst die Liste, ist das ein **roter Test** und keine Zeile im Diff. Auflagen zum Zählen, sonst liefert er falsche Zahlen: `export type` und `export interface` werden verworfen; gezählt wird **je Datei je Deklaration**, nie über ein `Set` der Namen; und die Datei überspringt **sich selbst** |
| **Kein Aufruf der Retention aus `src/core/bootstrap.ts` und `src/instrumentation.ts`** — Textscan auf `retention`/`purge`, Vorbild `scripts/seed-lokal.test.ts:46-56` | Entscheidung 12. Die Verdrahtung am Boot ist genau das, was der Bestand tut (`radio-admin/server/src/index.ts:35` → `retentionService.ts:47`), sie sieht nach Sorgfalt aus, und ihr Schaden tritt **einmal** ein, bei einem Start nach einem Import |
| **`seedLokal` legt keine einlösbare Zugangszeile an** — Textscan plus Laufzeitprüfung: nach `seedLokal` ist die Codetabelle **leer** | `shouldSeed()` ist `SUITE_SEED === "1" \|\| NODE_ENV === "development"` (`src/core/bootstrap.ts:108`), und `SUITE_SEED=1` ist der **Generalproben**-Schalter, nicht der Lokalschalter (`CLAUDE.md:180-183`). Ein geseedeter Code wäre in der Generalprobe ein **gültiger anonymer Zugang** zum gesamten Bestand samt Ausleihernamen. Typkorrekt und testgrün; nur das Datenleck ist real |
| **Kein `AdminUser` und kein Literal `pocketid:` in `src/app/m/radio/` und `scripts/import/radio.ts`** | Entscheidung 14: die Suite führt den **rohen** `sub`, der Präfix verschwindet. Der Bestand baut die Kennung als `pocketid:${sub}` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Ein mitkopierter Präfix ergibt Audit-Zeilen, die auf niemanden auflösen — HTTP 200, leerer Name |
| **Kein Prüfpfad gegen `api_tokens` in `src/app/m/radio/`** — die Tabelle wird gelesen und geschrieben nur vom Importer und der Historienansicht | Entscheidung 13: produktiv trägt sie genau **einen** Konsumenten, den Alt-Kiosk (statischer `RADIO_ADMIN_API_TOKEN`), und der verschwindet mit dem Port. Ein neu gebauter Bearer-Pfad wäre ein zweiter, undokumentierter anonymer Zugang — und er funktionierte |
| **Kein base64-kodierter Zugang in einer URL** — kein `btoa`, kein `Buffer.from(…).toString("base64")` im QR-Erzeugungspfad | Entscheidung 8. Heute trägt der QR-Code den einen geteilten API-Token als URL-Parameter, base64-kodiert (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`) — ohne Ablauf, ohne Widerruf. Ein 1:1-Port ist **funktionsfähig** und deshalb in keinem Test rot |
| **Kein `localStorage` als Zugangsspeicher unter `src/app/m/radio/`** | Der Bestand legt das Geheimnis dort ab (`radio-inventar/apps/frontend/src/lib/tokenStorage.ts:5-13`). Ein mitportierter `localStorage`-Zugang ist origin-gebunden, umgeht jeden serverseitigen Riegel und ist mit entsperrtem Bildschirm auslesbar |
| **Kein `domain` in den Cookie-Optionen der Kiosk-Sitzung** | Die naheliegende Vorlage `src/core/auth/cookies.ts` setzt es, und der Bestand setzt es sogar ausdrücklich subdomainweit (`radio-inventar/apps/backend/src/config/session.config.ts:16-28`: `domain: '.' + parts.slice(-2).join('.')`, dazu `sameSite: 'none'` auf `:39`). Playwright fährt gegen **einen** Host, wo ein domainweites Cookie sich exakt wie ein host-only verhält |
| **Kein `@ant-design/icons`-Import in einer Datei ohne `"use client"` unter `src/app/m/radio/`** | Deckt bereits `src/core/shell/icons.test.ts` repo-weit ab (`CLAUDE.md:38-40`) — **kein neuer Scan**, aber die Zeile steht hier, damit niemand einen zweiten baut. Betroffen sind beide Alt-Frontends: `react-icons` in `radio-admin`, `lucide-react` im Kiosk, **beide** müssen auf die `ICONS`-Map. ⚠️ Wer `"use client"` auf `icons.ts` setzt, verwandelt Falle 7 in Falle 6: HTTP 200 mit **leerer** Map und still falschem Icon |

**Was ausdrücklich KEINE Quelltext-Zusicherung braucht, weil ein Tor es schon sieht** — hier
korrigiert dieses Kapitel die Analyse: die `COPY`-Zeile im `Dockerfile` ist **nicht** ungeprüft.
`src/core/bootstrap.test.ts:105-111` liest die Datei als Text und verlangt für **jeden** Eintrag aus
`MODULE_MIGRATIONS` und `CORE_MIGRATIONS`, dass sein `migrationsFolder` darin vorkommt
(`expect(dockerfile, "Dockerfile: COPY für … fehlt").toContain(m.migrationsFolder)`), und `:100-101`
prüft Ordner und `meta/_journal.json`. Das Dreieck ist damit **vollständig** durch `pnpm vitest run`
abgedeckt, sobald der Eintrag in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts:20`) steht; die
Behauptung „lokal grün, im Container kaputt" gilt für die Suite von heute nicht mehr. Es bleibt genau
**eine** Reihenfolge-Auflage: der Eintrag in `MODULE_MIGRATIONS` muss im **selben** Commit stehen wie
Ordner und `COPY`-Zeile, sonst ist der Test rot statt der Container.

## 8.4 Playwright — was nur ein echter Abruf zeigt

Playwright besitzt hier genau zwei Klassen von Aussagen, und beide sind für jedes andere Tor
unerreichbar: (a) **die RSC-Grenze**, weil sie erst beim Serialisieren eines echten Requests
existiert, und (b) **der Host**, weil `moduleForHost` in Vitest nur gegen ein `Headers`-Objekt
antwortet, das der Test selbst gebaut hat.

**Die eine Quelle für Host, Fremdhost, Gruppe und Port: `e2e/helpers/radio.ts`.** Vorbild
`e2e/helpers/lagerbuch.ts`, und dessen Kopfkommentar nennt den Grund, der hier wortgleich gilt:
stünde die Admin-Gruppe einmal in `webServer.env` und einmal im Spec, hätte man **zwei** Literale,
und der Fehlerfall ist nicht laut, sondern **gegenteilig** — mit falschem `groups` bezeugt der Lauf
einen 404 und **sieht dabei aus wie ein bestandener Test**.

```ts
// e2e/helpers/radio.ts
export const RADIO_HOST = "radio.localtest.me";
export const FREMDER_HOST = "feedback.localtest.me"; // existiert bereits, playwright.config.ts:155
export const RADIO_ADMIN_GRUPPE = "radio_admin";     // ⚠️ Prod-Wert ist Betreibersache
export const RADIO_PORT = 3100;
export const E2E_CODE_AKTIV = "111-111";
export const E2E_CODE_GESPERRT = "222-222";
export const RADIO_ENV: Record<string, string>;
export function radioUrl(pfad: string): string;   // absolut, weil baseURL aufs PORTAL zeigt
export function fremdUrl(pfad: string): string;
```

⚠️ **Zwei aktive Codes, nicht einer** — dieselbe Begründung wie bei `lagerbuch`: Playwright fährt
alle Spec-Dateien in **einem** Worker gegen **eine** SQLite-Datei, und der Sperr-Test darf die
Sitzung des Ausleih-Tests nicht mitnehmen.

### 8.4.1 Die Flüsse

| Spec-Datei | Fluss | Zusage |
|---|---|---|
| `e2e/radio-kiosk.spec.ts` | Code am Gate einlösen → Geräteliste → ausleihen → zurückgeben | 303 auf das Ziel, `Set-Cookie` der Kiosk-Sitzung **ohne** `Domain=`; die Ausleihe erscheint in der Liste aktiver Leihen; die Rückgabe setzt `returned_at`. Jeder POST wird mit `page.waitForResponse` **auf seine Antwort** geprüft, nicht auf eine spätere Zustandsänderung (§8.4.4) |
| `e2e/radio-zugang.spec.ts` | Zugang über die Suite-Kachel statt über den QR-Code | angemeldet, mit Zugriff aus der Kachel, ohne Code: Ausleihe erreichbar und **in der Sache anonym** — die Journalzeile trägt den eingetippten Ausleihernamen, nicht die Kennung des Angemeldeten (Entscheidung 7) |
| `e2e/radio-zugang.spec.ts` | gesperrter Code am Gate | benannte deutsche Meldung **am Feld** — nicht die stumme Landung des Bestands, und **kein** „server-side exception" |
| `e2e/radio-zugang.spec.ts` | Code sperren, während eine Sitzung läuft, dann neu laden | Umleitung **über den Abmelde-Route-Handler** mit benanntem Grund; dessen Antwort trägt `Set-Cookie` mit `Max-Age=0` und **ohne** `Domain=`; ein zweiter Aufruf landet danach ohne Umweg am Gate. Die Kette wird über das Antwortprotokoll geprüft, nicht nur über die Endadresse — sonst bliebe eine ungelöschte Cookie-Zeile grün |
| `e2e/radio-zugang.spec.ts` | gesperrter Code an einer **schreibenden** Action | deutsche Meldung am Formular, **kein Absturz**, und die eingetragenen Felder bleiben stehen |
| `e2e/radio-verwaltung.spec.ts` | angemeldet mit `RADIO_ADMIN_GRUPPE`: Gerät anlegen, ändern, Code ausstellen, Code sperren | die vier Flächen antworten mit 200; das Ausstellen und Sperren ist **nur** hier möglich (Entscheidung 7) |
| `e2e/radio-verwaltung.spec.ts` | angemeldet **ohne** Gruppe, dann `/admin` | 404 (die Suite-404-Seite, **nicht** 403), und **kein** Verwaltungs-Eintrag in der Navigation |
| `e2e/radio-verwaltung.spec.ts` | **ohne** Sitzung `/admin` | Umleitung nach `/login`; und im **selben** Test: `/` ist ohne Sitzung weiter erreichbar. Die zweite Hälfte ist die eigentliche Zusage — sie fängt den Riegel, der versehentlich im Modul-Layout landet (§8.2.4) |
| `e2e/radio-hosts.spec.ts` | die Host-Schleife | §8.4.3 |
| `e2e/radio-tabellen.spec.ts` | der Rundgang: je **Seite** ein echter Abruf mit Statusprüfung, je **Tabelle** zusätzlich eine Zelle | §8.4.2, §8.4.2.1 |

### 8.4.2 Je Seite ein echter Abruf — Fallen 1 und 7

**Die breitere Regel zuerst, denn sie kostet fast nichts und deckt zwei Fallen.** Falle 1
(Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500, `CLAUDE.md:11-13`) und Falle 7
(`@ant-design/icons` in einer Server Component ergibt HTTP 500, `CLAUDE.md:31-44`) sind **berührt**:
`radio-admin` ist formularlastig — Geräte anlegen und ändern, Software-Versionen, Code-Ausstellung,
Import-Assistent —, und der Kiosk bringt `AdminLoginForm.tsx`, `SetupForm.tsx`, `BorrowerInput.tsx`
mit; `Form.Item`, `Input.TextArea`, `Descriptions.Item` und `Typography.Title` sind die Kandidaten.
Entlastend ist nur, dass `Card`, `Table`, `Tag`, `Statistic`, `Result` und `Progress` sicher sind — und
genau die tragen die Tabellenflächen. ⚠️ **Die Stellenzahl ist nicht gemessen** (anders als bei Falle 9,
wo 31 gezählt sind), es gibt hier also keine Sollzahl, gegen die man prüfen könnte.

Beide Fallen sind ein Laufzeit-500 „auf genau der Seite, die niemand im e2e anfährt". Daraus die
erste Regel, und sie ist die billigste des ganzen Kapitels:

> **Jede Seite**, die das Kapitel Verwaltungsoberfläche oder das Kapitel Kiosk baut, wird in
> `e2e/radio-tabellen.spec.ts` bzw. der zuständigen Spec-Datei **einmal echt abgerufen**, mit
> `expect(antwort.status()).toBe(200)`. Nicht `toBeVisible()`, nicht „irgendwas ist da" — der
> Statuscode, weil ein 500 keinen Inhalt hat und ein `toBeVisible()` dann in sein Zeitbudget läuft
> und sich als Timeout meldet, also nach etwas ganz anderem klingt (`CLAUDE.md:82-85`).

Ein Modul-Rundgang, der jede Seite genau einmal mit Statusprüfung anfährt, ist die einzige Absicherung
gegen Falle 1 und 7, die nicht von einer Stellenzählung abhängt, die niemand hat.

### 8.4.2.1 Je Tabelle zusätzlich eine Zelle — Falle 9

Falle 9 ist der teuerste Posten des Ports: `<Table columns={[{ render: fn }]}>` geht **nicht** direkt
aus einer Server Component (`CLAUDE.md:52-70`), und `radio-admin` trägt **31** `render`-Funktionen —
`radio-admin/client/src/features/devices/deviceColumns.tsx` **15**, `features/loans/LoanList.tsx` 5,
`features/settings/ApiTokensPage.tsx` 5, `features/settings/SoftwareVersionsPage.tsx` 4,
`features/import/ImportWizard.tsx` 2.

⚠️ **Die beiden Fünferlisten sind nicht dieselben, und daraus folgt eine Bauauflage.**
`deviceColumns.tsx` trägt 15 `render`-Funktionen und **kein** `<Table`; `DeviceList.tsx` trägt ein
`<Table` und **kein** `render:`. **Zusage an Kapitel Verwaltungsoberfläche:** beide gehören zusammen
in **EINE** `"use client"`-Insel. Werden sie getrennt portiert, wandern die 15 `render`-Funktionen
weiterhin als Prop über die RSC-Grenze und ergeben genau
`Error: Functions cannot be passed directly to Client Components` (`CLAUDE.md:55-57`).

**Die Regel, nicht die Liste** — weil dieses Kapitel nicht entscheidet, welche Flächen entstehen:

> Jede Tabellenfläche schuldet **über** den Seitenabruf aus §8.4.2 hinaus **eine Zusicherung auf eine
> Zelle, die aus einer `render`-Funktion entsteht**. Eine Tabellenfläche ohne diese Zelle gilt als
> nicht abgenommen — der Statuscode allein deckt Falle 9 **nicht**: eine `"use client"`-Insel, die
> ihre Daten korrekt bekommt, aber die Formatierung verloren hat, antwortet mit 200.

Sicher sind heute die Geräteliste (15 `render`), die Leihliste und die Software-Versionen. **Nicht**
zugesagt werden Zellen für `api_tokens` und den Import-Assistenten: Entscheidung 13 lässt `api_tokens`
nur wandern, „soweit Historie es verlangt", und ob es dafür eine Fläche gibt, entscheidet das Kapitel
Verwaltungsoberfläche. Eine hier versprochene Fläche, die nie entsteht, wäre ein Testplan, der beim
ersten Lesen falsch ist.

### 8.4.2.2 Die Höhe einer Zeile — Falle 8, die dieses Kapitel selbst scharf macht

§8.4.4 entscheidet, dass `/admin` in `FullShell` läuft. Damit ist neben Falle 12 auch **Falle 8**
berührt (`CLAUDE.md:45-51`): `antd/es/layout/style/index.js` setzt auf `.ant-layout-header` ein
`lineHeight` in Kopfzeilenhöhe (hier **64 px**), und die Kopfzeile vererbt das an **jedes** Kind —
`position: absolute` ändert den enthaltenden Block, **nicht** die Vererbungskette. Gemessen wurden 82 px
je Eintrag im Panel des App-Umschalters und 76 px am Auslöser, in einer 64 px hohen Kopfzeile.

**Kein anderes Tor kann das sehen, und der Grund ist zwingend:** antd spritzt die Regel zur Laufzeit
über cssinjs ein, sie steht in **keiner Datei des Repos**, und jsdom rechnet keine Zeilenboxen. Ein
Quelltext-Scan hat nichts zu greifen, ein Vitest kennt die Zahl nicht — nur ein echter Browser.

**Zusage: `e2e/radio-verwaltung.spec.ts` prüft in einem eigenen `it` die Höhe.** Verbindlich als
Verhältnis, nicht als Zahl: der `boundingBox().height` eines Eintrags im App-Umschalter-Panel ist
**kleiner als** die Höhe der Kopfzeile. Eine absolute Erwartung wie „44" wäre bei jeder Token-Änderung
rot ohne Produktfehler, also genau die Sorte Test, die weggekommentiert wird.
**Mutation, die ohne diesen Test grün bliebe:** `line-height: normal` am **gemeinsamen Vorfahren**
entfernen und stattdessen an jedes Kind einzeln schreiben — ein Kind vergisst man, und dieses eine ist
82 px hoch, während alle anderen stimmen.

### 8.4.3 Der Host-Riegel gegen EINEN `baseURL`

Playwright fährt gegen `http://portal.localtest.me:3100` (`playwright.config.ts:64`). Der Fall
„fremder Suite-Host" ist deshalb **nur** darstellbar, wenn die E2E-Konfiguration einen zweiten Host
mitführt und der Test dorthin **absolut** navigiert. Er wird **nicht neu eingeführt**:
`playwright.config.ts:155` wartet heute schon auf `http://feedback.localtest.me:3100/login`, und
`feedback` ist zugleich die schärfere Probe, weil `moduleForHost` dort tatsächlich ein Modul liefert
— ein Nicht-Modul-Host fiele über den Portal-Fallback heraus und bewiese weniger.

`e2e/radio-hosts.spec.ts` fährt eine **Schleife**, keine zwei Stichproben, weil Route Handler kein
Layout haben und die Sperre sie über kein Group-Layout erreicht. Geprüft wird über `fremdUrl(pfad)`:

| Abruf über `fremdUrl(…)` | Zusage |
|---|---|
| `/m/radio/` (Ausleihe-Wurzel) | 404 |
| die Einlöse-Route des Kapitels Zugang, mit **gültigem** Code | **404 vor jeder Wirkung** — und in `radio.db` trägt die Zeile dieses Codes danach **unverändert kein Nutzungsdatum**. Das ist die Zeile, die Falle 61 bezahlt, und sie wird mit `better-sqlite3` direkt gegen die Datei geprüft, nicht über die Oberfläche |
| der Abmelde-Route-Handler | 404, und das Cookie der laufenden Sitzung ist danach **unverändert** vorhanden |
| `/m/radio/admin` | 404 |
| `/m/radio/manifest.webmanifest` und die Icon-Handler | 404 |
| dieselben fünf Pfade über `radioUrl(…)` | 200 bzw. 303 — die Gegenprobe, ohne die die Schleife auch mit einem Riegel grün wäre, der **alles** verwirft |

⚠️ **Die Datenwirkung ist hier eine andere als bei `lagerbuch`, und die Analyse trägt an dieser
Stelle einen überholten Träger.** Sie begründet die Datenwirkung mit dem Enrollment („verbrennt den
Einmal-Code"); Entscheidung 5 hat Enrollment gestrichen — es gibt **kein Gerät und kein
Geräte-Enrollment**. Der verbleibende Träger ist die Einlösung nach Entscheidung 6: sie prägt eine
Sitzung und stempelt das Nutzungsdatum der Codezeile. Ein Treffer auf dem falschen Host legte das
Sitzungscookie auf der **falschen Herkunft** ab und schriebe dabei in `radio.db` — eine zweite
funktionierende Herkunft des Moduls, die in keinem Runbook steht. Der Code selbst bleibt einlösbar
(er ist nicht verbrauchbar), der Schaden ist die zweite Herkunft, nicht der verlorene Code.

⚠️ **Prüflücke, benannt statt übersehen:** diese Schleife prüft „**ein** fremder Suite-Host ist
dicht", nicht „**alle** sind es". Der Beweis für „alle" ist die Bauform des Prädikats (§8.2.3) plus
der Scan gegen einen `prodHostsFor`-Vergleich (§8.3). Ohne den zweiten Host in der Konfiguration ist
die Zeile mit der Datenwirkung **nicht durchführbar**, und dann trägt §8.2.3 die Aussage allein — das
ist ausdrücklich zu wenig.

### 8.4.4 Die drei Testfallen aus `CLAUDE.md` — und was sie für diesen Plan bedeuten

Fallen 10, 11 und 12 sind **Testfallen, keine Produktionsfallen** (`CLAUDE.md:112-114`). Sie gehören
zur Familie „ein e2e-Test misst etwas anderes, als sein Name sagt" — und das ist die teuerste Sorte,
weil sie rote Läufe **ohne** Produktfehler erzeugt und dann wegkommentiert wird.

**Falle 10 — Warmlauf-GET vor dem ersten POST (`CLAUDE.md:71-85`): berührt und scharf.** Ein POST auf
einen Route Handler kann während dessen Erstkompilierung abgebrochen werden; `net::ERR_ABORTED`,
`canceled: true`, **nie eine Antwort**. Das Symptombild führt in die Irre: keine Datenbankzeile, keine
Protokollzeile, der Test läuft in sein Zeitbudget und meldet etwas ganz anderes — isoliert grün, im
Verbund rot.

⚠️ **Der Träger, den die Analyse nennt, ist überholt:** sie begründet „scharf" mit dem
Enrollment-Handler, und Entscheidung 5 hat ihn gestrichen. Die **verbleibenden** Träger, alle drei
nach Entscheidung 6 zwingend Route Handler bzw. POST-Ziele:

1. **Der Abmelde-Route-Handler.** Er *muss* ein Route Handler sein — `cookies().delete()` wirft in
   einer Server Component (`src/app/m/lagerbuch/_lib/helferZugang.ts:121-126` schreibt die Messung
   aus, samt Fundstelle `next/dist/server/web/spec-extension/adapters/request-cookies.js:53`, die den
   Satz „Cookies can only be modified in a Server Action or Route Handler" wörtlich trägt). Er hat
   kein Layout und wird im Lauf als **erster** POST-artiger Treffer erreicht.
2. **Die Einlöse-Route am Gate.** Erster Treffer im ganzen Lauf, und sie hat Datenwirkung.
3. **Die Ausleih- und Rückgabe-Actions.** Server Actions sind POSTs auf eine Route, die vorher nie
   getroffen wurde.

**Verbindlich daraus, für jede der drei Stellen:** (i) ein **Warmlauf-GET auf dieselbe Route** vor dem
ersten echten POST — Vorbild `e2e/files-fileshare.spec.ts`, das dieselbe Falle für
`/api/download/[id]` längst kennt; (ii) **jede** ausgelöste Anfrage wird mit `page.waitForResponse`
**auf ihre Antwort** geprüft, nicht auf eine spätere Zustandsänderung. Ohne (ii) läuft jede abgelehnte
Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget und meldet sich als etwas anderes.

**Falle 11 — `page.mouse` statt `dragTo()` (`CLAUDE.md:86-92`): nach Entscheidung dieses Kapitels
nicht berührt.** `locator.dragTo()` löst kein zuverlässiges natives `dragstart` aus; gemessen lief ein
Zug reproduzierbar in den vollen 90-Sekunden-Timeout, ohne dass je ein `drop` feuerte. Heute ist die
Falle in **keinem** der beiden Alt-Frontends berührt (`rg -ln "dragTo|onDragStart|draggable|dnd-kit|react-beautiful"`
über beide liefert 0 Treffer), aber `radio-admin/server/src/routes/softwareVersions.ts:40` bietet
`PATCH /software-versions/order`, also eine Sortierung, die sich als Ziehen bauen ließe.

**Entscheidung, damit die Falle nicht offenbleibt — Zusage an Kapitel Verwaltungsoberfläche: die
Reihenfolge der Software-Versionen wird mit Hoch/Runter-Knöpfen gebaut, nicht mit Ziehen.** Drei
Gründe, alle belegt: das Ziehen wäre die **einzige** Stelle im Modul, die Falle 11 scharf macht,
ohne dass eine Portierungspflicht es verlangt (die Alt-App zieht nicht); zwei Knöpfe sind auf einem
Telefon bedienbar, ein Zug ist es kaum, und `FullShell`-Inhalte tragen ohnehin `controlHeight: 44` als
WCAG-2.5.5-AAA-Ziel (`CLAUDE.md:19-22`); und die Sortierung wird selten benutzt.
**Falls das Kapitel Verwaltungsoberfläche sich dennoch für Ziehen entscheidet**, gilt ohne weitere
Diskussion: Prüfung über `page.mouse.move`/`down`/mehrfach `move` mit Pausen/`up`, **nie** über
`locator.dragTo()`.

**Falle 12 — `klickeWennRuhig` (`CLAUDE.md:94-110`): berührt, und zwar genau auf einem Ast.** Ein
`.click()` auf einen echten Anker navigiert nicht, wenn die Hülle zwischen `mousedown` und `mouseup`
umbricht; Playwright meldet den Klick als gelungen, der Knoten ist ein `<a href>`, er trägt danach
sogar den Fokus — und im Netzwerkteil steht für das Ziel **kein einziger** Aufruf. Auslöser ist
`SessionProvider`, der `/api/auth/session` nachholt; mit der Sitzung wechselt die Navigation von der
schmalen Platzhalter- auf die volle Spalte und der Inhalt rutscht ~240 px hoch. **Kein größeres
Zeitbudget und keine Wiederholung heilt das** — gewartet wird auf eine Navigation, die nie angestoßen
wurde. Lokal unsichtbar (warmes `.next`, 20 von 20 Mal grün).

**Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk, damit die Falle einen benannten Ort
hat:** `/admin` läuft in `FullShell` mit `SessionProvider`, die Ausleihe an `/` läuft **ohne Shell**
(sonst erbte sie `controlHeight: 44` statt 56/72). Der Registry-Wert entscheidet das nicht — bei
`lagerbuch` steht ein Wert in der Registry, und `src/app/m/lagerbuch/layout.tsx` rendert **gar keine**
Shell; ein Modul mit **zwei** Regimen auf einem Host ist durch **ein** Feld ohnehin nicht
beschreibbar. ⚠️ **Diese Entscheidung macht zwei Fallen scharf, nicht eine** — Falle 12 hier und
Falle 8 in §8.4.2.2; wer nur die eine bedenkt, hat die Hälfte. Daraus folgt für den Testplan:

* **Jeder Klick auf einen Navigations-Anker unter `/admin` läuft über `klickeWennRuhig`** aus
  `e2e/fixtures.ts:93` — nicht über `locator.click()`. Die Funktion klickt erst, wenn der Kasten des
  Elements **dreimal** in Folge stillsteht (drei, nicht zwei: der Sprung fällt in ein Fenster von
  ~200 ms, zwei Proben im Abstand von 100 ms könnten beide davor liegen).
* **Auf dem Ausleih-Ast wird `klickeWennRuhig` NICHT verwendet.** Dort gibt es keine `SessionProvider`-
  Hülle, also keinen Umbruch, und ein vorsorgliches Ruhewarten verdeckte einen echten Umbruch, statt
  ihn zu melden. Diese Zeile ist eine Zusage in beide Richtungen.
* **Jeder Login im Lauf geht über `devLogin` aus `e2e/fixtures.ts:3`**, mit `RADIO_ADMIN_GRUPPE` aus
  `e2e/helpers/radio.ts` — nie mit einem Literal. Das 45-Sekunden-Budget dort ist gemessen (13,7 s auf
  kaltem `.next` unter künstlicher Last; 0,3 s warm) und wird nicht gekürzt.

## 8.5 Was KEIN Test findet — die Liste, die ins Runbook wandert

Diese Liste ist die Gegenprobe zum ganzen Kapitel: alles, was nur ein echter Abruf gegen einen echten
Host, ein echter Dump, ein echtes Gerät oder ein Blatt Papier zeigt. Sie geht vollständig als
**Übergabe an Spec 2 (Runbook)**; jede Zeile nennt den Handgriff, der sie ersetzt.

| Befund | Warum kein Tor es sieht | Der Handgriff im Runbook |
|---|---|---|
| **Es gibt kein Parallelfenster.** Der Alt-Kiosk läuft **bereits** unter `radio.iuk-ue.de` (Entscheidung 3), der Origin bleibt zeichengleich | Alt-Kiosk und Suite können denselben Host nicht gleichzeitig halten. Kein Test kann einen Zustand prüfen, den es nicht gibt | Der Rückweg ist **„Router zurück"**, kein Rückschalten der Daten. Die Rollback-Frist und der Verlustumfang gehören ausgeschrieben ins Runbook |
| **Der pfaderhaltende `redirectRegex` von `radio-admin.iuk-ue.de` auf `radio.iuk-ue.de/admin`** (Entscheidung 2) | Er lebt **auf dem Server**, nicht im Repo. Kein Test des Repos fasst Traefik-Labels an; der Fehlfall ist eine funktionierende Seite mit falschem Inhalt | Eine Zeile im Runbook. ⚠️ **302, nicht 301** — ein 301 liegt im Cache jedes Tablets und macht den Rollback praktisch unmöglich. ⚠️ Der DNS-Eintrag `radio-admin.iuk-ue.de` **bleibt**, solange der Redirect steht: er ist die Abhängigkeit des Redirects, kein Abbau-Posten. ⚠️ Und der Alt-Host darf **nicht** in `SUITE_TRAEFIK_RULE` stehen — dann erreicht er den Container, kein `SUITE_HOST_*` beansprucht ihn, und `moduleForHost` liefert **portal** |
| **`/api/health/radio` antwortet `ok` gegen eine frisch angelegte, LEERE `radio.db`** | Der Healthcheck **ist** das Tor und ist grün. `checkModuleHealth` öffnet die Datei und führt `SELECT 1` aus; `src/core/db/index.ts:14` legt das Verzeichnis bei Bedarf **neu** an (`if (!existsSync(dir)) mkdirSync(dir, { recursive: true });`), und better-sqlite3 legt die Datei an, wenn sie fehlt. Ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt eine nagelneue leere Datenbank, auf der `SELECT 1` klaglos gelingt | Die Freigabe zählt: die **sechs** `COUNT(*)` aus Pflicht 4 (`devices`, `software_versions`, `api_tokens`, `users`, `device_events`, `loans`) gegen die Alt-Werte, **nie** `status:"ok"`. Und jeder Runbook-Schritt nennt `/api/health/radio`, **nie** `/api/health` — letzteres ist zwei Zeilen ohne Modulbezug (`src/app/api/health/[modul]/route.ts:12-17` begründet, warum nur der `[modul]`-Handler taugt) |
| **Der alte Service Worker liegt nach dem Umschwenk unter derselben Adresse** | Ein SW mit falschem Scope oder aus dem Cache liefert HTTP 200 mit **veraltetem** Inhalt. Kein Build-Schritt, kein Test, kein Healthcheck sieht das | ⚠️ **Hier verschärft Entscheidung 3 die Analyse:** dort stand „nur wenn der Alt-Kiosk bereits `radio.iuk-ue.de` bedient" — er tut es. Damit ist „alte Registrierung austragen" **nicht bedingt, sondern Pflicht**: `self.registration.unregister()` im Ersatz-SW **und** je Gerät einmal Speicher löschen, im selben Handgriff. Manifest, SW und Icons liegen als Route Handler **unter** `src/app/m/radio/` — nie global, sonst bewirbt jeder Suite-Host eine radio-PWA |
| **Ein konsistenter Mapping-Fehler ist paritätsgrün** | Strukturell: `scripts/import/parity.ts:43-56` vergleicht Zeilen-Hashes, und **beide Arme leiten aus derselben Funktion** ab (`scripts/import/portal.ts:72-75`) | Feldweise Stichproben gegen die Alt-Anwendung, zeilengenau, für die vier verwechselbaren Paare: `issi`↔`tei`, `created_at`↔`updated_at`↔`last_updated_at`, `snapshot_call_sign`↔`borrower_name`, `alamos_integrated`↔`loanable`; dazu `serial_number`↔`hiorg_id`↔`opta`. Plus die fünf Abfragen **vor** dem Import, darunter `SELECT COUNT(*) FROM software_versions WHERE is_target = 1` (**muss genau 1 sein**) und `SELECT MIN(created_at), MAX(created_at) FROM devices` (dreizehnstellig = Millisekunden) |
| **Gedruckte QR-Kärtchen verlieren still ihre Funktion** | Entscheidung 8: der heutige QR-Code trägt den geteilten API-Token base64-kodiert als URL-Parameter (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), ohne Ablauf und ohne Widerruf. Nichts im Repo weiß, wie viele Kärtchen im Umlauf sind | **Verhaltensänderung mit Ankündigungspflicht.** Zusätzlich: die ausgedruckten Codes zeigen dauerhaft auf den Host des **erzeugenden Browsers**, weil die URL aus `window.location.origin` entsteht und `VITE_PUBLIC_APP_URL` im Repository von **nichts** gesetzt wird (`AppQRCode.tsx:8`) |
| **Ob gedruckte Aufsteller im Umlauf sind** ⚠️ **zu bestätigen** | Papier ist für jedes Tor unsichtbar | Betreiberfrage vor dem Cutover. Von der Antwort hängt ab, ob der Umstieg eine Neuausgabe braucht oder ob die neuen Codes nur digital verteilt werden |
| **Die Sitzungsdauer** ⚠️ **zu bestätigen** (Vorschlag 12 h wie `lagerbuch`) | Kein Test wartet 12 Stunden; die Zahl ist eine Betriebsentscheidung, keine Rechnung | Eine `.env`-Zeile. Der Unit-Test prüft die **Grenze relativ zum konfigurierten Wert** (§8.2.2) |
| **Ob der Benutzername beim Zugang über die Suite vorausgefüllt wird** ⚠️ **zu bestätigen** | Optional nach Entscheidung 7; die Ausleihe bleibt in der Sache anonym | Betreiberfrage. Der DOM-Test prüft die **Überschreibbarkeit**, nicht die Existenz der Vorbelegung (§8.2.7) |
| **„Betroffen < 100 Leihen"** ist eine **Schätzung, keine Zählung** (Entscheidung 12) | Die lokale `radio-admin/data/data.sqlite` ist leer und führt `loans` überhaupt nicht — als Prod-Beleg unbrauchbar | `SELECT COUNT(*) FROM loans WHERE returned_at IS NOT NULL AND returned_at < <grenze>;` gegen den echten Dump, **vor** dem ersten Retention-Lauf |
| **Der produktive Wert von `SUITE_ADMIN_GROUP_RADIO`** | Betreiberentscheidung; E2E fährt den Registry-Vorgabewert. ⚠️ Ein falscher Wert macht den Lauf **grün** — er bezeugt dann den 404 und sieht wie ein bestandener Test aus | Eine `.env`-Zeile beim Cutover, und die Gegenprobe „ein Admin sieht die Verwaltung wirklich" ist ein **Handgriff**, kein Test |
| **Die CWE-348-Umstellung in `src/core/ratelimit.ts`** | **Nicht Teil dieser Spec** — eigener Suite-Posten. Hier nur als **Voraussetzung** benannt: solange sie offen ist, lässt sich die Absenderbremse am Einlöse-Gate nicht wahrheitsgemäß prüfen, weil die Absenderadresse selbst nicht vertrauenswürdig aufgelöst wird | Reihenfolge im Plan: die Umstellung geht dem Gate-Rate-Limit voraus. Ein Test, der heute darauf aufsetzt, wäre grün und bedeutungslos |

Ebenfalls ausdrücklich **nicht** Teil dieses Kapitels und nur benannt: `TZ=Europe/Berlin` setzen, das
Entfernen des Suite-Admin-Kurzschlusses in `src/core/groups.ts`, das suiteweite Gating von `/m/*`.
Alle drei sind eigene Suite-Posten. Für den Testplan folgt daraus nur eines: **kein Test dieses Moduls
darf auf einer dieser drei Änderungen aufsetzen** — sonst ist er heute grün aus dem falschen Grund
und morgen rot ohne Produktfehler.

## 8.6 Die Mutationsprobe als Verfahren

Die Spalte „Mutation, die ohne den Test grün bliebe" ist keine Prosa, sondern eine Arbeitsanweisung.
Im Projekt sind mehrfach grüne, leere Suiten aufgefallen; das Verfahren dagegen ist billig:

1. **Nach dem Grünwerden**, nicht davor: für jedes Pflichtstück wird **jede** in seiner Zeile genannte
   Mutation einzeln in den Arbeitsbaum gelegt, `pnpm vitest run <datei>` bzw.
   `pnpm exec playwright test <spec>` gefahren, das **rote** Ergebnis notiert und die Mutation
   verworfen (`git checkout -- <datei>`). Nichts davon wird committet.
2. **Ein Test, der eine genannte Mutation überlebt, wird gelöscht oder neu geschrieben** — nicht
   ergänzt. Ein ergänzter vakuöser Test bleibt vakuös und trägt danach zwei Namen.
3. **Die Probe ist im Plan ein eigener Arbeitsschritt je Pflichtstück**, mit dem Ergebnis in der
   Aufgabenbeschreibung. Sie steht **nicht** in der CI: sie ist einmalig und beweist die Güte des
   Tests, nicht die des Produkts.

**Die Pflichtstücke, die diese Probe zwingend durchlaufen** — sieben, und für jedes ist die
schlimmste Mutation oben ausgeschrieben:

| Pflichtstück | Ort | Die Mutation, die am teuersten wäre |
|---|---|---|
| Zeitstempel-Abbildung | §8.2.1 | `?? 0` für `returned_at` — aus aktiven Leihen werden gelöschte |
| Code-Einlöser | §8.2.2 | DB-Recheck aus dem Lesepfad entfernen — ein gesperrter Code liest weiter |
| Host-Riegel, drei Formen | §8.2.3 | der „kein Prod-Host → durchlassen"-Zweig — die Sperre schaltet sich vor dem Cutover selbst ab |
| Pfad-Riegel `/admin` | §8.2.4 | `isModuleAdmin` — jeder Suite-Betreiber verwaltet mit, und die E2E bleibt grün |
| Retention-Auswahl | §8.2.5 | `IS NOT NULL` streichen — jede laufende Ausleihe verschwindet |
| Ausfall-Puffer | §8.2.6 | den Puffer-Summanden entfernen — der naive Port, grün in jedem Test |
| Guard-Scan der Actions | §8.3 | eine Action ohne Guard hinzufügen; der Scan muss rot werden, nicht die Ausnahmeliste wachsen |

## 8.7 Zusagen dieses Kapitels an andere Kapitel

Vollständig, damit die Zusammenführung sie gegeneinander prüfen kann. Die Nummern der Teile stehen
erst bei der Zusammenführung fest; die Kapitel werden hier deshalb bei ihrem **Gegenstand** genannt —
eine geratene Nummer führte die Gegenprüfung aktiv in die Irre, ein Gegenstand nicht.

1. **Zusage an Kapitel Zugang:** die drei Ablehnungsgründe sind **eine** exportierte, benannte
   Literal-Union `ZugangGrund = "unbekannt" | "gesperrt" | "abgelaufen"` — kein `boolean`, kein Wurf,
   keine Zeichenkette. Vorbild `src/app/m/lagerbuch/_lib/helferZugang.ts:63`. Ohne sie ist §8.2.2
   nicht durchführbar.
2. **Zusage an Kapitel Zugang:** die Abmeldung ist ein **Route Handler**, und der Host-Riegel steht in
   `requireKioskZugang`, `requireKioskSchreibend` und `requireRadioAdmin` **innen**, als erste
   Anweisung. §8.2.4 und §8.3 prüfen genau das.
3. **Zusage an Kapitel Datenmodell und Import:** die sieben Signaturen aus §8.2.1 sind exportiert und
   **rein** (Zeit als Parameter, keine Uhr, keine Datenbank), und `pruefeMs` wirft mit Feldnamen.
4. **Zusage an Kapitel Datenmodell und Import:** die Retention-Auswahl ist eine reine Funktion,
   getrennt von der Ausführung, und **nichts am Boot-Pfad** ruft sie (§8.2.5, Scan in §8.3).
5. **Zusage an Kapitel Verwaltungsoberfläche:** `deviceColumns.tsx` und `DeviceList.tsx` werden zu
   **EINER** `"use client"`-Insel — sonst wandern die 15 `render`-Funktionen weiterhin als Prop über
   die RSC-Grenze (§8.4.2.1).
6. **Zusage an Kapitel Verwaltungsoberfläche:** die Reihenfolge der Software-Versionen wird mit
   Hoch/Runter-Knöpfen gebaut, nicht mit Ziehen — damit bleibt Falle 11 unberührt (§8.4.4).
7. **Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk:** `/admin` läuft in `FullShell` mit
   `SessionProvider` — damit sind **Falle 12** (→ `klickeWennRuhig`) und **Falle 8** (→ die
   Höhenprüfung aus §8.4.2.2, als Verhältnis) scharf. Die Ausleihe an `/` läuft **ohne Shell**: Falle
   12 unberührt (**kein** `klickeWennRuhig`), Falle 8 unberührt (keine Kopfzeile), und sie behält
   56/72 statt `controlHeight: 44`.
8. **Zusage an Kapitel Verwaltungsoberfläche und Kapitel Kiosk:** **jede** Seite schuldet einen echten
   Abruf mit `expect(antwort.status()).toBe(200)` (Fallen 1 und 7), jede Tabellenfläche zusätzlich eine
   Zelle aus einer `render`-Funktion (Falle 9) — §8.4.2 und §8.4.2.1.
9. **Zusage an Kapitel Kiosk:** der Ausfall-Puffer von fünf Minuten ist eine **Konstante im
   Modulcode** mit eigenem Test, keine Eigenschaft eines `fetch` (§8.2.6).
10. **Zusage an Kapitel Betrieb und Cutover / Spec 2:** die Tabelle aus §8.5 wandert vollständig ins
   Runbook, Zeile für Zeile, mit dem jeweils genannten Handgriff.
11. **Zusage an alle Kapitel:** `e2e/helpers/radio.ts` ist die **eine** Quelle für Host, Fremdhost,
    Admin-Gruppe, Port und die zwei Testcodes. Kein Literal daneben — der Fehlerfall ist ein grüner
    Lauf, nicht ein roter.

---

# 9. Uebergabe an Spec 2 — Import, Cutover, Abbau

Diese Spec baut das Modul. Sie fuehrt den Cutover **nicht** durch. Was hier steht, ist die
verbindliche Uebergabeliste an Spec 2 (das Cutover-Runbook `docs/runbooks/radio-cutover.md`).

⚠️ **Dieses Kapitel ist vollstaendig und woertlich in das Cutover-Runbook zu uebernehmen — nicht
zusammenfassen, nicht verlinken.** Begruendung aus dem Vorbild `docs/runbooks/lagerbuch-cutover.md:390-393`:
das Runbook wird unter Zeitdruck gelesen, und ein Verweis in eine mehrhundert-Kilobyte-Spec ist unter
Zeitdruck kein Verweis. **Wo Spec 2 von dieser Liste abweicht, ist es ein Fehler in Spec 2, nicht
hier.**

---

## 9.1 Was Spec 2 aus Spec 1 erbt

| Festlegung | Wert | Folge fuer Spec 2 |
|---|---|---|
| **Modul-Key** | `radio` | DB-Datei `radio.db` unter `DATA_DIR` — **eine** Datei, kein zweiter Store. Env-Namen daraus abgeleitet: `SUITE_HOST_RADIO`, `SUITE_ADMIN_GROUP_RADIO` (`src/core/hosts.ts:29-30` bildet den Namen als `SUITE_HOST_` + Key in Grossbuchstaben). `radio.db` faellt **ohne jede Skriptaenderung** ins Backup: `scripts/backup.sh:25-27` sammelt `"$DATA_DIR"/*.db` per nullglob und sichert jede Datei per `sqlite3 .backup` (`:41-43`) |
| **`SUITE_ADMIN_GROUP_RADIO`** | **Pflicht zum Cutover, gesetzt und NICHT leer** | ⚠️ **Der Fehlfall ist stumm und trifft alle Verwaltenden auf einmal.** Eine leere Liste gewaehrt **nichts**, und weil `radio` den `isModuleAdmin`-Kurzschluss modulintern ignoriert (wie `feedback` und `lagerbuch`, Entscheidung 9), faengt der Suite-Admin niemanden auf: die Folge ist ein stummes 404 fuer **jede** Verwaltungsseite — kein Fehler, kein roter Test, kein Eintrag im Protokoll. Wortgleiches Vorbild samt Begruendung: `.env.example:241-244` fuer `lagerbuch`. ⚠️ Der **Gruppenname** ist eine Betreiberauskunft (bei `lagerbuch` `lagerbuch_nutzer`, `.env.example:244`) und steht als U10 in §9.8. Zweite Folge, die im Cutover-Fenster teuer ist: ein Gruppenentzug oder eine frisch angelegte Gruppe wirkt mit bis zu **einer Stunde** Verzug, weil Gruppen im JWT nur beim Login und beim Token-Refresh nachgezogen werden (`CLAUDE.md:151-156`) — wer die Gruppe am Cutover-Abend anlegt, prueft die Verwaltung **nach** einer neuen Anmeldung, nicht mit der offenen Sitzung |
| **Ein Fenster, zwei Alt-Apps** | radio-admin **und** radio-inventar ziehen im **selben** Umschwenk um | ⚠️ **Es gibt keinen Zwischenzustand, in dem radio-admin schon in der Suite liegt und der Kiosk noch per HTTP mit ihm spricht.** Der Kiosk ist heute Konsument der sechs `/v1`-Routen von radio-admin (`radio-admin/server/src/routes/loanApi.ts`); die HTTP-Grenze faellt erst, wenn dieselben Aufrufe Drizzle-Aufrufe **im selben Prozess** sind (Entscheidung 15). Fuer Spec 2 heisst das: **ein** Cutover-Abend, **eine** Freeze, **eine** Snapshot-Runde ueber beide Bestaende — kein „erst die Verwaltung, naechste Woche der Kiosk". Wer zwei Abende plant, plant ein Fenster, in dem der Kiosk gegen einen abgeschalteten Server spricht. Die Fachlichkeit, die dabei mitwandert (der Ausfall-Puffer `STALE_GRACE_MS = 5 * 60_000`, `radio-inventar/apps/backend/src/modules/radio-admin/radio-admin.service.ts:48`), gehoert dem Implementierungs-Kapitel, nicht dem Runbook — hier steht nur, dass sie **vor** dem Cutover gebaut sein muss |
| **`SUITE_ACCESS_GROUP_RADIO`** | wird **NICHT** gesetzt | Die Ausleihe ist anonym erreichbar (`requiresAuth: false`). Eine gesetzte Zugriffsgruppe waere eine zweite, widerspruechliche Wahrheit neben `requiresAuth`. Vorbild der Aufschreibung: `.env.example:246-248` fuer `lagerbuch` |
| **Migrationsverzeichnis** | `src/app/m/radio/_db/migrations` | Dateinamen kommen aus `meta/_journal.json` und werden **nicht** erfunden. ⚠️ **Das Dreieck ist dreiteilig** (`CLAUDE.md:127-131`): Verzeichnis + Eintrag in `MODULE_MIGRATIONS` (`src/core/bootstrap.ts:20`) + **eine `COPY`-Zeile im `Dockerfile`**. Gemessen fuehrt `Dockerfile:51-56` je Modul eine eigene Zeile (portal, qr, feedback, files, lagerbuch, aufgaben), dazu `:58` fuer `core/konto` — es gibt **kein** Sammel-`COPY`. Fehlt die Zeile, ist lokal alles gruen und der Container findet zur Laufzeit keine Migrationen |
| **Prod-Domain und ihre Herkunft** | `radio.iuk-ue.de`, **ausschliesslich** ueber `SUITE_HOST_RADIO`; Registry `prodHosts: []` | Cutover = **eine** `.env`-Zeile plus die Erweiterung von `SUITE_TRAEFIK_RULE` (§9.2). ⚠️ **Rollback ist die LEERE Zeile, nicht die geloeschte:** `SUITE_HOST_RADIO=` ergibt `[]`, das Entfernen der Variable ergibt `null` und damit den Code-Default aus der Registry (`src/core/hosts.ts:39-46`, Kommentar `:33-38` schreibt genau diesen Zweck aus) |
| **Alt-Host der Verwaltung** | `radio-admin.iuk-ue.de` → pfaderhaltender 302 auf `radio.iuk-ue.de/admin` | Lebt als Traefik-Router **auf dem Server**, nicht im Repo. Vollstaendig in §9.2, inklusive der Antwort auf „gehoert der Host in `SUITE_TRAEFIK_RULE`?" (**nein, ausdruecklich nicht**) |
| **Oeffentliche Pfadformen** | `/` = Ausleihen (anonym), `/admin/*` = Verwaltung (Suite-SSO + Modul-Admin-Gruppe) | Beide Rollen liegen auf **einem** Host; die Rolle steckt im **Pfad**. Der Rewrite auf `/m/radio<rest>` macht das ohne Aenderung. ⚠️ Daraus folgt die Riegel-Bauform: `requiresAuth: false` erbt **kein** Middleware-Gating fuer `/admin` — jede Verwaltungsseite, jede Server Action und jeder Route Handler ruft den Riegel selbst als erste Anweisung (Falle 61; Bauform im Zugangs-Kapitel) |
| **Einfuegereihenfolge nach Fremdschluesseln** | (1) `users`, `software_versions`, `api_tokens` (untereinander frei) → (2) `devices` → (3) `device_events` → (4) `loans` | Es gibt genau **einen** FK: `device_events.device_id → devices.id ON DELETE CASCADE` (`radio-admin/server/src/db/schema.ts:88-90`, die einzige `FOREIGN KEY`-Zeile aller fuenf Migrationen). ⚠️ **Die Kante ist nicht dekorativ:** `radio-admin/server/src/db/index.ts:28` und `iuk-suite/src/core/db/index.ts:19` setzen beide `sqlite.pragma("foreign_keys = ON")` — ein `device_events`-Insert vor dem Geraet bricht hart ab. `loans.device_id` ist Text **ohne** FK und bleibt es (`schema.ts:106-110` begruendet es woertlich: zurueckgegebene Leihen muessen eine spaetere Geraeteloeschung ueberleben) |
| **Spaltenlisten** | namentlich, nie `SELECT *` | Regel aus `docs/runbooks/lagerbuch-cutover.md:14` („Der Import in `tokens` nennt seine Spalten — immer"). Die vollstaendigen 61 Spalten ueber 6 Tabellen stehen in `docs/radio-portierung-analyse.md:677-696` |
| **IDs** | 1:1 uebernehmbar | Alle Primaerschluessel sind `text` aus `newId()` bzw. der OIDC-`sub` bei `users` (`radio-admin/server/src/db/schema.ts:79`). ⚠️ **Es gibt keine SQL-Defaults fuer `id` und keine `CURRENT_TIMESTAMP`** — genau zwei `DEFAULT`s im ganzen Schema (`docs/radio-portierung-analyse.md:698-703`). **Jeder Import muss ids UND Zeitstempel selbst mitbringen** |
| **Zeitstempel-Einheit** | Quelle = epoch-**Millisekunden**, Ziel = Drizzle `mode: "timestamp"` = Unix-**Sekunden** | ⚠️ **Ein Faktor-1000-Fehler ist paritaetsgruen** und loescht ueber die Retention die abgeschlossene Leihhistorie. Der Mapper normalisiert; der Schutz ist ein **Unit-Test auf der Mapping-Funktion mit je Feld UNTERSCHIEDLICHEN Fixture-Werten**. Belege: alle Schreibpfade in `radio-admin` sind ms (`docs/radio-portierung-analyse.md:102-115`), die Paritaet ist strukturell blind, weil beide Arme aus derselben Funktion ableiten (`scripts/import/portal.ts:73-76`) |
| **Retention** | 2 Monate **uebernommen**, aber **nicht** beim Boot | Betreiberantwort 4 (`docs/radio-portierung-analyse.md:1774`), betroffen < 100 Leihen — **Schaetzung, keine Zaehlung**; die Zaehlung ist Runbook-Schritt (§9.4.1, Abfrage 7). ⚠️ Ausdruecklich **nicht** in der Alt-Bauform: `radio-admin/server/src/services/retentionService.ts:47` purgt **sofort** und erst `:48` startet den Tagestimer, mit dem Quellkommentar „clears any backlog, e.g. straight after a data migration" — genau das macht den Sekunden-Fehler aus einem Anzeigefehler zu einer Loeschung |
| **`api_tokens`** | wandert nur, soweit Historie es verlangt | Produktiv genau **ein** Konsument, der Alt-Kiosk mit statischem `RADIO_ADMIN_API_TOKEN` (Betreiberantwort 3, `docs/radio-portierung-analyse.md:1773`), und der verschwindet mit dem Port. **Es gibt keinen externen Konsumenten.** Die sechs Zeilenzahlen aus §9.4.1 gelten trotzdem, weil die Tabelle in der Paritaet steht |
| **`AdminUser` (radio-inventar)** | wandert **NICHT** | Im Pocket-ID-Betrieb schreibt der OIDC-Weg nicht in die Tabelle, sondern baut die Kennung synthetisch als `` `pocketid:${userInfo.sub}` `` (`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`). Die Suite fuehrt den **rohen** `sub`; der Praefix verschwindet. ⚠️ Die Tabelle wird trotzdem **gezaehlt, bevor der Postgres stirbt** (§9.4.2) — „Bestand annehmen statt zaehlen" ist der benannte Fehler aus Phase 4 |
| **Geheimnisse** | genau **EIN** neuer Wert, **frisch erzeugt**; **nichts** wird wertgleich uebernommen | ⚠️ **Radio invertiert das lagerbuch-Muster.** Dort wurde `HELFER_SESSION_SECRET` **wertgleich** aus der produktiven `stack.env` uebernommen, damit laufende Sitzungen den Cutover ueberleben (`.env.example:252-258`). Hier gibt es nichts zu erben: der heutige Zugang ist ein base64-kodierter Bearer-Token im `localStorage` (`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`), kein signiertes Cookie. Also `openssl rand -base64 32`, und ⚠️ **nicht gleich `AUTH_SECRET`** — dieselbe Signatur fuer Suite- und Modulsitzung hebt die Domaenentrennung auf, die das eigene Geheimnis begruendet (`.env.example:256-257`). Wer nach einem zu uebernehmenden Wert sucht, sucht vergeblich; das muss dastehen |
| **Health-Pfad** | `/api/health/radio` | ⚠️ **Nie `/api/health`.** `src/app/api/health/route.ts` liefert konstant `{status:"ok"}` ohne Modul, ohne Datenbank; der `[modul]`-Handler schreibt selbst aus, warum er der richtige ist (`src/app/api/health/[modul]/route.ts:11-18`). Nach dem Cutover antwortet `radio.iuk-ue.de/api/health` weiter `ok`, **ohne etwas ueber radio zu sagen**. Monitor und `docs/deployment.md` mit umstellen |
| **Health beweist weniger als der Name** | `SELECT 1` auf einer Datei, die bei Bedarf **neu angelegt** wird | `openModuleDatabase` legt das Verzeichnis per `mkdirSync(dir, {recursive:true})` an (`src/core/db/index.ts:12-22`), better-sqlite3 die Datei. **Ein vertipptes `DATA_DIR` oder ein nicht gemountetes Volume ergibt eine nagelneue, leere `radio.db` — health gruen, null Geraete.** Deshalb der **zaehlende** Check aus §9.4.3 neben dem Healthcheck, nicht statt seiner |
| **Rollback-Koernung** | **grob** | Ein Rueckzug auf ein aelteres Image nimmt portal, qr, feedback, files, lagerbuch und aufgaben mit. Der **Teilrueckzug** ist `SUITE_HOST_RADIO` leeren + Host aus `SUITE_TRAEFIK_RULE`. ⚠️ **Bei radio bedeutet dieser Handgriff etwas anderes als bei lagerbuch:** er nimmt die Domain vom Netz, und weil dort heute der Alt-Kiosk laeuft (Entscheidung 3), ist der Rueckweg **„Router zurueck" auf radio-inventar**, nicht „Domain offline". Vollstaendig in §9.3.3 |

**Zusage an das Import-Kapitel:** dieses Kapitel verlangt `scripts/import/radio.ts` **im Repo, mit
Test** — kein Handgriff am Server und kein nicht committetes Skript. Begruendung dreiteilig
(`docs/radio-portierung-analyse.md:772-774`): (i) Generalprobe und Echtimport sind **zwei** Laeufe
derselben Datei, (ii) nur ein Unit-Test auf der Mapping-Funktion faengt den Faktor-1000-Fehler — die
Paritaet kann es strukturell nicht, (iii) ein Runbook ist nicht ausfuehrbar und nicht gegenlesbar.
Heute enthaelt `scripts/import/` genau `feedback-time.ts`, `feedback.ts`, `parity.ts`, `portal.ts`.

**Zusage an das Zugangs-Kapitel:** die Env-Namen des Modulgeheimnisses und der Sitzungsdauer folgen
dem lagerbuch-Muster (`.env.example:258`, `:265`) und lauten in dieser Uebergabe
`RADIO_ZUGANG_SITZUNG_SECRET` (Pflicht, ohne Wert in `.env.example`, damit kein aus der Vorlage
mitgeschleppter Wert entsteht) und `RADIO_ZUGANG_SITZUNG_STUNDEN` (optional, Vorbelegung im Code).
Legt das Zugangs-Kapitel andere Namen fest, gelten dessen Namen und diese Zeile wird nachgezogen —
die **Anzahl** der Geheimnisse (genau eines, frisch erzeugt) ist dagegen hier gesetzt.

---

## 9.2 Was nur im Runbook stehen kann: der Redirect vom Alt-Host

### 9.2.1 Die gepruefte Antwort: `radio-admin.iuk-ue.de` gehoert **ausdruecklich NICHT** in `SUITE_TRAEFIK_RULE`

Gepruefte Lage: `compose.yaml:146-156` definiert **genau einen** Router,
``traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(`iuk-ue.de`)}`` (`:153`), und
`.env.example:366-369` fuehrt die Variable mit dem Erweiterungshinweis fuer einen Cutover.

Wer `radio-admin.iuk-ue.de` dort mit aufnimmt, bekommt **nicht** den Redirect, sondern den stillen
Portal-Fallback: der Host erreicht den Container, kein `SUITE_HOST_*` beansprucht ihn, und
`decideRoute` schreibt auf **portal** um — `const mod = moduleForHost(host) ?? getModule("portal")`
(`src/core/routing.ts:69`; `moduleForHost` selbst steht in `src/core/registry.ts:225`, **nicht** in
`hosts.ts`). Der Kommentar, der genau diesen Fehlfall ausschreibt, steht daneben in
`src/core/hosts.ts:52-57` („der Host fällt dann in `moduleForHost` auf das Portal zurück und die
QR-Domain zeigt stillschweigend das Portal"). Der Alt-Verwaltungshost zeigt dann das Portal: ein
funktionierender Ausdruck mit falschem Inhalt, und **kein Test des Repos sieht Traefik-Labels an**.

**Runbook-Zeile:** `SUITE_TRAEFIK_RULE` wird beim Cutover um ``|| Host(`radio.iuk-ue.de`)`` erweitert
— und **nur** darum. Der Alt-Host bleibt draussen und bekommt einen **zweiten, eigenen Router**.

⚠️ **Reihenfolge, und sie ist nicht die naheliegende:** der zweite Router wird **im selben Fenster wie
der Umschwenk** scharf, nicht vorher. Begruendung in §9.3.1, Zeile „Der Redirect vom Alt-Host trifft" —
bis zum Umschwenk liegt unter `radio.iuk-ue.de/admin` die **Verwaltung des Alt-Kiosk**
(`docs/radio-portierung-analyse.md:392-398`). Praktisch heisst das: die Labels stehen ab dem Deploy im
Image, aber `SUITE_REDIRECT_RULE_RADIO_ADMIN` bleibt bis zum Umschwenk **ungesetzt** (die Vorbelegung
`radio-admin.invalid` trifft nichts) und wird in **derselben** `.env`-Aenderung gesetzt wie
`SUITE_HOST_RADIO`.

**Zusage an das Verwaltungs-Kapitel:** dass unter `radio.iuk-ue.de/admin` nach dem Umschwenk die
**radio-admin**-Verwaltung liegt und nicht mehr die des Alt-Kiosk, ist Voraussetzung dieses Redirects.
Die Pfadkollision (Alt-Kiosk-Verwaltung mit Historie, Filtern und CSV-Export gegen
radio-admin-Verwaltung) wird dort aufgeloest, nicht hier — diese Uebergabe verlangt nur, dass sie
**vor** dem Cutover aufgeloest ist. Bleibt sie offen, ist der Redirect nicht schaltbar.

### 9.2.2 Die Label-Zeilen — Entwurf, kein erprobtes Vorbild

⚠️ **Nachgeschlagen zum Zeitpunkt des Schreibens:** `rg -n -i redirectregex compose.yaml .env.example docs/`
trifft **ausschliesslich** `docs/radio-portierung-analyse.md` (`:1654`, `:1660`, `:2105`, `:2287`) — im
Repo gibt es **kein erprobtes Vorbild**. Die folgenden Zeilen sind ein **Entwurf**, und deshalb steht
in §9.2.3 eine Verifikation daneben, die sie beweist.

```yaml
# in compose.yaml, am selben Service `app`, unter den bestehenden Labels
- traefik.http.routers.radio-admin-alt.rule=${SUITE_REDIRECT_RULE_RADIO_ADMIN:-Host(`radio-admin.invalid`)}
- traefik.http.routers.radio-admin-alt.entrypoints=web
- traefik.http.routers.radio-admin-alt.middlewares=radio-admin-alt-redirect
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.regex=^https?://radio-admin\.iuk-ue\.de/(.*)
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.replacement=https://radio.iuk-ue.de/admin/$${1}
- traefik.http.middlewares.radio-admin-alt-redirect.redirectregex.permanent=false
```

Fuenf Punkte, jeder mit einem Preis, wenn er fehlt:

1. **Die Middleware haengt am Router, nicht am Service.** Haengte sie am Service, traefe der Redirect
   auch die Suite selbst (`docs/radio-portierung-analyse.md:1654-1656`).
2. **`permanent=false` → 302, nie 301.** Ein 301 liegt im Cache jedes Telefons, das den Alt-Host je
   besucht hat, und macht den Rollback praktisch unmoeglich (`:1656`).
3. **`$$` gegen die Compose-Interpolation.** `$${1}` erreicht Traefik als `${1}`; ein einfaches `$`
   verschluckt Compose, und die Ersetzung liefert `/admin/` fuer **jeden** Pfad — der Redirect
   funktioniert, ist aber nicht mehr pfaderhaltend. Das ist der stille Fehlfall dieses Blocks.
4. **Pfaderhaltend heisst: `radio-admin.iuk-ue.de/geraete` → `radio.iuk-ue.de/admin/geraete`.** Die
   Alt-Verwaltung bediente ihre Oberflaeche ab `/`; das neue Praefix ist `/admin`.
5. **Die Rule kommt aus einer eigenen Variable mit unschaedlicher Vorbelegung.** `radio-admin.invalid`
   ist ein Host, den niemand aufloest — solange die Variable nicht gesetzt ist, existiert der Router,
   trifft aber nichts. Ohne Vorbelegung scheitert `docker compose config`, sobald die Variable fehlt.
   ⚠️ **Der Name ist bewusst nicht `SUITE_HOST_`-praefigiert:** `const PREFIX = "SUITE_HOST_"`
   (`src/core/hosts.ts:20`), und `validateHostConfig` bricht den Boot bei **jedem** Namen mit diesem
   Praefix ab, der zu keinem Modul-Key passt (`src/core/hosts.ts:69-76`).
   `SUITE_REDIRECT_RULE_RADIO_ADMIN` faellt nicht darunter und ist damit boot-neutral.

### 9.2.3 Der Preis: die Struktur lebt im Repo, die Konfiguration auf dem Server

Die Labels gehoeren (a) als echte, per Env parametrisierte Labels in die **Repo**-`compose.yaml` und
(b) als kommentierter Block plus Rollback-Handgriff in `.env.example` **neben** die
`SUITE_TRAEFIK_RULE`-Zeile (`:366-369`), wie `.env.example:231-239` es fuer `lagerbuch` vormacht.
Grund: `SUITE_TRAEFIK_RULE` und `SUITE_REDIRECT_RULE_RADIO_ADMIN` leben in der `.env` **auf dem
Server**, die Redirect-Labels sind dagegen **Struktur** und keine Konfiguration
(`docs/radio-portierung-analyse.md:1665-1670`).

⚠️ **Damit bleibt ein unaufloesbarer Rest: die zwei Env-Zeilen sind in keinem Repo nachlesbar.** Wer
nach dem Cutover fragt, warum der Alt-Host redirected, findet die Struktur im Repo und den Wert nur
auf dem Server. Zwei Runbook-Zeilen dagegen: (i) die gesetzten Werte beider Variablen woertlich ins
Cutover-Protokoll, (ii) `docker compose config | grep -A2 radio-admin-alt` nach dem Deploy, damit
protokolliert ist, was Traefik tatsaechlich bekommt.

⚠️ **Zu bestaetigen (Betreiberfrage):** die Behauptung, am 19.07. seien Repo- und
Server-`compose.yaml` schon einmal auseinandergelaufen, ist **im Repo nicht nachweisbar** und gehoert
als Frage gestellt, nicht als Tatsache gesetzt (`docs/radio-portierung-analyse.md:1661-1663`). Die
Aufschreibpflicht aus (b) haengt nicht daran — sie folgt schon aus „Struktur gehoert ins Repo".

**Verifikation (drei `curl`, alle NACH dem Umschwenk, alle protokollpflichtig):**

```bash
curl -si https://radio-admin.iuk-ue.de/geraete | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/geraete
curl -si https://radio-admin.iuk-ue.de/       | head -5
#   erwartet: HTTP/2 302  +  location: https://radio.iuk-ue.de/admin/
curl -si https://radio.iuk-ue.de/             | head -5
#   erwartet: HTTP/2 200 — der Ziel-Host darf NICHT redirecten.
#   Ein 302 hier heisst: die Middleware haengt am Service statt am Router.
```

### 9.2.4 Der Redirect hat kein Ablaufdatum — er braucht eine benannte Bedingung

⚠️ **Der DNS-Eintrag `radio-admin.iuk-ue.de` muss BLEIBEN, solange der Redirect steht** — er ist die
Abhaengigkeit des Redirects und **kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`).
Was die Analyse offen laesst und dieses Kapitel schliesst: **wann faellt der Redirect?**

Festlegung: der Redirect steht **mindestens** bis zum Ende des Standby-Fensters (§9.5) und wird
danach abgebaut, sobald **eine** Bedingung erfuellt ist — im Traefik-Zugriffsprotokoll erscheint
ueber vier zusammenhaengende Wochen kein Treffer mehr auf `radio-admin.iuk-ue.de`. Ohne benannte
Bedingung lebt ein Redirect fuer immer, und mit ihm ein DNS-Eintrag, den niemand mehr erklaeren kann.
Der Abbau ist drei Zeilen: Labels aus `compose.yaml`, `SUITE_REDIRECT_RULE_RADIO_ADMIN` aus der `.env`,
DNS-Eintrag loeschen — **in dieser Reihenfolge**, weil der DNS-Eintrag zuletzt faellt.

---

## 9.3 Kein Parallelfenster — was das fuer Generalprobe, Verifikation und Rueckweg heisst

**Die Lage in einem Satz:** der Alt-Kiosk laeuft **bereits** unter `radio.iuk-ue.de`
(Betreiberantwort 1, `docs/radio-portierung-analyse.md:1771`), der Origin bleibt zeichengleich — und
genau deshalb koennen Alt-Kiosk und Suite denselben Host **nicht gleichzeitig** bedienen. Es gibt
**kein Parallelfenster**. Das Cutover-Muster der Suite („nie zwei Router gleichzeitig aktiv",
`CLAUDE.md:239`) ist hier keine Vorsichtsregel, sondern eine physische Grenze.

### 9.3.1 Was vorher pruefbar ist und was strukturell erst nachher

| Aussage | Vorher pruefbar? | Wie, und wenn nein: warum nicht |
|---|---|---|
| Der Import ist vollstaendig | **ja** | Sechs Zeilenzahlen + vier Invarianten gegen die Snapshot-Kopie (§9.4.1, §9.4.3), im **ephemeren Container ohne Traefik-Labels** |
| Die Ausleih-Oberflaeche rendert unter dem radio-Host | **ja** | Ephemerer Container, Host per Header vorgetaeuscht (§9.3.2) |
| `/admin` riegelt ohne Modul-Admin-Gruppe ab | **ja** | Ephemerer Container, angemeldete Negativprobe |
| `/api/health/radio` antwortet 200 mit `revision` | **ja** | Ephemerer Container; `src/app/api/health/[modul]/route.ts` liefert `revision` aus `laufendeRevision()` — der einzige Beleg, dass wirklich der neue Stand antwortet |
| Der Redirect vom Alt-Host trifft | ⚠️ **nein — und er darf vorher nicht scharf sein** | ⚠️ **Die naheliegende Reihenfolge ist falsch.** Der Redirect zeigt auf `radio.iuk-ue.de/admin`, und bis zum Umschwenk liegt dort die **eigene Verwaltungsoberflaeche des Alt-Kiosk**: `login.tsx`, `index.tsx`, `history.tsx` (Filter, Seitenblaetterung, CSV-Export), `devices.tsx`, `settings.tsx` plus eigene API-Schicht (`docs/radio-portierung-analyse.md:392-398`). Ein frueh geschalteter Redirect fuehrt jeden Verwaltenden aus einer funktionierenden Alt-Verwaltung in die **Verwaltung einer anderen Anwendung** — schlechter als nichts zu tun. **Der Redirect wird im selben Fenster wie der Umschwenk scharf, nie davor**, und die drei `curl` aus §9.2.3 laufen **danach**. Es gibt auch hier kein Parallelfenster |
| **Der Login-Rueckweg landet wieder auf `radio.iuk-ue.de/admin`** | ⚠️ **nein** | Die Allowlist in `src/core/auth/redirect.ts` erkennt einen Modul-Host ueber genau `SUITE_HOST_RADIO`; fehlt der Wert, wirft Auth.js den Nutzer nach dem Login aufs Portal, **ohne Fehler und ohne Meldung**, und „Ein curl sieht davon nichts" (`src/core/hosts.ts:59-63`, woertlich). Der Test braucht einen echten Browser auf dem echten Host — und den haelt bis zum Umschwenk der Alt-Kiosk |
| Der alte Service Worker liefert keine Altantworten mehr | ⚠️ **nein** | Er liegt nach dem Umschwenk unter derselben Adresse (§9.3.4) |
| Die gedruckten/gescannten QR-Wege funktionieren | ⚠️ **nein** | Braucht die echte Endadresse ueber HTTPS. Vorbild derselben Einschraenkung: `docs/runbooks/lagerbuch-cutover.md:290` („Die Generalprobe MUSS ueber HTTPS laufen — sonst sind die Kamerawege ungeprueft") |

**Die Konsequenz, ausgeschrieben:** drei Aussagen sind vor dem Umschwenk nicht beweisbar. Dafuer gibt
es genau zwei ehrliche Wege, und Spec 2 waehlt einen davon **vor** dem Cutover-Abend, nicht an ihm:

- **Weg A — temporaerer Host.** `SUITE_HOST_RADIO=radio-neu.iuk-ue.de` als **echter** Wert plus
  passender `SUITE_TRAEFIK_RULE`-Eintrag. Weil die Variable diesen Host dann wirklich beansprucht
  (`src/core/hosts.ts:39-46`), loest `moduleForHost` dort `radio` auf, der Login-Rueckweg ist
  vollstaendig pruefbar, und `/m/radio` auf dem Portal-Host wird gar nicht angefasst — **Falle 61 ist
  damit bauartbedingt vermieden, nicht durch Disziplin**
  (`docs/radio-portierung-analyse.md:1856-1861`). Preis: ein zweiter DNS-Eintrag und ein zweiter
  Umschwenk, denn der Wert muss am Cutover-Abend auf `radio.iuk-ue.de` wechseln. ⚠️ Beim Wechsel gilt
  **dieselbe** Pruefung noch einmal — der Rueckweg haengt am Wert, nicht am Code.
- **Weg B — Nachpruefung als erster Schritt nach dem Umschwenk**, mit `SUITE_HOST_RADIO=` leeren als
  benanntem Rueckweg und einer namentlich benannten Person, die die Anmeldung durchfuehrt, **bevor**
  der Kiosk als freigegeben gilt.

**Empfehlung: Weg A.** Der Login-Rueckweg ist die einzige Pruefung, deren Fehlfall **stumm** ist, und
ein stummer Fehlfall gehoert nicht in ein Fenster ohne Parallelbetrieb.

### 9.3.2 Der ephemere Container ist hier nicht Kuer, sondern der einzige Weg

Das Cutover-Muster der Suite sieht ihn ohnehin vor (`CLAUDE.md:238-239`: „Verifikation gegen einen
ephemeren Container ohne Traefik-Labels"). Bei radio ist er **nicht** eine von mehreren
Pruefgelegenheiten, sondern die einzige vor dem Umschwenk — weil die Endadresse besetzt ist.

Zwei Handgriffe, die dabei leicht fehlen:

1. **Der Host muss vorgetaeuscht werden.** Der Container haengt an keinem Router; erreicht wird er
   ueber IP und Port. Ohne den Header laeuft jede Anfrage auf den Portal-Fallback und **prueft radio
   ueberhaupt nicht**:
   ```bash
   curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/          | head -3   # Ausleihe, 200
   curl -si -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/admin     | head -3   # Riegel greift
   curl -s  -H 'Host: radio.iuk-ue.de' http://127.0.0.1:<port>/api/health/radio
   ```
2. **`SUITE_SEED` bleibt aus, oder der Seed ist beweisbar harmlos.** `shouldSeed()` ist
   `SUITE_SEED === "1" || NODE_ENV === "development"` (`CLAUDE.md:180-182`) — `SUITE_SEED=1` ist der
   **Generalproben**-Schalter, nicht der Lokalschalter. ⚠️ **Bei radio ist das schaerfer als bei jedem
   bisherigen Modul:** ein geseedeter Zugangscode waere in der Generalprobe ein **gueltiger anonymer
   Zugang** zum gesamten Bestand samt Ausleihernamen. **Zusage an das Zugangs-Kapitel:** `seedLokal`
   legt Geraete und Stammdaten an und **niemals** eine einloesbare Zugangszeile; die Zugangstabelle
   bleibt beim Seed leer.

### 9.3.3 Der Rueckweg ist „Router zurueck" — und er kostet Daten

Rollback ist ein **Routing**-Vorgang: `SUITE_HOST_RADIO=` leeren (leer, nicht geloescht) und
`radio.iuk-ue.de` aus `SUITE_TRAEFIK_RULE` nehmen. ⚠️ **Bei radio bedeutet dieser Handgriff etwas
anderes als bei lagerbuch.** Dort nahm er die Domain vom Netz
(`docs/runbooks/lagerbuch-cutover.md:420`). Hier ist der Alt-Kiosk der **Rueckfall**, weil er
`radio.iuk-ue.de` bis zum Umschwenk bedient hat — der Rueckweg ist damit vollstaendig nur mit einem
dritten Handgriff: **radio-inventar wieder ansprechen lassen**.

⚠️ **Damit ist eine Aussage der Analyse ueberholt:** `docs/radio-portierung-analyse.md:633-635`
schliesst „der KIOSK ist danach offline … weil `radio.iuk-ue.de` dort nie bedient wurde". Das gilt
fuer radio-**admin** und ist fuer den **Kiosk** durch Betreiberantwort 1 (`:1771`) widerlegt.
Ebenso ueberholt: `:814-816` erklaert den radio-inventar-Stack samt Postgres und Images fuer „sofort
weg" — geschrieben, als Frage 1 noch offen war. **Solange das Standby-Fenster laeuft, ist
radio-inventar das Rollback-Ziel und darf nicht abgebaut werden**, und sein Postgres-Volume geht mit
ihm (`radio-inventar/docker-compose.yml:42-44`: der Backend-Service haengt per
`depends_on: postgres: condition: service_healthy`).

**Was der Rollback nicht zurueckholt.** Es gibt **keinen** Rueckweg-Importer (Suite → radio-admin) und
kein Vorbild dafuer (`docs/radio-portierung-analyse.md:626-628`). Jede Ausleihe und jede Rueckgabe,
die nach dem Umschwenk in `radio.db` landet, steht in einer SQLite-Datei, die die Alt-Apps nie lesen.
Festlegung fuer Spec 2, damit das nicht um 22 Uhr entschieden wird:

1. **Point of no return: der erste fachliche Schreibvorgang in `radio.db`** — die erste Ausleihe oder
   Rueckgabe nach dem Umschwenk. Ab da ist der Rollback ein **Datenverlust mit bekanntem Umfang**,
   nicht mehr eine Routing-Ruecknahme.
2. **Frist: Rollback ohne Nachtrag nur innerhalb der ersten Stunde nach dem Umschwenk**, und in dieser
   Stunde bleibt der Kiosk unter Beobachtung. Danach nur noch vorwaerts.
3. **Der Nachtrag ist ausgeschrieben, nicht improvisiert.** Wird in der Frist zurueckgezogen, liefert
   ein `sqlite3`-Auszug die Liste, die von Hand in die Alt-App nachgetragen wird:
   ```bash
   sqlite3 "$DATA_DIR/radio.db" \
     "select id, device_id, borrower_name, borrowed_at, returned_at, return_note
        from loans where created_at >= <umschwenk_epoch_sekunden> order by created_at;"
   ```
   ⚠️ Die Zeitstempel stehen hier in **Sekunden**, die Alt-App erwartet **Millisekunden** — beim
   Nachtragen mit 1000 multiplizieren. Derselbe Faktor, andere Richtung.

### 9.3.4 ⚠️ Die Koppelung, die das Standby-Fenster wertlos machen kann

Ein Rollback (oder auch nur ein Nachschlagen) bootet den Alt-Stack — und **jeder Start von
radio-admin loescht Historie**: `radio-admin/server/src/index.ts:35` ruft `startRetentionSchedule`,
`radio-admin/server/src/services/retentionService.ts:47` fuehrt `purge()` **sofort** aus, erst `:48`
folgt der Tagestimer. Der Cutoff haengt an der **Wanduhr** (`now` minus zwei Monate, `:9`, `:19`),
nicht am Cutover-Zeitpunkt — **jeder weitere Start loescht mehr als der vorige**. Wer den Stack in
Woche zwei hochfaehrt, um gegen die Historie zu pruefen, verliert zwei weitere Wochen genau dieser
Historie (`docs/radio-portierung-analyse.md:823-837`).

*Kein Gate:* das ist ein **erfolgreicher** Start mit einer Protokollzeile
(`retentionService.ts:41`, `[retention] purged N expired loan(s)`) — kein Fehler, kein roter Test.

**Drei Runbook-Zeilen, ohne die das Standby-Fenster nichts wert ist:**

1. **Vor** dem Cutover-Abend, nicht wenn man es braucht: `HISTORY_RETENTION_MONTHS` in der
   Standby-Umgebung neutralisieren **oder** das Volume kopieren. Danach ist es zu spaet — der erste
   Start hat dann schon geloescht.
2. Jede feldweise Nachpruefung laeuft per `sqlite3` gegen die **Snapshot-Kopie** des Volumes,
   **nie** gegen einen gebooteten Alt-Stack.
3. Muss die Alt-App doch laufen (Rollback, Oberflaechenvergleich), gilt Zeile 1 als erfuellt
   nachgewiesen — sonst wird der Start abgesagt.

### 9.3.5 Der alte Service Worker liegt nach dem Umschwenk unter derselben Adresse

Weil der Origin zeichengleich bleibt, ueberlebt die Service-Worker-Registrierung des Alt-Kiosk den
Umschwenk und kann alte Antworten aus ihrem Cache ausliefern, **waehrend die Suite darunter schon
antwortet** (`docs/radio-portierung-analyse.md:1716-1721`). Der Kiosk bringt dafuer die volle
PWA-Maschinerie mit (`radio-inventar/apps/frontend/src/components/pwa/` mit `PWAInstallBanner.tsx`,
`PWAOfflineIndicator.tsx`, `PWAUpdateNotification.tsx`).

*Kein Gate:* HTTP 200 mit veraltetem Inhalt. Kein Build, kein Test, kein Healthcheck sieht das.

**Zwei Runbook-Posten:**

1. **Ein Ersatz-Service-Worker unter der Endadresse, der `self.registration.unregister()` ruft** —
   die Bauform gehoert dem PWA-Kapitel; hier steht die **Pflicht**, dass es einen gibt.
   **Zusage an das PWA-/Oberflaechen-Kapitel:** Manifest, Service Worker und Icons entstehen als
   Route Handler **unter** `src/app/m/radio/`, **nie global** — ein Manifest an der Wurzel bewuerbe
   jeden Suite-Host als radio-PWA, also auch `iuk-ue.de` und `lagerbuch.iuk-ue.de`: alle Suite-Hosts
   haengen an **einem** Traefik-Router auf **einem** Container (`compose.yaml:146-155`, Rule in `:153`).
   **Die Pruefzeile dafuer ist im Haus schon formuliert** und wird fuer `radio` zeichengleich
   uebernommen — `docs/runbooks/lagerbuch-cutover.md:436` (R36, Falle 56 der lagerbuch-Zaehlung):
   `curl -si https://<portal-host>/manifest.webmanifest` darf das radio-Manifest **nicht** liefern.
2. **Fuer Geraete, die den alten Kiosk installiert haben: einmal Speicher loeschen.** Wie viele
   Geraete das sind, ist **im Repo nicht abzaehlbar** — der Token liegt im `localStorage`, es gibt
   keine Tabelle, die die Geraete kennt; die Antwort ist eine **Begehung, kein `SELECT`**
   (`docs/radio-portierung-analyse.md:1969-1971`). ⚠️ **Zu bestaetigen (Betreiberfrage):** wie viele
   Geraete tragen heute den geteilten Token im Browser? Die Zahl bemisst, wie lange nach dem
   Umschwenk noch Altantworten im Umlauf sein koennen.

---

## 9.4 Die Zaehlungen vor dem Abbau

**Warum das keine Formalie ist.** Der Abbau ist **unumkehrbar**, und „Bestand annehmen statt zaehlen"
ist der namentlich benannte Fehler der Phase 4 (§A-Lehre). Dazu die strukturelle Blindheit des
Paritaetschecks: er beweist den Datenbank-**Rundlauf**, nicht die **Feldzuordnung** — ein konsistenter
Zuordnungsfehler ist paritaetsgruen (`CLAUDE.md:241-243`, `scripts/import/parity.ts:43-56`).

⚠️ **Die lokalen Kopien im Repo beantworten nichts.** `radio-admin/data/data.sqlite` ist **leer** und
**vorbaselinig**: `.tables` zeigt nur `__drizzle_migrations`, `device_events`, `devices`,
`software_versions` — `loans`, `api_tokens` und `users` **fehlen ganz**
(`docs/radio-portierung-analyse.md:1865-1872`). Jede Zahl unten kommt aus dem **Prod-Dump**, nicht
aus dem Repo.

### 9.4.1 radio-admin: SQLite unter `/data/data.sqlite`

Quelle: `radio-admin/docker-compose.yml` setzt `DATABASE_PATH=/data/data.sqlite` auf dem Volume, das
dort als `radio-data` **deklariert** ist. Der Auszug entsteht **einmal** als Snapshot-Kopie, und alle
Abfragen laufen gegen die Kopie, nie gegen einen laufenden Stack (§9.3.4, Zeile 2):

```bash
docker compose -f radio-admin/docker-compose.yml stop app

# ⚠️ ZUERST den ECHTEN Volume-Namen ermitteln und ins Protokoll schreiben.
docker volume ls | grep -i radio-data
#   -> compose praefixt deklarierte Volumes mit dem PROJEKTNAMEN, z. B.
#      `radio-admin_radio-data`. Ein `-v radio-data:/d` legt sonst ein NEUES,
#      LEERES Volume an, und der `cp` scheitert an einer fehlenden Datei —
#      laut, aber ein verbrannter Schritt im Cutover-Fenster.

VOL=<die Zeile aus dem Befehl oben>
docker run --rm -v "$VOL":/d -v "$PWD":/out alpine \
  sh -c 'cp /d/data.sqlite /out/radio-admin-snapshot.sqlite'
```

**Die sechs Paritaets-Sollwerte** (`docs/radio-portierung-analyse.md:752-753`):

```sql
select 'devices',           count(*) from devices
union all select 'software_versions', count(*) from software_versions
union all select 'api_tokens',        count(*) from api_tokens
union all select 'users',             count(*) from users
union all select 'device_events',     count(*) from device_events
union all select 'loans',             count(*) from loans;
```

**Die vier Invarianten-Zaehlungen** — jede mit der Folge, wenn sie ueberrascht:

```sql
-- 1) MUSS genau 1 sein.
select count(*) from software_versions where is_target = 1;
```
Der Update-Stand ist **berechnet, nicht gespeichert** (`radio-admin/server/src/db/schema.ts:53-56`).
Bei 0 oder 2 kippt der angezeigte Status **jedes** Geraets, und keine Paritaet sieht es. Weicht die
Zahl ab, wird sie **vor** dem Import in der Kopie bereinigt und die Bereinigung protokolliert.

```sql
-- 2) MUSS 0 sein — sonst scheitert der Import an der FK-Kante.
select count(*) from device_events e
  left join devices d on d.id = e.device_id
 where d.id is null;
```
`foreign_keys = ON` gilt auf beiden Seiten (`radio-admin/server/src/db/index.ts:28`,
`src/core/db/index.ts:19`). Ein Treffer heisst: der Import bricht hart ab — besser jetzt als im
Cutover-Fenster.

```sql
-- 3) MUSS leer sein — sonst laesst sich der partielle Aktiv-Index im Ziel nicht anlegen.
select device_id, count(*) from loans
 where returned_at is null group by device_id having count(*) > 1;
```

```sql
-- 4) MUSS leer sein — `device_events.source` ist ein TS-Enum OHNE DB-CHECK.
select distinct source from device_events
 where source not in ('manual','csv-import','create','update-note');
```
Das Enum steht nur im Quelltext (`radio-admin/server/src/db/schema.ts:96`); die Altdaten koennen
Werte tragen, die es nicht kennt. **Pruefen, nicht annehmen.**

**Drei Abfragen, die keine Invariante pruefen, sondern eine Entscheidung belegen:**

```sql
-- 5) Zeitstempel-Groessenordnung: DREIZEHNSTELLIG = Millisekunden.
select min(created_at), max(created_at), length(cast(max(created_at) as text)) from devices;
```
Das ist der empirische Beweis fuer die Uebergabe-Zeile „Zeitstempel-Einheit" und damit fuer den
Mapping-Unit-Test. Kaeme hier **zehn**stellig heraus, ist die gesamte Import-Annahme falsch und der
Cutover wird abgesagt, nicht angepasst.

```sql
-- 6) Traegt die Prod-DB von Hand angelegte Trigger oder Views?
select type, name, sql from sqlite_master where type in ('trigger','view');
```
Der Grep-Beleg der Analyse gilt fuer den **Quelltext**, nicht fuer die laufende Datenbank
(`docs/radio-portierung-analyse.md:2038-2040`). Ein Treffer ist Fachlogik, die kein Repo kennt.

```sql
-- 7) Die Retention-Zahl, die der Betreiber geschaetzt hat (< 100).
select count(*) from loans
 where returned_at is not null
   and returned_at < (strftime('%s','now','-2 months') * 1000);
```
⚠️ **Der Faktor 1000 steht hier absichtlich im SQL**: die Alt-Spalte ist in Millisekunden,
`strftime('%s')` liefert Sekunden. Wer ihn weglaesst, zaehlt **alle** zurueckgegebenen Leihen und
haelt das fuer eine bestaetigte Schaetzung. Diese Zahl ersetzt die Betreiber-Schaetzung („< 100",
`docs/radio-portierung-analyse.md:1774`) durch eine Zaehlung — und sie ist gleichzeitig die Zahl, die
der Import **nicht** verlieren darf.

```sql
-- 8) Steht `dev-user` in der Prod-DB? (Falle 15)
select sub from users;
select distinct created_by from devices;
```
Ein `dev-user` unter den Audit-Spalten heisst: `AUTH_DEV_BYPASS` war irgendwann aktiv, und die
Zuordnung von Journalzeilen zu Personen ist an diesen Stellen keine.

### 9.4.2 radio-inventar: Postgres

Zugang aus `radio-inventar/docker-compose.yml`: Container `radio-inventar-db` (`:5`), Nutzer
`${POSTGRES_USER:-radio}` (`:7`), Datenbank `radio_inventar` (`:10`), deklariertes Volume
`postgres_data` (`:12`).

⚠️ **Zwei Werte davon sind Vorbelegungen, keine Tatsachen** — dieselbe Einschraenkung wie in U4
(§9.5.1): `POSTGRES_USER` traegt nur einen `:-radio`-Default, und der Volume-Name bekommt vom
Projektnamen ein Praefix (typisch `radio-inventar_postgres_data`). Beide **vor** dem ersten Befehl
ablesen und ins Protokoll schreiben:

```bash
docker compose -f radio-inventar/docker-compose.yml exec -T postgres printenv POSTGRES_USER
docker volume ls | grep -i postgres_data
```
Nur `POSTGRES_DB: radio_inventar` ist im Compose **hart** gesetzt und darf uebernommen werden.

⚠️ **Die Anfuehrungszeichen sind tragend.** Prisma legt die Tabellen in gemischter
Gross-/Kleinschreibung an; Postgres braucht dafuer doppelte Anfuehrungszeichen im SQL. Deshalb steht
das SQL in **einfachen** Anfuehrungszeichen — ein `-c "…"` mit doppelten aussen zerstoert die inneren
und die Abfrage scheitert an einer nicht existierenden Relation `adminuser`.

```bash
PG="docker compose -f radio-inventar/docker-compose.yml exec -T postgres psql -U ${POSTGRES_USER:-radio} -d radio_inventar -c"
```

```sql
-- 1) Grundwahrheit statt Ableitung: welche Tabellen existieren wirklich?
select tablename from pg_tables where schemaname = 'public' order by 1;
```
Abgeleitet erwartet: `AdminUser`, `_prisma_migrations`, evtl. `session`
(`docs/radio-portierung-analyse.md:2048-2052`). ⚠️ **Der Tabellenbestand war bisher aus fuenf
Migrationsdateien plus einer handgepflegten `create-session-table.sql` ABGELEITET, nicht gezaehlt.**
Liefert `pg_tables` mehr, ist **jede** zusaetzliche Tabelle per `select count(*)` zu zaehlen und die
Abbau-Liste zu erweitern.

```sql
-- 2) Liegt noch Bestand? Erwartet: NULL, NULL.
select to_regclass('public."Loan"') as loan, to_regclass('public."Device"') as device;
```
**Ein Nicht-NULL blockiert den Abbau.** Es bedeutet, dass die Drop-Migrationen in Prod nie gelaufen
sind — dann liegt dort Bestand, den niemand eingeplant hat, und die Import-Spec braucht einen zweiten
Zweig. Ergaenzend `select count(*) from "_prisma_migrations" where finished_at is not null;` —
**erwartet 5**; ein niedrigerer Wert heisst, Prod haengt hinter dem eingefrorenen Stand `f883ec4`.

```sql
-- 3) AdminUser: wandert nicht, wird aber gezaehlt.
select count(*) from "AdminUser";
select username, "createdAt", "updatedAt" from "AdminUser";
```
Die Zeile „`AdminUser` wandert NICHT" ist eine **Entscheidung**, keine Messung, und diese Zaehlung
dokumentiert, **was verworfen wird**. Ein Ergebnis > 0 heisst: es gab lokale Passwort-Identitaeten,
und ihr Verlust ist **vor** dem Loeschen des Volumes ausdruecklich zur Kenntnis zu nehmen — nicht
danach zu entdecken. `updatedAt > createdAt` beantwortet zusaetzlich ohne Konfigurationszugriff, ob
die Zugangsdaten je geaendert wurden, also ob der Nutzer in Benutzung war
(`docs/radio-portierung-analyse.md:2056-2059`). Die Entscheidung selbst bleibt unberuehrt: im
Pocket-ID-Betrieb baut der OIDC-Weg die Kennung synthetisch als `` `pocketid:${sub}` ``
(`radio-inventar/apps/backend/src/modules/admin/auth/pocket-id.service.ts:134`) und schreibt gar
nicht in die Tabelle.

```sql
-- 4) Existiert `session` ueberhaupt, und liegen dort Zeilen?
select count(*) from "session";
select count(*) from "session" where expire > now();
select sess from "session" where expire > now() limit 5;
```
Nach Codelage ist die Tabelle **nie angelegt** worden — die Abfrage prueft genau das. Existiert sie
doch, zeigt `sess`, ob dort `provider: 'local'` oder `'pocketid'` steht
(`docs/radio-portierung-analyse.md:2060-2064`). Ein `'local'` mit lebenden Sitzungen heisst: jemand
arbeitet heute mit einem Passwort-Login, den der Port ersatzlos streicht — das ist eine Ankuendigung
an eine namentlich bekannte Person, kein technischer Posten.

```sql
-- 5) Zeilenzahlen aller Tabellen auf einen Blick, fuer das Protokoll.
select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc;
```

```bash
# 6) Der Archiv-Dump. Erst danach darf das Volume fallen.
docker compose -f radio-inventar/docker-compose.yml exec -T postgres \
  pg_dump -U "${POSTGRES_USER:-radio}" -d radio_inventar --format=custom \
  > radio-inventar-final-$(date +%Y%m%dT%H%M%S).dump
```
⚠️ **Zu bestaetigen (Messung, nicht Betreiberfrage):** Groesse des Prod-Volumes und Dauer eines
`pg_dump` bzw. `sqlite3 .backup` sind nicht gemessen — sie bemessen das Cutover-Fenster
(`docs/radio-portierung-analyse.md:2212-2213`). Beide Zahlen entstehen bei der **Generalprobe**, nicht
am Cutover-Abend.

### 9.4.3 Nach dem Import: der zaehlende Check, der `status:"ok"` ersetzt

`/api/health/radio` waere gegen eine **frisch angelegte, leere** `radio.db` gruen (§9.1,
Zeile „Health beweist weniger als der Name"). Die Freigabe braucht daneben:

```bash
for t in devices software_versions api_tokens users device_events loans; do
  printf '%s\t' "$t"
  sqlite3 "$DATA_DIR/radio.db" "select count(*) from $t;"
done
```

Die sechs Zahlen muessen den sechs Sollwerten aus §9.4.1 entsprechen — **paarweise, nicht in der
Summe**. Dazu die **feldweisen Stichproben**, weil die Paritaet die Zuordnung nicht sieht: die vier
Paare, die sich verwechseln lassen, sind namentlich benannt (`docs/radio-portierung-analyse.md:743-747`)
— `issi` ↔ `tei` · `created_at` ↔ `updated_at` ↔ `last_updated_at` · `snapshot_call_sign` ↔
`borrower_name` · `alamos_integrated` ↔ `loanable` (zwei 0/1-Integer, die niemandem auffallen), dazu
`serial_number` ↔ `hiorg_id` ↔ `opta`. **Je Paar eine Zeile, zeilengenau gegen die Snapshot-Kopie.**

Und die Retention-Gegenprobe: die Zahl aus §9.4.1 Abfrage 7 muss **nach** dem Import in `radio.db`
wiederzufinden sein (in Sekunden gerechnet). Fehlt sie, hat der Faktor-1000-Fehler zugeschlagen — und
zwar an der einzigen Stelle, an der er nicht paritaetsgruen bleibt.

---

## 9.5 Der Abbau

### 9.5.1 Was bleiben muss und was sofort weg kann

⚠️ **Diese Tabelle korrigiert `docs/radio-portierung-analyse.md:814-816`.** Dort steht, der
radio-inventar-Stack samt Postgres und Images koenne „sofort weg" — geschrieben, als Kapitel 6,
Frage 1 noch offen war. Unter Entscheidung 3 ist radio-inventar der **Rollback-Traeger** und bleibt
im Standby.

| Posten | Bis wann | Bedingung fuer den Abbau |
|---|---|---|
| **radio-inventar-Stack** (`radio-inventar-backend`) | **Standby**, 2 Wochen | Gestoppt, Traefik-Anbindung entfernt, Image behalten. Er ist der Rueckweg fuer `radio.iuk-ue.de` (§9.3.3) |
| **radio-inventar-Postgres** (`radio-inventar-db`) + Volume `postgres_data` (⚠️ **deklarierter** Name; der echte traegt das Projekt-Praefix, §9.4.2) | **Standby**, 2 Wochen | Gestoppt, Volume erhalten — der Backend haengt per `depends_on: condition: service_healthy` daran (`radio-inventar/docker-compose.yml:42-44`), ein Rollback ohne ihn startet nicht. Abbau **erst** nach dem Archiv-`pg_dump` (§9.4.2 Nr. 6) und **erst**, nachdem §9.4.2 Nr. 1–5 protokolliert sind |
| **radio-admin-Stack** (`app`, Image `radio-admin:local`) + Volume `radio-data` (⚠️ **deklarierter** Name; der echte traegt das Projekt-Praefix, §9.4.1) | **Standby**, 2 Wochen | Gestoppt, Volume erhalten — einzige Quelle fuer Re-Import und feldweise Nachpruefung. ⚠️ **Vor** dem Cutover-Abend die Retention neutralisieren oder das Volume kopieren (§9.3.4, Zeile 1); ein Start ohne diesen Schritt zerstoert genau die Quelle, fuer die der Stack steht |
| **Snapshot-Kopie** `radio-admin-snapshot.sqlite` + Postgres-Dump | **Archiv**, dauerhaft | Nicht auf demselben Server wie die Suite; sie sind der Rest, der den Volumes ueberlebt |
| **Traefik-Anbindung radio-inventar** | **sofort** beim Umschwenk | Sie muss weg, sonst halten zwei Router `radio.iuk-ue.de` (`CLAUDE.md:239`) |
| **DNS `radio.iuk-ue.de`** | **bleibt**, unveraendert | Zeigt vor und nach dem Cutover auf denselben Edge; nichts zu tun. Genau das ist der Grund, warum es kein Parallelfenster gibt |
| **DNS `radio-admin.iuk-ue.de`** | **bleibt**, solange der Redirect steht | **Kein** Abbau-Posten (`docs/radio-portierung-analyse.md:1669-1670`). Ende benannt in §9.2.4 |
| **Redirect-Router + `SUITE_REDIRECT_RULE_RADIO_ADMIN`** | nach der Bedingung aus §9.2.4 | Vier Wochen ohne Treffer im Zugriffsprotokoll |
| **Images** (`radio-admin:local`, `ghcr.io/rubenvitt/radio-inventar/radio-inventar-backend`) | **Standby**, 2 Wochen | Ohne Image ist der Rollback kein Handgriff, sondern ein Build |
| **Alte `.env`-Dateien beider Stacks** | **sofort** nach dem Standby-Ende, mit dem Volume | §9.5.2 — der Posten, der liegen bleibt |
| **Repos `radio-admin`, `radio-inventar`** | archivieren, nicht loeschen | GitHub-Archivierung (read-only) mit den Freeze-SHAs `265abd5` bzw. `f883ec4` im Archivierungshinweis. Sie sind die Belegquelle jeder `datei:zeile` dieser Spec; ein geloeschtes Repo macht die gesamte Spec unnachpruefbar |
| **`radio-inventar`-Frontend-Auslieferung** | ⚠️ **zu bestaetigen** | `radio-inventar/docker-compose.yml` fuehrt **nur** `postgres` und `backend` (letzterer hinter `profiles: ["full-app"]`, `:27`) — **es gibt keinen Frontend-Service**. Wo und wie das Kiosk-Frontend produktiv ausgeliefert wird, ist aus dem eingefrorenen Repo **nicht belegbar**; dasselbe gilt fuer die Herkunft von `API_TOKEN`, das `apps/backend/src/config/env.config.ts:11` mit mindestens 32 Zeichen **ohne Default** verlangt und das in der eingecheckten Compose-Datei **nicht vorkommt**. **Die eingecheckte Compose-Datei ist nicht der Produktionsweg** (`docs/radio-portierung-analyse.md:1880-1886`). Ohne diese Auskunft ist die Abbau-Liste unvollstaendig — sie ist **vor** dem Cutover einzuholen, nicht danach |

### 9.5.2 Geheimnisse — der Posten, der liegen bleibt

⚠️ **Hier weicht dieses Kapitel bewusst von `docs/radio-portierung-analyse.md:839-843` ab.** Dort
steht, die uebernommenen Geheimnisse lebten nach dem Cutover „doppelt auf demselben Server". Das
trifft fuer `radio` **nicht** zu, weil **nichts** uebernommen wird (§9.1, Zeile „Geheimnisse"). Der
Befund wird dadurch nicht schwaecher, sondern staerker: die alten Werte bleiben **gueltig** in Dateien,
die niemand mehr pflegt und die kein Repo kennt — ein verwaister, aber funktionierender
Vollzugriffs-Token braucht kein Duplikat, um gefaehrlich zu sein. Deshalb steht das Loeschen als
**Zeile** hier und nicht als Absicht.

**Zu loeschen, namentlich** (aus `radio-admin/.env.example`, gelesen zum Zeitpunkt des Schreibens):

| Datei | Werte |
|---|---|
| radio-admin `.env` | `SESSION_SECRET` · `OIDC_CLIENT_ID` · `OIDC_CLIENT_SECRET` · `OIDC_ISSUER` · `OIDC_REDIRECT_URI` · `OIDC_ADMIN_GROUP` · `OIDC_UPDATER_GROUP` · `LOAN_API_EXPECTED_AUDIENCE` · `LOAN_API_EXPECTED_SUBJECT` · `AUTH_DEV_BYPASS`/`DEV_USER_*` |
| radio-inventar Produktionsumgebung | `API_TOKEN` (der geteilte Kiosk-Token) · `SESSION_SECRET` · `POSTGRES_PASSWORD` · `POCKET_ID_CLIENT_SECRET` und die drei uebrigen `POCKET_ID_*` (`radio-inventar/apps/backend/src/config/env.config.ts:12-15`) |

⚠️ **`API_TOKEN` braucht eine eigene Zeile:** er ist Pflichtwert (`env.config.ts:11`), steht aber
**nicht** in der eingecheckten Compose-Datei. Der Handgriff lautet daher „finden, wo Produktion ihn
setzt — dann dort loeschen", nicht „aus der Compose-Datei entfernen". Solange er irgendwo lebt, lebt
ein Vollzugriff auf den alten Bestand.

⚠️ **Der Posten, den die Analyse-Liste nicht nennt: zwei OIDC-Client-Registrierungen in Pocket ID.**
radio-admin ist ein eigener OIDC-Client (`OIDC_CLIENT_ID`/`OIDC_CLIENT_SECRET`,
`radio-admin/server/src/auth/auth-service.ts:26-48`), radio-inventar ein zweiter
(`POCKET_ID_CLIENT_ID`/`POCKET_ID_CLIENT_SECRET`). Beide tragen lebende Secrets und `redirect_uri`s
auf Hosts, die verschwinden. Ob sie geloescht oder aufbewahrt werden, entscheidet der Betreiber —
**die Zeile muss existieren**, sonst bleiben zwei gueltige Clients mit toten Rueckadressen stehen.

### 9.5.3 Was der Abbau nicht anfasst

`scripts/backup.sh` braucht **keine** Aenderung: es sammelt `"$DATA_DIR"/*.db` per nullglob (`:25-27`)
und sichert jede Datei per `sqlite3 .backup` (`:41-43`) — `radio.db` faellt automatisch hinein. ⚠️ Der
Kiosk-Postgres fiel umgekehrt automatisch **heraus**: das Skript kennt nur `*.db` und `BLOB_DIR`
(`:19-21`). **Solange der Alt-Kiosk laeuft, haengt sein Volume an keiner Sicherung, die dieses Repo
kennt** — genau deshalb ist der `pg_dump` aus §9.4.2 Nr. 6 kein Nice-to-have, sondern die einzige
Sicherung, die dieses Volume je hatte.

---

## 9.6 Die Ankuendigung an die Nutzer

**Es sind zwei Aenderungen, also zwei Notizen.** `CLAUDE.md:226-227` verbietet, sie
zusammenzulegen — „Zwei Aufforderungen heissen: es sind zwei Aenderungen, also zwei Notizen", und
`register.test.ts` erzwingt es.

**Form, verbindlich** (`CLAUDE.md:197-203`): je eine Datei
`src/app/m/portal/_lib/neuigkeiten/notizen/radio/<YYYY-MM-DD>-<slug>.ts` **plus** je eine Zeile in
`register.ts`. Das Dreieck ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔ Registerzeile;
`datum` ist der Tag des **Rollouts**, nicht des Commits. Sichtbar ausschliesslich im Portal unter
`/neuigkeiten`. Kein Markdown im Text, keine Werbewoerter, kein Dateiname, Du-Form, Praesens.

**Notiz 1 — fuer alle, die per QR-Code ausleihen.** Ein gescannter Code fuehrt kuenftig in eine
**zeitlich begrenzte** Sitzung statt in einen dauerhaften Zugang. Der entscheidende Satz fuer die
Betroffenen: **der Code hoert nicht auf zu funktionieren — die Sitzung laeuft ab.** Wer nach Ablauf
weiterarbeiten will, scannt erneut. Was gleich bleibt, gehoert ausdruecklich hinein
(`CLAUDE.md:228-229`): **die Ausleihe bleibt anonym**, es wird keine Anmeldung verlangt, und der
Ablauf am Bildschirm bleibt derselbe.

Der Grund gehoert dazu, nicht ein Adjektiv davor: der heutige QR-Code traegt den einen geteilten
Zugangs-Token als URL-Parameter, base64-kodiert
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`, Quellkommentar
„Base64-encode the token to avoid plaintext exposure in URLs" — Base64 ist keine Verschleierung).
Wer den Code abfotografiert, hat **dauerhaft** Vollzugriff auf alle Geraete und alle Ausleihen samt
Namen — ohne Ablauf, ohne Widerruf. **Anonym ist gewollt; unbefristet und unwiderruflich ist der
Fehler.**

**Notiz 2 — fuer die radio-Verwaltenden.** Ein Zugangs-Code ist kuenftig **dauerhaft und sperrbar,
aber nicht loeschbar**. Wer heute einen versehentlich angelegten Code loescht, findet den Knopf nicht
mehr. Der Grund gehoert in die Notiz, weil die Aenderung sonst wie eine fehlende Funktion aussieht:
ein geloeschter Code kann an ein spaeter ausgestelltes Kaertchen zurueckfallen, und historische
Journalzeilen erschienen danach unter dem **neuen** Label. Vorbild derselben Ankuendigung:
`docs/runbooks/lagerbuch-cutover.md:430` (R34).

⚠️ **Zu bestaetigen (Betreiberfrage), und die Antwort aendert den Zeitpunkt der Ankuendigung:**
**sind gedruckte Aufsteller oder Kaertchen mit QR-Code im Umlauf?** Wenn ja, geht die Ankuendigung
**vor** dem Cutover raus und nennt, was mit den gedruckten Exemplaren passiert (sie funktionieren
weiter, nur die Sitzung ist befristet); wenn nein, genuegt die Notiz am Rollout-Tag. **Gedruckt ist
gedruckt** — dieselbe Ueberlegung, die `src/app/m/files/_lib/hostRolle.ts:128-141` fuer seine
Adressen anstellt.

⚠️ **Zu bestaetigen (Betreiberfrage), sichtbar in Notiz 1:** die **Sitzungsdauer**. Vorschlag **12 h**,
zeichengleich zu `lagerbuch` (`.env.example:265`, `LAGERBUCH_HELFER_SITZUNG_STUNDEN=12`) — die Zahl
steht in der Notiz und ist damit oeffentlich, sie muss also vor dem Rollout bestaetigt sein.

⚠️ **Zu bestaetigen (Betreiberfrage), moeglicherweise eine dritte Notiz:** soll bei **angemeldeten**
Nutzern der Benutzername im Ausleihformular **vorausgefuellt** werden (Betreiberantwort 6: „koennten
wir, optional", `docs/radio-portierung-analyse.md:1776`)? Faellt die Antwort auf „ja", ist das eine
bemerkbare Aenderung auf dem Bildschirm und schuldet nach `CLAUDE.md:192-195` eine **eigene** Notiz.
Faellt sie auf „nein", entfaellt sie ersatzlos — die Ausleihe bleibt in der Sache anonym, auch fuer
Angemeldete.

---

## 9.7 Was Spec 2 ausdruecklich **nicht** von hier erbt

| Gegenstand | Warum nicht | Wo es hingehoert |
|---|---|---|
| **`TZ=Europe/Berlin` setzen** | Der Suite-Container faehrt heute ohne `TZ`. Alles, was portal, qr, feedback, files, lagerbuch und aufgaben an Datumsgrenzen gezogen haben, ist in UTC gezogen worden; ein nachtraegliches `TZ` verschoebe jede solche Grenze | Eigener Suite-Posten mit eigener Pruefung gegen **alle** laufenden Module. `radio` haengt bewusst nicht daran |
| **Die CWE-348-Umstellung in `core/ratelimit.ts`** | `core`-Arbeit, die alle Module beruehrt | Eigener Suite-Posten. ⚠️ **Als Voraussetzung benannt, nicht selbst umgesetzt:** der Einloese-Endpunkt des Zugangscodes braucht eine Absenderschluesselwahl, die nicht gefaelscht werden kann. Solange die Umstellung aussteht, ist die Rate-Begrenzung dort eine **Bremse, kein Riegel** — das gehoert so ins Runbook, damit niemand sie fuer mehr haelt |
| **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts`** | Der Kurzschluss ist **kein Versehen**; ihn zu entfernen ist `core`-Arbeit und beruehrt sechs Module | Eigene Suite-Entscheidung. `radio` erreicht dasselbe Ziel modulintern, indem es `isModuleAdmin` gar nicht benutzt — wie `feedback` und `lagerbuch` — und ist damit **vorwaertskompatibel** zur Umstellung des Admin-Modells vom 03.08. |
| **Das suiteweite Gating von `/m/*`** | Dass `/m/<key>/*` von jedem Suite-Host beantwortet wird, ist eine **Klasse** und kein radio-Problem (Falle 61) | Eigene Suite-Spec. Fuer diese Phase genuegt der modulinterne Host-Riegel in der `lagerbuch`-Form (`src/app/m/lagerbuch/_lib/host.ts`) — ⚠️ und er ist bei `radio` **nicht optional**: beide Rollen liegen auf einem Host, die Rolle steckt im Pfad, und ein ungeriegelter Verwaltungspfad auf dem Portal-Host haette **Datenwirkung**, nicht bloss eine kosmetische |

---

## 9.8 Offene Punkte dieses Kapitels, gesammelt

Alle sind **Betreiberfragen oder Messungen am Prod-Bestand** — nichts davon ist im Repo
entscheidbar, und keiner ist ein Platzhalter fuer eine Entscheidung, die diese Spec haette treffen
koennen.

| # | Offen | Wer beantwortet | Blockiert |
|---|---|---|---|
| U1 | Sitzungsdauer des Zugangscodes (Vorschlag 12 h) | Betreiber | Notiz 1 (§9.6), `RADIO_ZUGANG_SITZUNG_STUNDEN` |
| U2 | Sind gedruckte Aufsteller/Kaertchen im Umlauf? | Betreiber | Zeitpunkt der Ankuendigung (§9.6) |
| U3 | Benutzername bei Angemeldeten vorausfuellen? | Betreiber | ob es eine dritte Notiz gibt (§9.6) |
| U4 | Wo laeuft das radio-inventar-Frontend produktiv, und woher kommt `API_TOKEN`? | Betreiber | Vollstaendigkeit der Abbau-Liste (§9.5.1) und der Loeschliste (§9.5.2) |
| U5 | Wie viele Geraete tragen den Alt-Token im `localStorage`? | Begehung im Haus, kein `SELECT` | Umfang des SW-/Speicher-Handgriffs (§9.3.5) |
| U6 | Werden die zwei Pocket-ID-Clients geloescht oder aufbewahrt? | Betreiber | §9.5.2 |
| U7 | Lief `radio-admin` in Prod je mit `AUTH_DEV_BYPASS`? | §9.4.1 Abfrage 8 | Lesbarkeit der Audit-Spalten nach dem Import |
| U8 | Volumengroesse und Dump-Dauer beider Stacks | Messung bei der Generalprobe | Bemessung des Cutover-Fensters (§9.4.2) |
| U9 | Stimmt die 19.07.-Divergenz von Repo- und Server-`compose.yaml`? | Betreiber | nichts — die Aufschreibpflicht aus §9.2.3 folgt schon aus „Struktur gehoert ins Repo" (`docs/radio-portierung-analyse.md:1661-1663`) |

---

# Anhang: Abhängigkeiten und Baureihenfolge

Abgeleitet aus den „Zusage an Kapitel N"-Stellen der Kapitel selbst (mechanisch extrahiert,
35 Zusagen). **Nicht unabhängig geprüft** — der Review-Durchgang fiel aus, siehe Kopf.

| Stufe | Kapitel | Warum hier |
|---|---|---|
| 1 | **1 Zuschnitt** | Registry-Eintrag, Routing, Host-Riegel. Alles andere setzt voraus, dass das Modul existiert und der Riegel steht. Ohne ihn ist jede spätere Fläche von jedem Suite-Host erreichbar (Falle 61) |
| 2 | **2 Datenmodell** | Schema, Migrationen, Zeitstempel-Mapping, Retention-Takt. Kapitel 3, 4, 5 und 6 schreiben alle dagegen |
| 3 | **3 Zugang** | Code, Gate, Sitzung, Abmelde-Route-Handler. Kapitel 4 hängt vollständig daran (die Ausleihfläche liest die Sitzung), Kapitel 5 verwaltet die Codes. ⚠️ Setzt die CWE-348-Umstellung in `core/ratelimit.ts` voraus — **eigener Suite-Posten, vorher fällig** |
| 4 | **6 Grenze** | Die sechs `/v1`-Routen werden Drizzle-Aufrufe. Muss vor jedem Cutover fertig sein (Entscheidung 15); baulich unabhängig von den Oberflächen, deshalb parallel zu Stufe 5 möglich |
| 5 | **4 Ausleihe** und **5 Verwaltung** | Die beiden Oberflächen. Parallel zueinander, aber beide nach 2 und 3. Kapitel 5 trägt den teuersten Einzelposten: die fünf `"use client"`-Tabelleninseln gegen Falle 9 |
| 6 | **7 Betrieb** | Boot-Prüfungen (`radioBootFehler()` muss in `core/bootstrap.ts` eingehängt werden, sonst laufen sie **nie**), Health, Konfiguration, der Abräum-Worker gegen den Service Worker des Alt-Kiosk |
| 7 | **8 Tests** | Als eigene Stufe nur die e2e-Fläche und die Mutationsproben; die Unit-Tests entstehen **mit** ihrem Kapitel, nicht danach |
| → | **9 Übergabe** | Kein Bauschritt. Die verbindliche Liste an Spec 2 |

**Zwei Reihenfolge-Auflagen, die keine Stufe ist:**

* **Die HTTP-Grenze darf erst fallen, wenn Stufe 4 fertig ist** (Entscheidung 15). Wird sie früher
  gekappt, steht der Alt-Kiosk ohne Bestand da; schwenkt die Verwaltung zuerst, verliert er seine
  Datenquelle. Beide Domains ziehen im selben Fenster um.
* **Der Abräum-Worker aus Kapitel 7 gehört zum ersten Deploy**, nicht zum Cutover. Weil der
  Alt-Kiosk denselben Origin hält, überlebt sein Service Worker den Umschwenk — ohne Abräumen
  liefert er gecachte Alt-Oberfläche an Geräte aus, die nie neu geladen haben.
