# Abnahme: Den Modul-Host-Rewrite intern halten — die Ablesungen

**Verfolgtes Artefakt für die Messungen** zum Plan
`docs/superpowers/plans/2026-08-22-modul-host-rewrite-intern.md` (Aufgaben P1 und P6).
Anlass ist der gemessene Befund 4 in
`docs/superpowers/berichte/2026-08-22-client-ip-hinter-cloudflare.md`.

**Warum diese Datei existiert und die Werte nicht im Plan stehen:** der Plan verlangt sie in seinem
eigenen Abschnitt „Ablesungen". Der Bauweg, der P2–P4 umgesetzt hat, durfte
`docs/superpowers/plans/` nicht anfassen — dort lief parallel ein anderer Bau. Die Werte gehören
trotzdem in ein **verfolgtes** Artefakt und nicht in den git-ignorierten SDD-Bericht (Lehre
`sdd-beleg-nicht-in-der-kladde`); deshalb hier. Wer den Plan später abschließt, trägt sie von hier
dorthin nach.

## Der Stand des Baus, am 2026-08-22

| Aufgabe | Zustand |
|---|---|
| **P1** (Vorher-Probe am Server) | ⬜ **offen** — nicht nachholbar, siehe unten |
| **P2** (die reine Funktion) | ✅ `92a40d0`, signiert |
| **P3** (die Verdrahtung) | ✅ `282ea52`, signiert |
| **P4** (die Begründung im Quelltext) | ✅ `d9fe014`, signiert |
| **P5** (die Tore) | ✅ typecheck 0 · lint 0 Fehler · vitest `447 passed` / `8081 passed` · build Exit 0 · Playwright `333 passed (12.6m)`, Exit 0 |
| **P6** (die Abnahme am Server) | ⬜ **offen** |

Der volle Baubericht mit den Mutationssonden und den roten Ausgaben liegt in
`.superpowers/sdd/BERICHT-proxy-rewrite.md`.

⛔ **Es ist NICHT belegt, dass der Befund behoben ist.** Kein Tor dieses Repos kann die Reparatur
sehen: `AUTH_URL` ist in der Testumgebung nicht gesetzt, damit ist `reqWithEnvURL` ein No-Op
(`node_modules/next-auth/lib/env.js:6-8`) und der Fehler tritt lokal nie auf. Belegt ist die
Reparatur erst mit P6 Schritt 2 und Schritt 5 unten.

---

## Die Übergabe: P1 und P6 — was Ruben fahren muss

**Reihenfolge ist hier keine Formsache.** Drei Blöcke, in dieser Reihenfolge:
**(0)** die Frage beantworten · **(1)** die Vorher-Messungen — sie sind nach dem Ausrollen dauerhaft
verloren · **(2)** ausrollen und die Nachher-Messungen.

⚠️ **Regel für jede Nachher-Probe: derselbe Ort, dasselbe Kommando, dasselbe Ziel wie vorher.**
Eine Messung aus einem anderen Netz oder mit einem anderen Flag ist keine Nachher-Messung, sondern
eine neue Vorher-Messung.

⚠️ Der `whoami`-Container auf `test.iuk-ue.de` steht für Wiederholungen bereit. Er hängt an einem
**eigenen** Traefik-Router, durchläuft den Modul-Host-Rewrite also **nicht** — er taugt für eine
Grundlinie der Köpfe, **nicht** für die Schritte P1-2, P1-4, P1-5.

---

### Block 0 — die Frage, VOR dem Ausrollen (P1 Schritt 6, Risiko R7)

> Gibt es an Cloudflare oder Traefik eine Regel, die den zweiten, internen Aufruf auf
> `iuk-ue.de/m/<key>/…` **braucht oder erwartet** — eine WAF-Regel, eine Cache-Regel, ein
> Page-Rule-Ziel, eine Traefik-Middleware?

Ein „nein" ist die Freigabe. Ein „ja" hält das Ausrollen an, und der Plan wird geändert, bevor
etwas passiert. (Die Cloudflare- und Traefik-Konfiguration liegt nicht in diesem Repo; von hier aus
ist die Frage nicht beantwortbar.)

**Antwort:** ⬜ ______________________________  **Datum:** ⬜ __________

---

### Block 1 — die Vorher-Messungen (P1 Schritte 1–5)

⛔ **Diese fünf laufen VOR dem Ausrollen. Nicht nachholbar.**

#### P1-1 · ⬜ P-L1 — welche Modul-Hosts überhaupt gesetzt sind

```bash
cd $SUITE_STACK_DIR      # das Verzeichnis mit der compose.yaml
rtk grep '^SUITE_HOST_' .env
```

**Erwartet:** eine Liste wie `SUITE_HOST_FILES=share.iuk-ue.de,drop.iuk-ue.de`,
`SUITE_HOST_FEEDBACK=da.iuk-ue.de`, `SUITE_HOST_QR=…`, `SUITE_HOST_LAGERBUCH=…`,
`SUITE_HOST_AUFGABEN=…`. Die Namen `share`, `drop`, `qr`, `da`, `aufgaben`, `lagerbuch` stammen aus
der Messung vom 22.08., **nicht** aus dem Repo — die Vorlage `.env.example:107-112` führt sie
auskommentiert. Ohne diese Liste weiß niemand, gegen welche Hosts der Rest misst.

**Ergebnis:** ⬜ ______________________________  **Datum:** ⬜ __________

#### P1-2 · ⬜ P-L2 — die Zahl der Traefik-Zeilen für EINE Anfrage

Traefik-Accesslog mitlesen (`docker compose logs -f traefik` bzw. `tail -f` auf die Logdatei), dann
in einem zweiten Fenster **genau eine** externe Anfrage:

```bash
rtk curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://<modulhost>/
# Zur Kontrolle, gleiches Kommando gegen den Apex:
rtk curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://iuk-ue.de/
```

**Erwartet vorher: 2 Zeilen** für den Modul-Host (äußere + innere Anfrage), **1 Zeile** für den
Apex. Die beiden Zeilen **wörtlich** notieren — sie sind der Beleg.
⚠️ `curl`, nicht der Browser: ein Browser stellt Dutzende Nebenanfragen.

**Ergebnis:** ⬜ ______________________________  **Datum:** ⬜ __________

#### P1-3 · ⬜ P-L3 — was der Handler heute als Host sieht

Ohne Codeänderung ist der einzige belastbare Weg die **Wirkung**:

```bash
rtk curl -sS https://<files-host-1>/ | head -40      # z. B. share
rtk curl -sS https://<files-host-2>/ | head -40      # z. B. drop
rtk curl -sS https://<lagerbuch-host>/ | head -40
rtk curl -sS https://iuk-ue.de/m/lagerbuch/ | head -40
```

**Erwartet:** die beiden `files`-Hosts zeigen **verschiedene** Rollen (`share` gegen `drop`,
`src/app/m/files/_lib/hostRolle.ts:91`); der `lagerbuch`-Riegel (`_lib/host.ts:43`) unterscheidet
zwischen seinem Host und dem Apex-Pfad. **Beobachtung wörtlich notieren, nicht bewerten.**

**Ergebnis:** ⬜ ______________________________  **Datum:** ⬜ __________

#### P1-4 · ⬜ P-L4 — die Latenz-Differenz

Zehnmal je Ziel, dasselbe Kommando, direkt hintereinander, von derselben Stelle:

```bash
for i in (seq 10); rtk curl -sS -o /dev/null -w '%{time_total}\n' https://<modulhost>/; end
for i in (seq 10); rtk curl -sS -o /dev/null -w '%{time_total}\n' https://iuk-ue.de/; end
```

(In bash: `for i in $(seq 10); do … ; done`.)

**Notieren: Median beider Reihen und die Differenz.** ⚠️ Nur die **Differenz** ist die Aussage —
absolute Zeiten hängen an Netz, Cache und Tageszeit und sind zwischen zwei Terminen nicht
vergleichbar. Das ist die Nachmessung zu „~100 ms"; die Zahl hat keine Quelle im Repo und wird
deshalb gemessen statt wiederholt.

**Ergebnis:** Median Modul-Host ⬜ ______  Median Apex ⬜ ______  Differenz ⬜ ______  **Datum:** ⬜ ______

#### P1-5 · ⬜ P-L5 — die Auditspalte aus zwei Netzen

Über einen `files`-Host je **eine** Zeile aus **zwei verschiedenen Client-Netzen** erzeugen
(z. B. Telefon über Mobilfunk und Rechner über WLAN — ein Download oder ein Upload über einen
Abgabelink), dann `client_ip_unbestaetigt` der beiden Zeilen lesen. Sichtbar in der Oberfläche
unter `src/app/m/files/(verwaltung)/shares/[id]/page.tsx:414`, geschrieben in
`src/app/m/files/_db/zaehler.ts:139` bzw. `src/app/m/files/api/u/[token]/upload/route.ts:581`.

**Erwartet vorher: zweimal DASSELBE Netz.** Das ist die Probe, die den Schaden am unmittelbarsten
zeigt.

**Ergebnis:** Netz 1 ⬜ __________  Netz 2 ⬜ __________  **Datum:** ⬜ __________

---

### Block 2 — ausrollen und nachmessen (P6)

#### P6-1 — ausrollen

Nach `docs/runbooks/auto-rollout.md`. ⚠️ **Vorher den laufenden Digest notieren**, er ist der
Rückweg (Risiko R1, Sekunden):

```bash
cd $SUITE_STACK_DIR
grep '^SUITE_IMAGE=' .env        # DIESEN Wert aufschreiben, bevor irgendetwas passiert
```

**Rückweg-Digest:** ⬜ ______________________________

Rückrollen (`auto-rollout.md`, Teil D2):

```bash
sed -i 's|^SUITE_IMAGE=.*|SUITE_IMAGE=ghcr.io/rubenvitt/iuk-suite@sha256:<alt>|' .env
docker compose up -d && docker compose ps
curl -s https://iuk-ue.de/api/health/portal      # Revision muss der alte Commit sein
```

**Ausgerollt am:** ⬜ __________  **Commit:** ⬜ __________

#### P6-2 · ⬜ P-L2 nachher — DIE ENTSCHEIDENDE PROBE

Dasselbe Kommando wie P1-2, derselbe Modul-Host, Traefik-Accesslog mitlesen:

```bash
rtk curl -sS -o /dev/null -w '%{http_code} %{time_total}\n' https://<modulhost>/
```

⛔ **Bestanden, wenn für eine externe Anfrage genau EINE Zeile entsteht** statt zwei. Das ist der
vollständige Beweis: keine zweite Zeile → kein zweiter Round-Trip → kein Selbst-Hop →
`cf-connecting-ip` ist die Adresse des echten Clients, weil Cloudflare sie für **diese** Anfrage
gesetzt hat.
⛔ **Nicht bestanden bei zwei Zeilen — auch dann, wenn die Seite normal aussieht.** Genau so sah sie
vorher auch aus (Risiko R6).

**Ergebnis:** Zeilen ⬜ ______  **Datum:** ⬜ __________

#### P6-3 · ⬜ P-L4 nachher — die Latenz

Zehn Läufe je Ziel, exakt wie P1-4. **Bestanden, wenn die Differenz Modul-Host minus Apex deutlich
kleiner ist als vorher** und beide Reihen sich annähern. Der Plan sagt keine Zahl voraus — er misst
die Aenderung der **Differenz**.

**Ergebnis:** Median Modul-Host ⬜ ______  Median Apex ⬜ ______  Differenz ⬜ ______  **Datum:** ⬜ ______

#### P6-4 · ⬜ P-L3 nachher — die host-abgeleiteten Stellen

Dieselben Abrufe wie P1-3, plus ein Feedback-Link:

```bash
rtk curl -sS https://<files-host-1>/ | head -40
rtk curl -sS https://<files-host-2>/ | head -40
rtk curl -sS https://<lagerbuch-host>/ | head -40
rtk curl -sS https://iuk-ue.de/m/lagerbuch/ | head -40
```

**Bestanden, wenn:** `share` und `drop` weiterhin **verschiedene** Rollen zeigen
(`files/_lib/hostRolle.ts:91`); der `lagerbuch`-Host-Riegel weiterhin unterscheidet
(`lagerbuch/_lib/host.ts:43`); ein Feedback-QR/-Link weiterhin den **Modul**-Host trägt — nicht
`iuk-ue.de` und nicht `0.0.0.0:3000` (`feedback/f/[slugSecret]/qr.png/route.ts:54-55`,
`feedback/_ui/Teilnahme.tsx:56-57`).

⛔ **Ein bestandener Schritt P6-2 bei gebrochenem P6-4 ist KEIN Erfolg, sondern der Rückkehrfall.**

**Ergebnis:** ⬜ ______________________________  **Datum:** ⬜ __________

#### P6-5 · ⬜ P-L5 nachher — die Auditspalte

Dieselben zwei Client-Netze wie in P1-5, derselbe Weg.
**Bestanden, wenn die beiden neuen Zeilen zwei VERSCHIEDENE Netze tragen.** Das ist die Abnahme, die
den Nutzen zeigt: „drei Downloads aus demselben Netz" ist wieder eine Aussage
(`src/app/m/files/_lib/ip.ts:8-12`).

**Ergebnis:** Netz 1 ⬜ __________  Netz 2 ⬜ __________  **Datum:** ⬜ __________

#### P6-6 · ⬜ P-L6 — optional, entfällt bei bestandenem P6-2

Die tatsächliche `initUrl`-Origin in Produktion (`https://0.0.0.0:3000` erwartet). Rein
diagnostisch; der Umbau hängt nicht daran.

---

### Block 3 — die Gegenproben (P6 Schritte 7–10), ohne Befund

| # | Was | Wie | Ergebnis |
|---|---|---|---|
| **P6-7** | Anmeldung, Abmeldung, Auffrischung | Von einem **Modul-Host** aus über Pocket ID anmelden (Weiterleitung, `state`/`pkce`/`nonce`-Cookies, Rückkehr, Sitzung steht), dann `/api/auth/oidc-signout`, dann eine Stunde später oder mit erzwungenem Refresh: die Gruppen kommen weiterhin an. ⛔ **Kein `curl`** — der Login-Weg ist nur im Browser echt | ⬜ |
| **P6-8** | Weiterleitungen und Cookies | Der `login`-Fall verhält sich **unverändert** (er ist bewusst nicht angefasst). Cookies tragen weiterhin die Domain aus `AUTH_COOKIE_DOMAIN` (`compose.yaml:83`), sichtbar in den Entwicklerwerkzeugen | ⬜ |
| **P6-9** | Weiche Navigation und Prefetch | ⚠️ **Nicht auslassen**, und nicht dasselbe wie P6-2: im Browser **innerhalb** eines Modul-Hosts navigieren (Links, Zurück-Knopf, ein Formular mit `redirect()` in einer Server Action), Netzwerkspur auf 404/500 durchsehen. Grund: `NEXT_REWRITTEN_PATH`/`NEXT_REWRITTEN_QUERY` entstehen jetzt erstmals (`adapter.js:338`, `:352-360`). Ein Erstabruf per `curl` sieht davon nichts | ⬜ |
| **P6-10** | Ein anonymer Weg je Modul | Ein `files`-Downloadlink, ein `feedback`-Teilnahmelink, ein `qr`-Aufruf, ein `lagerbuch`-Etikettencode (`t/[code]/route.ts`) — dort verdeckt kein Login die Fehler | ⬜ |

⚠️ **Nach dem Ausrollen mindestens zwei Stunden hinsehen**, nicht zwei Minuten: Risiko R5
(Sitzungsauffrischung) zeigt sich verzögert, um bis zu eine Stunde.

**Das Tor von P6:** Schritte 2, 4, 5 **bestanden** und Schritte 7–10 **ohne Befund**.

---

### Danach, einmalig

`.superpowers/sdd/VORARBEIT-selfhop.md` bekommt den Nachtrag: nach bestandener Abnahme sind seine
beiden Leerstellen L1 („wie die eigene Egress-IP zur Laufzeit erkannt wird") und L2 („welche
internen Hops es wirklich gibt") **gegenstandslos** — es gibt keinen Selbst-Hop mehr zu erkennen.
Damit entfällt auch die Betreiberentscheidung `SUITE_EGRESS_IP`. Was bleibt: die Verteidigung gegen
einen **künftigen zweiten** Rewrite- oder Proxy-Pfad, D6 (Direktzugriff an Cloudflare vorbei), und
der `"unknown"`-Rückfall. Empfehlung des Plans: Posten 2 danach **neu bewerten**, nicht automatisch
bauen — ein Rewrite-Origin-Riegel (ein Test, der verbietet, dass `NextResponse.rewrite` je mit einer
**fremden** Origin aufgerufen wird) wäre die billigere und wartungsfreie Antwort. Das ist ein
eigener Posten, ausdrücklich nicht Teil dieses Plans.
