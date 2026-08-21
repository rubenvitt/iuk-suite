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
