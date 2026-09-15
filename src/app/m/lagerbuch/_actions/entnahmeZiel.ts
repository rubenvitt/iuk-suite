"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { istAktivesFahrzeug } from "../_lib/lesepfade/fahrzeuge";
import { helferCookieOptionen, helferGueltigkeitSekunden } from "../_lib/helferSitzung";
import { ZIEL_COOKIE, wahlAusWert, zielWert } from "../_lib/entnahmeZiel";
import { sanitizeReturnTo } from "../_lib/returnTo";

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
   * einer abgelaufenen oder gesperrten Sitzung nicht weiter und wüsste nicht,
   * warum.
   *
   * ⚠️ MIT `returnTo` (Review-Befund P2 zu PR #140). Ohne es landet die Person
   * nach dem erneuten Einlösen dort, wohin ihr KÄRTCHEN zeigt — und steht mit
   * dem gescannten Etikett in der Hand vor der Artikelliste. Der Weg ist bereits
   * gesäubert; `encodeURIComponent` hält ihn als EINEN Parameter zusammen.
   */
  if (!riegel.ok) redirect(`/?returnTo=${encodeURIComponent(zurueck)}`);

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

  // Die Kärtchen-Kennung wandert IN den Wert: die Wahl gehört ihrer Schicht.
  kekse.set(
    ZIEL_COOKIE,
    zielWert(ziel!, riegel.zugang.tokenId),
    helferCookieOptionen(helferGueltigkeitSekunden()),
  );
  redirect(zurueck);
}

/** `FormData.get` liefert auch `File`; nur eine Zeichenkette ist brauchbar. */
function zeichenkette(wert: FormDataEntryValue | null): string | null {
  return typeof wert === "string" ? wert : null;
}
