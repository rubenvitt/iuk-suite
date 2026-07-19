"use client";

import { useRouter } from "next/navigation";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { Preset } from "@/app/m/qr/_lib/types";

/** Client-Komponente, weil ein Tipp in den Verlauf schreibt und dann
 *  navigiert — beides gibt es auf dem Server nicht. */
export function PresetGrid({ presets }: { presets: Preset[] }) {
  const router = useRouter();
  if (presets.length === 0) return null;

  function open(p: Preset) {
    // `p` ist ein Preset, also ein QrPayload mit Zusatzfeldern — buildQrUrl
    // kodiert daraus denselben String, den auch die Formulare erzeugen.
    recordEntry(p.label, p);
    router.push(buildQrUrl(p.label, p));
  }

  return (
    <section aria-label="Schnellzugriffe" className="flex flex-col gap-3">
      <h2 className="font-semibold">Schnellzugriffe</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3" data-testid="preset-grid">
        {presets.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => open(p)}
            data-testid="preset-tile"
            className="flex min-h-32 flex-col items-center justify-center gap-1 rounded border border-[var(--color-linie)] p-2"
          >
            <span aria-hidden="true" className="text-3xl">
              {p.icon ?? p.label.charAt(0).toUpperCase()}
            </span>
            <span>{p.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
