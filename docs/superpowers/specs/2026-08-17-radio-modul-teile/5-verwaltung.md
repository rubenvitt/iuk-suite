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
