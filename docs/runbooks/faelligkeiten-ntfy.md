# Runbook: „Was steht an" mit Push über den eigenen ntfy

„Was steht an" sammelt die Fristen der Module an einer Stelle im Portal (IDA-297): Verfall im Handlager
und in den Einheiten, Sauerstoffflaschen unter der Wechselgrenze, fällige BZ-Kontrollen und offene
Plomben aus dem Lagerbuch sowie Funkgeräte, die länger als einen Tag ausgeliehen sind. Jede Person sieht
nur die Module, die sie verwaltet (`SUITE_ADMIN_GROUP_LAGERBUCH`, `SUITE_ADMIN_GROUP_RADIO`; die
Suite-Admin-Gruppe allein reicht nicht, wie in den Modulen selbst).

Seite und Kachel laufen ohne jede Einrichtung. Dieses Runbook richtet den **Push** ein: montags ab 7 Uhr
(Suite-Zone) eine Zusammenfassung an ein eigenes ntfy-Thema auf einem eigenen Container.

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

Das Passwort selbst braucht danach niemand; die Suite sendet mit dem Token. Dazu ein Themenname aus
`A–Z a–z 0–9 _ -`, höchstens 64 Zeichen, nicht zu erraten (z. B. `iuk-faellig-` plus 16 Zufallszeichen).

## 2. `.env` auf dem Server

```
COMPOSE_PROFILES=ntfy
SUITE_NTFY_TRAEFIK_RULE=Host(`ntfy.iuk-ue.de`)
SUITE_NTFY_BASE_URL=https://ntfy.iuk-ue.de
SUITE_NTFY_AUTH_USERS='suite:$2a$10$…:user'
SUITE_NTFY_AUTH_ACCESS='suite:<thema>:wo,everyone:<thema>:ro'
SUITE_NTFY_AUTH_TOKENS='suite:tk_…:suite'

SUITE_FAELLIG_NTFY_URL=https://ntfy.iuk-ue.de/<thema>
SUITE_FAELLIG_NTFY_TOKEN=tk_…
SUITE_FAELLIG_NTFY_INTERN=http://ntfy
```

* **Einfache Anführungszeichen** um die drei `SUITE_NTFY_AUTH_*`-Werte, sonst ersetzt Compose das `$`
  im Hash.
* **Alle drei** `SUITE_NTFY_AUTH_*` setzen, bevor `COMPOSE_PROFILES=ntfy` aktiv ist. Ein leerer Wert ist
  für ntfy kein „nichts", der Container liefe in die Neustartschleife.
* `NTFY_AUTH_DEFAULT_ACCESS=deny-all` steht fest in `compose.yaml`: die Suite darf nur schreiben,
  alle anderen nur lesen. Anders als beim Wartungsthema kann niemand, der den Namen kennt, an die
  Abonnenten senden. **Mitlesen** kann er trotzdem; deshalb stehen im Push keine Personennamen, und das
  Thema gehört nicht ins Repo, in Screenshots oder Tickets.
* `SUITE_FAELLIG_NTFY_INTERN=http://ntfy` schickt den Versand über das interne Netz `ntfy` statt über
  den öffentlichen Host. Läuft auf demselben Docker-Host ein zweiter Dienst namens `ntfy` im Netz
  `proxy`, den Wert weglassen; dann geht der Versand an `SUITE_FAELLIG_NTFY_URL`.

DNS-Eintrag für den Host wie bei jedem Modul. TLS endet am Edge-Proxy, nicht an Traefik.

## 3. Starten und prüfen

```
docker compose up -d
docker compose ps ntfy          # healthy nach etwa 20 s
```

Danach im Portal unter **Was steht an** (als Mitglied der Suite-Admin-Gruppe und mit Recht auf
Lagerbuch oder Funkgeräte) auf **Jetzt senden** tippen. Das schickt die aktuelle Zusammenfassung sofort,
ohne den Montag zu verbrauchen; ist nichts fällig, kommt eine kurze Probe. Die Anleitung zum Abonnieren
steht auf derselben Seite.

Ohne Erfolg steht unter dem Knopf „Senden hat nicht geklappt", und das Serverlog der Suite nennt den
HTTP-Status: 401/403 heißt Token oder Zugriffsliste falsch, ein Verbindungsfehler heißt Container oder
Netz.

## 4. Betrieb

* Der Takt prüft alle 15 Minuten. Die gesendete Kalenderwoche steht in `portal.db`
  (`portal_einstellungen`, Schlüssel `faelligkeiten_push_woche`); ein Rollout am Montag schickt also
  keine zweite Nachricht. Scheitert der Versand, versucht der nächste Schritt es wieder; ins Log kommt
  das einmal je Woche.
* Ist nichts fällig, geht nichts raus.
* `ntfy_data` hält Benutzer und den Nachrichtenspeicher (7 Tage). Es muss nicht ins Backup: Benutzer und
  Rechte entstehen bei jedem Start neu aus der `.env`.
* iPhone: Apple weckt die App nur über ntfy.sh, deshalb steht `NTFY_UPSTREAM_BASE_URL=https://ntfy.sh`
  in `compose.yaml`. Übertragen wird dabei eine Kennung der Nachricht, nicht ihr Text.

## Lesen nur mit Passwort (optional)

Soll das Thema nicht einmal lesbar sein, wer den Namen kennt: `everyone:<thema>:ro` aus
`SUITE_NTFY_AUTH_ACCESS` streichen, einen zweiten Benutzer `leser` mit `ro` anlegen und dessen
Zugangsdaten in der ntfy-App beim Server hinterlegen. Die Anleitung im Portal sagt dazu nichts; das ist
dann Absprache im Team.
