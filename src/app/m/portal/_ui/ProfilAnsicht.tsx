"use client";

import { useState } from "react";
import { Avatar, Button, Card, Modal, Space, Tag, Typography } from "antd";
import { signOut } from "next-auth/react";

import { initialen } from "@/core/shell/initialen";
import { SPACE } from "@/core/theme/tokens";
import { zeitzone } from "@/core/zeit";
import { alleSitzungenAbmelden } from "@/app/m/portal/profil/actions";

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
 * `alleSitzungenAbmelden` wird hier DIREKT importiert und nicht als Prop
 * durchgereicht (Falle 9, `CLAUDE.md`). Der Test ersetzt das Modul per
 * `vi.mock` — die Bauform folgt der Regel, nicht der Testbequemlichkeit
 * (DRK-398).
 */
export function ProfilAnsicht({
  name,
  email,
  kennung,
  bild,
  gruppen,
  fachgruppen,
  angemeldetSeit,
  version,
  revision,
}: {
  name: string | null;
  email: string | null;
  kennung: string | null;
  /** Profilbild aus Pocket ID (`session.user.image`) oder `null`. */
  bild: string | null;
  gruppen: string[];
  fachgruppen: string[];
  angemeldetSeit: number | null;
  /** `laufendeVersion()` — `1.4.2` oder `unbekannt` (lokal, ohne CI-Image). */
  version: string;
  /** `laufendeRevision()` — der volle Commit oder `unbekannt`. */
  revision: string;
}) {
  const [fragt, setFragt] = useState(false);
  const [laeuft, setLaeuft] = useState(false);

  async function bestaetigt() {
    setLaeuft(true);
    try {
      await alleSitzungenAbmelden();
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

  // `orientation`, nicht `direction`: antd 6 hat `direction` abgekündigt und
  // warnt zur Laufzeit. Kein Gate sieht das — die Verwarnung stand nur im
  // Protokoll des Playwright-Laufs. Vorbild: `lagerbuch/…/TemplateAktionen`.
  return (
    <Space orientation="vertical" size="large" style={{ display: "flex" }}>
      <Card title="Angaben aus der Anmeldung">
        {/* Laedt das Bild nicht, faellt `Avatar` selbst auf die Initialen zurueck.
            `alt=""`: der Name steht direkt daneben. */}
        <div style={{ display: "flex", alignItems: "center", gap: SPACE.md }}>
          <Avatar size={64} src={bild ?? undefined} alt="" data-testid="profil-bild">
            {initialen(name)}
          </Avatar>
          <Zeile titel="Name">{name ?? "Unbekannt"}</Zeile>
        </div>
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
          {angemeldetSeit ? new Date(angemeldetSeit * 1000).toLocaleString("de-DE", { timeZone: zeitzone() }) : "Unbekannt"}
        </Zeile>
        <Text type="secondary">
          Name, Profilbild, E-Mail und Gruppen werden zentral verwaltet und lassen sich hier nicht ändern.
        </Text>
      </Card>

      {/*
       * Die Version steht HIER und nicht in der Kopfzeile: sie ist eine Betreiber-
       * Auskunft („welcher Stand läuft?"), keine Navigation. Das Profil ist von jedem
       * Modul aus über das Nutzermenü erreichbar und existiert genau einmal — die
       * eine Stelle, die im angemeldeten Zustand überall gleich weit weg ist.
       *
       * `unbekannt` ist der Wert außerhalb eines CI-Images (`core/version.ts`). Er
       * wird ausgeschrieben statt versteckt: eine leere Zeile läse sich wie ein
       * Ladefehler, und lokal ist „Entwicklungsstand" die wahre Auskunft.
       */}
      <Card title="Diese Suite">
        <Zeile titel="Version">
          <span data-testid="suite-version">
            {version === "unbekannt" ? "Entwicklungsstand, keine Versionsnummer" : version}
          </span>
        </Zeile>
        <Zeile titel="Stand">
          <Text code data-testid="suite-revision">
            {revision === "unbekannt" ? "unbekannt" : revision.slice(0, 12)}
          </Text>
        </Zeile>
        <Text type="secondary">
          Die Versionsnummer nennt den Stand, der gerade läuft. Was sich darin geändert hat,
          steht unter Neuigkeiten.
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
