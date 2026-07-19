import type { HistoryEntry, QrPayload } from "./types";

// 1:1 aus easy-qr uebernommen. Der Schluessel darf sich nicht aendern, sonst
// ist beim Cutover der Verlauf jedes Nutzers weg.
export const HISTORY_KEY = "qr-generator:history:v1";
export const HISTORY_LIMIT = 20;

// Im privaten Modus mancher Browser wirft schon der Zugriff auf localStorage.
// Statt den Generator daran scheitern zu lassen, laeuft der Verlauf dann fuer
// die Dauer der Sitzung im Speicher weiter.
let memoryFallback: HistoryEntry[] = [];
let useFallback = false;

function safeGet(): string | null {
  if (useFallback) return null;
  try {
    return localStorage.getItem(HISTORY_KEY);
  } catch {
    useFallback = true;
    return null;
  }
}

function safeSet(value: string): void {
  if (useFallback) return;
  try {
    localStorage.setItem(HISTORY_KEY, value);
  } catch {
    useFallback = true;
  }
}

const VALID_KINDS: ReadonlyArray<QrPayload["kind"]> = ["url", "wifi", "tel", "vcard", "text"];

// Der Verlauf kommt aus fremdem Speicher: aelteren Versionen, halb
// geschriebenen Eintraegen, manuell Editiertem. Ungeprueft weitergereicht
// liesse ein einziger kaputter Eintrag die ganze Startseite abstuerzen.
function isValidEntry(e: unknown): e is HistoryEntry {
  if (typeof e !== "object" || e === null) return false;
  const r = e as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.label !== "string" || typeof r.createdAt !== "number")
    return false;
  if (typeof r.payload !== "object" || r.payload === null) return false;
  const p = r.payload as Record<string, unknown>;
  return typeof p.kind === "string" && VALID_KINDS.includes(p.kind as QrPayload["kind"]);
}

export function loadHistory(): HistoryEntry[] {
  if (useFallback) return [...memoryFallback];
  const raw = safeGet();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidEntry);
  } catch {
    return [];
  }
}

export function addEntry(entry: HistoryEntry): void {
  const list = useFallback ? memoryFallback : loadHistory();
  const next = [entry, ...list].slice(0, HISTORY_LIMIT);
  if (useFallback) {
    memoryFallback = next;
    invalidate();
    return;
  }
  safeSet(JSON.stringify(next));
  // safeSet kann beim Schreiben in den Fallback kippen (volles Kontingent) —
  // dann muss der neue Stand dort landen, sonst geht der Eintrag verloren.
  if (useFallback) memoryFallback = next;
  invalidate();
}

/* ---------------------------------------------------------------------------
 * Anbindung an useSyncExternalStore
 *
 * Der Verlauf lebt im localStorage, also ausserhalb von React und nur im
 * Browser. Ihn per useEffect in einen useState zu spiegeln waere der naive Weg,
 * erzeugt aber einen zusaetzlichen Renderdurchlauf und faellt bei React 19 in
 * die Regel `set-state-in-effect`. useSyncExternalStore ist dafuer gemacht —
 * inklusive eines eigenen Server-Schnappschusses, der die Hydration heil laesst.
 * ------------------------------------------------------------------------ */

const EMPTY: HistoryEntry[] = [];

let snapshot: HistoryEntry[] = EMPTY;
let snapshotValid = false;
const listeners = new Set<() => void>();

function invalidate(): void {
  snapshotValid = false;
  for (const listener of listeners) listener();
}

/** Der Schnappschuss wird zwischengespeichert, weil useSyncExternalStore ihn
 *  bei jedem Rendern abfragt und Referenzgleichheit als "unveraendert" liest.
 *  Ein jedes Mal frisch geparstes Array ergaebe eine Endlosschleife. */
export function getHistorySnapshot(): HistoryEntry[] {
  if (!snapshotValid) {
    snapshot = loadHistory();
    snapshotValid = true;
  }
  return snapshot;
}

/** Auf dem Server gibt es keinen Verlauf — konstant dieselbe leere Liste. */
export function getHistoryServerSnapshot(): HistoryEntry[] {
  return EMPTY;
}

export function subscribeHistory(onChange: () => void): () => void {
  listeners.add(onChange);
  // Ein zweiter Tab schreibt in denselben Speicher; ohne dieses Ereignis zeigte
  // dieser Tab den Verlauf von vorhin weiter an.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== null && e.key !== HISTORY_KEY) return;
    snapshotValid = false;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/**
 * `crypto.randomUUID` existiert nur im Secure Context. Im Einsatz laeuft die
 * App auch ueber http auf einer LAN-IP — dort fehlt die Funktion, und ein
 * direkter Aufruf risse die Seite mit einem TypeError ab. Aus easy-qr
 * uebernommen; die ids sind reine Verlaufs-Schluessel, kein Sicherheitsmerkmal.
 */
export function randomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Kurzform fuer die Erzeuger: id und Zeitstempel gehoeren nicht in jede
 *  einzelne Seite, sonst weicht frueher oder spaeter eine davon ab. */
export function recordEntry(label: string, payload: QrPayload): void {
  addEntry({ id: randomId(), label, payload, createdAt: Date.now() });
}

export function clearHistory(): void {
  memoryFallback = [];
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Nichts zu tun: der Speicher ist gesperrt, der Fallback ist bereits leer.
  }
  invalidate();
}
