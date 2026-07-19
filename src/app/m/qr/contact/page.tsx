"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { QrPayload } from "@/app/m/qr/_lib/types";

export default function ContactPage() {
  const [name, setName] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");
  const [org, setOrg] = useState("");
  const router = useRouter();

  const canSubmit = name.trim().length > 0;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    // Leere Felder werden zu undefined, nicht zu "": payloadToQrString lässt
    // die Zeile dann ganz weg, statt eine leere TEL:-Zeile in die vCard zu
    // schreiben, an der manche Adressbücher hängen bleiben.
    const payload: QrPayload = {
      kind: "vcard",
      value: {
        name: name.trim(),
        tel: tel.trim() || undefined,
        email: email.trim() || undefined,
        org: org.trim() || undefined,
      },
    };
    const label = name.trim();
    recordEntry(label, payload);
    router.push(buildQrUrl(label, payload));
  }

  const fields = [
    { id: "c-name", label: "Name", type: "text", value: name, set: setName, required: true },
    { id: "c-tel", label: "Telefon", type: "tel", value: tel, set: setTel, required: false },
    { id: "c-email", label: "E-Mail", type: "email", value: email, set: setEmail, required: false },
    { id: "c-org", label: "Organisation", type: "text", value: org, set: setOrg, required: false },
  ];

  return (
    <div className="flex flex-col gap-4">
      <Link href="/" className="min-h-[var(--tap)] self-start leading-[var(--tap)]">
        ← Zurück
      </Link>
      <h1 className="text-lg font-bold">Kontakt-Visitenkarte</h1>
      <p className="text-[var(--color-stahl)]">vCard zum Speichern im Adressbuch des Scanners.</p>

      <form onSubmit={submit} className="flex flex-col gap-4">
        {fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1">
            <label htmlFor={f.id} className="font-semibold">
              {f.label}
            </label>
            <input
              id={f.id}
              type={f.type}
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              required={f.required}
              className="min-h-[var(--tap)] rounded border border-[var(--color-linie)] px-3"
            />
          </div>
        ))}

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
