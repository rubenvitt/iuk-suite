# Der Suite-Admin-Kurzschluss in `core/groups.ts` — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die eine Zeile `src/core/groups.ts:125` —
`if (groups.includes(suiteAdminGroup(env))) return true;` — entweder **belegt stehen lassen** oder
**belegt entfernen**. Was von beidem gilt, entscheidet **eine Ablesung am Produktionsserver**, die
in diesem Repo nicht durchführbar ist. ⛔ **Vor dieser Ablesung wird nichts ausgerollt.**

**Anlass:** Der Leitplan
(`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:123`) führt den Posten als
Voraussetzung mit der Frist „vor Planteil 4"; Ruben hat ihn am 2026-08-21 beauftragt
(`.superpowers/sdd/KONTEXT-radio-planteil2.md`, Abschnitt „Betreiberentscheidungen, frisch",
Posten 2: „das **Entfernen des Suite-Admin-Kurzschlusses in `src/core/groups.ts`** — vor
Planteil 4"). Planteil 4 (die zehn Verwaltungsseiten) steht unmittelbar bevor.

**Architecture:** Der Plan hat **drei Hälften mit scharfen Grenzen.** Aufgabe **K1** ist eine
**Ablesung am laufenden Betrieb ohne eine Zeile Code**; sie ist der Torwächter des ganzen Plans und
wählt den Weg. Aufgabe **K2** ist der Nachweis für **Weg A** (der Riegel bleibt) und läuft
**unabhängig vom Ergebnis** — sie kostet nichts und beweist, dass Planteil 4 technisch nicht
blockiert ist. Aufgaben **K3–K6** sind **Weg B** (der Schnitt), TDD, in genau **einer**
Produktionsdatei plus fünf begleitenden. Aufgaben **K7–K8** sind Tore und die Abnahme beim
Betreiber, und **K8 ist der eigentliche Zweck**: ⛔ **kein Tor dieses Repos kann sehen, ob jemand
ausgesperrt wurde.**

**Tech Stack:** Next.js 16 (App Router, RSC) · Auth.js v5 (Pocket ID) · TypeScript · Vitest
(`vitest.config.ts`) · Playwright · Docker Compose + Traefik

---

## ⚠️ Sechs Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

**1. ⛔ Der Auftrag ist weiter als die Spec, die ihn ausgelöst hat — und das ist gemessen, nicht
vermutet.** Entscheidung 9 der radio-Spec lautet wörtlich:

> „| 9 | `SUITE_ADMIN_GROUP_RADIO`; `radio` ignoriert den `isModuleAdmin`-Kurzschluss modulintern |"
> (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:65`)

Und dieselbe Spec schließt den weiten Weg **aus sich selbst aus**, zwei Absätze tiefer:

> „**Ausdrücklich nicht Teil dieser Spec** (eigene Suite-Posten): `TZ=Europe/Berlin` · die
> CWE-348-Umstellung in `core/ratelimit.ts` … · **das Entfernen des Suite-Admin-Kurzschlusses in
> `core/groups.ts`** · das suiteweite Gating von `/m/*`."
> (`docs/superpowers/specs/2026-08-17-radio-modul-design.md:70-72`)

**Die Spec verlangt also die enge Lösung, und nur sie.** Ausführlich in Kapitel 3.

**2. ⛔ Die enge Lösung ist **bereits gebaut**, und der gebaute Code sagt selbst, dass der Schnitt
für `radio` optional ist.** `src/app/m/radio/riegel.test.ts:942-944` — im Repo, heute, grün:

> „⚠️ DER KURZSCHLUSS SELBST WIRD SPAETER ENTFERNT — als eigene kleine Vorarbeit vor Planteil 4
> (KONTEXT-radio-planteil2.md:32-35). **Dieser Scan bleibt trotzdem: er sagt, dass `radio` seine
> Rechte SELBST aufloest, unabhaengig davon, was `core` tut.**"

Das Prädikat steht in `src/app/m/radio/_lib/zugang.ts:93-127` (`adminGroupsFor(getModule("radio"))`
+ `.some()`), der Scan gegen alle vier core-Riegel in `src/app/m/radio/riegel.test.ts:928-948`.
**Für `radio` ist der Posten damit erledigt, egal wie K1 ausgeht.**

**3. ⛔ `portal` verliert seine Verwaltung vollständig — das ist eine Gewissheit, kein Risiko.**
`src/core/registry.ts:57-59` gibt `portal` `adminGroups: []`, und der Kommentar darüber
(`:54-56`) sagt warum: „portal: keine modul-eigene Admin-Gruppe — Admin ist hier der Suite-Admin
(ADMIN_GROUP)." Der Kurzschluss ist für `portal` **der einzige** Weg. `SUITE_ADMIN_GROUP_PORTAL`
kommt in `.env.example` **nirgends** vor. Nach dem Schnitt ist `/m/portal/admin` für **niemanden**
mehr erreichbar — Dienste anlegen, Dienste löschen, Ansprechpartner setzen: alles unerreichbar.
Die Kompensation ist heute schon möglich, **ohne eine Zeile Code** (Kapitel 2, K3), und sie muss im
**selben Deploy** liegen, nicht als Nachtrag.

**4. ⚠️ Die TDD-Richtung ist hier umgekehrt.** Acht Tests **sichern den Kurzschluss heute zu**
(vollständig aufgezählt in K4). Der Schritt heißt deshalb nicht „einen fehlschlagenden Test
schreiben", sondern: **Zusicherung umdrehen, gegen den heutigen Code rot sehen, dann `groups.ts:125`
entfernen und grün sehen.** Wer die Reihenfolge dreht, hat nichts bewiesen.

**5. ⚠️ Einer dieser Tests ist eine Stolperdraht-Konstruktion, die genau auf diesen Plan wartet.**
`src/app/m/feedback/_lib/access.test.ts:19-30` prüft `isModuleAdmin(getModule("qr"), …) === true`
als **Gegenprobe**, und begründet das wörtlich: „Sonst wäre der Test auch dann grün, wenn jemand die
Abkürzung suiteweit entfernt — und die Entscheidung galt nur für feedback." Wer diesen Test als
„irrelevanten Fehlschlag" abtut, hat den Draht durchgeschnitten, für den er gelegt wurde.

**6. ⛔ Kein Tor dieses Repos kann sehen, ob jemand ausgesperrt wurde.** `typecheck`, `lint`,
`vitest` und `playwright` kennen `dashboard-admins`, `iuk-qr-admin` und
`iuk-aufgaben-koordination` als **Literale aus dem Quelltext**. Sie wissen nicht, wer in Pocket ID
in welcher Gruppe steht. Ein vollständig grüner Lauf ist mit einem vollständig ausgesperrten
Betreiber vereinbar. **Deshalb K8, und deshalb K1 zuerst.**

---

## Global Constraints

- **Belegpflicht.** Jede Behauptung nennt `datei:zeile`. Wo ein Wert erst der Server hergibt: eine
  benannte Leerstelle ⬜ mit „wer liest sie wann ab" — **nie** eine plausibel aussehende Erfindung.
- **Kommandos mit `rtk` präfixt** (`CLAUDE.md`, RTK-Abschnitt).
- **Tor:** `rtk pnpm typecheck` 0 · `rtk pnpm lint` 0 (Warnungen blockieren nicht) ·
  `rtk pnpm vitest run` gegen die Grundlinie **479/479 Dateien, 8509/8509 Tests**.
- ⛔ **Kein `pnpm build` vor einem ernstgemeinten Testlauf.**
- ⚠️ `typecheck` läuft mit `--pretty false`; außerhalb dieser Umgebung den **Exit-Code** prüfen,
  nicht die Meldung (`CLAUDE.md`, Abschnitt „Tests").
- ⛔ **Ein Commit je Aufgabe**, wie für die Vorarbeit vereinbart
  (`.superpowers/sdd/KONTEXT-radio-planteil2.md`: „je als eigene kleine Vorarbeit mit eigenem
  Commit").
- ⛔ **Keine Release Note.** Was hier passiert, ist entweder gar keine sichtbare Änderung (Weg A)
  oder eine reine Rechteänderung für einen einzigen Personenkreis, den der Betreiber persönlich
  kennt (Weg B). Die Regel aus `CLAUDE.md` („eine Notiz über etwas, das niemand sehen kann, macht
  die Liste unglaubwürdig") trifft beides. Wer meint, doch eine schreiben zu müssen, fragt Ruben —
  und schreibt sie nicht auf eigene Rechnung.

---

## Die Leerstellentafel

⬜ Sieben Leerstellen. **Keine ist im Repo entscheidbar.** K1 liest sechs davon ab, K1 Schritt 7
holt die siebte.

| # | Was fehlt | Wer liest sie wann ab | Wo sie hin muss |
|---|---|---|---|
| ⬜ **K-L1** | Steht `ADMIN_GROUP=` in der **Produktions-`.env`**, und mit welchem Wert? (Der Code-Default ist `dashboard-admins`, `src/core/groups.ts:97`; `.env.example:66` setzt ihn ausdrücklich, `.env.local` setzt ihn **nicht**) | **Ruben**, auf dem Server, vor K2 — `rtk grep '^ADMIN_GROUP=' .env` | Abschnitt „Ablesungen", K1 Schritt 1 |
| ⬜ **K-L2** | **Ist diese Gruppe in Pocket ID besetzt, und mit wem?** Namentlich, nicht als Zahl | **Ruben**, in Pocket ID (`id.iuk-ue.de`) → Groups → die Gruppe aus K-L1 → Mitglieder, vor K2 | „Ablesungen", K1 Schritt 2 |
| ⬜ **K-L3** | Steht `SUITE_ADMIN_GROUP_PORTAL=` in der Produktions-`.env`? **Erwartung: nein** — die Variable kommt in `.env.example` nirgends vor | **Ruben**, `rtk grep '^SUITE_ADMIN_GROUP_PORTAL=' .env`, vor K2 | „Ablesungen", K1 Schritt 3 |
| ⬜ **K-L4** | Ist **jede** Person aus K-L2 auch in der `qr`-Admin-Gruppe? (Registry-Vorgabe `iuk-qr-admin`, `src/core/registry.ts:64`; überschreibbar per `SUITE_ADMIN_GROUP_QR`, `.env.example:71`) | **Ruben**, Pocket ID + `rtk grep '^SUITE_ADMIN_GROUP_QR=' .env`, vor K2 | „Ablesungen", K1 Schritt 4 |
| ⬜ **K-L5** | Ist **jede** Person aus K-L2 auch in der `aufgaben`-Koordinationsgruppe? (`SUITE_ADMIN_GROUP_AUFGABEN`, Vorschlag `aufgaben_koordination`, `.env.example:388`) | **Ruben**, Pocket ID + `rtk grep '^SUITE_ADMIN_GROUP_AUFGABEN=' .env`, vor K2 | „Ablesungen", K1 Schritt 5 |
| ⬜ **K-L6** | **Die Wegwahl.** A (Riegel bleibt) oder B (Schnitt) — nach Vorlage von K-L1..K-L5 und Kapitel 3 | **Ruben**, nach K1 Schritt 6, **schriftlich** | „Ablesungen", K1 Schritt 6. ⛔ Ohne sie beginnt K3 nicht |
| ⬜ **K-L7** | Nur auf Weg B: **wie heißt die neue Portal-Admin-Gruppe in Pocket ID**, und wer steht drin? Sie muss **angelegt und besetzt** sein, bevor der Schnitt ausgerollt wird | **Ruben**, in Pocket ID, vor K3 | „Ablesungen", K1 Schritt 7 |

⚠️ **K-L2, K-L4, K-L5 sind Personenlisten, keine Ja/Nein-Werte.** „Die Gruppe ist besetzt" genügt
nicht: die Frage ist, ob **dieselben** Personen in den Modulgruppen stehen. Eine Gruppe mit drei
Mitgliedern, von denen zwei in `iuk-qr-admin` stehen, sperrt genau eine Person aus — und die merkt
es erst, wenn sie etwas verwalten will.

⚠️ **Der Entzug wirkt mit bis zu einer Stunde Verzug in die andere Richtung: eine frisch angelegte
Gruppe auch.** Gruppen im JWT sind nur so frisch wie der letzte erfolgreiche Token-Refresh
(`CLAUDE.md`, Abschnitt „Zugriffsschutz"). Wer in K3 eine Portal-Admin-Gruppe anlegt, prüft sie
**nach einer neuen Anmeldung**, nicht mit der offenen Sitzung.

---

## Kapitel 1 — Was die Zeile heute tut, genau

### 1.1 Die vier Funktionen, wörtlich

**`suiteAdminGroup`** — `src/core/groups.ts:94-98`:

```ts
/** Suite-weite Admin-Gruppe. `ADMIN_GROUP` ohne Präfix — der Name ist historisch
 *  und steht so auf dem Server; nicht umbenennen ohne .env-Migration. */
export function suiteAdminGroup(env: EnvLike = process.env): string {
  return env.ADMIN_GROUP ?? "dashboard-admins";
}
```

**`adminGroupsFor`** — `src/core/groups.ts:100-109`:

```ts
/** Modul-Admin-Gruppen: Env gewinnt, sonst der Registry-Wert. Leer gesetzt
 *  heißt „keine modul-eigenen Admins" — dann bleibt nur der Suite-Admin. */
export function adminGroupsFor(mod: ModuleDef, env: EnvLike = process.env): string[] {
  const raw = env[adminGroupEnvName(mod.key)];
  if (raw === undefined) return mod.adminGroups;
  return raw
    .split(",")
    .map((g) => g.trim())
    .filter(Boolean);
}
```

**`isModuleAdmin`** — `src/core/groups.ts:111-127`, die Zeile ist `:125`:

```ts
/**
 * Darf dieser Nutzer das Modul administrieren?
 *
 * `groups === null` heißt „nicht eingeloggt" und ist nie Admin — wichtig, weil
 * anonyme Module (wie `qr`) Server Components ohne Session rendern und ein
 * `[].includes()` auf `undefined` sonst still zu `false` würde, ohne dass der
 * Unterschied zwischen „anonym" und „eingeloggt ohne Recht" je auffiele.
 */
export function isModuleAdmin(
  mod: ModuleDef,
  groups: string[] | null | undefined,
  env: EnvLike = process.env,
): boolean {
  if (!groups) return false;
  if (groups.includes(suiteAdminGroup(env))) return true;   // ← :125, der Kurzschluss
  return adminGroupsFor(mod, env).some((g) => groups.includes(g));
}
```

**`validateGroupConfig`** — `src/core/groups.ts:141-164`, hier gekürzt auf das Tragende:

```ts
export function validateGroupConfig(moduleKeys: string[], env: EnvLike = process.env): string[] {
  const adminNames = new Set(moduleKeys.map(adminGroupEnvName));
  const accessNames = new Set(moduleKeys.map(accessGroupEnvName));
  const fehler: string[] = [];

  for (const name of Object.keys(env)) {
    const istAdmin = name.startsWith(ADMIN_PREFIX);      // "SUITE_ADMIN_GROUP_"
    const istAccess = name.startsWith(ACCESS_PREFIX);    // "SUITE_ACCESS_GROUP_"
    if (!istAdmin && !istAccess) continue;
    …
    if (istAccess && env[name]?.trim() === "") { … }     // :156 — NUR fuer ACCESS
  }
  return fehler;
}
```

### 1.2 `SUITE_ADMIN_GROUP` (global) gegen `SUITE_ADMIN_GROUP_<KEY>` (je Modul)

Der Kopfkommentar der Datei nennt die drei Ebenen (`src/core/groups.ts:12-20`):

> „- **Suite-Admin** (`ADMIN_GROUP`, Default `dashboard-admins`) — der Betreiber. **Ist überall
> Admin, damit ein Modul nicht aussperrbar ist.**
> - **Modul-Admin** (`ModuleDef.adminGroups`, überschreibbar per `SUITE_ADMIN_GROUP_<KEY>`) —
> administriert genau ein Modul.
> - **Modul-Zugang** (`ModuleDef.requiredGroups`, überschreibbar per `SUITE_ACCESS_GROUP_<KEY>`) …"

Sieben Unterschiede, jeder belegbar:

| | **`ADMIN_GROUP`** (global) | **`SUITE_ADMIN_GROUP_<KEY>`** (je Modul) |
|---|---|---|
| Variablenname | **ohne** Präfix, historisch (`src/core/groups.ts:94-95`: „nicht umbenennen ohne .env-Migration") | Präfix `SUITE_ADMIN_GROUP_` (`:28`), Suffix ist der Modulschlüssel groß mit `-`→`_` (`:31-34`) |
| Wert | **genau eine** Gruppe, kein Komma-Split (`:97`) | **kommagetrennte Liste** (`:105-108`) |
| Default | `"dashboard-admins"` im Code (`:97`) | der Registry-Wert `mod.adminGroups` (`:104`) |
| Leer gesetzt | ⚠️ **nicht abgefangen** — `"" ?? …` greift nicht, `suiteAdminGroup` liefert die leere Zeichenkette, und `groups.includes("")` ist praktisch immer `false`. Also: leer = Kurzschluss faktisch aus | gültige Aussage „keine modul-eigenen Admins" (`:100-101`), **nicht** gemeldet (`:156` prüft nur ACCESS, begründet `:136-140`) |
| Tippfehler im Namen | **wird nicht gemeldet** — `ADMIN_GROUP` trägt keins der beiden Präfixe und fällt aus der Schleife (`:149`); der Test dazu heißt so: `src/core/groups.test.ts:146` „ADMIN_GROUP ohne Präfix ist keine Modul-Variable und wird ignoriert" | **lauter Startabbruch** — `validateGroupConfig` meldet jeden unbekannten Suffix (`:152-154`), `assertHostConfig` wirft darauf (`src/core/bootstrap.ts:90-100`) |
| Reichweite | **jedes** Modul, über `:125` | genau **ein** Modul, über `:126` |
| Zweiter Konsument | `src/core/auth/config.ts:205` → `session.user.isAdmin` (ist **unabhängig** von `:125`) | keiner außerhalb von `adminGroupsFor` |

⚠️ **Die letzte Zeile ist wichtig für den Umfang.** `session.user.isAdmin` wird in `config.ts:205`
aus `suiteAdminGroup()` gesetzt, **nicht** aus `isModuleAdmin`. Ein Schnitt bei `:125` lässt das
Feld unberührt. Und es hat im ganzen Produktivcode **keinen einzigen Leser** — gemessen:
`rtk grep -rn '\.isAdmin' src e2e` (ohne Tests, ohne `config.ts`) findet nur Kommentare in
`src/app/m/lagerbuch/_lib/zugang.ts:106,243,292` und
`src/app/m/lagerbuch/verwaltung/(druck)/layout.tsx:36`. **Kein Produktivpfad hängt an
`session.user.isAdmin`.**

### 1.3 Wo `isModuleAdmin` überhaupt gelesen wird

**Genau eine Importstelle im gesamten Produktivcode:** `src/core/auth/guards.ts:4`. Von dort aus
drei Ausgänge (`src/core/auth/guards.ts:20-38`):

| Funktion | Zeile | Verhalten | Für |
|---|---|---|---|
| `requireModuleAdmin(key)` | `:20-25` | **wirft** `Error("Forbidden")` | Server Actions |
| `moduleAdminPageOrNotFound(key)` | `:28-32` | `notFound()` | Seiten. Bewusst 404 statt 403 (`:15-16`) |
| `canAdminModule(key)` | `:36-38` | `boolean`, wirft nicht | Sichtbarkeitsfragen |

⛔ **Vier Module rufen keine davon** und sind vom Schnitt **nicht** betroffen — sie lösen ihre
Rechte selbst über `adminGroupsFor` auf:

| Modul | Eigenes Prädikat | Bewusster Verzicht dokumentiert in |
|---|---|---|
| `feedback` | `src/app/m/feedback/_lib/access.ts:2` (`adminGroupsFor`) | `:10-13` |
| `files` | `src/app/m/files/_lib/access.ts:4` | `:62` |
| `lagerbuch` | `src/app/m/lagerbuch/_lib/zugang.ts:4` | `:79` |
| `radio` | `src/app/m/radio/_lib/zugang.ts:4` | `:93-127`, Scan in `riegel.test.ts:928-948` |

---

## Kapitel 2 — ⛔ WER verliert was. Gemessen, nicht geraten.

### 2.1 Die vollständige Tabelle

Ausgangslage jeder Zeile: **eine Person, die heute in der Suite-Admin-Gruppe steht (K-L1/K-L2) und
in KEINER Modulgruppe.** Das ist der Fall, den der Schnitt trifft; wer ohnehin in beiden steht,
merkt nichts (dazu 2.3).

| Modul | Aufrufstelle | Was diese Person **heute** darf | Was sie **nach dem Schnitt** darf |
|---|---|---|---|
| **portal** | `src/app/m/portal/layout.tsx:39` (`canAdminModule("portal")`) | Der Navigationseintrag „Verwaltung" erscheint (`layout.tsx:30`) | ⛔ **Der Eintrag verschwindet.** Und zwar für **jeden** — `adminGroups: []` |
| **portal** | `src/app/m/portal/admin/page.tsx:12` (`moduleAdminPageOrNotFound`) | `/m/portal/admin` rendert: Dienstliste, Anlegeformular, Ansprechpartner | ⛔ **404.** Für **jeden** |
| **portal** | `src/app/m/portal/actions.ts:7` → `:10`, `:21`, `:32` | `createServiceAction`, `deleteServiceAction`, `setzeAnsprechpartnerAction` | ⛔ **Alle drei werfen `Forbidden`.** Für **jeden** |
| **qr** | `src/app/m/qr/layout.tsx:19` (`canAdminModule("qr")`) | Navigationseintrag „Verwaltung" | ❌ verschwindet, **außer** sie steht in `iuk-qr-admin` (⬜ K-L4) |
| **qr** | `src/app/m/qr/admin/page.tsx:29` | `/m/qr/admin` — Presetverwaltung | ❌ 404, außer K-L4 |
| **qr** | `src/app/m/qr/actions.ts:17`, `:74`, `:124` | Preset anlegen/ändern, löschen, umsortieren | ❌ `Forbidden`, außer K-L4 |
| **aufgaben** | `src/app/m/aufgaben/_lib/zugang.ts:162` (`akteurFuer` → `istKoordination`) | Gilt als **Koordination** — die gesamte Rolle hängt an diesem Wert | ❌ Nur noch normale Person, außer K-L5 |
| **aufgaben** | `src/app/m/aufgaben/_lib/zugang.ts:250` (`akteurFuerSeite`) | Bekommt beim ersten Modulaufruf **selbst eine `personen`-Zeile** angelegt — der dokumentierte Erstbetriebsweg | ❌ `null` → keine Zeile, außer K-L5 |
| **aufgaben** | `src/app/m/aufgaben/personen/page.tsx:141` | `/personen` rendert die Personenverwaltung | ❌ Der Notausgangs-Zweig entfällt, außer K-L5 |
| **aufgaben** | `src/app/m/aufgaben/actions.ts:1111` (`verlangePersonenverwaltung`, früher Ausstieg) | Darf Personen verwalten **ohne** eigene `personen`-Zeile | ❌ Fällt auf die Zeilenprüfung zurück, außer K-L5 |
| **aufgaben** | `src/app/m/aufgaben/actions.ts:1169` (`personenSucheAction`) | Verzeichnis-Autofill | ❌ `Forbidden`, außer K-L5 |
| **feedback** | — | Nichts (`isFeedbackAdmin` ignoriert den Kurzschluss, `_lib/access.ts:10-13`) | **unverändert** |
| **files** | — | Nichts (`_lib/access.ts:62`) | **unverändert** |
| **lagerbuch** | — | Nichts (`_lib/zugang.ts:79`) | **unverändert** |
| **radio** | — | Nichts (`_lib/zugang.ts:93-127`) | **unverändert** |
| suiteweit | `src/core/auth/config.ts:205` | `session.user.isAdmin === true` | **unverändert** — `:125` ist nicht die Quelle (1.2) |
| suiteweit | `src/core/auth/devGroups.ts:40` | Die Suite-Admin-Gruppe steht in der Dev-Login-Auswahl | **unverändert** — reine Formularliste, „keine Rechtequelle" (`devGroups.ts:31-36`) |

### 2.2 ⛔ Der Sonderfall `portal`: kein Rückweg, für niemanden

Die drei `portal`-Zeilen oben stehen nicht unter „außer" — und das ist der Kern dieses Plans.
`src/core/registry.ts:54-59`:

```ts
// portal: keine modul-eigene Admin-Gruppe — Admin ist hier der Suite-Admin
// (ADMIN_GROUP). Das ist genau das bisherige Verhalten, nur nicht mehr im
// Modul dupliziert.
{ key: "portal", title: "Portal", icon: "AppstoreOutlined", shell: "full",
  requiresAuth: true, requiredGroups: [], adminGroups: [],
  prodHosts: ["iuk-ue.de"], showInSwitcher: true, switcherGroupSources: [] },
```

`adminGroups: []` heißt: `:126` — `[].some(…)` — gewährt **nichts**. Ohne `:125` ist
`isModuleAdmin(portal, …)` für jede denkbare Gruppenliste `false`. Dasselbe steht im Modul selbst
(`src/app/m/portal/layout.tsx:34-38`): „hier die Suite-Admin-Gruppe, weil `portal` keine eigene
fuehrt", und in `e2e/launcher.spec.ts:57-60`: „`portal` führt keine eigene (`registry.ts`,
`adminGroups: []`), also greift `ADMIN_GROUP`".

**Die Kompensation ist heute schon möglich, ohne eine Zeile Code.** `validateGroupConfig` baut seine
Allowlist aus `moduleKeys` (`src/core/groups.ts:142`), und `assertHostConfig` speist sie mit
`MODULES.map((m) => m.key)` (`src/core/bootstrap.ts:91`) — `"portal"` ist darin enthalten
(`src/core/registry.ts:57`). Ein `SUITE_ADMIN_GROUP_PORTAL=<gruppe>` in der `.env` ist damit **eine
gültige, vom Boot akzeptierte Variable**, die `adminGroupsFor` (`:104-108`) liest. ⛔ Sie muss im
**selben Deploy** liegen wie der Schnitt.

### 2.3 ⛔ Der Sonderfall `aufgaben`: der Kurzschluss ist dort ein **dokumentierter Notausgang**

`.env.example:358-365` — nicht als Nebenwirkung, sondern als Betriebsanweisung:

> „Drei Folgen, alle betrieblich:
>   1. EIN TIPPFEHLER SPERRT JEDE KOORDINATION AUS — nicht nur `/personen`. Niemand kann dann noch
>      eine Person anlegen oder eine Aufgabe verteilen.
>   2. **DER RUECKWEG IST DIE SUITE-ADMIN-GRUPPE** (`dashboard-admins`, s. SUITE_ADMIN_GROUP oben):
>      `isModuleAdmin` laesst sie neben der Modulgruppe passieren, **ausdruecklich als Notausgang
>      fuer genau diesen Fall**. Wer ihn benutzt, bekommt beim ersten Modulaufruf selbst eine
>      `personen`-Zeile.
>   3. DER ENTZUG WIRKT MIT BIS ZU EINER STUNDE VERZUG …"

Dasselbe steht im Runbook: `docs/runbooks/aufgaben-inbetriebnahme.md:35-36`:

> „2. **Der Rückweg ist die Suite-Admin-Gruppe** (`dashboard-admins`, `SUITE_ADMIN_GROUP`):
>    `isModuleAdmin` lässt sie neben der Modulgruppe passieren, ausdrücklich als Notausgang."

Und im Modulcode: `src/app/m/aufgaben/_lib/zugang.ts:150`, `src/app/m/aufgaben/personen/page.tsx:22`
sowie der Testkommentar `src/app/m/aufgaben/_lib/zugang.test.ts:237-247`, der ausdrücklich als
„WAECHTER FUER DIE GEGENRICHTUNG" gesetzt ist.

⛔ **Weg B nimmt `aufgaben` diesen Notausgang.** Das ist zulässig — aber nur, wenn beide Dateien im
selben Commit **umgeschrieben** werden und der neue Rückweg dort benannt ist (K6). Ein Notausgang,
der in der Dokumentation stehen bleibt und im Code nicht mehr existiert, ist schlimmer als keiner:
er wird in genau dem Moment gesucht, in dem niemand mehr Zeit hat.

### 2.4 Was in den Toren rot wird — vollständig, mit `datei:zeile`

⚠️ **Ein Tor-Ergebnis „8509/8509" ohne diese Liste ist kein Plan, den jemand fahren kann.**

**Acht Vitest-Fälle sichern den Kurzschluss zu und werden rot:**

| # | Datei:Zeile | Testname | Warum rot |
|---|---|---|---|
| 1 | `src/core/groups.test.ts:96-98` | „Suite-Admin darf überall — auch ohne Modul-Gruppe" | `isModuleAdmin(qr, ["dashboard-admins"])` wird `false` |
| 2 | `src/core/groups.test.ts:113-117` | „Modul ohne eigene Admin-Gruppen: nur der Suite-Admin darf" | erste Zusicherung (`portal`, `["dashboard-admins"]` → `true`) fällt |
| 3 | `src/core/groups.test.ts:128-131` | „bisheriges Portal-Verhalten bleibt: ADMIN_GROUP aus der Server-.env greift" | ⚠️ **Der Name des Tests ist die Aussage, die widerrufen wird** |
| 4 | `src/app/m/portal/layout.test.tsx:91-99` | „Modul-Admin: `<Shell>` bekommt `navFuerPortal(true)`" | `sessionFor([suiteAdminGroup()])` reicht nicht mehr |
| 5 | `src/app/m/feedback/_lib/access.test.ts:26-30` | „der Suite-Admin allein ist hier KEIN Admin — anders als in den übrigen Modulen" | ⛔ **Der Stolperdraht** (Punkt 5 oben): die Gegenprobe `isModuleAdmin(getModule("qr"), …) === true` fällt |
| 6 | `src/app/m/aufgaben/personen/page.test.tsx:172-178` | „Suite-Admin OHNE eigene personen-Zeile bekommt die Seite mit dem Formular (Lesepfad)" | der Notausgang aus 2.3 |
| 7 | `src/app/m/aufgaben/actions.test.ts:2585-2599` | „Suite-Admin OHNE eigene personen-Zeile legt die erste Person an" | der Notausgang, schreibend |
| 8 | `src/app/m/aufgaben/_lib/zugang.test.ts:249-255` | „der Suite-Admin bekommt sie ebenfalls — der Rueckweg waere sonst nur der Lesepfad" | der „WAECHTER FUER DIE GEGENRICHTUNG" |

**Vier Playwright-Specs werden rot** (⛔ ein separates Tor, nicht in der 8509 enthalten):

| Datei:Zeile | Was dort läuft | Warum rot |
|---|---|---|
| `e2e/portal.spec.ts:29-36` | „admin can create a service", `devLogin(…, groups: "dashboard-admins", callbackPath: "/admin")` | `/admin` antwortet 404 |
| `e2e/portal.spec.ts:38-58` | „admin can delete a service", derselbe Login | 404 |
| `e2e/launcher.spec.ts:73-89` | Ansprechpartner-Rundlauf über `/admin`, `groups: "dashboard-admins"` | 404. Der Docblock `:57-60` nennt den Grund vorab |
| `e2e/mobil-admin.spec.ts:168` | `{ name: "portal — Dienste verwalten", host: "portal.localtest.me", pfad: "/admin" }` in `SEITEN`, gefahren in `:268`, `:294`, `:432`, `:663`, `:725` | 404. ⚠️ `qr` (`:169`) **bleibt grün**, weil `GRUPPEN` (`:96`) `iuk-qr-admin` mitführt — genau die Asymmetrie aus 2.1 |

**Grün, aber inhaltlich entkernt** (kein roter Test, deshalb leicht zu übersehen):

- `src/app/m/feedback/(admin)/layout.test.tsx:170-181` — „Suite-Admin ohne Feedback-Gruppe kommt gar
  nicht erst so weit (`isFeedbackAdmin != isModuleAdmin`)". Bleibt grün; sein **Name** behauptet
  einen Unterschied, den es dann nicht mehr gibt.
- `src/app/m/lagerbuch/_lib/zugang.test.ts:157-174`, `src/app/m/files/_lib/access.test.ts:85-92`,
  `src/app/m/radio/_lib/zugang.test.ts:118-133` — dieselbe Lage: die Zusicherung stimmt weiter, ihre
  **Begründung** wird Archäologie.

### 2.5 Die Kommentarernte — was falsch dasteht, sobald `:125` fehlt

Alle diese Stellen behaupten die Existenz des Kurzschlusses. Sie sind **nicht** kosmetisch: die
letzten fünf sind Begründungen dafür, warum vier Module um etwas herumbauen.

| Datei:Zeile | Was dort steht |
|---|---|
| `src/core/groups.ts:13-14` | „Ist überall Admin, damit ein Modul nicht aussperrbar ist" |
| `src/core/groups.ts:100-101` | „leer gesetzt heißt … dann bleibt nur der Suite-Admin" |
| `src/core/registry.ts:24-27` | „Wer das Modul **administrieren** darf — **zusätzlich zum Suite-Admin, der überall darf**" |
| `src/core/registry.ts:54-56` | „portal: keine modul-eigene Admin-Gruppe — Admin ist hier der Suite-Admin" |
| `src/core/auth/devGroups.ts:26-30` | „Der Suite-Admin (`ADMIN_GROUP`) steht MIT DRIN: er ist in `isModuleAdmin` die Abkürzung über alle Module" |
| `src/app/m/portal/layout.tsx:34-38` | „hier die Suite-Admin-Gruppe, weil `portal` keine eigene fuehrt" |
| `.env.example:67-69` | „Der Suite-Admin oben darf immer überall … leer gesetzt heißt ‚nur der Suite-Admin'" |
| `.env.example:92-95` | ⚠️ „Der Satz aus Zeile 68-69 gilt fuer radio NICHT …" — **wird gegenstandslos**, weil der Satz aus 68-69 selbst entfällt |
| `.env.example:360-364` | Der `aufgaben`-Notausgang (2.3) |
| `docs/runbooks/aufgaben-inbetriebnahme.md:35-36` | Derselbe Notausgang |
| `src/app/m/feedback/_lib/access.ts:10-13` · `src/app/m/files/_lib/access.ts:62` · `src/app/m/lagerbuch/_lib/zugang.ts:79` · `src/app/m/radio/_lib/zugang.ts:93-99` | Vier „BEWUSST NICHT `isModuleAdmin`"-Begründungen, die dann erklären, warum ein Modul um etwas herumbaut, das es nicht mehr gibt |
| `e2e/launcher.spec.ts:57-60` · `e2e/mobil-admin.spec.ts:92-95` | Zwei e2e-Docblocks, die den Weg über `dashboard-admins` beschreiben |

⚠️ **Diese Tabelle ist das konkrete Maß für „mehr Risiko als Auftrag" (Kapitel 3.4).** Sie ist
Begleitmaterial, kein Tor — aber wer sie auf Weg B nicht abarbeitet, hinterlässt dreizehn Stellen,
die den nächsten Leser in die falsche Richtung schicken.

---

## Kapitel 3 — ⚠️ Was die Spec verlangt: die **enge** Lösung

### 3.1 Der Wortlaut von Entscheidung 9

`docs/superpowers/specs/2026-08-17-radio-modul-design.md:65`, in der Tabelle der 15 gesetzten
Entscheidungen (Kapitel A, Zeilen 51–78):

> „| 9 | `SUITE_ADMIN_GROUP_RADIO`; **`radio` ignoriert den `isModuleAdmin`-Kurzschluss
> modulintern** |"

Ausgeschrieben in Kapitel 1.5, `:682-689`:

> „* **`isModuleAdmin` wird modulintern ignoriert** (Entscheidung 9): es lässt die Suite-Admin-Gruppe
> durch (`core/groups.ts:125`, Vorgabe `dashboard-admins`). `feedback`
> (`m/feedback/_lib/access.ts:10-34`) und `lagerbuch` (`_lib/zugang.ts:79-115`) nehmen davon
> ausdrücklich Abstand, weil sie Betrieb und Einsicht trennen (`core/registry.ts:46`). **`radio`
> gehört in dieselbe Menge, mit eigenem Anlass** … **Folge: wer `radio` verwalten soll, gehört in
> `SUITE_ADMIN_GROUP_RADIO` — auch der Betreiber selbst.**"

Das Wort ist **modulintern**, dreimal, an drei unabhängigen Stellen (`:65`, `:682`, `:4423`).

### 3.2 ⛔ Und die Spec schließt den weiten Weg aus sich selbst aus — zweimal

**Erstens**, unmittelbar unter der Entscheidungstabelle (`:70-72`):

> „**Ausdrücklich nicht Teil dieser Spec** (eigene Suite-Posten): `TZ=Europe/Berlin` · die
> CWE-348-Umstellung in `core/ratelimit.ts` (**Voraussetzung** für das Gate, siehe Kapitel 3) · **das
> Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts`** · das suiteweite Gating von `/m/*`."

**Zweitens**, in §9.7 („Was Spec 2 ausdrücklich **nicht** von hier erbt", `:7791`), mit Begründung:

> „| **Das Entfernen des Suite-Admin-Kurzschlusses in `core/groups.ts`** | Der Kurzschluss ist **kein
> Versehen**; ihn zu entfernen ist `core`-Arbeit und beruehrt sechs Module | Eigene
> Suite-Entscheidung. **`radio` erreicht dasselbe Ziel modulintern, indem es `isModuleAdmin` gar
> nicht benutzt** — wie `feedback` und `lagerbuch` — **und ist damit vorwaertskompatibel** zur
> Umstellung des Admin-Modells vom 03.08. |"

⚠️ **Man beachte den Kontrast innerhalb desselben Zitats:** die CWE-348-Umstellung nennt die Spec
im ersten Zitat ausdrücklich „**Voraussetzung**". Der Kurzschluss-Posten steht in derselben Liste
**ohne** dieses Wort. Die Spec unterscheidet also selbst zwischen „eigener Posten, aber
Voraussetzung" und „eigener Posten, Punkt".

### 3.3 ⛔ Und der gebaute Code sagt dasselbe — das ist das stärkste Argument

Die enge Lösung existiert. `src/app/m/radio/_lib/zugang.ts:93-99`:

```
 * ⛔ BEWUSST NICHT `isModuleAdmin` AUS `core/groups` und keiner seiner drei Verwandten
 * (Kapitel-4-Pflicht 17, docs/radio-portierung-analyse.md:979-997). Alle vier tragen den
 * Suite-Admin-Kurzschluss — `src/core/groups.ts:125` steigt woertlich mit
 * `if (groups.includes(suiteAdminGroup(env))) return true;` aus. Ein Import saehe wie
 * Wiederverwendung aus.
```

Sie ist bewacht: `src/app/m/radio/riegel.test.ts:928-948` scannt das ganze Modulverzeichnis gegen
`/\b(?:isModuleAdmin|requireModuleAdmin|moduleAdminPageOrNotFound|canAdminModule)\b/` und verlangt
`[]`. Und der Test sagt in seinem eigenen Kommentar (`:942-944`), was für diesen Plan entscheidend
ist:

> „⚠️ DER KURZSCHLUSS SELBST WIRD SPAETER ENTFERNT — als eigene kleine Vorarbeit vor Planteil 4
> (KONTEXT-radio-planteil2.md:32-35). **Dieser Scan bleibt trotzdem: er sagt, dass `radio` seine
> Rechte SELBST aufloest, unabhaengig davon, was `core` tut.**"

**„unabhängig davon, was `core` tut" ist die Antwort auf die Frage dieses Kapitels.** `radio`
braucht den Schnitt nicht. Der zweite Test daneben (`riegel.test.ts:951-960`) riegelt zusätzlich
`isAdmin` ab. Beide sind heute grün.

### 3.4 ⚠️ Warum die weite Lösung mehr Risiko trägt als Auftrag

| | **Auftrag** | **Was die weite Lösung tatsächlich tut** |
|---|---|---|
| Reichweite | ein Modul (`radio`) | **sechs** Module — so nennt es die Spec selbst (`:7791`); gemessen sind es **drei mit Wirkung** (`portal`, `qr`, `aufgaben`, Kapitel 2) und drei, die den Verzicht bereits selbst tragen |
| `portal` | nicht erwähnt | ⛔ **verliert seine Verwaltung vollständig**, für jeden (2.2) |
| `aufgaben` | nicht erwähnt | ⛔ verliert einen **in zwei Dateien dokumentierten Notausgang** (2.3) |
| Tests | keiner | **8 Vitest-Fälle** + **4 Playwright-Specs** (2.4) |
| Kommentare | keiner | **13 Stellen** (2.5) |
| Nutzen für `radio` | — | ⛔ **null.** Der Riegel ist gebaut und bewacht (3.3) |
| Rückweg | — | ⚠️ ein `git revert` reicht **nicht**: sobald `SUITE_ADMIN_GROUP_PORTAL` ausgerollt ist, muss auch die `.env` zurück (Rückweg-Abschnitt) |

**Der Auftrag ist damit nicht falsch — er ist nur kein Spec-Erfordernis, sondern eine eigene
Betriebsentscheidung.** Sie kann gute Gründe haben (Betrieb und Einsicht trennen — dasselbe
Argument, das `feedback`, `files`, `lagerbuch` und `radio` bereits einzeln gezogen haben). Aber sie
gehört auf eine Ablesung gestützt, nicht auf eine Frist.

### 3.5 ⬜ Zur Frist „vor Planteil 4" im Leitplan

`docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md:123` begründet die Frist mit „ohne den
Posten trägt Planteil 2 die Umgehung selbst". **Das trifft zu — und ist genau der Zustand, den
`riegel.test.ts:942-944` als dauerhaft gewollt beschreibt.** Planteil 4 baut auf
`requireRadioAdmin`/`istRadioAdmin` aus `src/app/m/radio/_lib/zugang.ts`, nicht auf `core/groups`;
die zweite Rechtestufe kommt laut Spec:4420-4422 ohnehin in ein eigenes `_lib/rollen.ts`.

⚠️ **Formulierung für den Nachtrag (K2 Schritt 4), wörtlich einzuhalten:** die Frist ist eine
**Betreiberentscheidung, kein Spec-Erfordernis**, und Planteil 4 ist **technisch nicht blockiert**.
⛔ **Nicht** schreiben, die Frist sei „falsch" gewesen. Anders als der Nachtrag vom 2026-08-22
(derselbe Leitplan, `:126-160`), der einen **Sachfehler** korrigierte — dort war Rechnung A der
Spec zitiert, obwohl Rechnung B gilt —, korrigiert dieser Nachtrag eine **Kategorie**: der Posten
ist real und beauftragt, er ist nur keine Voraussetzung.

---

## Kapitel 4 — Die zwei Wege, und wie K1 sie auswählt

⛔ **Es gibt genau ein Entscheidungsverfahren.** Zwei gleichberechtigte Wege ohne Verfahren werden
falsch ausgeführt.

```
K1 liest K-L1 … K-L5 ab
        │
        ├─ Ist die Suite-Admin-Gruppe UNBESETZT (K-L2 = leer)?
        │     → der Kurzschluss ist heute schon wirkungslos.
        │       Weg B ist folgenlos. Empfehlung an Ruben: B, aber ohne Eile.
        │
        ├─ Ist sie besetzt UND jede Person steht auch in qr- und
        │  aufgaben-Gruppe (K-L4 = ja, K-L5 = ja)?
        │     → Weg B kostet nur `portal`. Kompensation K3 genuegt.
        │
        └─ Sonst (irgendeine Person fehlt in irgendeiner Modulgruppe)?
              → Weg B SPERRT diese Person AUS. Entweder erst die
                Pocket-ID-Mitgliedschaften nachziehen (dann ist es der
                Fall darueber) — oder Weg A.

  In JEDEM Fall: ⬜ K-L6, Rubens schriftliche Wahl. Der Plan waehlt nicht.
```

**Weg A — der Riegel bleibt.** `src/core/groups.ts` bleibt unverändert. Es entsteht **kein**
Produktivcode. Gebaut wird: der Nachweis, dass `radio` seine Rechte selbst auflöst (K2), und ein
Nachtrag im Leitplan, der die Frist als Betreiberentscheidung einordnet. **Planteil 4 kann
beginnen.**

**Weg B — der Schnitt.** K2 **läuft trotzdem zuerst** (sie ist die Vorbedingung, nicht die
Alternative), danach K3–K6. ⛔ K3 (die Kompensation) **vor** K5 (dem Schnitt), und beides im selben
Deploy.

⚠️ **K2 läuft auf beiden Wegen.** Sie ist billig, sie ist der Beleg, und auf Weg B ist sie die
Zusicherung, dass `radio` durch den Schnitt nichts gewinnt und nichts verliert.

---

## Was dieser Plan anlegt und ändert

| Datei | Weg A | Weg B | Was |
|---|---|---|---|
| `docs/superpowers/plans/2026-08-24-suite-admin-kurzschluss.md` | ✎ | ✎ | Abschnitt „Ablesungen" füllen (K1, K8) |
| `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md` | ✎ | ✎ | Nachtrag unter `:123` (K2) |
| `src/core/groups.ts` | — | ✎ | `:125` entfernen, Kopfkommentar `:12-20` und `:100-101` (K5, K6) |
| `src/core/groups.test.ts` | — | ✎ | Fälle 1–3 umdrehen (K4) |
| `src/app/m/portal/layout.test.tsx` | — | ✎ | Fall 4 (K4) |
| `src/app/m/feedback/_lib/access.test.ts` | — | ✎ | Fall 5, der Stolperdraht (K4) |
| `src/app/m/aufgaben/personen/page.test.tsx` | — | ✎ | Fall 6 (K4) |
| `src/app/m/aufgaben/actions.test.ts` | — | ✎ | Fall 7 (K4) |
| `src/app/m/aufgaben/_lib/zugang.test.ts` | — | ✎ | Fall 8 (K4) |
| **`e2e/helpers/portal.ts`** | — | **+** | ⛔ **Neu.** `PORTAL_ADMIN_GRUPPE` + `PORTAL_ENV`, nach dem Vorbild `e2e/helpers/lagerbuch.ts:63-68` (K4 Schritt 3) |
| **`playwright.config.ts`** | — | ✎ | ⛔ `...PORTAL_ENV` in `webServer.env`. **Ohne diese Zeile ist die E2E nach dem Schnitt unrettbar rot** (K4 Schritt 3) |
| `e2e/portal.spec.ts` · `e2e/launcher.spec.ts` · `e2e/mobil-admin.spec.ts` | — | ✎ | Gruppen der Dev-Logins (K4 Schritt 4) |
| `.env.example` | — | ✎ | `SUITE_ADMIN_GROUP_PORTAL` dokumentieren; `:67-69`, `:92-95`, `:360-364` (K3, K6) |
| `docs/runbooks/aufgaben-inbetriebnahme.md` | — | ✎ | Notausgang aus `:35-36` ersetzen (K6) |
| `src/core/registry.ts` · `src/core/auth/devGroups.ts` · `src/app/m/portal/layout.tsx` | — | ✎ | Kommentare (K6) |
| **Produktions-`.env`** (nicht im Repo) | — | ⚠️ | `SUITE_ADMIN_GROUP_PORTAL=` — **Ruben**, im selben Deploy (K3) |

⛔ **`src/app/m/radio/**` wird in KEINEM Weg angefasst.** Weder `_lib/zugang.ts` noch
`riegel.test.ts`. Der Scan bleibt, wie sein Kommentar (`:942-944`) es verlangt.

---

## Aufgabe K1 — Die Ablesung. Kein Code, und sie ist der Torwächter.

⛔ **Ohne diese Aufgabe passiert nichts anderes in diesem Plan.** Kein Tor dieses Repos ersetzt sie
(Punkt 6 oben). Sie wird **von Ruben** gefahren, nicht von einem Agenten — die Werte stehen auf dem
Produktionsserver und in Pocket ID.

### Schritte

- [ ] **1 — ⬜ K-L1: die globale Gruppe.** Auf dem Server, im Verzeichnis der `.env`:
      `rtk grep '^ADMIN_GROUP=' .env`
      Kein Treffer → es gilt der Code-Default `dashboard-admins` (`src/core/groups.ts:97`).
      Treffer → dieser Wert gilt. **Beide Ausgänge notieren**, nicht nur den Treffer.

- [ ] **2 — ⬜ K-L2: ist sie besetzt, und mit wem?** Pocket ID (`id.iuk-ue.de`) → Groups → die
      Gruppe aus Schritt 1 → Mitglieder. ⚠️ **Namen notieren, nicht die Anzahl** — die weiteren
      Schritte vergleichen Personen, nicht Zahlen.
      ⛔ **Ist die Liste leer, ist der Kurzschluss heute schon wirkungslos.** Dann ist Weg B
      folgenlos, und der ganze übrige Plan verliert seine Schärfe. Das ist ein gutes Ergebnis —
      aber es muss dastehen, nicht angenommen werden.

- [ ] **3 — ⬜ K-L3: gibt es heute schon eine Portal-Gruppe?**
      `rtk grep '^SUITE_ADMIN_GROUP_PORTAL=' .env`
      **Erwartung: kein Treffer.** Die Variable kommt in `.env.example` nirgends vor; das ist in
      einer Datei dieser Sorgfalt starke Evidenz dafür, dass sie auch produktiv nicht gesetzt ist.
      ⚠️ **Erwartung ist keine Ablesung** — Ergebnis eintragen.

- [ ] **4 — ⬜ K-L4: `qr`.** Zuerst der Gruppenname:
      `rtk grep '^SUITE_ADMIN_GROUP_QR=' .env` — kein Treffer heißt Registry-Vorgabe
      `iuk-qr-admin` (`src/core/registry.ts:64`). Dann in Pocket ID: steht **jede** Person aus
      K-L2 in dieser Gruppe? **Wer fehlt, verliert die qr-Verwaltung** (Kapitel 2.1).

- [ ] **5 — ⬜ K-L5: `aufgaben`.** Ebenso:
      `rtk grep '^SUITE_ADMIN_GROUP_AUFGABEN=' .env` — Vorschlag der Vorlage ist
      `aufgaben_koordination` (`.env.example:388`), Registry-Vorgabe wäre
      `iuk-aufgaben-koordination` (`src/core/registry.ts:172`). ⚠️ `.env.example:373-377` sagt
      ausdrücklich, dass die produktiven Namen **von der Registry abweichen** — hier nicht raten.
      Dann in Pocket ID: steht **jede** Person aus K-L2 auch dort?
      **Wer fehlt, verliert die gesamte Koordinationsrolle**, nicht nur `/personen`
      (`.env.example:348-365`).

- [ ] **6 — ⬜ K-L6: die Wegwahl, schriftlich.** Ruben bekommt das Entscheidungsdiagramm aus
      Kapitel 4 zusammen mit den Ergebnissen aus 1–5 und den drei Sätzen aus Kapitel 3.4 vorgelegt.
      Die Antwort ist **A** oder **B** und wird in „Ablesungen" eingetragen. ⛔ **Der Plan wählt
      nicht.**

- [ ] **7 — ⬜ K-L7, nur bei B: die Portal-Admin-Gruppe.** In Pocket ID **anlegen und besetzen**,
      Namen notieren. ⚠️ Sie muss **vor** dem Deploy des Schnitts existieren und Mitglieder haben,
      und die Mitglieder müssen sich **neu anmelden** — Gruppen im JWT ziehen erst beim nächsten
      Refresh nach, bis zu eine Stunde (`CLAUDE.md`, „Zugriffsschutz").

### Tor

Alle sieben Zeilen im Abschnitt „Ablesungen" ausgefüllt, mit Datum und Ableser. ⛔ Vorher beginnt
weder K3 noch ein Rollout.

---

## Aufgabe K2 — Der enge Nachweis. Läuft auf BEIDEN Wegen, und zuerst.

**Zweck:** belegen, dass die Spec-Auflage aus Entscheidung 9 **erfüllt** ist und Planteil 4 nicht
blockiert. Kein Produktivcode.

### Schritte

- [ ] **1 — Den Riegel selbst prüfen, nicht behaupten.**
      `rtk pnpm vitest run src/app/m/radio/riegel.test.ts src/app/m/radio/_lib/zugang.test.ts`
      Beide Dateien müssen grün sein. Der tragende Fall heißt „findet keinen der vier core-Riegel"
      (`src/app/m/radio/riegel.test.ts:929-948`).

- [ ] **2 — Die Mutation fahren, die den Nachweis erst zu einem macht.** In
      `src/app/m/radio/_lib/zugang.ts` das Prädikat `istRadioAdmin` versuchsweise auf
      `isModuleAdmin(getModule("radio"), viewer?.groups)` umstellen und den Lauf aus Schritt 1
      wiederholen. **Erwartung: rot**, und zwar sowohl in `riegel.test.ts` (der Quelltext-Scan) als
      auch in `zugang.test.ts:118-133` (der Verhaltensfall).
      ⛔ **Die Rücknahme NICHT über `git checkout --` machen.** Im Repo läuft parallel anderes; ein
      blindes `checkout` auf diese Datei verwürfe fremde, nicht committete Arbeit. Stattdessen, in
      dieser Reihenfolge:
      1. **Vor** der Mutation: `rtk git diff -- src/app/m/radio/_lib/zugang.ts > /tmp/radio-vorher.diff`
         und `rtk git status --short src/app/m/radio/` protokollieren.
      2. Die Mutation **von Hand** eintragen — eine Zeile — und **von Hand** wieder zurücknehmen.
      3. **Danach** `rtk git diff -- src/app/m/radio/_lib/zugang.ts` mit `/tmp/radio-vorher.diff`
         vergleichen: **byteweise gleich**, sonst ist etwas offen geblieben.
      ⛔ Diese Mutation wird nicht committet, und `src/app/m/radio/` steht in keinem Commit dieses
      Plans (Kapitel „Was dieser Plan anlegt").

- [ ] **3 — Die Belegzeilen in „Ablesungen" eintragen:** Datei, Zeile, Testname, Ergebnis von
      Schritt 1 und Schritt 2.

- [ ] **4 — Der Nachtrag im Leitplan.** In
      `docs/superpowers/plans/2026-08-21-radio-modul-leitplan.md`, **unter** der Tabelle mit `:123`
      und in derselben Form wie der vorhandene Nachtrag `:126-160`
      („### ⬜ Nachtrag 2026-08-22 — …"), ein Abschnitt
      „### Nachtrag 2026-08-24 — der Kurzschluss-Posten ist eine Betreiberentscheidung, keine
      Voraussetzung". Er muss **vier** Dinge sagen, jedes mit Fundstelle:
      1. Die Spec verlangt die enge Lösung — `:65`, `:682-689`.
      2. Sie schließt die weite aus sich selbst aus — `:70-72` und `:7791`; ⚠️ und sie nennt die
         CWE-348-Umstellung in derselben Liste „Voraussetzung", diesen Posten **nicht**.
      3. Die enge Lösung ist gebaut und bewacht — `src/app/m/radio/_lib/zugang.ts:93-127`,
         `riegel.test.ts:928-948`, mit dem Zitat aus `:942-944`.
      4. **Folge: Planteil 4 ist technisch nicht blockiert.** Der Posten bleibt beauftragt
         (`.superpowers/sdd/KONTEXT-radio-planteil2.md`) und wird über K-L6 entschieden.
      ⛔ **Nicht** „die Frist war falsch" schreiben (Kapitel 3.5).

- [ ] **5 — Verweis auf diesen Plan** aus dem Nachtrag heraus, mit Pfad.

### Tor

- [ ] `rtk pnpm vitest run src/app/m/radio` grün.
- [ ] `rtk git status` zeigt **nur** die Leitplan-Datei und diese Plandatei als geändert. ⛔ `radio`
      unverändert (Schritt 2 zurückgenommen).
- [ ] Ein Commit.

⛔ **Ist K-L6 = A, endet der Plan hier.** K3–K6 entfallen; K7 und K8 werden in der A-Fassung
gefahren (dort beschrieben).

---

## Aufgabe K3 — ⛔ Nur Weg B. Die Kompensation ZUERST, nicht danach.

**Zweck:** dafür sorgen, dass `portal` nach dem Schnitt noch administrierbar ist. ⛔ **Diese Aufgabe
liegt vor K5 und muss im selben Deploy landen.** Ein Deploy mit dem Schnitt und ohne
`SUITE_ADMIN_GROUP_PORTAL` macht die Portal-Verwaltung unerreichbar — auch für den, der den Fehler
beheben will.

### Vorbedingung

- [ ] ⬜ **K-L6 = B**, schriftlich. ⬜ **K-L7** abgelesen: die Gruppe existiert in Pocket ID **und
      hat Mitglieder**.

### Schritte

- [ ] **1 — Zuerst prüfen, dass die Variable ohne Codeänderung gültig ist.** Ein neuer Fall in
      `src/core/groups.test.ts`, im `describe("validateGroupConfig")`-Block (`:134`):
      `expect(validateGroupConfig(["portal"], { SUITE_ADMIN_GROUP_PORTAL: "iuk-portal-admin" })).toEqual([])`
      **Erwartung: sofort grün** — `:142` baut die Allowlist aus `moduleKeys`, `bootstrap.ts:91`
      speist sie mit `MODULES.map((m) => m.key)`, und `"portal"` steht in `registry.ts:57`.
      ⚠️ **Ein sofort grüner Test ist hier kein TDD-Verstoß, sondern der Punkt:** er belegt, dass
      die Kompensation **keine** Codeänderung braucht. Der Kommentar darüber muss das sagen.

- [ ] **2 — Die Wirkprobe daneben**, ebenfalls in `groups.test.ts`:
      `expect(isModuleAdmin(mod({ key: "portal", adminGroups: [] }), ["iuk-portal-admin"], { SUITE_ADMIN_GROUP_PORTAL: "iuk-portal-admin" })).toBe(true)`
      Sie muss **auch nach K5 noch grün** sein — sie ist der Beweis, dass der Rückweg trägt.

- [ ] **3 — `.env.example` erweitern**, im Block bei `:67-72` (dort stehen `SUITE_ADMIN_GROUP_QR`
      und `_FEEDBACK`). Die Zeile bekommt einen ausgeschriebenen Warnblock nach dem Vorbild von
      `.env.example:76-96` (`radio`) und muss **drei** Dinge sagen:
      * `portal` führt in der Registry `adminGroups: []` (`src/core/registry.ts:57-59`) — **ohne
        diese Variable ist `/m/portal/admin` für niemanden erreichbar.**
      * Leer gesetzt wird **nicht** gemeldet (`src/core/groups.ts:156` prüft nur ACCESS) und ist
        gleichbedeutend mit „gesperrt".
      * Ein **Tippfehler im Namen** bricht dagegen laut ab (`:152-154` → `bootstrap.ts:90-100`).
      ```
      # portal: PFLICHT seit dem Wegfall des Suite-Admin-Kurzschlusses (2026-08-24).
      SUITE_ADMIN_GROUP_PORTAL=iuk-portal-admin
      ```
      ⚠️ Der Wert ist der **Vorschlag**; der echte Name ist ⬜ K-L7.

- [ ] **4 — ⚠️ Die Produktions-`.env` ist NICHT im Repo.** Der Eintrag dort ist **Rubens** Schritt,
      im selben Deploy. In „Ablesungen" als eigene Zeile führen, mit Datum. ⛔ Ein Agent trägt hier
      nichts ein und behauptet nichts über ihren Inhalt.

### Tor

- [ ] `rtk pnpm vitest run src/core/groups.test.ts` grün, zwei Fälle mehr.
- [ ] `rtk pnpm typecheck` 0 · `rtk pnpm lint` 0.
- [ ] Ein Commit, ohne Änderung an `src/core/groups.ts`.

---

## Aufgabe K4 — ⛔ Nur Weg B. Die Testumkehr. ⚠️ Rot heißt hier: gegen den HEUTIGEN Code.

**Zweck:** die zwölf Zusicherungen aus 2.4 auf das neue Verhalten drehen — **bevor** `:125` fällt.

⚠️ **Die Richtung ist umgekehrt zum üblichen TDD.** Die Tests existieren und sind grün; sie sichern
das Verhalten zu, das verschwinden soll. Der Schritt lautet: **Zusicherung drehen → gegen den
unveränderten Code laufen → rot sehen → erst in K5 schneiden.** Wer stattdessen zuerst schneidet und
dann „die roten Tests repariert", hat nichts bewiesen, sondern nur aufgeräumt.

### Schritte

- [ ] **1 — Die acht Vitest-Fälle aus 2.4 drehen**, in dieser Reihenfolge, **einzeln**, jeweils mit
      einem Kommentar, der die Entscheidung und dieses Plandokument nennt:

      | # | Datei:Zeile | Neue Zusicherung |
      |---|---|---|
      | 1 | `src/core/groups.test.ts:96-98` | Umbenennen zu „Suite-Admin allein genügt NICHT mehr — jedes Modul führt seine eigene Gruppe"; `toBe(false)` |
      | 2 | `src/core/groups.test.ts:113-117` | `portal` mit `adminGroups: []` gewährt **niemandem** etwas; beide `expect` auf `false`. ⚠️ Der Kommentar muss auf `SUITE_ADMIN_GROUP_PORTAL` (K3) zeigen, sonst liest sich der Test wie ein toter Zweig |
      | 3 | `src/core/groups.test.ts:128-131` | Umbenennen: `ADMIN_GROUP` wirkt **nicht mehr** auf `isModuleAdmin`; `toBe(false)`. ⚠️ Danebenstellen: `suiteAdminGroup({ ADMIN_GROUP: "admin" })` liefert weiter `"admin"` (`:45-47` bleibt grün) — die Funktion bleibt, nur ihr Konsument in `:125` fällt weg |
      | 4 | `src/app/m/portal/layout.test.tsx:91-99` | `sessionFor([suiteAdminGroup()])` → `navFuerPortal(false)`; **neuer Fall** daneben mit `SUITE_ADMIN_GROUP_PORTAL` gestubbt (`vi.stubEnv`) → `navFuerPortal(true)` |
      | 5 | `src/app/m/feedback/_lib/access.test.ts:26-30` | ⛔ **Der Stolperdraht.** Die Gegenprobe auf `false` drehen **und den Kommentar `:19-24` umschreiben** — er begründet den Fall damit, dass die Entscheidung „nur für feedback" galt. Ab jetzt gilt sie suiteweit; das muss dort stehen, sonst widerspricht der Kommentar seinem eigenen Test |
      | 6 | `src/app/m/aufgaben/personen/page.test.tsx:172-178` | Suite-Admin ohne Koordinationsgruppe bekommt die Seite **nicht** mehr. ⚠️ Der `describe`-Titel `:165` heißt „DER NOTAUSGANG" — mit umbenennen |
      | 7 | `src/app/m/aufgaben/actions.test.ts:2585-2599` | Suite-Admin ohne Koordinationsgruppe legt **keine** erste Person mehr an. ⛔ Daneben ein **neuer** Fall: die Koordinationsgruppe **allein** legt sie an — das ist ab jetzt der einzige Erstbetriebsweg, und ohne ihn wäre das Modul nicht mehr in Betrieb zu nehmen |
      | 8 | `src/app/m/aufgaben/_lib/zugang.test.ts:249-255` | Suite-Admin bekommt **keine** `personen`-Zeile mehr. ⚠️ Der Kommentar `:237-247` nennt sich selbst „WAECHTER FUER DIE GEGENRICHTUNG" und verlangt, dass „die Frage nach dem Rueckweg dann beantwortet werden muss" — **hier ist der Moment.** Die Antwort (K6, Runbook) gehört in den neuen Kommentar |

- [ ] **2 — Jetzt laufen lassen, gegen den UNVERÄNDERTEN `src/core/groups.ts`.**
      `rtk pnpm vitest run src/core/groups.test.ts src/app/m/portal src/app/m/feedback src/app/m/aufgaben`
      ⛔ **Erwartung: genau diese acht sind rot.** Ist einer grün, sichert er nicht das zu, was sein
      Name sagt — dann zuerst klären, warum, nicht weiterbauen. Die Zahl in „Ablesungen" notieren.

- [ ] **3 — ⛔ ZUERST `playwright.config.ts`, sonst ist Schritt 4 vergeblich.** ⚠️ **Die
      naheliegende Lösung — nur den Gruppennamen in den Specs ändern — kann nicht funktionieren, und
      der Grund ist `portal`s `adminGroups: []`.** Gemessen: `playwright.config.ts` setzt in
      `webServer.env` **genau eine** `SUITE_*`-Variable direkt (`:181`, `SUITE_HOST_FILES`); alle
      übrigen kommen über die Spreads `...AUFGABEN_ENV` (`:281`) und `...LAGERBUCH_ENV` (`:297`).
      `SUITE_ADMIN_GROUP_PORTAL` steht **nirgends** — weder dort noch in `.env.local`. Also liefert
      `adminGroupsFor(getModule("portal"))` in E2E `[]` (`src/core/groups.ts:104` → `registry.ts:58`),
      und nach K5 ist `/m/portal/admin` im E2E-Server für **jede** Gruppenliste 404. **Welchen Namen
      der `devLogin` trägt, ist dann gleichgültig.**
      Der Umbau folgt dem vorhandenen Muster, nicht einer neuen Erfindung:
      * **`e2e/helpers/portal.ts` anlegen**, nach dem Vorbild von `e2e/helpers/lagerbuch.ts:31,63,68`
        und `e2e/helpers/aufgaben.ts:49,51`: eine Konstante `PORTAL_ADMIN_GRUPPE` und ein
        `export const PORTAL_ENV: Record<string, string> = { SUITE_ADMIN_GROUP_PORTAL: PORTAL_ADMIN_GRUPPE }`.
      * **`playwright.config.ts`**: importieren (neben `:7-8`) und als `...PORTAL_ENV` in
        `webServer.env` spreaden, neben `...AUFGABEN_ENV` (`:281`).
      * ⚠️ **Die Begründung im Kommentar ist Pflicht und steht schon geschrieben** —
        `playwright.config.ts:283-288` sagt für `lagerbuch` genau, warum EINE Quelle:
        „`devLogin(…, { groups })` in jedem Verwaltungs-Spec liest DIESELBE Konstante wie
        SUITE_ADMIN_GROUP_LAGERBUCH hier. **Zwei Literale liefen auseinander, ohne dass ein Lauf rot
        wuerde — er waere GEGENTEILIG gruen**: ohne passende Gruppe bezeugt der Spec den 404".
        ⛔ **Für `portal` ist genau dieser Fehlerfall der wahrscheinlichste dieses Plans**, weil das
        erwartete Ergebnis vor und nach dem Schnitt in mehreren Specs ein 404 ist.
      * ⚠️ **Der Wert von `PORTAL_ADMIN_GRUPPE` ist der Vorschlag aus `.env.example` (K3 Schritt 3),
        NICHT ⬜ K-L7.** Dieselbe Trennung, die `.env.example:373-377` für `aufgaben` ausschreibt:
        die produktiven Gruppennamen weichen bewusst ab, und die E2E-Literale bleiben unverändert.

- [ ] **4 — Die vier Playwright-Specs.** In jeder den Dev-Login um `PORTAL_ADMIN_GRUPPE` erweitern —
      **als importierte Konstante, nicht als Zeichenkette** (Schritt 3, letzter Punkt). Die Docblocks
      daneben mit anpassen:
      * `e2e/portal.spec.ts:30`, `:40` — `groups: "dashboard-admins"` →
        `groups: \`dashboard-admins,${PORTAL_ADMIN_GRUPPE}\``. ⚠️ `:25` (Dienste-Sichtbarkeit)
        **nicht** anfassen: dort ist `dashboard-admins` eine `requiredGroups`-Gruppe eines Dienstes
        (`scripts/import/fixtures/portal-services.sample.ndjson`), kein Admin-Recht.
      * `e2e/launcher.spec.ts:78` — dieselbe Erweiterung; ⛔ **den Docblock `:57-60` umschreiben**,
        er begründet den heutigen Weg wörtlich mit `adminGroups: []`.
      * `e2e/mobil-admin.spec.ts:96` — `GRUPPEN` um die Portal-Gruppe erweitern; Docblock `:92-95`
        anpassen (er nennt `moduleAdminPageOrNotFound("portal")` namentlich).
      ⚠️ **Diese vier Specs sind erst in K7 Schritt 5 prüfbar** — Vitest fährt sie nicht.

- [ ] **5 — ⛔ `src/app/m/radio/**` bleibt unangetastet** (Kapitel „Was dieser Plan anlegt").

### Tests — je Test die Mutation, die ihn rot macht

| Test | Mutation, die ihn rot macht |
|---|---|
| `groups.test.ts` Fall 1 (gedreht) | `:125` wieder einsetzen |
| `groups.test.ts` Fall 2 (gedreht) | `:125` wieder einsetzen **oder** `portal` in der Registry eine `adminGroups`-Vorgabe geben |
| `groups.test.ts` Fall 3 (gedreht) | `:125` wieder einsetzen |
| `groups.test.ts` K3-Fall (Wirkprobe) | `adminGroupsFor` durch `mod.adminGroups` ersetzen (`:104` weglassen) — `SUITE_ADMIN_GROUP_PORTAL` würde still wirkungslos |
| `portal/layout.test.tsx` Fall 4 + neuer Fall | `canAdminModule` in `layout.tsx:39` durch `true` ersetzen |
| `feedback/_lib/access.test.ts` Fall 5 | `:125` wieder einsetzen |
| `aufgaben` Fälle 6–8 | `:125` wieder einsetzen — **alle drei zugleich**, das ist die Probe, dass sie denselben Notausgang bewachen |

### Tor

- [ ] Acht rote Fälle gegen den unveränderten Produktivcode, namentlich protokolliert.
- [ ] `rtk pnpm typecheck` 0 · `rtk pnpm lint` 0.
- [ ] ⚠️ **Kein Commit am roten Baum.** K4 und K5 sind **ein** Commit.

---

## Aufgabe K5 — ⛔ Nur Weg B. Der Schnitt. Eine Zeile.

### Schritte

- [ ] **1 — `src/core/groups.ts:125` entfernen.** Nur diese Zeile. Danach:

      ```ts
      export function isModuleAdmin(
        mod: ModuleDef,
        groups: string[] | null | undefined,
        env: EnvLike = process.env,
      ): boolean {
        if (!groups) return false;
        return adminGroupsFor(mod, env).some((g) => groups.includes(g));
      }
      ```

- [ ] **2 — ⛔ `suiteAdminGroup` NICHT entfernen.** Sie hat einen zweiten, unabhängigen Konsumenten:
      `src/core/auth/config.ts:205` (`session.user.isAdmin`) und
      `src/core/auth/devGroups.ts:40` (die Dev-Login-Auswahl). Beide bleiben richtig. Ebenso bleibt
      `src/core/groups.test.ts:41-47`.

- [ ] **3 — Alle acht drehen auf grün sehen.**
      `rtk pnpm vitest run src/core/groups.test.ts src/app/m/portal src/app/m/feedback src/app/m/aufgaben`

- [ ] **4 — Die Rückwärts-Mutation fahren:** `:125` wieder einsetzen, Lauf wiederholen, **acht rot**
      bestätigen, wieder entfernen. Das ist der Beweis, dass die acht Fälle **diese** Zeile bewachen
      und nicht etwas in ihrer Nähe.

- [ ] **5 — Vollständiger Lauf.** `rtk pnpm vitest run` — **479/479 Dateien, 8509/8509 Tests**, plus
      die in K3 und K4 neu angelegten Fälle. ⛔ Jede darüber hinausgehende rote Datei ist ein Fund
      dieses Plans, kein Altlast-Fehlschlag: die Suite ist seit 21.08.2026 grün.

### Tor

- [ ] Voller Vitest-Lauf grün, Zahlen protokolliert.
- [ ] `rtk pnpm typecheck` 0 · `rtk pnpm lint` 0.
- [ ] `rtk git show --stat HEAD`: die Dateien aus K4 plus `src/core/groups.ts`. ⛔ **Kein
      `src/app/m/radio/`.**
- [ ] Ein Commit für K4+K5 zusammen.

---

## Aufgabe K6 — ⛔ Nur Weg B. Die Kommentarernte. Ohne sie zeigen 13 Stellen in die falsche Richtung.

**Zweck:** Kapitel 2.5 abarbeiten. ⚠️ **Das ist keine Kosmetik.** Vier der Stellen sind
Begründungen, warum vier Module um etwas herumbauen; zwei sind Betriebsanweisungen für einen
Notausgang, den es nicht mehr gibt.

### Schritte

- [ ] **1 — `src/core/groups.ts:12-20`, der Kopfkommentar.** Die Zeile „Ist überall Admin, damit ein
      Modul nicht aussperrbar ist" (`:13-14`) ist ab jetzt falsch. Ersetzen durch: was
      `ADMIN_GROUP` **noch** tut (`session.user.isAdmin`, `config.ts:205`; die Dev-Login-Auswahl,
      `devGroups.ts:40`) und was es **nicht mehr** tut. ⚠️ **Mit Datum und Verweis auf diesen Plan**
      — sonst setzt der nächste Leser die Zeile aus derselben Überlegung wieder ein, aus der sie
      einmal entstand. Ebenso `:100-101` („dann bleibt nur der Suite-Admin").

- [ ] **2 — `src/core/registry.ts:24-27`** — „zusätzlich zum Suite-Admin, der überall darf" streichen.
      **`:54-56`** (der `portal`-Kommentar) auf `SUITE_ADMIN_GROUP_PORTAL` umschreiben. ⚠️ Wenn
      `adminGroups: []` bleibt, gehört ein Satz dazu, warum die Registry keine Vorgabe trägt und die
      Variable Pflicht ist.

- [ ] **3 — `src/core/auth/devGroups.ts:26-30`** — „er ist in `isModuleAdmin` die Abkürzung über alle
      Module" streichen; die Gruppe bleibt in der Auswahl (`:40`), jetzt aus einem anderen Grund
      (`session.user.isAdmin`). ⚠️ Der Satz über `files` (`:28-30`) verliert seinen Kontrast — er
      beschrieb eine Ausnahme, die jetzt die Regel ist.

- [ ] **4 — `src/app/m/portal/layout.tsx:34-38`** — „weil `portal` keine eigene fuehrt" auf die neue
      Lage umschreiben.

- [ ] **5 — `.env.example`, drei Stellen.**
      * `:67-69` — „Der Suite-Admin oben darf immer überall" und „leer gesetzt heißt ‚nur der
        Suite-Admin'" sind beide falsch.
      * `:92-95` — ⚠️ **der `radio`-Block verweist auf `:68-69`** („Der Satz aus Zeile 68-69 gilt
        fuer radio NICHT"). Fällt der Satz weg, hängt der Verweis in der Luft. Umschreiben zu: `radio`
        löst seine Rechte modulintern auf (`_lib/zugang.ts:93-127`), was seit 2026-08-24 der
        suiteweiten Regel entspricht. ⛔ **Den `radio`-Block nicht löschen** — Entscheidung 9 und die
        Falle-23-Warnung (`:83-91`) gelten unverändert.
      * `:348-365` — der `aufgaben`-Block. ⛔ **Folge 2 („DER RUECKWEG IST DIE SUITE-ADMIN-GRUPPE")
        ersetzen**, nicht nur streichen: der neue Rückweg ist, die Koordinationsgruppe in Pocket ID
        zu korrigieren, und der wirkt mit demselben Stunden-Verzug (Folge 3, `:364-365`, bleibt).

- [ ] **6 — `docs/runbooks/aufgaben-inbetriebnahme.md:35-36`.** Dieselbe Ersetzung wie 5c. ⚠️ **Das
      ist die betrieblich wichtigste Zeile des ganzen Plans** — sie wird in dem Moment gelesen, in
      dem niemand mehr hineinkommt. Sie muss dann stimmen. Auch `:14` und `:77` gegenlesen.

- [ ] **7 — Die vier „BEWUSST NICHT `isModuleAdmin`"-Begründungen ergänzen**, nicht löschen:
      `src/app/m/feedback/_lib/access.ts:10-13` · `src/app/m/files/_lib/access.ts:62` ·
      `src/app/m/lagerbuch/_lib/zugang.ts:79`. ⛔ **`src/app/m/radio/_lib/zugang.ts` bleibt
      unverändert** (Kapitel „Was dieser Plan anlegt"); sein Kommentar `:93-99` zitiert `:125`
      wörtlich und wird dadurch historisch — das ist hinnehmbar, `riegel.test.ts:942-944` sagt
      ausdrücklich, dass der Riegel unabhängig von `core` steht.
      Je Datei **ein Satz**: die Entscheidung galt einmal modulweit, seit 2026-08-24 gilt sie
      suiteweit; das Prädikat bleibt trotzdem modul-eigen, weil `isModuleAdmin` weiterhin die
      **falsche Frage** stellt (`canAccess`-Semantik, Sichtbarkeit statt Riegel).
      ⚠️ **`files` hat einen Quelltext-Scan**, der `suiteAdminGroup`/`isModuleAdmin` im ganzen
      Modulverzeichnis verbietet (`src/app/m/files/_lib/access.test.ts:39-41`) — die neuen
      Kommentare dürfen die Namen dort **nicht** enthalten. Dasselbe für `lagerbuch`
      (`_lib/bauform.test.ts:233-245`) und `radio` (`riegel.test.ts:946`).
      ⛔ **Nach diesem Schritt `rtk pnpm vitest run src/app/m/files src/app/m/lagerbuch src/app/m/radio`**
      — die drei Scans sind der einzige Weg, diesen Fehler zu bemerken.

- [ ] **8 — `src/app/m/feedback/(admin)/layout.test.tsx:170`** — der Testname behauptet
      `isFeedbackAdmin != isModuleAdmin`. Der Test bleibt grün und richtig; **umbenennen**, sonst
      liest sich ein grüner Test als Beleg für einen Unterschied, den es nicht mehr gibt.

### Tor

- [ ] `rtk pnpm vitest run` — **479/479, 8509/8509** plus die neuen Fälle.
- [ ] `rtk pnpm typecheck` 0 · `rtk pnpm lint` 0.
- [ ] `rtk grep -rn 'Suite-Admin' src .env.example docs/runbooks` durchsehen: **keine** Fundstelle
      behauptet noch, der Suite-Admin dürfe überall.
- [ ] Ein Commit.

---

## Aufgabe K7 — Die Tore, in der Reihenfolge, die etwas beweist

### Schritte

- [ ] **1 — `rtk pnpm typecheck`.** 0 Fehler. ⚠️ Außerhalb dieser Umgebung den **Exit-Code** prüfen,
      niemals `grep "error TS"` auf farbigem Output (`CLAUDE.md`, „Tests").
- [ ] **2 — `rtk pnpm lint`.** 0 Fehler.
- [ ] **3 — `rtk pnpm vitest run`.** Grundlinie **479/479 Dateien, 8509/8509 Tests** plus die neuen
      Fälle dieses Plans. ⛔ Zahlen protokollieren, nicht „grün" schreiben.
- [ ] **4 — `rtk pnpm build`.** ⛔ **Erst jetzt** (Global Constraints). Danach `rm -rf .next`, bevor
      erneut getestet wird.
- [ ] **5 — `rtk pnpm exec playwright test`.** ⛔ **Nicht optional**, und auf Weg B der einzige Lauf,
      der die vier angepassten Specs aus K4 Schritt 4 und die neue `webServer.env`-Zeile aus K4
      Schritt 3 tatsächlich fährt. ⚠️ Auf **Weg A** ebenfalls
      fahren: er belegt, dass nichts angefasst wurde, was nicht angefasst werden sollte.
- [ ] **6 — `rtk git log --oneline -5`** und `rtk git show --stat HEAD`: nur die Dateien aus der
      Tabelle „Was dieser Plan anlegt und ändert". ⛔ **Kein `src/app/m/radio/`.**

### Tor

Alle sechs Zeilen abgehakt, mit Zahlen. ⛔ **Ein grünes Tor ist hier kein Freibrief** — es sieht die
Frage aus K8 strukturell nicht (Punkt 6 oben).

---

## Aufgabe K8 — ⛔ Die Abnahme beim Betreiber. Der Grund, warum dieser Plan schwer ist.

**Kein Tor dieses Repos kann sehen, ob jemand ausgesperrt wurde.** Die Testsuite kennt
`dashboard-admins`, `iuk-qr-admin` und `iuk-aufgaben-koordination` als Literale aus dem Quelltext;
sie kennt keinen einzigen Menschen. **Diese Aufgabe fährt Ruben, an einem echten Browser, nach dem
Deploy.**

### Weg A — die Abnahme ist kurz

- [ ] **A1 —** `/m/portal/admin` ist für die Person aus ⬜ K-L2 weiterhin erreichbar. **Ergebnis:**
      ⬜ ______
- [ ] **A2 —** Der Nachtrag steht im Leitplan und nennt diesen Plan. **Ergebnis:** ⬜ ______

### Weg B — die Wirkprobe

⚠️ **Vor jedem Schritt: neu anmelden.** Gruppen im JWT ziehen erst beim nächsten Refresh nach, bis
zu eine Stunde (`CLAUDE.md`, „Zugriffsschutz"). Eine offene Sitzung misst den Zustand von vorhin.

- [ ] **B1 — Ausrollen** nach `docs/runbooks/auto-rollout.md`. ⛔ Mit `SUITE_ADMIN_GROUP_PORTAL` in
      der `.env` (K3 Schritt 4) im **selben** Deploy.
- [ ] **B2 — Der Container startet.** Ein Tippfehler in der neuen Variable bricht den Boot laut ab
      (`src/core/groups.ts:152-154` → `src/core/bootstrap.ts:90-100`) — das ist die einzige Zeile
      dieser Abnahme, die sich von selbst meldet.
      `rtk docker logs <container> | rtk grep -i 'Ungültige Host-Konfiguration'` → **erwartet: leer.**
      **Ergebnis:** ⬜ ______
- [ ] **B3 — Portal, positiv.** Mit einem Konto aus der neuen Portal-Gruppe (⬜ K-L7) neu anmelden,
      `https://iuk-ue.de/admin` aufrufen. **Erwartet:** die Dienstliste rendert, der
      Navigationseintrag „Verwaltung" ist da.
      **Ergebnis:** ⬜ ______
- [ ] **B4 — Portal, schreibend.** Einen Testdienst anlegen und wieder löschen; den Ansprechpartner
      setzen und neu laden. ⚠️ **Nicht nur die Seite ansehen** — `moduleAdminPageOrNotFound` und
      `requireModuleAdmin` sind zwei verschiedene Riegel (`src/core/auth/guards.ts:20-32`), und nur
      der zweite deckt die drei Actions (`src/app/m/portal/actions.ts:10`, `:21`, `:32`).
      **Ergebnis:** ⬜ ______
- [ ] **B5 — Portal, negativ.** Mit einem Konto, das **nur** in der Suite-Admin-Gruppe steht,
      neu anmelden und `https://iuk-ue.de/admin` aufrufen. **Erwartet: 404**, und **kein**
      Navigationseintrag „Verwaltung".
      **Ergebnis:** ⬜ ______
- [ ] **B6 — `qr`.** Für **jede** Person aus ⬜ K-L2 einzeln: `/admin` auf dem qr-Host aufrufen.
      **Erwartet:** erreichbar für die, die in der qr-Admin-Gruppe stehen (K-L4); 404 für die
      anderen — **und das ist dann kein Fehler, sondern der beabsichtigte Verlust.** ⛔ Wer den
      Zugang behalten soll, wird in Pocket ID nachgetragen, **nicht** durch ein Zurücknehmen des
      Schnitts.
      **Ergebnis, je Person:** ⬜ ______
- [ ] **B7 — `aufgaben`.** Für jede Person aus ⬜ K-L2: den Modul-Einstieg aufrufen. **Erwartet:**
      Koordinationsflächen für die, die in der Koordinationsgruppe stehen (K-L5); normale
      Personenansicht für die anderen. ⚠️ **Der teuerste Fall dieses Plans:** hier hängt nicht eine
      Seite, sondern Verteilen, Personenverwaltung, Freigaben und der Einstieg auf `/` an **einem**
      Wert (`.env.example:348-365`).
      **Ergebnis, je Person:** ⬜ ______
- [ ] **B8 — Die vier unberührten Module gegenprüfen.** Je ein Verwaltungsaufruf in `feedback`,
      `files`, `lagerbuch` und (sobald vorhanden) `radio` mit einem Konto, das dort berechtigt ist.
      **Erwartet: unverändert erreichbar.** Ein Ausfall hier hieße, dass der Schnitt weiter reicht
      als Kapitel 2 misst — dann sofort den Rückweg fahren.
      **Ergebnis:** ⬜ ______
- [ ] **B9 — Alle Ergebnisse in „Ablesungen"**, mit Datum. Danach ist der Plan abgenommen, vorher
      nicht.

---

## Was dieser Plan NICHT tut

* **`suiteAdminGroup` entfernen.** Zwei unabhängige Konsumenten (`config.ts:205`,
  `devGroups.ts:40`), beide bleiben richtig.
* **`session.user.isAdmin` anfassen.** Es hat im Produktivcode keinen Leser (1.2) — das ist ein
  eigener Aufräumposten, kein Teil dieses Plans, und ohne Ablesung nicht entscheidbar.
* **`src/app/m/radio/**` anfassen.** In keinem Weg, in keinem Schritt.
* **`adminGroups: []` bei `portal` in der Registry füllen.** Der Weg über
  `SUITE_ADMIN_GROUP_PORTAL` (K3) ist der, den die Suite für jedes andere Modul geht
  (`.env.example:67-72`), und er ist ohne Rebuild änderbar (`src/core/groups.ts:22-23`).
  ⬜ Ob `portal` zusätzlich eine Registry-Vorgabe bekommen soll, ist eine eigene Frage — sie
  entscheidet, ob ein Deploy **ohne** die Variable stumm sperrt oder still auf eine Vorgabe fällt.
  **Nicht hier entscheiden.**
* **Die leer gesetzte `SUITE_ADMIN_GROUP_<KEY>` zum Konfigurationsfehler machen.** Sie bleibt eine
  gültige Aussage (`src/core/groups.ts:136-140`). Nach dem Schnitt wird sie allerdings gefährlicher
  — sie ist dann eine **vollständige** Sperre statt eines Rückfalls auf den Suite-Admin. ⬜ Eigener
  Posten; im ClickUp-Board notieren, nicht hier bauen.
* **Das suiteweite Gating von `/m/*`.** Eigene Spec (`…radio-modul-design.md:7792`).
* **Eine Release Note schreiben** (Global Constraints).

---

## Die Risikotafel

| # | Was schiefgeht | Woran man es merkt | Wie man zurückkommt |
|---|---|---|---|
| R1 | ⛔ **`portal` ohne `SUITE_ADMIN_GROUP_PORTAL` ausgerollt** | `/m/portal/admin` antwortet 404 für **jeden**; kein Fehler, kein Log, kein roter Test. Der Navigationseintrag ist einfach weg | `.env` ergänzen + Redeploy. ⚠️ **Bis zu eine Stunde Verzug** oder eine Neuanmeldung, bis die Gruppe im JWT steht |
| R2 | ⛔ **Eine Person aus K-L2 fehlt in `SUITE_ADMIN_GROUP_AUFGABEN`** | Sie sieht `aufgaben`, kann aber nichts verteilen, niemanden anlegen, nichts freigeben. **Das Modul ist begehbar und tut nichts** (`docs/runbooks/aufgaben-inbetriebnahme.md:14`) | In Pocket ID nachtragen. ⛔ **Nicht** den Schnitt zurücknehmen — das ist der beabsichtigte Verlust |
| R3 | **Eine Person fehlt in der qr-Admin-Gruppe** | Kein Navigationseintrag „Verwaltung" im qr-Modul, `/admin` = 404 | Pocket ID nachtragen |
| R4 | ⚠️ **Der `aufgaben`-Notausgang wird gebraucht, nachdem er entfernt wurde** | Niemand kommt in die Koordination; das Runbook nennt einen Rückweg, den es nicht mehr gibt | ⛔ **Deshalb K6 Schritt 6.** Ohne ihn ist die einzige Abhilfe ein direkter Datenbankeingriff |
| R5 | **Tippfehler in `SUITE_ADMIN_GROUP_PORTAL`** | **Lauter Startabbruch** (`groups.ts:152-154` → `bootstrap.ts:90-100`). Der Container startet nicht | Das gutartigste Risiko der Tafel: es meldet sich selbst. `.env` korrigieren |
| R6 | ⚠️ **`SUITE_ADMIN_GROUP_PORTAL` LEER gesetzt** | **Nichts.** Die Leer-Prüfung greift nur für ACCESS (`groups.ts:156`). `portal` ist gesperrt, still | ⛔ Genau die Falle 23, die `.env.example:83-91` für `radio` ausschreibt. Wert eintragen, **nicht** die Zeile löschen |
| R6b | ⛔ **K5 gefahren, ohne `...PORTAL_ENV` in `playwright.config.ts`** | K7 Schritt 5 rot in `portal.spec.ts`, `launcher.spec.ts`, `mobil-admin.spec.ts` — und zwar **egal welcher Gruppenname** im `devLogin` steht, weil `adminGroupsFor(portal)` in E2E `[]` liefert | K4 Schritt 3 nachholen. ⚠️ **Die gefährlichere Variante ist die umgekehrte:** Gruppenname im Spec ≠ Wert in `PORTAL_ENV` — dann ist der Lauf **grün und bezeugt den 404**, wörtlich der Fall aus `playwright.config.ts:286-288` |
| R7 | **Ein Kommentar aus 2.5 bleibt stehen** | Kein Tor merkt es. Der nächste Leser setzt `:125` aus derselben Überlegung wieder ein, aus der sie einmal entstand | K6, und der Datumsverweis auf diesen Plan in `groups.ts:12-20` |
| R8 | **Ein neuer Kommentar in `files`/`lagerbuch`/`radio` nennt `isModuleAdmin` wörtlich** | ⚠️ **Roter Quelltext-Scan** (`files/_lib/access.test.ts:39-41`, `lagerbuch/_lib/bauform.test.ts:233-245`, `radio/riegel.test.ts:946`) — die einzige Stelle, wo ein Tor eine Kommentaränderung sieht | Namen aus dem Kommentar nehmen, umschreiben |
| R9 | ⚠️ **Weg B gefahren, obwohl K-L2 unbesetzt ist** | Nichts geht schief — aber es wurden acht Tests, vier Specs und dreizehn Kommentare für null Wirkung geändert | Kein Rückweg nötig; **das ist der Grund für K1 Schritt 2** |

---

## Der Rückweg

**Weg A:** ein `rtk git revert` des einen Commits. Es ist kein Produktivcode betroffen.

**Weg B — ⚠️ zweistufig, und die Reihenfolge ist die umgekehrte des Aufbaus:**

- [ ] **1 — Zuerst der Code.** `rtk git revert` der Commits aus K4+K5 und K6, dann Redeploy. Damit
      wirkt `:125` wieder, und **jeder aus K-L2 kommt sofort wieder überall hinein** — der
      Kurzschluss braucht keine neue Gruppe und keinen Refresh, er liest dieselbe Gruppe, die im
      JWT ohnehin schon steht.
- [ ] **2 — Dann erst die `.env`.** `SUITE_ADMIN_GROUP_PORTAL` **kann** stehen bleiben: sie ist auch
      mit `:125` gültig und additiv (`src/core/groups.ts:126`). ⚠️ **Wer sie entfernt, muss es nach
      Schritt 1 tun** — vorher entfernt sie den einzigen Weg in die Portal-Verwaltung, den es zu dem
      Zeitpunkt gibt.
- [ ] **3 — Die Pocket-ID-Gruppe aus K-L7** kann stehen bleiben; sie schadet nicht.
- [ ] **4 — Der Leitplan-Nachtrag aus K2 bleibt.** Er ist auf beiden Wegen richtig: er sagt, was die
      Spec verlangt, und das ändert sich durch ein Revert nicht.

⛔ **Was der Rückweg NICHT heilt:** eine Person, die im Fenster zwischen Deploy und Revert eine
Verwaltungshandlung nicht ausführen konnte. Nichts geht dabei kaputt — aber niemand erfährt davon,
weil ein 404 nirgends protokolliert wird. **Das ist der Grund, warum K1 vor dem Rollout steht und
nicht danach.**

---

## Ablesungen

⬜ **Leer, bis jemand misst.** ⛔ Nichts hier darf geschätzt, gerundet oder aus `.env.example`
abgeschrieben werden — die Vorlage ist nicht der Server.

| Leerstelle | Wert | Wer | Wann |
|---|---|---|---|
| ⬜ K-L1 — `ADMIN_GROUP` in der Prod-`.env` | | | |
| ⬜ K-L2 — Mitglieder dieser Gruppe (**namentlich**) | | | |
| ⬜ K-L3 — `SUITE_ADMIN_GROUP_PORTAL` heute gesetzt? | | | |
| ⬜ K-L4 — davon in der qr-Admin-Gruppe | | | |
| ⬜ K-L5 — davon in der aufgaben-Koordinationsgruppe | | | |
| ⬜ K-L6 — **Wegwahl A/B** | | | |
| ⬜ K-L7 — Name + Mitglieder der Portal-Admin-Gruppe (nur B) | | | |

| Nachweis | Ergebnis | Wann |
|---|---|---|
| K2/1 — `radio`-Riegel grün | | |
| K2/2 — Mutation auf `isModuleAdmin` rot | | |
| K3/4 — `SUITE_ADMIN_GROUP_PORTAL` in der Prod-`.env` | | |
| K4/2 — acht rote Fälle gegen den unveränderten Code | | |
| K5/5 — voller Vitest-Lauf (Dateien/Tests) | | |
| K7/5 — Playwright | | |
| K8/B2 — Boot ohne Konfigurationsfehler | | |
| K8/B3 — Portal positiv | | |
| K8/B4 — Portal schreibend | | |
| K8/B5 — Portal negativ (404 für Suite-Admin allein) | | |
| K8/B6 — `qr`, je Person | | |
| K8/B7 — `aufgaben`, je Person | | |
| K8/B8 — die vier unberührten Module | | |
