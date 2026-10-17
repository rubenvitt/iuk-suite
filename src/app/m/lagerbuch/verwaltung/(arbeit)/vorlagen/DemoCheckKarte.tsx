"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Card, Select, Space, Switch } from "antd";
import { setzeDemoCheck } from "../../../_actions/demo";

/**
 * IDA-224 — der Schalter des Demo-Checks (voruebergehend, Rueckbau IDA-225).
 * Jede Aenderung speichert sofort; die Seite liest den Stand danach neu.
 */
export function DemoCheckKarte({
  aktiv,
  templateId,
  vorlagen,
  adresse,
  qr,
}: {
  aktiv: boolean;
  templateId: string | null;
  vorlagen: { id: string; name: string }[];
  adresse: string;
  /** SVG des QR-Codes auf `adresse`, oder `null`, wenn der Lagerbuch-Host nicht konfiguriert ist. */
  qr: string | null;
}) {
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const router = useRouter();

  function speichern(naechst: { aktiv: boolean; templateId: string | null }): void {
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await setzeDemoCheck(naechst);
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        router.refresh();
      } catch {
        setFehler("Die Einstellung konnte nicht gespeichert werden.");
      }
    });
  }

  return (
    <Card title="Demo-Check" style={{ marginTop: 24 }} data-rolle="demo-check">
      <p style={{ marginTop: 0 }}>
        Unter <a href={adresse}>{adresse}</a> probiert jede Person ohne Code den Fahrzeug-Check an der
        gewählten Vorlage aus. Es wird nichts gespeichert, und das Demo-Fahrzeug erscheint nirgends
        sonst. Ist die Demo aus, gibt es die Adresse nicht.
      </p>
      <Space wrap align="center">
        <Select
          aria-label="Vorlage für den Demo-Check"
          placeholder="Vorlage wählen"
          style={{ minWidth: 240 }}
          value={templateId ?? undefined}
          options={vorlagen.map((v) => ({ value: v.id, label: v.name }))}
          disabled={laeuft}
          onChange={(id: string) => speichern({ aktiv, templateId: id })}
        />
        <Switch
          aria-label="Demo-Check eingeschaltet"
          checked={aktiv}
          loading={laeuft}
          onChange={(an) => speichern({ aktiv: an, templateId })}
        />
        <span data-rolle="demo-check-stand">{aktiv ? "Eingeschaltet" : "Ausgeschaltet"}</span>
      </Space>
      {aktiv && qr ? (
        <div
          style={{ width: 180, marginTop: 16 }}
          aria-label={`QR-Code auf ${adresse}`}
          role="img"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
      ) : null}
      {fehler ? <Alert style={{ marginTop: 16 }} type="warning" showIcon={false} title={fehler} /> : null}
    </Card>
  );
}
