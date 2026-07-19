import type { Preset, QrKind } from "./types";

export type ValidationResult =
  | { ok: true; value: Omit<Preset, "id"> & { id?: string } }
  | { ok: false; error: string };

const VALID_KINDS: ReadonlyArray<QrKind> = ["url", "wifi", "tel", "vcard", "text"];
const ID_RE = /^[a-z0-9](?:[a-z0-9-]{0,58}[a-z0-9])?$/;

function fail(error: string): ValidationResult {
  return { ok: false, error };
}

export function validatePresetInput(input: unknown): ValidationResult {
  if (typeof input !== "object" || input === null) return fail("Body ist kein Objekt");
  const r = input as Record<string, unknown>;

  if (typeof r.label !== "string" || r.label.trim() === "") return fail("label fehlt");
  if (r.label.length > 80) return fail("label länger als 80 Zeichen");
  if (typeof r.kind !== "string" || !VALID_KINDS.includes(r.kind as QrKind)) {
    return fail(`kind ungültig: ${String(r.kind)}`);
  }
  if (r.id !== undefined && (typeof r.id !== "string" || !ID_RE.test(r.id))) {
    return fail("id-Format ungültig");
  }
  if (r.icon !== undefined && typeof r.icon !== "string") return fail("icon muss ein String sein");

  const kind = r.kind as QrKind;
  const v = r.value;
  // Nutzlast, die gespeichert wird. Nur wifi weicht von der Eingabe ab, siehe dort.
  let payloadValue: unknown = v;
  switch (kind) {
    case "url":
    case "tel":
    case "text":
      if (typeof v !== "string" || v === "") return fail(`${kind}.value darf nicht leer sein`);
      break;
    case "wifi": {
      if (typeof v !== "object" || v === null) return fail("wifi.value muss ein Objekt sein");
      const w = v as Record<string, unknown>;
      if (typeof w.ssid !== "string" || w.ssid === "") return fail("wifi.ssid fehlt");
      if (w.password !== undefined && typeof w.password !== "string") {
        return fail("wifi.password muss ein String sein");
      }
      if (!["WPA", "WEP", "nopass"].includes(w.encryption as string)) {
        return fail("wifi.encryption ungültig");
      }
      if (w.hidden !== undefined && typeof w.hidden !== "boolean") {
        return fail("wifi.hidden muss boolean sein");
      }
      // Ein offenes WLAN (encryption "nopass") kommt ohne password an, Preset verlangt es
      // aber als Pflichtfeld. Ohne diesen Default reicht die Validierung eine Nutzlast
      // durch, an der payloadToQrString spaeter mit einer TypeError abbricht - und der
      // Anlegepfad wuerde sie vorher dauerhaft so in die Datenbank schreiben.
      payloadValue = {
        ssid: w.ssid,
        password: typeof w.password === "string" ? w.password : "",
        encryption: w.encryption,
        ...(w.hidden !== undefined ? { hidden: w.hidden } : {}),
      };
      break;
    }
    case "vcard": {
      if (typeof v !== "object" || v === null) return fail("vcard.value muss ein Objekt sein");
      const c = v as Record<string, unknown>;
      if (typeof c.name !== "string" || c.name === "") return fail("vcard.name fehlt");
      for (const k of ["tel", "email", "org"]) {
        if (c[k] !== undefined && typeof c[k] !== "string") {
          return fail(`vcard.${k} muss ein String sein`);
        }
      }
      break;
    }
  }

  return {
    ok: true,
    value: {
      id: r.id as string | undefined,
      label: r.label,
      icon: r.icon as string | undefined,
      kind,
      value: payloadValue,
    } as Omit<Preset, "id"> & { id?: string },
  };
}
