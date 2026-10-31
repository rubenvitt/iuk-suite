/**
 * MANGEL MELDEN (IDA-298) — der Schirm im Helferbereich. Er steht hinter demselben Riegel wie jeder
 * Helferschirm (`helfer/layout.tsx`): Kärtchen nach dem Scan des Ortsetiketts oder ein Lagerbuch-Konto.
 *
 * Welcher Ort? In dieser Reihenfolge: `?ort=` (der Reiter vom Schrank aus, „Ändern"), der Ort des
 * gescannten Ortsetiketts, das Fahrzeug eines Fahrzeug-Kärtchens, sonst die Auswahl. `?wahl=1`
 * erzwingt die Auswahl.
 *
 * Kein Riegel auf die Reichweite: melden darf jede Karte (`_ui/HelferRahmen.tsx`, Reiter „Mangel").
 */
import Link from "next/link";
import { eq } from "drizzle-orm";
import { getDb } from "../../_db/client";
import { tokens } from "../../_db/schema";
import { startPfad } from "../../_lib/helferBereich";
import { requireHelferSitzung } from "../../_lib/helferZugang";
import { checklisteFuer } from "../../_lib/maengel/checkliste";
import { meldeOrt, meldeOrte } from "../../_lib/maengel/daten";
import { einWert } from "../../_lib/suchparameter";
import { sitzungsEtikett } from "../../_lib/zugangHerkunft";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { LeerZustand } from "../../_ui/LeerZustand";
import { MangelFormular } from "../../_ui/MangelFormular";
import { Ikone } from "../../_ui/ikonen";
import s from "../../_ui/helfer.module.css";

export const dynamic = "force-dynamic";

export default async function MangelSeite({
  searchParams,
}: {
  searchParams?: Promise<{ ort?: string | string[]; wahl?: string | string[] }>;
} = {}) {
  const roh = (await searchParams) ?? {};
  const db = getDb();
  const zugang = await requireHelferSitzung(db);
  const etikett = sitzungsEtikett(zugang);
  const rahmen = { reichweite: zugang.reichweite, sitzungsetikett: etikett, laeuftAb: zugang.laeuftAb };
  const rueckweg = { href: startPfad(zugang.reichweite, zugang.fahrzeugBindung), text: "Zurück" };

  const kartenOrt = zugang.herkunft === "token"
    ? db.select({ ortId: tokens.ortId }).from(tokens).where(eq(tokens.id, zugang.tokenId)).get()?.ortId ?? null
    : null;
  const orte = meldeOrte(db);
  const wahl = einWert(roh.wahl) === "1";
  const ort = wahl
    ? null
    : meldeOrt(db, einWert(roh.ort)) ?? meldeOrt(db, kartenOrt) ?? meldeOrt(db, zugang.fahrzeugBindung);

  if (orte.length === 0) {
    return (
      <HelferRahmen aktiv="mangel" {...rahmen}>
        <LeerZustand
          titel="Kein Ort angelegt"
          text="Die Verwaltung muss zuerst Lagerorte oder Fahrzeuge pflegen."
          weg={rueckweg}
        />
      </HelferRahmen>
    );
  }

  if (!ort) {
    return (
      <HelferRahmen aktiv="mangel" {...rahmen}>
        <div className={s.lesebahn}>
          <div className={s.schirmKopf}>Mangel melden — wo?</div>
          <p className={s.fussnote} style={{ margin: "0 2px 10px" }}>
            Am schnellsten geht es über das Ortsetikett am Schrank oder Fahrzeug. Oder hier wählen:
          </p>
          <div className={s.karte} data-rolle="mangel-ortswahl">
            {orte.map((o) => (
              <Link key={o.id} className={`${s.zeile} ${s.zeileWahl}`} href={`/helfer/mangel?ort=${encodeURIComponent(o.id)}`}>
                <Ikone name={o.art === "schrank" ? "handlager-griff" : o.art === "tasche" ? "tasche" : "fahrzeug"} groesse={18} />
                <span className={s.zeileHaupt}>{o.anzeige}</span>
                <Ikone name="chevron-rechts" groesse={16} />
              </Link>
            ))}
          </div>
        </div>
      </HelferRahmen>
    );
  }

  return (
    <HelferRahmen aktiv="mangel" {...rahmen} mangelOrt={ort.id}>
      <MangelFormular
        key={ort.id}
        ortId={ort.id}
        ortAnzeige={ort.anzeige}
        punkte={checklisteFuer(ort.art)}
        andererOrt={orte.length > 1 ? "/helfer/mangel?wahl=1" : null}
        rueckweg={rueckweg}
      />
    </HelferRahmen>
  );
}
