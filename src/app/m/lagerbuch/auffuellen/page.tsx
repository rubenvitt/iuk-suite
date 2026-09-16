import { requireLagerbuchAdmin } from "../_lib/zugang";
import { kontoZugangAus } from "../_lib/helferZugang";
import { sitzungsEtikett } from "../_lib/zugangHerkunft";
import { artikelListe } from "../_lib/lesepfade/artikel";
import { getDb } from "../_db/client";
import { AuffuellRahmen } from "../_ui/AuffuellRahmen";
import { ArtikelSuche } from "../_ui/ArtikelSuche";
import s from "../_ui/helfer.module.css";

/**
 * DIE ARTIKELLISTE DER AUFFUELLANSICHT — DRK-313.
 *
 * Dieselbe Liste und dieselbe Suche wie unter `/helfer`, nur mit dem anderen
 * Ziel je Zeile (`basis="/auffuellen"`). Sie ist NICHT nachgebaut: eine zweite
 * Fassung braeuchte eine zweite Faltung, und zwei Faltungen an zwei Orten sind
 * der Ort, an dem sie auseinanderlaufen (Kopf von `_ui/ArtikelSuche.tsx`).
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

  return (
    <AuffuellRahmen etikett={sitzungsEtikett(kontoZugangAus(viewer))}>
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
