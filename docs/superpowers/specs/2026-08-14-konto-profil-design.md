# Profilseite und „Von allen Geräten abmelden" — Entwurf

Datum: 2026-08-14 · Zweig: `worktree-konto-profil`

## Das Ziel in einem Satz

Jede angemeldete Person bekommt eine Profilseite, die zeigt, als wer sie der
Suite gilt, und dort einen Knopf, der **alle** ihre Sitzungen dieser Suite
ungültig macht — auf jedem Gerät, sofort.

## Warum das nicht „einfach die Sitzungen löschen" ist

Die Suite fährt `strategy: "jwt"` (`core/auth/config.ts`). Es gibt **keine**
Sitzungstabelle, die man leeren könnte: die Sitzung ist ein signiertes Cookie im
Browser, und der Server hat davon keine Liste. Genau deshalb kann diese Seite
auch keine Geräteliste zeigen — es gibt serverseitig nichts zu zählen. Eine
solche Liste hieße Umstieg auf Datenbank-Sessions, also ein Umbau des gesamten
Auth-Pfads samt Adapter; das ist bewusst **nicht** Teil dieses Entwurfs.

Was ohne Sitzungstabelle geht, ist die Umkehrung: nicht die gültigen Sitzungen
aufzählen, sondern **eine Grenze ziehen**, unterhalb derer nichts mehr gilt.

## Die Mechanik — Widerrufs-Epoche

Eine Zeile pro Person: „alles, was vor diesem Zeitpunkt angemeldet wurde, ist
ungültig."

1. **Bei der Anmeldung** schreibt der `jwt`-Callback `token.angemeldetSeit`
   (Unix-Sekunden). Nur dann — die Bedingung ist dieselbe, unter der heute schon
   `token.sub` und `token.groups` gesetzt werden (`account`/`profile`/`user`
   liegt an).
2. **Bei jeder Anfrage** liest derselbe Callback die Epoche zu `token.sub`. Gilt
   `widerrufen_ab > angemeldetSeit`, gibt er `null` zurück.
3. **Beim Knopfdruck** setzt eine Server Action `widerrufen_ab = jetzt` für den
   `sub` aus `auth()` — und meldet anschließend das eigene Gerät ab.

### Warum nicht `token.iat`

Es liegt nahe, den vorhandenen `iat`-Anspruch als Anmeldezeitpunkt zu nehmen und
sich das eigene Feld zu sparen. Das wäre still falsch: Auth.js **signiert das
Token bei jeder Antwort neu** (`lib/actions/session.js:40`,
`jwt.encode({...jwt, token, salt})`) und setzt `iat` dabei auf die Gegenwart.
Der Widerruf wäre nach genau einer Anfrage wieder überholt — und weder
`typecheck` noch `build` noch ein Unit-Test auf dem Callback allein sähe das,
weil dort niemand ein zweites Mal encodiert. Deshalb ein **eigenes** Feld, das
nur bei der Anmeldung geschrieben und danach unverändert weitergetragen wird —
genau wie `token.sub` seit dem Sub-Fix.

### Warum `return null` und nicht `token.error`

`null` ist der von Auth.js vorgesehene Weg, und er wirkt **serverseitig**:

- Der Rückgabetyp ist `Awaitable<JWT | null>`
  (`@auth/core@0.41.3/index.d.ts:331`) — kein Kunstgriff, sondern Vertrag.
- `lib/actions/session.js:34-51`: bei `null` wird das Sitzungs-Cookie gelöscht
  (`sessionStore.clean()`) statt neu gesetzt, und der Antwortkörper bleibt leer.

Damit ist die Sitzung auf **allen** Pfaden tot: Proxy, RSC, Server Actions, API-
Routen. `req.auth` ist leer, `decideRoute` sieht eine unangemeldete Anfrage und
schickt auf `/login`.

Ein `token.error` wäre dagegen nur ein Hinweis an den Browser — eine API-Route
oder eine Server Action würde die Sitzung weiter als gültig lesen. Schlimmer:
`components/providers.tsx` behandelt `RefreshTokenError` mit einem **stillen
Neu-Login** (`signIn(reauthProvider, …)`). Diesen Fehlercode wiederzuverwenden
hieße also, die widerrufene Person sofort wieder anzumelden — das genaue
Gegenteil des Knopfes. Der Fehlercode-Weg ist damit nicht nur schwächer, er ist
falsch.

### Fehlt `angemeldetSeit`, gilt `0`

Bestandstokens tragen das Feld nicht. Sie gelten damit als „vor jeder Epoche
angemeldet": ohne Widerrufszeile passiert nichts, mit Widerrufszeile sind sie
tot. Fail closed, ohne Sonderfall.

**Folge für den Rollout: es gibt keinen.** Bestehende Sitzungen laufen weiter,
weil zum Zeitpunkt des Rollouts für niemanden eine Zeile existiert. Ein
Zwangs-Logout aller Nutzer, wie er beim Aufsetzen erwartet wurde, ist nicht
nötig.

### Kosten im heißen Pfad

Ein `SELECT` über den Primärschlüssel je Anfrage, better-sqlite3, synchron,
vorbereitetes Statement — im einstelligen Mikrosekundenbereich. **Kein
Zwischenspeicher**: er brächte hier nichts Messbares und träte die Zusage „gilt
sofort" wieder los, sobald es je einen zweiten Prozess gibt.

## Persistenz — `core/konto` mit eigener Migrationsliste

```
src/core/konto/
  _db/schema.ts          sitzung_widerruf
  _db/client.ts          getDb() → getModuleDb("konto", schema)
  _db/drizzle.config.ts
  _db/migrations/
  widerruf.ts            istWiderrufen() / widerrufeAlleSitzungen()
```

Tabelle `sitzung_widerruf`:

| Spalte | Typ | Bedeutung |
| --- | --- | --- |
| `sub` | `TEXT PRIMARY KEY` | OIDC-`sub` (Dev-Login: `dev:<email>`) |
| `widerrufen_ab` | `INTEGER NOT NULL` | Unix-**Sekunden**; alles davor ist ungültig |
| `aktualisiert_am` | `INTEGER NOT NULL` | epoch ms, nur für die Nachschau |

`widerrufen_ab` in Sekunden, weil der Vergleichswert aus dem JWT in Sekunden
kommt. `aktualisiert_am` in Millisekunden, weil das der Konvention der übrigen
Module folgt (`qr/_db/schema.ts`). Die Einheiten stehen deshalb **im Spaltennamen
begründet** und im Schema kommentiert — ein Vergleich über die Einheitengrenze
wäre ein Fehler, den kein Typ fängt.

### Warum core und nicht das Portal

„Ist diese Sitzung noch gültig?" ist suiteweit, nicht fachlich — dieselbe Klasse
Frage wie in `core/directory`, und dort ist die Begründung ausgeschrieben. Läge
die Tabelle im Portal, müsste `core/auth` in die Interna eines Moduls greifen;
`core/directory` hält im Kopfkommentar ausdrücklich fest, dass Modul-Interna kein
API sind.

### Warum eine eigene Liste `CORE_MIGRATIONS`

`MODULE_MIGRATIONS` einfach zu erweitern bricht `scripts/seed-lokal.test.ts`: der
Test verlangt für **jeden** Eintrag einen lokalen Seed. Für eine Widerrufstabelle
gibt es keinen sinnvollen Seed — eine geseedete Zeile würde den Dev-Nutzer
aussperren.

Statt die Zusage aufzuweichen bekommt core eine eigene Liste:

```ts
export const CORE_MIGRATIONS = [
  { key: "konto", migrationsFolder: "src/core/konto/_db/migrations" },
];
```

`migrateAllModules()` läuft über beide Listen. Die Dreieck-Tests in
`bootstrap.test.ts` (Migrationsordner existiert, Journal vorhanden, `COPY` im
Dockerfile) prüfen künftig **beide** Listen — das Dreieck gilt für eine core-DB
genauso, und ohne die Erweiterung fiele die `COPY`-Zeile lautlos unter den Tisch
und das Prod-Image bräche erst beim Boot.

Die Zusage „jedes Modul mit `_db/` hat einen Seed" bleibt damit wahr statt
durchlöchert.

## Die Seite

`src/app/m/portal/profil/page.tsx` auf dem Portal-Host. Eine Seite genügt für
alle Module: das Sitzungs-Cookie gilt domainübergreifend (`core/auth/cookies.ts`).

**Inhalt** (nur Lesen):

- Name, E-Mail
- Gruppen und Fachgruppen als Etiketten; leere Menge ausgeschrieben statt leer
- OIDC-Kennung (`sub`) — die Zeile, die man bei einer Zuordnungsfrage braucht
- „angemeldet seit" aus `angemeldetSeit`

**Abgesetzt darunter** der Widerruf: eine Überschrift, ein Satz, was er tut, und
ein Knopf mit Bestätigungsdialog.

Keine editierbaren Felder — Stammdaten pflegt Pocket ID.

### Die Fallen aus `docs/design/README.md`, die hier greifen

- **Falle 1 + 7:** `page.tsx` ist eine Server Component. Kein Compound-Zugriff
  auf antd (`Descriptions.Item`, `Typography.Title`, …) und **kein**
  `@ant-design/icons`. Die Darstellung übernimmt eine Client-Insel unter
  `_ui/`; `page.tsx` holt nur die Sitzung und reicht einfache Werte durch.
- **Falle 6:** Alles, was `page.tsx` an Werten braucht, kommt aus einem Modul
  **ohne** `"use client"`.
- **Falle 3:** `colorError === colorPrimary === #c8000f`. Der Widerrufsknopf ist
  `danger` mit `type="default"` (roter Umriss), **nicht** `type="primary"` — eine
  rote Fläche läse sich hier als die empfohlene Handlung.
- **Falle 4:** kein `size` auf Bedienelementen; `FullShell` setzt `controlHeight: 44`.

### Navigation

Ein Eintrag „Profil" im Nutzermenü von `SuiteNav.tsx`, oberhalb von „Abmelden",
mit `moduleUrl("portal")` als Ziel — von einem Modul-Host führt er also auf den
Portal-Host. Das ist der Preis dafür, dass die Seite nur einmal existiert, und
er ist der richtige: eine Kopie je Modul-Host wäre fünf Kopien derselben Seite.

## Die Server Action

`src/app/m/portal/profil/actions.ts`:

```ts
export async function alleSitzungenAbmelden(): Promise<void>
```

- Der `sub` kommt aus `auth()`, **nie** aus einem Formularfeld. Ein
  entgegengenommener Parameter wäre eine fremde Sitzung, die man abschießen kann
  (IDOR) — dieselbe Regel, die `assertGroupAccess` im Modul `feedback` durchsetzt.
- Ohne Sitzung: kein Schreibvorgang, Rückgabe ohne Wirkung.
- Nach Erfolg meldet der Client das **eigene** Gerät über den bestehenden Weg ab:
  `signOut({ callbackUrl: "/api/auth/oidc-signout" })`. Damit endet hier auch die
  Sitzung beim Identitätsanbieter. Ohne diesen Schritt bliebe der eigene Browser
  in einem Zustand, den erst die nächste Anfrage aufräumt.

## Was der Knopf **nicht** kann

Auf einem fremden Gerät bleibt die **Pocket-ID**-Sitzung bestehen. Wer dort auf
„Anmelden" klickt, ist wortlos wieder drin, solange das Cookie des
Identitätsanbieters lebt — genau der Effekt, den
`app/api/auth/oidc-signout/route.ts` im Kopfkommentar für den umgekehrten Fall
beschreibt.

Für „Telefon verloren" ist das die relevante Grenze, und sie gehört deshalb auch
in den Text auf der Seite: **„Beendet alle Sitzungen dieser Suite."** — nicht
„meldet dich überall ab".

Sie zu schließen hieße, IdP-seitig zu widerrufen. Ob die Pocket-ID-Admin-API das
kann, ist ungeprüft; `core/directory` nutzt heute nur `GET /api/users`. Das ist
eine eigene, kleine Nachfrage nach diesem Entwurf — nicht sein Teil.

## Tests

Reihenfolge: erst die Naht, dann die Oberfläche.

| Ebene | Was |
| --- | --- |
| `core/konto/widerruf.test.ts` | schreiben/lesen, unbekannter `sub`, Grenzfall gleiche Sekunde (`widerrufen_ab === angemeldetSeit` → **gültig**, nur echtes Älter widerruft), zweiter Widerruf hebt die Grenze weiter |
| `core/auth/config.test.ts` | widerrufenes Token → `null`; frisch angemeldet → gültig; `angemeldetSeit` wird bei der Anmeldung gesetzt, bei Folgeaufrufen **nicht** überschrieben; fehlendes Feld + Epoche → `null` |
| `core/bootstrap.test.ts` | Dreieck-Tests laufen über `MODULE_MIGRATIONS` **und** `CORE_MIGRATIONS` |
| `portal/profil/*.test.tsx` | Seite zeigt Gruppen/Fachgruppen/Kennung; Knopf ruft Action und danach `signOut` |
| Playwright | zwei Browser-Kontexte, beide angemeldet; Widerruf in Kontext A; Kontext B landet bei der nächsten Navigation auf `/login` |

Der Playwright-Lauf ist der einzige Test, der den Proxy-Pfad wirklich beweist —
dieselbe Begründung, aus der `CLAUDE.md` ihn für jeden Umbau an `proxy.ts`
verlangt.

Gates: `pnpm typecheck` · `pnpm lint` · `pnpm vitest run` · `pnpm build` ·
`pnpm exec playwright test`.

## Das Risiko, das zuerst ausgeräumt wird

**`better-sqlite3` im Proxy.** Next 16 fährt `proxy.ts` auf der Node-Laufzeit
(`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md:223`:
„Proxy defaults to using the Node.js runtime"), das native Modul muss aber auch
im `standalone`-Bündel ankommen. Geprüft wird das **vor** der Oberfläche, mit
einem echten Abruf, nicht mit einem Unit-Test.

Trägt es nicht, lautet der Rückfall: Prüfung in RSC, Server Actions und auf dem
Refresh-Pfad statt im Proxy — mit dann ausgewiesener Lücke bei reinen
API-Routen. Dieser Rückfall wird nicht still genommen; er wird gemeldet.

## Ausdrücklich nicht Teil dieses Entwurfs

- Geräteliste / einzelne Sitzungen abmelden (bräuchte Datenbank-Sessions)
- Editierbare Stammdaten (gehören zu Pocket ID)
- Ein suiteweiter Not-Widerruf für alle Personen (YAGNI)
- Widerruf beim Identitätsanbieter (siehe oben)
