import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../../_lib/host";
import { viewerOderNull, istLagerbuchAdmin } from "../../_lib/zugang";
import { helferZugangOderNull } from "../../_lib/helferZugang";
import { artikelDetailHelfer } from "../../_lib/lesepfade/artikel";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { Entnahme } from "../../_ui/Entnahme";
import { LeerZustand } from "../../_ui/LeerZustand";
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
 *   1. Helfer-Sitzung vorhanden   → RENDERN (`HelferRahmen` + `Entnahme`)
 *   2. keine Sitzung, aber Admin  → `redirect("/verwaltung/artikel?a=<id>")`
 *   3. weder noch                 → `redirect("/?returnTo=/a/<id>")`
 *
 * Die Reihenfolge ist bindend, und die erste Frage ist die nach der
 * HELFER-Sitzung: `hasHelfer || isAdmin` kurzschliesst, sonst muesste ein Admin
 * am Regal das Kaertchen beiseitelegen, um entnehmen zu koennen.
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
 * ⚠️ Der Admin-Zweig fragt `istLagerbuchAdmin(await viewerOderNull())`, NICHT
 * `requireLagerbuchAdmin()` (§3.2.1): der DRITTE Fall ist „keine Sitzung → Gate
 * mit returnTo", und ein Riegel schickte ihn nach `/login` — also genau die
 * Helferin, fuer die diese Seite gebaut ist (§11.5 Zustand 18).
 *
 * ⚠️ UND WEIL DER ADMIN-ZWEIG NICHT RENDERT, sondern umleitet, duerfen
 * `sitzungsetikett` und `laeuftAb` am `HelferRahmen` PFLICHT-Props sein
 * (§7.8.2). Wer diese Weiche umbaut, muss die Prop-Signatur mit umbauen.
 *
 * ⚠️ DIESE SEITE LOEST IHREN ZUGANG SELBST AUF. Ein LAYOUT kann einer Seite
 * keine Props reichen — deshalb steht `helferZugangOderNull(getDb())` hier und
 * nicht eine Ebene hoeher (`_ui/HelferRahmen.tsx:28-34`, N-11).
 *
 * ⚠️ `/a/<id>` bleibt in der Cordon-Allowlist und bleibt SCHLEIFENFREI, weil
 * die Weiche hier Admins selbst in die Verwaltung leitet (`cordon.ts:44-46`) —
 * so ueberlebt ein gescanntes Regaletikett den Umweg ueber Pocket ID.
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

  const zugang = await helferZugangOderNull(db);

  if (!zugang) {
    /*
     * AUSGANG 2 — der Admin RENDERT NICHT, er wird umgeleitet. AEUSSERE Pfade
     * (§2.1 g): der Browser steht auf dem Modul-Host, `decideRoute`
     * praefixiert danach; ein innerer `/m/lagerbuch/...` wuerde doppelt
     * praefixiert.
     *
     * `encodeURIComponent` ist hier KEIN Schmuck: ohne sie stuende bei einer ID
     * mit `&` ein ZWEITER Suchparameter in der URL, und die Verwaltungsseite
     * bekaeme die Artikel-ID nie vollstaendig zu sehen.
     */
    if (istLagerbuchAdmin(await viewerOderNull())) {
      redirect(`/verwaltung/artikel?a=${encodeURIComponent(artikelId)}`);
    }
    /*
     * AUSGANG 3 — Gate MIT returnTo. Ohne das `returnTo` liefe der Deep-Link
     * nach dem Einloesen des Kaertchens ins Leere, und die Person stuende mit
     * dem gescannten Etikett in der Hand vor der Artikelsuche.
     */
    redirect(`/?returnTo=${encodeURIComponent(`/a/${artikelId}`)}`);
  }

  // `code` und `label` kommen aus der DB-ZEILE, nicht aus dem Cookie (§3.4.4):
  // dort sind sie AKTUELL, waehrend ein Cookie sie zwoelf Stunden einfriert.
  const etikett = `Zugang: Token ${zugang.code} · ${zugang.label}`;
  const detail = artikelDetailHelfer(db, artikelId);

  return (
    <HelferRahmen aktiv="entnahme" sitzungsetikett={etikett} laeuftAb={zugang.laeuftAb}>
      {detail ? (
        // Die Action kommt als PROP in die Insel — `_ui/Entnahme.tsx` importiert
        // sie NICHT selbst (T78). Dies ist die EINE Stelle, die die
        // Reihenfolge zu Teil 5 kennt.
        <Entnahme detail={detail} buchen={bucheEntnahmeHelfer} />
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
