# Runbook: „Was steht an" mit Push über den eigenen ntfy

„Was steht an" sammelt die Fristen der Module an einer Stelle im Portal (IDA-297): Verfall im Handlager
und in den Einheiten, Sauerstoffflaschen unter der Wechselgrenze, fällige BZ-Kontrollen und offene
Plomben aus dem Lagerbuch sowie Funkgeräte, die länger als einen Tag ausgeliehen sind. Jede Person sieht
nur die Module, die sie verwaltet (`SUITE_ADMIN_GROUP_LAGERBUCH`, `SUITE_ADMIN_GROUP_RADIO`; die
Suite-Admin-Gruppe allein reicht nicht, wie in den Modulen selbst).

Seite und Kachel laufen ohne jede Einrichtung. Dieses Runbook richtet den **Push** ein: montags ab 7 Uhr
(Suite-Zone) eine Zusammenfassung über einen eigenen ntfy-Container. Jede Person richtet sich auf der
Seite ihr **eigenes Thema** ein (`iuk-faellig-` plus 20 Zufallszeichen) und wählt, welche Arten darin
stehen. Auf dem Server gibt es dafür nur eine Zugriffsregel mit Platzhalter; für neue Personen ändert
sich dort nichts.

## Abgrenzung zur Serverwartung

Die Serverwartung bleibt auf ntfy.sh (`SUITE_WARTUNG_NTFY_URL`). Ein ntfy auf diesem Server schwiege
genau dann, wenn der Server ausfällt. Für eine Fristen-Erinnerung ist das unkritisch: sie kommt dann
einen Tag später. Die beiden Themen haben nichts miteinander zu tun.

## 1. Werte erzeugen

Auf dem Server, ohne dass der Container schon läuft:

```
docker run --rm -it binwiederhier/ntfy:v2.35.0 user hash      # Passwort eingeben → $2a$10$…
docker run --rm binwiederhier/ntfy:v2.35.0 token generate     # → tk_… (32 Zeichen)
```

Das Passwort selbst braucht danach niemand; die Suite sendet mit dem Token. Themen legt die Suite selbst
an, je Person eines.

## 2. `.env` auf dem Server

```
COMPOSE_PROFILES=ntfy
SUITE_NTFY_TRAEFIK_RULE=Host(`ntfy.iuk-ue.de`)
SUITE_NTFY_BASE_URL=https://ntfy.iuk-ue.de
SUITE_NTFY_AUTH_USERS='suite:$2a$10$…:user'
SUITE_NTFY_AUTH_ACCESS='suite:iuk-faellig-*:wo,everyone:iuk-faellig-*:ro'
SUITE_NTFY_AUTH_TOKENS='suite:tk_…:suite'

SUITE_FAELLIG_NTFY_SERVER=https://ntfy.iuk-ue.de
SUITE_FAELLIG_NTFY_TOKEN=tk_…
SUITE_FAELLIG_NTFY_INTERN=http://ntfy
```

* **Einfache Anführungszeichen** um die drei `SUITE_NTFY_AUTH_*`-Werte, sonst ersetzt Compose das `$`
  im Hash.
* **Alle drei** `SUITE_NTFY_AUTH_*` setzen, bevor `COMPOSE_PROFILES=ntfy` aktiv ist. Ein leerer Wert ist
  für ntfy kein „nichts", der Container liefe in die Neustartschleife.
* `NTFY_AUTH_DEFAULT_ACCESS=deny-all` steht fest in `compose.yaml`: die Suite darf nur schreiben,
  alle anderen nur lesen, und beides nur unter `iuk-faellig-*`. Anders als beim Wartungsthema kann
  niemand, der einen Namen kennt, an die Abonnenten senden. **Mitlesen** kann er trotzdem; deshalb stehen
  im Push keine Personennamen, und wer sein Thema weitergegeben hat, legt auf der Seite ein neues an.
* Ein anderes Präfix als `iuk-faellig-` geht über `SUITE_FAELLIG_NTFY_PRAEFIX`, dann mit derselben
  Zeichenfolge in `SUITE_NTFY_AUTH_ACCESS`. Bestehende Themen behalten ihren Namen.
* `SUITE_FAELLIG_NTFY_INTERN=http://ntfy` schickt den Versand über das interne Netz `ntfy` statt über
  den öffentlichen Host. Läuft auf demselben Docker-Host ein zweiter Dienst namens `ntfy` im Netz
  `proxy`, den Wert weglassen; dann geht der Versand an `SUITE_FAELLIG_NTFY_SERVER`.

DNS-Eintrag für den Host wie bei jedem Modul. TLS endet am Edge-Proxy, nicht an Traefik.

## 3. Starten und prüfen

```
docker compose up -d
docker compose ps ntfy          # healthy nach etwa 20 s
```

Danach im Portal unter **Was steht an** (mit Recht auf Lagerbuch oder Funkgeräte) auf **Einrichten**
tippen, das Thema in der App abonnieren und **Probe senden**. Das schickt die eigene Zusammenfassung
sofort, ohne den Montag zu verbrauchen; ist nichts fällig, kommt ein kurzer Satz.

Ohne Erfolg steht neben dem Knopf „Senden hat nicht geklappt", und das Serverlog der Suite nennt den
HTTP-Status: 401/403 heißt Token oder Zugriffsliste falsch (passt das Präfix?), ein Verbindungsfehler
heißt Container oder Netz.

## 4. Betrieb

* Der Takt prüft alle 15 Minuten. Die gesendete Kalenderwoche steht je Person in `portal.db`
  (`faelligkeiten_abos`, Spalte `gesendete_woche`); ein Rollout am Montag schickt also keine zweite
  Nachricht. Scheitert der Versand an eine Person, versucht der nächste Schritt es für sie wieder; ins
  Log kommt das einmal je Woche.
* Wer was bekommt, fragt der Takt bei Pocket ID (`POCKET_ID_API_KEY`, derselbe wie für die Rechte im
  Portal): wem das Modulrecht entzogen wurde oder wer gesperrt ist, bekommt nichts mehr. Antwortet Pocket
  ID nicht, geht in diesem Schritt an niemanden etwas. Ohne Key (lokal) gilt der Gruppenstand vom
  letzten Besuch der Seite.
* Ist für eine Person nichts fällig, das sie ausgewählt hat, geht an sie nichts raus.
* `ntfy_data` hält Benutzer und den Nachrichtenspeicher (7 Tage). Es muss nicht ins Backup: Benutzer und
  Rechte entstehen bei jedem Start neu aus der `.env`, die Themen stehen in `portal.db`.
* iPhone: Apple weckt die App nur über ntfy.sh, deshalb steht `NTFY_UPSTREAM_BASE_URL=https://ntfy.sh`
  in `compose.yaml`. Übertragen wird dabei eine Kennung der Nachricht, nicht ihr Text.

## Lesen nur mit Passwort (optional)

Soll ein Thema nicht einmal lesbar sein, wer den Namen kennt: `everyone:iuk-faellig-*:ro` aus
`SUITE_NTFY_AUTH_ACCESS` streichen, einen zweiten Benutzer `leser` mit `ro` auf `iuk-faellig-*` anlegen und
dessen Zugangsdaten in der ntfy-App beim Server hinterlegen. Die Anleitung im Portal sagt dazu nichts; das
ist dann Absprache im Team.
