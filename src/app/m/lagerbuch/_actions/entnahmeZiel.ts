"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, type DB } from "../_db/client";
import { requireHelferSchreibend } from "../_lib/helferZugang";
import { istAktivesFahrzeug } from "../_lib/lesepfade/fahrzeuge";
import { helferCookieOptionen, helferGueltigkeitSekunden } from "../_lib/helferSitzung";
import { ZIEL_COOKIE, zielAusWert, zielWert } from "../_lib/entnahmeZiel";
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
  /*
   * Zurück aufs Gate, nicht auf die Artikelseite: dort käme die Person mit
   * einer abgelaufenen oder gesperrten Sitzung nicht weiter und wüsste nicht,
   * warum. `returnTo` nimmt den Weg wieder auf, sobald das Kärtchen gilt.
   */
  if (!riegel.ok) redirect("/");

  const zurueck = sanitizeReturnTo(zeichenkette(eingabe.get("returnTo"))) ?? "/helfer";
  const ziel = zielAusWert(zeichenkette(eingabe.get("ziel")));

  /*
   * EIN UNTAUGLICHES ZIEL WIRD NICHT GEMERKT — es wird auch nicht gemeldet.
   * Gemerkt würde es die folgenden Entnahmen in den Fehlerzweig der Buchung
   * schicken, während die Seite das Ziel als gültig anzeigt; der Weg zurück
   * zur Wahl ist die brauchbarere Antwort. Der Fall entsteht, wenn die
   * Verwaltung ein Fahrzeug stilllegt, während jemand davor steht.
   *
   * Das Handlager wird hier MITGEPRÜFT, obwohl es existiert und aktiv ist:
   * eine Prüfung, die nur auf „unbekannt" testet, ließe es durch, und die
   * Buchung legte Material vom Handlager ins Handlager.
   */
  if (ziel && (ziel.art === "verbrauch" || istAktivesFahrzeug(db, ziel.lagerortId))) {
    const kekse = await cookies();
    kekse.set(ZIEL_COOKIE, zielWert(ziel), helferCookieOptionen(helferGueltigkeitSekunden()));
  }

  redirect(zurueck);
}

/** `FormData.get` liefert auch `File`; nur eine Zeichenkette ist brauchbar. */
function zeichenkette(wert: FormDataEntryValue | null): string | null {
  return typeof wert === "string" ? wert : null;
}
