# Bericht: `cf-connecting-ip` hinter Cloudflare — Ergebnis, nicht Rezept

**Gemessen von Ruben, 2026-08-22, direkt am Server.** Dieses Dokument hält das Ergebnis fest, als
verfolgtes Artefakt (Lehre `sdd-beleg-nicht-in-der-kladde`) — die Zahlen und Kopfzeilen unten sind
seine Ausgaben, nicht meine; ich habe sie nicht selbst nachgestellt, sondern gegen das Review und
den Bestand geprüft und daraus die Folgerungen gezogen.

**Anlass:** `.superpowers/sdd/REVIEW-ratelimit.md` (Prüfung von Commit `7d71b6c`) benannte als
Auflage vor der Auslieferung eine offene Leerstelle — kommt `cf-connecting-ip` in Produktion
zuverlässig an? — und markierte Fund K1 (CWE-348 sei nur verlagert, nicht entfernt) als kritisch.
Diese Messung beantwortet beides, und beantwortet dabei eine Frage, die weder Bauplan noch Review
gestellt hatten.

## Der Messaufbau

Ein `whoami`-Container auf `test.iuk-ue.de` (hinter Cloudflare und Traefik, wie die Suite selbst)
bleibt für Wiederholungen stehen. Gemessen wurde mit externen Anfragen gegen den echten Hostnamen
plus dem Traefik-Accesslog — **nicht** von innen (dazu unten mehr, das ist die Gegenprobe, die das
ursprüngliche Mess-Rezept als Fallstrick benannt hätte).

## Die vier Befunde, mit den Ausgaben wörtlich

### 1. `cf-connecting-ip` kommt an — bei jeder Anfrage, IPv4 wie IPv6

```
Cf-Connecting-Ip: 2a01:4f8:c014:715a::1
Cf-Connecting-Ip: 46.224.42.180
X-Forwarded-For:  46.224.42.180, 172.18.0.7
X-Real-Ip:        172.18.0.7
```

Fall A der Frist-Rechnung aus dem Review (Abschnitt 3, „Der Sammel-Eimer") — für den **Apex**
(`iuk-ue.de`, ohne Modul-Host-Rewrite, siehe Befund 4) ist das die Lage: `cf-connecting-ip` trägt
den echten Client, `clientIpAus` bekommt nie `"unknown"` von einem echten Nutzer.

### 2. `cf-connecting-ip` ist unfälschbar — solange die Anfrage über Cloudflare kommt

Schickt der Client den Kopf selbst mit, antwortet Cloudflare **am Edge mit 403 „error code 1000"**
— die Anfrage erreicht den Origin gar nicht.

**Das widerlegt Fund K1 des Reviews**, aber nicht vollständig — die Annahme, die fällt, ist eine
präzise: K1 unterstellte, ein Angreifer könne `cf-connecting-ip` **auf dem Direktzugriffs-Pfad**
frei setzen und rotieren. Für den Weg **über Cloudflare** ist das gemessen falsch: Cloudflare
überschreibt den Kopf am Edge, ein Client-Wert kommt nie durch, er löst stattdessen eine Ablehnung
aus. Der Docstring von `clientIpAus` (`src/core/ratelimit.ts:62-64` vor dieser Änderung) hatte genau
diese Möglichkeit offengelassen — sie ist jetzt gemessen widerlegt, für diesen Weg.

**Was diese Messung NICHT beantwortet, und das ist keine Kleinigkeit:** ob der **Direktzugriff auf
Traefik/den Container, an Cloudflare vorbei**, am Netzrand geschlossen ist. Das ist D6
(`docs/superpowers/specs/2026-08-03-lagerbuch-modul-design.md` §3.5.2, in `ratelimit.ts` zitiert)
— eine offene, benannte Betriebsentscheidung, die diese Messung nicht berührt, weil sie selbst über
`test.iuk-ue.de`, also über Cloudflare, lief. Ist D6 **nicht** geschlossen, bleibt K1 auf dem
Direktweg unverändert bestehen: dort setzt niemand Cloudflares Edge-Filter durch, und ein
Angreifer, der Traefik oder den Container direkt erreicht, kann `cf-connecting-ip` weiterhin frei
wählen. Die Widerlegung von K1 gilt also **unter der Voraussetzung, dass D6 geschlossen ist** — und
diese Voraussetzung ist selbst nicht gemessen, sondern weiterhin offen.

### 3. `X-Forwarded-For` ist fälschbar — das ist das echte CWE-348-Loch

```
curl -H 'X-Forwarded-For: 9.9.9.9' …
```

kommt mit dem Angreiferwert **vorangestellt** an. Das bestätigt die Richtung von `7d71b6c`: der
Commit hat den richtigen Kopf verlassen (`x-forwarded-for`) und den richtigen gewählt
(`cf-connecting-ip`) — das war nie die falsche Entscheidung, nur eine, die (K2/W2, siehe unten)
einen anderen Preis hat als angenommen.

Zusätzlich: **`True-Client-IP` wird vollständig ungefiltert durchgereicht** (`5.5.5.5` kam
unverändert an). Dieser Kopf darf **nie** als Quelle für `clientIpAus` dienen — er ist die
naheliegendste falsche Abhilfe, die jemand vorschlagen wird, wenn `cf-connecting-ip` einmal als
„unzuverlässig" gilt (siehe Befund 4). Diese Warnung steht jetzt im Docstring von `clientIpAus`
(`src/core/ratelimit.ts`, Nachtrag unten).

### 4. Die eigentliche Falle — der Modul-Host-Rewrite frisst die Client-IP

Jeder Request auf `share` / `drop` / `qr` / `da` / `aufgaben` / `lagerbuch` erzeugt einen zweiten,
**externen** Round-Trip auf `iuk-ue.de/m/<key>/…`. Traefik-Log für **einen** Aufruf von
`https://share.iuk-ue.de/`:

```
2a01:4f8:c014:715a::1
2a01:4f8:c014:715a::1, 172.18.0.7, 46.224.42.18…
```

Für den **inneren** Request — den, in dem der Modul-Handler tatsächlich läuft — ist
`cf-connecting-ip` die **Egress-IP dieses Servers**. Die echte Client-Adresse existiert dort nur
noch als **linkester `X-Forwarded-For`-Eintrag**, also genau im fälschbaren Bereich aus Befund 3.

## Die Folgerung: Apex trägt, Modul-Hosts nicht

Der befürchtete Sammel-Eimer aus dem Review (Abschnitt 3, K2/W2) **tritt ein** — aber aus einem
anderen Grund als dort angenommen (nicht Ausfall von Cloudflare, sondern der eigene
Modul-Host-Rewrite), und **nur auf Modul-Hosts**. Auf dem Apex `iuk-ue.de` (`portal`, kein Rewrite
über einen fremden Host) stimmt der Wert.

⛔ **Und der teuerste Satz von allen: dieser Kollaps ist heute schon produktiv aktiv.** Der alte
Code (vor `7d71b6c`) gab `cf-connecting-ip` bereits Vorrang vor `x-forwarded-for`
(`DIFF-ratelimit.txt:317-321`, zitiert in `REVIEW-ratelimit.md:59-62`) — der Commit `7d71b6c` ändert
an diesem Pfad **nichts**. Es ist **kein eingeführter Fehler**, sondern ein **aufgedeckter
Bestandsfehler**: jede Notbremse, die heute schon `clientIpAus` über einen Modul-Host aufruft
(`verify/route.ts:81`, `upload/route.ts:375`, `feedback/actions.ts:564`), sperrt bereits jetzt alle
Nutzer eines Moduls gemeinsam, sobald `cf-connecting-ip` Vorrang bekommt — unabhängig davon, ob
`7d71b6c` je gebaut worden wäre. Das ändert die Dringlichkeit: nicht „vor der Auslieferung
klären", sondern „betrifft den laufenden Betrieb".

## Welche Review-Funde die Messung trifft

| Fund | Wirkung der Messung | Begründung |
|---|---|---|
| **K1** (CWE-348 verlagert, nicht entfernt) | **Widerlegt** — mit Vorbehalt | Cloudflare verwirft einen client-gesetzten `cf-connecting-ip` am Edge (Befund 2); der Rotationsweg aus K1 existiert für Cloudflare-Verkehr nicht. Die Widerlegung hängt an D6 (Direktzugriff geschlossen?), die diese Messung nicht beantwortet. |
| **K2** (Sammel-Eimer beim Passwort-Share, `verify/route.ts:81`) | **Bestätigt, verschärft** | Der Kollaps tritt ein (Befund 4), weil `share`/`drop` Modul-Hosts sind — und tut es bereits heute, nicht erst mit `7d71b6c` (siehe oben). |
| **W2** (Sammel-Eimer bei der Upload-Notbremse, `upload/route.ts:375`) | **Bestätigt, verschärft** | Derselbe Mechanismus, derselbe Host. |
| **W3** (Audit-Spalte leert sich, `zaehler.ts:139`, `upload/route.ts:581`) | **Bestätigt, verschärft** | Auf Modul-Hosts wird die Spalte nicht leer, sondern trägt die Egress-IP des Servers für **alle** Zeilen — schlimmer als `null`, weil es wie ein echter Wert aussieht (Nachtrag in `src/app/m/files/_lib/ip.ts`, s. u.). |
| K1-Auflage 3 im Review („Kopfzeile und Bericht korrigieren") | **Ersetzt** | Nicht mehr „verlagert statt entfernt", sondern „gilt für den Apex, nicht für Modul-Hosts" — Nachtrag in `src/core/ratelimit.ts` und `.superpowers/sdd/BERICHT-ratelimit.md`. |

## Die drei Abhilfen, in Rubens Reihenfolge

### 1. `7d71b6c` bleibt stehen, die Botschaft wird berichtigt

Der Commit **härtet den Apex** (`portal`, jeder Host ohne Modul-Rewrite) — dort war er vorher schon
wirkungslos gegen einen über-Cloudflare-Angreifer und ist es jetzt gemessen weiterhin, nur ohne die
`x-forwarded-for`-Lücke. Er ist aber **für Modul-Hosts kein Rate-Limit-Fix**: dort bekam
`cf-connecting-ip` schon vor dem Commit Vorrang, der Sammel-Eimer aus K2/W2 ist unverändert vom
Commit unberührter Bestand. Umgesetzt als Nachtrag im Docstring von `clientIpAus`
(`src/core/ratelimit.ts`) und als Abschnitt in `.superpowers/sdd/BERICHT-ratelimit.md`.

### 2. Der Self-Hop-Check — ausführbarer Bauplan, nicht gebaut

Key-Ableitung: `cf-connecting-ip` verwenden, **außer** sie ist die eigene Egress-IP — dann den
`X-Forwarded-For`-Eintrag links der bekannten internen Hops nehmen. Vollständiger Bauplan mit
Datei, Signatur, Testfällen und ihren Mutationen in `.superpowers/sdd/VORARBEIT-selfhop.md`. Zwei
Werte sind darin **gemessen benannt statt angenommen**, weil sie aus diesem Repo nicht ableitbar
sind: wie die eigene Egress-IP zur Laufzeit erkannt wird, und welche internen Hops es wirklich
gibt (⬜-Leerstellen mit „wer liest es wann ab").

### 3. Die Ursache beseitigen — nur beschrieben, nicht gebaut

Den Modul-Rewrite intern halten, statt ihn über Cloudflare zu schleifen. Betrifft `src/proxy.ts`
und jedes Modul mit eigenem Host (`qr`, `feedback`, `files`, `lagerbuch`, `aufgaben` —
`src/core/registry.ts:57-186`; `portal` ist der Apex selbst und nicht betroffen). Details unten.

#### Was konkret umzustellen wäre

`src/core/routing.ts:69-79` bestimmt den Ziel-Host für die Modulwahl über `resolveHost(req.headers)`
(`routing.ts:36-41`, die vertrauenswürdige Ableitung: `x-forwarded-host` vor `host`) — dieser
geprüfte Wert fließt in `decideRoute` als `host` ein. Die tatsächliche Rewrite-Antwort baut
`src/proxy.ts:36-40` aber **ohne** diesen Wert: `const url = nextUrl.clone(); url.pathname =
decision.target; return NextResponse.rewrite(url);` — die Herkunft (`protocol`/`host`) der
zurückgegebenen URL kommt ausschließlich aus `nextUrl` selbst, nicht aus dem bereits geprüften
`host`. Genau das ist die Lücke, die den zweiten, externen Round-Trip plausibel macht: wenn
`nextUrl`s eigene Host-Auflösung — aus welchem Grund auch immer, hinter Traefik nicht notwendig
identisch mit dem, was `resolveHost` ermittelt — auf einen anderen Origin zeigt als den, über den
der Browser tatsächlich gekommen ist, behandelt `NextResponse.rewrite()` das Ziel als fremden
Origin und **fetcht es tatsächlich** (`node_modules/next/dist/docs/.../next-response.md`: „Produce
a response that rewrites (**proxies**) the given URL" — das Wort ist wörtlich zu nehmen).

**Die Abhilfe:** `url.protocol`/`url.host` in `src/proxy.ts`s `case "rewrite"` explizit auf den
bereits geprüften `host` (und dessen Protokoll) pinnen, statt sich auf `nextUrl.clone()`s eigene
Auflösung zu verlassen — damit die Rewrite-Ziel-URL beweisbar denselben Origin trägt wie die
Anfrage, die der Browser tatsächlich gestellt hat, und niemals mehr über einen fremden (und damit
extern aufgelösten) Host läuft.

⬜ **Leerstelle, benannt statt erfunden:** der genaue Mechanismus, warum `nextUrl`s eigene
Host-Auflösung hinter Traefik von `resolveHost()`s Ergebnis abweicht, ist aus dem Quelltext allein
nicht sicher zu bestimmen — Next 16 hat gemessene Breaking Changes gegenüber älteren Ständen
(`CLAUDE.md`, „This is NOT the Next.js you know"), und eine Live-Messung (`nextUrl.href` gegen
`req.headers.get("host")` und `x-forwarded-host` an genau der Stelle in `proxy.ts` geloggt, gegen
einen echten Request über Traefik) ist nötig, bevor jemand diese Abhilfe baut.

**Warum Punkt 2 nicht überflüssig wird, falls Punkt 3 kommt:** Punkt 3 schließt den Symptomweg, der
heute gemessen ist. Punkt 2 verteidigt zusätzlich gegen einen **künftigen zweiten** Rewrite- oder
Proxy-Pfad, der dieselbe Falle unabhängig von `proxy.ts` wieder öffnen könnte — er ist die
Verteidigung an der Stelle, die `clientIpAus` selbst kontrolliert, unabhängig davon, wodurch der
Selbst-Hop entsteht.

## Ergebnis und Datum

**Gemessen: 2026-08-22, Ruben, `test.iuk-ue.de`.** Ergebnis: Fall A für den Apex, Fall B (Kollaps,
bereits Bestand) für Modul-Hosts — kein Freigabe/Sperr-Fall im ursprünglichen Sinn des Mess-Rezepts,
sondern eine geschärfte, dritte Lage: die Auslieferung von `7d71b6c` ist unbedenklich für den Apex
und ändert an der Modul-Host-Lage nichts (weder zum Besseren noch zum Schlechteren) — die Abhilfe
dafür ist Posten 2/3 oben, nicht diese Vorarbeit.
