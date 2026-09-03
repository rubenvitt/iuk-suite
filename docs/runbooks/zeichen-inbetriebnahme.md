# Runbook — Modul `zeichen` produktiv schalten

Ziel: `zeichen.iuk-ue.de` erreichbar machen, samt Offline-PWA. **Kein Cutover** — es gibt keine
Alt-Anwendung, keinen Datenimport, keinen Paritätscheck. Das Modul startet mit einer leeren
Datenbank.

Die Vorbedingung ist hier eine **andere als bei `aufgaben`**: nicht die Gruppen, sondern
**`SUITE_HOST_ZEICHEN`**. An ihm hängt die Offline-PWA, und der Schalter, der sie einschaltet,
kann bei falscher Reihenfolge den **ganzen Stack** am Start hindern — alle Module, nicht nur
dieses.

## Zugang: es gibt keine Zugangsgruppe

`requiresAuth: true`, `requiredGroups: []` (`src/core/registry.ts`) — **jede angemeldete Person
kommt hinein**, ohne dass in Pocket ID irgendetwas vorbereitet werden müsste. Das ist gewollt: der
Katalog ist Nachschlagewerk, kein Geheimnis. Anonym ist das Modul aber nicht begehbar, es gibt
keinen anonymen Teilpfad wie bei `qr`, `feedback`, `files`, `lagerbuch` oder `radio` — jede Ansicht
setzt eine bekannte Person voraus (Lernstand, Merkliste, eigene Zeichen).

| Gruppe (Instanz `id.iuk-ue.de`) | Variable | Was ohne sie passiert |
|---|---|---|
| — | — | Zugang: nichts. Wer angemeldet ist, ist drin. |
| `iuk-zeichen-admin` (Vorgabe) | `SUITE_ADMIN_GROUP_ZEICHEN` | Niemand außer dem Suite-Admin kann **kuratierte Lernsets** pflegen. Alles andere — Katalog, Merkliste, Baukasten, Üben — funktioniert unverändert. |

**Die Gruppe ist damit kein Startblocker.** Existiert sie nicht, fehlt in der Navigation der
Abschnitt „Verwaltung → Lernsets", und `/m/zeichen/verwaltung/lernsets` antwortet mit 404. Der
Rückweg ist wie überall die Suite-Admin-Gruppe (`dashboard-admins`, `SUITE_ADMIN_GROUP`):
`isModuleAdmin` lässt sie neben der Modulgruppe passieren — hier ausdrücklich gewollt, weil hinter
dem Riegel kein Geheimnis liegt, nur kuratierte Listen (dieselbe Linie wie `aufgaben`, anders als
`files`/`lagerbuch`).

Es gilt weiter, dass **ein Gruppenentzug mit bis zu einer Stunde Verzug wirkt** (Gruppen im JWT sind
nur so frisch wie der letzte Token-Refresh, s. `CLAUDE.md`, „Zugriffsschutz"). Für kuratierte
Lernsets ist das folgenlos.

## Die Falle: `ZEICHEN_SW=1` ohne Host bricht den Start ab — für alle Module

`zeichenBootFehler()` (`src/app/m/zeichen/_lib/boot.ts`) meldet einen Startfehler, sobald
`ZEICHEN_SW=1` gesetzt ist und `SUITE_HOST_ZEICHEN` fehlt. Die Meldung landet in
`assertHostConfig()` (`src/core/bootstrap.ts`), und **der Abbruch trifft den Prozess**, also die
gesamte Suite.

Daraus folgt die Reihenfolge in Schritt 2/3 unten: **erst der Host und die Traefik-Regel, dann der
Schalter.** Nie umgekehrt, und nie beides „schnell zusammen" in einem Rutsch, bei dem ein Tippfehler
im Hostnamen unentdeckt bleibt.

Der Riegel greift **ausschließlich** bei `ZEICHEN_SW=1`. Ohne den Schalter ist ein fehlender Host
folgenlos — das ist die bewusste Abweichung von Spec §7.1 (die eine unbedingte Pflicht in Produktion
wollte): sie hätte jeden unbeteiligten Deploy im Fenster zwischen Merge und Cutover abgebrochen.

Warum der Host für die PWA überhaupt Voraussetzung ist: ohne ihn findet `moduleForHost` kein Modul,
`decideRoute` fällt aufs Portal zurück, und `/sw.js` rewritet nach `/m/portal/sw.js` → 404. Ebenso
`/manifest.webmanifest`, `/pwa-icon.svg` und `/offline`. Die Registrierung scheitert mit **einer
Konsolenzeile** — und die Release-Notiz „Der Katalog steht auch ohne Verbindung bereit" stünde im
Portal, ohne dass es jemandem auffiele, bis jemand ohne Netz danebensteht.

**`ZEICHEN_SW` liest zeichengenau `1`.** `true`, `ja`, `on` schalten **nicht** ein und melden nichts;
die sichere Seite ist aus. Das ist Absicht: auf einer Instanz ohne eigenen Modul-Host antwortet jede
Route ohne Sitzung mit 307 → `/login`, und ein Worker legte dort Login-HTML unter dem
Katalogschlüssel ab.

## Ablauf

1. **`SUITE_ADMIN_GROUP_ZEICHEN` klären** (optional, kein Startblocker). Entweder die Gruppe
   `iuk-zeichen-admin` in Pocket ID anlegen und besetzen, oder die Variable auf den Namen einer
   bestehenden Gruppe setzen, oder beides lassen und die Lernsets vorerst als Suite-Admin pflegen.

2. **`.env` des Stacks ergänzen** (Vorlage in `.env.example`, Abschnitt „Modul „Taktische Zeichen"") —
   **zunächst ohne `ZEICHEN_SW`**:
   ```
   SUITE_HOST_ZEICHEN=zeichen.iuk-ue.de
   SUITE_ADMIN_GROUP_ZEICHEN=iuk-zeichen-admin
   ```
   `prodHosts` ist in der Registry leer; der Host steht **ausschließlich** in dieser Variablen —
   dieselbe Betreiberauflage wie bei `lagerbuch` und `radio`.

3. **`SUITE_TRAEFIK_RULE` erweitern**, sonst erreicht die Domain den Container gar nicht erst:
   ```
   SUITE_TRAEFIK_RULE=Host(`iuk-ue.de`) || … || Host(`zeichen.iuk-ue.de`)
   ```

4. **Stack hochziehen**: `docker compose pull && docker compose up -d`. Der Boot legt `zeichen.db`
   an und wendet die Migrationen an (`MODULE_MIGRATIONS` in `core/bootstrap.ts`, Tabellen
   `eigene_zeichen`, `lernsets`, `lernset_zeichen`, `lernstand`, `merkliste`); die Datenbank ist
   danach **leer**. Das ist der vorgesehene Zustand, kein Fehler — der Seed (`pnpm seed:lokal`) ist
   ein reines Entwicklungswerkzeug und läuft hier nie. Der Katalog selbst kommt **nicht** aus der
   Datenbank, sondern aus dem eingecheckten Generat `_lib/katalog.generiert.json`; er ist ab dem
   ersten Start vollständig da. In der Datenbank stehen nur die Daten der Personen — eigene
   Zeichen, Merkliste, Lernstand — und die kuratierten Lernsets.

5. **Gegenprobe ohne PWA** — der Punkt, an dem der Hostname bewiesen ist:
   1. `https://zeichen.iuk-ue.de/` mit einem beliebigen angemeldeten Konto öffnen. Die
      Navigation zeigt „Katalog", „Merkliste", „Baukasten", „Meine Zeichen", „Üben".
   2. Landet stattdessen das **Portal**, greift der Host nicht — `SUITE_HOST_ZEICHEN` oder die
      Traefik-Regel prüfen. **Jetzt ist der richtige Zeitpunkt dafür, nicht nach Schritt 6.**
   3. Mit einem Konto **in** der Admin-Gruppe erscheint zusätzlich „Verwaltung → Lernsets"; ohne
      sie führt der direkte Aufruf von `/m/zeichen/verwaltung/lernsets` auf eine 404. Beides ist
      der Sollzustand.

6. **Erst jetzt die PWA einschalten**: `ZEICHEN_SW=1` in die `.env`, `docker compose up -d`.
   Startet der Stack nicht, steht die Ursache im Protokoll — die Boot-Meldung nennt beide
   Variablennamen ausdrücklich.

7. **PWA von Hand abnehmen** (ein echtes Gerät, kein Desktop-Devtools-Emulat):
   1. `https://zeichen.iuk-ue.de/sw.js` direkt aufrufen: es muss JavaScript kommen, kein 404 und
      kein HTML. Ein 404 heißt, dass der Host nicht greift.
   2. Die Seite installieren („Zum Startbildschirm"), einmal durch den Katalog gehen.
   3. Flugmodus einschalten, die App aus dem Startbildschirm starten: der Katalog muss stehen.
   4. Eine Ansicht aufrufen, die nicht im Cache liegt: es muss die **Offline-Seite** erscheinen,
      keine Browser-Fehlerseite.

## Was den Leuten sagen

**Ein Satz zur Merkliste gehört in jede Einweisung, und er ist keine Formalie:** offline gibt es
keine Anmeldung. Das Sitzungscookie ist `HttpOnly` und für Seite wie Worker unsichtbar, und die
Gerätedatenbank überlebt den Logout genauso wie der Cache. **Auf einem geteilten Gerät sieht die
gemerkten Titel auch, wer sich nach dir anmeldet.** Deshalb steht auf `/offline` ein Hinweis samt
Löschknopf, und deshalb fängt der Worker `POST /api/auth/signout` ab. Für ein persönliches
Diensttelefon ist das folgenlos; für ein Fahrzeug- oder Wachgerät ist es die Ansage, die man vorher
macht.

Zweitens: **die Merkliste landet nur dort auf dem Gerät, wo die PWA eingeschaltet ist.** Geschrieben
wird sie ausschließlich online, aus der Datenbank gespeist; gelesen wird sie offline. Wer sie
offline sehen will, muss die Fläche vorher einmal online geöffnet haben.

## Rollback

**Nur den Host zurücknehmen** (Modul unerreichbar, PWA bleibt auf den Geräten): geht **nicht** —
`ZEICHEN_SW=1` ohne `SUITE_HOST_ZEICHEN` ist der Startabbruch aus dem Abschnitt oben. Die beiden
Variablen gehören zusammen zurückgenommen, und zwar in dieser Reihenfolge:

1. **`ZEICHEN_SW` leeren oder entfernen**, `docker compose up -d`. Ab jetzt liefert `/sw.js` den
   **Abräum-Worker**: der installierte Worker holt ihn bei seiner nächsten Update-Prüfung, räumt
   Cache und Gerätedatenbank ab und trägt sich aus.
2. **`SUITE_HOST_ZEICHEN` stehen lassen, bis die Geräte durch sind.** Ohne den Host gibt es den Pfad
   `/sw.js` nicht (er rewritet ins Portal, 404) — der Abräum-Worker kann dann nicht mehr
   ausgeliefert werden, und auf jedem Gerät, das die PWA installiert hat, bleibt der alte Worker
   mitsamt Cache und Gerätedaten liegen, ohne Hebel dagegen.
3. Danach `SUITE_TRAEFIK_RULE` zurücksetzen und `docker compose up -d`. Sekunden, ohne Datenverlust
   — das Volume bleibt.

Ein Rollback der Gruppe ist nicht nötig: sie ist für andere Module wirkungslos.

## Pre-flight für den Build

Das Repository zieht `@einsatzzeichen/catalog` **gepatcht** ein (`patches/` +
`patchedDependencies` in `pnpm-workspace.yaml`). Zur **Laufzeit** spielt das Paket keine Rolle — der
Next-Graph importiert es bewusst nicht, sondern liest das eingecheckte Generat. Gebraucht wird es
vom Generat-Skript (`scripts/zeichen-generat.ts`) und von Vitest.

Für den Container zählt trotzdem eine Zeile: **`COPY patches ./patches`** im `Dockerfile`, vor
`pnpm install --frozen-lockfile`. Fehlte sie, zeigte der `patchedDependencies`-Eintrag auf eine
Datei, die es im Kontext nicht gibt, und `pnpm install` bräche mit `ENOENT` ab — während lokal alles
grün ist, weil das Verzeichnis im Arbeitsbaum liegt. `src/docker-kontext.test.ts` hält Eintrag,
Patch-Datei und Dockerfile-Zeile zusammen; ein grüner Vitest-Lauf ist damit die Vorabprüfung, kein
separater Handgriff.
