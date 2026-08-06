# Abschluss-Review Branch `feat/lagerbuch-modul-teil4` — Blickrichtung Zugang, Sitzung, Datenhoheit

**Base** `b1254e5` · **Head** `49a77c6` · 44 Commits · 63 Dateien, +16.056/−31
**Paket:** `.superpowers/sdd/2026-08-03-lagerbuch-modul-teil4/review-b1254e5..49a77c6.diff` (796 KB,
mit dem vorgegebenen Kommando erzeugt; abschnittsweise plus gezielte Lesungen im Arbeitsbaum)
**Read-only:** kein Schreibzugriff auf Arbeitsbaum, Index, HEAD oder Branch. `git status --porcelain`
war vor und nach dem Review leer. Keine Testläufe nötig (jede Frage war statisch entscheidbar).

**Urteil:** ein Important-Befund. Der Zugangs-, Sitzungs- und Cookie-Apparat ist ansonsten sauber
und an den Stellen, die ein task-enges Review strukturell nicht sehen konnte, belastbar.

---

## 1. Was gut gemacht ist

Das sind keine Höflichkeiten — jede Zeile ist am eingecheckten Code nachgesehen.

1. **Host-Bindung durch Konstruktion statt durch eine Liste.** `requireHelferSitzung`
   (`_lib/helferZugang.ts:136`) und `requireHelferSchreibend` (`:173`) rufen `requireLagerbuchHost`
   als erste Anweisung selbst. Die vier Konsumenten (`helfer/layout.tsx:43`, `helfer/page.tsx:36`,
   `helfer/check/page.tsx:59`, `_actions/check.ts:92`, `_actions/buchung.ts:247`) rufen ihn deshalb
   *nicht* noch einmal — und `bauform.test.ts:417-418` (T87) nagelt das für `helfer/layout.tsx`
   mit einem `not.toMatch` fest, statt die Gegenzusage zu zementieren.

2. **Der DB-Recheck steht auf JEDEM Pfad, nicht nur vor Schreibvorgängen.** `befund()`
   (`_lib/helferZugang.ts:84-85`) liest `tokens.aktiv` bei jeder Anfrage neu. Damit ist eine
   Sperrung sofort wirksam — sowohl lesend als auch schreibend —, und ein manipuliertes `tokenId`
   in einem gültig signierten Cookie verhält sich wie ein gesperrter Code.

3. **Die Rückgabewert-Auswertung ist nicht nur behauptet, sondern verhaltensgeprüft.**
   Beide Aufrufstellen werten aus (`_actions/check.ts:93`, `_actions/buchung.ts:248`) — und beide
   Testdateien tragen den Fall mit einer *schreibenden* Nutzlast (`check.test.ts:198-214`,
   `buchung.test.ts:380-388`), nicht mehr nur den Schreibweisen-Scan, den das T75-Review zu Recht
   als Important gemeldet hatte. Das ist die Klasse Befund, an der der Branch hätte scheitern können.

4. **Die drei Guard-Ausnahmen sind genau drei, jede einzeln begründet, und mechanisch eingefroren.**
   `_actions/guards.test.ts:49` (`AUSNAHMEN`) plus der Test „die Ausnahmeliste hat GENAU DREI
   Eintraege". Die Begründungen tragen: `einloesenAmGate` und `erneuereSitzung` *erzeugen* die
   Sitzung, `beenden` muss auch eine tote Sitzung noch räumen können. Der Scan liest über
   `ohneKommentareUndZeichenketten()` — ein Kommentar mit dem Riegelnamen zählt nicht als Beleg.
   Der invertierte Allowlist-Test darunter fängt zusätzlich `export { d }`, `export default` und
   `export const f = async fd => …`, also die vier Bauformen, gegen die eine Muster-Erkennung
   still blind gewesen wäre.

5. **Kein `"use server"` außerhalb von `_actions/`.** Über den ganzen Modulbaum geprüft: vier
   Dateien, alle in `_actions/`. Es gibt keine Inline-Action in einer Seite oder Insel, die dem
   Guard-Scan entkäme.

6. **Kein `notFound()` auf einem Weg, den jemand mit einem gedruckten Gegenstand in der Hand nimmt.**
   Modulweit exakt zwei Fundstellen: `_lib/host.ts:49` (der Host-Riegel selbst, ausdrücklich erlaubt)
   und `_lib/zugang.ts:257` (Verwaltung, `requireLagerbuchAdmin`, angemeldeter Weg). Die
   Kärtchen-/Etiketten-Wege bauen ihre Antwort selbst: `t/[code]/route.ts:38` (eigene 404),
   `abmelden/route.ts:51`, die fünf PWA-Handler über `hostAbweisung` (`_lib/hostRiegel.ts:33`).
   Der Deep-Link `/a/<id>` antwortet auf einen unbekannten Artikel mit **HTTP 200 und einem Satz**
   (`a/[artikelId]/page.tsx:114-121`, `LeerZustand`), nicht mit einer 404 — genau die Entscheidung
   8-C.

7. **Das Cookie ist host-only, und das ist ausgeschrieben statt vorausgesetzt.**
   `helferCookieOptionen` (`_lib/helferSitzung.ts:137-145`) führt **kein** `domain`, dazu
   `httpOnly`, `sameSite: "lax"`, `path: "/"`, `secure` aus `NODE_ENV`. Die 30-Zeilen-Begründung
   davor benennt die falsche Vorlage (`core/auth/cookies.ts:46-59`) namentlich.
   `helferSitzung.test.ts:225,228-232` hält Schlüsselmenge, `httpOnly`, `sameSite` und `path`;
   `:264` hält, dass Löschen dieselben Attribute benutzt wie Setzen.

8. **Cookie und Landung stehen auf DERSELBEN Antwort.** `t/[code]/route.ts:94-96` baut erst die
   303-Antwort, setzt das Cookie darauf und gibt sie zurück. Das `Location` ist **relativ**
   (`antwort()`, `:127-129`) und wird bewusst nicht aus `req.url` oder einer Basis-Variablen gebaut —
   der Kommentar rechnet den Bruch (Cookie auf Host A, Landung auf Host B) vollständig durch.
   In `_actions/gate.ts:91-99` und `_actions/sitzung.ts:97-101` läuft `cookies().set(…)` vor dem
   `redirect()` in derselben Action-Antwort.

9. **`beenden` löscht mit denselben Attributen, mit denen gesetzt wurde** (`_actions/sitzung.ts:151`,
   `helferCookieOptionen(0)` statt `cookies().delete`). Die Begründung ist gemessen, nicht vermutet:
   Nexts `delete(name)` erzeugt ein `Set-Cookie` ohne `Path`, der Browser scopet es auf das
   Verzeichnis der Anfrage — der Knopf sähe wie ein Erfolg aus, und die Sitzung stünde noch.

10. **`sanitizeReturnTo` (`_lib/returnTo.ts`) ist vollständig.** Sechs Ablehnungen: fehlendes
    führendes `/`, `//`, `/\`, `:`, und — die Härtung, die über die Alt-App hinausgeht — Tab/CR/LF,
    weil der WHATWG-Parser diese Zeichen *überall* im String entfernt und `"/\t/boese.example"`
    sonst cross-origin würde. Beide Konsumenten benutzen sie (`_actions/gate.ts:51`,
    `t/[code]/route.ts:45`), und `page.tsx:94` baut daraus über `new URL(sauber, ziel)` einen
    absoluten Wert, dessen Origin damit konstruktiv die des Moduls ist.

11. **Die Objekt-Zugehörigkeit wird in `checkAbschluss` für alle Kind-IDs serverseitig aufgelöst.**
    Vier Würfe gegen die Datenbank: Soll-Position (`_actions/check.ts:153`), Gerät (`:198`),
    Flasche (`:212`), Verfalls-Artikel (`:255`) — jeweils gegen die Menge, die *am angegebenen
    Fahrzeug* hängt, nie gegen die Nutzlast. Kein URL-Parameter entscheidet über Zugehörigkeit.

12. **T87 hat die zwei Eigenschaftsform-Scans wirklich in die Existenzpflicht überführt.**
    `bauform.test.ts:1003-1011` (B2) vergleicht `flaechen()` gegen `GATE_FLAECHEN` — und die
    Existenzpflicht sitzt auf `flaechen()`, das *zweimal* filtert (Existenz **und**
    `einloeseAbschnitt() !== null`). Damit ist die Auflage aus T66 („ein
    `import { redeemToken as einloesen }` machte den Reihenfolge-Scan still stumm") mechanisch
    geschlossen, und mit ihr N-2 (die stille Normalisierungslücke). Der neue Baum-Scan
    (`bauform.test.ts:352-375`) hält für **jeden** `route.ts` des Moduls die nicht-werfende Form,
    über `ohneKommentareUndZeichenketten` — er ersetzt damit zwei schwächere Scans aus T82 und T86
    (siehe Triage unten).

13. **Die `callbackUrl`-Weiche (B3) hält, was sie soll.** `login-form.tsx:248-250` prüft über
    `suiteRedirect` statt über `startsWith("/")`. Nachgerechnet:
    - `//fremd.example/` → `url.startsWith("//")` schließt den Relativ-Zweig aus
      (`core/auth/redirect.ts:41`), `new URL("//fremd.example/")` **wirft** ohne Basis → `baseUrl`.
    - `javascript:alert(1)` → parst, aber `target.protocol !== base.protocol` (`:52`) → `baseUrl`.
    - `http://boese.example/…` → Protokoll passt, Host nicht, `moduleForHost` sagt nein (`:54`) →
      `baseUrl`.
    - `/\evil.example` (ein Backslash) → bleibt im Relativ-Zweig; gemessen mit der WHATWG-URL:
      `new URL("http://<origin>/\evil.example")` ergibt `host: <origin>`, `pathname: //evil.example`.
      Die Autorität steht fest, bevor der Pfad geparst wird. Kein Redirect.
    Alle vier Klassen sind in `login-form.test.tsx:100-142` als Verhalten geprüft, nicht als Scan.
    `env: {}` ist die richtige Wahl und im Kommentar begründet (`SUITE_HOST_*` existiert im
    Browser-Bundle nicht).

---

## 2. Befunde

### B-1 (Important) — `checkAbschluss` prüft `fahrzeugId` selbst nicht gegen die Datenbank, während die Seite es tut und die Schwester-Action es vormacht

**Fundstelle:** `src/app/m/lagerbuch/_actions/check.ts:118` (zwischen `const v = geparst.data;` und
der Transaktion ab `:131`) — der fehlende fünfte Riegel.
Gegen `src/app/m/lagerbuch/helfer/check/page.tsx:62,78-80` und
`src/app/m/lagerbuch/_actions/buchung.ts:181-185`.

**Der Befund.** `CheckSchema` (`check.ts:31`) verlangt von `fahrzeugId` nur `z.string().min(1)`.
Danach wird der Wert **ungeprüft** benutzt als:

- Filter für die Soll-Positionen (`:135`),
- `lagerortId` der Bestandskorrektur (`:170`, `korrekturAufLagerort`),
- **`nachLagerortId` einer echten Umlagerung aus dem Handlager** (`:177`, `umlagerung`),
- `lagerortId` der Verfalls-Schreibung (`:257`),
- `fahrzeugId` der geschriebenen `checks`-Zeile (`:270`).

Alle **vier** Kind-IDs werden gegen die Datenbank aufgelöst; die Wurzel-ID nicht. Weder
`_lib/schreibpfade/umlagerung.ts` noch `_lib/schreibpfade/korrektur.ts` prüfen `typ` oder `aktiv`
nach — das ist dort korrekt so, sie erwarten einen validierten Aufrufer.

Die Asymmetrie ist im selben Branch belegt, zweimal:

- **Die Seite schützt bewusst genau davor.** `helfer/check/page.tsx:62` filtert
  `fahrzeugListe(db).filter((f) => f.aktiv)`, und `:78-80` löst `?fz=` **nur** gegen diese Liste
  auf. Der Kommentar `:75-77` sagt wörtlich: „Ein `?fz=` auf eine unbekannte oder stillgelegte
  Zeile faellt hier still durch — sonst laedt eine geratene ID die Daten eines stillgelegten
  Fahrzeugs."
- **Die Schwester-Action macht genau die fehlende Prüfung.** `_actions/buchung.ts:181-185`:
  `if (!ziel || ziel.typ !== "fahrzeug" || !ziel.aktiv) throw new Error("Ziel ist kein gültiges,
  aktives Fahrzeug");` — mit der Begründung, dass sonst der Fremdschlüssel entschiede und „ein
  INAKTIVES Fahrzeug und ein zweites LAGER ganz durchkämen: beide existieren."

**Warum das trägt — der Mechanismus, der es sichtbar macht.** Der entscheidende Punkt ist, dass
`sollPositionen` eine Stilllegung **überleben**: `lagerorte.aktiv` ist ein reines Flag
(`_db/schema.ts:37`), und der einzige Schreiber von `sollPositionen` im ganzen Modul ist
`_lib/schreibpfade/templateSync.ts` (:81/:101/:116/:122), der an Template-Änderungen hängt, nicht
am `aktiv`-Flag. Ein stillgelegtes Fahrzeug behält also seine komplette Soll-Bestückung — und
damit läuft die Nutzlast **durch alle vier bestehenden Würfe hindurch**.

**Ehrlich zur Auslösbarkeit — heute fehlt der Riegel, bevor der Schreibpfad existiert.** Ich habe
gesucht und **keinen** Weg gefunden, der `lagerorte.aktiv` auf `false` setzt:
`grep -rn "update(lagerorte)" src/` liefert null Treffer im ganzen Repo, und in `_actions/` wie in
`_lib/schreibpfade/` gibt es keinen Schreiber auf `lagerorte`. Die Fahrzeug-Verwaltung ist Teil 5
und wurde durch die Entscheidung vom 06.08. bewusst **nicht** in diesen Branch gezogen. Damit gilt
heute:

1. **Auslösbar ist die `typ`-Hälfte sofort.** Ein `lagerorte`-Eintrag mit `typ: "lager"` existiert
   bereits (der Handlager ist einer), und die Prüfung fehlt vollständig. Sie greift, sobald ein
   solcher Lagerort Soll-Positionen trägt — was die Verwaltungsseite in Teil 5 weder verbietet noch
   heute jemand prüft.
2. **Die `aktiv`-Hälfte ist noch nicht auslösbar, aber vorprogrammiert.** Sobald Teil 5 die
   Stilllegung baut, entsteht der Betriebsfall von selbst: Ein Fahrzeug-Check ist laut
   `_actions/sitzung.ts:29-33` „zehn bis zwanzig Minuten Arbeit", der gesamte Zustand liegt im
   Client (`CheckFlow.tsx`) und wird nicht nachgeladen. Legt die Verwaltung das Fahrzeug in diesem
   Fenster still, trägt die Nutzlast beim Tippen auf „Abschließen" die veraltete `fahrzeugId` — und
   `checkAbschluss` nimmt sie an. Echter Bestand verlässt dann das Handlager
   (`umlagerung(HANDLAGER_ID → v.fahrzeugId)`) in ein Fahrzeug, das dieselbe Anwendung im selben
   Moment verweigert anzuzeigen. Dasselbe gilt für eine ID, die ein Helfer aus der `?fz=`-URL
   vorgehalten hat.

**Warum trotzdem Important und nicht „später":** die Prüfung fehlt an der Stelle, an der der Plan
sie in der Schwester-Action ausdrücklich verlangt und begründet hat, und der Kommentarapparat
dieser Datei behauptet zweimal, hier sei alles beisammen („MEHR BRAUCHT ES DANN NICHT"). Wird der
Riegel jetzt nicht gesetzt, ist er in Teil 5 kein Bau mehr, sondern eine Reparatur an einer Datei,
die als abgenommen gilt — genau die Form von Schuld, die dieser Plan sonst konsequent vermeidet.
Nicht Critical, weil heute kein Weg existiert, der ihn scharf stellt.

Der Fremdschlüssel auf `lagerorte.id` (`schema.ts:217`) fängt allein den frei erfundenen String ab —
nicht die falsche Art und nicht den stillgelegten Eintrag.

**Was das *nicht* ist.** Falle 14 („ein Fahrzeug-Code kann JEDES Fahrzeug checken",
`check.ts:99-100`, `helfer/check/page.tsx:68-69`) ist eine Betreiberentscheidung über die
*Reichweite unter aktiven Fahrzeugen*. Sie sagt nichts über stillgelegte Lagerorte und nichts über
`typ`. Beide `ANSATZPUNKT`-Kommentare behaupten überdies „MEHR BRAUCHT ES DANN NICHT" — die dort
skizzierte Zeile (`if (scope && scope !== v.fahrzeugId) …`) würde `typ`/`aktiv` ebenfalls nicht
prüfen. Der Satz gehört mitkorrigiert, sonst zementiert er die Lücke für Teil 5.

**Fix (klein, in der Form, die die Datei schon kennt).** Vor `db.transaction` in `check.ts:131`:

```ts
const fz = db.select().from(lagerorte).where(eq(lagerorte.id, v.fahrzeugId)).get();
if (!fz || fz.typ !== "fahrzeug" || !fz.aktiv) {
  return {
    ok: false,
    grund: "eingabe",
    text: "Dieses Fahrzeug ist nicht mehr aktiv. Bitte die Seite neu laden.",
  };
}
```

Ein **Rückgabewert**, kein Wurf: die Stilllegung während eines Checks ist eine erwartbare Lage im
Sinn von Falle 66 (anders als die vier Zugehörigkeits-Würfe, die „manipuliert" abdecken), und
`grund: "eingabe"` ist genau der Wert, den Betreiberentscheidung B4 dafür geschaffen hat —
`darfErneuern("eingabe") === false` ist hier auch fachlich richtig. `lagerorte` muss dafür in den
Import aus `../_db/schema` (`check.ts:7-9`). Dazu: die zwei `ANSATZPUNKT`-Kommentare
(`check.ts:95-101`, `helfer/check/page.tsx:64-71`) um den Satz ergänzen, dass die Art- und
Aktiv-Prüfung **zusätzlich** zur Scope-Zeile gehört.

---

## 3. Ausdrücklich geprüft und sauber

Damit ein späterer Leser nicht dieselben Wege zweimal geht:

| Frage aus dem Auftrag | Ergebnis |
|---|---|
| IDOR über einen URL-Parameter | Keiner gefunden. `/a/[artikelId]` hat keine Zugehörigkeitsdimension (jeder Helfer sieht über `/helfer` ohnehin alle Artikel; `tokens.scopeLagerortId` ist per `_db/schema.ts:386-396` eine dokumentiert **tote Spalte**). `?fz=` wird gegen die DB-Liste aufgelöst. `t/[code]` ist der Code selbst, kein Verweis. |
| Nur drei Guard-Ausnahmen, und begründet | Ja — `guards.test.ts:49` + eigener Test; Begründungen tragen. |
| `requireHelferSchreibend`-Rückgabewert überall ausgewertet | Ja, an beiden Aufrufstellen, und beide sind **verhaltensgeprüft** mit einer schreibenden Nutzlast (`check.test.ts:198`, `buchung.test.ts:380`). |
| Doppelter `requireLagerbuchHost` | **Eine** Stelle: `a/[artikelId]/page.tsx:66` zusätzlich zu `helferZugang.ts:111` in `helferZugangOderNull`. Minor — Constraint 24 nennt namentlich nur `requireHelferSitzung`/`requireHelferSchreibend`, `helferZugangOderNull` ist buchstabengetreu konform. Kosten: ein zweites `await headers()`. Siehe Minor M-1. |
| Cookies host-only | Ja, `helferSitzung.ts:137-145`, kein `domain`, zusätzlich Quelltext-Zusicherung in `helferSitzung.test.ts:225`. |
| Cookie auf derselben Antwort wie die Landung | Ja — `t/[code]/route.ts:94-96`; Actions setzen vor `redirect()` in derselben Antwort. |
| `notFound()` auf einem Kärtchen-/Etiketten-Weg | Nein. Nur `host.ts:49` (erlaubt) und `zugang.ts:257` (Verwaltung). |
| Offene Weiterleitung in `login-form.tsx` | Nein, in allen vier geprüften Klassen. Siehe §1 Punkt 13. |

---

## 4. Triage der zurückgestellten Minor-Befunde

Der Auftrag verlangt eine Entscheidung, nicht eine Wiedergabe. Ich habe die ~100
`minor (deferred)`-Zeilen des Ledgers durchgesehen und die in meiner Blickrichtung liegenden
nachgemessen. **Keine davon muss vor dem Merge behoben werden.** Drei sind durch T87 bereits
erledigt, drei sind nachweislich überzogen und gehören abgestuft, der Rest ist korrekt zurückgestellt.

### 4.1 Durch T87 erledigt — im Ledger als „offen" stehengeblieben

- **T64: „B2-Scan hängt am Namen `redeemToken` → bei abweichendem Namen Namensliste nachziehen"**
  und **T66-Auflage: „ein `import { redeemToken as einloesen }` machte `einloeseAbschnitt` still
  null und den Reihenfolge-Scan stumm."** → **Erledigt.** `bauform.test.ts:1003-1011` vergleicht
  jetzt `flaechen().map(f => f.schluessel)` gegen `GATE_FLAECHEN`; eine Fläche, die ihr
  `redeemToken(` verliert, fällt aus `flaechen()` und macht diesen Test rot. Das T87-Review belegt
  es mit Mutation M4 (vorher: die drei Reihenfolge-Tests blieben grün).
- **T82: „`route.test.ts:419-422` — der positive Host-Scan liest `ohneKommentare` statt der
  string-strippenden Variante, zusätzlich fehlt `\s*\(`"** und **T86: „`pwa.route.test.ts:542` —
  dieselbe Bauform, die EINZIGE Zusicherung der Datei, die ohne ihre Regel grün bliebe."**
  → **Beide erledigt.** T87s Baum-Scan (`bauform.test.ts:352-375`) läuft über **jeden** `route.ts`
  des Moduls, liest über `ohneKommentareUndZeichenketten` und verankert die Klammer:
  `/\blagerbuchHostOderNull\s*\(|\bhostAbweisung\s*\(/`. Er hält zusätzlich `abmelden/route.ts`,
  das in keiner der beiden Nachbardateien stand.

### 4.2 Nachgemessen und abzustufen — der Befund ist überzogen

- **T66: „Schreibvorgang ist kein Compare-and-Set; cross-Prozess kann eine Sperrung zwischen
  `.get()` und `.run()` committen → 12-h-Sitzung für ein gerade gesperrtes Kärtchen."**
  → **Die 12-Stunden-Aussage stimmt nicht.** `befund()` (`_lib/helferZugang.ts:84-85`) liest
  `tokens.aktiv` bei **jeder** Anfrage neu, lesend wie schreibend. Das Rennen kann höchstens *ein*
  Cookie ausstellen; die damit gebaute Sitzung ist ab der nächsten Anfrage tot. Das Fenster ist
  eine Anfrage, nicht zwölf Stunden. Bleibt Minor, mit korrigierter Formulierung.
- **T82: „`route.test.ts:281` — `expect(cookie).toContain(\"Path=/\")` trägt seine Regel nicht,
  @edge-runtime setzt `Path=/` als Vorgabe."** → **Sachlich richtig, aber folgenlos.** `path` ist
  an der Stelle gedeckt, an der es hingehört: `helferSitzung.test.ts:228-232`
  (`expect(o.path).toBe("/")`) und `:264` (Löschen benutzt dasselbe `path` wie Setzen). Genau die
  Zusage, auf der die 15-Zeilen-Begründung von `beenden` (`_actions/sitzung.ts:134-151`) ruht, ist
  also getragen — nur nicht in der Datei, in der der Befund steht. Keine Nachbesserung.
- **T73/T74: die Cookie-Zusicherungen in `gate.test.ts:275-276` bzw. `sitzung.test.ts:293-294`
  prüfen `httpOnly`/`path`, aber nicht `sameSite`/`secure`.** → Gedeckt durch
  `helferSitzung.test.ts:225,228-232`. Regel 4 ist erfüllt, die Aussage liegt bei der Datei, die
  die Optionen erzeugt.

### 4.3 Korrekt zurückgestellt — nach dem Merge, nicht davor

- **Kein E2E für „gesperrter Token wird an der Buchung abgewiesen" (§3.8.3).** Das ist der
  größte strukturelle Rest in dieser Blickrichtung, und der Code sagt es selbst
  (`_lib/helferZugang.ts:150`, `check.ts:85-86`): „Das einzige Netz dagegen ist der E2E … und der
  liegt in Teil 6, T171." Nicht merge-blockend, weil der Branch das Netz inzwischen anders
  aufspannt — verhaltensgeprüfte Riegel-Tests in beiden Actions plus `guards.test.ts` als
  Vollständigkeits-Eigenschaft. Bleibt als Auflage an Teil 6.
- **T77: `Gate.tsx:515` `disabled={laeuft}` ungedeckt.** Betrifft den gemeinsamen
  Rate-Limit-Eimer (fünf Fehlversuche/Minute), nicht den Zugang selbst. Minor.
- **T81: `?grund=gesperrt` und `?grund=abgelaufen` werden auf dem Gate nicht gerendert.**
  Anzeige, kein Riegel. Minor.
- **T114: `db` als zweiter Parameter einer `"use server"`-Funktion.** Unabhängig nachgeprüft und
  bestätigt harmlos: über die RSC-Grenze kommen nur serialisierbare Daten an, ein untergeschobenes
  `db` hätte kein `.select` und endete im `TypeError` — der Riegel fällt **geschlossen** aus, weil
  `requireHelferSchreibend` seinen `requireLagerbuchHost` *vor* dem ersten DB-Zugriff fährt.
- Alles Übrige (Tap-Maß 44 vs. 56 px, `ohneKommentare()`-Kopien nicht zeichengleich, Zahlendreher
  in Berichten, `getComputedStyle`-Rauschen aus antd-Bestandstests) liegt außerhalb dieser
  Blickrichtung und ist im Ledger korrekt als Minor geführt.

---

## 5. Minors aus diesem Review

- **M-1** `a/[artikelId]/page.tsx:66` ruft `requireLagerbuchHost(await headers())`, obwohl
  `helferZugangOderNull` (`:70`) ihn intern als erste Anweisung fährt (`_lib/helferZugang.ts:111`).
  Kosten: ein zweites `await headers()` pro Anfrage. **Und es ist jetzt festgeschrieben:** T87s
  Weichen-Block (`bauform.test.ts:144-162`) verlangt den Bezeichner in dieser Datei — wer die
  Redundanz entfernt, macht den Test rot. Vertretbar (eine Weiche soll ihren Host-Riegel selbst
  tragen, unabhängig davon, welches Prädikat sie danach benutzt), aber es widerspricht dem Wortlaut
  von Constraint 24 für den benachbarten Fall und gehört einmal ausgeschrieben.
- **M-2** `bauform.test.ts:144-162` prüft nur das **Vorhandensein** von `requireLagerbuchHost(`,
  nicht die Position als erste Anweisung (§2.6). Eine Weiche, die den Riegel hinter `await getDb()`
  schöbe, bliebe grün. Für die PWA-Handler existiert `ersteRumpfanweisung`, für die Weichen nicht.
  Vom T87-Review bereits benannt.
- **M-3** `bauform.test.ts:367` akzeptiert `hostAbweisung(` als Erfüllung, ohne den
  `??`-Kurzschluss zu verlangen; für `abmelden/route.ts` (`if`-Form) hält den niemand.
- **M-4** **T87 ist abgeschlossen — es fehlt nur die Ledger-Zeile.** Entscheidung dieses
  Abschluss-Reviews, damit sie niemand neu aufrollt: Der einzige Important des T87-Reviews (B-1,
  „fünfzehn Neutrale" nicht gemessen) ist **dokumentarisch, nicht am Code**, und die Fix-Runde hat
  ihn behandelt (`task-87-fix1-logs`, Bericht §9.1). Die vom Reviewer verlangte Gegenzahl „zwölf"
  weist der Umsetzer mit drei unabhängigen Belegen zurück, und die Zurückweisung **hält**:
  15 = 12 Farben + 3 Schriftstapel, `bauform.test.ts:493` heißt selbst „traegt alle fuenfzehn
  Neutralen" und ist grün, und `task-64-report.md:71-72` hat denselben Schluss schon beim Bau
  gezogen. Der Kommentar `helfer.module.css:34` („die zwoelf Neutralen") beschriftet nur den
  Farbblock. → T87 gilt als abgenommen. Offen bleibt allein, dass `progress.md` mit „WELLE 8 (T87)
  + ABSCHLUSS-REVIEW beginnen" endet und die Zeilen `Task 87: complete` sowie das Gate der Welle 8
  nicht trägt. Das ist Ledger-Hygiene, kein Sachstand.
- **M-5** Vorbestand, nicht in diesem Diff: `_lib/zugang.ts:250` baut `proto` aus
  `x-forwarded-proto` ohne Werteprüfung. Der Wert landet in `verwaltungsZiel` und über
  `page.tsx:94/101` in einem `callbackUrl`. Ein exotisches Schema fiele nachgelagert an
  `suiteRedirect`s Protokollvergleich (`core/auth/redirect.ts:52`) durch, und die Kopfzeile setzt
  in dieser Topologie der Reverse-Proxy — hier nur festgehalten, damit es nicht als offen gilt.
- **M-6** `checkAbschluss` schreibt bei leerer Nutzlast (alle vier Arrays leer) eine `checks`-Zeile
  ohne jeden Inhalt. Fällt mit dem Fix zu B-1 weitgehend weg; eigenständig nur Datenhygiene.

---

## 6. Fazit

`specTreu: true` — die Riegelarchitektur des Plans (§2.6, §3.2.1, §3.8.2, §7.3) ist über den ganzen
Branch durchgehalten, an mehreren Stellen bewusst und begründet **gegen** den abgedruckten
Testkörper, und T87 hat die zwei zugesagten Verschärfungen wirklich eingelöst statt sie
weiterzureichen.

Ein Befund steht zwischen dem Branch und dem Merge: `checkAbschluss` löst seine Wurzel-ID nicht
gegen die Datenbank auf, während dieselbe Datei es für alle vier Kind-IDs tut, die Seite darüber es
ausdrücklich tut, und die Schwester-Action es vormacht. Der Fix ist sechs Zeilen und benutzt
ausschließlich Bauteile, die dieser Branch schon hat.
