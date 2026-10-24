/**
 * Ein Abgleich von Anfang bis Ende — gemeinsam für die Server Actions (Demo, HiOrg) und den Route
 * Handler der Excel-Datei (`datei/abgleich/route.ts`). Der Riegel und der Audit-Kontext bleiben beim
 * Aufrufer: das Abdeckungsmanifest von `core/audit` verlangt `withAuditContext` im Einstiegspunkt.
 */
import { getDb } from "../_db/client";
import { helfer } from "../_db/schema";
import { planeAbgleich, wendeAbgleichAn, type Abgleichergebnis, type Abgleichplan } from "./abgleich";
import { zodFehler, type ActionErgebnis } from "./actionErgebnis";
import { leseEinstellungen, schreibeEinstellung } from "./einstellungen";
import { filterSchema } from "./filter";
import { heuteInZone, liesQuelle } from "./quelle";
import { anzeigeName, type Viewer } from "./zugang";

/** Liest die Quelle und plant gegen den Bestand. Schreibt nichts. */
export async function planeLauf(filterEingabe: unknown, datei?: Uint8Array): Promise<ActionErgebnis<Abgleichplan>> {
  const f = filterSchema.safeParse(filterEingabe);
  if (!f.success) return { ok: false, fehler: "Bitte den Filter prüfen.", feldFehler: zodFehler(f.error) ?? undefined };
  const db = getDb();
  const e = leseEinstellungen(db);
  // Eine Datei für eine andere Quelle hieße: die Seite ist veraltet. Nie stillschweigend die andere lesen.
  if (datei && e.quelle !== "datei") return { ok: false, fehler: "Die Quelle ist nicht mehr „Excel-Datei“. Bitte die Seite neu laden." };
  const gelesen = await liesQuelle(db, { ...e, filter: f.data }, fetch, datei);
  if (!gelesen.ok) return { ok: false, fehler: gelesen.fehler };
  return { ok: true, wert: planeAbgleich(gelesen, db.select().from(helfer).all(), f.data, heuteInZone(), e.quelle) };
}

/**
 * Speichert den Filter, liest die Quelle NEU (sie kann sich seit der Vorschau geändert haben; die
 * Excel-Datei schickt die Insel noch einmal mit) und gleicht ab. Der Filter wird nur gespeichert,
 * wenn der Abgleich gelingt.
 */
export async function uebernehmeLauf(viewer: Viewer, filterEingabe: unknown, datei?: Uint8Array): Promise<ActionErgebnis<Abgleichergebnis>> {
  const plan = await planeLauf(filterEingabe, datei);
  if (!plan.ok) return plan;
  const db = getDb();
  const e = leseEinstellungen(db);
  schreibeEinstellung(db, "filter", filterSchema.parse(filterEingabe));
  const ergebnis = wendeAbgleichAn(db, plan.wert, { neueFreigeben: e.neueFreigeben, von: { name: anzeigeName(viewer), sub: viewer.id } });
  return { ok: true, wert: ergebnis };
}
