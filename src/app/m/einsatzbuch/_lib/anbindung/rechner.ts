/**
 * Einrichten, Widerrufen und Löschen der Einsatzbuch-Rechner (Spec §12, Entscheidungen 1, 2, 5, 12).
 * Höchstens ein echter Rechner ist aktiv (Teilindex `rechner_echt_aktiv`); er nutzt das echte
 * Schlüsselpaar der Suite. Jeder Test-Rechner bekommt ein eigenes Test-Paar, das mit ihm gelöscht
 * wird (Trigger der Migration `0002_anbindung`).
 */
import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { zeitFormat } from "@/core/zeit";
import { rechner, schluesselpaar, sitzung } from "../../_db/schema";
import { kekAusUmgebung } from "../schluessel/kek";
import { bereitePaarVor, echtesPaar } from "../schluessel/paar";
import type { Db } from "../stammdaten/daten";
import type { RechnerZeile } from "./geraet";
import type { SitzungZeile } from "./sitzung";
import { baueStammdatenpaket, pruefeLesergrenzen, zeitpunktInZone } from "./stammdatenpaket";
import { neuesGeheimnis, hashVon } from "./token";
import type { EinrichtenAntwort } from "./vertrag";

export type Einrichtungsergebnis =
  | { ok: true; antwort: EinrichtenAntwort }
  | { ok: false; status: 409 | 422 | 503; code: string; message: string; extra?: Record<string, unknown> };

const ANZEIGE = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** Rollt die Transaktion zurück, wenn die Sitzung inzwischen schon eingerichtet hat. */
class SchonEingerichtet extends Error {}

export function aktiverEchterRechner(db: Db): RechnerZeile | null {
  return db.select().from(rechner).where(and(eq(rechner.art, "echt"), isNull(rechner.widerrufenAm))).get() ?? null;
}

/**
 * Richtet einen Rechner für die Sitzung `s` ein. `anfrage` muss der Einrichtung gleichen, die
 * über die Anmelde-URL in Code und Sitzung kam (Entscheidung 1). Das Schlüsselmaterial eines
 * Test-Paars entsteht asynchron VOR der Transaktion; darin laufen dann Widerruf des alten echten
 * Rechners (nur mit `ersetzen`), neuer Rechner, Test-Paar und Bindung der Sitzung — ganz oder gar nicht.
 */
export async function richteEin(
  db: Db,
  s: SitzungZeile,
  anfrage: { art: "echt" | "test"; name: string },
  o: { jetzt: Date; env?: Record<string, string | undefined> },
): Promise<Einrichtungsergebnis> {
  // Frisch lesen: `s` kann aus einem früheren Aufruf stammen und `eingerichtet` noch nicht kennen.
  const frisch = db.select().from(sitzung).where(eq(sitzung.tokenHash, s.tokenHash)).get();
  if (!frisch || frisch.eingerichtet) {
    return { ok: false, status: 409, code: "schon_eingerichtet", message: "Mit dieser Anmeldung wurde bereits ein Rechner eingerichtet." };
  }
  if (!frisch.einrichtungArt || frisch.einrichtungArt !== anfrage.art || frisch.rechnerName !== anfrage.name) {
    return {
      ok: false, status: 409, code: "einrichtung_passt_nicht",
      message: "Die Einrichtung passt nicht zur Anmeldung. Bitte die Einrichtung in der App neu beginnen.",
    };
  }
  const k = kekAusUmgebung(o.env ?? process.env);
  if (k.status === "fehlt") return { ok: false, status: 503, code: "kek_fehlt", message: "EINSATZBUCH_SCHLUESSEL_KEK ist nicht gesetzt" };
  if (k.status === "ungueltig") return { ok: false, status: 503, code: "kek_ungueltig", message: "EINSATZBUCH_SCHLUESSEL_KEK ist kein 32-Byte-Wert in Base64" };

  const echt = anfrage.art === "echt" ? echtesPaar(db) : undefined;
  if (anfrage.art === "echt") {
    if (!echt) return { ok: false, status: 503, code: "kein_echtes_paar", message: "Die Suite hat noch kein echtes Schlüsselpaar." };
    const vorhanden = aktiverEchterRechner(db);
    if (vorhanden && !frisch.ersetzen) return echtVorhanden(vorhanden);
  }

  const paket = baueStammdatenpaket(db);
  const grenze = pruefeLesergrenzen(paket);
  if (!grenze.ok) {
    return {
      ok: false, status: 422, code: "stammdaten_zu_lang",
      message: `${grenze.feld} bei „${grenze.eintrag}“ ist ${grenze.laenge} Zeichen lang, der Reader erlaubt höchstens ${grenze.hoechstens}.`,
      // Nur `feld` und `eintrag`: Mehr Zusatzfelder kennt der Rust-Kern nicht (`fehlerKoerper`).
      extra: { feld: grenze.feld, eintrag: grenze.eintrag },
    };
  }

  const rechnerId = nanoid();
  const testPaar = anfrage.art === "test" ? await bereitePaarVor({ art: "test", rechnerId, kek: k.kek, jetzt: o.jetzt }) : null;
  const paar = testPaar ?? echt;
  if (!paar) throw new Error("Einrichtung ohne Schlüsselpaar");
  const geraeteToken = neuesGeheimnis();

  let abgelehnt: Einrichtungsergebnis | null;
  try {
    abgelehnt = withAuditContext({ actor: auditActor({ sub: frisch.sub, name: frisch.name }) }, () => db.transaction((tx): Einrichtungsergebnis | null => {
      if (anfrage.art === "echt") {
        // Erneut in der Transaktion: Zwischen der Prüfung oben und hier kann ein anderer Aufruf eingerichtet haben.
        const vorhanden = tx.select().from(rechner).where(and(eq(rechner.art, "echt"), isNull(rechner.widerrufenAm))).get();
        if (vorhanden && !frisch.ersetzen) return echtVorhanden(vorhanden);
        // Erst widerrufen, dann einfügen: sonst scheitert der neue Rechner am Teilindex `rechner_echt_aktiv`.
        if (vorhanden) tx.update(rechner).set({ widerrufenAm: o.jetzt }).where(eq(rechner.id, vorhanden.id)).run();
      }
      // Erst der Rechner, dann sein Paar: die Konsistenzregel `schluesselpaar_rechner_insert` verlangt ihn.
      tx.insert(rechner).values({
        id: rechnerId, art: anfrage.art, name: anfrage.name, tokenHash: hashVon(geraeteToken),
        eingerichtetAm: o.jetzt, eingerichtetVon: frisch.name, eingerichtetVonSub: frisch.sub,
      }).run();
      if (testPaar) tx.insert(schluesselpaar).values(testPaar).run();
      const gebunden = tx.update(sitzung)
        .set({ eingerichtet: true, rechnerId })
        .where(and(eq(sitzung.tokenHash, frisch.tokenHash), eq(sitzung.eingerichtet, false)))
        .run();
      if (gebunden.changes !== 1) throw new SchonEingerichtet();
      return null;
    }));
  } catch (e) {
    if (e instanceof SchonEingerichtet) {
      return { ok: false, status: 409, code: "schon_eingerichtet", message: "Mit dieser Anmeldung wurde bereits ein Rechner eingerichtet." };
    }
    throw e;
  }
  if (abgelehnt) return abgelehnt;

  return {
    ok: true,
    antwort: {
      rechnerId, art: anfrage.art, name: anfrage.name, geraeteToken,
      oeffentlichSpki: paar.oeffentlich, schluesselId: paar.schluesselId, paket,
      eingerichtetAm: zeitpunktInZone(o.jetzt), eingerichtetVon: frisch.name,
    },
  };
}

function echtVorhanden(r: RechnerZeile): Einrichtungsergebnis {
  return {
    ok: false, status: 409, code: "echt_vorhanden",
    message: `Es gibt bereits einen echten Rechner „${r.name}“, eingerichtet am ${ANZEIGE.format(r.eingerichtetAm)} von ${r.eingerichtetVon}.`,
    extra: { eingerichtetAm: zeitpunktInZone(r.eingerichtetAm), eingerichtetVon: r.eingerichtetVon },
  };
}

/** Widerruft einen aktiven Rechner. `false`, wenn es ihn nicht gibt oder er schon widerrufen ist. */
export function widerrufe(db: Db, id: string, jetzt: Date): boolean {
  return db.update(rechner).set({ widerrufenAm: jetzt }).where(and(eq(rechner.id, id), isNull(rechner.widerrufenAm))).run().changes === 1;
}

/**
 * Löscht einen Test-Rechner samt Test-Paar, Ankern, Abweichungen und Sitzungen (Trigger und
 * `ON DELETE CASCADE`). Ein echter Rechner wird nie gelöscht, nur widerrufen: seine Kette bleibt
 * lesbar. Freigabe-Protokolle bleiben stehen (`freigabe` hat bewusst keinen Fremdschlüssel).
 */
export function loescheTestRechner(db: Db, id: string): "geloescht" | "unbekannt" | "nur_test" {
  const r = db.select({ art: rechner.art }).from(rechner).where(eq(rechner.id, id)).get();
  if (!r) return "unbekannt";
  if (r.art !== "test") return "nur_test";
  db.delete(rechner).where(and(eq(rechner.id, id), eq(rechner.art, "test"))).run();
  return "geloescht";
}
