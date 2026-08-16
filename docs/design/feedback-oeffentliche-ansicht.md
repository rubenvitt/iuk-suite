<!-- Entscheidungsstand — dieser Kopf wurde nach dem Entwurfsverfahren ergänzt -->

# Öffentliche Feedback-Ansicht — verbindlicher Entwurf „Der Abendzettel"

**Status: entschieden und verbindlich.** Dieses Dokument entstand aus drei unabhängigen
Konkurrenzentwürfen, jeder von drei Juroren bewertet (Handwerk, Abschlussrate, Machbarkeit); es
enthält die Rangfolge, die Auflösung der Jury-Widersprüche und die umsetzungsreife Spezifikation.

**Die beiden in Abschnitt 4 offen gestellten Fragen sind entschieden — jeweils Option A:**

1. **Suite-Rot:** nur 3px-Fahne am Oberrand plus Wortzeichen „Sammelhaus". Kein roter Absenden-Knopf, kein
   roter Fokusring. Begründung: auf dieser Seite bedeutet Rot „Note 6 – ungenügend"; Marke am Rand und
   Bedeutung in der Mitte dürfen nie in vergleichbarer Fläche nebeneinander stehen.
2. **Anrede:** durchgehend „Du". Die acht Bewertungsfragen sind im Altbestand im Du formuliert und
   dürfen wegen der Vergleichbarkeit nicht umgeschrieben werden — „Sie" in den Rahmentexten wäre ein
   Stilbruch mitten auf der Seite.

**Anonymitäts-Wortlaut (revidiert 26.07.2026):** Im Bogen steht **ein Satz** — „Anonym — kein Name,
kein Gerät, keine Uhrzeit." Das dreisätzige Siegel (vormals Fassung A) ist entfallen, siehe §3.9. Die
beiden Code-Änderungen aus Abschnitt 3.9 sind umgesetzt und bleiben **verbindlich**, auch für den Teil,
den der kurze Satz nicht mehr behauptet.

**Wortzeichen (umbenannt 16.08.2026):** Das Wortzeichen lautet **„Sammelhaus"**. Bis dahin stand dort
„I&K" — die ältere Schreibweise findet sich noch in den datierten Berichten und Plänen unter
`docs/superpowers/`, die als Protokoll ihres Tages unverändert bleiben. Alles in DIESEM Dokument meint
das heutige Wortzeichen. Die Regel darüber ist von der Umbenennung unberührt: es bleibt Träger 2 von
genau zwei Stellen mit Suite-Rot, 13px in Gewicht 700, Text und niemals Fläche.

**Zielgruppe dieses Dokuments:** wer die Route `/f/**` baut oder ändert. Was daran modulübergreifend
gilt, steht in `docs/design/README.md`.

---

# Design-Lead-Entscheid: öffentliche Feedback-Ansicht (Modul `feedback`, iuk-suite)

Alle Code-Aussagen unten sind am Repo geprüft (`/Users/rubeen/dev/personal/drk/iuk-suite`), nicht aus den Entwürfen übernommen.

---

## 1. RANGFOLGE

**1. Platz — „Der Abendzettel" (Entwurf 2), Jury 7/7/7.**
Die Jury lobt einstimmig zwei Dinge als strukturelle (nicht kosmetische) Lösungen: die monoton fallende Luminanz der Notenfarben, die Ampelkonflikt, Graustufen-Lesbarkeit und Rot-Grün-Blindheit mit *einem* Mechanismus erledigt, und den nativen Radio/Server-Action-Aufbau, der ohne JavaScript trägt. Entscheidend für Platz 1 ist aber, wo die Kritik liegt: alle drei Juroren bemängeln Oberfläche (Editorial-Schablone, Typo-Skala ohne System, Stempel) und benennbare Ingenieurslücken (No-JS-Fehleranzeige, „genau zwei Client Components", Körnung über den Chips) — Dinge, die man reparieren kann, ohne die Struktur anzufassen.

**2. Platz — „Notenspur" (Entwurf 1), Jury 7/7/7.**
Punktgleich, und dieser Entwurf liefert die von zwei Jurys ausdrücklich zur Übernahme empfohlene Idee (Pflicht vor Kür; Notenspur als Fortschritt+Navigation+wortlose Skalenerklärung). Er verliert den Stichentscheid, weil seine Schwächen die Struktur treffen und nicht die Oberfläche: Auto-Advance ist laut allen drei Juroren eine ungetestete Wette, die zwei parallelen Oberflächen (Stepper + No-JS-Liste) sind ein Pflegerisiko, und Juror 3 belegt einen Selbstwiderspruch — im mageren Netz sieht der Nutzer erst die 14-Fragen-Liste und dann den Umbau zur Startkarte; genau der Nutzer, für den der Fallback gebaut wurde, bekommt die Choreografie nie zu sehen. Dazu Juror 2: verlässt jemand über die Freitext-Zettel und schließt den Tab, sind auch die acht Pflichtnoten weg.

**3. Platz — „Kartenstapel Erzähl mal" (Entwurf 3), Jury 6/6/7.**
Niedrigste Bewertung, und zwei Juroren finden Verstöße gegen harte Anforderungen, nicht nur Schwächen: fünf der sechs Freitextfragen liegen hinter 48px-Zeilen mit erfundenen Kurzlabels („Mehr davon", „Noch was") — funktional nahe an der verbotenen Streichung —, und der Placeholder zitiert die schlechteste Note des Nutzers („Bei *Struktur* hast du 5 gegeben"), *bevor* die Anonymitätszusage überhaupt gefallen ist. Dazu ein sachlicher Fehler in der eigenen Begründung (der Ist-Zustand hat sechs, nicht fünf Sterne) und die konstante Helligkeit über alle sechs Noten, die den einzigen farbunabhängigen Kanal wegnimmt.

### Wo die Juroren sich widersprechen — und wie ich entscheide

**(1) Konstante vs. fallende Helligkeit der Notenfarben — der Widerspruch liegt innerhalb *einer* Jury.**
Juror 2 von Entwurf 3 lobt die konstante Helligkeit (L\* 40–46) ausdrücklich als „gut begründet, damit kein Feld optisch gewinnt". Juror 1 derselben Jury nennt genau diese Entscheidung den Defekt, der „den Kanal entfernt, der Deuteranopie übersteht". **Entscheidung: monoton fallende Luminanz** (Note 1 hellste/gesättigt-dunkelgrün → Note 6 dunkelstes Oxblood im Hellmodus, umgekehrt im Dunkelmodus). Begründung: das Problem „kein Feld sticht heraus" löst schon die Regel *Farbe erst bei Auswahl* — dafür braucht man den Helligkeitskanal nicht zu opfern, und Anforderung (c) nennt Rot-Grün-Blindheit als häufigsten Fall. Beide Jurys von Entwurf 2 stützen das einstimmig.

**(2) Eine Frage pro Bildschirm vs. eine Seite.**
Jury 1 lobt am Stepper, dass „14 Zustände sich als ein Ort anfühlen"; Jury 2 lobt am Zettel, dass man „in zwei Sekunden sieht, dass es wenig ist"; Juror 1 von Entwurf 3 warnt, elf Bildschirme könnten sich *länger* anfühlen als eine Seite. **Entscheidung: eine Seite.** Ausschlaggebend ist nicht das Gefühl, sondern die Folge: nur so gibt es eine einzige Implementierung, die mit und ohne JavaScript dieselbe ist — womit die von zwei Jurys unabhängig benannte größte Schwäche des Steppers (zwei zu pflegende Oberflächen, sichtbarer Umbau nach der Hydration) nicht entsteht statt entschärft zu werden.

**(3) Auto-Advance.**
Von den Jurys beider Stepper-Entwürfe als ungetestete Wette gegen die Zielgruppe 55–70 markiert, von keinem Juror verteidigt. **Entscheidung: kein Auto-Advance.** Der Tipp setzt die Note und bleibt stehen; der Fortschritt läuft über den Navigator.

**(4) No-JS: gelobter Mechanismus, verurteilte Verdopplung — dieselbe Jury.**
Jury 1 nennt „native Radios + CSS `:checked`" die eleganteste Stelle des Entwurfs *und* die Doppel-UI eine der drei schwächsten. **Entscheidung: Mechanismus behalten, Verdopplung auflösen.** Es gibt genau ein Formular; es liegt in *einer* Client Component, die serverseitig gerendert wird (RSC rendert Client Components im HTML mit). Ohne JS ist das fertige, bedienbare Formular da; mit JS kommt nur Zusatzverhalten dazu. Damit verschwindet der Widerspruch, statt einen Gewinner zu brauchen.

**(5) Native Pflichtfeld-Prüfung = „verbotene Sammelfehlermeldung"?**
Juror 3 von Entwurf 3 sagt ja. **Ich überstimme ihn:** die native Prüfung ist feldweise und sequenziell, keine Liste, sie springt zur ersten Lücke und kostet keinen Serverweg. Sie ist ausschließlich das No-JS-Netz; mit aktivem JavaScript schaltet die Seite sie ab (`noValidate` beim Mount) und der gestaltete Lückenspringer übernimmt.

**(6) „`prefers-color-scheme` allein ist ehrlich und ausreichend."**
Juror 3 von Entwurf 2 schreibt das; er hat unrecht, und das ist am Code belegbar. `src/core/theme/mode.ts` hält die Wahl im Cookie `iuk-theme-pref` auf `.iuk-ue.de`, `src/app/layout.tsx` liest ihn serverseitig — der Theme-Umschalter der Suite gilt also auch ohne Login. Wer auf `prefers-color-scheme` selektiert, baut den Fall „System dunkel, Umschalter hell" als Fehler ein. **Entscheidung: Entwurf 1 hat hier recht**, `<html>` bekommt zusätzlich `data-theme={mode}` (heute steht dort nur `style={{ colorScheme: mode }}`, darauf kann CSS nicht selektieren).

**(7) Entfernt man Suite-Rot ganz?**
Entwurf 1 tut es und sein Juror nennt das die wahrscheinlichste Ablehnung; Entwurf 2 lässt drei Rot-Verwendungen, Entwurf 3 zwei. **Entscheidung: zwei — 3px-Fahne oben und Wortzeichen.** Der rote Innenring im Fokus (Entwurf 2) fällt weg: ein roter Ring auf dem grünen Feld der Note 1 ist genau die Ampelverschmutzung, die der Entwurf sonst verbietet.

---

## 2. EMPFEHLUNG

**Grundlage: „Der Abendzettel".** Eine Seite, Zeugnis-Matrix, native Radios, Server Action, linierte Freitextzeilen, luminanz-monotone Notenfarben.

**Übernahmen:**

- **Aus Entwurf 1: die Reihenfolge „Pflicht vor Kür"** — weil alle drei Juroren von Entwurf 1 sie unabhängig als die eine übertragbare Idee benannt haben, die das Kernproblem des Ist-Zustands löst. Übersetzt auf eine Seite: nach der achten Note kommt der **Abschluss-Block** mit der Notenübersicht, die sechs Freitextzeilen liegen sichtbar *darunter*. Keine Umleitung, kein Zustand, in dem Pflichtdaten verloren gehen können — genau der Punkt, an dem Juror 2 den Stepper aufgeschnitten hat. **Revidiert:** der Absenden-Knopf steht *nicht* mehr im Abschluss-Block, sondern genau einmal am Fuß des Bogens (Begründung bei §3.2 A) — die Gliederung „Pflicht vor Kür" bleibt, das Absenden ist nicht mehr Teil von ihr.
- **Aus Entwurf 1: die Notenspur, aufgeteilt in zwei Bauteile** (siehe unten „Barrierefreiheit-Falle"). Fortschritt + Sprung zur Lücke als neutrale Leiste; die farbige Notenübersicht als Lückenspringer im Abschluss-Block.
- **Aus Entwurf 3: der Legendenstreifen mit sechs harten Farbstopps** statt eines verschliffenen Verlaufs — von seinem Juror als „die eine kompositorische Idee" benannt, die den Flickenteppich ohne ein einziges farbiges Feld löst. Harte Stopps, weil der Streifen auf dieselben sechs Spalten zeigt wie die Chips darunter.
- **Aus Entwurf 1: der Satz „Schreib im Freitext nichts, woran man dich erkennt."** — bei ~15 Personen, die über ihren eigenen Gruppenleiter urteilen, der einzige Vertrauensbeweis, der nicht behauptet, sondern zugibt.

### Die Jury-Schwächen des Gewinners — und die Änderung pro Schwäche

| # | Schwäche (Quelle) | Änderung |
|---|---|---|
| 1 | **Ratelimit killt das Absenden** (Juror 1+2, `actions.ts:38` `windowMs: 60_000, max: 10`, Schlüssel `clientIp()`) — 15 Leute hinter einer Vereins-WLAN-NAT-IP: ab der 11. Abgabe pro Minute „Zu viele Anfragen". | Zwei Limiter statt einem. Der Brute-Force-Schutz **bleibt erhalten**: `tokenGuard` (IP, 10/min) zählt nur *ungültige* Token. Echte Abgaben laufen über `submitLimiter` mit Schlüssel `` `${ip}|${survey.id}` `` und 60/10min. |
| 2 | **Kein antd, aber „genau zwei Client Components" trägt nicht** (Juror 3: Autoresize, Zähler, Draft liegen im Server-Teil) | Es gibt genau **eine** Client Component (`Zettel.tsx`), die das ganze Formular trägt (Matrix + Freitexte + Navigator + Draft). `page.tsx` bleibt Server Component für Token, Lifecycle, Kopf, Siegeltext und die Zustandsseiten. Kein einziger antd-Import auf der Route → die Compound-in-RSC-Falle existiert nicht. |
| 3 | **No-JS-Fehleranzeige trägt nicht** (Juror 3: `aria-live` feuert nach POST nicht; Werte gehen verloren) | Der Fehlerfall entsteht ohne JS nicht mehr: alle sechs Radios jeder Frage tragen `required` → der Browser springt feldweise zur ersten Lücke, ohne Serverweg und ohne Datenverlust. Mit JS setzt die Komponente `noValidate` und der gestaltete Lückenspringer übernimmt. Die Server-Prüfung bleibt als letzte Linie, ist aber über beide realen Wege unerreichbar. |
| 4 | **Typo-Skala ist keine Skala** (Juror 1: zehn Ad-hoc-Werte, 13,5px) | Sieben Stufen, Verhältnis ≈1,2, ganze Pixel, keine Ausnahme: **11 / 13 / 15 / 18 / 22 / 26 / 32**. Jede Rolle bekommt genau eine Stufe. |
| 5 | **Editorial-Schablone** (alle drei Jurys, über alle Entwürfe hinweg) | Körnung, Vignette und der −4°-Stempel entfallen; die zweite Schrift entfällt (Geist Sans liegt schon global, es bleibt **eine** zusätzliche Serif für drei Rollen). Der Charakter kommt aus dem, was inhaltlich begründbar ist: Zeugnis-Rhythmus mit Haarlinienzeilen, laufenden Ordnungszahlen `01`–`08`, Tabellenziffern durchgehend, dem Legendenstreifen als einziger gesättigter Fläche beim ersten Blick — und dem vertikalen Auswahlprofil, das die acht Chips beim Scrollen bilden. Der warme Papierton bleibt, aber als Funktion: er hält die Ampel zur einzigen gesättigten Farbe der Seite. |
| 6 | **Serif-Fragetext 17px/400 zu zart** (Juror 2) | Fragetext ist **Geist Sans 18px/500**. Die Serif trägt nur H1/Thema und „Danke." (der Einleitungssatz der Freitextsektion ist entfallen). |
| 7 | **Körnung über den Notenchips senkt den Kontrast** (Juror 3, `mix-blend-mode: multiply`) | Entfällt mit der Körnung. Die geprüften Kontrastwerte gelten damit unverändert. |
| 8 | **„keine IP-Kennung" ist ein Versprechen, das der Code halten muss** (Juror 2+3) | Der Siegeltext ist an konkrete Backend-Änderungen gebunden (Zeitstempel, Leseordnung — siehe Spezifikation §9). Zwei zugelassene Wortlaute, je nachdem ob die Änderungen landen. Kein Satz ohne Deckung. |
| 9 | **Stempel widerspricht der eigenen Strenge** (Juror 1) | Entfällt. Die Danke-Seite trägt nur Serif-„Danke.", eine Haarlinie und den Weitergabe-Block. |
| 10 | **Nur für `schulnote` gültig** (Risiko 8 des Entwurfs, bestätigt: `questions.ts` kennt `stars` mit `ratingScale` 5 für importierte Alt-Umfragen) | Ein Zweig, kein zweites Design: bei `stars` fünf Chips, Ziffern 1–5, dieselbe Rampe auf fünf Stufen abgetastet, Ankerwörter „1 sehr gut / 5 mangelhaft", keine sechste Spalte. |

### Drei Funde aus dem Code, die keine Jury gesehen hat — und die den Entwurf sonst live brechen

1. **Der 24-Stunden-Cookie macht die Handy-Weitergabe unmöglich.** `actions.ts` setzt nach dem Absenden `feedback-${survey.id}` (`httpOnly`, `maxAge: 86400`, `path: "/"`), und `f/[slugSecret]/page.tsx` leitet bei vorhandenem Cookie **stumm nach `/thanks`** um. Die zweite Person am weitergegebenen Handy sieht also kein Formular, sondern eine Danke-Seite — die vom Auftraggeber verlangte Funktion ist im Ist-Code tot. Weil der Cookie `httpOnly` ist, kann kein Client-JS ihn löschen. Lösung: Server Action `releaseDeviceAction(slugSecret)`, die `cookies().set(name, "", { maxAge: 0, path: "/" })` schreibt und zurück aufs Formular leitet; sie hängt am Knopf „Leeren Bogen für die nächste Person" (Danke-Seite) und am neuen Zustand „Von diesem Gerät wurde schon abgestimmt".
2. **Die 500-Zeichen-Grenze existiert serverseitig nicht.** `coerceAnswer` gibt für `type: "text"` unbegrenzt `String(raw)` zurück; `maxLength` am Feld ist umgehbar. Fix: in `coerceAnswer` auf `String(raw).trim().slice(0, 500)` kappen.
3. **`evening.topic` ist nullable** (`schema.ts`: `topic: text("topic")`). Alle drei Entwürfe machen das Thema zur H1. Fallback: ohne Thema lautet die H1 „Dienstabend am 22. Juli" und die Metazeile trägt nur Gruppe und Uhrzeit.

---

## 3. UMSETZUNGSREIFE SPEZIFIKATION — „Der Abendzettel"

### 3.1 Dateien und Schnitt

```
src/app/m/feedback/f/layout.tsx            (Server) — Hülle, full bleed; maxWidth/padding entfallen
src/app/m/feedback/f/[slugSecret]/page.tsx (Server) — Token, Lifecycle, Zustände, Kopf, Siegeltext
src/app/m/feedback/f/[slugSecret]/Zettel.tsx        ("use client") — EINE Komponente: Matrix, Freitexte, Navigator, Draft
src/app/m/feedback/f/[slugSecret]/zettel.module.css — die komplette Optik
src/app/m/feedback/f/[slugSecret]/thanks/page.tsx   (Server) — Danke + Weitergabe
src/app/m/feedback/actions.ts                       — submitResponseAction (Rückgabe statt throw), releaseDeviceAction, Limiter
```
Kein antd-Import auf dieser Route (auch nicht in der Client Component) — damit ist die Compound-Falle in Server Components strukturell ausgeschlossen. Keine Animationsbibliothek, keine Icons, keine Bilder.

### 3.2 Screenflow

**A — FORMULAR** (mobil ca. 1,6 Bildschirmhöhen, in dieser Reihenfolge):

1. **Fahne**: 3px Suite-Rot `#c8000f`, full bleed am Viewport-Oberrand.
2. **Kopf** (linksbündig):
   - Kicker `t0`: „RÜCKMELDUNG ZUM DIENSTABEND", rechts das Wortzeichen „Sammelhaus" (`t1`/700, Rot).
   - H1 `t5`/`t6` Serif: das Thema („Funk-Übung: Sprechgruppen"). Ohne Thema: „Dienstabend am 22. Juli".
   - Metazeile `t1`: „Bereitschaft Musterstadt · Mittwoch, 22. Juli 2026 · 19:30". Datum in `--tinte`/600, Rest `--gedaempft`.
   - Vertragszeile `t1` mit Haarlinie darüber: „Anonym · 8 Noten, 6 freie Zeilen · etwa 2 Minuten".
3. **Legende, genau einmal**: sechs Segmente à 10px Höhe im *identischen* 6-Spalten-Raster wie die Chips darunter, harte Farbstopps, Radius 3. Darunter tabellarisch die sechs Notenwörter (`t0`): sehr gut / gut / befriedigend / ausreichend / mangelhaft / ungenügend.
4. **Notenmatrix, 8 Zeilen**, gegliedert durch drei Sektions-Kicker (Fragetexte und ihre Reihenfolge unangetastet):
   - `01 DER ABEND` → q1–q3 · `02 ABLAUF & VORBEREITUNG` → q4–q6 · `03 DU UND DER ABEND` → q7–q8
   - Zeile: Ordnungszahl `01`…`08` (`t0`, tabular), Fragetext (`t3`, Sans 500), Chipreihe. Unter der **ersten** Zeile dauerhaft die Ankerwörter: links „1 sehr gut", rechts „6 ungenügend". Nach der Wahl am rechten Zeilenende die Fußnote „3 · befriedigend" (`t1`).
   - Trenner: 1px Haarlinie, keine Karten.
5. **Abschluss-Block** (Nachschau auf die acht Noten; **revidiert**, siehe unten — kein Knopf, keine Überschrift):
   - **Notenübersicht als Lückenspringer**: 8 Kacheln 34×34px in Fragereihenfolge — beantwortet: Ziffer in der Notenfarbe auf 14% (hell) / 22% (dunkel) Tönung derselben Farbe; offen: gestrichelte Kontur + Fragennummer in `--gedaempft`. Tipp springt zur Frage. Darunter `t1`: „Tippe eine Zahl an, um sie zu ändern."
   - Am Fuß `t1`: „Die sechs freien Zeilen darunter sind freiwillig — du kannst sie leer lassen und unten absenden." **Der einzige Träger der Freiwilligkeit** (vorher der Einleitungssatz der Freitextsektion).
   - Das **Anonymitätssiegel** stand hier (Block mit Graphit-Kante, `t2`/1,55, Wortlaut §3.9). Entfallen — siehe Revision unten.
6. **Freitextsektion**: der Satz `t1` „Schreib nichts, woran man dich erkennt.", dann sechs **linierte Zeilen** (§6). Reihenfolge: q9 zuerst (leichteste Frage), dann q10–q14 in Originalreihenfolge. Kicker `04 IN EIGENEN WORTEN` und Serif-Einleitungssatz „Alles hier ist freiwillig. …" sind entfallen (Revision unten) — die Sektion trägt damit, anders als die drei Notensektionen, **keinen Kicker**.
7. **Absenden-Knopf** (der einzige) im Textfluss, nicht sticky, Label „Rückmeldung absenden", darüber die Kurzzusage `t1`: „Anonym — kein Name, kein Gerät, keine Uhrzeit." — seit dem Entfall des Siegels **die einzige Anonymitätszusage des Bogens**, deshalb unbedingt gerendert (auch in einem Bogen ohne Freitextfragen). Eine Meldung nach abgewiesener Abgabe (§3.8) erscheint unmittelbar darüber, nicht im Abschluss-Block.
8. **Navigator** (sticky unten, nur mit JS, erscheint nach der ersten Note, verschwindet sobald der Abschluss-Block im Viewport ist): links 8 Striche 2×14px (beantwortet `--tinte`, offen `--linie-stark`), Mitte `t0` „1 = sehr gut · 6 = ungenügend", rechts Textknopf „→ nächste offene". **Keine Ampelfarbe, kein Submit.**

*Revision — von zwei Absenden-Knöpfen auf einen (Stand 26.07.2026, umgesetzt):* Der Entwurf hatte zwei identische `type="submit"`-Knöpfe desselben `<form>`, einen im Abschluss-Block und einen unter den Freitexten. Begründung damals: es können **niemals Pflichtnoten verloren gehen**, und der Preis (freiwilliger Text bleibt ungeschrieben, wenn jemand reflexartig oben absendet) sei der kleinere.

Dieser Preis ist im Betrieb der größere. Ein Absenden-Knopf **mitten im Bogen** sendet versehentlich ab, während unten noch sechs leere Zeilen stehen — und die Abgabe ist endgültig, es gibt keine zweite. Deshalb steht der Knopf jetzt **genau einmal, ganz unten**, hinter allem, was er abschickt; die Überschrift „Das war der Pflichtteil." ist mit ihm verschwunden, weil sie den Bogen in zwei Teile teilte, von denen es nur noch einen gibt. Der Bogen ist **eine Seite**, kein Assistent: die Reihenfolge des Ausfüllens ist frei, und alles Geschriebene geht mit demselben Tipp weg wie die Noten. Der neue Preis ist benannt: wer nach der achten Note weggeht, ohne bis zum Knopf zu scrollen, hat nichts abgesendet. Die verworfene Alternative — Noten absenden, danach optionale Texte nachreichen — wäre der Assistent aus Entwurf 1 in zwei Schritten und bleibt abgelehnt.

*Revision — drei Textflächen weniger (Stand 26.07.2026, umgesetzt):* Der Bogen sagte dasselbe mehrfach. Entfallen sind
(a) das **Anonymitätssiegel** (§3.9, Fassung A, drei Sätze im Abschluss-Block) — die Kurzzusage über dem Knopf sagt es kürzer und verständlicher, und sie ist damit die einzige Zusage im Bogen, also **unbedingt** gerendert;
(b) der **Kicker** `04 IN EIGENEN WORTEN`;
(c) der **Serif-Einleitungssatz** „Alles hier ist freiwillig. Ein Halbsatz hilft uns mehr als ein voller Absatz." — die Freiwilligkeit steht schon am Fuß des Abschluss-Blocks, unmittelbar über denselben Zeilen, und zweimal gesagt wird sie nicht glaubhafter.
Bewusst geblieben ist „Schreib nichts, woran man dich erkennt." — der Satz sagt etwas, das nichts anderes sagt. **Was die Kurzzusage nicht mehr trägt:** das Siegel nannte zwei Dinge, was gespeichert wird *und* was die Gruppenleitung zu sehen bekommt („Durchschnitte und die Texte in zufälliger Reihenfolge, nie eine Person"). Der kurze Satz deckt nur das Erste ab; `shuffleStable` mischt die Leseordnung weiterhin, der Bogen behauptet es nur nicht mehr. Mit dem Siegel ist auch `ZettelProps.siegel` entfallen — die Kopplung „dieser Text ist eine Zusage über Server-Verhalten" steht jetzt als Kommentar an `KURZZUSAGE` in `Zettel.tsx`.

**B — DANKE** (`/f/{slugSecret}/thanks`): Serif „Danke." (`t6`), darunter `t2` „Deine Rückmeldung ist eingegangen — anonym." Keine Antworten mehr auf dem Schirm (das Handy wandert weiter). Haarlinie, 32px Abstand, dann: Kicker „HANDY WANDERT WEITER?", Satz „Deine Antwort ist gespeichert und lässt sich nicht mehr ändern. Für die nächste Person kannst du einen leeren Bogen öffnen.", Sekundärknopf (Umriss) **„Leeren Bogen öffnen"** → `releaseDeviceAction` (löscht Cookie + sessionStorage-Draft, leitet aufs Formular).

**C — „ZURZEIT LÄUFT KEINE UMFRAGE"**: gleiche Hülle, gleicher Kopf-Rhythmus, keine Matrix. H1 Serif „Zurzeit läuft keine Umfrage." · `t2`: „Für die Bereitschaft Musterstadt ist gerade kein Dienstabend freigegeben. Der QR-Code bleibt gültig — probier es am Ende des nächsten Abends noch einmal." · Sekundärknopf „Neu laden" (`<a href>` auf dieselbe URL, funktioniert ohne JS). Kein Rot, kein Warndreieck.

**D — „DIESE UMFRAGE IST BEENDET"**: H1 „Die Umfrage zu diesem Abend ist beendet." · Metazeile mit Thema und Datum (damit der Nutzer sieht: richtiger Zettel, zu spät) · „Sie wurde am 23. Juli um 09:00 geschlossen. Danke, falls du schon abgestimmt hast." Kein Knopf. Der Legendenstreifen erscheint hier vollständig entsättigt in `--linie-stark` — die Farbe hat den Raum verlassen.

**E — „VON DIESEM GERÄT WURDE SCHON ABGESTIMMT"** (neu, ersetzt den stummen Redirect): H1 „Von diesem Gerät ist schon eine Rückmeldung abgegeben." · `t2`: „Wenn du das Handy weitergibst, kann die nächste Person einen leeren Bogen öffnen." · Knopf „Leeren Bogen öffnen" (`releaseDeviceAction`).

**F — „DIESER LINK STIMMT NICHT"** (statt nacktem 404): gleiche Hülle, H1 „Dieser Link stimmt nicht." · „Vielleicht ist er unvollständig kopiert. Scanne den QR-Code am besten noch einmal." Kein Hinweis darauf, ob es die Gruppe gibt.

Alle Zustände teilen Fahne, Kopfrhythmus, Satzbreite und Typo-Skala.

### 3.3 Typografie (7 Stufen, Verhältnis ≈1,2, keine Ausnahme)

| Stufe | px | Zeilenhöhe | Rolle |
|---|---|---|---|
| t0 | 11 | 1,2 | Kicker (600, `letter-spacing .12em`, uppercase), Sektions-Kicker, Ordnungszahl (500, tabular), Notenwörter der Legende, Navigator-Legende |
| t1 | 13 | 1,45 | Metazeile, Vertragszeile, Zeilen-Fußnote „3 · befriedigend", Hinweise, Zeichenzähler, Wortzeichen (700) |
| t2 | 15 | 1,55 | Fließtext, Freitext-Label, Knopfschrift (600) |
| t3 | 18 | 1,35 / 1,5 | **Fragetext** (Sans 500), Notenziffer im Chip (600, tabular), **Freitext-Eingabe** (400, 1,5) |
| t4 | 22 | 1,3 | **derzeit ohne Nutzer** — die Stufe trug zwei Serifsätze, „Das war der Pflichtteil." (mit dem oberen Knopf entfallen) und den Einleitungssatz der Freitextsektion (entfallen). Sie bleibt als Sprosse der Skala dokumentiert; im CSS gibt es keine 22px-Regel mehr. |
| t5 | 26 | 1,15 | H1 mobil (Serif 600, `-0.012em`, `text-wrap: balance`) |
| t6 | 32 | 1,1 | H1 ab 600px, „Danke." (`-0.02em`) |

Schriften: **Geist Sans** (global vorhanden, 0 zusätzliche Requests) für alles außer drei Rollen. **Newsreader** über `next/font/google`, `subsets: ["latin"]`, `weight: ["400","600"]`, `display: "swap"`, `preload: true`, `adjustFontFallback` aktiv (kein Layoutsprung) — nur noch für H1/Thema und „Danke."; die `t4`-Serifsätze sind entfallen, der Font-Load bleibt für die H1 nötig. Durchgehend `font-variant-numeric: tabular-nums lining-nums` auf Ziffern.
**Regel:** kein `<input>`/`<textarea>` unter 16px — die Freitextfelder liegen auf `t3` (18px), sonst zoomt iOS beim Fokus.

### 3.4 Farbe

**Hell:** `--papier #F4F1EA` · `--blatt #FBFAF7` · `--tinte #16181A` (15,8:1) · `--graphit #3A3F44` · `--gedaempft #5E625F` (5,5:1) · `--linie #DDD8CE` · `--linie-stark #C9C3B7` · `--tint #EDE9DF`
**Dunkel:** `--papier #101214` · `--blatt #1B1E22` · `--tinte #ECE9E2` (14,5:1) · `--graphit #C3C8CD` · `--gedaempft #9AA0A6` (6,6:1) · `--linie #2C3035` · `--linie-stark #3A3F45` · `--tint #23272C`

**Suite-Rot `#c8000f`** (echter Token aus `core/theme/tokens.ts`) an genau **zwei** Stellen, nie als Fläche >100px², nie als Knopffüllung, nie als Fehlerfarbe: die 3px-Fahne und das Wortzeichen „Sammelhaus" im Kopf. Primäraktion ist `--graphit`-Tinte: hell `#24282C` auf `#FFFFFF` (14,8:1), dunkel `#ECE9E2` auf `#101214`. Fokusring ausschließlich Tinte.

**Notenfarben hell** (Chipfüllung, Ziffer `#FFFFFF`), Luminanz monoton fallend:
`1 #2F7F59` (4,88:1 · L .165) · `2 #54782A` (5,13 · .155) · `3 #7E6103` (5,84 · .130) · `4 #904708` (6,79 · .105) · `5 #912E10` (8,07 · .080) · `6 #811221` (10,28 · .052)
**Notenfarben dunkel** (Ziffer `#101214`), ebenfalls monoton:
`1 #A1DBC0` (11,99 · .620) · `2 #AACF7F` (10,67 · .547) · `3 #DAB22F` (9,29 · .470) · `4 #EB9549` (7,98 · .396) · `5 #EA7A58` (6,64 · .321) · `6 #E55C6E` (5,44 · .254)
Note 1 hell darf **nicht** aufgehellt werden (wenig Luft über 4,5:1). Note 6 `#811221` ist deutlich dunkler und kühler als `#c8000f`; da Rot nur als 3px-Linie und 13px-Wortzeichen vorkommt, stehen die beiden nie in vergleichbarer Fläche nebeneinander. **Regel für die Codebasis:** außer Fahne und Wortzeichen kein `#c8000f` auf dieser Route — als Review-Checkliste oder Stylelint-Regel festhalten, sonst kippt die Semantik beim nächsten „schnellen Alert".

**Tonwertkeil (Zustand vor der Auswahl, achromatisch, 6 Stufen à ~4,5%):**
hell `1 #FBFAF7 · 2 #F5F2EA · 3 #EFEBE1 · 4 #E9E4D7 · 5 #E3DDCE · 6 #DDD6C5`, Rahmen 1px (1–3 `--linie`, 4–6 `--linie-stark`), Ziffer `--gedaempft` (kein Alpha — nicht gewählte Ziffern sind Bedienelemente, keine deaktivierten Reste).
dunkel, Richtung umgekehrt (heller = schwerer): `1 #1B1E22 · 2 #202429 · 3 #252A30 · 4 #2A2F36 · 5 #2F353C · 6 #343B43`.

**Dunkelmodus-Signal:** alle Variablen hängen an `:root[data-theme="dark"]` / `[data-theme="light"]`, **nicht** an `prefers-color-scheme`. Dafür eine Zeile außerhalb des Moduls: `src/app/layout.tsx` setzt zusätzlich `data-theme={mode}` auf `<html>` (heute nur `style={{ colorScheme: mode }}`, darauf kann CSS nicht selektieren).

### 3.5 Maße, Abstände, Radien, Bewegung

Abstände ausschließlich aus `SPACE` (4/8/12/16/24/32; 64 = 2×32) — dimensionale Werte stehen laut `tokens.ts` bewusst frei.
- Seitenrand 20px mobil / 32px ab 600px. Textmaß max 34rem, Matrix max 40rem, Blatt zentriert.
- Blatt: mobil randlos (Radius 0, kein Schatten); ab 600px Radius 14, 1px `--linie`, Schatten `0 1px 0 rgba(22,24,26,.04), 0 18px 40px -20px rgba(22,24,26,.18)`, Außenabstand 40 oben / 64 unten.
- Kopf: `padding-top 28` (24+4), `padding-bottom 20` (16+4); Sektionsabstand 32; Legende: Streifen 10px, darunter 8, dann 20 bis zur ersten Zeile.
- **Matrixzeile mobil**: `padding-block 14`; Fragetext, 10, Chipreihe. Chipreihe `grid-template-columns: repeat(6, 1fr)`, `gap: 6`, Chiphöhe **44px** → bei 375px Viewport 50,8×44px. Normale Touch-Maße, kein Kiosk-Klotz (bewusste Abweichung von `TAP = 56` — diese Ansicht ist nicht einsatzrelevant).
- **Matrixzeile ab 600px**: `grid-template-columns: 1fr 336px`, `column-gap: 24`, `align-items: center`, `padding-block: 12`, Chip 51×40px → Zeile 64px, acht Zeilen 512px: am Desktop liest sich die Matrix als Tabelle.
- Freitextzeile: Label, 6, Feld ohne Rahmen/Füllung, nur `border-bottom: 1px --linie`, `padding-block: 10`, `min-height: 40`, Abstand zwischen zwei Freitextzeilen 16.
- Knopf: `height: 48`, mobil volle Breite, Desktop 260px, Radius 8.
- Notenübersicht-Kachel 34×34, Radius 8, `gap: 8`.
- Navigator: `height: 56 + env(safe-area-inset-bottom)`, Grund `color-mix(in srgb, var(--blatt) 92%, transparent)`, `backdrop-filter: blur(10px)`, `border-top: 1px --linie`.
- **Radien insgesamt nur vier Werte:** 2 (Navigatorstriche) · 3 (Legendenstreifen) · 8 (Chips, Knöpfe, Kacheln, Siegel rechts) · 14 (Blatt).
- **Flächen:** keine Körnung, keine Vignette, keine Blobs, keine Glasmorphie außer dem Navigator.

**Bewegung** (final, alles CSS):
- Seitenaufbau einmal orchestriert, sieben Blöcke (Kopf, Legende, Sektion 1–3, Freitexte, Abschluss): `opacity 0→1` + `translateY 8px→0`, 320ms `cubic-bezier(.2,.8,.2,1)`, `animation-delay` 0/60/120/180/240/300/360ms → nach 0,7s steht alles. Kein Scroll-Trigger.
- Notenwahl: Füllung `120ms ease-out`; `transform: scale(.96→1)` 140ms `cubic-bezier(.34,1.4,.64,1)`; Fußnote `opacity`+`translateY 4px` 160ms.
- Umwahl in einer Zeile asymmetrisch: alter Chip entfärbt in 100ms, neuer färbt in 120ms.
- Navigatorstrich füllt 180ms; Navigatorleiste ein/aus `translateY 100%→0` 220ms.
- Sprung zur Lücke: `scroll-behavior: smooth`, `scroll-margin-top: 96px`, Zielzeile pulst zweimal `--tint → transparent` (2×420ms).
- `@media (prefers-reduced-motion: reduce)`: alle Dauern 1ms, keine Transforms, keine Pulse — nur der Farbwechsel bleibt.

### 3.6 Skalen-Interaktion

**Markup pro Frage:**
```html
<fieldset class="zeile">
  <legend class="sr-only">Wie war der Dienstabend insgesamt?</legend>
  <span class="nr" aria-hidden="true">01</span>
  <p class="frage" aria-hidden="true">Wie war der Dienstabend insgesamt?</p>
  <div class="chips">
    <input type="radio" id="q1-1" name="q1" value="1" required class="sr-only">
    <label for="q1-1" aria-label="Note 1 – sehr gut">1</label>
    … 6×
  </div>
</fieldset>
```
`legend` visuell versteckt (`clip-path: inset(50%)`, **nicht** `display:none`), sichtbarer Fragetext `aria-hidden` — so hört ein Screenreader die Frage genau einmal, und `fieldset` bleibt `display: block` (Grid auf `fieldset` mit `legend` ist browserseitig heikel). Ein Tabstop pro Frage, Pfeiltasten wählen nativ, Screenreader liest „Wie war der Dienstabend insgesamt? Note 2 – gut, 2 von 6".

**Zustände:** unberührt = Tonwertkeil, Ziffer `--gedaempft`. Gewählt = Notenfarbe, Ziffer `#FFFFFF` (hell) / `#101214` (dunkel) in 600, plus 1px Innenring `rgba(0,0,0,.14)`. Geschwister nach der Wahl: Rahmen fällt auf `--linie`, Füllung bleibt der Keil, **nichts wird ausgegraut**. Hover nur bei `@media (hover: hover)`: Rahmen `--linie-stark`, **keine** Farbvorschau.

**Richtung vor der ersten Auswahl — vier unabhängige Träger, keiner davon Farbe allein:**
1. Der Legendenstreifen mit sechs harten Stopps, spaltengleich über der Matrix (einmal, nicht achtmal).
2. Der achromatische Tonwertkeil, der von links nach rechts dunkelt („nach rechts wird es schwerer").
3. Die permanenten Ankerwörter unter Zeile 1: „1 sehr gut" / „6 ungenügend", plus dieselbe Aussage dauerhaft im Navigator, sobald die Legende aus dem Bild gescrollt ist.
4. Die Ziffer selbst — die deutsche Schulnote ist bei 16- bis 70-Jährigen Allgemeinwissen.

**Warum das ruhig bleibt:** Farbe entsteht nur durch Auswahl, höchstens einmal pro Zeile → maximal 8 farbige Chips statt 48 Flächen. Weil jede Zeile ihre Auswahl an anderer horizontaler Position trägt, bilden die acht Chips beim Scrollen ein vertikales Profil des Abends — Selbstkontrolle ohne Zusatz-UI.

**Pflicht ohne Prüfungsgefühl:**
- Mit JS: `noValidate` auf dem `<form>` beim Mount. Der Absenden-Knopf trägt den Zustand als Text — vollständig: `type="submit"`, „Rückmeldung absenden"; unvollständig: `type="button"`, Label „Noch 3 Noten offen", Umriss statt Füllung; ein Tipp darauf ist **Navigation**: er scrollt zur ersten offenen Zeile, setzt den Fokus auf ihr erstes Feld, lässt die Zeile zweimal in `--tint` aufleuchten und setzt einen 2px-Balken in `--graphit` an ihre linke Kante (Lesezeichen, keine Rüge). Kein Rot, kein Alert, nie das Wort „Fehler". `aria-live="polite"`: „Noch 3 Noten offen — Frage 4."
- Ohne JS: `required` auf allen sechs Radios jeder Gruppe. Der Browser springt feldweise zur ersten Lücke, ohne Serverweg, ohne Datenverlust. Das ist keine Sammelfehlermeldung: es ist eine Ansage pro Feld in Leserichtung.
- Serverseitig als letzte Linie: fehlt eine von q1–q8, wird die Abgabe abgelehnt (Rückgabe, kein `throw`) — eine vollständig leere Absendung ist damit strukturell unmöglich.

**`stars`-Zweig** (importierte Alt-Umfragen, `ratingScale` 5): fünf Chips, `repeat(5, 1fr)`, Rampe auf fünf Stufen abgetastet (1, 2, 3½, 5, 6 der Sechser-Rampe), Ankerwörter „1 sehr gut" / „5 mangelhaft", Legende fünfsegmentig. Kein Improvisieren im Renderer: `switch` auf `q.type`.

### 3.7 Freitexte

- **Linierte Zeilen statt Kästen.** Label = die **vollständige Originalfrage** (`t2`, `--graphit`); darunter ein Feld ohne Rahmen, ohne Füllung, ohne Radius — nur 1px Grundlinie, 40px hoch (genau eine Zeile), das beim Tippen mitwächst (`scrollHeight`-Autoresize; ohne JS `rows=1` + `field-sizing: content`, wo unterstützt). Sechs Zeilen ergeben ~300px statt ~540px Kastenfläche. Keine erfundenen Kurzlabels — der Juror von Entwurf 3 hat zu Recht bemängelt, dass „Mehr davon" die Frage nicht ersetzt; und keine Frage liegt hinter einem Aufklapper.
- **Optionalität einmal, prominent**: der Satz am Fuß des Abschluss-Blocks, unmittelbar über diesen Zeilen („Die sechs freien Zeilen darunter sind freiwillig — du kannst sie leer lassen und unten absenden."). Vorher stand sie zusätzlich im Serif-Einleitungssatz der Sektion; der ist entfallen, weil zweimal gesagt nicht glaubhafter ist. Kein „(optional)"-Suffix an sechs Labels — sechsmal dasselbe Wort erzeugt genau den Druck, den es abbauen soll.
- **Fokus:** Grundlinie 2px `--graphit`, Label auf `--tinte`, Zeile gewinnt 8px Innenhöhe. Nach dem Verlassen mit Inhalt bleibt die Grundlinie 1,5px `--graphit` — beantwortete Zeilen sind als kräftigere Striche erkennbar. **Kein Erledigt-Häkchen** (bei freiwilligen Feldern wäre es eine stille Beschämung der leeren).
- **500 Zeichen:** `maxLength={500}` am Feld (physische Grenze, keine Fehlermeldung möglich) **und** serverseitig `slice(0, 500)` in `coerceAnswer`. Zähler unsichtbar bis 419 Zeichen; ab 420 rechts unter der Zeile „noch 80 Zeichen" (`t1`, `--gedaempft`), bei 0 „Zeile ist voll" — gleiche Farbe, kein Rot, kein Amber, kein Icon (Warnfarbe außerhalb der Skala ist verboten).
- **Draft:** `sessionStorage` (nicht `localStorage`), Schlüssel = Hash des Tokens, Restore im `useEffect` (sonst Hydration-Mismatch), Verfall nach 30 Minuten, Löschung bei erfolgreichem Absenden **und** bei „Leeren Bogen öffnen".
- `autocomplete="off"`, `autocapitalize="sentences"`, `spellcheck="true"`, `enterkeyhint="enter"` (Enter macht einen Absatz, kein Absenden).

### 3.8 Absenden, Fehler, geschlossen, schon abgestimmt

`submitResponseAction` wird umgebaut: **Rückgabewert statt `throw`**, `redirect` bei Erfolg.
```ts
type SubmitResult =
  | { ok: true }
  | { ok: false; code: "invalid" | "none" | "closed" | "ratelimit" | "incomplete"; missing?: string[] };
```
- **Erfolg:** Cookie `feedback-${survey.id}` wie bisher, `redirect("/f/{slugSecret}/thanks")`. Mit JS zusätzlich: Draft löschen.
- **Pending:** Knopf `aria-busy`, Label „Wird gesendet…", `disabled`; kein Spinner, keine Layoutverschiebung.
- **`closed`** (auch der Lazy-Auto-Close-Fall aus `lifecycle.ts`): Zustand D wird an der Stelle des Formulars gerendert, mit dem ehrlichen Zusatz „Deine Rückmeldung konnte nicht mehr gespeichert werden." Kein Rot; Text in `--tinte` auf `--tint`, 2px linke Kante `--graphit`, `role="alert"`.
- **`none` / `invalid`:** Zustand C bzw. F.
- **`ratelimit`:** ruhiges Panel „Gerade sind viele Rückmeldungen gleichzeitig unterwegs. Bitte einmal auf Absenden tippen." — mit JS bleiben alle Eingaben im Formular stehen (Client-State), Knopf wird nach 20s wieder aktiv. Ohne JS: `?fehler=ratelimit` und derselbe Text, plus Hinweis „mit dem Zurück-Pfeil des Browsers stehen deine Eingaben noch da".
- **`incomplete`:** über beide realen Wege unerreichbar (JS-Lückenspringer bzw. `required`); serverseitig trotzdem geprüft, Anzeige `?fehler=unvollstaendig` mit „Da fehlten noch Noten."

**Ratelimit — zwei Limiter statt einem** (`actions.ts`, ersetzt `new RateLimiter({ windowMs: 60_000, max: 10 })`):
```ts
// Brute-Force-Schutz UNVERÄNDERT: zählt nur ungültige Token, Schlüssel = IP.
const tokenGuard   = new RateLimiter({ windowMs:  60_000, max: 10 });
// Echte Abgaben: Schlüssel IP+Umfrage, deckt 15 Leute im Vereins-WLAN plus Weitergabe.
const submitLimiter = new RateLimiter({ windowMs: 600_000, max: 60 });
```
Reihenfolge: Token parsen → ungültig ⇒ `tokenGuard.check(ip)` und `invalid` zurück · Secret falsch ⇒ dito · dann `submitLimiter.check(`${ip}|${survey.id}`)`. Der Brute-Force-Schutz bleibt damit erhalten (eine IP, die falsche Secrets rät, wird nach 10 Versuchen pro Minute gebremst) — nur die legitime Abgabe wird nicht mehr mitbestraft. Ohne diese Änderung ist der Kernfall „15 Leute scannen um 21:30 aus einem WLAN" ab der 11. Abgabe pro Minute tot.

**Schon abgestimmt / Handy-Weitergabe:** `page.tsx` leitet bei vorhandenem Cookie **nicht** mehr stumm nach `/thanks`, sondern rendert Zustand E. Neue Action:
```ts
export async function releaseDeviceAction(slugSecret: string, surveyId: number) {
  (await cookies()).set(`feedback-${surveyId}`, "", { maxAge: 0, path: "/" });
  redirect(`/f/${slugSecret}`);
}
```
(`set` mit `maxAge: 0` statt `delete`, damit der Löschbefehl garantiert mit `path: "/"` ausgeliefert wird.) Der Knopf ist ein natives `<form action={…}>` — funktioniert ohne JS.

### 3.9 Anonymität: Wortlaut und die Zusagen, die der Code halten muss

Der Ist-Code speichert `submittedAt` sekundengenau (`queries.ts:159`) und liest Antworten **ohne `ORDER BY`**, also in Eingangsreihenfolge (`queries.ts:151`) — bei 15 Personen ist die Reihenfolge allein ein Deanonymisierungskanal. Zwei kleine Änderungen machen die stärkere Zusage wahr:
1. `insertResponse(db, survey.id, answers, eveningDateMidnightUtc)` — Zeitstempel auf den Abend gerundet. Geprüft: `submitted_at` wird außerhalb von Tests **nur** in `…/export.csv/route.ts:70` gelesen (eine Spalte, ISO-String); die Spalte zeigt dann für alle Zeilen das Abenddatum. Lifecycle/Aggregation nutzen die Spalte nicht.
2. Stabile Durchmischung der Leseordnung in `aggregation.ts` (Sortierung nach FNV-1a-Hash des Antwort-JSON, deterministisch und testbar) — und die CSV-Route nutzt dieselbe Ordnung.

**Beide Änderungen sind umgesetzt und bleiben verbindlich** — unabhängig davon, welcher Text im Bogen steht.

**Der Wortlaut, revidiert (Stand 26.07.2026).** Der Entwurf sah für den Abschluss-Block ein dreisätziges Siegel vor:

> ~~„Diese Rückmeldung ist anonym. Gespeichert werden nur deine Noten und deine Texte — kein Name, keine E-Mail, keine Geräte- oder IP-Kennung, keine Uhrzeit. Die Gruppenleitung sieht Durchschnitte und die Texte in zufälliger Reihenfolge, nie eine Person."~~ (Fassung A, entfallen; die schwächere Fassung B für den Fall „1 und 2 kommen nicht" ist damit ebenfalls hinfällig.)

Im Bogen steht stattdessen **genau ein Satz**, über dem Absende-Knopf: **„Anonym — kein Name, kein Gerät, keine Uhrzeit."** Kürzer und verständlicher — und weil es die einzige Zusage ist, wird sie unbedingt gerendert, auch in einem Bogen ohne Freitextfragen. Dazu weiterhin der Satz aus Entwurf 1: **„Schreib nichts, woran man dich erkennt."**

Was der kurze Satz **nicht** mehr sagt: was die Gruppenleitung zu sehen bekommt („Durchschnitte und die Texte in zufälliger Reihenfolge, nie eine Person"). Die Zusage ist im Code weiter wahr — `shuffleStable` mischt, Aggregation und CSV-Export nutzen dieselbe Ordnung —, der Bogen behauptet sie nur nicht mehr. Falls die Leseordnung je zurück auf Eingangsreihenfolge fällt, wird damit kein Text zur Lüge; dass Punkt 2 trotzdem gilt, steht hier.

Die IP wird für das Ratelimit benutzt, landet aber nur in einer flüchtigen In-Memory-Map (`ratelimit.ts`) und nie an der Antwort — das ist mit „kein Gerät" vereinbar und muss im Modul-README so dokumentiert stehen. **Wenn irgendwann ein persistenter Limiter mit IP-Spalte oder ein sekundengenauer Zeitstempel kommt, ändert sich DIESER Satz, nicht stillschweigend seine Bedeutung** — die Kopplung steht als Kommentar an `KURZZUSAGE` in `Zettel.tsx`, dort wo der Wortlaut jetzt liegt. Diese Wahl ist technisch, nicht Geschmack — deshalb keine Auftraggeber-Entscheidung.

### 3.10 Barrierefreiheit

- Note = **Ziffer + Position + Wort**, Farbe ist die vierte, verzichtbare Schicht. Ziffer dauerhaft im Chip (auch gewählt), Position fix 1…6, `aria-label="Note 2 – gut"`, nach der Wahl die Fußnote „2 · gut" als Text am Zeilenende.
- Luminanz fällt monoton von 1 nach 6 (hell .165→.052, dunkel .620→.254): bei Deuteranopie und in Graustufen bleibt die Rangfolge als Verdunkelung/Aufhellung erhalten.
- **Die Falle, die ich vermeide:** die Notenspur aus Entwurf 1 wird *nicht* als 15px-Farbmarke gebaut — bei der Größe wäre die Ziffer unlesbar und die Marke reine Farbkodierung, also genau der Verstoß gegen (c). Deshalb die Trennung: **Navigator = nur Fortschritt, neutral, ohne Ampelfarbe** (Striche + „5 von 8" + Ankersatz); **Notenübersicht im Abschluss-Block = 34px-Kacheln mit lesbarer Ziffer** als farbiger Lückenspringer.
- Echte Radiogruppen: ein Tabstop pro Frage (8 Tabstops für 48 Felder), Pfeiltasten nativ. Fokus überall `outline: 2px solid var(--tinte)`, `outline-offset: 2px`, nie `outline: none` ohne Ersatz. **Kein roter Fokusring** (Entwurf 2 hatte einen — Rot auf dem grünen Chip der Note 1 ist Ampelverschmutzung).
- Kontrast AA belegt: Fließtext 15,8:1 (hell) / 14,5:1 (dunkel), Sekundärtext 5,5 / 6,6:1, Ziffer auf Füllung 4,88–10,28:1 (hell) und 5,44–11,99:1 (dunkel), Primärknopf 14,8:1.
- `aria-live="polite"` nur für Zustandsmeldungen des Lückenspringers (nicht für jede Note — sonst plappert die Seite). Fokus nach dem Sprung programmatisch auf das erste Feld der Ziel-Zeile.
- Sichtbare Zeichenzähler-Änderung ist Text, kein Farbwechsel — auch für Screenreader lesbar (`aria-live="polite"` nur ab 420 Zeichen, gedrosselt).

### 3.11 Ladeverhalten

- **Ein** zusätzlicher Webfont (Newsreader, latin, ~25–35 KB woff2, `preload`, `swap`, metrisch angeglichener Fallback über `adjustFontFallback`). Fällt das Performance-Budget, entfällt Newsreader und H1 geht auf Geist Sans 600 — der Entwurf verliert Ton, nicht Funktion.
- Null Bilder, null Icons, null Chart-Library, kein antd auf der Route. Ziel: < 15 KB gz zusätzliches Route-JS (eine Client Component ohne Fremdabhängigkeit).
- Erste Farbe und volle Bedienbarkeit ohne JavaScript: `page.tsx` ist Server Component, `Zettel.tsx` wird serverseitig mitgerendert. Es gibt **keinen** Austausch der Oberfläche nach der Hydration — das war der schärfste Selbstwiderspruch des Stepper-Entwurfs.
- `f/layout.tsx` verliert `maxWidth: 640` / `padding: 16` (die Fahne muss randlos laufen); kein zweiter `ConfigProvider`, weil kein antd verwendet wird.
- Der gestaffelte Aufbau (0,7s) ist reine CSS-`animation-delay`-Choreografie auf schon vorhandenem HTML — er verzögert nichts.

---

## 4. ZWEI ENTSCHEIDUNGEN FÜR DEN AUFTRAGGEBER

### Entscheidung 1: Wie viel Suite-Rot darf auf dieser Seite sein?

Auf dieser Seite bedeutet Rot „Note 6 – ungenügend". Das ist ausgerechnet die Primärfarbe der Suite.

| Option | Konsequenz in einem Satz |
|---|---|
| **A — Rot nur als dünner Streifen oben plus Wortzeichen-Schriftzug** (Empfehlung) | Man erkennt die Seite sofort als Suite-Seite, und trotzdem ist keine Fläche rot, mit der die schlechteste Note verwechselt werden könnte. |
| B — gar kein Rot | Am klarsten für die Noten, aber die Seite verliert jeden Wiedererkennungswert gegenüber der übrigen Suite. |
| C — roter Absenden-Knopf wie in der übrigen Suite | Der auffälligste Knopf der Seite trägt dann dieselbe Farbe wie die schlechteste Note — die Ampel wird zur Dekoration, und der ganze Entwurf bricht an der Wurzel. |

**Empfehlung: A.** Rot bleibt Marke am Rand, Rot bleibt Bedeutung in der Mitte — und beide stehen nie in vergleichbarer Größe nebeneinander.

### Entscheidung 2: „Du" oder „Sie"?

Der komplette Text der Seite ist derzeit im „Du" geschrieben („Wie war der Dienstabend insgesamt?", „Schreib nichts, woran man dich erkennt.").

| Option | Konsequenz in einem Satz |
|---|---|
| **A — durchgehend „Du"** (Empfehlung) | Klingt wie im Dienstabend gesprochen, senkt die Hemmung, ehrlich zu antworten — kann auf Ältere in manchen Gliederungen zu vertraulich wirken. |
| B — durchgehend „Sie" | Wirkt korrekt und für alle Altersgruppen unangreifbar, macht die Seite aber förmlicher und damit näher an einem Fragebogen der Verwaltung als an einer Rückfrage der eigenen Gruppe. |
| C — Fragen im „Du" (so kommen sie aus den Altdaten), Rahmentexte im „Sie" | Vergleichbarkeit der Fragetexte bleibt, aber die Seite spricht in zwei Stimmen und liest sich uneinheitlich. |

**Empfehlung: A.** Die acht Fragen sind im Altbestand schon im „Du" formuliert und dürfen nicht umgeschrieben werden (Vergleichbarkeit); alles andere daneben im „Sie" wäre ein Stilbruch mitten auf der Seite. Wenn die Gliederung „Sie" verlangt, muss die Entscheidung **vor** dem Bau fallen — sie betrifft rund vierzig Textstellen.
