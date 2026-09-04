<!-- Entscheidungsstand: verbindlich. Entstanden aus zwei Konkurrenzentwuerfen mit je zwei Juroren
     (Alltagstauglichkeit, Handwerk+Machbarkeit). Geschmacksentscheidungen sind im Dokument getroffen
     und begruendet - es gibt keine offenen Fragen an den Auftraggeber. -->

# Design-Lead-Entscheid: Admin-Bereich des Moduls `feedback` (iuk-suite)

Alle Code-Aussagen sind am Repo geprüft (`/Users/rubeen/dev/personal/drk/iuk-suite`), nicht aus den
Entwürfen übernommen. Wo ein Entwurf oder ein Juror sich am Code irrt, steht die Korrektur dabei.

---

## 1. ENTSCHEIDUNG UND BEGRÜNDUNG

### 1.1 Grundlage

**Grundlage ist Entwurf 2 „Die Lagekarte".** Beide Juroren geben ihm 8/10 gegen 7/10 für die
„Werkbank", und die Begründungen zeigen in dieselbe Richtung: die Schwächen der Lagekarte sind
Bedingungen und Lücken (eine falsch formulierte Sichtbarkeitsregel, ein unbenannter Schließ-
Mechanismus), die Schwächen der Werkbank sind zwei handfeste Baufehler und ein Aufwand, der zur
Nutzungsfrequenz nicht passt.

Zwei dieser Baufehler habe ich am Repo bzw. am CSS-Verhalten nachgeprüft:

- **`align="top"` tötet den Sticky-QR.** `<Row align="top">` setzt `align-items: flex-start`; die
  rechte `Col` schrumpft dann auf Inhaltshöhe und ein `position: sticky` darin hat keine Laufstrecke.
  Genau das war das Kernversprechen der Werkbank („der QR ist NIE weggescrollt"). Die Lagekarte löst
  es richtig (`alignSelf: flex-start` an der Col, sticky am inneren `div`).
- **`size="large"` ist 72px, nicht 56px.** `theme.ts` setzt `controlHeight: TAP` (56) und
  `controlHeightLG: TAP_XL` (72). Die Werkbank baut ihren mobilen Primärknopf auf der Annahme
  „large = 56 = TAP" — er wäre 72px hoch. Die Lagekarte sagt korrekt: `size` im Cockpit gar nicht
  setzen, die Vorgabe **ist** schon das Einsatzmaß.

Der dritte Punkt ist inhaltlich: die Lagekarte hat einen **geschlossenen Zustandsraum** („fünf
Belegungen, kein sechster Fall"). Für einen Nutzer, der die Oberfläche nie lernt, ist das der einzige
belastbare Mechanismus — er muss nicht wissen, wo etwas steht, sondern nur lesen, was an der einen
Stelle steht.

### 1.2 Übernahmen aus „Werkbank"

- **Aus der Werkbank übernehmen wir die zwei Betriebsarten (Einrichtung / Betrieb)**, weil der Juror
  der Werkbank sie ausdrücklich als den einen übertragbaren Teil benannt hat und sie den Leerzustand
  strukturell löst: bei 0 Dienstabenden wird die Zone VERLAUF nicht leer gerendert, sie entfällt.
  **Mit einer Korrektur der Reihenfolge** (siehe 1.4, Schwäche J-A-1'): die Zonenreihenfolge dreht
  sich zwischen den Betriebsarten **nicht** — genau das hatte der Juror der Werkbank als „er hat
  gerade EINE Reihenfolge gelernt, die beim zweiten Besuch schon gedreht ist" kritisiert.
- **Aus der Werkbank übernehmen wir die Rot-Regel als Review-Klausel**, weil der zweite Juror sie
  layoutunabhängig zur Übernahme empfohlen hat und `theme.ts:22-23` sie nötig macht:
  `colorError === colorPrimary === #c8000f`. Die Klausel steht in 4.9 im Imperativ, nicht als
  Absichtserklärung.
- **Aus der Werkbank übernehmen wir die Typo-Skala als Datei** (`_ui/typo.ts`, fertige
  `CSSProperties`-Objekte, keine Ad-hoc-Größe irgendwo), weil die öffentliche Ansicht genau an dieser
  Stelle Kritik bekam („zehn Ad-hoc-Werte") — **aber mit den Werten der Lagekarte** (antds eigene
  Leiter 12/14/16/20/24/30). Eine dritte Skala im Produkt wäre der Fehler, nicht die Lösung.
- **Aus der Werkbank übernehmen wir den Zustand im Browser-Tab** (`generateMetadata`:
  „12/20 · Feedback läuft — Bereitschaft Musterstadt"), weil er den Zustand vor dem ersten Blick auf
  die Seite trägt und null Fläche kostet.
- **Aus der Werkbank übernehmen wir NICHT** das Notenlineal (positionsbasierte 6-Segment-Schiene),
  den verschachtelten `ConfigProvider` mit `controlHeight: 40` und `--ant-*`-Variablen in eigenem
  Markup. Begründungen in 1.3.

### 1.3 Widersprüche zwischen den Juroren — ausdrücklich entschieden

**(W1) Notenlineal vs. Notenpille/Notenspur.** Der Juror der Werkbank nennt das Notenlineal „die
tragende Idee und das größte Wagnis — die Position kann als Menge gelesen werden"; der Juror der
Lagekarte lobt deren Verteilungsspur als eigenständige Idee. **Entscheidung: kein positionsbasiertes
Lineal.** Es gibt genau zwei Bauteile mit klar getrennten Rollen: die **Notenpille** (Ziffer + Wort +
Farbe) überall, wo ein *Mittelwert* steht, und die **Notenspur** (sechs Zellen, Säulenhöhe = Anzahl)
nur dort, wo eine *Verteilung* existiert. Begründung: ein Mittelwert hat keine Verteilung zu zeigen,
und das benannte Risiko („weit rechts = viel") verschwindet, während der Mittelwert weiterhin drei
Kanäle trägt.

**(W2) Bedienelement-Dichte.** Werkbank: verschachtelter `ConfigProvider` mit `controlHeight: 40`,
und sie räumt selbst ein, dass die Wirkung „am Repo nicht belegt, nur plausibel" ist. Lagekarte:
56 behalten, `size` nicht setzen. **Entscheidung: 56 behalten, kein zweiter Provider.** Drei Gründe:
das Cockpit hat drei Formularfelder und eine Handvoll Knöpfe (Dichte ist kein Problem, das gelöst
werden muss), derselbe Gruppenleiter bedient die Seite möglicherweise im Gruppenraum am Handy, und
zwei Bedienelement-Größenwelten in einer Suite erodieren TAP=56 beim nächsten Copy-Paste. Damit fällt
Risiko 7 der Werkbank vollständig weg. Einzige Ausnahme: `size="small"` an den Bedienelementen
*innerhalb* der Verlaufstabelle (Dropdown, Popconfirm-Knöpfe), weil eine 56px-Zeilenaktion die
Tabellenzeile sprengt.

**(W3) `--ant-*` oder eigene Variablen.** Der zweite Juror der Werkbank behauptet,
`cssVar: { key: "iuk" }` präfixe die Variablen zu `--iuk-*`; die Lagekarte sagt, `key` sei nur der
Scope-Key und der Präfix bleibe `ant`. **Am Code geprüft — die Lagekarte hat recht:**
`node_modules/antd/es/config-provider/context.d.ts:124-136` definiert `cssVar?: { prefix?: string;
key?: string }` mit `@default ant` am `prefix`. Die Variablen heißen also `--ant-color-*`.
**Aber die Konsequenz der Lagekarte ist trotzdem richtig, aus einem anderen Grund:** antd deklariert
diese Variablen auf der Scope-Klasse (`css-var-iuk`), die es an die *Wurzelelemente seiner eigenen
Komponenten* hängt — nicht an `:root`. Eigenes Markup außerhalb eines antd-Komponentenbaums (die
Kopfzone, die Notenspur direkt auf der Seite, die Druckansicht ohne `ConfigProvider`) sieht diese
Variablen **nicht**, und `pnpm build` merkt es nicht: `var(--ant-color-border-secondary)` löst
einfach ins Leere auf und die Haarlinie verschwindet still. **Entscheidung: eigene `--fb-*`- und
`--note-*`-Variablen** (4.10), `--ant-*` ausschließlich in Props von antd-Komponenten.

**(W4) Tabellendichte.** Werkbank `size="small"` (~48px), Lagekarte `size="middle"` (~56px).
**Entscheidung: `middle`.** Ein Nutzer, der einmal pro Woche zwei Minuten hier ist, sucht ein Datum
und liest keine Datenmaske; 12 Zeilen à 56px sind 672px, das ist bezahlbar.

**(W5) Kontrast-Begründung.** Der zweite Juror der Lagekarte hat nachgerechnet und einen
Beleg-Fehler gefunden: Weiß auf `#2F7F59` ist 4,88:1 und liegt damit **über** AA-4,5:1, nicht
darunter. **Der Juror hat recht, die Entscheidung bleibt** — aber mit der richtigen Begründung: eine
12–18%-Tönung der Notenfarbe darf **keinen Text tragen**, weil die Notenfarbe *auf* ihrer eigenen
Tönung nur ~2:1 erreicht. Tönungen sind deshalb ausschließlich textfreie Diagramm-Bänder (4.11);
Notenflächen, die Text tragen, sind immer vollgesättigt mit `--note-ink`.

**(W6) „Eine Änderung außerhalb des Moduls oder keine?"** Beide Entwürfe wollen `data-theme` auf
`<html>`. **Entscheidung: ja, und zwar als Suite-Änderung** — nicht weil dieses Modul sie braucht,
sondern weil die verbindliche Spec der öffentlichen Ansicht sie bereits fordert
(`docs/design/feedback-oeffentliche-ansicht.md`, §3.4: „`src/app/layout.tsx` setzt zusätzlich
`data-theme={mode}`"). Es gibt also einen zweiten Nutznießer, bevor die Zeile existiert. Ergänzt um
den Fund der Lagekarte: `AntdProvider` schreibt beim Umschalten über `setPreference` (`auto | light |
dark`) `document.documentElement.dataset.theme` und `style.colorScheme` mit (`AntdProvider.tsx`) —
sonst bleiben Notenfarben bis zur nächsten Navigation auf der alten Palette.

### 1.4 Die von der Jury benannten Schwächen des Gewinners — Lösung je Schwäche

| # | Schwäche (Quelle) | Lösung |
|---|---|---|
| J-A-1 | **Slot 3 „Letzter Abend" ist als „nur wenn die letzte Umfrage geschlossen ist" definiert** — läuft eine neue, verschwindet die Karte genau im geprüften Szenario 4 | Nicht der Satz wird geflickt, sondern die Auswahl wird zu einem **deterministischen Selektor** (2.2). `letzterAbend` = jüngster Abend mit *effektiv* geschlossener/archivierter Umfrage **und** ≥1 Rückmeldung — unabhängig davon, ob etwas läuft. Zusätzlich trägt der Zwischenstand im Zustand LÄUFT die Überschrift „ZWISCHENSTAND — noch nicht endgültig", damit er nicht mit der gesuchten Auswertung verwechselt wird (dieselbe Schwäche fand der Werkbank-Juror in ihrem Entwurf) |
| J-A-1' | **Reihenfolgewechsel zwischen Woche 1 und Woche 2** (Kritik am Konkurrenten, trifft die Übernahme) | Die Zonenreihenfolge ist in **beiden** Betriebsarten identisch (Lagekarte, Teilnahme, Verlauf, Einstellungen). „Einrichtung" lässt nur VERLAUF weg und setzt eine Schrittzeile *in* die Lagekarte. Kein Layout dreht sich je um |
| J-A-2 | **Der Schließ-Mechanismus ist nirgends benannt** — Cron? Lazy? Davon hängt ab, in welchem Zustand der Rückkehrer landet | Entschieden in 2.2/4.4: **kein Cron.** Die Cockpit-Seite rechnet den *effektiven* Status mit `nextStatusOnAccess` (rein, kein Write — Prefetch-sicher, so wie `evenings/[eveningId]/page.tsx:45-55` es begründet) und faltet eine abgelaufene aktive Umfrage in den Zustand RUHEND. Persistiert wird ausschließlich auf echten POSTs: der Teilnahmepfad tut es schon (`actions.ts:205-208`), `createAndStartSurvey` schließt aktive Geschwister in derselben Transaktion (`queries.ts:174-183`), und `beendenAction` schreibt explizit. Folge: die Frist verstreicht, die Seite zeigt sofort „nichts läuft" plus „Letzter Abend", ohne dass irgendwo ein Job läuft — und der Live-Zähler behauptet nie Aktualität für eine tote Umfrage |
| J-A-3 / J-B-3 | **Zuordnung der Gruppenleiter hat keine Datenquelle** (`user_groups.userId` = roher OIDC-`sub`, `schema.ts:87-98`) | Entschieden, nicht offengelassen (2.6): kein `Select`. Zone e zeigt eine **Tabelle der zugeordneten Kennungen** (mono, plus a1 „hat sich noch nicht angemeldet", wenn kein Anzeigename bekannt ist) mit Entfernen-Aktion und ein `Input` „Kennung oder E-Mail hinzufügen" (`insertUserGroup`, `queries.ts:30` existiert). Der Unterblock ist **nur für Voll-Admins** sichtbar — ein Gruppenleiter braucht ihn nie und würde an rohen `sub`-Werten scheitern. Damit ist Zone e vollständig funktionsfähig (Name, Frist, Secret, Löschen) und der Teil, der auf ein Verzeichnis wartet, ist genau der, den die Zielperson nicht benutzt. Umstellung auf `Select mode="multiple"`, sobald der OIDC-Provider eine Nutzersuche anbietet — als TODO am Bauteil, nicht als Frage an den Auftraggeber |
| J-B-1 | **Selbstwiderspruch bei den Client-Grenzen** („genau fünf Client-Komponenten", aber `Popconfirm` in der als Server deklarierten Lagekarte) | Aufgelöst durch eine ehrliche Inventarliste (4.13): **sieben** Client-Komponenten, und die Regel „alles, was `Popconfirm`, `render`, `onChange` oder `useActionState` braucht, liegt in `_ui/` mit `"use client"`". Die Zahl ist kein Qualitätsmerkmal — die RSC-Grenze ist eins |
| J-B-2 | **Zone a ist auf 390px im Zustand RUHEND nicht „immer sichtbar"** (die Kompensation „QR groß zeigen" gab es nur im Zustand LÄUFT) | Die Lagekarte trägt den Sekundärknopf **„QR-Code groß zeigen" in jedem Zustand** (in C/D als Primäraktion, in A/B als Sekundärknopf neben „Feedback starten"). Damit ist Zone a auf jedem Gerät und in jedem Zustand ein Tipp entfernt, ohne dass eine Karte ihre Position wechselt |
| J-B-5 | **Kontrast-Fehlschluss** (4,88:1 als „unter AA" bezeichnet) | Korrigiert in W5: Zahl richtiggestellt, Entscheidung mit der tragfähigen Begründung neu belegt |
| Risiko 4 des Entwurfs | **Sticky-Spalte kippt auf flachen Laptops**, kein Mechanismus verhindert es | `maxHeight: calc(100dvh - 96px); overflow-y: auto; overscroll-behavior: contain` am sticky-Wrapper. Wächst die Karte über die Viewporthöhe, scrollt sie in sich statt „Aushang drucken" unerreichbar zu machen |
| Risiko 7 des Entwurfs | **Die mobile Zeilenliste ist eine zweite Oberfläche** (`Grid.useBreakpoint()` entscheidet erst nach der Hydration) | Entschärft ohne zweites Layout: die Verlaufsdarstellung ist **CSS-gesteuert** (beide Varianten im HTML, `@media (min-width: 768px)` schaltet), `useBreakpoint()` wird nicht verwendet. Kostet ein paar hundert Byte Markup und beseitigt den Umbau nach der Hydration vollständig |

### 1.5 Fünf Funde am Code, die beide Entwürfe und alle vier Juroren übersehen haben

1. **`createAndStartSurvey` existiert bereits** — `_db/queries.ts:146-200`, transaktional, mit Tests
   (`queries.test.ts:264`), und **ohne einen einzigen Aufrufer im App-Code**. Beide Entwürfe
   beschreiben stattdessen ein eigenes Rezept (`insertEvening` → `insertSurvey` → `activateSurvey`),
   das die vorhandene, getestete Transaktion dupliziert. `startFeedbackAction` ist damit ein
   Zehnzeiler, keine DB-Arbeit.
2. **`computeClosesAt` rechnet nicht „ab jetzt".** Signatur ist
   `computeClosesAt(eveningDate, closeAfterHours)` und liefert *Mitternacht nach dem lokalen
   Abendtag + Stunden* (`_lib/lifecycle.ts:78-82`). Beide Entwürfe schreiben `computeClosesAt(now,
   hours)` und texten „läuft dann 48 Stunden". **Jede Fristaussage der Oberfläche wird aus
   `computeClosesAt(evening.date, hours)` formatiert, nie aus „jetzt + h".** Zusätzlich ein echter
   Defekt im Ist-Code: `actions.ts:156` übergibt `now` als `eveningDate` — beim Starten eines
   Altbestands-Entwurfs bekommt der Abend damit eine Frist, die vom Klickzeitpunkt abhängt statt vom
   Abenddatum. Wird mit `evening.date` korrigiert.
3. **`listEvenings` hat kein `ORDER BY`** (`queries.ts:63-65`) — die Reihenfolge ist
   Einfüge-/Rowid-Reihenfolge. Der Verlauf sortiert selbst (`date` desc); wer sich auf die DB-Ordnung
   verlässt, bekommt bei nachgetragenen Abenden eine falsch sortierte Tabelle ohne Fehlermeldung.
4. **`revalidate()` erreicht das Cockpit nicht.** `actions.ts:40-43` revalidiert `/m/feedback` und
   `/m/feedback/admin` — die Cockpit-Route `/m/feedback/groups/{id}` steht in keiner der beiden
   Listen. Der ganze Entwurf hängt daran, dass dieselbe Seite nach dem Klick den neuen Zustand zeigt:
   `revalidatePath("/m/feedback", "layout")`.
5. **`stars` bricht die Ampel — und `overallAvg` ist heute schon falsch.**
   `aggregation.ts:35-41` schiebt Rating-Fragen **beider** Skalen (`schulnote` 1–6, `stars` 1–5) in
   dasselbe `ratingAvgs`; ein gemischter Fragebogen erzeugt also einen bedeutungslosen Mittelwert,
   und ein 1–5-Ø von 4,2 würde in der Ampel wie eine 4,2 auf der Schulnotenskala eingefärbt.
   Entscheidung in 4.12.

---

## 2. COCKPIT-SPEZIFIKATION

Route: `/m/feedback/groups/{groupId}` — die einzige Arbeitsseite. Server Component; die
Client-Inseln liegen in `(admin)/_ui/`.

### 2.1 Seitengerüst

`FullShell` liefert `Content` mit `padding: 16` (`FullShell.tsx:45`). Darin **ein** Wrapper:
`maxWidth: 1120, margin: "0 auto", display: flex, flexDirection: column, gap: 24`. Kein weiterer
Container, keine verschachtelten Karten.

Reihenfolge im DOM — **in jedem Zustand und in jeder Betriebsart dieselbe**:

1. Kopfzone (flach, keine Karte) — Muster in 4.2
2. Arbeitsfeld `Row gutter={[24,24]}`
   - `Col xs={24} lg={15}`: **Letzter Abend** (bedingt) → **Lagekarte** (immer) → **Nächsten Abend
     starten** (nur bei laufender Umfrage, eingeklappt)
   - `Col xs={24} lg={9}` mit `alignSelf: "flex-start"`: **Teilnahme**, darin
     `<div style={{position:"sticky", top:80, maxHeight:"calc(100dvh - 96px)", overflowY:"auto"}}>`
     (80 = Header 64 + 16; sticky nur ab `lg`, darunter `position: static`)
3. **Verlauf** (volle Breite; entfällt in der Betriebsart „Einrichtung")
4. **Einstellungen** (volle Breite, eingeklappt, `marginTop: 32`)

Umbruch bei `lg` (992). Zwischen 768 und 991 einspaltig, weil die rechte Spalte sonst unter 300px
fällt und der QR (200 + 2×12 Polster + Kartenpolster) klemmt.

**Betriebsart „Einrichtung"** (0 Dienstabende): dasselbe Gerüst, aber `maxWidth: 760`, einspaltig,
VERLAUF entfällt vollständig (kein leeres Fach), und die Lagekarte trägt eine Schrittzeile. Die
Reihenfolge bleibt Lagekarte → Teilnahme.

**Kartenstil (alle Zonen).** `Card variant="outlined"`, `styles={{ header: { minHeight: 40,
paddingInline: 20, borderBottomColor: "var(--fb-split)" }, body: { padding: 20 } }}`, mobil
`body.padding: 16`. `borderRadius: 8` (Token). **Kein Schatten** — Schatten hat nur, was schwebt
(Dropdown, Modal, Popconfirm). Innere Gliederung ausschließlich 1px `var(--fb-split)`-Haarlinie mit
16px Luft davor/danach. Card-Titel ist immer ein **String** (nie ReactNode → RSC-Falle 1), gesetzt in
`T.kicker`.

### 2.2 Der Zustands-Selektor (eine Stelle, vor allem Rendern)

`_lib/cockpit.ts`, rein und testbar. Genau hier — nicht in der JSX — entscheidet sich, was die Seite
zeigt:

```ts
const now = new Date();

// activeSurveyForGroup filtert in SQL auf status='active' und liefert deshalb AUCH
// eine abgelaufene, noch nicht persistierte Umfrage. Das Falten passiert hier:
const roh = activeSurveyForGroup(db, groupId);
const laufend =
  roh && nextStatusOnAccess("active", roh.survey.closesAt, now) === "active" ? roh : null;

const alle = listEvenings(db, groupId)          // KEIN ORDER BY in der Query
  .map((e) => ({ evening: e, survey: getSurveyByEvening(db, e.id) }))
  .map((x) => ({ ...x, effektiv: x.survey
      ? nextStatusOnAccess(x.survey.status as SurveyStatus, x.survey.closesAt, now)
      : null }))
  .sort((a, b) => b.evening.date.getTime() - a.evening.date.getTime());

const verlauf     = alle.filter((x) => x.evening.id !== laufend?.evening.id);
const letzterAbend = verlauf.find(
  (x) => (x.effektiv === "closed" || x.effektiv === "archived") && x.responseCount >= 1,
) ?? null;                                       // unabhaengig davon, ob etwas laeuft
const altbestand  = verlauf.filter((x) => x.effektiv === "draft");  // NIE in der Lagekarte
const modus       = alle.length === 0 ? "einrichtung" : "betrieb";
```

**Zwei aktive Umfragen** (theoretisch möglich, weil `setSurveyStatus` keinen Übergangs-Check hat und
`activeSurveyForGroup` per `.get()` stumm eine beliebige liefert): es gilt die mit dem jüngsten
`activatedAt`; unter der Lagekarte erscheint dann eine neutrale Zeile „Eine weitere Umfrage ist
aktiv: 12.03. — beenden". Kein undefinierter Zustand auf der einzigen Arbeitsseite.

### 2.3 Zone b+c — DIE LAGEKARTE (`_ui/Lagekarte.tsx` + `_ui/StartFormular.tsx`)

**Zweck.** Der einzige Platz der Seite, der seinen Inhalt wechselt. Er ist entweder das
Startformular oder die laufende Umfrage — nie beides, nie keins. Dadurch muss der Nutzer nicht
wissen, *wo* der Zustand steht, sondern nur lesen, *was* dort steht.

**Bausteine.** `Card` (Server) · `Statistic` mit `valueStyle` (Server, ohne `formatter`) ·
`Progress` ohne `format`, zwingend `strokeColor="var(--fb-ink)" trailColor="var(--fb-fill)"`
(antds Vorgabe ist `colorPrimary` = Suite-Rot; ein roter Rücklaufbalken liest sich als Alarm) ·
Notenspur (eigenes Server-Markup) · **Client:** `StartFormular` (`useActionState`, `Input`,
`Input type="date"`, `Button`, `Popconfirm`), `QrGross` (Modal), `BeendenKnopf` (Popconfirm),
`Aktualisierer` (rendert nichts).

**Die fünf Belegungen.**

| Belegung | Kicker (T.kicker) | Lautes Element | Primäraktion | Sekundär |
|---|---|---|---|---|
| **A Erststart** (Modus einrichtung) | ERSTER SCHRITT | Überschrift T.h2 „Ersten Dienstabend anlegen und Feedback starten" | „Feedback starten" | „QR-Code groß zeigen" |
| **B Ruhend** (Abende da, nichts läuft) | NÄCHSTER SCHRITT | Überschrift T.h2 „Feedback für heute starten" | „Feedback starten" | „QR-Code groß zeigen" |
| **C Läuft, 0 Antworten** | ● LÄUFT SEIT MI, 19:32 | Satz T.body „Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends." | „QR-Code groß zeigen" | „Feedback jetzt beenden" |
| **D Läuft, Antworten da** | ● LÄUFT SEIT MI, 19:32 | `Statistic` „12" (30/600, tabular) + Suffix „von 20" | „QR-Code groß zeigen" | „Feedback jetzt beenden" |
| **E Altbestand-Entwurf** | — | — | — | — (die Karte bleibt in A/B; der Entwurf lebt ausschließlich als Verlaufszeile) |

Belegung E ist bewusst **kein** Zustand der Lagekarte: ein Altdatensatz darf die Führung der Seite
nicht kapern.

**A/B, Inhalt.** Kicker · Überschrift T.h2 · das Formular (eine Zeile, drei Felder) · Primärknopf ·
darunter T.meta die **gerechnete** Frist: „Läuft dann bis Sa., 26.07., 00:00" (aus
`computeClosesAt(gewähltes Datum, group.closeAfterHours ?? 48)`, in `Europe/Berlin` formatiert — nie
„48 Stunden ab jetzt"). Rechts oben in der Karte T.meta: „Gerade läuft kein Feedback." In Belegung A
zusätzlich als erste Zeile T.body: „Schritt 1: unten das erste Feedback starten. Schritt 2: den
Aushang aufhängen — der Code gilt dauerhaft."

**Das Formular.** `Row gutter={[12,12]}`: Datum `Col xs={24} sm={8}` (`<Input type="date"
name="date" required>`, vorbelegt mit **heute in Europe/Berlin**, berechnet über
`Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(new Date())` — nicht über
`toISOString()`, das zwischen 00:00 und 02:00 Ortszeit auf den Vortag kippt) · Thema
`Col xs={24} sm={10}` · Teilnehmerzahl `Col xs={12} sm={6}` (`type="number"`, vorbelegt mit der
Teilnehmerzahl des letzten Abends). Labels als eigene `<label>` in T.kicker **über** den Feldern,
nicht als Placeholder-Ersatz. Vier Felder werden zu drei: `notes` fällt weg (im Ist-Zustand ein
viertes Feld ohne Leser) und ist über „Bearbeiten" in der Verlaufszeile erreichbar.
`DatePicker` entfällt zugunsten von `<Input type="date">`: server-render-fest, native Tastatur am
Handy, kein Locale-Bundle, vorbelegbar ohne Client-JS.

Ein Klick → `startFeedbackAction` → `createAndStartSurvey(db, {...})` (die vorhandene Transaktion,
1.5/1) → `revalidatePath("/m/feedback", "layout")` → dieselbe Seite steht in Belegung C.

**C/D, Inhalt.** Karte getönt (`background: var(--fb-tint)`) — **die einzige getönte Fläche der
Seite**, dadurch ist „hier passiert gerade etwas" eine Flächenaussage vor dem ersten Wort. Kicker mit
8px-Punkt (`@keyframes` Opazität 1 → .35, 2s; `prefers-reduced-motion: reduce` stellt den Puls ab,
der Punkt bleibt) · Überschrift T.h2 „Erste Hilfe Auffrischung · Mi, 22.07." · Zähler
(`Statistic` 30/600 tabular + „von 20" 16/500 gedämpft, darunter `Progress percent`
`showInfo={false}` und T.meta „60 % Rücklauf") · Haarlinie · **Zwischenstand**: Überschrift T.kicker
„ZWISCHENSTAND — NOCH NICHT ENDGÜLTIG", Notenlegende einmal, dann acht kompakte Notenspuren; bei 1–2
Antworten darüber T.meta „Erst 2 Rückmeldungen — die Zahlen schwanken noch stark." Freitexte werden
hier **nur gezählt** („5 Freitexte — in der Auswertung nachlesen"): die Karte ist im Gruppenraum
sichtbar, während die Leute noch tippen · Fußzeile T.meta „Stand: 21:47" (serverseitig formatiert) +
Textknopf „Aktualisieren" · Haarlinie · „Feedback jetzt beenden" (`Button` **default**, nicht
`danger` — geplanter Schritt, kein Notausgang; `Popconfirm`: „Danach kann niemand mehr antworten. Die
Auswertung bleibt erhalten.", okText „Beenden").

Fehlt `participantCount`: „12 Rückmeldungen", kein „von", kein Progress — es wird **nie** ein Nenner
erfunden; dazu ein Textknopf „Teilnehmerzahl nachtragen", der die Zeilenbearbeitung öffnet. Ist der
Rücklauf größer als die Teilnehmerzahl: Progress bei 100 % gekappt, T.meta „mehr Rückmeldungen als
erfasste Teilnehmer" — neutral, kein Fehler.

**Slot darunter (nur C/D): „Nächsten Dienstabend starten".** `Collapse` (ghost, zu), Label T.body +
T.meta „beendet die laufende Umfrage". Aufgeklappt dasselbe Formular, Primärknopf „Laufende beenden &
neue starten" in einem `Popconfirm`. Die Zweistufigkeit ist reine UI: `createAndStartSurvey` schließt
aktive Geschwister in derselben Transaktion (`queries.ts:174-183`), es kann also kein Zwischenzustand
entstehen.

**Laptop.** Karte volle Spaltenbreite (`lg=15` von 1120 ≈ 630px), Kartenpolster 20.
**390px.** Kartenpolster 16, Zähler 30px bleibt (die Zahl muss aus zwei Metern lesbar sein), „von 20"
unter die Zahl, `Progress` volle Breite, Primärknopf `block` in Standardhöhe 56 (**nicht**
`size="large"` = 72), „Feedback jetzt beenden" darunter mit 16px Abstand und `block` — nie neben dem
Primärknopf. Formularfelder gestapelt, volle Breite. Notenspur-Zeile bricht auf zwei Reihen
(Fragetext + Pille oben, Spur darunter volle Breite).

### 2.4 Zone a — TEILNAHME (`_ui/Teilnahme.tsx`, Server, mit zwei Client-Inseln)

**Zweck.** Die Zusage, die den Wochenaufwand von „QR erzeugen" auf „nichts" senkt: der Code hängt an
der Gruppe, nicht am Abend.

**Inhalt von oben.** Kartentitel „DAUERHAFTER ZUGANG" · QR: `<img src={`/f/${slug}-${secret}/qr.png`}
width={200} height={200} alt="">` in einem Kasten mit `background: #ffffff` **hart, auch im
Dunkelmodus** (ein QR auf dunklem Grund ist von vielen Scannern nicht lesbar; dieselbe Regel wie in
`QrDisplay`), `padding: 12`, `borderRadius: 8`, `border: 1px solid var(--fb-line)` · Klartext-URL:
eigener Block, `background: var(--fb-tint)`, `padding: 8px 12px`, `borderRadius: 6`,
`fontFamily: var(--font-geist-mono)`, 13px, `wordBreak: break-all`, `userSelect: all` · Knopfzeile
`Space wrap` (**`orientation`**, nicht `direction` — antd 6 hat die Prop umbenannt; der frühere
Belegort `(admin)/EveningForm.tsx` ist mit dem Umbau entfallen, das Modul benutzt heute Flexbox):
„Kopieren" (default), „PNG" (`<a download>`), „Aushang drucken" (`type="text"`, neuer Tab) ·
Haarlinie · Kernaussage T.body, **nicht gedämpft**: „Einmal ausdrucken reicht. Der Code bleibt für
alle künftigen Dienstabende gültig — er hängt an der Gruppe, nicht am Abend."

**Die URL wird aus `headers().get("host")` gebaut**, nicht über `moduleUrl("feedback")`: die Registry
führt `feedback` mit `prodHosts: []` (`registry.ts:56`), `moduleUrl` liefert in Prod also `null`
(`moduleUrl.ts:19-22`). Dieselbe Herleitung nutzt die `qr.png`-Route schon (`route.ts:22-24`), mit
demselben Kommentar zum Host-Rewrite.

**Totlauf-Scan** (Kritik des Werkbank-Jurors: jemand scannt an einem Abend ohne laufendes Feedback):
bereits gelöst und nicht hier zu wiederholen — die öffentliche Ansicht hat dafür Zustand C
(„Zurzeit läuft keine Umfrage … Der QR-Code bleibt gültig — probier es am Ende des nächsten Abends
noch einmal.", verbindliche Spec §3.2). Eine Warnung auf der Admin-Karte wäre eine zweite Wahrheit.

**Zustände.** Die Zone ist in allen vier Zuständen identisch — sie hängt an der Gruppe, nicht an der
Umfrage. Einzige Variante: in Belegung A (Gruppe ganz neu) trägt sie als erste Zeile T.meta „Du kannst
den Aushang schon vor dem ersten Abend drucken."

**Laptop.** Rechte Spalte, sticky (2.1). **390px.** Position 3 im DOM, `position: static`, QR bleibt
200px zentriert (ein 350px-QR liest sich nicht besser und drückt die URL unter die Falz), Knöpfe
„Kopieren"/„PNG" gestapelt `block`, „Aushang drucken" darunter als Textknopf. Der zeitkritische
Handgriff im Gruppenraum ist **nicht** diese Karte, sondern „QR-Code groß zeigen" in der Lagekarte —
in jedem Zustand ein Tipp weit oben (J-B-2).

### 2.5 Zone d — VERLAUF (`_ui/Verlauf.tsx`, Client)

**Zweck.** Die Frage „was war letzte Woche, was vor drei Wochen" ohne Seitenwechsel beantworten.

**Kopfzeile** über der Tabelle, flach, `display: flex; justify-content: space-between; align-items:
flex-end`: links Kartentitel-Kicker „VERLAUF" + Notenfunke (Sparkline 132×28, 4.11) + T.meta „Ø der
letzten sechs Abende: 2,1 gut"; rechts drei `Button type="text"`: „Trend", „CSV (alle Abende)",
„Abend ohne Feedback nachtragen". Der dritte deckt den Fall ab, den der Ein-Klick-Start sonst wegnimmt
(Abend dokumentieren, ohne Feedback zu erheben) — bewusst als leiser Textknopf, nicht als zweites
Formular.

**Die Tabelle steht ohne Karte direkt auf dem Seitengrund.** Eine Tabelle in einer Karte auf einer
Seite ist der dritte Rahmen für dieselbe Aussage.

`Table size="middle" pagination={{ pageSize: 12, hideOnSinglePage: true, size: "small" }}`,
kein Zebra, 1px `var(--fb-split)` zwischen den Zeilen, Hover `var(--fb-tint)`.

| Spalte | Breite | Inhalt |
|---|---|---|
| Datum | 140 | „22.07.2026" (14/600, tabular) + „Mittwoch" (12, gedämpft); Standardsortierung absteigend |
| Thema | flex | 14, `ellipsis`; leer → „—" in `--fb-muted` (nie „(ohne Thema)") |
| Rücklauf | 110, rechts | „14 / 18" tabular + 60px-Balken in `--fb-ink`; ohne Teilnehmerzahl „14" + T.meta „—" |
| Ø Note (1 = beste) | 150 | **Notenpille** + Wort; kein Wert → „—" ohne Pille |
| Zustand | 150 | nur belegt: `Tag` (neutral, randlos) „Entwurf (Altbestand)" |
| Aktion | 130, rechts | Link „Auswertung" + `Dropdown menu={{items}}` „…" mit Bearbeiten / Löschen (`size="small"`) |

**Warum Client:** `columns[].render`, `onRow`, `Dropdown`-`items` und `Popconfirm`-Handler sind
Funktionen; eine Server Component kann sie nicht übergeben („Functions cannot be passed to Client
Components"). Genau darum trägt schon das heutige `GroupList.tsx` `"use client"`, obwohl `Table`
selbst als sicher gilt.

**Zustände.** *nichts läuft*: alle Abende stehen in der Tabelle. *läuft gerade*: der laufende Abend
erscheint **nie** in der Tabelle — er steht in der Lagekarte, und derselbe Abend zweimal auf einer
Seite ist genau die Unschärfe, die den Ist-Zustand unlesbar macht. *Gruppe ganz neu*: die Zone
entfällt (Betriebsart Einrichtung). *Altbestand-Entwurf*: Zeile mit `Tag` „Entwurf (Altbestand)" und
zusätzlichem Knopf „Jetzt starten" in der Aktionsspalte (`Popconfirm`, weil es eine laufende Umfrage
ersetzen würde; ruft `activateSurveyAction` mit dem 1.5/2-Fix).

**Laptop.** volle Breite. **390px.** Kein horizontal scrollendes `Table` und **kein
`useBreakpoint()`**: beide Darstellungen liegen im HTML, `@media (min-width: 768px)` schaltet.
Schmalvariante = pro Abend ein 68px hoher Block, die ganze Fläche ein Link zur Auswertung; Reihe 1
Datum (14/600) links + Notenpille rechts, Reihe 2 Thema (12, ellipsis) + „14 / 18"; ganz rechts ein
44px-Bereich mit dem „…"-Dropdown (`stopPropagation`, damit es nicht mit dem Zeilenlink kollidiert).
Haarlinien zwischen den Zeilen, keine Karte pro Zeile. Der Notenfunke bleibt (56px hoch, volle
Breite) — am Handy ist er der einzige Trend, den man ohne Scrollen erfasst.

### 2.6 Zone e — EINSTELLUNGEN (`_ui/EinstellungenPanel.tsx`, Client)

**Zweck.** Alles, was man selten braucht, an einem Ort und ohne eigene Route.

`Collapse items={[…]}` (nicht `Collapse.Panel`) in einer Card, `variant`-los, zu. Label 14/600
„Einstellungen" + T.meta „Name, Frist, Zugang" (für Admins „…, Leitung, Zugang"). Aufgeklappt in
dieser Reihenfolge:

1. **Gruppe** — `<form>` mit `useActionState`: Gruppenname (`Input`), Standard-Schliessfrist
   (`InputNumber`, Suffix „Stunden", Hilfetext „Vorgabe: 48 Stunden. Gilt für jede neu gestartete
   Umfrage — gerechnet ab Mitternacht nach dem Abendtag."), Speichern (`default`, nicht `primary` —
   es gibt genau einen Primärknopf pro Seite, und der steht in der Lagekarte).
   `slug` ist **nicht** editierbar: er steckt in jedem gedruckten QR-Code; ein Slug-Wechsel ist
   funktional dasselbe wie „Neues Secret erzeugen" und gehört deshalb nicht in ein Speichern-Formular.
2. Haarlinie · **Leitung** (nur `isFeedbackAdmin`) — Tabelle der zugeordneten Kennungen (mono 13,
   plus T.meta „hat sich noch nicht angemeldet", wenn kein Anzeigename bekannt ist) mit
   Entfernen-Aktion, darunter `Input` + Knopf „Kennung oder E-Mail hinzufügen". Begründung und
   TODO siehe 1.4/J-A-3.
3. Haarlinie · **FOLGENSCHWER** (Kicker), zwei Zeilen mit Erklärung links und Knopf rechts:
   - „Neues Secret erzeugen" — `Button danger` (Umriss), `Popconfirm`: „Bestehende QR-Codes und
     gedruckte Aushänge werden ungültig und müssen neu ausgehängt werden.", okText „Secret neu
     erzeugen".
   - „Gruppe löschen" — `Button danger` (Umriss), `Modal` mit Eingabefeld: der Gruppenname muss
     abgetippt werden, Knopf bis dahin `disabled`; T.meta „Löscht 12 Dienstabende und 143
     Rückmeldungen unwiderruflich." (Zahlen aus der Seite, nicht behauptet).

`type="primary" danger` ist im ganzen Modul verboten: `colorError === colorPrimary` (`theme.ts:22-23`)
macht einen gefüllten Gefahrenknopf pixelgleich mit dem normalen Primärknopf.

**Zustände.** In allen vier Zuständen identisch und eingeklappt. Bei „Gruppe ganz neu" ebenfalls
eingeklappt — nichts davon braucht man im Gruppenraum.
**390px.** Volle Breite, Felder gestapelt, Speichern `block`, der Gefahrenblock zuverlässig am Fuß:
die Reihenfolge harmlos → folgenschwer ist am Handy der einzige Schutz, weil beide Knöpfe gleich groß
sind.

### 2.7 Slot „Letzter Abend" (bedingt, über der Lagekarte)

**Zweck.** Beantwortet „habe ich das schon gelesen?" ohne Klick — und beantwortet damit das Szenario
„eine Umfrage läuft, ich will trotzdem die vom letzten Mal sehen" (J-A-1).

Sichtbar, wenn `letzterAbend !== null` (2.2) — **auch während eine Umfrage läuft**. Kicker „LETZTER
ABEND", Zeile „Mi, 22.07. · Erste Hilfe Auffrischung", darin `Statistic` „14 Rückmeldungen" (20/600 —
die 30 gehört dem laufenden Zähler), Notenpille + Wort, Knopf `default` „Auswertung ansehen".
Bewusst kein Primärknopf: der Primärknopf ist immer die Zustandsaktion.

---

## 3. DIE ÜBRIGEN SCREENS

### 3.1 Einstieg `/m/feedback`

Serverseitig: **genau eine zugängliche Gruppe UND kein Voll-Admin** → `redirect("/m/feedback/groups/
{id}")`. Die Admin-Ausnahme ist nötig, sonst käme ein Admin mit einer Gruppe nie an „Neue Gruppe" und
„Gruppenvergleich".

Sonst: Kopfzone (4.2) mit `<h1>` „Deine Gruppen" (24/600) und T.meta „Je Gruppe ein dauerhafter
QR-Code."; rechts für Admins `Button type="text"` „Gruppenvergleich". Dann `Row gutter={[16,16]}`,
`Col xs={24} sm={12} xl={8}`: pro Gruppe eine `Card hoverable`, komplett in ein `next/link`
gewickelt (`display: block; text-decoration: none; color: inherit`), Hover hebt nur die Rahmenfarbe
(120ms). Karteninhalt: Gruppenname 16/600 · Zustandszeile 13px — läuft: pulsierender Punkt + „läuft ·
12 von 20" + T.meta „schließt Sa., 00:00"; ruhend: „nichts aktiv · letzter Abend 12.03." · rechts
oben die **Notenpille + Wort** des letzten ausgewerteten Abends (Wort, nicht Lineal — hier fehlt jede
Legende, also muss die Ziffer plus Wort allein tragen; das war die „Legenden-Lücke" der Jury).
Sortierung: laufende zuerst, dann nach letztem Abend absteigend. Ab 8 Gruppen zusätzlich
`Input.Search` (Client) — kein `Segmented`, weil Nicht-Admins nur ihre eigenen sehen und Admins alle.
Für Admins als letzte Karte eine gestrichelte „+ Neue Gruppe" → `Modal` mit Name/Slug/Frist (keine
Route). Zugang ohne Gruppe → `Result status="info"`, „Dir ist noch keine Gruppe zugeordnet."

**Test-Hooks bewahren:** `data-testid="group-row"` bleibt auf der Gruppenkarte und der `href` bleibt
`/m/feedback/groups/{id}` — der IDOR-Test liest die ID per Regex aus genau diesem `href`
(`e2e/feedback.spec.ts:109-112`).

### 3.2 Auswertung `/m/feedback/groups/{gid}/evenings/{eid}/auswertung`

Kopfzone: Breadcrumb · `<h1>` „Auswertung — Mi, 22.07.2026" · Zeile 14px Gruppe + Thema · rechts
Textknöpfe „CSV" und „Trend".

1. **Kennzahlenkarte**, `Row` mit drei Blöcken: Rücklauf „14 von 18" (30/600 tabular) + T.meta
   „78 %" · Gesamtnote als **große Notenplakette** (88×64, `borderRadius: 8`, Notenfarbe, Ziffer
   40/700 in `--note-ink`) + Wort + T.meta „Ø aus 8 Fragen" · Freitexte „9".
   Bei `responseCount < 3` darüber eine Zeile mit 3px linker Kante `var(--fb-line)`: „Nur 2
   Rückmeldungen — bitte nicht als Urteil über den Abend lesen." (kein Rot, kein Amber, kein Icon).
2. **Bewertungsfragen**: Notenlegende **einmal** (sechs Spalten, identisches Raster wie die Spuren
   darunter — dasselbe Raster, das der Teilnehmer im Fragebogen sieht), dann acht **große
   Notenspuren**, gegliedert durch die drei Sektions-Kicker des Fragebogens („01 DER ABEND",
   „02 ABLAUF & VORBEREITUNG", „03 DU UND DER ABEND"). Zeilenraster `28px 1fr 336px 56px`
   (Ordnungszahl · Fragetext · Spur · „n=14"), Haarlinie zwischen den Zeilen.
   Acht Verteilungen übereinander zeigen, ob der Abend gleichmäßig gut war oder eine Frage die Gruppe
   gespalten hat — was ein Balken mit dem Mittelwert 3,0 aus 6×1 und 6×5 systematisch verschweigt.
   **Damit ersetzt die Notenspur den `BarChart` auf dieser Seite vollständig.**
3. **Freitexte**: einspaltig, `maxWidth: 68ch`; je Frage Label 14/600, Antworten 15/1,6 als
   Zitatblöcke mit 2px linker Kante `var(--fb-split)`; ab 4 Antworten „alle 7 anzeigen".
4. `Collapse` „KI-Prompt": `Input.TextArea readOnly` (mono 13) + „Kopieren" (Client).

### 3.3 Trend `/m/feedback/groups/{gid}/trend`

Kopfzone + `Segmented` „6 / 12 / 24 Monate" (Client, schreibt `?monate=`).
**Karte GESAMTVERLAUF**: `_ui/NotenVerlauf.tsx` (Client, recharts direkt) — `YAxis reversed`
`domain={[1,6]}` `ticks={[1,2,3,4,5,6]}`, sechs `ReferenceArea`-Bänder in den Notentönungen als
Diagrammgrund, Linie `--fb-ink` 2px, `connectNulls={false}`, Punkte 4px in der Notenfarbe des
jeweiligen Wertes, und links oben im Plot dauerhaft T.kicker **„1 OBEN = BESSER"**. Ohne diese
Beschriftung ist jede Notenkurve zweideutig. Höhe 320 (mobil 240, X-Achse auf jedes zweite Label
gedünnt).
Darunter die Monatstabelle wie heute, aber mit Notenpille statt Rohzahl, plus „CSV".
Nur die Gesamtdurchschnittslinie ist Vorgabe; einzelne Fragen sind zuschaltbar, maximal drei
gleichzeitig, gestrichelt und direkt beschriftet — acht Kurven in einem Bild wären Spaghetti.

### 3.4 Vergleich `/m/feedback/vergleich` (nur Admin)

Eine `Table`, **aufsteigend nach Ø sortiert (bester zuerst)**, Spaltenkopf trägt „Ø Note
(1 = beste)". Spalten: Gruppe (Link aufs Cockpit) · Abende (n) · Rücklauf Ø · Ø Note (Notenpille +
Wort) · Notenfunke. Gruppen unter 5 Rückmeldungen kursiv + T.meta „nicht vergleichbar".
Das heutige `BarChart` entfällt: die Pillenspalte ist vertikal gelesen selbst der Vergleich, und ein
Balkendiagramm mit „länger = schlechter" in Markenrot ist genau der Fehler, den diese Spec verbietet.

### 3.5 Aushang-Druckansicht

**Pfad:** `src/app/m/feedback/(print)/aushang/[groupId]/page.tsx` — bewusst ein anderes
Pfadsegment als `groups/[groupId]`, weil zwei Route-Groups denselben aufgelösten Pfad nicht doppelt
belegen dürfen. **Eigenes `layout.tsx` ohne `Shell`** (sonst druckt FullShells Header und
AppSwitcher mit) — und damit **ohne den Auth-Backstop aus `(admin)/layout.tsx:22-33`**. Der Backstop
wird nach `_lib/requireFeedbackAccess.ts` ausgelagert und von **beiden** Layouts aufgerufen, plus
`guardPage(groupId)` in der Seite selbst; sonst verliert die Druckansicht die zweite
Verteidigungslinie.

**Aufbau (A4 Hochformat):** 3px Suite-Rot-Fahne am Oberrand · „Wie war der Dienstabend?" 40pt ·
Gruppenname 16pt gedämpft · QR **90mm** zentriert · URL 12pt mono · eine Zeile „Anonym · 8 Noten,
6 freie Zeilen · etwa 2 Minuten" · Fußzeile „Der Code gilt für alle Dienstabende." + Wortzeichen IDA
(umbenannt 04.09.2026, vorher „Sammelhaus" — die Datierung beider Wechsel steht in
`docs/design/feedback-oeffentliche-ansicht.md`, Kopf). Die beiden Fußzeilenteile stehen **8mm**
auseinander (vorher 4mm): der Abstand muss als Trennung zwischen Satz und Marke lesbar bleiben, und
ein dreibuchstabiges Versalwort direkt hinter einem Satzpunkt liest sich sonst als dessen Fortsetzung.
Das Wortzeichen ist dabei **`letter-spacing: 0.1em`** gesperrt (vorher 0.04em) — dieselbe Sperrung wie
auf dem Bildschirm, aus demselben Grund.

```css
@page { size: A4; margin: 18mm }
@media print {
  .noprint { display: none }
  body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
}
```

`print-color-adjust: exact` ist Pflicht, sonst schluckt der Browser die rote Fahne.
**Der QR-Endpunkt liefert heute 512px** (`qr.png/route.ts:25`) — bei 90mm sind das ~145 dpi.
Die Route bekommt einen `?w=`-Parameter (`core/qr` unterstützt `width` schon), der Aushang nutzt
`?w=1024` (~290 dpi). Auf der Seite ein `Button` mit `className="noprint"` „Drucken" und eine winzige
Client-Komponente, die beim Mount `window.print()` aufruft. Keine Notenfarben auf dem Aushang — er
zeigt keine Daten.

---

## 4. QUERSCHNITT

### 4.1 Navigation und Breadcrumbs

`Breadcrumb items={[…]}` (items-API, **nie** `Breadcrumb.Item`), 12px, `title: <Link>`.

- **Cockpit, Nutzer mit ≥2 Gruppen:** „Gruppen › Bereitschaft Musterstadt" (letzter Punkt Text).
- **Cockpit, Nutzer mit genau einer Gruppe:** **keine** Breadcrumb — der Wurzelpunkt leitet per
  `redirect` auf dieselbe Seite zurück, das wäre eine Schleife.
- **Unterseiten** (Auswertung, Trend, Vergleich, Aushang): Breadcrumb immer, letzter Punkt =
  Seitentitel, vorletzter = Gruppenname mit Link aufs Cockpit. Das ist der Zurück-Weg; ein zusätzlicher
  „← Zurück"-Knopf entfällt (zwei Rückwege sind ein Rückweg zu viel).
- **Modultitel im Shell-Header wird klickbar** (`FullShell.tsx:39`): `<strong>` bleibt und behält
  `data-testid="module-title"` (der Keystone-Test fragt es dort ab), wird aber in ein `next/link` auf
  `moduleUrl(moduleKey) ?? "/"` gewickelt, `color: inherit; text-decoration: none`. Behebt „kein
  klickbarer Modultitel" für alle Module.

### 4.2 Seitenkopf-Muster (eine Form, alle Screens)

Flach, keine Karte, drei Zeilen, `margin-bottom: 24`:
Zeile 1 Breadcrumb (12) · Zeile 2 `<h1>` 24/600, `margin: 0`, rechts in derselben Zeile die
Textknöpfe der Seite (`display: flex; justify-content: space-between; align-items: flex-end;
flex-wrap: wrap`) · Zeile 3 eine Zeile Kontext in 12/gedämpft („14 Dienstabende erfasst · Ø der
letzten sechs: 2,1 gut"; leer: „Noch kein Dienstabend erfasst.").
Auf 390px: `<h1>` bleibt 24 mit `text-wrap: balance`, die Textknöpfe rutschen unter die Überschrift,
die Kontextzeile bleibt.
Überschriften sind **natives `<h1>`/`<h2>`/`<h3>`** mit `T.*`-Styles — `Typography` kommt im ganzen
Modul nicht vor, auch nicht in Client-Komponenten: eine Regel, die man nicht pro Datei prüfen muss.

### 4.3 Leerzustände

| Ort | Text | Form |
|---|---|---|
| Gruppe ohne Abende | — | Betriebsart „Einrichtung": VERLAUF entfällt, Lagekarte trägt die Schrittzeile. Kein Platzhalter |
| Verlauf ohne Zeilen (kann nur nach Löschen entstehen) | „Noch keine vergangenen Dienstabende." | `locale.emptyText`, keine Illustration, kein zweiter Startaufruf (der Knopf steht 24px darüber) |
| Zwischenstand, 0 Antworten | „Noch keine Rückmeldung — zeig den QR-Code am Ende des Abends." | Satz **in** der Karte, keine leeren Spuren |
| Auswertung ohne Rückmeldungen | „Zu diesem Abend ist keine Rückmeldung eingegangen." | `Result status="info"`, CSV-Link bleibt |
| Trend ohne Punkte | „Weniger als zwei ausgewertete Abende — für einen Verlauf zu früh." | statt Diagramm, kein leeres Achsenkreuz |
| Einstieg ohne Gruppe | „Dir ist noch keine Gruppe zugeordnet." | `Result status="info"` |
| Notenpille ohne Wert | „—" in `--fb-muted` | **keine graue Pille** — eine leere Pille sieht aus wie eine Note |

### 4.4 Fehlerrückmeldung aus Server-Actions am Feld (`useActionState`)

Der Brief nennt `useActionState`; der Basisentwurf lehnte `Form.Item` ab und wollte Serverfehler als
`?fehler=` + `Alert`. **Entschieden: `useActionState`, kein `Form`/`Form.Item`, Fehler am Feld.**

**Genau drei Formulare** benutzen es: das Startformular der Lagekarte, das Gruppen-Formular in Zone e
und „Kennung hinzufügen". Alles andere sind Knopf-Aktionen ohne Eingabe und brauchen keinen
Zustand.

**Einheitlicher Rückgabetyp** (`_lib/formState.ts`):

```ts
export type FormState =
  | { ok: true }
  | { ok: false; fieldErrors: Record<string, string>; values: Record<string, string> };
```

Die betroffenen Actions wechseln von `(formData) => void` **auf `(prev: FormState, formData:
FormData) => Promise<FormState>`** und geben zurück statt zu werfen — `throw` kann keinen Feldfehler
transportieren. Zugriffsverletzungen bleiben `throw` (das ist kein Feldfehler, sondern ein Angriff).
`revalidatePath` läuft nur im Erfolgsfall.

**Rendern ohne `Form.Item`:**

```tsx
const [state, action, isPending] = useActionState(startFeedbackAction, { ok: true });
const err = state.ok ? undefined : state.fieldErrors.date;
<label htmlFor="fb-date" style={T.kicker}>Datum</label>
<Input id="fb-date" name="date" type="date" required
       defaultValue={state.ok ? heute : state.values.date}
       status={err ? "error" : undefined}
       aria-invalid={!!err} aria-describedby={err ? "fb-date-err" : undefined} />
{err && <p id="fb-date-err" style={T.meta}>{err}</p>}
```

Die Fehlermeldung ist **Text in `--fb-muted`, nicht rot** (4.9 verbietet Rot auf Datenflächen; die
Wörter „fehlt" / „ungültig" plus `aria-invalid` tragen die Aussage, und `status="error"` an antds
`Input` bleibt als vierter, farbiger Kanal erlaubt, weil er nur einen 1px-Rahmen einfärbt).
Eingaben gehen nie verloren: `state.values` kommt zurück. Ein `Alert` über dem Formular gibt es nur
für Fehler ohne Feld („Die Umfrage wurde in der Zwischenzeit von jemand anderem geschlossen."),
dann `type="warning"` — **nie** `type="error"` (4.9).

### 4.5 Ladezustände

Ausschließlich der Zustand aus `useActionState`: `isPending` → Primärknopf `loading` **und**
`disabled`, Beschriftung unverändert (ein wechselndes Label liest sich wie ein anderer Knopf). Kein
Skeleton, kein Spinner-Overlay, keine `loading.tsx`: die Seite rendert serverseitig in einem Zug, und
für 50 Aufrufe im Jahr ist jede Choreografie beim zweiten Mal Reibung.
Knopf-Aktionen ohne Formularzustand (Beenden, Secret, Löschen) laufen im `Popconfirm`, dessen
`okButtonProps={{ loading }}` aus einem `useTransition` gespeist wird.
**Selbstaktualisierung:** `_ui/Aktualisierer.tsx` ruft alle 30s `router.refresh()` — nur wenn eine
Umfrage läuft **und** `document.visibilityState === "visible"`. Unter dem Zähler steht immer „Stand:
21:47" (serverseitig, Europe/Berlin) plus ein „Aktualisieren"-Textknopf. Ohne diese Zeile sieht eine
gecachte Zahl aus wie eine live gemessene — das ist die einzige Art, wie diese Karte falsch
informieren kann.

### 4.6 Bestätigung destruktiver Aktionen

| Aktion | Muster | Wortlaut |
|---|---|---|
| Feedback jetzt beenden | `Popconfirm`, `Button default` (**nicht** danger) | „Danach kann niemand mehr antworten. Die Auswertung bleibt erhalten." · okText „Beenden" |
| Laufende beenden & neue starten | `Popconfirm` am Primärknopf | „Die laufende Umfrage vom 24.07. wird sofort geschlossen. Bereits abgegebene Rückmeldungen bleiben erhalten." · okText „Beenden & neue starten" |
| Abend löschen (Verlaufszeile) | `Popconfirm`, `danger`-okButton | „Löscht den Abend und seine 14 Rückmeldungen." |
| Neues Secret erzeugen | `Popconfirm`, `Button danger` (Umriss), okButton `danger` | „Bestehende QR-Codes und gedruckte Aushänge werden ungültig und müssen neu ausgehängt werden." · okText „Secret neu erzeugen" |
| Gruppe löschen | `Modal` mit **Tippbestätigung** des Gruppennamens, okButton bis dahin `disabled` | „Löscht 12 Dienstabende und 143 Rückmeldungen unwiderruflich." |

Regel: `Popconfirm` reicht, solange der Schaden einen Abend betrifft; sobald er eine Gruppe oder alle
gedruckten Aushänge betrifft, muss der Nutzer etwas tippen. Rot erscheint dabei nur am Knopfrand und im
okButton des Dialogs, nie auf einer Datenfläche.

### 4.7 Typo-Skala (`_ui/typo.ts`, fertige `CSSProperties`)

Sechs Stufen, ausschließlich antds eigene Leiter — keine Ad-hoc-Größe irgendwo im Modul:

| Name | px / Gewicht | Rolle |
|---|---|---|
| `T.kicker` | 12/600, uppercase, `letterSpacing .12em`, `--fb-muted` | Kartentitel, Spaltenköpfe, Achsenlabel, Feld-Labels |
| `T.meta` | 12/400, `--fb-muted` | Metazeilen, Fristen, Hilfetexte, Feldfehler, Zeichenzähler |
| `T.body` | 14/400 (Knöpfe 600) | Fließtext, Tabellenzellen, Fragetexte |
| `T.lead` | 16/600 | Gruppenname auf Einstiegskarten, Kartenüberschrift zweiter Ordnung |
| `T.h2` | 20/600 | Überschrift der Lagekarte, `Statistic` „Letzter Abend" |
| `T.h1` | 24/600 | `<h1>` |
| `T.zahl` | 30/600, tabular | **nur** der laufende Rücklaufzähler |

Ziffern durchgehend `fontVariantNumeric: "tabular-nums lining-nums"`. Datum nie ISO: „Mi, 22.07.2026";
in Tabellen „22.07.2026" mit Wochentag darunter. Schrift ist Geist Sans aus dem Suite-Theme — keine
Serif: die Serif des Fragebogens markiert dort „Papier", im Admin markiert die antd-Leiter „Werkzeug".
Zwei Skalen im Modul (Admin 12–30, öffentlich 11–32) sind kein Geschmack, sondern zwei Fundamente:
die öffentliche Route importiert per Entscheid null antd und hat kein Token-Fundament, das sie teilen
könnte. Geteilt wird, was Bedeutung trägt: die Notenpalette und die drei Sektionsnamen.

### 4.8 Abstände, Radien, Bewegung

Abstände ausschließlich aus `SPACE` (`core/theme/tokens.ts`: 4/8/12/16/24/32): Zonenabstand 24, vor
EINSTELLUNGEN 32, Kartenpolster 20 (mobil 16), innerhalb einer Karte 16, Haarlinienblöcke 12,
Formularspalten `gutter={[12,12]}`, Zonen-Row `gutter={[24,24]}`.
Radien: 2 (Spurzellen) · 6 (Notenpille, URL-Block) · 8 (Karten, Knöpfe, QR-Kasten). Drei Werte, keine
weiteren.
Bewegung: **exakt zwei**. Der Punkt der laufenden Umfrage pulst (2s, `prefers-reduced-motion: reduce`
stellt ihn ab), `Card hoverable` am Einstieg hebt die Rahmenfarbe in 120ms. Keine Aufbau-Choreografie,
kein Zähl-Effekt.
Fokus: antds Ring für antd-Komponenten; für eigenes Interaktives (Gruppenkarten-Link, Zeilenlink,
Kopierzeile) `:focus-visible { outline: 2px solid var(--fb-ink); outline-offset: 2px }`. Nie
`outline: none` ohne Ersatz.

### 4.9 Farb-Governance — die drei Rollen und die Review-Klausel

1. **Suite-Rot `#c8000f`** = Marke und Primäraktion. Nur: Füllung des **einen** Primärknopfs pro Seite,
   `colorLink` (Suite-Vorgabe), Suite-Chrome (FullShell-Header, AppSwitcher), Rand/okButton der
   Gefahrendialoge, 3px-Fahne im Aushang. Nie Statusfarbe, nie Datenfarbe, nie Fläche größer als ein
   Knopf.
2. **Notenfarben** = ausschließlich Werte auf der Schulnotenskala (Pille, Plakette, Spursäule,
   Diagrammpunkt, Diagrammband). Nie für Serien, Kategorien, Fortschritt oder Zustand.
3. **Graphit/Neutral** = alles andere, insbesondere Rücklauf und Fortschritt.

**Review-Klausel (verbindlich, gilt für jeden künftigen Patch im Modul):** Im Modul `feedback`
erscheint `#c8000f` (bzw. `colorPrimary`/`colorError`) **niemals auf einer Datenfläche** — kein rotes
`Tag`, kein roter `Progress`, kein roter Balken, kein `Alert type="error"`, kein
`type="primary" danger`. Grund und Beleg: `theme.ts:22-23` setzt `colorError: FARBEN.rot`, also
`colorError === colorPrimary === #c8000f`; gleichzeitig bedeutet `#811221` in derselben Anwendung
„Note 6 — ungenügend". Der erste `Alert type="error"` in der Nähe einer Notenpille holt die
Verwechslung zurück. Warnungen sind `type="warning"` (`colorWarning: FARBEN.gelb`) oder — auf
Datenflächen — Text plus 3px linke Kante in `var(--fb-line)`.
`Progress` **muss** `strokeColor="var(--fb-ink)"` und `trailColor="var(--fb-fill)"` setzen; antds
Vorgabe ist `colorPrimary`.

### 4.10 Eigene CSS-Variablen (`_ui/feedback.css`, importiert im `(admin)`- und im `(print)`-Layout)

Warum nicht `--ant-*`: siehe 1.3/W3 — antd deklariert seine Variablen auf der Scope-Klasse
`css-var-iuk` an den Wurzelelementen **seiner eigenen** Komponenten, nicht auf `:root`. Eigenes
Markup und die Druckansicht sehen sie nicht, und `pnpm build` merkt das nicht.
**Regel: in Props von antd-Komponenten `--ant-*` erlaubt; in eigenem Markup, in Diagrammen und im
Druck ausschließlich `--fb-*` / `--note-*`.**

Umgeschaltet über `:root[data-theme="light"|"dark"]` (Suite-Änderung, 5.1):

| Variable | hell | dunkel |
|---|---|---|
| `--fb-ink` | `#1a1d20` | `rgba(255,255,255,.88)` |
| `--fb-muted` | `#5b6570` | `rgba(255,255,255,.55)` |
| `--fb-line` | `#d9dde1` | `#303030` |
| `--fb-split` | `#e8ebee` | `#262626` |
| `--fb-card` | `#ffffff` | `#141414` |
| `--fb-tint` | `#f2f4f5` | `#1e1e1e` |
| `--fb-fill` | `#e6e9eb` | `#2a2a2a` |

Die Hellwerte sind die Suite-Tokens (`FARBEN.tinte/stahl/linie`), die Dunkelwerte antds Vorgaben — kein
zweiter Farbeindruck, nur ein zweiter Zugriffsweg.

### 4.11 Ampel-Definition: exakte Farbwerte, Schwellen, Bauteile

**Eine Definition, zwei Verwendungen.** Quelle ist `src/app/m/feedback/_lib/noten.ts` (Begründung der
Ablage in 5.2), gespiegelt in `_ui/noten.css` als `--note-1 … --note-6`, `--note-ink`,
`--note-tint-1 … --note-tint-6`. Ein Vitest prüft CSS gegen TS (`noten.test.ts`) — sonst bricht die
Zusage „eine Definition" beim ersten hastigen Fix, ohne dass etwas anschlägt.

```ts
export const NOTE_LIGHT = ["#2F7F59","#54782A","#7E6103","#904708","#912E10","#811221"] as const;
export const NOTE_DARK  = ["#A1DBC0","#AACF7F","#DAB22F","#EB9549","#EA7A58","#E55C6E"] as const;
export const NOTE_INK   = { light: "#FFFFFF", dark: "#101214" } as const;
export const NOTE_WORD  = ["sehr gut","gut","befriedigend","ausreichend","mangelhaft","ungenügend"] as const;
export const noteFromAvg = (avg: number) => Math.min(6, Math.max(1, Math.round(avg)));
export const formatNote  = (avg: number) => avg.toFixed(1).replace(".", ",");
```

Identisch mit `docs/design/feedback-oeffentliche-ansicht.md` §3.4. Luminanz fällt monoton
(hell .165 → .052, dunkel .620 → .254): die Rangfolge trägt auch in Graustufen und bei Deuteranopie.

**Schwellen** (`noteFromAvg` = `clamp(1,6,Math.round(avg))`):

| Ø-Bereich | Note | Farbe hell | Farbe dunkel | Wort |
|---|---|---|---|---|
| 1,00 – 1,49 | 1 | `#2F7F59` | `#A1DBC0` | sehr gut |
| 1,50 – 2,49 | 2 | `#54782A` | `#AACF7F` | gut |
| 2,50 – 3,49 | 3 | `#7E6103` | `#DAB22F` | befriedigend |
| 3,50 – 4,49 | 4 | `#904708` | `#EB9549` | ausreichend |
| 4,50 – 5,49 | 5 | `#912E10` | `#EA7A58` | mangelhaft |
| 5,50 – 6,00 | 6 | `#811221` | `#E55C6E` | ungenügend |
| `null` | — | — | — | „—", **keine Pille** |

Gerundet wird für die **Farbe**, angezeigt wird der **exakte** Wert mit einer Dezimale und Komma
(„2,4"). Damit ist der Farbsprung von 2,4 auf 2,5 erklärbar statt willkürlich.

**Tönungen — ausschließlich als textfreie Diagrammbänder** (12 % über `#ffffff` bzw. 18 % über
`#141414`, vorberechnet als Hex, damit sie ohne `color-mix` und ohne CSS-Variablen auch im Druck
stimmen; nachgerechnet):
hell `#E6F0EB · #EAEFE5 · #F0ECE1 · #F2E9E1 · #F2E6E2 · #F0E3E4`
dunkel `#2D3833 · #2F3627 · #383019 · #3B2B1E · #3B2620 · #3A2124`
Eine Tönung trägt nie Text: die Notenfarbe auf ihrer eigenen Tönung erreicht nur ~2:1 (das ist der
tragfähige Grund; die Behauptung „4,88:1 liegt unter AA" war falsch, siehe 1.3/W5).

**Bauteil 1 — Notenpille** (jeder Mittelwert). `display: inline-flex; min-width: 40px; height: 24px;
padding: 0 8px; border-radius: 6; background: var(--note-N); color: var(--note-ink); font: 600 14px/1;
font-variant-numeric: tabular-nums`, Inhalt „2,4". **Rechts daneben, außerhalb der Pille, das Wort**
in 12px `--fb-muted`. Drei Kanäle: Ziffer, Wort, Farbe. `aria-label="Durchschnitt 2,4 von 6 — gut.
1 ist die beste Note, 6 die schlechteste."` Bewusst **nicht** antds `Tag`: dessen `color` kennt die
Palette nicht (jede Verwendung wäre ein vollständiges Style-Override) und ein Tag liest sich als
Etikett, nicht als Messwert. `Tag` bleibt für echte Etiketten („Entwurf (Altbestand)").
Server-sicher (reine `div`/`span`, keine Funktions-Props).

**Bauteil 2 — Notenspur** (nur wo eine Verteilung existiert: Zwischenstand, Auswertung).
`grid-template-columns: repeat(6, 1fr); gap: 2; border-radius: 2; overflow: hidden`. Zellgrund =
achromatischer Tonwertkeil, der nach rechts dunkelt (hell `#f5f6f7 #eef0f2 #e8ebed #e2e5e9 #dcdfe4
#d6dae0`, dunkel umgekehrt heller werdend `#1d1e20 #232427 #292a2e #2f3034 #35363b #3b3c42`) — die
Richtung „nach rechts wird es schwerer" trägt damit auch ohne Farbe. In jeder Zelle eine
bodenständige Säule, Höhe = `anteil × Zellhöhe`, **mindestens 2px sobald `count > 0`** (sonst ist
„1 von 14" unsichtbar), Farbe `var(--note-N)`.
Kompakt (Live-Karte): Zellhöhe 24, Zeilenraster `1fr 168px 96px`, Zeilenhöhe 36.
Groß (Auswertung): Zellhöhe 44, `gap: 4`, Notenziffer unten in jeder Zelle (12/600), unter der Spur
die Anzahl je Note als 12px tabular, `0` als `·`.
Der Container ist `role="img"` mit **einem** vollständigen `aria-label`: „Notenverteilung: einmal Note
1, viermal Note 2, dreimal Note 3, keine Note 4 bis 6. Durchschnitt 2,3, gut." Damit hängt keine
Information an Farbe oder Höhe.

**Bauteil 3 — Notenlegende.** Sechs Segmente à 10px im identischen 6-Spalten-Raster wie die Spuren
darunter, harte Farbstopps, `borderRadius: 3`, darunter tabellarisch die sechs Notenwörter in
`T.kicker`. Erscheint **pro Karte genau einmal**, direkt über der ersten Spurzeile. Unter 600px nur
die zwei Ankerwörter „1 sehr gut" links, „6 ungenügend" rechts.
In Tabellen und auf Einstiegskarten gibt es **keine** Legende und **keine** Spur — dort steht die
Notenpille **mit Wort**, plus der Spaltenkopf „Ø Note (1 = beste)". Das schließt die von der Jury
benannte Legenden-Lücke ohne eine Legende in jede Tabellenzeile zu drucken.

**Bauteil 4 — Notenfunke** (Sparkline, Server-SVG, kein recharts): 132×28, `<polyline fill="none"
stroke="var(--fb-ink)" stroke-width="1.5" stroke-linejoin="round">` über die letzten sechs Abende mit
Rückmeldungen, **Y invertiert** (Note 1 oben), Domain fest 1–6 (nicht datenabhängig, sonst lügt die
Steigung), letzter Punkt `<circle r="3" fill="var(--note-N)">`, `role="img"` + `aria-label`. Weniger
als zwei Punkte: kein Funke, nur „—".
Begleittext **nie** als Pfeil ↑/↓, immer als Wort plus beide Zahlen: „Letzte 6 Monate: 2,1 — leicht
besser als davor (2,4)".

### 4.12 `stars` (Altbestand, Skala 1–5) — die Ampel bleibt eine

Zwei Entscheidungen, weil `aggregation.ts:35-41` beide Skalen in denselben Mittelwert schiebt:

1. **Keine Notenfarbe für `stars`.** Eine 1–5-Note wird als neutrale Pille dargestellt
   (`background: var(--fb-fill)`, `color: var(--fb-ink)`) mit dem Text „Ø 4,2 von 5" plus T.meta
   „Altbestand-Skala". Begründung in einem Satz: eine 5er-Skala auf die 6er-Rampe abzutasten würde in
   derselben Tabellenspalte zwei verschiedene Bedeutungen in dieselbe Farbe legen — und Altumfragen
   sind ohnehin nur lesbar, nicht vergleichbar.
2. **`DAStats` bekommt zwei zusätzliche Felder** (`avgSchulnote: number | null`,
   `hasLegacyScale: boolean`); `avgSchulnote` mittelt **nur** `schulnote`-Fragen. **Jede
   Ampeldarstellung** (Pille, Plakette, Funke, Trendlinie, Vergleich) liest `avgSchulnote`;
   `overallAvg` bleibt unverändert für die CSV-Kompatibilität. Zeilen mit `hasLegacyScale` tragen im
   Verlauf und im Trend die Fußnote „enthält Altbestands-Fragen (Skala 1–5) — nicht in den
   Durchschnitt gerechnet". Damit ist der heute schon vorhandene, stille Rechenfehler beseitigt statt
   grafisch fortgeschrieben.

### 4.13 RSC-Grenze und Bauteil-Inventar

**Falle 1 — Compound-Zugriff.** In Server Components verboten: `Typography.*`, `Form.Item`,
`Descriptions.Item`, `List.Item`, `Card.Meta`, `Collapse.Panel`, `Breadcrumb.Item`, `Input.Group`,
`Input.TextArea`, `Space.Compact`, `Statistic.Countdown`, `Table.Summary`, `Tag.CheckableTag`,
`Badge.Ribbon`, `Layout.Header`, `Grid.useBreakpoint` → HTTP 500, den `pnpm build` nicht sieht.
`Layout.Header`/`Content` nur als Named-Import aus `antd/es/layout/layout` (so macht es
`FullShell.tsx:6` bereits, mit Begründung im Kommentar).
**Falle 2 — Funktions-Props.** Eine Server Component kann `columns[].render`, `onRow`, `onChange`,
`onConfirm`, `Statistic.formatter`, `Progress.format`, `Collapse.onChange` nicht übergeben.
„`Table` ist sicher" heißt nur: die Komponente selbst ist unproblematisch — `columns` mit `render`
müssen im Client liegen. Genau deshalb trägt `GroupList.tsx` heute `"use client"`.
**Regel:** jede interaktive oder render-prop-tragende antd-Komponente bekommt einen dünnen Wrapper in
`(admin)/_ui/`. Die Seiten bleiben Server Components und rendern nur diese Wrapper; Server Actions
dürfen an Client Components übergeben werden.

**Client-Komponenten — sieben, vollständig** (die Zahl ist kein Qualitätsmerkmal; die Grenze ist eins):

| Datei | Warum Client |
|---|---|
| `_ui/StartFormular.tsx` | `useActionState`, `Popconfirm`, kontrollierte Felder |
| `_ui/Verlauf.tsx` | `columns[].render`, `onRow`, `Dropdown`, `Popconfirm` |
| `_ui/EinstellungenPanel.tsx` | `Collapse`, drei Formulare, `Popconfirm`, Tipp-Bestätigung |
| `_ui/BeendenKnopf.tsx` | `Popconfirm` + `useTransition` (auch für „Jetzt starten" der Altbestands-Zeile) |
| `_ui/KopierZeile.tsx` | `navigator.clipboard`, Label wechselt 2s auf „Kopiert ✓" (kein Toast — die Rückmeldung gehört an den Knopf, den man ansieht) |
| `_ui/QrGross.tsx` | `Modal`, ESC, Vollbild |
| `_ui/Aktualisierer.tsx` + `_ui/NotenVerlauf.tsx` + `_ui/Segment.tsx` | Intervall/`useRouter`; recharts; `Segmented` |

**Server-sicher (kein JS im Bundle):** `Card` (Titel als String, `styles={{header,body}}`) ·
`Statistic` mit `valueStyle`, ohne `formatter` · `Progress` ohne `format` · `Tag` (neutral) ·
`Result` · `Row`/`Col` · `Space` (**`orientation`**) · `Breadcrumb` mit `items` · `<img>` für den QR ·
Notenpille, Notenspur, Notenlegende, Notenfunke, Notenplakette · alle Überschriften und Haarlinien.
**Bewusst nicht verwendet:** `List` (in antd 6 abgekündigt → `Table`) · `Descriptions` (ein natives
`dl` ist kürzer und RSC-fest) · `Tabs` (die IA sagt „eine Arbeitsseite"; Tabs wären ein Versteck) ·
`DatePicker` (siehe 2.3) · `core/charts/BarChart` und `LineChart` für Notendaten (siehe 5.3).
`Form`/`Form.Item` kommen im ganzen Modul nicht vor; Preis offen benannt: keine automatische
Feldfehleranzeige — die kommt aus `useActionState` (4.4).

### 4.14 Barrierefreiheit

Note = **Ziffer + Wort + Position/Höhe**, Farbe ist der letzte, verzichtbare Kanal (4.11).
Zustand „läuft" trägt Wort („LÄUFT SEIT …"), Punktform, Kartentönung und die Anwesenheit des
Zählerblocks — vier Kanäle, keiner davon Farbe allein.
Kontrast AA belegt: Weiß auf den sechs Hellfarben 4,88 – 10,28:1, `#101214` auf den sechs Dunkelfarben
5,44 – 11,99:1, Fließtext `--fb-ink` auf `--fb-card` 15,5:1 (hell), Sekundärtext `--fb-muted` 5,5:1.
Tastatur: ein Tabstop pro Bedienelement, `Dropdown` und `Popconfirm` bringen antds Fokusfalle mit;
eigene interaktive Flächen (Gruppenkarte, Verlaufszeile) sind `<a>`, nicht `div` mit `onClick`.
`aria-live="polite"` genau einmal: an der Fußzeile „Stand: 21:47" der laufenden Karte. Der
Zwischenstand plappert nicht bei jeder Antwort.
Mobile Feldschrift: gilt inzwischen **suiteweit** und ohne Breakpoint. Die modul-eigene Fassung unter
`@media (max-width: 600px)` ist entfallen. An ihre Stelle treten zwei Wege für zwei Welten:
`app/globals.css` hält mit `input, textarea, select` eine **Untergrenze** für eigenes Markup —
bewusst niedrig spezifisch, damit Modul-CSS sie nach oben überschreiben darf (der Abendzettel setzt
`.textfeld` auf 18px und behält das) — und `core/theme/theme.ts` gibt den antd-Feldern
`inputFontSize: 16`. Nur `.ant-select-selector` braucht in CSS erhöhte Spezifität, weil antd dafür
keinen Token anbietet.

Die Begründung hat sich dabei umgedreht: früher war 16px die Abwehr gegen iOS' Auto-Zoom beim Fokus,
seit der suiteweiten Zoom-Sperre (`app/layout.tsx`) ist es reine Lesbarkeit — ohne Zoom kann niemand
mehr heranholen, was zu klein ist. Festgehalten in `core/theme/feldschrift.test.ts`.

### 4.15 Änderungen an Actions und Queries (vollständig)

1. **Neu** `startFeedbackAction(prev, formData)` → `createAndStartSurvey` (existiert,
   `queries.ts:146`), `closeAfterHours = group.closeAfterHours ?? DEFAULT_CLOSE_AFTER_HOURS`,
   Rückgabe `FormState`.
2. `revalidate()` → `revalidatePath("/m/feedback", "layout")` (1.5/4).
3. `activateSurveyAction`: `computeClosesAt(evening.date, hours)` statt `computeClosesAt(now, hours)`
   (1.5/2).
4. `updateGroupAction`, `createGroupAction`, „Kennung hinzufügen" → `FormState`-Signatur; `slug` fällt
   aus `updateGroupAction` (2.6).
5. `aggregation.ts`: `avgSchulnote`, `hasLegacyScale` (4.12).
6. `qr.png/route.ts`: `?w=`-Parameter, geklemmt auf 256–1024.
7. `_lib/requireFeedbackAccess.ts` aus `(admin)/layout.tsx` extrahiert, von beiden Layouts benutzt
   (3.5).
8. `_lib/cockpit.ts` (Selektor, 2.2) und `_lib/noten.ts` (4.11) neu.
9. `createSurveyAction` verliert seinen UI-Einstiegspunkt (bleibt für Altbestands-Entwürfe im Code),
   `createEveningAction` bleibt für „Abend ohne Feedback nachtragen".

### 4.16 e2e — was bricht und was bewahrt wird

`e2e/feedback.spec.ts` hängt an der alten Oberfläche und muss mit umgebaut werden:
Einstieg (Placeholder „Name"/„slug", Knopf „Gruppe anlegen" liegt künftig **im Modal** → Test muss
erst „+ Neue Gruppe" klicken), Abend-Link in der Liste (→ Verlaufszeile bzw. Lagekarte),
`SurveyControls` („Umfrage erstellen"/„Aktivieren"/„Schließen" → „Feedback starten"/„Feedback jetzt
beenden" mit Popconfirm-Bestätigung), Auswertung (`/Gesamt-Ø:/` → Notenplakette; Test auf
`aria-label=/Durchschnitt/` umstellen), Abend-Detailseite `evenings/[eveningId]` entfällt als eigener
Screen (Redirect auf die Auswertung, damit alte Links und Prefetches nicht ins Leere laufen).
**Zwei Hooks bleiben unverändert:** `data-testid="group-row"` auf der Gruppenkarte samt
`href="/m/feedback/groups/{id}"` (der IDOR-Test parst die ID daraus, `feedback.spec.ts:109-112`) und
`data-testid="module-title"` auf dem `<strong>` **innerhalb** des neuen Links (Keystone-Test).

---

## 5. WAS DAVON NACH `src/core` GEHÖRT

Maßstab: **ein zweiter, heute belegbarer Nutznießer.** Alles andere bleibt modulspezifisch — kein
Framework für einen Nutzer.

### 5.1 Nach `src/core` — drei Änderungen, jede mit zweitem Nutznießer

1. **`FullShell`: Modultitel wird ein `next/link`.** Zweiter Nutznießer: *alle* Module mit
   `shell: "full"` (`alpha`, `gamma`, `portal`, `qr`) haben denselben Defekt „kein klickbarer
   Modultitel". Eine Zeile, kein Muster gebrochen, `data-testid` bleibt auf dem `<strong>`.
   Nebenbei: der Header bricht auf schmalen Fenstern über den Titel — `flexWrap: nowrap` +
   `overflow: hidden` auf der Switcher-Leiste.
2. **`data-theme={mode}` auf `<html>` (`app/layout.tsx`) + Mitschreiben in `AntdProvider`, ausgelöst
   über `setPreference`.** Zweiter Nutznießer existiert schon auf Papier: die verbindliche Spec der
   öffentlichen Ansicht fordert dieselbe Zeile (§3.4), und jede Route, die eigenes CSS auf den
   Theme-Modus selektieren will, braucht sie. Heute steht dort nur `style={{ colorScheme: mode }}`,
   darauf kann CSS nicht selektieren. Ohne das Mitschreiben im Client bleibt der Umschalter bis zur
   nächsten Navigation wirkungslos für eigene Variablen (`AntdProvider.tsx`).
3. **Ergänzung des Docstrings in `core/theme/tokens.ts`.** Die Datei beansprucht, „die einzige Datei
   mit Hex-Codes" zu sein. Diese Spec legt die Notenpalette **nicht** dorthin (5.2) — also muss der
   Anspruch präzisiert werden, statt ihn stillschweigend zu verletzen: „Ausnahme: fachsemantische
   Paletten eines einzelnen Moduls (z. B. die Schulnoten-Ampel in
   `app/m/feedback/_lib/noten.ts`) liegen beim Modul, weil sie Bedeutung eines Fachbereichs tragen und
   nicht den Farbeindruck der Suite."

### 5.2 Modulspezifisch — ausdrücklich **nicht** nach core

| Baustein | Warum es beim Modul bleibt |
|---|---|
| `_lib/noten.ts` + `_ui/noten.css` (Palette, Wörter, Schwellen) | Beide Nutznießer sind **Routen desselben Moduls** (`/f/**` und `(admin)`), kein zweites Modul. „Eine Definition, zwei Verwendungen" ist damit erfüllt; nach core gehoben wäre es eine Suite-Farbe, die kein anderes Modul kennt. Der Docstring-Konflikt ist in 5.1/3 aufgelöst |
| Notenpille, Notenspur, Notenlegende, Notenplakette, Notenfunke | Tragen die Semantik „deutsche Schulnote, invertiert". Ein zweites Modul, das Schulnoten anzeigt, existiert nicht und ist nicht in Sicht |
| `_lib/cockpit.ts` (Zustands-Selektor) | Kennt `surveys`, `evenings`, `responses` — modulspezifisches Schema |
| `_ui/typo.ts` | Rollen, nicht Werte: die Werte sind antds Leiter, die jede Suite-Seite ohnehin hat. Nach core gehoben würde es eine Konvention erzwingen, die andere Module nicht gewählt haben |
| Kopfzonen-/Breadcrumb-Muster (4.1/4.2) | Ein Muster mit einem Anwender ist eine Konvention, keine Komponente. Sobald ein zweites Modul dieselbe dreizeilige Kopfzone baut, wird `core/shell/Seitenkopf.tsx` daraus — vorher nicht |
| `_ui/feedback.css` (`--fb-*`) | Spiegelt Suite-Tokens für den Zugriff aus eigenem Markup; ein zweites Modul mit demselben Bedarf würde die Datei kopieren, nicht importieren wollen (andere Flächen, andere Namen) |
| `_lib/requireFeedbackAccess.ts` | Liest `registry`-Felder dieses Moduls und `user_groups` dieses Moduls |
| `_ui/Aktualisierer.tsx`, `KopierZeile.tsx`, `QrGross.tsx` | Je 10–25 Zeilen. Ein `useCopyToClipboard` in core wäre mehr Import-Zeremonie als Nutzen |

### 5.3 `core/charts` bleibt unangetastet — bewusst gegen den naheliegenden Griff

`LineChart`/`BarChart` (je 55 Zeilen) färben mit `token.colorPrimary` (= Suite-Rot) und kennen keine
umgekehrte Achse; die heutige Auswertung zeichnet Noten deshalb in Markenrot mit „länger =
schlechter". Für die Notendarstellung bräuchte man dort vier Änderungen: `reversed`, `stroke`,
`ReferenceArea`-Kinder und farbige Punkte je Wert. **Alle vier Aufrufer wären in diesem Modul.**
Deshalb: `_ui/NotenVerlauf.tsx` modul-lokal, recharts direkt (die Abhängigkeit liegt schon im
Projekt), und `core/charts` bleibt für Nicht-Noten-Daten anderer Module unverändert nutzbar. Sollte
später ein zweites Modul eine invertierte Achse brauchen, ist `reversed` die eine Prop, die man dann
— und erst dann — nach core hebt.

### 5.4 Geschmacksentscheidungen, benannt und begründet (je ein Satz)

- **Kein Serif im Admin:** die Serif markiert in der öffentlichen Ansicht „Papier"; im Werkzeug wäre
  sie Kostüm.
- **`Statistic` statt eigener Zahl-Auszeichnung:** es ist server-sicher, sobald man `formatter`
  weglässt, und `valueStyle` reicht, um es in die Typo-Skala zu zwingen.
- **Tabellenzeilen ohne Zebra:** bei sechs Spalten und 12 Zeilen trennt die Haarlinie genug, und
  Zebra konkurriert mit der einzigen getönten Fläche der Seite.
- **Zähler „12 von 20" bleibt Leitkennzahl**, obwohl `participantCount` nullable ist: das Feld ist im
  Startformular vorbelegt und inline nachtragbar; überwiegt in der Praxis „12" ohne Nenner, ist der
  Wechsel auf „12 Rückmeldungen (zuletzt 9)" eine Textänderung, kein Umbau.
- **Kein Bottom-Sheet und keine Tab-Navigation auf dem Handy:** sie würden Ordnung schaffen und die
  Seite in genau das Blätter-Erlebnis zurückverwandeln, das der Ist-Zustand schon hat.