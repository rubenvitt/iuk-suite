"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { QrPayload } from "@/app/m/qr/_lib/types";

export default function TelPage() {
  const [number, setNumber] = useState("");
  const router = useRouter();

  const canSubmit = number.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Ohne `tel:`-Präfix ergäbe der Code beim Scannen nur Text statt eines
    // Wählvorgangs — das Präfix setzt payloadToQrString in buildQrUrl.
    const payload: QrPayload = { kind: "tel", value: number };
    const label = `Tel: ${number}`;
    recordEntry(label, payload);
    router.push(buildQrUrl(label, payload));
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="min-h-[var(--tap)] self-start leading-[var(--tap)]">
        ← Zurück
      </Link>
      <h1 className="text-lg font-bold">Telefonnummer</h1>
      <p className="text-[var(--color-stahl)]">
        Beim Scannen öffnet sich der Wählvorgang im Telefon.
      </p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="tel-number" className="font-semibold">
            Nummer
          </label>
          <input
            id="tel-number"
            type="tel"
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            required
            placeholder="+49 151 12345678"
            className="min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3"
          />
          <p className="text-sm text-[var(--color-stahl)]">
            Internationales Format mit Ländervorwahl empfohlen (z. B. +49…).
          </p>
        </div>

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
