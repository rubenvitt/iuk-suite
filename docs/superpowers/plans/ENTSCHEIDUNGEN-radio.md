# Modul `radio` — Entscheidungsvorlage

**Stand 2026-08-18, vor dem Bau.** Grundlage: `docs/radio-portierung-analyse.md` @ `c47857a` und
Spec 1 (`docs/superpowers/specs/2026-08-17-radio-modul-design.md`, `9440e23`).

Sieben Punkte. Je Punkt: die Frage, meine Empfehlung, der Beleg — und **was die Alternative kostet**,
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
