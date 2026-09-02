# Modul „Taktische Zeichen" — Implementierungsplan

> **Für agentische Umsetzer:** ERFORDERLICHE SUB-SKILL: `superpowers:subagent-driven-development`
> (empfohlen) oder `superpowers:executing-plans`, um diesen Plan Aufgabe für Aufgabe umzusetzen.
> Die Schritte tragen Checkbox-Syntax (`- [ ]`) zur Verfolgung.

**Ziel:** Ein Modul der iuk-suite, in dem Helfer taktische Zeichen nachschlagen, eigene Zeichen
zusammenbauen und exportieren, und die Zeichen üben können — mit offline verfügbarem Katalog.

**Architektur:** Kein `@einsatzzeichen/*`-Import im Server-Graph (das bricht `pnpm build`,
gemessen). Ein eingechecktes Generat aus 246 Zeichen mit fertigen SVGs trägt Katalog, Suche,
Lernstoff und Offline. Der Katalog-*Code* erscheint an genau einer Stelle im Repo: der
Baukasten-Insel, geladen mit `dynamic(..., { ssr: false })`. `next.config.ts` bleibt unangetastet.

**Tech-Stack:** Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 ·
Auth.js v5 (Pocket ID) · Vitest + Playwright · `@einsatzzeichen/catalog` und
`@einsatzzeichen/core` 1.1.0.

**Spec:** `docs/superpowers/specs/2026-09-02-modul-taktische-zeichen-design.md` — der Plan
argumentiert aus der Spec; Umsetzer lesen beide.

**Der Plan liegt in vier Dateien.** Sie werden in dieser Reihenfolge abgearbeitet:

| Teil | Datei | Aufgaben |
|---|---|---|
| 1 | `2026-09-02-modul-taktische-zeichen.md` (diese) | Globale Randbedingungen · Dateistruktur · 1 Registrierung · 2 Generat (Schritte 1–9) |
| 2 | `…-teil2.md` | 2 Generat (Schritte 10–20) · 3 Datenhaltung · 4 Demodaten |
| 3 | `…-teil3.md` | 5 Hülle · 6 Katalog · 7 Baukasten — **mit Korrekturblatt am Anfang** |
| 4 | `…-teil4.md` | 8 Lernen · 9 Offline · 10 e2e und Handläufe — **mit Korrekturblatt am Anfang** |

⚠️ **Die Korrekturblätter in Teil 3 und 4 sind verbindlich.** Sie tragen Befunde eines
Abgleichs, die im Fließtext der Aufgaben noch nicht eingearbeitet sind. Wer eine dort
genannte Stelle umsetzt, folgt dem Korrekturblatt, nicht dem Schritt.

---

## Globale Randbedingungen

Jede Aufgabe erbt diesen Abschnitt.

- **Modulschlüssel ist `zeichen`**, ohne Bindestrich. Er bestimmt Verzeichnis
  (`src/app/m/zeichen/`), Datenbank (`.data/zeichen.db`), Dev-Host (`zeichen.localtest.me`) und
  die Env-Namen (`SUITE_HOST_ZEICHEN`, `SUITE_ADMIN_GROUP_ZEICHEN`).
- **Paketversionen:** `@einsatzzeichen/catalog@^1.1.0` und `@einsatzzeichen/core@^1.1.0`.
  **Nicht** `@einsatzzeichen/react`, **nicht** `@einsatzzeichen/web-component`.
- **Bestandszahlen, in Tests festgeschrieben:** 246 Zeichen im Katalog (232 Hauptrezepte +
  14 Grundzeichen) · 232 fragbare Zeichen im Quiz · genau 3 mehrdeutige Titel über 6 IDs ·
  Datenversion `0.2.0` (`COVERAGE_MANIFEST.coreVersion`).
- **Bediendichte:** `shell: "full"` → `ARBEITSDICHTE` 44/48, von `FullShell` gelegt. **An keinem
  antd-Bedienelement wird `size` gesetzt.** Eigenes Markup trägt `minHeight: 44` als Literal.
- **Zeitpunkte sind Unix-SEKUNDEN** (`integer(..., { mode: "timestamp" })`), niemals
  `timestamp_ms`. **Kalendertage sind TEXT** im Format `YYYY-MM-DD`.
- **Deutsch überall** — Bezeichner, Kommentare, Testnamen, Oberflächentexte.
- **Verbotene Muster, jeweils mit der Falle aus `CLAUDE.md`:**
  - Kein Compound-Zugriff auf antd in einer Server Component (Falle 1) — kein
    `Typography.Title`, `Descriptions.Item`, `Form.Item`, `Input.TextArea`.
  - Kein Import aus `@ant-design/icons` irgendwo im Modul (Falle 7). Das Modul ist ein
    SVG-Modul; Zeichen kommen aus dem Generat, Nav-Ikonen aus `core/shell/navIkonen.tsx`.
  - Kein Wert-Export aus einem `"use client"`-Modul, der in einer Server Component gelesen wird
    (Falle 6). Alle Werte liegen in `_lib/` ohne `"use client"`.
  - Kein antd `Table` und kein `Listy` (Falle 9) — beide verlangen eine Funktion als Prop.
  - Kein `Alert type="error"`, kein rotes `Tag`, kein roter `Progress` (Falle 3:
    `colorError === colorPrimary === #c8000f`).
  - Kein `locator.dragTo()` in e2e (Falle 11). Jeder navigierende Klick über `klickeWennRuhig`
    (Falle 12). Warmlauf-GET vor dem ersten POST und `page.waitForResponse` (Falle 10).
- **Kein zweites DOM-Testharness.** `src/app/m/qr/_lib/test-dom.tsx` ist gesetzt:
  `mount` · `unmount` · `rerender` · `query` · `queryAll` · `exists` · `fill` · `click` ·
  `clickElement` · `submitForm` · `queryPortal` · `existsPortal` · `clickPortal`.
- **Release Notes:** Wer eine bemerkbare Änderung ausliefert, schreibt im **selben Commit** eine
  Notiz unter `src/app/m/portal/_lib/neuigkeiten/notizen/zeichen/<YYYY-MM-DD>-<slug>.ts` plus
  eine Zeile in `register.ts`. Höchstens **ein** `hinweis` je Notiz. Du-Form, Präsens, aktiv,
  kein Markdown, keine Werbewörter, drei bis fünf Absätze.
- **Gates:** `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
  `pnpm exec playwright test`.

### Abweichung von der Spec, die dieser Plan vornimmt

**Spec §7.1 schreibt einen Boot-Riegel vor, der bei `NODE_ENV === "production"` und fehlendem
`SUITE_HOST_ZEICHEN` laut wird. Dieser Plan baut ihn anders** — an einen eigenen Schalter
`ZEICHEN_SW` gebunden, nach dem Muster von `uav`s `UAV_SW_MODUS`.

Grund: `src/app/m/uav/_lib/boot.ts` begründet ausgeschrieben, warum seine Prüfung *nur bei
gesetztem Modul-Host* greift — „eine unbedingte Pflicht hieße, die Suite startet ab dem ersten
Image mit `uav` nicht mehr, bis `UAV_SW_MODUS` gesetzt ist, und bräche damit jeden unbeteiligten
Deploy im Fenster zwischen Merge und Cutover ab." Die Fassung aus §7.1 hätte genau diesen Fehler:
sie bräche jeden Produktiv-Deploy zwischen Merge und Cutover ab, auch auf Instanzen, die das
Modul nie einschalten wollen. Das Schutzziel — kein *stiller* PWA-Ausfall — bleibt erhalten:
`ZEICHEN_SW=1` ist die bewusste Einschaltung der PWA, und *dann* ist der fehlende Host ein
lauter Startfehler. Ohne den Schalter registriert `RegisterSW` nichts, und es gibt nichts, was
still ausfallen könnte.

---

## Dateistruktur

| Datei | Verantwortung |
|---|---|
| `scripts/zeichen-generat.ts` | Einziger Ort außerhalb der Baukasten-Insel, der `@einsatzzeichen/*` importiert. Erzeugt das Generat. |
| `src/app/m/zeichen/_lib/katalog.generiert.json` | Das eingecheckte Generat (382 KB). Datenquelle für alles außer dem Baukasten. |
| `_lib/katalog.ts` | Die Naht: Typ `Zeichen`, `alleZeichen`, `findeZeichen`, `sucheZeichen`, Filterlisten. Kein `"use client"`. |
| `_lib/falte.ts` | Die eine Umlautfaltung des Moduls. Generator und Insel benutzen sie. |
| `_lib/kanon.ts` | Kanonischer Spec-Schlüssel. Trägt „schon gespeichert?" und die Bewertung der Bauübung. |
| `_lib/bezeichnungen.ts` | Deutsche Namen für die zehn `bodyVariant`-Werte (das Paket liefert keine). |
| `_lib/nav.ts` | `ZEICHEN_NAV`. Kein `"use client"`. |
| `_lib/lernfarben.ts` | Fachsemantische Palette hell/dunkel. Kein Suite-Rot. |
| `_lib/regeltexte.ts` | ~15 Erklärtexte zu Regel-IDs plus Rückfall. |
| `_lib/lernen/zufall.ts` | Deterministischer Generator (xorshift32). |
| `_lib/lernen/fragen.ts` | Fragebau und Distraktorenwahl. |
| `_lib/lernen/leitner.ts` | Wiederholungsintervalle. |
| `_lib/boot.ts` | `zeichenSwAn()` und `zeichenBootFehler()`. Wirft nie. |
| `_lib/sw-quelle.ts` | Quelltext des Service Workers als String, damit er testbar ist. |
| `_lib/seedLokal.ts` | Lokale Demodaten. |
| `_db/schema.ts` · `_db/client.ts` · `_db/drizzle.config.ts` · `_db/testdb.ts` | Datenhaltung. |
| `_ui/KatalogInsel.tsx` | Suche, Filter, Raster, Detailbereich. Client, trägt das Generat. |
| `_ui/baukasten/*` | Lader (`ssr:false`), Insel, `paket.ts` (einziger Katalog-Code-Import), `zustand.ts`. |
| `_ui/QuizInsel.tsx` | Eine Frage, vier Optionen, Auflösung. Client, **kein** Katalog-Code. |
| `actions.ts` | Server Actions: merken, entfernen, speichern, beantworten, Lernsets pflegen. |
| `(shell)/…` · `(rahmenlos)/…` | Die Routen aus Spec §2. |

---

## Aufgabe 1: Modul registrieren — das Dreieck, das Icon, der Registry-Eintrag

**Dateien:**
- Ändern: `src/core/registry.ts` (Ende der `MODULES`-Liste)
- Ändern: `src/core/shell/icons.ts` (Importblock Zeile 1-14 **und** Map Zeile 138-151)
- Ändern: `src/core/bootstrap.ts` (`MODULE_MIGRATIONS`)
- Ändern: `Dockerfile` (nach Zeile 58, vor der `konto`-Zeile 60)
- Ändern: `.env.example`
- Neu: `src/app/m/zeichen/registry.test.ts`
- Neu: `src/app/m/zeichen/_db/migrations/.gitkeep`

**Schnittstellen:**
- Nutzt: nichts (erste Aufgabe).
- Liefert: den Registry-Eintrag `getModule("zeichen")` mit `requiresAuth: true`,
  `requiredGroups: []`, `adminGroups: ["iuk-zeichen-admin"]`, `switcherGroupSources: []`,
  `icon: "DeploymentUnitOutlined"`, `shell: "full"`. Der Migrationsordner
  `src/app/m/zeichen/_db/migrations` ist ab hier in `MODULE_MIGRATIONS` bekannt.

> **Zwei Tests dürfen nach diesem Commit rot bleiben** und werden im Commit-Text benannt:
> `src/core/bootstrap.test.ts` (der Migrationsordner hat noch kein `meta/_journal.json` —
> ein `.gitkeep` genügt ihm nicht) und `scripts/seed-lokal.test.ts` (der `SEED_MODULE`-Eintrag
> kommt erst in Aufgabe 4). Beide werden von Aufgabe 3 bzw. 4 grün gemacht. Wer sie hier
> „schnell mit repariert", baut eine leere Migration oder einen leeren Seed — beides ist
> schlechter als ein benannter roter Test.

- [ ] **Schritt 1: Den fehlschlagenden Registry-Test schreiben**

`src/app/m/zeichen/registry.test.ts` — Vorbild ist `src/app/m/uav/registry.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { getModule, moduleForHost, canAccess } from "@/core/registry";
import { isModuleAdmin } from "@/core/groups";
import { ICONS } from "@/core/shell/icons";

describe("Registry-Eintrag zeichen", () => {
  /*
   * `requiresAuth: true` UND `requiredGroups: []` — das ist kein Widerspruch, sondern
   * „jeder Eingeloggte darf": `canAccess` steigt bei leerer Gruppenliste mit `true` aus.
   * Anders als bei qr/feedback/files/lagerbuch/radio gibt es hier KEINEN anonymen
   * Teilpfad, deshalb traegt das generische Middleware-Gate den ganzen Zugang und es
   * braucht keine modulinterne Zweitdurchsetzung.
   */
  it("liegt vollstaendig hinter dem Login, ohne eigene Zugangsgruppe", () => {
    const m = getModule("zeichen");
    expect(m.shell).toBe("full");
    expect(m.requiresAuth).toBe(true);
    expect(m.requiredGroups).toEqual([]);
    expect(m.adminGroups).toEqual(["iuk-zeichen-admin"]);
    expect(m.showInSwitcher).toBe(true);
  });

  /*
   * ⛔ `switcherGroupSources` MUSS leer bleiben. Bei `["access"]` und leerem
   * `requiredGroups` ist `hasAnyGroup(g, [])` === `[].some(...)` === `false` — die
   * Kachel im App-Umschalter waere fuer JEDEN unsichtbar, auch fuer den Betreiber.
   */
  it("zeigt die Kachel jedem Eingeloggten", () => {
    expect(getModule("zeichen").switcherGroupSources).toEqual([]);
    expect(canAccess(getModule("zeichen"), { groups: [], isAdmin: false } as never)).toBe(true);
  });

  it("wird ueber SUITE_HOST_ZEICHEN gefunden", () => {
    const m = moduleForHost("zeichen.iuk-ue.de", { SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" });
    expect(m?.key).toBe("zeichen");
  });

  it("Admin nur mit Gruppe — und SUITE_ADMIN_GROUP_ZEICHEN gewinnt", () => {
    const m = getModule("zeichen");
    expect(isModuleAdmin(m, ["iuk-zeichen-admin"], {})).toBe(true);
    expect(isModuleAdmin(m, ["irgendwas"], {})).toBe(false);
    expect(isModuleAdmin(m, ["andere"], { SUITE_ADMIN_GROUP_ZEICHEN: "andere" })).toBe(true);
  });

  /*
   * Ein Icon-Name, der in ICONS FEHLT, faellt STILL auf AppstoreOutlined zurueck —
   * „Taktische Zeichen" waere dann im Umschalter-Panel UND im Portal-Raster vom
   * „Portal" nicht zu unterscheiden.
   */
  it("hat ein Icon, das die ICONS-Map wirklich kennt", () => {
    expect(getModule("zeichen").icon).toBe("DeploymentUnitOutlined");
    expect("DeploymentUnitOutlined" in ICONS).toBe(true);
  });
});
```

- [ ] **Schritt 2: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/registry.test.ts`
Erwartet: FAIL — `getModule("zeichen")` wirft bzw. liefert `undefined`, weil der Eintrag fehlt.

- [ ] **Schritt 3: Den Registry-Eintrag anlegen**

In `src/core/registry.ts`, ans Ende der `MODULES`-Liste:

```ts
  // zeichen: alles hinter dem Login, aber ohne Zugangsgruppe — `requiredGroups: []` heisst
  // „jeder Eingeloggte" (canAccess steigt bei leerer Liste mit true aus). Anders als bei
  // qr, feedback, files, lagerbuch und radio hat dieses Modul KEINEN anonymen Teilpfad:
  // jede Ansicht setzt eine bekannte Person voraus (Lernstand, Merkliste, eigene Zeichen).
  // Ein uebernommenes `requiresAuth: false` schaltete den generischen Middleware-Riegel ab,
  // ohne dass dadurch irgendetwas moeglich wuerde.
  //
  // ⛔ switcherGroupSources MUSS [] bleiben: bei ["access"] und leerem requiredGroups ist
  // hasAnyGroup(g, []) === [].some(...) === false — die Kachel waere fuer JEDEN unsichtbar.
  //
  // adminGroups gaten allein die kuratierten Lernsets; der Suite-Admin kommt ueber
  // isModuleAdmin mit durch — hier gewollt, weil hinter dem Riegel kein Geheimnis liegt,
  // nur kuratierte Listen (dieselbe Linie wie aufgaben, anders als files/lagerbuch).
  // Der Gruppenname ist eine VORGABE: SUITE_ADMIN_GROUP_ZEICHEN ueberschreibt sie.
  //
  // prodHosts bleibt leer, der Host steht ausschliesslich in SUITE_HOST_ZEICHEN —
  // dieselbe Betreiberauflage wie bei lagerbuch und radio. ANDERS ALS DORT ist er hier
  // Voraussetzung fuer die PWA: ohne ihn greift der Rewrite in decideRoute nicht und
  // /sw.js landet im Portal-Modul (Spec §7.1, Riegel in _lib/boot.ts).
  //
  // icon: wirksam ist allein die Map ICONS in `core/shell/icons.ts`. Ein dort FEHLENDER
  // Name faellt STILL auf AppstoreOutlined zurueck.
  { key: "zeichen", title: "Taktische Zeichen", icon: "DeploymentUnitOutlined", shell: "full",
    requiresAuth: true, requiredGroups: [], adminGroups: ["iuk-zeichen-admin"],
    prodHosts: [], showInSwitcher: true, switcherGroupSources: [] },
```

- [ ] **Schritt 4: `DeploymentUnitOutlined` in beide Hälften von `icons.ts` eintragen**

In `src/core/shell/icons.ts` — **zwei** Stellen, sonst greift es nicht. Im Importblock
(alphabetisch nach `ContainerOutlined`, vor `DesktopOutlined`):

```ts
  DeploymentUnitOutlined,
```

und in der `ICONS`-Map (Zeile 138-151), in derselben Reihenfolge wie die anderen Einträge:

```ts
  DeploymentUnitOutlined,
```

- [ ] **Schritt 5: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/registry.test.ts src/core/shell/AppUmschalter.test.tsx`
Erwartet: PASS für beide. `AppUmschalter.test.tsx` prüft die Map gegen die echte
`MODULES`-Liste — ein verwaister oder fehlender Name wäre hier rot.

- [ ] **Schritt 6: Das Dreieck vervollständigen — `MODULE_MIGRATIONS`, `Dockerfile`, `.gitkeep`**

In `src/core/bootstrap.ts`, in `MODULE_MIGRATIONS` nach dem `uav`-Eintrag:

```ts
  // zeichen: bewusst OHNE Schema-Import und OHNE Seed in `seedAllModules()`. Der
  // Schema-Import waere toter Code (`migrateAllModules()` migriert schema-frei), und ein
  // Boot-Seed ist hier zwar ungefaehrlich — die Tabellen tragen weder Zugangs- noch
  // Schreibrechte —, aber wertlos: die Demodaten schluesseln auf `dev:<email>`, und
  // `shouldSeed()` ist bei SUITE_SEED=1 auch in der GENERALPROBE wahr. Dort erschienen
  // dann Lernstaende und Merklisten einer Person, die es auf der Instanz nicht gibt.
  { key: "zeichen", migrationsFolder: "src/app/m/zeichen/_db/migrations" },
```

Im `Dockerfile`, nach Zeile 58 (der `uav`-Zeile) und **vor** der `konto`-Zeile:

```dockerfile
COPY --from=builder --chown=nextjs:nodejs /app/src/app/m/zeichen/_db/migrations ./src/app/m/zeichen/_db/migrations
```

Und der Platzhalter, damit das Verzeichnis versioniert ist:

```bash
mkdir -p src/app/m/zeichen/_db/migrations
touch src/app/m/zeichen/_db/migrations/.gitkeep
```

- [ ] **Schritt 7: `.env.example` ergänzen**

Bei den anderen `SUITE_HOST_*`-Einträgen:

```dotenv
# Modul „Taktische Zeichen" (zeichen)
#
# SUITE_HOST_ZEICHEN ist Voraussetzung fuer die Offline-PWA: ohne ihn greift der Rewrite
# in decideRoute nicht, /sw.js landet im Portal-Modul und die Registrierung scheitert mit
# einer einzigen Konsolenzeile. Wer ZEICHEN_SW=1 setzt, MUSS ihn setzen — sonst bricht
# der Boot mit einer Meldung ab (src/app/m/zeichen/_lib/boot.ts).
# SUITE_HOST_ZEICHEN=zeichen.iuk-ue.de
#
# Schaltet die Offline-PWA ein. Ohne ihn registriert RegisterSW nichts.
# ZEICHEN_SW=1
#
# Wer die kuratierten Lernsets pflegen darf. Der Suite-Admin darf ohnehin.
# SUITE_ADMIN_GROUP_ZEICHEN=iuk-zeichen-admin
```

> ⛔ **Auf keinen Fall eine leere `SUITE_ACCESS_GROUP_ZEICHEN=`-Zeile schreiben.**
> `validateGroupConfig` meldet einen leeren Wert als Konfigurationsfehler, und
> `assertHostConfig` macht daraus einen **Startabbruch der ganzen Suite**.

- [ ] **Schritt 8: Die Gates laufen lassen**

Kommando: `pnpm typecheck && pnpm vitest run src/core src/app/m/zeichen`
Erwartet: `typecheck` grün. In Vitest sind genau zwei Fehlschläge zulässig und erwartet:
`bootstrap.test.ts` (kein `meta/_journal.json` im neuen Migrationsordner) und
`seed-lokal.test.ts` (kein `SEED_MODULE`-Eintrag). Jeder andere rote Test ist ein echter
Fehler dieser Aufgabe.

- [ ] **Schritt 9: Commit**

```bash
git add src/core/registry.ts src/core/shell/icons.ts src/core/bootstrap.ts \
        Dockerfile .env.example \
        src/app/m/zeichen/registry.test.ts src/app/m/zeichen/_db/migrations/.gitkeep
git commit -m "feat(zeichen): Modul registrieren (DRK-247)

Registry-Eintrag, DeploymentUnitOutlined in beide Haelften der ICONS-Map,
MODULE_MIGRATIONS-Eintrag, COPY-Zeile im Dockerfile und die Env-Vorlagen.

requiresAuth: true bei leerem requiredGroups — das Modul hat keinen anonymen
Teilpfad, anders als qr/feedback/files/lagerbuch/radio. switcherGroupSources
bleibt leer, weil hasAnyGroup(g, []) false ergibt und die Kachel sonst fuer
jeden unsichtbar waere.

Zwei Tests bleiben absichtlich rot und werden in den naechsten zwei Commits
gruen: bootstrap.test.ts verlangt ein meta/_journal.json im Migrationsordner
(Aufgabe 3), seed-lokal.test.ts einen SEED_MODULE-Eintrag (Aufgabe 4)."
```

---

## Aufgabe 2: Das Generat — Generator, Naht, Faltung, kanonischer Schlüssel

**Dateien:**
- Ändern: `package.json` (zwei Abhängigkeiten)
- Neu: `scripts/zeichen-generat.ts`
- Neu: `src/app/m/zeichen/_lib/katalog.generiert.json` (erzeugt, eingecheckt)
- Neu: `src/app/m/zeichen/_lib/katalog.ts`
- Neu: `src/app/m/zeichen/_lib/falte.ts`
- Neu: `src/app/m/zeichen/_lib/kanon.ts`
- Neu: `src/app/m/zeichen/_lib/bezeichnungen.ts`
- Neu: `src/app/m/zeichen/_fonts/Arimo[wght].ttf` + `Arimo-OFL.txt`
- Test: `_lib/falte.test.ts` · `_lib/kanon.test.ts` · `_lib/katalog.test.ts` · `_lib/naht.test.ts`

**Schnittstellen:**
- Nutzt: nichts aus Aufgabe 1 im Code; der Registry-Eintrag existiert bereits.
- Liefert (die tragenden Namen für alle folgenden Aufgaben):
  - `type ZeichenId = string` · `interface Zeichen` (Felder siehe Schritt 5)
  - `KATALOG_STAND: { paket: string; daten: string; anzahl: number; erzeugtAm: string }`
  - `alleZeichen(): readonly Zeichen[]`
  - `findeZeichen(id: string): Zeichen | null` — **wirft nie**
  - `sucheZeichen(f: Filter): { treffer: readonly Zeichen[]; gesamt: number }` mit
    `interface Filter { text?: string; kapitel?: string; organisation?: string; grundform?: string; nur?: readonly ZeichenId[] }`
  - `kapitelListe(): readonly { name: string; anzahl: number }[]`
  - `organisationen(): readonly string[]` · `grundformen(): readonly string[]`
  - `falte(s: string): string`
  - `kanonischerSchluessel(spec: SymbolSpec): string`
  - `BODY_VARIANT_NAMEN: Record<string, string>`

> **Warum das Generat eingecheckt wird und nicht zur Bauzeit entsteht:** eine frisch
> ausgecheckte Arbeitskopie muss ohne Vorlauf `pnpm typecheck` und `pnpm vitest run`
> bestehen. Ein `prebuild`-Skript wäre eine vierte Ecke am Dreieck aus `CLAUDE.md`, ein
> `fs`-Zugriff zur Laufzeit eine fünfte — dieselbe Begründung, die
> `src/app/m/portal/_lib/neuigkeiten/typen.ts:4-19` für die Release Notes ausschreibt.
> Drift ist ausgeschlossen, weil der Wächtertest das Generat bei **jedem** `vitest run` in
> gemessenen 42 ms neu baut und byteweise vergleicht. Preis, bewusst getragen: ein
> ~382-KB-Diff bei jedem Paketupgrade.

Diese Aufgabe ist die größte des Plans. Sie hat vier Teilschritte mit je eigenem Testzyklus;
committet wird **einmal** am Ende, weil ein halbes Generat nichts ist, was ein Reviewer
sinnvoll annehmen oder ablehnen könnte.

- [ ] **Schritt 1: Abhängigkeiten installieren**

```bash
pnpm add @einsatzzeichen/catalog@^1.1.0 @einsatzzeichen/core@^1.1.0
```

**Nicht** `@einsatzzeichen/react`: es ist für diesen Entwurf wertlos (wir rendern SVG-Strings,
keine React-Bäume) und als Paket **ohne** `"use client"`, das in einer Server Component
klaglos rendert, eine Einladung zum Fehlschluss. **Nicht** `@einsatzzeichen/web-component`:
Shadow DOM, gegen das weder das antd-Theme noch die `--tz-*`-Variablen wirken.

Prüfen, dass die Version stimmt:

```bash
node -e "console.log(require('@einsatzzeichen/catalog/package.json').version)"
```
Erwartet: `1.1.0`

- [ ] **Schritt 2: Den fehlschlagenden Test für die Faltung schreiben**

`src/app/m/zeichen/_lib/falte.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { falte } from "./falte";

describe("falte", () => {
  /*
   * GEMESSEN gegen die 232 Hauptrezepte: mit reiner Kleinschreibung findet
   * "loeschgruppe" 0 von 232 und "sanitaet" 0 von 22. Auf einem Tablet mit
   * Handschuhen ist das ein Ausfall, kein Komfortproblem — deshalb faltet diese
   * Funktion MEHR als lagerbuchs falte() (das ist buchstaeblich s.toLowerCase()).
   */
  it("findet Loeschgruppe ueber loeschgruppe", () => {
    expect(falte("Löschgruppe")).toBe(falte("loeschgruppe"));
  });

  it("findet Sanitaet ueber sanitaet", () => {
    expect(falte("Sanität")).toBe(falte("sanitaet"));
  });

  it("wirft Satzzeichen und Mehrfachleerzeichen weg", () => {
    expect(falte("  MLW IV / Lbw.  ")).toBe("mlw iv lbw");
  });

  it("ist idempotent", () => {
    expect(falte(falte("Führungstrupp (THW)"))).toBe(falte("Führungstrupp (THW)"));
  });
});
```

- [ ] **Schritt 3: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/falte.test.ts`
Erwartet: FAIL — `Failed to resolve import "./falte"`.

- [ ] **Schritt 4: Die Faltung schreiben**

`src/app/m/zeichen/_lib/falte.ts`:

```ts
/**
 * DIE EINE Faltung des Moduls — der Generator UND die Katalog-Insel benutzen sie,
 * nie zwei aequivalente. Sie faltet MEHR als lagerbuchs `falte()` (das ist
 * buchstaeblich `s.toLowerCase()`).
 *
 * GEMESSEN gegen die 232 Hauptrezepte: mit reiner Kleinschreibung findet
 * "loeschgruppe" 0 von 232 und "sanitaet" 0 von 22. Wer auf einem Tablet mit
 * Handschuhen tippt, schreibt keine Umlaute.
 *
 * Reihenfolge ist wichtig: erst die deutschen Ersetzungen (ä -> ae), DANN die
 * NFD-Zerlegung. Umgekehrt zerlegte NFD das ä zu a + Diakritikum, und aus
 * "Löschgruppe" wuerde "loschgruppe" statt "loeschgruppe".
 */
export const falte = (s: string): string =>
  s
    .toLowerCase()
    .replaceAll("ä", "ae")
    .replaceAll("ö", "oe")
    .replaceAll("ü", "ue")
    .replaceAll("ß", "ss")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
```

- [ ] **Schritt 5: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/falte.test.ts`
Erwartet: PASS, vier Tests.

- [ ] **Schritt 6: Den fehlschlagenden Test für den kanonischen Schlüssel schreiben**

`src/app/m/zeichen/_lib/kanon.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { RECIPES } from "@einsatzzeichen/catalog";
import { kanonischerSchluessel, ORDNUNG } from "./kanon";

const HAUPT = Object.entries(RECIPES).filter(([k]) => !k.includes("#"));

describe("kanonischerSchluessel", () => {
  /*
   * GEMESSEN: 232 Rezepte ergeben 232 verschiedene Schluessel, 0 Kollisionen;
   * Median-Laenge 123, Maximum 510 Zeichen. Der Schluessel traegt zwei Lasten:
   * die Frage „diese Zusammenstellung habe ich schon gespeichert?" und die
   * Bewertung der Bauuebung.
   */
  it("gibt 232 Rezepten 232 verschiedene Schluessel", () => {
    expect(HAUPT.length).toBe(232);
    const schluessel = new Set(HAUPT.map(([, r]) => kanonischerSchluessel(r.spec)));
    expect(schluessel.size).toBe(232);
  });

  it("behandelt ein leeres Array wie ein weggelassenes Feld", () => {
    expect(kanonischerSchluessel({ kind: "formation", bodyMarks: [] } as never))
      .toBe(kanonischerSchluessel({ kind: "formation" } as never));
  });

  it("ist gegen die Reihenfolge in capabilities unempfindlich", () => {
    const a = { kind: "formation", capabilities: ["transport", "fire-fighting"] } as never;
    const b = { kind: "formation", capabilities: ["fire-fighting", "transport"] } as never;
    expect(kanonischerSchluessel(a)).toBe(kanonischerSchluessel(b));
  });

  /*
   * DIE SPEC, DIE matchFingerprint FAELSCHLICH DURCHWINKT. Gemessen besteht
   * {kind:'formation', organization:'thw', strength:'staffel'} gegen den Kennwert
   * von C.1.1 „Loeschstaffel" mit {"ok":true,"problems":[]} — falsche Organisation,
   * Faehigkeit fehlt vollstaendig. matchFingerprint vergleicht vier Huellwerte des
   * Koerper-Primitivs; Farbe, Kopfzone, Piktogramm und Beschriftung gehen nicht ein.
   * Als Bewerter waere es ein Pruefer, der die falsche Organisation durchwinkt.
   */
  it("lehnt ab, was matchFingerprint faelschlich durchwinkt", () => {
    const falsch = { kind: "formation", organization: "thw", strength: "staffel" } as never;
    const richtig = RECIPES["C.1.1"].spec;
    expect(kanonischerSchluessel(falsch)).not.toBe(kanonischerSchluessel(richtig));
  });

  /*
   * DER FELDWAECHTER. ORDNUNG ist eine handgeschriebene Liste — ein in einer
   * kuenftigen Paketversion hinzukommendes SymbolSpec-Feld wuerde still
   * weggelassen, und zwei verschiedene Zeichen bekaemen denselben Schluessel.
   * Dieser Test macht daraus einen roten Lauf statt eines stillen Datenverlusts.
   */
  it("ORDNUNG deckt jedes in den Rezepten vorkommende Spec-Feld ab", () => {
    const vorhanden = new Set<string>();
    for (const [, r] of HAUPT) for (const k of Object.keys(r.spec)) vorhanden.add(k);
    const unbekannt = [...vorhanden].filter((k) => !(ORDNUNG as readonly string[]).includes(k));
    expect(unbekannt).toEqual([]);
  });
});
```

- [ ] **Schritt 7: Test laufen lassen und Fehlschlag bestätigen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/kanon.test.ts`
Erwartet: FAIL — `Failed to resolve import "./kanon"`.

- [ ] **Schritt 8: Den kanonischen Schlüssel schreiben**

`src/app/m/zeichen/_lib/kanon.ts`:

```ts
import type { SymbolSpec } from "@einsatzzeichen/schema";

/**
 * Die Feldreihenfolge des kanonischen Schluessels. HANDGESCHRIEBEN, und deshalb
 * von `kanon.test.ts` gegen die tatsaechlich in den Rezepten vorkommenden Felder
 * gehalten: ein neues SymbolSpec-Feld wuerde sonst still weggelassen, und zwei
 * verschiedene Zeichen bekaemen denselben Schluessel.
 *
 * ⚠️ Das ist ein REINER TYPIMPORT aus @einsatzzeichen/schema. Er verschwindet im
 * Build und zaehlt deshalb in `naht.test.ts` nicht als Katalog-Import.
 */
export const ORDNUNG = [
  "kind", "bodyVariant", "organization", "technicalFill", "strength",
  "technicalHeadMark", "administrativeLevel", "functionRole", "vehicleCategory",
  "capabilities", "bodyMarks", "designation", "labels",
] as const;

/**
 * Ein stabiler Schluessel fuer eine Zusammenstellung. Vier Regeln:
 * undefined/null/"" weglassen · leere Arrays weglassen · Arrays sortieren ·
 * Felder in fester Reihenfolge serialisieren, `labels`-Zonen alphabetisch.
 *
 * GEMESSEN kollisionsfrei ueber alle 232 Hauptrezepte.
 */
export function kanonischerSchluessel(spec: SymbolSpec): string {
  const teile: string[] = [];
  for (const feld of ORDNUNG) {
    const wert = (spec as Record<string, unknown>)[feld];
    if (wert === undefined || wert === null || wert === "") continue;
    if (Array.isArray(wert)) {
      if (wert.length === 0) continue;
      teile.push(`${feld}=${[...wert].map(String).sort().join(",")}`);
      continue;
    }
    if (typeof wert === "object") {
      const zonen = Object.entries(wert as Record<string, unknown>)
        .filter(([, v]) => v !== undefined && v !== null && v !== "")
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${String(v)}`);
      if (zonen.length === 0) continue;
      teile.push(`${feld}={${zonen.join(",")}}`);
      continue;
    }
    teile.push(`${feld}=${String(wert)}`);
  }
  return teile.join("|");
}
```

- [ ] **Schritt 9: Test laufen lassen und grün sehen**

Kommando: `pnpm vitest run src/app/m/zeichen/_lib/kanon.test.ts`
Erwartet: PASS, fünf Tests. Sollte `ORDNUNG deckt jedes … Spec-Feld ab` fehlschlagen, ist
das **kein** Testfehler, sondern ein echter Befund: das installierte Paket führt ein Feld,
das dieser Plan nicht kennt. Dann `ORDNUNG` ergänzen und die Ergänzung im Commit begründen.

Der Rest von Aufgabe 2 — Generator, Naht, Arimo, Nahttest — steht in
**`docs/superpowers/plans/2026-09-02-modul-taktische-zeichen-teil2.md`**, weil dieser Plan
sonst als eine Datei unlesbar würde. Aufgabe 2 gilt erst als abgeschlossen, wenn auch deren
Schritte grün sind und **ein** gemeinsamer Commit steht.
