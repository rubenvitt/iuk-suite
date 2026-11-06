# Runbook: Inbetriebnahme des MCP-Servers der Suite (`mcp`)

Ein MCP-Server für die ganze Suite (IDA-367), Endpunkt `https://<SUITE_HOST_MCP>/mcp` (Vorschlag
`mcp.iuk-ue.de`). Er wächst Modul für Modul; das erste ist die Gerätewartung. Wer sich anmeldet, kann genau
das, was er in der App darf: jedes Werkzeug läuft durch dieselben Riegel und Schreibvorgänge wie die App
(`wartung/_lib/zugang.ts` `aktionFuer`, `wartung/_lib/vorgaenge.ts`).

## 1. Wie die Anmeldung läuft

Die Suite ist Resource Server (MCP-Autorisierung, RFC 9728) und **vermittelt** die Anmeldung an Pocket ID
(`m/mcp/_lib/vermittlung.ts`). Tokens stellt weiter nur Pocket ID aus:

1. Der Client ruft `/mcp` ohne Token und bekommt `401` mit
   `WWW-Authenticate: Bearer resource_metadata="https://<host>/.well-known/oauth-protected-resource/mcp"`.
2. Dort steht der MCP-Host selbst als Autorisierungsserver (`/.well-known/oauth-authorization-server`). Pocket ID
   kann keine dynamische Client-Registrierung, und Client-ID-Metadaten (CIMD) nur ohne Schlüssel — ChatGPT
   kommt mit Schlüssel und wird abgewiesen (Pocket ID 2.19.2, Stand 2026-11-06). Deshalb registriert sich jeder
   Client an `/register` und bekommt dort den festen öffentlichen Client „Suite MCP“ (erster Eintrag in
   `MCP_CLIENT_ID`). So verbinden sich Claude, ChatGPT und andere ohne eingetragene Client-ID.
3. `/authorize` schickt die Person zu Pocket ID, mit dem eigenen Rückweg `/callback` und der PKCE-Challenge des
   Clients; `/callback` gibt den Code an den Rückweg des Clients weiter, `/token` reicht an Pocket ID durch.
   Angenommen werden nur die Rückwege aus `ERLAUBTE_RUECKWEGE` (Claude, ChatGPT, `localhost`).
4. Mit dem Zugriffstoken prüft der Server Signatur (JWKS von Pocket ID), Aussteller, Ablauf und Empfänger
   (`aud` muss ein Eintrag aus `MCP_CLIENT_ID` sein). Gruppen und Name holt er vom Userinfo-Endpunkt und merkt
   sie sich eine Minute; ein Gruppenentzug wirkt also spätestens nach einer Minute.

Offene Anmeldungen merkt sich der Prozess zehn Minuten. Wer genau während einer Deploy-Übergabe zwischen zwei
Containern anmeldet, muss eventuell neu verbinden.

## 2. Pocket ID: Client „Suite MCP“

In Pocket ID unter **OIDC Clients** einen Client anlegen:

- Name: `Suite MCP`
- **Public Client** an (kein Secret; PKCE ist Pflicht)
- Callback URLs:
  - `https://<SUITE_HOST_MCP>/callback` (die Vermittlung)
  - `http://localhost:*/callback` (Clients, die eine Client-ID fest eingetragen haben und direkt zu Pocket ID
    gehen)
- Erlaubte Gruppen: leer lassen oder dieselben wie am Client „IDA“. Was jemand im MCP-Server darf, entscheiden
  die Modulgruppen (z. B. `wartung-nutzer`, `wartung-admin`), nicht der Client.

Die Client-ID kommt als **erster** Eintrag in `MCP_CLIENT_ID`.

## 3. Umgebung

```
SUITE_HOST_MCP=mcp.iuk-ue.de
MCP_CLIENT_ID=<Client-ID von „Suite MCP“>   # mehrere durch Komma
# POCKET_ID_ISSUER ist schon gesetzt
```

Reihenfolge wie bei jedem neuen Host: erst das Image mit dem Modul ausrollen, dann `SUITE_HOST_MCP` setzen.
DNS per `cf-host`, Traefik-Regel über `SUITE_TRAEFIK_RULE`. Eine Datenbank hat das Modul nicht. Ohne
`MCP_CLIENT_ID` antwortet `/mcp` mit 503.

Prüfen:

```
curl -s https://mcp.iuk-ue.de/.well-known/oauth-protected-resource/mcp   # JSON mit authorization_servers
curl -si -X POST https://mcp.iuk-ue.de/mcp | head -5                       # 401 mit WWW-Authenticate
```

## 4. Verbinden

- **Claude (Web, Desktop, App)** und **ChatGPT**: Connector mit der URL `https://mcp.iuk-ue.de/mcp` anlegen,
  ohne Client-ID. Die App registriert sich selbst.
- **Claude Code:** `claude mcp add --transport http iuk-suite https://mcp.iuk-ue.de/mcp`, danach `/mcp` → Anmelden.

## 5. Ein Modul dazunehmen

1. `src/app/m/<modul>/_mcp/werkzeuge.ts` mit einem `McpModul` (`m/mcp/_lib/modul.ts`): Werkzeuge heißen
   `<modul>_…`, und `registriere` meldet nur an, was die Person sehen darf.
2. Jedes Werkzeug prüft beim Aufruf mit dem Riegel des Moduls, mit der Person aus `alsViewer(person)`. Braucht
   der Riegel `headers()`/`auth()`, wird sein Kern herausgelöst (Vorbild `aktionFuer` neben `requireAktion`).
3. Geschrieben wird über dieselben Funktionen wie die Server Actions — keine zweite Fassung der Prüfungen.
4. **Keine personenbezogenen Daten, keine Rechtevergabe** (Grundregel, Ruben 2026-11-06): keine Werkzeuge für
   Personensuche oder das Zuordnen von Rechten, und Ausgaben nennen nur erlaubte Felder (Vorbild
   `eintragOhnePerson`/`mangelOhnePerson` in `wartung/_mcp/werkzeuge.ts`) — also nicht, wer geprüft, gemeldet oder
   behoben hat. Wer schreibt, steht weiter im Audit-Log und in der App.
5. Eine Zeile in `MCP_MODULE` (`m/mcp/_lib/module.ts`), ein Test nach dem Vorbild
   `wartung/_mcp/werkzeuge.test.ts` (Werkzeuge je Stufe, fremde Gruppe abgelehnt, entzogenes Recht, keine Namen in
   den Antworten).

## 6. Was bewusst fehlt

- Personen und Rechte: Verwalter zuordnen, Personen suchen, Namen von Prüfern, Meldern und Verwaltern.
- Fotos und Etiketten der Gerätewartung. Unterlagen gehen nur **dazu** (`wartung_unterlage_hochladen`): von einer
  öffentlichen Adresse, die die Suite selbst lädt (`wartung/_lib/abruf.ts`, keine Adressen im eigenen Netz), oder
  als Base64. Löschen und Sortieren bleibt in der App.
- Ein Ereignisstrom (`GET /mcp`): der Server ist zustandslos und antwortet mit JSON.
