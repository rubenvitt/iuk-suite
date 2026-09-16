import Link from "next/link";
import { requireLagerbuchAdmin } from "../_lib/zugang";
import { kontoZugangAus } from "../_lib/helferZugang";
import { sitzungsEtikett } from "../_lib/zugangHerkunft";
import { artikelListe } from "../_lib/lesepfade/artikel";
import { boxInhalt, boxOrt } from "../_lib/lesepfade/entnahmebox";
import { getDb } from "../_db/client";
import { AuffuellRahmen } from "../_ui/AuffuellRahmen";
import { ArtikelSuche } from "../_ui/ArtikelSuche";
import { Ikone } from "../_ui/ikonen";
import s from "../_ui/helfer.module.css";

/**
 * DIE ARTIKELLISTE DER AUFFUELLANSICHT — DRK-313.
 *
 * Dieselbe Liste und dieselbe Suche wie unter `/helfer`, nur mit dem anderen
 * Ziel je Zeile (`basis="/auffuellen"`). Sie ist NICHT nachgebaut: eine zweite
 * Fassung braeuchte eine zweite Faltung, und zwei Faltungen an zwei Orten sind
 * der Ort, an dem sie auseinanderlaufen (Kopf von `_ui/ArtikelSuche.tsx`).
 *
 * ⚠️ ZWEI WEGE VON HIER AUS, UND SIE SIND NICHT DERSELBE VORGANG (DRK-381):
 * die Artikelliste fuehrt zum WARENEINGANG (eine Lieferung kommt an), die
 * Zeile darueber in die Entnahmebox, also zum UMRAEUMEN (Material, das schon
 * im Buch steht, wandert an seinen Platz). Sie stehen zusammen, weil beide
 * Handgriffe „ins Handlager" heissen und dieselbe Person sie macht; sie
 * tragen verschiedene Worte, weil ein verwechselter Vorgang dieselben Teile
 * ein zweites Mal ins append-only-Journal schreibt.
 *
 * ⚠️ DER RIEGEL STEHT HIER NOCH EINMAL, obwohl `layout.tsx` ihn traegt. Das ist
 * kein Misstrauen: ein Layout kann einer Seite keine Props reichen, und das
 * Kopf-Etikett kommt aus dem Viewer, den dieser Aufruf zurueckgibt. Er ist
 * billig — `auth()` ist innerhalb einer Anfrage gecacht.
 */
export const dynamic = "force-dynamic";

export default async function AuffuellenSeite() {
  const viewer = await requireLagerbuchAdmin();
  const db = getDb();

  /*
   * NUR die fuenf Anzeigefelder — dieselbe Begrenzung wie unter `/helfer`:
   * `artikelListe` traegt serverseitig mehr (mindestbestand, unterMindest,
   * chargeKritisch, naechsteCharge …), und alles davon landete sonst im
   * RSC-Payload, ohne dass die Seite es zeigt.
   *
   * OHNE `inklInaktiv`: das Ausblenden inaktiver Artikel liegt im Lesepfad.
   * Ein zweiter Filter hier waere eine zweite Wahrheit ueber dieselbe Frage.
   */
  const artikel = artikelListe(db).map((a) => ({
    id: a.id, name: a.name, einheit: a.einheit, fach: a.fach, bestand: a.bestand,
  }));

  /*
   * DER EINSTIEG IN DIE KISTE — DRK-381.
   *
   * ⚠️ NUR DIE ZAHL, NICHT DER INHALT. `boxInhalt` faltet den ganzen Bestand
   * der Kiste samt Chargen; davon geht hier ausschliesslich `length` in den
   * Payload. Alles andere zeigt die Flaeche dahinter, und dorthin gehoert es
   * auch — dieselbe Begrenzung wie bei der Artikelliste darueber.
   *
   * ⚠️ DIE ZEILE STEHT NUR DA, WENN ETWAS DRIN LIEGT. Ein dauerhafter Einstieg
   * mit „0 Posten" waere ein Weg, der in einen Leerzustand fuehrt, und zwar auf
   * der Flaeche, die am haeufigsten benutzt wird. Fehlt die Kiste ganz
   * (`boxOrt === null`), gilt dasselbe: davon erfaehrt man in der Verwaltung,
   * nicht hier.
   */
  const inKiste = boxOrt(db) === null ? 0 : boxInhalt(db).length;

  return (
    <AuffuellRahmen etikett={sitzungsEtikett(kontoZugangAus(viewer))}>
      {inKiste > 0 && (
        <div className={s.karte}>
          {/*
            ⚠️ DER TEXT SAGT „EINRAEUMEN", NICHT „AUFFUELLEN", und er nennt die
            Herkunft. Beides traegt die Abgrenzung, um die es im ganzen Ticket
            geht: aus der Kiste kommt nichts NEU an, es wird nur umgeraeumt.
          */}
          <Link className={`${s.zeile} ${s.zeileKnopf}`} href="/auffuellen/box" data-rolle="kisten-einstieg">
            <div className={s.zeileHaupt}>
              <div className={s.zeileName}>Aus der Entnahmebox einräumen</div>
              <div className={s.zeileMeta}>
                Material aus Fahrzeugen und Taschen zurück ins Handlager — umgeräumt,
                nicht neu angenommen
              </div>
            </div>
            <div className={s.mengenChip}>
              {inKiste}
              <small>Artikel</small>
            </div>
            <Ikone name="chevron-rechts" groesse={15} />
          </Link>
        </div>
      )}

      <div className={s.schirmKopf}>Artikel wählen</div>
      {/*
        DER SATZ SAGT DIE RICHTUNG, und er steht hier, weil die Flaeche darunter
        der Entnahme zum Verwechseln aehnlich sieht — das ist Absicht (der
        vertraute Ablauf war die Anforderung) und genau deshalb die Gefahr.
      */}
      <p className={s.fussnote} data-rolle="auffuellen-hinweis">
        Hier kommt Material ins Handlager. Material heraus buchst du unter „Entnahme“.
      </p>
      <ArtikelSuche artikel={artikel} basis="/auffuellen" />
    </AuffuellRahmen>
  );
}
