/**
 * Die Einträge des Kalenders der Leitung: Events der Gemeinschaft und die Belegung der Bar (Zusagen, offene
 * Anfragen, Sperrzeiten). Ein Event mit „Bar belegen“ steht nur als Event da — in der Vermietung ist es eine
 * abgeleitete Sperrzeit, hier wäre es doppelt.
 */
import { and, eq, gt, inArray, lt } from "drizzle-orm";
import type { GemeinschaftSchreiber } from "../_db/client";
import { anfrage, sperrzeit, vorhaben } from "../_db/schema";
import type { KalenderEintrag } from "./kalenderTage";
import { vorhabenPfad } from "./vorhabenTypen";

export function kalenderEintraege(db: GemeinschaftSchreiber, von: number, bis: number): KalenderEintrag[] {
  const events: KalenderEintrag[] = db.select({ id: vorhaben.id, von: vorhaben.von, bis: vorhaben.bis, titel: vorhaben.titel }).from(vorhaben)
    .where(and(eq(vorhaben.art, "event"), lt(vorhaben.von, bis), gt(vorhaben.bis, von))).all()
    .map((e) => ({ id: e.id, art: "event", von: e.von!, bis: e.bis!, titel: e.titel, href: vorhabenPfad("event", e.id) }));
  const anfragen: KalenderEintrag[] = db.select({ id: anfrage.id, von: anfrage.von, bis: anfrage.bis, anlass: anfrage.anlass, status: anfrage.status }).from(anfrage)
    .where(and(eq(anfrage.raum, "bar"), inArray(anfrage.status, ["angefragt", "zugesagt"]), lt(anfrage.von, bis), gt(anfrage.bis, von))).all()
    .map((a) => ({
      id: a.id, art: a.status === "zugesagt" ? "zugesagt" : "angefragt", von: a.von, bis: a.bis, titel: `Bar: ${a.anlass}`,
      href: `/vermietung/anfragen?id=${encodeURIComponent(a.id)}`,
    }));
  const sperren: KalenderEintrag[] = db.select({ id: sperrzeit.id, von: sperrzeit.von, bis: sperrzeit.bis, grund: sperrzeit.grund }).from(sperrzeit)
    .where(and(eq(sperrzeit.raum, "bar"), lt(sperrzeit.von, bis), gt(sperrzeit.bis, von))).all()
    .map((s) => ({ id: s.id, art: "gesperrt", von: s.von, bis: s.bis, titel: s.grund, href: "/vermietung/sperrzeiten" }));
  return [...events, ...anfragen, ...sperren].sort((a, b) => a.von - b.von);
}
