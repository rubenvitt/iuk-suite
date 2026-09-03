/**
 * DIE MERKLISTE AUF DEM GERAET (Spec §7.5, Betreiberentscheidung 2026-09-02).
 *
 * ⛔ NICHT UEBER DEN HTTP-CACHE. Dort laege personenbezogenes HTML, und der
 * Inhaltsriegel des Service Workers lehnte es zu Recht ab. Geschrieben wird
 * ausschliesslich ONLINE (von `MerklisteSpiegel`, gespeist aus der Datenbank),
 * gelesen offline.
 *
 * ⛔ WAS DAS AUFGIBT, ausgeschrieben: offline gibt es keine Authentifizierung —
 * das Sitzungscookie ist HttpOnly und fuer Seite wie Worker unsichtbar, und
 * IndexedDB ueberlebt den Logout genauso wie der Cache. Auf einem geteilten
 * Geraet sieht die Titel auch, wer sich nach dir anmeldet. Deshalb steht auf
 * /offline ein Hinweis samt Loeschknopf (`_ui/MerklisteGeraet.tsx`), und
 * deshalb faengt der Worker `POST /api/auth/signout`.
 *
 * KEIN "use client": die Datei exportiert einen TYP, den auch eine Server
 * Component (`_ui/MerklisteSpiegel.tsx`) liest — ein Wert aus einem
 * Client-Modul kaeme dort nicht an (Falle 6). Die Funktionen fassen
 * `indexedDB` erst beim AUFRUF an, nicht auf Modulebene; ein Import in einer
 * Server Component ist damit folgenlos.
 */

/** Der Name der Geraetedatenbank. MUSS zu `MERK_DB` in `_lib/sw-quelle.ts`
 *  passen — `merkgeraet.test.ts` haelt beide Stellen zusammen. */
export const MERKLISTE_DB = "zeichen-merkliste";
const SPEICHER = "merkliste";
const SCHLUESSEL = "aktuell";

export interface MerkEintrag {
  readonly id: string;
  readonly titel: string;
}

function fabrik(): IDBFactory | null {
  const g = globalThis as unknown as { indexedDB?: IDBFactory };
  return g.indexedDB ?? null;
}

/** Oeffnet die Datenbank und liefert `null` statt zu werfen. Ein Browser im
 *  privaten Modus kann IndexedDB verweigern; die Merkliste ist Zugabe und darf
 *  die Katalogflaeche nicht mitreissen. */
function oeffne(): Promise<IDBDatabase | null> {
  const f = fabrik();
  if (!f) return Promise.resolve(null);
  return new Promise((fertig) => {
    let anfrage: IDBOpenDBRequest;
    try {
      anfrage = f.open(MERKLISTE_DB, 1);
    } catch {
      fertig(null);
      return;
    }
    anfrage.onupgradeneeded = () => {
      const db = anfrage.result;
      if (!db.objectStoreNames.contains(SPEICHER)) db.createObjectStore(SPEICHER);
    };
    anfrage.onsuccess = () => fertig(anfrage.result);
    anfrage.onerror = () => fertig(null);
    // Ein zweiter offener Tab haelt die Datenbank. Ohne diesen Zweig bliebe das
    // Promise ewig offen und der aufrufende Effekt haengen.
    anfrage.onblocked = () => fertig(null);
  });
}

/** EIN Datensatz mit der ganzen Liste, nicht eine Zeile je Zeichen: die Liste
 *  wird immer als Ganzes ersetzt, und ein Datensatz macht „ersetzen" atomar. */
export async function schreibeMerkliste(eintraege: readonly MerkEintrag[]): Promise<void> {
  const db = await oeffne();
  if (!db) return;
  await new Promise<void>((fertig) => {
    try {
      const anfrage = db
        .transaction(SPEICHER, "readwrite")
        .objectStore(SPEICHER)
        .put(
          eintraege.map((e) => ({ id: e.id, titel: e.titel })),
          SCHLUESSEL,
        );
      anfrage.onsuccess = () => fertig();
      anfrage.onerror = () => fertig();
    } catch {
      fertig();
    }
  });
  db.close();
}

export async function liesMerkliste(): Promise<readonly MerkEintrag[]> {
  const db = await oeffne();
  if (!db) return [];
  const eintraege = await new Promise<readonly MerkEintrag[]>((fertig) => {
    try {
      const anfrage = db.transaction(SPEICHER, "readonly").objectStore(SPEICHER).get(SCHLUESSEL);
      anfrage.onsuccess = () =>
        fertig(Array.isArray(anfrage.result) ? (anfrage.result as MerkEintrag[]) : []);
      anfrage.onerror = () => fertig([]);
    } catch {
      fertig([]);
    }
  });
  db.close();
  return eintraege;
}

/**
 * Der Loeschknopf: Geraetedatenbank UND HTTP-Cache, sofort und ohne
 * Rueckfrage-Dialog (Spec §7.5). Der Cache muss mit — sonst blieben die
 * gecachten Seiten liegen und der Knopf loeschte nur die Haelfte dessen, was er
 * verspricht.
 */
export async function loescheGeraetedaten(): Promise<void> {
  const f = fabrik();
  if (f) {
    await new Promise<void>((fertig) => {
      let anfrage: IDBOpenDBRequest;
      try {
        anfrage = f.deleteDatabase(MERKLISTE_DB);
      } catch {
        fertig();
        return;
      }
      anfrage.onsuccess = () => fertig();
      anfrage.onerror = () => fertig();
      anfrage.onblocked = () => fertig();
    });
  }
  if (typeof caches !== "undefined") {
    const namen = await caches.keys();
    await Promise.all(namen.map((n) => caches.delete(n)));
  }
}
