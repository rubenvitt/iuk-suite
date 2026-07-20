"use client";

import { useState } from "react";
import { createPresetAction } from "@/app/m/qr/actions";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import { exceedsQrCapacity, QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";
import type { QrKind, QrPayload } from "@/app/m/qr/_lib/types";

const KINDS: { value: QrKind; label: string }[] = [
  { value: "url", label: "Web-Adresse" },
  { value: "text", label: "Freier Text" },
  { value: "tel", label: "Telefon" },
  { value: "wifi", label: "WLAN" },
  { value: "vcard", label: "Kontakt" },
];

const ENCRYPTIONS = [
  { value: "WPA", label: "WPA / WPA2" },
  { value: "WEP", label: "WEP" },
  { value: "nopass", label: "Keine" },
];

const inputClass = "min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3";

/**
 * Client-Komponente, weil die sichtbaren Felder vom gewaehlten `kind` abhaengen.
 *
 * Die Action liest genau EIN Feld `value` (siehe `parse` in actions.ts). Fuer
 * wifi/vcard traegt deshalb ein verstecktes `value` das JSON, und die
 * Unterfelder bleiben ohne `name` — ein zweites Feld namens `value` wuerde
 * `formData.get("value")` sonst auf die falsche Eingabe zeigen lassen.
 * Das JSON wird beim Rendern aus dem State abgeleitet, nicht in einem
 * onSubmit-Handler: `action={...}` serialisiert das Formular selbst, ein
 * nachtraeglich gesetzter Wert kaeme zu spaet.
 */
export function PresetForm() {
  const [kind, setKind] = useState<QrKind>("url");
  const [value, setValue] = useState("");

  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState("WPA");
  const [hidden, setHidden] = useState(false);

  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");

  // Leere Optionalfelder werden weggelassen statt als "" gespeichert — sonst
  // stuenden Geisterfelder in der Datenbank, die niemand eingegeben hat.
  function payload(): QrPayload {
    if (kind === "wifi") {
      return {
        kind,
        value: { ssid, password, encryption: encryption as "WPA" | "WEP" | "nopass", hidden },
      };
    }
    if (kind === "vcard") {
      return {
        kind,
        value: {
          name,
          tel: tel.trim() || undefined,
          email: email.trim() || undefined,
          org: org.trim() || undefined,
        },
      };
    }
    return { kind, value };
  }

  const isJsonKind = kind === "wifi" || kind === "vcard";
  // Dieselbe Grenze, die der Validator serverseitig durchsetzt — sonst meldet
  // das Formular Erfolg fuer ein Preset, das die Ansicht nie rendern kann.
  // Gemessen am fertigen QR-Text und in Bytes, nicht in Zeichen: Umlaute
  // zaehlen doppelt, Emoji vierfach.
  const tooLong = exceedsQrCapacity(payloadToQrString(payload()));

  return (
    <form action={createPresetAction} className="flex max-w-md flex-col gap-4" data-testid="preset-form">
      <label className="flex flex-col gap-1">
        <span className="font-semibold">Bezeichnung</span>
        <input name="label" required maxLength={80} className={inputClass} />
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-semibold">Symbol</span>
        <input name="icon" placeholder="z. B. 📶" className={inputClass} />
        <span className="text-sm text-[var(--color-stahl)]">
          Optional. Ohne Symbol zeigt die Kachel den ersten Buchstaben.
        </span>
      </label>

      <label className="flex flex-col gap-1">
        <span className="font-semibold">Art</span>
        <select
          name="kind"
          value={kind}
          onChange={(e) => setKind(e.target.value as QrKind)}
          className={inputClass}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
      </label>

      {kind === "url" && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Web-Adresse</span>
          <input
            name="value"
            type="url"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {kind === "text" && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Text</span>
          <input
            name="value"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {kind === "tel" && (
        <label className="flex flex-col gap-1">
          <span className="font-semibold">Telefonnummer</span>
          <input
            name="value"
            type="tel"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className={inputClass}
          />
        </label>
      )}

      {kind === "wifi" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-semibold">WLAN-Zugang</legend>
          <label className="flex flex-col gap-1">
            <span>SSID (Netzwerkname)</span>
            <input
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              required
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Passwort</span>
            {/* Wie in den Nutzerformularen bewusst sichtbar: das Passwort steht
                ohnehin im erzeugten Code, und ein verdecktes Feld provoziert
                hier nur Tippfehler. */}
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Verschlüsselung</span>
            <select
              value={encryption}
              onChange={(e) => setEncryption(e.target.value)}
              className={inputClass}
            >
              {ENCRYPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex min-h-[var(--tap)] items-center gap-2">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} />
            Verstecktes Netzwerk
          </label>
        </fieldset>
      )}

      {kind === "vcard" && (
        <fieldset className="flex flex-col gap-4">
          <legend className="font-semibold">Kontakt</legend>
          <label className="flex flex-col gap-1">
            <span>Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Telefon</span>
            <input
              type="tel"
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>E-Mail</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span>Organisation</span>
            <input value={org} onChange={(e) => setOrg(e.target.value)} className={inputClass} />
          </label>
        </fieldset>
      )}

      {isJsonKind && <input type="hidden" name="value" value={JSON.stringify(payload().value)} />}

      {tooLong ? (
        <p data-testid="preset-too-long" className="text-[var(--color-rot)]">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Bytes — Umlaute zählen doppelt, Emoji
          vierfach).
        </p>
      ) : null}

      <button
        type="submit"
        disabled={tooLong}
        className="min-h-[var(--tap-xl)] rounded border border-[var(--color-linie)] font-semibold disabled:opacity-50"
      >
        Anlegen
      </button>
    </form>
  );
}
