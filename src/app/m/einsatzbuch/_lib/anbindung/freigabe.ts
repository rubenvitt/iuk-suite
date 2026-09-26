/**
 * Schlüsselfreigabe für die Verwaltung der App (Spec §12, Entscheidung 3): Die App schickt Kopf
 * und Umschlag der Blöcke, die Suite packt die CEKs mit ihrem privaten Schlüssel aus. Es gibt kein
 * Teilergebnis — eine einzige Ablehnung verwirft die ganze Anfrage, und nur eine erfolgreiche
 * Freigabe hinterlässt eine Zeile in `freigabe` (Entscheidung 4, auditiert per Trigger).
 */
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { freigabe, rechner } from "../../_db/schema";
import { zuBase64 } from "../kern/bytes";
import type { Blockkopf, Umschlag } from "../kern/format";
import { importierePrivat } from "../kern/umschlag";
import { packeAusFuer } from "../schluessel/freigabe";
import { kekAusUmgebung } from "../schluessel/kek";
import { entschluesselePrivat, paarZuId } from "../schluessel/paar";
import type { Db } from "../stammdaten/daten";
import type { SitzungZeile } from "./sitzung";

export const HOECHSTENS_FREIGABEN = 200;

export type FreigabeAnfrage = { kopf: Blockkopf; umschlag: Umschlag }[];
export type Freigabeergebnis =
  | { ok: true; schluessel: { block: number; cek: string }[] }
  | { ok: false; status: 403 | 413 | 422 | 503; code: string; message: string };

const ablehnung = (status: 403 | 413 | 422 | 503, code: string, message: string): Freigabeergebnis => ({ ok: false, status, code, message });
const artText = (art: "echt" | "test") => (art === "echt" ? "echter" : "Test-");

/**
 * Prüfreihenfolge: Rechner der Sitzung (403), Anzahl (413), einheitliche Umgebung (422), KEK (503),
 * dann je Eintrag: Schlüssel bekannt, Art des Paars gleich Art des Rechners, ein Test-Paar gehört
 * dem Sitzungsrechner — erst danach packt `packeAusFuer` aus (prüft Umgebung gegen Paar, Umschlag).
 */
export async function gibFrei(
  db: Db,
  s: SitzungZeile,
  anfrage: FreigabeAnfrage,
  o: { jetzt: Date; env?: Record<string, string | undefined> },
): Promise<Freigabeergebnis> {
  // Frisch aus der DB: `s` kann älter sein als ein Widerruf oder das Löschen des Rechners.
  const r = s.rechnerId === null ? undefined : db.select().from(rechner).where(eq(rechner.id, s.rechnerId)).get();
  if (!r || r.widerrufenAm !== null) {
    return ablehnung(403, "sitzung_ohne_rechner", "Diese Anmeldung gehört zu keinem eingerichteten Rechner und darf nichts freigeben.");
  }
  if (anfrage.length > HOECHSTENS_FREIGABEN) {
    return ablehnung(413, "zu_viele", `Höchstens ${HOECHSTENS_FREIGABEN} Blöcke je Anfrage, angefragt sind ${anfrage.length}.`);
  }
  if (new Set(anfrage.map((e) => e.kopf.umgebung)).size > 1) {
    return ablehnung(422, "umgebung_gemischt", "Die Anfrage mischt Blöcke mit Umgebung „echt“ und „test“.");
  }
  const k = kekAusUmgebung(o.env ?? process.env);
  if (k.status === "fehlt") return ablehnung(503, "kek_fehlt", "EINSATZBUCH_SCHLUESSEL_KEK ist nicht gesetzt");
  if (k.status === "ungueltig") return ablehnung(503, "kek_ungueltig", "EINSATZBUCH_SCHLUESSEL_KEK ist kein 32-Byte-Wert in Base64");

  // Cache des geöffneten Privatschlüssels je `schluesselId`, nur für die Dauer dieser Anfrage
  // (Stufe 6, Task 7): eine Freigabe mit bis zu 200 Blöcken desselben Schlüssels (`HOECHSTENS_FREIGABEN`)
  // öffnete ihn sonst bis zu 200-mal. `packeAusFuer` bekommt ihn schon geöffnet und entschlüsselt
  // dann selbst nichts mehr. Verworfen wird der Cache am Ende der Anfrage (`finally`), erfolgreich
  // oder nicht — er trägt nichts, was über diese eine Anfrage hinaus leben soll.
  const privatCache = new Map<string, CryptoKey>();
  try {
    const schluessel: { block: number; cek: string }[] = [];
    for (const { kopf, umschlag } of anfrage) {
      const paar = paarZuId(db, kopf.schluesselId);
      if (!paar) return ablehnung(422, "schluessel_unbekannt", `Schlüssel ${kopf.schluesselId} ist der Suite nicht bekannt.`);
      if (paar.art !== r.art) {
        return ablehnung(
          422, "art_passt_nicht",
          `Block ${kopf.block} trägt einen ${artText(paar.art)}Schlüssel (${paar.schluesselId}), der Rechner „${r.name}“ ist ein ${artText(r.art)}Rechner.`,
        );
      }
      if (paar.art === "test" && paar.rechnerId !== r.id) {
        return ablehnung(
          422, "fremder_rechner",
          `Schlüssel ${paar.schluesselId} gehört zum Rechner ${paar.rechnerId}, diese Anmeldung zum Rechner ${r.id}.`,
        );
      }
      let privat = privatCache.get(paar.schluesselId);
      if (!privat) {
        try {
          privat = await importierePrivat(zuBase64(await entschluesselePrivat(paar.privatVerschluesselt, paar.schluesselId, k.kek)));
        } catch {
          return ablehnung(503, "privat_unlesbar", "Der private Schlüssel lässt sich mit diesem KEK nicht lesen.");
        }
        privatCache.set(paar.schluesselId, privat);
      }
      const f = await packeAusFuer(kopf.schluesselId, umschlag, kopf, { db, env: o.env ?? process.env, privat });
      if (!f.ok) return ablehnung(f.status, f.code, f.meldung);
      schluessel.push({ block: kopf.block, cek: zuBase64(f.cek) });
    }

    if (schluessel.length > 0) {
      const bloecke = [...new Set(schluessel.map((x) => x.block))];
      withAuditContext({ actor: auditActor({ sub: s.sub, name: s.name }) }, () => {
        db.insert(freigabe).values({
          id: nanoid(), zeitpunkt: o.jetzt, sub: s.sub, name: s.name, art: r.art,
          rechnerId: r.id, rechnerName: r.name, bloecke: bereichsText(bloecke), anzahl: bloecke.length,
        }).run();
      });
    }
    return { ok: true, schluessel };
  } finally {
    privatCache.clear();
  }
}

/** Blocknummern als lesbare Bereiche: [1, 2, 3, 5, 7, 8] → „1–3, 5, 7–8“ (sortiert, ohne Doppelte). */
export function bereichsText(bloecke: number[]): string {
  const zahlen = [...new Set(bloecke)].sort((a, b) => a - b);
  const teile: string[] = [];
  for (let i = 0; i < zahlen.length; ) {
    let j = i;
    while (j + 1 < zahlen.length && zahlen[j + 1] === zahlen[j] + 1) j++;
    teile.push(i === j ? String(zahlen[i]) : `${zahlen[i]}–${zahlen[j]}`);
    i = j + 1;
  }
  return teile.join(", ");
}
