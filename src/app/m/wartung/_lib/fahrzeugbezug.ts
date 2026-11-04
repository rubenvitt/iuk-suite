/**
 * IDA-342 — Woher die Gerätewartung ihre Fahrzeuge kennt: nur aus der Bereitstellung des Moduls fahrzeuge
 * (`fahrzeuge/_lib/bereitstellung.ts`), nie aus dessen Datenbank.
 *
 * Steht ein Gerät auf einem Fahrzeug der Fahrzeugverwaltung, trägt es dessen ID (`geraet.fahrzeug_id`), und
 * der Name am Gerät kommt aus dem Server (`kurzname`), nie aus dem Client. Ein Fahrzeug, das es dort nicht
 * gibt, bleibt Freitext ohne Verweis.
 */
import { kurzname, type BereitgestelltesFahrzeug } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import type { GeraetEingabe } from "./eingabe";
import { normalisiert, wahlZuName, type FahrzeugWahl } from "./fahrzeugsuche";
import { Abgelehnt } from "./schreiben";

/** Die aktiven Fahrzeuge und Anhänger für die Auswahl, nach Namen. */
export function fahrzeugWahl(fahrzeuge: BereitgestelltesFahrzeug[]): FahrzeugWahl[] {
  return fahrzeuge.filter((f) => f.aktiv)
    .map((f) => {
      const name = kurzname(f);
      return {
        id: f.id, name, funkrufname: f.funkrufname, kennzeichen: f.kennzeichen || null,
        suche: normalisiert([name, f.typ, f.funkrufname, f.funkkenner ?? "", f.kennzeichen ?? ""].join(" ")),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
}

/**
 * Die Eingabe mit Verweis und Namen aus der Fahrzeugverwaltung. Im Lager gibt es keinen Verweis. Ein Verweis
 * auf ein Fahrzeug, das es nicht (mehr) gibt, wird abgelehnt, ebenso ein NEUER Verweis auf ein Fahrzeug außer
 * Dienst (`bisher` ist der gespeicherte Verweis — der bleibt bearbeitbar); ein Freitext, der genau einem
 * Fahrzeug gleicht, bekommt dessen Verweis.
 */
export function mitFahrzeugbezug(e: GeraetEingabe, fahrzeuge: BereitgestelltesFahrzeug[], bisher: string | null = null): GeraetEingabe {
  if (e.ortArt !== "fahrzeug") return { ...e, fahrzeugId: null };
  if (e.fahrzeugId) {
    const f = fahrzeuge.find((x) => x.id === e.fahrzeugId);
    if (!f) throw new Abgelehnt("Dieses Fahrzeug gibt es in der Fahrzeugverwaltung nicht mehr.", "ort");
    if (!f.aktiv && f.id !== bisher) throw new Abgelehnt("Dieses Fahrzeug ist außer Dienst.", "ort");
    return { ...e, ort: kurzname(f) };
  }
  const gleich = wahlZuName(fahrzeugWahl(fahrzeuge), e.ort);
  return { ...e, fahrzeugId: gleich?.id ?? null };
}
