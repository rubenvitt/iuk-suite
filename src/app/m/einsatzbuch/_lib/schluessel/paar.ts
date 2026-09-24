/**
 * Das Schlüsselpaar der Suite (Spec §12, Entscheidung 4 im gemeinsamen Kontext). Genau ein
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

/** Legt eine neue `schluesselpaar`-Zeile an. Ohne `paar` erzeugt sie ein frisches Schlüsselpaar. */
export async function legePaarAn(
  db: Db,
  o: { art: "echt" | "test"; rechnerId: string | null; kek: Bytes; jetzt: Date; paar?: { pkcs8: Bytes; oeffentlich: string } },
): Promise<NeuesPaar> {
  let pkcs8: Bytes;
  let oeffentlich: string;
  if (o.paar) {
    ({ pkcs8, oeffentlich } = o.paar);
  } else {
    const p = await erzeugeSchluesselpaar();
    pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", p.privateKey));
    oeffentlich = zuBase64(new Uint8Array(await crypto.subtle.exportKey("spki", p.publicKey)));
  }
  const schluesselId = await schluesselIdVon(await importiereOeffentlich(oeffentlich));
  const id = nanoid();
  db.insert(schluesselpaar)
    .values({
      id,
      art: o.art,
      rechnerId: o.rechnerId,
      schluesselId,
      oeffentlich,
      privatVerschluesselt: await verschluesselePrivat(pkcs8, schluesselId, o.kek),
      erzeugtAm: o.jetzt,
    })
    .run();
  return { id, schluesselId, oeffentlich, pkcs8 };
}

export const paarZuId = (db: Db, schluesselId: string) =>
  db.select().from(schluesselpaar).where(eq(schluesselpaar.schluesselId, schluesselId)).get();

export const echtesPaar = (db: Db) => db.select().from(schluesselpaar).where(eq(schluesselpaar.art, "echt")).get();
