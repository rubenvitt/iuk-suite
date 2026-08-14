"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/core/auth";
import { requireModuleAdmin } from "@/core/auth/guards";
import { validatePresetInput } from "@/app/m/qr/_lib/validator";
import {
  createPreset,
  updatePreset,
  deletePreset,
  reorderPresets,
} from "@/app/m/qr/_lib/presets";

/** Guard zuerst, Validierung danach — es soll nichts geschrieben werden, bevor
 *  die Berechtigung feststeht. */
async function adminUserId(): Promise<string> {
  await requireModuleAdmin("qr");
  const session = await auth();
  return session?.user?.id ?? "unbekannt";
}

/** Die Ansicht cached beide Seiten; nach jeder Mutation muessen sie neu
 *  gerendert werden. `revalidatePath` bekommt den INTERNEN Pfad (`/m/qr`),
 *  nicht den per Host gerouteten — wie im Portal. */
function revalidateQr(): void {
  revalidatePath("/m/qr");
  revalidatePath("/m/qr/admin");
}

function parse(formData: FormData) {
  const raw = String(formData.get("value") ?? "");
  const kind = String(formData.get("kind") ?? "");
  // wifi/vcard kommen als JSON aus dem Formular, alles andere roh.
  let value: unknown = raw;
  if (kind === "wifi" || kind === "vcard") {
    try {
      value = JSON.parse(raw);
    } catch {
      // Ohne diesen Zweig traegt der Fehler eine englische SyntaxError-Meldung
      // aus der Laufzeit nach aussen — sichtbar fuer den Admin im Formular.
      throw new Error(`Feld value enthält kein gültiges JSON (kind=${kind})`);
    }
  }
  const result = validatePresetInput({
    label: formData.get("label"),
    icon: formData.get("icon") || undefined,
    kind,
    value,
    id: formData.get("id") || undefined,
  });
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

export async function createPresetAction(formData: FormData) {
  const userId = await adminUserId();
  await createPreset(parse(formData), userId);
  revalidateQr();
}

export async function updatePresetAction(formData: FormData) {
  const userId = await adminUserId();
  const id = String(formData.get("id"));
  const parsed = parse(formData);
  // Die Zeile wird ueber das Formularfeld `id` adressiert. Die mitvalidierte
  // `id` aus der Nutzlast wird verworfen, damit ein Aktualisieren nie die
  // Identitaet der Zeile verschiebt.
  delete parsed.id;
  await updatePreset(id, parsed, userId);
  revalidateQr();
}

export async function deletePresetAction(formData: FormData) {
  await requireModuleAdmin("qr");
  await deletePreset(String(formData.get("id")));
  revalidateQr();
}

/**
 * OHNE OBERFLÄCHE — eine bewusste Lücke, kein Versehen und kein toter Rest.
 * Wer hier aufräumt, lese erst zu Ende.
 *
 * NICHT „unaufrufbar", und der Unterschied trägt hier die Sicherheit. Hier
 * stand einmal „HEUTE UNERREICHBAR"; das lädt einen späteren Leser ein, „kein
 * Aufrufer" für „nicht adressierbar" zu halten. Ein Export aus einem
 * `"use server"`-Modul bekommt eine Action-ID und ist über die Wire
 * adressierbar, ob eine Oberfläche ihn ruft oder nicht — die Abwesenheit eines
 * Bedienelements ist keine Zugangssperre. Was die Lücke tatsächlich trägt, ist
 * `requireModuleAdmin("qr")` als erste Anweisung im Rumpf; fiele der Riegel,
 * wäre das Fehlen einer Oberfläche kein Ersatz.
 *
 * ZUR VOLLSTÄNDIGKEIT: `ids: string[]` ist die einzige Action dieses Moduls,
 * die ihre Nutzlast ohne Formvalidierung durchreicht. Das ist vertretbar, aber
 * es soll dastehen — sie ist admin-gegattert, und `eq()` gegen etwas, das kein
 * String ist, trifft schlicht keine Zeile.
 *
 * Die Action ist vollständig und geprüft (Guard, `presets.ts`, eigene Fälle in
 * `actions.test.ts`). Was fehlt, ist der EINSTIEGSPUNKT: die Admin-Oberfläche
 * des Moduls hat kein Bedienelement, das sie aufruft. QR-Presets lassen sich
 * darum nicht umsortieren; sie erscheinen in der Reihenfolge, die
 * `presets.ts` liefert.
 *
 * WARUM SIE NICHT GEBAUT WIRD. Eine Sortier-Oberfläche verlangt
 * Entwurfsentscheidungen, die niemand getroffen hat — Ziehen und Ablegen,
 * Pfeiltasten je Zeile, ein Zahlenfeld für die Reihenfolge, etwas anderes.
 * Jede Antwort zieht eigene Folgen nach sich (Tastaturbedienung,
 * Trefferflächen, Verhalten auf dem Telefon). Diese Datei ist nicht der Ort,
 * an dem eine davon nebenbei gefällt wird. Solange die Entscheidung aussteht,
 * ist „keine Oberfläche" der ehrliche Zustand.
 *
 * WARUM SIE NICHT GELÖSCHT WIRD, obwohl im Modul `feedback` zwei Actions ohne
 * Aufrufer genau dafür gelöscht wurden: dort war der Grund, dass eine
 * NACHFOLGE-ACTION dieselbe Wirkung schon abdeckte — die alten waren abgelöst,
 * ihre Fähigkeit blieb erreichbar. Hier deckt keine andere Action das
 * Umsortieren ab. Ein Löschen nähme dem Modul eine Fähigkeit, statt eine
 * doppelte zu entfernen, und die Wiederbeschaffung wäre kein Zurückholen von
 * Code, sondern erneutes Durchdenken von Guard und Persistenz.
 *
 * Kurz: ohne Oberfläche aus Absicht, nicht aus Verfall — und gesichert durch
 * den Riegel, nicht durch die fehlende Oberfläche. Wer die Oberfläche baut,
 * darf diesen Kommentar mit ihr zusammen entfernen.
 */
export async function reorderPresetsAction(ids: string[]) {
  await requireModuleAdmin("qr");
  await reorderPresets(ids);
  revalidateQr();
}
