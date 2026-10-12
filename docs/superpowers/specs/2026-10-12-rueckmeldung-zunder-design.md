# Rückmeldungen nach Zunder statt ins ClickUp-Formular — Konzept

- **Datum:** 2026-10-12
- **Status:** freigegeben (12.10.2026)
- **Bezug:** `core/rueckmeldung` (DRK-453), Zunder-Spec `rubenvitt/zunder:docs/superpowers/specs/2026-10-11-zunder-design.md`,
  Zunder-Vertrag `rubenvitt/zunder:docs/superpowers/plans/2026-10-11-zunder-implementation.md`
- **Aufgabe:** IDA-214, https://zunder.rubeen.dev/#/aufgabe/xhmv7vsbsr2kpuh54o8kxzvh
- **Frist:** ClickUp wird Ende November 2026 gekündigt; bis dahin muss der Rückmeldeweg ohne ClickUp laufen.

## 1. Ausgangslage

### Heute in der Suite

Der Rückmeldeweg ist ein **Link auf ein ClickUp-Formular**, eingestellt über `SUITE_RUECKMELDUNG_URL`
(`core/rueckmeldung/konfiguration.ts`, Funktion `rueckmeldungUrl`). Nicht gesetzt = aus. Es gibt drei
Einstiege, alle öffnen das Formular in einem neuen Tab:

| Einstieg | Ort | Sichtbar |
|---|---|---|
| „Feedback geben" im Nutzermenü | `core/shell/SuiteNav.tsx` (Wert aus `SuiteHeader`) | jede Seite mit Suite-Kopfzeile, nur angemeldet |
| Kachel „Rückmeldung" | `portal/_ui/RueckmeldungKarte.tsx` | Portal-Startseite |
| Schwebender Knopf „Feedback" | `core/rueckmeldung/RueckmeldungKnopf.tsx` (in `FullShell`) | Arbeitsflächen, bis einmal benutzt oder weggeklickt (`zustand.ts`) |

Was dieser Weg **nicht** kann, steht schon im Code: Die Suite erfährt nie, ob aus dem Klick eine
Rückmeldung wurde (`zustand.ts`), das Formular kennt weder die Seite noch das Modul noch die Version,
und es sieht aus wie ClickUp, nicht wie die Suite.

### Was Zunder mitbringt

- Aufgaben mit `title`, `description` (Markdown), `type` (`bug`/`feature` nur in Dev-Projekten),
  `links`, Kommentaren und einer festen Kennung (`IDA-42`), die beim Verschieben bleibt.
- Das Board „IDA" ist ein Dev-Projekt (Schlüssel `IDA`, Repo `rubenvitt/iuk-suite`).
- Schreiben von außen geht heute nur über **API-Tokens** (`zt_…`) an `/api/sync/push` oder `/mcp`.

### Was Zunder nicht hat — und was daraus folgt

1. **Ein Token darf alles.** Die Tabelle `api_tokens` kennt keinen Umfang; jeder Token liest und
   schreibt jede Aufgabe in jedem Bereich (Vertrag 3.1, „Alle Zugangswege handeln als dieser
   Besitzer"). Die Instanz enthält neben dem Ehrenamt auch alle privaten Lebensbereiche.
2. **Zunder hat einen einzigen Nutzer.** DRK-Mitglieder können sich dort nicht anmelden, und das
   soll so bleiben (Spec 1: keine Rollen, keine Einladungen).
3. **Keine Anhänge.** Ein Bildschirmfoto hat in Zunder keinen Platz.

Punkt 1 entscheidet das ganze Konzept: Die Suite ist ein Server, den viele Menschen benutzen. Läge dort
ein normaler Zunder-Token, wäre jede Lücke in der Suite eine Lücke in Rubens gesamter
Aufgabenverwaltung. **Die Suite bekommt deshalb keinen normalen Token, sondern einen Eingang, der nur
einwerfen kann.**

## 2. Ziel und Nicht-Ziele

**Ziel:** Wer in der Suite angemeldet ist, schreibt eine Rückmeldung in einem Formular der Suite. Sie
landet als Aufgabe in Zunder, mit dem Kontext, den heute niemand mitliefert (Modul, Seite, Version,
Browser), und die Person bekommt eine Nummer zurück, auf die sie sich beziehen kann.

**Erfolgskriterien**

1. Kein Weg der Suite führt mehr zu ClickUp; `SUITE_RUECKMELDUNG_URL` ist abgebaut.
2. Der Zugang der Suite zu Zunder kann **nichts lesen** und **nur an genau einer Stelle** anlegen.
3. Fällt Zunder aus, geht keine Rückmeldung still verloren: entweder angenommen oder sichtbar
   abgelehnt, der Text bleibt stehen.
4. Rubens persönliche Inbox in Zunder bleibt bei null; Rückmeldungen landen nicht dort.

**Nicht-Ziele (erste Ausbaustufe):** Anhänge und Bildschirmfotos, Rückmeldungen von anonymen Seiten
(öffentliches Feedback, Freigaben, Kiosk), eine Statusanzeige „Meine Rückmeldungen" (Etappe 4),
Rückfragen per E-Mail (es wird keine E-Mail-Adresse mitgeschickt).

## 3. Überblick

```
 Suite (angemeldet)                       Suite-Server                         Zunder
 ┌──────────────────────┐   Server    ┌──────────────────────────┐  HTTPS   ┌─────────────────────────┐
 │ Flyin „Feedback"     │──Action────▶│ sendeRueckmeldung()      │─────────▶│ POST /intake/v1/tasks   │
 │ (Menü, Knopf, Kachel)│             │ • Sitzung prüfen         │ Bearer   │ • nur Eingangs-Token zi_│
 │ Art, Titel, Text,    │◀────────────│ • Grenzen, Takt          │  zi_…    │ • feste Stelle: Projekt │
 │                      │ {ok, ref}   │ • Kontext anreichern     │◀─────────│   „IDA Eingang"         │
 └──────────────────────┘             │                          │ {id,ref} │ • Quelle intake:suite   │
                                      └──────────────────────────┘          └─────────────────────────┘
                                                                                 │ Triage (Ruben):
                                                                                 ▼ verschieben nach „IDA"
                                                                                   oder verwerfen
```

Die Suite schickt an einen **Eingang** in Zunder: eine eigene Adresse mit eigenem Token, die nur
anlegen kann, nichts lesen, und nur an einer festen Stelle (Projekt „IDA Eingang", Schlüssel `IDAE`).
Wie Zunder das baut, steht in Zunder, nicht hier. Dieser Abschnitt hält nur fest, worauf sich die Suite
verlässt.

## 4. Was die Suite vom Zunder-Eingang erwartet

`POST <SUITE_RUECKMELDUNG_ZUNDER_URL>/intake/v1/tasks`, `Authorization: Bearer zi_…`, JSON:

| Feld | Pflicht | Was die Suite schickt |
|---|---|---|
| `external_id` | ja | ID der Rückmeldung aus der Suite, `[A-Za-z0-9_-]`, ≤ 128 Zeichen |
| `title` | ja | Titel aus dem Formular, ≤ 200 Zeichen |
| `description` | nein | Markdown nach Vorlage 5.4 |
| `type` | nein | `bug`, `feature` oder `aufgabe` |
| `links` | nein | genau ein Link: die Seite, von der aus gemeldet wurde |

| Antwort | Bedeutung für die Suite |
|---|---|
| `201` / `200` `{"id","ref"}` | angenommen; `200` heißt „diese `external_id` kannte Zunder schon", also eine Wiederholung |
| `400` | Eingabe abgelehnt; die Meldung wird nicht angezeigt, der Text bleibt stehen |
| `401` / `409` | Eingang falsch eingerichtet; Warnung ins Serverlog |
| `429` | zu viele Einwürfe; „später noch einmal" |
| `5xx`, Zeitüberschreitung | einmal wiederholen mit derselben `external_id`, dann Fehler anzeigen |

## 5. Suite: Formular statt Link

### 5.1 Konfiguration

| Variable | Bedeutung |
|---|---|
| `SUITE_RUECKMELDUNG_ZUNDER_URL` | Basis-URL, z. B. `https://zunder.rubeen.dev` |
| `SUITE_RUECKMELDUNG_ZUNDER_TOKEN` | Eingangs-Token `zi_…`; **Geheimnis**, erreicht nie den Browser |
| `SUITE_RUECKMELDUNG_URL` | bleibt für den Übergang: alter Link-Weg |

`rueckmeldungUrl()` wird zu `rueckmeldeweg()` und liefert einen von drei Zuständen:

```ts
type Rueckmeldeweg = { art: "formular" } | { art: "link"; url: string } | null;
```

- Beide Zunder-Variablen gesetzt und brauchbar → `formular`. Das Ergebnis trägt **keinen** Token; die
  Server Action liest ihn selbst.
- Sonst `SUITE_RUECKMELDUNG_URL` gesetzt → `link` (heutiges Verhalten).
- Sonst `null` (aus).
- Nur eine der beiden Zunder-Variablen gesetzt → `null` bzw. `link`, mit einer Warnung je Prozess
  (dieselbe Sperre wie heute).

Die Regeln aus dem Kopf von `konfiguration.ts` gelten weiter: kein `"use client"` (Falle 6), kein
`NEXT_PUBLIC_*`, `https` Pflicht für die Zunder-URL (außer `http://localhost` in der e2e).

### 5.2 Server Action `sendeRueckmeldung`

Neue Datei `core/rueckmeldung/senden.ts` mit `"use server"`. Ablauf:

1. **Sitzung prüfen** (`auth()`), ohne Anmeldung → Ablehnung. Kein Auffrischen hier (Regel in
   `CLAUDE.md`, „Zugriffsschutz").
2. **Eingaben prüfen:** Art ∈ `fehler | idee | sonstiges`, Titel 3–120 Zeichen, Text ≤ 5 000 Zeichen,
   Kontextfelder mit festen Längen. Der Kontext aus dem Browser ist nur eine Angabe, keine Prüfgröße.
3. **Takt:** höchstens 5 Rückmeldungen je Person und Stunde, im Prozessspeicher (ein Neustart setzt ihn
   zurück, das ist hinnehmbar).
4. **Aufgabe bauen** (Vorlage 5.4), `external_id` = CUID2 aus der Suite, vom Client mitgeschickt, damit
   ein Doppelklick dieselbe ID trägt.
5. **An Zunder schicken** mit 8 s Zeitlimit, bei Netzfehler oder `5xx` einmal wiederholen (gleiche
   `external_id`).
6. Ergebnis `{ ok: true, ref }` oder `{ ok: false, grund }` mit einem deutschen Satz für die Oberfläche.

Die Action wird im Client direkt importiert, nie als Prop gereicht (Falle 9).

Bewusst **kein Audit-Ereignis**: das Audit-Protokoll kennt nur feste Aktionsarten, und eine neue
hieße Katalog, Beschriftungen und Abdeckungsliste mit umzubauen. Wer was gemeldet hat, steht in der
Zunder-Aufgabe.

### 5.3 Oberfläche

**Ein Flyin, drei Einstiege.** Das Formular ist eine `Drawer`, montiert einmal in der Client-Insel der
Kopfzeile (`SuiteNav`), weil die Kopfzeile auf jeder angemeldeten Seite steht. Die drei Einstiege öffnen
es über einen kleinen Speicher nach dem Muster von `zustand.ts` (`oeffneRueckmeldung()`):

- Nutzermenü „Feedback geben" → öffnet das Flyin statt eines Links.
- Schwebender Knopf → öffnet das Flyin; die Erledigt-Logik bleibt (Klick = erledigt).
- Portal-Kachel → bleibt optisch gleich, wird aber ein Knopf in einer Client-Insel. `e2e/portal.spec.ts`
  misst `portal-kachel-link`; die Klasse bleibt am äußeren Element.

Im Zustand `link` bleibt alles wie heute.

Das Flyin bleibt auf der Arbeitsfläche: Wer mitten in einer Buchung ist, verliert sie nicht (der Grund,
aus dem der Link heute einen neuen Tab öffnet).

**Inhalt:**

| Element | Ausgestaltung |
|---|---|
| Art | `Segmented` oder Radio: „Etwas klappt nicht" / „Idee oder Wunsch" / „Sonstiges" |
| Worum geht's? | `Input`, Pflicht, 120 Zeichen |
| Beschreibung | `Input.TextArea` mit Zählerangabe; Platzhalter „Was hast du gemacht, was ist passiert, was hättest du erwartet?" |
| Hinweis | „Bitte keine Patienten- oder Einsatzdaten eintragen." |
| Mitgeschickt | aufklappbar: Modul, Seite, Version, Browser — genau das, was in Zunder ankommt |
| Senden | Primärknopf; während des Sendens gesperrt |
| Erfolg | `Result`: „Danke! Deine Rückmeldung hat die Nummer IDAE-12." und „Schließen" |
| Fehler | Meldung mit dem Satz aus der Action, Text bleibt stehen, „Nochmal senden" |

**Fallen, die hier zuschlagen:**

- Falle 4: kein `size` an Bedienelementen; die Dichte kommt aus der Shell.
- Falle 13: Breite über `flyinBreite()`.
- Falle 24: `autoFocus={false}`, `focusable={{ focusTriggerAfterClose: false }}`, Fokus nach dem Muster
  von `kommplan/_ui/fokus.ts` ins Titelfeld.
- Falle 3: Fehler nicht als rote Fläche — `colorError` ist die Primärfarbe.
- Entwurf: Titel und Text liegen bis zum Erfolg in `sessionStorage` (in `try`/`catch`), damit ein
  Fehlschlag oder ein versehentliches Schließen nichts kostet.

### 5.4 Vorlage der Aufgabe in Zunder

`type`: `fehler` → `bug`, `idee` → `feature`, `sonstiges` → `aufgabe`.
`title`: der Titel aus dem Formular, unverändert.
`description`:

```markdown
<Text aus dem Formular>

---

**Gemeldet von:** Max Mustermann
**Modul:** Lagerbuch (`lagerbuch`) · **Seite:** `/m/lagerbuch/inventur`
**Version:** 1.42.0 (`a1b2c3d`) · **Zeit:** 12.10.2026, 18:04
**Browser:** Firefox 141 · 1280×800 · Dunkel
**Eingang:** iuk-suite, Rückmeldung `tz4a98xxat96iws9zmbrgj3a`
```

`links`: die Seite, von der aus gemeldet wurde (volle URL ohne Query-String).

Regeln für den Kontext:

- **Seite ohne Query-String.** Parameter können Kennungen oder Freigabe-Schlüssel tragen.
- **Zeit** über `zeitFormat()` aus `core/zeit`, nie mit festem `timeZone`.
- **Version** aus `laufendeVersion()`/`laufendeRevision()` (`core/version.ts`), serverseitig, nicht
  aus dem Browser.
- **Nur der Anzeigename**, nie die E-Mail-Adresse (Entscheidung vom 12.10.2026). Rückfragen laufen
  persönlich über die Bereitschaft.

### 5.5 Tests in der Suite

- `konfiguration.test.ts`: drei Zustände, halbe Einrichtung, Warnsperre, voller `zt_`-Token wird
  abgelehnt, der Token steht nicht im Ergebnis.
- `eingabe.test.ts`, `vorlage.test.ts`, `takt.test.ts`: Feldgrenzen, Vorlage (Query fällt weg, keine
  E-Mail-Adresse), 5 je Person und Stunde.
- `zunder.test.ts`: `201`/`200`/`400`/`401`/`409`/`429`/`5xx`, Zeitlimit, eine Wiederholung mit
  derselben `external_id`.
- `senden.test.ts`: ohne Sitzung, ohne Eingang, Name aus der Sitzung statt aus der Eingabe, Takt.
- `RueckmeldungFlyin.test.tsx`, `RueckmeldungKnopf.test.tsx`, `SuiteNav.test.tsx`: Öffnen, Senden,
  Fehler behält den Text, Entwurf, dieselbe ID beim zweiten Versuch.
- `einbindung.test.ts`: Direktiven, `eingang.ts` nur von Konfiguration und Server Action geladen,
  Client-Module importieren die Konfiguration nur als Typ, Abschaltung in der normalen e2e.
- e2e `rueckmeldung.spec.ts` mit `scripts/fake-zunder.mjs` (Port `E2E_PORTS.zunder`): drei
  Einstiege, Einwurf kommt an (Name ja, E-Mail nein, Query nein), Ausfall behält den Text, Token nicht
  im HTML, sofortiges Tippen landet im Titel (Falle 24), 320px (Falle 13).

### 5.6 Release Notes

Ein neues Feature, also Pflicht (Datei unter `notizen/portal/`), etwa:

> Feedback schreibst du jetzt direkt in der Suite: Nutzermenü → Feedback geben. Die Seite, auf der du
> gerade bist, wird mitgeschickt, und du bekommst eine Nummer, unter der wir deine Rückmeldung finden.

## 6. Triage in Zunder

1. Neue Rückmeldungen stehen im Projekt **„IDA Eingang"** (Board, Status `open`).
2. Je Rückmeldung: übernehmen → `move_task` nach „IDA" (Kennung bleibt, z. B. `IDAE-12`); doppelt oder
   nicht umsetzbar → `dropped` mit kurzem Kommentar; unklar → `blocked` und persönlich nachfragen.
3. Ein Eingang mit null offenen Aufgaben ist das Ziel, wie bei der Inbox. Eine wöchentliche Sichtung
   reicht; Ehrenamt-Rückmeldungen sind wichtig, aber selten dringend.

Projekt anlegen: Bereich „Ehrenamt (DRK Bereitschaft)", Art `dev`, Repo `rubenvitt/iuk-suite`,
Schlüssel `IDAE` (Vorschlag), Ansicht Board.

## 7. Etappen und Übergang

| Etappe | Repo | Inhalt | Größe |
|---|---|---|---|
| **E0** | Zunder | Eingang nach Abschnitt 4, Projekt „IDA Eingang" (`IDAE`), Kanal `iuk-suite` anlegen | S |
| **E1** | Suite | `rueckmeldeweg()`, Server Action, Flyin, drei Einstiege, Tests, Release Note. Hinter den neuen Variablen; ohne sie bleibt der Link | M |
| **E2** | Betrieb | Zunder-Variablen in der `.env` setzen, `SUITE_RUECKMELDUNG_URL` entfernen, ClickUp-Formular abschalten. Vor Ende November | — |
| **E3** | Suite | Link-Zweig und `SUITE_RUECKMELDUNG_URL` aus Code und `.env.example` entfernen; Kommentare, die das ClickUp-Formular nennen, nachziehen | S |
| **E4** (später) | beide | „Meine Rückmeldungen" mit Status über `GET /intake/v1/tasks/{external_id}` (nur eigene Einwürfe des Kanals); Bildschirmfoto in der Suite gespeichert und als Link angehängt | M |

E1 kann vor E0 fertig werden (der Zunder-Ersatz der e2e reicht zum Bauen); geschaltet wird erst nach E0.
Rückmeldungen, die bis zum Umstieg über das ClickUp-Formular kamen, liegen bereits in „IDA" — sie
wurden beim ClickUp-Import mit übernommen.

## 8. Verworfene Alternativen

| Alternative | Warum nicht |
|---|---|
| **Normaler API-Token + MCP `create_task`** — geht heute ohne Änderung an Zunder | Voller Lese- und Schreibzugriff auf alle Lebensbereiche von einem Server, den viele Menschen benutzen. Auch als Brücke nicht: ein Token, der „nur kurz" liegt, liegt lange. |
| **Normaler API-Token + Sync-Push** | Dasselbe Token-Problem, dazu müsste die Suite HLC und CUID2 erzeugen und die Validierung des Kerns spiegeln. |
| **Öffentliches Formular in Zunder** | Zunder hat bewusst keine öffentlichen Seiten und keinen Mehrbenutzerbetrieb; der Kontext der Suite (Modul, Seite, Person) ginge verloren, und Zunder bräuchte Spam-Schutz. |
| **Ziel: Zunder-Inbox** | Mischt Ehrenamt in die persönliche Triage und hält die Inbox nicht auf null. |
| **Ziel: direkt „IDA"** | Ungesichtete Meldungen stünden zwischen geplanter Arbeit; ohne Tags gäbe es kein sauberes Unterscheidungsmerkmal. |
| **Rückmeldungen nur in einer Suite-Datenbank** | Zweites Ticketsystem neben Zunder; geplant wird dort, wo die Arbeit steht. |
| **Ein Formular-Dienst eines Dritten** (Tally, Formbricks …) | Wieder ein fremdes Formular ohne Dunkelmodus und ohne Kontext; Formbricks wurde aus genau diesem Grund schon einmal abgelöst (`konfiguration.ts`). |

## 9. Entscheidungen vom 12.10.2026

1. **Von der meldenden Person kommt nur der Anzeigename an**, keine E-Mail-Adresse und kein
   Rückfrage-Häkchen.
2. **Schlüssel des Eingangsprojekts:** `IDAE`.
3. **Grenzen:** 5 Rückmeldungen je Person und Stunde in der Suite, 30 je Kanal und Stunde in Zunder.
4. **Oberfläche:** seitliches Flyin.

Offen bleibt nur, ob die meldende Person benachrichtigt wird, wenn ihre Rückmeldung erledigt ist —
das gehört zu E4.
