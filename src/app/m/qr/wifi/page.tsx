"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { QrPayload } from "@/app/m/qr/_lib/types";

type Encryption = "WPA" | "WEP" | "nopass";

const ENCRYPTIONS: { value: Encryption; label: string }[] = [
  { value: "WPA", label: "WPA / WPA2" },
  { value: "WEP", label: "WEP" },
  { value: "nopass", label: "Keine" },
];

export default function WifiPage() {
  const [ssid, setSsid] = useState("");
  const [password, setPassword] = useState("");
  const [encryption, setEncryption] = useState<Encryption>("WPA");
  const [hidden, setHidden] = useState(false);
  const router = useRouter();

  const canSubmit = ssid.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const name = ssid.trim();
    const payload: QrPayload = {
      kind: "wifi",
      value: { ssid: name, password, encryption, hidden },
    };
    const label = `WLAN: ${name}`;
    recordEntry(label, payload);
    router.push(buildQrUrl(label, payload));
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="min-h-[var(--tap)] self-start leading-[var(--tap)]">
        ← Zurück
      </Link>
      <h1 className="text-lg font-bold">WLAN-Zugang</h1>
      <p className="text-[var(--color-stahl)]">
        QR-Code zum Beitreten eines Funknetzes. Geräte verbinden sich mit einem Scan.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="wifi-ssid" className="font-semibold">
            SSID (Netzwerkname)
          </label>
          <input
            id="wifi-ssid"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            required
            autoComplete="off"
            className="min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="wifi-pass" className="font-semibold">
            Passwort
          </label>
          {/* Bewusst type="text": das Passwort landet ohnehin sichtbar im Code,
              und im Einsatz wird es mit Handschuhen getippt — ein verdecktes
              Feld provoziert hier nur Tippfehler. */}
          <input
            id="wifi-pass"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
            className="min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3"
          />
          <p className="text-sm text-[var(--color-stahl)]">Leer lassen, wenn das Netz offen ist.</p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="font-semibold">Verschlüsselung</legend>
          {ENCRYPTIONS.map((o) => (
            <label key={o.value} className="flex min-h-[var(--tap)] items-center gap-2">
              <input
                type="radio"
                name="encryption"
                value={o.value}
                checked={encryption === o.value}
                onChange={() => setEncryption(o.value)}
              />
              {o.label}
            </label>
          ))}
        </fieldset>

        <label className="flex min-h-[var(--tap)] items-center gap-2">
          <input
            type="checkbox"
            checked={hidden}
            onChange={(e) => setHidden(e.target.checked)}
          />
          Verstecktes Netzwerk
        </label>

        <button
          type="submit"
          disabled={!canSubmit}
          className="min-h-[var(--tap-xl)] rounded border border-[var(--color-linie)] font-semibold disabled:opacity-50"
        >
          QR-Code erzeugen
        </button>
      </form>
    </div>
  );
}
