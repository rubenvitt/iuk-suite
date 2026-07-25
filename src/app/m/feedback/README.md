# Modul `feedback`

Anonyme Rückmeldungen zu Dienstabenden. Zwei Hälften:

- **öffentlich, login-frei**: `f/[slugSecret]/` — der Bogen, die Danke-Seite, der QR-Code.
- **angemeldet**: `(admin)/` — Gruppen, Dienstabende, Auswertung, Export.

Eigene SQLite-Datenbank (`_db/`, Migrationen in `_db/migrations`). Skala ist die deutsche
**Schulnote 1–6, invertiert** (1 = sehr gut). `stars` (1–5) existiert ausschließlich im **Lesepfad**
importierter Alt-Umfragen; neue Umfragen erzeugen nur `schulnote` + `text`.

## Was das Anonymitätssiegel zusagt — und wo der Code das hält

Der Siegeltext auf dem Bogen (`f/[slugSecret]/page.tsx`) lautet:

> „Diese Rückmeldung ist anonym. Gespeichert werden nur deine Noten und deine Texte — kein Name,
> keine E-Mail, keine Geräte- oder IP-Kennung, keine Uhrzeit. Die Gruppenleitung sieht Durchschnitte
> und die Texte in zufälliger Reihenfolge, nie eine Person."

Jeder Halbsatz hat eine Deckung im Code. **Wer eine dieser Stellen ändert, ändert eine Zusage an
Teilnehmende und muss den Siegeltext mitändern — nicht stillschweigend seine Bedeutung.**

| Zusage | Deckung |
|---|---|
| kein Name, keine E-Mail | `responses` trägt nur `survey_id`, `answers`, `submitted_at` (`_db/schema.ts`). Der öffentliche Pfad hat keine Sitzung. |
| **keine Geräte- oder IP-Kennung** | siehe unten. |
| keine Uhrzeit | `insertResponse` schreibt `evening.date` (Mitternacht UTC) als `submitted_at`, nicht `now` (`actions.ts`, `submitResponseAction`). Der CSV-Export gibt in der Spalte „Abendtag" (früher „Zeitstempel" — der Name versprach eine Genauigkeit, die die Ausgabe nicht mehr hat) den **Abendtag** aus — auch für importierte Antworten, deren Wert in der Datenbank aus Gründen der Import-Parität sekundengenau bleibt. |
| in zufälliger Reihenfolge | `shuffleStable` (`_lib/aggregation.ts`) — deterministische Durchmischung nach FNV-1a-Hash der Antwort, entkoppelt von der Eingangsreihenfolge. Auswertung UND Export benutzen dieselbe Ordnung. |

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
