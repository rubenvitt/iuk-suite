# Modul `radio` — Entscheidungsvorlage

**Stand 2026-08-18, vor dem Bau.** Grundlage: `docs/radio-portierung-analyse.md` @ `c47857a` und
Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`, `9440e23`).

Sieben Punkte, plus **zwei Nachträge (9 und 10) aus dem Bau vom 2026-08-21**. Je Punkt: die Frage, meine Empfehlung, der Beleg — und **was die Alternative kostet**,
damit ein „nein" nicht teurer ist als ein „ja".

> ⚠️ **Zwei Punkte haben Vorrang, aus verschiedenen Gründen.**
> **Punkt 1** habe ich in deinem Namen vorentschieden, weil Spec 1 sonst nicht schreibbar gewesen
> wäre — er steht hier obenan, damit du es siehst und nicht suchst.
> **Punkt 2** ist der einzige, bei dem gerade **ohne Antwort gebaut würde**: ein Kapitel führt eine
> Rechtestufe ein, die kein anderes kennt.
>
> Die übrigen fünf blockieren den Baubeginn nicht — sie sind vor dem **Cutover** fällig.

---

## 1. Bauform des Ausleih-Codes ⚠️ von mir vorentschieden

**Frage:** Ist der gescannte Code dauerhaft und sperrbar, rotiert er, oder prägt jeder Scan eine
eigene kurze Sitzung ohne bleibenden Code?

**Meine Wahl: dauerhaft und sperrbar**, nie löschbar, und er prägt beim Einlösen eine begrenzte
Sitzung. Das ist wörtlich lagerbuchs `/t/<code>`-Bauform.

**Warum:** Es ist die **am wenigsten festlegende** Wahl. Gedruckte Codes überleben (das Projekt hat
bei den Lagerbuch-Etiketten schon einmal bezahlt, was ein bewegliches Artefakt kostet), und eine
Kompromittierung bleibt behebbar, weil gesperrt werden kann. „Nie löschbar" ist keine Bequemlichkeit:
ein gelöschter Code kann an ein später ausgestelltes Kärtchen zurückfallen, und historische
Journalzeilen erschienen danach unter dem **neuen** Label — dieselbe Begründung wie in lagerbuchs
Entscheidung 8-F.

**Preis der Alternative:** „Sitzung je Scan ohne bleibenden Code" ist **nicht teuer** — eine Spalte im
Schema und eine Stelle im Gate. Wenn du sie willst, sag es; das Modul kippt davon nicht.
Teuer wäre nur der umgekehrte Weg später, wenn schon gedruckt wurde.

**Was in jedem Fall gilt:** die 1:1-Übernahme des heutigen Mechanismus ist ausgeschlossen. Heute
trägt der QR-Code den einen geteilten API-Token als URL-Parameter, base64-kodiert
(`radio-inventar/apps/frontend/src/components/features/admin/AppQRCode.tsx:11-23`) — ohne Ablauf,
ohne Widerruf. Anonym ist gewollt; unbefristet und unwiderruflich ist der Fehler.

---

## 2. Zwei Rollen oder eine? ⛔ blockierend

**Frage:** Bekommt `radio` in der Suite **zwei** Verwaltungsstufen — Admin und „Updater" — oder nur
eine?

**Der Befund:** Im Bestand ist die Trennung echt: `mapGroupsToRole` unterscheidet `adminGroup` und
`updaterGroup` (`radio-admin/shared/src/role.test.ts:4`), und ein Updater darf nur eine Teilmenge der
Gerätefelder ändern (`UPDATER_EDITABLE_FIELDS`). **Im Ziel hat sie keinen Träger** — die Suite kennt
je Modul genau eine Admin-Gruppe. Kapitel 5 der Spec führt darum eigenmächtig ein
`SUITE_UPDATER_GROUP_RADIO` ein, **das kein anderes Kapitel kennt**.

**Meine Empfehlung: eine Stufe** — nur `SUITE_ADMIN_GROUP_RADIO`, kein Updater.

**Warum:** Die zweite Stufe kostet an jeder Schreibstelle eine Feldprüfung, in jeder Oberfläche eine
Fallunterscheidung und im Test je Fläche einen zweiten Durchgang. Das lohnt nur, wenn es die Rolle
heute wirklich benutzt. **Das weiß nur du:** steht in Pocket ID eine Gruppe, die als `updaterGroup`
konfiguriert ist, und hat sie Mitglieder?

**Preis der Alternative:** Bleiben zwei Stufen, ist das kein Bruch, aber Kapitel 5 muss mit den
Kapiteln 3 und 8 zusammengeführt werden — heute widersprechen sie sich (Kapitel B4 der Spec).

---

## 3. Sitzungsdauer

**Frage:** Wie lange gilt eine per Code geprägte Ausleih-Sitzung?

**Empfehlung: 12 Stunden**, wie `lagerbuch` (`src/app/m/lagerbuch/_lib/helferSitzung.ts:50-57`),
konfigurierbar über `RADIO_AUSLEIH_SITZUNG_STUNDEN`.

**Warum:** Eine Dienstschicht soll nicht mitten im Betrieb nach einem erneuten Scan verlangen.
Es ist eine Betriebsentscheidung, keine Rechnung — **kein Test kann sie prüfen**, keiner wartet
12 Stunden.

**Preis der Alternative:** Nur eine `.env`-Zeile. Kürzer heißt öfter scannen, länger heißt, dass ein
fremdes Telefon länger Zugriff behält.

---

## 4. Sind gedruckte Aufsteller im Umlauf — und wo?

**Frage:** Existiert der heutige QR-Code auf Papier, oder nur auf Bildschirmen?

**Keine Empfehlung — das ist eine Tatsache, keine Wahl.** Ich kann sie nicht messen: Papier ist für
jedes Tor unsichtbar.

**Was daran hängt:** Sind Aufsteller im Umlauf, müssen die Bestandscodes beim Ausstellen
**zeichengleich** übernommen werden, und die Ausgabe des ersten Satzes ist ein Druckvorgang, kein
Bildschirmvorgang. Sind keine im Umlauf, entstehen alle Codes in der Suite und der Cutover-Abend wird
deutlich einfacher.

---

## 5. Benutzername beim Ausleihen vorausfüllen?

**Frage:** Wer über die Suite angemeldet ist — soll sein Name im Ausleihfeld vorbelegt sein?

**Empfehlung: ja, vorbelegt und überschreibbar.** Deine eigene Formulierung war „könnten wir,
optional".

**Warum:** Es spart den häufigsten Tippvorgang und ändert nichts an der Sache — die Ausleihe bleibt
anonym im Sinne von „nicht rechtlich zugeordnet", weil das Feld überschreibbar bleibt und niemand
zur Anmeldung gezwungen wird.

**Preis der Alternative:** Ein leeres Feld ist ehrlicher, wenn jemand regelmäßig **für andere**
ausleiht — dann ist die Vorbelegung jedes Mal falsch und muss gelöscht werden.

---

## 6. Wie wird das radio-inventar-Frontend heute ausgeliefert?

**Frage:** `radio-inventar/docker-compose.yml` führt nur `postgres` und `backend` (letzteres hinter
einem Profil). Wer liefert das Frontend aus?

**Keine Empfehlung — eine Wissenslücke, die den Abbau betrifft.** Es gibt einen Dienst oder einen
Build-Schritt, der nicht im Compose steht; solange er unbekannt ist, ist die Abbauliste unvollständig,
und der Abbau ist die einzige unumkehrbare Handlung des Cutovers.

---

## 7. Muss offline geschrieben werden können?

**Frage:** Soll eine Ausleihe ohne Netz erfassbar sein und später nachlaufen?

**Empfehlung: nein.**

**Warum:** Mit deiner Antwort „ist kein Tablet" hat sich der Fall verschoben — es geht nicht mehr um
ein Wandgerät ohne Netz, sondern um ein Telefon mit schlechtem Empfang. Offline **schreiben** heißt
Konfliktauflösung zwischen zwei Geräten, die dasselbe Funkgerät verliehen haben; das ist ein eigenes
Bauwerk und lohnt nur bei belegtem Bedarf.

**Preis der Alternative:** Bei schlechtem Empfang schlägt eine Ausleihe fehl und muss wiederholt
werden. Ist das im Funkraum real, sag es — dann gehört es in die Spec und nicht in eine Fußnote.

---

## 8. Wie werden die beiden Alt-Stacks heute überhaupt veröffentlicht? ⛔ blockiert den Cutover

**Frage:** Über welchen Weg erreichen `radio.iuk-ue.de` und `radio-admin.iuk-ue.de` heute die
Alt-Container — ein serverseitiges Compose-Override, eine eigene Reverse-Proxy-Konfiguration, oder
cloudflared-Ingress-Regeln?

**Der Befund, unabhängig nachgeprüft:** In **beiden** eingecheckten Alt-Compose-Dateien kommt die
Zeichenkette `traefik` **null Mal** vor; sie veröffentlichen nur Ports (`radio-admin` `3000:3000`,
`radio-inventar` `5432:5432` plus Backend-Port). Die Suite-`compose.yaml` trägt dagegen sieben
Traefik-Zeilen mit Labels. **Das Server-Deployment der Alt-Stacks steht in keinem Repo.**

**Keine Empfehlung — eine Wissenslücke, und sie hat zwei Folgen:**

1. Der **erste und nicht tauschbare Handgriff** des Umschwenks („Alt-Router zuerst weg") hat kein
   ausführbares Ziel. Spec 2 macht daraus die Vorbedingung §4.2 Nr. 13: die heutige
   Router-Konfiguration ist vor dem Fenster abzulesen und **wörtlich** zu protokollieren — sonst
   fehlt auch dem Rückweg die Vorlage.
2. Es ist **dieselbe Lücke wie Punkt 6** (wer liefert das radio-inventar-Frontend aus). Solange beide
   offen sind, ist die Abbauliste unvollständig — und der Abbau ist die einzige unumkehrbare
   Handlung.

**Was es nicht blockiert:** den Bau. Die Umsetzungspläne können ohne diese Antwort entstehen.

---

## 9. `zuBoolOptional` gegen den blinden Cast härten? ⚠️ nicht blockierend (NT2)

**Nachtrag vom 2026-08-21, aus dem Bau von B5.** `zuBoolOptional` in `scripts/import/radio.ts:64`
lautet `(v: 0 | 1 | null) => (v === null ? null : v === 1)` — bei `undefined` gibt es **`false`**
zurück, genau die Faltung, die der Kommentar zwei Zeilen darüber namentlich verbietet, und
asymmetrisch zu `msZuDatumOptional`, das `undefined` ausdrücklich behandelt.

**Meine Empfehlung: ja, härten** — `(v: 0 | 1 | null | undefined) => (v === null || v === undefined
? null : v === 1)`. Eine Zeile, ein Zeichenwechsel in der Signatur.

**Was gemessen ist, und was es entschärft:** `AltGeraet.alamos_integrated` und `.loanable` sind
`0 | 1 | null`, **nicht optional** — der `undefined`-Zweig ist von `toNeuesGeraet` aus typseitig
**unerreichbar**, und der `devices`-`SELECT` nennt beide Spalten namentlich. Der Fund ist damit
keine Lücke im Datenweg, sondern eine **Härtung gegen den blinden Cast** `.all() as AltGeraet[]`
(`radio.ts:210`), über den ein `undefined` überhaupt erst ankäme.

**Was ein „nein" kostet:** nichts Messbares heute. Der Schaden entstünde erst, wenn jemand später
das Quellinterface auf `number | null` oder auf optionale Felder änderte — dann faltet die Funktion
still, und `NT4` ist die **einzige** Probe, die es fängt (`select count(*) from devices where
loanable is null`, Quelle gegen Ziel, im Cutover-Runbook bei **C28**). Diese Probe steht unabhängig
von dieser Entscheidung und bleibt fällig.

**Warum es hier liegt und nicht gebaut ist:** Signatur **und** Rumpf sind planvorgegeben, ebenso der
Cast. Das Ledger-Ruling vom 2026-08-20 nennt es „eine Planentscheidung, keine Umsetzungsfreiheit" —
daran ändert die Nachmessung nichts, sie nimmt der Entscheidung nur die Dringlichkeit.

## 10. Der Auftrag an RTK: den tsc-Filter richten ⛔ betrifft jedes Tor, auch fremder Projekte (NT7)

**Nachtrag vom 2026-08-21, aus dem Bau von B8.** `rtk pnpm typecheck` meldet
`TypeScript: No errors found`, wo `tsc` **fünf** Fehler hat. Ursache eingegrenzt: in einer TTY
schaltet `tsc` seine „pretty"-Form ein (`datei.ts:22:3 - error TS2305:` mit ANSI-Sequenzen zwischen
den Feldern), und RTKs tsc-Filter erkennt darin keinen Fehler. Ohne Farbe zählt derselbe Filter
richtig. Der vollständige Abschnitt mit der Messtabelle steht im Ausführungsplan.

**Das ist keine Frage an dich, sondern ein Auftrag, den nur du terminieren kannst** — RTK ist dein
Werkzeug, und `CLAUDE.md` schreibt es für jeden Befehl vor. **Meine Empfehlung: vor der
Generalprobe richten**, zusammen mit dem anderen Werkzeug-Auftrag (die 170 vorbestehend roten
Tests). Beide sind Voraussetzung dafür, dass §3.6 Nr. 1 überhaupt prüfbar ist.

**Was ein „später" kostet:** jedes typecheck-Tor dieses Wegs bleibt unbelegt, solange nicht jemand
daran denkt, `NO_COLOR=1 FORCE_COLOR=0` davorzusetzen. Die vier Commits vom 2026-08-21 sind
nachgemessen (alle wirklich 0 Fehler); **B1–B4 und M1–M6 sind es nicht.**

**Geprüft und in Ordnung:** die Filter für `lint` (reicht eslints Text durch — ein absichtlicher
`prefer-const`-Fehler kam als `1 error` durch, Exit 1) und für `vitest` (meldete mehrfach richtig
rot). Der Fund ist auf `tsc` beschränkt.

## Was ich NICHT entschieden habe und auch nicht entscheiden kann

Sieben Zahlen und Werte, die nur der Server hergibt. Sie stehen in Spec 1 als Runbook-Schritte, nicht
als geratene Zahlen:

* der echte Dump von `/data/data.sqlite` (die lokale Kopie ist **leer** und trägt nicht einmal die
  `loans`-Tabelle — ein Stand vor der Loan-Migration)
* `select count(*) from "AdminUser"` gegen den Prod-Postgres, vor dem Abbau
* die Zahl der von der 2-Monats-Retention betroffenen Leihen (deine Schätzung „< 100" ist keine
  Zählung)
* die real gesetzten `POCKET_ID_*`-Werte des Kiosk, die entscheiden, ob er im Pocket-ID- oder im
  lokalen Passwort-Modus läuft
