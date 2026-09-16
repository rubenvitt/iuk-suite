"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { zugangsKennung } from "../_lib/zugangHerkunft";
import { istAktivesFahrzeug } from "../_lib/lesepfade/fahrzeuge";
import { helferCookieOptionen, helferGueltigkeitSekunden } from "../_lib/helferSitzung";
import { ZIEL_COOKIE, wahlAusWert, zielWert } from "../_lib/entnahmeZiel";
import { sanitizeReturnTo } from "../_lib/returnTo";
import { gateGrundFuerSperre } from "../_lib/gateTexte";

/**
 * DIE ZIELWAHL AM REGAL — DRK-300.
 *
 * ⚠️ SIE IST EINE SERVER ACTION UND KEIN LINK, und der Grund ist bindend: eine
 * Server Component kann kein Cookie setzen (`cookies()` ist dort versiegelt,
 * `helfer/layout.tsx` schreibt denselben Befund aus). Ein GET-Route-Handler
 * ginge auch — er wäre aber ein zustandsändernder GET, den jeder Vorschau-Crawler
 * und jeder Link-Prefetch auslösen kann.
 *
 * ⚠️ `requireHelferSchreibend` IST DER RICHTIGE RIEGEL, nicht der lesende. Wer
 * nicht buchen darf, braucht auch kein Ziel zu setzen — und eine Server Action
 * ist ein EIGENER Einstiegspunkt mit global aufrufbarer Kennung, ganz gleich,
 * welche Seite sie eingebaut hat. Er steht als ERSTE Anweisung; der Guard-Scan
 * (`_actions/guards.test.ts`) akzeptiert genau diese Form.
 *
 * ⚠️ SIE ANTWORTET NICHT, SIE LEITET UM. Ein `HelferErgebnis` wäre hier
 * wirkungslos: das Formular ist eine Server Component ohne Insel, es gibt
 * niemanden, der eine Rückmeldung anzeigte. Der Weg zurück IST die Antwort —
 * und was gewählt wurde, steht danach auf der Artikelseite über dem Knopf.
 */
export async function waehleEntnahmeZiel(eingabe: FormData, db: DB = getDb()): Promise<void> {
  const riegel = await requireHelferSchreibend(db);
  const zurueck = sanitizeReturnTo(zeichenkette(eingabe.get("returnTo"))) ?? "/helfer";

  /*
   * Zurück aufs Gate, nicht auf die Artikelseite: dort käme die Person mit
   * einer abgelaufenen oder gesperrten Sitzung nicht weiter.
   *
   * ⚠️ MIT `returnTo` UND MIT `grund` (Review-Befunde P2 zu PR #140). Ohne den
   * Rückweg landet die Person nach dem erneuten Einlösen dort, wohin ihr
   * KÄRTCHEN zeigt — und steht mit dem gescannten Etikett in der Hand vor der
   * Artikelliste. Ohne den Grund sieht sie eine gewöhnliche Code-Eingabe ohne
   * jede Erklärung: das Gate zeigt seinen Satz NUR, wenn `grund` gesetzt ist
   * (`_lib/gateTexte.ts`, `page.tsx`). Beides zusammen macht den Satz oben wahr.
   *
   * ⚠️ DRK-305 — UND DER SATZ HAENGT AN DER HERKUNFT. Fuer eine angemeldete
   * Person ist „scanne das Kaertchen erneut" eine Aufforderung ins Leere; sie
   * bekommt „melde dich erneut an". Der Weg dorthin steht auf demselben Gate:
   * die Karte „Mit Pocket ID anmelden" baut ihren `callbackUrl` aus genau dem
   * `returnTo`, das hier mitgeht — sie landet also wieder in der Zielwahl.
   */
  if (!riegel.ok) {
    /*
     * ⚠️ DIE HERKUNFT KOMMT AUS DEM FORMULAR, UND SIE MUSS ES (DRK-305).
     *
     * An dieser Stelle ist der Riegel bereits GEFALLEN — es gibt keinen Zugang
     * mehr, den man fragen koennte, und serverseitig ist ein abgelaufenes
     * Auth.js-Cookie von „war nie angemeldet" nicht zu trennen. Wer es WEISS,
     * ist die Seite: sie hat mit der Herkunft gerendert und legt sie ins
     * Formular, genau wie `returnTo` daneben.
     *
     * ⚠️ DASS DAS FELD VON AUSSEN SETZBAR IST, TRAEGT HIER NICHTS: es
     * entscheidet ausschliesslich, WELCHER SATZ auf dem Gate steht. Das Ziel
     * ist in beiden Faellen dasselbe, das Gate bietet beide Wege an, und
     * gewaehrt wird dadurch nichts — wer das Feld faelscht, liest auf dem
     * eigenen Schirm einen leicht falschen Satz. Anders als `returnTo`, das
     * eine Weiterleitung steuert und deshalb `sanitizeReturnTo` braucht.
     */
    const grund = gateGrundFuerSperre(riegel.grund, zeichenkette(eingabe.get("herkunft")) === "konto");
    redirect(`/?grund=${grund}&returnTo=${encodeURIComponent(zurueck)}`);
  }

  // Das FORMULAR trägt die nackte Wahl; die Bindung ans Kärtchen entsteht erst
  // beim Schreiben des Cookies — sie ist eine Aussage des Servers, nicht des
  // Clients über sich selbst.
  const ziel = wahlAusWert(zeichenkette(eingabe.get("ziel")));

  /*
   * Das Handlager wird hier MITGEPRÜFT, obwohl es existiert und aktiv ist: eine
   * Prüfung, die nur auf „unbekannt" testet, ließe es durch, und die Buchung
   * legte Material vom Handlager ins Handlager.
   */
  const taugt = ziel !== null && (ziel.art === "verbrauch" || istAktivesFahrzeug(db, ziel.lagerortId));
  const kekse = await cookies();

  /*
   * ⚠️ EIN UNTAUGLICHES ZIEL LÖSCHT DIE ALTE WAHL (Review-Befund P2 zu PR #140).
   *
   * Der Fall entsteht, wenn die Verwaltung ein Fahrzeug stilllegt, während
   * jemand davor steht: die Person hatte A gewählt, tippt nun auf B, und B ist
   * weg. Bliebe A einfach stehen, führte der Rückweg auf die Artikelseite mit
   * BEDIENBAREM Knopf und dem Ziel A — während die letzte Handlung B war. Das
   * ist die wahrscheinlichste Fehlbuchung, die dieser Ablauf erzeugen kann, und
   * sie wäre still. „Nichts gewählt" ist der ehrliche Zustand, und der Weg führt
   * zurück zur Wahl statt zum Artikel.
   *
   * ⚠️ GELÖSCHT WIRD MIT `helferCookieOptionen(0)`, NICHT mit `delete(name)` —
   * dieselbe Begründung, die `_actions/sitzung.ts` für die Sitzung ausschreibt:
   * Nexts `delete(name)` setzt ein leeres Cookie OHNE `path`, der Browser scopet
   * es auf das aktuelle Verzeichnis, und das gesetzte Cookie mit `path: /`
   * überlebt. Die Löschung wäre wirkungslos, und zwar still.
   */
  if (!taugt) {
    kekse.set(ZIEL_COOKIE, "", helferCookieOptionen(0));
    redirect(`/helfer/ziel?returnTo=${encodeURIComponent(zurueck)}`);
  }

  // Die Zugangskennung wandert IN den Wert: die Wahl gehört ihrer Schicht —
  // beim Kärtchen dessen Zeilen-Id, beim angemeldeten Konto der OIDC-`sub`
  // (DRK-305). Ein geteiltes Telefon bucht so nicht auf das Ziel der vorigen.
  kekse.set(
    ZIEL_COOKIE,
    zielWert(ziel!, zugangsKennung(riegel.zugang)),
    helferCookieOptionen(helferGueltigkeitSekunden()),
  );
  redirect(zurueck);
}

/** `FormData.get` liefert auch `File`; nur eine Zeichenkette ist brauchbar. */
function zeichenkette(wert: FormDataEntryValue | null): string | null {
  return typeof wert === "string" ? wert : null;
}
