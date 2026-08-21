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
