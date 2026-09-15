import { getDb, type DB } from "../../../_db/client";
import { handlagerSchraenke } from "../../../_lib/lesepfade/orte";
import { sql } from "drizzle-orm";
import { buchungen } from "../../../_db/schema";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import { LagerorteListe, type LagerortZeile } from "./LagerorteListe";

export const dynamic = "force-dynamic";

export function lagerorteSeitenInhalt(db: DB) {
  const schraenke = handlagerSchraenke(db);
  /*
   * Ein Posten = eine Charge mit Rest > 0 an diesem Ort. Die Zahl beantwortet
   * die einzige Frage, die beim Stilllegen zaehlt: „liegt da noch etwas?"
   *
   * ⚠️ EINE ABFRAGE, NICHT EINE JE CHARGE. `better-sqlite3` ist SYNCHRON — eine
   * Schleife mit einer Abfrage je Charge blockierte bei ein paar tausend Chargen
   * die GANZE Suite, nicht nur dieses Modul. Dieselbe Form wie
   * `bestandJeArtikelUndLagerort`.
   */
  const posten = new Map<string, number>();
  const salden = db
    .select({
      lagerortId: buchungen.lagerortId,
      chargeId: buchungen.chargeId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .groupBy(buchungen.lagerortId, buchungen.chargeId)
    .all();
  for (const zeile of salden) {
    if (zeile.summe <= 0) continue;
    posten.set(zeile.lagerortId, (posten.get(zeile.lagerortId) ?? 0) + 1);
  }

  const zeilen: LagerortZeile[] = schraenke.map((o) => ({
    id: o.id, name: o.name, zugangshinweis: o.zugangshinweis,
    sortierung: o.sortierung, aktiv: o.aktiv, bestandsposten: posten.get(o.id) ?? 0,
  }));

  return (
    <>
      <SeitenKopf
        titel="Lagerorte"
        beschreibung="Die Schränke im Handlager, ihre Reihenfolge und ihre Zugangshinweise."
      />
      <LagerorteListe zeilen={zeilen} />
    </>
  );
}

export default function LagerorteSeite() {
  return lagerorteSeitenInhalt(getDb());
}
