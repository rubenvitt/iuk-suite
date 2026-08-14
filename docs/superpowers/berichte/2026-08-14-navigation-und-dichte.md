# Navigation und Bediendichte — Abnahmebericht

**Zweig:** `claude/admin-ui-navigation-redesign-741906` · 45 Commits · 147 Dateien · +6661/−1695
**Plan:** `docs/superpowers/plans/2026-08-13-navigation-und-dichte.md`
**Entwurf:** `docs/superpowers/specs/2026-08-13-navigation-und-dichte-design.md`

Alle fünf Tore grün: `typecheck` · `lint` (0 Fehler) · `vitest` 5987/355 Dateien · `build` ·
**Playwright 211/211**.

## Der Anlass

Drei Beobachtungen aus der Benutzung: das Auswahl-Panel des App-Umschalters war unbenutzbar, die
Modulnavigation stand mal seitlich und mal als zweite Kopfzeile, und die Admin-Flächen wirkten
unfertig und zu luftig.

## Was gemessen wurde — vorher und nachher

| Messung | Vorher | Nachher |
|---|---|---|
| Panel-Eintrag im App-Umschalter | ~82px | < 56px |
| Auslöser in einer 64px-Kopfzeile | ~76px | < 56px |
| Bedienelement auf einer Verwaltungsseite | 56px | 44px |
| Bedienelement in `qr` (Einsatzformular) | 56px | 56px, unverändert |
| Seitenleiste beim Scrollen | Loch von 64px darüber | klebt bündig (69/69) |

## Die vier Ursachen, die kein Gate finden konnte

1. **antd vererbt eine Zeilenhöhe von 64px.** `.ant-layout-header` trägt `lineHeight` in
   Kopfzeilenhöhe; der Umschalter hängt als DOM-Kind darin, und `position: absolute` ändert den
   enthaltenden Block, nicht die Vererbung. Die Regel wird zur Laufzeit über cssinjs eingespritzt —
   sie steht in keiner Datei des Repos. **Jetzt Falle 8** in `docs/design/README.md` und `CLAUDE.md`.
2. **Falle 5, zum vierten Mal:** antds `.ant-layout-sider { position: relative }` schlug `.sider`
   bei Spezifitätsgleichstand. Die Seitenleiste klebte deshalb nicht. Behoben mit `.sider.sider`.
3. **Ein optionales Datenfeld entschied über die Bauform.** `hatAbschnitte` ist gelöscht; jedes
   Modul mit Navigation hat jetzt die Leiste.
4. **Das Handschuh-Maß galt auch am Schreibtisch.** `ARBEITSDICHTE` setzt auf `FullShell`-Inhalten
   44px; `MinimalShell` (`qr`, `beta`) und alles ohne Shell behalten 56/72.

## Prüffrage „hat jede Server-Action einen Weg in der Oberfläche?"

Das ist die Frage, an der der `feedback`-Port einmal gescheitert war (sechs von acht Actions ohne
Einstiegspunkt). Über alle sechs Durchgänge, repo-weit gegengeprüft:

**Rund 60 Actions, drei ohne Weg.** Zwei abgelöste Reste in `feedback` (gelöscht), und
`reorderPresetsAction` in `qr` — eine Fähigkeit ohne Oberfläche, auf Entscheidung **bewusst
dokumentiert statt gebaut oder gelöscht**. Der Riegel `requireModuleAdmin("qr")` trägt sie.

Der Eindruck „alle Admin-UIs halbfertig" bestätigt sich in dieser Hinsicht **nicht**. Was fehlte,
waren Bediengrößen, Tapflächen und ein zusammenhängendes Navigationsbild.

## Was der Plan falsch hatte

Sechs Planfehler, alle von Reviews oder Umsetzern gefunden, keiner durchgerutscht. Die drei
folgenreichsten:

- **Die Begründung für `display: flex`** beschrieb einen Fehlerhergang, den es nicht geben kann —
  Flex-Items werden blockifiziert. Hergeleitet statt gemessen, in einem Repo, das „GEMESSEN, nicht
  hergeleitet" als Maßstab führt.
- **`lagerbuch/_lib/schrift.ts` ist kein reiner Adapter** — es streicht `fontVariantNumeric`
  bewusst. Ohne den Fund hätten 24 Seiten still Tabellenziffern auf `<h1>` bekommen.
- **Die Prüfliste schrieb `size="small"` für Zeilenaktionen vor**, übernommen aus Falle 4, deren
  Begründung („eine 56px-Zeilenaktion sprengt die Zeile") durch die eigene Dichteänderung hinfällig
  geworden war. Beide Regelstellen sind nachgezogen.

## Zusicherungen, die aus dem falschen Grund grün waren

Sechs Fälle, alle behoben. Sie sind als Muster wertvoller als einzeln:

- Ein Test, der `[data-testid="modulnav"]` prüfte, während die Komponente auf `() => null` gemockt war.
- Eine Regex `/color:/`, die in `border-inline-start-color:` matchte.
- Ein Wächter (`aus.length === anzahl`), der strukturell nicht fallen konnte, weil `evaluateAll`
  immer genau einen Eintrag je Element liefert.
- Ein Sticky-Test, der nie gescrollt hat.
- Ein Ziffernstellungs-Test, der zwei von drei Stellen abdeckte.
- Ein `toHaveCSS("border-bottom-color")`, dessen Eigenschaft niemand mehr setzt — der Wert fiel auf
  `currentcolor` zurück und war mit der Nachbarzusicherung redundant.

**Die Lehre, die trägt:** eine Mutationsprobe, die mehrere Dinge gleichzeitig ändert, beantwortet
eine andere Frage als die gestellte. In zwei Fällen war die Probe gefahren worden und hat trotzdem
nichts gezeigt.

## Was nur ein Browser finden konnte

Der Abstand zwischen `‹` und dem Rückweg-Text kollabierte, nachdem der Container auf `inline-flex`
umgestellt wurde — im Flex-Layout wird ein nachgestelltes Leerzeichen am Zeilenkastenende getrimmt.
`textContent` enthält es weiterhin, jsdom rendert kein Flex-Layout. Behoben mit `gap: SPACE.xs`,
im Browser gemessen (0px gegen 2,7px).

## Offene Punkte

**Zur Entscheidung, wenn jemand sie aufgreift:**

- `reorderPresetsAction` (`qr`) hat weiterhin keine Oberfläche. Bewusst so, dokumentiert.
- Die Aktivmarkierung der Seitenleiste ist im Browser nur im **Hellmodus** belegt. Der Dunkelzweig
  hat nur die Variablenauflösung — `e2e/shell-mobil.spec.ts` setzt `data-theme` clientseitig, antds
  Tokens bleiben dabei auf dem serverseitig gewählten Algorithmus. Ein Test, der das Theme-Cookie
  setzt und neu lädt, machte antd-Flächen erst prüfbar.
- Die drei Kontrastzahlen im Dunkelmodus sind **gerechnet, nicht gemessen** (zweifach unabhängig).
- `groessen.test.ts` riegelt `size=`-Rückfälle nur für `feedback/_ui` und `portal/admin` ab. Die
  Ausweitung auf `files`, `lagerbuch` und `qr` ist Fleißarbeit, kein Neubau.
- Zurückgestellte Kleinigkeiten: Umlaut-Spreizung in Kommentaren aus den ersten drei Aufgaben,
  verwaistes `.backlink` in `verwaltung.module.css`, `T.h1` in `docs/design/feedback-admin.md`,
  `SPALTE_AKTION_PX` (200→240, unbelegt aber risikoarm), der Posteingangs-Drei-Knopf-Zustand.

**Infrastruktur, kein Merge-Blocker:**

Zwei Playwright-Massen-Fehlschläge traten auf, beide **vor** jeder fachlichen Zusicherung, an
`page.goto` mit `ERR_CONNECTION_REFUSED` bzw. `3310 is already used` bei leerem `lsof`. Ursache
vermutlich Port-Konkurrenz zwischen unmittelbar aufeinanderfolgenden Läufen
(`reuseExistingServer: false`, kein Port-Drain). **Vor dem Werten eines Fehlschlags als Regression:
warten, bis 3100 und 3310 frei sind.** Und: `| tail` verschluckt den Exit-Code der Pipeline — ein
Lauf meldete Erfolg bei 55 von 211 bestandenen Tests.
