"use client";

import { useState } from "react";
import { Button, Checkbox, Input, Typography } from "antd";
import { createPresetAction, updatePresetAction } from "@/app/m/qr/actions";
import { payloadToQrString } from "@/app/m/qr/_lib/payload";
import { exceedsQrCapacity, QR_MAX_LENGTH } from "@/app/m/qr/_lib/qr";
import { RAHMEN } from "@/app/m/qr/_lib/style";
import { TAP_XL } from "@/core/theme/tokens";
import type { Preset, QrKind, QrPayload } from "@/app/m/qr/_lib/types";

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

/**
 * Die beiden Auswahlfelder bleiben NATIVE `<select>` statt antds `Select` — das
 * ist kein Versehen, sondern eine Anforderung dieses Formulars:
 *
 * 1. `action={createPresetAction}` serialisiert das Formular selbst. `parse` in
 *    actions.ts liest `formData.get("kind")`. antds `Select` rendert kein
 *    namenstragendes Formularelement, das der Browser mitschickte — die Art
 *    käme als leerer String an und `parse` schlüge mit „kind ungültig: " fehl.
 * 2. `preset-form.test.tsx` treibt das Feld über den `HTMLSelectElement`-
 *    Prototyp-Setter und prüft `select[name="kind"]`, `.disabled` und die Zahl
 *    der Felder namens `kind`; `e2e/qr.spec.ts` prüft `getByLabel("Art")`
 *    auf `toBeDisabled()`. Keine dieser Zusicherungen überlebt einen Wechsel
 *    auf ein `div`-basiertes Auswahlfeld.
 *
 * Damit steht das Feld ausserhalb von antds Token-System und braucht seine
 * Masse explizit. Die Hoehe kommt aus derselben Quelle wie die der
 * antd-Komponenten (`controlHeightLG` = `TAP_XL`), damit sie nicht auseinander
 * laufen.
 */
const nativeSelectStyle: React.CSSProperties = {
  minHeight: TAP_XL,
  paddingInline: 12,
  borderRadius: 8,
  border: RAHMEN,
  background: "transparent",
  color: "inherit",
  font: "inherit",
};

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
 *
 * Mit `preset` bearbeitet dasselbe Formular einen bestehenden Eintrag. Ohne
 * diesen Zweig blieb einem Admin nach einer WLAN-Passwortrotation nur Loeschen
 * und Neuanlegen — dabei vergibt `createPreset` ein neues `sortOrder`, die
 * Kachel rutscht im Schnellzugriff ans Ende, und `created_at`/`created_by`
 * gehen verloren. `updatePreset` laesst genau diese Felder stehen.
 */
export function PresetForm({ preset }: { preset?: Preset } = {}) {
  const plain = preset && preset.kind !== "wifi" && preset.kind !== "vcard" ? preset.value : "";
  const wifi = preset?.kind === "wifi" ? preset.value : undefined;
  const card = preset?.kind === "vcard" ? preset.value : undefined;

  const [kind, setKind] = useState<QrKind>(preset?.kind ?? "url");
  const [value, setValue] = useState(plain);

  const [ssid, setSsid] = useState(wifi?.ssid ?? "");
  const [password, setPassword] = useState(wifi?.password ?? "");
  const [encryption, setEncryption] = useState<string>(wifi?.encryption ?? "WPA");
  const [hidden, setHidden] = useState(wifi?.hidden ?? false);

  const [name, setName] = useState(card?.name ?? "");
  const [tel, setTel] = useState(card?.tel ?? "");
  const [email, setEmail] = useState(card?.email ?? "");
  const [org, setOrg] = useState(card?.org ?? "");

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
    <form
      action={preset ? updatePresetAction : createPresetAction}
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 448 }}
      data-testid="preset-form"
    >
      {/* Adressiert die Zeile. `parse` verwirft die mitvalidierte id aus der
          Nutzlast, damit ein Aktualisieren die Identitaet nie verschiebt. */}
      {preset && <input type="hidden" name="id" value={preset.id} />}

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 600 }}>Bezeichnung</span>
        <Input name="label" size="large" required maxLength={80} defaultValue={preset?.label ?? ""} />
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 600 }}>Symbol</span>
        <Input name="icon" size="large" placeholder="z. B. 📶" defaultValue={preset?.icon ?? ""} />
        <Typography.Text type="secondary">
          Optional. Ohne Symbol zeigt die Kachel den ersten Buchstaben.
        </Typography.Text>
      </label>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span style={{ fontWeight: 600 }}>Art</span>
        {/* Beim Bearbeiten gesperrt — wie in easy-qr: ein Wechsel machte den
            gespeicherten `value` bedeutungslos (eine SSID ist keine URL). Ein
            deaktiviertes Feld schickt der Browser nicht mit, deshalb traegt das
            versteckte Feld den Wert. Es traegt den `name`, das Auswahlfeld
            nicht — zwei Felder namens `kind` liessen `formData.get("kind")`
            sonst auf das falsche zeigen. */}
        <select
          name={preset ? undefined : "kind"}
          value={kind}
          disabled={preset !== undefined}
          onChange={(e) => setKind(e.target.value as QrKind)}
          style={{ ...nativeSelectStyle, opacity: preset ? 0.5 : 1 }}
        >
          {KINDS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        {preset && <input type="hidden" name="kind" value={kind} />}
      </label>

      {kind === "url" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Web-Adresse</span>
          <Input
            name="value"
            type="url"
            size="large"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}

      {kind === "text" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Text</span>
          <Input
            name="value"
            size="large"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}

      {kind === "tel" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontWeight: 600 }}>Telefonnummer</span>
          <Input
            name="value"
            type="tel"
            size="large"
            required
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
      )}

      {kind === "wifi" && (
        /* Das <fieldset> bleibt: preset-form.test.tsx greift ueber
           `fieldset input` auf das erste Feld (die SSID) zu. */
        <fieldset
          style={{ display: "flex", flexDirection: "column", gap: 16, border: 0, margin: 0, padding: 0 }}
        >
          <legend style={{ fontWeight: 600 }}>WLAN-Zugang</legend>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>SSID (Netzwerkname)</span>
            <Input
              size="large"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              required
              autoComplete="off"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Passwort</span>
            {/* Wie in den Nutzerformularen bewusst sichtbar: das Passwort steht
                ohnehin im erzeugten Code, und ein verdecktes Feld provoziert
                hier nur Tippfehler. */}
            <Input
              type="text"
              size="large"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Verschlüsselung</span>
            {/* Natives <select> wie das Art-Feld darueber — siehe der Kommentar
                an `nativeSelectStyle`. Beide gleich zu halten ist die
                verstaendlichere Oberflaeche als zwei verschiedene Auswahlfelder
                in einem Formular. */}
            <select
              value={encryption}
              onChange={(e) => setEncryption(e.target.value)}
              style={nativeSelectStyle}
            >
              {ENCRYPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <Checkbox checked={hidden} onChange={(e) => setHidden(e.target.checked)}>
            Verstecktes Netzwerk
          </Checkbox>
        </fieldset>
      )}

      {kind === "vcard" && (
        <fieldset
          style={{ display: "flex", flexDirection: "column", gap: 16, border: 0, margin: 0, padding: 0 }}
        >
          <legend style={{ fontWeight: 600 }}>Kontakt</legend>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Name</span>
            <Input size="large" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Telefon</span>
            <Input type="tel" size="large" value={tel} onChange={(e) => setTel(e.target.value)} />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>E-Mail</span>
            <Input
              type="email"
              size="large"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span>Organisation</span>
            <Input size="large" value={org} onChange={(e) => setOrg(e.target.value)} />
          </label>
        </fieldset>
      )}

      {isJsonKind && <input type="hidden" name="value" value={JSON.stringify(payload().value)} />}

      {tooLong ? (
        <Typography.Text type="danger" data-testid="preset-too-long">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Bytes — Umlaute zählen doppelt, Emoji
          vierfach).
        </Typography.Text>
      ) : null}

      <Button htmlType="submit" type="primary" size="large" block disabled={tooLong}>
        {preset ? "Speichern" : "Anlegen"}
      </Button>
    </form>
  );
}
