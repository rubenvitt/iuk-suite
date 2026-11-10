import { eq, asc } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { services, type Service, type NewService } from "@/app/m/portal/_db/schema";
import { filterVisibleServices } from "@/app/m/portal/_lib/rbac";

export async function getAllServices(): Promise<Service[]> {
  const db = getDb();
  return db
    .select()
    .from(services)
    .orderBy(asc(services.sortOrder), asc(services.name));
}

export async function getVisibleServicesForUser(
  userGroups: string[]
): Promise<Service[]> {
  const db = getDb();
  const allActive = await db
    .select()
    .from(services)
    .where(eq(services.isActive, true))
    .orderBy(asc(services.sortOrder), asc(services.name));

  return filterVisibleServices(userGroups, allActive);
}

export async function getServiceById(
  id: string
): Promise<Service | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(services)
    .where(eq(services.id, id))
    .limit(1);
  return result[0];
}

export async function getServiceBySlug(
  slug: string
): Promise<Service | undefined> {
  const db = getDb();
  const result = await db
    .select()
    .from(services)
    .where(eq(services.slug, slug))
    .limit(1);
  return result[0];
}

export async function createService(data: NewService): Promise<Service> {
  const db = getDb();
  const result = await db.insert(services).values(data).returning();
  return result[0];
}

export async function updateService(
  id: string,
  data: Partial<NewService>
): Promise<Service | undefined> {
  const db = getDb();
  const result = await db
    .update(services)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(services.id, id))
    .returning();
  return result[0];
}

export async function deleteService(id: string): Promise<void> {
  const db = getDb();
  await db.delete(services).where(eq(services.id, id));
}

/**
 * DIE KENNUNG (`slug`) KOMMT AUS DEM NAMEN (IDA-391), nicht mehr aus einem Formularfeld: niemand
 * außerhalb der Datenbank liest sie (Launcher und Kacheln schlüsseln über `id`), und ein Feld „Slug"
 * fragte nach etwas, das niemand wissen muss. Umlaute ausgeschrieben, Rest auf `a-z0-9` und Bindestriche.
 */
export function kennungAusName(name: string): string {
  const kennung = name
    .trim()
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return kennung || "dienst";
}

/** Bei Kollision ein Zähler: `wiki`, `wiki-2`, `wiki-3` … */
export function freieKennung(basis: string, vergeben: ReadonlySet<string>): string {
  if (!vergeben.has(basis)) return basis;
  for (let n = 2; ; n++) {
    const kandidat = `${basis}-${n}`;
    if (!vergeben.has(kandidat)) return kandidat;
  }
}

/** Legt einen Dienst an und vergibt die Kennung selbst. Beim Bearbeiten bleibt sie, wie sie ist. */
export async function legeDienstAn(data: Omit<NewService, "slug">): Promise<Service> {
  const db = getDb();
  const vergeben = new Set((await db.select({ slug: services.slug }).from(services)).map((z) => z.slug));
  return createService({ ...data, slug: freieKennung(kennungAusName(data.name), vergeben) });
}

/** Was das Formular „Dienst anlegen"/„Dienst bearbeiten" pflegt — alles, was die Kachel zeigt. */
export type DienstFelder = {
  name: string;
  url: string;
  description: string;
  category: string | null;
  iconUrl: string | null;
  openInNewTab: boolean;
};

/** Eine Eingabe, die abgelehnt wird, bevor etwas geschrieben ist. Die Meldung steht so im Formular. */
export class DienstEingabeFehler extends Error {}

/**
 * Nur `http:`/`https:`: die Adresse landet als `href` in Kachel und Launcher, und ein `javascript:`
 * dort liefe im Browser jeder Person, die die Kachel anklickt.
 */
function webAdresse(roh: string, feld: string): string {
  let protokoll = "";
  try {
    protokoll = new URL(roh).protocol;
  } catch {
    // keine gültige Adresse
  }
  if (protokoll === "http:" || protokoll === "https:") return roh;
  throw new DienstEingabeFehler(`${feld} muss mit http:// oder https:// beginnen.`);
}

function text(formData: FormData, feld: string): string {
  const wert = formData.get(feld);
  return typeof wert === "string" ? wert.trim() : "";
}

export function dienstFelderAusFormular(formData: FormData): DienstFelder {
  const name = text(formData, "name");
  if (!name) throw new DienstEingabeFehler("Der Name fehlt.");
  const url = text(formData, "url");
  if (!url) throw new DienstEingabeFehler("Die Adresse fehlt.");
  const iconUrl = text(formData, "iconUrl");
  return {
    name,
    url: webAdresse(url, "Die Adresse"),
    description: text(formData, "description"),
    category: text(formData, "category") || null,
    iconUrl: iconUrl ? webAdresse(iconUrl, "Die Bildadresse") : null,
    openInNewTab: formData.get("openInNewTab") === "on",
  };
}
