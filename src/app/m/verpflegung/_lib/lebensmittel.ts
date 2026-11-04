/**
 * DIE ANBINDUNG AN EINE LEBENSMITTELDATENBANK (Akzeptanzkriterium von IDA-316): eine unbekannte Packung wird über
 * ihre EAN in Open Food Facts nachgeschlagen, damit Name, Kategorie und Einheit beim Anlegen schon dastehen. Freie
 * Datenbank, kein Schlüssel; hinaus geht nur die EAN.
 *
 * Ein Fehlschlag (kein Netz, Zeitüberschreitung, unbekannt) ist kein Fehler: dann tippt man den Namen. Deshalb wirft
 * `schlageNach` nie und wartet höchstens `WARTEN_MS`. Treffer und Nichttreffer bleiben eine Stunde im Speicher.
 * `VERPFLEGUNG_LEBENSMITTEL_URL=aus` schaltet das Nachschlagen ab. Kein `"use client"` (Falle 6).
 */
import type { Fund } from "./typen";

type EnvLike = Record<string, string | undefined>;

export const STANDARD_URL = "https://world.openfoodfacts.org/api/v2/product/";
const WARTEN_MS = 4000;
const MERKEN_MS = 60 * 60_000;
const merker = new Map<string, { bis: number; fund: Fund | null }>();

export function lebensmittelUrl(env: EnvLike = process.env): string | null {
  const wert = env.VERPFLEGUNG_LEBENSMITTEL_URL?.trim();
  if (wert === "aus") return null;
  return wert || STANDARD_URL;
}

/** Open-Food-Facts-Kategorie (`en:…`) → Kategorie des Lagers. Unbekanntes bleibt offen. */
export function kategorieAus(tags: readonly string[]): string | null {
  const t = tags.join(" ");
  if (/en:(beverages|waters|juices|milks|coffees|teas)\b/.test(t)) return "Getränke";
  if (/en:(canned-foods|canned-|soups|stews|prepared-meals)/.test(t)) return "Konserven";
  if (/en:(yogurts|dairies|cheeses|sausages|meats|fresh-foods)\b/.test(t)) return "Kühlware";
  if (/en:(breads|crispbreads|rusks|biscuits-and-cakes|pastries)\b/.test(t)) return "Backwaren";
  if (/en:(snacks|chocolates|cereal-bars|sweets|chips)\b/.test(t)) return "Snacks";
  if (/en:(pastas|rices|cereals|flours|sugars|spreads|condiments|plant-based-foods)\b/.test(t)) return "Trockenware";
  return null;
}

/** „1,5 l“, „500 g“ → Einheit des Lagers; Gewichte werden als Packung gezählt, Flüssigkeiten als Flasche. */
export function einheitAus(menge: string | undefined, tags: readonly string[]): string | null {
  if (!menge) return null;
  if (/\b(l|ml|cl)\b/i.test(menge)) return tags.some((x) => /en:(milks|juices)/.test(x)) ? "Packung" : "Flasche";
  if (/\b(g|kg)\b/i.test(menge)) return tags.some((x) => /en:canned/.test(x)) ? "Dose" : "Packung";
  return null;
}

/** Name wie auf der Packung: deutscher Name, sonst allgemeiner, dazu die Menge („Apfelsaft naturtrüb 1 l“). */
export function nameAus(p: Record<string, unknown>): string | null {
  const roh = [p.product_name_de, p.product_name, p.generic_name_de].find((x): x is string => typeof x === "string" && x.trim() !== "");
  if (!roh) return null;
  const menge = typeof p.quantity === "string" ? p.quantity.trim() : "";
  const name = menge && !roh.includes(menge) ? `${roh.trim()} ${menge}` : roh.trim();
  return name.slice(0, 120);
}

export function fundAus(json: unknown): Fund | null {
  const j = json as { status?: unknown; product?: Record<string, unknown> } | null;
  if (!j || j.status !== 1 || !j.product) return null;
  const name = nameAus(j.product);
  if (!name) return null;
  const tags = Array.isArray(j.product.categories_tags) ? j.product.categories_tags.filter((x): x is string => typeof x === "string") : [];
  return { name, kategorie: kategorieAus(tags), einheit: einheitAus(typeof j.product.quantity === "string" ? j.product.quantity : undefined, tags) };
}

export async function schlageNach(ean: string, abruf: typeof fetch = fetch, jetzt = Date.now()): Promise<Fund | null> {
  if (!/^\d{8,14}$/.test(ean)) return null;
  const basis = lebensmittelUrl();
  if (!basis) return null;
  const gemerkt = merker.get(ean);
  if (gemerkt && gemerkt.bis > jetzt) return gemerkt.fund;
  let fund: Fund | null = null;
  try {
    const r = await abruf(`${basis}${ean}.json?fields=product_name,product_name_de,generic_name_de,quantity,categories_tags`, {
      headers: { "User-Agent": "IUK-Suite Verpflegungslager", Accept: "application/json" },
      signal: AbortSignal.timeout(WARTEN_MS),
      cache: "no-store",
    });
    if (r.ok) fund = fundAus(await r.json());
    else if (r.status !== 404) return null;
  } catch {
    return null;
  }
  merker.set(ean, { bis: jetzt + MERKEN_MS, fund });
  return fund;
}

/** Nur für Tests. */
export function _merkerLeeren(): void {
  merker.clear();
}
