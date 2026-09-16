import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireLagerbuchHost } from "../../_lib/host";
import { helferZugangOderNull, kontoZugangOderNull } from "../../_lib/helferZugang";
import { ortZielPfad } from "../../_lib/ortZiel";
import { etikettOrt } from "../../_lib/lesepfade/ortEtiketten";
import { getDb } from "../../_db/client";

/**
 * DER ORTSETIKETT-DEEP-LINK — DRK-312. Aeusserer Pfad: /o/<id>.
 *
 * Er ist der Einstieg, den das Ticket beauftragt: EIN QR am Handlager bzw. an
 * der Einheit statt einer je Produkt. Gescannt wird er von jemandem, der mit
 * dem Gegenstand vor sich steht.
 *
 * DIE ROLLEN-WEICHE HAT DREI AUSGAENGE, und sie sind ZEICHENGLEICH zu denen der
 * Regaletikett-Weiche (`a/[artikelId]/page.tsx`):
 *
 *   1. Kaertchen-Sitzung vorhanden → in den Kontext des Orts
 *   2. kein Kaertchen, aber Konto  → in denselben Kontext
 *   3. weder noch                  → `redirect("/?returnTo=/o/<id>")`
 *
 * Die Reihenfolge ist bindend, und die erste Frage ist die nach dem KAERTCHEN:
 * sonst muesste jemand mit Konto UND Kaertchen am Fahrzeug das Kaertchen
 * beiseitelegen.
 *
 * ⚠️ AUSGANG 1 UND 2 FUEHREN AN DIESELBE STELLE, und das ist eine Entscheidung
 * gegen die naheliegende Alternative „Admins in die Verwaltung" (so macht es
 * `g/[code]`). Der Grund ist derselbe, aus dem DRK-305 die Umleitung bei
 * `/a/<id>` umgedreht hat: ein Etikett am Fahrzeug ist ein Fahrzeug-Gegenstand,
 * und wer davorsteht, will den Check — nicht das Verwaltungsblatt. Wer das
 * Blatt will, ist ueber die Navigation einen Klick entfernt statt null. Wer die
 * Rollenverzweigung nachtraeglich einbaut, macht den Einstieg fuer genau die
 * Personen kaputt, die beides haben.
 *
 * ⚠️ DIESE SEITE RENDERT NICHTS, SIE LEITET NUR. Deshalb steht hier kein
 * `HelferRahmen` und kein antd — im Unterschied zu `/a/<id>`, das im ersten
 * Fall rendert. Ein eigener Zwischenschirm („Sie haben RTW 1 gescannt, weiter?")
 * waere ein Klick, den niemand bestellt hat: das Ziel steht bereits auf dem
 * Etikett in der Hand.
 *
 * ⚠️ DER ORT WIRD SERVERSEITIG AUS DER DATENBANK AUFGELOEST, nie aus dem
 * URL-Parameter geschlossen (CLAUDE.md, „Zugriffsschutz"). Das ist hier kein
 * IDOR-Schutz — `/o/<id>` gibt nichts preis —, sondern die Bedingung dafuer,
 * dass der ZIELPFAD stimmt: aus einer blossen Id laesst sich `typ` nicht lesen,
 * und ein geratenes `/helfer/check?fz=<id>` fuer einen Lagerort ergaebe eine
 * Fahrzeugwahl, in der dieser Ort nicht vorkommt.
 *
 * ⚠️ EIN UNBEKANNTER ODER STILLGELEGTER ORT FUEHRT AUF `/helfer`, NICHT AUF
 * EINE 404. Der Fall ist real und gutartig: ein Fahrzeug wird ausgemustert, das
 * laminierte Kaertchen haengt noch dran. Eine 404 liesse die Person mit dem
 * Etikett in der Hand stehen; die Artikelliste ist der Ort, an dem sie
 * weiterkommt. Dieselbe Toleranz haelt `helfer/check/page.tsx` fuer ein `?fz=`
 * auf eine stillgelegte Zeile.
 *
 * ⚠️ KEIN antd UND KEIN ICON. Diese Datei liegt im oeffentlichen Ast, den
 * `_lib/bauform.test.ts` antd-frei haelt (Fallen 1 und 7). Sie braucht ohnehin
 * nichts davon.
 *
 * ⚠️ `/o/<id>` STEHT IN DER CORDON-ALLOWLIST (`_lib/zugang.ts`,
 * `adminLandingPfad`) und ist SCHLEIFENFREI: die Weiche leitet eine angemeldete
 * Person in den Helfer-Ast, nie zurueck aufs Gate. Ohne den Eintrag verloere ein
 * gescanntes Etikett sein Ziel beim Umweg ueber Pocket ID und landete wortlos
 * in der Uebersicht.
 */
export const dynamic = "force-dynamic";

export default async function OrtDeepLink({
  params,
}: {
  params: Promise<{ ortId: string }>;
}) {
  requireLagerbuchHost(await headers());   // §2.6 — erste Anweisung
  const { ortId } = await params;
  const db = getDb();

  /*
   * AUSGANG 1 VOR AUSGANG 2 — das Kaertchen zuerst. Dieselbe Reihenfolge wie in
   * den beiden werfenden Riegeln (`_lib/helferZugang.ts`) und wie bei `/a/<id>`.
   */
  const zugang = (await helferZugangOderNull(db)) ?? (await kontoZugangOderNull(db));

  if (!zugang) {
    /*
     * AUSGANG 3 — Gate MIT returnTo, in AEUSSERER Pfadform (§2.1 g): der Browser
     * steht auf dem Modul-Host, `decideRoute` praefixiert danach.
     */
    redirect(`/?returnTo=${encodeURIComponent(`/o/${ortId}`)}`);
  }

  const ort = etikettOrt(db, ortId);
  redirect(ort ? ortZielPfad(ort) : "/helfer");
}
