"use server";

import { auth } from "@/core/auth";
import { laufendeRevision, laufendeVersion } from "@/core/version";
import { zunderEingang } from "@/core/rueckmeldung/eingang";
import { pruefeEingabe, type RueckmeldungErgebnis } from "@/core/rueckmeldung/eingabe";
import { gibTaktZurueck, nimmTakt } from "@/core/rueckmeldung/takt";
import { baueAufgabe } from "@/core/rueckmeldung/vorlage";
import { NICHT_ERREICHBAR, wirfEin } from "@/core/rueckmeldung/zunder";

/**
 * DIE SERVER ACTION HINTER DEM FLYIN (IDA-214).
 *
 * Reihenfolge: Sitzung, Einrichtung, Eingabe, Takt, Zunder. Die Person kommt
 * aus der Sitzung, nie aus der Eingabe. Kein Auffrischen des Tokens hier —
 * aufgefrischt wird nur in `proxy.ts` und auf `/api/auth/*` (`CLAUDE.md`,
 * „Zugriffsschutz").
 *
 * Das Flyin importiert diese Funktion direkt; sie geht nie als Prop über die
 * RSC-Grenze (Falle 9).
 */
export async function sendeRueckmeldung(roh: unknown): Promise<RueckmeldungErgebnis> {
  const session = await auth();
  const person = session?.user;
  if (!person?.id) return { ok: false, grund: "Du bist nicht mehr angemeldet. Lade die Seite neu." };

  const eingang = zunderEingang();
  if (!eingang) return { ok: false, grund: NICHT_ERREICHBAR };

  const pruefung = pruefeEingabe(roh);
  if (!pruefung.ok) return pruefung;

  if (!nimmTakt(person.id)) {
    return {
      ok: false,
      grund: "Du hast in der letzten Stunde schon mehrere Rückmeldungen geschickt. Versuch es später noch einmal.",
    };
  }

  const aufgabe = baueAufgabe(pruefung.eingabe, {
    name: person.name ?? null,
    version: laufendeVersion(),
    revision: laufendeRevision(),
    jetzt: new Date(),
  });
  const einwurf = await wirfEin(eingang, aufgabe);
  if (!einwurf.ok) {
    gibTaktZurueck(person.id);
    return einwurf;
  }
  return { ok: true, kennung: einwurf.kennung };
}
