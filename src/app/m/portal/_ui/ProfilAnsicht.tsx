"use client";

import { useState } from "react";
import { Button, Card, Modal, Space, Tag, Typography } from "antd";
import { signOut } from "next-auth/react";

import { SPACE } from "@/core/theme/tokens";

const { Text } = Typography;

function Zeile({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBlockEnd: SPACE.md }}>
      <Text type="secondary">{titel}</Text>
      <div>{children}</div>
    </div>
  );
}

function Etiketten({ werte }: { werte: string[] }) {
  if (werte.length === 0) return <Text>Keine</Text>;
  return (
    <Space size={4} wrap>
      {werte.map((w) => (
        <Tag key={w}>{w}</Tag>
      ))}
    </Space>
  );
}

/**
 * Die Client-Insel der Profilseite.
 *
 * WARUM UEBERHAUPT EINE INSEL: `Typography.Text` ist ein Compound-Zugriff; in
 * einer Server Component ergibt er `undefined` und HTTP 500 (Falle 1 in
 * docs/design/README.md). Die Seite darueber holt nur die Sitzung und reicht
 * fertige Werte durch.
 *
 * `abmelden` kommt als Prop herein, statt hier importiert zu werden: eine
 * Server Action laesst sich so im Test durch eine Attrappe ersetzen, ohne den
 * `"use server"`-Rand mitzuziehen.
 */
export function ProfilAnsicht({
  name,
  email,
  kennung,
  gruppen,
  fachgruppen,
  angemeldetSeit,
  abmelden,
}: {
  name: string | null;
  email: string | null;
  kennung: string | null;
  gruppen: string[];
  fachgruppen: string[];
  angemeldetSeit: number | null;
  abmelden: () => Promise<void>;
}) {
  const [fragt, setFragt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function bestaetigt() {
    setLaeuft(true);
    try {
      await abmelden();
      // Erst danach das eigene Geraet — sonst waere die Seite weg, bevor der
      // Widerruf geschrieben ist. Ueber `oidc-signout`, damit auch die Sitzung
      // beim Identitaetsanbieter endet (siehe die Begruendung in
      // `app/api/auth/oidc-signout/route.ts`).
      await signOut({ callbackUrl: "/api/auth/oidc-signout" });
    } finally {
      setLaeuft(false);
      setFragt(false);
    }
  }

  return (
    <Space direction="vertical" size="large" style={{ display: "flex" }}>
      <Card title="Angaben aus der Anmeldung">
        <Zeile titel="Name">{name ?? "Unbekannt"}</Zeile>
        <Zeile titel="E-Mail">{email ?? "Keine hinterlegt"}</Zeile>
        <Zeile titel="Gruppen">
          <span data-testid="profil-gruppen">
            <Etiketten werte={gruppen} />
          </span>
        </Zeile>
        <Zeile titel="Fachgruppen">
          <span data-testid="profil-fachgruppen">
            <Etiketten werte={fachgruppen} />
          </span>
        </Zeile>
        <Zeile titel="Kennung">
          <Text code>{kennung ?? "—"}</Text>
        </Zeile>
        <Zeile titel="Angemeldet seit">
          {angemeldetSeit ? new Date(angemeldetSeit * 1000).toLocaleString("de-DE") : "Unbekannt"}
        </Zeile>
        <Text type="secondary">
          Name, E-Mail und Gruppen werden zentral verwaltet und lassen sich hier nicht ändern.
        </Text>
      </Card>

      <Card title="Sitzungen">
        <p data-testid="alle-abmelden-hinweis">
          Beendet alle Sitzungen dieser Suite — auf diesem Gerät und auf allen anderen. Du musst
          dich danach überall neu anmelden.
        </p>
        {/*
         * `danger` OHNE `type="primary"`: in dieser Suite ist
         * `colorError === colorPrimary === #c8000f` (Falle 3). Eine rote Flaeche
         * laese sich hier als die empfohlene Handlung statt als die
         * folgenschwere. Kein `size` — die Dichte kommt aus `FullShell`
         * (Falle 4).
         */}
        <Button danger data-testid="alle-abmelden" onClick={() => setFragt(true)}>
          Von allen Geräten abmelden
        </Button>
      </Card>

      <Modal
        open={fragt}
        title="Von allen Geräten abmelden?"
        onCancel={() => setFragt(false)}
        onOk={bestaetigt}
        confirmLoading={laeuft}
        okText="Ja, alle abmelden"
        cancelText="Abbrechen"
        okButtonProps={{ danger: true, "data-testid": "alle-abmelden-ja" }}
      >
        Alle bestehenden Sitzungen werden sofort ungültig. Das lässt sich nicht rückgängig machen.
      </Modal>
    </Space>
  );
}
