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
