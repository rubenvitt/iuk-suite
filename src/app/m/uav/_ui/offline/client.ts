import type { Identity } from "../../_lib/sitzung";
import type { ProgressSnapshot, SyncRequest, SyncResponse, TaskDTO } from "../../_lib/typen";

/** Fehler einer API-Anfrage (mit HTTP-Status und Server-Fehlercode). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const BASIS = "/api";

interface ServerFehler {
  error?: { code?: string; message?: string };
}

/**
 * Zentraler fetch-Wrapper: Basis `/api` (Host-Rewrite → `/m/uav/api`),
 * `credentials: 'include'` (Cookie-Session), JSON-Serialisierung und
 * einheitliches Fehlerschema `{ error: { code, message } }` → wirft `ApiError`.
 */
async function anfrage<T>(
  pfad: string,
  optionen: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = {
    method: optionen.method ?? "GET",
    credentials: "include",
    headers: { Accept: "application/json" },
  };
  if (optionen.body !== undefined) {
    init.body = JSON.stringify(optionen.body);
    init.headers = { ...init.headers, "Content-Type": "application/json" };
  }

  let antwort: Response;
  try {
    antwort = await fetch(`${BASIS}${pfad}`, init);
  } catch (e) {
    // Netzfehler (offline o. Ä.) → einheitlich als ApiError mit Status 0.
    throw new ApiError(0, "network_error", e instanceof Error ? e.message : "Netzwerkfehler");
  }

  if (!antwort.ok) {
    let code = "http_error";
    let message = `HTTP ${antwort.status}`;
    try {
      const daten = (await antwort.json()) as ServerFehler;
      if (daten.error?.code) code = daten.error.code;
      if (daten.error?.message) message = daten.error.message;
    } catch {
      // kein JSON-Body — Standardmeldung beibehalten
    }
    throw new ApiError(antwort.status, code, message);
  }

  if (antwort.status === 204) return undefined as T;
  const ct = antwort.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return undefined as T;
  return (await antwort.json()) as T;
}

/**
 * Typisierter Client für die Teilnehmer-`/api`-Endpunkte. Die Verwaltung
 * (Admin) läuft über RSC/Server Actions, nicht über diesen Client — hier
 * gibt es bewusst keine Admin-Methoden.
 */
export const api = {
  // ── Auth / Identität ───────────────────────────────────────────────────────
  /** Aktuelle Identität (`anon` | `participant` | `admin`). */
  me(): Promise<Identity> {
    return anfrage<Identity>("/me");
  },

  /**
   * Teilnehmer-Login per Dauer-Code. Setzt serverseitig die Session (Cookie).
   * Wirft `ApiError` (401 `invalid_code`, 429 `rate_limited`) bei Fehlschlag.
   * Die neue Identität bitte anschließend über `me()` laden.
   */
  participantLogin(code: string): Promise<{ ok: true }> {
    return anfrage<{ ok: true }>("/anmeldung", { method: "POST", body: { code } });
  },

  /** Aktuelle Session beenden. */
  logout(): Promise<void> {
    return anfrage<void>("/abmeldung", { method: "POST" });
  },

  // ── Teilnehmer ─────────────────────────────────────────────────────────────
  /** Aktiver Aufgabenkatalog (sortiert). */
  getTasks(): Promise<TaskDTO[]> {
    return anfrage<TaskDTO[]>("/tasks");
  },

  /** Fortschritt-Snapshot des eingeloggten Teilnehmers. */
  getProgress(): Promise<ProgressSnapshot> {
    return anfrage<ProgressSnapshot>("/progress");
  },

  /** Batch-Sync (push + pull). Liefert den autoritativen Server-Snapshot. */
  sync(req: SyncRequest): Promise<SyncResponse> {
    return anfrage<SyncResponse>("/sync", { method: "POST", body: req });
  },
};

export type ApiClient = typeof api;
