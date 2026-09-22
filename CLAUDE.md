# iuk-suite — Projektanweisungen

Next.js 16 (App Router, RSC) · Ant Design 6 · Drizzle + better-sqlite3 · Auth.js v5 (Pocket ID) ·
Vitest + Playwright. Eine SQLite-Datenbank **pro Modul**.

## Bevor du Oberfläche baust: `docs/design/` lesen

`docs/design/README.md` enthält die verbindlichen Querschnittsregeln — insbesondere **zwanzig Fallen, die
`pnpm build` nicht findet** und die je einen halben Tag kosten:

1. **Compound-Zugriff auf antd in einer Server Component ergibt HTTP 500** (`Typography.Title`,
   `Form.Item`, `Descriptions.Item`, `List.Item`, `Input.TextArea` … — vollständige Liste dort).
   `Card`, `Statistic`, `Result`, `Progress`, `Table`, `Tag` sind sicher.
2. **`--ant-*`-CSS-Variablen sind nicht global** — antd deklariert sie auf seiner Scope-Klasse. Eigenes
   Markup sieht sie nicht, und der Fehler ist still (die Linie verschwindet einfach).
3. **`colorError === colorPrimary === #c8000f`** — ein `Alert type="error"` sieht aus wie eine
   Primäraktion. In Modulen, wo Rot fachliche Bedeutung trägt, gehört Rot nie auf eine Datenfläche.
4. **`size="large"` ist 72px** — `size` auf Bedienelementen also gar nicht setzen. **Drei Bediendichten,
   alle in `core/theme/theme.ts`:** `FullShell`-Inhalte 44 (`ARBEITSDICHTE`; WCAG 2.5.5 AAA, gilt **überall**,
   weil `FullShell` auch auf dem Telefon rendert); `MinimalShell` (`qr`, `beta`) und alles ohne Shell 56/72;
   `SCHREIBTISCHDICHTE` 32/40 nur, wo ein Modul sie ausdrücklich anlegt — heute allein `radio`s Verwaltung
   (Betreiberentscheidung 2026-08-28; unterschreitet AAA bewusst, hält die AA-Untergrenze 24, WCAG 2.5.8).
5. **Eigenes CSS gegen antd-CSS entscheidet die Spezifität, meist gegen dich** — und immer still: die
   Regel steht richtig da und greift nur nicht. Drei Ausprägungen (Gleichstand → antd gewinnt durch
   Reihenfolge · eigene Regel zu schwach · eigene Regel zu stark und trifft das eigene Modul). Wo antd
   einen **Token** anbietet, ist der Token besser als jede Spezifität.
6. **Ein `WERT` aus einem `"use client"`-Modul kommt in einer Server Component nicht an** — sie bekommt
   eine Client-Referenz statt des Wertes, HTTP 500 für die ganze Seite. TypeScript ist zufrieden, `build`
   findet nichts, und **Vitest kann es strukturell nicht finden** (dort ist `"use client"` ein
   wirkungsloser String). Werte für Server Components gehören in ein Modul ohne `"use client"` (`_lib/`).
7. **`@ant-design/icons` in einer Server Component ergibt HTTP 500 — und `"use client"` behebt das
   nicht, es macht es still.** Der nackte Spezifizierer löst über `exports["."].node.import` auf CJS
   auf, das `createContext` auf **Modulebene** ruft; in der RSC-Ebene gibt es das nicht →
   `TypeError: (0, _react.createContext) is not a function`, **schon beim Import, nicht beim Rendern**.
   `typecheck` und `build` bleiben grün, und **Vitest kann es strukturell nicht sehen** (dort lädt
   `react` über die `default`-Bedingung, die Icons rendern klaglos) — nur ein echter Abruf zeigt den
   500. Abhilfe: Client-Insel oder eigenes Inline-SVG. Ein Tiefen-Import (`@ant-design/icons/es`) geht
   gemessen durch, ist aber kein Vertrag, auf den man bauen sollte. `src/core/shell/icons.test.ts`
   riegelt das repo-weit ab — geht der Test rot, liegt die Ursache fast nie in `core/shell`, sondern
   in der Datei, die die Fehlermeldung nennt.
   **Nicht mit Falle 6 zusammenlegen, die Ursachen sind gegenläufig:** dort kommt ein Wert aus einem
   als Client markierten Modul nicht an, hier wertet RSC ein Modul aus, das Client sein müsste. Setzt
   man `"use client"` auf `icons.ts`, verwandelt sich 7 in 6 — HTTP 200 mit **leerer** Map, und der
   Rückfall trägt still das falsche Icon. Laut ist besser als still.
8. **Die Kopfzeile vererbt ihre Zeilenhöhe an jedes Kind** — `antd/es/layout/style/index.js` setzt auf
   `.ant-layout-header` ein `lineHeight` in Kopfzeilenhöhe (hier **64px**), und `position: absolute`
   ändert den enthaltenden Block, **nicht die Vererbungskette**. Gemessen: 82px je Eintrag im Panel
   des App-Umschalters und 76px am Auslöser — in einer 64px hohen Kopfzeile. **Kein Gate findet das:**
   antd spritzt die Regel zur Laufzeit über cssinjs ein, sie steht in **keiner Datei des Repos**, und
   jsdom rechnet keine Zeilenboxen — nur ein echter Browser kennt die Zahl. Abhilfe: `line-height:
   normal` am **gemeinsamen Vorfahren**, nicht an jedem Kind einzeln.
9. **`<Table columns={[{ render: fn }]}>` geht nicht direkt aus einer Server Component** (gemessen
   im Modul `aufgaben`, Aufgabe 11):
   ```
   Error: Functions cannot be passed directly to Client Components unless you explicitly
   expose it by marking it with "use server".
     {title: "Titel", key: "titel", render: function render}
   ```
   antds `Table` ist selbst eine Client-Komponente; ein `columns[].render`, das in einer Server
   Component entsteht, ist eine **gewöhnliche Funktion** — keine Server Action —, und React lehnt
   ab, sie über die RSC-Grenze zu reichen. **Warum kein Gate es sieht:** `pnpm build` prüft
   Modulgrenzen statisch, nicht die tatsächliche Serialisierung eines Requests, und ein `mount()`
   in jsdom ist ein einziger JS-Prozess **ohne RSC-Grenze überhaupt** — `typecheck`/`lint` sowieso
   nicht. Nur ein echter Abruf zeigt es. **Abhilfe** (Vorbild `lagerbuch/verwaltung/(arbeit)/
   LetzteBuchungenTable.tsx`, `aufgaben/_ui/RoutinenTabelle.tsx`): die Tabelle in eine eigene
   `"use client"`-Komponente heben, die nur **serialisierbare** Daten als Prop bekommt und ihre
   `render`-Funktionen selbst definiert. Server Actions dürfen als einzige über die Grenze — aber
   **direkt importiert**, nicht als Prop durchgereicht. **Nicht mit Falle 1 oder 6 zusammenlegen**:
   dort geht es um Compound-Zugriff bzw. um einen Client-Wert in RSC, hier um eine **Funktion, die
   die Grenze überquert**.
10. **Ein POST auf einen Route Handler kann während dessen Erstkompilierung abgebrochen werden**
    (gemessen im Modul `aufgaben`, Aufgabe 19, per CDP-`Network`-Domäne, nicht vermutet). `next dev`/
    Turbopack kompiliert einen Route Handler beim **ersten** Treffer; landet der eigentliche
    `fetch(..., { method: "POST" })` genau in diesem Fenster, löst der HMR-Kanal einen vollen
    Seiten-Reload aus, und der Browser **bricht die laufende Anfrage mit ab** — `net::ERR_ABORTED`,
    `canceled: true`, **nie eine Antwort**. **Das Symptombild führt in die Irre:** keine
    Datenbankzeile, keine Protokollzeile, und ein e2e-Test läuft in sein Zeitbudget mit einer
    Meldung, die nach etwas ganz anderem klingt — isoliert grün, im Verbund rot, was erst an
    Ressourcendruck oder geteilten Zustand denken lässt. **Abhilfe:** ein Warmlauf-GET auf dieselbe
    Route vor dem ersten echten POST (Vorbild `e2e/files-fileshare.spec.ts`, das dieselbe Falle für
    `/api/download/[id]` schon lange kennt — sie stand nur nicht an der Stelle, an der man sie
    sucht). **Daraus folgt eine zweite Testregel:** ein e2e-Test, der eine Anfrage auslöst, **prüft
    ihre Antwort** (`page.waitForResponse`), statt nur auf eine spätere Zustandsänderung zu warten —
    sonst läuft jede abgelehnte Antwort (404, 405, 413, abgebrochen) still ins Zeitbudget und meldet
    sich als etwas anderes.
11. **`locator.dragTo()` löst kein zuverlässiges natives `dragstart` aus** (gemessen im Modul
    `aufgaben`, Aufgabe 20): ein Zug zwischen zwei Tagesspalten lief reproduzierbar in den vollen
    90-Sekunden-Timeout, ohne dass je ein `drop` feuerte — `dragstart` feuerte nur bei einem
    kleinen Zielelement, nie bei einer großen Zielfläche. Eine echte, schrittweise Mausbewegung
    (`page.mouse.move`/`down`/mehrfach `move` mit Pausen/`up`) löst dieselbe Kette zuverlässig aus;
    Chromiums native Drag-Erkennung braucht offenbar eine kontinuierliche Bewegung über eine
    Mindestdistanz, die ein einzelner `dragTo()`-Sprung nicht liefert.

12. **Ein `.click()` auf einen echten Anker navigiert nicht, wenn die Hülle zwischen `mousedown` und
    `mouseup` umbricht** (gemessen im Modul `lagerbuch`, CI-Lauf 31951787232 auf `main`, aus der
    Playwright-Ablaufverfolgung gelesen — nicht vermutet). Playwright meldet den Klick als gelungen,
    der Knoten ist ein `<a href>`, er trägt danach sogar den Fokus — und im Netzwerkteil steht für
    das Ziel **kein einziger Aufruf**. Ursache: Playwright legt beide Mausereignisse auf den Punkt,
    den es **vor** dem Klick berechnet hat; springt die Seite in den ~200 ms dazwischen, trifft
    `mouseup` etwas anderes, und das `click`-Ereignis feuert auf dem gemeinsamen **Vorfahren** —
    einem `<div>`, das nicht navigiert. **Der Auslöser sitzt in der Hülle:** `SessionProvider` holt
    `/api/auth/session` nach, deren erste Aufrufe unter `next dev` noch in die Erstübersetzung
    fallen (`ClientFetchError: Failed to fetch`); mit der Sitzung wechselt die Navigation von der
    schmalen Platzhalter- auf die volle Spalte und der Inhalt rutscht ~240 px hoch. Das passiert
    **nach** `load`, also hinter `page.goto(..., waitUntil: "load")` **und** hinter Playwrights
    eigener Stabilitätsprobe, die vor dem Klick misst. **Kein größeres Zeitbudget und keine
    Wiederholung heilt das** — gewartet wird auf eine Navigation, die nie angestoßen wurde, und die
    Lage hält über alle drei Versuche an. Lokal unsichtbar (warmes `.next`, 20 von 20 Mal grün).
    Abhilfe: `klickeWennRuhig` aus `e2e/fixtures.ts` klickt erst, wenn der Kasten des Elements
    dreimal in Folge stillsteht; dort steht auch die volle Messung mit Bildzeiten.

    ⚠️ **Die Hülle brach ein ZWEITES Mal um, und dieser Umbruch traf nicht den Klick,
    sondern jede MESSUNG** (gemessen im Modul `lagerbuch`, DRK-322, bei 834px — gegen antds
    Quelle gelesen, nicht vermutet; behoben mit DRK-363). `Layout` legt seine Kinder nur dann
    nebeneinander, wenn es die Klasse `ant-layout-has-sider` trägt. Ohne `hasSider` stand sie
    **nicht im Server-HTML**: dort kam `class="ant-layout iuk"` an, `.ant-layout` ist
    `flex-direction: column`, die Leiste stand also zunächst **über** dem Inhalt (Inhalt bei
    x=0, y=309, volle 834px). Erst bei der Hydration meldet sich `Sider` per `useEffect` bei
    `Layout` an (`antd/es/layout/Sider.js:122-125`), und das Raster kippte:

    ```
    t=0ms     class="ant-layout iuk"                       flex-direction: column   Inhalt 834px
    t=500ms   class="ant-layout ant-layout-has-sider iuk"  flex-direction: row      Inhalt 594px
    ```

    ⚠️ **Es ist die KLASSE, die fehlt, nicht die Regel** — und der Unterschied schickt die
    Fehlersuche sonst ins falsche Stilsystem. Die cssinjs-Regel `.ant-layout-has-sider
    { flex-direction: row }` steht im selben Server-HTML bereits drin (nachgemessen), und
    `shell.module.css` deckelt ohnehin nur die Leiste selbst, nie `Layout` oder `Content`.
    `useHasSider` hat zwar einen synchronen Rückfall über die Kinder
    (`childNodes.some(node => node.type === Sider)`) — der greift nicht, sobald das `Layout` in
    einer **Server Component** steht: `<Sider>` überquert die RSC-Grenze als Client-Referenz.
    **Abhilfe, und sie gilt für jedes `Layout` mit `Sider` in einer Server Component:**
    `hasSider` ausdrücklich setzen — `SuiteRahmen` tut es mit `hasSider={nav.length > 0}`, nie
    fest `true`, sonst läge auch ein Modul ohne Navigation auf `row`. Dann steht die Klasse im
    Server-HTML. `e2e/shell-spaltenaufteilung.spec.ts` misst das **ohne JavaScript** — nur so
    ist der Zustand vor der Hydration kein rennabhängiges Fenster, sondern ein fester Zustand.
    **Kein anderes Tor sieht es:** unter jsdom gibt es keine RSC-Grenze, dort greift der
    Rückfall, und die Klasse stünde auch ohne `hasSider` da.
    Für einen Test hieß das: bis dahin war nichts zu eng, eine Tabelle scrollte nicht in sich,
    und eine Zusicherung darauf fiel, **obwohl die Seite richtig war** (gemessen: Tabellenkasten
    802px statt 562px). Wer einmal per `evaluate` misst und danach nur noch rechnet, hat genau
    einen Versuch; `warteAufSpaltenaufteilung` in `e2e/lagerbuch-ist-bestand.spec.ts` fragt
    deshalb die Invariante des fertigen Rasters ab und bleibt als Rückversicherung stehen.

    **Fallen 10, 11 und 12 sind Testfallen, keine Produktionsfallen** — alle drei gehören zur selben
    Familie wie die zweite Testregel aus Falle 10: Fälle, in denen ein e2e-Test **etwas anderes
    misst, als sein Name sagt**.

13. **Der `100vw`-Deckel einer `Drawer` ist nicht die sichtbare Breite** (gemessen im Modul
    `lagerbuch`, DRK-296, echter Chromium — nicht vermutet). antds `size` landet über
    `rc-drawer` (`DrawerPopup.js:159`) als nacktes `width` auf einem Rahmen, der an `right: 0`
    hängt; gekappt wird er allein durch antds eigenes `max-width: 100vw`. **Das reicht weiter,
    als man denkt, und trotzdem nicht weit genug:** läuft die Seite waagerecht über, ist `100vw`
    *breiter* als das Fenster, und die Schublade wächst über die **linke** Kante hinaus — dort
    sitzt der Schließen-Knopf. `size={520}` bei 480px Fensterbreite: `100vw` = 506px, linke Kante
    −26px, Knopf −2px, bei gesperrtem Seiten-Scroll also unerreichbar. ⚠️ **Die Zahl ist nicht
    der Unterschied, die Seite dahinter ist es** — dieselbe Messung zeigte `size={480}` (uav) und
    `width={360}` (radio) bis hinunter zu 320px sauber im Bild. Wer nur die eigene Schublade
    misst, schließt daraus fälschlich, es gebe nichts zu decken.
    **Kein Tor sieht das:** `typecheck` prüft eine gültige Zahl, `build` serialisiert sie klaglos, und **Vitest kann es strukturell nicht sehen** — jsdom rechnet
    keine Layoutboxen (`getBoundingClientRect()` liefert überall Nullen) und wertet weder `min()`
    noch `vw` aus. Dieselbe Klasse wie Falle 8: die Zahl kennt nur ein echter Browser.
    **Die zweite Hälfte ist stiller als die erste:** eine feste Breite ist auf einem niedrigen
    Schirm nicht zu schmal für das *Fenster*, sondern für den *Inhalt*. Dieselbe Schublade trug
    1862px Inhalt auf 663px Sichtfläche (1280×720), während links 760px abgedunkelter Hintergrund
    brachlagen — nichts war abgeschnitten, und trotzdem lag die zweite Buchungsaktion rund 1000px
    unter der Kante. Das meldet niemand als Fehler; es meldet sich als „geht nicht weit genug".
    **Abhilfe:** `flyinBreite(grund)` aus `core/theme/flyin.ts` — ein CSS-`min()`, das der
    Browser bei **jeder** Größenänderung neu auswertet (eine in `useEffect` gemessene Zahl wäre
    beim Öffnen richtig und danach still falsch). Damit die gewonnene Breite auch etwas trägt,
    gehört das Raster im Inhalt auf `auto-fit`/`minmax` — das misst den **Kasten**; eine
    `@media`-Abfrage misst das **Fenster** und legt Spalten auch dann nebeneinander, wenn der
    Deckel die Schublade längst schmal gemacht hat. `src/core/theme/flyin.test.ts` hält die Form
    der Zeichenkette fest (antd und rc-drawer lesen sie als **Zahl**, sobald sie wie eine
    aussieht — der Deckel verschwände still), `e2e/flyin-breite.spec.ts` misst die Wirkung.
    ⚠️ `width`/`height` sind in antd 6 nur noch abgekündigte Aliase auf `size`
    (`antd/es/drawer/Drawer.js:155`); die Warnung steht in der Konsole, nicht in einem Tor.

14. **Eine virtualisierte `Table` verlangt ZAHLEN, und beide Rückfälle sind still** (gemessen im
    Modul `lagerbuch`, DRK-331, gegen `@rc-component/table@1.11.1` gelesen — nicht vermutet).
    `virtual` schickt die Tabelle durch `VirtualTable/index.js:38-50`, und das prüft **beide**
    Scrollmaße auf `typeof … === "number"`: ist `scroll.x` keine Zahl, setzt es `scrollX = 1` —
    die Tabelle fällt auf **ein Pixel** Breite zusammen; ist `scroll.y` keine Zahl, nimmt es 500.
    Beide Male steht die Warnung allein in der Entwicklungskonsole. **Das trifft fast jede
    bestehende Tabelle:** `scroll={{ x: "max-content" }}` ist die Vorgabe der Suite (Falle 5,
    `docs/design/README.md`) — genau der Wert, der hier zu `1` wird. `typecheck` kennt
    `"max-content"` als gültig, `build` serialisiert es klaglos, und **Vitest kann die Wirkung
    strukturell nicht sehen**, weil jsdom keine Layoutboxen rechnet. Abhilfe: `core/tabelle`
    rechnet `scroll.x` aus den Spaltenbreiten und **schaltet die Virtualisierung ab**, sobald eine
    Spalte keine numerische `width` trägt; `core/tabelle/masse.test.ts` hält die Entscheidung fest,
    ohne etwas zu rendern.

    **Die zweite Hälfte ist die teurere: eine virtualisierte Tabelle rendert in jsdom ÜBERHAUPT
    KEINE ZEILE.** `rc-virtual-list` kommt ohne Layoutboxen auf null sichtbare Einträge,
    `tr[data-row-key=…]` findet nichts mehr — und ein DOM-Test dagegen wird **lautlos blind**, er
    reißt nicht, er misst nur nichts mehr. Gemessen: an der Artikeltabelle fielen dadurch 35 von
    35 Tests gleichzeitig aus. ⚠️ **„Keine" ist dabei die gemessene Zahl jenes Falls, keine
    Konstante:** wie viele Zeilen übrig bleiben, rechnet rc-virtual-list aus Höhen, die jsdom alle
    mit 0 beantwortet — dieselbe Messung ergab an einer schmaleren Tabelle neun. Wer hier auf eine
    Zahl zusichert, prüft die Umgebung statt der Tabelle; belastbar ist allein „weniger als die
    Liste". Deshalb virtualisiert `core/tabelle` erst **ab
    `VIRTUELL_AB_ZEILEN`** (heute 150) — das ist zugleich die fachlich richtige Schwelle, weil sich
    der Aufwand darunter ohnehin nicht lohnt. Tests mit einer Handvoll Zeilen prüfen damit weiter
    echtes Markup; die Wirkung der Virtualisierung selbst kann **nur Playwright** sehen.

    **Und eine dritte Folge, die auch im Browser gilt: eine virtualisierte Tabelle hat kein
    `tbody` und keine `tr`.** rc-table rendert Zeilen und Zellen als `div`s
    (`VirtualTable/BodyLine.js:40-41`). Ein Playwright-Greifer über `tbody tr` findet ab der
    Schwelle schlicht nichts mehr — und zwar erst dann, was ihn im kleinen Seed grün lässt.
    `[data-row-key]` setzt rc-table in **beiden** Betriebsarten; das ist der Greifer, der trägt.

    ⚠️ **Die ROLLEN sind seit DRK-336 nachgerüstet, die ELEMENTE nicht.** `core/tabelle/rollen.tsx`
    hängt über `components.body.wrapper/row/cell` wieder `role="table"`/`"row"`/`"cell"` ein, dazu
    `aria-rowcount` am Körper und `aria-rowindex` an jeder Zeile (ohne beide sagt eine
    Vorleseanwendung „20 Zeilen", wo 800 stehen). `getByRole("row")` trägt damit wieder — aber
    **nur über `Datentabelle`**: eine nackte antd-`Table` mit `virtual` hat weiterhin keine
    einzige Rolle im Körper. Bewusst `table`/`cell` und **nicht** `grid`/`gridcell`: `grid` ist
    eine Zusage über die Bedienung (Pfeiltastennavigation, ein Tabstopp), die diese Tabellen nicht
    einlösen. Das Ziel ist Gleichstand mit derselben Tabelle unterhalb der Schwelle, nicht mehr.
    ⚠️ Nur `components` reicht dafür nicht: die Rollen müssen **an derselben Bedingung hängen wie
    die Virtualisierung selbst** — in der gewöhnlichen Tabelle sind dieselben drei Steckplätze
    `tbody`/`tr`/`td`, und wer sie dort durch `div`s ersetzt, zerstört die Tabelle samt
    Spaltenbreiten (ein `colgroup` wirkt nur auf eine echte `<table>`).

    ⚠️ **Zum `aria-label` steht in älteren Notizen das Gegenteil, und das ist seit antd 6.6.2
    überholt:** rc-table hängt die aria-Props nur an die Tabelle, die es im virtuellen Zweig gar
    nicht rendert (`Table.js:481`) — antd fängt das aber ab und setzt sie über `HeaderTable`
    (`InternalTable.js:41`) an die Tabelle des **Kopfes**. Bei fixem Kopf landet der Name damit an
    einem Element **ohne eine einzige Datenzeile**. `Datentabelle` nimmt ihn dort weg und setzt ihn
    an den Körper, sobald virtualisiert wird; stünde er an beiden, träfe eine Vorleseanwendung zwei
    gleich benannte Tabellen nebeneinander.

    ⚠️ **`aria-rowcount` ist NICHT `dataSource.length`**, und der Unterschied ist genau die Zahl,
    die jemand hört: antd filtert die Datenquelle **nach** `core/tabelle` noch einmal, über
    `filteredValue`/`onFilter` der Spalten. Eine Liste von 800 Artikeln, die ein Spaltenfilter auf
    20 zusammenzieht, ergäbe „Zeile 3 von 800" an einer Tabelle mit zwanzig Zeilen. `Datentabelle`
    rechnet die angezeigte Menge deshalb selbst aus (`angezeigteAnzahl` in `angezeigt.ts`, dieselbe
    Vereinigungs-/Schnitt-Bedeutung wie Falle 15). ⚠️ Filtert eine Spalte **ungesteuert** (`filters`
    ohne `filteredValue`), führt antd den Stand allein und von außen ist er nicht zu sehen — dann
    steht dort `-1`, ARIAs Angabe für „unbekannt viele". Eine zu große Zahl wäre eine Behauptung.

    ⚠️ **Was die Nachrüstung NICHT zurückholt, und das ist kein Versäumnis dieser Falle:** die
    Zuordnung Spaltenkopf → Zelle. Sobald eine Tabelle `scroll.y` setzt — und `virtuell` setzt es
    immer —, teilt rc-table sie in **zwei** `<table>`-Elemente (`Table.js:485` Kopf, `:507`
    Körper); der Kopf trägt nur `thead`, der Körper nur `tbody`. Das gilt für **jede** Tabelle der
    Suite mit fixem Kopf, virtuell oder nicht, und steht als DRK-362 auf dem Board.

15. **`Table`s `onChange` feuert nur bei Bedienung DER TABELLE — nicht, wenn sich `dataSource`
    daneben ändert** (gemessen im Modul `lagerbuch`, DRK-331). Der naheliegende Weg, „was steht
    gerade auf dem Schirm?" zu beantworten, ist `onChange(…, extra.currentDataSource)`: antd reicht
    die gefilterte und sortierte Liste dort fertig heraus. Er ist **falsch**, sobald über der
    Tabelle noch etwas anderes filtert — eine Freitextsuche, ein neu geladener Serverstand. antd
    filtert dann korrekt neu, **meldet es aber nicht**; der gemerkte Stand ist still veraltet.
    Gemessen: Statusfilter setzen, dann tippen → die Trefferanzeige blieb auf der Zahl von vor der
    Suche stehen, und ein Export „mit der aktuell angezeigten Liste" hätte eine Menge geliefert,
    die so nie auf dem Schirm stand. **Kein Tor sieht das**: die Typen stimmen, der Aufruf kommt an,
    nur zu selten. Abhilfe: nicht die LISTE merken, sondern den ZUSTAND (welche Filter, welche
    Sortierung) und die Liste daraus ableiten — `core/tabelle/angezeigt.ts`, geprüft in
    `angezeigt.test.ts` ohne zu rendern. ⚠️ Mehrere angekreuzte Werte EINER Spalte sind eine
    **Vereinigung**, verschiedene Spalten ein **Schnitt** (`antd/es/table/hooks/useFilter/index.js`,
    `realKeys.some(...)`); wer das nachrechnet und anders verknüpft, zeigt eine andere Liste als die
    Tabelle daneben.

16. **Eine virtualisierte Tabelle IST ein zweiter Scroller — und `virtuell` misst nur ihren KÖRPER**
    (Modul `lagerbuch`, DRK-334, gegen `@rc-component/table@1.11.1` gelesen —
    `Table.js:221` macht `scroll.y` zu `fixHeader`, `Table.js:534` legt den eigenen Kopf-Kasten
    daneben). `virtuell` setzt
    `scroll.y`, und `scroll.y` ist die Höhe des Tabellen**körpers**; der Spaltenkopf kommt oben
    drauf. Wer „Fensterhöhe minus Oberkante" direkt durchreicht, baut eine Tabelle, die um genau
    eine Kopfzeile höher ist als ihr Platz. ⚠️ **Das Symptom ist nicht „zu hoch", sondern „zwei
    Scrollbalken":** auf einer Modulseite ist das **Dokument** schon ein Scroller (die ganze
    Vorfahrenkette steht auf `overflow: visible`, die Seitenleiste bekommt ihren eigenen Scroller
    erst ab 768px), der Tabellenkörper ist der zweite — und weil der äußere nur diese ~50px Weg
    hat, reagiert mal der eine, mal der andere. Dazu kommt das **Kettenscrollen**: am Ende des
    inneren läuft die Bewegung im äußeren weiter, solange `overscroll-behavior` fehlt.
    **Kein Tor sieht das:** `typecheck` prüft eine gültige Zahl, `build` serialisiert sie klaglos,
    und **Vitest kann es strukturell nicht sehen** — jsdom rechnet keine Layoutboxen und rendert
    eine virtuelle Tabelle zeilenlos (Fallen 13/14). **Abhilfe:** `TabellenVollhoehe` aus
    `core/tabelle` — misst Rahmen, Tabellenoberkante und Kopfhöhe, deckelt unter 768px die
    Seitenhöhe (`overflow: hidden`) und gibt die Deckelung wieder auf, sobald für den Körper
    weniger als `mindestens` bliebe; die Rechnung steht als reine Funktion in `vollhoehe.ts` und
    ist in `vollhoehe.test.ts` geprüft, die Wirkung in `e2e/lagerbuch-artikel-mobil.spec.ts`.
    ⚠️ **Zwei Kleinigkeiten, die je einen halben Tag kosten:** der Breakpoint gehört in die Media
    Query (ein JS-Breakpoint zeigt beim ersten Render die falsche Variante, `Grid.useBreakpoint`
    ist ohnehin verboten), und `min-height: 100vh` an der Hülle ist auf dem Telefon die GROSSE
    Sichtfläche — solange die Adresszeile steht, scrollt das Dokument dadurch allein deshalb.
    `100dvh` ist gemeint.

17. **Eine Spaltenüberschrift als JSX aus einer SERVER COMPONENT kommt im Server-HTML gar nicht
    an — die Kopfzelle bleibt LEER** (Modul `files`, DRK-329, echter Chromium gegen `next dev`,
    SSR-HTML und DOM nebeneinander gelesen — nicht vermutet). `@rc-component/table` rendert
    `columns[].title` an **zwei** Stellen: in die Kopfzelle und in eine verborgene Messzeile, dort
    über `React.cloneElement(rawTitle, { ref: null })` (`1.11.1`,
    `es/Body/MeasureRow.js:36-40`). Entsteht das Element in einer Server Component, bekommt im
    Server-HTML nur die **Messzeile** es zu sehen; gemessen an der Dateiliste von
    `/shares/<id>` (vier Spalten, `scroll.x` 1020): viermal `<th class="ant-table-cell"
    scope="col"></th>`, die vier Titel allein in `.ant-table-measure-row`. Der Browser setzt sie
    dann in die Kopfzelle — das ist die Abweichung, und React meldet sie als „Hydration failed
    because the server rendered HTML didn't match the client" mit `+ <span style={…}>` unter dem
    `<th>`. ⚠️ **Das Symptom ist nicht die Meldung, sondern eine Tabelle ohne
    Spaltenüberschriften:** React repariert bis zur ersten Abweichung und verwirft den Rest des
    Teilbaums — nach der Hydration trug **eine** der vier Kopfzellen ihren Text, die anderen drei
    blieben leer. Ohne JavaScript bleiben alle vier leer.
    **Zwei Gegenproben, beide gemessen:** derselbe Titel als **Zeichenkette** steht in beiden
    Stellen und meldet nichts (`cloneElement` greift nur für ein Element); derselbe Titel als
    Element, aber **im Client** erzeugt (`mitKicker` in `core/tabelle/Datentabelle.tsx`), ebenso.
    Der Unterschied ist die RSC-Grenze, nicht die Elementform. **Kein Tor sieht das:**
    `typecheck` kennt `ReactNode` als gültigen `title`, `build` serialisiert ihn klaglos, und
    **Vitest kann die Wirkung strukturell nicht sehen** — unter jsdom gibt es keine RSC-Grenze,
    das Element ist dort gewöhnlich und rendert in beiden Stellen. Dieselbe Lage wie bei den
    Fallen 6 und 7. **Abhilfe:** `title` als Zeichenkette übergeben — `Datentabelle` baut den
    Kicker-`<span>` im Client —, oder die Spalten in eine Client-Insel heben.
    `src/core/tabelle/spaltenkopf.test.ts` riegelt das repo-weit ab.
    **Nicht mit Falle 9 zusammenlegen:** dort verweigert React eine *Funktion* über die Grenze,
    laut und mit Fehlermeldung; hier geht ein *Element* durch und kommt still nur zur Hälfte an.

18. **Die `@page`-Formate hören bei A3/A4/A5 auf — jedes kleinere Schlüsselwort fällt
    STILL heraus** (Modul `lagerbuch`, DRK-312, echter Chromium gegen `page.pdf({
    preferCSSPageSize: true })`, MediaBox aus dem erzeugten PDF gelesen — nicht vermutet):

    ```
    size: A4           → 209,9 × 297,0 mm   erkannt
    size: A5           → 148,2 × 209,9 mm   erkannt
    size: A6/A7/A8     → 215,9 × 279,4 mm   ← Letter, also die Druckervorgabe
    size: 74mm 105mm   →  74,1 × 105,2 mm   erkannt
    ```

    ⚠️ **DAS IST KEINE CHROMIUM-MACKE, UND DER UNTERSCHIED ENTSCHEIDET, WO MAN SUCHT.**
    CSS Paged Media kennt als `<page-size>` genau `A5 | A4 | A3 | B5 | B4 | JIS-B5 | JIS-B4 |
    letter | legal | ledger` — A6, A7 und A8 stehen dort **nicht**. `size: A7` ist also
    ungültiges CSS, und jeder Browser wirft eine ungültige Deklaration weg; Chromium verhält
    sich hier spezifikationstreu. Wer es für eine Engine-Eigenheit hält, wartet auf eine
    Behebung, die nie kommt, oder hofft auf einen anderen Browser.

    ⚠️ **Die Deklaration überlebt nicht einmal das Parsen:** `document.styleSheets` gibt
    `@page { size: A7 }` als `"@page { }"` zurück. Es gibt also nichts, was man zur Laufzeit
    abfragen könnte, und **kein Tor sieht es**: die Datei ist syntaktisch einwandfrei,
    `typecheck` kennt keine Papierformate, `pnpm build` serialisiert sie klaglos, und
    **Vitest kann es strukturell nicht sehen** — jsdom hat keine Seitenaufteilung. Wer `size:
    A7` schreibt, bekommt ein Etikett in der Vorgabegröße des Druckers, und zwar erst auf dem
    Papier. Abhilfe: die Kantenlängen ausschreiben (`74mm 105mm`).

    ⚠️ **Die zweite Hälfte ist teurer, weil sie eine BAUFORM erzwingt: bei GEMISCHTEN
    Seitengrößen verwirft Chromium die CSS-Größe vollständig.** Gemessen: eine A7-Karte und
    ein A4-Bogen im selben Dokument ergaben Letter für **beide** Seiten — nicht etwa je Seite
    die eigene Größe. Eine zweite Druckgröße ist deshalb keine Sektion auf einer bestehenden
    Druckseite, sondern eine **eigene Route**, auf der alles Gedruckte dieselbe Größe trägt.
    Was vorher per `display: none` wegfällt, zählt dabei nicht mit (ebenfalls gemessen) —
    das Bildschirm-Chrome ist also unschädlich, solange es `lb-nichtDrucken` trägt.

    ⚠️ **Eine PORTALIERTE Fläche ist kein Nachfahre — und im Druck kostet sie ein Blatt**
    (Modul-übergreifend, DRK-406, in CI aufgefallen und danach im echten Chromium
    nachgestellt). `SuiteNav` rendert den Navigationsschub mit `forceRender`; antd hängt ihn
    per Portal an `document.body`, also **neben** die Hülle. Jede Druckregel, die unter
    `.druckRahmen …` geschachtelt ist, kann ihn damit grundsätzlich nicht treffen — die Regel
    steht richtig da und greift nur nicht (Falle 5, dritte Ausprägung, in neuem Gewand). Im
    Druck wird aus `position: fixed` ein Kasten in Fenstergröße; er liegt außerhalb jeder
    **benannten** `@page` und damit auf der unbenannten ohne `size`. Gemessen an den
    Ortskarten: `210x297 | 216x279` statt `210x297` — ein leeres Letter-Blatt hinter dem
    A4-Bogen. ⚠️ **Der Anker gehört an die Portalwurzel, und die Regel eine Ebene darüber:**
    `rootClassName` landet auf `.ant-drawer`, aber rc-util legt darum noch einen **nackten
    `div`** an; nur `.ant-drawer` zu verstecken ließ den leeren Wrapper als Kasten im Fluss
    stehen und das Blatt blieb (beides nacheinander gemessen). `body > div:has(> .navSchub)`
    trifft ihn. **Kein Tor sieht das:** das Portal entsteht erst bei der **Hydration**, und
    eine Umgebung ohne sie zeigt die Seite klaglos einseitig — nur ein echter, hydrierter
    Browser kennt die Zahl.

    ⚠️ **Teilt sich ein Stylesheet mehrere Druckflächen, MUSS die Regel benannt sein**
    (`@page a7 { … }` plus `page: a7` am gemeinsamen Vorfahren). `lagerbuch` hat genau ein
    Druck-Stylesheet für drei Flächen (Falle 43 hält das fest); ein unbenanntes `size` hätte
    den A4-Etikettenbogen und die Checklisten still mit auf 74 × 105 mm gestellt. Benannte
    und unbenannte Regel vertragen sich im selben Stylesheet, gemessen.
    `verwaltung/(druck)/ortsetiketten/druck.test.ts` hält die Form fest,
    `e2e/lagerbuch-ortsetiketten.spec.ts` misst die Wirkung — **die Zahl kennt nur ein echter
    Browser**, dieselbe Klasse wie die Fallen 8 und 13.

19. **Eine `.xlsx` gegenzulesen ist zweimal anders, als es aussieht — und beide Male meldet
    sich der Irrtum als etwas ANDERES** (Modul-übergreifend, DRK-186, gegen
    `write-excel-file@4.1.1` und die erzeugten Archive gemessen — nicht vermutet). Seit die
    Suite ihre Reports als Mappe ausgibt, prüft jeder Export-Test eine ZIP-Datei; das
    Harness dafür ist `src/core/export/test-mappe.ts` (eine Stelle, kein zweites erfinden —
    dieselbe Regel wie `qr/_lib/test-dom.tsx`). Wer es umgeht und selbst liest, läuft in
    genau diese zwei:

    **a) Der lokale Dateikopf führt die Größe 0.** `write-excel-file` schreibt STRÖMEND,
    setzt also Bit 3 des Flag-Feldes; gepackte wie ungepackte Größe stehen erst im
    Datendeskriptor HINTER den Daten. Der naheliegende Leser läuft über die lokalen Köpfe
    (`PK\x03\x04`), inflatiert null Bytes und bekommt **„unexpected end of file"** — eine
    Meldung, die nach einer KAPUTTEN DATEI klingt, während die Mappe einwandfrei ist. Der
    Weg, der trägt, ist das zentrale Verzeichnis am Dateiende.

    **b) Eine abschließend leere Zelle steht in der Datei GAR NICHT.** Das ist der
    Unterschied zur CSV, die jede Zeile auf gleiche Feldzahl auffüllt (`a,b,,`): hier endet
    die Zeile nach der letzten gefüllten Zelle. Gemessen an einer Zeile mit leerer
    Schlussspalte: `[5]` statt `[5, null]` — **eine Zusicherung auf die Spaltenzahl fällt,
    obwohl die Mappe richtig ist**, und der Befund liest sich wie „der Export verliert eine
    Spalte". Verschoben ist nichts: jede Zelle nennt ihre Spalte selbst (`r="E2"`). Das
    Harness füllt deshalb auf die Breite der Kopfzeile auf.

    **Kein Tor sieht beides:** `typecheck` prüft gültige Aufrufe, `pnpm build` serialisiert
    klaglos, und `lint` hat damit nichts zu tun. ⚠️ **Anders als die Fallen 8, 13 und 18
    braucht das hier KEINEN echten Browser** — die Bytes entstehen in Node, Vitest sieht
    alles. Wer das verwechselt, verschiebt eine Zusicherung in einen Playwright-Lauf, wo
    sie langsamer und seltener läuft, ohne dass sie dort mehr wüsste.

    ⚠️ **Die dritte Hälfte ist keine Test-, sondern eine Bauformfrage, und sie ist Falle 6 in
    neuem Gewand:** `core/export` hat ZWEI Einstiegspunkte — `server.ts` (Route Handler,
    `write-excel-file/node`, `toBuffer()`) und `client.ts` (Insel, `/browser`, `toFile()`).
    `index.ts` re-exportiert **keinen von beiden**, anders als `core/tabelle/index.ts`. Ein
    Re-Export von `client.ts` reichte seine Funktion als Client-Referenz in jede Server
    Component (Falle 6), ein Re-Export von `server.ts` zöge `node:stream` in jedes
    Client-Bundle. Und die beiden Einstiegspunkte des Pakets tragen **identische Typen**
    (die `.d.ts` sagt das wörtlich) — der falsche Griff ist damit typkorrekt und fällt erst
    zur Laufzeit auf.

20. **Eine eigene CSS-Regel auf einen antd-Klassennamen stirbt beim Major-Upgrade STILL — und ein
    Test, der den REGELTEXT liest, stirbt lautlos mit** (Modul-übergreifend, DRK-190/DRK-191, gegen
    `antd@6.6.2` und `@rc-component/select@1.10.1` gemessen — nicht vermutet). `globals.css` trug
    die einzige bewusst eingegangene Kopplung der Suite an einen antd-internen Klassennamen,
    `:root .ant-select-selector { font-size: 16px }`, samt Kommentar „ein antd-Major könnte ihn
    umbenennen, und der Bruch wäre still". Genau das ist passiert: antd 6 baut das Auswahlfeld aus
    `.ant-select > .ant-select-content > (.ant-select-placeholder, input.ant-select-input)`, die
    alte Klasse rendert nirgends mehr. Die Regel lief ins Leere, **und die 16px-Zusage der Suite sah
    für jedes Auswahlfeld erfüllt aus, ohne es zu sein.**
    ⚠️ **Der Test war dabei schlimmer als kein Test.** `feldschrift.test.ts` regexte über
    `globals.css` und fand die Regel — sie stand ja da. Ein Quelltext-Scan kann strukturell nicht
    sehen, ob der Baum, auf den ein Selektor zielt, überhaupt existiert; er las den Regeltext, nicht
    die Wirkung. Weil dort ein Test stand, hat die Regel über Monate niemand hinterfragt.
    **Abhilfe, und sie kostet keinen Browser:** `renderToString` plus `extractStyle` aus
    `@ant-design/cssinjs` geben Markup UND das für das Suite-Theme tatsächlich erzeugte CSS heraus —
    beides in Vitest, ohne Layout. `core/theme/selektschrift.test.ts` prüft damit, dass die Klasse,
    auf die `globals.css` zielt, wirklich gerendert wird. Wer eine Regel gegen `.ant-*` schreibt,
    schuldet einen solchen Test dazu.
    ⚠️ **Die zweite Hälfte ist die teurere, und sie gilt für jedes antd-Bauteil mit Bediendichte:**
    `.ant-select` trägt **keine `height`**. Es rechnet
    `padding-block = (height − font-height) / 2 − border` und lässt die Zeilenbox den Rest machen.
    Wer `font-size` anhebt, ohne `line-height` und `font-height` mitzuziehen, macht jedes
    Auswahlfeld höher als sein Nachbarfeld (gemessen: 44px → 47,1px); die drei Zahlen hängen über
    `font-height = line-height × font-size` aneinander. **Und der naheliegende Token greift daneben:**
    `components.Select.fontSize` ergibt gemessen `.iuk.ant-select-css-var { --ant-font-size: 16px }`
    — es kapert die GLOBALE Schriftvariable innerhalb des Feldes, statt die des Bauteils zu setzen,
    und lässt die anderen beiden stehen. Deshalb steht hier ausnahmsweise CSS statt eines Tokens,
    entgegen Falle 5.

Dazu: Hell/Dunkel läuft über `<html data-theme>` (Cookie-Umschalter, **nicht**
`prefers-color-scheme`). Der Umschalter hat drei Zustände, und `auto` ist die Vorgabe — deshalb
**zwei** Cookies: `iuk-theme-pref` trägt die Wahl (`auto|light|dark`), `iuk-theme-system` den
zuletzt vom Client beobachteten OS-Wert, weil der Server `prefers-color-scheme` nicht sieht.
`data-theme` trägt **immer** den aufgelösten Wert `light`/`dark`; ein gestempeltes `auto` besteht
`build` und Vitest und kippt trotzdem jede Modulfläche still auf helle Darstellung. Die Regel für
`src/core` lautet: nur was ein **zweites, heute belegbares** Modul braucht.

Ausführliche Referenzentwürfe: `docs/design/feedback-oeffentliche-ansicht.md` (öffentliche, login-freie
Ansichten) und `docs/design/feedback-admin.md` (Admin-Arbeitsseiten).

## Ein neues Modul registrieren — das Dreieck

Ein Modul mit eigener Datenbank braucht **drei** zusammenpassende Einträge, sonst schlägt der Start
fehl: das Migrationsverzeichnis unter `_db/`, der Eintrag in `MODULE_MIGRATIONS` (`core/bootstrap.ts`),
und die `COPY`-Zeile im `Dockerfile`. Fehlt der dritte, läuft es lokal und bricht im Container.

Datenbanken, die **`core` selbst** führt, stehen in **`CORE_MIGRATIONS`** statt in `MODULE_MIGRATIONS`
(heute: `konto`, der Sitzungswiderruf). Das Dreieck gilt dort unverändert und wird von
`bootstrap.test.ts` über **beide** Listen geprüft. Die zweite Liste existiert, weil der Seed-Test unter
`scripts/` für jeden Eintrag in `MODULE_MIGRATIONS` einen lokalen Seed verlangt — und eine geseedete
Widerrufszeile sperrte den Dev-Nutzer aus.

Modul-Metadaten (Auth, Gruppen, Hosts) stehen in `src/core/registry.ts`; pro Modul überschreibbar per
`SUITE_HOST_<KEY>` und `SUITE_ADMIN_GROUP_<KEY>`.

## Zugriffsschutz

`requiresAuth`/`requiredGroups` im Registry gaten den Modulzugang. Für Datenzugriff **innerhalb** eines
Moduls reicht das nicht: die Objekt-Zugehörigkeit muss serverseitig aus der Datenbank aufgelöst werden,
nie aus einem URL-Parameter (sonst IDOR). Vorbild: `assertGroupAccess` im Modul `feedback`.

Module-Admin ist **nicht** `session.user.isAdmin` — das ist suiteweit („ist Betreiber"). Die Frage
„darf diese Person Modul X verwalten?" beantwortet `isModuleAdmin` aus `core/groups`.

**Gruppen im JWT sind nur so frisch wie der letzte erfolgreiche Token-Refresh.** Sie werden beim
Login gesetzt und bei jedem erfolgreichen Refresh aus dem neuen `id_token` nachgezogen
(`core/auth/refresh.ts`) — der Takt ist damit die Access-Token-Lebensdauer von Pocket ID (heute eine
Stunde, Fosite-Default), nicht die Sitzungsdauer (30 Tage). Zwei Folgen für jedes Modul: ein
Gruppenentzug wirkt mit bis zu einer Stunde Verzug, und wo das zu lang ist, muss die Berechtigung
serverseitig aus der Datenbank aufgelöst werden statt aus `session.user.groups`.

Aufgefrischt wird auf dem Proxy-/Middleware-Pfad (`src/proxy.ts`, dessen `matcher` praktisch jede
Anfrage umfasst) und auf `/api/auth/*` — dort kommt das `Set-Cookie` beim Client an —, **nicht** bei
`auth()` aus einer Server Component: next-auth wirft es dort weg, und `core/auth/config.ts` sperrt
den Refresh auf diesem Pfad zusätzlich selbst (`darfSchreiben: request !== undefined`). Grund ist
Pocket IDs Rotation ohne Gnadenfrist: ein verlorenes neues Refresh-Token macht den nächsten Versuch
zur Wiederverwendung und kostet die ganze Sitzung, nicht nur den Refresh.

`src/proxy.ts` **ist** in Next.js 16 die Middleware (Umbenennung von `middleware.ts`) — wer die Datei
unter dem alten Namen sucht und nichts findet, schließt sonst fälschlich, es gäbe keine. Wer die
Auth-Konfiguration zwischen Objekt- und Funktionsform umstellt, muss `proxy.ts` mit anpassen: bei
Funktions-Config liefert `auth(callback)` ein Promise statt einer Funktion, Next verlangt aber eine
aufrufbare Funktion aus `proxy`/`default`. Das Symptom ist HTTP 500 auf jeder Route; `pnpm build`
sieht es nicht. `src/proxy.test.ts` bewacht die heutige Naht (`pnpm vitest run` schlägt dann fehl) —
das gilt nur für ihre heutige Form; ein Umbau von `proxy.ts` schuldet weiterhin einen Lauf von
`pnpm exec playwright test`, das den Ausfall als einziges immer end-to-end sieht.

## Lokale Demodaten

`pnpm seed:lokal [modul …]` füllt alle fünf datenbankgestützten Module (`scripts/seed-lokal.ts`, je
ein `_lib/seedLokal.ts` pro Modul). Idempotent und rein additiv; das Protokoll nennt die erzeugten
Links, Codes und Passwörter.

**Bewusst nicht am Boot-Pfad**, und der Grund ist keine Stilfrage: `shouldSeed()` ist
`SUITE_SEED === "1" || NODE_ENV === "development"`, und `SUITE_SEED=1` ist der **Generalproben**-
Schalter. Der Boot-Seed ist also nicht lokal-only — genau darauf beruhen die zwei ausgeschriebenen
Ausschlüsse in `core/bootstrap.ts` (ein geseedeter files-Abgabelink wäre in einer Generalprobe ein
gültiger anonymer **Schreib**zugang; lagerbuch bekäme über `getModuleDb()` eine Verbindung ohne
`lb_falte`). `scripts/seed-lokal.test.ts` hält beides fest: jedes Modul aus `MODULE_MIGRATIONS`
braucht einen Seed, und ein Quelltext-Scan verbietet die Namen `seedLokal`/`seed-lokal` in
`bootstrap.ts` und `instrumentation.ts` — er fängt die naheliegende Verdrahtung, nicht jede
denkbare (ein umbenanntes Re-Export käme durch).

## Ticket-Board — ClickUp wird während der Arbeit nachgezogen, nicht danach

Die Aufgaben stehen als `DRK-<n>` auf dem Board **„I&K Suite" (`901524923921`)**. Der Stand dort wird
in **drei** Momenten nachgezogen, nicht in einem: `in progress` **beim Start** (mit dem Branchnamen),
ein Kommentar **bei jeder Entscheidung**, die das Ticket unter „Offene Fragen" offen gelassen hat, und
`review` → `Closed` **beim Abschluss** — `Closed` erst nach dem Merge, denn der Stand auf `main` ist
der Beweis, ein grüner Branch eine Behauptung. Ein Board, das erst beim Schließen erfährt, was
passiert ist, ist für jeden außer dem Schreibenden wertlos; eine still getroffene Annahme zu einer
offenen Frage fällt erst bei der Abnahme auf, wenn sie am teuersten ist.

Die Ticketnummer steht im **Commit-Body**, nicht in der Kopfzeile — die trägt den Typ, und der ist
die Versionsnummer (s. u.). Einen Fund, der nicht zum Auftrag gehört, trägt ein **neues Ticket** in
derselben Liste, kein `TODO` im Quelltext und keine stille Ausweitung des laufenden PRs.

Das Kleingedruckte — Statusnamen in ihrer gemischten Schreibweise, `include: ["description"]` beim
Lesen (sonst fehlen Akzeptanzkriterien und offene Fragen), die abgekündigten Werkzeugnamen — steht im
Skill `.claude/skills/clickup/SKILL.md`.

## Release Notes — für Anwender, nur im Portal

**Die meisten Änderungen bekommen keine Notiz.** Das ist die erste Regel, nicht die letzte:
die Notizen sind das einzige, was die Suite von sich aus an ihre Anwender schreibt, und eine
Liste, in der alles steht, liest niemand. Die Probe ist nicht „hat sich etwas geändert?",
sondern: **Würde jemand ohne diese Notiz fragen — oder etwas suchen, das nicht mehr da ist?**

| Notiz | Keine Notiz |
| --- | --- |
| Etwas geht, das vorher nicht ging | Ein Fehler ist behoben, den kaum jemand gemeldet hat |
| Ein Weg oder ein Ort ändert sich | Eine Beschriftung, eine Farbe, ein Abstand, ein Zahlenformat |
| Etwas verschwindet oder pausiert | Etwas ist schneller oder stabiler geworden |
| Ein Name ändert sich | Umbauten unter der Haube, Tests, CI, Abhängigkeiten |
| Eine Einschränkung, die man kennen muss | Eine Fläche sieht aufgeräumter aus als gestern |

Im Zweifel: **keine Notiz.** Eine ausgelassene Kleinigkeit merkt niemand; eine Liste voller
Kleinigkeiten kostet die Glaubwürdigkeit der Einträge, die zählen. Nicht verhandelbar sind
nur **ein neues Feature** und **eine Änderung, nach der jemand vergeblich sucht** — für beide
gehört die Notiz in denselben Commit wie die Änderung, denn nachgetragen wird sie nicht.

**Ein Absatz. Ein bis drei Sätze.** Das ist der Normalfall, nicht das Minimum. Ein neues
Feature darf einen zweiten Absatz haben; **drei Blöcke sind die harte Obergrenze** und kein
Ziel. Die Zahlen stehen in `NOTIZ_GRENZEN` (`typen.ts`) und werden von `register.test.ts`
geprüft — 3 Blöcke, 320 Zeichen je Block, 640 Zeichen gesamt, 60 Zeichen im Titel. Wer an
eine Grenze stößt, hat fast nie eine zu lange Notiz, sondern **zwei Änderungen in einer
Datei**; dann sind es zwei Notizen.

**Was fast immer wegfällt**, wenn eine Notiz zu lang ist: die Begründung der Entscheidung
(„das ist nicht derselbe Weg mit einem zweiten Knopf …"), die Vorgeschichte („bisher musstest
du …" — ein Halbsatz reicht, wenn überhaupt), die Beruhigung („deine Daten bleiben
selbstverständlich erhalten") und die Aufzählung der Nebenwirkungen. Was gleich bleibt,
schreibst du nur hin, wenn die Änderung so aussieht, als nähme sie etwas weg.

**Eine Datei je Notiz**, `src/app/m/portal/_lib/neuigkeiten/notizen/<modul>/<YYYY-MM-DD>-<slug>.ts`,
plus **eine Zeile in `register.ts`**. Das Dreieck ist Dateiname ↔ Felder (`modul`, `datum`, `slug`) ↔
Registerzeile; `register.test.ts` liest das Verzeichnis und hält alle drei zusammen — eine nicht
eingetragene Notiz ist ein roter Test und keine stille Auslassung. Kein Markdown, kein `fs`, keine
Datenbank: die Notiz ist ein importiertes Modul und liegt im Bundle (Begründung im Kopf von
`typen.ts`, kurz: alles andere kostet eine `COPY`-Zeile im `Dockerfile`, die zu vergessen still ist).
`datum` ist der Tag des **Rollouts**, nicht des Commits.

**Sichtbar ausschließlich im Portal**, unter `/neuigkeiten`. Kein Modul importiert
`portal/_lib/neuigkeiten` — auch dafür gibt es einen Quelltext-Scan in `register.test.ts`, weil ein
`import` diese Regel bricht, ohne dass ein Tor rot wird. **Wer eine Notiz sieht, entscheidet die
Kachelliste**: sichtbar sind die Apps aus `visibleSwitcherModules`, keine zweite Rechteprüfung
daneben. Modultitel und Zeichen stehen in `core/registry.ts` und werden in der Notiz **nicht**
wiederholt.

**Der Stil ist verbindlich, nicht empfohlen:**

* **Für Anwender.** Kein Dateiname, kein Funktionsname, keine Versionsnummer, kein Commit, kein
  Ticket, kein Framework. Wenn ein Satz nur mit Kenntnis des Quelltextes verständlich ist, gehört er
  nicht hinein.
* **Du-Form, Präsens, aktiv** — wie der Rest der Oberfläche.
* **Der erste Satz sagt, was jetzt anders ist.** Der erste Absatz ist zugleich die Zusammenfassung;
  ein Teaser-Feld gibt es deshalb nicht. Kein „In diesem Release", kein „Wir freuen uns".
* **Nenne den Weg mit den Wörtern, die auf dem Bildschirm stehen** („Verwaltung → Checklisten",
  „Von allen Geräten abmelden"). Eine Notiz, nach der man suchen muss, hat ihre Aufgabe verfehlt.
* **Kein Adjektiv statt einer Aussage.** Verboten sind Werbewörter (nahtlos, intuitiv,
  leistungsstark, ab sofort noch besser), Ausrufezeichen und Emoji — `register.test.ts` prüft die
  häufigsten.
* **Höchstens ein `hinweis` je Notiz, und nur wenn der Leser wirklich etwas tun muss.** Ein
  Hinweis ist eine Aufforderung, keine Auskunft. Zwei Aufforderungen heißen: zwei Notizen.
* **Der Titel ist eine Aussage** („Fahrzeug-Checklisten als PDF"), kein Etikett („Neues Feature:
  PDF-Export"), und wiederholt den App-Namen nicht.
* **Kein Markdown im Text.** Er wird als Textknoten gerendert; `**fett**` käme mit Sternchen auf dem
  Bildschirm an. Auch das prüft `register.test.ts`.

## Versionsnummern — aus der Historie, nicht aus einer Datei

Jeder Stand auf `main` bekommt automatisch eine Nummer `X.Y.Z`, einen Tag `vX.Y.Z`, ein
GitHub-Release und ein Image-Tag `:X.Y.Z` (Runbook: `docs/runbooks/versionierung.md`).
`scripts/version.mjs` rechnet sie aus der First-Parent-Kette seit dem letzten Tag: **jeder
Merge auf `main` ist ein Sprung**, und der Typ der Commit-Kopfzeilen entscheidet — `feat!`
oder `BREAKING CHANGE:` Major, `feat` Minor, alles andere Patch. **Der Commit-Präfix ist
damit keine Stilfrage mehr:** ein `feat`, das als `fix` eingecheckt wird, ergibt eine zu
kleine Nummer, und kein Tor meldet das.

`package.json` bleibt auf seiner alten Nummer und ist nicht die Quelle der Wahrheit; es gibt
keinen Bot-Commit. Die Nummer wandert wie die Revision als Build-Arg ins Image
(`SUITE_VERSION`, `laufendeVersion()` in `core/version.ts`) und steht auf
`/api/health/<modul>` und im Profil unter „Diese Suite". Der Rollout beweist weiterhin über
die Revision. In Anwender-Notizen kommt die Nummer nicht vor. `scripts/deploy.test.ts` und
`scripts/version.test.ts` halten die Kette zusammen.

## Cutover einer Alt-Anwendung

Runbooks liegen in `docs/runbooks/`. Muster: Generalprobe mit Snapshot-Kopie → Freeze → echter Snapshot
→ Volume sichern → Import mit Paritätscheck → Verifikation gegen einen ephemeren Container ohne
Traefik-Labels → Router umschwenken (nie zwei Router gleichzeitig aktiv) → 2 Wochen Standby.

**Paritätscheck beweist den Datenbank-Rundlauf, nicht die Richtigkeit der Feldzuordnung.** Ein
konsistenter Mapping-Fehler ist paritätsgrün. Deshalb zusätzlich feldweise Stichproben gegen die
Alt-Anwendung.

## Kommentaranker — ein Name hält, eine Zeilennummer wandert

Die Suite begründet in Kommentaren und verankert die Begründung an ihrer Quelle. **6027 solcher
`datei:zeile`-Anker stehen im Repo** (gemessen 16.09.2026; `m/radio` 4253, `m/lagerbuch` 640 in 178
Dateien) — sie sind ein tragender Teil des Gedächtnisses, und sie sind die häufigste Einzelursache
für Fehlschlüsse bei einem Rotlauf. Ein Anker, der die Aussage nicht mehr deckt, kostet doppelt:
erst sucht jemand an der falschen Stelle, dann hält er die Zusicherung für ungedeckt und
„repariert" sie, indem er sie streicht. Zwei Regeln, beide billig:

1. **Ein Anker in dieses Repo nennt einen NAMEN, keine Zeile.** Zusicherungs-, Symbol- oder
   Selektorname — `_db/schema.ts`, Feld `lastUsedAt` statt `_db/schema.ts:412-413`. Eine
   Zeilennummer wandert bei jeder Einfügung darüber, und **kein Tor sieht das**: sie steht in
   einem Kommentar, den `typecheck` nicht liest, `lint` nicht kennt und `build` klaglos
   mitserialisiert. Gemessen an genau diesem Beispiel: `lastUsedAt` steht heute auf `:538-540`,
   auf `:412` steht eine Trigger-Begründung — der Anker zeigte auf eine Aussage über etwas
   anderes.
2. **Ein Anker in die ALT-ANWENDUNG nennt das Repository mit** — `lagerbuch/src/app/globals.css:277`,
   nie nacktes `globals.css:277`. Dort ist die Zeilennummer richtig und stabil (das Repo ist
   eingefroren); ambig ist der **Dateiname**. ⚠️ Dieser Fall hat schon einmal zugeschlagen: in
   `m/radio` stand, die `lagerbuch`-Anker auf `globals.css:277` seien „veraltet (`globals.css` hat
   231 Zeilen)". Der nackte Anker hatte sich gegen die gleichnamige Datei **dieses** Repos auflösen
   lassen, und aus einer richtigen Herkunftsmarke wurde eine falsche Fehlmeldung.

**Findest du einen veralteten Anker, ziehst du den ANKER nach — nie die Zusicherung.** Der Anker
ist veraltet, nicht die Aussage.

⚠️ **Und wer Kommentare aufräumt, hält die ZEILENZAHL der Datei** — das ist der Teil, den man erst
merkt, wenn er weh tut. Gemessen an diesem PR: ein erster Wurf hat dieselben Kommentare nur sauber
umgebrochen, dabei 27 Zeilen eingefügt und damit **29 fremde Anker aus vier anderen Dateien
veraltet** — ein Kommentar-Fix, der die Fehlerklasse vervielfacht, die er beheben soll. Zeilenzahl-
neutral formuliert (kürzer, nicht länger) kostet er nichts. Prüfen lässt sich das in einem Zug:
`for f in $(git diff --name-only); do echo "$(( $(wc -l < "$f") - $(git show HEAD:"$f" | wc -l) ))
$f"; done`.

`src/core/kommentaranker.test.ts` riegelt die beweisbare Hälfte repo-weit ab: ein Anker, der sich
gegen eine Datei dieses Repos auflösen lässt, muss auf eine Zeile zeigen, die es dort gibt. Er ist
ein **Boden, keine Decke** — Drift *innerhalb* einer Datei sieht er nicht, und Anker in die
Alt-Anwendung oder in Fremdpakete kann er nicht prüfen. `docs/` steht bewusst außerhalb: Berichte
halten einen vergangenen Stand fest und sollen gerade nicht mitwandern.

Die **andere** Hälfte — Drift *innerhalb* einer Datei — meldet `pnpm anker:drift [pfad]` (DRK-204).
Es ist der Prüflauf von Hand, ausgeführt statt beschrieben: über `git blame` den Commit finden, der
die Ankerzeile schrieb, und die zitierte Spanne dort gegen `HEAD` halten. **Bewusst kein Tor** —
gemessen stehen 4214 Zeilenanker in `m/radio` und 595 in `m/lagerbuch`, ein hartes Tor wäre am
ersten Tag rot und würde abgeschaltet statt gelesen. Ein Treffer ist ein **Verdacht, kein Urteil**:
der Anker darf mitgewandert sein, wenn jemand ihn nachgezogen hat. Erster Lauf über `m/lagerbuch`:
97 Verdachte aus 347 vergleichbaren Ankern. Die Abhilfe ist nie die neue Zahl, sondern die
Namensform.

## Tests

`pnpm typecheck` · `pnpm lint` (Fehler blockieren die CI, Warnungen nicht) · `pnpm vitest run` ·
`pnpm build` · `pnpm exec playwright test`.

⚠️ **`typecheck` läuft mit `--pretty false`, und das ist kein Geschmack.** RTKs tsc-Filter
(gemessen an 0.45.0) meldet `TypeScript: No errors found`, wenn tsc seine pretty-Form ausgibt — und
die wählt tsc in jeder TTY selbst. Das Flag macht die Ausgabe formatstabil. Der zweite Stolperstein
ist pnpms eigene farbige Kopfzeile; dagegen steht `NO_COLOR=1` in Claude Codes `env`. **Wer das Tor
außerhalb dieser Umgebung fährt, prüft den Exit-Code** — nicht die Meldung, und niemals mit
`grep "error TS"` auf farbigem Output (dort steht eine ANSI-Sequenz zwischen `error` und `TS`, und
`grep` zählt 0). Hintergrund: NT7 in
`docs/superpowers/plans/2026-08-18-radio-ausfuehrungsplan.md`.

Für DOM-Verhalten gibt es ein etabliertes Harness: `src/app/m/qr/_lib/test-dom.tsx`
(`mount`/`fill`/`click`/`query`/`submitForm`) — kein zweites erfinden.

**E2E-Ports gehören der Arbeitskopie** (DRK-346, `e2e/helpers/ports.ts`): Hauptcheckout und CI
fahren 3100/3101/3102/3310, jeder Worktree einen festen Block aus seinem Pfad (4100–4990, +1 PWA,
+2 Rückmeldung, +3 Fake-clamd). In Specs steht deshalb nie ein Portliteral, sondern `E2E_PORT` bzw.
`E2E_PORTS` aus `./fixtures`. Ist ein Port belegt, bricht die Konfiguration mit PID und
**Arbeitsverzeichnis** des Halters ab — steht dort „FREMDE Arbeitskopie", **nicht beenden**, sondern
warten oder `E2E_PORT=<web-port>` setzen (Ausweg auch, wenn zwei Worktrees im selben Block landen).

**Cloud-Sessions (Claude Code on the web) haben kein `git-lfs`** (DRK-368): der frische Klon trägt
unter `public/` Zeigerdateien, und `src/lfs-medien.test.ts` ist rot, **ohne dass deine Änderung
etwas damit zu tun hat**. Abhilfe ist `scripts/cloud-lfs.sh` (installiert git-lfs, holt die
Medien, ~4 s) — nie den Wächter überspringen, er verhindert das Ausliefern von Zeigerdateien.
Ist er trotzdem rot, lief das Skript nicht; seine Meldung steht am Sitzungsanfang.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
