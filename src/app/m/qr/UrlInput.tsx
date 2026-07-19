"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QR_MAX_LENGTH, exceedsQrCapacity } from "@/app/m/qr/_lib/qr";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import { recordEntry } from "@/app/m/qr/_lib/history";

export function UrlInput() {
  const [value, setValue] = useState("");
  const router = useRouter();
  // Byte-Länge, nicht value.length: ein Text aus Umlauten wäre nach Zeichen
  // gezählt längst erlaubt, während die Erzeugung ihn bereits ablehnt. Die
  // Warnung schwiege dann genau dann, wenn sie gebraucht wird.
  const tooLong = exceedsQrCapacity(value);
  const canSubmit = value.length > 0 && !tooLong;

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!canSubmit) return;
        const payload = { kind: "url" as const, value };
        recordEntry(value, payload);
        router.push(buildQrUrl(value, payload));
      }}
    >
      <label htmlFor="qr-url" className="font-semibold">
        Link oder Text
      </label>
      <input
        id="qr-url"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoComplete="off"
        placeholder="https://…"
        className="min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3"
      />
      {tooLong ? (
        <p data-testid="too-long" className="text-[var(--color-rot)]">
          Zu lang für einen QR-Code (max. {QR_MAX_LENGTH} Bytes — Umlaute zählen doppelt, Emoji
          vierfach).
        </p>
      ) : null}
      <button
        type="submit"
        disabled={!canSubmit}
        className="min-h-[var(--tap-xl)] rounded border border-[var(--color-linie)] font-semibold disabled:opacity-50"
      >
        QR-Code erzeugen
      </button>
    </form>
  );
}
