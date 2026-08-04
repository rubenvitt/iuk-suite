# Modul `lagerbuch` — Implementierungsplan, Teil 2: Zugang

> **Für agentische Umsetzer:** PFLICHT-SUB-SKILL `superpowers:subagent-driven-development` (empfohlen)
> oder `superpowers:executing-plans`. Die Tasks sind auf parallele Ausführung geschnitten.
> **Innerhalb einer Wellenstufe dürfen alle genannten Tasks gleichzeitig laufen; über Stufengrenzen
> hinweg nicht.** Die Gates (§4) laufen am Ende **jeder Stufe**.
>
> Jeder Task ist TDD: erst der Test, dann der Code. **Ausgenommen sind die als „Abnahme" markierten
> Schritte** (T27): sie prüfen zusammengesetztes Verhalten, das zum Zeitpunkt ihrer Entstehung schon
> gebaut ist. Sie sind von Anfang an grün, und das ist **kein** Mangel; statt „Rot, weil …" nennen
> sie die **Mutation**, die sie fangen.

**Spec:** `docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` (11.036 Zeilen, verbindlich).
**Faktenbasis:** `docs/lagerbuch-portierung-analyse.md`. **Querschnitt:** `docs/design/README.md`.
**Projektregeln:** `CLAUDE.md`. **Alt-Anwendung:** `../lagerbuch` @ `ca04eb1` (eingefroren).
**Branch:** `feat/lagerbuch-modul` (existiert seit Teil 1).

**Ziel:** Das Modul `lagerbuch` bekommt seinen **Zugang** — beide Sitzungsarten nebeneinander. Der
Verwaltungsriegel `requireLagerbuchAdmin` ohne jede Suite-Admin-Abkürzung; die Helfer-Sitzung als
signiertes jose-Cookie mit sofort wirkendem Sperrbefund aus der Datenbank, lesend **und**
schreibend; der Absenderschlüssel des Gates, der `x-forwarded-for` in keiner Richtung liest; die
drei Gate-Zähler, die ausschließlich Fehlversuche buchen; die vier Gate-Texte an einer Stelle; der
Route Handler `/abmelden`, ohne den eine Server Component ein totes Cookie nicht loswird — und die
Quelltext-Zusicherungen, die genau die Bauform-Fehler fangen, die `pnpm build` strukturell nicht
sehen kann.

**Architektur:** `lagerbuch` ist das fünfte Modul der iuk-suite (`src/app/m/lagerbuch/`) mit einer
eigenen SQLite-Datei `lagerbuch.db`. Es bringt etwas mit, das kein Bestandsmodul hat: **zwei
Sitzungsarten mit gegenläufiger Reichweite.** Die Suite-Sitzung folgt der Elterndomain
(`AUTH_COOKIE_DOMAIN`) — ein angemeldeter Mensch ist auf jedem Modul-Host derselbe. Die
Helfer-Sitzung ist **host-only** und bleibt es. `middleware.ts` fällt ersatzlos weg; die beiden
Cordons werden aufrufbare Funktionen in `_lib/`, und ihre Form entscheidet sich am Aufrufort:
**Riegel in Layouts und Actions, Prädikat in Weichen.**

**Tech Stack:** Next.js 16.2.11 (App Router/RSC) · Ant Design 6 · Drizzle 0.45 + better-sqlite3 12.11
· Auth.js v5 (Pocket ID) · jose · Vitest 4 + Playwright · pnpm.

---

## Plan-Index

**Der vollständige Index aller sechs Teile steht in
`docs/superpowers/plans/2026-08-03-lagerbuch-modul-teil1.md`, Abschnitt „Plan-Index — dieser Plan ist
Teil 1 von sechs".** Er wird hier nicht kopiert; eine zweite Kopie liefe beim ersten Zuschnitt-Wechsel
auseinander.

Dieses Dokument ist **Teil 2** und deckt **Knoten C** des Spec-Anhangs („Abhängigkeiten der
Bauwege"): **Spec §3 vollständig** (§3.1 bis §3.12), dazu die drei Querverweise, die §3 einlöst —
**§2.5** und **§2.8** (dort steht, WO die Riegel gerufen werden; §2 hat es absichtlich offen gelassen
und auf §3 verwiesen) sowie **§4.13 (i)** für `_lib/konto.ts`.

⚠️ **Zwei Korrekturen an der naiven Lesart des Graphen, die Teil 1 aufgeschrieben hat und die hier
eingelöst werden:**

1. **„H zuletzt" gilt für die Quelltext-Scans NICHT.** Der Anhang schreibt ausdrücklich, dass die
   Scans (§3.8.2) **früh** gehören — sie sind billig und fangen genau die Bauform-Fehler, die später
   teuer werden. `_actions/guards.test.ts` entsteht deshalb **hier**, in der **Eigenschaftsform**;
   die **Zählung** (47 = 44 + 3) kommt erst in Teil 6 (Teil 1, Festlegung F4).
2. **Teil 2 baut keine einzige Seite.** Weder das Gate noch `/helfer`, `/a`, `/g` oder `/verwaltung`.
   Dieser Teil baut ausschließlich die **Riegel, Prädikate und Werte**, die jene Seiten ab Teil 3
   aufrufen. Die einzige Route, die hier entsteht, ist der Route Handler `/abmelden` — und der
   entsteht hier, weil er die Voraussetzung von `requireHelferSitzung` ist, nicht weil er eine Seite
   wäre.

---

## 0. Vorbedingungen

**Zwei Einträge aus §15.1 der Spec waren laut Teil 1 „fällig vor Teil 2".** Sie stehen hier mit dem
Zustand, in dem dieser Plan sie vorfindet, und mit dem **Rückfall**, der den Bau nicht blockiert.
Die vollständige Tabelle aller neun offenen Fragen steht in Teil 1, §0; sie wird hier nicht kopiert.

| # | Frage | Antwortet | Blockiert in Teil 2 | Rückfall dieses Plans |
|---|---|---|---|---|
| — | **Der produktive Wert von `SUITE_ADMIN_GROUP_LAGERBUCH`** (Alt-Name `OIDC_ADMIN_GROUP`, `lagerbuch/compose.yaml:23`) | Betreiber | **nichts im Bau** — der Registry-Wert `["lagerbuch_nutzer"]` steht seit T2 (Teil 1) und ist der heutige Vorgabewert wortgleich | **A-T2-1:** Bau und Tests laufen gegen `lagerbuch_nutzer`. Der produktive Wert wird beim Cutover als **eine `.env`-Zeile** gesetzt; `adminGroupsFor` liest sie ohne Rebuild. ⚠️ Ein falscher Wert sperrt **jede** verwaltende Person aus, und es gibt für dieses Modul bewusst **keine** Suite-Admin-Rückfallebene (§3.6.2) |
| 4 | **Entscheidung 22 — Backup-Job** (`starteLagerbuchHintergrund()` oder `scripts/backup.sh`) | Betreiber | **`_lib/grenzen.ts`** (T15): `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` steht in der Tabelle aus §10.3, hängt aber an dieser Antwort | **A-T2-2:** Es gilt Annahme A31 der Spec — Variante (a), **kein** Hintergrund-Eintrag, und `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` **entfällt ersatzlos**. Die Zeile fehlt damit in `ZAHLEN`; fällt die Antwort anders aus, ergänzt **Teil 3** genau eine Zeile in `ZAHLEN` **und** eine in der unabhängigen Testtabelle (T15, Schritt 1) |

**Keine dieser Fragen darf durch eine erfundene Vorbelegung ersetzt werden.** Wo dieser Plan einen
Wert nennt, ist er entweder in der Spec belegt oder — wie oben — als Annahme mit Rückfall markiert.

**Was aus Teil 1 fertig vorliegen muss, bevor T15 beginnt.** Die Abschluss-Abnahme von Teil 1 (§4
dort) ist vollständig abgehakt. Konkret benutzt dieser Plan:

| Aus Teil 1 | Signatur, auf die dieser Plan baut |
|---|---|
| `_lib/host.ts` (T10) | `istLagerbuchHost(headers: Headers): boolean` · `requireLagerbuchHost(headers: Headers): void` (wirft `notFound()`) · `lagerbuchHostOderNull(headers: Headers): "lagerbuch" \| null` |
| `_db/client.ts` (T12) | `getDb(): ReturnType<typeof drizzle<typeof schema>>` · `type DB = ReturnType<typeof getDb>` |
| `_db/schema.ts` (T7) | `tokens` (`id`, `code`, `label`, `aktiv`, `createdAt`, `createdBy`, `lastUsedAt`, `zielTyp`, `zielId`, `scopeLagerortId`) · `users` (`id`, `name`, `email`, `lastLoginAt`) |
| `_db/testdb.ts` (T9) | `migrierteTestDb(praefix?: string): TestDb` mit `{ db, sqlite, schliessen }` |
| `_db/quelle.test.ts` (T13) | die Datei, die **T23 erweitert** (Teil 1, Festlegung F5 — es entsteht **keine zweite**) |
| Registry-Eintrag (T2) | `getModule("lagerbuch")` mit `adminGroups: ["lagerbuch_nutzer"]`, `requiresAuth: false`, `prodHosts: []` |
| `jose` (T1) | als **direkte** Abhängigkeit in `package.json` — unter pnpm ist ein nur transitiv vorhandenes Paket nicht importierbar (Falle 58) |

---

## 1. Festlegungen dieses Plans, die die Spec offen lässt

Acht Punkte. Jeder ist eine Entscheidung dieses Plans, keine Ableitung — sie stehen hier beisammen,
damit ein späterer Teil sie nicht ein zweites Mal trifft. **Sie ergänzen F1–F7 aus Teil 1, sie
ersetzen nichts davon.**

**G1 — `_lib/grenzen.ts` entsteht in Teil 2, nicht in Teil 3 — und zwar mit der VOLLSTÄNDIGEN
`ZAHLEN`-Tabelle.** Teil 1 hat die Datei in seiner Abschlusstabelle Teil 3 zugeschrieben. Das geht
nicht auf: `_lib/gateSchranke.ts` (§3.5.3) beginnt wörtlich mit `const g = grenzen();`, und
`_lib/helferSitzung.ts` braucht `LAGERBUCH_HELFER_SITZUNG_STUNDEN` und
`LAGERBUCH_HELFER_SITZUNG_SECRET`. Beide sind Kernstücke von §3. Der Ausweg „Teil 2 baut eine halbe
Tabelle" ist **verboten**, und der Grund ist derselbe wie bei F4: §10.8, Eigenschaft 2 verlangt eine
**unabhängige Testtabelle** mit Einheit, Mindest- und Höchstwert je Variable, geprüft gegen
`ZAHL_NAMEN`. Eine Vier-Zeilen-Tabelle in Teil 2 machte Teil 3s zwei Ergänzungen zu einem **roten
Test in Teil 2** — dieselbe Falle wie ein `toHaveLength(44)` am ersten Tag, nur spiegelverkehrt.

**Verbindlicher Schnitt:**

- **Teil 2 (T15)** legt an: die vollständige `ZAHLEN`-Tabelle (**sechs** Env-Zahlen, siehe A-T2-2 zur
  siebten), `grenzen(env = process.env): Grenzen`, `ZAHL_NAMEN`, `class GrenzenUngueltig` und
  `helferSitzungGeheimnis(env = process.env): string`.
- **Teil 3** ergänzt in **derselben** Datei: `grenzenFehler(env)` (die Boot-Liste, §10.5 Prüfungen
  1–4), die drei reinen Konstanten `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` (§10.3) —
  und legt `_lib/boot.ts` sowie den Haken in `assertHostConfig()` an. **Es entsteht keine zweite
  Zahlen-Tabelle.**
- Teil 3 erbt damit §10.8, Eigenschaft 1 unverletzt: `grenzen()` und `grenzenFehler()` lesen aus
  **derselben** `ZAHLEN`-Konstante.

⚠️ **Das Geheimnis ist KEINE Zeile in `ZAHLEN`** und wird von `grenzen()` **nicht** gelesen. Es ist
Pflicht ohne Vorbelegung; läse `grenzen()` es mit, bräche **`pnpm build`** — genau der Ausfall, den
§10.8, Eigenschaft 3 über vierzehn Zeilen ausschreibt (`next build` läuft mit
`NODE_ENV=production` und ohne Secrets). Es bekommt deshalb einen eigenen, erst **zur Aufrufzeit**
lesenden Zugang `helferSitzungGeheimnis()`. Vorbild ist `avHost` in
`m/files/_lib/grenzen.ts` — ein Zeichenkettenwert neben, nicht in der Zahlentabelle.

**G2 — Die drei Quelltext-Zusicherungen ohne natürlichen Eigentümer liegen in
`_lib/bauform.test.ts`.** §3.8.2 listet acht Scans und nennt für keinen eine Datei. Fünf haben einen
natürlichen Ort: `kein getModuleDb` liegt seit T12 in `_db/client.test.ts` (Teil 1); `kein domain`
gehört zu `_lib/helferSitzung.test.ts` (T22), weil es eine Aussage über genau diese Datei ist; die
Action-Zusicherung gehört nach `_actions/guards.test.ts` (T20, F4); `kein usePathname` gehört zu §7.8.2
und damit Teil 4. Es bleiben **vier** modulweite Zusicherungen ohne Subjekt-Datei:

| Zusicherung | Wann sie beißt |
|---|---|
| kein `isAdmin` / `session.user.isAdmin` unter `src/app/m/lagerbuch/` | ab T23 (`zugang.ts`) |
| kein `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound`, `canAdminModule` | ab T23 |
| kein `x-forwarded-for` unter `src/app/m/lagerbuch/` | ab T16 (`absender.ts`) |
| kein `requireLagerbuchAdmin` und kein `requireHelferSitzung` in den **drei Weichen-Dateien** — dafür in jeder `requireLagerbuchHost` als **erste** Anweisung | ab **Teil 4** (dort entstehen die drei Dateien) |

Sie kommen in **eine** Datei, `src/app/m/lagerbuch/_lib/bauform.test.ts` (T21). Vier Dateien mit je
zwölf Zeilen wären vier Orte, an denen jemand den nächsten Scan vergisst. **Teil 4 ergänzt in
DERSELBEN Datei** den `usePathname`-Scan und **verschärft** die vierte Zeile von „falls die Datei
existiert" auf „die drei Dateien existieren und tragen die Regel"; **es entsteht keine zweite
Scan-Datei.**

**G3 — Alle Scans dieses Plans sind in der EIGENSCHAFTSFORM geschrieben und tolerieren fehlende
Dateien.** Das ist F4 aus Teil 1, verallgemeinert: `_actions/` ist am ersten Tag leer, die drei
Weichen-Dateien entstehen in Teil 4, `_ui/` gibt es noch gar nicht. Ein Scan, der die **Existenz**
behauptet, ist am ersten Tag rot und wird dann abgeschaltet statt repariert. Jeder Scan dieses Plans
nennt in seinem Kopfkommentar **ausdrücklich, welcher spätere Teil ihn verschärft** — sonst bleibt
die Toleranz für immer stehen und niemand merkt es.

Damit ein toleranter Scan trotzdem TDD-fähig ist, benutzt jeder Scan-Task die **absichtliche
Verletzung**: eine Wegwerfdatei mit dem verbotenen Muster anlegen → Test läuft **rot** → Datei
löschen → grün. Das ist der einzige Weg, „Rot gesehen" für einen Scan ehrlich zu behaupten.

**G4 — `_lib/zugang.ts` und `_lib/konto.ts` gehören EINEM Task (T23).** `requireLagerbuchAdmin` ruft
`merkeNutzer(getDb(), viewer)`, und `merkeNutzer` braucht den Typ `Viewer` aus `zugang.ts`. Auf zwei
Tasks derselben Welle verteilt, typecheckt derjenige nicht, der zuerst landet. Zwei Dateien in einem
Task ist unter der Eigentümerregel zulässig; zwei Tasks in einer Datei wäre es nicht.

⚠️ **Die Rückkante MUSS `import type` sein.** `konto.ts` importiert `Viewer` aus `zugang.ts`, und
`zugang.ts` importiert `merkeNutzer` aus `konto.ts` — ein **Wert**-Import in dieser Richtung erzeugt
einen echten Modulzyklus. TypeScript erlaubt ihn, ESM löst ihn zur Laufzeit mit einem `undefined`
auf, und der Fehler ist ein `merkeNutzer is not a function` auf genau einem Codepfad: dem ersten
Verwaltungsaufruf. `import type` wird beim Übersetzen **gelöscht** und hinterlässt keine Kante.

**G5 — `verwaltungsZiel` wird EXPORTIERT.** §3.6.6 zeigt die Funktion ohne `export`; §2.1 führt sie
in der Inhaltsliste von `zugang.ts` neben den exportierten Namen, und der Auftrag dieses Plans nennt
sie als Liefergegenstand. Entschieden: **`export`** — sonst ist der Zweig „absoluter Host, wenn
`SUITE_HOST_LAGERBUCH` gesetzt ist, sonst relativ" nur über einen abgefangenen `redirect()` prüfbar,
und §3.8.1 verlangt genau diese Aussage in `_lib/zugang.test.ts`. Der Export hat außer dem Test
**keinen** Aufrufer; das ist gewollt und steht als Kommentar an der Funktion.

**G6 — `_lib/returnTo.ts` und `_lib/tokenZiel.ts` entstehen in Teil 2.** §3.1 führt beide in der
Umzugstabelle **dieses** Kapitels („1:1, nur der Ablageort wechselt"). `returnTo.ts` ist **zwingend**
hier, weil `adminLandingPfad` es aufruft. `tokenZiel.ts` hat in Teil 2 **keinen** Aufrufer — sein
erster ist der `/t`-Handler in Teil 4. Es wandert trotzdem hier mit: es sind acht Zeilen, es steht in
der Tabelle dieses Kapitels, und der Alternativzustand („Teil 4 erfindet es neu") ist genau die
Klasse von Doppelung, gegen die die Eigentümertabelle gebaut ist. **Präzedenz:** T6 aus Teil 1 hat
denselben Fall — der Manifest-Verweis zeigt bis Teil 4 auf einen Pfad, der 404 antwortet, „und das ist
gewollt und richtig".

**G7 — Die zwei Sperrgründe der schreibenden Helfer-Actions heißen `SperrGrund` und werden aus
`_lib/helferZugang.ts` exportiert.** §7.3 (Teil 4) definiert
`HelferGrund = "sitzung" | "gesperrt" | "leer" | "netz"` in `_lib/actionTypen.ts`;
`requireHelferSchreibend` liefert davon genau die ersten **zwei**. Zwei getrennte Literal-Unions für
dieselben zwei Wörter sind die Typinkonsistenz, gegen die die Produces-Blöcke geschrieben sind.
**Verbindlich für Teil 4:** `actionTypen.ts` schreibt

```ts
import type { SperrGrund } from "./helferZugang";
export type HelferGrund = SperrGrund | "leer" | "netz";
```

Das ist zeichenweise dieselbe Menge wie §7.3s Aufzählung und hat genau einen Ort für die geteilte
Hälfte. Teil 2 legt `actionTypen.ts` **nicht** an — die Datei gehört Teil 4, und `"leer"`/`"netz"`
haben hier keinen Erzeuger.

**G8 — Die Sekundenzahl in `gateMeldung` bekommt eine Singularform, und `istGateGrund` nimmt
zusätzlich `undefined`.** Zwei Bauform-Kleinigkeiten, die die Spec offen lässt:
`„Bitte in 1 Sekunden erneut versuchen."` ist kein zumutbarer deutscher Satz, also
`sperrSekunden === 1 → „in 1 Sekunde"`. Und `istGateGrund` bekommt `string | null | undefined`
statt `string | null` (§3.9), weil sein zweiter Aufrufer ein `searchParams`-Wert ist und der
`undefined` sein kann; die Aussage der Funktion ändert das nicht.

---

## 2. Global Constraints — was ZUSÄTZLICH aus §3 folgt

**Die projektweiten Constraints stehen vollständig in Teil 1, Abschnitt „Global Constraints", und
gelten unverändert weiter. Sie werden hier NICHT wiederholt.** Insbesondere gelten weiter: kein
`"use client"` unter `_lib/` und `_db/` (Falle 6), kein `@ant-design/icons`-Import unter `_lib/`
(Falle 7), äußere Pfadform für Client-Pfade und innere für `revalidatePath`, kein `_db/queries.ts`,
kein globaler `env`-/`TZ`-Block in `vitest.config.ts`.

Was **zusätzlich** aus den Kapiteln dieses Plans folgt:

**Zugriff — die fünf Sätze, die still fehlschlagen**

1. **ZWEI FORMEN, EINE REGEL (§3.2.1): Riegel in Layouts und Actions, Prädikat in Weichen.** Der
   werfende Riegel `requireLagerbuchAdmin` gehört in die beiden Verwaltungs-Layouts und in **jede**
   Verwaltungs-Action. Das nicht-werfende Paar `viewerOderNull` + `istLagerbuchAdmin` gehört in die
   beiden Rollen-Weichen `a/[artikelId]/page.tsx` und `g/[code]/page.tsx` **und aufs Gate** — dort ist
   „keine Sitzung" ein **dritter gültiger Fall**, kein Fehlerfall. Ein Riegel an dieser Weiche
   schickte jeden anonymen Scan eines Regaletiketts nach `/login`; der Fehler ist typkorrekt,
   lint-sauber und für `pnpm build` unsichtbar.
   ⚠️ **Die Grenze gehört zur Regel:** „Prädikat in Weichen" gilt **nicht** für `_actions/`. Eine
   Action hat keine Weiche — sie hat einen Aufrufer, der schon entschieden hat.
2. **Keine Suite-Admin-Abkürzung.** `isModuleAdmin`, `canAdminModule`, `requireModuleAdmin`,
   `moduleAdminPageOrNotFound` und `session.user.isAdmin` sind für dieses Modul **verboten**.
   `adminGroupsFor(mod)`, **nie** `mod.adminGroups` — der Feldzugriff macht
   `SUITE_ADMIN_GROUP_LAGERBUCH` an genau dieser Stelle wirkungslos. Und: **eine LEERE Gruppenliste
   gewährt NICHTS.** `viewer.groups.some(g => erlaubt.includes(g))` ist bei leerem `erlaubt` falsch —
   das ist ausdrücklich **nicht** die Bauform von `canAccess`, die bei leerer Liste mit `true`
   aussteigt (`core/groups.ts:53-54` nennt das wörtlich „eine **ÖFFNUNG**"). Wer die Verknüpfung von
   `canAccess` abschreibt, öffnet die Lagerbuch-Verwaltung für **jeden Eingeloggten**, und der Fehler
   ist still: alles funktioniert, für zu viele.
3. **Die Absenderadresse liest `cf-connecting-ip`, sonst einen konstanten Sammelschlüssel, und
   NIEMALS `x-forwarded-for`** — weder den ersten noch den rechtesten Eintrag. Der Suite-Container
   ist auf dem Server direkt erreichbar; wer ihn direkt erreicht, setzt den Header vollständig
   selbst, und **beide** Bestandslösungen ergeben unter dieser Topologie einen frischen Eimer je
   Versuch. **`core/ratelimit.ts` wird nicht angefasst** — die `RateLimiter`-Klasse wird
   wiederverwendet, `clientIpAus` nicht.
4. **`requireHelferSitzung`, `requireHelferSchreibend` und `helferZugangOderNull` rufen
   `requireLagerbuchHost` INTERN als ERSTE Anweisung.** Nur so ist die Zusage „jede Helfer-Action ist
   host-gebunden" durch **Konstruktion** wahr statt durch eine Liste, die die nächste Action vergisst.
   `requireLagerbuchAdmin` tut dasselbe — dort zusätzlich, nicht ersatzweise, weil Server Actions kein
   Layout über sich haben.
   ⚠️ **`viewerOderNull` ruft `requireLagerbuchHost` ABSICHTLICH NICHT.** Wer es aus Analogie
   nachträgt, verwandelt das Prädikat zurück in einen Wurf und bricht Punkt 1.
5. **Der Defektzustand aus §4.13 (i):** eine `users`-Zeile mit `name` **und** `email` `null` löst auf
   die **rohe Kennung** auf. `merkeNutzer` überschreibt beim **UPDATE** keinen bekannten Namen mit
   `null` — **beim INSERT gilt das NICHT**, dort werden die mitgelieferten Werte geschrieben, auch
   wenn sie `null` sind. Wer die Bedingung auf beides zieht, erzeugt den Defektzustand mit Ansage.

**Sitzung, Cookie, Geheimnis**

- Cookie-Name **`helfer_session`**, ohne Modulpräfix, in beiden Cutover-Zweigen unverändert.
- **KEIN `domain` am Helfer-Cookie.** Die naheliegende Vorlage (`core/auth/cookies.ts:46-59`) setzt
  es aus `AUTH_COOKIE_DOMAIN` und ist für die **Suite**-Sitzung richtig. Kopiert man das hierher,
  wandert das Helfer-Cookie an **jeden** Modul-Host.
- **Nutzlast `{ tokenId }`** — `code` und `label` fallen weg und kommen ab jetzt aus der Token-Zeile.
  `verifyHelferSitzung` verlangt **nur** `typeof tokenId === "string"` und **ignoriert überzählige
  Felder**: ein Alt-Cookie mit `{tokenId, code, label}` verifiziert unverändert weiter. Eine strikte
  Feldprüfung beendet **jede laufende Feld-Sitzung** beim Cutover, und kein anderer Test sieht das.
- **Fehlt `exp`, liefert `verifyHelferSitzung` `null`.** Das ist die eine bewusste Verschärfung; sie
  darf nur deshalb dort stehen, weil der Aussteller den Claim seit jeher unbedingt setzt.
- Geheimnis: **`LAGERBUCH_HELFER_SITZUNG_SECRET`**, eigener Schlüssel, Wert 1:1 aus der alten
  `stack.env`. ⚠️ **Lagerbuchs `AUTH_SECRET` wird NICHT in die Suite übernommen** — es zu ersetzen
  meldet portal, qr, feedback und files auf einen Schlag ab und kauft für lagerbuch nichts.
- `secure` kommt aus `process.env.NODE_ENV === "production"`, **nicht** aus einer Basis-URL: die Suite
  kennt `APP_BASE_URL` nicht.

**Gate-Schranke**

- **Es werden ausschließlich FEHLVERSUCHE gebucht.** Ein richtiger Code wird eingelöst, auch während
  die Sperre läuft. Genau das macht den modulweiten Deckel vertretbar.
- **Der Budgetverbrauch liegt HINTER der Codeprüfung**, die **Sperrprüfung davor** — und die
  Sperrprüfung ist es, die den Datenbankzugriff deckelt, nicht der Absender-Eimer.
- Die Kette ist **kurzschließend**: ein bereits gesperrter Absender verbraucht das modulweite Budget
  nicht mit.
- `gateSchranke.ts` hat **genau zwei** Exporte. Die drei `RateLimiter` und die `Map` bleiben
  modul-intern; ein vierter Aufrufer, der selbst buchen will, ist konstruktiv ausgeschlossen.

**Was in diesem Teil ausdrücklich NICHT gebaut wird** (§3.12, §3.2.4, §3.5.4)

- **Keine Änderung an `core/routing.ts`**, kein Pfadpräfix je Modul.
- **Keine Änderung an `core/ratelimit.ts`**, kein `SUITE_TRUSTED_PROXIES`, kein konfigurierbarer
  Hop-Zähler, keine zweite Variante von `clientIpAus`.
- **Kein Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts:103-105`** — für lagerbuch nicht
  nötig, weil die Funktion nicht benutzt wird.
- **Kein zweiter Host**, keine `helferGateDecision`, kein `verwaltungCordonDecision`, kein
  `kontoAusLogin`, kein `consumeRate`, kein `clientIp`, keine `/verwaltung/kein-zugriff`.
- **Kein `jti`, kein Einzel-Widerruf je Sitzung, keine gleitende Erneuerung.**
- **Kein `session.error`-Riegel** (§3.6.5) — hingenommen, damit sein Fehlen eine Entscheidung ist.
- **Keine `callback-url`-`maxAge` in `core/auth/cookies.ts`** — benannter Suite-Posten, nicht dieses
  Vorhaben.

---

## 3. Datei-Eigentümerschaft — mechanisch prüfbar

Jede Datei gehört genau einem Task. Wer in einer fremden Datei arbeitet, hat den Schnitt verlassen.

| Datei | Task |
|---|---|
| `src/app/m/lagerbuch/_lib/grenzen.ts`, `_lib/grenzen.test.ts` | T15 |
| `src/app/m/lagerbuch/_lib/absender.ts`, `_lib/absender.test.ts` | T16 |
| `src/app/m/lagerbuch/_lib/code.ts`, `_lib/code.test.ts` | T17 |
| `src/app/m/lagerbuch/_lib/gateTexte.ts`, `_lib/gateTexte.test.ts` | T18 |
| `src/app/m/lagerbuch/_lib/returnTo.ts`, `_lib/returnTo.test.ts`, `_lib/tokenZiel.ts`, `_lib/tokenZiel.test.ts` | T19 |
| `src/app/m/lagerbuch/_actions/guards.test.ts` | T20 |
| `src/app/m/lagerbuch/_lib/bauform.test.ts` | T21 |
| `src/app/m/lagerbuch/_lib/helferSitzung.ts`, `_lib/helferSitzung.test.ts` | T22 |
| `src/app/m/lagerbuch/_lib/zugang.ts`, `_lib/zugang.test.ts`, `_lib/konto.ts` | T23 |
| `src/app/m/lagerbuch/_db/quelle.test.ts` (**Erweiterung** — Teil 1/T13 hat sie angelegt) | T23 |
| `src/app/m/lagerbuch/_lib/gateSchranke.ts`, `_lib/gateSchranke.test.ts` | T24 |
| `src/app/m/lagerbuch/_lib/helferZugang.ts`, `_lib/helferZugang.test.ts` | T25 |
| `src/app/m/lagerbuch/abmelden/route.ts` | T26 |
| `.env.example` | T26 |
| — (nur Ausführung und Protokoll) | T27 |

**Keine `core`-Datei wird in Teil 2 angefasst.** Das ist eine Zusage, kein Zufall: §3.5.4 und §3.6.2
begründen einzeln, warum `core/ratelimit.ts` und `core/groups.ts` unverändert bleiben. Der
Boot-Haken in `core/bootstrap.ts`, den Teil 1 für Teil 2 angekündigt hatte, wandert mit `_lib/boot.ts`
nach **Teil 3** — er hängt an `grenzenFehler()`, und das ist §10.5.

⚠️ **Zwei Dateien werden von späteren Teilen ERWEITERT, nicht ersetzt** — beides steht auch in der
Abschlusstabelle (§10):
`_lib/grenzen.ts` (Teil 3: `grenzenFehler()` + drei Konstanten) und `_lib/bauform.test.ts`
(Teil 4: `usePathname`-Scan + Verschärfung der Weichen-Zeile). `_actions/guards.test.ts` wird von
**Teil 6** um die Zählung erweitert und von Teil 4/5 **gar nicht angefasst**.

---

## 4. Gates am Ende jeder Wellenstufe

```bash
pnpm typecheck        # muss grün sein
pnpm lint             # Fehler blockieren, Warnungen nicht
pnpm vitest run       # muss grün sein
pnpm build            # muss grün sein
```

**`pnpm exec playwright test` ist in Teil 2 NICHT fällig.** Der E2E-Aufbau — `playwright.config.ts`
mit `SUITE_HOST_LAGERBUCH`, den Gate-Zahlen, dem Sitzungsgeheimnis, der Admin-Gruppe, dem Seed-Schritt
und dem **zweiten Host** — gehört laut Teil 1 zu **Teil 3** (§12.6). Ohne ihn ist keine der sieben
Zusagen aus §3.8.3 durchführbar: sechs brauchen eine Sitzung oder einen Seed, und die zwei
Host-Zeilen brauchen den zweiten `baseURL`.

⚠️ **`pnpm build` prüft in Teil 2 fast nichts von dem, was dieser Teil baut — und das muss man
wissen, bevor man ihn als Nachweis protokolliert.** Bis Teil 4 importiert **keine Route** eine
`_lib`-Datei; die einzige Ausnahme entsteht in T26 (`abmelden/route.ts` zieht `host.ts`,
`helferSitzung.ts` und `gateTexte.ts` mit). Next übersetzt ein unreferenziertes Modul eines Private
Folders **gar nicht**, ein `env -u … pnpm build` liefe also trivial grün. Wo dieser Plan die
Modulebene prüfen will — und das ist überall dort, wo §10.8, Eigenschaft 3 gilt —, benutzt er
deshalb einen **ausdrücklichen Import**:

```bash
pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/<datei>.ts").then(…)'
```

**Ab Teil 4 übernimmt `pnpm build` diese Rolle von selbst.** Bis dahin ist er ein Gate gegen
Typfehler und Übersetzungsprobleme, kein Nachweis über Modulebenen.

**Was die vier Gates strukturell NICHT sehen** (§12.4) und wo es nachgeholt wird:

| Blindstelle | Nachgeholt |
|---|---|
| Ein WERT aus einem `"use client"`-Modul kommt in einer Server Component nicht an (Falle 6) | `_lib/bauform.test.ts` scannt `_lib/` auf `"use client"` — die Ergänzung zu T4 aus Teil 1 (T21, Schritt 5) |
| `@ant-design/icons` in RSC (Falle 7) | `src/core/shell/icons.test.ts` (Bestand, repo-weit) |
| Ein Riegel statt eines Prädikats in einer der drei Weichen-Dateien | `_lib/bauform.test.ts` in Eigenschaftsform (T21), verschärft in Teil 4 |
| Eine Action ohne Guard-Zeile | `_actions/guards.test.ts` in Eigenschaftsform (T20), gezählt in Teil 6 |
| Der 303 von `/abmelden` samt `Set-Cookie` mit `Max-Age=0` und **ohne** `Domain=` | **echter Abruf** gegen einen laufenden Dev-Server (T26, Schritt 6; wiederholt in T27) — er braucht keine Sitzung und ist deshalb schon hier prüfbar |
| Alles Übrige aus §3.8.3 (Sperrbefund, fremder Suite-Host, Suite-Admin ohne Gruppe) | Teil 3 (Harness) und Teil 6 (die E2E-Dateien) |

---

## Welle 1 — Reine Werte und die Scans (7 Tasks, alle parallel)

Diese sieben Tasks berühren einander nicht. Fünf liefern reine, abhängigkeitsarme Werte; zwei
liefern Scans, die von Anfang an tolerant sind und ihre Zähne erst in Welle 2 zeigen — genau deshalb
stehen sie hier und nicht später.

⚠️ **T15 ist der früheste Schritt dieses Plans**: T22 und T24 hängen daran, und beide sind Kernstücke.
Wer die Welle sequentiell abarbeitet, beginnt mit T15.

---

### Task 15: `_lib/grenzen.ts` — eine Tabelle, gelesen zur Aufrufzeit

**Files:**
- Create: `src/app/m/lagerbuch/_lib/grenzen.ts`
- Test: `src/app/m/lagerbuch/_lib/grenzen.test.ts`

**Interfaces:**
- Consumes: nichts. **Die früheste Datei dieses Plans.**
- Produces:
  ```ts
  export class GrenzenUngueltig extends Error {}          // name === "GrenzenUngueltig"

  export interface Grenzen {
    readonly verfallRotTage: number;
    readonly verfallGelbTage: number;
    readonly helferSitzungStunden: number;
    readonly gateProAbsenderProMin: number;
    readonly gateGesamtProMin: number;
    readonly gateGesamtProStunde: number;
  }

  export function grenzen(env?: Record<string, string | undefined>): Grenzen;
  export const ZAHL_NAMEN: readonly string[];             // die sechs Env-Namen, NICHT die Tabelle
  export function helferSitzungGeheimnis(env?: Record<string, string | undefined>): string;
  ```
  Konsumenten: `_lib/gateSchranke.ts` (T24), `_lib/helferSitzung.ts` (T22), ab Teil 3
  `_lib/domain/verfall.ts` und `_lib/boot.ts`.
- ⚠️ **Teil 3 ERWEITERT diese Datei** um `grenzenFehler(env)` und die drei reinen Konstanten
  `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` (Festlegung G1). Es entsteht **keine zweite
  Zahlen-Tabelle** — §10.8, Eigenschaft 1: `grenzen()` und `grenzenFehler()` lesen aus **derselben**
  `ZAHLEN`-Konstante, sonst prüfte der Boot etwas anderes als das, was zur Laufzeit gilt.

**Warum diese Datei zu Teil 2 gehört und nicht zu Teil 3.** Vollständig in Festlegung G1. Die
Kurzfassung: `gateSchranke.ts` beginnt wörtlich mit `const g = grenzen();`, und eine **halbe**
Tabelle in Teil 2 machte Teil 3s Ergänzung zu einem roten Test **in Teil 2** — §10.8, Eigenschaft 2
verlangt eine unabhängige Testtabelle, geprüft gegen `ZAHL_NAMEN`.

**Die drei nicht verhandelbaren Eigenschaften** (§10.8), und die dritte hat lagerbuch selbst schon
einmal gekostet:

1. **Eine Tabelle, zwei Leser.** `grenzen()` und (ab Teil 3) `grenzenFehler()` lesen aus derselben
   `ZAHLEN`-Konstante. Zwei Tabellen wären zwei Wahrheiten.
2. **Die Tabelle wird NICHT exportiert, nur die Namensliste.** Sonst zöge der Test seine
   Erwartungswerte aus der Implementierung und bliebe auch bei falscher Einheit grün — genau das ist
   bei `files` passiert und von der unabhängigen Testtabelle gefunden worden
   (`files/_lib/grenzen.ts:137-151`).
3. **Gelesen wird bei JEDEM Aufruf, nicht beim Import.** `lagerbuch/src/lib/config.ts:89` ist heute
   `export const config = parseConfig(process.env)` — ein Modul-Singleton —, und `:91-99` schreibt
   über vierzehn Zeilen aus, warum der Secret-Riegel deshalb nicht in `parseConfig` stehen darf:
   `next build` läuft mit `NODE_ENV=production` und **ohne Secrets**. Ein unbesehen mitportierter
   Singleton, der jetzt zusätzlich Pflichtvariablen fordert, **bricht `pnpm build`** — und kein
   anderer Test dieses Plans fängt das ab.

⚠️ **Deshalb ist das Geheimnis KEINE Zeile in `ZAHLEN`.** Alle sechs Zahlen haben eine
**Vorbelegung**; eine nicht gesetzte Umgebung lässt `grenzen()` also klaglos durchlaufen, und
`pnpm build` bleibt grün. Das Geheimnis hat **keine** Vorbelegung — es ist Pflicht, sobald das Modul
erreichbar ist. Läse `grenzen()` es mit, bräche der Build. `helferSitzungGeheimnis()` wird erst aus
`createHelferSitzung`/`verifyHelferSitzung` gerufen, also zur **Anfragezeit**, und wirft dort mit
einer Meldung, die den Variablennamen nennt. Der Boot-Riegel aus Teil 3 (§10.5, Prüfung 4) fängt den
Fall früher und mit besserer Meldung ab; diese Zeile ist die zweite Linie, nicht die erste.

⚠️ **Ein UNGÜLTIGER Wert bricht dagegen schon den Import von `gateSchranke.ts` ab, und das ist
gewollt.** `grenzen()` wirft `GrenzenUngueltig`, `gateSchranke.ts` ruft es auf Modulebene. Der
Unterschied zu Eigenschaft 3 ist wesentlich und muss beim Lesen erhalten bleiben: **nicht gesetzt**
ist der Bauzeit-Fall und läuft durch; **gesetzt und kaputt** (`LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=fünf`)
ist ein Konfigurationsfehler, und ein Modul, das mit einer kaputten Zahl gar nicht erst startet, ist
richtiger als eines, das still eine andere Grenze fährt als die, die in der `.env` steht.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben — mit UNABHÄNGIGER Tabelle**

`src/app/m/lagerbuch/_lib/grenzen.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { grenzen, ZAHL_NAMEN, GrenzenUngueltig, helferSitzungGeheimnis } from "./grenzen";

/**
 * DIE UNABHAENGIGE ERWARTUNGSTABELLE (§10.8, Eigenschaft 2).
 *
 * Sie steht hier ausgeschrieben und wird NICHT aus `grenzen.ts` importiert. Wer
 * `ZAHLEN` exportierte und hier laese, machte aus diesem Test eine Tautologie:
 * er pruefte den Code gegen sich selbst und bliebe auch bei falscher Einheit,
 * falscher Vorbelegung und falscher Obergrenze gruen. Genau das ist bei `files`
 * passiert — dort stand „Anzahl" im Code, wo die Spec „Anzahl/10 min" verlangt,
 * und nur die unabhaengige Tabelle hat es gefunden.
 *
 * Die Werte stammen Zeile fuer Zeile aus Spec §10.3.
 *
 * ⚠️ `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` FEHLT hier mit Absicht (Annahme
 * A-T2-2, §0): Entscheidung 22 ist offen, und der Rueckfall A31 der Spec ist
 * „Variante (a), kein Hintergrund-Eintrag, Variable entfaellt". Faellt die
 * Betreiberantwort anders aus, ergaenzt TEIL 3 genau eine Zeile hier UND eine in
 * `ZAHLEN` — nicht eine von beiden.
 */
const ERWARTET = [
  { name: "LAGERBUCH_VERFALL_ROT_TAGE",                    vorgabe: 31,  min: 1, max: 3650 },
  { name: "LAGERBUCH_VERFALL_GELB_TAGE",                   vorgabe: 56,  min: 1, max: 3650 },
  { name: "LAGERBUCH_HELFER_SITZUNG_STUNDEN",              vorgabe: 12,  min: 1, max: 24 },
  { name: "LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",  vorgabe: 5,   min: 1, max: 60 },
  { name: "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN",    vorgabe: 30,  min: 1, max: 600 },
  { name: "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", vorgabe: 300, min: 1, max: 3600 },
] as const;

/** Eine leere Umgebung — NICHT `process.env`. Der Test darf nicht davon abhaengen,
 *  was in der Entwicklerumgebung zufaellig gesetzt ist. */
const LEER: Record<string, string | undefined> = {};

describe("ZAHL_NAMEN — die Namensliste gegen die unabhaengige Tabelle", () => {
  it("enthaelt genau die erwarteten Namen, in beiden Richtungen", () => {
    // Beide Richtungen: eine hier ergaenzte Zeile ohne Gegenstueck in `ZAHLEN`
    // faellt genauso auf wie eine dort ergaenzte ohne Gegenstueck hier.
    expect([...ZAHL_NAMEN].sort()).toEqual(ERWARTET.map((e) => e.name).sort());
  });

  it("traegt in JEDEM Namen die Einheit — kein nackter Zahlname", () => {
    // §10.1: „Warum die Einheit im Namen steht". Eine Grenze namens
    // LAGERBUCH_VERFALL laesst offen, ob Tage, Wochen oder Prozent gemeint sind,
    // und beide Zuweisungen waeren typkorrekt.
    for (const name of ZAHL_NAMEN) {
      expect(name).toMatch(/_(TAGE|STUNDEN|MIN|STUNDE|SEKUNDEN|BYTES)$/);
    }
  });
});

describe("grenzen() — Vorbelegungen", () => {
  it("liefert bei LEERER Umgebung jede Vorgabe aus der Tabelle", () => {
    // Das ist zugleich die Zusage, die `pnpm build` gruen haelt: `next build`
    // laeuft ohne .env, und `gateSchranke.ts` ruft `grenzen()` auf Modulebene.
    const g = grenzen(LEER);
    expect(g.verfallRotTage).toBe(31);
    expect(g.verfallGelbTage).toBe(56);
    expect(g.helferSitzungStunden).toBe(12);
    expect(g.gateProAbsenderProMin).toBe(5);
    expect(g.gateGesamtProMin).toBe(30);
    expect(g.gateGesamtProStunde).toBe(300);
  });

  it("LEER GESETZT gilt wie NICHT GESETZT", () => {
    // `LAGERBUCH_VERFALL_ROT_TAGE=` ist der haeufigere Fall als die fehlende
    // Zeile, und `Number("")` waere 0 — eine Ampel, die sofort rot ist.
    expect(grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "" }).verfallRotTage).toBe(31);
    expect(grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "   " }).verfallRotTage).toBe(31);
  });

  it("liest bei JEDEM Aufruf, nicht beim Import (§10.8, Eigenschaft 3)", () => {
    expect(grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "8" }).helferSitzungStunden).toBe(8);
    expect(grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "6" }).helferSitzungStunden).toBe(6);
  });
});

describe("grenzen() — die Ganzzahlpruefung ist NICHT Number()", () => {
  it("weist Hex ab, obwohl Number('0x10') ganzzahlig waere", () => {
    // Der ganze Grund fuer das eigene /^[+-]?\d+$/: `Number("0x10")` ist 16 und
    // `Number.isInteger(16)` wahr. Eine Pruefung ueber `Number` allein liesse Hex
    // und `1e7` durch, und die GELTENDE Grenze waere eine andere als die, die in
    // der .env steht.
    expect(() => grenzen({ LAGERBUCH_GATE_GESAMT_PLATZHALTER: "x" })).not.toThrow(); // unbekannte Namen ignoriert
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "0x10" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "1e7" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "31.5" })).toThrow(GrenzenUngueltig);
    expect(() => grenzen({ LAGERBUCH_VERFALL_ROT_TAGE: "fuenf" })).toThrow(GrenzenUngueltig);
  });

  it("weist jeden Wert ausserhalb des Bereichs ab — an BEIDEN Raendern", () => {
    for (const e of ERWARTET) {
      expect(() => grenzen({ [e.name]: String(e.min - 1) })).toThrow(GrenzenUngueltig);
      expect(() => grenzen({ [e.name]: String(e.max + 1) })).toThrow(GrenzenUngueltig);
      expect(() => grenzen({ [e.name]: String(e.min) })).not.toThrow();
      expect(() => grenzen({ [e.name]: String(e.max) })).not.toThrow();
    }
  });

  it("nennt in der Meldung den NAMEN, den WERT und die EINHEIT", () => {
    // Diese Meldung liest der Betreiber, wenn der Container nicht startet. „Wert
    // ungueltig" ohne Namen ist eine Meldung, die eine Suche ausloest statt sie
    // zu beenden.
    try {
      grenzen({ LAGERBUCH_HELFER_SITZUNG_STUNDEN: "48" });
      expect.unreachable("haette werfen muessen");
    } catch (e) {
      const text = (e as Error).message;
      expect(text).toContain("LAGERBUCH_HELFER_SITZUNG_STUNDEN");
      expect(text).toContain("48");
      expect(text).toContain("Stunden");
      expect(text).toContain("24");
    }
  });

  it("GrenzenUngueltig ist ein EIGENER Typ, unterscheidbar vom Betriebsfehler", () => {
    const e = new GrenzenUngueltig("x");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("GrenzenUngueltig");
  });
});

describe("grenzen() prueft KEINE Kopplungen — die gehoeren Teil 3", () => {
  it("laesst ROT > GELB durch, weil das eine BOOT-Pruefung ist", () => {
    /**
     * §10.5, Pruefung 2 und 3 (Kopplungen) liegen in `grenzenFehler()`, und das
     * entsteht in TEIL 3. `grenzen()` liefert die GELTENDEN Werte, auch wenn sie
     * zueinander unsinnig stehen — sonst haette der Boot keine Chance, eine
     * BRAUCHBARE Sammelmeldung zu bauen: er will alle Fehler auf einmal nennen,
     * nicht den ersten.
     *
     * ⚠️ Diese Zeile ist die Stelle, an der jemand aus gutem Willen zu viel tut.
     * Wer die Kopplung hier ergaenzt, macht `grenzenFehler()` in Teil 3
     * unbrauchbar und bricht den Import von `gateSchranke.ts` bei einer
     * Fehlkonfiguration, die eine Meldung verdient hat.
     */
    expect(() => grenzen({
      LAGERBUCH_VERFALL_ROT_TAGE: "90", LAGERBUCH_VERFALL_GELB_TAGE: "56",
    })).not.toThrow();
    expect(() => grenzen({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "1",
    })).not.toThrow();
  });
});

describe("helferSitzungGeheimnis — Pflicht, aber NICHT in ZAHLEN", () => {
  it("steht NICHT in ZAHL_NAMEN", () => {
    // Waere es eine Zahl-Zeile, laese `grenzen()` es mit — und `pnpm build`
    // braeche, weil `next build` ohne Secrets laeuft (§10.8, Eigenschaft 3).
    expect(ZAHL_NAMEN).not.toContain("LAGERBUCH_HELFER_SITZUNG_SECRET");
  });

  it("liefert den gesetzten Wert", () => {
    expect(helferSitzungGeheimnis({
      LAGERBUCH_HELFER_SITZUNG_SECRET: "e2e-helfer-secret-nicht-produktiv-32z",
    })).toBe("e2e-helfer-secret-nicht-produktiv-32z");
  });

  it("wirft, wenn die Variable fehlt oder LEER ist — und nennt den Namen", () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String, und leer greift keinen Default. `jose` verweigert danach einen
    // Nullschluessel („Zero-length key is not supported") — ohne diese Zeile
    // bootet der Container gruen und faellt erst beim ersten /t/<code>-Scan mit
    // 500 um. Das Scheitern waere von der Startzeit in die Nutzungszeit gewandert.
    for (const env of [{}, { LAGERBUCH_HELFER_SITZUNG_SECRET: "" },
                       { LAGERBUCH_HELFER_SITZUNG_SECRET: "   " }]) {
      expect(() => helferSitzungGeheimnis(env)).toThrow(GrenzenUngueltig);
      expect(() => helferSitzungGeheimnis(env)).toThrow(/LAGERBUCH_HELFER_SITZUNG_SECRET/);
    }
  });

  it("prueft an DIESER Stelle NICHT auf Laenge, Dev-Default oder AUTH_SECRET-Gleichheit", () => {
    /**
     * §10.5, Pruefung 4 verlangt zusaetzlich: mindestens 32 Zeichen, nicht
     * `dev-insecure-secret-change-me`, nicht identisch mit AUTH_SECRET. Das sind
     * BOOT-Pruefungen und gehoeren zu `grenzenFehler()` (Teil 3).
     *
     * Warum nicht hier: diese Funktion laeuft bei JEDEM Cookie-Vorgang. Ein
     * zu kurzes Geheimnis waehrend eines Cutover-Abends abzulehnen, machte aus
     * einer Konfigurationswarnung einen Ausfall JEDER laufenden Feld-Sitzung —
     * und das an einer Stelle, an der niemand die Meldung liest. Der Riegel
     * gehoert an den Start, nicht in den Sitzungspfad.
     */
    expect(() => helferSitzungGeheimnis({ LAGERBUCH_HELFER_SITZUNG_SECRET: "kurz" }))
      .not.toThrow();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/grenzen.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./grenzen"`.

- [ ] **Schritt 3: `_lib/grenzen.ts` schreiben**

```ts
/**
 * Alle Zahlen des Moduls `lagerbuch` an EINER Stelle, und jeder Name traegt
 * seine Einheit (§10.1, §10.3).
 *
 * KEIN "use client" in dieser Datei. Die Zahlen liest sowohl eine Server
 * Component (`verwaltung/artikel/page.tsx`) als auch eine Client-Insel (die
 * Zaehl-Liste) — und ein WERT aus einem Client-Modul kommt in einer Server
 * Component nicht an, sondern als Client-Referenz (Falle 6, `CLAUDE.md:24-27`).
 * HTTP 500 fuer die ganze Seite, das `pnpm build` nicht sieht und Vitest
 * strukturell nicht sehen KANN, weil "use client" dort ein wirkungsloser String
 * ist.
 *
 * DIESE DATEI HAELT KEINE MILLIMETER. Die Druckgeometrie des Etikettenbogens
 * (§8.4) ist CSS-Geometrie und gehoert dorthin; was Server- und Client-Seite
 * beide brauchen, liegt in `_lib/etikettMasse.ts`. Sie hier zu spiegeln erzeugte
 * eine zweite Wahrheit, die niemand gegen das Papier prueft.
 *
 * DIESE DATEI HAELT AUCH KEINE BOOT-PRUEFUNG. `grenzenFehler()` (§10.5) und
 * `_lib/boot.ts` entstehen in TEIL 3 und lesen dieselbe ZAHLEN-Tabelle von hier
 * — zwei Tabellen waeren zwei Wahrheiten, und der Boot pruefte etwas anderes als
 * das, was zur Laufzeit gilt.
 */

/** Wie in `core/hosts.ts`: nur „String rein, String oder undefined raus". */
type EnvLike = Record<string, string | undefined>;

/**
 * Die Konfiguration traegt einen Wert, mit dem das Modul nicht arbeiten kann.
 * Ein EIGENER Typ, damit ein Aufrufer ihn von einem Betriebsfehler unterscheiden
 * kann — er ist immer ein Konfigurationsfehler, nie ein Laufzeitproblem.
 */
export class GrenzenUngueltig extends Error {
  constructor(botschaft: string) {
    super(botschaft);
    this.name = "GrenzenUngueltig";
  }
}

/** Die Einheit, die in JEDE Meldung zu dieser Variable gehoert (§10.1). */
type Einheit = "Tage" | "Stunden" | "Anzahl/min" | "Anzahl/h";

interface ZahlRegel {
  readonly einheit: Einheit;
  readonly min: number;
  readonly max: number;
  readonly vorgabe: number;
}

/**
 * Die Tabelle aus §10.3, vollstaendig — die EINZIGE Quelle. `grenzen()` und (ab
 * Teil 3) `grenzenFehler()` lesen beide von hier.
 *
 * ⚠️ LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE FEHLT mit Absicht. Entscheidung 22
 * (Backup-Job) ist offen; bis zur Betreiberantwort gilt Annahme A31 der Spec —
 * Variante (a), kein Hintergrund-Eintrag, Variable entfaellt ersatzlos. Faellt
 * die Antwort anders aus, ergaenzt Teil 3 EINE Zeile hier UND eine in der
 * unabhaengigen Testtabelle in `grenzen.test.ts`; nur eine von beiden macht den
 * Test rot, und das ist der Sinn der Doppelfuehrung.
 */
const ZAHLEN = {
  // Zu klein: Chargen laufen ab, ohne je rot gewesen zu sein — die Ampel warnt
  // zu spaet, und niemand merkt es, weil sie ja etwas anzeigt.
  LAGERBUCH_VERFALL_ROT_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 31 },
  // Obergrenze 3650, weil die Kopplungspruefung allein ROT=9999, GELB=99999
  // durchliesse — und das ist eine Ampel, die immer leuchtet.
  LAGERBUCH_VERFALL_GELB_TAGE: { einheit: "Tage", min: 1, max: 3650, vorgabe: 56 },
  // Obergrenze 24: eine Feldsitzung darf nie laenger dauern als eine Schicht plus
  // Puffer. Der Wert steht ZWEIMAL in derselben Sitzung — als JWT-`exp` und als
  // Cookie-`maxAge` (§3.4.3); ein verlorenes Kaertchen gibt dem Finder genau so
  // lange Lesezugriff auf den gesamten Bestand, wie diese Zahl sagt.
  LAGERBUCH_HELFER_SITZUNG_STUNDEN: { einheit: "Stunden", min: 1, max: 24, vorgabe: 12 },
  // 1:1 die heutige Zusage (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`). Der Eimer
  // wird ab jetzt NUR bei Fehlversuchen verbraucht (§3.5.3) — dieselbe Zahl ist
  // damit deutlich grosszuegiger als heute.
  LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 60, vorgabe: 5 },
  // Die modulweite Burst-Kappe gegen Rotation des Absenderschluessels.
  // 30 = sechs Absender-Budgets.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: { einheit: "Anzahl/min", min: 1, max: 600, vorgabe: 30 },
  // DER tragende Zaehler. 300 = 5/min x 60 — die Zahl stellt genau die Zusage
  // wieder her, die das Per-Absender-Limit nur unter der Annahme einer
  // wahrhaftigen Absenderadresse je hatte.
  // ⚠️ Runbook: `select count(*) from tokens where aktiv = 1`; liegt die Zahl
  // oberhalb von etwa 60, gehoert dieser Wert gesenkt.
  LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: { einheit: "Anzahl/h", min: 1, max: 3600, vorgabe: 300 },
} as const satisfies Record<string, ZahlRegel>;

type ZahlName = keyof typeof ZAHLEN;

/**
 * Die NAMEN der Zahl-Variablen — und ausdruecklich nur sie, nicht `ZAHLEN`
 * selbst.
 *
 * `grenzen.test.ts` fuehrt eine EIGENE Tabelle mit Einheit, Mindest- und
 * Hoechstwert je Variable und vergleicht sie gegen diese Liste. So faellt eine
 * hier ergaenzte Zeile auf, die dort fehlt (und umgekehrt) — ohne dass der Test
 * seine Erwartungswerte aus der Implementierung zieht. Wer `ZAHLEN` exportierte,
 * machte aus dem Test eine Tautologie: er pruefte den Code gegen sich selbst und
 * bliebe auch bei falscher Einheit gruen (§10.8, Eigenschaft 2).
 */
export const ZAHL_NAMEN: readonly ZahlName[] = Object.keys(ZAHLEN) as ZahlName[];

/** Die Werte, mit denen das Modul arbeitet. Jeder Feldname traegt seine Einheit. */
export interface Grenzen {
  readonly verfallRotTage: number;
  readonly verfallGelbTage: number;
  readonly helferSitzungStunden: number;
  readonly gateProAbsenderProMin: number;
  readonly gateGesamtProMin: number;
  readonly gateGesamtProStunde: number;
}

/**
 * Ganze Dezimalzahl mit optionalem Vorzeichen — bewusst NICHT `Number()`.
 * `Number("0x10")` ist 16 und `Number.isInteger(16)` wahr: eine Pruefung ueber
 * `Number` allein liesse Hex und `1e7` durch, und die GELTENDE Grenze waere eine
 * andere als die, die in der .env steht (Vorbild `files/_lib/grenzen.ts:199`).
 */
const GANZZAHL = /^[+-]?\d+$/;

/**
 * Eine Zahl aus der Umgebung — oder ihre Vorbelegung.
 *
 * LEER GESETZT GILT WIE NICHT GESETZT. `LAGERBUCH_VERFALL_ROT_TAGE=` ist der
 * haeufigere Fall als die fehlende Zeile (jemand raeumt eine .env auf), und
 * `Number("")` waere 0 — eine Ampel, die sofort rot ist, oder ein Gate-Limit,
 * das jeden abweist.
 */
function zahl(name: ZahlName, env: EnvLike): number {
  const regel = ZAHLEN[name];
  const roh = env[name]?.trim();
  if (roh === undefined || roh === "") return regel.vorgabe;
  if (!GANZZAHL.test(roh)) {
    throw new GrenzenUngueltig(
      `${name}="${roh}" ist keine ganze Zahl. Erwartet: ${regel.min} bis ${regel.max} ` +
        `(${regel.einheit}).`,
    );
  }
  const wert = Number.parseInt(roh, 10);
  if (wert < regel.min || wert > regel.max) {
    throw new GrenzenUngueltig(
      `${name}=${wert} liegt ausserhalb von ${regel.min} bis ${regel.max} (${regel.einheit}).`,
    );
  }
  return wert;
}

/**
 * Die geltenden Werte. GELESEN WIRD BEI JEDEM AUFRUF, nicht beim Import
 * (§10.8, Eigenschaft 3) — dieselbe Form wie `DATA_DIR` in `core/db` und wie
 * `files/_lib/grenzen.ts:368`.
 *
 * KEINE KOPPLUNGSPRUEFUNG hier. „ROT <= GELB" und die Gate-Ungleichungskette
 * sind BOOT-Pruefungen (§10.5) und liegen ab Teil 3 in `grenzenFehler()`: der
 * Boot will ALLE Fehler auf einmal melden, nicht den ersten, und `grenzen()`
 * muss dieselbe Auswertung ohne Gate liefern koennen — sonst gaebe es zwei
 * Auswertungen und damit zwei Wahrheiten.
 */
export function grenzen(env: EnvLike = process.env): Grenzen {
  return {
    verfallRotTage: zahl("LAGERBUCH_VERFALL_ROT_TAGE", env),
    verfallGelbTage: zahl("LAGERBUCH_VERFALL_GELB_TAGE", env),
    helferSitzungStunden: zahl("LAGERBUCH_HELFER_SITZUNG_STUNDEN", env),
    gateProAbsenderProMin: zahl("LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN", env),
    gateGesamtProMin: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN", env),
    gateGesamtProStunde: zahl("LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE", env),
  };
}

/**
 * Das Sitzungsgeheimnis — PFLICHT, und deshalb ausdruecklich KEINE Zeile in
 * `ZAHLEN` und kein Feld von `Grenzen`.
 *
 * WARUM DIE TRENNUNG TRAEGT: alle sechs Zahlen haben eine Vorbelegung, `grenzen()`
 * laeuft also auf einer leeren Umgebung klaglos durch — und genau das braucht
 * `next build`, das mit NODE_ENV=production und OHNE Secrets laeuft und dabei
 * `gateSchranke.ts` importiert, wo `grenzen()` auf Modulebene steht. Zoege man
 * das Geheimnis in dieselbe Auswertung, braeche `pnpm build`, und kein Kapitel
 * dieser Spec sonst faengt das ab (§10.8, Eigenschaft 3).
 *
 * DIESE FUNKTION LAEUFT ZUR ANFRAGEZEIT. Ihr einziger Aufrufer ist
 * `_lib/helferSitzung.ts`, und zwar in einem Thunk, nicht auf Modulebene.
 *
 * SIE PRUEFT NUR „gesetzt und nicht leer". Mindestlaenge, Dev-Default und die
 * Ungleichheit zu AUTH_SECRET sind BOOT-Pruefungen (§10.5, Pruefung 4) und
 * gehoeren zu `grenzenFehler()` in Teil 3 — ein zu kurzes Geheimnis waehrend
 * eines Cutover-Abends abzulehnen machte aus einer Konfigurationswarnung einen
 * Ausfall JEDER laufenden Feld-Sitzung, an einer Stelle, an der niemand die
 * Meldung liest.
 */
export function helferSitzungGeheimnis(env: EnvLike = process.env): string {
  const wert = env.LAGERBUCH_HELFER_SITZUNG_SECRET?.trim();
  if (!wert) {
    throw new GrenzenUngueltig(
      `LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt oder leer. Ohne das Geheimnis ` +
        `kann keine Helfer-Sitzung ausgestellt oder geprueft werden. Der Wert wird beim ` +
        `Cutover 1:1 aus der alten stack.env uebernommen (HELFER_SESSION_SECRET) und ` +
        `ueber env_file gesetzt, nicht als \${VAR:?}-Zeile in der compose.yaml.`,
    );
  }
  return wert;
}
```

⚠️ **Der Rückgabewert von `helferSitzungGeheimnis` wird NICHT getrimmt gespeichert und dann anders
verglichen.** Hier steht `?.trim()` **und** der getrimmte Wert wird zurückgegeben. Gäbe die Funktion
den **ungetrimmten** Wert zurück, während die Leerprüfung auf dem getrimmten liefe, unterschiede sich
das Geheimnis zwischen zwei Umgebungen um ein Leerzeichen am Zeilenende — und **jede** laufende
Feld-Sitzung wäre ungültig, ohne dass irgendwo etwas rot würde. Eine `.env`-Zeile mit
Trailing-Whitespace ist der wahrscheinlichste Weg dorthin.

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/grenzen.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 5: Nachweisen, dass die Modulebene OHNE Secrets auswertbar ist**

⚠️ **`pnpm build` ist an dieser Stelle KEIN Nachweis, und das muss man wissen, bevor man ihn
protokolliert.** Nichts unter `_lib/` wird bis Teil 4 von einer Route importiert; Next übersetzt ein
unreferenziertes Modul eines Private Folders **gar nicht**. Ein `env -u … pnpm build` liefe hier also
**trivial grün** und behauptete etwas, das es nicht geprüft hat — genau die Sorte Schritt, die ein
späterer Plan für bare Münze nimmt.

**Der Nachweis, der jetzt schon trägt, importiert das Modul ausdrücklich:**

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/grenzen.ts").then(m => {
    const g = m.grenzen();
    console.log("Modulebene ausgewertet, Vorgaben:", g.gateProAbsenderProMin, g.gateGesamtProStunde);
  })'
```

Erwartet: `Modulebene ausgewertet, Vorgaben: 5 300` — **ohne** Wurf. Das ist §10.8, Eigenschaft 3 in
seiner prüfbaren Form: alle sechs Zahlen haben eine Vorbelegung, `grenzen()` läuft also auf einer
leeren Umgebung durch.

**Die Gegenprobe, die den Unterschied zeigt** — sie muss **werfen**:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/grenzen.ts")
    .then(m => m.helferSitzungGeheimnis())
    .catch(e => { console.log("erwartet geworfen:", e.name, e.message.slice(0, 60)); })'
```

Erwartet: `erwartet geworfen: GrenzenUngueltig LAGERBUCH_HELFER_SITZUNG_SECRET ist nicht gesetzt…`.
**Genau dieser Wurf säße auf der Modulebene, wenn das Geheimnis eine `ZAHLEN`-Zeile wäre** — und
bräche ab Teil 4 jeden Build. T22, Schritt 6 fährt die Probe an der Stelle, an der sie zuschlägt.

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/grenzen.ts src/app/m/lagerbuch/_lib/grenzen.test.ts
git commit -m "feat(lagerbuch): _lib/grenzen.ts — eine Tabelle, gelesen zur Aufrufzeit

Die sechs Env-Zahlen aus Spec §10.3 mit Einheit im Namen, Vorbelegung, Bereich.
grenzen(env = process.env) liest bei JEDEM Aufruf, nicht beim Import — ein
Modul-Singleton wuerde von next build ausgewertet, das ohne Secrets laeuft
(§10.8, Eigenschaft 3).

Das Sitzungsgeheimnis ist bewusst KEINE Zeile in ZAHLEN und kein Feld von
Grenzen: es ist Pflicht ohne Vorbelegung, und mitgelesen braeche es pnpm build.
Es bekommt helferSitzungGeheimnis(), das erst zur Anfragezeit laeuft.

Die Tabelle wird NICHT exportiert, nur ZAHL_NAMEN — der Test fuehrt eine eigene
Erwartungstabelle, sonst prueft er den Code gegen sich selbst.

Datei liegt in Teil 2 statt Teil 3 (Festlegung G1): gateSchranke.ts beginnt mit
const g = grenzen(). Teil 3 ERGAENZT hier grenzenFehler() und die drei reinen
Konstanten; es entsteht keine zweite Zahlen-Tabelle.

LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE fehlt bewusst — Entscheidung 22 offen,
Rueckfall A31 (Variable entfaellt), ausgeschrieben in Plan §0."
```

---

### Task 16: `_lib/absender.ts` — der Bündelungsschlüssel, der `x-forwarded-for` nie liest

**Files:**
- Create: `src/app/m/lagerbuch/_lib/absender.ts`
- Test: `src/app/m/lagerbuch/_lib/absender.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function absenderAus(headers: Headers): string;   // "cf:<ip>" oder "direkt"
  ```
  Konsumenten: `_actions/gate.ts` (`einloesenAmGate`), `_actions/sitzung.ts` (`erneuereSitzung`),
  `t/[code]/route.ts` und die Gate-Seite `page.tsx` — **alle vier in Teil 4** (§7.2.3, §7.2.4,
  §7.4.4). In Teil 2 hat die Funktion **keinen** Aufrufer außer ihrem Test; das ist gewollt (dieselbe
  Lage wie `_lib/tokenZiel.ts`, Festlegung G6).

**Der Befund, und warum BEIDE Bestandslösungen ausscheiden.** Der Betreiber hat am 03.08.2026
beantwortet, was die Analyse offen ließ: **der Suite-Container ist auf dem Server direkt erreichbar**,
also an Cloudflare und Traefik vorbei. Diese Antwort wählt keine der beiden vorhandenen Richtungen
aus — **sie zeigt, dass beide unter dieser Topologie falsch sind.**

⚠️ **Betreiberentscheidung D6 vom 04.08.2026: der direkte Weg bleibt OFFEN.** „An der Infra ändere
ich nichts, das Deployment liegt auf dem Server." Damit ist die Restlücke unten kein hypothetischer
Zweig mehr, sondern der **Ist-Zustand** — und sie gehört genau deshalb ausgeschrieben und nicht in
eine Fußnote:

**Jeder Absenderschlüssel ist fälschbar.** Wer den Container direkt erreicht, setzt
`cf-connecting-ip` selbst und rotiert ihn nach Belieben; der Per-Absender-Eimer ist damit **keine
Abwehr, sondern eine Bequemlichkeitsgrenze gegen Tippfehler**. Was trägt, sind die **beiden
modulweiten Zähler** (`gateMinute`, `gateStunde`) — ihr Schlüssel ist konstant und deshalb der
einzige, den niemand rotieren kann.

**Zwei Folgen, die daran hängen:**

1. **`LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` ist ab jetzt die tragende Zahl**, nicht die
   zweite Verteidigungslinie. Entscheidung D5 (wie viele Codes produktiv aktiv sind) entscheidet
   damit unmittelbar über die Belastbarkeit — bei 100 aktiven Codes und 300 Versuchen/h liegt der
   erwartete erste Treffer bei rund **1,4 Tagen**.
2. **Die Lücke gehört in die Cutover-Übergabe**, nicht in einen Kommentar. Sie ist kein Baufehler
   und wird von keinem Test rot — ein Test kann die Netztopologie nicht sehen.

| Quelle | Durch die Proxy-Kette | Bei Direktzugriff |
|---|---|---|
| **rechtester `x-forwarded-for`-Eintrag** (lagerbuch, `src/lib/auth/rateLimit.ts:29-35`) | Traefik hängt die Peer-Adresse an; das ist die Cloudflare-Edge und für **alle** Clients derselbe Wert → **ein globaler Eimer** | frei vom Anfragenden setzbar → **ein neuer Eimer pro Versuch** |
| **erster `x-forwarded-for`-Eintrag** (Suite, `core/ratelimit.ts:60`) | richtig, solange Cloudflare den Header setzt | frei vom Anfragenden setzbar → **ein neuer Eimer pro Versuch** |

Die CWE-348-Begründung in `lagerbuch/src/lib/auth/rateLimit.ts:23-28` ist **richtig gedacht für eine
andere Topologie** — sie nimmt genau einen vertrauenswürdigen Reverse-Proxy an. Die Suite-Fassung ist
**richtig für die vier laufenden Module**, die hinter Cloudflare stehen. Keine der beiden ist richtig
für ein Gate mit sechsstelligem Code auf einem direkt erreichbaren Container.

⚠️ **Dieser Test ist die Erbin von `lagerbuch/src/lib/auth/rateLimit.test.ts:33-38`** — deren
ersatzloses Löschen zusammen mit der Datei ist laut Analyse **die einzige ungesicherte Stelle** des
ganzen Umbaus. Die Zusicherung wandert mit, in ihrer neuen Form.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/absender.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { absenderAus } from "./absender";

const kopf = (h: Record<string, string>) => new Headers(h);

describe("absenderAus", () => {
  it("nimmt cf-connecting-ip und traegt den cf:-Praefix", () => {
    expect(absenderAus(kopf({ "cf-connecting-ip": "203.0.113.7" }))).toBe("cf:203.0.113.7");
  });

  it("liest x-forwarded-for in KEINER Richtung — weder erster noch letzter Eintrag", () => {
    /**
     * DIE ZEILE, WEGEN DER ES DIESE DATEI GIBT. Sie ersetzt
     * `lagerbuch/src/lib/auth/rateLimit.test.ts:33-38`.
     *
     * Der Suite-Container ist direkt erreichbar (Betreiber, 03.08.2026). Wer ihn
     * direkt erreicht, setzt den Header VOLLSTAENDIG selbst — den ersten Eintrag
     * zu nehmen (core/ratelimit.ts:60) oder den letzten
     * (lagerbuch/rateLimit.ts:29-35) macht dabei keinen Unterschied: beide
     * ergeben einen FRISCHEN Eimer je Versuch.
     *
     * Die Mutation, die ohne diesen Test gruen bliebe: „x-forwarded-for als
     * Rueckfall einbauen". Sie sieht wie eine Verbesserung aus und ist der ganze
     * Fehler.
     */
    expect(absenderAus(kopf({ "x-forwarded-for": "198.51.100.1, 203.0.113.9" }))).toBe("direkt");
    expect(absenderAus(kopf({ "x-forwarded-for": "198.51.100.1" }))).toBe("direkt");
  });

  it("liest x-forwarded-for auch NEBEN cf-connecting-ip nicht mit", () => {
    // Kein zusammengesetzter Schluessel, keine Verkettung: der Wert traegt genau
    // eine Herkunft, sonst rotiert ein Angreifer die zweite Haelfte.
    expect(absenderAus(kopf({
      "cf-connecting-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1",
    }))).toBe("cf:203.0.113.7");
  });

  it("faellt ohne beide Koepfe auf EINEN konstanten Sammelschluessel", () => {
    // Der sichere Ausfallmodus: alle kopflosen Aufrufer teilen sich EINEN Eimer.
    // Er kann nur zu STRENG sein, nie zu lasch — und ein richtiger Code
    // funktioniert dabei immer, weil nur Fehlversuche buchen (§3.5.3).
    expect(absenderAus(kopf({}))).toBe("direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "" }))).toBe("direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "   " }))).toBe("direkt");
  });

  it("der Praefix trennt die Namensraeume", () => {
    // Ohne ihn koennte ein gefaelschtes `cf-connecting-ip: direkt` den
    // Sammel-Eimer der kopflosen Aufrufer mitbenutzen oder umgekehrt verstopfen.
    expect(absenderAus(kopf({ "cf-connecting-ip": "direkt" }))).toBe("cf:direkt");
    expect(absenderAus(kopf({ "cf-connecting-ip": "direkt" })))
      .not.toBe(absenderAus(kopf({})));
  });

  it("trimmt den Wert, damit ein Leerzeichen keinen zweiten Eimer oeffnet", () => {
    expect(absenderAus(kopf({ "cf-connecting-ip": " 203.0.113.7 " }))).toBe("cf:203.0.113.7");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/absender.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./absender"`.

- [ ] **Schritt 3: `_lib/absender.ts` schreiben**

```ts
/**
 * Der Buendelungsschluessel des Gate-Fehlerzaehlers. NICHT „die Client-IP" —
 * der Name sagt bewusst nicht mehr, als der Wert traegt.
 *
 * WARUM `x-forwarded-for` HIER GAR NICHT VORKOMMT — in keiner Richtung:
 * der Suite-Container ist auf dem Server direkt erreichbar (Betreiber,
 * 03.08.2026). Wer ihn direkt erreicht, setzt den Header vollstaendig selbst.
 * Den ERSTEN Eintrag zu nehmen (`core/ratelimit.ts:60`) oder den LETZTEN
 * (`lagerbuch/src/lib/auth/rateLimit.ts:29-35`) macht dabei keinen Unterschied:
 * beide ergeben einen frischen Eimer je Versuch. Beide Begruendungen sind fuer
 * ihre jeweilige Topologie richtig und fuer diese hier falsch.
 *
 * `cf-connecting-ip` setzt Cloudflare. Er ist damit fuer jede Anfrage DURCH die
 * Kette der echte Absender — und fuer eine Anfrage am Rand vorbei ebenso
 * faelschbar wie alles andere. Er ist also eine Buendelung, kein Beweis; in
 * `files` heisst die entsprechende Spalte aus demselben Grund
 * `client_ip_unbestaetigt` (`core/ratelimit.ts:52-55`).
 *
 * OHNE JEDEN KOPF ein KONSTANTER Wert: alle kopflosen Aufrufer teilen sich EINEN
 * Eimer. Das ist der sichere Ausfallmodus — er kann nur zu STRENG sein, nie zu
 * lasch. Fuenf FEHLVERSUCHE pro Minute fuer alle direkt Anfragenden zusammen;
 * ein richtiger Code funktioniert dabei immer (§3.5.3).
 *
 * Der Praefix `cf:` trennt die Namensraeume: ohne ihn koennte ein gefaelschter
 * `cf-connecting-ip: direkt` den Sammel-Eimer der kopflosen Aufrufer mitbenutzen
 * oder umgekehrt verstopfen.
 *
 * AUSGESPROCHEN, STATT WEGGESCHRIEBEN: dieser Schluessel bleibt umgehbar. Wer den
 * Container direkt erreicht, faelscht `cf-connecting-ip` und rotiert ihn. Der
 * Per-Absender-Zaehler ist damit eine Bequemlichkeitsgrenze gegen Tippfehler und
 * ungezieltes Klopfen — NICHT die Brute-Force-Abwehr. Die Abwehr sind die beiden
 * modulweiten Zaehler in `gateSchranke.ts`, weil ihr Schluessel der einzige ist,
 * den niemand rotieren kann. Die Restluecke schliesst eine NETZENTSCHEIDUNG, kein
 * Code: kein Host-Port-Mapping am Suite-Dienst, Traefik-Entrypoint nur aus den
 * Cloudflare-Bereichen erreichbar (Runbook-Schritt mit Gegenprobe, §3.5.2).
 *
 * `Headers` genuegt als Parametertyp, obwohl `await headers()` Nexts
 * `ReadonlyHeaders` liefert: das ist zuweisbar. Die Signatur NIMMT die Header,
 * statt sie selbst zu holen — nur so ist sie aus einem Route Handler benutzbar
 * und ohne Next-Kontext testbar.
 */
export function absenderAus(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip")?.trim();
  return cf ? `cf:${cf}` : "direkt";
}
```

- [ ] **Schritt 4: Test grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/absender.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/absender.ts src/app/m/lagerbuch/_lib/absender.test.ts
git commit -m "feat(lagerbuch): _lib/absender.ts — cf-connecting-ip oder ein konstanter Eimer

x-forwarded-for wird in KEINER Richtung gelesen. Der Suite-Container ist direkt
erreichbar (Betreiber 03.08.2026); wer ihn direkt erreicht, setzt den Header
selbst — erster und letzter Eintrag ergeben gleichermassen einen frischen Eimer
je Versuch. Beide Bestandsloesungen sind fuer ihre Topologie richtig und fuer
diese falsch.

Ohne Kopf ein KONSTANTER Sammelschluessel: der sichere Ausfallmodus, weil nur
Fehlversuche buchen. Der cf:-Praefix trennt die Namensraeume.

core/ratelimit.ts wird NICHT angefasst (§3.5.4) — fuer portal, qr, feedback und
files aendert sich nichts.

Der Test ist die Erbin von lagerbuch/src/lib/auth/rateLimit.test.ts:33-38, deren
ersatzloses Loeschen laut Analyse die einzige ungesicherte Stelle des Umbaus war."
```

---

### Task 17: `_lib/code.ts` — der Bindestrich, die billigste Maßnahme gegen den geteilten Eimer

**Files:**
- Create: `src/app/m/lagerbuch/_lib/code.ts`
- Test: `src/app/m/lagerbuch/_lib/code.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export function normalisiereCode(roh: string): string;
  ```
  **Drei** Konsumenten, alle in Teil 4: `t/[code]/route.ts`, `_actions/gate.ts` (`einloesenAmGate`)
  und `_actions/sitzung.ts` (`erneuereSitzung`) — §7.5.3.

**Der Befund (Falle 24).** `redeemToken` normalisiert heute mit `trim().toUpperCase()`
(`lagerbuch/src/actions/token-redeem.ts:13`) — auf einer reinen Ziffernfolge **wirkungslos** — und
sucht auf Gleichheit (`:14`); der Generator setzt den Bindestrich fest zwischen Position 3 und 4
(`src/actions/tokens.ts:15`). **Die Eingabe `123456` findet `123-456` nicht.** Und weil der
Bündelungsschlüssel bündelt, teilen sich alle Helferinnen hinter demselben Uplink fünf Fehlversuche
pro Minute — eine Bereitschaft, die zu Schichtbeginn von Hand eintippt, sperrt sich selbst aus,
**mit richtigen Codes**.

**Warum die EINGABE normalisiert wird und nicht die Spalte.** Die Suche bleibt eine Gleichheitssuche
gegen `tokens.code`. Damit kann die Normalisierung nur Treffer **hinzufügen**, nie einen bestehenden
verlieren — genau deshalb ist sie sicher. Ein `LIKE`, ein `replace()` in SQL oder eine zweite,
normalisierte Spalte wären allesamt Eingriffe in den gespeicherten Wert, und der Code ist zugleich
QR-Nutzlast, Gate-Eingabe **und** Anzeigeschlüssel im Journal.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/code.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalisiereCode } from "./code";

describe("normalisiereCode", () => {
  it("bringt jede zumutbare Eingabeform auf DIESELBE kanonische Gestalt", () => {
    // Der Fall, um den es geht: `123456` findet heute `123-456` nicht und
    // verbrennt einen Fehlversuch aus einem Eimer, den sich eine ganze
    // Bereitschaft teilt.
    for (const roh of ["123456", "123-456", " 123 - 456 ", "123 456", "\t123456\n"]) {
      expect(normalisiereCode(roh)).toBe("123-456");
    }
  });

  it("laesst die Erzeugerform unveraendert", () => {
    // Die Erzeugerform ist der Fixpunkt: normalisiereCode(x) === x fuer jedes x,
    // das der Generator ausgibt. Ohne diese Eigenschaft aendert die Funktion die
    // Bedeutung bestehender laminierter Kaertchen.
    expect(normalisiereCode("482-137")).toBe("482-137");
    expect(normalisiereCode(normalisiereCode("482137"))).toBe("482-137");
  });

  it("verstuemmelt einen fremdartigen Wert NICHT still", () => {
    /**
     * Die Mutation, die ohne diesen Fall gruen bliebe: die Bindestrich-Ergaenzung
     * entfernen. Sie liefert `{ok:false}` — also genau das, was ein FALSCHER Code
     * liefern soll — und hat damit KEINE Fehlerform. Der Ausfall waere „das Gate
     * nimmt meinen Code nicht", und die Ursache stuende nirgends.
     *
     * Deshalb ist der Filter bewusst weiter als sechs Ziffern: sollte der
     * Betreiber je alphanumerische Codes ausgeben, bleibt die Funktion RICHTIG,
     * statt still zu verstuemmeln.
     */
    expect(normalisiereCode("ABC-DEF")).toBe("ABCDEF");
    expect(normalisiereCode("12345")).toBe("12345");    // zu kurz: kein Bindestrich
    expect(normalisiereCode("1234567")).toBe("1234567"); // zu lang: kein Bindestrich
    expect(normalisiereCode("")).toBe("");
  });

  it("faltet Kleinbuchstaben nach oben, wie der Bestand", () => {
    expect(normalisiereCode("abc-def")).toBe("ABCDEF");
  });

  it("wirft NIE — sie ist eine Normalisierung, kein Validator", () => {
    // Der Validator ist die Gleichheitssuche gegen tokens.code. Ein Wurf hier
    // machte aus einem Tippfehler einen 500 im Route Handler.
    expect(() => normalisiereCode("!!!")).not.toThrow();
    expect(normalisiereCode("!!!")).toBe("");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/code.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./code"`.

- [ ] **Schritt 3: `_lib/code.ts` schreiben**

```ts
/**
 * Kanonische Form eines Zugangs-Codes: 6 Ziffern mit Bindestrich nach der
 * dritten (Erzeugerform, `lagerbuch/src/actions/tokens.ts:15`).
 *
 * Die Suche laeuft auf Gleichheit gegen `tokens.code`, deshalb wird die EINGABE
 * auf die Erzeugerform gebracht und nicht die Spalte aufgeweicht. Damit kann die
 * Normalisierung nur Treffer HINZUFUEGEN, nie einen bestehenden verlieren —
 * genau deshalb ist sie sicher.
 *
 * WARUM DAS KEINE BEQUEMLICHKEIT IST, sondern die billigste Massnahme gegen
 * einen geteilten Fehlversuchs-Eimer (§7.5.3, Falle 24): `123456` findet heute
 * `123-456` nicht, und alle Helferinnen hinter demselben Uplink teilen sich
 * fuenf Fehlversuche pro Minute. Eine Bereitschaft, die zu Schichtbeginn von
 * Hand eintippt, sperrt sich selbst aus — mit RICHTIGEN Codes.
 *
 * Der `[^0-9A-Z]`-Filter ist bewusst weiter als sechs Ziffern: sollte der
 * Betreiber je alphanumerische Codes ausgeben, bleibt die Funktion richtig,
 * statt still zu verstuemmeln.
 *
 * SIE WIRFT NIE. Der Validator ist die Gleichheitssuche gegen `tokens.code`;
 * ein Wurf hier machte aus einem Tippfehler einen 500 im Route Handler.
 *
 * Zusammen mit `inputMode="numeric"`, `maxlength="7"` und `pattern` am Feld
 * (§7.2.4) ist das die vollstaendige Abhilfe.
 */
export function normalisiereCode(roh: string): string {
  const nur = roh.trim().toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^\d{6}$/.test(nur) ? `${nur.slice(0, 3)}-${nur.slice(3)}` : nur;
}
```

- [ ] **Schritt 4: Test grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/code.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/code.ts src/app/m/lagerbuch/_lib/code.test.ts
git commit -m "feat(lagerbuch): _lib/code.ts — normalisiereCode, drei Aufrufer ab Teil 4

Heute findet die Eingabe 123456 den Code 123-456 nicht: redeemToken normalisiert
mit trim().toUpperCase(), was auf einer Ziffernfolge wirkungslos ist, und sucht
auf Gleichheit. Der Fehlversuch faellt in einen Eimer, den sich eine ganze
Bereitschaft hinter einem Uplink teilt.

Normalisiert wird die EINGABE, nicht die Spalte: die Suche bleibt eine
Gleichheitssuche gegen tokens.code, die Normalisierung kann damit nur Treffer
hinzufuegen und nie einen verlieren.

Der Filter ist bewusst weiter als sechs Ziffern — alphanumerische Codes blieben
richtig statt still verstuemmelt. Die Funktion wirft nie."
```

---

### Task 18: `_lib/gateTexte.ts` — die vier Sätze an genau einer Stelle (Falle 60)

**Files:**
- Create: `src/app/m/lagerbuch/_lib/gateTexte.ts`
- Test: `src/app/m/lagerbuch/_lib/gateTexte.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";
  export const GATE_GRUENDE: readonly GateGrund[];
  export function istGateGrund(roh: string | null | undefined): roh is GateGrund;
  export function gateMeldung(roh: string | null | undefined,
                              sperrSekunden: number | null): string | null;
  ```
  **Drei** Konsumenten: die Gate-Seite `page.tsx` (§7.2.4, Teil 4), `_actions/gate.ts`
  (`einloesenAmGate`, Teil 4) — und `abmelden/route.ts` (**T26, dieser Plan**), das nur
  `istGateGrund` benutzt, um Werte aus diesem Satz weiterzureichen.

**Der Befund (Falle 60).** `lagerbuch/src/app/t/[code]/route.ts:21` hängt heute `?err=rate` bzw.
`?err=code` an die Gate-URL. Ein `grep` auf den String über `src/` liefert genau **einen** Treffer, und
das ist die **schreibende** Zeile; `src/app/(gate)/page.tsx:10` destrukturiert aus `searchParams`
ausschließlich `returnTo`. Wer heute ein Etikett scannt, dessen Code gesperrt oder rate-limitiert
ist, landet **wortlos** auf dem Gate und sieht dasselbe Bild wie bei einem ganz normalen Aufruf.

**Das ist ein Mangel des Bestands, aber es ist eine Falle für die Portierung selbst:** `?err=` sieht
in `route.ts` nach einer funktionierenden Nutzerauskunft aus, und ein Port, der die Zeile mitnimmt
und abhakt, übernimmt eine **Sackgasse als Feature**.

**Der Name wechselt von `err` auf `grund`, weil der Wertesatz wächst** — `err` kannte zwei Werte,
`grund` kennt vier. Ein gespeicherter Alt-Link mit `?err=` ist danach **wirkungslos, aber nicht
kaputt** (unbekannte Parameter werden ignoriert).

⚠️ **`GateGrund` ist NICHT `HelferGrund`** (§7.3, Teil 4). Sie überschneiden sich in genau einem Wort
(`gesperrt`) und in **keinem Weg**: `HelferGrund` beschreibt das Ergebnis einer Helfer-**Action am
Formular**, `GateGrund` den **Anlass einer Landung am Gate**. Zusammenlegen hieße, den Text „deine
Eingaben bleiben stehen" auf eine Seite zu schreiben, auf der nichts eingegeben wurde.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/gateTexte.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { istGateGrund, gateMeldung, GATE_GRUENDE, type GateGrund } from "./gateTexte";

describe("istGateGrund — ein GESCHLOSSENER Satz", () => {
  it("erkennt genau die vier Werte", () => {
    for (const g of ["code", "gesperrt", "abgelaufen", "zuviele"]) {
      expect(istGateGrund(g)).toBe(true);
    }
    expect([...GATE_GRUENDE].sort())
      .toEqual(["abgelaufen", "code", "gesperrt", "zuviele"]);
  });

  it("weist alles andere ab — ein searchParams-Wert ist NUTZEREINGABE", () => {
    /**
     * Der Wert wird gegen die Liste geprueft und NIE in die Seite durchgereicht.
     * Ohne diese Zeile stuende `?grund=<img src=x onerror=...>` im Gate-Text,
     * und React entkaeme es zwar — aber der Route Handler /abmelden baut daraus
     * einen Location-Kopf, und dort gilt das nicht.
     */
    for (const roh of ["rate", "CODE", " code", "", "code,gesperrt", "__proto__"]) {
      expect(istGateGrund(roh)).toBe(false);
    }
    expect(istGateGrund(null)).toBe(false);
    expect(istGateGrund(undefined)).toBe(false);
  });
});

describe("gateMeldung — die einzige Stelle, an der diese Saetze stehen", () => {
  it("liefert fuer jeden Grund einen deutschen Satz", () => {
    expect(gateMeldung("code", null))
      .toBe("Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.");
    expect(gateMeldung("gesperrt", null))
      .toBe("Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.");
    expect(gateMeldung("abgelaufen", null))
      .toBe("Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.");
  });

  it("unterscheidet `code` und `gesperrt` im WORTLAUT", () => {
    // Nicht kosmetisch: `code` heisst „unbekannt ODER gesperrt" (der Scanner
    // weiss es nicht), `gesperrt` heisst „wir wissen es genau, dein Kaertchen
    // wurde gesperrt". Zusammengelegt verlaere die zweite Lage ihre Auskunft.
    expect(gateMeldung("code", null)).not.toBe(gateMeldung("gesperrt", null));
  });

  it("traegt bei `zuviele` die Sekundenzahl — und faellt ohne sie auf die Minute", () => {
    expect(gateMeldung("zuviele", 42))
      .toBe("Zu viele Fehlversuche. Bitte in 42 Sekunden erneut versuchen.");
    // Kommt null zurueck, ist die Sperre inzwischen abgelaufen (§3.9).
    expect(gateMeldung("zuviele", null))
      .toBe("Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen.");
  });

  it("schreibt die Singularform aus", () => {
    // Festlegung G8 — „in 1 Sekunden" ist kein zumutbarer deutscher Satz.
    expect(gateMeldung("zuviele", 1))
      .toBe("Zu viele Fehlversuche. Bitte in 1 Sekunde erneut versuchen.");
  });

  it("ignoriert `sperrSekunden` bei jedem anderen Grund", () => {
    // Die Zahl gehoert zu `zuviele` und zu nichts sonst. Ohne diese Zeile
    // wanderte sie beim naechsten Umbau in einen Text, in dem sie nichts bedeutet.
    expect(gateMeldung("code", 42)).toBe(gateMeldung("code", null));
  });

  it("liefert null bei unbekanntem oder fehlendem Grund — das Gate rendert normal", () => {
    // Ausdruecklich KEIN Rueckfalltext. Ein „Etwas ist schiefgelaufen" auf einer
    // Seite, die gerade voellig normal aufgerufen wurde, ist schlechter als
    // Schweigen — und der Regelfall dieser Seite IST der normale Aufruf.
    expect(gateMeldung(null, null)).toBeNull();
    expect(gateMeldung(undefined, null)).toBeNull();
    expect(gateMeldung("rate", null)).toBeNull();     // der ALTE Wert aus ?err=
    expect(gateMeldung("", null)).toBeNull();
  });

  it("kennt fuer JEDEN Wert des Satzes einen Text — keine Luecke", () => {
    // Mechanisch: waechst GATE_GRUENDE um einen Wert, ohne dass gateMeldung ihn
    // kennt, ist das hier rot statt still `null`.
    for (const g of GATE_GRUENDE) {
      expect(gateMeldung(g, 5), `kein Text fuer ${g}`).toBeTypeOf("string");
    }
  });
});

describe("die Typzusage", () => {
  it("verengt den Typ, damit ein roher Wert nicht durchrutscht", () => {
    const roh: string | null = "gesperrt";
    if (istGateGrund(roh)) {
      const g: GateGrund = roh;   // typecheckt NUR, wenn `roh is GateGrund` greift
      expect(g).toBe("gesperrt");
    } else {
      expect.unreachable("haette erkannt werden muessen");
    }
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/gateTexte.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./gateTexte"`.

- [ ] **Schritt 3: `_lib/gateTexte.ts` schreiben**

```ts
/**
 * Die vier Gate-Texte aus §3.9 an GENAU EINER Stelle. KEIN "use client"
 * (Falle 6 — die Gate-Seite ist eine Server Component und braucht die WERTE).
 *
 * DER BEFUND, DEN DIESE DATEI HEILT (Falle 60): `lagerbuch/src/app/t/[code]/route.ts:21`
 * haengt heute `?err=rate` bzw. `?err=code` an die Gate-URL — und NIEMAND liest
 * das. Ein grep auf den String ueber src/ liefert genau einen Treffer, und das
 * ist die schreibende Zeile; `src/app/(gate)/page.tsx:10` destrukturiert
 * ausschliesslich `returnTo`. Wer heute ein Etikett mit gesperrtem Code scannt,
 * landet WORTLOS auf dem Gate und sieht dasselbe Bild wie bei einem normalen
 * Aufruf.
 *
 * Das ist ein Mangel des Bestands — und eine Falle fuer die Portierung: `?err=`
 * sieht in `route.ts` nach einer funktionierenden Auskunft aus, und ein Port,
 * der die Zeile mitnimmt und abhakt, uebernimmt eine SACKGASSE ALS FEATURE.
 *
 * Der Parameter heisst deshalb `grund` und nicht mehr `err`: der Wertesatz
 * waechst von zwei auf vier. Ein gespeicherter Alt-Link mit `?err=` ist danach
 * wirkungslos, aber nicht kaputt — unbekannte Parameter werden ignoriert.
 *
 * ⚠️ NICHT ZU VERWECHSELN MIT `HelferGrund` aus `_lib/actionTypen.ts` (§7.3,
 * Teil 4): der beschreibt das Ergebnis einer Helfer-ACTION am Formular, dieser
 * den Anlass einer Landung AM GATE. Sie ueberschneiden sich in genau einem Wort
 * (`gesperrt`) und in KEINEM Weg — zusammenlegen hiesse, den Text „deine
 * Eingaben bleiben stehen" auf eine Seite zu schreiben, auf der nichts
 * eingegeben wurde.
 */
export type GateGrund = "code" | "gesperrt" | "abgelaufen" | "zuviele";

/**
 * Der geschlossene Satz, als Wert. Er ist exportiert, damit der Test ihn
 * durchlaufen kann — waechst er um einen Wert, ohne dass `TEXTE` ihn kennt, ist
 * das rot statt still `null`.
 */
export const GATE_GRUENDE: readonly GateGrund[] = [
  "code",
  "gesperrt",
  "abgelaufen",
  "zuviele",
] as const;

/**
 * Ein `searchParams`-Wert ist NUTZEREINGABE. Er wird gegen die Liste geprueft und
 * NIE in die Seite durchgereicht — und auch nicht in einen `Location`-Kopf: der
 * Route Handler `/abmelden` (§3.4.4) baut aus diesem Wert eine Weiterleitung und
 * reicht deshalb ausschliesslich Werte aus DIESEM Satz weiter.
 *
 * Nimmt zusaetzlich `undefined` entgegen (Festlegung G8): der zweite Aufrufer
 * ist ein `searchParams`-Feld, und das kann fehlen.
 */
export function istGateGrund(roh: string | null | undefined): roh is GateGrund {
  return typeof roh === "string" && (GATE_GRUENDE as readonly string[]).includes(roh);
}

/**
 * DIE VIER SAETZE. Sie stehen hier und nirgends sonst; §7.2.4 und §11.5
 * verweisen hierher, statt sie zu wiederholen.
 *
 * `code` und `gesperrt` sind bewusst VERSCHIEDEN formuliert: `code` heisst
 * „unbekannt ODER gesperrt" — mehr weiss der Einloeseweg nicht, denn `redeemToken`
 * liefert fuer beide Faelle `{ok:false}`. `gesperrt` heisst „wir wissen es genau:
 * dieses Kaertchen wurde gesperrt", weil dort eine gueltige Sitzung lief und die
 * Token-Zeile gelesen wurde. Zusammengelegt verlaere die zweite Lage ihre
 * Auskunft.
 */
const TEXTE: Record<GateGrund, (sperrSekunden: number | null) => string> = {
  code: () => "Dieser Code ist unbekannt oder wurde gesperrt. Wende dich an die Leitung.",
  gesperrt: () => "Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung.",
  abgelaufen: () => "Dein Zugang ist abgelaufen. Scanne das Kärtchen erneut.",
  /**
   * Die Sekundenzahl ist der Rueckgabewert von `gateGesperrt(absenderAus(...))`,
   * DEN DIE GATE-SEITE SELBST LIEST (§7.2.4) — ueber die URL wandert nur der
   * Grund. Kaeme die Zahl aus der URL, waere sie eine Nutzereingabe und der Satz
   * eine Behauptung des Anfragenden ueber seine eigene Sperre.
   *
   * `null` heisst: die Sperre ist inzwischen abgelaufen. Dann der Satz ohne Zahl.
   */
  zuviele: (sek) =>
    sek === null
      ? "Zu viele Fehlversuche. Bitte in einer Minute erneut versuchen."
      : `Zu viele Fehlversuche. Bitte in ${sek} ${sek === 1 ? "Sekunde" : "Sekunden"} erneut versuchen.`,
};

/**
 * Der anzuzeigende Satz — `null`, wenn `roh` nicht im Satz steht oder fehlt.
 * Das Gate rendert dann NORMAL.
 *
 * Ausdruecklich KEIN Rueckfalltext: ein „Etwas ist schiefgelaufen" auf einer
 * Seite, die gerade voellig normal aufgerufen wurde, ist schlechter als
 * Schweigen — und der Regelfall dieser Seite IST der normale Aufruf.
 *
 * `sperrSekunden` wirkt NUR auf `zuviele`; jeder andere Text ignoriert die Zahl.
 */
export function gateMeldung(
  roh: string | null | undefined,
  sperrSekunden: number | null,
): string | null {
  if (!istGateGrund(roh)) return null;
  return TEXTE[roh](sperrSekunden);
}
```

- [ ] **Schritt 4: Test grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/gateTexte.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/gateTexte.ts src/app/m/lagerbuch/_lib/gateTexte.test.ts
git commit -m "feat(lagerbuch): _lib/gateTexte.ts — das Gate liest seine Fehlermeldungen (Falle 60)

Heute schreibt t/[code]/route.ts ein ?err= an die Gate-URL, das niemand liest:
ein grep ueber src/ liefert genau EINEN Treffer, und das ist die schreibende
Zeile. Wer ein Etikett mit gesperrtem Code scannt, landet wortlos auf dem Gate.

Der Parameter heisst ab jetzt `grund`, ist ein geschlossener Satz aus vier
Werten, und das Gate liest ihn. Ein Alt-Link mit ?err= ist danach wirkungslos,
aber nicht kaputt.

istGateGrund prueft gegen die Liste; der Wert wird nie durchgereicht — der
Route Handler /abmelden baut daraus einen Location-Kopf.

GateGrund ist NICHT HelferGrund (§7.3): ein gemeinsames Wort, kein gemeinsamer
Weg."
```

---

### Task 19: `_lib/returnTo.ts` und `_lib/tokenZiel.ts` — zeichengleich aus dem Bestand

**Files:**
- Create: `src/app/m/lagerbuch/_lib/returnTo.ts`, `src/app/m/lagerbuch/_lib/tokenZiel.ts`
- Test: `src/app/m/lagerbuch/_lib/returnTo.test.ts`, `src/app/m/lagerbuch/_lib/tokenZiel.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces:
  ```ts
  // _lib/returnTo.ts
  export function sanitizeReturnTo(raw: string | null | undefined): string | null;
  // _lib/tokenZiel.ts
  export function tokenZielPfad(zielTyp: string | null | undefined,
                                zielId: string | null | undefined): string;
  ```
  `sanitizeReturnTo` wird **in Teil 2** von `adminLandingPfad` (T23) gerufen, ab Teil 4 zusätzlich von
  `t/[code]/route.ts`, `_actions/gate.ts` und der Gate-Seite. `tokenZielPfad` hat in Teil 2 **keinen**
  Aufrufer; sein erster ist `t/[code]/route.ts` (Teil 4, §7.2.3).

**Warum beide hier liegen (Festlegung G6).** §3.1 führt beide in der Umzugstabelle **dieses**
Kapitels: „**1:1**, nur der Ablageort wechselt". `returnTo.ts` ist zwingend hier, weil
`adminLandingPfad` es aufruft. `tokenZiel.ts` wandert mit, weil es acht Zeilen sind und der
Alternativzustand — Teil 4 erfindet es neu — genau die Doppelung ist, gegen die die
Eigentümertabelle gebaut ist.

⚠️ **„1:1" heißt hier wörtlich.** Beide Dateien werden **zeichengleich** übernommen, samt Kommentaren.
Insbesondere bleibt `sanitizeReturnTo`s Prüfreihenfolge unverändert — jede der fünf Ablehnungen deckt
einen anderen Angriff, und drei davon sind nicht offensichtlich.

- [ ] **Schritt 1: Den fehlschlagenden Test für `returnTo` schreiben**

`src/app/m/lagerbuch/_lib/returnTo.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { sanitizeReturnTo } from "./returnTo";

describe("sanitizeReturnTo — Open-Redirect-Schutz, 1:1 aus dem Bestand", () => {
  it("laesst lokale Pfade durch", () => {
    expect(sanitizeReturnTo("/verwaltung")).toBe("/verwaltung");
    expect(sanitizeReturnTo("/verwaltung/artikel?q=binde")).toBe("/verwaltung/artikel?q=binde");
    expect(sanitizeReturnTo("/a/abc123")).toBe("/a/abc123");
    expect(sanitizeReturnTo("/")).toBe("/");
  });

  it("weist alles ab, was nicht mit genau EINEM Schraegstrich beginnt", () => {
    expect(sanitizeReturnTo("verwaltung")).toBeNull();
    expect(sanitizeReturnTo("")).toBeNull();
    expect(sanitizeReturnTo(null)).toBeNull();
    expect(sanitizeReturnTo(undefined)).toBeNull();
  });

  it("weist protokoll-relative Ziele ab", () => {
    // `//boese.example` laedt der Browser als https://boese.example — der
    // klassische Open Redirect, der wie ein lokaler Pfad aussieht.
    expect(sanitizeReturnTo("//boese.example/verwaltung")).toBeNull();
  });

  it("weist `/\\` ab — Browser normalisieren es zu `//`", () => {
    // Die nicht offensichtliche Zeile. Ohne sie geht `/\boese.example` durch und
    // der Browser macht daraus `//boese.example`.
    expect(sanitizeReturnTo("/\\boese.example")).toBeNull();
  });

  it("weist jeden Doppelpunkt ab — eingeschmuggelte Schemata", () => {
    expect(sanitizeReturnTo("/x:foo")).toBeNull();
    expect(sanitizeReturnTo("https://boese.example")).toBeNull();
    expect(sanitizeReturnTo("javascript:alert(1)")).toBeNull();
  });

  it("weist einen Nicht-String ab, ohne zu werfen", () => {
    // `searchParams` liefert bei einem doppelt gesetzten Parameter ein Array.
    expect(sanitizeReturnTo(["/a", "/b"] as unknown as string)).toBeNull();
  });
});
```

- [ ] **Schritt 2: Den fehlschlagenden Test für `tokenZiel` schreiben**

`src/app/m/lagerbuch/_lib/tokenZiel.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { tokenZielPfad } from "./tokenZiel";
import { sanitizeReturnTo } from "./returnTo";

describe("tokenZielPfad — wohin ein eingeloester Code fuehrt", () => {
  it("fuehrt einen Artikel-Code aufs Artikel-Detail", () => {
    expect(tokenZielPfad("artikel", "art-1")).toBe("/a/art-1");
  });

  it("fuehrt einen Fahrzeug-Code in den Check, mit Vorauswahl", () => {
    expect(tokenZielPfad("fahrzeug", "rtw-1")).toBe("/helfer/check?fz=rtw-1");
  });

  it("faellt ohne Ziel auf die allgemeine Artikel-Liste", () => {
    expect(tokenZielPfad(null, null)).toBe("/helfer");
    expect(tokenZielPfad(undefined, undefined)).toBe("/helfer");
  });

  it("faellt bei UNVOLLSTAENDIGEM Ziel zurueck, statt einen kaputten Pfad zu bauen", () => {
    // Beide Halbformen kommen aus derselben Tabelle: `zielTyp` und `zielId` sind
    // je fuer sich nullbar, und `createToken` erzwingt die Vollstaendigkeit nur
    // im Formular. Ein `/a/undefined` waere ein 404 statt einer Landung.
    expect(tokenZielPfad("artikel", null)).toBe("/helfer");
    expect(tokenZielPfad(null, "art-1")).toBe("/helfer");
    expect(tokenZielPfad("fahrzeug", "")).toBe("/helfer");
  });

  it("weist einen unbekannten Zieltyp auf die Liste", () => {
    expect(tokenZielPfad("lagerort", "x")).toBe("/helfer");
  });

  it("liefert IMMER etwas, das sanitizeReturnTo durchlaesst", () => {
    // Die Zusage, die die beiden Dateien aneinander bindet: der Rueckgabewert
    // ist ein lokaler Pfad und damit kompatibel mit dem Open-Redirect-Schutz.
    // Ohne sie koennte der Handler ein Ziel bauen, das seine eigene Pruefung
    // spaeter verwirft — und die Helferin landete am Gate statt am Kaertchenziel.
    for (const [typ, id] of [["artikel", "a"], ["fahrzeug", "f"], [null, null]] as const) {
      expect(sanitizeReturnTo(tokenZielPfad(typ, id))).toBe(tokenZielPfad(typ, id));
    }
  });
});
```

- [ ] **Schritt 3: Beide Tests laufen lassen — sie müssen FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/returnTo.test.ts src/app/m/lagerbuch/_lib/tokenZiel.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./returnTo"` bzw. `"./tokenZiel"`.

- [ ] **Schritt 4: `_lib/returnTo.ts` schreiben — zeichengleich**

```ts
/**
 * Nur lokale Pfade zulassen (Open-Redirect-Schutz): muss mit einem einzelnen
 * "/" beginnen, kein "//" (protokoll-relativ), keine absolute/Schema-URL.
 *
 * ZEICHENGLEICH aus `lagerbuch/src/lib/auth/returnTo.ts` — nur der Ablageort
 * wechselt (§3.1). Jede der fuenf Ablehnungen deckt einen anderen Angriff, und
 * drei davon sind nicht offensichtlich; wer hier „aufraeumt", oeffnet einen
 * Open Redirect auf einer Seite, die anonym erreichbar ist.
 */
export function sanitizeReturnTo(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== "string") return null;
  if (!raw.startsWith("/")) return null;
  if (raw.startsWith("//")) return null;
  if (raw.startsWith("/\\")) return null; // Browser normalisieren "/\..." zu "//..." (protokoll-relativ)
  if (raw.includes(":")) return null; // z. B. "/x:foo" oder eingeschmuggelte Schemata
  return raw;
}
```

- [ ] **Schritt 5: `_lib/tokenZiel.ts` schreiben — zeichengleich**

```ts
/**
 * Landeziel eines eingelösten Zugangs-Codes. Ein Code führt entweder direkt zu einem Fahrzeug
 * (Fahrzeug-Check, vorausgewählt) oder zu einem Material im Handlager (Artikel-Detail). Ohne Ziel
 * landet der Helfer auf der allgemeinen Artikel-Liste.
 *
 * Rückgabe ist ein lokaler Pfad (startet mit "/") und ist damit kompatibel mit sanitizeReturnTo.
 *
 * ZEICHENGLEICH aus `lagerbuch/src/lib/auth/tokenZiel.ts` — nur der Ablageort
 * wechselt (§3.1). Der erste Aufrufer entsteht in Teil 4 (`t/[code]/route.ts`,
 * §7.2.3); bis dahin ist die Datei bewusst ohne Konsument.
 *
 * ⚠️ DIE PFADE TRAGEN DIE AEUSSERE FORM (`/helfer`, `/a/<id>`), nicht die innere
 * (`/m/lagerbuch/helfer`). Sie landen in einem `Location`-Kopf bzw. in einem
 * `redirect()`, also beim Browser — und der kennt nur den Modul-Host.
 */
export function tokenZielPfad(zielTyp: string | null | undefined, zielId: string | null | undefined): string {
  if (zielTyp === "artikel" && zielId) return `/a/${zielId}`;
  if (zielTyp === "fahrzeug" && zielId) return `/helfer/check?fz=${zielId}`;
  return "/helfer";
}
```

- [ ] **Schritt 6: Beide Tests grün, Gates, Commit**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/returnTo.test.ts src/app/m/lagerbuch/_lib/tokenZiel.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/returnTo.ts src/app/m/lagerbuch/_lib/returnTo.test.ts \
        src/app/m/lagerbuch/_lib/tokenZiel.ts src/app/m/lagerbuch/_lib/tokenZiel.test.ts
git commit -m "feat(lagerbuch): _lib/returnTo.ts und _lib/tokenZiel.ts — 1:1 aus dem Bestand

Zwei der drei Bausteine, die §3.1 als unveraenderten Umzug fuehrt. Zeichengleich
uebernommen, samt Kommentaren: jede der fuenf Ablehnungen in sanitizeReturnTo
deckt einen anderen Angriff, und drei davon sind nicht offensichtlich (/\\ wird
vom Browser zu //, jeder Doppelpunkt kann ein Schema sein).

tokenZielPfad hat in Teil 2 noch keinen Aufrufer — der erste ist t/[code]/route.ts
in Teil 4. Es wandert trotzdem hier mit (Festlegung G6): acht Zeilen, und der
Alternativzustand waere, dass Teil 4 es neu erfindet.

Der Test bindet beide aneinander: tokenZielPfad liefert immer etwas, das
sanitizeReturnTo durchlaesst."
```

---

### Task 20: `_actions/guards.test.ts` — die Eigenschaftsform des Guard-Scans

**Files:**
- Create: `src/app/m/lagerbuch/_actions/guards.test.ts`

**Interfaces:**
- Consumes: nichts — die Datei liest den **Quelltext**, nicht die Module.
- Produces: die Zusage „**keine** exportierte Action landet ungeschützt", ab dem ersten Commit.
  ⚠️ **Teil 6 ERWEITERT diese Datei** um die **Zählung** (47 Actions = 44 bewachte + 3 Ausnahmen,
  18 Action-Dateien, 19 Verzeichniseinträge). **Teil 4 und Teil 5 fassen sie NICHT an** — sie füllen
  nur den Ordner.

**Warum die Datei am ersten Tag entsteht, an dem es noch keine Action gibt** (Teil 1, Festlegung F4;
§3.8.2). Der Cordon fing bisher auch die Server-Action-POSTs unter `/verwaltung` ab (Matcher
`lagerbuch/src/middleware.ts:35`). Das fällt ersatzlos weg — **aber er war nie der eigentliche
Riegel:** Action-IDs sind **global**, eine Verwaltungs-Action lässt sich jederzeit gegen `/` posten,
wo der Matcher nie griff. Die tragende Zusage war und ist die **Vollständigkeit der Guard-Liste**.

*Kein Gate:* eine fehlende Guard-Zeile in einer neu hinzugefügten Action ist **typkorrekt,
lint-sauber und sieht wie ein Erfolg aus**; **es gibt keinen Test, der eine Action ohne Sitzung
aufruft.** Ohne diesen Scan bleibt „44 von 44" eine Absichtserklärung. Genau deshalb steht er hier
und nicht in Teil 6: ab dem ersten Commit kann **keine** Action ungeschützt landen.

⚠️ **Eigenschaft, nicht Zählung.** Ein Scan, der `toHaveLength(44)` von Anfang an behauptet, ist am
ersten Tag rot und wird dann abgeschaltet statt repariert. Diese Datei toleriert ein **fehlendes oder
leeres** `_actions/` und ist damit am ersten Tag grün — ihre Zähne bekommt sie in Teil 4, ohne dass
jemand sie anfassen muss.

**Vier Auflagen, ohne die der Scan falsche Zahlen liefert** (§3.8.2, §2.1 a) — sie stehen **jetzt**
in der Datei, damit Teil 6 nur noch die Zahlen ergänzt:

1. **`export type` und `export interface` werden verworfen.** `_actions/detail.ts` exportiert **drei
   Typen** neben einer Action; ein Scan, der sie mitzählt, wird auf einer **korrekten** Datei rot.
2. **Gezählt wird je Datei je Deklaration, nie über ein `Set` der Namen.** `geraetSpeichern`,
   `setGeraetAktiv` und `geraetZuBarcode` stehen in `bz.ts` **und** in `geraete.ts` — ein `Set`
   ergäbe **41** statt 44.
3. **Die Ausnahmeliste hat GENAU DREI Einträge.** Wächst sie, ist das ein roter Test und keine Zeile
   im Diff.
4. **`guards.test.ts` überspringt sich selbst.**

- [ ] **Schritt 1: Den Scan schreiben**

`src/app/m/lagerbuch/_actions/guards.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * „JEDE EXPORTIERTE ACTION IST BEWACHT" — in der EIGENSCHAFTSFORM.
 *
 * WARUM ES DIESE DATEI GIBT (§3.8.2, Teil 1 Festlegung F4). Der Edge-Cordon
 * deckte bisher auch die Server-Action-POSTs unter /verwaltung ab (Matcher
 * `lagerbuch/src/middleware.ts:35`); mit `middleware.ts` faellt er weg. ER WAR
 * ABER NIE DER EIGENTLICHE RIEGEL: Action-IDs sind GLOBAL, eine
 * Verwaltungs-Action laesst sich jederzeit gegen `/` posten, wo der Matcher nie
 * griff. Die tragende Zusage war und ist die VOLLSTAENDIGKEIT DIESER LISTE.
 *
 * KEIN GATE FINDET DAS: eine fehlende Guard-Zeile ist typkorrekt, lint-sauber
 * und sieht wie ein Erfolg aus, und es gibt keinen Test, der eine Action ohne
 * Sitzung aufruft.
 *
 * ⚠️ EIGENSCHAFT, NICHT ZAEHLUNG. Diese Datei toleriert ein fehlendes oder leeres
 * `_actions/` und ist damit am ersten Tag gruen. Ein Scan, der `toHaveLength(44)`
 * von Anfang an behauptet, waere am ersten Tag rot und wuerde abgeschaltet statt
 * repariert.
 *
 *   Teil 2 (hier): die Eigenschaft.
 *   Teil 4 und Teil 5: fuellen den Ordner und fassen DIESE DATEI NICHT AN.
 *   Teil 6: ergaenzt die ZAEHLUNG — 47 Actions = 44 bewachte + 3 Ausnahmen,
 *           18 Action-Dateien, 19 Verzeichniseintraege (guards.test.ts selbst).
 */

const ORDNER = join(process.cwd(), "src/app/m/lagerbuch/_actions");

/** Die einzigen zwei Riegel, die eine Action tragen darf. */
const RIEGEL = /require(?:LagerbuchAdmin|HelferSchreibend)\s*\(/;

/**
 * DIE AUSNAHMELISTE — GENAU DREI EINTRAEGE, jeder einzeln begruendet (§3.8.2).
 *
 * `einloesenAmGate`  (_actions/gate.ts)    — sie ERZEUGT die Sitzung; ein Riegel
 *                    davor waere zirkulaer. Sie traegt stattdessen
 *                    `requireLagerbuchHost` und die Gate-Schranke.
 * `erneuereSitzung`  (_actions/sitzung.ts) — dieselbe Flaeche wie das Gate, nur
 *                    inline im Check (§7.4.4); dieselben drei Riegel.
 * `beenden`          (_actions/sitzung.ts) — loescht ausschliesslich das eigene
 *                    Cookie; ein Riegel davor machte das Abmelden einer
 *                    ABGELAUFENEN Sitzung unmoeglich.
 *
 * Waechst diese Liste, ist das ein ROTER TEST und keine Zeile im Diff.
 */
const AUSNAHMEN = new Set(["einloesenAmGate", "erneuereSitzung", "beenden"]);

/** Diese Datei ueberspringt sich selbst — sonst zaehlte sie sich mit. */
const SELBST = "guards.test.ts";

function actionDateien(): string[] {
  if (!existsSync(ORDNER)) return [];
  return readdirSync(ORDNER)
    .filter((n) => n.endsWith(".ts") && n !== SELBST && !n.endsWith(".test.ts"))
    .sort();
}

/**
 * Der Rumpf einer Deklaration, beginnend NACH der Signaturzeile.
 *
 * Die Datei setzt FORMATIERTEN Quelltext voraus — biome laeuft in der CI, und
 * formatierter Code beendet die Signatur mit `{` am Zeilenende. Das ist die
 * einzige Annahme dieses Scans, und sie ist billiger als ein TypeScript-Parser
 * im Test: der muesste `tsc` mitziehen und liefe bei jedem Vitest-Lauf.
 *
 * ⚠️ DIE KLAMMERTIEFE WIRD MITGEZAEHLT, und ohne sie waere dieser Scan auf
 * KORREKTEM Code rot. Eine Action mit destrukturiertem erstem Parameter
 * formatiert biome so:
 *
 *     export async function artikelSpeichern({
 *       id,
 *       name,
 *     }: Eingabe) {
 *
 * Die ERSTE Zeile endet bereits auf `{` — ein naives „erste Zeile, die auf `{`
 * endet" naehme `id,` als erste Anweisung, faende keinen Riegel und meldete eine
 * richtig geschriebene Action. GENAU DAS ist die Sorte Fehlalarm, wegen der
 * Scans abgeschaltet werden, und sie schlaege in Teil 4/5 zu, wo niemand mehr
 * weiss, warum. Deshalb zaehlt `tiefe` die runden Klammern ab der Deklaration
 * mit: als Rumpfbeginn gilt nur ein `{` am Zeilenende, das bei Tiefe 0 steht —
 * die Parameterliste ist dann geschlossen.
 *
 * Wir schneiden bei der naechsten Deklaration auf Spaltenebene ab (`\nexport `
 * oder `\nfunction `/`\nconst `/`\nclass ` am Zeilenanfang) — genau genug, um die
 * ERSTE Anweisung zu sehen, und robust gegen alles, was in einem Rumpf steht.
 */
function rumpfNach(quelle: string, abIndex: number): string {
  const rest = quelle.slice(abIndex);
  const ende = rest.slice(1).search(/\n(?:export|function|const|class)\s/);
  const abschnitt = ende === -1 ? rest : rest.slice(0, ende + 1);
  const zeilen = abschnitt.split("\n");

  let tiefe = 0;
  for (let i = 0; i < zeilen.length; i++) {
    const zeile = zeilen[i]!;
    for (const z of zeile) {
      if (z === "(") tiefe++;
      else if (z === ")") tiefe--;
    }
    // Rumpfbeginn: die Zeile endet auf `{` UND die Parameterliste ist zu.
    if (tiefe <= 0 && zeile.trimEnd().endsWith("{")) return zeilen.slice(i + 1).join("\n");
  }
  return "";
}

/** Erste bedeutungstragende Zeile: Leerzeilen und Kommentare werden uebersprungen. */
function ersteAnweisung(rumpf: string): string {
  const zeilen = rumpf.split("\n");
  let imBlockkommentar = false;
  for (const roh of zeilen) {
    const z = roh.trim();
    if (imBlockkommentar) {
      if (z.includes("*/")) imBlockkommentar = false;
      continue;
    }
    if (z === "") continue;
    if (z.startsWith("//")) continue;
    if (z.startsWith("/*")) {
      if (!z.includes("*/")) imBlockkommentar = true;
      continue;
    }
    return z;
  }
  return "";
}

type Fund = { datei: string; name: string; erste: string };

function exportierteActions(): Fund[] {
  const funde: Fund[] = [];
  for (const datei of actionDateien()) {
    const quelle = readFileSync(join(ORDNER, datei), "utf8");
    /**
     * `export type` und `export interface` treffen dieses Muster NICHT — sie
     * werden damit KONSTRUKTIV verworfen, nicht durch eine Filterzeile, die
     * jemand entfernen kann. `_actions/detail.ts` exportiert drei Typen neben
     * einer Action (§2.1 a).
     */
    const deklaration = /^export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*[(<]/gm;
    let m: RegExpExecArray | null;
    while ((m = deklaration.exec(quelle)) !== null) {
      // JE DATEI JE DEKLARATION, nie ueber ein Set der Namen: geraetSpeichern,
      // setGeraetAktiv und geraetZuBarcode stehen in bz.ts UND in geraete.ts —
      // ein Set ergaebe 41 statt 44 (§3.8.2).
      funde.push({ datei, name: m[1], erste: ersteAnweisung(rumpfNach(quelle, m.index)) });
    }
  }
  return funde;
}

describe("_actions/ — jede exportierte Action ist bewacht", () => {
  it("beginnt mit requireLagerbuchAdmin oder requireHelferSchreibend — oder steht auf der Liste", () => {
    const ungeschuetzt = exportierteActions()
      .filter((f) => !AUSNAHMEN.has(f.name))
      .filter((f) => !RIEGEL.test(f.erste))
      .map((f) => `${f.datei}: ${f.name}() beginnt mit "${f.erste || "<leerer Rumpf>"}"`);

    expect(ungeschuetzt, [
      "Diese Actions tragen keinen Riegel als ERSTE Anweisung.",
      "Verwaltung → requireLagerbuchAdmin(); schreibender Helfer-Weg → requireHelferSchreibend(db).",
      "Eine Action hat KEINE Weiche — sie hat einen Aufrufer, der schon entschieden hat (§3.2.1).",
    ].join("\n")).toEqual([]);
  });

  it("die Ausnahmeliste hat GENAU DREI Eintraege", () => {
    // Waechst sie, ist das ein roter Test und keine Zeile im Diff. Jeder der drei
    // ist im Kopfkommentar dieser Datei einzeln begruendet.
    expect([...AUSNAHMEN].sort()).toEqual(["beenden", "einloesenAmGate", "erneuereSitzung"]);
  });

  it("kennt keine Action in Pfeilform — sonst haette der Scan eine BLINDE STELLE", () => {
    /**
     * `export const foo = async () => {}` traegt der Scan nicht. Statt die Luecke
     * offenzulassen, wird sie hier ROT: Actions werden in diesem Modul als
     * `export async function` geschrieben, wie im gesamten Bestand
     * (`lagerbuch/src/actions/*`).
     *
     * Ohne diese Zeile koennte eine ungeschuetzte Action in Pfeilform landen und
     * der Scan bliebe gruen — der teuerste Zustand, den ein Scan haben kann.
     */
    const pfeilform: string[] = [];
    for (const datei of actionDateien()) {
      const quelle = readFileSync(join(ORDNER, datei), "utf8");
      for (const m of quelle.matchAll(/^export\s+(?:const|let|var)\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?[(<]/gm)) {
        pfeilform.push(`${datei}: ${m[1]}`);
      }
    }
    expect(pfeilform, "Actions bitte als `export async function` schreiben — der Guard-Scan sieht Pfeilfunktionen nicht")
      .toEqual([]);
  });

  it("ist am ersten Tag gruen, auch ohne _actions/ — und sagt, wer ihn verschaerft", () => {
    // Teil 4 und Teil 5 fuellen den Ordner; TEIL 6 ergaenzt die Zaehlung
    // (47 = 44 + 3, 18 Dateien, 19 Verzeichniseintraege). Diese Zusicherung ist
    // die Begruendung dafuer, dass hier NOCH keine Zahl steht.
    expect(Array.isArray(actionDateien())).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss GRÜN sein**

```bash
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

Erwartet: **grün**, weil `_actions/` noch nicht existiert. Das ist **kein** Mangel, sondern die
Eigenschaftsform — der Rot-Nachweis kommt im nächsten Schritt.

- [ ] **Schritt 3: Rot sehen — mit einer absichtlichen Verletzung**

```bash
mkdir -p src/app/m/lagerbuch/_actions
cat > src/app/m/lagerbuch/_actions/__wegwerf.ts <<'EOF'
"use server";
export async function ungeschuetzteAction(x: string): Promise<string> {
  return x;
}
export type NurEinTyp = { a: string };
export interface AuchNurEinTyp { b: string }
export async function bewachteAction(x: string): Promise<string> {
  await requireLagerbuchAdmin();
  return x;
}
export async function bewachteMitDestrukturierung({
  id,
  name,
}: NurEinTyp & { id: string }): Promise<string> {
  await requireLagerbuchAdmin();
  return id + name;
}
EOF
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

Erwartet: **FAIL** mit genau **einem** Eintrag —
`__wegwerf.ts: ungeschuetzteAction() beginnt mit "return x;"`.

⚠️ **Drei Einträge, die NICHT in der Liste stehen dürfen — jeder prüft eine eigene Auflage:**

| darf nicht auftauchen | prüft |
|---|---|
| `NurEinTyp`, `AuchNurEinTyp` | Auflage 1: `export type`/`export interface` werden **konstruktiv** verworfen (das Deklarations-Muster trifft sie gar nicht). `_actions/detail.ts` exportiert drei Typen neben einer Action |
| `bewachteAction` | der Riegel als erste Anweisung wird erkannt |
| `bewachteMitDestrukturierung` | **die Klammertiefe in `rumpfNach`.** Ihre Signatur endet schon in Zeile 1 auf `{`, weil der erste Parameter destrukturiert ist — ohne die Tiefenzählung nähme der Scan `id,` als erste Anweisung und meldete eine **richtig geschriebene** Action |

Steht einer der vier dort, ist der Scan falsch und die Task blockiert. **Ein Fehlalarm auf korrektem
Code ist teurer als eine Lücke**, weil er den Scan abschaltet statt ihn zu schärfen — und er schlüge
erst in Teil 4/5 zu, wo niemand mehr weiß, warum.

- [ ] **Schritt 4: Die Pfeilform-Zusicherung rot sehen**

```bash
cat > src/app/m/lagerbuch/_actions/__wegwerf.ts <<'EOF'
"use server";
export const pfeilAction = async (x: string) => x;
EOF
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
```

Erwartet: **FAIL** mit `__wegwerf.ts: pfeilAction`. Das ist der Nachweis, dass die blinde Stelle
**laut** ist statt still.

- [ ] **Schritt 5: Wegwerfdatei löschen, grün, Commit**

```bash
rm src/app/m/lagerbuch/_actions/__wegwerf.ts
pnpm vitest run src/app/m/lagerbuch/_actions/guards.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_actions/guards.test.ts
git commit -m "test(lagerbuch): _actions/guards.test.ts — die Eigenschaftsform des Guard-Scans

Jede exportierte Action beginnt mit requireLagerbuchAdmin() oder
requireHelferSchreibend() — oder steht auf einer Ausnahmeliste mit GENAU DREI
Eintraegen.

Warum jetzt und nicht in Teil 6: eine fehlende Guard-Zeile ist typkorrekt,
lint-sauber und sieht wie ein Erfolg aus, und es gibt keinen Test, der eine
Action ohne Sitzung aufruft. Ab diesem Commit kann keine Action ungeschuetzt
landen. Der Action-POST-Vorriegel der alten Middleware war nie der Riegel —
Action-IDs sind global.

EIGENSCHAFT, NICHT ZAEHLUNG: die Datei toleriert ein fehlendes _actions/ und ist
am ersten Tag gruen. Teil 6 ergaenzt 47 = 44 + 3, 18 Dateien, 19 Eintraege.
Teil 4 und Teil 5 fassen sie nicht an.

Die vier Zaehlauflagen stehen schon drin: export type wird konstruktiv verworfen,
gezaehlt wird je Datei je Deklaration (nie ueber ein Set — das ergaebe 41),
die Liste ist auf drei festgenagelt, und die Datei ueberspringt sich selbst.
Eine Action in Pfeilform macht den Scan ROT statt blind.

Rot gesehen mit einer Wegwerfdatei: ungeschuetzte Action gemeldet, exportierter
Typ nicht, bewachte Action nicht, Pfeilform gemeldet."
```

---

### Task 21: `_lib/bauform.test.ts` — die vier modulweiten Quelltext-Zusicherungen

**Files:**
- Create: `src/app/m/lagerbuch/_lib/bauform.test.ts`

**Interfaces:**
- Consumes: nichts — die Datei liest den **Quelltext** des ganzen Modulbaums.
- Produces: vier Zusicherungen aus §3.8.2, plus die `"use client"`-Zusicherung für `_lib`/`_db`.
  ⚠️ **Teil 4 ERWEITERT diese Datei** um den `usePathname`-Scan (§7.8.2) und **verschärft** die
  Weichen-Zeile von „falls die Datei existiert" auf „die drei Dateien existieren **und** tragen die
  Regel". **Es entsteht keine zweite Scan-Datei** (Festlegung G2).

**Warum eine Datei und nicht vier** (Festlegung G2). §3.8.2 listet acht Scans und nennt für keinen
eine Datei. Fünf haben einen natürlichen Ort; vier sind modulweite Aussagen ohne Subjekt-Datei. Vier
Dateien mit je zwölf Zeilen wären vier Orte, an denen jemand den nächsten Scan vergisst.

**Was diese Scans leisten — und was nicht.** Sie belegen **nicht**, dass etwas *wirkt*, sondern dass
eine **Bauform eingehalten** ist. Genau dafür sind sie hier die richtige Ebene, und die Suite benutzt
sie an vergleichbaren Stellen schon (`src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab).

- [ ] **Schritt 1: Den Scan schreiben**

`src/app/m/lagerbuch/_lib/bauform.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DIE MODULWEITEN QUELLTEXT-ZUSICHERUNGEN (§3.8.2).
 *
 * Sie belegen NICHT, dass etwas wirkt, sondern dass eine BAUFORM eingehalten
 * ist. Genau dafuer sind sie die richtige Ebene — jede Zeile hier faengt einen
 * Fehler, der typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar waere.
 * Vorbild: `src/core/shell/icons.test.ts` riegelt Falle 7 repo-weit ab.
 *
 * ALLE SCANS SIND IN DER EIGENSCHAFTSFORM (Festlegung G3): sie tolerieren
 * Dateien, die es noch nicht gibt. Das ist noetig, weil `_ui/`, `_actions/` und
 * die drei Weichen-Dateien erst ab Teil 4 entstehen — und ein Scan, der die
 * EXISTENZ behauptet, waere am ersten Tag rot und wuerde abgeschaltet statt
 * repariert.
 *
 * WER SIE VERSCHAERFT:
 *   Teil 4 ergaenzt HIER den `usePathname`-Scan (§7.8.2) und macht aus der
 *   Weichen-Zusicherung eine mit Existenzpflicht. Es entsteht KEINE zweite
 *   Scan-Datei.
 */

const MODUL = join(process.cwd(), "src/app/m/lagerbuch");
const SELBST = join(MODUL, "_lib/bauform.test.ts");

/** Jede .ts/.tsx-Datei unter dem Modulbaum, rekursiv — diese Datei ausgenommen. */
function quellDateien(wurzel: string = MODUL): string[] {
  if (!existsSync(wurzel)) return [];
  const treffer: string[] = [];
  for (const eintrag of readdirSync(wurzel)) {
    const pfad = join(wurzel, eintrag);
    if (statSync(pfad).isDirectory()) {
      // `migrations/` ist erzeugter SQL-/JSON-Bestand und enthaelt keinen TS-Code.
      if (eintrag === "migrations") continue;
      treffer.push(...quellDateien(pfad));
      continue;
    }
    if (!/\.tsx?$/.test(eintrag)) continue;
    if (pfad === SELBST) continue;
    /**
     * ⚠️ TESTDATEIEN SIND AUSGENOMMEN, und das ist keine Bequemlichkeit.
     *
     * `absender.test.ts` MUSS `kopf({ "x-forwarded-for": … })` schreiben — das
     * ist der Fall, der belegt, dass der Header in keiner Richtung gelesen wird.
     * `zugang.test.ts` MUSS „auf `isModuleAdmin` umstellen" als Mutation
     * benennen. Ein Scan, der Testdateien mitliest, macht damit genau die Tests
     * rot, die die Zusicherung tragen — und wird dann abgeschaltet statt
     * repariert.
     *
     * Der Verlust ist klein und benannt: eine Verletzung, die AUSSCHLIESSLICH in
     * einer Testdatei steht, bleibt unentdeckt. Testdateien werden nicht
     * ausgeliefert; die Bauform-Aussage gilt dem Produktionsbaum.
     */
    if (/\.test\.tsx?$/.test(eintrag)) continue;
    treffer.push(pfad);
  }
  return treffer;
}

/**
 * Kommentare werden VOR dem Vergleich geleert — inhaltlich, nicht zeilenweise:
 * die Zeilenzahl bleibt gleich, damit die `datei:zeile`-Meldung weiter stimmt.
 *
 * ⚠️ OHNE DAS IST JEDER DIESER SCANS AUF SEINER EIGENEN BEGRUENDUNG ROT.
 * `_lib/zugang.ts` schreibt in seinem Kopfkommentar „`session.user.isAdmin`
 * kommt in diesem Modul NIRGENDS vor" und „BEWUSST NICHT `isModuleAdmin`";
 * `_lib/absender.ts` schreibt „WARUM `x-forwarded-for` HIER GAR NICHT
 * VORKOMMT". Das sind genau die Saetze, die den Scan erklaeren — und sie
 * duerfen ihn nicht ausloesen.
 *
 * BEWUSST NUR ZWEI FORMEN: Blockkommentare und Zeilen, deren getrimmter Inhalt
 * mit `//` BEGINNT. Ein nachgestelltes `// …` am Ende einer Codezeile bleibt
 * stehen. Grund: ein naiver `//`-Stripper wuerde bei
 * `const u = "https://example.org"` den Rest der Zeile leeren und koennte damit
 * eine Verletzung VERSTECKEN. Ein Scan darf falsch-positiv sein und laut, nie
 * falsch-negativ und still.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

function trefferAuf(muster: RegExp, dateien = quellDateien()): string[] {
  const funde: string[] = [];
  for (const pfad of dateien) {
    const zeilen = ohneKommentare(readFileSync(pfad, "utf8")).split("\n");
    zeilen.forEach((zeile, i) => {
      if (muster.test(zeile)) funde.push(`${relative(process.cwd(), pfad)}:${i + 1}: ${zeile.trim()}`);
    });
  }
  return funde;
}

describe("kein session.user.isAdmin im Modul", () => {
  it("findet keinen Treffer auf isAdmin", () => {
    /**
     * Ein 1:1-Port von `lagerbuch/src/lib/auth/cordon.ts:14-20` ist TYPKORREKT
     * (beide Felder sind `boolean`), laeuft durch `pnpm build` — und BEIDE
     * Dev-Logins der Suite setzen `isAdmin = true`. Die E2E blieben also gruen,
     * waehrend die gesamte Lagerbuch-Verwaltung fuer jeden Suite-Betreiber offen
     * stuende (Falle 13).
     *
     * `isAdmin` heisst in der Suite „ist BETREIBER" (`core/auth/config.ts:170`),
     * nicht „darf lagerbuch verwalten". Betrieb und Einsicht sind zwei Rollen:
     * hinter /verwaltung liegen das Journal mit KLARNAMEN und der Etikettenbogen
     * mit den Token-Codes IM KLARTEXT — dem Secret selbst.
     */
    expect(trefferAuf(/\bisAdmin\b/), "session.user.isAdmin ist fuer dieses Modul verboten (Betreiber-Entscheidung 3)")
      .toEqual([]);
  });
});

describe("keine Suite-Admin-Abkuerzung im Modul", () => {
  it("findet keinen der vier core-Riegel", () => {
    /**
     * `isModuleAdmin`, `requireModuleAdmin`, `moduleAdminPageOrNotFound` und
     * `canAdminModule` sind fertig, gut und die FALSCHEN fuer dieses Modul
     * (§3.6.3): alle vier tragen die Suite-Admin-Abkuerzung
     * (`core/groups.ts:103-105` steigt fuer den Suite-Admin unbedingt mit `true`
     * aus). Ein Import sieht wie Wiederverwendung aus.
     *
     * `canAdminModule` ist dabei der teuerste: es ist die hausuebliche
     * SICHTBARKEITSfrage und zeigte dem Suite-Admin einen Verwaltungs-Eintrag,
     * dessen Ziel `requireLagerbuchAdmin` mit 404 beantwortet — genau der
     * Zustand, den `docs/design/README.md` ausschliesst („fuehrt KEIN Weg
     * dorthin, wo die aufrufende Person nicht hindarf?").
     */
    expect(trefferAuf(/\b(?:isModuleAdmin|requireModuleAdmin|moduleAdminPageOrNotFound|canAdminModule)\b/),
      "Navigation UND Riegel lesen istLagerbuchAdmin auf demselben Viewer (§3.6.3)")
      .toEqual([]);
  });
});

describe("kein x-forwarded-for im Modul", () => {
  it("findet keinen Treffer, in keiner Schreibweise", () => {
    /**
     * §3.5.2. Die Zeile wieder einzubauen sieht wie eine VERBESSERUNG aus („wir
     * lesen doch auch die Proxy-Kette") und ist der ganze Fehler: der
     * Suite-Container ist direkt erreichbar, und dann setzt der Anfragende den
     * Header vollstaendig selbst — erster wie letzter Eintrag ergeben einen
     * frischen Eimer je Versuch.
     */
    expect(trefferAuf(/x-forwarded-for/i), "Der Absenderschluessel liest ausschliesslich cf-connecting-ip (§3.5.2)")
      .toEqual([]);
  });
});

describe("die drei Weichen-Dateien tragen ein PRAEDIKAT, keinen Riegel", () => {
  /**
   * §3.2.1, Regel „Riegel in Layouts und Actions, Praedikat in Weichen".
   *
   * Diese drei Dateien haben je DREI gueltige Faelle, und der dritte ist immer
   * „keine Sitzung" — bei /a und /g das Gate mit returnTo, auf dem Gate die
   * Anzeige des Gates selbst. EIN RIEGEL HIER SCHICKT JEDEN ANONYMEN SCAN EINES
   * REGALETIKETTS NACH /login (§11.5, Zustand 18) — genau der Ausfall, gegen den
   * `requiresAuth: false` gebaut ist.
   *
   * Der Fehler ist typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar; ein
   * E2E faende ihn nur mit einem Abruf OHNE Cookie, und genau der fehlt heute.
   *
   * ⚠️ EIGENSCHAFTSFORM: die drei Dateien entstehen erst in TEIL 4. Bis dahin ist
   * dieser Block gruen, ohne etwas zu behaupten. TEIL 4 ERSETZT die
   * `existsSync`-Bedingung durch eine Existenzpflicht — dann behauptet der Scan
   * zusaetzlich, dass es die drei Dateien ueberhaupt gibt.
   */
  const WEICHEN = [
    "page.tsx",                  // das Gate (§7.2.4)
    "a/[artikelId]/page.tsx",    // Regaletikett-Weiche (§7.4.3)
    "g/[code]/page.tsx",         // Barcode-Weiche (§7.4.3)
  ];

  it("enthaelt weder requireLagerbuchAdmin noch requireHelferSitzung", () => {
    const vorhanden = WEICHEN.map((p) => join(MODUL, p)).filter((p) => existsSync(p));
    expect(trefferAuf(/\b(?:requireLagerbuchAdmin|requireHelferSitzung)\b/, vorhanden),
      "Weichen tragen viewerOderNull + istLagerbuchAdmin bzw. helferZugangOderNull (§3.2.1)")
      .toEqual([]);
  });

  it("traegt in jeder vorhandenen Weiche requireLagerbuchHost", () => {
    // Der Host-Riegel ist die EINE Ausnahme: er steht in allen dreien, und zwar
    // als ERSTE Anweisung (§2.6). Er hat nichts mit der Rollenfrage zu tun — er
    // verhindert eine zweite funktionierende Herkunft des Moduls.
    for (const p of WEICHEN.map((x) => join(MODUL, x)).filter((x) => existsSync(x))) {
      // Auch hier ohne Kommentare: ein `// hier stand mal requireLagerbuchHost`
      // erfuellte die Zusage sonst, ohne dass der Riegel liefe.
      expect(ohneKommentare(readFileSync(p, "utf8")),
             `${relative(process.cwd(), p)} ohne Host-Riegel`)
        .toMatch(/requireLagerbuchHost\s*\(/);
    }
  });
});

describe('kein "use client" unter _lib/ und _db/', () => {
  it("findet keine Direktive", () => {
    /**
     * Falle 6, `CLAUDE.md:24-27`. Ein WERT aus einem "use client"-Modul kommt in
     * einer Server Component NICHT an — sie bekommt eine Client-Referenz statt
     * des Wertes, HTTP 500 fuer die ganze Seite. TypeScript ist zufrieden,
     * `pnpm build` findet nichts, und VITEST KANN ES STRUKTURELL NICHT FINDEN:
     * dort ist "use client" ein wirkungsloser String.
     *
     * Nur dieser Scan sieht es. Er ergaenzt den aus T4 (Teil 1) um die Dateien,
     * die seither dazugekommen sind.
     */
    const unterLibUndDb = quellDateien().filter((p) => /\/_(?:lib|db)\//.test(p));
    expect(trefferAuf(/^\s*["']use client["']/, unterLibUndDb),
      'Werte fuer Server Components gehoeren in ein Modul OHNE "use client" (Falle 6)')
      .toEqual([]);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss GRÜN sein**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **grün** — auch dann, wenn T16 in derselben Welle schon gelandet ist.

⚠️ **Das ist die Stelle, an der ein naiver Scan sofort umfällt, und deshalb steht sie hier
ausgeschrieben.** `_lib/absender.ts` **enthält** die Zeichenfolge `x-forwarded-for` — in seinem
Kopfkommentar, der genau erklärt, warum der Header nicht gelesen wird. `_lib/absender.test.ts`
enthält sie sogar als **echten Code** (`kopf({ "x-forwarded-for": … })`), weil das der Fall ist, der
die Zusicherung trägt. Später kommen `_lib/zugang.ts` (`isAdmin`, `isModuleAdmin` in Begründungen)
und `_lib/zugang.test.ts` („auf `isModuleAdmin` umstellen" als benannte Mutation) dazu.

Ein Scan, der das mitliest, macht **genau die Dateien rot, die die Zusicherung tragen** — und wird
dann abgeschaltet statt repariert. Deshalb zwei Vorkehrungen, und **beide sind nötig**:
`quellDateien()` überspringt `*.test.ts`/`*.test.tsx`, und `ohneKommentare()` leert Blockkommentare
und reine `//`-Zeilen, bevor verglichen wird.

Läuft dieser Schritt trotzdem rot, prüfe **zuerst**, ob der Treffer in einem Kommentar steht — dann
ist der Stripper falsch, nicht die Datei.

Der Rot-Nachweis kommt im nächsten Schritt.

- [ ] **Schritt 3: Rot sehen — vier absichtliche Verletzungen nacheinander**

```bash
cat > src/app/m/lagerbuch/_lib/__wegwerf.ts <<'EOF'
export const a = (s: { user?: { isAdmin?: boolean } }) => s.user?.isAdmin;
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```
Erwartet: **FAIL** in „kein session.user.isAdmin im Modul".

```bash
cat > src/app/m/lagerbuch/_lib/__wegwerf.ts <<'EOF'
import { isModuleAdmin } from "@/core/groups";
export const a = isModuleAdmin;
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```
Erwartet: **FAIL** in „keine Suite-Admin-Abkuerzung im Modul" — mit **zwei** Treffern (Import und
Verwendung).

```bash
cat > src/app/m/lagerbuch/_lib/__wegwerf.ts <<'EOF'
export const a = (h: Headers) => h.get("x-forwarded-for");
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```
Erwartet: **FAIL** in „kein x-forwarded-for im Modul".

```bash
cat > src/app/m/lagerbuch/_lib/__wegwerf.ts <<'EOF'
"use client";
export const A = 1;
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```
Erwartet: **FAIL** in `kein "use client" unter _lib/ und _db/`.

- [ ] **Schritt 4: Die Weichen-Zusicherung rot sehen**

```bash
mkdir -p "src/app/m/lagerbuch/g/[code]"
cat > "src/app/m/lagerbuch/g/[code]/page.tsx" <<'EOF'
import { requireLagerbuchAdmin } from "../../_lib/zugang";
export default async function P() {
  await requireLagerbuchAdmin();
  return null;
}
EOF
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **FAIL** in **beiden** Weichen-Fällen — `requireLagerbuchAdmin` gefunden **und**
`requireLagerbuchHost` fehlt. Das ist der Nachweis, dass die Eigenschaftsform trotz `existsSync`
wirklich beißt, sobald die Datei da ist.

- [ ] **Schritt 5: Aufräumen, grün, Commit**

```bash
rm -f src/app/m/lagerbuch/_lib/__wegwerf.ts
rm -rf src/app/m/lagerbuch/g
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/bauform.test.ts
git commit -m "test(lagerbuch): _lib/bauform.test.ts — die vier modulweiten Quelltext-Zusicherungen

kein isAdmin · keine der vier core-Suite-Admin-Funktionen · kein
x-forwarded-for · Praedikat statt Riegel in den drei Weichen-Dateien. Dazu die
'use client'-Zusicherung fuer _lib/ und _db/ (Falle 6), die T4 aus Teil 1 um die
seither dazugekommenen Dateien ergaenzt.

Jede dieser Mutationen ist typkorrekt, lint-sauber und fuer pnpm build
unsichtbar. Beim isAdmin-Port kommt dazu, dass BEIDE Dev-Logins isAdmin=true
setzen — die E2E blieben gruen, waehrend die Verwaltung fuer jeden Betreiber
offen stuende (Falle 13).

EIGENSCHAFTSFORM (Festlegung G3): die drei Weichen-Dateien entstehen erst in
Teil 4. Teil 4 ergaenzt HIER den usePathname-Scan und ersetzt die
existsSync-Bedingung durch eine Existenzpflicht. Keine zweite Scan-Datei.

Rot gesehen: fuenf absichtliche Verletzungen, jede einzeln."
```

---

**Gate Stufe 1.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

⚠️ **Prüfe zusätzlich, dass keine Wegwerfdatei überlebt hat.** T20 und T21 legen absichtlich
verletzende Dateien an; bleibt eine liegen, ist die nächste Welle rot aus dem falschen Grund:

```bash
git status --porcelain src/app/m/lagerbuch/
ls src/app/m/lagerbuch/_actions/ 2>/dev/null
```

Erwartet: keine `__wegwerf*`-Datei, `_actions/` enthält ausschließlich `guards.test.ts`.

---

## Welle 2 — Die Sitzung, der Riegel, die Schranke (3 Tasks, alle parallel)

Drei Tasks, die einander nicht berühren und alle drei auf T15 (`grenzen.ts`) bzw. Teil 1 aufsetzen.
Das sind die Kernstücke dieses Plans: nach dieser Stufe existiert **jede** Zugangsentscheidung des
Moduls als aufrufbare Funktion.

---

### Task 22: `_lib/helferSitzung.ts` — das jose-Cookie, host-only und rückwärtskompatibel

**Files:**
- Create: `src/app/m/lagerbuch/_lib/helferSitzung.ts`
- Test: `src/app/m/lagerbuch/_lib/helferSitzung.test.ts`

**Interfaces:**
- Consumes: `_lib/grenzen.ts` (T15) — `grenzen(env?): Grenzen` und
  `helferSitzungGeheimnis(env?): string`. Dazu `jose` (T1 aus Teil 1, **direkte** Abhängigkeit).
- Produces:
  ```ts
  export const HELFER_COOKIE: "helfer_session";
  export type HelferPayload = { tokenId: string };
  export type HelferSitzung = HelferPayload & { laeuftAb: Date };

  export async function createHelferSitzung(p: HelferPayload): Promise<string>;
  export async function verifyHelferSitzung(value: string): Promise<HelferSitzung | null>;
  export function helferGueltigkeitSekunden(): number;
  export function helferCookieOptionen(gueltigkeitSekunden: number): {
    httpOnly: true; sameSite: "lax"; path: "/"; secure: boolean; maxAge: number;
  };
  ```
  Konsumenten: `_lib/helferZugang.ts` (T25, dieser Plan), `abmelden/route.ts` (T26, dieser Plan),
  `t/[code]/route.ts` und `_actions/gate.ts` / `_actions/sitzung.ts` (alle Teil 4).

**Die eine Zeile, an der beim Port am meisten hängt: KEIN `domain`.** Die naheliegende Vorlage ist
die falsche. `core/auth/cookies.ts:46-59` setzt `domain` aus `AUTH_COOKIE_DOMAIN` — die Datei heißt
`auth/cookies.ts`, der Griff liegt nahe, und sie ist für die **Suite**-Sitzung richtig. Kopiert man
das hierher, wird aus einer host-gebundenen Helfer-Sitzung ein Cookie, das an **jeden** Modul-Host
geschickt wird: an `files.`, an `feedback.`, an jeden weiteren. Es entstünde keine
Rechteausweitung (kein anderes Modul liest den Namen), aber **Exposition in jedem Header und in jedem
Log, das Cookies führt**.

⚠️ **Dass host-only-Cookies über Modul-Hosts hinweg produktiv zuschlagen, ist in dieser Suite
BELEGT, nicht vermutet:** `core/auth/cookies.ts:5-31` schreibt den Vorfall aus
(`InvalidCheck: state value could not be parsed` nach dem ersten Modul-Cutover). lagerbuch bringt die
zweite Cookie-Familie in genau diese Topologie — **mit gegenläufiger Reichweite**. Ein Admin ist auf
jedem Suite-Host derselbe, eine Helferin ist es je Host neu. Das ist Absicht.

*Kein Gate:* **Playwright fährt gegen einen Host**, und dort verhält sich ein domain-weites Cookie
exakt wie ein host-only (Falle 19). Der Scan „kein `domain` in `_lib/helferSitzung.ts`" ist die
einzige Absicherung — er entsteht in Schritt 5 dieses Tasks, direkt an seinem Subjekt.

**Die Rückwärtskompatibilität ist der Punkt, nicht eine Nebenwirkung.** `verifyHelferSitzung` verlangt
**nur** `typeof tokenId === "string"` und **ignoriert überzählige Felder**. Ein Alt-Cookie mit
`{tokenId, code, label}` verifiziert damit unverändert weiter — das Geheimnis ist dasselbe, der Name
ist derselbe, die Signatur passt. **Ohne diese Eigenschaft wäre die Übernahme des Geheimnisses
(Betreiber-Entscheidung 4) wirkungslos.** Die Gegenmutation ist teuer und unsichtbar: eine strikte
Feldprüfung auf genau `{tokenId}` beendet **jede laufende Feld-Sitzung** beim Cutover, und **kein
anderer Test sieht das**.

⚠️ **Die eine bewusste Verschärfung: fehlt `exp`, ist die Sitzung ungültig.** Das ist strenger als die
Feldprüfung eine Zeile höher und deshalb ausdrücklich gegengeprüft — der Aussteller setzt den Claim
seit jeher **unbedingt** (`lagerbuch/src/lib/auth/helferSession.ts:14`), ein Alt-Cookie trägt ihn
also. `laeuftAb` ist zugleich der **einzige** Datenpfad der Restzeit-Anzeige aus §3.4.3; ohne ihn ist
die dort festgeschriebene Zusage nicht baubar.

**Warum `secure` aus `NODE_ENV` kommt und nicht aus einer Basis-URL.** Der Bestand rechnet
`config.nodeEnv === "production" || config.appBaseUrl.startsWith("https://")`
(`helferSession.ts:32`). In der Suite ist `NODE_ENV` die verlässlichere Quelle: `NODE_ENV=production`
steht **fest im Image** (`iuk-suite/Dockerfile:25`), während `APP_BASE_URL` in der Suite **gar nicht
existiert** (§8.2). Der zweite Operand wäre damit ein Verweis auf eine Variable, die niemand setzt.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/helferSitzung.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SignJWT } from "jose";
import {
  HELFER_COOKIE, createHelferSitzung, verifyHelferSitzung,
  helferCookieOptionen, helferGueltigkeitSekunden,
} from "./helferSitzung";

/**
 * Das Geheimnis kommt zur AUFRUFZEIT aus der Umgebung (§10.8, Eigenschaft 3).
 * Deshalb genuegt es, `process.env` je Fall zu setzen — es gibt keinen
 * Modul-Singleton, den man zuruecksetzen muesste. Genau das ist die Eigenschaft,
 * die dieser Aufbau nebenbei belegt.
 */
const GEHEIM = "e2e-helfer-secret-nicht-produktiv-32z";
const FREMD = "ein-voellig-anderes-geheimnis-mit-32z!";

const alt: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ["LAGERBUCH_HELFER_SITZUNG_SECRET", "LAGERBUCH_HELFER_SITZUNG_STUNDEN", "NODE_ENV"]) {
    alt[k] = process.env[k];
  }
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = GEHEIM;
});
afterEach(() => {
  for (const [k, v] of Object.entries(alt)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

/** Ein Cookie, wie es die ALT-Anwendung ausgestellt hat: drei Felder, HS256, exp. */
async function altCookie(
  nutzlast: Record<string, unknown>,
  opts: { geheimnis?: string; ablaufSekunden?: number; ohneExp?: boolean } = {},
): Promise<string> {
  let b = new SignJWT(nutzlast).setProtectedHeader({ alg: "HS256" }).setIssuedAt();
  if (!opts.ohneExp) {
    b = b.setExpirationTime(
      Math.floor(Date.now() / 1000) + (opts.ablaufSekunden ?? 12 * 3600),
    );
  }
  return b.sign(new TextEncoder().encode(opts.geheimnis ?? GEHEIM));
}

describe("HELFER_COOKIE", () => {
  it("heisst helfer_session — OHNE Modulpraefix, unbedingt", () => {
    /**
     * Das weicht vom Hausstil ab, der praefigiert (`files_s_<shareId>`,
     * `feedback-<surveyId>`). Begruendung: das Cookie ist HOST-ONLY, lagerbuch
     * ist das einzige Modul auf lagerbuch.iuk-ue.de, und KEIN anderes
     * Suite-Modul liest `helfer_session` — eine Namenskollision ist konstruktiv
     * unmoeglich.
     *
     * Ein Praefix kostete im guenstigen Cutover-Zweig genau das, wofuer das
     * Geheimnis uebernommen wird: JEDE laufende Feld-Sitzung. Ein bedingter
     * Cookie-Name waere eine Bauzeit-Gabelung, die niemand will.
     */
    expect(HELFER_COOKIE).toBe("helfer_session");
  });
});

describe("verifyHelferSitzung — RUECKWAERTSKOMPATIBEL, und das ist der Punkt", () => {
  it("verifiziert ein ALT-Cookie mit {tokenId, code, label} unveraendert weiter", async () => {
    /**
     * DIE ZEILE, WEGEN DER DIE GEHEIMNIS-UEBERNAHME UEBERHAUPT TRAEGT
     * (Betreiber-Entscheidung 4). Heute traegt das JWT `{tokenId, code, label}`
     * (`lagerbuch/src/lib/auth/helferSession.ts:6,11`); die neue Nutzlast ist
     * `{tokenId}`, weil §3.4.4 auf jedem Lesepfad ohnehin die Token-Zeile holt.
     *
     * DIE GEGENMUTATION IST TEUER UND UNSICHTBAR: eine strikte Feldpruefung auf
     * genau `{tokenId}` beendet JEDE laufende Feld-Sitzung beim Cutover, und
     * KEIN ANDERER TEST SIEHT DAS. Deshalb steht dieser Fall hier und nicht
     * irgendwo im E2E.
     */
    const roh = await altCookie({ tokenId: "tk1", code: "123-456", label: "RTW 1" });
    const s = await verifyHelferSitzung(roh);
    expect(s).not.toBeNull();
    expect(s?.tokenId).toBe("tk1");
  });

  it("liefert laeuftAb aus dem exp DIESES Alt-Cookies", async () => {
    // `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte
    // Claim, den setExpirationTime setzt — und den jose beim Verifizieren ohnehin
    // schon prueft. Ihn herauszureichen kostet keinen zusaetzlichen Zugriff und
    // ist der EINZIGE Datenpfad der Restzeit-Anzeige (§3.4.3, §7.8.2).
    const inEinerStunde = Math.floor(Date.now() / 1000) + 3600;
    const roh = await altCookie({ tokenId: "tk1", code: "1", label: "l" },
                                { ablaufSekunden: 3600 });
    const s = await verifyHelferSitzung(roh);
    expect(s?.laeuftAb).toBeInstanceOf(Date);
    // Sekundengenau: jose rechnet in Sekunden, Date in Millisekunden.
    expect(Math.round((s!.laeuftAb.getTime() / 1000 - inEinerStunde))).toBeLessThanOrEqual(1);
  });

  it("verifiziert die NEUE Nutzlast {tokenId}", async () => {
    const s = await verifyHelferSitzung(await createHelferSitzung({ tokenId: "tk9" }));
    expect(s?.tokenId).toBe("tk9");
  });

  it("weist ein Cookie OHNE tokenId ab", async () => {
    expect(await verifyHelferSitzung(await altCookie({ code: "123-456" }))).toBeNull();
    expect(await verifyHelferSitzung(await altCookie({ tokenId: 42 }))).toBeNull();
    expect(await verifyHelferSitzung(await altCookie({ tokenId: "" }))).toBeNull();
  });

  it("weist ein Cookie OHNE exp ab — die eine bewusste Verschaerfung", async () => {
    /**
     * Sie ist strenger als die Feldpruefung eine Zeile hoeher und darf NUR
     * deshalb dort stehen, weil dieser Fall im Bestand nicht vorkommt: der
     * Aussteller setzt den Claim seit jeher UNBEDINGT
     * (`helferSession.ts:14`), ein Alt-Cookie traegt ihn also.
     *
     * Ohne diesen Fall faellt die Verschaerfung erst am Cutover-Abend auf — und
     * dann allen.
     */
    expect(await verifyHelferSitzung(await altCookie({ tokenId: "tk1" }, { ohneExp: true })))
      .toBeNull();
  });

  it("weist ein FREMDES Geheimnis ab", async () => {
    const roh = await altCookie({ tokenId: "tk1" }, { geheimnis: FREMD });
    expect(await verifyHelferSitzung(roh)).toBeNull();
  });

  it("weist ein ABGELAUFENES exp ab", async () => {
    const roh = await altCookie({ tokenId: "tk1" }, { ablaufSekunden: -60 });
    expect(await verifyHelferSitzung(roh)).toBeNull();
  });

  it("weist Muell ab, ohne zu werfen", async () => {
    // Der Wert kommt aus einem Cookie und ist damit Nutzereingabe. Ein Wurf
    // machte aus einem manipulierten Cookie einen 500 auf JEDER Helfer-Seite.
    for (const roh of ["", "abc", "a.b.c", "eyJhbGciOiJub25lIn0..", "null"]) {
      await expect(verifyHelferSitzung(roh)).resolves.toBeNull();
    }
  });

  it("weist ein Cookie mit alg:none ab", async () => {
    // Die klassische JWT-Falle. `jwtVerify` bekommt `algorithms: ["HS256"]`
    // ausdruecklich mit — ohne die Zeile akzeptierten manche Bibliotheken ein
    // unsigniertes Token.
    const unsigniert =
      Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") +
      "." +
      Buffer.from(JSON.stringify({ tokenId: "tk1", exp: Math.floor(Date.now() / 1000) + 3600 }))
        .toString("base64url") +
      ".";
    expect(await verifyHelferSitzung(unsigniert)).toBeNull();
  });
});

describe("createHelferSitzung", () => {
  it("signiert mit HS256 und setzt exp aus LAGERBUCH_HELFER_SITZUNG_STUNDEN", async () => {
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "3";
    const vorher = Math.floor(Date.now() / 1000);
    const s = await verifyHelferSitzung(await createHelferSitzung({ tokenId: "tk1" }));
    const sekunden = s!.laeuftAb.getTime() / 1000 - vorher;
    expect(sekunden).toBeGreaterThan(3 * 3600 - 5);
    expect(sekunden).toBeLessThan(3 * 3600 + 5);
  });

  it("schreibt AUSSCHLIESSLICH tokenId in die Nutzlast — kein code, kein label", async () => {
    /**
     * `code` ist der Wert, den der Implementierungsplan als „das Etikett IST das
     * Secret" bezeichnet. Er kann weg, weil §3.4.4 auf jedem Lesepfad ohnehin die
     * Token-Zeile holt — `code` und `label` kommen ab jetzt VON DORT.
     *
     * Der Test liest die Nutzlast roh, nicht ueber verifyHelferSitzung: die
     * Funktion wuerde ueberzaehlige Felder ja gerade ignorieren und koennte den
     * Unterschied nicht zeigen.
     */
    const [, nutzlast] = (await createHelferSitzung({ tokenId: "tk1" })).split(".");
    const felder = JSON.parse(Buffer.from(nutzlast, "base64url").toString("utf8"));
    expect(Object.keys(felder).sort()).toEqual(["exp", "iat", "tokenId"]);
  });

  it("wirft mit benannter Meldung, wenn das Geheimnis fehlt", async () => {
    // `${LAGERBUCH_HELFER_SITZUNG_SECRET}` ohne `:?` setzt in Compose den LEEREN
    // String; leer greift keinen Default. Ohne diese Zeile verweigerte `jose`
    // einen Nullschluessel mit „Zero-length key is not supported" — eine Meldung,
    // die niemanden zur Ursache fuehrt.
    delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
    await expect(createHelferSitzung({ tokenId: "tk1" }))
      .rejects.toThrow(/LAGERBUCH_HELFER_SITZUNG_SECRET/);
  });
});

describe("helferCookieOptionen", () => {
  it("traegt KEIN domain — die eine Zeile, an der am meisten haengt", () => {
    /**
     * Die naheliegende Vorlage heisst `core/auth/cookies.ts` und SETZT es. Mit
     * `domain` wanderte das Helfer-Cookie an files., an feedback. und an jeden
     * weiteren Modul-Host — keine Rechteausweitung, aber Exposition in jedem
     * Header und jedem Log, das Cookies fuehrt.
     *
     * PLAYWRIGHT KANN DAS NICHT SEHEN: es faehrt gegen EINEN Host, und dort
     * verhaelt sich ein domain-weites Cookie exakt wie ein host-only (Falle 19).
     */
    expect(helferCookieOptionen(3600)).not.toHaveProperty("domain");
    expect(Object.keys(helferCookieOptionen(3600)).sort())
      .toEqual(["httpOnly", "maxAge", "path", "sameSite", "secure"]);
  });

  it("traegt httpOnly, sameSite lax und path /", () => {
    const o = helferCookieOptionen(3600);
    expect(o.httpOnly).toBe(true);
    expect(o.sameSite).toBe("lax");
    expect(o.path).toBe("/");
    expect(o.maxAge).toBe(3600);
  });

  it("setzt secure aus NODE_ENV, nicht aus einer Basis-URL", () => {
    // NODE_ENV=production steht fest im Image (`iuk-suite/Dockerfile:25`);
    // APP_BASE_URL existiert in der Suite gar nicht (§8.2). Der zweite Operand
    // des Bestands waere ein Verweis auf eine Variable, die niemand setzt.
    process.env.NODE_ENV = "production";
    expect(helferCookieOptionen(1).secure).toBe(true);
    process.env.NODE_ENV = "development";
    expect(helferCookieOptionen(1).secure).toBe(false);
  });

  it("maxAge 0 ist das LOESCHEN — dieselben Attribute wie beim Setzen", () => {
    /**
     * `/abmelden` loescht mit `helferCookieOptionen(0)` statt mit
     * `cookies.delete(...)`: die Attribute muessen beim Loeschen DIESELBEN sein
     * wie beim Setzen (path, kein domain), und die eine Funktion, die das
     * garantiert, gibt es schon. Es ist zugleich die Form, die `feedback`
     * benutzt (`m/feedback/actions.ts:638`).
     */
    const loeschen = helferCookieOptionen(0);
    const setzen = helferCookieOptionen(3600);
    expect(loeschen.maxAge).toBe(0);
    expect(loeschen.path).toBe(setzen.path);
    expect(loeschen.sameSite).toBe(setzen.sameSite);
    expect(loeschen.httpOnly).toBe(setzen.httpOnly);
    expect(loeschen).not.toHaveProperty("domain");
  });
});

describe("helferGueltigkeitSekunden", () => {
  it("rechnet die Stunden aus der Env in Sekunden um — an EINER Stelle", () => {
    // Der Wert steht ZWEIMAL in derselben Sitzung: als JWT-exp und als
    // Cookie-maxAge (§3.4.3). Zwei Umrechnungen waeren zwei Wahrheiten, und die
    // Sitzung liefe je nach Weg verschieden lange.
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "12";
    expect(helferGueltigkeitSekunden()).toBe(12 * 3600);
    process.env.LAGERBUCH_HELFER_SITZUNG_STUNDEN = "1";
    expect(helferGueltigkeitSekunden()).toBe(3600);
  });
});

describe("die Quelltext-Zusicherung zu dieser Datei", () => {
  it("setzt kein domain und importiert core/auth/cookies nicht", async () => {
    // §3.8.2. Sie liegt hier und nicht in `bauform.test.ts`, weil sie eine
    // Aussage ueber GENAU DIESE Datei ist.
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const quelle = readFileSync(
      join(process.cwd(), "src/app/m/lagerbuch/_lib/helferSitzung.ts"), "utf8");
    /**
     * ⚠️ GEPRUEFT WIRD AUF EINE ZUWEISUNG, NICHT AUF DAS WORT. Der Kopfkommentar
     * von `helferCookieOptionen` traegt sowohl „domain" als auch
     * „AUTH_COOKIE_DOMAIN" — er erklaert ja gerade die Abwesenheit. Ein
     * `expect(quelle).not.toMatch(/AUTH_COOKIE_DOMAIN/)` waere auf der eigenen
     * Begruendung rot und wuerde dann geloescht statt verstanden.
     *
     * `/^\s*domain\s*:/m` trifft eine Objekteigenschaft am Zeilenanfang. In einem
     * Blockkommentar steht dort ein ` * `, die Zeile beginnt also nie mit
     * `domain:`.
     */
    expect(quelle, "helferCookieOptionen darf kein domain setzen (§3.4.2)")
      .not.toMatch(/^\s*domain\s*:/m);
    // Und kein IMPORT der Suite-Cookie-Konfiguration — die naheliegende Vorlage.
    expect(quelle, "core/auth/cookies ist die Vorlage fuer die SUITE-Sitzung, nicht fuer diese")
      .not.toMatch(/from\s+["']@\/core\/auth\/cookies["']/);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./helferSitzung"`.

- [ ] **Schritt 3: `_lib/helferSitzung.ts` schreiben**

```ts
import { SignJWT, jwtVerify } from "jose";
import { grenzen, helferSitzungGeheimnis } from "./grenzen";

/**
 * Die Helfer-Sitzung: ein signiertes JWT in einem HOST-ONLY-Cookie.
 * KEIN "use client" (Falle 6) — die Werte lesen Server Components und Route
 * Handler.
 *
 * DER NAME BLEIBT `helfer_session`, unbedingt, in beiden Cutover-Zweigen. Das
 * weicht vom Hausstil ab, der praefigiert (`files_s_<shareId>`,
 * `m/files/_lib/passwort.ts:24-28`; `feedback-<surveyId>`,
 * `m/feedback/actions.ts:610`). Die Begruendung: das Cookie ist host-only,
 * lagerbuch ist das einzige Modul auf `lagerbuch.iuk-ue.de`, und KEIN anderes
 * Suite-Modul liest diesen Namen — eine Namenskollision ist konstruktiv
 * unmoeglich. Ein Praefix kostete im guenstigen Zweig genau das, wofuer das
 * Geheimnis uebernommen wird: jede laufende Feld-Sitzung.
 */
export const HELFER_COOKIE = "helfer_session";

/**
 * `code` und `label` sind WEGGEFALLEN. Sie kommen ab jetzt aus der Token-Zeile
 * (§3.4.4) — das ist der Grund, warum das Klartext-Secret aus dem Cookie
 * verschwinden konnte.
 */
export type HelferPayload = { tokenId: string };

/**
 * Was `verifyHelferSitzung` ZURUECKGIBT: die Nutzlast plus den Ablaufzeitpunkt.
 *
 * `exp` ist kein Feld der signierten Nutzlast, sondern der registrierte Claim,
 * den `setExpirationTime` setzt (`lagerbuch/src/lib/auth/helferSession.ts:14` —
 * unbedingt, auch im Bestand) und den `jose` beim Verifizieren ohnehin schon
 * prueft. Ihn hier herauszureichen kostet keinen zusaetzlichen Zugriff und ist
 * der EINZIGE Datenpfad der Restzeit-Anzeige (§3.4.3, Punkt 1; §7.8.2); ohne ihn
 * ist die dort festgeschriebene Zusage nicht baubar.
 */
export type HelferSitzung = HelferPayload & { laeuftAb: Date };

/**
 * DAS GEHEIMNIS WIRD IM THUNK GELESEN, NICHT AUF MODULEBENE.
 *
 * Ein `const SCHLUESSEL = new TextEncoder().encode(helferSitzungGeheimnis())` am
 * Dateikopf braeche `pnpm build`: `next build` laeuft mit NODE_ENV=production und
 * OHNE Secrets und wertet Modulebene aus (§10.8, Eigenschaft 3;
 * `lagerbuch/src/lib/config.ts:91-99` schreibt denselben Befund ueber vierzehn
 * Zeilen aus). Der Bestand macht es bereits richtig (`helferSession.ts:8`:
 * `const secret = () => ...`) — die Form wandert mit.
 */
const schluessel = () => new TextEncoder().encode(helferSitzungGeheimnis());

/**
 * Die Gueltigkeit steht ZWEIMAL in derselben Sitzung: als JWT-`exp` und als
 * Cookie-`maxAge` (§3.4.3). Zwei Umrechnungen waeren zwei Wahrheiten, und die
 * Sitzung liefe je nach Weg verschieden lange — deshalb genau eine Funktion.
 */
export function helferGueltigkeitSekunden(): number {
  return grenzen().helferSitzungStunden * 3600;
}

export async function createHelferSitzung(p: HelferPayload): Promise<string> {
  return new SignJWT({ tokenId: p.tokenId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + helferGueltigkeitSekunden())
    .sign(schluessel());
}

/**
 * RUECKWAERTSKOMPATIBEL, UND DAS IST DER PUNKT.
 *
 * Verlangt wird NUR `typeof tokenId === "string"`; ueberzaehlige Felder werden
 * IGNORIERT. Ein Alt-Cookie mit `{tokenId, code, label}` verifiziert damit
 * unveraendert weiter — dasselbe Geheimnis, derselbe Name, dieselbe Signatur.
 * OHNE DIESE EIGENSCHAFT WAERE DIE UEBERNAHME DES GEHEIMNISSES
 * (Betreiber-Entscheidung 4) WIRKUNGSLOS.
 *
 * ⚠️ Die Gegenmutation ist teuer und unsichtbar: eine strikte Feldpruefung auf
 * genau `{tokenId}` beendet JEDE laufende Feld-Sitzung beim Cutover, und KEIN
 * ANDERER TEST SIEHT DAS. Der Fall steht deshalb ausgeschrieben in
 * `helferSitzung.test.ts`.
 *
 * ⚠️ FEHLT `exp`, ist die Sitzung ungueltig. Das ist eine VERSCHAERFUNG
 * gegenueber der Feldpruefung eine Zeile hoeher und deshalb ausdruecklich
 * gegengeprueft: der Aussteller setzt den Claim seit jeher unbedingt
 * (`helferSession.ts:14`), ein Alt-Cookie traegt ihn also.
 *
 * WIRFT NIE. Der Wert kommt aus einem Cookie und ist Nutzereingabe; ein Wurf
 * machte aus einem manipulierten Cookie einen 500 auf jeder Helfer-Seite.
 *
 * `algorithms: ["HS256"]` steht ausdruecklich da — ohne die Zeile akzeptierten
 * manche Bibliotheken ein Token mit `alg: none`.
 */
export async function verifyHelferSitzung(value: string): Promise<HelferSitzung | null> {
  try {
    const { payload } = await jwtVerify(value, schluessel(), { algorithms: ["HS256"] });
    const { tokenId, exp } = payload as { tokenId?: unknown; exp?: unknown };
    if (typeof tokenId !== "string" || tokenId === "") return null;
    if (typeof exp !== "number") return null;
    return { tokenId, laeuftAb: new Date(exp * 1000) };
  } catch {
    return null;
  }
}

/**
 * KEIN `domain`. Das ist die eine Zeile, an der beim Port am meisten haengt.
 *
 * Die naheliegende Vorlage ist die falsche: `core/auth/cookies.ts:46-59` setzt
 * `domain` aus `AUTH_COOKIE_DOMAIN` — die Datei heisst `auth/cookies.ts`, der
 * Griff liegt nahe, und sie ist fuer die SUITE-Sitzung richtig. Kopiert man das
 * hierher, wird aus einer host-gebundenen Helfer-Sitzung ein Cookie, das an
 * JEDEN Modul-Host geschickt wird — an `files.`, an `feedback.`, an jeden
 * weiteren. Es entstuende keine Rechteausweitung (kein anderes Modul liest den
 * Namen), aber Exposition in jedem Header und in jedem Log, das Cookies fuehrt.
 *
 * Dass host-only-Cookies ueber Modul-Hosts hinweg produktiv zuschlagen, ist in
 * dieser Suite BELEGT, nicht vermutet: `core/auth/cookies.ts:5-31` schreibt den
 * Vorfall aus (`InvalidCheck: state value could not be parsed` nach dem ersten
 * Modul-Cutover). lagerbuch bringt die zweite Cookie-Familie in genau diese
 * Topologie — mit gegenlaeufiger Reichweite. Ein Admin ist auf jedem Suite-Host
 * derselbe, eine Helferin ist es je Host neu. Das ist Absicht.
 *
 * ⚠️ PLAYWRIGHT KANN DAS NICHT SEHEN: es faehrt gegen EINEN Host, und dort
 * verhaelt sich ein domain-weites Cookie exakt wie ein host-only (Falle 19). Die
 * einzige Absicherung ist die Quelltext-Zusicherung in `helferSitzung.test.ts`.
 *
 * `secure` kommt aus NODE_ENV, nicht aus `config.appBaseUrl.startsWith("https://")`
 * (`helferSession.ts:32`): `NODE_ENV=production` steht fest im Image
 * (`iuk-suite/Dockerfile:25`), waehrend `APP_BASE_URL` in der Suite gar nicht
 * existiert (§8.2).
 *
 * `gueltigkeitSekunden = 0` ist das LOESCHEN. Es steht hier und nicht in einem
 * eigenen `helferCookieLoeschen()`, weil die Attribute beim Loeschen DIESELBEN
 * sein muessen wie beim Setzen — und die eine Funktion, die das garantiert, ist
 * diese. Dieselbe Form benutzt `feedback` (`m/feedback/actions.ts:638`).
 */
export function helferCookieOptionen(gueltigkeitSekunden: number) {
  return {
    httpOnly: true as const,
    sameSite: "lax" as const,
    path: "/" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: gueltigkeitSekunden,
  };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 5: Die `domain`-Zusicherung rot sehen**

```bash
sed -i.bak 's|    path: "/" as const,|    path: "/" as const,\n    domain: ".iuk-ue.de",|' \
  src/app/m/lagerbuch/_lib/helferSitzung.ts
pnpm vitest run src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

Erwartet: **FAIL** in **zwei** Fällen — „traegt KEIN domain — die eine Zeile, an der am meisten
haengt" (die Schlüsselliste stimmt nicht mehr) und „setzt kein domain und importiert
core/auth/cookies nicht" (die eingefügte Zeile beginnt mit `domain:`). **Das ist der Nachweis, dass
die Zusicherung beißt**; ohne ihn wäre sie eine Zeile, die immer grün ist.

⚠️ **Die Zusicherung prüft eine ZUWEISUNG, nicht das Wort.** Ein
`expect(quelle).not.toMatch(/domain/)` wäre auf dem eigenen Kopfkommentar rot — der erklärt ja
gerade, warum `AUTH_COOKIE_DOMAIN` hier nicht hingehört — und würde dann gelöscht statt verstanden.
Dasselbe Muster wie in `_lib/bauform.test.ts`, nur ohne Kommentar-Stripper: `/^\s*domain\s*:/m`
trifft eine Objekteigenschaft am Zeilenanfang, und eine Blockkommentarzeile beginnt mit ` * `.

```bash
mv src/app/m/lagerbuch/_lib/helferSitzung.ts.bak src/app/m/lagerbuch/_lib/helferSitzung.ts
pnpm vitest run src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

Erwartet: wieder grün.

- [ ] **Schritt 6: Nachweisen, dass der Thunk trägt — und zwar messbar**

⚠️ **`pnpm build` ist an dieser Stelle KEIN Nachweis.** Nichts unter `_lib/` wird bis Teil 4 von einer
Route importiert; Next übersetzt ein unreferenziertes Modul eines Private Folders **gar nicht**. Ein
`env -u … pnpm build` liefe hier trivial grün und behauptete etwas, das er nicht geprüft hat. Der
Nachweis, der jetzt schon trägt, **importiert das Modul ausdrücklich** und wertet damit genau die
Modulebene aus, um die es geht:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/helferSitzung.ts")
    .then(m => console.log("Modulebene ausgewertet, Cookie:", m.HELFER_COOKIE))
    .catch(e => { console.error("UNERWARTET geworfen:", e.name, e.message); process.exit(1); })'
```

Erwartet: `Modulebene ausgewertet, Cookie: helfer_session` — **ohne** Wurf, obwohl das Geheimnis
fehlt. Das ist der Thunk: `helferSitzungGeheimnis()` läuft erst, wenn jemand ein Cookie ausstellt
oder prüft.

**Die Gegenprobe — sie muss FEHLSCHLAGEN**, und sie wird **nicht** eingecheckt:

```bash
cp src/app/m/lagerbuch/_lib/helferSitzung.ts /tmp/hs.ts
perl -0pi -e 's|^const schluessel = \(\) => new TextEncoder\(\)\.encode\(helferSitzungGeheimnis\(\)\);|const SCHLUESSEL = new TextEncoder().encode(helferSitzungGeheimnis());\nconst schluessel = () => SCHLUESSEL;|m' \
  src/app/m/lagerbuch/_lib/helferSitzung.ts

env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/helferSitzung.ts")
    .then(() => { console.error("FEHLER: haette werfen muessen"); process.exit(1); })
    .catch(e => console.log("erwartet geworfen BEIM IMPORT:", e.name))'
```

Erwartet: `erwartet geworfen BEIM IMPORT: GrenzenUngueltig`. **Das ist die Falle aus §10.8,
Eigenschaft 3 im Original** — und der Grund, warum der Thunk kein Stilmittel ist: **ab Teil 4**, wenn
`t/[code]/route.ts` diese Datei importiert, wäre derselbe Wurf ein gebrochener `pnpm build`, und die
Ursache stünde in einer Datei, die niemand verdächtigt.

```bash
cp /tmp/hs.ts src/app/m/lagerbuch/_lib/helferSitzung.ts && rm /tmp/hs.ts
pnpm vitest run src/app/m/lagerbuch/_lib/helferSitzung.test.ts
```

Erwartet: wieder grün.

- [ ] **Schritt 7: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/helferSitzung.ts src/app/m/lagerbuch/_lib/helferSitzung.test.ts
git commit -m "feat(lagerbuch): _lib/helferSitzung.ts — host-only, rueckwaertskompatibel

KEIN domain. Die naheliegende Vorlage (core/auth/cookies.ts) setzt es und ist
fuer die SUITE-Sitzung richtig; hierher kopiert wanderte das Helfer-Cookie an
jeden Modul-Host. Playwright faehrt gegen EINEN Host und kann das nicht sehen
(Falle 19) — die Quelltext-Zusicherung im Test ist die einzige Absicherung, und
sie wurde einmal rot gesehen.

Nutzlast auf {tokenId} gekuerzt; code und label kommen ab jetzt aus der
Token-Zeile. verifyHelferSitzung verlangt NUR tokenId und ignoriert
ueberzaehlige Felder — ein Alt-Cookie mit {tokenId, code, label} verifiziert
unveraendert weiter. Ohne diese Eigenschaft waere die Uebernahme des Geheimnisses
(Betreiber-Entscheidung 4) wirkungslos, und die Gegenmutation saehe kein Test.

Eine bewusste Verschaerfung: fehlt exp, ist die Sitzung ungueltig. laeuftAb ist
der einzige Datenpfad der Restzeit-Anzeige (§3.4.3).

Das Geheimnis wird im Thunk gelesen, nicht auf Modulebene — gegengeprueft:
mit Modul-Singleton bricht pnpm build ohne Secrets (§10.8, Eigenschaft 3).

secure aus NODE_ENV, nicht aus APP_BASE_URL — die Variable existiert in der
Suite nicht."
```

---

### Task 23: `_lib/zugang.ts` und `_lib/konto.ts` — der Verwaltungsriegel ohne Abkürzung

**Files:**
- Create: `src/app/m/lagerbuch/_lib/zugang.ts`, `src/app/m/lagerbuch/_lib/konto.ts`
- Test: `src/app/m/lagerbuch/_lib/zugang.test.ts`
- Modify: `src/app/m/lagerbuch/_db/quelle.test.ts` (**Erweiterung** um die `merkeNutzer`-Gegenprobe —
  Teil 1, Festlegung F5; §4.16, Punkt 4. **Es entsteht keine zweite Datei.**)

**Interfaces:**
- Consumes: `_lib/host.ts` (T10) — `requireLagerbuchHost(headers)`; `_lib/returnTo.ts` (T19) —
  `sanitizeReturnTo`; `_db/client.ts` (T12) — `getDb()`, `type DB`; `_db/schema.ts` (T7) — `users`;
  `_db/testdb.ts` (T9, nur für den Test) — `migrierteTestDb`. Aus `core`: `auth` (`@/core/auth`),
  `getModule` und `prodHostsFor` (`@/core/registry`), `adminGroupsFor` (`@/core/groups`).
- Produces:
  ```ts
  // _lib/zugang.ts
  export type Viewer = { sub: string; groups: string[]; name: string | null; email: string | null };

  export function viewerAusSession(
    session: { user?: { id?: string; groups?: string[]; name?: string | null;
                       email?: string | null } } | null,
  ): Viewer | null;
  export async function viewerOderNull(): Promise<Viewer | null>;
  export function istLagerbuchAdmin(viewer: Viewer | null): boolean;
  export function verwaltungsZiel(): string;
  export async function requireLagerbuchAdmin(): Promise<Viewer>;
  export function adminLandingPfad(returnTo: string | null | undefined): string;

  // _lib/konto.ts
  export function merkeNutzer(db: DB, viewer: Viewer): void;
  ```
  Konsumenten: `verwaltung/(arbeit)/layout.tsx` und `verwaltung/(druck)/layout.tsx` (Teil 5 bzw.
  Teil 6, jeweils `requireLagerbuchAdmin`), **jede** Verwaltungs-Action in `_actions/` (Teile 4–6),
  die beiden Rollen-Weichen und die Gate-Seite (`viewerOderNull` + `istLagerbuchAdmin`, Teil 4).
  `adminLandingPfad` hat **genau einen** Aufrufer: die Gate-Seite `page.tsx` (§7.2.4, Teil 4).
  `merkeNutzer` hat **genau einen** Aufrufer: `requireLagerbuchAdmin`.

**ZWEI FORMEN, EINE REGEL (§3.2.1)** — die Regel dieser Datei, und sie gilt für jeden künftigen
Zugriffspfad des Moduls:

| Form | Wo | Warum |
|---|---|---|
| **Riegel** `requireLagerbuchAdmin()` | `verwaltung/(arbeit)/layout.tsx`, `verwaltung/(druck)/layout.tsx` **und jede Verwaltungs-Action** | Es gibt **einen** zulässigen Ausgang; jeder andere Fall ist ein Fehl- oder Manipulationsfall. Dort ist der Wurf die richtige Form (`m/files/(verwaltung)/actions.ts:26-28` sagt denselben Satz) |
| **Prädikat** `istLagerbuchAdmin(await viewerOderNull())` | `a/[artikelId]/page.tsx`, `g/[code]/page.tsx`, `page.tsx` (Gate) | Diese drei Dateien haben je **drei** gültige Fälle, und der dritte ist immer „keine Sitzung" — bei `/a` und `/g` das Gate mit `returnTo`, auf dem Gate die Anzeige des Gates selbst |

⚠️ **Ein Riegel an dieser Weiche schickte jeden anonymen Scan eines Regaletiketts nach `/login`** —
genau der Ausfall, den `requiresAuth: false` (§2.3) verhindern soll (§11.5, Zustand 18). *Kein Gate:*
der Fehler ist typkorrekt, lint-sauber und für `pnpm build` unsichtbar; ein E2E fände ihn nur mit
einem Abruf **ohne** Cookie. Der Scan aus T21 ist die billigste Absicherung.

⚠️ **Die Grenze gehört zur Regel und darf beim Zitieren nicht wegfallen.** „Prädikat in Weichen" gilt
**nicht** für `_actions/` — sonst wären die Quelltext-Zusicherung aus T20 und §6.15, Auflage 3 rot.
**Eine Action hat keine Weiche; sie hat einen Aufrufer, der schon entschieden hat.**

**Die drei tragenden Eigenschaften der Gruppenverknüpfung** (§2.5) — jede, weil die naheliegende
Vorlage die falsche ist:

1. **`adminGroupsFor(mod)`, nie `mod.adminGroups`.** Der direkte Feldzugriff macht
   `SUITE_ADMIN_GROUP_LAGERBUCH` an **genau dieser Stelle** wirkungslos — dieselbe Falle, die
   `registry.ts:28-34` für `prodHosts` ausschreibt und die vor dem `feedback`-Cutover einmal
   zugeschlagen hat.
2. **Eine leere Liste gewährt NICHTS.** `viewer.groups.some(g => erlaubt.includes(g))` ist bei leerem
   `erlaubt` **falsch**. Das ist ausdrücklich **nicht** die Bauform von `canAccess`
   (`registry.ts:157-159`), die bei leerer Liste mit `true` aussteigt — `core/groups.ts:53-54` nennt
   das wörtlich „eine **ÖFFNUNG**". Wer die Verknüpfung von `canAccess` abschreibt, öffnet die
   Lagerbuch-Verwaltung für **jeden Eingeloggten**, und der Fehler ist still: **alles funktioniert,
   für zu viele.**
3. **Kein `requiredGroupsFor` daneben.** Das ist die `files`-Verknüpfung
   (`requireFilesAccess` vereinigt beide), und sie ist dort richtig, weil **beide** Variablen dieselbe
   eine Stufe gewähren. Hier wäre es eine stille **zweite Tür**: mit `requiredGroups: []` ließe ein
   aus `feedback` abgeschautes `SUITE_ACCESS_GROUP_LAGERBUCH` eine weitere Gruppe ins Journal mit
   Klarnamen und auf den Etikettenbogen mit den Klartext-Codes, **ohne dass irgendwo etwas rot
   würde**. Die Boot-Prüfung, die ein gesetztes `SUITE_ACCESS_GROUP_LAGERBUCH` zum Startfehler macht,
   entsteht in **Teil 3** (§10.5, Prüfung 6) — bis dahin ist die **Abwesenheit** der Zeile hier die
   ganze Zusage.

**Warum `notFound()` und nicht 403** (§3.3). Suite-Standard, Entscheidung 10a. `notFound()` rendert
`src/app/not-found.tsx`, dessen zweiter Absatz genau für diesen Fall geschrieben wurde („Was nicht
freigegeben ist, sieht in dieser Suite genauso aus wie etwas, das es nicht gibt.",
`not-found.tsx:41-46`). Der bewusst hingenommene Verlust ist die **Benennbarkeit**; der Gegenwert ist
die Zusage, dass die **Existenz** von `/verwaltung` nicht verraten wird — bei einem Journal mit
Klarnamen und einem Druckbogen mit Token-Codes im Klartext ist das mehr wert als die genauere
Auskunft. `/verwaltung/kein-zugriff` wird **ersatzlos gestrichen**.

**Die drei `console.warn`-Stellen dieses Tasks, vollständig aufgezählt** — damit keine davon beim
Schreiben wegfällt:

| Stelle | Datei | Dedup? | Warum |
|---|---|---|---|
| **Fehlende Gruppe** — „welche Gruppen standen im Token?" | `zugang.ts`, `meldeFehlendeGruppe` | **ja**, je `sub` je Prozess | Der Riegel liegt auf einem 404-Pfad, den ein Bot beliebig oft treffen kann; unbegrenztes Loggen wäre ein Flutungsvektor und machte `docker logs` für genau den Zweck unbrauchbar, für den die Zeile da ist |
| **Der Defektzustand** — `name` UND `email` `null` | `konto.ts`, `meldeNamenlos` | **ja**, je `sub` je Prozess | `merkeNutzer` läuft bei **jeder** Verwaltungsanfrage. Ohne Dedup schriebe eine einzige betroffene Person bei jedem Seitenwechsel eine Zeile |
| **Upsert fehlgeschlagen** | `konto.ts`, im `catch` | **nein** | Er trägt ein Exception-Objekt. Ein wiederkehrender Datenbankfehler **soll** jedes Mal sichtbar sein; dedupliziert sähe man eine Störung genau einmal und danach nie wieder |

⚠️ **Der Unterschied zwischen den beiden dedupliziert loggenden Stellen ist inhaltlich, nicht
technisch.** `meldeFehlendeGruppe` nennt **keine Kennung, keine E-Mail, keinen Namen** — der `sub`
dient dort **ausschließlich** als Dedup-Schlüssel im Speicher; das ist dieselbe Form wie heute
(`lagerbuch/src/auth.config.ts:95-99` protokolliert Gruppen und Claim-Schlüssel, keine Person).
`meldeNamenlos` nennt die Kennung **ausdrücklich** (§4.13 (i): „`console.warn` mit der Kennung"),
weil sie hier der einzige Weg ist, die betroffene Zeile zu finden.

⚠️ **`bereitsGemeldet` wächst mit der Zahl abgewiesener bzw. namenloser Personen, nicht mit der Zahl
der Anfragen.** Bei einer Organisation dieser Größe ist das eine dreistellige Obergrenze und braucht
keine Verdrängung. Das ist eine **benannte Annahme**, keine Messung.

**Warum der Upsert HINTER dem Riegel läuft** (§3.7.2, §4.13 (i)). Die Suite hat keinen
`events`-Block (Falle 22); `lagerbuch/src/auth.ts:9-35` verliert damit seinen Einhängepunkt. Der
Ersatz folgt dem `feedback`-Muster (`requireFeedbackAccess.ts:50-55`): **nur wer die Prüfung
übersteht, wird zuordenbar.** ⚠️ **Der Preis, benannt:** heute entsteht der `users`-Satz beim
**Login**, künftig beim **ersten Aufruf der Verwaltung**. Wer sich anmeldet und lagerbuch nie öffnet,
hat keinen Satz — das ist richtig so. In der Praxis fällt es zusammen, weil man Codes nur **in** der
Verwaltung erzeugt.

**Der `callbackUrl` MUSS absolut sein, wenn ein Prod-Host gesetzt ist** (§3.6.6). Ein relatives
`/m/lagerbuch/verwaltung` (feedbacks Weg, `requireFeedbackAccess.ts:35`) ist bei **einem** Host
richtig — hier setzte es die verwaltende Person auf dem **Portal**-Host ab, weil `AUTH_URL` suiteweit
derselbe Wert ist (`core/auth/redirect.ts:8-18`), und entwertete den ganzen `returnTo`-Apparat.
⚠️ **Vor dem Cutover ist der relative Pfad dagegen der einzige sichere Wert:** ohne
`SUITE_HOST_LAGERBUCH` gibt es keinen absoluten Host, und ein **geratener** wäre schlimmer als keiner
— ein unbekannter oder protokollfremder Host landet bei `suiteRedirect` **stumm auf dem Portal**
(`core/auth/redirect.ts:41` lässt einen relativen Pfad dagegen unverändert durch).

- [ ] **Schritt 1: Den fehlschlagenden Test für `zugang.ts` schreiben**

`src/app/m/lagerbuch/_lib/zugang.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { users } from "../_db/schema";

/**
 * DREI MOCKS, UND JEDER HAT EINEN GRUND.
 *
 * `next/navigation`: `redirect()` und `notFound()` werfen in der echten Laufzeit
 * Next-interne Fehler. Fuer die Unit-Aussage genuegt ein ERKENNBARER Wurf —
 * geprueft wird, DASS und WOHIN geworfen wird. Dieselbe Form wie in
 * `_lib/host.test.ts` (Teil 1, T10).
 *
 * `next/headers`: `requireLagerbuchAdmin` ruft `headers()`, und das gibt es
 * ausserhalb einer Anfrage nicht.
 *
 * `@/core/auth`: `auth()` liest das Session-JWT. Der Test steuert die Sitzung.
 *
 * `../_db/client`: `requireLagerbuchAdmin` ruft `merkeNutzer(getDb(), viewer)`.
 * Statt eines Stubs bekommt es eine ECHTE, migrierte Test-Datenbank — nur so
 * belegt dieser Test die Zusage „der Upsert laeuft NACH dem Riegel" (§3.7.2),
 * und ein Stub koennte sie nicht zeigen.
 */
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
vi.mock("next/headers", () => ({ headers: async () => hostKopf }));

let sitzung: unknown = null;
vi.mock("@/core/auth", () => ({ auth: async () => sitzung }));

let t: TestDb;
vi.mock("../_db/client", () => ({ getDb: () => t.db }));

import {
  viewerAusSession, viewerOderNull, istLagerbuchAdmin,
  verwaltungsZiel, requireLagerbuchAdmin, adminLandingPfad,
} from "./zugang";

const ADMIN = { user: { id: "sub-1", groups: ["lagerbuch_nutzer"], name: "Anna Beispiel",
                        email: "anna@example.org" } };
const OHNE_GRUPPE = { user: { id: "sub-2", groups: ["irgendwas"], name: "Bert", email: null } };
const SUITE_ADMIN = { user: { id: "sub-3", groups: ["dashboard-admins"], name: "Chef",
                              email: "chef@example.org" } };

const altGruppe = process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
const altHost = process.env.SUITE_HOST_LAGERBUCH;

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-zugang-");
  sitzung = null;
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  delete process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
  delete process.env.SUITE_HOST_LAGERBUCH;
});
afterEach(() => {
  t.schliessen();
  if (altGruppe === undefined) delete process.env.SUITE_ADMIN_GROUP_LAGERBUCH;
  else process.env.SUITE_ADMIN_GROUP_LAGERBUCH = altGruppe;
  if (altHost === undefined) delete process.env.SUITE_HOST_LAGERBUCH;
  else process.env.SUITE_HOST_LAGERBUCH = altHost;
});

describe("viewerAusSession — VIER Felder, nicht zwei", () => {
  it("uebernimmt sub, groups, name und email", () => {
    /**
     * BEWUSST NICHT aus `m/files/_lib/access.ts:107-113` kopiert: dort hat
     * `Viewer` ZWEI Felder (sub, groups), hier VIER. `merkeNutzer(db, viewer)`
     * schreibt name und email in `users`; eine zweifeldrige Kopie truege still
     * `null` in beide Spalten und erzeugte damit den benannten Defektzustand aus
     * §4.13 — eine ROHE sub-Kennung im Journal statt eines Namens.
     *
     * Die Werte liegen an: `core/auth/config.ts:163-176` laesst
     * session.user.name/email UNANGETASTET und setzt nur groups, isAdmin und id.
     */
    expect(viewerAusSession(ADMIN)).toEqual({
      sub: "sub-1", groups: ["lagerbuch_nutzer"],
      name: "Anna Beispiel", email: "anna@example.org",
    });
  });

  it("ohne user.id gibt es keinen Viewer", () => {
    expect(viewerAusSession(null)).toBeNull();
    expect(viewerAusSession({})).toBeNull();
    expect(viewerAusSession({ user: {} })).toBeNull();
    expect(viewerAusSession({ user: { groups: ["lagerbuch_nutzer"] } })).toBeNull();
  });

  it("ein fehlender groups-Claim ist die LEERE MENGE, kein 500", () => {
    // Sonst haenge die Fehlerform an der Token-Version: ein aelteres Token ohne
    // `groups` liefe in einen Absturz statt in den 404 des Riegels.
    expect(viewerAusSession({ user: { id: "s" } }))
      .toEqual({ sub: "s", groups: [], name: null, email: null });
  });

  it("macht aus fehlendem name/email null, nicht undefined", () => {
    // `undefined` in einer Drizzle-`set`-Klausel bedeutet „Spalte nicht anfassen",
    // `null` bedeutet „auf NULL setzen". Der Unterschied entscheidet in
    // merkeNutzer ueber den Defektzustand.
    const v = viewerAusSession({ user: { id: "s", groups: [] } });
    expect(v?.name).toBeNull();
    expect(v?.email).toBeNull();
  });
});

describe("istLagerbuchAdmin — KEINE Suite-Admin-Abkuerzung", () => {
  it("laesst ein Mitglied der Admin-Gruppe durch", () => {
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(true);
  });

  it("weist den SUITE-Admin ohne Lagerbuch-Gruppe ab", () => {
    /**
     * Betreiber-Entscheidung 3. `isModuleAdmin` (`core/groups.ts:103-105`) laesst
     * ihn unbedingt durch, und der Kurzschluss ist dort begruendet („Ist ueberall
     * Admin, damit ein Modul nicht aussperrbar ist"). Fuer lagerbuch wiegt die
     * Gegenseite schwerer: Admin heisst hier Bestand korrigieren, aussondern,
     * Zugangs-Codes ausstellen und sperren, das JOURNAL MIT KLARNAMEN lesen und
     * Etiketten mit den CODES IM KLARTEXT drucken.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `istLagerbuchAdmin` auf
     * `isModuleAdmin` umstellen. Beide Dev-Logins der Suite setzen
     * `isAdmin = true`, die E2E blieben also ebenfalls gruen.
     */
    expect(istLagerbuchAdmin(viewerAusSession(SUITE_ADMIN))).toBe(false);
  });

  it("weist einen Eingeloggten ohne Gruppe ab", () => {
    expect(istLagerbuchAdmin(viewerAusSession(OHNE_GRUPPE))).toBe(false);
  });

  it("weist null ab", () => {
    expect(istLagerbuchAdmin(null)).toBe(false);
  });

  it("EINE LEERE GRUPPENLISTE GEWAEHRT NICHTS", () => {
    /**
     * DIE ZEILE, DIE AM TEUERSTEN FEHLT. `canAccess` (`registry.ts:157-159`)
     * steigt bei leerer Liste mit `true` aus — `core/groups.ts:53-54` nennt das
     * woertlich „eine OEFFNUNG". Wer diese Verknuepfung abschreibt, oeffnet die
     * Lagerbuch-Verwaltung fuer JEDEN Eingeloggten, und der Fehler ist still:
     * alles funktioniert, fuer zu viele.
     *
     * `SUITE_ADMIN_GROUP_LAGERBUCH=` (leer) sperrt damit ALLE aus dem
     * Verwaltungszweig aus — die richtige, restriktive Richtung. Dass das eine
     * Fehlkonfiguration ohne Rueckweg ist, faengt die Boot-Pruefung aus Teil 3
     * (§10.5, Pruefung 5) ab, nicht diese Funktion.
     */
    process.env.SUITE_ADMIN_GROUP_LAGERBUCH = "";
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(false);
    expect(istLagerbuchAdmin(viewerAusSession(SUITE_ADMIN))).toBe(false);
  });

  it("SUITE_ADMIN_GROUP_LAGERBUCH schlaegt den Registry-Wert", () => {
    /**
     * Die Mutation, die ohne diesen Fall gruen bliebe: `mod.adminGroups` statt
     * `adminGroupsFor(mod)`. Der direkte Feldzugriff macht die Env-Variable an
     * genau dieser Stelle wirkungslos — dieselbe Falle, die `registry.ts:28-34`
     * fuer prodHosts ausschreibt und die vor dem feedback-Cutover einmal
     * zugeschlagen hat.
     */
    process.env.SUITE_ADMIN_GROUP_LAGERBUCH = "anders-benannte-gruppe";
    expect(istLagerbuchAdmin(viewerAusSession(ADMIN))).toBe(false);
    expect(istLagerbuchAdmin({ sub: "x", groups: ["anders-benannte-gruppe"],
                               name: null, email: null })).toBe(true);
  });

  it("liest requiredGroups NICHT mit", () => {
    /**
     * Die `files`-Verknuepfung (`requireFilesAccess` vereinigt adminGroupsFor mit
     * requiredGroupsFor) ist DORT richtig, weil beide Variablen dieselbe eine
     * Stufe gewaehren. Hier waere sie eine stille ZWEITE TUER ins Journal mit
     * Klarnamen und auf den Etikettenbogen (§2.5, Punkt 3).
     */
    process.env.SUITE_ACCESS_GROUP_LAGERBUCH = "zweite-tuer";
    try {
      expect(istLagerbuchAdmin({ sub: "x", groups: ["zweite-tuer"],
                                 name: null, email: null })).toBe(false);
    } finally {
      delete process.env.SUITE_ACCESS_GROUP_LAGERBUCH;
    }
  });
});

describe("verwaltungsZiel — absolut, sobald ein Prod-Host bekannt ist", () => {
  it("liefert VOR dem Cutover den relativen INNEREN Pfad", () => {
    // Ein geratener absoluter Host waere still fatal: `suiteRedirect` erlaubt ein
    // absolutes Ziel nur, wenn `moduleForHost` den Host kennt — ein unbekannter
    // landet STUMM auf dem Portal. Ein relativer Pfad geht unveraendert durch
    // (`core/auth/redirect.ts:41`).
    expect(verwaltungsZiel()).toBe("/m/lagerbuch/verwaltung");
  });

  it("liefert NACH dem Cutover das absolute AEUSSERE Ziel", () => {
    // Ein relatives Ziel setzte die verwaltende Person auf dem PORTAL-Host ab,
    // weil AUTH_URL suiteweit derselbe Wert ist (`core/auth/redirect.ts:8-18`) —
    // und entwertete den ganzen returnTo-Apparat.
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    expect(verwaltungsZiel()).toBe("https://lagerbuch.iuk-ue.de/verwaltung");
  });

  it("nimmt den ERSTEN Host, wenn mehrere gesetzt sind", () => {
    // §2.6 erlaubt >= 2 Hosts (etwa eine abgeloeste Domain, die mitlaeuft). Der
    // Rueckweg des Logins gehoert auf den kanonischen, also den ersten.
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de,alt.iuk-ue.de";
    expect(verwaltungsZiel()).toBe("https://lagerbuch.iuk-ue.de/verwaltung");
  });
});

describe("requireLagerbuchAdmin — der Backstop", () => {
  it("prueft den HOST vor der Person", async () => {
    /**
     * Die Host-Zeile steht hier ZUSAETZLICH, nicht ersatzweise: die Layouts rufen
     * requireLagerbuchHost ohnehin, aber requireLagerbuchAdmin wird auch aus
     * SERVER ACTIONS gerufen, und die haben kein Layout ueber sich. Der doppelte
     * Aufruf kostet einen Header-Lookup und schliesst dieselbe Luecke, die §2.6
     * fuer die Helfer-Actions ueber requireHelferSitzung schliesst.
     *
     * Fuer die Verwaltung ist das KEIN Autorisierungsgewinn (der Zugriffsriegel
     * ist host-blind und vollstaendig), sondern die Vermeidung einer ZWEITEN
     * funktionierenden Herkunft des Moduls.
     */
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    sitzung = ADMIN;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("laesst ein Mitglied der Admin-Gruppe durch und liefert den Viewer", async () => {
    sitzung = ADMIN;
    const v = await requireLagerbuchAdmin();
    expect(v.sub).toBe("sub-1");
    expect(v.groups).toEqual(["lagerbuch_nutzer"]);
  });

  it("leitet OHNE Sitzung auf /login — mit callbackUrl", async () => {
    sitzung = null;
    await expect(requireLagerbuchAdmin()).rejects
      .toThrow(`NEXT_REDIRECT:/login?callbackUrl=${encodeURIComponent("/m/lagerbuch/verwaltung")}`);
  });

  it("leitet OHNE Sitzung mit gesetztem Prod-Host auf das ABSOLUTE Ziel", async () => {
    process.env.SUITE_HOST_LAGERBUCH = "lagerbuch.iuk-ue.de";
    sitzung = null;
    await expect(requireLagerbuchAdmin()).rejects.toThrow(
      `NEXT_REDIRECT:/login?callbackUrl=${encodeURIComponent("https://lagerbuch.iuk-ue.de/verwaltung")}`,
    );
  });

  it("antwortet dem Suite-Admin ohne Lagerbuch-Gruppe mit 404, nicht 403", async () => {
    // Suite-Standard (§3.3, Entscheidung 10a): was nicht freigegeben ist, sieht
    // genauso aus wie etwas, das es nicht gibt. Der bewusst hingenommene Verlust
    // ist die Benennbarkeit; der Gegenwert ist, dass die EXISTENZ von
    // /verwaltung nicht verraten wird.
    sitzung = SUITE_ADMIN;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("antwortet einem Eingeloggten ohne Gruppe mit 404", async () => {
    sitzung = OHNE_GRUPPE;
    await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("meldet die fehlende Gruppe EINMAL JE PERSON, nicht je Anfrage", async () => {
    /**
     * Der Riegel liegt auf einem 404-Pfad, den ein Bot beliebig oft treffen kann;
     * unbegrenztes Loggen waere ein Flutungsvektor und machte `docker logs` fuer
     * genau den Zweck unbrauchbar, fuer den die Zeile da ist.
     *
     * Sie ersetzt `lagerbuch/src/auth.config.ts:94-99` — den einzigen Ort, an dem
     * heute sichtbar wird, WELCHE Gruppen im Token standen; laut Kommentar dort
     * die Antwort auf die haeufigste Fehlkonfiguration beim Go-live. Ein grep auf
     * `console\.` ueber `src/core/auth/` liefert null Treffer: die Suite
     * antwortet stumm.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sitzung = OHNE_GRUPPE;
      for (let i = 0; i < 5; i++) {
        await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      }
      expect(warn).toHaveBeenCalledTimes(1);
      const text = String(warn.mock.calls[0]?.[0]);
      expect(text).toContain("[lagerbuch]");
      expect(text).toContain("SUITE_ADMIN_GROUP_LAGERBUCH");
      expect(text).toContain("lagerbuch_nutzer");   // die ERWARTETE Gruppe
      expect(text).toContain("irgendwas");         // die VORHANDENEN Gruppen
      // KEINE Kennung, keine E-Mail, kein Name — dieselbe Form wie heute.
      expect(text).not.toContain("sub-2");
      expect(text).not.toContain("Bert");
    } finally {
      warn.mockRestore();
    }
  });

  it("schreibt den users-Satz NACH dem Riegel — und nur fuer den, der durchkommt", async () => {
    // §3.7.2: „nur wer die Pruefung uebersteht, wird zuordenbar". Die Zeile
    // entsteht kuenftig beim ERSTEN AUFRUF DER VERWALTUNG, nicht mehr beim Login
    // (die Suite hat keinen events-Block, Falle 22).
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      sitzung = OHNE_GRUPPE;
      await expect(requireLagerbuchAdmin()).rejects.toThrow("NEXT_NOT_FOUND");
      expect(t.db.select().from(users).all()).toHaveLength(0);

      sitzung = ADMIN;
      await requireLagerbuchAdmin();
      const zeilen = t.db.select().from(users).all();
      expect(zeilen).toHaveLength(1);
      expect(zeilen[0]).toMatchObject({ id: "sub-1", name: "Anna Beispiel",
                                        email: "anna@example.org" });
    } finally {
      warn.mockRestore();
    }
  });
});

describe("adminLandingPfad — 1:1 aus dem Bestand, minus einem Zweig", () => {
  it("faellt ohne Ziel auf /verwaltung", () => {
    expect(adminLandingPfad(null)).toBe("/verwaltung");
    expect(adminLandingPfad(undefined)).toBe("/verwaltung");
    expect(adminLandingPfad("")).toBe("/verwaltung");
  });

  it("behaelt ein Verwaltungsziel", () => {
    expect(adminLandingPfad("/verwaltung")).toBe("/verwaltung");
    expect(adminLandingPfad("/verwaltung/artikel")).toBe("/verwaltung/artikel");
    expect(adminLandingPfad("/verwaltung?tab=x")).toBe("/verwaltung?tab=x");
  });

  it("behaelt ein gescanntes Regaletikett als Ziel", () => {
    // /a/{id} leitet angemeldete Admins selbst in die Verwaltung weiter, ist also
    // schleifenfrei — so bleibt ein gescanntes Etikett als Ziel erhalten.
    expect(adminLandingPfad("/a/art-1")).toBe("/a/art-1");
    expect(adminLandingPfad("/a")).toBe("/a");
  });

  it("SPERRT /helfer — sonst ist es eine Endlosschleife", () => {
    /**
     * `helfer/layout.tsx` ruft `requireHelferSitzung`, das eine verwaltende
     * Person OHNE Helfer-Sitzung sofort wieder aufs Gate schickt (§3.4.4) — mit
     * /helfer als returnTo waere das eine Endlosschleife.
     *
     * ⚠️ Der Kommentar im Bestand begruendet das mit „siehe helferGateDecision".
     * Die Funktion ENTFAELLT (§3.1); der Verweis ist beim Port auf
     * `requireHelferSitzung` umzuhaengen — und zwar im portierten Kommentar,
     * nicht nur in der Spec.
     */
    expect(adminLandingPfad("/helfer")).toBe("/verwaltung");
    expect(adminLandingPfad("/helfer/check?fz=rtw-1")).toBe("/verwaltung");
  });

  it("weist jedes fremde Ziel auf /verwaltung", () => {
    expect(adminLandingPfad("//boese.example/verwaltung")).toBe("/verwaltung");
    expect(adminLandingPfad("https://boese.example")).toBe("/verwaltung");
    expect(adminLandingPfad("/g/abc")).toBe("/verwaltung");
  });

  it("kennt den Zweig /verwaltung/kein-zugriff NICHT mehr", () => {
    /**
     * `lagerbuch/src/lib/auth/cordon.ts:41` faengt ihn ab. Die SEITE faellt
     * ersatzlos weg (§3.3, §11.4): sie lebt von .gate/.gatebrand/.gatesub aus
     * globals.css, die beim antd-Neubau ohnehin fallen, und ihr einziger realer
     * Zugangsweg — `pages.error` — existiert in der Suite nicht.
     *
     * Der Pfad ist danach ein gewoehnliches fremdes Ziel und landet auf
     * /verwaltung. Dieser Fall behauptet nur, dass es KEINEN Sonderzweig mehr
     * gibt — der wuerde sonst als toter Code mitwandern.
     */
    expect(adminLandingPfad("/verwaltung/kein-zugriff")).toBe("/verwaltung/kein-zugriff");
  });
});
```

⚠️ **Der letzte Fall sieht falsch aus und ist richtig.** `/verwaltung/kein-zugriff` **beginnt** mit
`/verwaltung/` und ist damit ein gültiges Verwaltungsziel; ohne den gestrichenen Sonderzweig fällt es
in den `istVerwaltung`-Ast. Das ist genau die Aussage: **der Sonderzweig ist weg**, nicht „der Pfad
ist gesperrt". Die Seite existiert nicht mehr, ihr Aufruf endet also in der Suite-404 — was der
gewünschte Ausgang ist.

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zugang.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./zugang"`.

- [ ] **Schritt 3: `_lib/konto.ts` schreiben — ZUERST, wegen der Importrichtung**

```ts
import { eq } from "drizzle-orm";
import type { DB } from "../_db/client";
import { users } from "../_db/schema";
import type { Viewer } from "./zugang";

/**
 * Bauform 1:1 aus `m/feedback/_db/queries.ts:83` (upsertKnownUser), Semantik 1:1
 * aus `lagerbuch/src/auth.ts:18-27`.
 *
 * ⚠️ `import type { Viewer }` — NICHT als Wert. `zugang.ts` importiert
 * `merkeNutzer` von hier; ein Wert-Import in dieser Richtung erzeugte einen
 * echten Modulzyklus. TypeScript erlaubt ihn, ESM loest ihn zur Laufzeit mit
 * `undefined` auf, und der Fehler waere ein `merkeNutzer is not a function` auf
 * genau EINEM Codepfad: dem ersten Verwaltungsaufruf. `import type` wird beim
 * Uebersetzen GELOESCHT und hinterlaesst keine Kante.
 *
 * `id` ist der `sub` und niemals `user.id` — Auth.js vergibt bei OIDC je Login
 * eine ZUFALLS-UUID (`lagerbuch/src/lib/auth/konto.ts:10-15`). In der Suite kommt
 * der Wert aus `session.user.id`, das `core/auth/config.ts:171-173` auf
 * `token.sub` legt; die Verwechslung ist hier also nicht mehr moeglich. Genau
 * diese Verwechslung hat den Altbestand verseucht: bis `f2b515b` (29.07.2026,
 * fuenf Tage vor dem Freeze) schrieb `src/auth.ts` den Auth.js-`user.id` in
 * `users.id`, und fast jede Zeile des Altbestands ist deshalb auf eine Waise
 * geschluesselt. DAS JOURNAL IST HEIL — dort stand immer der echte `sub`.
 *
 * LAEUFT NACH DEM RIEGEL: nur wer die Pruefung uebersteht, wird zuordenbar
 * (§3.7.2, Muster `requireFeedbackAccess.ts:50-55`). Der Preis, benannt: heute
 * entsteht der Satz beim LOGIN, kuenftig beim ERSTEN AUFRUF DER VERWALTUNG. Wer
 * sich anmeldet und lagerbuch nie oeffnet, hat keinen Satz — das ist richtig so.
 *
 * `core/directory` ersetzt die Tabelle NICHT: es ist ein Verzeichnisdienst gegen
 * Pocket ID und kennt nur, was dort heute gefuehrt wird — niemals die ALTEN
 * Kennungen aus dem historischen Journal. `users` muss auch dann noch Namen
 * liefern, wenn ein Konto laengst geloescht wurde.
 */

/**
 * EINMAL JE PERSON JE PROZESS. `merkeNutzer` laeuft bei JEDER Verwaltungsanfrage;
 * ohne Deduplizierung schriebe eine einzige betroffene Person bei jedem
 * Seitenwechsel eine Zeile ins Containerlog.
 *
 * ⚠️ ANDERS ALS BEI `meldeFehlendeGruppe` (zugang.ts) STEHT DIE KENNUNG HIER IN
 * DER ZEILE. Das ist Absicht (§4.13 (i): „console.warn mit der Kennung"): dort
 * dient der `sub` ausschliesslich als Dedup-Schluessel, hier ist er der einzige
 * Weg, die betroffene Zeile zu finden. Die abgewiesene Person ist eine
 * Zugriffsmeldung, die namenlose Zeile ein Datenbefund.
 */
const namenlosGemeldet = new Set<string>();

function meldeNamenlos(sub: string): void {
  if (namenlosGemeldet.has(sub)) return;
  namenlosGemeldet.add(sub);
  console.warn(
    `[lagerbuch] users-Zeile ohne Namen und ohne E-Mail fuer die Kennung ${sub}. ` +
      `Das Journal zeigt fuer diese Person die ROHE Kennung, waehrend ihre Zeilen von ` +
      `vor dem Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in ` +
      `derselben Liste. Zwei moegliche Ursachen: die Suite-Sitzung fuehrt keine ` +
      `name/email-Claims (dann fehlt der passende OIDC-Scope), oder merkeNutzer laeuft ` +
      `an einer Stelle, an der die Claims noch nicht vorliegen.`,
  );
}

/**
 * Legt die Zeile beim ersten Sehen an und haelt sie danach aktuell.
 *
 * ⚠️ DIE NICHT-UEBERSCHREIBEN-REGEL GILT NUR FUER DAS UPDATE, NICHT FUER DAS
 * INSERT (§4.13 (i)). Ein spaeterer Login ohne Klarnamen darf einen bereits
 * bekannten Namen nicht ueberschreiben — die Bedingung steht heute schon so da
 * (`lagerbuch/src/auth.ts:22-27`). Wer sie auf BEIDES zieht, erzeugt den
 * Defektzustand mit Ansage: das INSERT liesse name und email dann leer, und die
 * frisch angelegte Zeile loeste sofort auf die rohe Kennung auf.
 *
 * EIN FEHLSCHLAG WIRD GELOGGT, NICHT GEWORFEN. Der Zugang funktioniert auch ohne
 * den Satz — nur das Journal zeigt dann rohe IDs
 * (`lagerbuch/src/auth.ts:29-33` begruendet das bereits so). Diese Zeile wird
 * ABSICHTLICH NICHT dedupliziert: sie traegt ein Exception-Objekt, und ein
 * wiederkehrender Datenbankfehler soll jedes Mal sichtbar sein.
 */
export function merkeNutzer(db: DB, viewer: Viewer): void {
  if (!viewer.name && !viewer.email) meldeNamenlos(viewer.sub);
  const jetzt = new Date();
  try {
    db.insert(users)
      .values({ id: viewer.sub, name: viewer.name, email: viewer.email, lastLoginAt: jetzt })
      .onConflictDoUpdate({
        target: users.id,
        // Nur setzen, was die Sitzung wirklich mitbringt. `undefined` heisst in
        // Drizzle „Spalte nicht anfassen"; ein `null` hier machte aus jedem
        // Login ohne Claims einen Namensverlust.
        set: {
          ...(viewer.name ? { name: viewer.name } : {}),
          ...(viewer.email ? { email: viewer.email } : {}),
          lastLoginAt: jetzt,
        },
      })
      .run();
  } catch (e) {
    console.warn(
      "[lagerbuch] users-Upsert fehlgeschlagen — das Journal zeigt fuer diese Person rohe IDs:",
      e,
    );
  }
}

/** Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren. */
export function _resetNamenlosGemeldet(): void {
  namenlosGemeldet.clear();
}
```

⚠️ **`eq` wird importiert, aber nicht benutzt — das ist ein Lint-Fehler.** Der `onConflictDoUpdate`-Weg
braucht ihn nicht. Die Zeile `import { eq } from "drizzle-orm";` **entfällt**; sie steht hier nur,
damit der Umsetzer den Reflex bemerkt, statt ihn zu wiederholen. `pnpm lint` meldet sie sofort.

- [ ] **Schritt 4: `_lib/zugang.ts` schreiben**

```ts
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/core/auth";
import { adminGroupsFor } from "@/core/groups";
import { getModule, prodHostsFor } from "@/core/registry";
import { getDb } from "../_db/client";
import { requireLagerbuchHost } from "./host";
import { merkeNutzer } from "./konto";
import { sanitizeReturnTo } from "./returnTo";

/**
 * DER ZUGANG ZUR VERWALTUNG — EINE Stufe, ohne Suite-Admin und ohne zweite
 * Gruppenquelle. KEIN "use client" (Falle 6).
 *
 * ZWEI FORMEN, EINE REGEL (§3.2.1): der werfende Riegel `requireLagerbuchAdmin`
 * gehoert in Layouts und Verwaltungs-Actions; das nicht-werfende Paar
 * `viewerOderNull` + `istLagerbuchAdmin` gehoert in die beiden Rollen-Weichen
 * (`a/[artikelId]/page.tsx`, `g/[code]/page.tsx`) und aufs Gate — dort ist
 * „keine Sitzung" ein DRITTER gueltiger Fall, kein Fehlerfall.
 *
 * ⚠️ DIE GRENZE GEHOERT ZUR REGEL: „Praedikat in Weichen" gilt NICHT fuer
 * `_actions/`. Eine Action hat keine Weiche — sie hat einen Aufrufer, der schon
 * entschieden hat. Der Guard-Scan (`_actions/guards.test.ts`) haelt das fest.
 */

export type Viewer = { sub: string; groups: string[]; name: string | null; email: string | null };

/**
 * Sitzung → Viewer, OHNE Wurf.
 *
 * BEWUSST NICHT aus `m/files/_lib/access.ts:107-113` kopiert: dort hat `Viewer`
 * ZWEI Felder (`sub`, `groups`), hier VIER. `merkeNutzer(db, viewer)` (§4.13)
 * schreibt `name` und `email` in `users`; eine zweifeldrige Kopie truege still
 * `null` in beide Spalten und erzeugte damit den benannten Defektzustand aus
 * §4.13 — eine ROHE `sub`-Kennung im Journal statt eines Namens. Die Werte liegen
 * an: `core/auth/config.ts:163-176` laesst `session.user.name/email` unangetastet
 * und setzt nur `groups`, `isAdmin` und `id`.
 *
 * Ohne `user.id` gibt es keinen Viewer; ein fehlender `groups`-Claim ist die
 * leere Menge und laeuft damit in den 404 des Riegels, nicht in einen 500 —
 * sonst haenge die Fehlerform an der Token-Version.
 */
export function viewerAusSession(
  session: {
    user?: { id?: string; groups?: string[]; name?: string | null; email?: string | null };
  } | null,
): Viewer | null {
  const id = session?.user?.id;
  if (!id) return null;
  return {
    sub: id,
    groups: session.user?.groups ?? [],
    name: session.user?.name ?? null,
    email: session.user?.email ?? null,
  };
}

/**
 * DIE NICHT-WERFENDE FORM — fuer die beiden Rollen-Weichen und fuer das Gate
 * (§2.1 c, §3.2.1, §7.2.4).
 *
 * Diese drei Dateien haben je DREI gueltige Faelle, und der dritte ist immer
 * „keine Sitzung". `requireLagerbuchAdmin()` an ihrer Weiche schickte jeden
 * anonymen Scan eines Regaletiketts nach `/login` statt aufs Gate mit `returnTo`
 * — genau der Ausfall, den `requiresAuth: false` (§2.3) verhindern soll, und er
 * waere typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar.
 *
 * ⚠️ SIE RUFT `requireLagerbuchHost` ABSICHTLICH NICHT. `requireLagerbuchAdmin`
 * tut es, und wer es hier aus Analogie nachtraegt, verwandelt das Praedikat
 * zurueck in einen Wurf. Der Host-Riegel steht in allen drei aufrufenden Dateien
 * ohnehin als ERSTE Anweisung, vor dieser Funktion (§2.6).
 */
export async function viewerOderNull(): Promise<Viewer | null> {
  return viewerAusSession(await auth());
}

/**
 * BEWUSST NICHT `isModuleAdmin` aus `core/groups` — dieselbe Entscheidung wie in
 * `feedback` (`_lib/access.ts:9-30`), hier aus einem eigenen Anlass: hinter
 * `/verwaltung` liegen das Journal mit KLARNAMEN und der Etikettenbogen mit den
 * Token-Codes IM KLARTEXT — dem Secret selbst. Betrieb und Einsicht sind zwei
 * Rollen; wer den Server betreibt, hat damit noch keinen Anlass, die Bewegungen
 * einer Bereitschaft zu lesen oder Zugangscodes zu drucken. Wer lagerbuch
 * verwalten soll, gehoert in das, was SUITE_ADMIN_GROUP_LAGERBUCH benennt —
 * auch der Betreiber selbst (Betreiber-Entscheidung 3).
 *
 * ES GIBT NUR DIESE EINE STUFE. Kein zweites Praedikat, keine
 * Zugehoerigkeitspruefung zwischen Verwaltenden; `tokens.created_by` und
 * `journal.quelle_id` sind Nachweis und Anzeige, nie Berechtigung. Wer hier einen
 * `assertGroupAccess`-Zwilling wie in `feedback` sucht: es gibt ihn nicht, und
 * das ist Absicht.
 *
 * `adminGroupsFor(mod)`, NIE `mod.adminGroups` — der direkte Feldzugriff macht
 * SUITE_ADMIN_GROUP_LAGERBUCH an genau dieser Stelle wirkungslos
 * (`registry.ts:28-34` schreibt dieselbe Falle fuer prodHosts aus).
 *
 * `some()`, NICHT die `canAccess`-Verknuepfung: eine LEERE Liste gewaehrt NICHTS.
 * `canAccess` (`registry.ts:157-159`) steigt bei leerer Liste mit `true` aus —
 * `core/groups.ts:53-54` nennt das woertlich „eine OEFFNUNG". Wer das abschreibt,
 * oeffnet die Verwaltung fuer JEDEN Eingeloggten, und der Fehler ist still.
 *
 * UND BEWUSST NICHT DIE `files`-VERKNUEPFUNG: `requiredGroupsFor` wird NICHT
 * mitgelesen (§2.5, Punkt 3) — das waere eine stille zweite Tuer.
 *
 * `session.user.isAdmin` kommt in diesem Modul NIRGENDS vor. Ein 1:1-Port von
 * `lagerbuch/src/lib/auth/cordon.ts:14-20` waere typkorrekt, liefe durch
 * `pnpm build` und oeffnete die gesamte Verwaltung fuer jeden Suite-Betreiber
 * (Falle 13). `_lib/bauform.test.ts` haelt das mit einer Quelltext-Zusicherung
 * fest.
 */
export function istLagerbuchAdmin(viewer: Viewer | null): boolean {
  if (!viewer) return false;
  const erlaubt = adminGroupsFor(getModule("lagerbuch"));
  return viewer.groups.some((g) => erlaubt.includes(g));
}

/**
 * EINMAL JE PERSON JE PROZESS, nicht je Anfrage. Der Riegel liegt auf einem
 * 404-Pfad, den ein Bot beliebig oft treffen kann; unbegrenztes Loggen waere ein
 * Flutungsvektor und machte `docker logs` fuer genau den Zweck unbrauchbar, fuer
 * den die Zeile da ist. Der Satz ersetzt `lagerbuch/src/auth.config.ts:94-99` —
 * den einzigen Ort, an dem heute sichtbar wird, WELCHE Gruppen im Token standen;
 * ein grep auf `console\.` ueber `src/core/auth/` liefert null Treffer, die Suite
 * antwortet stumm.
 *
 * KEINE Kennung, keine E-Mail, kein Name in der Zeile — dieselbe Form wie heute
 * (`auth.config.ts:95-99` protokolliert Gruppen und Claim-Schluessel, keine
 * Person). Der `sub` dient hier AUSSCHLIESSLICH als Dedup-Schluessel im Speicher.
 *
 * ⚠️ ANNAHME: der prozess-lokale Set waechst mit der Zahl abgewiesener Personen,
 * nicht mit der Zahl der Anfragen; bei einer Organisation dieser Groesse ist das
 * eine dreistellige Obergrenze und braucht keine Verdraengung.
 */
const bereitsGemeldet = new Set<string>();

function meldeFehlendeGruppe(sub: string, gruppen: string[]): void {
  if (bereitsGemeldet.has(sub)) return;
  bereitsGemeldet.add(sub);
  console.warn(
    `[lagerbuch] Zugriff auf /verwaltung abgelehnt: keine der Gruppen ` +
      `${JSON.stringify(adminGroupsFor(getModule("lagerbuch")))} in den Token-Gruppen ` +
      `${JSON.stringify(gruppen)}. Pruefe SUITE_ADMIN_GROUP_LAGERBUCH und ob Pocket ID ` +
      `einen "groups"-Claim mit dieser Gruppe ausliefert.`,
  );
}

/** Nur fuer Tests: den prozess-lokalen Dedup-Speicher leeren. */
export function _resetGemeldeteGruppen(): void {
  bereitsGemeldet.clear();
}

/**
 * Wohin der Login zurueckkehrt.
 *
 * DAS ZIEL MUSS ABSOLUT UND AUF EINEN DER SUITE BEKANNTEN HOST ZEIGEN. Ein
 * relatives `/m/lagerbuch/verwaltung` (feedbacks Weg,
 * `requireFeedbackAccess.ts:35`) ist bei EINEM Host richtig — hier setzte es die
 * verwaltende Person auf dem PORTAL-Host ab, weil `AUTH_URL` suiteweit derselbe
 * Wert ist (`core/auth/redirect.ts:8-18`), und entwertete den ganzen
 * returnTo-Apparat. `suiteRedirect` prueft das Ziel gegen die Allowlist aus
 * `moduleForHost` (`redirect.ts:52-54`), ein fremder Host landet also nicht.
 *
 * VOR DEM CUTOVER ist der relative Pfad der einzige sichere Wert: ohne
 * SUITE_HOST_LAGERBUCH gibt es keinen absoluten Host, und ein erratener waere
 * schlimmer als keiner — `m/files/_lib/access.ts:115-138` geht denselben Weg und
 * begruendet ihn: ein unbekannter oder protokollfremder Host landet bei
 * `suiteRedirect` STUMM auf dem Portal, ein relativer Pfad geht unveraendert
 * durch (`core/auth/redirect.ts:41`).
 *
 * EXPORTIERT (Festlegung G5), obwohl ausser dem Test niemand sie ruft: nur so
 * ist der Zweig „absolut vs. relativ" pruefbar, ohne einen `redirect()`-Wurf zu
 * zerlegen — und §3.8.1 verlangt genau diese Aussage.
 */
export function verwaltungsZiel(): string {
  const host = prodHostsFor(getModule("lagerbuch"))[0];
  return host ? `https://${host}/verwaltung` : "/m/lagerbuch/verwaltung";
}

/**
 * DER AUTH-BACKSTOP DES MODULS — eine Stelle, zwei Aufrufergruppen: die beiden
 * Verwaltungs-Layouts und JEDE Verwaltungs-Action.
 *
 * ⚠️ DIE HOST-ZEILE STEHT HIER ZUSAETZLICH, NICHT ERSATZWEISE. Die Layouts rufen
 * `requireLagerbuchHost` ohnehin (§2.6), aber diese Funktion wird auch aus SERVER
 * ACTIONS gerufen, und die haben kein Layout ueber sich. Der doppelte Aufruf
 * kostet einen Header-Lookup und schliesst dieselbe Luecke, die §2.6 fuer die
 * Helfer-Actions ueber `requireHelferSitzung` schliesst. FUER DIE VERWALTUNG IST
 * DAS KEIN AUTORISIERUNGSGEWINN (der Zugriffsriegel ist host-blind und
 * vollstaendig), sondern die Vermeidung einer zweiten funktionierenden Herkunft.
 *
 * `notFound()` STATT 403 (§3.3): was nicht freigegeben ist, sieht in dieser Suite
 * genauso aus wie etwas, das es nicht gibt (`not-found.tsx:41-46`). Der bewusst
 * hingenommene Verlust ist die Benennbarkeit; der Gegenwert ist, dass die
 * EXISTENZ von /verwaltung nicht verraten wird — bei einem Journal mit Klarnamen
 * und einem Druckbogen mit Token-Codes im Klartext ist das mehr wert.
 * `/verwaltung/kein-zugriff` gibt es nicht mehr (§11.4).
 *
 * ⚠️ FRISCHE: BIS ZU EINE STUNDE VERZUG. Gruppen im JWT sind nur so frisch wie
 * der letzte erfolgreiche Token-Refresh; der Takt ist die
 * Access-Token-Lebensdauer von Pocket ID, nicht die Sitzungsdauer von 30 Tagen.
 * Der Verzug wird HINGENOMMEN: die Alternative braeuchte eine
 * Objekt-Zugehoerigkeit, an der man sie aufloesen koennte, und lagerbuch hat
 * keine — es gibt EINE Rolle und keine Zuordnung von Verwaltenden zu Fahrzeugen.
 * Eine modul-eigene Sperrliste waere eine zweite Rechtequelle, die niemand
 * pflegt. Der Zustand ist ueberdies deutlich BESSER als heute: der Bestand setzt
 * `token.isAdmin` nur beim Erst-Login und definiert keine `session.maxAge` — ein
 * Gruppenentzug wirkt dort bis zu 30 Tage lang GAR NICHT.
 *
 * DER SOFORT-WIDERRUF EXISTIERT DORT, WO ER GEBRAUCHT WIRD: fuer Helfer-Zugaenge
 * ueber `tokens.aktiv`, lesend wie schreibend (§3.4.4). Das ist der Pfad mit den
 * laminierten, verlierbaren Kaertchen.
 */
export async function requireLagerbuchAdmin(): Promise<Viewer> {
  requireLagerbuchHost(await headers());          // §2.6 — erst der Host, dann die Person
  const viewer = viewerAusSession(await auth());
  if (!viewer) redirect(`/login?callbackUrl=${encodeURIComponent(verwaltungsZiel())}`);
  if (!istLagerbuchAdmin(viewer)) {
    meldeFehlendeGruppe(viewer.sub, viewer.groups);
    notFound();
  }
  merkeNutzer(getDb(), viewer);                   // §4.13 — NACH dem Riegel
  return viewer;
}

/**
 * Landeziel eines bereits angemeldeten Admins, der auf dem Gate steht. Das Gate
 * ist fuer Helfer:innen ohne Konto da; ein Admin gehoert in die Verwaltung.
 *
 * 1:1 aus `lagerbuch/src/lib/auth/cordon.ts:38-48` — MINUS EINEM ZWEIG:
 * `ziel.startsWith("/verwaltung/kein-zugriff")` faellt mit der Seite weg
 * (§3.3, §11.4).
 *
 * Auf `returnTo` allein ist kein Verlass: Auth.js merkt sich die callbackUrl in
 * einem reinen Session-Cookie (`authjs.callback-url`, ohne maxAge). Ueberlebt das
 * den Umweg ueber Pocket ID nicht — auf Mobilgeraeten/PWA der Regelfall, weil der
 * IdP-Schritt in einem eigenen Browser-Kontext laeuft —, faellt Auth.js auf
 * `url.origin` zurueck und der frisch angemeldete Admin steht wieder am Gate.
 * Diese Weiche faengt das COOKIE-UNABHAENGIG ab.
 *
 * Das Ziel wird gegen eine Allowlist geprueft: /helfer ist fuer Admins ohne
 * Helfer-Sitzung gesperrt und wuerde direkt zurueck aufs Gate werfen — eine
 * Endlosschleife. ⚠️ Der Bestandskommentar verweist dafuer auf
 * `helferGateDecision`; die Funktion ENTFAELLT (§3.1). Der Verweis lautet ab
 * jetzt `requireHelferSitzung` (`_lib/helferZugang.ts`, §3.4.4) — die Sache
 * bleibt unveraendert wahr: `helfer/layout.tsx` ruft sie, und sie schickt eine
 * verwaltende Person ohne Helfer-Sitzung sofort wieder aufs Gate.
 *
 * GENAU EIN AUFRUFER: die Gate-Seite `page.tsx` (§7.2.4, Teil 4). Das ist keine
 * Nebensache, sondern die Bedingung, unter der die Zusage ueberhaupt eintritt —
 * im Bestand steht der Aufruf in `src/app/(gate)/page.tsx:16-17`, und ohne ihn
 * wanderte eine Funktion mit, die niemand ruft.
 *
 * ⚠️ DIE WEICHE DORT TRAEGT EIN PRAEDIKAT, KEINEN RIEGEL: im Bestand fragt sie
 * `session?.user?.isAdmin`, in der Suite lautet sie
 * `istLagerbuchAdmin(await viewerOderNull())` — NICHT `requireLagerbuchAdmin()`.
 * Das Gate ist die Seite, auf der „keine Sitzung" der REGELFALL ist; ein
 * werfender Riegel schickte jede Helferin nach /login, bevor sie das Zahlenfeld
 * je saehe.
 */
export function adminLandingPfad(returnTo: string | null | undefined): string {
  const ziel = sanitizeReturnTo(returnTo);
  if (!ziel) return "/verwaltung";
  const istVerwaltung =
    ziel === "/verwaltung" || ziel.startsWith("/verwaltung/") || ziel.startsWith("/verwaltung?");
  // /a/{id} leitet angemeldete Admins selbst in die Verwaltung weiter, ist also
  // schleifenfrei — so bleibt ein gescanntes Regaletikett als Ziel erhalten.
  const istArtikelDeepLink = ziel === "/a" || ziel.startsWith("/a/");
  return istVerwaltung || istArtikelDeepLink ? ziel : "/verwaltung";
}
```

⚠️ **`_resetGemeldeteGruppen` und `_resetNamenlosGemeldet` sind Testhaken, und sie tragen den
Unterstrich aus demselben Grund wie `_resetRateLimit` im Bestand
(`lagerbuch/src/lib/auth/rateLimit.ts:39`).** Der Test in Schritt 1 braucht sie nicht — er benutzt je
Fall einen **anderen** `sub` bzw. prüft die Deduplizierung ausdrücklich. Sie stehen für Teil 4 und
Teil 6 bereit, deren Testdateien dieselben Kennungen mehrfach verwenden werden.

- [ ] **Schritt 5: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/zugang.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 6: `_db/quelle.test.ts` um die `merkeNutzer`-Gegenprobe ERWEITERN**

⚠️ **Es entsteht KEINE zweite Datei** (Teil 1, Festlegung F5; §4.16, Punkt 4). An das Ende von
`src/app/m/lagerbuch/_db/quelle.test.ts` wird angefügt, und der Import-Block bekommt **eine neue
Zeile und eine Ergänzung**:

```ts
// NEU:
import { merkeNutzer, _resetNamenlosGemeldet } from "../_lib/konto";
```

⚠️ **`vi` wird in die BESTEHENDE `vitest`-Importzeile ergänzt, nicht als zweiter Import geschrieben.**
Die Datei aus Teil 1 beginnt mit
`import { describe, it, expect, beforeEach, afterEach } from "vitest";` — daraus wird

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
```

Eine zweite `from "vitest"`-Zeile meldet `pnpm lint` **im selben Task** (`no-duplicate-imports`), und
der Task bliebe an seinem eigenen Gate hängen.

```ts
describe("merkeNutzer — die Gegenprobe zum Defektzustand (§4.13 i)", () => {
  it("schreibt beim INSERT die mitgelieferten Werte", () => {
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                        email: "anna@example.org" });
    const z = t.db.select().from(users).all();
    expect(z).toHaveLength(1);
    expect(z[0]).toMatchObject({ id: NEU_SUB, name: "Anna Beispiel",
                                 email: "anna@example.org" });
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("ueberschreibt beim UPDATE einen bekannten Namen NICHT mit null", () => {
    /**
     * DIE REGEL GILT NUR FUER DAS UPDATE (§4.13 i). Ein spaeterer Login ohne
     * Klarnamen darf einen bereits bekannten Namen nicht ueberschreiben — die
     * Bedingung steht heute schon so da (`lagerbuch/src/auth.ts:22-27`).
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `set: { name, email, ... }`
     * unbedingt. Sie sieht sauberer aus und macht aus jedem Aufruf ohne
     * name/email-Claims einen NAMENSVERLUST — und zwar fuer jemanden, der vorher
     * einen Namen hatte. Im Journal steht danach die rohe Kennung.
     */
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel",
                        email: "anna@example.org" });
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
    const z = t.db.select().from(users).all();
    expect(z).toHaveLength(1);                       // KEIN zweiter Satz
    expect(z[0]?.name).toBe("Anna Beispiel");
    expect(z[0]?.email).toBe("anna@example.org");
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("aktualisiert einen NEUEN Namen sehr wohl", () => {
    // Die Regel heisst „nicht mit null ueberschreiben", nicht „nie aendern".
    // Eine Heirat, eine korrigierte Schreibweise: der neue Wert gewinnt.
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Beispiel", email: null });
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "Anna Muster", email: "a@example.org" });
    const z = t.db.select().from(users).all();
    expect(z[0]).toMatchObject({ name: "Anna Muster", email: "a@example.org" });
  });

  it("BEIM INSERT gilt die Regel NICHT — und das ist der Defektzustand mit Ansage", () => {
    /**
     * Wer die Nicht-Ueberschreiben-Bedingung auf BEIDES zieht, erzeugt den
     * Defektzustand aus §4.13 (i): die frisch angelegte Zeile bliebe leer und
     * loeste sofort auf die ROHE Kennung auf.
     *
     * Dieser Fall behauptet den Ist-Zustand, nicht den Wunsch: eine Sitzung ohne
     * name/email schreibt eine Zeile mit null/null. Der Test verhindert das
     * nicht — er macht es BENANNT und auffindbar, statt es als „unerklaerliche
     * UUID im Journal" wiederzuentdecken.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
      const z = t.db.select().from(users).all();
      expect(z).toHaveLength(1);
      expect(z[0]?.name).toBeNull();
      expect(z[0]?.email).toBeNull();
      expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe(NEU_SUB);   // die ROHE Kennung
    } finally {
      warn.mockRestore();
    }
  });

  it("MELDET den Defektzustand sichtbar — mit der Kennung, und nur einmal je Person", () => {
    /**
     * „Sichtbar loggen statt still schlucken" (`lagerbuch/src/auth.ts:29-33`).
     * Zwei moegliche Ursachen, beide sofort zu melden: die Suite-Sitzung fuehrt
     * keine name/email-Claims, oder merkeNutzer laeuft an einer Stelle, an der
     * die Claims noch nicht vorliegen.
     *
     * ⚠️ ANDERS ALS BEI meldeFehlendeGruppe STEHT DIE KENNUNG IN DER ZEILE: dort
     * ist der sub nur Dedup-Schluessel, hier ist er der einzige Weg zur
     * betroffenen Zeile.
     *
     * Dedupliziert, weil merkeNutzer bei JEDER Verwaltungsanfrage laeuft — ohne
     * das schriebe eine einzige betroffene Person bei jedem Seitenwechsel eine
     * Zeile.
     */
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      _resetNamenlosGemeldet();
      for (let i = 0; i < 4; i++) {
        merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: null, email: null });
      }
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).toContain(NEU_SUB);
      expect(String(warn.mock.calls[0]?.[0])).toContain("[lagerbuch]");
    } finally {
      warn.mockRestore();
    }
  });

  it("schreibt lastLoginAt in SEKUNDEN, nicht in Millisekunden", () => {
    // Die 1000er-Falle. `mode: "timestamp"` rechnet in beide Richtungen dieselbe
    // Umrechnung — nur ein Blick auf den ROHEN Spaltenwert sieht den Unterschied
    // (§4.16, Punkt 1). Zehnstellig, nicht dreizehnstellig.
    merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "A", email: null });
    const roh = t.sqlite.prepare("select last_login_at from users where id = ?")
      .get(NEU_SUB) as { last_login_at: number };
    expect(String(roh.last_login_at)).toHaveLength(10);
  });

  it("wirft NICHT, wenn der Upsert scheitert — der Zugang funktioniert auch ohne Satz", () => {
    // `lagerbuch/src/auth.ts:29-33` begruendet das bereits so. Ein Wurf hier
    // machte aus einem Datenbankproblem einen Ausfall der ganzen Verwaltung.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      t.sqlite.exec("drop table users");
      expect(() => merkeNutzer(t.db, { sub: NEU_SUB, groups: [], name: "A", email: null }))
        .not.toThrow();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
```

- [ ] **Schritt 7: Die erweiterte Datei laufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_db/quelle.test.ts
```

Erwartet: die sieben Bestandsfälle aus T13 **plus** die sieben neuen, alle grün. **Läuft der
Bestandsteil rot, ist die Erweiterung falsch angefügt** — sie ergänzt, sie ersetzt nichts.

- [ ] **Schritt 8: Die UPDATE-Regel rot sehen**

```bash
cp src/app/m/lagerbuch/_lib/konto.ts /tmp/konto.ts
perl -0pi -e 's/\.\.\.\(viewer\.name \? \{ name: viewer\.name \} : \{\}\),\n          \.\.\.\(viewer\.email \? \{ email: viewer\.email \} : \{\}\),/name: viewer.name,\n          email: viewer.email,/s' \
  src/app/m/lagerbuch/_lib/konto.ts
pnpm vitest run src/app/m/lagerbuch/_db/quelle.test.ts
```

Erwartet: **FAIL** in „ueberschreibt beim UPDATE einen bekannten Namen NICHT mit null". **Das ist der
Nachweis, dass die drei Auslassungspunkt-Zeilen tragen** — sie sehen wie eine Umständlichkeit aus,
und genau deshalb verschwinden sie beim nächsten Aufräumen, wenn kein Test sie hält.

```bash
cp /tmp/konto.ts src/app/m/lagerbuch/_lib/konto.ts && rm /tmp/konto.ts
pnpm vitest run src/app/m/lagerbuch/_db/quelle.test.ts
```

Erwartet: wieder grün.

- [ ] **Schritt 9: Den Modulzyklus rot sehen**

```bash
cp src/app/m/lagerbuch/_lib/konto.ts /tmp/konto.ts
sed -i.bak 's|^import type { Viewer } from "./zugang";|import { type Viewer, istLagerbuchAdmin } from "./zugang";\nvoid istLagerbuchAdmin;|' \
  src/app/m/lagerbuch/_lib/konto.ts
pnpm vitest run src/app/m/lagerbuch/_lib/zugang.test.ts
```

Erwartet: ein Lauf, der **nicht** sauber grün ist — je nach Auflösungsreihenfolge entweder ein
`merkeNutzer is not a function` oder ein `Cannot access 'istLagerbuchAdmin' before initialization`.
**Der Punkt ist nicht die genaue Meldung, sondern dass `import type` keine Geschmacksfrage ist.**

```bash
cp /tmp/konto.ts src/app/m/lagerbuch/_lib/konto.ts
rm -f /tmp/konto.ts src/app/m/lagerbuch/_lib/konto.ts.bak
pnpm vitest run src/app/m/lagerbuch/_lib/zugang.test.ts
```

Erwartet: wieder grün.

- [ ] **Schritt 10: Die Bauform-Scans mitlaufen lassen**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts
```

Erwartet: **grün**. Ab diesem Commit haben die beiden Scans „kein `isAdmin`" und „keine
Suite-Admin-Abkürzung" ein echtes Subjekt — vorher liefen sie über einen Baum, in dem es nichts zu
finden gab.

- [ ] **Schritt 11: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/zugang.ts src/app/m/lagerbuch/_lib/zugang.test.ts \
        src/app/m/lagerbuch/_lib/konto.ts src/app/m/lagerbuch/_db/quelle.test.ts
git commit -m "feat(lagerbuch): _lib/zugang.ts und _lib/konto.ts — eine Stufe, ohne Abkuerzung

Lagerbuch-Admin ist ausschliesslich, wer in SUITE_ADMIN_GROUP_LAGERBUCH steht
(Betreiber-Entscheidung 3). isModuleAdmin wird NICHT benutzt — damit wird der
Suite-Admin-Kurzschluss fuer dieses Modul nie erreicht, und core bleibt
unangetastet (§3.6.2).

Drei tragende Eigenschaften, jede gegen die naheliegende falsche Vorlage:
adminGroupsFor(mod) statt mod.adminGroups (sonst ist die Env-Variable an genau
dieser Stelle wirkungslos); some() statt der canAccess-Verknuepfung (eine LEERE
Liste gewaehrt NICHTS — canAccess steigt dort mit true aus, core/groups nennt es
woertlich eine OEFFNUNG); kein requiredGroupsFor daneben (das waere eine stille
zweite Tuer ins Journal mit Klarnamen).

ZWEI FORMEN, EINE REGEL: requireLagerbuchAdmin wirft und gehoert in Layouts und
Actions; viewerOderNull + istLagerbuchAdmin sind Praedikate und gehoeren in die
beiden Rollen-Weichen und aufs Gate, wo 'keine Sitzung' ein dritter gueltiger
Fall ist. viewerOderNull ruft requireLagerbuchHost ABSICHTLICH nicht.

Der Host-Riegel steht in requireLagerbuchAdmin zusaetzlich, nicht ersatzweise:
Server Actions haben kein Layout ueber sich.

404 statt 403 (Suite-Standard); /verwaltung/kein-zugriff faellt ersatzlos, und
adminLandingPfad verliert genau diesen einen Zweig. Der Allowlist-Kommentar
verweist ab jetzt auf requireHelferSitzung statt auf das entfallene
helferGateDecision.

merkeNutzer laeuft HINTER dem Riegel (feedback-Muster) — die Suite hat keinen
events-Block. import type { Viewer }, nicht als Wert: ein Wert-Import erzeugte
einen Modulzyklus, dessen Fehler ein 'merkeNutzer is not a function' auf genau
einem Codepfad waere. Rot gesehen.

Die Nicht-Ueberschreiben-Regel gilt NUR fuers UPDATE — beim INSERT nicht, sonst
entstuende der Defektzustand mit Ansage. Rot gesehen. Die Gegenprobe ERWEITERT
_db/quelle.test.ts (Festlegung F5), es entsteht keine zweite Datei.

Drei console.warn-Stellen, zwei davon dedupliziert je Person je Prozess: die
fehlende Gruppe (ohne Kennung — der 404-Pfad ist ein Flutungsvektor) und der
name/email-null-Befund (MIT Kennung, §4.13). Der Upsert-Fehlschlag wird
absichtlich nicht dedupliziert."
```

---

### Task 24: `_lib/gateSchranke.ts` — drei Zähler, und sie zählen nur Fehlversuche

**Files:**
- Create: `src/app/m/lagerbuch/_lib/gateSchranke.ts`
- Test: `src/app/m/lagerbuch/_lib/gateSchranke.test.ts`

**Interfaces:**
- Consumes: `_lib/grenzen.ts` (T15) — `grenzen()`. Aus `core`: `RateLimiter` (`@/core/ratelimit`).
- Produces:
  ```ts
  export function gateGesperrt(absender: string): number | null;   // Restsekunden, nie 0
  export function gateFehlversuchBuchen(absender: string): void;
  ```
  **Das sind die einzigen zwei Exporte der Datei.** Konsumenten: `t/[code]/route.ts`,
  `_actions/gate.ts` (`einloesenAmGate`), `_actions/sitzung.ts` (`erneuereSitzung`) und die
  Gate-Seite `page.tsx` — **alle vier in Teil 4** (§7.2.3, §7.2.4, §7.4.4).

⚠️ **Die drei `RateLimiter` und die `Map` bleiben modul-intern.** Ein vierter Aufrufer, der selbst
buchen will, ist damit **konstruktiv** ausgeschlossen — nicht durch eine Konvention.

**Die Reihenfolge ist der halbe Entwurf, und beide Hälften tragen einander:**

```
1. Host-Riegel                                    (§2.6)
2. gesperrt?  → ja: benannter Fehler, OHNE Datenbankzugriff
3. Code normalisieren                             (§7.5.3 → _lib/code.ts, T17)
4. redeemToken(normalisierterCode, getDb())       (Teil 4)
5. Erfolg → Cookie setzen, umleiten.  KEIN Budgetverbrauch.
6. Misserfolg → proAbsender && gateMinute && gateStunde buchen;
   erschoepft → Sperrzeit merken (= Fensterlaenge) und benannten Fehler zurueckgeben
```

**Warum der Verbrauch HINTER die Codeprüfung wandert — der operative Grund zuerst.** Heute läuft
`consumeRate` **vor** jeder Codeprüfung (`lagerbuch/src/app/(gate)/actions.ts:19`,
`src/app/t/[code]/route.ts:25`). Eine Bereitschaft hinter einem gemeinsamen Uplink — ein Anschluss
oder Mobilfunk hinter CGNAT — verbraucht ihre fünf Versuche pro Minute mit **erfolgreichen** Scans.
Genau dieser Fehler ist in dieser Suite **bereits einmal produktiv eingetreten**: `feedback` hat mit
einem IP-Limiter von 10/min „den Kernfall getötet" (15 Ehrenamtliche aus einem Vereins-WLAN,
`m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus), und `files` hat daraus
genau die hier vorgeschriebene Bauform abgeleitet: „Deshalb liegt dieser Zähler HINTER der
Token-Auflösung: er wird nur angefasst, wenn kein gültiges Token vorlag" (`:147-149`).

**Und erst dadurch ist der globale Deckel überhaupt vertretbar.** Würden Erfolge mitzählen, wäre ein
modulweites Limit ein **Ausfall der Ausgabe**. So ist der Sprengradius scharf umrissen: **ein
richtiger Code funktioniert immer**, auch während eines Angriffs; wer sich vertippt, wird
vertröstet. Die beiden Hälften — „nur Fehlversuche" und „modulweiter Deckel" — sind deshalb **nicht
zwei Maßnahmen, sondern eine**.

**Warum Schritt 2 nicht entfallen darf — und warum er zugleich den DB-Zugriff schützt.**
`RateLimiter.check()` prüft und **bucht in einem Zug** (`core/ratelimit.ts:26-37`); ein reines
Nachsehen gibt es dort nicht. Würde erst nach der Codeprüfung gebucht und dabei nur die *Meldung*
umgeschaltet, liefe die Codeprüfung selbst **unbegrenzt** weiter — der Deckel änderte dann die
Fehlermeldung und nicht den Angriff. Deshalb merkt sich diese Datei jedes `false` **selbst**, und
Schritt 2 liest nur noch diese Zahl.

⚠️ **Genau hier liegt die Antwort auf den naheliegenden Einwand, der Absender-Eimer müsse vor die
Codeprüfung.** Er tut das nicht: ein Angreifer, der den Absenderschlüssel rotiert, startet jeden
Versuch mit **leerem** Absender-Eimer und bekäme so oder so genau **einen** Lookup. Was den Lookup
deckelt, sind ausschließlich `gateMinute` und `gateStunde` — und sie tun es über Schritt 2, **vor**
jedem Datenbankzugriff. Der Absender-Eimer verliert durch die Verschiebung also nichts, was er je
geleistet hätte, und gewinnt den `feedback`-Fall zurück.

**Was das gegen einen Coderaum von 10⁶ wert ist** (`lagerbuch/src/actions/tokens.ts:10,15`: sechs
Ziffern, `NNN-NNN`). Bei K gleichzeitig aktiven Codes liegt die erwartete Zahl der Versuche bis zum
ersten Treffer bei rund 10⁶/K:

| aktive Codes K | erwartete Versuche | bei 300 Fehlversuchen/h |
|---|---|---|
| 10 | ~91.000 | ~13 Tage |
| 30 | ~32.000 | ~4,5 Tage |
| 100 | ~9.900 | ~1,4 Tage |

⚠️ **Runbook-Eingabe:** `select count(*) from tokens where aktiv = 1`. Sie steht nicht im Repo und
verschiebt die letzte Spalte um eine Größenordnung. Liegt sie oberhalb von etwa 60, gehört
`LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE` gesenkt — die Zahl ist deshalb eine benannte
Env-Variable an genau einer Stelle und **keine im Code verstreute 300**.

**Zwei Vorbehalte, die mitwandern und bleiben.** Erstens sind alle drei Zähler **prozesslokal**
(`core/ratelimit.ts:6-11` schreibt den Vorbehalt aus). Im Suite-Container teilt lagerbuch den Prozess
mit allen anderen Modulen: **jeder Suite-Deploy setzt das Gate-Budget zurück**, nicht mehr nur ein
lagerbuch-Deploy — das sind spürbar mehr Gelegenheiten als früher. Zweitens: gäbe es je mehr als eine
Instanz, wäre der modulweite Deckel **je Instanz** einer. `compose.yaml` hat kein
`deploy:`/`replicas:`; wer skaliert, muss diese Voraussetzung zuerst auflösen.

⚠️ **Die Testdatei muss `vi.resetModules()` fahren.** Die Zähler sind **Modul-Singletons**; ohne
frisches `await import(...)` je Fall vergiftet der Fall, der einen Eimer leert, den nächsten. Und
beide Funktionen lesen `Date.now()` — **dieselbe Uhr**, die auch `RateLimiter` per Vorgabe benutzt
(`core/ratelimit.ts:22`). `vi.setSystemTime` steuert deshalb beide Hälften zugleich, und nur so ist
„nach Fensterende geht es weiter" ohne echte Wartezeit prüfbar.

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/gateSchranke.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/**
 * DIE ZAEHLER SIND MODUL-SINGLETONS. Ohne `vi.resetModules()` und ein frisches
 * `await import(...)` je Fall vergiftet der Fall, der einen Eimer leert, den
 * naechsten — und die Reihenfolge der Faelle entschiede ueber das Ergebnis.
 *
 * `vi.useFakeTimers()` steuert BEIDE Haelften zugleich: `gateSchranke.ts` liest
 * `Date.now()`, und `RateLimiter` benutzt per Vorgabe dieselbe Uhr
 * (`core/ratelimit.ts:22`). Nur so ist „nach Fensterende geht es weiter" ohne
 * echte Wartezeit pruefbar.
 */
type Schranke = typeof import("./gateSchranke");

async function frisch(env: Record<string, string> = {}): Promise<Schranke> {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) process.env[k] = v;
  return import("./gateSchranke");
}

const ENV_NAMEN = [
  "LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN",
  "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN",
  "LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE",
];
const alt: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_NAMEN) { alt[k] = process.env[k]; delete process.env[k]; }
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-03T10:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  for (const k of ENV_NAMEN) {
    if (alt[k] === undefined) delete process.env[k];
    else process.env[k] = alt[k]!;
  }
});

describe("die Datei hat GENAU ZWEI Exporte", () => {
  it("gibt weder die Zaehler noch die Sperrzeit-Map heraus", async () => {
    /**
     * Ein vierter Aufrufer, der selbst buchen will, ist damit KONSTRUKTIV
     * ausgeschlossen — nicht durch eine Konvention. Die drei RateLimiter und die
     * Map bleiben modul-intern (§3.5.3).
     */
    const s = await frisch();
    expect(Object.keys(s).sort()).toEqual(["gateFehlversuchBuchen", "gateGesperrt"]);
  });
});

describe("EINE ERFOLGREICHE EINLOESUNG VERBRAUCHT KEIN BUDGET", () => {
  it("bleibt nach 100 Erfolgen in Folge offen", async () => {
    /**
     * DIE ZEILE, DIE DEN GANZEN ENTWURF TRAEGT. Genau das macht den modulweiten
     * Deckel vertretbar: wuerden Erfolge mitzaehlen, waere ein modulweites Limit
     * ein AUSFALL DER AUSGABE.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: den Verbrauch vor die
     * Codepruefung ziehen — also das heutige Verhalten
     * (`lagerbuch/src/app/(gate)/actions.ts:19`). Genau dieser Fehler ist in
     * dieser Suite bereits produktiv eingetreten: feedback hat mit einem
     * IP-Limiter von 10/min „den Kernfall getoetet", 15 Ehrenamtliche aus einem
     * Vereins-WLAN.
     *
     * Der Test kann den Erfolgsfall nur so pruefen: er ruft
     * `gateFehlversuchBuchen` NICHT. Dass der Aufrufer das genauso haelt, ist
     * Aufgabe von Teil 4 — hier steht die Zusage, dass die Schranke selbst nichts
     * bucht, was ihr niemand meldet.
     */
    const s = await frisch();
    for (let i = 0; i < 100; i++) expect(s.gateGesperrt("cf:203.0.113.7")).toBeNull();
    expect(s.gateGesperrt("direkt")).toBeNull();
  });
});

describe("der Absender-Eimer", () => {
  it("weist den 6. Fehlversuch desselben Absenders ab", async () => {
    // 1:1 die heutige Zusage: 5 Fehlversuche je Absender und Minute
    // (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`).
    const s = await frisch();
    for (let i = 0; i < 5; i++) {
      s.gateFehlversuchBuchen("cf:1.2.3.4");
      expect(s.gateGesperrt("cf:1.2.3.4"), `nach ${i + 1} Fehlversuchen`).toBeNull();
    }
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("trifft NUR diesen Absender", async () => {
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    expect(s.gateGesperrt("cf:9.9.9.9")).toBeNull();
  });

  it("gibt nach Fensterende wieder frei", async () => {
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
    vi.advanceTimersByTime(60_001);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
  });

  it("liefert Restsekunden — NIE 0, und aufgerundet", async () => {
    /**
     * Ein `if (gateGesperrt(...))` waere in der letzten Sekunde sonst STILL
     * falsch. Die Aufrufer pruefen trotzdem ausdruecklich gegen `null` — die
     * Zusage steht im Typ, nicht in der Wahrheitswertumwandlung.
     */
    const s = await frisch();
    for (let i = 0; i < 6; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(60);
    vi.advanceTimersByTime(59_500);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(1);   // 500 ms → 1, nicht 0
    vi.advanceTimersByTime(600);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
  });
});

describe("die modulweiten Deckel", () => {
  it("greifen auch bei jedem Versuch von einem ANDEREN Absenderschluessel", async () => {
    /**
     * Der Absenderschluessel ist rotierbar (§3.5.2) — wer den Container direkt
     * erreicht, faelscht `cf-connecting-ip`. Deshalb tragen NUR diese beiden
     * Zaehler die eigentliche Abwehr: ihr Schluessel ist der einzige, den niemand
     * rotieren kann.
     */
    const s = await frisch({ LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "8" });
    for (let i = 0; i < 8; i++) s.gateFehlversuchBuchen(`cf:10.0.0.${i}`);
    expect(s.gateGesperrt("cf:10.0.0.0")).toBeNull();       // noch offen
    s.gateFehlversuchBuchen("cf:10.0.0.99");                // der 9. Versuch
    // Ab jetzt ist JEDER Absender gesperrt, auch ein voellig neuer.
    expect(s.gateGesperrt("cf:172.16.0.1")).not.toBeNull();
  });

  it("sperrt bei der Minutenbremse fuer 60 Sekunden", async () => {
    const s = await frisch({ LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "2" });
    for (let i = 0; i < 3; i++) s.gateFehlversuchBuchen(`cf:10.0.0.${i}`);
    expect(s.gateGesperrt("cf:neu")).toBe(60);
    vi.advanceTimersByTime(60_001);
    expect(s.gateGesperrt("cf:neu")).toBeNull();
  });

  it("sperrt bei der Stundenbremse fuer 3600 Sekunden", async () => {
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "3",
    });
    for (let i = 0; i < 4; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:egal")).toBe(3600);
    vi.advanceTimersByTime(3_600_001);
    expect(s.gateGesperrt("cf:egal")).toBeNull();
  });

  it("liefert die GROESSTE der drei Restzeiten", async () => {
    // Wer den Stundendeckel gerissen hat, soll nicht „noch 12 Sekunden" lesen.
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "60",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "600",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE: "2",
    });
    for (let i = 0; i < 3; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    vi.advanceTimersByTime(59_000);
    expect(s.gateGesperrt("cf:1.2.3.4")).toBe(3600 - 59);
  });
});

describe("die Kette ist KURZSCHLIESSEND", () => {
  it("ein bereits gesperrter Absender verbraucht das modulweite Budget NICHT mit", async () => {
    /**
     * Sonst legte ein einzelner Klopfer die Ausgabe fuer ALLE lahm: er
     * verbrauchte mit seinen eigenen, laengst gesperrten Versuchen den
     * modulweiten Deckel.
     *
     * Aufbau: Absender-Eimer 2, modulweiter Minutendeckel 5. Nach 3 Versuchen
     * desselben Absenders ist ER gesperrt, aber der modulweite Zaehler steht erst
     * bei 2 — die weiteren 20 Versuche desselben Absenders duerfen ihn nicht
     * weitertreiben.
     */
    const s = await frisch({
      LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "2",
      LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN: "5",
    });
    for (let i = 0; i < 23; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();     // er selbst: gesperrt
    expect(s.gateGesperrt("cf:9.9.9.9")).toBeNull();         // alle anderen: offen
  });
});

describe("gateGesperrt LIEST NUR", () => {
  it("bucht nichts — hundert Abfragen schliessen das Gate nicht", async () => {
    /**
     * `RateLimiter.check()` prueft UND bucht in einem Zug
     * (`core/ratelimit.ts:26-37`); ein reines Nachsehen gibt es dort nicht.
     * Deshalb merkt sich `gateSchranke.ts` jedes `false` selbst, und diese
     * Funktion liest nur noch die gemerkte Zahl.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: `gateGesperrt` ruft
     * `check()`. Dann sperrte sich die Gate-SEITE selbst aus, weil sie die
     * Schranke bei jedem Rendern fragt (§7.2.4) — und niemand faende die Ursache.
     */
    const s = await frisch({ LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "5" });
    for (let i = 0; i < 100; i++) s.gateGesperrt("cf:1.2.3.4");
    for (let i = 0; i < 5; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();   // die 5 sind noch nicht ueberschritten
  });

  it("braucht KEINEN Datenbankzugriff — die Signatur nimmt nur einen String", async () => {
    // Schritt 2 der Reihenfolge laeuft VOR jedem DB-Zugriff, und genau das ist
    // der Grund, warum die modulweiten Deckel den Lookup ueberhaupt schuetzen
    // koennen. Ein `db`-Parameter hier waere die Verletzung der Zusage.
    const s = await frisch();
    expect(s.gateGesperrt.length).toBe(1);
  });
});

describe("die Env-Zahlen wirken", () => {
  it("liest die drei Grenzen aus der Umgebung, nicht aus dem Code", async () => {
    const s = await frisch({ LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN: "1" });
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });

  it("faellt ohne Umgebung auf 5 / 30 / 300", async () => {
    const s = await frisch();
    for (let i = 0; i < 5; i++) s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).toBeNull();
    s.gateFehlversuchBuchen("cf:1.2.3.4");
    expect(s.gateGesperrt("cf:1.2.3.4")).not.toBeNull();
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/gateSchranke.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./gateSchranke"`.

- [ ] **Schritt 3: `_lib/gateSchranke.ts` schreiben**

```ts
import { RateLimiter } from "@/core/ratelimit";
import { grenzen } from "./grenzen";

/**
 * DIE GATE-SCHRANKE — drei Zaehler, und sie zaehlen NUR Fehlversuche.
 * KEIN "use client" (Falle 6).
 *
 * ⚠️ `grenzen()` steht hier auf MODULEBENE, und das ist zulaessig: alle sechs
 * Zahlen haben eine Vorbelegung, `grenzen()` laeuft also auf einer leeren
 * Umgebung klaglos durch — genau das braucht `next build`, das mit
 * NODE_ENV=production und OHNE .env laeuft (§10.8, Eigenschaft 3). Ein
 * UNGUELTIGER Wert bricht dagegen schon den Import ab, und das ist gewollt: ein
 * Modul, das mit einer kaputten Zahl gar nicht erst startet, ist richtiger als
 * eines, das still eine andere Grenze faehrt als die, die in der .env steht.
 *
 * FOLGE, die man kennen muss: die drei Grenzen sind ab dem ersten Import
 * eingefroren. Eine geaenderte .env wirkt erst nach einem Neustart. Das ist
 * inhaerent — die Zaehler sind Singletons und muessen es sein, sonst zaehlte
 * jeder Aufruf in einen frischen Eimer.
 */
const g = grenzen();

/** 1:1 die heutige Zusage: 5 Fehlversuche je Absender und Minute
 *  (`lagerbuch/src/lib/auth/rateLimit.ts:4-5`).
 *  Env: LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN (§10.3). */
const proAbsender = new RateLimiter({ windowMs: 60_000, max: g.gateProAbsenderProMin });

/**
 * Modulweit ueber die Minute, gegen Rotation des Absenderschluessels — die
 * BURST-Kappe, nicht die eigentliche Abwehr (das ist `gateStunde`).
 * 30 = sechs Absender-Budgets.
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN, Vorgabe 30.
 *
 * WARUM EINE MODULWEITE MINUTENSPERRE VERTRETBAR IST, obwohl sie alle trifft:
 * sie kann nur Fehleingaben verzoegern. Der Budgetverbrauch liegt HINTER der
 * Codepruefung — ein RICHTIGER Code wird eingeloest, auch waehrend die Sperre
 * laeuft. Der Sprengradius ist damit genau: „wer sich vertippt, wartet bis zu
 * eine Minute". 30 statt 20 ist Kopffreiheit fuer den realen Fall, den `feedback`
 * schon einmal getroffen hat: mehrere Ehrenamtliche geben gleichzeitig von Hand
 * ein und vertippen sich.
 */
const gateMinute = new RateLimiter({ windowMs: 60_000, max: g.gateGesamtProMin });

/**
 * Modulweit ueber die Stunde — DER tragende Zaehler.
 * 300 = 5/min x 60. Die Zahl ist nicht gegriffen: sie stellt genau die Zusage
 * WIEDER HER, die das Per-IP-Limit nur unter der Annahme einer wahrhaftigen
 * Absenderadresse je hatte. Der schlimmste Fall nach dieser Spec (unbegrenzte
 * Rotation) ist damit nicht schlechter als der beste Fall heute (ein Absender).
 * Env: LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE, Vorgabe 300.
 */
const gateStunde = new RateLimiter({ windowMs: 3_600_000, max: g.gateGesamtProStunde });

/**
 * DIE LESBARE SPERRZEIT — der Speicher, ohne den `gateGesperrt` gar nicht geht.
 * Schluessel → Zeitpunkt in ms, bis zu dem dieser Eimer als erschoepft gilt.
 *
 * `RateLimiter.check()` prueft und BUCHT in einem Zug (`core/ratelimit.ts:26-37`);
 * ein reines Nachsehen gibt es dort nicht. Deshalb merkt sich diese Datei jedes
 * `false` selbst, und `gateGesperrt` liest nur noch diese Zahl — ohne zu buchen
 * und ohne Datenbankzugriff.
 *
 * ⚠️ Wuerde erst NACH der Codepruefung gebucht und dabei nur die MELDUNG
 * umgeschaltet, liefe die Codepruefung selbst unbegrenzt weiter — der Deckel
 * aenderte dann die Fehlermeldung und nicht den Angriff.
 */
const gesperrtBis = new Map<string, number>();

/** Die beiden modulweiten Schluessel sind Konstanten DIESER Datei und gehen
 *  keinen Aufrufer etwas an — deshalb nimmt keine der beiden Funktionen sie
 *  entgegen. */
const MODULWEIT_MIN = "modul:minute";
const MODULWEIT_STD = "modul:stunde";

function restMs(schluessel: string, jetzt: number): number {
  const bis = gesperrtBis.get(schluessel);
  if (bis === undefined) return 0;
  if (bis <= jetzt) { gesperrtBis.delete(schluessel); return 0; }   // laeuft von selbst ab
  return bis - jetzt;
}

/**
 * SCHRITT 2 der Reihenfolge. LIEST NUR — bucht nichts, oeffnet nichts, und
 * braucht keinen Datenbankzugriff.
 *
 * Rueckgabe: die verbleibenden SEKUNDEN, aufgerundet und MINDESTENS 1, wenn
 * einer der drei Eimer gesperrt ist; sonst `null`. NIE 0: ein
 * `if (gateGesperrt(…))` waere sonst in der letzten Sekunde still falsch. Die
 * Aufrufer pruefen trotzdem ausdruecklich gegen `null` (§7.2.3, §7.2.4) — die
 * Zusage steht im Typ, nicht in der Wahrheitswertumwandlung.
 *
 * Zurueck kommt die GROESSTE der drei Restzeiten: wer den Stundendeckel gerissen
 * hat, soll nicht „noch 12 Sekunden" lesen.
 *
 * Diese Zahl ist das *n* aus dem Text zu `grund=zuviele` (§3.9). Sie wird NICHT
 * ueber die URL getragen — die Gate-Seite fragt dieselbe Schranke mit denselben
 * Absender-Kopfzeilen selbst (§7.2.4). Ueber die URL wandert nur der Grund.
 *
 * ⚠️ UND SIE IST ES, DIE DEN DATENBANKZUGRIFF SCHUETZT, nicht der
 * Absender-Eimer: wer den Absenderschluessel rotiert, startet jeden Versuch mit
 * LEEREM Absender-Eimer und bekaeme so oder so genau einen Lookup. Gedeckelt
 * wird das ausschliesslich durch `gateMinute` und `gateStunde` — und die lesen
 * ihre Sperrzeit hier, VOR jedem Datenbankzugriff.
 */
export function gateGesperrt(absender: string): number | null {
  const jetzt = Date.now();
  const ms = Math.max(restMs(absender, jetzt),
                      restMs(MODULWEIT_MIN, jetzt), restMs(MODULWEIT_STD, jetzt));
  return ms > 0 ? Math.max(1, Math.ceil(ms / 1000)) : null;
}

/**
 * SCHRITT 6: ein FEHLVERSUCH wird gebucht — NIE ein Erfolg. Genau das macht den
 * modulweiten Deckel vertretbar: wuerden Erfolge mitzaehlen, waere ein
 * modulweites Limit ein Ausfall der Ausgabe. So ist der Sprengradius scharf
 * umrissen — ein richtiger Code funktioniert immer, auch waehrend eines
 * Angriffs; wer sich vertippt, wird vertroestet.
 *
 * ⚠️ HEUTE LIEGT DER VERBRAUCH VOR DER CODEPRUEFUNG
 * (`lagerbuch/src/app/(gate)/actions.ts:19`, `t/[code]/route.ts:25`), und eine
 * Bereitschaft hinter einem gemeinsamen Uplink verbraucht ihre fuenf Versuche
 * mit ERFOLGREICHEN Scans. Genau dieser Fehler ist in dieser Suite bereits
 * produktiv eingetreten (feedback, 15 Ehrenamtliche aus einem Vereins-WLAN;
 * `m/files/api/u/[token]/upload/route.ts:140-149` schreibt den Vorfall aus).
 *
 * DIE KETTE IST KURZSCHLIESSEND (`&&`-Semantik ueber frueh zurueckkehrende
 * Zweige): ein bereits gesperrter Absender verbraucht das modulweite Budget
 * nicht mit, sonst legte ein einzelner Klopfer die Ausgabe fuer alle lahm.
 *
 * Jedes `false` schreibt die FENSTERLAENGE als Sperrzeit fort — bewusst
 * konservativ: es laeuft dann die Sperre ab, nicht der gleitende Eimer.
 */
export function gateFehlversuchBuchen(absender: string): void {
  const jetzt = Date.now();
  if (!proAbsender.check(absender))     { gesperrtBis.set(absender,      jetzt +    60_000); return; }
  if (!gateMinute.check(MODULWEIT_MIN)) { gesperrtBis.set(MODULWEIT_MIN, jetzt +    60_000); return; }
  if (!gateStunde.check(MODULWEIT_STD)) { gesperrtBis.set(MODULWEIT_STD, jetzt + 3_600_000); }
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/gateSchranke.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 5: Den Kurzschluss rot sehen**

```bash
cp src/app/m/lagerbuch/_lib/gateSchranke.ts /tmp/gs.ts
perl -0pi -e 's/\{ gesperrtBis\.set\(absender,      jetzt \+    60_000\); return; \}/{ gesperrtBis.set(absender, jetzt + 60_000); }/' \
  src/app/m/lagerbuch/_lib/gateSchranke.ts
pnpm vitest run src/app/m/lagerbuch/_lib/gateSchranke.test.ts
```

Erwartet: **FAIL** in „ein bereits gesperrter Absender verbraucht das modulweite Budget NICHT mit".
Ohne das `return` treibt ein einzelner Klopfer den modulweiten Deckel hoch und legt die Ausgabe für
alle lahm — **ein `return`, und der Sprengradius wechselt von „ein Absender" auf „das ganze Haus".**

```bash
cp /tmp/gs.ts src/app/m/lagerbuch/_lib/gateSchranke.ts && rm /tmp/gs.ts
pnpm vitest run src/app/m/lagerbuch/_lib/gateSchranke.test.ts
```

- [ ] **Schritt 6: Die Modulebene ohne Umgebung auswerten**

⚠️ **Auch hier ist `pnpm build` noch kein Nachweis** (dieselbe Begründung wie in T15, Schritt 5:
`gateSchranke.ts` wird bis Teil 4 von keiner Route importiert). Der Import-Weg prüft, was der Build
erst ab Teil 4 prüfen wird:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
    -u LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN \
    -u LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN \
    -u LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/gateSchranke.ts")
    .then(m => console.log("Modulebene ausgewertet:", typeof m.gateGesperrt))
    .catch(e => { console.error("UNERWARTET geworfen:", e.name, e.message); process.exit(1); })'
```

Erwartet: `Modulebene ausgewertet: function`. Jetzt steht `const g = grenzen();` wirklich auf
Modulebene und wird ausgewertet — **fällt der Lauf um, ist die Ursache immer eine Pflicht ohne
Vorbelegung, die in `ZAHLEN` gerutscht ist.**

**Die Gegenprobe zum ungültigen Wert** — sie muss werfen, und zwar **beim Import**:

```bash
LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=fuenf \
  pnpm exec tsx -e 'import("./src/app/m/lagerbuch/_lib/gateSchranke.ts")
    .then(() => { console.error("FEHLER: haette werfen muessen"); process.exit(1); })
    .catch(e => console.log("erwartet geworfen BEIM IMPORT:", e.name))'
```

Erwartet: `erwartet geworfen BEIM IMPORT: GrenzenUngueltig`. **Das ist gewollt** — ein Modul, das mit
einer kaputten Zahl gar nicht erst startet, ist richtiger als eines, das still eine andere Grenze
fährt als die, die in der `.env` steht. Der Unterschied zu „nicht gesetzt" ist die ganze Pointe: eine
**fehlende** Variable läuft durch (Vorbelegung), eine **kaputte** nicht.

- [ ] **Schritt 7: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/gateSchranke.ts src/app/m/lagerbuch/_lib/gateSchranke.test.ts
git commit -m "feat(lagerbuch): _lib/gateSchranke.ts — drei Zaehler, nur Fehlversuche

Der Budgetverbrauch liegt HINTER der Codepruefung, die Sperrpruefung davor. Heute
laeuft consumeRate VOR jeder Codepruefung, und eine Bereitschaft hinter einem
gemeinsamen Uplink verbraucht ihre fuenf Versuche mit ERFOLGREICHEN Scans —
genau der Fehler, den feedback in dieser Suite schon einmal produktiv gemacht
hat (15 Ehrenamtliche aus einem Vereins-WLAN).

Erst dadurch ist der modulweite Deckel vertretbar: ein richtiger Code
funktioniert immer, auch waehrend eines Angriffs. 'Nur Fehlversuche' und
'modulweiter Deckel' sind nicht zwei Massnahmen, sondern eine.

gateGesperrt LIEST NUR. RateLimiter.check() prueft und bucht in einem Zug, ein
reines Nachsehen gibt es dort nicht — deshalb merkt sich die Datei jedes false
selbst. Ohne diesen Schritt aenderte der Deckel die Fehlermeldung statt den
Angriff, und die Codepruefung liefe unbegrenzt weiter.

Was den DB-Lookup deckelt, sind ausschliesslich die beiden modulweiten Zaehler:
wer den Absenderschluessel rotiert, startet jeden Versuch mit leerem
Absender-Eimer.

Die Kette ist kurzschliessend — ein return, und der Sprengradius wechselt von
'ein Absender' auf 'das ganze Haus'. Rot gesehen.

GENAU ZWEI Exporte; die drei RateLimiter und die Map bleiben modul-intern, ein
vierter Aufrufer ist konstruktiv ausgeschlossen.

core/ratelimit.ts unangetastet — die RateLimiter-Klasse wird wiederverwendet,
clientIpAus nicht (§3.5.4)."
```

---

**Gate Stufe 2.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

⚠️ **Zusätzlich: die Modulebenen-Probe ohne Secrets. Und ausdrücklich NICHT als `pnpm build`.**
Bis Teil 4 importiert **keine Route** eine `_lib`-Datei; Next übersetzt ein unreferenziertes Modul
eines Private Folders gar nicht, ein `env -u … pnpm build` liefe also trivial grün und behauptete
etwas, das er nicht geprüft hat. **Der Build wird an dieser Stelle erst in Teil 4 tragend** — bis
dahin ist der ausdrückliche Import die Prüfung, die §10.8, Eigenschaft 3 wirklich sieht:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'Promise.all([
    import("./src/app/m/lagerbuch/_lib/grenzen.ts"),
    import("./src/app/m/lagerbuch/_lib/helferSitzung.ts"),
    import("./src/app/m/lagerbuch/_lib/gateSchranke.ts"),
  ]).then(() => console.log("alle drei Modulebenen ohne Secrets ausgewertet"))
    .catch(e => { console.error("UNERWARTET geworfen:", e.name, e.message); process.exit(1); })'
```

Erwartet: `alle drei Modulebenen ohne Secrets ausgewertet`.

⚠️ **`zugang.ts` und `helferZugang.ts` stehen ABSICHTLICH NICHT in der Liste, und wer sie „der
Vollständigkeit halber" nachträgt, macht das Signal unbrauchbar.** Keine der beiden liest auf
Modulebene irgendeine Umgebungsvariable — ihre einzige Modulebenen-Arbeit ist ein `new Set<string>()`.
Sie ziehen dafür Schweres nach: `zugang.ts` über `@/core/auth` das `NextAuth(authConfig)`, und
`helferZugang.ts` über `_db/client` das `better-sqlite3` sowie `next/headers` und `next/navigation`.
**Außerhalb einer Next-Laufzeit kann jedes davon aus Gründen werfen, die mit lagerbuchs
Env-Behandlung nichts zu tun haben** — die Probe meldete dann `UNERWARTET geworfen`, und niemand
könnte einen echten Befund von einem Artefakt unterscheiden. Die Abdeckung ändert sich durch die
Auslassung **nicht**: die drei Dateien mit Modulebenen-Env-Zugriff sind vollständig drin.

ℹ️ **Die Aufrufform ist am 03.08.2026 im Arbeitsbaum gemessen worden:** `pnpm exec tsx -e` löst
sowohl einen **relativen** Specifier (`./src/…`) als auch den tsconfig-Alias **`@/*`** auf — letzteres
braucht `gateSchranke.ts` für `@/core/ratelimit`. Scheitert die Auflösung in einer künftigen
tsx-Fassung, ist der Rückfall eine Wegwerfdatei unter `_lib/`, die das Modul importiert, gefahren mit
`pnpm vitest run` — das löst die Aliase so auf wie der Rest der Suite.

Nach dieser Stufe existiert **jede** Zugangsentscheidung des Moduls als aufrufbare Funktion; was
fehlt, sind der zusammengesetzte Helfer-Riegel und die Tür, durch die ein totes Cookie verschwindet.

---

## Welle 3 — Der zusammengesetzte Helfer-Riegel und die Tür für tote Cookies (2 Tasks, parallel)

Beide Tasks setzen auf T22 (`helferSitzung.ts`) auf. Sie berühren einander nicht: T25 liefert die
Riegel, T26 den Route Handler, den einer davon anspringt.

⚠️ **T25 und T26 hängen aneinander, aber nur in eine Richtung, die kein Bau-Hindernis ist.**
`requireHelferSitzung` leitet auf `/abmelden` um — als **String**, nicht als Import. Beide Tasks
können deshalb gleichzeitig laufen; die Verbindung prüft T27, Schritt 3.

---

### Task 25: `_lib/helferZugang.ts` — der Sperrbefund wirkt ab jetzt auch lesend

**Files:**
- Create: `src/app/m/lagerbuch/_lib/helferZugang.ts`
- Test: `src/app/m/lagerbuch/_lib/helferZugang.test.ts`

**Interfaces:**
- Consumes: `_lib/host.ts` (T10) — `requireLagerbuchHost(headers)`; `_lib/helferSitzung.ts` (T22) —
  `HELFER_COOKIE`, `verifyHelferSitzung`; `_db/client.ts` (T12) — `type DB`; `_db/schema.ts` (T7) —
  `tokens`; `_db/testdb.ts` (T9, nur für den Test).
- Produces:
  ```ts
  export type HelferZugang = {
    tokenId: string;
    code: string;
    label: string;
    laeuftAb: Date;
  };
  export type SperrGrund = "sitzung" | "gesperrt";

  export async function helferZugangOderNull(db: DB): Promise<HelferZugang | null>;
  export async function requireHelferSitzung(db: DB): Promise<HelferZugang>;
  export async function requireHelferSchreibend(db: DB):
    Promise<{ ok: true; zugang: HelferZugang } | { ok: false; grund: SperrGrund }>;
  ```
  Konsumenten: `helfer/layout.tsx` (**nur dort** `requireHelferSitzung`, Teil 4),
  `a/[artikelId]/page.tsx` und `g/[code]/page.tsx` (`helferZugangOderNull`, Teil 4),
  `_actions/buchung.ts` und `_actions/check.ts` (`requireHelferSchreibend`, Teil 4).
- ⚠️ **`SperrGrund` ist verbindlich für Teil 4** (Festlegung G7): `_lib/actionTypen.ts` schreibt
  `import type { SperrGrund } from "./helferZugang";` und
  `export type HelferGrund = SperrGrund | "leer" | "netz";`. Das ist zeichenweise dieselbe Menge wie
  §7.3s Aufzählung und hat **genau einen Ort** für die geteilte Hälfte. Zwei getrennte
  Literal-Unions für dieselben zwei Wörter wären genau die Typinkonsistenz, gegen die die
  Produces-Blöcke geschrieben sind.

**Der Befund: ein gesperrter Code liest heute bis zu 12 Stunden weiter den gesamten Bestand.**
`getHelferPayload` (`lagerbuch/src/actions/session.ts:14-18`) prüft nur Signatur und Ablauf; nur die
**zwei schreibenden** Stellen (`src/actions/buchung.ts:83`, `src/actions/check.ts:73`) machen den
DB-Recheck. Das ist genau der Fall, der eintritt, wenn ein laminiertes Etikett aus einem Fahrzeug
verschwindet.

**Entschieden: Entscheidung 13, Option (b) — der Recheck wandert auf JEDEN Lesepfad.** Das folgt dem
Hinweis der Analyse selbst („Der Port macht (b) billiger als heute"): die Helfer-Prüfung wandert
ohnehin aus der **Edge** in den **Node-Kontext**, wo der DB-Recheck ohne Zusatzaufwand möglich ist.
Es ist damit keine Abweichung, sondern der Grund, warum die Frage überhaupt offen war. Der Lookup
geht über den Primärschlüssel `tokens.id` und liegt in derselben SQLite-Verbindung, die die Seite
ohnehin öffnet.

**`requireLagerbuchHost` ist in ALLEN DREI Funktionen die ERSTE Anweisung.** Nur so ist die Zusage
„jede Helfer-Action ist host-gebunden" durch **Konstruktion** wahr und nicht durch eine Liste, die
die nächste Action vergisst.

⚠️ **Der scheinbare Widerspruch, der beim Lesen auffällt und der KEINER ist.**
`requireHelferSchreibend` ist ausdrücklich als „WIRFT NICHT" dokumentiert — und ruft trotzdem
`requireLagerbuchHost`, das `notFound()` **wirft**. Das ist richtig: der Rückgabewert-Vertrag gilt für
**erwartbare** Lagen (Sitzung abgelaufen, Code gesperrt), und §7.3 nimmt den Riegelfall ausdrücklich
davon aus — „nicht ‚erwartbar', sondern ‚manipuliert'". Ein Action-POST auf dem **falschen Host** ist
kein Betriebsfall, den ein Formular anzeigen müsste. Wer den Aufruf hier „aus Konsistenz" entfernt,
öffnet genau die Lücke, gegen die Falle 61 gebaut ist.

**Warum die Löschung einen eigenen Route Handler braucht — gemessen, nicht vermutet.**
`requireHelferSitzung` wird aus `helfer/layout.tsx` gerufen, und das ist eine **Server Component**.
`cookies()` ist dort **versiegelt**: `delete`, `set` und `clear` sind durch einen Proxy ersetzt, der
wirft — `next/dist/server/web/spec-extension/adapters/request-cookies.js:53` trägt den Satz „Cookies
can only be modified in a Server Action or Route Handler" wörtlich, `:171` hängt den Riegel an
`cookies().delete` (nachgeschlagen im Arbeitsbaum, Next 16.2.11). Ein `cookies().delete(...)` an der
Stelle, an der der Sperrbefund auffällt, ist also **nicht „unsauber", sondern ein Laufzeitfehler**.
Deshalb der Umweg über `/abmelden` (T26).

**Wer den Umweg nimmt und wer nicht** — die Tabelle, die man beim Schreiben griffbereit haben muss:

| Lage | `requireHelferSitzung` | `helferZugangOderNull` | `requireHelferSchreibend` |
|---|---|---|---|
| kein Cookie | `redirect("/")` — **kein** Umweg, es gibt nichts zu räumen | `null` | `{ok:false, grund:"sitzung"}` |
| Cookie ungültig/abgelaufen | `redirect("/abmelden?grund=abgelaufen")` | `null` | `{ok:false, grund:"sitzung"}` |
| Cookie gültig, `tokens.aktiv = 0` oder Zeile fehlt | `redirect("/abmelden?grund=gesperrt")` | `null` | `{ok:false, grund:"gesperrt"}` |
| alles in Ordnung | `HelferZugang` | `HelferZugang` | `{ok:true, zugang}` |

⚠️ **`requireHelferSchreibend` nimmt den Umweg NIE.** Es leitet nicht um, sondern gibt zurück (§7.3),
und der nächste Seitenaufruf läuft ohnehin durch das Layout.

**Warum `sitzung` und `gesperrt` getrennt bleiben — nicht kosmetisch.** Im ersten Fall hilft ein
erneutes Einlösen, im zweiten **nicht** (derselbe Code scheitert genauso). Genau daran hängt, ob
§7.4.4 das **Inline-Feld zur Code-Erneuerung** überhaupt anbietet. Legt man die beiden Gründe
zusammen, bietet der Fahrzeug-Check der Helferin ein Feld an, in das sie einen Code eingibt, der
garantiert abgewiesen wird — mitten im Abschluss eines zwanzigminütigen Checks.

**`code` und `label` kommen aus der DATENBANK, nicht mehr aus der Nutzlast.** Das ist der Grund,
warum das Klartext-Secret aus dem Cookie verschwinden konnte (§3.4.3). Drei Aufrufer merken das:
`helfer/layout.tsx:10` und `a/[artikelId]/page.tsx:24` bauen daraus ihr „Zugang: Token <code> ·
<label>", und der Schreibweg setzt `quelle_id = code` für Token-Buchungen.

**`laeuftAb` ist die einzige Angabe, die NICHT aus der Token-Zeile stammt** — mit Absicht: die
Sperrung wirkt sofort und kommt deshalb aus der Datenbank, der Ablauf steht seit der Ausstellung fest
und kommt deshalb aus dem Cookie. Sie kostet keinen zusätzlichen Zugriff und trägt die
Restzeit-Anzeige des Helfer-Rahmens (§3.4.3, Punkt 1; §7.8.2).

- [ ] **Schritt 1: Den fehlschlagenden Test schreiben**

`src/app/m/lagerbuch/_lib/helferZugang.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { TestDb } from "../_db/testdb";
import { migrierteTestDb } from "../_db/testdb";
import { tokens } from "../_db/schema";

vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
let cookieWert: string | undefined;
vi.mock("next/headers", () => ({
  headers: async () => hostKopf,
  cookies: async () => ({
    get: (name: string) =>
      name === "helfer_session" && cookieWert !== undefined ? { name, value: cookieWert } : undefined,
  }),
}));

import { createHelferSitzung } from "./helferSitzung";
import { helferZugangOderNull, requireHelferSitzung, requireHelferSchreibend } from "./helferZugang";

let t: TestDb;
const altGeheim = process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;

/** Eine aktive Token-Zeile — der Regelfall. */
function tokenAnlegen(id: string, aktiv = true): void {
  t.db.insert(tokens).values({
    id, code: "482-137", label: "RTW 1 Kaertchen",
    aktiv, createdAt: new Date(), createdBy: "sub-1",
  }).run();
}

beforeEach(() => {
  process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = "e2e-helfer-secret-nicht-produktiv-32z";
  t = migrierteTestDb("lagerbuch-helferzugang-");
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  cookieWert = undefined;
});
afterEach(() => {
  t.schliessen();
  if (altGeheim === undefined) delete process.env.LAGERBUCH_HELFER_SITZUNG_SECRET;
  else process.env.LAGERBUCH_HELFER_SITZUNG_SECRET = altGeheim;
});

describe("der HOST-Riegel ist in ALLEN DREI Funktionen die ERSTE Anweisung", () => {
  /**
   * Nur so ist „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr
   * und nicht durch eine Liste, die die naechste Action vergisst (§2.6, §2.8).
   *
   * Ohne den Riegel loeste ein Aufruf auf `files.iuk-ue.de/m/lagerbuch/t/123-456`
   * einen echten Code ein und legte auf DIESEM Host ein gueltiges Helfer-Cookie
   * ab — eine zweite funktionierende Herkunft des Moduls, aus der echte
   * Buchungen in das append-only Journal liefen.
   */
  beforeEach(() => { hostKopf = new Headers({ host: "feedback.localtest.me" }); });

  it("helferZugangOderNull wirft auf fremdem Host", async () => {
    await expect(helferZugangOderNull(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requireHelferSitzung wirft auf fremdem Host", async () => {
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("requireHelferSchreibend wirft auf fremdem Host — trotz 'wirft nicht'", async () => {
    /**
     * DER SCHEINBARE WIDERSPRUCH, UND ER IST KEINER. Der Rueckgabewert-Vertrag
     * gilt fuer ERWARTBARE Lagen (§7.3): Sitzung abgelaufen, Code gesperrt. §7.3
     * nimmt den Riegelfall ausdruecklich aus — „nicht 'erwartbar', sondern
     * 'manipuliert'". Ein Action-POST auf dem FALSCHEN Host ist kein
     * Betriebsfall, den ein Formular anzeigen muesste.
     *
     * Wer den Aufruf hier „aus Konsistenz" entfernt, oeffnet genau die Luecke,
     * gegen die Falle 61 gebaut ist — und `pnpm build` sieht nichts.
     */
    await expect(requireHelferSchreibend(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("prueft den Host VOR dem Cookie — auch ohne jedes Cookie", async () => {
    // Sonst antwortete der fremde Host auf ein fehlendes Cookie mit einem
    // Redirect aufs Gate und verriete damit, dass es das Modul dort gibt.
    cookieWert = undefined;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("helferZugangOderNull — das Praedikat fuer die beiden Rollen-Weichen", () => {
  it("liefert code und label AUS DER DATENBANK, nicht aus der Nutzlast", async () => {
    /**
     * DAS IST DER GRUND, WARUM DAS KLARTEXT-SECRET AUS DEM COOKIE VERSCHWINDEN
     * KONNTE (§3.4.3). Die Nutzlast traegt nur noch {tokenId}.
     *
     * Der Test aendert das Label NACH der Ausstellung des Cookies: kaemen die
     * Werte aus der Nutzlast, staende hier noch der alte Text.
     */
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    t.db.update(tokens).set({ label: "RTW 2 Kaertchen" }).run();

    const z = await helferZugangOderNull(t.db);
    expect(z).toMatchObject({ tokenId: "tk1", code: "482-137", label: "RTW 2 Kaertchen" });
  });

  it("liefert laeuftAb AUS DEM COOKIE", async () => {
    // Die einzige Angabe, die NICHT aus der Token-Zeile stammt — mit Absicht: die
    // Sperrung wirkt sofort und kommt aus der Datenbank, der Ablauf steht seit
    // der Ausstellung fest und kommt aus dem Cookie. Sie traegt die
    // Restzeit-Anzeige des Helfer-Rahmens (§3.4.3, §7.8.2).
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const z = await helferZugangOderNull(t.db);
    expect(z?.laeuftAb).toBeInstanceOf(Date);
    expect(z!.laeuftAb.getTime()).toBeGreaterThan(Date.now());
  });

  it("liefert null ohne Cookie", async () => {
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("liefert null bei ungueltigem Cookie", async () => {
    cookieWert = "kein.gueltiges.jwt";
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("EIN GESPERRTER CODE BLOCKT DEN LESEPFAD — nicht nur den Schreibpfad", async () => {
    /**
     * DIE ZENTRALE ZUSAGE DIESER DATEI (Entscheidung 13 b, §3.4.4).
     *
     * Heute prueft `getHelferPayload` nur Signatur und Ablauf; nur die zwei
     * SCHREIBENDEN Stellen machen den DB-Recheck. Ein gesperrter Code liest damit
     * bis zu 12 Stunden weiter den GESAMTEN Bestand — was passiert, wenn ein
     * laminiertes Etikett aus einem Fahrzeug verschwindet.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: den Recheck aus dem
     * Lesepfad entfernen. Das ist das Verhalten von HEUTE — gruen in jedem Test,
     * der nur schreibt.
     */
    tokenAnlegen("tk1", true);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await helferZugangOderNull(t.db)).not.toBeNull();

    t.db.update(tokens).set({ aktiv: false }).run();
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("liefert null, wenn die Token-Zeile gar nicht existiert", async () => {
    // Ein manipuliertes tokenId in einem sonst gueltig signierten Cookie ist der
    // Fall — er verhaelt sich wie „gesperrt", weil `redeemToken` denselben
    // Doppeltest fuehrt (`!t || !t.aktiv`, `token-redeem.ts:15`).
    cookieWert = await createHelferSitzung({ tokenId: "gibt-es-nicht" });
    expect(await helferZugangOderNull(t.db)).toBeNull();
  });

  it("LEITET NICHT UM und LOESCHT NICHTS — es ist ein Praedikat", async () => {
    // Die beiden Rollen-Weichen haben je DREI gueltige Faelle und entscheiden
    // selbst (§3.2.1, §7.4.3). Ein Wurf hier schickte jeden anonymen Scan eines
    // Regaletiketts weg.
    cookieWert = "muell";
    await expect(helferZugangOderNull(t.db)).resolves.toBeNull();
  });
});

describe("requireHelferSitzung — NUR aus helfer/layout.tsx", () => {
  it("liefert den Zugang im Regelfall", async () => {
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect((await requireHelferSitzung(t.db)).tokenId).toBe("tk1");
  });

  it("OHNE Cookie: unmittelbar aufs Gate, KEIN Umweg", async () => {
    /**
     * „fehlt es ganz, gibt es nichts zu raeumen und der Redirect geht unmittelbar
     * aufs Gate" (§3.4.4). Ein Umweg ueber /abmelden waere hier ein zweiter 303
     * ohne Wirkung — und auf einem Telefon im Fahrzeug zwei Runden statt einer.
     */
    cookieWert = undefined;
    await expect(requireHelferSitzung(t.db)).rejects.toThrow("NEXT_REDIRECT:/");
  });

  it("ABGELAUFEN oder ungueltig: ueber /abmelden, mit grund=abgelaufen", async () => {
    /**
     * DER UMWEG IST DER GRUND, WARUM DAS UEBERHAUPT MOEGLICH IST. `cookies()` ist
     * in einer Server Component VERSIEGELT: delete/set/clear sind durch einen
     * Proxy ersetzt, der wirft
     * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53,171`,
     * nachgeschlagen im Arbeitsbaum, Next 16.2.11). Ein
     * `cookies().delete(HELFER_COOKIE)` an dieser Stelle ist kein Stilproblem,
     * sondern ein LAUFZEITFEHLER.
     *
     * Ein totes Cookie darf nicht liegen bleiben: es sorgte sonst bei jedem
     * weiteren Aufruf fuer denselben Umweg.
     */
    cookieWert = "kein.gueltiges.jwt";
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=abgelaufen");
  });

  it("GESPERRT: ueber /abmelden, mit grund=gesperrt", async () => {
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
  });

  it("unterscheidet die beiden toten Lagen im GRUND", async () => {
    // §3.9: „Dein Zugang ist abgelaufen. Scanne das Kaertchen erneut." gegen
    // „Dieser Zugangs-Code wurde gesperrt. Wende dich an die Leitung." Der erste
    // Satz waere bei einem gesperrten Kaertchen eine Aufforderung zu etwas, das
    // garantiert scheitert.
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const gesperrt = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    cookieWert = "muell";
    const abgelaufen = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    expect(gesperrt).not.toBe(abgelaufen);
  });

  it("benutzt AUSSCHLIESSLICH Gruende aus dem geschlossenen Satz", async () => {
    // Der Route Handler /abmelden reicht nur Werte aus `GateGrund` weiter (§3.9);
    // ein Grund ausserhalb des Satzes verschwaende die Meldung stumm.
    const { istGateGrund } = await import("./gateTexte");
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const m1 = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    cookieWert = "muell";
    const m2 = await requireHelferSitzung(t.db).catch((e: Error) => e.message);
    for (const m of [m1, m2]) {
      const grund = new URL(String(m).replace("NEXT_REDIRECT:", ""), "http://x")
        .searchParams.get("grund");
      expect(istGateGrund(grund), `unbekannter Grund: ${grund}`).toBe(true);
    }
  });
});

describe("requireHelferSchreibend — WIRFT NICHT, sondern liefert", () => {
  it("liefert {ok:true, zugang} im Regelfall", async () => {
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const r = await requireHelferSchreibend(t.db);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.zugang).toMatchObject({ tokenId: "tk1", code: "482-137" });
  });

  it("liefert grund 'sitzung' bei abgelaufener oder fehlender Sitzung", async () => {
    /**
     * KEIN Redirect. Laeuft die Sitzung zwischen Eingabe und Absenden ab, verwuerfe
     * ein Redirect die eingetragenen Mengen — genau der Datenverlust, den
     * `docs/design/README.md` unter „Kommen Fehler aus Server-Actions am Feld an?"
     * ausschliesst. Der Text lautet „Dein Zugang ist abgelaufen. Scanne das
     * Kaertchen erneut — deine Eingaben bleiben stehen." (§7.3, Teil 4).
     */
    cookieWert = undefined;
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung" });
    cookieWert = "muell";
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "sitzung" });
  });

  it("liefert grund 'gesperrt' bei gesperrtem Code", async () => {
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt" });
  });

  it("HAELT DIE BEIDEN GRUENDE AUSEINANDER — daran haengt §7.4.4", async () => {
    /**
     * Nicht kosmetisch: bei `sitzung` hilft ein erneutes Einloesen, bei
     * `gesperrt` NICHT (derselbe Code scheitert genauso). Genau daran haengt, ob
     * §7.4.4 das Inline-Feld zur Code-Erneuerung ueberhaupt anbietet.
     *
     * Die Mutation, die ohne diesen Fall gruen bliebe: die beiden Gruende
     * zusammenlegen. Dann bietet der Fahrzeug-Check der Helferin ein Feld an, in
     * das sie einen Code eingibt, der garantiert abgewiesen wird — mitten im
     * Abschluss eines zwanzigminuetigen Checks.
     */
    tokenAnlegen("tk1", false);
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    const a = await requireHelferSchreibend(t.db);
    cookieWert = undefined;
    const b = await requireHelferSchreibend(t.db);
    expect(a.ok).toBe(false);
    expect(b.ok).toBe(false);
    if (!a.ok && !b.ok) expect(a.grund).not.toBe(b.grund);
  });

  it("NIMMT DEN /abmelden-UMWEG NIE", async () => {
    // Es leitet nicht um, sondern gibt zurueck (§7.3) — und der naechste
    // Seitenaufruf laeuft ohnehin durch das Layout, das raeumt dann.
    cookieWert = "muell";
    await expect(requireHelferSchreibend(t.db)).resolves.toEqual({ ok: false, grund: "sitzung" });
  });
});

describe("der Sperrbefund ist DER Sofort-Widerruf des Moduls", () => {
  it("wirkt bei der NAECHSTEN Anfrage — lesend wie schreibend", async () => {
    /**
     * Er ist es genau deshalb, weil er aus der DATENBANK kommt und nicht aus dem
     * Token. Das ist die Gegenprobe zur Gruppenfrische in §3.6.4, wo ein
     * Gruppenentzug bis zu eine Stunde braucht.
     *
     * Ein Einzel-Widerruf JE SITZUNG wird bewusst NICHT gebaut: ein Code wird von
     * mehreren Menschen gleichzeitig benutzt, „diese eine Sitzung" ist fachlich
     * keine Einheit. Ein `jti` haette darum keinen Leser.
     */
    tokenAnlegen("tk1");
    cookieWert = await createHelferSitzung({ tokenId: "tk1" });
    expect(await helferZugangOderNull(t.db)).not.toBeNull();
    expect((await requireHelferSchreibend(t.db)).ok).toBe(true);

    t.db.update(tokens).set({ aktiv: false }).run();

    expect(await helferZugangOderNull(t.db)).toBeNull();
    expect(await requireHelferSchreibend(t.db)).toEqual({ ok: false, grund: "gesperrt" });
    await expect(requireHelferSitzung(t.db))
      .rejects.toThrow("NEXT_REDIRECT:/abmelden?grund=gesperrt");
  });
});
```

- [ ] **Schritt 2: Test laufen lassen — er muss FEHLSCHLAGEN**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/helferZugang.test.ts
```

Erwartet: FAIL mit `Failed to resolve import "./helferZugang"`.

- [ ] **Schritt 3: `_lib/helferZugang.ts` schreiben**

```ts
import { eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import type { DB } from "../_db/client";
import { tokens } from "../_db/schema";
import { requireLagerbuchHost } from "./host";
import { HELFER_COOKIE, verifyHelferSitzung } from "./helferSitzung";

/**
 * DIE AUTORITATIVE HELFER-PRUEFUNG — Host, Cookie-Signatur, Ablauf UND
 * `tokens.aktiv`. KEIN "use client" (Falle 6).
 *
 * ERSTE ANWEISUNG IST IMMER `requireLagerbuchHost(await headers())` (§2.6): nur so
 * ist die Zusage „jede Helfer-Action ist host-gebunden" durch KONSTRUKTION wahr
 * und nicht durch eine Liste, die die naechste Action vergisst.
 *
 * DER DB-RECHECK STEHT HEUTE NUR VOR SCHREIBENDEN AKTIONEN
 * (`lagerbuch/src/actions/session.ts:20-28`), und das WAR die Spezifikation
 * („der eine DB-Lookup pro Buchung"). Er wandert auf JEDEN Lesepfad, weil der
 * Riegel den Edge-Kontext verlaesst: dort war kein DB-Zugriff moeglich, hier ist
 * er einer von vielen auf derselben Seite. Der Lookup geht ueber den
 * Primaerschluessel `tokens.id` und liegt in derselben SQLite-Verbindung, die die
 * Seite ohnehin oeffnet. Ohne ihn liest ein gesperrter Code bis zu 12 Stunden
 * weiter den gesamten Bestand — was passiert, wenn ein laminiertes Etikett aus
 * einem Fahrzeug verschwindet.
 *
 * `code` und `label` kommen aus DIESER Zeile, nicht mehr aus der JWT-Nutzlast
 * (§3.4.3) — das ist der Grund, warum das Klartext-Secret aus dem Cookie
 * verschwinden konnte.
 */
export type HelferZugang = {
  tokenId: string;
  code: string;
  label: string;
  /**
   * Ablauf DIESER Sitzung, aus dem `exp` des verifizierten Cookies (§3.4.3).
   * Die einzige Angabe hier, die NICHT aus der Token-Zeile stammt — mit Absicht:
   * die Sperrung wirkt sofort und kommt deshalb aus der Datenbank, der Ablauf
   * steht seit der Ausstellung fest und kommt deshalb aus dem Cookie.
   * Sie kostet keinen zusaetzlichen Zugriff und traegt die Restzeit-Anzeige des
   * Helfer-Rahmens (§3.4.3 Punkt 1, §7.8.2).
   */
  laeuftAb: Date;
};

/**
 * Die zwei Gruende, mit denen eine schreibende Helfer-Action abgewiesen wird.
 *
 * ⚠️ SIE SIND DIE GETEILTE HAELFTE VON `HelferGrund` (§7.3, Teil 4). Verbindlich
 * fuer `_lib/actionTypen.ts`:
 *
 *     import type { SperrGrund } from "./helferZugang";
 *     export type HelferGrund = SperrGrund | "leer" | "netz";
 *
 * Zwei getrennte Literal-Unions fuer dieselben zwei Woerter waeren die
 * Typinkonsistenz, gegen die die Schnittstellenbloecke der Plaene geschrieben
 * sind — sie faellt erst auf, wenn jemand eine der beiden erweitert.
 *
 * DIE UNTERSCHEIDUNG IST NICHT KOSMETISCH: bei `sitzung` hilft ein erneutes
 * Einloesen, bei `gesperrt` NICHT — derselbe Code scheitert genauso. Genau daran
 * haengt, ob §7.4.4 das Inline-Feld zur Code-Erneuerung ueberhaupt anbietet.
 */
export type SperrGrund = "sitzung" | "gesperrt";

/**
 * Der gemeinsame Rumpf aller drei Riegel. `hatteCookie` bleibt INTERN: es
 * entscheidet allein darueber, ob `requireHelferSitzung` den /abmelden-Umweg
 * nimmt — fehlt das Cookie ganz, gibt es nichts zu raeumen (§3.4.4).
 */
type Befund =
  | { ok: true; zugang: HelferZugang }
  | { ok: false; grund: SperrGrund; hatteCookie: boolean };

async function befund(db: DB): Promise<Befund> {
  const roh = (await cookies()).get(HELFER_COOKIE)?.value;
  if (!roh) return { ok: false, grund: "sitzung", hatteCookie: false };

  const sitzung = await verifyHelferSitzung(roh);
  if (!sitzung) return { ok: false, grund: "sitzung", hatteCookie: true };

  // DER RECHECK. `!zeile || !zeile.aktiv` ist derselbe Doppeltest, den
  // `redeemToken` fuehrt (`token-redeem.ts:15`) — ein manipuliertes tokenId in
  // einem gueltig signierten Cookie verhaelt sich damit wie ein gesperrter Code.
  const zeile = db.select().from(tokens).where(eq(tokens.id, sitzung.tokenId)).get();
  if (!zeile || !zeile.aktiv) return { ok: false, grund: "gesperrt", hatteCookie: true };

  return {
    ok: true,
    zugang: {
      tokenId: zeile.id,
      code: zeile.code,
      label: zeile.label,
      laeuftAb: sitzung.laeuftAb,
    },
  };
}

/**
 * DAS PRAEDIKAT — fuer die beiden Rollen-Weichen `a/[artikelId]/page.tsx` und
 * `g/[code]/page.tsx` (§3.2.1, §7.4.3).
 *
 * Beide haben einen DRITTEN gueltigen Fall — „keine Sitzung → Gate mit
 * `returnTo`" —, den ein werfender Riegel nach `/login` umleitete. ⚠️ `/g` hat
 * ueberdies GAR KEINEN Zweig, der eine Helfer-Sitzung VERLANGT: der Bestand
 * liest sie dort nur als Praedikat, um Helfer nach `/helfer` zu schicken
 * (`g/[code]/page.tsx:23-24`).
 *
 * LEITET NICHT UM UND LOESCHT NICHTS.
 */
export async function helferZugangOderNull(db: DB): Promise<HelferZugang | null> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  return b.ok ? b.zugang : null;
}

/**
 * Fuer Layouts und Seiten: leitet ans Gate, mit benanntem Grund (§3.9).
 * AUFRUFER: `helfer/layout.tsx`, SONST NIRGENDS (§2.8).
 *
 * WARUM DER UMWEG UEBER /abmelden — gemessen, nicht vermutet. Diese Funktion
 * wird aus einer SERVER COMPONENT gerufen, und dort ist `cookies()` versiegelt:
 * `delete`, `set` und `clear` sind durch einen Proxy ersetzt, der wirft
 * (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` traegt
 * den Satz „Cookies can only be modified in a Server Action or Route Handler"
 * woertlich, `:171` haengt den Riegel an `cookies().delete`; nachgeschlagen im
 * Arbeitsbaum, Next 16.2.11). Ein `cookies().delete(HELFER_COOKIE)` an der
 * Stelle, an der der Sperrbefund auffaellt, ist also NICHT „unsauber", sondern
 * ein Laufzeitfehler. Ein totes Cookie darf nicht liegen bleiben — es sorgte
 * sonst bei jedem weiteren Aufruf fuer denselben Umweg.
 *
 * ⚠️ DER UMWEG GILT NUR, WENN EIN COOKIE DA WAR. Fehlt es ganz, gibt es nichts
 * zu raeumen und der Redirect geht unmittelbar aufs Gate — auf einem Telefon im
 * Fahrzeug ist das eine Runde statt zwei.
 */
export async function requireHelferSitzung(db: DB): Promise<HelferZugang> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  if (b.ok) return b.zugang;
  if (!b.hatteCookie) redirect("/");
  redirect(b.grund === "gesperrt" ? "/abmelden?grund=gesperrt" : "/abmelden?grund=abgelaufen");
}

/**
 * Fuer schreibende Actions (`_actions/buchung.ts`, `_actions/check.ts`).
 *
 * WIRFT NICHT, sondern liefert ein Ergebnis (§7.3) — bis zur Portierung warf
 * dieser Riegel (`session.ts:25,28`), und ein Wurf liess sich nicht uebersehen.
 * Ein Rueckgabewert schon: `await requireHelferSchreibend(db)` OHNE Pruefung ist
 * typkorrekt, lint-sauber und oeffnet die Action fuer jeden. Das einzige Netz
 * dagegen ist der E2E „gesperrter Token wird an der Buchung abgewiesen" (§3.8.3)
 * — deshalb steht der Aufruf in BEIDEN Actions als ERSTE Anweisung, mit
 * ausgeschriebenem Kommentar, und der Guard-Scan haelt das fest.
 *
 * ⚠️ „WIRFT NICHT" GILT FUER DIE ERWARTBAREN LAGEN, nicht fuer den Host-Riegel.
 * §7.3 nimmt den Riegelfall ausdruecklich vom Rueckgabewert-Gebot aus („nicht
 * 'erwartbar', sondern 'manipuliert'"). Ein Action-POST auf dem falschen Host
 * ist kein Betriebsfall, den ein Formular anzeigen muesste — und wer den Aufruf
 * hier „aus Konsistenz" entfernt, oeffnet genau die Luecke, gegen die Falle 61
 * gebaut ist.
 *
 * NIMMT DEN /abmelden-UMWEG NIE: es leitet nicht um, sondern gibt zurueck, und
 * der naechste Seitenaufruf laeuft ohnehin durch das Layout.
 *
 * Laeuft die Sitzung zwischen Eingabe und Absenden ab, antwortet die Action mit
 * einem benannten Fehlerzustand AM FORMULAR (`useActionState`), NICHT mit
 * `redirect()`. Ein Redirect verwuerfe die eingetragenen Mengen — genau der
 * Datenverlust, den `docs/design/README.md` unter „Kommen Fehler aus
 * Server-Actions am Feld an?" ausschliesst.
 */
export async function requireHelferSchreibend(
  db: DB,
): Promise<{ ok: true; zugang: HelferZugang } | { ok: false; grund: SperrGrund }> {
  requireLagerbuchHost(await headers());
  const b = await befund(db);
  return b.ok ? { ok: true, zugang: b.zugang } : { ok: false, grund: b.grund };
}
```

- [ ] **Schritt 4: Test grün**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/helferZugang.test.ts
```

Erwartet: alle Fälle grün.

- [ ] **Schritt 5: Den Lesepfad-Recheck rot sehen**

```bash
cp src/app/m/lagerbuch/_lib/helferZugang.ts /tmp/hz.ts
perl -0pi -e 's/  const b = await befund\(db\);\n  return b\.ok \? b\.zugang : null;/  const roh = (await cookies()).get(HELFER_COOKIE)?.value;\n  if (!roh) return null;\n  const s = await verifyHelferSitzung(roh);\n  return s ? { tokenId: s.tokenId, code: "?", label: "?", laeuftAb: s.laeuftAb } : null;/' \
  src/app/m/lagerbuch/_lib/helferZugang.ts
pnpm vitest run src/app/m/lagerbuch/_lib/helferZugang.test.ts
```

Erwartet: **FAIL** in „EIN GESPERRTER CODE BLOCKT DEN LESEPFAD" **und** in „liefert code und label
AUS DER DATENBANK". **Das ist exakt das Verhalten von heute** — und es ist grün in jedem Test, der
nur schreibt.

```bash
cp /tmp/hz.ts src/app/m/lagerbuch/_lib/helferZugang.ts && rm /tmp/hz.ts
pnpm vitest run src/app/m/lagerbuch/_lib/helferZugang.test.ts
```

- [ ] **Schritt 6: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/_lib/helferZugang.ts src/app/m/lagerbuch/_lib/helferZugang.test.ts
git commit -m "feat(lagerbuch): _lib/helferZugang.ts — der Sperrbefund wirkt ab jetzt auch lesend

Entscheidung 13 (b). Heute prueft getHelferPayload nur Signatur und Ablauf; nur
die zwei schreibenden Stellen machen den DB-Recheck, und ein gesperrter Code
liest damit bis zu 12 Stunden weiter den gesamten Bestand — was passiert, wenn
ein laminiertes Etikett aus einem Fahrzeug verschwindet. Der Port macht (b)
billiger als heute: der Riegel verlaesst den Edge-Kontext.

requireLagerbuchHost ist in ALLEN DREI Funktionen die erste Anweisung. Nur so ist
'jede Helfer-Action ist host-gebunden' durch Konstruktion wahr statt durch eine
Liste, die die naechste Action vergisst. Das gilt auch fuer
requireHelferSchreibend, obwohl es sonst nicht wirft: ein Action-POST auf dem
falschen Host ist manipuliert, nicht erwartbar (§7.3).

code und label kommen aus der Token-ZEILE, nicht mehr aus der Nutzlast — das ist
der Grund, warum das Klartext-Secret aus dem Cookie verschwinden konnte.
laeuftAb ist die einzige Angabe aus dem Cookie und traegt die Restzeit-Anzeige.

sitzung und gesperrt bleiben getrennt: bei sitzung hilft ein erneutes Einloesen,
bei gesperrt nicht. Zusammengelegt boete §7.4.4 der Helferin ein Feld an, in das
sie einen Code eingibt, der garantiert abgewiesen wird.

requireHelferSitzung nimmt den /abmelden-Umweg in BEIDEN toten Lagen, aber nur
wenn ein Cookie da war. Der Umweg ist noetig, weil cookies() in einer Server
Component versiegelt ist (request-cookies.js:53,171) — ein delete dort ist ein
Laufzeitfehler, kein Stilproblem.

SperrGrund ist die geteilte Haelfte von HelferGrund; Teil 4 schreibt
HelferGrund = SperrGrund | 'leer' | 'netz' (Festlegung G7).

Rot gesehen: mit dem heutigen Verhalten (kein Recheck im Lesepfad) fallen zwei
Faelle um."
```

---

### Task 26: `abmelden/route.ts` — der einzige Weg, auf dem ein totes Cookie verschwindet

**Files:**
- Create: `src/app/m/lagerbuch/abmelden/route.ts`
- Modify: `.env.example`

**Interfaces:**
- Consumes: `_lib/host.ts` (T10) — `lagerbuchHostOderNull(headers)`; `_lib/helferSitzung.ts` (T22) —
  `HELFER_COOKIE`, `helferCookieOptionen`; `_lib/gateTexte.ts` (T18) — `istGateGrund`.
- Produces: die äußere Route **`/abmelden`** (innerer Pfad `/m/lagerbuch/abmelden`), Methode **GET**,
  Antwort **303** auf `/` bzw. `/?grund=<GateGrund>` mit
  `Set-Cookie: helfer_session=; Max-Age=0` **ohne** `Domain=`. **Einziger Aufrufer:**
  `requireHelferSitzung` (T25) — als **String**, nicht als Import.

**Warum es diesen Handler gibt — und warum die Alternative kein Stilproblem, sondern ein
Laufzeitfehler ist.** `requireHelferSitzung` wird aus `helfer/layout.tsx` gerufen, und das ist eine
**Server Component**. `cookies()` ist dort versiegelt: `delete`, `set` und `clear` sind durch einen
Proxy ersetzt, der wirft
(`next/dist/server/web/spec-extension/adapters/request-cookies.js:53` trägt den Satz „Cookies can only
be modified in a Server Action or Route Handler" wörtlich, `:171` hängt den Riegel an
`cookies().delete`; nachgeschlagen im Arbeitsbaum, Next 16.2.11). **Entschieden: ein Route Handler,
kein Streichen der Zusage.** Er kostet eine Datei mit zwölf Zeilen und macht aus einer unhaltbaren
Zusage eine geprüfte.

**Vier Bauformentscheidungen, jede gegen einen benannten Befund:**

1. **WARUM NICHT UNTER `t/`.** `t/[code]/route.ts` ist ein dynamisches Segment, und ein
   `t/abmelden/route.ts` daneben **gewönne** zwar (statisch schlägt dynamisch), legte aber eine Falle
   in einen Pfad, der auf **laminierten Kärtchen** steht. `/abmelden` steht auf keinem Gegenstand und
   ist deshalb frei wählbar (§2.7).
2. **WARUM GET UND KEINE SERVER ACTION.** Der Aufrufer ist ein `redirect()` aus einer Server
   Component — die kann keine Action auslösen. Der **freiwillige** Weg bleibt davon unberührt:
   `beenden` in `_actions/sitzung.ts` ist und bleibt eine Server Action hinter einem POST (§3.8.2,
   Ausnahme 3).
3. ⚠️ **EIN `<Link href="/abmelden">` IST HIER FALSCH.** Nexts Prefetch fordert das Ziel beim bloßen
   Darüberfahren an und beendete die Sitzung **ungefragt**. Wer je einen sichtbaren Abmelden-Weg
   baut, nimmt das POST-Formular auf `beenden`.
4. ⚠️ **ANGENOMMENE RESTLÜCKE, benannt statt weggeschrieben:** ein GET-Endpunkt, der ein Cookie
   räumt, ist von fremden Seiten auslösbar (ein `<img src=…>` genügt; `SameSite=Lax` verhindert das
   Setzen des `Set-Cookie` nicht). Der Schaden ist genau: die Helferin muss ihr Kärtchen erneut
   eingeben — und §7.4.4 fängt das **inline** ab, ohne die gezählten Mengen zu verlieren. **Ein
   CSRF-Token auf einem Abmeldeweg wäre teurer als der Schaden.**

**`helferCookieOptionen(0)` statt `cookies.delete(...)`.** Die Attribute müssen beim Löschen
**dieselben** sein wie beim Setzen (`path`, kein `domain`, §3.4.2), und die eine Funktion, die das
garantiert, gibt es schon. Es ist zugleich die Form, die `feedback` benutzt
(`m/feedback/actions.ts:638`: `set(name, "", { maxAge: 0, path: "/" })`). ⚠️ **Ein Löschen mit
abweichenden Attributen bleibt wirkungslos, und der Browser meldet das nicht** — die Sitzung sähe
weiterhin gültig aus, und `requireHelferSitzung` schickte bei jedem Aufruf erneut hierher: eine
Schleife aus zwei 303, die erst auffällt, wenn jemand das Protokoll liest.

**Der `Location` ist RELATIV, und das ist Absicht.** RFC 7231 §7.1.2 erlaubt eine relative Referenz
im `Location`-Kopf; der Browser löst sie gegen die angefragte URL auf — also gegen den Host, unter dem
gescannt wurde, **dieselbe Herkunft, auf die `antwort.cookies.set` das Cookie legt**. Cookie und
Landung können damit **konstruktiv** nicht auseinanderfallen. ⚠️ **`NextResponse.redirect(new
URL(ziel, req.url))` wäre hier ausdrücklich FALSCH:** `NextResponse.redirect` verlangt eine
**absolute** URL, und `req.url` trägt in der Suite nach dem Host-Rewrite die **interne** Adresse
(`m/files/_lib/hostRolle.ts:137-139` schreibt genau das aus). Ein `Location` mit interner Herkunft
ist der cross-origin-Sitzungsverlust in einer anderen Gestalt.

- [ ] **Schritt 1: `abmelden/route.ts` schreiben**

⚠️ **Dieser Task hat KEINEN Unit-Test.** Ein Route Handler ist ohne Next-Laufzeit nur mit einem
Nachbau prüfbar, der mehr behauptet als er zeigt; die Zusage (303, `Set-Cookie` mit `Max-Age=0`,
**ohne** `Domain=`) ist eine Aussage über die **Antwort** und wird deshalb in Schritt 3 mit einem
**echten Abruf** genommen. Das ist dieselbe Ebene, die §12.4 für jede angefasste Route verlangt.

```ts
import { NextResponse } from "next/server";
import { lagerbuchHostOderNull } from "../_lib/host";
import { HELFER_COOKIE, helferCookieOptionen } from "../_lib/helferSitzung";
import { istGateGrund } from "../_lib/gateTexte";

export const dynamic = "force-dynamic";

/**
 * DER EINZIGE WEG, auf dem ein totes Helfer-Cookie unfreiwillig verschwindet.
 * Aeusserer Pfad: /abmelden
 *
 * WARUM ES IHN GIBT — gemessen, nicht vermutet: `requireHelferSitzung` wird aus
 * `helfer/layout.tsx` gerufen, und das ist eine SERVER COMPONENT. `cookies()` ist
 * dort versiegelt: delete, set und clear sind durch einen Proxy ersetzt, der
 * wirft (`next/dist/server/web/spec-extension/adapters/request-cookies.js:53`
 * traegt den Satz „Cookies can only be modified in a Server Action or Route
 * Handler" woertlich, `:171` haengt den Riegel an `cookies().delete`;
 * nachgeschlagen im Arbeitsbaum, Next 16.2.11). Ein `cookies().delete(...)` an
 * der Stelle, an der der Sperrbefund auffaellt, ist also nicht „unsauber",
 * sondern ein LAUFZEITFEHLER.
 *
 * WARUM NICHT UNTER `t/`: `t/[code]/route.ts` ist ein dynamisches Segment, und
 * ein `t/abmelden/route.ts` daneben gewaenne zwar (statisch schlaegt dynamisch),
 * legte aber eine Falle in einen Pfad, der auf laminierten Kaertchen steht.
 * `/abmelden` steht auf keinem Gegenstand und ist deshalb frei waehlbar (§2.7).
 *
 * WARUM GET UND KEINE SERVER ACTION: der Aufrufer ist ein `redirect()` aus einer
 * Server Component — die kann keine Action ausloesen. Der freiwillige Weg bleibt
 * davon unberuehrt: `beenden` in `_actions/sitzung.ts` ist und bleibt eine
 * Server Action hinter einem POST (§3.8.2, Ausnahme 3).
 *
 * ⚠️ EIN `<Link href="/abmelden">` IST HIER FALSCH: Nexts Prefetch fordert das
 * Ziel beim blossen Darueberfahren an und beendete die Sitzung ungefragt. Wer je
 * einen sichtbaren Abmelden-Weg baut, nimmt das POST-Formular auf `beenden`.
 *
 * ⚠️ ANGENOMMENE RESTLUECKE, benannt statt weggeschrieben: ein GET-Endpunkt, der
 * ein Cookie raeumt, ist von fremden Seiten ausloesbar (ein `<img src=…>`
 * genuegt; `SameSite=Lax` verhindert das Setzen des `Set-Cookie` nicht). Der
 * Schaden ist genau: die Helferin muss ihr Kaertchen erneut eingeben — und
 * §7.4.4 faengt das inline ab, ohne die gezaehlten Mengen zu verlieren. Ein
 * CSRF-Token auf einem Abmeldeweg waere teurer als der Schaden.
 */
export async function GET(req: Request) {
  const kopf = new Headers(req.headers);

  /*
   * `lagerbuchHostOderNull`, NICHT `requireLagerbuchHost`: ein `notFound()`-Wurf
   * ist im Antwortweg eines Route Handlers keine brauchbare Antwort
   * (`m/files/_lib/hostRolle.ts:30-32`). Der Handler baut seine 404 selbst (§2.6).
   */
  if (!lagerbuchHostOderNull(kopf)) return new Response("Not found", { status: 404 });

  /*
   * GESCHLOSSENER SATZ, NIE DURCHGEREICHT (§3.9). Ein `searchParams`-Wert ist
   * Nutzereingabe, und er landet hier in einem `Location`-Kopf — dort schuetzt
   * keine React-Entkommung.
   */
  const roh = new URL(req.url).searchParams.get("grund");
  const grund = istGateGrund(roh) ? roh : null;

  /*
   * RELATIVER `Location`, und das ist Absicht. RFC 7231 §7.1.2 erlaubt eine
   * relative Referenz; der Browser loest sie gegen die angefragte URL auf, also
   * gegen den Host, unter dem gescannt wurde — DIESELBE Herkunft, auf die
   * `antw.cookies.set` das Cookie legt. Cookie und Landung koennen damit
   * konstruktiv nicht auseinanderfallen.
   *
   * ⚠️ `NextResponse.redirect(new URL(ziel, req.url))` waere hier FALSCH: das
   * verlangt eine ABSOLUTE URL, und `req.url` traegt in der Suite nach dem
   * Host-Rewrite die INTERNE Adresse (`m/files/_lib/hostRolle.ts:137-139`).
   *
   * 303 statt 302: die Antwort auf ein GET, das eine Wirkung hatte, ist ein
   * „See Other" — dieselbe Form wie in `t/[code]/route.ts` (§7.2.3).
   */
  const antw = new NextResponse(null, {
    status: 303,
    headers: { Location: grund ? `/?grund=${grund}` : "/" },
  });

  /*
   * `helferCookieOptionen(0)` statt `cookies.delete(...)`: die Attribute muessen
   * beim Loeschen DIESELBEN sein wie beim Setzen (path, kein domain, §3.4.2), und
   * die eine Funktion, die das garantiert, gibt es schon. Dieselbe Form benutzt
   * `feedback` (`m/feedback/actions.ts:638`).
   *
   * ⚠️ Ein Loeschen mit abweichenden Attributen bleibt WIRKUNGSLOS, und der
   * Browser meldet das nicht: die Sitzung saehe weiterhin gueltig aus, und
   * `requireHelferSitzung` schickte bei jedem Aufruf erneut hierher — eine
   * Schleife aus zwei 303, die erst auffaellt, wenn jemand das Protokoll liest.
   */
  antw.cookies.set(HELFER_COOKIE, "", helferCookieOptionen(0));
  return antw;
}
```

- [ ] **Schritt 2: `.env.example` um die Lagerbuch-Zeilen ergänzen**

Die Werte sind §10.3 („Werte für Dev und E2E") wörtlich entnommen. **„Klein" ist hier kein zulässiger
Eintrag**, weil die Kopplungen aus §10.5 sonst greifen, bevor ein Test läuft.

```dotenv
# ── Modul lagerbuch ───────────────────────────────────────────────────────────
# Der Host-Riegel braeuchte die Variable nicht (er trifft <key>.localtest.me ohne
# jede Env, §2.6) — aber die Zahlen-Boot-Pruefungen aus §10.5 haengen an
# prodHostsFor(...).length > 0, und der Zwei-Host-E2E aus §12.2 ist sonst nicht
# darstellbar.
SUITE_HOST_LAGERBUCH=lagerbuch.localtest.me

# Muss gesetzt und nicht leer sein: eine LEERE Liste gewaehrt NICHTS, und weil
# der Suite-Admin-Kurzschluss fuer dieses Modul bewusst nicht gilt, waere die
# Folge ein stummes 404 fuer ALLE Verwaltenden (§10.5, Pruefung 5).
SUITE_ADMIN_GROUP_LAGERBUCH=lagerbuch_nutzer

# ⚠️ SUITE_ACCESS_GROUP_LAGERBUCH wird NICHT gesetzt — ein gesetzter Wert bricht
# ab Teil 3 den Boot ab (§2.5 Punkt 3, §10.5 Pruefung 6). Das Modul kennt genau
# EINE Zugriffsstufe, und die liest ausschliesslich SUITE_ADMIN_GROUP_LAGERBUCH.

# Eigenes Geheimnis (Entscheidung 11a). Beim Cutover WERTGLEICH aus der
# produktiven stack.env (HELFER_SESSION_SECRET) uebernehmen — der Schluesselname
# aendert sich, der Wert nicht.
# ⚠️ NICHT gleich AUTH_SECRET: dieselbe Signatur fuer Suite- und Helfer-Sitzung
# hebt die Domaenentrennung auf, die das eigene Geheimnis begruendet.
LAGERBUCH_HELFER_SITZUNG_SECRET=e2e-helfer-secret-nicht-produktiv-32z

LAGERBUCH_VERFALL_ROT_TAGE=31
LAGERBUCH_VERFALL_GELB_TAGE=56
LAGERBUCH_HELFER_SITZUNG_STUNDEN=12

# Der Sperrtest braucht eine erreichbare Grenze; bei 5 sind es sechs Fehleingaben.
LAGERBUCH_GATE_VERSUCHE_PRO_ABSENDER_PRO_MIN=5
# >= ABSENDER: der Absendertest darf die Gesamtbremse nicht ausloesen und damit
# die Ursache verwischen.
LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_MIN=30
LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE=300
```

⚠️ **`playwright.config.ts` bekommt DIESELBEN Werte — aber erst in Teil 3** (§12.6, Teil 1s
Abschlusstabelle). Wer sie hier schon einträgt, arbeitet in einer fremden Datei.

- [ ] **Schritt 3: Der ABRUF — die einzige Prüfung, die diese Zusage nehmen kann**

```bash
pnpm build && pnpm start &
sleep 8
```

```bash
curl -sS -D - -o /dev/null \
  -H "Host: lagerbuch.localtest.me" \
  "http://localhost:3000/m/lagerbuch/abmelden?grund=gesperrt"
```

Erwartet, Zeile für Zeile:

| Erwartung | Warum sie einzeln zählt |
|---|---|
| `HTTP/1.1 303 See Other` | nicht 302, nicht 200 |
| `location: /?grund=gesperrt` | **relativ**, ohne Schema und ohne Host — ein absoluter Wert trüge die interne Adresse |
| `set-cookie: helfer_session=; ... Max-Age=0` | das eigentliche Löschen |
| **kein `Domain=`** im `set-cookie` | die Zeile, die Playwright gegen einen Host **nicht** sehen kann (Falle 19) |
| `Path=/`, `HttpOnly`, `SameSite=Lax` | dieselben Attribute wie beim Setzen — sonst bleibt das Löschen wirkungslos |

```bash
# Ein unbekannter Grund darf NICHT durchgereicht werden.
curl -sS -D - -o /dev/null -H "Host: lagerbuch.localtest.me" \
  "http://localhost:3000/m/lagerbuch/abmelden?grund=%3Cimg%20src%3Dx%3E"
```

Erwartet: `location: /` — **ohne** `?grund=`. Steht der rohe Wert im Kopf, ist `istGateGrund`
umgangen worden.

```bash
# Fremder Suite-Host: 404 VOR jeder Wirkung.
curl -sS -D - -o /dev/null -H "Host: feedback.localtest.me" \
  "http://localhost:3000/m/lagerbuch/abmelden?grund=gesperrt"
```

Erwartet: `HTTP/1.1 404` und **kein** `set-cookie`.

```bash
kill %1
```

⚠️ **Protokolliere die drei Antworten im Commit-Text.** Sie sind der einzige Beleg dieses Tasks; ein
Playwright-Fall dafür entsteht erst in Teil 6 (§3.8.3), weil er eine gesperrte Token-Zeile und damit
den Seed aus Teil 3 braucht.

- [ ] **Schritt 4: Gates und Commit**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run
git add src/app/m/lagerbuch/abmelden/route.ts .env.example
git commit -m "feat(lagerbuch): abmelden/route.ts — die Tuer fuer tote Helfer-Cookies

requireHelferSitzung laeuft in einer Server Component, und dort ist cookies()
VERSIEGELT: delete/set/clear sind durch einen Proxy ersetzt, der wirft
(request-cookies.js:53,171, Next 16.2.11). Ein delete an der Stelle, an der der
Sperrbefund auffaellt, ist kein Stilproblem, sondern ein Laufzeitfehler — und
die Playwright-Zusage aus §3.8.3 pruefte eine Zusage, die die vorgeschriebene
Bauform nicht halten kann.

Zwoelf Zeilen, und aus einer unhaltbaren Zusage wird eine gepruefte.

Nicht unter t/: dort steht ein dynamisches Segment, und ein t/abmelden legte
eine Falle in einen Pfad, der auf laminierten Kaertchen steht. GET statt Action:
der Aufrufer ist ein redirect() aus einer Server Component. Kein <Link> — Nexts
Prefetch beendete die Sitzung beim Darueberfahren.

helferCookieOptionen(0) statt cookies.delete: die Attribute muessen beim Loeschen
dieselben sein wie beim Setzen, sonst bleibt es wirkungslos und der Browser
meldet nichts.

Relativer Location, kein NextResponse.redirect(new URL(..., req.url)) — req.url
traegt nach dem Host-Rewrite die INTERNE Adresse.

Der Grund kommt aus dem geschlossenen Satz und wird nie durchgereicht.

Abgerufen (kein Unit-Test kann das):
  303 · location: /?grund=gesperrt (relativ)
  set-cookie: helfer_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax
  KEIN Domain=  — die Zeile, die Playwright gegen einen Host nicht sehen kann
  ?grund=<img src=x> → location: / ohne grund
  Host feedback.localtest.me → 404, kein set-cookie

.env.example um die neun Lagerbuch-Zeilen ergaenzt (§10.3);
SUITE_ACCESS_GROUP_LAGERBUCH bleibt bewusst ungesetzt. playwright.config.ts
bekommt dieselben Werte erst in Teil 3."
```

---

**Gate Stufe 3.**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

⚠️ **Und die Modulebenen-Probe aus Gate Stufe 2, unverändert.** Sie bleibt die Prüfung, die §10.8,
Eigenschaft 3 sieht — `pnpm build` wird dafür erst in Teil 4 tragend, wenn die ersten Seiten diese
Dateien importieren:

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET \
  pnpm exec tsx -e 'Promise.all([
    import("./src/app/m/lagerbuch/_lib/grenzen.ts"),
    import("./src/app/m/lagerbuch/_lib/helferSitzung.ts"),
    import("./src/app/m/lagerbuch/_lib/gateSchranke.ts"),
  ]).then(() => console.log("alle drei Modulebenen ohne Secrets ausgewertet"))
    .catch(e => { console.error("UNERWARTET geworfen:", e.name, e.message); process.exit(1); })'
```

⚠️ **`helferZugang.ts` kommt hier NICHT dazu, obwohl es in dieser Stufe entstanden ist.** Es liest auf
Modulebene keine einzige Umgebungsvariable, zieht aber über `_db/client` das `better-sqlite3` und dazu
`next/headers`/`next/navigation` — außerhalb einer Next-Laufzeit kann davon etwas aus Gründen werfen,
die mit lagerbuchs Env-Behandlung nichts zu tun haben. Dieselbe Begründung wie für `zugang.ts` in
Gate Stufe 2.

⚠️ **`pnpm build` ist ab dieser Stufe teilweise tragend**, weil `abmelden/route.ts` eine echte Route
ist und `_lib/host.ts`, `_lib/helferSitzung.ts` und `_lib/gateTexte.ts` mitzieht. **`grenzen.ts`,
`gateSchranke.ts`, `zugang.ts` und `helferZugang.ts` sind es noch nicht** — deshalb bleibt die
Import-Probe daneben stehen.

⚠️ **`pnpm exec playwright test` ist auch hier nicht fällig**, obwohl mit `/abmelden` die erste Route
dieses Teils entstanden ist. Der E2E-Aufbau — zweiter Host, Gate-Zahlen, Sitzungsgeheimnis,
Admin-Gruppe, Seed-Schritt — gehört zu **Teil 3** (§12.6). Der Abruf aus T26, Schritt 3 ist die
Ebene, die hier tatsächlich verfügbar ist, und er deckt genau die eine Zusage, die keine Sitzung
braucht.

---

## Welle 4 — Abnahme (1 Task)

---

### Task 27: Die Abnahme von Teil 2 — Bauform, Naht und Abruf

**Files:**
- Modify: keine. **Nur Ausführung und Protokoll.**

**Interfaces:**
- Consumes: alles aus T15–T26.
- Produces: die Aussage „§3 ist eingelöst", ohne die Teil 3 nicht beginnen sollte.

**Abnahme, nicht TDD.** Dieser Task prüft zusammengesetztes Verhalten, das zum Zeitpunkt seiner
Entstehung schon gebaut ist. Er ist von Anfang an grün, und das ist **kein** Mangel. **Was er fängt**,
sind vier Mutationen, gegen die kein einzelner Task-Test etwas ausrichtet, weil sie **zwischen** den
Dateien liegen:

| Mutation | Warum kein Task-Test sie fängt |
|---|---|
| Ein Riegel und ein Prädikat, die **verschieden** heißen (`istLagerbuchAdmin` hier, `istAdmin` dort) | Jeder Test importiert genau den Namen, den seine Datei exportiert — Uneinheitlichkeit ist für ihn unsichtbar |
| Ein Redirect-Ziel in `helferZugang.ts`, für das es in `abmelden/route.ts` **keinen** Handler gibt | Beide Tests sind grün: der eine prüft den String, der andere die Antwort auf einen anderen String |
| Eine `_lib`-Datei, die den Scan aus T21 **umgeht**, weil sie nach dem Scan entstand | Der Scan läuft über den Baum, wie er zur Laufzeit ist — aber niemand fährt ihn nach dem letzten Commit noch einmal bewusst |
| Ein `console.warn`, das im Betrieb **flutet**, weil die Deduplizierung beim Refactor wegfiel | Beide Dedup-Tests prüfen je **eine** Funktion; dass es **drei** Log-Stellen gibt, weiß nur diese Liste |

- [ ] **Schritt 1: Die vier Gates fahren — und die Modulebenen-Probe daneben**

```bash
pnpm typecheck && pnpm lint && pnpm vitest run && pnpm build
```

```bash
env -u LAGERBUCH_HELFER_SITZUNG_SECRET -u SUITE_ADMIN_GROUP_LAGERBUCH \
  pnpm exec tsx -e 'Promise.all([
    import("./src/app/m/lagerbuch/_lib/grenzen.ts"),
    import("./src/app/m/lagerbuch/_lib/helferSitzung.ts"),
    import("./src/app/m/lagerbuch/_lib/gateSchranke.ts"),
  ]).then(() => console.log("alle drei Modulebenen ohne Secrets ausgewertet"))
    .catch(e => { console.error("UNERWARTET geworfen:", e.name, e.message); process.exit(1); })'
```

Erwartet: beides grün.

⚠️ **Genau diese drei Dateien und keine weitere.** Sie sind die einzigen mit einem
Modulebenen-Zugriff auf die Umgebung. `zugang.ts` und `helferZugang.ts` haben keinen, ziehen aber
`NextAuth(authConfig)` bzw. `better-sqlite3` und `next/headers` nach — ein Wurf von dort wäre ein
Artefakt des Laufs außerhalb von Next und **nicht** vom echten Befund zu unterscheiden. Wer sie „der
Vollständigkeit halber" ergänzt, tauscht ein Signal gegen Rauschen.

⚠️ **Warum die zweite Zeile ein `tsx`-Import ist und kein `pnpm build`.** Bis Teil 4 importiert von
den fünf Dateien nur `helferSitzung.ts` überhaupt eine Route (`abmelden/route.ts`); die anderen vier
liegen in einem Private Folder und werden von Next **gar nicht übersetzt**. Ein
`env -u … pnpm build` liefe hier trivial grün und wäre ein Schritt, der etwas behauptet, das er nicht
geprüft hat — **und ein späterer Plan nähme ihn für bare Münze.** Der ausdrückliche Import wertet die
Modulebene wirklich aus und ist damit die einzige Prüfung, die einen Modul-Singleton mit
Pflichtvariable sieht (§10.8, Eigenschaft 3). Ab Teil 4 übernimmt `pnpm build` diese Rolle von
selbst.

- [ ] **Schritt 2: Die Produces-Namen gegeneinander prüfen**

```bash
grep -rnE "^export (async )?function |^export const |^export type |^export interface |^export class " \
  src/app/m/lagerbuch/_lib/ src/app/m/lagerbuch/abmelden/ | grep -v ".test.ts"
```

Erwartet — **genau diese Namen**, und jeder genau einmal. Abweichungen sind Planfehler, keine
Geschmacksfragen:

| Datei | Exporte |
|---|---|
| `grenzen.ts` | `GrenzenUngueltig`, `Grenzen`, `grenzen`, `ZAHL_NAMEN`, `helferSitzungGeheimnis` |
| `absender.ts` | `absenderAus` |
| `code.ts` | `normalisiereCode` |
| `gateTexte.ts` | `GateGrund`, `GATE_GRUENDE`, `istGateGrund`, `gateMeldung` |
| `returnTo.ts` | `sanitizeReturnTo` |
| `tokenZiel.ts` | `tokenZielPfad` |
| `helferSitzung.ts` | `HELFER_COOKIE`, `HelferPayload`, `HelferSitzung`, `createHelferSitzung`, `verifyHelferSitzung`, `helferGueltigkeitSekunden`, `helferCookieOptionen` |
| `zugang.ts` | `Viewer`, `viewerAusSession`, `viewerOderNull`, `istLagerbuchAdmin`, `_resetGemeldeteGruppen`, `verwaltungsZiel`, `requireLagerbuchAdmin`, `adminLandingPfad` |
| `konto.ts` | `merkeNutzer`, `_resetNamenlosGemeldet` |
| `gateSchranke.ts` | `gateGesperrt`, `gateFehlversuchBuchen` |
| `helferZugang.ts` | `HelferZugang`, `SperrGrund`, `helferZugangOderNull`, `requireHelferSitzung`, `requireHelferSchreibend` |
| `abmelden/route.ts` | `dynamic`, `GET` |

⚠️ **Drei Namenspaare, die auseinanderzulaufen drohen und es nicht dürfen:**
`istLagerbuchAdmin` (nicht `istAdmin`, nicht `isLagerbuchAdmin`) · `requireHelferSitzung`
(nicht `requireHelfer`, das ist der **Alt**-Name aus `lagerbuch/src/actions/session.ts:22`) ·
`createHelferSitzung`/`verifyHelferSitzung` (nicht `…Session`, das ist der Alt-Name).

```bash
# Kein Alt-Name hat ueberlebt.
grep -rn "requireHelfer\b\|createHelferSession\|verifyHelferSession\|helferCookieOptions\|consumeRate\|clientIp\b\|helferGateDecision\|verwaltungCordonDecision\|kontoAusLogin" \
  src/app/m/lagerbuch/ || echo "OK — kein Alt-Name im Modul"
```

Erwartet: `OK — kein Alt-Name im Modul`.

- [ ] **Schritt 3: Die Naht zwischen `helferZugang.ts` und `abmelden/route.ts` prüfen**

```bash
grep -n "abmelden" src/app/m/lagerbuch/_lib/helferZugang.ts
ls src/app/m/lagerbuch/abmelden/route.ts
```

Erwartet: zwei Redirect-Ziele (`/abmelden?grund=gesperrt`, `/abmelden?grund=abgelaufen`) und ein
existierender Handler. **Diese Naht ist ein String, kein Import** — deshalb kann kein Typecheck sie
halten und deshalb steht sie hier.

```bash
# Beide Gruende stehen im geschlossenen Satz.
grep -o 'grund=[a-z]*' src/app/m/lagerbuch/_lib/helferZugang.ts | sort -u
grep -n 'GATE_GRUENDE' src/app/m/lagerbuch/_lib/gateTexte.ts
```

Erwartet: `grund=abgelaufen` und `grund=gesperrt`, beide in `GATE_GRUENDE` enthalten. Ein Grund
außerhalb des Satzes würde von `istGateGrund` in `/abmelden` **stumm verworfen**, und die Helferin
landete ohne Meldung am Gate — genau Falle 60, nur an einer neuen Stelle.

- [ ] **Schritt 4: Die drei `console.warn`-Stellen zählen**

```bash
grep -rn "console\." src/app/m/lagerbuch/ | grep -v ".test.ts"
```

Erwartet: **genau drei** Treffer, und zwar diese:

| Datei | Zweck | Dedup |
|---|---|---|
| `_lib/zugang.ts` | fehlende Gruppe — **ohne** Kennung | ja, je `sub` je Prozess |
| `_lib/konto.ts` | `name` **und** `email` `null` — **mit** Kennung | ja, je `sub` je Prozess |
| `_lib/konto.ts` | Upsert fehlgeschlagen, mit Exception | **nein**, bewusst |

⚠️ **Eine vierte Zeile ist ein Befund, keine Ergänzung.** Der Riegel liegt auf einem 404-Pfad, den ein
Bot beliebig oft treffen kann; jede undeduplizierte Zeile dort ist ein Flutungsvektor und macht
`docker logs` für genau den Zweck unbrauchbar, für den die Zeilen da sind.

- [ ] **Schritt 5: Die beiden Scans bewusst noch einmal fahren**

```bash
pnpm vitest run src/app/m/lagerbuch/_lib/bauform.test.ts \
                src/app/m/lagerbuch/_actions/guards.test.ts
```

Erwartet: grün. **Der Punkt ist nicht das Ergebnis, sondern der Zeitpunkt** — die Scans laufen über
den Baum, wie er **jetzt** ist, nach allen elf Commits. Eine `_lib`-Datei, die nach T21 entstand und
den Scan umgeht, fällt nur hier auf.

- [ ] **Schritt 6: Der Abruf gegen einen laufenden Server**

```bash
pnpm build && pnpm start &
sleep 8
```

**a) `/abmelden` — die drei Zeilen aus T26 noch einmal, jetzt gegen den Endstand:**

```bash
curl -sS -D - -o /dev/null -H "Host: lagerbuch.localtest.me" \
  "http://localhost:3000/m/lagerbuch/abmelden?grund=abgelaufen"
```

Erwartet: `303`, `location: /?grund=abgelaufen` (relativ),
`set-cookie: helfer_session=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax`, **kein `Domain=`**.

**b) Der Host-Riegel des Handlers:**

```bash
curl -sS -D - -o /dev/null -H "Host: feedback.localtest.me" \
  "http://localhost:3000/m/lagerbuch/abmelden"
```

Erwartet: `404`, **kein** `set-cookie`.

**c) Der Boot ist unbeschädigt:**

```bash
curl -sS "http://localhost:3000/api/health/lagerbuch"
```

Erwartet: dieselbe Antwort wie nach Teil 1. ⚠️ **Diese Zeile ist kein Selbstzweck:** T15 fügt eine
Datei hinzu, die `process.env` liest, und T24 ruft sie auf **Modulebene**. Wäre dort eine Pflicht
ohne Vorbelegung gelandet, bräche nicht nur lagerbuch, sondern **der Start des ganzen Containers** —
portal, qr, feedback und files inklusive (Falle 50).

```bash
kill %1
```

- [ ] **Schritt 7: Das Protokoll schreiben**

Die Ergebnisse aus den Schritten 1–6 in den Abnahme-Commit. **Ohne Protokoll ist die Abnahme eine
Behauptung**, und genau davon soll dieser Task die Spec-Kapitel befreien.

```bash
git commit --allow-empty -m "chore(lagerbuch): Abnahme Teil 2 — der Zugang ist eingeloest

Gates gruen, zweimal: mit und ohne Secrets in der Umgebung. Der zweite Lauf ist
der einzige, der einen Modul-Singleton mit Pflichtvariable sieht (§10.8, E3).

Exportnamen gegeneinander geprueft; kein Alt-Name hat ueberlebt (requireHelfer,
createHelferSession, helferCookieOptions, consumeRate, clientIp,
helferGateDecision, verwaltungCordonDecision, kontoAusLogin — alle weg).

Die Naht helferZugang → /abmelden ist ein STRING, kein Import: beide Gruende
(gesperrt, abgelaufen) stehen im geschlossenen Satz aus gateTexte.ts, der Handler
existiert. Kein Typecheck haelt diese Kante.

Genau drei console.warn-Stellen, zwei davon dedupliziert je Person je Prozess.
Eine vierte waere ein Befund, keine Ergaenzung — der Riegel liegt auf einem
404-Pfad.

Beide Scans nach allen elf Commits noch einmal bewusst gefahren.

Abgerufen: /abmelden 303 mit relativem Location und Max-Age=0 ohne Domain;
fremder Suite-Host 404 ohne set-cookie; /api/health/lagerbuch unveraendert — der
Modulebenen-grenzen()-Aufruf in gateSchranke.ts haette sonst den Start des
GANZEN Containers gebrochen, nicht nur lagerbuch."
```

---

## 5. Abschluss-Abnahme von Teil 2

Bevor Teil 3 beginnt, muss **alles** hiervon zutreffen:

- [ ] Alle 13 Tasks (T15–T27) sind eingecheckt, jeder mit eigenem Commit.
- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm vitest run` und `pnpm build` sind grün — **und die
      Modulebenen-Probe per `pnpm exec tsx` ohne Secrets ebenfalls.** ⚠️ **Ein `env -u … pnpm build`
      allein zählt hier NICHT**: bis Teil 4 importiert nur `abmelden/route.ts` überhaupt eine
      `_lib`-Datei, alles andere übersetzt Next gar nicht.
- [ ] `_lib/bauform.test.ts` läuft grün — **mit `absender.ts`, `zugang.ts` und ihren Testdateien im
      Baum**, deren Kommentare bzw. Testfälle die verbotenen Zeichenfolgen ausdrücklich enthalten.
      Das belegt, dass `ohneKommentare()` und die `*.test.ts`-Ausnahme greifen.
- [ ] `_lib/bauform.test.ts` ist **fünfmal rot gesehen worden** (isAdmin, Suite-Admin-Funktionen,
      `x-forwarded-for`, `"use client"`, Riegel in einer Weiche) — jedes Mal mit einer Verletzung im
      **Code**, nicht in einem Kommentar.
- [ ] `_actions/guards.test.ts` läuft grün, toleriert das leere `_actions/` und ist **zweimal rot
      gesehen worden** (ungeschützte Action, Action in Pfeilform). **Nicht** in der Liste gestanden
      haben dabei: zwei exportierte Typen, eine bewachte Action **und eine bewachte Action mit
      destrukturiertem erstem Parameter** — der Fall, an dem eine Klammertiefen-lose Fassung auf
      korrektem Code rot würde.
- [ ] Die `domain`-Zusicherung in `_lib/helferSitzung.test.ts` ist einmal rot gesehen worden.
- [ ] Die UPDATE-Regel in `merkeNutzer` ist einmal rot gesehen worden, und der **Modulzyklus**
      zwischen `zugang.ts` und `konto.ts` ebenfalls.
- [ ] Der Kurzschluss in `gateFehlversuchBuchen` ist einmal rot gesehen worden.
- [ ] Der fehlende Lesepfad-Recheck in `helferZugang.ts` ist einmal rot gesehen worden — **er ist das
      Verhalten von heute.**
- [ ] Der Abruf von `/abmelden` ist protokolliert: **303**, **relativer** `Location`, `Max-Age=0`,
      **kein `Domain=`**, fremder Host **404 ohne `set-cookie`**.
- [ ] `.env.example` trägt die neun Lagerbuch-Zeilen, und `SUITE_ACCESS_GROUP_LAGERBUCH` steht
      **nicht** darunter.
- [ ] Der Gegenprobe-Lauf aus T22, Schritt 6 ist gefahren worden: mit einem Modul-Singleton statt
      des Thunks wirft `import("…/_lib/helferSitzung.ts")` ohne Secret **beim Import** ein
      `GrenzenUngueltig`. ⚠️ **Ab Teil 4 ist genau das ein gebrochener `pnpm build`**, und die
      Ursache stünde in einer Datei, die niemand verdächtigt.
- [ ] Der Gegenprobe-Lauf aus T24, Schritt 6 ist gefahren worden: ein **ungültiger** Wert
      (`…PRO_ABSENDER_PRO_MIN=fuenf`) wirft beim Import von `gateSchranke.ts`, eine **fehlende**
      Variable nicht. Der Unterschied ist die ganze Pointe der Vorbelegungen.

---

## 6. Was dieser Teil ausdrücklich NICHT liefert und wo es liegt

Damit Teil 3 nichts für erledigt hält — und damit die Abwesenheit jedes Punktes als **Entscheidung**
lesbar ist statt als Versehen.

| Fehlt | Wo es entsteht |
|---|---|
| `_lib/grenzen.ts`: **`grenzenFehler(env)`** (die Boot-Liste, §10.5 Prüfungen 1–4) und die drei reinen Konstanten `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` | **Teil 3** (§10.3, §10.5) — ⚠️ **ERGÄNZUNG in der vorhandenen Datei, es entsteht keine zweite Zahlen-Tabelle** (Festlegung G1). §10.8, Eigenschaft 1: `grenzen()` und `grenzenFehler()` lesen aus **derselben** `ZAHLEN`-Konstante |
| `_lib/boot.ts` (`lagerbuchBootFehler()`), der Haken in `assertHostConfig()`, und darin die Prüfungen 5 (`SUITE_ADMIN_GROUP_LAGERBUCH` gesetzt) und 6 (`SUITE_ACCESS_GROUP_LAGERBUCH` **nicht** gesetzt) | **Teil 3** (§10.5) — ⚠️ **für diese Naht gibt es kein Kopplungsnetz**: ohne den Haken existiert `_lib/boot.ts`, wird aber nie gerufen, und **nichts wird rot**. Bis dahin ist die Abwesenheit von `requiredGroupsFor` in `zugang.ts` die ganze Zusage gegen die zweite Tür |
| `_lib/marke.ts` (§10.2), `_lib/grenzen.test.ts` um die Kopplungsfälle | Teil 3 (§10) |
| `playwright.config.ts`: `SUITE_HOST_LAGERBUCH`, die drei Gate-Zahlen, das Sitzungsgeheimnis, die Admin-Gruppe, der Seed-Schritt und der **zweite Host** | **Teil 3** (§12.6) — ⚠️ **ohne den zweiten Host sind die beiden Host-Zeilen aus §3.8.3 nicht durchführbar** und der Host-Riegel bleibt unbewiesen; dann gilt §3.8.1 Zeile 1 als einzige Absicherung, und das ist ausdrücklich **zu wenig für die Zeile mit der Datenwirkung** |
| `_lib/domain/*`, `_lib/lesepfade/*`, `_lib/schreibpfade/*`, `_lib/konstanten`-Erweiterungen | Teil 3 (§5) |
| **Die sieben Playwright-Fälle aus §3.8.3** — gültiger Code auf dem eigenen Host, `/t` auf fremdem Host (mit `last_used_at` unverändert `NULL`), `/verwaltung` auf fremdem Host, Suite-Admin ohne Gruppe → 404 **und kein Navigationseintrag**, Sperrung während laufender Sitzung (die **Kette aus zwei 303**, mit `page.waitForURL` **und** Antwortprotokoll), gesperrter Code an einer schreibenden Action (deutsche Meldung, kein Absturz), Gate mit gesperrtem Code (benannte Meldung statt stummer Landung) | **Teil 6** (die E2E-Dateien) auf dem Harness aus **Teil 3**. Sechs davon brauchen eine Sitzung oder einen Seed, zwei brauchen den zweiten `baseURL` |
| `_lib/actionTypen.ts` (`HelferGrund`, `HelferErgebnis<T>`) | **Teil 4** (§7.3) — ⚠️ **verbindlich (Festlegung G7):** `export type HelferGrund = SperrGrund \| "leer" \| "netz";` mit `import type { SperrGrund } from "./helferZugang";`. **Keine zweite Literal-Union für dieselben zwei Wörter.** `"netz"` entsteht nie serverseitig — es ist der Grund, den der Client im `catch` selbst setzt |
| `_lib/bauform.test.ts`: der **`usePathname`-Scan** (§7.8.2) und die **Verschärfung** der Weichen-Zeile von „falls die Datei existiert" auf Existenzpflicht | **Teil 4** — ⚠️ **ERGÄNZUNG in der vorhandenen Datei, keine zweite Scan-Datei** (Festlegung G2) |
| Das Gate `page.tsx`, `/t/[code]/route.ts`, `/a/[artikelId]/page.tsx`, `/g/[code]/page.tsx`, `helfer/layout.tsx`, der Fahrzeug-Check, `_ui/BarcodeScanner.tsx` — also **jede Aufrufstelle** der Riegel dieses Plans | Teil 4 (§7) — ⚠️ **Die Riegel dieses Plans sind bis dahin gebaut und ungerufen.** Das ist gewollt (dieselbe Lage wie T6s Manifest-Verweis in Teil 1), aber es heißt auch: **kein Test dieses Plans belegt, dass sie am richtigen Ort stehen.** Das belegen `_lib/bauform.test.ts`, `_actions/guards.test.ts` und die Abrufe aus §12.4 — alle drei erst mit den Dateien, die sie prüfen |
| `_actions/gate.ts` (`einloesenAmGate`), `_actions/sitzung.ts` (`erneuereSitzung`, `beenden`) — die **drei Ausnahmen** der Guard-Liste | Teil 4 (§7.2.4, §7.4.4) — sie tragen statt eines Riegels `requireLagerbuchHost` **und** die Gate-Schranke aus T24 |
| Der **Payload-Schnitt** des Fahrzeug-Checks (§3.4.5): heute wandert die komplette Bestückung **aller** aktiven Fahrzeuge in den RSC-Payload jedes Helfer-Aufrufs | **Teil 4** (§7.9.1) — ⚠️ **Der Anlass steht in §3 und damit hier:** ohne Zugriffsgrenze am Token ist die Payload-Größe die **einzige** verbleibende Begrenzung dessen, was ein gefundenes Kärtchen preisgibt. **Kein Gate findet das** — die Seite ist korrekt, typkorrekt und schnell, solange die Testdaten klein sind. Und sie hat ein Zeitfenster: der Flow wird für antd ohnehin angefasst, nachrüsten hieße, ihn ein zweites Mal umzubauen |
| Die 24 Verwaltungsseiten, `_ui/*`, `_lib/nav.ts`, `_lib/ampel.ts`, die `.modulnav`-Reparatur | Teil 5 (§6) — ⚠️ **es gelten F2 und F3 aus Teil 1:** die Route-Groups heißen `(arbeit)` und `(druck)`, es gibt **kein** `verwaltung/layout.tsx`, und **beide** Group-Layouts rufen `requireLagerbuchHost` **und** `requireLagerbuchAdmin` |
| Etiketten, Druckansicht, CSV/Excel/Zwischenablage, `error.tsx`, die E2E-Dateien, **die ZÄHLUNG in `_actions/guards.test.ts`** (47 = 44 + 3, 18 Dateien, 19 Verzeichniseinträge) | Teil 6 (§8, §9, §11, §12) — ⚠️ **es gelten F2 und F3 aus Teil 1.** Fällt `requireLagerbuchAdmin` aus `verwaltung/(druck)/layout.tsx`, sind die gedruckten Zugangs-Codes **im Klartext öffentlich** — und Route-Group-Grenzen sind keine Sicherheitsgrenzen |
| Der Cutover selbst: `users`-Bereinigung über die Klarnamen, gefilterte `users`-Übernahme, Import, Runbook | **Spec 2** (§1.3) — ⚠️ **nicht mit diesem Plan verwechseln.** Der `sub`-Bruch **innerhalb** von lagerbuch (Befund 1, §4.13) ist enumerierbare Arbeit an echten Daten, keine Strukturentscheidung |

---

## 7. Was §3 ausdrücklich NICHT entscheidet — und deshalb auch hier fehlt

Diese Punkte stehen in den Kapiteln dieses Plans **als Nicht-Entscheidung**. Sie fehlen also mit
Absicht, und ihre Abwesenheit ist keine Lücke, die ein späterer Teil schließt:

- **Das Setzen von `TZ`** (§3.12) — suiteweiter Eingriff in den Betrieb von vier Modulen (§1.5). Das
  Modul rechnet die Zone im Code (`_lib/zeit.ts`, Teil 1) und hängt bewusst **nicht** an der
  Prozess-`TZ`.
- **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts:103-105`** (§3.6.2) — eigene
  `core`-Entscheidung; für lagerbuch **nicht nötig**, weil die Funktion nicht benutzt wird. ⚠️ Was
  daraus für lagerbuch folgt und im Runbook stehen muss: **genau diese Rückfallebene gibt es für
  lagerbuch nicht.** Ein falsch gesetztes `SUITE_ADMIN_GROUP_LAGERBUCH` sperrt jede verwaltende
  Person aus, und der einzige Weg zurück ist eine `.env`-Änderung auf dem Server. Der `console.warn`
  aus T23 ist die Diagnose dafür, die Boot-Prüfung aus Teil 3 die Vorbeugung.
- **Die suiteweite Frage, ob `/m/*` gegatet wird** (§3.2.4) — eigene Suite-Spec; der Symptomfund
  `iuk-ue.de/m/beta` steht schon in `KONSOLIDIERUNG-PROGRESS.md`. Für lagerbuch genügt der
  modulinterne Host-Riegel.
- **Jede Änderung an `core/ratelimit.ts`** (§3.5.4) — begründet: die vier laufenden Module stehen
  hinter Cloudflare, wo `clientIpAus` **richtig** ist; `core/ratelimit.test.ts:46-49` friert die
  Erst-Eintrag-Auswertung ausdrücklich ein; und die `core`-Regel verlangt einen zweiten, heute
  belegbaren Nutznießer — den gibt es nicht, weil kein anderes Modul ein Gate mit einem
  sechsstelligen Klartext-Secret hat.
- **`tokens.scope_lagerort_id` als Riegel** (§3.10) — wäre eine echte Verhaltensänderung: Codes, die
  heute im ganzen Bestand arbeiten, könnten danach nur noch ihr Fahrzeug bedienen. Das muss der
  Betreiber wollen und zur physischen Verteilung der Etiketten passen. Bis dahin gilt: **der
  Helfer-Token trägt keine Zugriffsgrenze** (§3.4.5). ⚠️ **Die Spalte bleibt trotzdem im Schema**
  (§4.12, Teil 1).
- **Ein modul-eigener `session.error`-Riegel** (§3.6.5) — `session.error` wird gesetzt
  (`core/auth/refresh.ts:277,286`), aber serverseitig von **keinem** Riegel gelesen; ausgewertet wird
  es allein in der Client-Komponente `components/providers.tsx:64`. Für lagerbuch ist das schärfer
  als für die anderen Module, weil Gate, `/helfer`, `/a` und `/t` sinnvollerweise **ohne** die
  Suite-Provider gerendert werden — dort greift der Client-Guard gar nicht. **Entschieden:
  hingenommen, ohne Gegenmaßnahme im Modul.** Der Zustand ist selten und selbstheilend, und ein
  modul-eigener Riegel wäre die **dritte** Stelle mit einer eigenen Meinung über Sitzungsgültigkeit.
  Der Punkt steht hier, damit sein Fehlen eine Entscheidung ist.
- **Die `callback-url`-`maxAge` in `core/auth/cookies.ts`** (§3.6.6) — `lagerbuch/src/auth.config.ts:73-83`
  überschreibt sie mit ausgeschriebener Begründung (mobile Browser und PWAs räumen reine
  Session-Cookies beim Wechsel in den IdP-Kontext weg); `core/auth/cookies.ts:33-40` lässt `maxAge`
  bewusst auf dem Auth.js-Default — genau den Zustand, den lagerbuch behoben hat. Es gibt **keine**
  Kollision mit `authCookies()`. **Nicht Teil dieser Spec, aber ein benannter Posten für die Suite**
  (§15).
- **Ein Route Handler, der beim Cutover die ALT-Cookies löscht** (§3.10) — löste ein Problem, das es
  nur in einem der beiden Cutover-Zweige gibt, und dort löst es **eine Zeile im Runbook**. ⚠️ **Nicht
  zu verwechseln mit `/abmelden`** (T26): der ist kein Cutover-Werkzeug, sondern der laufende
  Betriebsweg für ein totes Cookie — und er existiert, weil eine Server Component keins löschen kann,
  nicht weil ein Cutover-Zweig es nötig machte.
- **Ein `jti` und ein Einzel-Widerruf je Sitzung** (§3.4.3) — ein Code wird von mehreren Menschen
  gleichzeitig benutzt, „diese eine Sitzung" ist fachlich **keine Einheit**. Ein `jti` hätte darum
  keinen Leser.
- **Eine gleitende Sitzungsverlängerung** (§3.4.3) — das Cookie ist der Stellvertreter des
  laminierten Kärtchens. Ein gleitendes Fenster machte aus einem **verlorenen** Kärtchen einen
  **dauerhaften** Schlüssel. ⚠️ Das schließt einen Knopf, der den Code **neu abfragt**, ausdrücklich
  **nicht** aus — §7.4.4 baut genau den, inline im Abschlussbereich des Fahrzeug-Checks; er
  durchläuft dieselbe Rate-Schranke, dieselbe Normalisierung und dieselbe Protokollzeile wie das
  Gate. Ausgeschlossen ist allein die Verlängerung **ohne** Code.

---

## 8. Was dieser Teil dem Runbook schuldet (§3.11)

Keine dieser Angaben steht im Repo, und keine blockiert den Bau. Sie gehören ins Cutover-Runbook
(Spec 2) und sind hier vollständig, damit sie nicht zwischen den Plänen verlorengehen.

| Eingabe | Warum sie nicht im Repo steht — und was sie entscheidet |
|---|---|
| ⚠️ **Ist der Alt-Host zeichengleich mit `SUITE_HOST_LAGERBUCH` (`lagerbuch.iuk-ue.de`)?** | `lagerbuch/compose.yaml:11` liest `${APP_BASE_URL}` aus der gitignorierten `stack.env`. **Diese eine Angabe entscheidet zwei Dinge zugleich:** ob Betreiber-Entscheidung 4 für die Helfer-Sitzungen überhaupt trägt (das Cookie ist **host-only** — bei abweichendem Host überlebt **keine** Sitzung, gleich welches Geheimnis), und ob die Cookie-Kollision unten eintritt. **Die Entscheidungen dieses Plans ändern sich in keinem der beiden Zweige, nur ihr Nutzen.** Weicht der Host ab, gehört in die Cutover-Kommunikation der Satz „alle Helfer müssen ihr Kärtchen einmal neu scannen" |
| ⚠️ **Abmeldung der Verwaltenden auf dem Alt-Stack VOR dem Freeze** | Nur nötig, wenn die Hosts identisch sind. Die Alt-Anwendung setzte ihr Auth.js-Session-Cookie **host-only** auf demselben Namen, den die Suite mit `Domain=.iuk-ue.de` führt; danach stehen **zwei gleichnamige Cookies** nebeneinander. **Symptom:** die Anmeldung scheint nicht zu greifen, und ein erneuter Login behebt es **nicht**. **Abhilfe:** Website-Daten für diesen Host löschen. **Vorbeugung:** einmal auf dem Alt-Stack abmelden (der Knopf existiert, `src/app/verwaltung/(admin)/layout.tsx:25`). ⚠️ **Nicht zu „Website-Daten löschen" ausweiten** — das zerstörte genau die `helfer_session`-Cookies, die der Betreiber erhalten wollte. Die Klasse ist **belegt, nicht vermutet**: `core/auth/cookies.ts:5-31` schreibt den produktiv erlittenen Vorfall aus |
| ⚠️ **`HELFER_SESSION_SECRET` aus der produktiven `stack.env`** → als `LAGERBUCH_HELFER_SITZUNG_SECRET` in die Suite-`.env`, über **`env_file`** | Betreiber-Entscheidung 4. **Nicht als `${VAR:?…}`-Zeile unter `environment`:** die hielte den **ganzen** Stack an, sobald das Image mit lagerbuch ankommt und die `.env`-Zeile noch fehlt — vier unbeteiligte Module im Fenster zwischen Merge und Cutover (§10.6). Der Riegel ist stattdessen die **bedingte** Boot-Prüfung aus Teil 3. **Und in den Abbau-Teil:** das Geheimnis lebt danach an zwei Stellen auf demselben Server; wird der Alt-Stack abgebaut, ohne die alte Datei zu löschen, bleibt ein **gültiges Sitzungsgeheimnis** in einer Datei liegen, die niemand mehr pflegt |
| ⚠️ **`AUTH_SECRET` der Suite bleibt UNVERÄNDERT** | Guardrail, in keiner Richtung verhandelbar. Der Fehlerfall ist: alle Nutzer von portal, qr, feedback und files auf einen Schlag abgemeldet — **für einen Nutzen, den es nicht gibt.** Lagerbuchs Alt-JWT trägt `token.isAdmin`, aber **kein** `token.groups`; der Session-Callback der Suite liest ausschließlich `token.groups`, ein entschlüsselbares Alt-Token ergäbe also `groups: []`, und `istLagerbuchAdmin` antwortete `false`. Die Verwaltungs-Sitzungen überleben den Cutover ohnehin, weil die **Suite-Sitzung nie ungültig wird** |
| ⚠️ **Produktiver Wert von `OIDC_ADMIN_GROUP`** → `SUITE_ADMIN_GROUP_LAGERBUCH` | Im Repo steht nur der Default `lagerbuch_nutzer`. **Ein falscher Wert sperrt ALLE Verwaltenden aus**, und es gibt für dieses Modul bewusst keine Suite-Admin-Rückfallebene (§3.6.2). Die Boot-Prüfung aus Teil 3 fängt den **leeren**, nicht den **falschen** Wert |
| ⚠️ **`select count(*) from tokens where aktiv = 1`** | Bestimmt, ob `LAGERBUCH_GATE_FEHLVERSUCHE_GESAMT_PRO_STUNDE = 300` trägt. Liegt die Zahl oberhalb von etwa 60, gehört der Wert gesenkt — die Tabelle in T24 rechnet es vor |
| ⚠️ **Den direkten Weg an Cloudflare vorbei schließen** — und gegenprüfen | Solange er offen ist, ist der Absenderschlüssel fälschbar und **nur die beiden modulweiten Zähler tragen**. Der Riegel dagegen ist kein Code, sondern eine **Netzentscheidung**: kein Host-Port-Mapping am Suite-Dienst (`iuk-suite/compose.yaml` führt für `suite` heute keins), Traefik-Entrypoint nur aus den Cloudflare-Bereichen erreichbar. **Gegenprobe:** von einem Rechner im lokalen Netz gegen den Entrypoint anfragen, mit gesetztem `CF-Connecting-IP`; erwartet wird **keine Antwort**. Bleibt der Weg bewusst offen, steht die Restlücke ausgeschrieben in der Cutover-Übergabe |
| ⚠️ **Ein `quelle_id` mit `quelle_typ='oidc'` aus der produktiven `lagerbuch.db` gegen den Suite-`sub` derselben Person** | ✅ Die **Client**-Frage ist entschieden (`subject_types_supported: ["public"]`, §4.13). Die Stichprobe bleibt trotzdem: sie prüft die **vorhandenen Zeilen**, nicht die Ausstellung von heute. ⚠️ **Der Paritätscheck beantwortet die Frage NICHT** — er beweist den Rundlauf, nicht die Richtigkeit der Zuordnung, und ist in beiden Fällen grün |
| ⚠️ **Wie viele `users`-Zeilen auf eine Zufalls-UUID geschlüsselt sind, und für wie viele Personen es KEINE Zeile unter ihrem echten `sub` gibt** | Der Umfang der Bereinigung aus §4.13, Befund 1 (`f2b515b` am 29.07.2026, Freeze fünf Tage später). Zwei `SELECT count(*)`. Ohne die Zahlen ist der Posten weder planbar noch abzuschätzen. ⚠️ **Dieselbe Altlast ist in der Suite selbst noch unbereinigt** — die Bereinigung wird **einmal** entworfen und auf **beide** Bestände angewandt; zweimal entworfen ergäbe zwei Verfahren, die dieselben Personen unterschiedlich zuordnen |
| ⚠️ **Eine bestehende `helfer_session` aus einem laufenden Browser gegen die neue Instanz halten** | Erwartet: **keine** erneute Code-Eingabe. Das ist die einzige Prüfung, die belegt, dass `LAGERBUCH_HELFER_SITZUNG_SECRET` wirklich den alten Wert trägt — und sie trägt nur, wenn der Host zeichengleich ist |
| **`TZ=Europe/Berlin`** | Die Spec rechnet mit diesem Wert. Das Setzen selbst ist ein suiteweiter Schritt mit eigener Prüfung gegen vier laufende Module und **nicht Teil dieser Spec**. ⚠️ **Für lagerbuch selbst ist er nicht tragend** — die Zone steht als Modulkonstante im Code (Teil 1, T3) |
