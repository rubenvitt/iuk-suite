import { bereitgestellteFahrzeuge, kurzname } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { helferFuerSchichtplanung } from "@/app/m/helfer/_lib/bereitstellung";
import type { SchichtplanDb } from "../_db/client";
import { planung } from "../_db/schema";
import { ladePlanung, speichereEinheit, speicherePlanung, speichereTempHelfer, teileZu } from "./daten";
import { einheitEingabe, planungEingabe, tempHelferEingabe } from "./eingabe";
import { alsFahrerlaubnis } from "./qualis";
import { ausWanduhr, wanduhr } from "./zeit";

/** Der nächste Samstag in der Suite-Zone (mindestens drei Tage hin), als Wanduhr-Tag. */
function naechsterSamstag(jetzt: number) {
  for (let t = jetzt + 3 * 86_400_000; ; t += 86_400_000) {
    const w = wanduhr(t);
    if (new Date(Date.UTC(w.jahr, w.monat - 1, w.tag)).getUTCDay() === 6) return w;
  }
}

/**
 * Lokale Demodaten — bewusst NICHT am Boot (`bootstrap.ts`, Eintrag schichtplan). Eine Planung „Stadtfest
 * (Demo)“ mit zwei Abschnitten, einem Fahrzeug aus der Fahrzeugverwaltung, einem temporären Helfer und
 * Einteilungen aus den Demo-Helfern — mit Lücken und einem Konflikt, damit „Prüfen“ etwas zeigt. Idempotent:
 * gibt es schon eine Planung, bleibt alles, wie es ist. Läuft nach `helfer` und `fahrzeuge`.
 */
export async function seedLokalSchichtplan(db: SchichtplanDb, jetzt = Date.now()): Promise<string[]> {
  if (db.select({ id: planung.id }).from(planung).limit(1).get()) return ["schichtplan: Planung vorhanden, nichts geändert"];
  const tag = naechsterSamstag(jetzt);
  const um = (stunde: number) => ausWanduhr({ ...tag, stunde, minute: 0 });
  const planId = speicherePlanung(db, null, planungEingabe.parse({
    name: "Stadtfest (Demo)", art: "veranstaltung", ort: "Marktplatz", von: um(8), bis: um(22), maxDienstMin: 720, minRuheMin: 480,
  }));
  const san = { kurz: "San", name: "Sanitäter" };
  const rs = { kurz: "RS", name: "Rettungssanitäter" };
  const wache = speichereEinheit(db, planId, null, einheitEingabe.parse({ art: "abschnitt", name: "Sanitätswache Markt", schichtMin: 240, soll: 3, anforderungen: [{ quali: san, anzahl: 1 }] }));
  const streife = speichereEinheit(db, planId, null, einheitEingabe.parse({ art: "abschnitt", name: "Fußstreife", schichtMin: 180, soll: 2 }));
  const fahrzeug = bereitgestellteFahrzeuge().fahrzeuge.find((f) => f.aktiv && f.art === "fahrzeug" && /GW|RTW|KTW/.test(f.typ));
  const fz = fahrzeug
    ? speichereEinheit(db, planId, null, einheitEingabe.parse({
      art: "fahrzeug", name: kurzname(fahrzeug), fahrzeugId: fahrzeug.id, kenner: fahrzeug.funkkenner, schichtMin: 360, soll: 2,
      anforderungen: [{ quali: rs, anzahl: 1 }, { quali: alsFahrerlaubnis("C1"), anzahl: 1 }],
    }))
    : null;
  speichereTempHelfer(db, planId, null, tempHelferEingabe.parse({ vorname: "Erika", nachname: "Beispiel", organisation: "Nachbarkreis (Demo)", telefon: "0581 000000", qualifikationen: [rs] }));

  const stamm = helferFuerSchichtplanung().helfer.filter((h) => h.demo);
  const ids = new Set(stamm.map((h) => h.id));
  const p = ladePlanung(db, planId)!;
  const von = (eid: string | null) => p.schichten.filter((s) => s.einheitId === eid);
  let i = 0;
  const naechste = () => stamm[i++ % Math.max(stamm.length, 1)];
  let einteilungen = 0;
  // Die Wache voll bis auf die letzte Schicht, die Streife halb, das Fahrzeug mit einer Lücke.
  for (const [eid, je, auslassen] of [[wache, 3, 1], [streife, 1, 0], [fz, 1, 1]] as const) {
    const liste = von(eid);
    for (const s of liste.slice(0, liste.length - auslassen)) {
      for (let n = 0; n < je; n++) {
        const h = naechste();
        if (!h) break;
        teileZu(db, planId, s.id, "stamm", h.id, ids);
        einteilungen++;
      }
    }
  }
  // Ein Konflikt mit Absicht: die erste Person der Wache zugleich auf der ersten Streife.
  const erste = stamm[0];
  if (erste && von(streife)[0]) { teileZu(db, planId, von(streife)[0].id, "stamm", erste.id, ids); einteilungen++; }
  return [`schichtplan: Planung „Stadtfest (Demo)“ mit ${p.einheiten.length} Abschnitten/Fahrzeugen, ${p.schichten.length} Schichten und ${einteilungen} Einteilungen angelegt`];
}
