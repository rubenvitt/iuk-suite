/**
 * DAS PERSONENVERZEICHNIS DER SUITE — lesender Zugriff auf die Nutzerliste des
 * Identitaetsanbieters (Pocket ID, `GET /api/users`).
 *
 * ── WARUM `core` UND NICHT DAS MODUL `feedback` ───────────────────────────────
 *
 * Der Massstab aus `docs/design/README.md` ist streng: „ein zweiter, heute
 * belegbarer Nutzniesser". Aufrufer hat dieses Verzeichnis heute genau einen
 * (`app/m/feedback`), und das allein wuerde die Hebung NICHT rechtfertigen.
 * Drei Gruende tun es zusammen:
 *
 * 1. DIE FRAGE IST SUITEWEIT, NICHT FACHLICH. „Welche Personen gibt es im SSO?"
 *    ist dieselbe Frage, die `core/auth` schon fuer den angemeldeten Nutzer
 *    beantwortet — nur fuer alle. Sie hat keinen fachlichen Anteil des Moduls
 *    `feedback`: kein Dienstabend, keine Note, keine Gruppe kommt darin vor.
 * 2. DIE KONFIGURATION IST SUITEWEIT. Basis-URL und API-Key sind `POCKET_ID_*`,
 *    genau wie Issuer, Client-Id und Scopes — ein Stack, ein Anbieter, ein Key.
 *    Ein modul-eigener Client haette eine modul-eigene `FEEDBACK_POCKET_ID_*`-
 *    Konfiguration erzwungen, und das zweite Modul waere ein zweiter Key.
 * 3. DER AUSWEG WAERE VERBOTEN. Dasselbe Dokument haelt fest: „`payloadToSvg`
 *    durfte nicht quer aus einem Modul in ein anderes importiert werden:
 *    Modul-Interna sind kein API." Laege der Client unter
 *    `app/m/feedback/_lib/`, koennte ihn der zweite Nutzniesser nicht benutzen —
 *    er muesste ihn kopieren oder erst hierher heben.
 *
 * Der zweite Nutzniesser ist absehbar und im Repo belegbar, nicht behauptet:
 * `src/app/m/qr/_db/schema.ts:23-24` speichert `created_by`/`updated_by` bereits
 * als denselben OIDC-`sub` und zeigt sie heute nirgends als Namen an — genau die
 * Luecke, die dieses Verzeichnis schliesst. Dazu die geplanten Module
 * `lagerbuch` (Phase 5) und `radio` (Phase 6), die im Repo als
 * `SUITE_HOST_LAGERBUCH`/`SUITE_HOST_RADIO` in `.env.example` und in
 * `docs/superpowers/specs/2026-07-18-portal-productionize-design.md:16`
 * vorgesehen sind und dieselbe Zuordnungsfrage stellen.
 *
 * ── DIE TRAGENDE ANNAHME, DIE DIE DOKU NICHT BESTAETIGT ───────────────────────
 *
 * `UserDto.id` IST der OIDC-`sub`. Weder `swagger.yaml` noch `docs/api.md` sagen
 * das; der Beleg steht im Quellcode von Pocket ID:
 * `backend/internal/oidc/claims_service.go:147` → `claims["sub"] = user.ID`.
 * Darauf ruht der ganze Zweck: `user_groups.user_id` und `known_users.user_id`
 * speichern den `sub`, und ein Eingabefeld koennte ihn nie liefern.
 * Gegenprobe im Betrieb (30 Sekunden): eine bestehende `known_users.user_id`
 * nehmen und pruefen, dass `GET /api/users/<id>` genau diese Person liefert.
 *
 * ── AUSFALLSICHERHEIT IST DIE ERSTE EIGENSCHAFT, NICHT DIE LETZTE ─────────────
 *
 * Keine Funktion hier wirft. Nicht konfiguriert, nicht erreichbar, HTTP-Fehler,
 * Zeitueberschreitung, unlesbare Antwort — alles endet in
 * `{ status, people: [] }`. Der Grund ist nicht Bequemlichkeit: die Cockpit-
 * Seite laedt das Verzeichnis, um Namen zu bestehenden Zuordnungen zu finden.
 * Wuerde ein Verzeichnisfehler dort werfen, waeren die BESTEHENDEN Zuordnungen
 * unlesbar — die Oberflaeche wuerde also genau in dem Moment kaputtgehen, in dem
 * sie auf das lokale Verzeichnis (`known_users`) zurueckfallen soll.
 *
 * Ein FEHLER WIRD NIE GECACHT. Sonst vergiftet eine einzige Zeitueberschreitung
 * das Verzeichnis fuer die volle TTL.
 *
 * ── AUTHENTIFIZIERUNG ─────────────────────────────────────────────────────────
 *
 * Header `X-API-KEY`. Der Key haengt an einem Pocket-ID-Nutzer und erbt dessen
 * Rechte; `GET /api/users` laeuft hinter `AdminRequired: true`. Der Key MUSS
 * also einem Admin-Konto gehoeren — feingranulare Scopes gibt es nicht. Ein Key
 * ohne Adminrechte liefert 401/403, und das landet hier als `status: "error"`,
 * nicht als Absturz. Anlegen: `<AppURL>/settings/admin/api-keys`.
 */

/** Eine Person aus dem Identitaetsanbieter. `userId` ist der OIDC-`sub`. */
export type DirectoryPerson = {
  /** Der OIDC-`sub` — derselbe Wert, der in `user_groups.user_id` steht. */
  userId: string;
  /** Anzeigename; `null`, wenn der Anbieter keinen brauchbaren Namen fuehrt. */
  name: string | null;
  email: string | null;
};

/**
 * `unconfigured` und `error` sind BEWUSST getrennt: „kein Key hinterlegt" ist ein
 * Betriebszustand, den die Oberflaeche anders benennen darf als „Anbieter
 * antwortet nicht". Beide fuehren zum lokalen Rueckfall, aber nur einer davon
 * gehoert in ein Runbook.
 */
export type DirectoryStatus = "ok" | "unconfigured" | "error";

export type DirectoryResult = {
  status: DirectoryStatus;
  people: DirectoryPerson[];
};

/**
 * Der Netzwerkrand als Schnittstelle — strukturell kompatibel zu `fetch`, aber
 * so schmal, dass ein Test kein `Response`-Objekt bauen muss. Genau das ist der
 * Punkt: kein Test in diesem Projekt fasst das echte Netz an.
 */
export type DirectoryTransport = (
  url: string,
  init: { headers: Record<string, string>; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

export type DirectoryConfig = {
  /** Basis des Pocket-ID-Servers, ohne Pfad. Default: Env (siehe `getDirectory`). */
  baseUrl?: string;
  apiKey?: string;
  transport?: DirectoryTransport;
  /** Wie lange ein erfolgreicher Abzug gilt. Default 5 Minuten. */
  ttlMs?: number;
  /** Zeitgrenze je HTTP-Abruf. Default 5 Sekunden. */
  timeoutMs?: number;
  /** Harte Obergrenze der Seitenabrufe. Default 50 (= 5000 Personen). */
  maxPages?: number;
  now?: () => number;
};

export interface Directory {
  /** Der vollstaendige Abzug (aus dem Cache, wenn frisch). */
  list(): Promise<DirectoryResult>;
  /** Treffer zu einem Suchbegriff, begrenzt. Leerer Begriff → leere Liste. */
  search(query: string, limit?: number): Promise<DirectoryResult>;
  /** Exakter E-Mail-Vergleich (case-insensitiv) → hoechstens eine Person. */
  findByEmail(email: string): Promise<DirectoryResult>;
  invalidate(): void;
}

/**
 * Pocket ID deckelt `pagination[limit]` serverseitig auf 100 (`Paginate` in
 * `backend/internal/utils/list_request_util.go`) — ein groesserer Wert wird
 * stillschweigend auf 100 gekuerzt, nicht abgelehnt. Also gleich 100 anfordern.
 */
const SEITENGROESSE = 100;
const TTL_MS = 5 * 60_000;
const TIMEOUT_MS = 5_000;
const MAX_SEITEN = 50;
const TREFFER_STANDARD = 20;

const LEER: DirectoryPerson[] = [];

function text(wert: unknown): string | null {
  if (typeof wert !== "string") return null;
  const t = wert.trim();
  return t === "" ? null : t;
}

/**
 * `displayName` zuerst, weil ihn Pocket ID selbst als Anzeigeform fuehrt; dann
 * Vor-/Nachname (beide nullable), zuletzt die Kennung. `null` statt `""`, damit
 * die Oberflaeche „kein Name bekannt" von „Name ist leer" unterscheiden kann.
 */
function nameAus(u: Record<string, unknown>): string | null {
  const zusammen = [text(u.firstName), text(u.lastName)].filter(Boolean).join(" ").trim();
  return text(u.displayName) ?? (zusammen === "" ? null : zusammen) ?? text(u.username);
}

function personAus(roh: unknown): DirectoryPerson | null {
  if (typeof roh !== "object" || roh === null) return null;
  const u = roh as Record<string, unknown>;
  const userId = text(u.id);
  // Ohne `sub` ist ein Vorschlag nicht speicherbar — er waere ein Eintrag, den
  // man anklicken kann und der dann nichts zuordnet.
  if (!userId) return null;
  // Gesperrte Konten koennen sich nicht anmelden; sie zuzuordnen erzeugt eine
  // Zeile in `user_groups`, die nie jemand einloest.
  if (u.disabled === true) return null;
  return { userId, name: nameAus(u), email: text(u.email) };
}

function normalisiereBasis(roh: string | undefined): string {
  return (roh ?? "").trim().replace(/\/+$/, "");
}

type Seite = { people: DirectoryPerson[]; totalPages: number };

function seiteAus(roh: unknown): Seite {
  const o = (typeof roh === "object" && roh !== null ? roh : {}) as Record<string, unknown>;
  const data = Array.isArray(o.data) ? o.data : [];
  const pag = (typeof o.pagination === "object" && o.pagination !== null
    ? o.pagination
    : {}) as Record<string, unknown>;
  const total = typeof pag.totalPages === "number" && Number.isFinite(pag.totalPages)
    ? Math.max(1, Math.floor(pag.totalPages))
    : 1;
  return {
    people: data.map(personAus).filter((p): p is DirectoryPerson => p !== null),
    totalPages: total,
  };
}

/** Alles, worauf gesucht werden darf — Name, E-Mail und die Kennung selbst. */
function suchfeld(p: DirectoryPerson): string {
  return `${p.name ?? ""} ${p.email ?? ""} ${p.userId}`.toLowerCase();
}

/**
 * Reihenfolge der Treffer: erst wer VORNE passt (Tippen auf einen Namen), dann
 * der Rest, innerhalb beider Gruppen alphabetisch. Ohne diese Sortierung steht
 * bei „ann" ein „Hermann" vor „Anna", und die Auswahl fuehlt sich kaputt an.
 */
function trefferReihenfolge(a: DirectoryPerson, b: DirectoryPerson, q: string): number {
  const rang = (p: DirectoryPerson) =>
    (p.name ?? "").toLowerCase().startsWith(q) || (p.email ?? "").toLowerCase().startsWith(q)
      ? 0
      : 1;
  const d = rang(a) - rang(b);
  if (d !== 0) return d;
  return (a.name ?? a.userId).localeCompare(b.name ?? b.userId, "de");
}

export function createDirectory(config: DirectoryConfig = {}): Directory {
  const baseUrl = normalisiereBasis(config.baseUrl);
  const apiKey = (config.apiKey ?? "").trim();
  const transport: DirectoryTransport =
    config.transport ?? ((url, init) => fetch(url, init));
  const ttlMs = config.ttlMs ?? TTL_MS;
  const timeoutMs = config.timeoutMs ?? TIMEOUT_MS;
  const maxPages = Math.max(1, config.maxPages ?? MAX_SEITEN);
  const now = config.now ?? (() => Date.now());
  const konfiguriert = baseUrl !== "" && apiKey !== "";

  let cache: { people: DirectoryPerson[]; bis: number } | null = null;
  /** Laeuft gerade ein Abzug, haengen sich weitere Aufrufer daran statt neu zu holen. */
  let laufend: Promise<DirectoryResult> | null = null;

  async function holeSeite(page: number): Promise<Seite> {
    const params = new URLSearchParams({
      "pagination[page]": String(page),
      "pagination[limit]": String(SEITENGROESSE),
      // Stabile Sortierung ist Pflicht: ohne sie kann eine Person zwischen zwei
      // Seitenabrufen die Seite wechseln und dabei doppelt oder gar nicht
      // erscheinen. `username` ist sortierbar und immer gefuellt (`lastName`
      // ist nullable). Der Wert muss camelCase sein — `applySorting` macht
      // daraus selbst snake_case.
      "sort[column]": "username",
      "sort[direction]": "asc",
    });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await transport(`${baseUrl}/api/users?${params}`, {
        headers: { "X-API-KEY": apiKey, Accept: "application/json" },
        signal: controller.signal,
      });
      // Ein 401 ist KEIN Wurf von `fetch` — ohne diese Zeile liefe ein Key ohne
      // Adminrechte als leeres, aber „erfolgreiches" Verzeichnis durch.
      if (!res.ok) throw new Error(`Verzeichnis: HTTP ${res.status}`);
      return seiteAus(await res.json());
    } finally {
      clearTimeout(timer);
    }
  }

  async function abzug(): Promise<DirectoryResult> {
    try {
      const alle: DirectoryPerson[] = [];
      const erste = await holeSeite(1);
      alle.push(...erste.people);
      const seiten = Math.min(erste.totalPages, maxPages);
      for (let p = 2; p <= seiten; p += 1) {
        const weitere = await holeSeite(p);
        alle.push(...weitere.people);
      }
      cache = { people: alle, bis: now() + ttlMs };
      return { status: "ok", people: alle };
    } catch {
      // Kein Cache-Schreiben und kein Teilergebnis: ein halbes Verzeichnis sieht
      // vollstaendig aus und VERSCHWEIGT Personen — das ist schlimmer als ein
      // erkennbarer Ausfall mit lokalem Rueckfall.
      return { status: "error", people: LEER };
    }
  }

  async function list(): Promise<DirectoryResult> {
    if (!konfiguriert) return { status: "unconfigured", people: LEER };
    if (cache && cache.bis > now()) return { status: "ok", people: cache.people };
    if (laufend) return laufend;
    laufend = abzug().finally(() => {
      laufend = null;
    });
    return laufend;
  }

  return {
    list,
    invalidate() {
      cache = null;
    },
    async search(query, limit = TREFFER_STANDARD) {
      const q = query.trim().toLowerCase();
      // Ein leerer Begriff darf NICHT das ganze Verzeichnis liefern: der
      // Rueckgabewert geht durch eine Server-Action an den Browser.
      if (q === "") return { status: konfiguriert ? "ok" : "unconfigured", people: LEER };
      const alle = await list();
      if (alle.status !== "ok") return alle;
      const treffer = alle.people
        .filter((p) => suchfeld(p).includes(q))
        .sort((a, b) => trefferReihenfolge(a, b, q))
        .slice(0, Math.max(0, limit));
      return { status: "ok", people: treffer };
    },
    async findByEmail(email) {
      const gesucht = email.trim().toLowerCase();
      if (gesucht === "") return { status: "ok", people: LEER };
      const alle = await list();
      if (alle.status !== "ok") return alle;
      // EXAKT, nicht `includes`: `search` von Pocket ID ist ein LIKE %…%, und ein
      // Praefix-Treffer wuerde hier die falsche Person zuordnen.
      const treffer = alle.people.filter((p) => (p.email ?? "").toLowerCase() === gesucht);
      return { status: "ok", people: treffer.slice(0, 1) };
    },
  };
}

/**
 * Das Verzeichnis des laufenden Prozesses. Der Cache lebt im Modul-Singleton —
 * die Zuordnungsseite wird oft geladen, die Nutzerliste aendert sich selten.
 *
 * `POCKET_ID_API_URL` ist optional und faellt auf `POCKET_ID_ISSUER` zurueck:
 * Pocket ID benutzt seine AppURL zugleich als OIDC-`issuer`
 * (`jwt_service.go` → `Issuer(s.envConfig.AppURL)`), beide Werte sind also
 * normalerweise identisch. Die eigene Variable existiert trotzdem, weil das
 * nicht garantiert ist: laeuft die Verwaltungs-API hinter einem anderen Host
 * (internes Netz, abweichender Port), waere der Issuer die falsche Basis.
 *
 * Die Env wird bei jedem Zugriff gelesen und das Singleton bei Aenderung neu
 * gebaut — sonst haengt in Tests und im `next dev` der erste gelesene Wert bis
 * zum Neustart fest.
 */
let singleton: { schluessel: string; directory: Directory } | null = null;

export function getDirectory(env: Record<string, string | undefined> = process.env): Directory {
  const baseUrl = normalisiereBasis(env.POCKET_ID_API_URL ?? env.POCKET_ID_ISSUER);
  const apiKey = (env.POCKET_ID_API_KEY ?? "").trim();
  const schluessel = `${baseUrl} ${apiKey}`;
  if (!singleton || singleton.schluessel !== schluessel) {
    singleton = { schluessel, directory: createDirectory({ baseUrl, apiKey }) };
  }
  return singleton.directory;
}

/** Ist ein Verzeichnis ueberhaupt hinterlegt? Reine Env-Frage, kein Netzzugriff. */
export function isDirectoryConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return (
    normalisiereBasis(env.POCKET_ID_API_URL ?? env.POCKET_ID_ISSUER) !== "" &&
    (env.POCKET_ID_API_KEY ?? "").trim() !== ""
  );
}
