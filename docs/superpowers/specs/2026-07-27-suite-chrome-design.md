# Suite-Chrome — globale Navigation, Zoom-Sperre, mobile Querschnittsregeln

**Datum:** 2026-07-27
**Status:** Entwurf zur Abnahme
**Teilprojekt A von drei** (siehe §1)

---

## 1. Umfang und Abgrenzung

Der Auslöser war eine Sammelanfrage: mobile Ansichten sind unschön, Zoom soll global aus, die
Navigationsleiste soll global werden und app-übergreifend navigieren, Auth soll länger halten und
stabiler werden. Das sind vier Themen mit sehr verschiedener Größe. Sie wurden in drei Teilprojekte
zerlegt:

| | Teilprojekt | Berührt | Abhängigkeit |
|---|---|---|---|
| **A** | **Dieses Dokument.** Globale Leiste, Zoom-Sperre, mobile Querschnittsregeln | `core/shell`, `core/theme`, `app/layout.tsx`, `app/globals.css` | — |
| B | Auth: Sitzungsdauer, Refresh-Robustheit, sanfte Re-Authentifizierung, Cookie-Lebensdauer | `core/auth`, `components/providers.tsx` | unabhängig von A |
| C | Mobiler Durchgang der Admin-Arbeitsseiten | feedback-Admin (6 Seiten, 17 `_ui`-Bausteine), portal-Admin, qr-Admin | setzt A voraus |

A ist der einzige Block, der jedes Modul auf einmal verbessert, und liefert die Regeln, an denen C
sich ausrichtet. B ist klein und berührt A nur an einer Stelle (Nutzerblock in der Leiste).

**Nicht in A:** Änderungen an Modulseiten, außer wo sie durch die neue Shell brechen. Kein Umbau von
`core/registry`. Keine Auth-Änderung.

---

## 2. Zoom und Viewport

`src/app/layout.tsx` exportiert heute keinen `viewport` — Next.js setzt den Default
`width=device-width, initial-scale=1`, Zoom bleibt erlaubt. Eine Stelle genügt, um das global zu
ändern; sie liegt über allem, also gilt sie auch für die login-freien Ansichten und den Kiosk.

```ts
// src/app/layout.tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};
```

**`viewportFit: "cover"` gehört ausdrücklich NICHT dazu.** Es stand im Vorschlag, ist aber eine
andere Anforderung: `cover` schaltet auf randlose Darstellung um und verpflichtet damit die Kopfzeile,
jedes Modul-Content-Padding und die Kiosk-Shell auf `env(safe-area-inset-*)`. Das zieht Arbeit durch
ganz A und bis in C, ohne dass die Anfrage danach verlangt hat. Ohne `cover` setzt der Browser die
Einrückung selbst und die Insets sind 0. Wer später randlos will, hebt das als eigene Entscheidung —
und muss dann die Kopfzeilenhöhe von `64` auf `min-height: 64px` plus Inset umstellen, weil ein fester
64px-Header mit 47px Notch-Inset entweder klemmt oder auf 111px wächst.

**Bewusst in Kauf genommen:** `user-scalable=no` verletzt WCAG 1.4.4 (Text auf 200 % vergrößerbar).
Das ist eine abgewogene Entscheidung des Betreibers, keine Nachlässigkeit — und sie wird durch §3
teilweise aufgefangen, das die Untergrenze der Schriftgröße dort anhebt, wo Zoom bisher die Rettung
war. Die Entscheidung steht hier, damit ein späterer Leser sie als Entscheidung erkennt und nicht als
Versehen korrigiert.

---

## 3. Eingabefelder: 16px als Suite-Untergrenze

### Warum die Regel bleibt, obwohl der Zoom aus ist

Bisher galt 16px als Schutz gegen iOS' Auto-Zoom beim Fokus in ein Feld. Mit `user-scalable=no` +
`maximum-scale=1` zoomt iOS gar nicht mehr — der ursprüngliche Grund entfällt. **Die Regel bleibt
trotzdem, aus dem umgekehrten Grund:** Ohne Zoom kann niemand mehr heranholen, was zu klein ist. Ein
14px-Feld war vorher unbequem und wurde weggezoomt; jetzt ist es endgültig. Die Zoom-Sperre und die
16px-Untergrenze sind eine Einheit — wer eine davon entfernt, muss die andere mitprüfen.

Dieser Absatz steht so ausführlich hier, weil die Begründung sich umgedreht hat und der alte Kommentar
in `feedback.css:319-330` noch die alte nennt. Wer nur den liest, hält die Regel nach der Zoom-Sperre
für redundant und löscht sie.

### Was NICHT gemacht wird

**Kein `fontSize: 16` als globaler Token in `theme.ts`.** antd leitet die ganze Leiter aus der Basis
ab (`fontSizeSM/LG/XL`, `fontSizeHeading1–5`, Zeilenhöhen). Basis 16 hebt nicht Eingabefelder an, es
verschiebt jede Überschrift, Tabellenzelle und Beschreibung der Suite. `docs/design/README.md:110`
verbietet genau das: „In Admin-Ansichten sind die Werte antds eigene Leiter (12/14/16/20/24/30) — eine
dritte Skala im Produkt wäre der Fehler, nicht die Lösung."

Ebenso wenig genügt eine nackte Element-Regel `input { font-size: 16px }` in `globals.css`: ihre
Spezifität (0,0,1) unterliegt antds `.ant-input` (0,1,0), und die Regel wirkt still nicht.

**Und der naheliegende Weg über Komponenten-Tokens trägt nicht.** Am antd-Token-Verzeichnis
nachgeschlagen (Stand antd 6):

- `Input` hat keinen `fontSize`, sondern `inputFontSize` — der Name allein reicht, um den Ansatz
  falsch aufzuschreiben.
- **`Select` hat für den Selektor gar keinen Schriftgrößen-Token.** Es gibt nur `optionFontSize`, und
  das gilt der Dropdown-Liste, nicht dem geschlossenen Feld. Dessen Schriftgröße kommt aus dem
  globalen `fontSize` — genau dem, das nicht angefasst werden darf.

Ein Token-Ansatz hätte also für `Select` still nicht gegriffen. Das ist dieselbe Falle, vor der
`feedback.css:325-329` bereits warnt, nur eine Ebene höher.

### Was gemacht wird — zwei CSS-Regeln, vier Komponenten-Tokens

> **Korrektur nach der Umsetzung.** Die erste Fassung dieses Abschnitts schrieb *eine* Regel mit
> `:root`-Präfix vor und behauptete, Modul-CSS überschreibe sie weiterhin nach oben. Das war falsch:
> `:root textarea` ist (0,1,1), eine Modul-Klasse wie `.textfeld` nur (0,1,0) — die globale Regel
> gewinnt und hätte das bewusst auf **18px** gestaltete Freitextfeld des öffentlichen Abendzettels
> auf 16px heruntergezwungen. Der CSS-Scan-Test fängt das nicht: er prüft auf Werte *unter* 16px,
> und 18→16 ist keiner. Aufgefallen ist es erst im Review, an einem `⚠️ Cannot verify from diff`.
> Die korrigierte Fassung steht unten; sie ist umgesetzt und durch einen Regressionstest gesichert.

**Die Regel soll eine Untergrenze sein, kein Diktat.** Daran hängt die ganze Aufteilung:

```css
/* Untergrenze fuer natives Markup — bewusst NIEDRIGE Spezifitaet (0,0,1),
   damit jede Modul-Klasse (0,1,0) sie schlaegt und nach OBEN abweichen darf.
   Nach unten schuetzt der Test, nicht die Kaskade. */
input,
textarea,
select {
  font-size: 16px;
}

/* Die einzige Stelle mit erhoehter Spezifitaet. */
:root .ant-select-selector {
  font-size: 16px;
}
```

```ts
components: {
  Input:       { inputFontSize: 16 },
  InputNumber: { inputFontSize: 16 },
  DatePicker:  { inputFontSize: 16 },
  Select:      { optionFontSize: 16 },
}
```

Der Zusammenhang, der beim ersten Entwurf fehlte: **weil die antd-Felder über Tokens laufen, darf die
CSS-Regel niedrig spezifisch bleiben.** Ohne die Tokens bräuchte sie `:root`, um `.ant-input` (0,1,0)
zu schlagen — und genau dieses `:root` überstimmte dann den Abendzettel. Ein Token und eine CSS-Regel
für dieselbe Sache wären eine Doppelung; hier sind es zwei Wege für zwei verschiedene Welten, und der
eine erlaubt dem anderen, schwach zu bleiben.

`Select` bleibt bei CSS, weil antd für den geschlossenen Selektor keinen Token anbietet — die
geschlossene Auswahl ist ein `<div>`, das `input` darin ist unsichtbar und trägt die Schriftgröße
nicht.

**Bekannte Kopplung:** `.ant-select-selector` ist ein antd-interner Klassenname. Ein antd-Major könnte
ihn umbenennen, und der Bruch wäre still. Das Projekt geht diese Kopplung heute schon in `feedback.css`
ein; sie wandert mit an die eine Stelle, statt sich zu vermehren. Ein Test kann sie nicht absichern —
er kann nur belegen, dass die Regel dasteht. Deshalb steht sie hier als bewusst eingegangenes Risiko.

**Die Dropdown-Optionen** — ein Komponenten-Token, weil sie kein `input` sind und die CSS-Regel sie
nicht erreicht:

```ts
components: {
  Select: { optionFontSize: 16 },
}
```

Das ist keine Doppelung des ersten Mechanismus, sondern eine andere Sache: die Option in der offenen
Liste ist ein Tap-Ziel, das gelesen werden muss, bevor man es trifft. 16 ist ein Wert aus antds eigener
Leiter (12/14/16/20/24/30), also keine dritte Skala.

**Keine Media Query.** 16px gilt überall, auch auf dem Desktop. Zwei Gründe: `controlHeight: 56` bietet
reichlich Platz, und ein zweiter Breakpoint neben dem der Shell (§4) wäre wieder eine zweite Skala.

### Aufräumen

`feedback.css:331-336` (`.fb-form input/textarea/.ant-select-selector` unter `max-width: 600px`)
entfällt ersatzlos — die Suite-Regel deckt es ab. Das ist der Grund, warum diese Regel überhaupt nach
`core` darf: der Maßstab aus `docs/design/README.md:25` ist ein zweiter, heute belegbarer Nutznießer,
und den gibt es jetzt (portal-Admin, qr-Admin, jedes künftige Formular).

Der zugehörige Test in `Noten.test.tsx:298` prüft das alte Muster und muss auf die neue Stelle zeigen.

**Geprüfte Ausgangslage:** Der öffentliche Zettel erfüllt die Regel bereits — `.textfeld` steht auf
18px, das einzige `<input>` ist ein `srOnly`-Radio. Die vielen 11/13/15px in `zettel.module.css` liegen
auf Beschriftungen und Kickern, nicht auf Eingabefeldern; sie bleiben unangetastet (öffentliche
Ansichten dürfen eine eigene Skala haben, `docs/design/README.md:110`).

---

## 4. Die globale Leiste

### Ausgangslage

`AppSwitcher`, `switcherEntries` und `visibleSwitcherModules` existieren und filtern korrekt nach
Gruppen. Sie hängen aber nur in `FullShell`. `MinimalShell` (qr, beta) zeigt nur den Modultitel,
`KioskShell` gar nichts. Und `AppSwitcher` rendert alle Module als Text-Knöpfe nebeneinander unter
`flexWrap: nowrap; overflow: hidden` — auf 390px wird alles jenseits des zweiten Moduls abgeschnitten.
Der `overflow: hidden` war die Notlösung gegen einen zweizeiligen Header; er kaschiert das Problem,
statt es zu lösen.

### Neue Struktur in `core/shell/`

**`SuiteHeader`** (Server Component) — die eine Kopfzeile. Löst `auth()` auf, baut die Einträge über
das vorhandene `switcherEntries()`, rendert den Titel-Link und `SuiteNav`. `FullShell` und
`MinimalShell` rufen beide sie auf. Damit ist der `core`-Maßstab erfüllt: zwei belegbare Nutznießer,
heute.

`switcherEntries()` bleibt serverseitig, weil `moduleUrl()` `process.env` liest, das im Client-Bundle
fehlt — dieselbe Begründung wie im heutigen Kommentar in `FullShell.tsx:25-28`.

**`SuiteNav`** (Client Component) — Menü-Knopf, Drawer, Desktop-Modulknöpfe, Theme-Umschalter,
Nutzerblock. Bekommt nur fertige `href`s. `AppSwitcher` geht darin auf und entfällt als eigene Datei.

**`shell.module.css`** — die Umschaltung Mobil/Desktop läuft über `@media (min-width: 768px)`,
**nicht** über `Grid.useBreakpoint`. Zwei Gründe: `Grid.useBreakpoint` ist in Server Components
verboten (`docs/design/README.md`, Falle 1), und ein JS-Breakpoint zeigt beim ersten Render immer die
falsche Variante. Beide Ausprägungen werden gerendert, CSS blendet eine aus — kein Flackern, kein
Hydration-Mismatch, kein `useEffect`.

**768px ist der einzige Suite-Breakpoint.** Er entspricht antds `md` und wird in
`docs/design/README.md` als solcher festgeschrieben (§8), damit C nicht wieder pro Seite entscheidet.

### `await auth()` in `MinimalShell` — geprüft, unbedenklich

`src/app/m/qr/layout.tsx` trägt den Kommentar, ein `await auth()` dort mache „jede Route unter diesem
Layout dynamisch". **Das ist veraltet.** `pnpm build` am 2026-07-27 weist jede einzelne Route der Suite
als `ƒ (Dynamic)` aus, `/m/qr` eingeschlossen — das Root-Layout ruft `cookies()` für den Theme-Modus,
und der Proxy-Rewrite tut ein Übriges. Es gibt nichts zu verlieren.

Der irreführende Kommentar wird im Zuge der Arbeit korrigiert; `HistoryOwner` bleibt unverändert
clientseitig, das ist eine andere Frage (Offline-PWA-Verhalten).

### Inhalt des Drawers, von oben nach unten

1. **Modul-Navigation** (§5), wenn das Modul welche übergibt — die häufigere Bewegung gehört nach oben
2. **Modulliste** — nur erlaubte, über das unveränderte `visibleSwitcherModules`
3. Theme-Umschalter
4. Nutzername + **Abmelden** (§6)

Das gilt für angemeldete Besucher. Der anonyme Fall sieht anders aus und ist in §6 beschrieben.

### Kopfzeile

| | Mobil (< 768px) | Desktop (≥ 768px) |
|---|---|---|
| links | Menü-Knopf, Modultitel (Link) | Modultitel (Link) |
| rechts | Avatar | Modulknöpfe, Theme-Umschalter, Avatar |
| zweite Zeile | — | Modul-Navigation, wenn übergeben |

`Layout.headerHeight` bleibt 64. Der `flexWrap: nowrap; overflow: hidden`-Kunstgriff entfällt, weil
auf Mobil nichts mehr im Header steht, was überlaufen könnte.

**Offene Abwägung, bewusst so entschieden:** Die zweite Header-Zeile auf dem Desktop kostet vertikalen
Platz auf jeder Seite eines Moduls, das Navigation übergibt. Die Alternative wäre, die Modul-Navigation
in die erste Zeile zu legen und die App-Knöpfe dort auf Icons ohne Beschriftung zu schrumpfen. Dagegen
spricht, dass Icons allein die Module schlecht unterscheidbar machen (`AppstoreOutlined` vs.
`QrcodeOutlined` vs. `CommentOutlined` sagen einem Gelegenheitsnutzer wenig). Die zweite Zeile
erscheint nur, wo Navigation übergeben wird — heute zwei von sieben Modulen.

---

## 5. Modul-Navigation als optionaler Slot

`Shell` und `SuiteHeader` bekommen ein optionales Prop:

```ts
export interface SuiteNavItem {
  key: string;
  title: string;
  href: string;
}
```

Desktop: zweite Zeile unter der Kopfzeile, nur wenn befüllt. Mobil: oberster Abschnitt im Drawer.
Aktivmarkierung über `usePathname()` im Client-Teil. Wer nichts übergibt, bekommt exakt das heutige
Bild — die Änderung ist für die anderen fünf Module unsichtbar.

**Zwei Nutznießer, beide heute:**

- `feedback/(admin)/layout.tsx`: Übersicht (`/`), Vergleich (`/vergleich`). Das Modul hat sechs
  Admin-Seiten, von denen `vergleich` bisher keinen festen Einstieg hat.
- `qr/layout.tsx`: Generator (`/`), Verwaltung (`/admin`) — Letzteres nur für Modul-Admins, was das
  Layout über `canAdminModule("qr")` aus `core/auth/guards` beantwortet.

Damit ist das Prop keine Vorratshaltung im Sinne von `docs/design/README.md:25`.

---

## 6. Anonymer Zustand und Abmelden

### Der Fund

**Die Suite hat keinen Abmelden-Knopf.** `signOut` wird ausschließlich automatisch aus `SessionGuard`
(`components/providers.tsx:11`) bei `RefreshTokenError` gerufen. Manuell abmelden kann sich niemand.
Das ist genau die Prüffrage aus `docs/design/README.md:122` — „Hat jede Action einen Weg in der
Oberfläche?" — und die Antwort war nein.

Der Knopf ruft `signOut({ callbackUrl: "/api/auth/oidc-signout" })`, denselben Weg, den `SessionGuard`
heute automatisch geht. Die Route existiert und behandelt den Pocket-ID-`end_session_endpoint`.

### Der anonyme Fall

`qr` ist `requiresAuth: false`, `MinimalShell` bekommt die Leiste neu — ein anonymer Besucher sieht sie
also. Naiv würde er einen „Abmelden"-Knopf für eine Sitzung bekommen, die es nie gab. Zudem liefert
`switcherEntries(null)` ihm `qr` **und** `feedback`, weil `canAccess` bei `requiresAuth: false` früh
mit `true` aussteigt (so dokumentiert in `registry.ts:52-58`). Die Modulwurzel von `feedback` ist aber
`(admin)/page.tsx` hinter `requireFeedbackAccess()` — ein toter Link, der den Besucher auf 404 wirft.

**Entscheidung:** Ist niemand angemeldet, zeigt der Drawer **keine Modulliste**, sondern einen
**Anmelden**-Knopf (auf `/login`) plus den Theme-Umschalter. Kein Nutzerblock, kein Abmelden.

Begründung: Der Zustand „anonym auf einem Modul, das anonym funktioniert" ist heute nur `qr` — von dort
zu einem anderen Modul zu wechseln setzt ohnehin eine Anmeldung voraus. Die Alternative wäre ein neues
Registry-Feld (etwa `anonymousEntry`), das `qr` von `feedback` unterscheidet. Das wäre der ehrlichere
Datenmodell-Fix, aber er ändert `core/registry` — und das ist laut §1 nicht Teil von A. Wenn ein
zweites anonym nutzbares Modul dazukommt, ist das der Moment für das Feld; bis dahin ist der
Anmelden-Knopf die kleinere und ebenso korrekte Antwort.

---

## 7. Reichweite

| Shell | Leiste | Zoom-Sperre | Begründung |
|---|---|---|---|
| `full` (portal, feedback-Admin, alpha, gamma) | ja | ja | wie heute, nur mobil brauchbar |
| `minimal` (qr, beta) | **neu ja** | ja | `maxWidth: 640` im Content bleibt erhalten |
| `kiosk` (kioskdemo) | nein | ja | Vollbild ohne Bedienelemente ist der Zweck der Variante |
| ohne Shell (`feedback/f/…`, `(print)/aushang`) | nein | ja | login-frei bzw. wird gedruckt |

Die Leiste folgt der Shell-Variante; die Zoom-Sperre sitzt im Root-Layout und gilt ausnahmslos.

---

## 8. Querschnittsregeln in `docs/design/README.md`

Damit C keine Sammlung von Einzelfallentscheidungen wird, hält A das Ergebnis als eigenen Abschnitt
fest:

- **768px ist der einzige Breakpoint der Suite** (= antds `md`). Kein Modul erfindet einen zweiten.
  `Row`/`Col` mit `xs`/`md`, nicht mit festen Breiten.
- **Eingabefelder nie unter 16px** — mit der umgedrehten Begründung aus §3 (Lesbarkeit ohne Zoom, nicht
  mehr Auto-Zoom-Abwehr).
- **antd-`Table` auf schmalen Geräten** bekommt `scroll={{ x: … }}`, bricht nicht um. Eine umgebrochene
  Tabellenzeile ist unlesbarer als eine gescrollte.
- **Handlungsknöpfe unter 768px sind volle Breite und stehen untereinander** — die Regel existiert schon
  als `.fb-block-mobil` in `feedback.css:343-345` und wird hier zur Suite-Regel erhoben.
- Der Hinweis, dass Zoom-Sperre und 16px-Untergrenze zusammengehören.

---

## 9. Tests

| Zusage | Wo | Warum dort |
|---|---|---|
| `viewport`-Export sperrt Zoom | Vitest gegen den Metadata-Export | statisch prüfbar, kein DOM nötig |
| `Select.optionFontSize` ≥ 16 | Vitest gegen `buildTheme()` | `buildTheme` ist reine Berechnung, wie `theme.test.ts` es schon nutzt |
| Die vier Eingabe-Selektoren stehen in `globals.css` auf 16px | Vitest, Quelltext-Scan | die Regel ist CSS, also wird CSS geprüft — ein jsdom-Test sähe die Kaskade nicht |
| Keine CSS-Regel unter 16px auf einem Eingabe-Selektor | Vitest, Quelltext-Scan über alle `.css` unter `src/` | fängt den Fall, den ein DOM-Test nicht sieht |
| Titel bleibt Link, `data-testid="module-title"` bleibt auf dem `<strong>` | `SuiteHeader.test.tsx` (übernommen aus `FullShell.test.tsx`) | der Keystone-E2E hängt an dieser Stelle (§4.16) |
| Leiste erscheint in `minimal`, nicht in `kiosk` | `SuiteHeader.test.tsx` | neue Reichweite aus §7 |
| Drawer zeigt nur erlaubte Module, enthält Abmelden | `SuiteNav.test.tsx` über `_lib/test-dom.tsx` | das etablierte Harness, kein zweites |
| Anonym: Anmelden statt Abmelden, keine Modulliste | `SuiteNav.test.tsx` | §6 |
| CSS blendet Modulknöpfe unter 768px aus | Vitest, Quelltext-Scan über `shell.module.css` | **jsdom wertet Media Queries nicht aus** — ein DOM-Test hierzu ginge stillschweigend durch |
| Sichtbares Verhalten bei 390×844: Leiste bricht nicht, Menü öffnet, Modulwechsel geht | Playwright | einziger Ort, der Media Queries wirklich auswertet |

Die vorletzte und letzte Zeile teilen sich die Aussage bewusst: der Quelltext-Scan besitzt die Regel
(„die Klasse trägt die richtige Media Query"), Playwright besitzt das Ergebnis („man sieht es nicht").
Beides in jsdom zu behaupten wäre ein Test, der immer grün ist.

---

## 10. Reihenfolge der Umsetzung

1. Zoom-Sperre + 16px-Regel + Tests (§2, §3) — kleinster Block, sofort wirksam, unabhängig vom Rest
2. `SuiteHeader`/`SuiteNav` mit Drawer, `AppSwitcher` geht darin auf (§4)
3. Reichweite auf `MinimalShell` ausdehnen, qr-Kommentar korrigieren (§4, §7)
4. Abmelden + anonymer Zustand (§6)
5. Modul-Nav-Slot, befüllt in feedback-Admin und qr (§5)
6. `docs/design/README.md` fortschreiben (§8)

Schritt 1 kann vor allen anderen abgenommen und ausgeliefert werden.
