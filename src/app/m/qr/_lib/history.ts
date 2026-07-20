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
const VALID_ENCRYPTIONS = ["WPA", "WEP", "nopass"];

/**
 * Die `kind` allein zu pruefen genuegt nicht: ein Eintrag wie
 * `{kind:"wifi"}` ohne `value` ueberlebte die Filterung, liesse sich anzeigen
 * und risse erst beim Antippen in `payloadToQrString` ab — ein Knopf, der bei
 * jedem Tippen still nichts tut, und zwar dauerhaft, weil der Eintrag liegen
 * bleibt.
 *
 * Bewusst nicht ueber `validatePresetInput` geloest: der normalisiert
 * zusaetzlich (offenes WLAN bekommt ein leeres Passwort) und liefert Fehlertexte
 * fuer den Anlegepfad. Hier zaehlt nur, ob das Payload so geformt ist, wie die
 * Erzeuger es schreiben — die Pruefung darf deshalb nicht strenger sein als
 * das, was `recordEntry` tatsaechlich ablegt (leeres WLAN-Passwort, fehlende
 * vCard-Felder).
 */
function isValidPayload(p: Record<string, unknown>): boolean {
  const v = p.value;
  switch (p.kind) {
    case "url":
    case "tel":
    case "text":
      return typeof v === "string";
    case "wifi": {
      if (typeof v !== "object" || v === null) return false;
      const w = v as Record<string, unknown>;
      return (
        typeof w.ssid === "string" &&
        typeof w.password === "string" &&
        VALID_ENCRYPTIONS.includes(w.encryption as string) &&
        (w.hidden === undefined || typeof w.hidden === "boolean")
      );
    }
    case "vcard": {
      if (typeof v !== "object" || v === null) return false;
      return typeof (v as Record<string, unknown>).name === "string";
    }
    default:
      return false;
  }
}

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
  if (typeof p.kind !== "string" || !VALID_KINDS.includes(p.kind as QrPayload["kind"])) {
    return false;
  }
  return isValidPayload(p);
}

/* ---------------------------------------------------------------------------
 * Eigentuemer des Verlaufs
 *
 * Das Modul ist `requiresAuth: false`, der Verlauf liegt aber im localStorage
 * und ueberlebt jeden Logout. Auf einem geteilten Einsatz-Tablet sah damit die
 * naechste, anonyme Person die Schnellzugriffe der vorigen — und tippte sie
 * einen WLAN-Eintrag an, stand dessen Passwort im Klartext in der Adresszeile.
 * Genau die Zusage "Presets anonym lesbar? Nein", die der Service Worker mit
 * `credentials: "omit"` bereits schuetzt; ueber den localStorage stand die
 * Hintertuer offen.
 *
 * Der Vorgabewert `null` ist dabei die eigentliche Absicherung: er gilt schon
 * beim allerersten Rendern, bevor irgendein Effekt gelaufen ist. Eintraege mit
 * User-ID fallen fuer einen anonymen Betrachter dadurch von vornherein durch den
 * Filter und blitzen nicht kurz auf.
 * ------------------------------------------------------------------------ */

let currentOwner: string | null = null;

/** Wird aus dem Modul-Layout mit der laufenden Sitzung gesetzt (`HistoryOwner`). */
export function setHistoryOwner(id: string | null): void {
  if (id === currentOwner) return;
  currentOwner = id;
  invalidate();
}

/**
 * Der rohe Bestand, ohne Eigentuemer-Filter.
 *
 * Die Schreibpfade muessen fremde Eintraege sehen: liefe `addEntry` ueber das
 * gefilterte `loadHistory`, loeschte der erste erzeugte Code eines Angemeldeten
 * saemtliche anonymen Eintraege dauerhaft aus dem Speicher. Verborgen heisst
 * hier verborgen, nicht geloescht.
 */
function readEntries(): HistoryEntry[] {
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

/**
 * Strikter Vergleich, bewusst ohne `?? null`: Eintraege aus easy-qr tragen gar
 * kein `owner` und bleiben damit fuer jeden verborgen. Das kostet beim Cutover
 * bis zu 20 Bequemlichkeitseintraege — sie auf "anonym" zu normalisieren risse
 * die Luecke fuer genau die alten WLAN-Eintraege wieder auf, um die es geht.
 */
export function loadHistory(): HistoryEntry[] {
  return readEntries().filter((e) => e.owner === currentOwner);
}

export function addEntry(entry: HistoryEntry): void {
  // Der Eigentuemer wird hier gestempelt und nicht in `recordEntry`: `addEntry`
  // ist der einzige Schreibpfad, damit kann ihn kein Erzeuger vergessen.
  const list = readEntries();
  const next = [{ ...entry, owner: currentOwner }, ...list].slice(0, HISTORY_LIMIT);
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
