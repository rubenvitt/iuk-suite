# Spec 3 — Ant Design als Design-System der Suite

> Querschnitts-Spec, nicht an eine Konsolidierungs-Phase gebunden. Ersetzt den heutigen
> UI-Stack (Tailwind 4 + kopierte shadcn/base-ui-Komponenten) vollständig durch
> **Ant Design 6** mit einem geteilten Theme-Modul, das alle künftigen Module erben.
>
> Plan & Architektur: [`../../../../APP-KONSOLIDIERUNG.md`](../../../../APP-KONSOLIDIERUNG.md) ·
> Arbeitsstand: [`../../../../KONSOLIDIERUNG-PROGRESS.md`](../../../../KONSOLIDIERUNG-PROGRESS.md) ·
> Spec 1: [`2026-07-17-iuk-suite-skeleton-design.md`](2026-07-17-iuk-suite-skeleton-design.md) ·
> Spec 2: [`2026-07-18-portal-productionize-design.md`](2026-07-18-portal-productionize-design.md)

## Ziel & Scope-Grenze

Die Suite bekommt **ein** UI-System statt zweier halber. Der Kern ist nicht der
Komponenten-Tausch, sondern `src/core/theme/` — ein Modul, aus dem sich jedes künftige
Suite-Modul bedient, statt Farben, Abstände und Tap-Höhen erneut zu erfinden. Genau das
ist der Punkt der Konsolidierung: Aufwandstreiber war „5 UI-Systeme", nicht „zu wenig
Komponenten".

Die Apps sind **funktional, nicht repräsentativ** — dichte Formulare, Tabellen, Listen,
bedienbar mit Handschuhen. Ant Design ist für genau diese Klasse gebaut; das ist die
Begründung für die Wahl.

**Deliverable-Grenze:** Am Ende enthält das Repo keinen Tailwind-, base-ui- oder
shadcn-Rest mehr, alle bestehenden Module (`portal`, `qr`) und alle Wegwerf-Module
(`alpha`, `beta`, `gamma`, `kioskdemo`) rendern über antd, und alle Gates sind grün
(typecheck, lint, Unit-Tests, E2E inkl. `pwa-spike`). Kein Redesign, keine neuen
Features, keine Änderung an Datenmodell, Auth, Routing oder Registry-Semantik —
ausgenommen das Feld `ModuleDef.icon`, das von lucide- auf antd-Icon-Namen wechselt.

## Rahmenbedingungen (erfragt / verifiziert)

| Frage | Antwort |
|---|---|
| Tailwind | **Komplett raus.** Zwei parallele Systeme wären genau die Fragmentierung, vor der die Konsolidierung flieht. Layout über antd `Layout`/`Flex`/`Row`/`Col`/`Space`. |
| Scope | **Alles**, inklusive der Wegwerf-Module. Kein gemischter Zustand über Wochen. |
| Dark Mode | **Bleibt**, aber Cookie-basiert statt `localStorage` (§2). |
| antd-Version | **6.5.1** (`latest`). React 19 wird nativ unterstützt — `@ant-design/v5-patch-for-react-19` ist **nicht** nötig und darf nicht installiert werden. |
| Next-Integration | `@ant-design/nextjs-registry@1.3.0`, peer `next >= 14`. Verifiziert gegen Next 16.2.6. |
| Icons | `@ant-design/icons@6.3.2`. |
| pnpm-Peer-Falle | `@ant-design/nextjs-registry` deklariert `@ant-design/cssinjs` als **Peer**. Unter pnpm (strikte Verlinkung) reicht es nicht, dass antd es transitiv mitbringt — `@ant-design/cssinjs` muss **explizit** in die `dependencies`. |
| Statisches Rendering | Irrelevant: nirgends `force-static`/`generateStaticParams`; alle Routen sind durch Proxy-Rewrite und `auth()` bereits dynamisch. Ein `cookies()`-Lesen im Root-Layout kostet also nichts. |

### v6-Fallen (verifiziert, nicht erinnert)

- `notification` nimmt in v6 **`title`**, nicht `message` (`notification.info({ title: … })`).
- `message`/`notification`/`Modal.confirm` als **statische** Aufrufe verlieren den
  `ConfigProvider`-Kontext (Theme, Locale). Deshalb ist die antd-`<App>`-Komponente im
  Provider-Baum Pflicht, und Aufrufer nutzen ausschließlich `App.useApp()`.
- `theme.zeroRuntime` existiert in v6 (statisches CSS, keine Runtime-Serialisierung).
  **Bewusst nicht** im ersten Wurf — es schränkt dynamisches Theming ein. Rückfalloption
  für §7, falls das qr-Bundle klemmt.

## Architektur & Komponenten

### 1. Design-System-Modul — `src/core/theme/`

Der eigentliche Deliverable. Vier Dateien, klar geschnitten:

**`tokens.ts`** — die einzige Stelle mit rohen Werten. Übernimmt den heutigen
`@theme`-Block aus `globals.css`:

```ts
export const DRK = {
  rot: "#c8000f", rotDunkel: "#a2000c", rotBg: "#fbe9eb",
  tinte: "#1a1d20", stahl: "#5b6570", linie: "#d9dde1",
  papier: "#eef0f1", karte: "#ffffff",
  gelb: "#b26a00", gelbBg: "#fbf1dc", ok: "#1e7a3c", okBg: "#e4f2e9",
} as const;

/** Tap-Ziele für Bedienung mit Handschuhen im Einsatz — Einsatzanforderung, keine Stilfrage. */
export const TAP = 56;
export const TAP_XL = 72;
```

**`theme.ts`** — `buildTheme(mode: "light" | "dark"): ThemeConfig`. Setzt
`algorithm` (`defaultAlgorithm` / `darkAlgorithm`), die Seed-Tokens
(`colorPrimary: DRK.rot`, `colorError`, `colorWarning: DRK.gelb`, `colorSuccess: DRK.ok`,
`borderRadius`, `fontFamily`), `cssVar: { key: "iuk" }` und `hashed: false`.

Die Tap-Höhen gehören in die **globalen** Tokens `token.controlHeight` / `controlHeightLG`
(← `TAP` / `TAP_XL`), **nicht** in `components: { Button: … }`. Zwei Gründe: global
propagiert es auf alle Controls (Button, Input, Select, DatePicker) statt auf eine
gepflegte Liste, und nur globale Tokens sind über `theme.getDesignToken()` statisch
prüfbar — Component-Overrides sind eine separate Schicht, die dort nicht auftaucht. Ohne
diese Festlegung wäre der Test aus §6 grün und würde nichts absichern.

Reine Funktion, keine React-Abhängigkeit — dadurch unit-testbar (§6).

**`AntdProvider.tsx`** (Client) — `ConfigProvider` mit `buildTheme(mode)`,
`locale={deDE}` (`antd/locale/de_DE`) und `<App>` als direktem Kind. Deutsch ist hier
kein Detail: Table-Filter, `Popconfirm`, `DatePicker`, `Empty`, `Transfer` kommen sonst
englisch — heute ein sichtbarer Bruch in einer sonst deutschen Oberfläche.

**`mode.ts` + `ThemeToggle.tsx`** — Cookie-Lesen/-Schreiben und der Umschalter im Header
(§2).

### 2. Dark Mode — Cookie statt `localStorage`

`next-themes` fliegt raus. Der Grund ist nicht antd, sondern die **Multi-Host-Architektur**:
`localStorage` ist pro Origin. Eine auf `qr.iuk-ue.de` gesetzte Einstellung gälte auf
`iuk-ue.de` nicht — der Nutzer müsste sie pro Modul-Domain neu setzen. Ein Cookie auf
`.iuk-ue.de` gilt überall.

- **Cookie `iuk-theme`**, Werte `light` | `dark`, Domain über dieselbe Ableitungslogik wie
  das Session-Cookie (`src/core/auth/cookies.ts`) — dort liegt die
  Multi-Host-Domain-Berechnung bereits und wird wiederverwendet, nicht kopiert.
- **Root-Layout** liest das Cookie serverseitig (`cookies()`) und übergibt den Modus an
  `AntdProvider`. Der erste Server-Render trägt damit schon den richtigen Algorithmus:
  kein Hydration-Mismatch, kein FOUC.
- **Umschalten** schreibt das Cookie und setzt den React-State. Dank `cssVar` ist das ein
  Variablen-Swap, keine Neu-Serialisierung der Stylesheets.

**Bewusster Trade-off — kein `system`-Modus im Server-Render.** Der Server kennt die
OS-Präferenz nicht. Ohne Cookie rendert er `light`. Ein kleines Blocking-Script im
`<head>` liest beim allerersten Besuch `prefers-color-scheme` und setzt das Cookie; wirksam
ab dem nächsten Seitenaufruf. Das ist eine bewusste Verschlechterung gegenüber
`defaultTheme="system"` heute, erkauft mit garantiert flackerfreiem SSR. Alternative wäre,
beide Variablensätze vorab zu rendern und per Klasse umzuschalten — mehr CSS, mehr
Komplexität, für Innen-Apps nicht gerechtfertigt.

### 3. Root-Layout — `src/app/layout.tsx`

```
<html lang="de" suppressHydrationWarning>
  <head><script>{THEME_INIT_SCRIPT}</script></head>
  <body>
    <AntdRegistry>          ← @ant-design/nextjs-registry, First-Screen-CSS ins HTML
      <SessionProvider>     ← next-auth, unverändert
        <AntdProvider mode={modeFromCookie}>   ← ConfigProvider + App + de_DE
          <SessionGuard>{children}</SessionGuard>
```

`AntdRegistry` ist nicht optional — ohne sie flackert jeder Seitenaufbau ungestylt auf.
`<Toaster>` (sonner) entfällt ersatzlos; Toasts laufen über `App.useApp().message`.

**`THEME_INIT_SCRIPT` verhindert kein Flackern** — das tut das serverseitig gelesene
Cookie (§2). Seine einzige Aufgabe ist, beim allerersten Besuch `prefers-color-scheme` ins
Cookie zu schreiben. Es steht im `<head>`, damit es das vor dem ersten Datenverkehr tut;
funktional täte es ein `useEffect` genauso. Wer es später anfasst, soll nicht die
next-themes-Denkweise („Blocking-Script gegen FOUC") hineinlesen — die trägt hier nicht.

**Nicht verlieren:** `SessionGuard` in `providers.tsx` meldet bei
`session.error === "RefreshTokenError"` über `/api/auth/oidc-signout` ab. Das ist
Auth-Verhalten, kein UI-Beiwerk. Beim Umbau der Providers (Wegfall von `TooltipProvider`
und `ThemeProvider`) muss diese Logik unverändert überleben.

Die Geist-Schriften bleiben (`next/font/google`) und werden über `token.fontFamily` an
antd durchgereicht, statt über eine CSS-Variable in Tailwind.

### 4. Shells — `src/core/shell/`

| Shell | Umbau |
|---|---|
| `FullShell` | `Layout` + `Layout.Header` (Modul-Titel, `AppSwitcher`, `Avatar`, `ThemeToggle`) + `Layout.Content` mit Token-Padding. Bleibt Server-Komponente; `switcherEntries()` wird weiter serverseitig gebaut (liest `process.env` über `moduleUrl()`). |
| `MinimalShell` | `Layout` mit schlankem Header (nur Titel), Content mit `maxWidth` — tap-freundlich, da das qr-Modul hier hängt. |
| `KioskShell` | Ohne Chrome, `100dvh`, aber **eigener** `ConfigProvider` mit `componentSize="large"` und vergrößerten Tokens: Wandmonitor wird aus Distanz gelesen. |
| `AppSwitcher` | Bleibt **sichtbares** Raster, nicht im Dropdown. Der Kommentar in `AppSwitcher.tsx` begründet das: `keystone.spec.ts` prüft `getByRole("link", …).toBeVisible()` ohne vorheriges Öffnen. Umsetzung als `Space` mit `Button type="text" icon=…`; `Avatar` aus antd. |

`ModuleDef.icon` wechselt von lucide- auf antd-Namen (`AppstoreOutlined`, `QrcodeOutlined`,
`DesktopOutlined`, …). Der Kommentar `// lucide icon name` in `registry.ts` und die
`ICONS`-Map in `AppSwitcher.tsx` werden mitgezogen; der Fallback auf ein Default-Icon statt
Render-Crash bleibt erhalten.

### 5. Komponenten-Mapping

`src/components/ui/` (655 LOC: `button`, `card`, `avatar`, `tooltip`, `dropdown-menu`,
`sonner`) wird **gelöscht**, nicht portiert.

| Heute | Neu |
|---|---|
| `ui/button`, `ui/card`, `ui/avatar`, `ui/tooltip`, `ui/dropdown-menu` | `Button`, `Card`, `Avatar`, `Tooltip`, `Dropdown` |
| `sonner` `<Toaster>` + `toast()` | `App.useApp().message` / `.notification` |
| `components/login-form.tsx` (129 LOC) | `Form` + `Card` |
| `m/portal/page.tsx` Kachel-Grid | `Card` in `Row`/`Col` |
| `m/portal/admin/` (Liste + Formular) | `Table` + `Modal` + `Form` |
| `m/qr/UrlInput`, `wifi`, `tel`, `contact` | `Form` mit `rules` statt handgerollter Validierung |
| `m/qr/PresetGrid`, `HistoryList` | `List` mit `grid` / `Card` |
| `m/qr/QrDisplay` Aktionsleiste | `Button size="large"` mit `@ant-design/icons` |
| `m/qr/admin/preset-form.tsx` (291 LOC) | `Form` + `Form.List` — größter Einzelgewinn des Umbaus |

Die Wegwerf-Module (`alpha`, `beta`, `gamma`, `kioskdemo`, zusammen ~110 LOC) werden
mitgezogen, damit kein Tailwind-Rest zurückbleibt. `beta/OfflineProbe.tsx` und beide
`RegisterSW.tsx` sind Verhaltens-Fixtures ohne nennenswertes Styling und bleiben
funktional unverändert.

### 6. Tap-Targets bleiben eine geprüfte Anforderung

Die 30 Fundstellen von `min-h-[var(--tap)]` / `--tap-xl` verschwinden aus dem Markup, aber
die Anforderung nicht. `TAP`/`TAP_XL` aus `tokens.ts` fließen in die Component-Tokens von
`buildTheme()`.

Weil das damit an genau einer Stelle hängt und beim nächsten Theme-Tweak **still** kippen
könnte, sichert `src/core/theme/theme.test.ts` es ab: `buildTheme(mode)` durch
`theme.getDesignToken()` schicken und prüfen, dass `controlHeight ≥ TAP` und
`controlHeightLG ≥ TAP_XL` in **beiden** Modi gelten. Das funktioniert nur, weil §1 die
Tap-Höhen bewusst global setzt — lägen sie in `components`, sähe `getDesignToken()` sie
nicht und der Test wäre grüne Dekoration. Das ist die einzige neue Testdatei dieses Specs,
und sie deckt das einzige ab, was hier stumm brechen kann.

### 7. Bundle & Offline-PWA

antd vergrößert das Client-Bundle spürbar. Für Intranet-Apps hinter Traefik ist das
unkritisch — mit einer Ausnahme: **`qr` ist eine Offline-PWA**. Der Service Worker
(`_lib/sw-source.ts`) precacht die App-Shell; wächst sie, kann das Precaching auflaufen.

`e2e/pwa-spike.spec.ts` (233 LOC) misst das faktisch und ist damit das entscheidende Gate
dieses Specs — nicht ein geschätzter KB-Wert. Bleibt der Test grün, ist die Frage
beantwortet. Läuft er auf, ist die Reihenfolge: (1) Precache-Liste im SW nachziehen,
(2) `theme.zeroRuntime` aktivieren, (3) erst dann über Komponentenverzicht reden.

### 8. Aufräumen

**Raus:** `tailwindcss`, `@tailwindcss/postcss`, `tw-animate-css`, `@base-ui/react`,
`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `sonner`,
`next-themes` · `postcss.config.mjs` · `src/lib/utils.ts` (`cn()`) samt `utils.test.ts`.

**Rein:** `antd@^6.5`, `@ant-design/icons@^6.3`, `@ant-design/nextjs-registry@^1.3`,
`@ant-design/cssinjs` (Peer-Pflicht, §Rahmenbedingungen).

`src/app/globals.css` schrumpft von ~230 auf ~20 Zeilen: Box-Sizing-Reset,
`html, body { height: 100% }`, `color-scheme`, und die Print-Styles fürs QR-Drucken.
Der lange Kommentarblock zu den base-ui-`@custom-variant`-Definitionen entfällt mit seinem
Gegenstand.

## Testing

Bestehende Absicherung: ~1.000 LOC Component-Tests (vitest/jsdom) und 651 LOC E2E
(Playwright). Beide müssen grün bleiben, nicht ausgedünnt werden.

- **jsdom-Umgebung zuerst.** antd greift auf `matchMedia`, `ResizeObserver` und echtes
  `getComputedStyle` zu — in jsdom fehlen die ersten beiden. Ohne Polyfills im
  vitest-Setup brechen die Component-Tests **gesammelt** und sehen aus wie
  Migrationsschaden, obwohl es die Umgebung ist. Das Setup ist deshalb Teil von Schritt 1,
  nicht Nacharbeit — sonst ist „Tests bleiben grün" kein belastbares Gate.
- **46 `data-testid`** sind die tragenden Anker und überleben den DOM-Wechsel unverändert —
  sie werden deshalb konsequent an die neuen antd-Wrapper mitgezogen.
- **`getByRole`/`getByLabelText`-Queries** brechen dort, wo antd das Markup anders
  strukturiert (`Dropdown`, `Form` mit eigenem Label-Wiring, `Select`). Diese Tests werden
  angepasst, nicht gelöscht. Anpassung heißt: dieselbe Zusicherung, andere Query.
- **`src/app/m/qr/_lib/test-dom.tsx`** (100 LOC Test-Helfer) muss auf antd-Markup
  nachgezogen werden — sonst brechen die qr-Tests gesammelt an einer Stelle.
- **E2E:** `keystone` (SSO/Routing), `portal`, `qr`, `pwa-spike`. `pwa-spike` ist das
  Risiko-Gate (§7).
- **Neu:** `src/core/theme/theme.test.ts` (§6).

## Reihenfolge

Jeder Schritt endet mit einem lauffähigen Zustand; Tailwind bleibt bis Schritt 5
installiert, damit noch nicht migrierte Module nicht ungestylt liegen.

**Übergangszustand ist bewusst hässlich.** In den Schritten 2–4 laufen Tailwinds
Preflight-Reset und antds Styles gleichzeitig — genau der Konflikt, den dieses Spec
beseitigt. Bereits migrierte Komponenten sehen dabei stellenweise schief aus. Das ist
erwartet und **kein** Befund; repariert wird es durch Schritt 5, nicht durch Gegen-CSS.
Bewertet wird der optische Zustand erst nach dem Purge.

1. **Fundament** — Deps, `AntdRegistry`, `core/theme/` (Tokens, `buildTheme`, Provider,
   Cookie-Modus), Root-Layout, jsdom-Polyfills im vitest-Setup, Theme-Unit-Test.
2. **Shells** — `FullShell`, `MinimalShell`, `KioskShell`, `AppSwitcher`, Icon-Wechsel in
   der Registry, `login-form`.
3. **portal** — Kachel-Grid, Admin-CRUD auf `Table`/`Modal`/`Form`.
4. **qr** — Home, `wifi`/`tel`/`contact`, `QrDisplay`, `HistoryList`, `PresetGrid`,
   `admin/preset-form`; `test-dom.tsx` nachziehen.
5. **Purge** — Wegwerf-Module, Tailwind-Ausbau, `globals.css` eindampfen,
   Dependency-Bereinigung, `cn()` löschen.
6. **Gates** — `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm e2e`, `pnpm e2e:pwa`.

## Was dieses Spec bewusst nicht tut

- **Kein Redesign.** Gleiche Informationsarchitektur, gleiche Flows, gleiche Texte.
- **Kein `zeroRuntime`** im ersten Wurf (§7 begründet die Rückfallreihenfolge).
- **Kein geteiltes npm-Paket.** `core/theme/` bleibt Repo-intern; ein publiziertes
  UI-Paket lohnt erst, wenn ein zweites Deployment (uav) es konsumieren will.
- **Keine Änderung an Auth, Routing, Registry-Semantik, Datenmodell** — einzige Ausnahme
  ist das Icon-Feld in `ModuleDef`.

## Nebenwirkung auf Phase 6 (radio)

Im Konsolidierungsplan sollte die bestehende antd-SPA von `radio-admin`/`radio-inventar`
in Phase 6 „sterben". Mit antd als Suite-Standard wird diese Migration deutlich billiger:
Formulare, Tabellen und die Kiosk-Ansicht lassen sich strukturell übernehmen, statt sie
gegen ein fremdes Komponentenmodell neu zu bauen. `APP-KONSOLIDIERUNG.md` und die
Zielstack-Beschreibung („TW4 + shadcn") sind entsprechend nachzuziehen.
