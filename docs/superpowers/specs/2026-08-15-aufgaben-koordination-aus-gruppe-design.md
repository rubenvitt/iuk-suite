# Modul `aufgaben`: die Koordinationsrolle kommt aus der Auth-Gruppe

**Datum:** 2026-08-15 · **Status:** entworfen, freigegeben · **Betrifft:** `src/app/m/aufgaben`,
`.env`, `e2e/aufgaben.spec.ts`, Runbook

## Das Problem

Heute steht die Rolle einer Person vollständig in der Modultabelle `personen`
(`rolle: "koordination" | "auftrag" | "bufdi"`). `registry.ts:140-143` schreibt das ausdrücklich
fest, mit einer Begründung, die für **BuFDis** trägt: sie rotieren jährlich, und am JWT hängt ein
Verzugsfenster von einer Stunde.

Für die **Koordination** trägt dieselbe Begründung nicht, und sie kostet:

1. **Kein Weg zur ersten Koordinationszeile über die Oberfläche.** `darfPersonenVerwalten` verlangt
   `rolle === "koordination"`, und die einzige Stelle, die je so eine Zeile schreibt, ist
   `_lib/seedLokal.ts`. Auf einer frischen Produktivdatenbank gäbe es ohne Notausgang niemanden,
   der die erste Person anlegen darf.
2. **Zwei Register für dieselbe Frage.** Der Betreiber pflegt in Pocket ID bereits die Gruppe
   `aufgaben_koordination` — und muss die Koordination danach ein zweites Mal in der Modultabelle
   eintragen. Zwei Register laufen auseinander, und das fällt erst auf, wenn jemand nicht
   hineinkommt.

**Der Notausgang existiert bereits, aber nur auf einer Route.** `personen/page.tsx:94` ruft
`canAdminModule("aufgaben")` (`core/auth/guards.ts` → `isModuleAdmin` → `adminGroupsFor`) *vor*
jeder Personen-Zeilen-Frage — Betreiberentscheidung 2026-08-14, mit genau dieser Begründung. Wer in
der Koordinationsgruppe ist, kommt heute schon nach `/personen`, ohne eigene Zeile. Er kommt nur
nirgends sonst hin: `/` zeigt ihm die Erklärseite „noch nicht eingetragen".

Dieser Entwurf **erweitert die Reichweite dieses bestehenden Bausteins** von einer Route auf das
Modul. Er erfindet keinen neuen Mechanismus.

## Was sich ändert — und was ausdrücklich nicht

**Aus der Gruppe kommt:** allein die Koordinationsrolle.

**In der Datenbank bleiben:** `bufdi` und `auftrag`. Die Koordination verteilt sie weiter über
`/personen`. Die Begründung aus `registry.ts` bleibt damit unangetastet gültig — eine Stunde Verzug
mal ein kompletter BuFDi-Jahrgangswechsel wäre nicht tragbar, und die jährliche Rotation über
Pocket ID zu pflegen wäre die schlechtere Arbeit.

Ebenfalls unberührt: `darfPlanAendern` (die Gestaltungshoheit über den eigenen Tag bleibt beim
BuFDi), die Zeitplanung, `/routinen` (`rolle === "bufdi"`).

## Die sechs Bausteine

### 1 — Der `Akteur`

Neu in `_lib/zugang.ts`:

```ts
export type Akteur = { person: PersonRow; istKoordination: boolean };
export async function akteurFuerSeite(db: DB): Promise<Akteur | null>;
export async function akteurFuerSession(db: DB): Promise<Akteur>;   // wirft, für Actions
```

`istKoordination` stammt aus `canAdminModule("aufgaben")`, `person` aus dem heutigen
`personFuerSeite`. **Die Auflösung geschieht an genau einer Stelle** — das ist dieselbe Zusage, die
`_lib/zugang.ts` schon heute für alle Prädikate trägt („die EINE Quelle", Kopfkommentar).

Alle acht Vergleiche `p.rolle === "koordination"` in `zugang.ts` werden zu `a.istKoordination`.
Betroffen: `darfVerteilen`, `darfEinstellenFuerAndere`, `darfPersonenVerwalten`, `darfFreigeben`,
`darfNachweisSehen`, `darfAufgabeSehen`, `darfFreigabenSehen`, `istVertretungsfreigabe`.

Die Signaturen von `PersonRow` auf `Akteur` ziehen sich weiter durch:

- `_db/queries.ts`: `freigabenFuer`, `freigabeDaten`
- `_lib/lebenszyklus.ts`: `TABELLE[].wer`, `uebergang`, `pruefeEinstellen`
- `_lib/aktionsOptionen.ts`: `aktionsOptionen`
- die aufrufenden Seiten und `actions.ts`

**Kein Flag überquert die RSC-Grenze.** `zugang.ts` importiert bereits `@/core/auth`, läuft also
ohnehin nur serverseitig; `AktionsZone.tsx` bekommt `optionen` fertig berechnet, `VerteilenTabelle`
ein fertiges `darfVerteilen`-Boolean. Diese Aufteilung bleibt genau so.

**Der Suite-Admin kommt mit durch.** `isModuleAdmin` lässt `ADMIN_GROUP` (`dashboard-admins`)
passieren. Das ist heute auf `/personen` schon so und bleibt: ohne diesen Weg gäbe es keine
Rückkehr, wenn `SUITE_ADMIN_GROUP_AUFGABEN` fehlkonfiguriert ist. `feedback`, `files` und
`lagerbuch` entscheiden das für sich bewusst anders (s. deren `_lib/access.ts`); hier überwiegt der
Notausgang, und der Grund gehört in den Kommentar.

### 2 — `ROLLEN` schrumpft auf zwei Werte

`ROLLEN = ["auftrag", "bufdi"]`. `Rolle`, `ROLLEN_RANG` (`_db/queries.ts:40`), `ROLLE_TEXT`
(`_lib/anzeige.ts:71`) und `istGueltigeRolle` (`_lib/eingabe.ts:54`) ziehen mit.

**Die Migration ist ein reines Daten-`UPDATE`** — `text("rolle", { enum: ROLLEN })` erzeugt in
SQLite kein `CHECK`, die Spalte ist schlicht `text NOT NULL` (`0000_heavy_bloodstrike.sql:62`):

```sql
UPDATE personen SET rolle = 'auftrag' WHERE rolle = 'koordination';
```

Als `0002_*.sql` nach der bestehenden Konvention, mit Snapshot und `_journal.json`-Eintrag.

**`auftrag` ist für die bisherige Koordination fachlich richtig, nicht bloß der Rest:** sie stellt
Aufgaben für andere ein, und `darfEinstellenFuerAndere` erlaubt `auftrag` ohnehin.

**`bufdis()` bleibt damit sicher — das ist der schärfste Punkt des ganzen Umbaus.**
`verteilDaten` speist die Verteillisten aus `bufdis(db, heute)` statt aus `aktivePersonen`,
*ausdrücklich* damit die Koordination nicht in ihrer eigenen Zielliste steht; daran hängt die
Betreiberentscheidung vom 2026-08-13 (die Koordination gibt ihre eigene Fremdaufgabe nicht frei,
sonst fällt das Vier-Augen-Prinzip für genau diesen Fall aus, s. `darfFreigeben`s Kopfkommentar).
Bekäme eine Koordinationszeile `rolle: "bufdi"`, bräche diese Zusage still. **Ein Test muss
festhalten, dass eine Person mit Koordinationsgruppe nie in `bufdis()` erscheint.**

### 3 — Der Einstieg verzweigt zuerst auf die Gruppe

`page.tsx`s `switch (person.rolle)` mit `never`-Guard würde bei zwei verbleibenden Rollen auf einem
echten Pfad werfen. Künftig:

```
istKoordination        → EinstiegKoordination
rolle === "bufdi"      → EinstiegBufdi
rolle === "auftrag"    → EinstiegAuftrag
```

Der `never`-Guard bleibt für die zwei Datenbankrollen erhalten — er hat seinen Zweck („laut ist
besser als still"), nur einen kleineren Geltungsbereich.

Ebenso zieht `_lib/nav.ts` mit: es baut seine bedingten Einträge weiterhin aus **denselben**
Prädikaten, die die jeweilige Route gatet — diese Zusage aus Aufgabe 16 bleibt wörtlich bestehen,
nur nehmen die Prädikate jetzt einen `Akteur`.

### 4 — Die JIT-Zeile für die Koordination

Eine Koordinationsperson **braucht** eine `personen`-Zeile, sobald sie handelt: `erstellerId` und
`prueferId` zeigen auf eine `personen.id`. Ohne Zeile könnte sie nichts einstellen.

`akteurFuerSeite` legt sie deshalb an, wenn `istKoordination` gilt und keine Zeile existiert:

| Feld | Wert |
|---|---|
| `sub` | `session.user.id` |
| `name` | `session.user.name`, ersatzweise die E-Mail, ersatzweise der `sub` |
| `initialen` | aus dem Namen abgeleitet |
| `rolle` | `"auftrag"` |
| `sollMinutenTag` | Vorgabewert (468) — für die Koordination bedeutungslos |
| `aktivVon` | heute |
| `aktivBis` | `null` |

Idempotent über `uniqueIndex("personen_sub_idx")` (`INSERT … ON CONFLICT DO NOTHING`), also auch bei
parallelen Prefetches unkritisch.

**Ein Schreibvorgang beim Seitenaufbau ist hier vertretbar, aber begründungspflichtig:** die
Alternative (erst beim ersten Handeln anlegen) ließe `/` für die frisch freigeschaltete Koordination
weiter „nicht eingetragen" zeigen — genau das Symptom, das dieser Entwurf beseitigt. Der Schreibzugriff
ist ein einzelnes idempotentes `INSERT` gegen eine lokale SQLite-Datei, kein Netzaufruf.

### 5 — `istAktiv` gilt für die Koordination nicht mehr

Die Gruppenmitgliedschaft trägt die Rolle; ein `aktivBis` auf der JIT-Zeile ergäbe zwei
widersprüchliche Aussagen über dieselbe Person. Der Entzug läuft über Pocket ID, mit dem bekannten
Verzugsfenster von bis zu einer Stunde (Access-Token-Lebensdauer, s. CLAUDE.md).

Für `bufdi` und `auftrag` bleibt `istAktiv` unverändert das, was es heute ist — inklusive der
Trennung von Handlungs- und Sichtprädikaten aus Aufgabe 4.

### 6 — Personenanlage mit Verzeichnis-Autofill

`PersonenFormular` ersetzt das `sub`-Textfeld durch eine Suche über `core/directory`
(Pocket ID `GET /api/users`). Vorbild: `feedback/_ui/Zuordnung.tsx` und `feedback/actions.ts:316`.

Heute muss sich die Koordination den `sub` von der betroffenen Person **vorlesen lassen** — die
sieht ihn auf `NichtEingetragenSeite`. Das bleibt als Rückfallweg bestehen, denn `core/directory`
liefert ohne `POCKET_ID_API_KEY` sauber `status: "unconfigured"` statt zu werfen; das Formular fällt
dann auf das heutige Textfeld zurück.

Beim Übernehmen eines Treffers werden `sub`, `name` und die abgeleiteten `initialen` vorbelegt;
`rolle`, `sollMinutenTag` und der Zeitraum bleiben Eingabe der Koordination.

**`core/directory` kennt keine Gruppenmitgliedschaften**, nur alle Nutzer. „Wer ist in
`aufgaben_nutzer`?" beantwortet die Suite nicht — die Gruppenzugehörigkeit wird erst bei der
Anmeldung der Person sichtbar. Deshalb wählt die Koordination aus allen SSO-Konten aus, statt aus
einer gefilterten Liste.

## Konfiguration

```
SUITE_ACCESS_GROUP_AUFGABEN=aufgaben_nutzer
SUITE_ADMIN_GROUP_AUFGABEN=aufgaben_koordination
```

Die Registry-Literale (`iuk-aufgaben-nutzer` / `iuk-aufgaben-koordination`) bleiben als Vorgabe
stehen — `e2e/aufgaben.spec.ts:6` hängt daran.

`SUITE_ADMIN_GROUP_AUFGABEN` wird durch diesen Entwurf **tragend**: es entscheidet nicht mehr nur
über die Personenverwaltung, sondern über die gesamte Koordinationsrolle. Zwei Folgen fürs Runbook:

- Ein Tippfehler sperrt jede Koordination aus. Der Rückweg ist die Suite-Admin-Gruppe.
- Ein **leerer** Wert heißt bei `requiresAuth: true` nicht „keine Gruppe" (`.env.example:282`).
- Beide Pocket-ID-Gruppen müssen existieren **und Mitglieder haben**, bevor das Modul produktiv
  erreichbar ist.

## Tests

**Vitest** — die neuen Nähte, die kein bestehender Test sieht:

- `bufdis()` enthält nie eine Person, die über die Gruppe koordiniert (§2, das benannte Risiko).
- `akteurFuerSeite` legt genau eine Zeile an, auch bei mehrfachem Aufruf (Idempotenz).
- Jedes Prädikat, das heute `rolle === "koordination"` liest, antwortet auf `istKoordination`
  gleich — und auf eine `auftrag`-Zeile **ohne** Gruppe anders.
- `darfFreigeben` behält beide Klauseln (nie Selbstaufgaben, nie die eigene Fremdaufgabe).
- `page.tsx`s Verzweigung: Koordinationsgruppe schlägt die Datenbankrolle.

**e2e** — der größte Einzelposten (`e2e/aufgaben.spec.ts`, 1501 Zeilen). Jede Sitzung, die heute
über Rikes geseedete `koordination`-Zeile auf eine Koordinationsfläche kommt, braucht künftig die
Koordinationsgruppe im Dev-Login. Dazu **ein neuer Test**, den es heute nicht geben kann: eine
Anmeldung mit Koordinationsgruppe **ohne** `personen`-Zeile landet auf `/` (Verteilung), nicht auf
der Erklärseite.

**`seedLokal`** legt Rike künftig als `auftrag` an; die Koordinationsrolle kommt im Dev-Login aus
`?groups=`. Der Kommentar in `schema.ts:94` („genau darüber wechselt man lokal die Rolle") gilt
weiterhin, bekommt aber eine zweite Hälfte: die Gruppen der Dev-Anmeldung.

## Was nachgezogen werden muss

Beide Stellen schreiben heute das Gegenteil fest und wären danach falsch:

- `src/core/registry.ts:140-143` — „Die Rolle einer Person steht dagegen in der Modultabelle
  `personen`, NICHT in einer Pocket-ID-Gruppe."
- `docs/superpowers/specs/2026-08-13-modul-aufgaben-design.md` §4 — Nachtrag mit Datum und
  Begründung, nicht stilles Überschreiben.

Dazu `.env.example` (der Absatz zu `SUITE_ADMIN_GROUP_AUFGABEN`) und das Runbook.

## Bewusst nicht Teil dieses Entwurfs

- Gruppenmitglieder aus Pocket ID auflisten (kein Endpunkt im Repo angebunden).
- `bufdi`/`auftrag` in Gruppen überführen (die Jahresrotation spricht dagegen).
- Eine Suite-Admin-Oberfläche zum Rollensetzen (wäre eine zweite Verwaltungsstrecke neben der
  Koordination).
- `/routinen` (bleibt `rolle === "bufdi"`).
