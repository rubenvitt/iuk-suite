"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Typography } from "antd";
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
    // Leere Felder werden zu undefined, nicht zu "": so entspricht das Payload
    // dem Typ (`tel?: string`) und der Verlauf speichert keine Geisterfelder.
    // Die vCard selbst bliebe auch mit "" sauber — payloadToQrString prüft auf
    // Wahrheitswert und lässt leere Zeilen ohnehin weg (siehe payload.test.ts).
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
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* `onClick` statt `href`: ein echtes `<a>` waere eine volle
          Dokumentnavigation samt Neuhydrierung statt eines Client-Wechsels. */}
      <Button
        type="link"
        onClick={() => router.push("/")}
        style={{ alignSelf: "flex-start", padding: 0 }}
      >
        ← Zurück
      </Button>
      <Typography.Title level={4} style={{ margin: 0 }}>
        Kontakt-Visitenkarte
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        vCard zum Speichern im Adressbuch des Scanners.
      </Typography.Paragraph>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {fields.map((f) => (
          <div key={f.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <label htmlFor={f.id} style={{ fontWeight: 600 }}>
              {f.label}
            </label>
            <Input
              id={f.id}
              type={f.type}
              size="large"
              value={f.value}
              onChange={(e) => f.set(e.target.value)}
              required={f.required}
            />
          </div>
        ))}

        <Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>
          QR-Code erzeugen
        </Button>
      </form>
    </div>
  );
}
