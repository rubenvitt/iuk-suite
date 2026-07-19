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

export async function reorderPresetsAction(ids: string[]) {
  await requireModuleAdmin("qr");
  await reorderPresets(ids);
  revalidateQr();
}
