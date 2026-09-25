/**
 * Das Schlüsselpaar der Suite (Spec §12; Plan Stufe 2, Entscheidung 4). Genau ein
 * echtes Paar (`art = "echt"`, `rechnerId = null`), daneben beliebig viele Test-Paare je
 * Test-Rechner. Der private Schlüssel liegt nie im Klartext in der Datenbank: gespeichert wird
 * `<iv base64>:<ct base64>`, AES-256-GCM mit dem KEK, AAD = `einsatzbuch/v1/privat/<schluesselId>`
 * — eine Zeile lässt sich damit nicht auf eine andere `schluesselId` umhängen.
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { ausBase64, mitLaenge, utf8, zuBase64, zufall, type Bytes } from "../kern/bytes";
import { erzeugeSchluesselpaar, importiereOeffentlich, schluesselIdVon } from "../kern/umschlag";
import { schluesselpaar } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";

export class PrivatUnlesbar extends Error {
  constructor() {
    super("Privater Schlüssel lässt sich mit diesem KEK nicht lesen");
  }
}

const aad = (schluesselId: string) => utf8(`einsatzbuch/v1/privat/${schluesselId}`);
const kekSchluessel = (kek: Bytes) => crypto.subtle.importKey("raw", mitLaenge(kek, 32, "KEK"), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function verschluesselePrivat(pkcs8: Bytes, schluesselId: string, kek: Bytes): Promise<string> {
  const iv = zufall(12);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad(schluesselId) }, await kekSchluessel(kek), pkcs8),
  );
  return `${zuBase64(iv)}:${zuBase64(ct)}`;
}

/** Wirft `PrivatUnlesbar`, wenn KEK, `schluesselId` oder das gespeicherte Format nicht passen. */
export async function entschluesselePrivat(gespeichert: string, schluesselId: string, kek: Bytes): Promise<Bytes> {
  try {
    const [iv, ct] = gespeichert.split(":");
    return new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: mitLaenge(ausBase64(iv), 12, "iv"), additionalData: aad(schluesselId) },
        await kekSchluessel(kek),
        ausBase64(ct),
      ),
    );
  } catch {
    throw new PrivatUnlesbar();
  }
}

export interface NeuesPaar {
  id: string;
  schluesselId: string;
  oeffentlich: string;
  pkcs8: Bytes;
}

async function schluesselmaterial(paar?: { pkcs8: Bytes; oeffentlich: string }): Promise<{ pkcs8: Bytes; oeffentlich: string }> {
  if (paar) return paar;
  const p = await erzeugeSchluesselpaar();
  return {
    pkcs8: new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey)),
    oeffentlich: zuBase64(new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey))),
  };
}

/**
 * Baut eine vollständige `schluesselpaar`-Zeile, fügt sie aber NICHT ein. Ohne `paar` erzeugt sie
 * ein frisches Schlüsselpaar. Für Aufrufer, die das (asynchrone) Schlüsselmaterial vor einer
 * synchronen better-sqlite3-Transaktion brauchen (`richteEin` in `anbindung/rechner.ts`).
 */
export async function bereitePaarVor(
  o: { art: "echt" | "test"; rechnerId: string | null; kek: Bytes; jetzt: Date; paar?: { pkcs8: Bytes; oeffentlich: string } },
): Promise<typeof schluesselpaar.$inferSelect> {
  const { pkcs8, oeffentlich } = await schluesselmaterial(o.paar);
  const schluesselId = await schluesselIdVon(await importiereOeffentlich(oeffentlich));
  return {
    id: nanoid(),
    art: o.art,
    rechnerId: o.rechnerId,
    schluesselId,
    oeffentlich,
    privatVerschluesselt: await verschluesselePrivat(pkcs8, schluesselId, o.kek),
    erzeugtAm: o.jetzt,
  };
}

/** Legt eine neue `schluesselpaar`-Zeile an. Ohne `paar` erzeugt sie ein frisches Schlüsselpaar. */
export async function legePaarAn(
  db: Db,
  o: { art: "echt" | "test"; rechnerId: string | null; kek: Bytes; jetzt: Date; paar?: { pkcs8: Bytes; oeffentlich: string } },
): Promise<NeuesPaar> {
  const material = await schluesselmaterial(o.paar);
  const zeile = await bereitePaarVor({ ...o, paar: material });
  db.insert(schluesselpaar).values(zeile).run();
  return { id: zeile.id, schluesselId: zeile.schluesselId, oeffentlich: zeile.oeffentlich, pkcs8: material.pkcs8 };
}

export const paarZuId = (db: Db, schluesselId: string) =>
  db.select().from(schluesselpaar).where(eq(schluesselpaar.schluesselId, schluesselId)).get();

export const echtesPaar = (db: Db) => db.select().from(schluesselpaar).where(eq(schluesselpaar.art, "echt")).get();
