# Auto-Modus für Hell/Dunkel — Entwurf

Datum: 2026-08-12 · Zweig: `claude/light-dark-automode-33908f`

## Das Ziel in einem Satz

Die Suite bekommt einen dritten Theme-Zustand „Automatisch", der der
Betriebssystem-Präferenz folgt, und dieser Zustand gilt ab sofort für alle —
auch für Bestandsnutzer.

## Warum das nicht einfach `prefers-color-scheme` ist

`docs/design/README.md` und `src/app/layout.tsx` schreiben aus, dass die Suite
den Modus bewusst über `<html data-theme>` aus einem **Cookie** führt und nicht
über `prefers-color-scheme`. Der Grund ist der Umschalter: ohne Cookie bricht
der Fall „System dunkel, Umschalter hell".

Ein Auto-Modus hebt diesen Grund nicht auf, er verschärft ihn. Der Server, der
`layout.tsx` rendert, sieht `prefers-color-scheme` nicht — die Medienabfrage
existiert nur im Browser. „Auto" allein im Cookie zu führen hieße also: der
Server weiß nicht, was er stempeln soll.

Deshalb braucht Auto **zwei** Zustände, nicht einen.

## Zustandsmodell

| Cookie | Werte | Bedeutung |
| --- | --- | --- |
| `iuk-theme-pref` | `auto` \| `light` \| `dark` | die **Wahl** der Person. Fehlt oder unlesbar → `auto` |
| `iuk-theme-system` | `light` \| `dark` | letzter bekannter **OS-Wert**, vom Client geschrieben |

Beide tragen dieselbe Konstruktion wie das heutige `iuk-theme`: `Path=/`,
`Max-Age` ein Jahr, `SameSite=Lax`, und die optionale `Domain` aus
`AUTH_COOKIE_DOMAIN` — die Multi-Host-Begründung in `mode.ts` gilt unverändert
für beide.

### Typen

`ThemeMode = "light" | "dark"` bleibt **unverändert** und bezeichnet weiterhin
die *aufgelöste* Betriebsart. Daneben tritt in `theme.ts`:

```ts
export type ThemePreference = "auto" | "light" | "dark";
```

Beide Typen und die zugehörigen reinen Funktionen liegen in Modulen **ohne**
`"use client"` (`theme.ts`, `mode.ts`) — `layout.tsx` ist eine Server Component
und bekäme aus einem Client-Modul sonst eine Client-Referenz statt des Wertes
(Falle 6 aus `docs/design/README.md`, HTTP 500, von `build` und Vitest nicht
auffindbar).

### Auflösung

```
resolveThemeMode(pref, system) =
  pref === "auto" ? (system ?? "light") : pref
```

Fehlt das System-Cookie — der allererste Besuch, bevor das Init-Script lief —
ist die Antwort `light`. Das ist dieselbe Vorgabe wie heute ohne Cookie.

## Die Migration ist der Namenswechsel

Jeder Bestandsnutzer hat heute ein konkretes `iuk-theme=light` oder `=dark`,
weil `themeInitScript` es beim ersten Besuch automatisch geschrieben hat. Dieser
Wert ist von einem bewusst gesetzten **nicht unterscheidbar**. „Auto ist die
Vorgabe" wäre unter dem alten Namen also eine Aussage über fast niemanden.

Der neue Schlüssel `iuk-theme-pref` löst das ohne Migrationslogik: er fehlt bei
allen, also greift `auto` bei allen. Das Init-Script löscht `iuk-theme` bei der
Gelegenheit mit (`Max-Age=0`, mit derselben `Domain`), damit der tote Schlüssel
nicht ein Jahr lang mitgeschickt wird.

Bewusst in Kauf genommen: wer bewusst umgeschaltet hatte, verliert diese Wahl
einmalig und muss sie neu treffen.

## Die Invariante, die still bricht

> `<html data-theme>` und `style.colorScheme` tragen **immer** den aufgelösten
> Wert `light` oder `dark`. Niemals `"auto"`. Nur das Cookie kennt `auto`.

Jedes Modul-CSS der Suite selektiert auf `[data-theme="dark"]`. Ein gestempeltes
`data-theme="auto"` besteht `typecheck`, `pnpm build` **und** Vitest und kippt
trotzdem jede eigene Fläche still zurück auf helle Darstellung, während antd
korrekt dunkel rendert. Das ist genau die Bauart von Falle 2 und 5 aus
`docs/design/README.md`: die Regel steht richtig da und greift nur nicht.

Dieselbe Trennung am React-Kontext: `useThemeMode().mode` bleibt der
**aufgelöste** Wert. `preference` und `setPreference` treten daneben. Dadurch
bleibt `KioskThemeProvider` (`src/core/theme/KioskThemeProvider.tsx:18`, liest
nur `mode`) unangetastet, und `buildTheme(mode)` bekommt weiterhin nur die
beiden Werte, die es kennt.

## Wer was macht

### Init-Script (`mode.ts`)

Behält seine heutige, in `mode.ts:26-34` ausgeschriebene Aufgabe: es verhindert
kein Flackern, es macht den **nächsten** SSR richtig. Zwei Änderungen:

1. Der Early-Return auf ein vorhandenes Cookie fällt weg. Das System-Cookie
   wird bei jedem Aufruf fortgeschrieben (vergleichen, dann schreiben, damit
   `document.cookie` nicht ohne Anlass angefasst wird). Ohne das friert ein
   OS-Wechsel den Auto-Modus auf dem Stand des ersten Besuchs ein — der Auto-
   Modus hörte still auf zu funktionieren.
2. Es räumt `iuk-theme` ab.

Es stempelt weiterhin **kein** `data-theme`. Siehe „Was bewusst offen bleibt".

### `layout.tsx`

Liest beide Cookies, ruft `resolveThemeMode`, stempelt wie heute. Der einzige
strukturelle Unterschied: zwei `cookies()`-Zugriffe statt einem.

### `AntdProvider`

Bekommt `initialPreference` zusätzlich zu `initialMode` und führt beide im
State. Der Kontext wächst auf `{ mode, preference, setPreference }`.

`setPreference(next)` schreibt das Präferenz-Cookie, löst den Modus gegen den
aktuellen `matchMedia`-Stand auf und schreibt wie heute `dataset.theme` und
`style.colorScheme` mit — die Begründung aus `AntdProvider.tsx:46-52` gilt
unverändert.

Dazu ein Effekt auf `matchMedia("(prefers-color-scheme: dark)")`, der bei jedem
Wechsel das System-Cookie fortschreibt und, **wenn die Präferenz `auto` ist**,
den Modus live nachzieht.

Der Effekt gehört hierher und nicht ins Inline-Script: so bewegen sich antds
Algorithmus (React-State) und `dataset.theme` im selben Render, und es entsteht
kein Fenster, in dem antd hell und Modul-CSS dunkel ist. Außerdem ist er in
jsdom prüfbar.

### `ThemeToggle`

Dreier-Zyklus auf dem bestehenden runden Icon-Knopf: `auto → light → dark →
auto`. Ein Tap-Ziel, unverändert einsetzbar in Kopfzeile und Schublade
(`SuiteNav.tsx:316` und `:427`, letzterer mit eigener `testId` — die
Strict-Mode-Begründung in `SuiteNav.tsx:309-314` bleibt gültig).

Das Icon zeigt den **aktuellen** Zustand:

| Präferenz | Icon |
| --- | --- |
| `auto` | `DesktopOutlined` |
| `light` | `BulbOutlined` |
| `dark` | `BulbFilled` |

Tooltip und `aria-label` nennen beides — den geltenden Zustand und das Ziel des
nächsten Klicks, etwa „Automatisch (folgt dem Gerät) — weiter zu Hell". Ein
Dreier-Zyklus ohne diese Ansage ist eine Rate-Runde; bei zwei Zuständen konnte
das Label noch allein das Ziel nennen.

Kein `size` auf dem Knopf (Falle 4: `controlHeight: 56` ist bereits das richtige
Maß). Die Icons bleiben in dieser Client-Insel (Falle 7).

## Was bewusst offen bleibt

Beim **allerersten** Besuch einer Person mit dunklem OS rendert der Server hell,
und der Client korrigiert einen Render später. Ab dem zweiten Seitenaufruf ist
es richtig.

Das ist eine Deployment-Erwartung, keine Randnotiz: der Namenswechsel des
Cookies (`iuk-theme` → `iuk-theme-pref`/`iuk-theme-system`) macht den
"allerersten" Besuch zum Besuch **jeder Bestandsnutzerin und jedes
Bestandsnutzers** nach dem Deployment. Der System-Schlüssel fehlt dann
allen, der Server liefert hell, und wer ein dunkles OS eingestellt hat, sieht
genau einmal pro Browser hell aufblitzen — danach steht das Cookie und es
bleibt richtig.

Das ist exakt der Vertrag, den `mode.ts:26-34` heute schon ausschreibt. Der
naheliegende Fix — `data-theme` direkt aus dem Inline-Script stempeln —
entkoppelt antds per React-State gewählten Algorithmus von den CSS-Variablen und
erzeugt einen dauerhaft inkonsistenten Zustand statt eines einmaligen
Aufblitzens. Nicht tun.

## Prüfung

**Vitest**

- `mode.test.ts`: der Garbage-Wert-Test kehrt sich um — unlesbare Cookie-Werte
  ergeben `auto` statt `light`. Er bleibt aber bestehen: ein defektes Cookie
  darf keinen vierten Zustand erzeugen.
- Neue Tests für `resolveThemeMode`, inklusive „`auto` ohne System-Cookie →
  `light`".
- `themeInitScript`: schreibt ohne Early-Return, räumt den Altschlüssel ab,
  nimmt die Domain in beide Cookies auf.
- `AntdProvider.test.tsx`: Zyklus über drei Zustände, `matchMedia`-Wechsel zieht
  bei `auto` nach und bei expliziter Wahl **nicht**. Das `afterEach` muss beide
  Cookies räumen, sonst leckt Zustand in andere Testdateien.
- `layout.test.tsx`: Auflösung aus beiden Cookies.

**Playwright**

Auto ist nur hier echt nachweisbar — Vitest sieht den SSR-Pfad strukturell
nicht. Mindestens ein Test: `colorScheme: "dark"` emuliert, kein Cookie gesetzt,
zweiter Aufruf löst dunkel auf.

Die beiden bestehenden Zeilen in `e2e/feedback.spec.ts:492` und `:500` setzen
explizite Präferenzen und ziehen auf den neuen Cookie-Namen um.

**Gesamtlauf**: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm
build` · `pnpm exec playwright test`.

## Nicht im Umfang

- Keine Änderung an `buildTheme`, den Tokens oder irgendeiner Modulfläche.
- Kein Wechsel der Hell/Dunkel-Ikonografie (`Bulb*` bleibt), nur das dritte
  Icon kommt hinzu.
- Keine serverseitige Persistenz der Wahl pro Benutzerkonto.
