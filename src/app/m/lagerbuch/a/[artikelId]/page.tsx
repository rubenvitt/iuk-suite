import Link from "next/link";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../../_lib/host";
import { helferZugangOderNull, kontoZugangOderNull } from "../../_lib/helferZugang";
import { sitzungsEtikett, zugangsKennung } from "../../_lib/zugangHerkunft";
import { artikelDetailHelfer } from "../../_lib/lesepfade/artikel";
import { gemerktesZiel } from "../../_lib/lesepfade/entnahmeZiel";
import { ZIEL_COOKIE } from "../../_lib/entnahmeZiel";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { Entnahme } from "../../_ui/Entnahme";
import { LeerZustand } from "../../_ui/LeerZustand";
import s from "../../_ui/helfer.module.css";
// ⚠️ DIE EINE REIHENFOLGEBINDUNG DIESES PLANS NACH AUSSEN: `_actions/buchung.ts`
// gehoert vollstaendig Teil 5 (Festlegung H7). Teil 5s T114 wird VORGEZOGEN —
// sie haengt nur an Teil 2 (`requireHelferSchreibend`) und Teil 3
// (`fefoAbbuchung`, `umlagerung`) und hat KEINE Teil-4-Abhaengigkeit. Das ist
// eine Ablaufanweisung, kein Dateianspruch; eine zweite `_actions/buchung.ts`
// entsteht NICHT.
import { bucheEntnahmeHelfer } from "../../_actions/buchung";

/**
 * DER REGALETIKETT-DEEP-LINK — §7.4.3.
 *
 * DIE ROLLEN-WEICHE HAT DREI AUSGAENGE (`cordon.ts:61`:
 * `allowed = isA ? hasHelfer || isAdmin : hasHelfer`):
 *
 *   1. Kaertchen-Sitzung vorhanden → RENDERN (`HelferRahmen` + `Entnahme`)
 *   2. kein Kaertchen, aber Konto  → RENDERN, plus Weg in die Verwaltung
 *   3. weder noch                  → `redirect("/?returnTo=/a/<id>")`
 *
 * Die Reihenfolge ist bindend, und die erste Frage ist die nach dem KAERTCHEN:
 * sonst muesste ein Admin am Regal das Kaertchen beiseitelegen, um entnehmen zu
 * koennen.
 *
 * ⚠️ AUSGANG 2 HAT SICH MIT DRK-305 UMGEDREHT, und der Anlass war ein Defekt,
 * kein Geschmack. Bis dahin leitete er in die Verwaltung um — richtig, solange
 * eine angemeldete Person im Helfer-Ast ueberhaupt nichts zu suchen hatte. Seit
 * DRK-305 hat sie dort etwas zu suchen, und die Umleitung machte den neuen
 * Einstieg „Bestand → Entnahme“ nach genau einem Klick unbrauchbar: die
 * Artikelliste unter `/helfer` verlinkt JEDE Zeile hierher, und die Zielwahl
 * (Schrank → Fahrzeug) haengt am gerenderten Zweig. Gefunden hat das die
 * Codex-Review zu PR #164 — kein Tor sah es, weil beide Seiten je fuer sich
 * antworteten.
 *
 * ⚠️ VERLOREN GEHT DABEI NICHTS: der Weg in die Verwaltung steht jetzt als
 * LINK auf der Seite statt als Umleitung davor. Ein Regaletikett ist ein
 * Regal-Gegenstand, die Entnahme also die naheliegendere Handlung; wer das
 * Artikelblatt will, ist einen Klick entfernt statt null. Wer die Umleitung
 * zurueckholt, macht den Entnahme-Einstieg wieder kaputt — und zwar still.
 *
 * ⚠️ VORLAGE FUER `g/[code]/page.tsx` (Teil 6, T164) — ABER NICHT 1:1. E1
 * verspricht, dass Teil 6 diese Weiche nicht neu herleiten muss; §6 loest das
 * nicht ein (Preflight-Scan, Befund 27), deshalb steht sie hier. DER
 * FACHLICHE UNTERSCHIED: `/g/<code>` ist ein BARCODE-Nachschlag und leitet in
 * ALLEN Trefferfaellen weiter — mit Helfer-Sitzung nach `/a/<id>` bzw.
 * `/helfer`, als Admin in die Verwaltung, sonst aufs Gate. `/a/<id>` RENDERT im
 * ersten Fall; nur die Ausgaenge 2 und 3 sind deckungsgleich. Wer `/g` aus
 * dieser Datei ableitet, uebernimmt die Ausgaenge, nicht den Renderzweig.
 *
 * ⚠️ DER KONTO-ZWEIG IST EIN PRAEDIKAT, KEIN RIEGEL (§3.2.1):
 * `kontoZugangOderNull` liefert `null` statt zu werfen. Der DRITTE Fall ist
 * „keine Sitzung → Gate mit returnTo“, und ein Riegel schickte ihn nach
 * `/login` — also genau die Helferin, fuer die diese Seite gebaut ist
 * (§11.5 Zustand 18).
 *
 * ⚠️ BEIDE GERENDERTEN ZWEIGE LIEFERN JETZT `sitzungsetikett` UND `laeuftAb`.
 * Die Pflicht-Props am `HelferRahmen` bleiben damit Pflicht — `laeuftAb` ist im
 * Konto-Fall `null`, und das ist dort der Wert, nicht ein fehlender Wert
 * (§7.8.2, `_ui/HelferRahmen.tsx`).
 *
 * ⚠️ DIESE SEITE LOEST IHREN ZUGANG SELBST AUF. Ein LAYOUT kann einer Seite
 * keine Props reichen — deshalb steht `helferZugangOderNull(getDb())` hier und
 * nicht eine Ebene hoeher (`_ui/HelferRahmen.tsx:28-34`, N-11).
 *
 * ⚠️ `/a/<id>` bleibt in der Cordon-Allowlist und bleibt SCHLEIFENFREI — die
 * Weiche hier leitet eine angemeldete Person NIRGENDWOHIN mehr um, sie rendert.
 * Damit ueberlebt ein gescanntes Regaletikett den Umweg ueber Pocket ID erst
 * recht (`_lib/zugang.ts`, `adminLandingPfad`).
 */
export const dynamic = "force-dynamic";

export default async function ArtikelDeepLink({
  params,
}: {
  params: Promise<{ artikelId: string }>;
}) {
  requireLagerbuchHost(await headers()); // §2.6 — erste Anweisung
  const { artikelId } = await params;
  const db = getDb();

  /*
   * AUSGANG 1 VOR AUSGANG 2 — das Kaertchen zuerst. Dieselbe Reihenfolge wie in
   * den beiden werfenden Riegeln (`_lib/helferZugang.ts`): wer ein Kaertchen
   * eingeloest hat, behaelt dessen Kontext, auch wenn er nebenbei angemeldet
   * ist.
   */
  const zugang = (await helferZugangOderNull(db)) ?? (await kontoZugangOderNull(db));

  if (!zugang) {
    /*
     * AUSGANG 3 — Gate MIT returnTo. Ohne das `returnTo` liefe der Deep-Link
     * nach dem Einloesen des Kaertchens ins Leere, und die Person stuende mit
     * dem gescannten Etikett in der Hand vor der Artikelsuche.
     *
     * AEUSSERER Pfad (§2.1 g): der Browser steht auf dem Modul-Host,
     * `decideRoute` praefixiert danach; ein innerer `/m/lagerbuch/...` wuerde
     * doppelt praefixiert.
     */
    redirect(`/?returnTo=${encodeURIComponent(`/a/${artikelId}`)}`);
  }

  // Beim Kaertchen kommen `code` und `label` aus der DB-ZEILE, nicht aus dem
  // Cookie (§3.4.4): dort sind sie AKTUELL, waehrend ein Cookie sie zwoelf
  // Stunden einfriert. Beim Konto steht der Name der Person da.
  const etikett = sitzungsEtikett(zugang);
  const detail = artikelDetailHelfer(db, artikelId);

  /*
   * DAS GEMERKTE ZIEL — DRK-300. Es wird bei JEDEM Aufruf neu gegen die
   * Datenbank aufgelöst, nicht nur beim Wählen: das Cookie hält für den ganzen
   * Kärtchen-Zugang, und die Verwaltung kann in derselben Zeit ein Fahrzeug
   * stilllegen. `gemerktesZiel` macht daraus wieder „noch nichts gewählt" —
   * NICHT „Verbrauch" —, und die Insel sperrt dann den Buchen-Knopf.
   *
   * ⚠️ MIT DER ZUGANGSKENNUNG: die Wahl gehört ihrem Kärtchen — beim
   * angemeldeten Konto der Person (DRK-305). Auf einem geteilten
   * Telefon buchte die nächste Schicht sonst auf das Fahrzeug der vorigen, ohne
   * je gewählt zu haben (Review-Befund P1 zu PR #140).
   */
  const ziel = gemerktesZiel(db, (await cookies()).get(ZIEL_COOKIE)?.value, zugangsKennung(zugang));

  return (
    <HelferRahmen aktiv="entnahme" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      {/*
        DER WEG INS ARTIKELBLATT — DRK-305, und er ersetzt die frühere Umleitung
        (siehe den Kopf dieser Datei). Nur für das angemeldete Konto: wer mit
        einem Kärtchen hier steht, hat dort keinen Zutritt und sähe einen Link,
        der ihn auf eine 404 führt.
      */}
      {zugang.herkunft === "konto" && (
        <p className={s.fussnote}>
          <Link href={`/verwaltung/artikel?a=${encodeURIComponent(artikelId)}`}>
            In der Verwaltung öffnen
          </Link>
        </p>
      )}
      {detail ? (
        // Die Action kommt als PROP in die Insel — `_ui/Entnahme.tsx` importiert
        // sie NICHT selbst (T78). Dies ist die EINE Stelle, die die
        // Reihenfolge zu Teil 5 kennt.
        <Entnahme detail={detail} ziel={ziel} buchen={bucheEntnahmeHelfer} />
      ) : (
        /*
         * KEIN wortloser `redirect("/helfer")` wie im Bestand
         * (`a/[artikelId]/page.tsx:23`) und KEINE Suite-404: danach weiss die
         * Person nicht, ob sie falsch gescannt hat oder ob das Etikett veraltet
         * ist (Entscheidung 8-C, 36 a). HTTP 200 mit einem Satz, der es sagt —
         * IM Rahmen, damit die Tab-Leiste erreichbar bleibt.
         */
        <LeerZustand
          titel="Dieses Etikett kennt kein Artikel"
          text={
            "Der Artikel wurde gelöscht oder das Etikett stammt aus einer anderen Anwendung. " +
            "Bitte der Verwaltung melden — der Bestand ist davon nicht betroffen."
          }
          weg={{ href: "/helfer", text: "Artikel suchen" }}
        />
      )}
    </HelferRahmen>
  );
}
