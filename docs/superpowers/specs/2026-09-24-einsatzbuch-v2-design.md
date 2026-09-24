# Einsatzbuch v2 — Entwurf

**Modulschlüssel `einsatzbuch` · ClickUp DRK-471 · 2026-09-24**

Das Einsatzbuch dokumentiert Einsätze der Bereitschaft **nach** ihrem Ende. Es besteht aus einer
Desktop-App auf **genau einem** festen Rechner und einem Modul der Suite. Die Einsätze bleiben auf
dem Rechner. Die Suite pflegt die Stammdaten, hält den Lese-Schlüssel und stellt den Reader bereit.

v2 löst das Einsatzarchiv (`~/dev/personal/drk/einsatztagebuch`) ab. Es ist bewusst schlanker:
kein Sync-Server, keine Signaturhierarchie, kein PKCS#11, genau ein schreibender Rechner. Aus dem
Einsatzarchiv wird nichts importiert.

**Design-Vorlage:** `docs/design/einsatzbuch-v2/vorlage/` (Export aus Claude Design, mit dem IDA
Design System). Maßgeblich sind `Einsatzbuch v2.dc.html` (Rechner), `Einsatzbuch Reader.dc.html`
(Reader) und `Einsatzbericht.dc.html` (Berichtsblatt). Die Vorlage ist ein Klick-Prototyp. Ihre
Kryptografie ist Platzhalter (siehe §10).

---

## 1. Anforderungen aus dem Gespräch

| # | Anforderung | Quelle |
|---|---|---|
| A1 | Tauri-Desktop-App. Alle Einsatzdaten bleiben auf dem Rechner. | Auftrag |
| A2 | Verwaltung meldet sich über Pocket ID an, neue Gruppe | Auftrag |
| A3 | Reader wird Teil der Suite, gleiche Gruppe | Auftrag |
| A4 | Terminal-App, aber andere Programme bleiben benutzbar: normales Fenster, kein Kiosk | Auftrag |
| A5 | Code zwischen App und Suite teilen | Auftrag |
| A6 | Verschlüsseln ohne Anmeldung, Entschlüsseln nur für die Verwaltung | Rückfrage |
| A7 | Lesen darf eine Verbindung zur Suite brauchen. Der private Schlüssel liegt bei der Suite. | Rückfrage |
| A8 | Stammdaten werden in der Suite gepflegt, der Rechner hält eine Kopie | Rückfrage |
| A9 | Windows **und** macOS | Rückfrage |
| A10 | Genau ein Rechner, eine Kette, eine fortlaufende Nummer | Rückfrage |
| A11 | Automatische Sicherung in einen Ordner, dazu manueller Export | Rückfrage |
| A12 | Auto-Updates aus GitHub Releases | Auftrag |
| A13 | Frist nach dem Absenden 15 Minuten, in der Suite einstellbar | Rückfrage |
| A14 | Repo-Aufteilung: App unter `apps/`, geteilter Kern im Modul (Ansatz A) | Rückfrage |
| A15 | Anmeldung am Rechner über die Suite (Einmalcode), Kettenanker bei der Suite | Designfreigabe §1 |
| A16 | Die Anbindung Ende-zu-Ende testen, ohne Echtdaten zu schreiben oder die echte Kette zu brechen; Test-Clients lassen sich löschen (§12) | Nachtrag 2026-09-24 |

**Nicht in v2.0:** Schlüsselwechsel, mehrere *echte* Rechner (Test-Rechner: §12), Nachträge zu versiegelten Einsätzen,
Statistik über die Kennzahlen der Vorlage hinaus, Import aus dem Einsatzarchiv, Code-Signing-
Zertifikate.

---

## 2. Bausteine

```
┌─────────────────────────── Rechner (Windows/macOS) ───────────────────────────┐
│ apps/einsatzbuch  (Tauri 2)                                                    │
│  ├─ Oberfläche: Vite + React 19 (Erfassung, Frist, Verwaltung)                 │
│  │    └─ importiert den geteilten Kern (Kette prüfen, entschlüsseln, Export,   │
│  │       Bericht, gemeinsame Ansichten)                                        │
│  └─ src-tauri (Rust): lokale SQLite, Frist-Uhr, Versiegeln, Sicherung,         │
│       Loopback-Anmeldung, Updater, Autostart, Einzelinstanz                    │
└──────────────┬─────────────────────────────────────────────────────────────────┘
               │ HTTPS: Stammdaten ↓ · Kettenanker ↑ · eingepackte Schlüssel ↑↓
┌──────────────┴──────────────── Suite (Modul einsatzbuch) ──────────────────────┐
│ src/app/m/einsatzbuch                                                           │
│  ├─ _lib/kern/   GETEILT: Format, Kette, Umschlag, Export, Bericht, Ansichten   │
│  ├─ _db/         Stammdaten, Einstellungen, Schlüsselpaar, Rechner, Anker,      │
│  │               Einmalcodes, Sitzungen                                         │
│  ├─ Seiten: Stammdaten · Einstellungen · Rechner · Reader                      │
│  └─ api/: anmelden · einrichten · stammdaten · anker · schluessel/freigeben     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.1 Geteilter Kern — `src/app/m/einsatzbuch/_lib/kern/`

Reines TypeScript plus React-Komponenten. **Keine** Abhängigkeit auf `next/*`, `@/core/*`
(Ausnahme: `@/core/theme/tokens.ts`, reine Konstanten), Node-APIs oder antd-Compound-Zugriffe.
Kryptografie ausschließlich über WebCrypto (`globalThis.crypto.subtle`). Das läuft in WebView2,
WKWebView, im Browser und in Node ≥ 20.

| Datei | Inhalt |
|---|---|
| `format.ts` | Typen `Einsatz`, `Blockkopf`, `Block`, `Exportdatei`, Versionskonstanten |
| `kanonisch.ts` | Kanonisches JSON nach RFC 8785 (JCS) für die hier verwendeten Typen |
| `kette.ts` | `blockHash`, `pruefeKette` (Ergebnisse wie in der Vorlage: `ok`, `vollstaendig`, `block`, `grund`) |
| `umschlag.ts` | `packeEin`/`packeAus` (ECDH-ES), `schluesselIdVon`. Im Betrieb packt Rust ein (§4.3) und die Suite aus (§5.4); die TS-Fassung von `packeEin` erzeugt Testvektoren und Testdaten. |
| `block.ts` | `versiegele` (Testvektoren, Tests), `oeffneBlock(block, cek)` |
| `zeit.ts` | Wanduhrzeit in der Suite-Zone, Dauer, Datums- und Zeitpunkttexte (Zone als Parameter) |
| `export.ts` | `verschluesseleExport`, `entschluesseleExport`, `istExportdatei` |
| `bericht.ts` | Berichtsmodell wie `EinsatzbuchKern.bericht` der Vorlage |
| `ansichten/` | `Kettenliste`, `Einsatzdetail`, `Berichtsblatt`, `Kettenpruefung` (Client-Komponenten, nur serialisierbare Props) |
| `testvektoren/*.json` | Feste Vektoren (§9.1). Rust und TypeScript prüfen dieselben Dateien. |

Ein Grenztest (`kern/grenze.test.ts`) liest alle Dateien unter `kern/` und verbietet Importe von
`next`, `next/*`, `node:*`, `@/core/*` (außer `tokens`) und `@/app/*`.

### 2.2 Desktop-App — `apps/einsatzbuch/`

- Eigenes pnpm-Workspace-Mitglied (`pnpm-workspace.yaml` bekommt `packages: ["apps/*"]`). Die Suite
  bleibt das Root-Paket.
- Vite + React 19 + TypeScript. Der Alias `@kern` zeigt auf `../../src/app/m/einsatzbuch/_lib/kern`,
  `@/core/theme/tokens` wird mit aufgelöst.
- Die Oberfläche folgt der Vorlage: eigenes Markup mit Suite-Tokens und dem Barlow/Geist-Stapel
  (Fonts lokal gebündelt, kein Netzabruf). antd ist nicht vorgesehen, denn die Vorlage ist
  vollständig eigenes Markup.
- `src-tauri/`: Rust (Edition 2024), Tauri 2 mit den Plugins `single-instance`, `autostart`,
  `updater`, `dialog`, `opener` (Systembrowser). SQLite über `rusqlite` mit `bundled`. Einpacken und
  Hashen über RustCrypto (`p256`, `hkdf`, `aes-gcm`, `sha2`), **nicht** `ring`: `ring` braucht unter
  Windows ARM64 clang (Lehre aus dem Einsatzarchiv, `23b439e`).

**Folgen für die Suite-Werkzeuge:**
- `tsconfig.json`: `exclude` bekommt `apps/**`, sonst zieht `**/*.ts` die App in den Suite-Typecheck.
- `eslint.config.mjs` ignoriert `apps/**`, weil die App ihre eigene Lint-Konfiguration hat.
- `vitest.config.ts`: `exclude` bekommt `apps/**`, die App hat eigenes Vitest.
- `.dockerignore`: `apps`.
- `Dockerfile`, deps-Stage: `pnpm install --frozen-lockfile --filter iuk-suite...` bzw. die
  Stage kopiert `apps/einsatzbuch/package.json` mit. Das wird in Stufe 4 gemessen und der Weg
  festgelegt, der den Docker-Build grün hält. `src/docker-kontext.test.ts` bekommt die Zusicherung.

### 2.3 Suite-Modul — `src/app/m/einsatzbuch/`

- Registry-Eintrag `einsatzbuch`, Titel „Einsatzbuch“, `shell: "full"`, `requiresAuth: false`
  (wie `radio`/`uav`: die Geräte-Schnittstellen laufen mit eigenen Tokens). Der Zugang zu den Seiten
  wird modul-intern in `_lib/zugang.ts` durchgesetzt, und zwar im Layout **und** in jedem Handler.
- Zugangsgruppe: Vorgabe `einsatzbuch-verwaltung`, überschreibbar per
  `SUITE_ACCESS_GROUP_EINSATZBUCH`, gelesen über `envAccessGroupsFor`/`requiredGroupsFor`. Die
  Gruppe öffnet alle Modulseiten und die Schlüsselfreigabe — **nur** die Gruppe, der Suite-Admin
  allein nicht. Eine getrennte Admin-Gruppe gibt es
  nicht, `adminGroups: []`.
- Host über `SUITE_HOST_EINSATZBUCH`, `prodHosts: []`. Die Handler tragen den Host-Riegel wie `radio`.
- Eigene Datenbank → Dreieck: `_db/migrations`, `MODULE_MIGRATIONS`, `COPY`-Zeile im `Dockerfile`.
- Seed für `pnpm seed:lokal einsatzbuch`: Stammdaten aus der Vorlage (Fahrzeuge, Personal,
  Stichworte), ein Schlüsselpaar mit Entwicklungs-KEK.

---

## 3. Datenformat

Alle Zeitpunkte als ISO 8601 mit Offset. Beginn und Ende des Einsatzes als Datum und Uhrzeit ohne
Offset **in der Suite-Zone** (`core/zeit`), die der Rechner mit den Stammdaten erhält.

### 3.1 Einsatz (Klartext, nur innerhalb des Chiffrats)

```ts
interface Einsatz {
  v: 1;
  nummer: string;              // "2026-047", fortlaufend je Kalenderjahr
  stichwort: string;           // aus den Stammdaten
  beginnDatum: string; beginnZeit: string;          // "2026-09-23", "18:42"
  endeDatum: string | null; endeZeit: string | null;
  strasse: string; ort: string; objekt: string;
  fahrzeuge: FahrzeugStand[];  // SCHNAPPSCHUSS beim Versiegeln
  personal: PersonStand[];     // SCHNAPPSCHUSS beim Versiegeln
  vorOrt: number; transport: number;                // 0..999
  notizen: string;
}
interface FahrzeugStand { id: string; typ: string; kennung: string; ruf: string; standort: string }
interface PersonStand   { id: string; name: string; quali: string; ov: string; fahrzeugId: string | null }
```

Die Vorlage legt nur IDs ab und löst sie beim Export über die aktuellen Stammdaten auf. v2 legt
den **Stand zum Zeitpunkt des Versiegelns** in den Block. Ein später umbenanntes oder deaktiviertes
Fahrzeug ändert damit keinen alten Bericht, und der Export braucht keine Stammdaten.

### 3.2 Block

```ts
interface Blockkopf {
  v: 1;
  block: number;          // 1, 2, 3 … lückenlos
  prev: string;           // SHA-256-Hex des Vorgängers; Block 1: 64 × "0"
  versiegelt: string;     // ISO mit Offset
  schluesselId: string;   // SHA-256-Hex des öffentlichen Suite-Schlüssels (SPKI-DER), erste 16 Zeichen
  umgebung: "echt" | "test";  // Test-Rechner versiegeln immer "test" (§12); Teil von Hash und AAD
}
interface Block {
  kopf: Blockkopf;
  iv: string;             // base64, 12 Byte
  daten: string;          // base64, AES-256-GCM(CEK, iv, AAD = JCS(kopf)) über JCS(Einsatz)
  umschlag: {             // CEK für die Suite eingepackt
    epk: string;          // base64, ephemerer öffentlicher P-256-Schlüssel, unkomprimiert (65 Byte)
    iv: string;           // base64, 12 Byte
    ct: string;           // base64, AES-256-GCM(KEK, iv, AAD = JCS(kopf)) über CEK (32 Byte)
  };
  hash: string;           // SHA-256-Hex über JCS({kopf, iv, daten, umschlag})
}
```

- **CEK:** 32 Zufallsbytes je Block.
- **Einpacken (ECDH-ES):** `KEK = HKDF-SHA256(ikm = ECDH(ephemer, suitePub), salt = leer,
  info = "einsatzbuch/v1/umschlag")`, 32 Byte.
- **Kopf als AAD** an Nutzdaten und Umschlag: Ein Umschlag oder Chiffrat lässt sich nicht auf einen
  anderen Block umhängen.
- **Der Hash deckt das Chiffrat ab.** „Kette prüfen“ funktioniert deshalb bei gesperrter Sitzung und
  ohne Schlüssel. Der Reader prüft dieselben Hashes wie der Rechner.

### 3.3 Exportdatei `.einsatzbuch`

```ts
interface Exportdatei {
  format: "einsatzbuch-export"; version: 2;
  kopf: { erstellt: string; umfang: "alle" | "einzeln"; von: number; bis: number; anzahl: number; quelle: string };
  kdf: { name: "PBKDF2"; hash: "SHA-256"; iterationen: 600000; salt: string };
  chiffre: { name: "AES-GCM"; laenge: 256; iv: string };
  daten: string;          // AES-GCM(pw-Schlüssel, iv, AAD = JCS(kopf)) über JCS(Exportinhalt)
}
interface Exportinhalt {
  bloecke: Block[];                     // ORIGINALE Blöcke, unverändert
  schluessel: Record<number, string>;   // Blocknummer → CEK (base64)
  exportiertVon: string; quelle: string;
  anker: { block: number; hash: string; gemeldetAm: string } | null;  // letzter bestätigter Anker
}
```

- Kennwort mindestens 10 Zeichen, zweimal eingeben (wie in der Vorlage).
- `version: 2` grenzt das Format bewusst von der Vorlage (`version: 1`, anderes Inhaltsmodell) ab.
  `istExportdatei` lehnt `version: 1` ab.

---

## 4. Desktop-App

### 4.1 Fenster und Betrieb

- Normales, größenveränderbares Fenster (Mindestgröße 1024 × 700), kein Vollbild, kein
  „immer oben“.
- Autostart beim Anmelden am Betriebssystem ist per Vorgabe an und in der Verwaltung schaltbar.
- Einzelinstanz: Ein zweiter Start holt das vorhandene Fenster nach vorn.
- Das Schließen-Kreuz beendet die App. Eine laufende Frist geht dadurch nicht verloren (§4.3).
- Hell/Dunkel: `auto|light|dark` wie in der Vorlage, `auto` folgt dem System (`prefers-color-scheme`
  ist hier richtig, denn die Suite-Cookie-Regel gilt nur für die Web-Suite).

### 4.2 Lokale Datenbank (Rust, `rusqlite`)

Datei `einsatzbuch.db` im App-Datenordner (`app_data_dir`), WAL, `synchronous = FULL`.

| Tabelle | Inhalt |
|---|---|
| `bloecke` | `block` PK, `json` (Block), `hash`, `versiegelt`. Trigger verbieten `UPDATE` und `DELETE`. |
| `ausstehend` | höchstens eine Zeile: Einsatz-Entwurf als JSON, `abgesendet_am`, `frist_bis` |
| `entwurf` | höchstens eine Zeile: Formularstand vor dem Absenden |
| `nummern` | `jahr` PK, `letzte` |
| `einrichtung` | Suite-URL, öffentlicher Schlüssel (SPKI), `schluesselId`, Stammdaten-JSON und -Version, Frist, Besatzungsschalter, Zeitzone, Bereitschaftsname, Sicherungsordner, Zeitpunkt der letzten Sicherung, `anker_gemeldet_bis` |

- Das Geräte-Token liegt im Schlüsselbund des Betriebssystems (Crate `keyring`), nicht in der DB.
- Der ausstehende Einsatz ist während der Frist im Klartext gespeichert. Das ist gewollt, denn er
  muss änderbar sein. Mit dem Versiegeln wird er gelöscht und die DB per `VACUUM` bereinigt.
- **Windows-Lehre** aus dem Einsatzarchiv (`7fb15de`): Dateien über das Schreib-Handle flushen, kein
  fsync auf Verzeichnisse unter Windows. Gilt für die Sicherung (§4.5).

### 4.3 Erfassung, Frist, Versiegeln

Zustände wie in der Vorlage: `start` → `form` → `frist` ⇄ `form (bearbeiten)` → `versiegelt`.

- **Absenden** geht nur mit Stichwort, Beginn und Einsatzort (Straße oder Ort). Ein Ende vor dem
  Beginn blockiert nicht, erzeugt aber den Hinweis der Vorlage.
- Das erste Absenden setzt `frist_bis = jetzt + Frist`. Änderungen innerhalb der Frist überschreiben
  den ausstehenden Stand, **ohne** die Frist zu verlängern. „Jetzt versiegeln“ versiegelt sofort.
- **Die Frist-Uhr läuft in Rust**, nicht in der Oberfläche: Prüfung beim Start und alle 15 Sekunden.
  Ist `frist_bis` erreicht, wird der **zuletzt abgesendete** Stand versiegelt, auch wenn das Formular
  gerade ungespeicherte Änderungen hat. Die Oberfläche zeigt dann den Hinweis „Deine letzten
  Änderungen wurden nicht übernommen …“.
- Nach einem Absturz oder Beenden während der Frist versiegelt der nächste Start einen überfälligen
  Einsatz, bevor die Oberfläche erscheint.
- **Versiegeln** in einer SQLite-Transaktion:
  1. Nummer vergeben (`nummern`)
  2. Schnappschüsse der Stammdaten einsetzen
  3. CEK erzeugen, verschlüsseln, einpacken
  4. Hash bilden, Block anhängen
  5. `ausstehend` löschen

  Danach, außerhalb der Transaktion: Sicherung schreiben (§4.5), Anker melden (§4.6). Der CEK wird
  nach dem Einpacken im Speicher überschrieben (`zeroize`).
- Ohne Einrichtung (§4.4) kann nicht versiegelt werden, denn es fehlt der öffentliche Schlüssel.
  Die Erfassung zeigt dann „Rechner ist noch nicht eingerichtet“ und leitet zur Anmeldung.

### 4.4 Anmeldung und Einrichtung

**Anmeldung über die Suite** (Einmalcode mit PKCE, Loopback):

1. Rust öffnet einen HTTP-Listener auf `127.0.0.1:<zufälliger Port>` und erzeugt `state` sowie einen
   PKCE-`verifier`.
2. Der Systembrowser öffnet
   `https://<einsatzbuch-host>/m/einsatzbuch/anmelden?port=<p>&state=<s>&challenge=<S256(verifier)>`.
3. Die Seite verlangt die normale Suite-Sitzung (Pocket ID) und die Gruppe. Dann erzeugt sie einen
   Einmalcode (32 Zufallsbytes, 60 s gültig, einmal einlösbar, gebunden an `challenge`) und leitet
   nach `http://127.0.0.1:<p>/rueckruf?code=…&state=…` weiter. `port` muss eine Zahl zwischen 1024
   und 65535 sein, und das Ziel ist immer `127.0.0.1`.
4. Rust prüft `state` und tauscht per `POST /m/einsatzbuch/api/anmelden/tausch {code, verifier}`
   gegen ein **Sitzungstoken**: 30 min gültig, nicht verlängerbar, in der Suite nur als SHA-256
   gespeichert. Die Antwort enthält außerdem den Namen der Person.
5. Der Browser-Tab zeigt „Du kannst dieses Fenster schließen.“ Die App holt ihr Fenster nach vorn.

Das Sitzungstoken berechtigt **nur** zu `einrichten` und `schluessel/freigeben`. Die Verwaltungs-
sitzung am Rechner endet beim Abmelden, beim Sperren nach 10 Minuten ohne Eingabe oder mit Ablauf
des Tokens. Danach sind alle entschlüsselten Inhalte und CEKs aus dem Speicher entfernt.

**Einrichtung** (einmalig, oder nach Widerruf erneut): Nach der ersten Anmeldung ruft die App
`POST /m/einsatzbuch/api/einrichten` mit dem Sitzungstoken auf und erhält:
- öffentlichen Schlüssel (SPKI) und `schluesselId`
- Geräte-Token (32 Zufallsbytes, in der Suite als SHA-256 gespeichert)
- Stammdaten mit Version, Frist, Besatzungsschalter, Zeitzone und Bereitschaftsname

Den öffentlichen Schlüssel **pinnt** die App. Ein späterer Abruf mit anderer `schluesselId` wird
abgelehnt und in der Verwaltung rot gemeldet. Schlüsselwechsel gehört nicht zu v2.0.

**Stammdaten nachladen:** `GET /api/stammdaten` mit Geräte-Token und `If-None-Match` beim Start und
stündlich. Ohne Netz gilt die gespeicherte Kopie. Die Verwaltung zeigt „Stammdaten vom …“.

### 4.5 Sicherung

- Einstellbarer Ordner (Verwaltung → Sicherung, Ordnerwahl per Dialog).
- Nach jedem Versiegeln und beim Start schreibt die App `einsatzbuch-sicherung.json`, die
  vollständige Kette als `{ format: "einsatzbuch-sicherung", version: 1, erstellt, bloecke: Block[] }`.
  Die Datei enthält **keine** CEKs und ist nur mit dem Suite-Schlüssel lesbar.
- Atomar: Temp-Datei im selben Ordner, flushen, umbenennen. Vorher wird die bisherige Datei in
  `einsatzbuch-sicherung.1.json` … `.10.json` rotiert.
- Scheitert das Schreiben, läuft das Versiegeln trotzdem weiter. Die Verwaltung zeigt „Letzte
  Sicherung: … — Ordner nicht erreichbar“ in Gelb, ab 7 Tagen ohne Sicherung in Rot.
- **Wiederherstellen** (nur angemeldet, nur bei leerer Kette): Die App liest die Datei, prüft die
  Kette und gleicht den letzten Block gegen den Anker der Suite ab. Nur wenn beides passt, übernimmt
  sie die Blöcke. `nummern` wird über die Schlüsselfreigabe aus den Nummern der Blöcke rekonstruiert.

### 4.6 Kettenanker

- Nach jedem Versiegeln (und beim Start für alle noch nicht gemeldeten Blöcke) schickt die App
  `POST /api/anker {block, hash}` mit dem Geräte-Token. Dabei werden keine Inhalte übertragen.
- Die Suite speichert je Block einen Hash. Kommt für einen gemeldeten Block ein **anderer** Hash,
  speichert sie die Abweichung und zeigt sie auf der Rechner-Seite rot. Sie antwortet mit
  `409 { erwartet }`.
- „Kette prüfen“ am Rechner prüft die Kette selbst (§3.2) **und**, wenn online, den letzten Block
  gegen den Anker. Das Ergebnis zeigt beides getrennt: „Kette intakt“ / „Anker bestätigt bis
  Block n“.

### 4.7 Verwaltung am Rechner

Wie die Vorlage. Nach der Anmeldung:

1. Die App schickt alle Umschläge an `schluessel/freigeben` (in Paketen zu höchstens 200).
2. Sie entschlüsselt die Blöcke im Speicher.
3. Sie zeigt Kennzahlen, Stichwortverteilung, Kettenliste und Detail.

Außerdem:
- „Sitzung sperren“ verwirft Klartext und CEKs.
- Export (§3.3): Speichern-Dialog statt Browser-Download.
- PDF über das Berichtsblatt und den Druckdialog.
- Einstellungen: Sicherungsordner, Autostart, Hell/Dunkel.
- Anzeige von Rechnerstatus, Stammdatenstand, Sicherung und Anker.

Die „Block 0“-Zeile der Vorlage zeigt Datum und Person der Einrichtung. Beides speichert die App
bei der Einrichtung in `einrichtung`.

### 4.8 Updates

- Tauri-Updater mit eigenem Minisign-Schlüsselpaar. Der private Schlüssel und sein Kennwort liegen
  als GitHub-Secrets (`TAURI_SIGNING_PRIVATE_KEY`, `…_PASSWORD`), der öffentliche steht in
  `tauri.conf.json`.
- Endpunkt: `https://github.com/rubenvitt/iuk-suite/releases/download/einsatzbuch-updater/latest.json`.
  Die Suite legt bei jedem Merge ein Release als „Latest“ an, deshalb kann der Updater nicht
  `releases/latest` benutzen. `einsatzbuch-updater` ist ein Dauer-Release, dessen Asset
  `latest.json` der Workflow bei jedem `einsatzbuch-v*`-Tag ersetzt. Das Release ist nicht als
  „Latest“ markiert.
- Prüfen beim Start und alle 6 Stunden. Installiert wird nur, wenn nichts `ausstehend` ist und
  niemand angemeldet ist. Sonst wird vorgemerkt und beim nächsten passenden Moment installiert.
- Ohne Code-Signing-Zertifikat warnt SmartScreen (Windows) bzw. Gatekeeper (macOS) einmal bei der
  Erstinstallation. Das Runbook beschreibt den Klickweg. Updates über den Tauri-Updater lösen
  diese Warnung nicht erneut aus, denn die Signatur prüft Tauri selbst.

---

## 5. Suite-Modul

### 5.1 Datenbank `einsatzbuch`

| Tabelle | Zweck |
|---|---|
| `fahrzeug` | `id`, `typ`, `kennung` (eindeutig), `ruf`, `standort`, `aktiv` |
| `person` | `id`, `name` („Nachname, Vorname“), `quali`, `ov`, `aktiv` |
| `stichwort` | `id`, `gruppe`, `name`, `reihenfolge`, `aktiv` |
| `einstellung` | Schlüssel/Wert: `fristMinuten` (15), `besatzung` (an), `bereitschaft` („DRK-Bereitschaft Uelzen“) |
| `schluesselpaar` | genau eine Zeile: `schluesselId`, `oeffentlich` (SPKI), `privatVerschluesselt` (AES-GCM mit KEK aus `EINSATZBUCH_SCHLUESSEL_KEK`), `erzeugtAm` |
| `rechner` | genau eine aktive Zeile: `tokenHash`, `eingerichtetAm`, `eingerichtetVon`, `letzterKontakt`, `letzteSicherung` (vom Rechner gemeldet), `widerrufenAm` |
| `anker` | `block` PK, `hash`, `gemeldetAm`; `ankerAbweichung` getrennt, mit Zeitpunkt und beiden Hashes |
| `einmalcode` | `codeHash`, `challenge`, `sub`, `name`, `ablauf`, `eingeloest` |
| `sitzung` | `tokenHash`, `sub`, `name`, `ablauf` |

Die Stammdatenversion ist ein Zähler, der bei jeder Änderung an `fahrzeug`, `person`, `stichwort`
oder `einstellung` steigt, und dient als ETag.

Deaktivieren statt Löschen: Deaktivierte Einträge fallen aus der Auswahl am Rechner. Weil Blöcke
Schnappschüsse tragen (§3.1), wäre Löschen technisch unkritisch. Deaktivieren erhält aber die
Nachvollziehbarkeit in der Pflege.

### 5.2 Seiten (Admin-Klasse: antd, Suite-Chrome)

| Pfad | Inhalt |
|---|---|
| `/m/einsatzbuch` | Übersicht: Rechnerstatus, letzter Anker, Abweichungen, Link zum Reader |
| `/m/einsatzbuch/stammdaten` | Reiter Fahrzeuge / Personal / Stichworte, je `Datentabelle` mit Anlegen, Bearbeiten, Deaktivieren, CSV-Import (Kopfzeile mit festen Spalten, Vorschau vor Übernahme) |
| `/m/einsatzbuch/einstellungen` | Frist in Minuten (1–120), Besatzungszuordnung, Name der Bereitschaft |
| `/m/einsatzbuch/rechner` | Eingerichtet am/von, letzter Kontakt, letzte Sicherung, Anker bis Block n, Abweichungen, Schlüssel-Fingerabdruck, „Rechner widerrufen“ |
| `/m/einsatzbuch/reader` | Reader (§6) |
| `/m/einsatzbuch/anmelden` | Anmeldeseite für den Rechner (§4.4), ohne Chrome |

Änderungen an Stammdaten und Einstellungen, der Widerruf des Rechners und jede Schlüsselfreigabe
werden im Suite-Audit-Log (`core/audit`) protokolliert. Zugangsverweigerungen auf den Seiten folgen
dem Abdeckungsmanifest (`page-coverage-manifest.json`), wie in den übrigen Modulen.

### 5.3 Schnittstellen (Route Handler unter `/m/einsatzbuch/api/`)

| Methode, Pfad | Berechtigung | Wirkung |
|---|---|---|
| `POST anmelden/tausch` | Einmalcode + `verifier` | Sitzungstoken, Name |
| `POST einrichten` | Sitzungstoken | Widerruft einen bestehenden Rechner, legt den neuen an. Liefert Schlüssel, Geräte-Token, Stammdaten. |
| `GET stammdaten` | Geräte-Token | Stammdaten + Einstellungen, `ETag`, `304` bei gleicher Version. Setzt `letzterKontakt`. |
| `POST anker` | Geräte-Token | `{block, hash}` → `204`, oder `409 {erwartet}` bei Abweichung |
| `POST sicherung` | Geräte-Token | `{erstellt}`, nur Zeitpunkt der letzten Sicherung für die Statusseite |
| `POST schluessel/freigeben` | Sitzungstoken | `[{kopf, umschlag}]` (≤ 200) → `[{block, cek}]`. Prüft `schluesselId`, packt aus, schreibt einen Audit-Eintrag (Person, Blocknummern, Anzahl). |

- Alle Handler: Host-Riegel zuerst, dann Token-Prüfung, dann Zod-Validierung des Körpers.
- Tokens kommen als `Authorization: Bearer …` und werden per Hash in konstanter Zeit verglichen.
- Fehlende Gruppe bei der Anmeldung → Seite „Kein Zugang zum Einsatzbuch“. Kein Einmalcode.
- Die Gruppe prüft die Anmeldeseite anhand der Suite-Sitzung, bevor sie einen Einmalcode ausgibt.
  Das Sitzungstoken erbt diese Prüfung und gilt 30 Minuten, ohne Verlängerung. Ein Gruppenentzug
  wirkt deshalb spätestens nach dem Token-Refresh-Takt der Suite (≈ 1 h, `CLAUDE.md`) plus 30
  Minuten. Das reicht für diesen Zweck. Wer sofort sperren muss, widerruft den Rechner.
- Ratenbegrenzung für `tausch`: 10 pro Minute und IP.

### 5.4 Schlüsselpaar

- Erzeugung einmalig über `pnpm einsatzbuch:schluessel erzeugen`. Das Skript legt das Paar an und
  gibt eine **Notfall-Sicherung** aus: den privaten Schlüssel als PKCS#8, verschlüsselt mit einem
  eingegebenen Kennwort (PBKDF2 600 000 + AES-GCM), als Datei und als QR-Code zum Ausdrucken.
- `EINSATZBUCH_SCHLUESSEL_KEK` (32 Byte base64) kommt in die Umgebung der Suite. Fehlt sie, startet
  das Modul mit deutlicher Meldung auf der Übersicht, und `freigeben` antwortet `503`.
- Runbook `docs/runbooks/einsatzbuch-schluessel.md`: erzeugen, Notfall-Sicherung ablegen (Tresor),
  wiederherstellen (`pnpm einsatzbuch:schluessel wiederherstellen`), was bei Verlust verloren ist
  (alles außer bereits exportierten `.einsatzbuch`-Dateien).

---

## 6. Reader

- Seite `/m/einsatzbuch/reader`, dieselbe Gruppe. Die Oberfläche folgt `Einsatzbuch Reader.dc.html`
  mit den geteilten Ansichten aus dem Kern.
- **Nur Client:** Die Datei wird per `File.text()` gelesen und mit WebCrypto entschlüsselt. Es gibt
  keine Server Action, keinen Upload und kein Speichern. Schließen oder Neuladen verwirft alles.
- Ablauf: Datei wählen oder ablegen → Kopf anzeigen → Kennwort → `pruefeKette(bloecke)` → jeden
  Block mit seinem CEK entschlüsseln (AAD-Fehler = „Block n lässt sich nicht öffnen“) → Liste,
  Detail, Bericht.
- Kettenprüfung wie in der Vorlage: „Kette intakt“, „Ausschnitt intakt“ (Vorgänger nicht in der
  Datei), „Gebrochen bei Block n: …“. Liegt ein Anker in der Datei, wird er zusätzlich angezeigt.
- **Entfällt gegenüber der Vorlage:** „Beispieldatei öffnen“ samt Kennwort im Quelltext.
- Nach dem Öffnen einer Datei und nach jedem Druck meldet der Reader ein Browser-Ereignis über
  `reportBrowserExport` (`core/audit/browser.ts`), mit Blockbereich und Anzahl, ohne Inhalt. Passt
  das heutige Schema `BrowserExport` nicht, wird es in Stufe 3 um einen Ereignistyp erweitert.

---

## 7. Berichtsblatt

Eine geteilte Komponente `Berichtsblatt` nach `Einsatzbericht.dc.html` (A4, `@page { size: 210mm
297mm; margin: 14mm 16mm }`, siehe Falle 18). Sie wird in der App und im Reader über `window.print()`
gedruckt. Die Druckregeln hängen an einem eigenen Rahmen. Die Fußzeile „Vertraulich — nur für den
Dienstgebrauch“ bleibt. „Kettenprüfung“ im Blatt übernimmt das Ergebnis der letzten Prüfung.

---

## 8. Fehlerbilder

| Lage | Verhalten |
|---|---|
| Suite nicht erreichbar | Erfassen und Versiegeln normal. Die Verwaltung meldet nach der Anmeldung: „Lesen braucht Verbindung zur Suite.“ Anker und Stammdaten werden später nachgeholt. |
| Anmeldung abgebrochen | Der Listener schließt nach 5 Minuten. Die App zeigt „Anmeldung abgebrochen“. |
| Gruppe fehlt | Suite-Seite „Kein Zugang“. Die App zeigt nach Ablauf „Anmeldung nicht abgeschlossen“. |
| Rechner widerrufen | `stammdaten`/`anker` → 401. Die App zeigt „Rechner muss neu eingerichtet werden“. Versiegeln geht weiter (der öffentliche Schlüssel liegt lokal). |
| Sicherungsordner fehlt | Gelb bzw. rot in der Verwaltung (§4.5), Versiegeln unberührt |
| Kette gebrochen | Rot mit Blocknummer und Grund, Export trotzdem möglich (der Reader zeigt dieselbe Stelle) |
| Anker weicht ab | Rot in App und auf der Rechner-Seite der Suite |
| `schluesselId` passt nicht | Freigabe verweigert, rote Meldung mit beiden IDs |
| KEK fehlt in der Suite | `freigeben` 503, Hinweis auf der Übersicht |
| Falsches Export-Kennwort | „Das Kennwort passt nicht. Die Datei bleibt verschlüsselt.“ |

---

## 9. Tests

### 9.1 Testvektoren (Format-Vertrag zwischen Rust und TypeScript)

`kern/testvektoren/` enthält:
- ein Test-Schlüsselpaar
- drei Einsätze
- die daraus mit **festen** CEKs, IVs und ephemeren Schlüsseln erzeugten Blöcke
- eine Exportdatei mit festem Salt
- Negativfälle: veränderter Kopf, vertauschter Umschlag, Lücke, falscher Anfang

**Rust** erzeugt die Blöcke aus denselben Eingaben und vergleicht sie byte-genau (Test in
`src-tauri`, liest die JSON-Dateien über einen relativen Pfad). **TypeScript** prüft Kette,
Entschlüsseln und Export gegen dieselben Dateien.

### 9.2 Suite (Vitest, Playwright)

- **Kern:** Kette (gültig, Block verändert, Lücke, falscher Anfang, Ausschnitt), Umschlag-Rundlauf
  mit dem Auspacken der Suite, Export-Rundlauf, falsches Kennwort, manipulierter Kopf, Berichtsmodell,
  Grenztest.
- **API:**
  - Einmalcode verfällt und ist nur einmal einlösbar
  - falscher `verifier` → 400
  - Gruppe fehlt → kein Code
  - Sitzungstoken abgelaufen → 401
  - Geräte-Token widerrufen → 401
  - Anker-Abweichung → 409 und Eintrag
  - `freigeben` mit fremder `schluesselId` → 422
  - Paketgrenze 200
  - Audit-Eintrag geschrieben
- **Stammdaten:** CRUD, CSV-Import (Vorschau, Fehlerzeilen), Version steigt.
- **Playwright:**
  - Reader: Testvektor-Datei öffnen, Kennwort, Kette intakt, Detail, Bericht
  - Reader: manipulierte Datei → „Gebrochen bei Block n“
  - Stammdaten-Durchlauf
  - Rechner-Seite
  - Anmeldeseite mit Weiterleitung auf `127.0.0.1` (ohne echten Listener)
- `bootstrap.test.ts` (Dreieck), `scripts/seed-lokal.test.ts` (Seed), Registry-Tests.

### 9.3 Desktop

- **Rust:**
  - Frist-Versiegelung nach Neustart
  - Versiegeln mit ungespeichertem Formular nimmt den abgesendeten Stand
  - Trigger verhindern `UPDATE`/`DELETE`
  - Nummernvergabe über den Jahreswechsel
  - atomare Sicherung mit Rotation
  - Wiederherstellung nur bei passendem Anker
  - Loopback-Listener prüft `state`
  - Testvektoren
- **Vitest (Oberfläche):** Formularlogik (Pflichtfelder, Dauer, Suche mit Enter), Zustandswechsel,
  Verwaltung mit gestubbten Tauri-Befehlen.
- **Playwright** gegen den Vite-Dev-Server mit einer Stub-Schicht für `invoke`: Erfassen → Frist →
  Versiegeln → Anmelden (Stub) → Detail → Export. Ein E2E im echten Tauri-Fenster entfällt bewusst,
  denn unter macOS gibt es keinen stabilen WebDriver für WKWebView.
- **CI:** `tauri build` als Rauchtest in der Matrix `windows-latest` + `macos-latest` bei jeder
  Änderung unter `apps/einsatzbuch/` oder `_lib/kern/`.

---

## 10. Abweichungen von der Vorlage

| Vorlage | v2 | Grund |
|---|---|---|
| `h53`-Hash (nicht kryptografisch) | SHA-256 über JCS | Die Oberfläche verspricht Unveränderlichkeit |
| Klartext-Kette in `localStorage` | Chiffrat je Block, Hash über das Chiffrat | „hier nicht mehr einsehbar“ muss technisch stimmen |
| Anmelden-Knopf schaltet nur die Ansicht | Suite-Anmeldung + Schlüsselfreigabe | A6, A7 |
| Frist 60 s | 15 min, in der Suite einstellbar | A13 |
| Stammdaten fest im Code | aus der Suite, Schnappschuss im Block | A8 |
| PBKDF2 250 000 Runden | 600 000 Runden | OWASP-Empfehlung 2023 für PBKDF2-SHA256. Der Text im Export-Dialog nennt die neue Zahl. |
| Export mit Klartext-Kette | Originalblöcke + CEKs, Format `version: 2` | Der Reader prüft dieselben Hashes wie der Rechner |
| Reader: Beispieldatei mit Kennwort im Code | entfällt | Ein veröffentlichtes Kennwort führt nichts Sinnvolles vor |
| Browser-Download | Speichern-Dialog des Systems | Desktop |

Texte der Vorlage bleiben wörtlich, wo die Funktion gleich bleibt.

---

## 11. Stufen (je ein PR)

1. **Kern und Modulgerüst:** `_lib/kern` mit Format, JCS, Kette, Export, Bericht, Testvektoren und
   Grenztest. Registry-Eintrag, Zugang, Host-Riegel, DB-Dreieck, Übersichtsseite.
2. **Suite-Pflege und Schlüssel:** Stammdaten mit CSV-Import, Einstellungen, Schlüsselpaar-Skript,
   KEK, Runbook `einsatzbuch-schluessel.md`, Seed.
3. **Reader.**
4. **Desktop I:** Workspace-Eintrag und Werkzeug-Ausschlüsse (`tsconfig`, ESLint, Vitest, Docker)
   für `apps/**`, Tauri-Gerüst (Icons inkl. `icon.ico`, Einzelinstanz, Autostart), lokale DB,
   Erfassung, Frist-Uhr, Versiegeln in Rust gegen die Testvektoren.
5. **Desktop II + Suite-API:** Anmeldung (Seite, `tausch`, Loopback), Einrichtung, Stammdaten-Abruf,
   Anker, Schlüsselfreigabe, Verwaltung am Rechner.
6. **Desktop III:** Sicherung und Wiederherstellung, Export, Berichtsblatt/PDF, Sperren nach
   Inaktivität.
7. **Auslieferung:** Workflow `einsatzbuch.yml` (Matrix-Build, Tag `einsatzbuch-v*`, Release,
   `latest.json` am Dauer-Release), Updater, Runbook `docs/runbooks/einsatzbuch-release.md`
   (Installation inkl. SmartScreen/Gatekeeper, Einrichtung, Update), Release-Notiz im Portal.

Jede Stufe hält die Suite-Tore grün (`typecheck`, `lint`, `vitest`, `build`, Playwright). Ab Stufe 4
kommen die Tore der App dazu.

**Versionierung:** Die App trägt eine eigene Version in `apps/einsatzbuch/src-tauri/tauri.conf.json`,
getaggt als `einsatzbuch-vX.Y.Z` von Hand beim Release (Runbook). Die Suite-Versionierung
(`scripts/version.mjs`) zählt nur Tags `vX.Y.Z` und bleibt unberührt. Stufe 7 prüft, dass
`einsatzbuch-v*`-Tags sie nicht stören.

---

## 12. Test-Rechner (Nachtrag A16)

Die Anbindung muss sich Ende-zu-Ende ausprobieren lassen: Einrichtung, Anmeldung, Stammdaten,
Versiegeln, Anker, Schlüsselfreigabe, Export, Reader. Dabei dürfen weder echte Einsätze entstehen
noch die echte Kette oder ihre Anker berührt werden.

**Einrichtungsart.** `POST einrichten` nimmt `{ art: "echt" | "test", name }`.
- `echt`: wie §4.4. Es gibt genau einen echten Rechner; eine neue echte Einrichtung widerruft den
  bisherigen.
- `test`: legt einen **zusätzlichen** Test-Rechner an. Die Suite erzeugt dafür ein **eigenes
  Schlüsselpaar**, der private Schlüssel liegt mit demselben KEK verschlüsselt in der Modul-DB. Die
  Antwort liefert dessen öffentlichen Schlüssel. Beliebig viele Test-Rechner sind möglich.

**Datenmodell (Suite, ergänzt §5.1).**
- `schluesselpaar` bekommt `rechnerId` (NULL = das echte Paar) und `art`.
- `rechner` bekommt `art` (`echt`/`test`), `name` und `id`. Genau ein aktiver `echt`, beliebig
  viele `test`.
- `anker` ist je `rechnerId` getrennt (PK `rechnerId, block`).

**Verhalten.**
- **Blockkopf:** Ein Test-Rechner versiegelt mit `umgebung: "test"` und seinem Test-Schlüssel. Seine
  Einsatznummern tragen das Präfix `T-` (`T-2026-001`). Ein echter Rechner versiegelt nie `test`.
- **Schlüsselfreigabe:** `schluessel/freigeben` findet das Paar über die `schluesselId`. Test-Paare
  gibt sie nur frei, wenn `kopf.umgebung === "test"`, das echte Paar nur bei `"echt"`. Ein
  Mischversuch antwortet 422. Die Audit-Zeile nennt Art und Rechner.
- **Anker und Status:** Anker, letzter Kontakt und letzte Sicherung eines Test-Rechners stehen nur
  an diesem Test-Rechner. Die Übersicht und der Anker des echten Rechners bleiben unberührt.
- **Desktop:**
  - Beim ersten Start fragt die App: „Echter Einsatzbuch-Rechner“ oder „Testrechner“.
  - Ein Testrechner nutzt eine **eigene Datenbankdatei** (`einsatzbuch-test.db`) und trägt dauerhaft
    ein gestreiftes Band „TESTBETRIEB — nichts hiervon ist ein echter Einsatz“.
  - Automatische Sicherung ist im Testbetrieb aus, Export geht.
  - Die Suite-Adresse ist bei der Einrichtung vorbelegt (Build-Wert) und im Testbetrieb änderbar,
    etwa `http://einsatzbuch.localtest.me:3000` gegen die lokale Suite.
- **Löschen in der Suite:** Auf der Seite „Rechner“ listet die Suite die Test-Rechner mit Name,
  eingerichtet am/von und letztem Kontakt. „Test-Rechner löschen“ entfernt Rechner, Token,
  Schlüsselpaar und Anker unwiderruflich. Danach sind die Testeinsätze dieses Rechners auch mit
  Export nicht mehr zu öffnen, soweit der Export die CEKs nicht selbst trägt.
- **Löschen in der App:**
  - „Testbetrieb beenden“ löscht die lokale Testdatenbank.
  - Ist eine Verwaltungssitzung offen, löscht die App zusätzlich den Test-Rechner in der Suite
    (`DELETE /m/einsatzbuch/api/rechner/<id>`, Sitzungstoken, nur `art = test`).
  - Danach steht die App wieder bei der Einrichtungsfrage.
- **Reader:** Enthält eine Datei Blöcke mit `umgebung: "test"`, zeigt der Reader oben ein nicht
  wegklickbares Band „Testdaten — kein echter Einsatz“. Das Berichtsblatt trägt dann „TESTDATEN“
  im Kopf.
- **Kein Wechsel im Betrieb:** Eine echte Installation wird nie zum Testrechner. Ein Testrechner
  wird echt nur über „Testbetrieb beenden“ und eine neue Einrichtung. Die Kette entsteht dabei
  leer, es wird nichts übernommen.

**Stufen:**
- Stufe 1: das Feld `umgebung` im Format.
- Stufe 2: Schlüsselpaare je Rechner.
- Stufe 3: Band im Reader.
- Stufe 4: getrennte DB-Datei und Band in der App.
- Stufe 5: Einrichtungsart, Freigaberegel, Löschen in Suite und App.
