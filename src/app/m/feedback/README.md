# Modul `feedback`

Anonyme Rückmeldungen zu Dienstabenden. Zwei Hälften:

- **öffentlich, login-frei**: `f/[slugSecret]/` — der Bogen, die Danke-Seite, der QR-Code.
- **angemeldet**: `(admin)/` — Gruppen, Dienstabende, Auswertung, Export.

Eigene SQLite-Datenbank (`_db/`, Migrationen in `_db/migrations`). Skala ist die deutsche
**Schulnote 1–6, invertiert** (1 = sehr gut). `stars` (1–5) existiert ausschließlich im **Lesepfad**
importierter Alt-Umfragen; neue Umfragen erzeugen nur `schulnote` + `text`.

## Was die Anonymitätszusage zusagt — und wo der Code das hält

Der Bogen (`f/[slugSecret]/Zettel.tsx`, Konstante `KURZZUSAGE`) sagt über dem Absende-Knopf:

> „Anonym — kein Name, kein Gerät, keine Uhrzeit."

Das ist seit dem 26.07.2026 die **einzige** Anonymitätszusage im Bogen. Vorher stand darüber hinaus
ein dreisätziges Siegel im Abschluss-Block (`page.tsx`, Prop `siegel`); es sagte dasselbe länger und
ist entfallen. Jeder Halbsatz hat eine Deckung im Code. **Wer eine dieser Stellen ändert, ändert eine
Zusage an Teilnehmende und muss den Satz mitändern — nicht stillschweigend seine Bedeutung.**

| Zusage | Deckung |
|---|---|
| kein Name | `responses` trägt nur `survey_id`, `answers`, `submitted_at` (`_db/schema.ts`). Der öffentliche Pfad hat keine Sitzung — damit auch keine E-Mail. |
| **kein Gerät** (Geräte- oder IP-Kennung) | siehe unten. |
| keine Uhrzeit | `insertResponse` schreibt `evening.date` (Mitternacht UTC) als `submitted_at`, nicht `now` (`actions.ts`, `submitResponseAction`). Der CSV-Export gibt in der Spalte „Abendtag" (früher „Zeitstempel" — der Name versprach eine Genauigkeit, die die Ausgabe nicht mehr hat) den **Abendtag** aus — auch für importierte Antworten, deren Wert in der Datenbank aus Gründen der Import-Parität sekundengenau bleibt. |
| *(nicht mehr im Bogen behauptet:)* Texte in zufälliger Reihenfolge | `shuffleStable` (`_lib/aggregation.ts`) — deterministische Durchmischung nach FNV-1a-Hash der Antwort, entkoppelt von der Eingangsreihenfolge. Auswertung UND Export benutzen dieselbe Ordnung. Das entfallene Siegel sagte es ausdrücklich zu; der kurze Satz tut es nicht. Die Durchmischung bleibt trotzdem **verbindlich**: bei ~15 Personen ist die Eingangsreihenfolge allein ein Deanonymisierungskanal, und der KI-Prompt der Auswertung bildet je Person einen Block mit allen Noten und Texten. Ein Test in `auswertung/page.test.tsx` nagelt das fest. |

## Die IP: nur Ratenbegrenzung, flüchtig, nie an der Antwort

Der anonyme Abgabepfad liest die Client-IP (`clientIpAus()` aus `@/core/ratelimit`: `cf-connecting-ip`,
sonst der konstante Sammelwert `"unknown"` — seit der CWE-348-Umstellung wird `x-forwarded-for` in
keiner Richtung mehr gelesen). Sie wird **ausschließlich** als Schlüssel der
Ratenbegrenzung verwendet:

- `RateLimiter` (`@/core/ratelimit`) hält die Treffer in einer **`Map` im Prozessspeicher** —
  flüchtig, pro Prozess, kein Datenbankschreibvorgang, keine Datei, kein Log.
- Zwei getrennte Zähler: `tokenGuard` (Schlüssel = IP) zählt nur **Fehlversuche** mit ungültigem
  Token/Secret; `submitLimiter` (Schlüssel = `${ip}|${surveyId}`) begrenzt echte Abgaben weit genug,
  dass 15 Personen aus einem Vereins-WLAN hinter einer NAT-IP alle durchkommen.
- Die IP wird **nie** an der Antwort gespeichert: `responses` hat keine Spalte dafür, und
  `insertResponse` bekommt sie nicht übergeben.

Damit ist „keine Geräte- oder IP-Kennung" belegt und keine bloße Behauptung.

> **Auflage:** Kommt irgendwann ein **persistenter** Limiter (Tabelle, KV, Redis) mit einer
> IP-Spalte, dann trifft der Halbsatz „keine Geräte- oder IP-Kennung" nicht mehr zu. Dann ist der
> **Siegeltext zu ändern** (beide zugelassenen Fassungen in
> `docs/design/feedback-oeffentliche-ansicht.md`, Abschnitt 3.9, tragen diesen Halbsatz — es braucht
> also einen neuen Wortlaut) und nicht der Satz zu behalten, während sich seine Bedeutung ändert.

## Zwei Fallen, die schon Blut gekostet haben

- **Fristen** kommen ausschließlich aus `computeClosesAt(evening.date, hours)` (`_lib/lifecycle.ts`),
  **niemals** aus „jetzt + Stunden". `computeClosesAt` rechnet vom Abend-TAG (Ende des lokalen
  Kalendertags + Stunden). Wer `now` übergibt, hängt die Frist an den Klickzeitpunkt.
- **Öffentlicher Host**: `req.url` trägt nach dem Middleware-Rewrite die interne Adresse, und `host`
  trägt hinter einem Reverse-Proxy dessen eigenen Namen. Jede öffentlich sichtbare URL (QR-Code,
  Kopierzeile) löst den Host über `resolveHost` aus `core/routing` auf — `x-forwarded-host` vor
  `host`. Ein QR-Code ist ein Druckstück; ein falscher Host darin fällt erst an der Wand auf.

## „Ehrlich gesagt" — der Kummerkasten (IDA-314)

Ein Kasten für die ganze Bereitschaft: anonyme oder namentliche Mitteilungen an die Vertrauenspersonen.
Entscheidungen stehen an IDA-309 (POC) und IDA-314 in Zunder.

- **Öffentlich:** `k/<secret>` (Einwurf), `k/abholen` (Antwort unter dem Abholcode). Ohne Anmeldung, ohne
  antd, Optik des Abendzettels. `k/` ist eine vertrauliche Ansicht (`VERTRAULICHE_ANSICHTEN` in
  `core/registry.ts`: `no-store`, `noindex`, `no-referrer`).
- **Öffentliche Adresse (IDA-340):** `SUITE_EINSTIEG_HOST_EHRLICH` (Prod `ehrlich-gesagt.iuk-ue.de`, lokal
  `ehrlich-gesagt.localtest.me`) ist ein Einstiegshost (`EINSTIEGSHOSTS` in `core/registry.ts`): jeder Pfad
  geht nach `k/…`, die Wurzel ist der Einwurf ohne Secret (`k/page.tsx`, nur auf diesem Host). Aushang und
  QR-Code zeigen dann diese Adresse; Secret-Links gelten weiter. Nicht in `SUITE_HOST_FEEDBACK` eintragen.
  Gegen Bots: Honigtopf-Feld und Cloudflare Turnstile (`_lib/ehrlich/turnstile.ts`, aktiv mit
  `TURNSTILE_SITE_KEY` und `TURNSTILE_SECRET`, optional `TURNSTILE_HOSTNAMES`), für beide Einwurfwege.
- **Verwaltung:** `(admin)/ehrlich-gesagt` und der Druck `(print)/ehrlich-gesagt-aushang`. Riegel ist allein
  die Lesegruppe (`_lib/ehrlich/zugang.ts`, Vorgabe `kummerkasten-leser`, `SUITE_LESER_GROUP_FEEDBACK`) —
  **nicht** `feedback-admin` und nicht der Suite-Betrieb. Damit die Vertrauenspersonen das Modul betreten,
  steht die Gruppe in `requiredGroups` von `feedback`; wer `SUITE_ACCESS_GROUP_FEEDBACK` setzt, nimmt sie mit
  auf. Ohne Zuordnung sieht die Lesegruppe dabei keine Dienstabend-Gruppe (`accessibleGroupFilter`).
- **Namen auf dem Einwurf:** live aus Pocket ID (`_lib/ehrlich/leser.ts`, `POCKET_ID_API_*`), fünf Minuten
  zwischengespeichert. Antwortet Pocket ID nicht, fällt die Zeile weg, statt Namen zu erfinden.
- **Push:** über die Abos von „Was steht an" (Sofort-Schritt, `_lib/faelligkeiten.ts`), Art „Ehrlich gesagt",
  nur an die Lesegruppe, ohne Inhalt und gebündelt am Folgetag ab 8 Uhr — ein Push gleich nach dem Einwurf
  verriete die Uhrzeit.
- **Löschfrist:** erledigte Mitteilungen 12 Monate nach dem Erledigt-Tag (`_lib/ehrlich/hintergrund.ts`).

| Zusage auf dem Einwurf | Deckung |
|---|---|
| kein Name (anonym) | `name`/`kontakt` werden nur beim Antwortweg „mit Namen" geschrieben (`legeMitteilungAn`). |
| kein Konto | der öffentliche Pfad hat keine Sitzung; Mitteilungen und Gespräch sind im Audit `anonymous` (Migration 0004: fester Akteur, kein Objektbezug). |
| keine IP | wie oben unter „Die IP": nur Schlüssel der flüchtigen Limiter in `_lib/ehrlich/aktionen.ts`. |
| keine Uhrzeit | `tag` ist ein Kalendertag `JJJJ-MM-TT`; auch der Push-Merker `gemeldet` ist ein Wahrheitswert, kein Zeitpunkt, und der Push kommt erst am Folgetag (`MELDESTUNDE`). |

`_lib/ehrlich/aktionen.test.ts` hält die Zusage gegen die echte Aktion fest. Der Abholcode steht nie im
Klartext in der Datenbank (nur SHA-256), die Verwaltung sieht ihn also nicht. Gegen jemanden mit Zugriff auf die
Datenbank schützt der Hash bei 14,4 Mio. möglichen Codes nicht.
