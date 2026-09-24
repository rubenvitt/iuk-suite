"use server";
import { withAuditContext, auditActor } from "@/core/audit/server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb, type DB } from "../_db/client";
import { type ActionErgebnis } from "../_lib/actionErgebnis";
import { etikettOrt } from "../_lib/lesepfade/ortEtiketten";
import { ersetzeAlteOrtCodes, setzeOrtCodeNeu, StandVeraltet } from "../_lib/schreibpfade/ortCodes";
import { requireLagerbuchAdmin } from "../_lib/zugang";

/**
 * DAS ZURÜCKSETZEN EINES ORTSCODES — DRK-406.
 *
 * Es gibt seit diesem Ticket keine Action mehr, die einen Zugangs-Code VON HAND
 * anlegt. Diese hier ist der einzige Weg, einen neuen Code in die Welt zu
 * bringen, den jemand ausgelöst hat — und sie tut es immer für einen Ort, nie
 * frei.
 *
 * ⚠️ ZWEI PFADE WERDEN REVALIDIERT, und der zweite ist der, den man vergisst:
 * die Ortsetiketten drucken den Code. Ohne ihre Revalidierung trüge die
 * Vorschau nach dem Zurücksetzen weiter den GESPERRTEN Code — und wer aus
 * dieser Vorschau druckt, klebt ihn ans Fahrzeug.
 */
const LISTENPFAD = "/m/lagerbuch/verwaltung/tokens";
const ETIKETTENPFAD = "/m/lagerbuch/verwaltung/ortsetiketten";

const ORT_FEHLER = "Zu dieser Adresse gehört keine Ortskarte.";
const CODE_FEHLER =
  "Es konnte kein freier Code erzeugt werden — bitte erneut versuchen.";
const ZURUECKSETZEN_FEHLER = "Der Code konnte nicht neu erzeugt werden.";
/*
 * ⚠️ KEIN FEHLER, SONDERN EIN UEBERHOLTER STAND — gefunden in der Durchsicht.
 * Zwei Verwaltende auf derselben Karte: der zweite Klick haette den Code
 * gesperrt, den der erste gerade erzeugt hat. §11.7 — der abgelehnte Weg nennt
 * den Weg, der bleibt.
 */
const VERALTET_FEHLER =
  "Für diesen Ort gilt inzwischen ein anderer Code — jemand war schneller. "
  + "Lade die Liste neu und sieh nach, bevor du erneut zurücksetzt.";

/*
 * ⚠️ `bisher` IST PFLICHT, und das ist der Riegel gegen den Wettlauf: die
 * Aktion setzt nicht „den aktiven Code" zurueck, sondern GENAU DEN, der auf dem
 * Bildschirm stand, von dem der Klick kam.
 */
const ZuruecksetzenSchema = z.object({
  ortId: z.string().min(1),
  bisher: z.string().min(1),
});

/**
 * @returns Der NEUE Code. Er wandert zurück an die Oberfläche, weil die
 *   Verwaltung ihn unmittelbar nach dem Zurücksetzen zeigt — wer einen Code
 *   sperrt, weil er missbraucht wurde, braucht den Nachfolger sofort und nicht
 *   erst nach einem Seitenwechsel.
 */
export async function setzeOrtCodeZurueck(
  eingabe: unknown,
  db: DB = getDb(),
): Promise<ActionErgebnis<{ code: string }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ code: string }>> => {
    const geparst = ZuruecksetzenSchema.safeParse(eingabe);
    if (!geparst.success) return { ok: false, fehler: "Ungültige Eingabe." };

    /*
     * ⚠️ DIE ID WIRD GEGEN DIE MENGE DER ORTSKARTEN AUFGELÖST, nicht gegen
     * `lagerorte`. Das ist der Riegel gegen IDOR (CLAUDE.md, „Zugriffsschutz"):
     * `etikettOrt` kennt genau den Handlager und die AKTIVEN Einheiten. Ohne
     * ihn ließe sich über einen getippten Parameter ein Code an einem Schrank
     * oder an einer stillgelegten Einheit erzeugen — an Orten also, für die es
     * keine Karte gibt und deren Code deshalb niemand je wieder fände.
     */
    const ort = etikettOrt(db, geparst.data.ortId);
    if (!ort) return { ok: false, fehler: ORT_FEHLER };

    let code: string | null;
    try {
      code = setzeOrtCodeNeu(db, ort, viewer.sub, geparst.data.bisher);
    } catch (e) {
      if (e instanceof StandVeraltet) return { ok: false, fehler: VERALTET_FEHLER };
      return { ok: false, fehler: ZURUECKSETZEN_FEHLER };
    }
    /*
     * ⚠️ `null` HEISST HIER: DIE ZIEHUNG WAR ERSCHÖPFT, UND DIE TRANSAKTION IST
     * ZURÜCKGEROLLT. Der alte Code ist dann NICHT gesperrt — das ist die
     * richtige Richtung. Ein Ort ohne aktiven Code hätte eine Karte, die aufs
     * Gate führt, und niemand wüsste, warum.
     */
    if (!code) return { ok: false, fehler: CODE_FEHLER };

    revalidatePath(LISTENPFAD);
    revalidatePath(ETIKETTENPFAD);
    return { ok: true, wert: { code } };
  });
}

const NEUDRUCK_FEHLER =
  "Die alten Codes konnten nicht vollständig neu erzeugt werden. Lade die Seite "
  + "neu — was schon neu ist, siehst du dort.";

/**
 * ALLE ALTEN ORTSCODES AUF EINMAL NEU — DRK-442, der Knopf auf den
 * Ortsetiketten. Wer die Karten ohnehin neu druckt, soll das nicht dreißigmal
 * einzeln anstoßen.
 *
 * ⚠️ KEIN `bisher` WIE BEIM EINZELNEN ZURÜCKSETZEN, und das ist kein Loch: die
 * Bedingung ist hier die FORM, nicht ein gesehener Code. Ein zweiter Klick —
 * oder ein zweiter Tab — findet keinen alten Code mehr und tut nichts; der
 * Wettlauf kann also nie einen gerade erzeugten langen Code verbrennen.
 *
 * @returns Wie viele Codes neu entstanden sind — so viele Karten müssen neu
 *   gedruckt werden.
 */
export async function ersetzeAlteOrtCodesAmOrt(
  db: DB = getDb(),
): Promise<ActionErgebnis<{ neu: number }>> {
  const viewer = await requireLagerbuchAdmin();
  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<ActionErgebnis<{ neu: number }>> => {
    let neu: number;
    try {
      neu = ersetzeAlteOrtCodes(db, viewer.sub);
    } catch {
      return { ok: false, fehler: NEUDRUCK_FEHLER };
    }
    revalidatePath(LISTENPFAD);
    revalidatePath(ETIKETTENPFAD);
    return { ok: true, wert: { neu } };
  });
}
