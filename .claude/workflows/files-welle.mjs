export const meta = {
  name: 'files-welle',
  description: 'Setzt eine Welle des files-Task-Plans um: TDD pro Task, Review pro Task, Gates am Ende',
  phases: [
    { title: 'Vorklärung', detail: 'Blocker-Markierungen gemäß Betreiberentscheidung auflösen (nur Welle 1)' },
    { title: 'Umsetzung', detail: 'ein Agent je Task, Test zuerst' },
    { title: 'Task-Review', detail: 'je Task ein unabhängiger Reviewer auf dem Diff' },
    { title: 'Nachbesserung', detail: 'bestätigte Review-Befunde beheben' },
    { title: 'Gates', detail: 'typecheck, lint, vitest, build, ggf. playwright' },
  ],
}

const W = '/Users/rubeen/dev/personal/drk'
const SUITE = `${W}/iuk-suite`
const SPEC = `${SUITE}/docs/superpowers/specs/2026-07-30-files-modul-design.md`
const PLAN = `${SUITE}/docs/superpowers/plans/2026-07-30-files-modul.md`
const ANALYSE = `${SUITE}/docs/files-portierung-analyse.md`

/*
 * `args` kommt in dieser Umgebung als STRING an, nicht als Objekt — `args.tasks`
 * ist dann `undefined` und die Defaults greifen STILL. Genau das ist am
 * 2026-07-30 passiert: der Lauf sollte Welle 2 bauen und hat Welle 1 wiederholt,
 * 18 Agenten auf bereits committeten Tasks. Kein Fehler, keine Warnung, nur eine
 * falsche Welle. Deshalb hier parsen statt zugreifen — und KEINE Task-Defaults:
 * eine vergessene Task-Liste muss abbrechen, nicht heimlich Welle 1 bauen.
 */
const EIN = typeof args === 'string' ? JSON.parse(args) : (args ?? {})
/*
 * Entweder EINE Welle (`tasks`) oder MEHRERE sequenziell (`wellen`). Mehrere
 * lohnen, weil zwischen zwei Wellen sonst ein Mensch wartet; die Reihenfolge
 * bleibt strikt, und ein rotes Gate bricht ab statt auf rotem Fundament
 * weiterzubauen.
 */
const WELLEN = Array.isArray(EIN.wellen)
  ? EIN.wellen
  : [{ nummer: EIN.welle ?? '?', tasks: EIN.tasks, playwright: EIN.playwright }]
if (!WELLEN.length || WELLEN.some((w) => !Array.isArray(w.tasks) || !w.tasks.length)) {
  throw new Error(
    `Keine Task-Liste in args (bekommen: ${typeof args} ${JSON.stringify(args)?.slice(0, 160)}). ` +
      `Aufruf: {"wellen": [{"nummer": 3, "tasks": ["T10","T11"], "playwright": false}, …]}`,
  )
}
const MIT_VORKLAERUNG = EIN.vorklaerung ?? false

const BASIS = `
PROJEKT: iuk-suite (${SUITE}), Branch \`feat/files-modul\`. Next.js 16 App Router/RSC · Ant Design 6 ·
Drizzle + better-sqlite3 · Auth.js v5 · Vitest + Playwright. Eine SQLite-DB pro Modul.

DU BAUST AM MODUL \`files\` (Phase 4 der Konsolidierung: ersetzt \`${W}/easy-filesharing\` und
\`${W}/drop\`).

PFLICHTLEKTÜRE, IN DIESER REIHENFOLGE:
1. \`${SUITE}/CLAUDE.md\` — die SIEBEN Fallen, die \`pnpm build\` NICHT findet. Sie kosten je einen
   halben Tag. Besonders: antd-Compound-Zugriff in Server Components → HTTP 500; ein WERT-Import aus
   einem \`"use client"\`-Modul in eine Server Component → HTTP 500, den kein Gate sieht;
   \`size="large"\` ist 72px (nicht setzen); Spezifität gegen antd-CSS.
2. \`${SUITE}/docs/design/README.md\` — Querschnittsregeln: 768px als EINZIGER Breakpoint (CSS-Media-
   Query, nie \`Grid.useBreakpoint\`), 44px-Trefferflächen, 16px-Untergrenze für Eingaben, die
   Prüffragen für jede Ansicht (jede Action braucht einen Einstiegspunkt — und kein Einstiegspunkt
   darf in ein \`notFound()\` führen), core-Regel "ein zweiter, heute belegbarer Nutznießer".
   BAUST DU OBERFLÄCHE, kommen die beiden Referenzentwürfe dazu — sie zeigen die Regeln angewandt,
   und Abweichen von ihnen ist begründungspflichtig: \`docs/design/feedback-oeffentliche-ansicht.md\`
   für login-freie Ansichten (\`/s/<id>\`, \`/u/<token>\`), \`docs/design/feedback-admin.md\` für
   Arbeitsseiten hinter der Anmeldung (alles unter \`(verwaltung)\`).
3. \`${SPEC}\` — die Spec. Sie ist verbindlich.
4. \`${PLAN}\` — der Task-Plan. DEIN TASK STEHT DORT.
5. Bei Fragen zum Altverhalten: \`${ANALYSE}\` (2383 Zeilen, geprüfte Faktenbasis mit Belegen).
6. \`${SUITE}/docs/UEBERGABE-files-modul.md\` — die Fallen, die die Wellen 1–4 Zeit gekostet haben.
   Sie stehen NICHT in CLAUDE.md, und die Byte-Wege dieser Welle treffen sie der Reihe nach:
   - **Zeitstempel sind Unix-SEKUNDEN** (\`mode: "timestamp"\`), nicht Millisekunden wie im Modul
     \`qr\`. Ein Faktor-1000-Fehler wäre paritätsgrün und fällt in keinem Test auf, der nur sich
     selbst liest.
   - **Die Einheit gehört in den NAMEN**, nicht in einen Kommentar: es gibt vier Größenlimits an vier
     Orten in drei Einheiten, mit zwei trügerischen Paaren — beide „500" unterscheiden sich um den
     Faktor 1,048576 (MiB gegen MB), beide „100" um 4.857.600 Byte (clamd 100 MiB gegen
     Cloudflare 100 MB).
   - **Drei Kappungsebenen für Uploads**, jede mit anderem Symptom: Server Actions 1 MB (HTTP 413),
     Next-Proxy 10 MiB (**still, kein Fehler**), Cloudflare Free 100 MB (Fehler vom Edge, **kein
     Container-Log**). Der Chunk-Weg umgeht alle drei — wer ihn umgeht, misst die stille Ebene nie.
   - \`_lib/av.ts\` importiert \`node:net\`. Ein \`"use client"\`-Import von dort zöge \`node:net\`
     ins Client-Bundle.
   - Ein **Icon-Name muss Schlüssel der \`ICONS\`-Map** aus \`core/shell/icons.ts\` sein, nicht bloß
     ein existierender \`@ant-design/icons\`-Name — sonst fällt der Eintrag **still** auf
     \`AppstoreOutlined\` zurück.
   - **Playwright nicht laufen lassen, während du Dateien editierst**: HMR zieht die Änderung mitten
     in den Lauf und erzeugt Fehlschläge, die niemand reproduzieren kann.
   - \`rtk pnpm …\` kann an einem corepack-Deps-Check scheitern, obwohl das Kommando in Ordnung ist —
     dann direkt \`pnpm …\`.

TESTHARNESS: Für DOM-Verhalten gibt es \`${SUITE}/src/app/m/qr/_lib/test-dom.tsx\`
(\`mount\`/\`fill\`/\`click\`/\`query\`/\`submitForm\`) — KEIN zweites erfinden.

ARBEITSREGELN — sie gelten ohne Ausnahme:
- **TDD: der Test kommt zuerst.** Schreibe ihn, führe ihn aus, SIEH IHN ROT, dann baue. Ein Test, der
  von Anfang an grün ist, prüft nichts — dann ist der Test falsch, nicht der Code.
- **Falsifiziere deinen Test per Mutation:** kippe eine Konstante, entferne einen Guard, ignoriere
  einen Parameter — wird der Test rot? Wenn nicht, besitzt er seine Aussage nicht. Im qr-Modul blieb
  eine Suite 5/5 grün, während Level H→M und margin 4→0 gedreht wurden.
- **Fasse NUR die Dateien an, die dein Task nennt.** Andere Agenten arbeiten gleichzeitig an anderen
  Dateien desselben Arbeitsbaums. Brauchst du eine Änderung außerhalb deiner Liste, BAUE SIE NICHT —
  melde sie als \`fremde_datei_noetig\`.
- **Kein \`git commit\`, kein \`git add\`, kein Branch-Wechsel.** Das macht der Koordinator nach der Welle.
- **Sicherungskopien NIEMALS nach \`/tmp\`, sondern ins Session-Scratchpad.** In Welle 5 haben zwei
  Agenten unabhängig \`/tmp/route.orig.ts\` benutzt — bei zehn gleichzeitigen Agenten ist der Name
  besetzt, und zweimal landete danach der Inhalt einer FREMDEN Datei in der eigenen. Das ist
  typecheck- und lint-grün, solange beide Dateien für sich übersetzen; gemerkt haben es beide nur an
  reihenweise fallenden Tests. Nimm das **Session-Scratchpad** mit einem Namen, der DEINEN Task
  trägt.
- **\`git checkout -- <datei>\` ist als Rücknahme einer Mutation FALSCH.** Es stellt den Stand von
  HEAD her — und der kennt deine eigene, noch uncommittete Arbeit nicht. Ein Agent hat sich damit in
  Welle 6a seine fertige Implementierung gelöscht und neu schreiben müssen; bei einer NEUEN Datei
  hätte es gar nichts wiederhergestellt. Sichere vor der ersten Mutation einmal ins Scratchpad und
  spiele von dort zurück, mit \`diff\` als Beleg, dass die Datei unversehrt ist.
- **Keine Installationen** (\`pnpm add\`, \`npm i\`): fehlt eine Abhängigkeit, melde sie.
- Deutsch für Kommentare, Testnamen und Meldungen; Bezeichner im Original. Kommentare erklären das
  WARUM (was der Code nicht selbst sagt), nicht das WAS.
- Wo dein Task eine Route berührt: sie muss tatsächlich ABGERUFEN worden sein (\`pnpm dev\` + curl
  oder ein e2e), nicht nur gebaut. Die antd-RSC-Falle liefert HTTP 500, das \`pnpm build\` nicht sieht.
- **Zum Abruf gehört \`pnpm dev:av\`** (Fake-Scanner auf 127.0.0.1:3310, worauf \`.env.local\` zeigt).
  Ohne antwortenden Scanner greift fail-closed (§6.3): jeder Upload bleibt auf „wird geprüft", jeder
  Download antwortet 403 — RICHTIGES Verhalten, das wie ein kaputtes Modul aussieht. Wer das für
  einen Fehler hält, repariert eine Zusage weg.
- **Port 3000 gehört dir nicht allein**: zehn andere Agenten arbeiten gleichzeitig. Läuft dort schon
  ein Server, benutze ihn oder nimm einen freien Port (\`next dev -p <frei>\`) — und fahre ihn danach
  wieder herunter.
`

const UMSETZUNG_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'zusage_erfuellt', 'dateien', 'tests', 'mutation_geprueft', 'offen'],
  properties: {
    task: { type: 'string' },
    zusage_erfuellt: { type: 'boolean' },
    dateien: { type: 'array', items: { type: 'string' } },
    tests: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'war_zuerst_rot'],
        properties: { name: { type: 'string' }, war_zuerst_rot: { type: 'boolean' } },
      },
    },
    mutation_geprueft: { type: 'string', description: 'welche Mutation den Test rot gemacht hat' },
    offen: { type: 'array', items: { type: 'string' } },
    fremde_datei_noetig: { type: 'array', items: { type: 'string' } },
    abweichung_vom_plan: { type: 'string' },
  },
}

const REVIEW_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['task', 'befunde', 'urteil'],
  properties: {
    task: { type: 'string' },
    befunde: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['schwere', 'stelle', 'befund', 'fix'],
        properties: {
          schwere: { type: 'string', enum: ['blocker', 'wichtig', 'klein'] },
          stelle: { type: 'string' },
          befund: { type: 'string' },
          fix: { type: 'string' },
        },
      },
    },
    urteil: { type: 'string', enum: ['abnehmbar', 'nachbessern'] },
  },
}

async function mitWiederholung(erzeuge, versuche = 3) {
  for (let v = 1; v <= versuche; v++) {
    const e = await erzeuge(v)
    if (e) return e
    log(`Versuch ${v}/${versuche} fehlgeschlagen — wiederhole`)
  }
  return null
}

// ------------------------------------------------------- Vorklärung (nur Welle 1)

if (MIT_VORKLAERUNG) {
  phase('Vorklärung')
  await mitWiederholung(() =>
    agent(
      `${BASIS}

DU KORRIGIERST EINE FEHLEINSCHÄTZUNG IN SPEC UND PLAN, BEVOR GEBAUT WIRD.

Die Spec markiert in §13 fünf Punkte als "BLOCKIERT BAU (Betreiber)". Der Betreiber hat aber am
30.07. ausdrücklich entschieden: **Betriebswerte und der Prod-Dump gehören ins RUNBOOK, dort kümmert
sich der Integrations-Agent darum.** Damit blockieren diese Punkte den DEPLOY, nicht den BAU — und
genau so müssen sie im Dokument stehen. Ändere das mit Edit:

1. **\`FILES_MAX_DATEI_BYTES\` und \`FILES_MAX_ABLAUF_TAGE\`:** Der Boot-Abbruch bei fehlendem Wert
   BLEIBT (das ist das Suite-Muster: Fehlkonfiguration bricht den Boot ab). Aber er blockiert nicht
   den Bau — Tests setzen ihre Werte selbst. Stufe die Punkte auf "Runbook-Eingabe, blockiert den
   Deploy" herunter und nenne die **belegten Alt-Defaults** als Ausgangswert für das Runbook:
   \`MAX_FILE_SIZE_MB=500\` (\`drop/.env.example:7\`, Code-Default \`drop/src/config.js:32\`),
   \`MAX_FILE_SIZE=524288000\` = 500 MiB (\`easy-filesharing/.env:16\`), \`MAX_EXPIRY_DAYS=7\`
   (\`easy-filesharing/.env:17\`). Das sind keine erfundenen Zahlen, sondern dokumentierte
   Alt-Defaults — als solche kennzeichnen, mit dem Vermerk, dass der Server-Wert abweichen kann.
2. **\`ALLOWED_MIME\`:** ebenso. Die Liste aus \`drop/.env.example:8\` ist die dokumentierte
   Vorbelegung (image/jpeg, image/png, image/webp, application/pdf, die zwei OOXML-Typen, text/plain).
   Prüfe zusätzlich \`defaultAllowedMime\` in \`drop/src/config.js\` und nimm den Code-Default, falls
   er abweicht. Beachte: ob \`text/plain\` drin ist, entscheidet laut Analyse über einen
   busboy-Default-Bypass — dieser Zusammenhang muss an der Stelle stehen.
3. **clamav-Architektur — DAS ist der einzige echte Bau-Blocker, und er ist lösbar:**
   \`clamav/clamav:1.4\` hat nur ein linux/amd64-Manifest. Die Entwicklungsmaschine ist ein arm64-Mac,
   dort können die Socket-Tests damit nicht laufen. Lege fest: für Entwicklung und CI die
   multi-arch-fähige **\`-debian\`-Variante**, für Produktion im Runbook prüfen, welche am Zielhost
   passt (das Image ist eine \`.env\`-/Compose-Variable, kein Code). Trage das in die Spec ein, wo der
   Sidecar beschrieben ist, und in den Plan bei den AV-Tasks.
4. **Kategorie-Verzeichnisse:** kein Bau-Blocker. Die Spec sagt selbst, dass die Anzeige unbekannte
   Werte toleriert und der Verzeichnisname der Quelle maßgeblich ist. Stufe die Frage auf
   "Runbook / Spec 2" herunter; nimm die im drop-Code belegten Kategorien als Vorbelegung, falls es
   dort welche gibt.
5. Prüfe zum Schluss, ob irgendein TASK im Plan auf einer dieser Markierungen als "blockiert"
   aufsetzt — und löse die Blockade dort mit.

Melde, was du geändert hast. Ändere NICHTS an den fachlichen Festlegungen der Spec.`,
      {
        label: 'vorklaerung:blocker',
        phase: 'Vorklärung',
        schema: {
          type: 'object',
          additionalProperties: false,
          required: ['geaendert', 'echte_bau_blocker_verbleibend'],
          properties: {
            geaendert: { type: 'array', items: { type: 'string' } },
            echte_bau_blocker_verbleibend: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    ),
  )
}

// ------------------------------------------------------- Umsetzung + Review

const ALLE = []

for (const w of WELLEN) {
const WELLE = w.nummer
const TASKS = w.tasks
const MIT_PLAYWRIGHT = w.playwright ?? true

phase(`W${WELLE} Umsetzung`)
log(`Welle ${WELLE}: ${TASKS.length} Tasks (${TASKS.join(', ')})`)

const ergebnisse = await pipeline(
  TASKS,
  (t) =>
    mitWiederholung(() =>
      agent(
        `${BASIS}\n\nDEIN TASK IST **${t}** aus \`${PLAN}\`.\n\n` +
          `Lies den Task vollständig, dann die Spec-Abschnitte, auf die er sich bezieht. Baue ihn ` +
          `nach den Arbeitsregeln oben: Test zuerst, rot sehen, bauen, grün sehen, Mutation prüfen.\n\n` +
          `Führe am Ende für deine Dateien aus, was greifbar ist: \`pnpm vitest run <deine Testdatei>\` ` +
          `und \`pnpm typecheck\`. Läuft etwas anderes rot, das NICHT dir gehört, melde es unter ` +
          `\`offen\` statt es zu reparieren — ein anderer Agent baut gerade daran.`,
        { label: `bau:${t}`, phase: 'Umsetzung', schema: UMSETZUNG_SCHEMA },
      ),
    ),
  (umsetzung, t) => {
    if (!umsetzung) return null
    return mitWiederholung(() =>
      agent(
        `${BASIS}\n\nDU REVIEWST **${t}**. Du hast ihn nicht gebaut, du prüfst ihn.\n\n` +
          `Der Umsetzer meldet diese Dateien: ${JSON.stringify(umsetzung.dateien)}\n` +
          `Seine Tests: ${JSON.stringify(umsetzung.tests)}\n` +
          `Seine Mutationsprobe: ${umsetzung.mutation_geprueft}\n\n` +
          `Sieh dir den Diff an (\`git diff -- <dateien>\` und \`git status\` für neue Dateien) und ` +
          `prüfe gegen den Task in \`${PLAN}\` und die Spec:\n` +
          `1. **Ist die Zusage des Tasks wirklich eingelöst** — oder nur teilweise?\n` +
          `2. **Besitzen die Tests ihre Aussagen?** Führe die Mutationsprobe SELBST aus: kippe eine ` +
          `   Konstante oder entferne einen Guard im neuen Code und lasse die Tests laufen. Bleiben ` +
          `   sie grün, ist der Test wertlos — DAS ist ein Blocker. Stelle die Mutation danach zurück.\n` +
          `3. **Sind die sieben Fallen aus CLAUDE.md vermieden?** Insbesondere: greift eine Server ` +
          `   Component auf \`X.Y\` eines antd-Imports zu? Importiert eine Server Component einen ` +
          `   WERT aus einem \`"use client"\`-Modul?\n` +
          `4. **Silent failures:** wird irgendwo ein Fehler geschluckt, ein Fallback still genommen, ` +
          `   ein Promise nicht abgewartet? Bei Datei- und Socket-Wegen ist das die teuerste Klasse.\n` +
          `5. **Hat der Code Wege, die niemand erreicht** (Action ohne Einstiegspunkt) oder ` +
          `   Einstiegspunkte, die in ein \`notFound()\` führen?\n` +
          `6. Wurden Dateien außerhalb der Task-Liste angefasst?\n\n` +
          `Melde nur, was du BELEGEN kannst. Kein Stilgeschmack.`,
        { label: `review:${t}`, phase: 'Task-Review', schema: REVIEW_SCHEMA },
      ),
    ).then((review) => ({ task: t, umsetzung, review }))
  },
)

const gueltig = ergebnisse.filter(Boolean)
const nachzubessern = gueltig.filter((g) => g.review?.urteil === 'nachbessern')
log(`Reviews: ${gueltig.length - nachzubessern.length} abnehmbar, ${nachzubessern.length} nachzubessern`)

// ------------------------------------------------------- Nachbesserung

phase('Nachbesserung')

const nachbesserungen = !nachzubessern.length
  ? []
  : await parallel(
      nachzubessern.map((n) => () =>
        mitWiederholung(() =>
          agent(
            `${BASIS}\n\nDU BESSERST **${n.task}** NACH. Ein Reviewer hat Befunde erhoben.\n\n` +
              `PRÜFE JEDEN BEFUND NACH, BEVOR DU IHN UMSETZT — ein Reviewer kann irren, und blindes ` +
              `Befolgen ist schlimmer als Widerspruch. Was du nicht übernimmst, begründest du am Code.\n\n` +
              `Bleib in den Dateien des Tasks: ${JSON.stringify(n.umsetzung.dateien)}\n\n` +
              `BEFUNDE:\n${JSON.stringify(n.review.befunde, null, 1)}`,
            {
              label: `fix:${n.task}`,
              phase: 'Nachbesserung',
              schema: {
                type: 'object',
                additionalProperties: false,
                required: ['task', 'behoben', 'abgelehnt'],
                properties: {
                  task: { type: 'string' },
                  behoben: { type: 'array', items: { type: 'string' } },
                  abgelehnt: { type: 'array', items: { type: 'string' } },
                },
              },
            },
          ),
        ),
      ),
    )

// ------------------------------------------------------- Gates

phase('Gates')

const gates = await mitWiederholung(() =>
  agent(
    `${BASIS}\n\nDU FÄHRST DIE GATES FÜR WELLE ${WELLE} (Tasks ${TASKS.join(', ')}).\n\n` +
      `Führe der Reihe nach aus und melde die ECHTE Ausgabe, nicht deine Erwartung:\n` +
      `  1. \`pnpm typecheck\`\n  2. \`pnpm lint\`  (Fehler blockieren, Warnungen nicht)\n` +
      `  3. \`pnpm vitest run\`\n  4. \`pnpm build\`\n` +
      (MIT_PLAYWRIGHT ? `  5. \`pnpm exec playwright test\`\n` : '') +
      `\nDANACH — und das sieht KEIN Gate oben: starte \`pnpm dev:av\` und \`next dev\` auf einem ` +
      `freien Port und RUFE JEDE in dieser Welle neu entstandene Route TATSÄCHLICH AB (curl, mit ` +
      `\`-i\`, gegen den Host, dessen Rolle sie trägt). Erwartet ist ein FACHLICHER Status ` +
      `(401/403/404/405/400 sind gültige Antworten für einen unangemeldeten oder unvollständigen ` +
      `Aufruf) — **HTTP 500 ist der Befund**, den kein \`pnpm build\` und kein Vitest findet. Trage ` +
      `Route und Status in \`routen_abgerufen\` ein, eine Zeile je Route. Fahre die Server danach ` +
      `wieder herunter.\n` +
      `\nWICHTIG: Wenn etwas rot ist, REPARIERE ES, sofern die Ursache in dieser Welle liegt — und ` +
      `berichte, was es war. Liegt die Ursache außerhalb (bestehender Fehler, andere Welle), ` +
      `reparierst du NICHT, sondern meldest es mit Beleg.\n\n` +
      `Zum Schluss: gib die exakten Zahlen (Testanzahl, Fehler, Warnungen) und den letzten Stand je ` +
      `Kommando an. Keine Beschönigung — ein rotes Gate, das als grün gemeldet wird, kostet später ` +
      `ein Vielfaches.`,
    {
      label: `gates:welle${WELLE}`,
      phase: 'Gates',
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['typecheck', 'lint', 'vitest', 'build', 'alles_gruen', 'reparaturen', 'fremde_fehler'],
        properties: {
          typecheck: { type: 'string' },
          lint: { type: 'string' },
          vitest: { type: 'string' },
          build: { type: 'string' },
          playwright: { type: 'string' },
          routen_abgerufen: {
            type: 'array',
            items: { type: 'string' },
            description: 'je Zeile: Methode, Pfad, Host, tatsaechlicher HTTP-Status',
          },
          alles_gruen: { type: 'boolean' },
          reparaturen: { type: 'array', items: { type: 'string' } },
          fremde_fehler: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  ),
)

ALLE.push({
  welle: WELLE,
  tasks: TASKS,
  umgesetzt: gueltig.map((g) => ({
    task: g.task,
    zusage_erfuellt: g.umsetzung.zusage_erfuellt,
    dateien: g.umsetzung.dateien.length,
    tests: g.umsetzung.tests.length,
    review: g.review?.urteil,
    blocker: (g.review?.befunde || []).filter((b) => b.schwere === 'blocker').length,
    offen: g.umsetzung.offen,
    fremde_datei_noetig: g.umsetzung.fremde_datei_noetig || [],
    review_befunde: (g.review?.befunde || []).filter((b) => b.schwere !== 'klein'),
  })),
  nachbesserungen,
  gates,
})

/*
 * ABBRUCH BEI ROTEM GATE — und zwar hart. Auf einem roten Fundament weiterzubauen
 * kostet mehr, als eine Welle spaeter nachzuholen: die naechste Welle importiert
 * aus der kaputten Schicht, ihre Tests laufen aus fremdem Grund rot, und niemand
 * kann die Ursache mehr zuordnen. Genau das ist in Welle 2 passiert, als
 * `ZAHL_NAMEN` fehlte.
 */
if (!gates?.alles_gruen) {
  log(`Welle ${WELLE}: Gate NICHT gruen — Abbruch, die folgenden Wellen laufen NICHT.`)
  break
}
log(`Welle ${WELLE}: fertig und gruen.`)
}

return {
  wellen: ALLE,
  gefahren: ALLE.length,
  geplant: WELLEN.length,
  abgebrochen: ALLE.length < WELLEN.length,
}
