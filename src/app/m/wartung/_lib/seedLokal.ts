import type { WartungDb } from "../_db/client";
import { checkpunkt, eintrag, geraet, inhalt, mangel } from "../_db/schema";
import { eq, ne } from "drizzle-orm";
import { tagInZone } from "./heute";
import { neueId } from "./schreiben";
import { START } from "./startbestand";

/**
 * Lokale Demodaten — bewusst NICHT am Boot. Die neun Geräte des POC (IDA-307) mit Verlauf und zwei offenen
 * Mängeln; Tage relativ zu heute, damit die Fristen immer gleich aussehen (eine überfällig, einige bald).
 * Gruppen, Arten und Checklisten bringt die Migration mit. Idempotent: gibt es schon ein Gerät (außer Kisten),
 * bleibt alles; die Materialkisten legt `seedKisten` getrennt an.
 */
export async function seedLokalWartung(db: WartungDb, jetzt = Date.now()): Promise<string[]> {
  const kisten = seedKisten(db, jetzt);
  if (db.select({ id: geraet.id }).from(geraet).where(ne(geraet.artId, START.art.kiste)).limit(1).get()) {
    return ["wartung: Geräte vorhanden, nichts geändert", ...kisten];
  }
  const tag = tagRechner(jetzt);
  const { gruppe: G, art: A, frist: F } = START;

  type E = [vorTagen: number, frist: string | null, titel: string, wer: string, rest?: { ergebnis?: "ok" | "mangel" | "defekt"; stunden?: number; notiz?: string; maengel?: number }];
  const geraete: {
    gruppe: string; art: string; name: string; hersteller: string; typ: string; seriennr: string;
    ortArt: "lager" | "fahrzeug"; ort: string; stunden: number | null; verlauf: E[]; maengel?: { text: string; einsatzbereit: boolean; vorTagen: number }[];
  }[] = [
    { gruppe: G.technik, art: A.stromerzeuger, name: "Stromerzeuger 8 kVA", hersteller: "Endress", typ: "ESE 808 DBG ES DIN", seriennr: "808-19-04472",
      ortArt: "fahrzeug", ort: "GW-Technik", stunden: 425, verlauf: [
        [42, F.stromerzeuger.quartal, "Quartalsprüfung", "Helfer A", { ergebnis: "ok", stunden: 418 }],
        [133, F.stromerzeuger.quartal, "Quartalsprüfung", "Helfer B", { ergebnis: "ok", stunden: 371 }],
        [232, F.stromerzeuger.wartung, "Wartung", "Fachfirma", { stunden: 340, notiz: "Öl und Zündkerze gewechselt, Luftfilter neu." }],
        [295, F.stromerzeuger.dguv, "Elektroprüfung (DGUV V3)", "Elektrofachbetrieb", { notiz: "Bestanden." }],
      ] },
    { gruppe: G.iuk, art: A.stromerzeuger, name: "Stromerzeuger 2,8 kVA", hersteller: "Honda", typ: "EU 30is", seriennr: "EAMJ-1102231",
      ortArt: "lager", ort: "Lager I&K, Regal 2", stunden: 156, verlauf: [
        [112, F.stromerzeuger.quartal, "Quartalsprüfung", "Helfer B", { ergebnis: "ok", stunden: 151 }],
        [213, F.stromerzeuger.wartung, "Wartung", "Fachfirma", { stunden: 120 }],
        [346, F.stromerzeuger.dguv, "Elektroprüfung (DGUV V3)", "Elektrofachbetrieb"],
      ] },
    { gruppe: G.technik, art: A.stromerzeuger, name: "Stromerzeuger 5 kVA", hersteller: "Endress", typ: "ESE 506 HS-GT", seriennr: "506-21-11873",
      ortArt: "fahrzeug", ort: "Anhänger Licht", stunden: 88, verlauf: [
        [14, F.stromerzeuger.quartal, "Quartalsprüfung", "Helfer A", { ergebnis: "mangel", stunden: 88, maengel: 1 }],
        [176, F.stromerzeuger.wartung, "Wartung", "Fachfirma", { stunden: 61 }],
        [176, F.stromerzeuger.dguv, "Elektroprüfung (DGUV V3)", "Elektrofachbetrieb"],
      ], maengel: [{ text: "Sichtprüfung: Dichtung am Tankdeckel porös, riecht nach Benzin. Läuft sonst einwandfrei.", einsatzbereit: true, vorTagen: 14 }] },
    { gruppe: G.technik, art: A.heizung, name: "Zeltheizung 1", hersteller: "Thermobile", typ: "IMA 111 (Diesel, indirekt)", seriennr: "IMA111-0457",
      ortArt: "lager", ort: "Lager Technik, Stellplatz 3", stunden: 231, verlauf: [
        [63, F.heizung.quartal, "Quartalsprüfung", "Helfer B", { ergebnis: "ok", stunden: 229 }],
        [392, F.heizung.wartung, "Wartung vor der Heizsaison", "Fachfirma"],
      ] },
    { gruppe: G.technik, art: A.heizung, name: "Zeltheizung 2", hersteller: "Thermobile", typ: "IMA 111 (Diesel, indirekt)", seriennr: "IMA111-0458",
      ortArt: "lager", ort: "Lager Technik, Stellplatz 4", stunden: null, verlauf: [
        [7, F.heizung.quartal, "Quartalsprüfung", "Helfer A", { ergebnis: "defekt", maengel: 1 }],
        [392, F.heizung.wartung, "Wartung vor der Heizsaison", "Fachfirma"],
      ], maengel: [{ text: "Probelauf: Zündet nicht, Störungslampe leuchtet nach drei Versuchen. Diesel ist drin.", einsatzbereit: false, vorTagen: 7 }] },
    { gruppe: G.technik, art: A.heizung, name: "Heizlüfter 9 kW", hersteller: "Trotec", typ: "TDS 75 R", seriennr: "TDS75-22-3310",
      ortArt: "fahrzeug", ort: "GW-San", stunden: null, verlauf: [
        [30, F.heizung.quartal, "Quartalsprüfung", "Helfer B", { ergebnis: "ok" }],
        [260, F.heizung.wartung, "Wartung vor der Heizsaison", "Fachfirma"],
      ] },
    { gruppe: G.iuk, art: A.akku, name: "Powerstation 1", hersteller: "EcoFlow", typ: "River 2 Pro", seriennr: "R2P-0091-2231",
      ortArt: "fahrzeug", ort: "ELW 1", stunden: null, verlauf: [
        [85, F.akku.quartal, "Quartalsprüfung", "Helfer C", { ergebnis: "ok" }],
        [254, F.akku.dguv, "Elektroprüfung (DGUV V3)", "Elektrofachbetrieb"],
      ] },
    { gruppe: G.iuk, art: A.it, name: "Einsatz-Laptop 1", hersteller: "Lenovo", typ: "ThinkPad T14", seriennr: "PF-3KX19A",
      ortArt: "fahrzeug", ort: "ELW 1", stunden: null, verlauf: [
        [20, F.it.quartal, "Quartalsprüfung", "Helfer C", { ergebnis: "ok" }],
        [610, F.it.dguv, "Elektroprüfung (DGUV V3)", "Elektrofachbetrieb"],
      ] },
  ];

  const punkteJeArt = new Map<string, { text: string }[]>();
  for (const a of Object.values(A)) {
    punkteJeArt.set(a, db.select({ text: checkpunkt.text }).from(checkpunkt).where(eq(checkpunkt.artId, a)).orderBy(checkpunkt.position).all());
  }

  db.transaction((tx) => {
    for (const g of geraete) {
      const id = neueId();
      tx.insert(geraet).values({
        id, gruppeId: g.gruppe, artId: g.art, name: g.name, hersteller: g.hersteller, typ: g.typ, seriennr: g.seriennr,
        ortArt: g.ortArt, ort: g.ort, stunden: g.stunden, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt,
      }).run();
      for (const [vor, fristId, titel, wer, rest = {}] of g.verlauf) {
        const pruefung = rest.ergebnis !== undefined;
        const punkte = punkteJeArt.get(g.art) ?? [];
        tx.insert(eintrag).values({
          id: neueId(), geraetId: id, typ: pruefung ? "pruefung" : "erledigt", fristId, titel, am: tag(-vor),
          stunden: rest.stunden ?? null, wer, notiz: rest.notiz ?? "", ergebnis: rest.ergebnis ?? null,
          antworten: pruefung ? JSON.stringify(punkte.map((p, i) => ({ text: p.text, ok: rest.ergebnis === "ok" || i > 0 }))) : null,
          maengel: rest.maengel ?? 0, angelegtAm: jetzt - vor * 86_400_000,
        }).run();
      }
      for (const m of g.maengel ?? []) {
        const am = jetzt - m.vorTagen * 86_400_000;
        // Schon „gepusht“: Demodaten sollen keinen Sofort-Push auslösen.
        tx.insert(mangel).values({ id: neueId(), geraetId: id, text: m.text, foto: false, einsatzbereit: m.einsatzbereit, gemeldetAm: am, gemeldetVon: "Helfer A", gepushtAm: am }).run();
      }
    }
  });
  return [`wartung: ${geraete.length} Geräte mit Verlauf und 2 offenen Mängeln angelegt`, ...kisten];
}

function tagRechner(jetzt: number) {
  const heute = tagInZone(jetzt);
  return (n: number) => {
    const [j, m, t] = heute.split("-").map(Number);
    return new Date(Date.UTC(j, m - 1, t + n)).toISOString().slice(0, 10);
  };
}

/**
 * Zwei Materialkisten der I&K mit Inhaltsliste (IDA-335), eine davon mit einer fehlenden Position. Eigener
 * Schritt, damit auch eine Datenbank von vor den Kisten sie bekommt; gibt es schon eine Kiste, bleibt alles.
 */
function seedKisten(db: WartungDb, jetzt: number): string[] {
  if (db.select({ id: geraet.id }).from(geraet).where(eq(geraet.artId, START.art.kiste)).limit(1).get()) return [];
  const tag = tagRechner(jetzt);
  type Position = [text: string, soll: number, bemerkung?: string];
  const kisten: { name: string; ortArt: "lager" | "fahrzeug"; ort: string; inhalt: Position[]; vorTagen: number; fehlt?: { index: number; notiz: string } }[] = [
    { name: "I&K-Kiste 1 – Kabel", ortArt: "lager", ort: "Lager I&K, Regal 1", vorTagen: 50, inhalt: [
      ["Netzwerkkabel 5 m", 6, "Cat 6, grau"], ["Netzwerkkabel 20 m", 2], ["HDMI-Kabel 2 m", 3], ["USB-C-Ladekabel", 4],
      ["Steckdosenleiste 5-fach", 3], ["Kabeltrommel 25 m", 1],
    ] },
    { name: "I&K-Kiste 2 – Adapter", ortArt: "fahrzeug", ort: "ELW 1", vorTagen: 10, fehlt: { index: 1, notiz: "nur einer da" }, inhalt: [
      ["HDMI-auf-VGA-Adapter", 2], ["USB-C-Hub", 2], ["Kaltgerätekabel", 4], ["Gewebeband", 2, "schwarz"], ["Kabelbinder", 1, "Beutel mit 100 Stück"],
    ] },
  ];
  db.transaction((tx) => {
    for (const k of kisten) {
      const id = neueId();
      tx.insert(geraet).values({
        id, gruppeId: START.gruppe.iuk, artId: START.art.kiste, name: k.name, ortArt: k.ortArt, ort: k.ort,
        stunden: null, aktiv: true, angelegtAm: jetzt, aktualisiertAm: jetzt,
      }).run();
      k.inhalt.forEach(([text, soll, bemerkung = ""], position) => {
        tx.insert(inhalt).values({ id: neueId(), geraetId: id, text, soll, bemerkung, position }).run();
      });
      const am = jetzt - k.vorTagen * 86_400_000;
      tx.insert(eintrag).values({
        id: neueId(), geraetId: id, typ: "pruefung", fristId: START.frist.kiste.quartal, titel: "Quartalsprüfung", am: tag(-k.vorTagen),
        wer: "Helfer C", ergebnis: k.fehlt ? "mangel" : "ok", maengel: k.fehlt ? 1 : 0, angelegtAm: am,
        antworten: JSON.stringify(k.inhalt.map(([text, soll], i) => ({ text: `${soll} × ${text}`, ok: i !== k.fehlt?.index }))),
      }).run();
      if (k.fehlt) {
        const [text, soll] = k.inhalt[k.fehlt.index];
        tx.insert(mangel).values({
          id: neueId(), geraetId: id, text: `Fehlt: ${text} (Soll ${soll}) – ${k.fehlt.notiz}`, foto: false, einsatzbereit: true,
          gemeldetAm: am, gemeldetVon: "Helfer C", gepushtAm: am, fehlt: true,
        }).run();
      }
    }
  });
  return [`wartung: ${kisten.length} Materialkisten mit Inhaltsliste angelegt`];
}
