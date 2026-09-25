import type { Bytes } from "../kern/bytes";
import { zuBase64 } from "../kern/bytes";
import type { Blockkopf, Umschlag } from "../kern/format";
import { importierePrivat, packeAus } from "../kern/umschlag";
import { getDb } from "../../_db/client";
import type { Db } from "../stammdaten/daten";
import { kekAusUmgebung } from "./kek";
import { entschluesselePrivat, paarZuId } from "./paar";

export type FreigabeCode =
  | "kek_fehlt"
  | "kek_ungueltig"
  | "privat_unlesbar"
  | "schluessel_unbekannt"
  | "schluessel_passt_nicht"
  | "umgebung_passt_nicht"
  | "umschlag_ungueltig";

export type Freigabe =
  | { ok: true; cek: Bytes; art: "echt" | "test"; rechnerId: string | null }
  | { ok: false; status: 422 | 503; code: FreigabeCode; meldung: string };

const fehler = (status: 422 | 503, code: FreigabeCode, meldung: string): Freigabe => ({ ok: false, status, code, meldung });

/**
 * Packt einen Umschlag für Stufe 5 (`schluessel/freigeben`) aus. Wirft nicht: jede Ablehnung
 * kommt als Status 422 (Anfrage passt nicht) oder 503 (Suite nicht betriebsbereit) zurück, damit
 * kein Schlüsselmaterial über eine Fehlermeldung oder einen Log nach außen dringt.
 *
 * Die Freigaberegel „Umgebung ↔ Art des Paars" (Spec §12) steht VOR dem Auspacken: ein echtes
 * Paar öffnet nie einen Block mit `umgebung: "test"` und umgekehrt.
 *
 * `o.privat` ist die Variante mit schon geöffnetem Privatschlüssel (Stufe 6, Task 7): `gibFrei`
 * öffnet ihn für eine Anfrage mit vielen Blöcken je `schluesselId` nur einmal (eigener Cache für
 * die Dauer der Anfrage) und reicht ihn hier durch — ohne `o.privat` öffnet diese Funktion ihn
 * wie bisher selbst, KEK und Entschlüsselung eingeschlossen.
 */
export async function packeAusFuer(
  schluesselId: string,
  umschlag: Umschlag,
  kopf: Blockkopf,
  o: { db?: Db; env?: Record<string, string | undefined>; privat?: CryptoKey } = {},
): Promise<Freigabe> {
  // Zuerst die angefragte ID nachschlagen (der Aufrufer fragt „gib mir den CEK für diese ID"),
  // erst danach den Kopf gegen die Anfrage prüfen — eine unbekannte ID bleibt so auch dann
  // `schluessel_unbekannt`, wenn der mitgelieferte Block zufällig eine andere, bekannte ID trägt.
  const paar = paarZuId(o.db ?? getDb(), schluesselId);
  if (!paar) return fehler(422, "schluessel_unbekannt", `Schlüssel ${schluesselId} ist der Suite nicht bekannt`);
  if (kopf.schluesselId !== schluesselId) {
    return fehler(422, "schluessel_passt_nicht", `Block trägt ${kopf.schluesselId}, angefragt ist ${schluesselId}`);
  }
  if (kopf.umgebung !== paar.art) {
    return fehler(
      422,
      "umgebung_passt_nicht",
      `Ein ${paar.art === "echt" ? "echter" : "Test-"}Schlüssel öffnet keinen Block mit Umgebung „${kopf.umgebung}"`,
    );
  }
  let privat: CryptoKey;
  if (o.privat) {
    privat = o.privat;
  } else {
    const k = kekAusUmgebung(o.env ?? process.env);
    if (k.status === "fehlt") return fehler(503, "kek_fehlt", "EINSATZBUCH_SCHLUESSEL_KEK ist nicht gesetzt");
    if (k.status === "ungueltig") return fehler(503, "kek_ungueltig", "EINSATZBUCH_SCHLUESSEL_KEK ist kein 32-Byte-Wert in Base64");
    try {
      privat = await importierePrivat(zuBase64(await entschluesselePrivat(paar.privatVerschluesselt, paar.schluesselId, k.kek)));
    } catch {
      return fehler(503, "privat_unlesbar", "Der private Schlüssel lässt sich mit diesem KEK nicht lesen");
    }
  }
  try {
    return { ok: true, cek: await packeAus(umschlag, kopf, privat), art: paar.art, rechnerId: paar.rechnerId };
  } catch {
    return fehler(422, "umschlag_ungueltig", `Block ${kopf.block} lässt sich nicht auspacken`);
  }
}
