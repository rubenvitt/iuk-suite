# Den Modul-Host-Rewrite intern halten — Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Jede Anfrage auf einem Modul-Host wird **innerhalb** des Prozesses auf `/m/<key>/…`
umgeschrieben statt über einen zweiten, externen Round-Trip durch Cloudflare und Traefik. Danach
trägt `cf-connecting-ip` im Modul-Handler wieder die **echte** Client-Adresse — womit das
IP-Rate-Limit je Nutzer statt je Suite zählt und die Auditspalte `client_ip_unbestaetigt` wieder
einen Wert trägt, der etwas bedeutet.

**Belegquelle:** `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md` (Ruben,
gemessen 2026-08-22 gegen `test.iuk-ue.de`, Cloudflare + Traefik + `whoami` + Traefik-Accesslog).
Befund 4 dort ist der Anlass; Abschnitt „Die drei Abhilfen" Posten 3 ist der Auftrag.

**Architecture:** Der Plan hat **drei Hälften mit scharfen Grenzen.** Aufgabe **P1** ist eine
**Messung am laufenden Betrieb ohne eine Zeile Code** — sie muss vor jedem Eingriff laufen, weil sie
sonst nicht mehr wiederholbar ist. Aufgaben **P2–P4** sind der Umbau, TDD, in genau **einer**
Produktionsdatei (`src/proxy.ts`). Aufgaben **P5–P6** sind Tore und die Abnahme am Server, und
**P6 ist der eigentliche Zweck des Plans**: ein Umbau, der läuft, aber die IP-Zuordnung nicht
repariert, ist wertlos, und `typecheck`/`lint`/`vitest` sehen davon **nichts**.

**Tech Stack:** Next.js 16 (`src/proxy.ts` **ist** die Middleware) · next-auth v5 (Auth.js) ·
TypeScript · Vitest (`environment: "node"`, `vitest.config.ts:7`) · Playwright · Docker Compose +
Traefik + Cloudflare

---

## ⚠️ Sechs Dinge, die diesen Plan von einem gewöhnlichen Umsetzungsplan unterscheiden

**1. ⛔ Die im Bericht vorgeschlagene Abhilfe funktioniert nicht — wer sie baut, baut den Fehler
nach.** Der Bericht sagt (`docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md:158-162`):
„`url.protocol`/`url.host` in `src/proxy.ts`s `case "rewrite"` explizit auf den bereits geprüften
`host` … pinnen". Das ist aus dem Quelltext widerlegbar. Next entscheidet „intern oder extern"
**nicht** gegen den `Host`-Kopf, sondern gegen seine eigene `initUrl`, und die wird
**ohne** den `Host`-Kopf gebaut:

```js
// node_modules/next/dist/server/lib/router-utils/resolve-routes.js:117
const initUrl = config.experimental.trustHostHeader
  ? `https://${req.headers.host || 'localhost'}${req.url}`
  : opts.port ? `${protocol}://${formatHostname(opts.hostname || 'localhost')}:${opts.port}${req.url}` : req.url || '';
```

`trustHostHeader` ist in `next.config.ts:1-12` **nicht** gesetzt — es gibt dort nur `reactCompiler`,
`output` und `allowedDevOrigins`. Also gilt der zweite Zweig: `initUrl` trägt
`opts.hostname`/`opts.port`, im Container also `0.0.0.0` und `3000` (`Dockerfile:38-39`:
`ENV PORT=3000`, `ENV HOSTNAME="0.0.0.0"`). Der Vergleich ist **reine Origin-Gleichheit**
(`node_modules/next/dist/shared/lib/router/utils/relativize-url.js:25-33`:
`const isRelative = relative.origin === baseURL.origin;`). Ein auf `share.iuk-ue.de` gepinntes
Ziel ist von `https://0.0.0.0:3000` genauso verschieden wie `https://iuk-ue.de` — **der externe
Round-Trip bliebe, nur auf einem anderen Host.**

**Die Abhilfe dieses Plans ist stattdessen wertunabhängig:** das Rewrite-Ziel wird auf die Origin
**derselben Anfrage** zurückgeschrieben, die Next gerade selbst gebaut hat
(`request.nextUrl.origin` in `src/proxy.ts:96`). Damit ist die Gleichheit **konstruktionsbedingt**
wahr — für jedes `HOSTNAME`, jedes `PORT`, jedes Protokoll, in Dev wie in Prod, heute und nach
einem Umzug.

**2. Damit entfällt die Vorbedingung, die der Bericht selbst gesetzt hat.** Der Bericht markiert
eine ⬜-Leerstelle (`:164-169`): „der genaue Mechanismus, warum `nextUrl`s eigene Host-Auflösung
hinter Traefik von `resolveHost()`s Ergebnis abweicht … eine Live-Messung … ist nötig, bevor jemand
diese Abhilfe baut." Diese Leerstelle gehörte zu **jener** Abhilfe, die einen konkreten Zielwert
raten musste. Der Mechanismus ist inzwischen aus dem Quelltext vollständig hergeleitet (Kapitel 2
unten), und die Abhilfe dieses Plans braucht **keinen** Zielwert. Die Live-Messung bleibt im Plan —
als **Bestätigung** (Aufgabe P1/P6), nicht als Sperre.

**3. Kein Tor dieses Repos kann den Fehler heute sehen — und keins kann die Reparatur sehen.**
`AUTH_URL` ist in der Testumgebung **nicht gesetzt**: nicht in `playwright.config.ts` (`webServer.env`,
belegt in `e2e/konto-widerruf.spec.ts:52-56`, wo genau dieses Nicht-Gesetztsein die Testführung
bestimmt), nicht in `.env.local`. Ohne `AUTH_URL` ist `reqWithEnvURL` ein No-Op
(`node_modules/next-auth/lib/env.js:6-8`: `if (!url) return req;`) — der Fehler tritt lokal nie auf.
**Folge:** die Testdateien dieses Plans müssen die Umschreibung **selbst nachstellen**, wörtlich
nach `env.js:5-12`, sonst prüfen sie nichts.

**4. Das trägt an einem internen Next-Vertrag.** `NextResponse.rewrite()` schreibt seinen Effekt in
den Kopf `x-middleware-rewrite` (`node_modules/next/dist/server/web/spec-extension/response.js:118`),
und genau diesen Kopf schreibt dieser Plan um. Der Name ist nicht öffentlich dokumentiert, aber
stabil genug, dass Next ihn in seinem **eigenen** Test-Hilfsmittel liest
(`node_modules/next/dist/experimental/testing/server/utils.js:61`). Deshalb bekommt er einen
**Kanarienvogel-Test** (Aufgabe P2, T5): benennt Next ihn um, geht ein Test rot statt der
Produktion still.

**5. Es ist eine Änderung am Routing der ganzen Suite.** Sie trifft **jeden** Nutzer auf **jedem**
Modul-Host sofort — nicht ein Modul, nicht eine Seite. Deshalb schuldet dieser Plan einen vollen
Playwright-Lauf (`CLAUDE.md`, Abschnitt „Zugriffsschutz": „ein Umbau von `proxy.ts` schuldet
weiterhin einen Lauf von `pnpm exec playwright test`, das den Ausfall als einziges immer end-to-end
sieht") und eine Rückkehr, die in Sekunden funktioniert (Risikotafel unten).

**6. Es wird keine Release Note geschrieben.** `CLAUDE.md`, Abschnitt „Release Notes": „Umbauten
unter der Haube … bekommen keine — eine Notiz über etwas, das niemand sehen kann, macht die Liste
unglaubwürdig". Nichts an dieser Änderung ist auf dem Bildschirm sichtbar; das Einzige, was Nutzer
bemerken könnten, ist, dass Seiten **schneller** kommen. Das ist kein Anlass für eine Notiz.

---

## Global Constraints

* **Kommandos, alle mit `rtk` präfixt, auch in Ketten mit `&&`:** `rtk pnpm typecheck` ·
  `rtk pnpm lint` · `rtk pnpm vitest run` · `rtk pnpm exec playwright test` · `rtk git …` ·
  `rtk curl …` · `rtk docker …`

* **Tor je Aufgabe:** `rtk pnpm typecheck` **0 Fehler** · `rtk pnpm lint` **0 Fehler** ·
  `rtk pnpm vitest run` grün gegen die Grundlinie **441/441 Dateien, 7991/7991 Tests**
  (`.superpowers/sdd/BASISLINIE-vitest.md`; Herkunft:
  `docs/superpowers/berichte/2026-08-21-vitest-basislinie.md`). Die neuen Testdateien dieses Plans
  erhöhen beide Zahlen — **jeder Fehlschlag ist ab jetzt ein neuer**, und wer einen sieht, prüft ihn
  per Beiseitelege-Gegenprobe (eigene Dateien temporär verschieben, voll laufen lassen,
  zurücklegen), nicht per Zählwert.

* ⛔ **Kein `pnpm build` vor einem ernstgemeinten Testlauf.** `.next/standalone/src/` ist eine Kopie
  des Quellbaums **inklusive Testdateien** (`vitest.config.ts:8-34`; `exclude` führt `**/.next/**`
  genau deswegen). Ein Build vor `vitest run` erzeugt Fremdfehlschläge, die wie eigene aussehen.

* ⛔ **Kein Worktree unter `.claude/worktrees/`** — dort liegt eine zweite, ältere Kopie dieses
  Repos (`.claude/worktrees/dependency-updates-ci-1d3e24/`), deren Dateien in Greps auftauchen und
  in Vitest als Fremdfehlschläge zählen (`vitest.config.ts:35`, `exclude: [".claude/**"]`). Jede
  Belegzeile dieses Plans meint die Datei **ohne** dieses Präfix.

* ⚠️ **Ein Bau läuft parallel im selben Repo** (Modul `radio`, Branch `feat/radio-modul-planteil2`).
  Er fasst `src/app/m/radio/`, `src/core/registry.ts`, `src/core/icons.ts` und `.env.example` an.
  **Dieser Plan fasst keine davon an** — die Schnittmenge ist leer. Wer beim Ausführen eine dieser
  Dateien geändert vorfindet, hat den anderen Bau vor sich und lässt sie in Ruhe.

* ⚠️ **Nicht `git add .`, nicht `-A`.** Namentlich stagen, mit `rtk git show --stat HEAD`
  nachsehen. **Commits müssen signiert sein** (main-Ruleset).

* **Deutsch, mit korrekten Umlauten, in Prosa und Kommentaren.** In TypeScript-Bezeichnern und in
  Testnamen **keine** Umlaute.

* **Belegpflicht.** Jede Behauptung in einem Kommentar nennt `datei:zeile`. Wo ein Wert erst der
  Server hergibt, steht eine **benannte Leerstelle** (⬜), nie eine plausibel aussehende Erfindung.

---

## Die Leerstellentafel

Sechs Leerstellen. **Keine** davon sperrt den Bau — alle sechs sind **Ablesungen am Server**, und
fünf von ihnen sind zugleich die Abnahme. Das ist Absicht: die Abhilfe ist wertunabhängig
(Punkt 1 oben), also braucht der Bau keinen Serverwert; die **Wirkung** braucht ihn.

| ⬜ | Was | Wer liest sie wann ab |
|---|---|---|
| **P-L1** | Welche `SUITE_HOST_<KEY>` in der **Server**-`.env` tatsächlich gesetzt sind — die Repo-Vorlage führt sie auskommentiert (`.env.example:107-112`), die geltenden Werte stehen nur auf dem Server | Ausführender Agent bzw. Ruben, **Aufgabe P1 Schritt 1**, vor jedem Eingriff |
| **P-L2** | Zahl der Traefik-Accesslog-Zeilen für **eine** externe Anfrage auf einem Modul-Host — **vorher** (erwartet: 2) und **nachher** (erwartet: 1) | Aufgabe **P1 Schritt 2** (vorher) und **P6 Schritt 2** (nachher) |
| **P-L3** | Was der Modul-Handler heute als `x-forwarded-host` und als `host` sieht — entscheidet, ob die host-ableitenden Aufrufstellen (Kapitel 4) sich ändern | Aufgabe **P1 Schritt 3** (vorher), **P6 Schritt 4** (nachher) |
| **P-L4** | Antwortzeit-**Differenz** Modul-Host gegen Apex, gleiches Kommando, gleiche Stelle — die Nachmessung zu Rubens „~100 ms" | Aufgabe **P1 Schritt 4** (vorher), **P6 Schritt 3** (nachher) |
| **P-L5** | `client_ip_unbestaetigt` aus zwei **verschiedenen** Client-Netzen über einen Modul-Host — vorher erwartet: zweimal **dasselbe** Netz | Aufgabe **P1 Schritt 5** (vorher), **P6 Schritt 5** (nachher) |
| **P-L6** | Die tatsächliche `initUrl`-Origin in Produktion (`https://0.0.0.0:3000` erwartet) — **rein diagnostisch**, der Umbau hängt nicht daran | Optional, Aufgabe **P6 Schritt 6**; entfällt ersatzlos, wenn P-L2 nachher `1` ergibt |

⚠️ **Rubens „~100 ms" hat keine Quelle in diesem Repo.** Gesucht wurde in `docs/runbooks/`
(inkl. `feedback-cutover.md`), `docs/superpowers/berichte/` und dem ganzen `docs/`-Baum nach
`Round-Trip|Roundtrip|100 ms|100ms` — kein Treffer, der eine Latenzmessung des Feedback-Cutovers
wäre. Die Zahl steht in diesem Plan deshalb als **Aussage Rubens aus der Beauftragung**, nicht als
belegter Repo-Wert; **P-L4 misst sie nach**, statt sie zu wiederholen.

---

## Kapitel 1 — Der gemessene Befund, kurz

Voller Text: `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`, Befund 4
(`:75-88`). In drei Sätzen:

Jede Anfrage auf `share` / `drop` / `qr` / `da` / `aufgaben` / `lagerbuch` erzeugt einen zweiten,
**externen** Round-Trip auf `iuk-ue.de/m/<key>/…`; im Traefik-Log stehen für **einen** Aufruf von
`https://share.iuk-ue.de/` zwei Zeilen. Im **inneren** Request — dort, wo der Modul-Handler läuft —
ist `cf-connecting-ip` die **Egress-IP des Servers**, die echte Client-Adresse existiert nur noch
als linkester `x-forwarded-for`-Eintrag, also im laut Befund 3 (`:58-73`) fälschbaren Bereich.

**Zwei Schäden, beide heute produktiv aktiv** (`:97-105` — kein eingeführter, sondern ein
aufgedeckter Bestandsfehler):

1. Jedes IP-Rate-Limit auf einem Modul-Host zählt gegen **einen** Sammel-Eimer.
   `clientIpAus` (`src/core/ratelimit.ts:113-116`) liefert dort für jeden Nutzer denselben Wert.
   Betroffen sind die Notbremsen an `src/app/m/files/api/s/[id]/verify/route.ts:81`,
   `src/app/m/files/api/u/[token]/upload/route.ts:375` und `src/app/m/feedback/actions.ts:564`
   (die drei Stellen und ihre Zeilennummern stammen aus `Bericht:102-103`; die vollen Pfade sind
   nachgeschlagen, der Bericht kürzt sie ab).
2. Die Auditspalte `client_ip_unbestaetigt` (`src/app/m/files/_db/zaehler.ts:139` — nachgeprüft,
   dort steht `clientIpUnbestaetigt: ipKuerzen(clientIpAus(vorgang.headers))` —, dazu
   `src/app/m/files/api/u/[token]/upload/route.ts:581`) trägt für **alle** Zeilen dasselbe Netz —
   schlimmer als leer, weil es
   wie ein echter Wert aussieht (`src/app/m/files/_lib/ip.ts:34-41`).

Dazu, nicht im Bericht belegt, sondern Rubens Aussage in der Beauftragung: der externe Round-Trip
kostet **~100 ms pro Anfrage** (beim Feedback-Cutover gemessen). Siehe die Warnung bei P-L4.

---

## Kapitel 2 — Wie der Rewrite heute funktioniert, Schritt für Schritt

**Das ist der Kern dieses Plans.** Wer ihn nicht versteht, ändert die falsche Zeile. Der Weg einer
Anfrage auf `https://share.iuk-ue.de/` bis in den Handler, mit den tragenden Zeilen wörtlich:

### Schritt 0 — Traefik reicht durch, Next baut sich seine eigene URL

Der Container lauscht auf `0.0.0.0:3000` (`Dockerfile:38-39`), Traefik leitet den Host per Label
dorthin (`compose.yaml:153-155`: `traefik.http.routers.iuk-suite.rule=${SUITE_TRAEFIK_RULE:-Host(...)}`,
`…loadbalancer.server.port=3000`). Next baut daraus **seine** Sicht auf die Anfrage:

```js
// node_modules/next/dist/server/lib/router-utils/resolve-routes.js:117
const initUrl = config.experimental.trustHostHeader ? `https://${req.headers.host || 'localhost'}${req.url}`
  : opts.port ? `${protocol}://${formatHostname(opts.hostname || 'localhost')}:${opts.port}${req.url}` : req.url || '';
```

`trustHostHeader` ist nicht gesetzt (`next.config.ts:1-12`) → **`initUrl` ist
`https://0.0.0.0:3000/`**, nicht `https://share.iuk-ue.de/`. (`protocol` ist `https`, weil Traefik
`x-forwarded-proto: https` setzt — `resolve-routes.js:115`.) Genau diese `initUrl` wird der
Middleware als Anfrage-URL übergeben (`node_modules/next/dist/server/next-server.js:1137`:
`url = getRequestMeta(params.request, 'initURL')`, weitergereicht `:1178`) und ist zugleich die
**Basis**, gegen die Next später „intern oder extern" entscheidet (`resolve-routes.js:468`).

⬜ **P-L6** bestätigt diesen Wert am laufenden Server. Er ist diagnostisch, nicht tragend.

### Schritt 1 — `proxy` bekommt die **unverfälschte** Anfrage

```ts
// src/proxy.ts:96-100
export async function proxy(request: NextRequest, event: NextFetchEvent) {
  return (await weicheMitAuth)(request, event);
}
```

`request.nextUrl.origin` ist hier **`https://0.0.0.0:3000`** — dieselbe Origin wie `initUrl`, denn
Next hat die `NextRequest` daraus gebaut. **Das ist der Wert, den der Umbau braucht**, und er ist
nur an dieser einen Stelle noch heil.

### Schritt 2 — next-auth tauscht die URL aus. Hier entsteht der Fehler.

```js
// node_modules/next-auth/lib/index.js:142-143
async function handleAuth(args, config, userMiddlewareOrRoute) {
    const request = reqWithEnvURL(args[0]);
```

```js
// node_modules/next-auth/lib/env.js:5-12
export function reqWithEnvURL(req) {
    const url = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
    if (!url) return req;
    const { origin: envOrigin } = new URL(url);
    const { href, origin } = req.nextUrl;
    return new NextRequest(href.replace(origin, envOrigin), req);
}
```

`AUTH_URL` ist in Produktion **gesetzt und lautet `https://iuk-ue.de`** — gemessen an zwei Stellen:
`.env.example:2` (`AUTH_URL=https://iuk-ue.de`) und `compose.yaml:80`
(`- AUTH_URL=${AUTH_URL:-https://iuk-ue.de}`, im `environment:`-Block, der laut `compose.yaml:76`
über `env_file` **gewinnt**). Der zurückgegebene `NextRequest` trägt damit die Origin
**`https://iuk-ue.de`**; die **Köpfe bleiben unangetastet** (zweites Argument `req`), also stimmt
`x-forwarded-host` weiterhin auf `share.iuk-ue.de`.

Diese ausgetauschte Anfrage — nicht die echte — bekommt unsere Weiche:

```js
// node_modules/next-auth/lib/index.js:163-169
    else if (userMiddlewareOrRoute) {
        const augmentedReq = request;
        augmentedReq.auth = auth;
        response = (await userMiddlewareOrRoute(augmentedReq, args[1])) ?? NextResponse.next();
```

### Schritt 3 — die Weiche entscheidet richtig und baut die URL falsch

```ts
// src/proxy.ts:27-31
  const host = resolveHost(req.headers);
  const { nextUrl } = req;
  const groups = req.auth?.user?.groups ?? null;
  const decision = decideRoute({ host, pathname: nextUrl.pathname, groups });
```

`resolveHost` (`src/core/routing.ts:36-41`) liest `x-forwarded-host` vor `host` — also
`share.iuk-ue.de`. Die **Entscheidung** ist damit richtig: `decideRoute`
(`src/core/routing.ts:69-79`) liefert `{ action: "rewrite", target: "/m/files", moduleKey: "files" }`.

Die **Antwort** aber wird ohne diesen Host gebaut:

```ts
// src/proxy.ts:36-40
    case "rewrite": {
      const url = nextUrl.clone();
      url.pathname = decision.target;
      return NextResponse.rewrite(url);
    }
```

`nextUrl` ist die **ausgetauschte** URL aus Schritt 2. Das Ziel lautet also
`https://iuk-ue.de/m/files` — mit einer Origin, die Next **nie** gesehen hat.

```js
// node_modules/next/dist/server/web/spec-extension/response.js:118
        headers.set('x-middleware-rewrite', validateURL(destination));
```

### Schritt 4 — Next liest die Origin und entscheidet „extern"

```js
// node_modules/next/dist/server/web/adapter.js:329-332
            if (destination.host === request.nextUrl.host) {
                destination.buildId = buildId || destination.buildId;
                response.headers.set('x-middleware-rewrite', String(destination));
            }
```

`destination.host` ist `iuk-ue.de`, `request.nextUrl.host` ist `0.0.0.0:3000` → **ungleich**, der
Zweig entfällt. Dann:

```js
// node_modules/next/dist/server/lib/router-utils/resolve-routes.js:466-472
                        if (middlewareHeaders['x-middleware-rewrite']) {
                            const value = middlewareHeaders['x-middleware-rewrite'];
                            const destination = getRelativeURL(value, initUrl);
                            resHeaders['x-middleware-rewrite'] = destination;
                            parsedUrl = parseUrl(destination);
                            if (parsedUrl.protocol) {
                                return { parsedUrl, resHeaders, finished: true };
```

```js
// node_modules/next/dist/shared/lib/router/utils/relativize-url.js:25-33
function parseRelativeURL(url, base) {
    const baseURL = typeof base === 'string' ? new URL(base) : base;
    const relative = new URL(url, base);
    // The URL is relative if the origin is the same as the base URL.
    const isRelative = relative.origin === baseURL.origin;
    return { url: isRelative ? relative.toString().slice(baseURL.origin.length) : relative.toString(), isRelative };
}
```

Die Prüfung ist **reine Origin-Gleichheit**. `https://iuk-ue.de` ≠ `https://0.0.0.0:3000` → die URL
bleibt absolut → `parsedUrl.protocol` ist gesetzt → `finished: true`. Und dann:

```js
// node_modules/next/dist/server/lib/router-server.js:415-417
            if (finished && parsedUrl.protocol) {
                return await proxyRequest(req, res, parsedUrl, undefined, …);
```

**Das ist der zweite Round-Trip.** `proxyRequest` öffnet eine echte HTTP-Verbindung nach
`https://iuk-ue.de/m/files` — über öffentliches DNS, also Cloudflare, dann Traefik, dann zurück in
denselben Container.

### Schritt 5 — was im inneren Request ankommt

```js
// node_modules/next/dist/server/lib/router-utils/proxy-request.js:30-41
    const proxy = new ProxyServer({
        target, changeOrigin: true, ignorePath: true, ws: true,
        proxyTimeout: …,
        headers: { 'x-forwarded-host': req.headers.host || '' }
    });
```

Zwei Dinge folgen daraus, und beide sind für Kapitel 4 entscheidend:

* `changeOrigin: true` → der **`Host`**-Kopf des inneren Requests ist `iuk-ue.de`.
* Next **setzt** `x-forwarded-host` auf den `Host` des **äußeren** Requests, also
  `share.iuk-ue.de`. Deshalb funktionieren `resolveHost`-basierte Ableitungen im Handler heute
  überhaupt. ⬜ **P-L3** prüft, ob Traefik diesen Wert auf dem Rückweg stehen lässt.
* Alle übrigen Köpfe werden weitergereicht — der Client-Wert aus `x-forwarded-for` bleibt als
  linkester Eintrag erhalten, und genau das zeigt Rubens Log-Auszug (`Bericht:81-84`).
  `cf-connecting-ip` dagegen **setzt Cloudflare für den neuen Request neu** — auf den Absender, und
  der ist jetzt der Server selbst.

### Der Kern in einem Satz

Der Rewrite geht extern, weil next-auth die Origin der Anfrage gegen `AUTH_URL` austauscht, **bevor**
unsere Weiche sie klont — und Next „intern" allein an Origin-Gleichheit mit seiner eigenen `initUrl`
festmacht.

### Warum die Abhilfe genau hier ansetzt

`src/proxy.ts:96` hält die **einzige** Referenz auf die unverfälschte Anfrage. Schreibt man das
Rewrite-Ziel dort auf `request.nextUrl.origin` zurück, ist die Origin-Gleichheit in
`relativize-url.js:29` **konstruktionsbedingt** wahr: verglichen wird die Origin einer URL, die aus
genau derselben Anfrage stammt wie die Basis. Es gibt keinen Wert zu raten und keinen zu pflegen.

---

## Kapitel 3 — Gibt es einen Grund für den externen Weg?

⛔ **Das ist der wichtigste Abschnitt dieser Analyse**, denn wenn der externe Weg eine Zusage
einlöst, bricht ein naiver Umbau sie, und kein Tor sieht es.

### Die Antwort, präzise

**Für den externen *Rewrite* gibt es keinen Grund — er ist niemandes Absicht, sondern die
Nebenwirkung eines Mechanismus, der einen anderen Zweck erfüllt.** Diese Formulierung ist stärker
als „kein Grund gefunden", und sie ist belegbar:

* **Die Ursache ist benannt und hat einen dokumentierten Zweck** — aber einen anderen.
  `reqWithEnvURL` existiert, damit **Auth.js** seine `baseUrl` und seine Callback-URLs stabil auf
  `AUTH_URL` bezieht. Dieser Zweck ist in diesem Repo an vier Stellen ausgeschrieben und trägt:
  `src/core/auth/redirect.ts:8-18` („Auth.js leitet seine `baseUrl` aus `AUTH_URL` ab — **immer**"),
  `src/core/auth/callbackUrl.ts:4-9`, `src/core/auth/cookies.ts:8-25` (Cookie-Domain, weil der
  Callback auf `AUTH_URL` landet) und `src/core/auth/pocketId.ts:35-56`
  (`redirectProxyUrl`, weil Pocket ID nur **eine** Redirect-URI kennt). **Keine dieser vier Zusagen
  liest das Rewrite-Ziel.** Sie alle arbeiten in Auth.js' eigener Maschinerie, die vor unserer Weiche
  läuft (`next-auth/lib/index.js:144` `getSession(request.headers, config)` — aus den **Köpfen**,
  nicht aus `nextUrl`) oder in `/api/auth/*`, das der Rewrite gar nicht erreicht
  (`src/core/routing.ts:12`, `PASSTHROUGH`).
* **Kein Kommentar behauptet die Absicht.** `src/proxy.ts` (104 Zeilen, vollständig gelesen) hat drei
  lange Docstrings — über die `auth`-Überladung (`:6-17`), über den Wrapper-Zweig (`:52-65`) und über
  das `await` (`:68-95`). **Keiner** erwähnt Rewrite-Ziel, Origin oder Host. Der einzige Host-Kommentar
  (`:24-26`) begründet `resolveHost` und sagt nichts über die Antwort-URL.
* **Keine Commit-Botschaft behauptet sie.** `git log -- src/proxy.ts` führt vier Commits:
  `bcc2e14` („feat: proxy middleware wires host-rewrite + auth gating") hat **einen leeren Rumpf**;
  `abec1b6`, `43b6612`, `8ec8e1b` haben ausführliche Rümpfe über `x-forwarded-host`, über den
  Promise-Bruch und über den Regressionstest — **keiner** über die Origin des Rewrite-Ziels.
  `git log -S "AUTH_URL"` führt auf `core/auth/*` und die Cutover-Dokumente, nie auf `proxy.ts`.
* **Kein Plan- und kein Spec-Dokument behauptet sie.** Die Treffer für `AUTH_URL` unter `docs/`
  (`lagerbuch-portierung-analyse.md:1227,1242,1463`, `2026-07-27-auth-stabilitaet.md:1341-1342,2131`,
  `2026-08-03-lagerbuch-modul-design.md:1785,7720,9189`, `2026-07-18-portal-productionize-design.md:74,181`,
  `2026-08-18-plan3-radio-generalprobe.md:1539`) sagen **durchweg** dasselbe: `AUTH_URL` ist
  suiteweit derselbe Wert, und das ist ein Problem **für Login-Ziele**, das mit
  `redirect.ts`/`callbackUrl.ts`/`redirectProxyUrl` gelöst wurde. Der Rewrite kommt in keinem davon vor.
* **Die Wirkung ist nachweislich unerwünscht** — sie ist erst am 2026-08-22 überhaupt bemerkt worden
  (`Bericht:75`, „Die eigentliche Falle").

### Was am externen Weg trotzdem hängt, und was der Plan damit macht

| Was | Hängt es am Rewrite? | Folge für den Plan |
|---|---|---|
| Auth.js `baseUrl`, OIDC-`redirect_uri`, `redirectProxyUrl` (`pocketId.ts:35-56`) | **Nein** — sie hängen an `AUTH_URL` selbst, und `AUTH_URL` bleibt unverändert | Nicht angefasst. Gegenprobe P6 Schritt 7 prüft Anmeldung trotzdem |
| Cookie-Domain `.iuk-ue.de` (`compose.yaml:83`, `cookies.ts:46-59`) | **Nein** — Browser-Cookie-Regel, unabhängig von serverinternen Hops | Nicht angefasst |
| **Die Login-Weiterleitung** (`src/proxy.ts:41-46`) | **Ja, dieselbe Ursache** — sie klont dieselbe ausgetauschte `nextUrl`, ihr `Location` trägt daher heute die Origin `https://iuk-ue.de` (herleitbar: `adapter.js:394` `redirectURL.host === requestURL.host` schlägt fehl, `resolve-routes.js:492` lässt die URL absolut) | ⛔ **Bewusst NICHT angefasst.** Der Plan ändert **nur** `x-middleware-rewrite`, nie `location`. Test **T4** hält das fest. Wo der Nutzer nach dem Login landet, behauptet dieser Plan **nicht** — das ist ungemessen und gehört in einen eigenen Posten |
| Der zweite Middleware-Durchlauf auf `/m/<key>/…` (`src/core/routing.ts:54-67`) | **Ja** — er entfällt mit dem inneren Request | Der Zweig **bleibt stehen**: er gated weiterhin einen Direktzugriff auf `/m/<key>/…` von jedem Host. Aufgabe P4 schreibt das in den Kommentar, damit ihn niemand „aufräumt" |
| Zwei Sitzungs-/Refresh-Durchläufe je Anfrage statt einem | **Ja** | Strikt besser: Pocket IDs Rotation ohne Gnadenfrist (`CLAUDE.md`, „Zugriffsschutz") mag eine Gelegenheit weniger. Gegenprobe P6 Schritt 7 misst Anmeldung, Abmeldung und einen Refresh |

**Schwächere Aussage, ehrlich benannt:** Ein Grund *außerhalb* dieses Repos — eine Cloudflare-Regel,
eine Traefik-Middleware, eine WAF-Regel, die den zweiten Round-Trip braucht — ist von hier aus nicht
ausschließbar. Gesucht wurde in: `src/proxy.ts`, `src/core/routing.ts`, `src/core/registry.ts`,
`src/core/hosts.ts`, `src/core/auth/**`, `next.config.ts`, `compose.yaml`, `.env.example`,
`Dockerfile`, allen vier Commits auf `src/proxy.ts`, `git log -S "AUTH_URL"`, und dem `docs/`-Baum.
Die Cloudflare- und Traefik-Konfiguration liegt **nicht** in diesem Repo (`compose.yaml:127`:
`networks: [proxy, av]`, `proxy` ist `external: true`). **P1 Schritt 6** stellt Ruben deshalb genau
eine Frage, bevor gebaut wird.

---

## Kapitel 4 — Der Umfang, namentlich

### Welche Module einen eigenen Host haben

**Selbst nachgeprüft** in `src/core/registry.ts:53-187` (`MODULES`) und
`src/core/registry.ts:225-232` (`moduleForHost`). Zwei Quellen bestimmen den Host eines Moduls:
`prodHostsFor` = `SUITE_HOST_<KEY>` **vor** dem Registry-Wert (`registry.ts:207-209`), und in Dev
zusätzlich fest `${key}.localtest.me` (`registry.ts:228`).

| Modul | `prodHosts` im Code | Wirkt der Rewrite? | Was sich mit diesem Plan ändert |
|---|---|---|---|
| `portal` | `["iuk-ue.de"]` (`registry.ts:59`) | **Nein** — der Apex ist die Rewrite-Ziel-Origin selbst, das Ziel liegt schon dort | Nichts. `cf-connecting-ip` stimmt hier heute (`Bericht:32-34`) und stimmt danach |
| `qr` | `[]` (`registry.ts:65`) → nur per `SUITE_HOST_QR` | **Ja**, sobald gesetzt | Ein Hop weniger. Kein IP-Aufrufer im Modul bekannt; profitiert über die Latenz |
| `feedback` | `[]` (`registry.ts:81`) → `SUITE_HOST_FEEDBACK` (im Bericht: `da`) | **Ja** | Notbremse `feedback/actions.ts:564` zählt wieder je Nutzer. Host-Ableitungen: `f/[slugSecret]/qr.png/route.ts:54-55`, `_ui/Teilnahme.tsx:56-57`, `(print)/aushang/[groupId]/page.tsx:43`, `(admin)/groups/[groupId]/page.tsx:183` |
| `files` | `[]` (`registry.ts:105`) → `SUITE_HOST_FILES`, **zwei** Hosts (im Bericht: `share`, `drop`) | **Ja**, auf beiden | Notbremsen `api/s/[id]/verify/route.ts:81` und `api/u/[token]/upload/route.ts:375` zählen wieder je Nutzer; Auditspalte `client_ip_unbestaetigt` (`_db/zaehler.ts:139`, `api/u/[token]/upload/route.ts:581`) trägt wieder echte Netze. ⚠️ **Die Rollenunterscheidung `share`/`drop` läuft über `resolveHost`** (`_lib/hostRolle.ts:91`) — die empfindlichste Stelle des Umfangs |
| `lagerbuch` | `[]` (`registry.ts:121`) → `SUITE_HOST_LAGERBUCH` | **Ja** | Host-**Riegel** `istLagerbuchHost` (`_lib/host.ts:43`) und `_lib/zugang.ts:206-211` laufen über `resolveHost` |
| `aufgaben` | `[]` (`registry.ts:172`) → `SUITE_HOST_AUFGABEN` | **Ja** | Ein Hop weniger |
| `alpha`, `gamma`, `beta`, `kioskdemo` | `[]`, keine `SUITE_HOST_*`-Vorlage | Nur unter `*.localtest.me` in Dev, wo `AUTH_URL` ungesetzt ist → der Fehler tritt dort ohnehin nicht auf | Nichts |

⬜ **P-L1** hält fest, welche dieser Variablen auf dem Server **tatsächlich** gesetzt sind. Die
Namen `share`, `drop`, `qr`, `da`, `aufgaben`, `lagerbuch` stammen aus Rubens Messung
(`Bericht:77`), nicht aus dem Repo — die Repo-Vorlage führt sie auskommentiert
(`.env.example:107-112`).

### `radio` — was das für die Reihenfolge heißt

`radio` steht heute **nicht** in `src/core/registry.ts` (`grep -c radio src/core/registry.ts` → `0`,
abgelesen 2026-08-22 auf `feat/radio-modul-planteil2`), aber `.env.example:112` führt bereits
`# SUITE_HOST_RADIO=`, und der Host-Riegel des Moduls entsteht in Planteil 2, der **gerade gebaut
wird**.

**Die Reihenfolgeaussage, in beide Richtungen:**

* **Dieser Plan wartet nicht auf `radio`.** Er ändert `src/proxy.ts` und sonst keine
  Produktionsdatei; `radio` bringt einen Registry-Eintrag und Dateien unter `src/app/m/radio/` mit.
  Die Schnittmenge ist leer, beide Wege können parallel laufen.
* ⚠️ **`radio` sollte auf diesen Plan warten — nicht im Bau, aber im Cutover.** Wird
  `SUITE_HOST_RADIO` gesetzt, **bevor** dieser Umbau steht, erbt `radio` den Bestandsfehler am
  ersten Betriebstag: ein IP-Rate-Limit im Modul zählte gegen einen Sammel-Eimer, und jede
  IP-Auditspalte trüge die Egress-IP. Danach gäbe es einen zweiten Ort, an dem eine falsch
  gefüllte Spalte steht.
* **Wenn `radio` zuerst kommt:** dann ist es das **sechste** betroffene Modul, und die Nachher-Probe
  P6 fährt einmal zusätzlich gegen seinen Host. Der Umbau selbst ändert sich dadurch **nicht** — er
  ist modulblind, er kennt nur die Anfrage-Origin.
* **`radio` erbt die Regel aus Kapitel 4:** jede Host-Ableitung im Modul geht über `resolveHost`
  (`src/core/routing.ts:36-41`), nie über `new URL(req.url).host`. ⚠️ **Und das gilt vorher wie
  nachher, nicht erst danach:** `req.url` im Handler wird aus `initUrl` gebaut
  (`resolve-routes.js:117`, `next-server.js:694`/`:1137`), und die entsteht aus
  `opts.hostname`/`opts.port` — **nie** aus dem `Host`-Kopf, solange `trustHostHeader` ungesetzt ist.
  Das trifft auf den inneren Request von heute genauso zu wie auf den einen Request von morgen; der
  Weg über `req.url` ist also schon heute falsch, nicht erst nach dem Umbau. Der Bestand hält sich
  schon daran:
  `src/app/m/lagerbuch/t/[code]/route.ts:124` schreibt es aus („NIE aus der Anfrage-URL"), und der
  einzige Rückfall auf `req.url` steht als **zweite** Wahl hinter `resolveHost`
  (`feedback/f/[slugSecret]/qr.png/route.ts:54-55`).

---

## Was dieser Plan anlegt und ändert

**Neu:**

```
src/proxy.selbsthop.test.ts       P3  (2 Tests: Reproduktion + Dev-Fall)
```

**Geändert:**

```
src/proxy.ts        P2 (eine Konstante + eine Funktion), P3 (drei Zeilen in `proxy`), P4 (Docstring)
src/proxy.test.ts   P2 (5 Tests), P4 (nichts)
src/core/routing.ts P4 (nur ein Kommentar-Nachtrag an :54-57 — KEINE Logikaenderung)
```

⛔ **Nicht angefasst:** `src/core/registry.ts` · `src/core/hosts.ts` · `src/core/auth/**` ·
`src/core/ratelimit.ts` · `next.config.ts` · `compose.yaml` · `.env.example` · `Dockerfile` ·
alles unter `src/app/m/**` · alles unter `src/app/m/radio/**`.

---

## Aufgabe P1 — Die Vorher-Probe. Ohne eine Zeile Code, und sie ist nicht nachholbar.

⛔ **Diese Aufgabe läuft vor dem AUSROLLEN (P6 Schritt 1), nicht vor dem Bau — mit genau einer
Ausnahme.** Ist der Umbau erst ausgerollt, gibt es den Vorher-Zustand nicht mehr, und die Abnahme
in P6 hätte nichts, wogegen sie misst. Der **Bau** (P2–P4) braucht dagegen **keinen** Serverwert:
die Abhilfe ist wertunabhängig („Sechs Dinge", Punkt 1), sie fasst eine einzige Datei an, und sie
kann der Produktion nicht schaden, solange nichts ausgerollt ist.

**Daraus die Sperrregel, damit niemand stehen bleibt und niemand die Vorher-Messung verliert:**

| Schritt | Sperrt | Begründung |
|---|---|---|
| **P1 Schritt 6** (die Frage an Ruben) | **P2** — vor der ersten Codezeile | Ein „ja" ändert den Plan, bevor Code entsteht (Kapitel 3, letzter Absatz) |
| **P1 Schritte 1–5** (die fünf Messungen) | **P6 Schritt 1** — vor dem Ausrollen | Sie sind der Vergleichswert der Abnahme, sonst nichts |

⚠️ Wer P2–P4 ohne Serverzugang ausführt, **hält bei P5 an** und übergibt an jemanden mit Zugang.
Er überspringt P1 **nicht** — eine nicht gemachte Vorher-Messung ist dauerhaft verloren, und der
Umbau wäre danach nicht mehr abnehmbar, nur noch ausgeliefert.

Alle Ergebnisse
werden **in diese Datei** nachgetragen (Lehre `sdd-beleg-nicht-in-der-kladde`: Messungen gehören in
ein verfolgtes Artefakt), unter der Überschrift „Ablesungen".

⚠️ **Der `whoami`-Container auf `test.iuk-ue.de` hilft hier nur begrenzt, und das ist wichtig zu
wissen, bevor jemand ihn benutzt.** Er hängt an einem **eigenen** Traefik-Router und ist nicht die
Suite — er durchläuft den Modul-Host-Rewrite **nicht** und kann ihn deshalb weder zeigen noch
widerlegen. Wofür er taugt: eine **Grundlinie der Köpfe** auf genau dieser Infrastruktur
(`cf-connecting-ip`, `x-forwarded-for`, `x-forwarded-host`, `x-real-ip`) — der Vergleichswert, gegen
den die Suite-Messungen gelesen werden. Wofür er nicht taugt: Schritt 2, 4 und 5 unten.

### Schritte

- [ ] **1 — ⬜ P-L1 ablesen.** Auf dem Server: `rtk grep '^SUITE_HOST_' .env` im
      Verzeichnis der `compose.yaml`. Die Liste der gesetzten Modul-Hosts hierher übertragen.
      Ohne sie weiß niemand, gegen welche Hosts P1 und P6 überhaupt messen.
- [ ] **2 — ⬜ P-L2 vorher: die Zahl der Traefik-Zeilen für EINE Anfrage.** Traefik-Accesslog
      verfolgen, dann **genau eine** externe Anfrage stellen:
      `rtk curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://<modulhost>/`.
      Die Zeilen zu dieser Anfrage zählen. **Erwartet: 2** (äußere + innere), wie in
      `Bericht:81-84`. Die beiden Zeilen **wörtlich** hierher übertragen — sie sind der Beleg.
      Zur Kontrolle dieselbe Messung gegen den **Apex** `https://iuk-ue.de/` — **erwartet: 1**.
      ⚠️ Ein Browser stellt Dutzende Nebenanfragen; deshalb `curl`, nicht der Browser.
- [ ] **3 — ⬜ P-L3 vorher: was der Handler sieht.** Ohne Codeänderung ist der einzige
      belastbare Weg die **Wirkung**: `https://<files-host-1>/` und `https://<files-host-2>/`
      abrufen und prüfen, ob sie **verschiedene** Rollen zeigen (`share` gegen `drop`,
      `src/app/m/files/_lib/hostRolle.ts:91`) — zeigen sie das, hat `resolveHost` im inneren
      Request den Modul-Host gesehen, wie `proxy-request.js:38-40` es vorgibt, und Traefik hat den
      Kopf nicht überschrieben. Dasselbe für `lagerbuch`: `https://<lagerbuch-host>/` gegen
      `https://iuk-ue.de/m/lagerbuch/` — der Riegel `istLagerbuchHost` (`_lib/host.ts:43`) muss
      unterscheiden. **Beobachtung wörtlich notieren**, nicht bewerten.
- [ ] **4 — ⬜ P-L4 vorher: die Latenz-Differenz.** Zehnmal je Ziel, dasselbe Kommando, direkt
      hintereinander, von derselben Stelle:
      `rtk curl -sS -o /dev/null -w '%{time_total}\n' https://<modulhost>/` und
      `… https://iuk-ue.de/`. **Median beider Reihen und die Differenz** notieren. Nur die
      **Differenz** ist die Aussage — absolute Zeiten hängen an Netz, Cache und Tageszeit und sind
      zwischen zwei Terminen nicht vergleichbar.
- [ ] **5 — ⬜ P-L5 vorher: die Auditspalte aus zwei Netzen.** Über einen `files`-Host je eine
      Zeile aus **zwei verschiedenen Client-Netzen** erzeugen (z. B. Telefon über Mobilfunk und
      Rechner über WLAN), dann `client_ip_unbestaetigt` der beiden Zeilen lesen
      (`src/app/m/files/_db/zaehler.ts:139` bzw. `src/app/m/files/api/u/[token]/upload/route.ts:581`; sichtbar auch in der
      Oberfläche, `src/app/m/files/(verwaltung)/shares/[id]/page.tsx:414`). **Erwartet vorher: zweimal dasselbe Netz.** Das ist
      die Probe, die dem Betreiber den Schaden am unmittelbarsten zeigt.
- [ ] **6 — Die eine Frage an Ruben, vor dem Bau** (Kapitel 3, letzter Absatz): „Gibt es an
      Cloudflare oder Traefik eine Regel, die den zweiten, internen Aufruf auf
      `iuk-ue.de/m/<key>/…` braucht oder erwartet — eine WAF-Regel, eine Cache-Regel, ein
      Page-Rule-Ziel, eine Traefik-Middleware?" Antwort hierher. Ein „nein" ist die Freigabe; ein
      „ja" ändert den Plan, bevor Code entsteht.

### Tor

Kein Testlauf, keine Codeänderung. Das Tor ist: **alle sechs Ablesungen stehen im Abschnitt
„Ablesungen" dieser Datei**, jede mit Datum und Kommando. Ein nicht notierter Messwert ist kein
Messwert.

---

## Aufgabe P2 — Die Umschreibung, als reine Funktion. Test zuerst.

**Files:** `src/proxy.ts` (neu: eine Konstante, eine exportierte Funktion) ·
`src/proxy.test.ts` (neu: fünf Tests)

⚠️ Die Tests kommen in die **bestehende** `src/proxy.test.ts`, nicht in eine neue Datei: sie
brauchen keine Modul-Attrappe, und die Datei ist bereits die Heimat der `proxy.ts`-Nähte
(`src/proxy.test.ts:5-26` erklärt, warum sie so aussieht, wie sie aussieht). Die Datei mit Attrappe
kommt in P3.

### Schritte

- [ ] **1 — Die fünf Tests schreiben und rot sehen.** Reihenfolge einhalten: schreiben, laufen
      lassen, **den Fehlschlag lesen**, erst dann bauen.
- [ ] **2 — Die Umsetzung, minimal.** In `src/proxy.ts`, oberhalb von `proxy`:

      ```ts
      /** Der Kopf, in den `NextResponse.rewrite()` sein Ziel schreibt
       *  (`node_modules/next/dist/server/web/spec-extension/response.js:118`). */
      export const REWRITE_KOPF = "x-middleware-rewrite";

      export function rewriteZielAufAnfrageOrigin(antwort: Response, anfrageOrigin: string): Response { … }
      ```

      Der Rumpf tut genau drei Dinge: den Kopf lesen; ist er nicht da, die Antwort **unverändert**
      zurückgeben; ist er da, `new URL(ziel)` bilden, `pathname` + `search` + `hash` gegen
      `anfrageOrigin` neu binden und den Kopf setzen. **Nichts sonst.** Insbesondere: `location`
      wird nie gelesen und nie geschrieben.

      ⛔ **`headers.set` an Ort und Stelle, ohne `try`/`catch` und ohne die Antwort neu zu bauen.**
      Die `Response`, die aus der Weiche kommt, ist genau die aus `next-auth/lib/index.js:181-185`
      (`const finalResponse = new Response(response?.body, response)`) — und next-auth **mutiert
      ihre Köpfe zwei Zeilen später selbst** (`:183-184`, `finalResponse.headers.append("set-cookie", …)`).
      Die Köpfe sind also beschreibbar, belegt durch die Abhängigkeit, auf der wir ohnehin stehen.
      Ein vorsichtshalber gesetztes `try`/`catch` erzeugte hier genau den stillen No-Op, gegen den
      der Kanarienvogel T5 gebaut ist — nur ohne Wächter. Wirft es wider Erwarten doch, ist HTTP 500
      auf jeder Route das richtige, laute Signal (Risiko R1).
- [ ] **3 — Grün sehen, dann jede der fünf Mutationen einzeln fahren**, rot bestätigen,
      zurücknehmen, grün bestätigen. Eine Mutation, die nicht rot wird, ist ein Testleck und wird
      hier behoben, nicht später.

### Tests — je Test die Mutation, die ihn rot macht

| # | Testname | Prüft | Mutation, die ihn rot macht |
|---|---|---|---|
| **T1** | `schreibt das Rewrite-Ziel auf die Origin der eingehenden Anfrage zurueck` | den Kern: Ziel `https://iuk-ue.de/m/files` + Origin `https://0.0.0.0:3000` → `https://0.0.0.0:3000/m/files` | Die Neubindung weglassen und den Kopf unverändert zurückschreiben (`return antwort;` vor der Umschreibung) — das Ziel behält `iuk-ue.de` |
| **T2** | `laesst Pfad, Query und Fragment unveraendert` | Ziel `https://iuk-ue.de/m/files/s/abc?seite=2#x` → derselbe Pfad, dieselbe Query, dasselbe Fragment auf der neuen Origin | Nur `pathname` gegen die neue Origin binden, `search`/`hash` fallen lassen — die Query verschwindet, und mit ihr jede Paginierung und jeder RSC-Parameter |
| **T3** | `ruehrt eine Antwort ohne Rewrite-Kopf nicht an` | `NextResponse.next()` läuft unverändert durch, kein Kopf entsteht | Die Wache `if (!ziel) return antwort;` entfernen — `new URL(null)` wirft, der Test wird rot statt still |
| **T4** | `fasst den Location-Kopf nicht an` | die Login-Weiterleitung (`src/proxy.ts:41-46`) bleibt exakt, wie sie ist — Kapitel 3, Zeile „Die Login-Weiterleitung" | Dieselbe Umschreibung zusätzlich auf `location` anwenden — der `Location`-Wert trägt plötzlich `0.0.0.0:3000` |
| **T5** | `NextResponse.rewrite schreibt weiterhin in REWRITE_KOPF` (Kanarienvogel) | dass der interne Next-Vertrag noch gilt, auf den T1–T3 bauen | `REWRITE_KOPF` auf einen anderen Wert setzen (z. B. `"x-middleware-rewrite-2"`) — T5 **und** T1 gehen rot. Die zweite, nicht selbst herbeiführbare Mutation ist ein Next-Upgrade, das den Kopf umbenennt; genau dafür steht der Test |

### Tor

`rtk pnpm typecheck` 0 · `rtk pnpm lint` 0 · `rtk pnpm vitest run src/proxy.test.ts` grün ·
`rtk pnpm vitest run` ohne neuen Fehlschlag gegen 441/7991. Dann committen.

---

## Aufgabe P3 — Die Verdrahtung, und der Test, der den Produktionsfehler nachstellt

**Files:** `src/proxy.ts` (drei Zeilen in `proxy`) · `src/proxy.selbsthop.test.ts` (neu, 2 Tests)

⚠️ **Eigene Datei mit `vi.mock`.** `src/proxy.test.ts` importiert `@/proxy` **ohne** Attrappe und
prüft damit die echte next-auth-Naht (`src/proxy.test.ts:44-56`); eine `vi.mock("@/core/auth")` in
derselben Datei entwertete diese Prüfung. Vitest hält Modul-Register je Datei getrennt — deshalb
eine zweite Datei.

### Schritte

- [ ] **1 — Die beiden Tests schreiben und rot sehen.**
- [ ] **2 — Die Attrappe bauen.** `vi.mock("@/core/auth", …)`: `auth` nimmt eine Rückruffunktion
      und gibt eine Funktion zurück, die den Rückruf mit einer **umgeschriebenen** Anfrage aufruft —
      **wörtlich nach `node_modules/next-auth/lib/env.js:5-12`**, mit genau dieser Zeilenangabe im
      Kommentar:

      ```ts
      // Nachstellung von `reqWithEnvURL` (node_modules/next-auth/lib/env.js:5-12).
      // Sie ist noetig, weil AUTH_URL in dieser Testumgebung NICHT gesetzt ist
      // (playwright.config.ts webServer.env, belegt in e2e/konto-widerruf.spec.ts:52-56)
      // und der Fehler ohne sie strukturell nicht auftreten kann.
      ```

      Der Rückgabewert der Attrappe muss dieselbe Form haben, die `proxy` erwartet — die echte
      Kette liefert eine `Response` (`next-auth/lib/index.js:181-185`).
- [ ] **3 — Die Verdrahtung in `proxy`** (`src/proxy.ts:96-100`): das Ergebnis der Weiche durch
      `rewriteZielAufAnfrageOrigin(…, request.nextUrl.origin)` reichen. **`request` ist der
      Parameter von `proxy`, nicht `req` der Weiche** — das ist die einzige Stelle, an der die
      unverfälschte Origin noch existiert (Kapitel 2, Schritt 1). Wer hier `req.nextUrl` nimmt,
      schreibt `iuk-ue.de` auf `iuk-ue.de` und hat nichts geändert.
- [ ] **4 — Grün sehen, beide Mutationen fahren.**

### Tests — je Test die Mutation, die ihn rot macht

| # | Testname | Prüft | Mutation, die ihn rot macht |
|---|---|---|---|
| **T6** | `mit gesetztem AUTH_URL zeigt das Rewrite-Ziel auf die Origin der Anfrage, nicht auf AUTH_URL` | die **ganze** Kette: Anfrage `https://0.0.0.0:3000/` mit `x-forwarded-host: files.example.test`, `AUTH_URL=https://apex.example.test` → `x-middleware-rewrite` lautet `https://0.0.0.0:3000/m/files` | Den Aufruf von `rewriteZielAufAnfrageOrigin` in `proxy` entfernen — das Ziel trägt wieder `apex.example.test`, also genau den Produktionsfehler. **Das ist der Test, der den Bestandsfehler reproduziert** |
| **T7** | `ohne AUTH_URL bleibt das Ergebnis unveraendert` | den Dev- und e2e-Fall: ohne `AUTH_URL` ist die Umschreibung ein No-Op und darf nichts kaputtmachen (`next-auth/lib/env.js:6-8`) | In `rewriteZielAufAnfrageOrigin` eine **feste** Origin verwenden statt der übergebenen (z. B. `process.env.AUTH_URL`) — der Dev-Fall bricht, obwohl der Prod-Fall grün bliebe |

⚠️ **`SUITE_HOST_*` in den Tests:** die Hosts der Testfälle müssen von `moduleForHost`
(`src/core/registry.ts:225-232`) gefunden werden, sonst fällt `decideRoute` auf `portal` zurück
(`src/core/routing.ts:69`) und der Test prüft etwas anderes, als sein Name sagt. Entweder
`*.localtest.me` benutzen (fest verdrahtet, `registry.ts:228`) oder `SUITE_HOST_FILES` per
`vi.stubEnv` setzen — Vorbild `src/app/api/auth/oidc-signout/route.test.ts:24`.

### Tor

`rtk pnpm typecheck` 0 · `rtk pnpm lint` 0 · `rtk pnpm vitest run src/proxy.test.ts src/proxy.selbsthop.test.ts`
grün · `rtk pnpm vitest run` ohne neuen Fehlschlag. Dann committen.

---

## Aufgabe P4 — Die Begründung im Quelltext. Ohne sie räumt der Nächste sie weg.

**Files:** `src/proxy.ts` (Docstring) · `src/core/routing.ts` (ein Kommentar-Nachtrag, **keine
Logik**)

Der Repo-Stil ist hier verbindlich, nicht Geschmack: `src/proxy.ts` erklärt an drei Stellen, warum
eine Zeile so aussieht, wie sie aussieht (`:6-17`, `:52-65`, `:68-95`), und genau diese Docstrings
sind der Grund, warum der Promise-Bruch nur **einmal** passiert ist.

### Schritte

- [ ] **1 — Docstring über `rewriteZielAufAnfrageOrigin`.** Er muss **vier** Dinge sagen, jedes mit
      Beleg: (a) dass next-auth die Origin gegen `AUTH_URL` tauscht
      (`node_modules/next-auth/lib/env.js:5-12`, aufgerufen in `lib/index.js:143`); (b) dass Next
      „intern oder extern" an reiner Origin-Gleichheit gegen seine `initUrl` festmacht
      (`relativize-url.js:29`, `resolve-routes.js:117` und `:466-472`), und dass `initUrl`
      **nicht** aus dem `Host`-Kopf kommt, solange `trustHostHeader` ungesetzt ist
      (`next.config.ts:1-12`); (c) dass der externe Zweig ein echter HTTP-Aufruf ist
      (`router-server.js:415-417`, `proxyRequest`); (d) ⛔ **dass ein Pinnen auf den geprüften Host
      NICHT genügt** — mit einem Satz, warum (Kapitel 2 Schritt 4). Ohne (d) baut der nächste Agent
      die Fassung aus dem Bericht.
- [ ] **2 — Verweis auf den Beleg**: `docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`
      (Befund 4) und auf diesen Plan.
- [ ] **3 — Nachtrag an `src/core/routing.ts:54-57`** (dem Kommentar über dem `/m/<key>`-Zweig):
      dass dieser Zweig **weiterhin gebraucht wird**, obwohl der interne Round-Trip weg ist — er
      gated einen **Direktzugriff** auf `/m/<key>/…` von jedem Host, und ohne ihn wäre jedes Modul
      über den Apex-Pfad erreichbar, ohne dass ein Tor rot würde. ⛔ **Keine Logikänderung an dieser
      Datei.**
- [ ] **4 — Keine Release Note.** Siehe „Sechs Dinge", Punkt 6. Wer meint, doch eine schreiben zu
      müssen, hat eine sichtbare Änderung gefunden, die dieser Plan nicht kennt — dann anhalten und
      fragen.

### Tor

`rtk pnpm typecheck` 0 · `rtk pnpm lint` 0 · `rtk pnpm vitest run` ohne neuen Fehlschlag.
⚠️ Prüfen, dass der Nachtrag in `routing.ts` wirklich nur ein Kommentar ist:
`rtk git diff src/core/routing.ts` darf **keine** Zeile ohne führendes `*`/`//` zeigen. Dann
committen.

---

## Aufgabe P5 — Die Tore, in der Reihenfolge, die etwas beweist

⛔ **Reihenfolge ist hier keine Formsache.** `pnpm build` legt eine Kopie des Quellbaums inklusive
Testdateien unter `.next/standalone/src/` an; läuft er **vor** `vitest`, zählt Vitest Fremddateien
mit (`vitest.config.ts:8-34`). Deshalb: erst Vitest, dann Build, dann Playwright.

### Schritte

- [ ] **1 — `rtk pnpm typecheck`.** 0 Fehler. ⚠️ Außerhalb dieser Umgebung den **Exit-Code**
      prüfen, nicht die Meldung (`CLAUDE.md`, „Tests": RTKs tsc-Filter meldet „No errors found",
      wenn tsc pretty ausgibt).
- [ ] **2 — `rtk pnpm lint`.** 0 Fehler (Warnungen blockieren nicht).
- [ ] **3 — `rtk pnpm vitest run`.** Gegen die Grundlinie 441/7991 plus die neuen Tests dieses
      Plans. **Jeder Fehlschlag ist ein neuer** und wird untersucht, nicht gezählt.
- [ ] **4 — `rtk pnpm build`.** Muss durchlaufen. ⚠️ Danach `rm -rf .next` **bevor** noch einmal
      Vitest läuft.
- [ ] **5 — `rtk pnpm exec playwright test`.** ⛔ **Nicht optional.** `CLAUDE.md`, Abschnitt
      „Zugriffsschutz": ein Umbau von `proxy.ts` schuldet diesen Lauf, „das den Ausfall als einziges
      immer end-to-end sieht". ⚠️ **Und er beweist hier weniger, als er scheint:** ohne gesetztes
      `AUTH_URL` ist die Umschreibung in e2e ein No-Op (T7). Playwright zeigt hier also **nur**,
      dass nichts kaputtgegangen ist — **nicht**, dass die Reparatur wirkt. Das zeigt allein P6.
- [ ] **6 — `rtk git log --oneline -5`** und `rtk git show --stat HEAD`: nur die vier Dateien aus
      „Was dieser Plan anlegt und ändert" dürfen auftauchen. Signierte Commits.

### Tor

Alle sechs Schritte grün, jeder mit seiner Ausgabe belegt. **Ein Torlauf, der nicht gelaufen ist,
ist kein grüner Torlauf.**

---

## Aufgabe P6 — Die Abnahme am Server. Der Grund, warum dieser Plan schwer ist.

⛔ **Ein Umbau, der funktioniert, aber die IP-Zuordnung nicht repariert, ist wertlos** — und
`typecheck`, `lint`, `vitest`, `build` und Playwright sehen davon **nichts**. Diese Aufgabe ist die
einzige, die die Zusage prüft.

**Regel für jede Probe: derselbe Ort, dasselbe Kommando, dasselbe Ziel wie in P1.** Eine Messung von
einem anderen Netz oder mit einem anderen Flag ist keine Nachher-Messung, sondern eine neue
Vorher-Messung.

### Was sich in den Köpfen ändern muss, damit der Umbau als gelungen gilt

Das ist die **inhaltliche** Zusage — die Schritte unten sind nur die Wege, sie abzulesen. Gemeint
sind die Köpfe **an der Stelle, an der der Modul-Handler läuft** (heute der innere Request, nach dem
Umbau der einzige). Hergeleitet aus Kapitel 2 Schritt 5 und `Bericht:23-46` sowie `:75-88`.

| Kopf | vorher (innerer Request) | nachher (der eine Request) | Woran es abgelesen wird — es gibt keinen Echo-Endpunkt |
|---|---|---|---|
| **`cf-connecting-ip`** | ⛔ die **Egress-IP des Servers**, für jeden Nutzer dieselbe (`Bericht:86-88`) | die **echte Client-Adresse**, von Cloudflare für diese Anfrage gesetzt (`Bericht:23-30`) | **Schritt 5** (Auditspalte aus zwei Netzen) — die einzige direkte Ablesung. Zusätzlich transitiv über Schritt 2 |
| **`x-forwarded-for`** | `<client>, <interner hop>, <egress>` — drei Glieder, der Client ganz links im fälschbaren Bereich (`Bericht:81-84`, `:58-73`) | `<client>` plus der Traefik-Hop — **ein Glied weniger**, und der Client steht nicht mehr allein für die echte Adresse ein | **Schritt 2**, Traefik-Accesslog: die verbliebene Zeile zeigt die Kette |
| **`host`** | `iuk-ue.de` — von Next gesetzt (`proxy-request.js:32`, `changeOrigin: true`) | der **Modul-Host**, wie Traefik ihn durchreicht | Kein direkter Weg ohne Echo-Endpunkt; **indirekt** über Schritt 4, weil `resolveHost` auf `host` zurückfällt, wenn `x-forwarded-host` fehlt (`routing.ts:40`) |
| **`x-forwarded-host`** | ⬜ **P-L3** — von Next auf den Modul-Host gesetzt (`proxy-request.js:38-40`), ob Traefik ihn stehen lässt, ist ungemessen | der **Modul-Host**, eindeutig und ohne Zwischenschritt | **Schritt 4**: `share`/`drop` zeigen verschiedene Rollen, der `lagerbuch`-Riegel unterscheidet, der Feedback-Link trägt den Modul-Host |
| **`true-client-ip`** | ungefiltert durchgereicht, darf **nie** Quelle sein (`Bericht:69-73`) | unverändert — **dieser Plan ändert daran nichts** | Keine Probe. Steht hier, damit niemand ihn als „Abhilfe" einführt |

⛔ **Bestanden ist nur, wenn Zeile 1 und Zeile 4 zutreffen.** Zeile 1 ist der Zweck des Plans;
Zeile 4 ist die Bedingung dafür, dass er nichts kaputtgemacht hat.

### Schritte — die Wirkprobe

- [ ] **1 — Ausrollen** nach `docs/runbooks/auto-rollout.md`. Ab hier zählt die Uhr für die
      Rückkehr (Risikotafel).
- [ ] **2 — ⬜ P-L2 nachher: die entscheidende Probe.** Dasselbe Kommando wie P1 Schritt 2,
      derselbe Modul-Host, Traefik-Accesslog mitlesen. **Bestanden, wenn für eine externe Anfrage
      genau EINE Zeile entsteht** statt zwei. Das ist der vollständige Beweis: keine zweite Zeile →
      kein zweiter Round-Trip → kein Selbst-Hop → `cf-connecting-ip` ist die Adresse des echten
      Clients, weil Cloudflare sie für **diese** Anfrage gesetzt hat (Befund 1 und 2 des Berichts,
      `:23-46`). ⛔ **Nicht bestanden bei zwei Zeilen — auch dann, wenn die Seite normal aussieht.**
      Genau so sah sie vorher auch aus.
- [ ] **3 — ⬜ P-L4 nachher: die Latenz.** Zehn Läufe je Ziel wie in P1 Schritt 4. **Bestanden,
      wenn die Differenz Modul-Host minus Apex deutlich kleiner ist als vorher** und beide Reihen
      sich annähern. Das ist die Nachmessung zu Rubens „~100 ms" — der Plan sagt keine Zahl voraus,
      er misst die Änderung der **Differenz**.
- [ ] **4 — ⬜ P-L3 nachher: die host-abgeleiteten Stellen** (Kapitel 4, die empfindlichsten):
      `share` und `drop` zeigen weiterhin **verschiedene** Rollen (`files/_lib/hostRolle.ts:91`);
      der `lagerbuch`-Host-Riegel unterscheidet weiterhin (`lagerbuch/_lib/host.ts:43`); ein
      Feedback-QR/-Link trägt weiterhin den **Modul**-Host, nicht `iuk-ue.de` und nicht
      `0.0.0.0:3000` (`feedback/f/[slugSecret]/qr.png/route.ts:54-55`, `_ui/Teilnahme.tsx:56-57`).
      ⚠️ Diese drei sind der Grund, warum `resolveHost` überall wiederverwendet wird — bricht eine,
      bricht die Regel und nicht die Stelle.
- [ ] **5 — ⬜ P-L5 nachher: die Auditspalte.** Dieselben zwei Client-Netze wie in P1 Schritt 5.
      **Bestanden, wenn die beiden neuen Zeilen zwei VERSCHIEDENE Netze tragen.** Das ist die
      Abnahme, die dem Betreiber den Nutzen zeigt: „drei Downloads aus demselben Netz" ist wieder
      eine Aussage (`src/app/m/files/_lib/ip.ts:8-12`).
- [ ] **6 — ⬜ P-L6, optional.** Entfällt, wenn Schritt 2 bestanden ist.

### Schritte — die Gegenprobe (dass nichts kaputt ist, das am externen Weg hing)

- [ ] **7 — Anmeldung, Abmeldung, Sitzungsauffrischung.** Von einem **Modul-Host** aus anmelden
      (Pocket ID, echter Weg): Weiterleitung, `state`/`pkce`/`nonce`-Cookies, Rückkehr, Sitzung
      steht. Dann abmelden (`/api/auth/oidc-signout`). Dann eine Stunde später oder mit erzwungenem
      Refresh: die Gruppen kommen weiterhin an. Begründung: der Umbau halbiert die Zahl der
      Middleware-Durchläufe je Anfrage, und daran hängt die Auffrischung
      (`CLAUDE.md`, „Zugriffsschutz": aufgefrischt wird auf dem Proxy-Pfad; Pocket IDs Rotation hat
      keine Gnadenfrist). ⛔ Kein `curl` — der Login-Weg ist nur im Browser echt.
- [ ] **8 — Weiterleitungen und Cookies.** Der `login`-Fall (`src/proxy.ts:41-46`) verhält sich
      **unverändert** (T4 hält das im Code fest; hier wird es am Server gesehen). Cookies tragen
      weiterhin die Domain aus `AUTH_COOKIE_DOMAIN` (`compose.yaml:83`), sichtbar in den
      Entwicklerwerkzeugen.
- [ ] **9 — Weiche Navigation und Prefetch innerhalb eines Modul-Hosts.** ⚠️ **Nicht auslassen, und
      es ist nicht dasselbe wie Schritt 2.** Mit dem internen Rewrite wird `isRelative` in
      `node_modules/next/dist/server/web/adapter.js:338` erstmals `true`; dadurch **entstehen** auf
      RSC-Anfragen die Köpfe `NEXT_REWRITTEN_PATH`/`NEXT_REWRITTEN_QUERY` (`adapter.js:352-360`), die
      es vorher auf diesem Weg nicht gab. Also: im Browser innerhalb eines Modul-Hosts navigieren
      (Links, Zurück-Knopf, ein Formular mit `redirect()` in einer Server Action — der Fall aus
      `abec1b6`), und die Netzwerkspur auf 404/500 durchsehen. Ein reiner Erstabruf per `curl`
      sieht davon nichts.
- [ ] **10 — Ein anonymer Weg je betroffenem Modul**, weil dort kein Login die Fehler verdeckt:
      ein `files`-Downloadlink, ein `feedback`-Teilnahmelink, ein `qr`-Aufruf, ein
      `lagerbuch`-Etikettencode (`t/[code]/route.ts`).
- [ ] **11 — Alle Ergebnisse in den Abschnitt „Ablesungen"** dieser Datei, mit Datum. Danach ist
      der Plan abgeschlossen — und `.superpowers/sdd/VORARBEIT-selfhop.md` bekommt den Nachtrag aus
      dem nächsten Kapitel.

### Tor

Schritte 2, 4, 5 **bestanden** und Schritte 7–10 **ohne Befund**. ⛔ Ein bestandener Schritt 2 bei
gebrochenem Schritt 4 ist **kein** Erfolg, sondern der Rückkehrfall.

---

## Was dieser Plan NICHT tut

* **Er baut den Self-Hop-Check nicht** (`.superpowers/sdd/VORARBEIT-selfhop.md`) — Rubens Posten 2.
  Zur Abgrenzung unten mehr.
* **Er fasst `clientIpAus` nicht an** (`src/core/ratelimit.ts:113-116`). Die Funktion bleibt Zeile
  für Zeile, wie sie ist; sie bekommt nach diesem Umbau nur endlich den richtigen Wert geliefert.
* **Er ändert die Login-Weiterleitung nicht** (`src/proxy.ts:41-46`) und behauptet nichts darüber,
  wo ein Nutzer nach dem Login landet. Das ist ungemessen (Kapitel 3) und gehört in einen eigenen
  Posten.
* **Er schließt D6 nicht** — den Direktzugriff an Cloudflare vorbei
  (`docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` §3.5.2, zitiert in
  `src/core/ratelimit.ts`). Das bleibt eine offene Betreiberentscheidung, und die Widerlegung von
  Fund K1 hängt weiterhin an ihr (`Bericht:48-56`).
* **Er ändert keine Env, keine `compose.yaml`, kein `Dockerfile`.** `AUTH_URL` bleibt
  `https://iuk-ue.de` — es hat vier belegte Aufgaben (Kapitel 3), und keine davon ist der Rewrite.
* **Er räumt den `/m/<key>`-Zweig in `src/core/routing.ts:54-67` nicht weg**, obwohl der interne
  Round-Trip entfällt. Aufgabe P4 schreibt auf, warum.

### Abgrenzung gegen den Self-Hop-Check — macht dieser Umbau ihn gegenstandslos?

**Nein, nicht ganz — und der Unterschied ist der Punkt.**

**Was er gegenstandslos macht:** die beiden ⬜-Leerstellen aus `VORARBEIT-selfhop.md:24-60` — L1
(„wie die eigene Egress-IP zur Laufzeit erkannt wird") und L2 („welche internen Hops es wirklich
gibt"). Beide existieren nur, weil ein Selbst-Hop **erkannt** werden muss. Ist der Selbst-Hop weg,
gibt es nichts zu erkennen: `cf-connecting-ip` ist im Handler wieder der Client, und der Zweig, den
L1 und L2 speisen sollten, würde **nie betreten**. Damit entfällt auch die Betreiberentscheidung aus
L1 (`SUITE_EGRESS_IP` von Hand pflegen gegen Selbstmessung beim Boot) — eine Entscheidung, die
`VORARBEIT-selfhop.md:37-48` selbst als „beide mit Kosten" beschreibt. **Das ist der eigentliche
Gewinn dieses Plans über die IP-Frage hinaus: er macht eine dauerhafte Pflegepflicht überflüssig,
statt sie einzuführen.**

**Was übrig bleibt — drei Reste, keiner davon klein:**

1. **Die Verteidigung gegen einen künftigen zweiten Rewrite- oder Proxy-Pfad.** Der Bericht sagt es
   selbst (`:171-175`): Posten 2 verteidigt an der Stelle, die `clientIpAus` kontrolliert,
   **unabhängig davon, wodurch** ein Selbst-Hop entsteht. Dieser Plan schließt genau **einen** Weg —
   den, der heute gemessen ist. Er baut keinen Riegel gegen einen neuen. ⚠️ Und er könnte einen
   bauen, ohne die Egress-IP zu kennen: ein Test, der verbietet, dass `NextResponse.rewrite` in
   diesem Repo je mit einer **fremden** Origin aufgerufen wird. Das ist ein sinnvoller **eigener**
   Posten und ausdrücklich **nicht** Teil dieses Plans.
2. **D6 bleibt offen.** Erreicht jemand Traefik oder den Container an Cloudflare vorbei, kann er
   `cf-connecting-ip` frei setzen (`Bericht:48-56`). Weder Posten 2 noch Posten 3 ändern daran
   etwas — Posten 2 hätte es sogar **verschlimmert**, weil ein Angreifer dann gezielt die Egress-IP
   senden könnte, um den `x-forwarded-for`-Zweig zu erzwingen.
3. **Der `"unknown"`-Rückfall auf dem Apex bleibt** (`src/app/m/files/_lib/ip.ts:26-34`, Fund W3):
   fehlt `cf-connecting-ip` ganz, liefert `clientIpAus` `"unknown"` und `ipKuerzen` daraus `null`.
   Dieser Plan berührt ihn nicht — er sorgt nur dafür, dass Modul-Hosts sich ab jetzt wie der Apex
   verhalten statt schlechter.

**Empfehlung an Ruben, keine Entscheidung dieses Plans:** nach bestandener Abnahme P6 ist Posten 2
in seiner heutigen Form **nicht mehr dringend** und sollte neu bewertet statt automatisch gebaut
werden — der Rest, den er verteidigt, ist Punkt 1 oben, und dafür ist ein Rewrite-Origin-Riegel die
billigere und wartungsfreie Antwort. Aufgabe P6 Schritt 11 trägt diesen Nachtrag in
`VORARBEIT-selfhop.md` ein.

---

## Die Risikotafel

Diese Änderung trifft **jeden Nutzer auf jedem Modul-Host sofort**. Sie hat keinen Fahrplan, keine
Teilausrollung und keinen Schalter — sie ist an oder aus.

| # | Was schiefgehen kann | Woran man es merkt | Wie man zurückkommt |
|---|---|---|---|
| **R1** | ⛔ **Der Rewrite trifft ins Leere → HTTP 404 oder 500 auf JEDEM Modul-Host, sofort.** Falsche Origin, falscher Pfad, ein Tippfehler im Kopfnamen | Der erste Abruf nach dem Ausrollen (P6 Schritt 2) antwortet nicht mit 200. **Kein Nutzer erreicht mehr irgendein Modul** | Rollback auf das vorige Image nach `docs/runbooks/auto-rollout.md` (`.env` führt den ausgerollten Digest, `.env.example:371-378`), `docker compose up -d`. **Sekunden.** ⚠️ Vor dem Ausrollen den vorigen Digest **notieren**, nicht danach suchen |
| **R2** | **Next benennt `x-middleware-rewrite` um** (Upgrade) → der Kopf wird nie gefunden, die Umschreibung ist ein stiller No-Op, der Selbst-Hop kehrt **unbemerkt** zurück | **Test T5 geht rot** — dafür steht er. In Produktion: P-L2 zeigt wieder zwei Zeilen | Kein Rollback nötig; den neuen Kopfnamen in `REWRITE_KOPF` nachziehen. ⚠️ Der Kanarienvogel ist der **einzige** Wächter: ohne ihn wäre das ein stiller Rückfall |
| **R3** | **Eine host-abgeleitete Stelle bricht** — `share`/`drop` kollabieren zu einer Rolle, der `lagerbuch`-Riegel öffnet oder schließt zu viel, ein Feedback-Link trägt den falschen Host (Kapitel 4) | P6 Schritt 4. ⚠️ **Kein Tor sieht das**: `resolveHost` liest Köpfe, und in Vitest wie in Playwright sind es die gestellten. Es ist **nur** am Server sichtbar | Rollback wie R1. Danach: `x-forwarded-host` im Handler vorher/nachher gegenüberstellen (P-L3) und die Ursache benennen, bevor ein zweiter Versuch startet |
| **R4** | **Weiche Navigation oder Prefetch bricht**, weil `NEXT_REWRITTEN_PATH`/`NEXT_REWRITTEN_QUERY` jetzt gesetzt werden (`adapter.js:338`, `:352-360`), wo sie es vorher nicht wurden | P6 Schritt 9. Erstabrufe bleiben grün — **es sieht aus, als sei alles in Ordnung**, bis jemand im Modul klickt | Rollback wie R1 |
| **R5** | **Die Sitzungsauffrischung leidet**, weil je Anfrage nur noch ein Middleware-Durchlauf stattfindet (Pocket-ID-Rotation ohne Gnadenfrist, `CLAUDE.md`) | P6 Schritt 7, oder — schlimmer — verzögert: Nutzer fliegen nach ~einer Stunde raus | Rollback wie R1. ⚠️ Dieses Risiko zeigt sich **verzögert**; deshalb nach dem Ausrollen mindestens zwei Stunden hinsehen, nicht zwei Minuten |
| **R6** | **Es wirkt scheinbar, repariert aber nichts** — der teuerste Fall: alle Seiten laden, alle Tore grün, und `cf-connecting-ip` ist weiterhin die Egress-IP | **Nur** P6 Schritt 2 und Schritt 5 zeigen es. **Deshalb sind sie im Tor von P6 und nicht optional** | Kein Rollback — der Umbau schadet dann nicht, er nützt nur nicht. Ursache suchen, bevor der Posten als erledigt gilt |
| **R7** | **Ein Grund außerhalb des Repos** (Cloudflare-/Traefik-Regel), den Kapitel 3 nicht ausschließen konnte | Unvorhersehbar — genau deshalb steht P1 Schritt 6 (die Frage an Ruben) **vor** dem Bau | Rollback wie R1 |
| **R8** | **Kollision mit dem `radio`-Bau** im selben Repo | `rtk git status` zeigt fremde Änderungen unter `src/app/m/radio/`, `src/core/registry.ts`, `src/core/icons.ts`, `.env.example` | Nicht anfassen, nicht mit `git add .` stagen. Die Schnittmenge ist leer (Global Constraints) |

**Die Regel über allem:** Fällt R1, R3, R4, R5 oder R7 auf, wird **zuerst zurückgerollt und dann
untersucht** — nicht umgekehrt. Es gibt keine Fläche der Suite, die von dieser Änderung nicht
betroffen ist.

---

## Ablesungen

*(Dieser Abschnitt ist beim Schreiben des Plans leer. Aufgabe P1 füllt die Vorher-Werte, Aufgabe P6
die Nachher-Werte — jeweils mit Datum, Kommando und wörtlicher Ausgabe. Eine nicht notierte Messung
ist keine Messung.)*

| ⬜ | Vorher (P1, Datum) | Nachher (P6, Datum) |
|---|---|---|
| P-L1 — gesetzte `SUITE_HOST_*` | | — |
| P-L2 — Traefik-Zeilen je Anfrage | | |
| P-L3 — `x-forwarded-host`/`host` im Handler | | |
| P-L4 — Latenz-Differenz Modul-Host ./. Apex | | |
| P-L5 — `client_ip_unbestaetigt` aus zwei Netzen | | |
| P-L6 — `initUrl`-Origin (diagnostisch) | — | |
