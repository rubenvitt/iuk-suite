# Übergabe aus Teil 2 (Zugang) an die Teile 3 bis 6

Entstanden am 04.08.2026 beim Bau von Teil 2 (`2026-08-03-lagerbuch-modul-teil2.md`, 13 Tasks,
jeder einzeln reviewt, dazu ein Whole-Branch-Review und eine Fix-Welle). **Alles hier ist im Bau
aufgelaufen und steht in keinem der sechs Plandokumente** — deshalb dieses Blatt.

Wer einen der Teile 3 bis 6 beginnt, liest es zuerst. Reihenfolge nach Dringlichkeit.

---

## 1. ⚠️ Ein Satz in den Briefen von Teil 4 und Teil 6 ist falsch

**Betroffen: Teil 4 und Teil 6.** Der Satz stammt aus dem T23-Brief von Teil 2 (Zeile 909–911) und
wird dort wörtlich wiederholt.

Er behauptet, ein Test brauche die Reset-Haken der `console.warn`-Dedup-Speicher nicht, weil „je
Fall ein anderer `sub`" benutzt werde. **Das stimmt nicht:** in `zugang.test.ts` teilen sich drei
Fälle dasselbe `sub`, und beide Speicher (`bereitsGemeldet` in `_lib/zugang.ts`, `namenlosGemeldet`
in `_lib/konto.ts`) sind **modulweit und prozess-lokal**.

**Die tragfähige Regel:** beide Resets (`_resetGemeldeteGruppen()`, `_resetNamenlosGemeldet()`)
gehören in **jedes** `beforeEach`, das den Verwaltungsriegel oder `merkeNutzer` mehrfach ruft.

Wer dem Brief folgt und die Haken wegzulassen versucht, sieht
`expected "warn" to be called 1 times, but got 0 times` — und **der Fehlschlag sieht nach einem
Fehler im Riegel aus, nicht nach einem im Harness.** In Teil 2 hat das einen Umweg gekostet.

---

## 2. ⚠️ Zu entscheiden, BEVOR Teil 4 den Gate-Weg baut

**Die Reihenfolgezusage der Gate-Schranke hat nirgends ein mechanisches Netz.**

`_lib/gateSchranke.ts` hält zwei Zusagen, die **keine Eigenschaft der Datei** sind, sondern eine
**des Aufrufers** — und den gibt es erst in Teil 4:

- die **Sperrprüfung** liegt **vor** dem Datenbankzugriff (sie ist es, die ihn deckelt)
- der **Budgetverbrauch** liegt **hinter** der Codeprüfung (nur so kommt ein richtiger Code während
  der Sperre durch)

Nichts hindert Teil 4 daran, `gateFehlversuchBuchen` vor die Codeprüfung zu legen. Das ist der
**Bestandszustand**, den `gateSchranke.ts:119-124` selbst als den Fehler benennt, der in dieser
Suite bereits produktiv eingetreten ist (feedback, 15 Ehrenamtliche aus einem Vereins-WLAN).
Typkorrekt, lint-sauber, für `pnpm build` unsichtbar — genau das Profil, für das der Plan sonst
überall einen Scan vorsieht. Für die drei Weichen-Dateien tut er es in Eigenschaftsform, obwohl es
auch die erst in Teil 4 gibt; für die sicherheitlich schwerere Gate-Reihenfolge nicht.

**Zu entscheiden:** ein Eigenschaftsform-Scan in `_lib/bauform.test.ts`, oder eine ausdrückliche
E2E-Zusage im Teil-4-Brief („ein richtiger Code wird eingelöst, während die Sperre läuft").

---

## 3. Was Teil 3 im Harness nachziehen muss — zwei Dinge, die zusammenhängen

**a) `playwright.config.ts` setzt heute KEINE `LAGERBUCH_*`-Variable.** Nachzuziehen in
`webServer.env`: `SUITE_HOST_LAGERBUCH` und `LAGERBUCH_HELFER_SITZUNG_SECRET`. Ohne sie ist der
Zwei-Host-E2E aus §12.2 nicht darstellbar, und der Helfer-Sitzung fehlt in der E2E-Umgebung ihr
Geheimnis.

Vorbild ist `files`: es führt seine Dev-Werte an **zwei** Stellen — auskommentiert in
`.env.example` **und** aktiv in `webServer.env`. Teil 2 hat die erste Hälfte gebaut (der
lagerbuch-Block in `.env.example` ist seit `e2accd0` auskommentiert, mit derselben Überschrift wie
der files-Block); die zweite fehlt.

**b) Ein E2E, der nach dem Login tatsächlich auf `/verwaltung` landet** — nicht bloß „auf
irgendeiner angemeldeten Seite". Sonst ist der `verwaltungsZiel`-Fix aus der Fix-Welle (`cb0daa2`)
nur unit-gedeckt und beim nächsten Umbau wieder ungeschützt.

⚠️ **Der Punkt hat einen Haken, der ihn heute unerreichbar macht, und die Ursache liegt außerhalb
von lagerbuch:** `src/components/login-form.tsx:220` lautet
`window.location.assign(callbackUrl.startsWith("/") ? callbackUrl : "/")` — der Dev-Login
**verwirft jeden absoluten `callbackUrl`**. Seit `cb0daa2` liefert `verwaltungsZiel()` genau einen
solchen (Protokoll und Port kommen jetzt aus dem Request), und `playwright.config.ts:101` setzt
`AUTH_DEV_LOGIN=true`. **Der E2E aus (b) schlägt also fehl, solange `login-form.tsx` unverändert
bleibt** — und die Datei kam über einen Commit einer parallelen Sitzung (`9d3a3c9`) auf den Branch,
gehört also keinem Teil dieser Portierung.

Wer (b) baut, ändert entweder `login-form.tsx` mit oder fährt den E2E über den Pocket-ID-Weg.
**Nicht in `_lib/zugang.ts` nach der Ursache suchen — sie ist dort nicht.**

---

## 4. Cutover: eine Prüfung, die nur der Betrieb beantworten kann

Steht auch in `docs/runbooks/lagerbuch-cutover.md`.

`verwaltungsZiel()` leitet das Protokoll seit `cb0daa2` aus `x-forwarded-proto` ab — dem im Repo
erprobten Muster (`files` und `qr` bauen ihre öffentlichen Adressen produktiv damit). **Aus dem
Repository ist aber nicht beweisbar, dass der Proxy den Header setzt.**

**Nach dem Umschwenken des Routers einmal ausführen:**

```bash
curl -sI https://lagerbuch.iuk-ue.de/verwaltung
```

Im `Location` muss `…callbackUrl=https%3A%2F%2Flagerbuch.iuk-ue.de%2Fverwaltung` stehen. Steht dort
`http%3A%2F%2F`, terminiert der Proxy ohne `X-Forwarded-Proto` — dann bricht
`core/auth/redirect.ts:52` an der Protokollgleichheit, und **der Rückweg nach der Anmeldung landet
still auf dem Portal** statt auf der Lagerbuch-Verwaltung.

---

## 5. Zwei Kleinigkeiten für Teil 6

- **`_actions/guards.test.ts:57` hat dieselbe `.spec.ts`-Lücke**, die in `_lib/bauform.test.ts:56`
  geschlossen wurde: `!n.endsWith(".test.ts")` erfasst kein `*.spec.ts`. Eine
  `_actions/foo.spec.ts` würde als Action-Datei gescannt. Laute Richtung (fällt eher falsch-positiv
  aus), deshalb keine Eile — aber Teil 6 fasst die Datei ohnehin an (die Guard-Zählung).
- **Die Zählung in `guards.test.ts` kommt in Teil 6** (47 = 44 + 3). Der Scan steht seit Teil 2 in
  Eigenschaftsform und ist bei null Dateien grün; das ist Absicht und kein Mangel.

---

## 6. Eine Regel, die sich in Teil 2 dreimal bewährt hat

Drei der vier interessanten Befunde des Whole-Branch-Reviews waren **derselbe Typ**: eine Datei
beschreibt eine Regel, eine andere lebt sie, und **nichts verbindet die beiden**.

- der Guard-Scan beschrieb „jede Action trägt einen Riegel" — vier Bauformen rutschten vorbei
- `host.ts` beschrieb „für Verwaltungs-Actions gilt: kein Host-Riegel" — `zugang.ts` widerlegte es
- `gateSchranke.ts` beschreibt die Reihenfolge — der Aufrufer entsteht erst in Teil 4 (Punkt 2 oben)

**Empfehlung für die Teile 4 bis 6:** jede Zusage der Form „X steht vor Y" oder „jede Datei der
Sorte Z trägt W" bekommt eine Zeile in `_lib/bauform.test.ts`, notfalls in Eigenschaftsform. Und
wer eine Riegel-Aufrufstelle ändert, liest die Verweistabelle `_lib/host.ts:58-95` mit — die
Datei:Zeile-Verweise dort altern.

---

## 7. Was aus Teil 2 als Invariante bindet

- **`konto.ts` importiert aus `zugang.ts` ausschließlich Typen.** Ein Wert-Import in dieser Richtung
  erzeugt einen echten Modulzyklus; ESM löst ihn zur Laufzeit mit `undefined` auf, und der Fehler
  ist ein `merkeNutzer is not a function` auf **genau einem** Codepfad — dem ersten
  Verwaltungsaufruf. `_lib/bauform.test.ts` bewacht das seit `cedab21`.
  ⚠️ **Die frühere Begründung („die Immunität hängt an `function`-Deklarationen und Hoisting") ist
  falsch** und steht im Scan-Kommentar ausdrücklich als widerlegt. `konto.ts` hat gar keinen
  Laufzeit-Import aus `zugang.ts`, es gibt also keinen Zyklus, und Hoisting ist belanglos.
- **`_lib/actionTypen.ts` schreibt in Teil 4:**
  `import type { SperrGrund } from "./helferZugang";` und
  `export type HelferGrund = SperrGrund | "leer" | "netz";` — es entsteht **keine** zweite
  Literal-Union für dieselben zwei Wörter (Festlegung G7).
- **`_lib/grenzen.ts` wird in Teil 3 ERWEITERT, nicht ersetzt:** `grenzenFehler(env)` und die drei
  reinen Konstanten `JOURNAL_GRENZE`, `CHECK_GRENZE`, `BZ_LOGBUCH_GRENZE` kommen in **dieselbe**
  Datei, in dieselbe `ZAHLEN`-Tabelle. **Es entsteht keine zweite Zahlentabelle.**
  `LAGERBUCH_BACKUP_AUFBEWAHRUNG_TAGE` **entfällt endgültig** — Entscheidung D1 (Backup wird ein
  Deployment-Sidecar, ClickUp DRK-185).
- **`_lib/bauform.test.ts` wird in Teil 4 ERWEITERT:** der `usePathname`-Scan kommt dazu, und die
  Weichen-Zeile wird von „falls die Datei existiert" auf „die drei Dateien existieren und tragen die
  Regel" verschärft. **Es entsteht keine zweite Scan-Datei.**
