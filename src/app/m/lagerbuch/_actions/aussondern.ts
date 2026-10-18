"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { artikel, buchungen, chargen, newId } from "../_db/schema";
import { revalidiereBestand } from "../_lib/revalidierung";
import { zodFehler, type ActionErgebnis } from "../_lib/actionErgebnis";
import { handlagerOrte } from "../_lib/lesepfade/orte";
import { verfallSchwellen, verfallStatus, type VerfallSchwellen } from "../_lib/domain/verfall";
import type { Tx } from "../_lib/schreibpfade/abbuchung";
import { AUSSONDERN_PRAEFIX } from "../_lib/vorgang";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * DIE AUSSONDERUNG EINER CHARGE IM HANDLAGER — die Buchung hinter
 * `aussondern` (eine Charge) und `aussondernSammel` (IDA-238, mehrere).
 *
 * ⚠️ BEIDE ACTIONS BUCHEN UEBER DIESE EINE FUNKTION. Die Pruefungen
 * (abgelaufen? Ort im Handlager? Saldo > 0?) stehen mit ihren Befunden hier;
 * eine zweite Fassung fuer die Sammelaktion liefe mit der ersten auseinander —
 * und zwar genau in den Datenzustaenden, die niemand herstellt, um sie
 * anzusehen.
 *
 * ⚠️ SIE STEHT IN DIESER DATEI UND NICHT UNTER `_lib/schreibpfade/`: die
 * Quelltext-Waechter in `_lib/revalidierung.test.ts` und `_lib/vorgang.test.ts`
 * erkennen einen Bestandsschreiber an seiner Action-Datei. Ausgelagert fiele
 * `aussondern.ts` aus beiden Pruefungen heraus.
 *
 * ⚠️ JE CHARGE UND ORT EINE EIGENE BUCHUNG, auch in der Sammelaktion. Das
 * Journal ist append-only; eine Sammelbuchung ueber mehrere Chargen gaebe es
 * dort nicht zu lesen und spaeter nicht zu belegen.
 */

/** Warum eine Charge NICHT ausgesondert wurde — die Actions machen daraus Saetze. */
type AussonderungsGrund =
  | "charge_fehlt"
  | "nicht_abgelaufen"
  | "fremder_ort"
  | "kein_rest"
  | "kein_rest_am_ort";

/**
 * Das Ergebnis der Sammelaktion. NICHT exportiert: eine "use server"-Datei
 * exportiert nur Actions (`_lib/actionErgebnis.ts`); die Insel liest den Typ
 * aus dem Rueckgabewert von `aussondernSammel`.
 */
type SammelAussonderung = {
  /** Die Chargen, fuer die mindestens eine Buchung geschrieben wurde. */
  ausgesondert: string[];
  uebersprungen: { chargeId: string; grund: string }[];
};

type Aussonderung =
  | { ok: true; buchungen: number }
  | { ok: false; grund: AussonderungsGrund };

/**
 * Bucht den positiven Rest einer abgelaufenen Charge als Aussonderung aus.
 *
 * `nurOrte: null` heisst „alle Orte des Handlagers" (die ausdrueckliche Wahl
 * „Alles"), sonst genau diese Orte. Jeder genannte Ort muss zum Handlager
 * gehoeren — sonst wird NICHTS gebucht, auch an den uebrigen nicht.
 *
 * `kommentar` bekommt die gelesene Charge, damit die Sammelaktion den Text aus
 * der Datenbank bauen kann statt ihn vom Client zu glauben.
 */
function sondereChargeAus(
  tx: Tx,
  args: {
    chargeId: string;
    nurOrte: readonly string[] | null;
    handlager: readonly string[];
    kommentar: (charge: typeof chargen.$inferSelect) => string;
    quelleId: string;
    jetzt: Date;
    schwellen: VerfallSchwellen;
  },
): Aussonderung {
  const charge = tx.select().from(chargen).where(eq(chargen.id, args.chargeId)).get();
  if (!charge) return { ok: false, grund: "charge_fehlt" };

  if (!verfallStatus(charge.verfall, args.schwellen, args.jetzt).abgelaufen) {
    return { ok: false, grund: "nicht_abgelaufen" };
  }

  // DRK-339 — die Probe VOR der Abfrage, damit ein fremder Ort gar nicht erst
  // in ein Prädikat gerät. Ein Fahrzeug fällt hier heraus, ein stillgelegter
  // Schrank NICHT: `handlagerOrte` führt ihn weiter, und ein stillgelegter
  // Schrank ist genau der, den man ausräumt.
  if (args.nurOrte && args.nurOrte.some((ort) => !args.handlager.includes(ort))) {
    return { ok: false, grund: "fremder_ort" };
  }

  // DRK-297 — der Rest je ORT, nicht als eine Summe über den Bereich.
  // EINE Abfrage, `GROUP BY lagerort_id`, mit Bereichs-Prädikat.
  const jeOrt = tx
    .select({
      lagerortId: buchungen.lagerortId,
      summe: sql<number>`sum(${buchungen.menge})`,
    })
    .from(buchungen)
    .where(and(
      eq(buchungen.chargeId, charge.id),
      inArray(buchungen.lagerortId, [...args.handlager]),
    ))
    .groupBy(buchungen.lagerortId)
    .all();

  // ⚠️ EIN ORT MIT SALDO <= 0 IST KEIN ZIEL, UND ZWAR SCHON HIER. Eine
  // Buchung über 0 stünde im Journal und sagte nichts; eine über eine
  // negative Zahl drehte das Vorzeichen um und schriebe Bestand ZU.
  //
  // ⚠️ GEZAEHLT WIRD, WAS GEBUCHT WIRD — NICHT DER VORZEICHENBEHAFTETE
  // GESAMTSALDO (Codex-Befund zu PR #173, nachgerechnet). Ein Ort DARF im
  // Minus stehen: das Journal ist append-only, und die Fassung VOR DRK-297
  // buchte den ganzen Rest auf die Wurzel, auch wenn er in den Schränken lag.
  // Liegen dann +5 in Schrank 1 und −6 an der Wurzel, ist die Summe −1; über
  // die SUMME geprüft, wiese diese Aktion ab, während die Verfallsliste
  // daneben „Schrank 1: 5 Stk." zeigt — die fünf Stück wären nicht mehr
  // auszusondern. Beide Seiten zählen deshalb dieselben Zeilen:
  // `restJeChargeJeOrt` in der Anzeige, `ziele` hier.
  const nurOrte = args.nurOrte;
  const ziele = (nurOrte ? jeOrt.filter((z) => nurOrte.includes(z.lagerortId)) : jeOrt)
    .filter((z) => z.summe > 0);

  if (ziele.length === 0) {
    return { ok: false, grund: nurOrte ? "kein_rest_am_ort" : "kein_rest" };
  }

  const kommentar = args.kommentar(charge);
  for (const zeile of ziele) {
    tx.insert(buchungen).values({
      id: newId(), ts: args.jetzt, typ: "korrektur", artikelId: charge.artikelId,
      chargeId: charge.id, lagerortId: zeile.lagerortId, menge: -zeile.summe,
      quelleTyp: "oidc", quelleId: args.quelleId,
      referenz: `${AUSSONDERN_PRAEFIX}${zeile.lagerortId}`, kommentar,
    }).run();
  }
  return { ok: true, buchungen: ziele.length };
}

/** Die Saetze des Einzelknopfs — wortgleich mit der Fassung vor IDA-238. */
const EINZEL_GRUND: Record<AussonderungsGrund, string> = {
  charge_fehlt: "Charge nicht gefunden.",
  nicht_abgelaufen: "Nur abgelaufene Chargen können ausgesondert werden.",
  fremder_ort: "Dieser Ort gehört nicht zum Handlager.",
  kein_rest: "Charge hat keinen Restbestand im Handlager.",
  kein_rest_am_ort: "An diesem Ort liegt nichts mehr von dieser Charge.",
};

const AussondernSchema = z.object({
  chargeId: z.string().min(1),
  /**
   * DRK-339 — EIN Ort des Handlagers statt aller. Fehlt das Feld, bleibt es
   * bei „alles raus", dem Verhalten seit jeher.
   *
   * ⚠️ DER CLIENT SCHICKT EINEN ORT, NIE EINE MENGE. Die Zeile auf dem Schirm
   * nennt einen Rest, den sie beim RENDERN gesehen hat; bis zum Bestaetigen
   * kann eine andere Sitzung gebucht haben. Wer die Menge mitschickte, buchte
   * gegen einen veralteten Stand — mal zu viel (Saldo ins Minus, in einem
   * Journal ohne UPDATE und ohne DELETE), mal zu wenig, und beides still. Was
   * tatsaechlich am Ort liegt, rechnet die Transaktion unten aus.
   *
   * ⚠️ UND ER WIRD GEGEN DEN BEREICH GEPRUEFT, NICHT GEGLAUBT. Ohne die Probe
   * unten waere das hier die weiche Tuer neben `aussondernVomLagerort`: eine
   * Fahrzeug-ID im Feld, und der Fahrzeugbestand flöge aus — vorbei an der
   * Soll-Pruefung, die jener Weg genau dafuer fuehrt.
   */
  lagerortId: z.string().min(1).nullish(),
  kommentar: z.string().trim().min(1, "Kommentar erforderlich"),
});

/**
 * Bucht den positiven Rest einer abgelaufenen Charge im Handlager als
 * Korrektur aus — an allen Orten des Bereichs oder, mit `lagerortId`, an genau
 * einem davon (DRK-339). Bestand derselben Charge in Fahrzeugen bleibt
 * unberührt.
 *
 * ⚠️ DIE REFERENZ IST DIE KENNZEICHNUNG, NICHT DER KOMMENTAR (DRK-344). Der
 * Kommentar ist Freitext — der Grund, den jemand eingetippt hat; er trägt die
 * Begründung, nicht die Einordnung. Erst das Präfix `aussondern:` macht die
 * Entsorgung abgelaufenen Materials von einer Zählkorrektur unterscheidbar,
 * und genau das ist der Vorgang, den man im Nachhinein belegen können muss.
 *
 * ⚠️ VORHER GESCHRIEBENE ZEILEN TRAGEN `referenz: null` und bleiben im Journal
 * „Korrektur". Das Journal ist append-only; sie nachträglich zu kennzeichnen
 * hieße, es umzuschreiben.
 */
export async function aussondern(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis> => {

    const geparst = AussondernSchema.safeParse(eingabe);
    if (!geparst.success) {
      const feldFehler = zodFehler(geparst.error);
      return {
        ok: false,
        fehler: "Bitte die markierten Felder prüfen.",
        ...(feldFehler ? { feldFehler } : {}),
      };
    }
    const v = geparst.data;

    let ausgang: Aussonderung;
    try {
      const schwellen = verfallSchwellen();
      const jetzt = new Date();
      // DRK-339 — die Wahl schraenkt die Orte ein, sie ersetzt die Abfrage
      // nicht: gebucht wird weiterhin der Saldo, den die Transaktion sieht.
      // Die Pruefungen und ihre Befunde stehen im Schreibpfad
      // (`_lib/schreibpfade/aussonderung.ts`), den die Sammelaktion teilt.
      ausgang = db.transaction((tx) => sondereChargeAus(tx, {
        chargeId: v.chargeId,
        nurOrte: v.lagerortId ? [v.lagerortId] : null,
        handlager: handlagerOrte(tx),
        kommentar: () => v.kommentar,
        quelleId: viewer.sub,
        jetzt,
        schwellen,
      }));
    } catch {
      return { ok: false, fehler: "Aussondern fehlgeschlagen." };
    }

    if (!ausgang.ok) return { ok: false, fehler: EINZEL_GRUND[ausgang.grund] };

    /*
     * ⚠️ HIER STANDEN BIS DRK-374 DREI PFADE, und `verwaltung/journal` war
     * keiner davon — obwohl das Aussondern je Ort EINE Korrekturbuchung
     * schreibt, die genau dort steht. Dieselbe Luecke hatte `verwaltung/
     * lagerorte`, dessen Postenzaehlung aus eben diesen Zeilen kommt.
     */
    revalidiereBestand();
    return { ok: true };
  });
}

/**
 * Obergrenze einer Sammelanfrage. Weit ueber jeder Verfallsliste; die Zahl
 * deckelt nur, was keine Oberflaeche je schickt.
 */
const SAMMEL_MAX_CHARGEN = 500;

const SammelSchema = z.object({
  chargen: z
    .array(z.object({
      chargeId: z.string().min(1),
      /**
       * DIE ORTE, DIE AUF DEM SCHIRM STANDEN — nie eine Menge, und nie „alles".
       * Dieselbe Regel wie beim Einzelknopf (Codex-Befund zu PR #173, P1):
       * legt eine andere Sitzung zwischen Rendern und Bestaetigen Bestand
       * derselben Charge in einen ZWEITEN Schrank, bleibt der stehen, denn die
       * Rueckfrage hat ihn nicht genannt.
       */
      lagerortIds: z.array(z.string().min(1)).min(1).max(100),
    }))
    .min(1, "Bitte mindestens eine Charge auswählen.")
    .max(SAMMEL_MAX_CHARGEN, "Zu viele Chargen auf einmal."),
});

/**
 * Warum eine Charge der Sammelaktion stehen blieb — als Nachsatz zu ihrem
 * Namen („L42 · Kompressen (bereits ausgesondert)"), nicht als ganzer Satz.
 */
const SAMMEL_GRUND: Record<AussonderungsGrund, string> = {
  charge_fehlt: "nicht gefunden",
  nicht_abgelaufen: "nicht abgelaufen",
  fremder_ort: "Ort gehört nicht zum Handlager",
  kein_rest: "bereits ausgesondert",
  kein_rest_am_ort: "bereits ausgesondert",
};

/**
 * IDA-238 — MEHRERE ABGELAUFENE CHARGEN IN EINER ANFRAGE AUSSONDERN.
 *
 * ⚠️ JE CHARGE (UND ORT) EINE EIGENE BUCHUNG, ueber denselben Schreibpfad wie
 * der Einzelknopf. Das Journal ist append-only und liest sich je Charge; eine
 * Sammelbuchung waere dort nicht zu belegen.
 *
 * ⚠️ EINE CHARGE, DIE NICHT MEHR GEHT, HAELT DIE ANDEREN NICHT AUF. Der
 * Regelfall dafuer ist harmlos: eine zweite Sitzung hat sie in der
 * Zwischenzeit schon ausgesondert. Wer zehn Chargen aus einer Kiste nimmt,
 * will danach zehn Chargen los sein — alle zehn abzuweisen, weil eine schon
 * weg ist, waere ein Durchgang mehr ohne Gewinn. Die uebersprungenen kommen
 * mit Grund zurueck, und die Insel nennt sie.
 *
 * ⚠️ DENNOCH EINE TRANSAKTION. Gelesen und gebucht wird gegen EINEN Stand;
 * ein Wurf mittendrin (Datenbankfehler) nimmt alle Buchungen zurueck, statt
 * eine halbe Auswahl stehen zu lassen.
 *
 * Der Kommentar entsteht hier aus Charge und Artikel, wortgleich mit dem des
 * Einzelknopfs — der Client schickt keinen Freitext mit.
 */
export async function aussondernSammel(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<SammelAussonderung>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<SammelAussonderung>> => {

    const geparst = SammelSchema.safeParse(eingabe);
    if (!geparst.success) {
      // Die beiden Saetze an der Liste selbst (leer, zu lang) sind fuer
      // Menschen; alles darunter ist ein kaputter Aufruf.
      const erste = geparst.error.issues[0];
      const anDerListe = erste?.path.length === 1
        && (erste.code === "too_small" || erste.code === "too_big");
      return { ok: false, fehler: anDerListe ? erste.message : "Ungültige Eingabe." };
    }

    // Doppelt genannte Chargen einmal buchen — die erste Nennung gilt.
    const auftraege = [
      ...new Map(geparst.data.chargen.map((c) => [c.chargeId, c] as const)).values(),
    ];

    let wert: SammelAussonderung;
    try {
      const schwellen = verfallSchwellen();
      const jetzt = new Date();
      wert = db.transaction((tx): SammelAussonderung => {
        const handlager = handlagerOrte(tx);
        const ergebnis: SammelAussonderung = { ausgesondert: [], uebersprungen: [] };
        for (const auftrag of auftraege) {
          const ausgang = sondereChargeAus(tx, {
            chargeId: auftrag.chargeId,
            nurOrte: auftrag.lagerortIds,
            handlager,
            kommentar: (charge) => {
              const name = tx.select({ name: artikel.name }).from(artikel)
                .where(eq(artikel.id, charge.artikelId)).get()?.name ?? charge.artikelId;
              return `Verfallskontrolle — ${charge.chargenNr} · ${name} ausgesondert`;
            },
            quelleId: viewer.sub,
            jetzt,
            schwellen,
          });
          if (ausgang.ok) ergebnis.ausgesondert.push(auftrag.chargeId);
          else {
            ergebnis.uebersprungen.push({
              chargeId: auftrag.chargeId,
              grund: SAMMEL_GRUND[ausgang.grund],
            });
          }
        }
        return ergebnis;
      });
    } catch {
      return { ok: false, fehler: "Aussondern fehlgeschlagen." };
    }

    // Dieselben Flaechen wie der Einzelknopf (DRK-374); ohne Buchung hat sich
    // nichts geaendert, was eine neu gerechnete Seite zeigen koennte.
    if (wert.ausgesondert.length > 0) revalidiereBestand();
    return { ok: true, wert };
  });
}
