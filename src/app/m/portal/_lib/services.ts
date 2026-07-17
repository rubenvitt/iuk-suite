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
): Promise<Service> {
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
