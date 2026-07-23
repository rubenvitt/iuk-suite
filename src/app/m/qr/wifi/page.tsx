"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Checkbox, Input, Radio, Typography } from "antd";
import { recordEntry } from "@/app/m/qr/_lib/history";
import { buildQrUrl } from "@/app/m/qr/_lib/qr-url";
import type { QrPayload } from "@/app/m/qr/_lib/types";
import { SPACE, TAP_ROW } from "@/core/theme/tokens";

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
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
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
        WLAN-Zugang
      </Typography.Title>
      <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
        QR-Code zum Beitreten eines Funknetzes. Geräte verbinden sich mit einem Scan.
      </Typography.Paragraph>

      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}>
        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <label htmlFor="wifi-ssid" style={{ fontWeight: 600 }}>
            SSID (Netzwerkname)
          </label>
          <Input
            id="wifi-ssid"
            size="large"
            value={ssid}
            onChange={(e) => setSsid(e.target.value)}
            required
            autoComplete="off"
          />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <label htmlFor="wifi-pass" style={{ fontWeight: 600 }}>
            Passwort
          </label>
          {/* Bewusst type="text": das Passwort landet ohnehin sichtbar im Code,
              und im Einsatz wird es mit Handschuhen getippt — ein verdecktes
              Feld provoziert hier nur Tippfehler. */}
          <Input
            id="wifi-pass"
            type="text"
            size="large"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="off"
          />
          <Typography.Text type="secondary">Leer lassen, wenn das Netz offen ist.</Typography.Text>
        </div>

        {/* Das <fieldset> bleibt: forms.test.tsx und preset-form.test.tsx greifen
            über `fieldset input` zu. Die Radio-Gruppe liegt DARIN. */}
        <fieldset style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, border: 0, margin: 0, padding: 0 }}>
          <legend style={{ fontWeight: 600 }}>Verschlüsselung</legend>
          {/* `name` an der Gruppe: forms.test.tsx klickt
              `input[name="encryption"][value="nopass"]`. antd reicht den Namen
              der Gruppe an jedes einzelne <input type="radio"> durch. */}
          <Radio.Group
            name="encryption"
            value={encryption}
            onChange={(e) => setEncryption(e.target.value as Encryption)}
            style={{ display: "flex", flexDirection: "column", gap: SPACE.sm }}
          >
            {ENCRYPTIONS.map((o) => (
              <Radio key={o.value} value={o.value} style={TAP_ROW}>
                {o.label}
              </Radio>
            ))}
          </Radio.Group>
        </fieldset>

        <Checkbox checked={hidden} onChange={(e) => setHidden(e.target.checked)} style={TAP_ROW}>
          Verstecktes Netzwerk
        </Checkbox>

        <Button htmlType="submit" type="primary" size="large" block disabled={!canSubmit}>
          QR-Code erzeugen
        </Button>
      </form>
    </div>
  );
}
