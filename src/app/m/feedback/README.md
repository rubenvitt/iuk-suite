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

Der anonyme Abgabepfad liest die Client-IP (`clientIp()` in `actions.ts`: `cf-connecting-ip`, sonst
der erste Wert aus `x-forwarded-for`). Sie wird **ausschließlich** als Schlüssel der Ratenbegrenzung
verwendet:

- `RateLimiter` (`_lib/ratelimit.ts`) hält die Treffer in einer **`Map` im Prozessspeicher** —
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
