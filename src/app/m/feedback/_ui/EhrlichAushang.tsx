"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type CSSProperties } from "react";
import { Button, Card, Popconfirm } from "antd";
import { linkNeuAktion } from "../_lib/ehrlich/aktionen";
import { T } from "./typo";

const KARTE = {
  header: { ...T.kicker, minHeight: 40, paddingInline: 20, borderBottomColor: "var(--fb-split)" },
  body: { padding: "var(--fb-kartenpolster)" },
} satisfies Record<string, CSSProperties>;

export function EhrlichAushang({ url, secret, leser }: { url: string; secret: string; leser: string[] }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [kopiert, setKopiert] = useState(false);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Card variant="outlined" title="EINWURF" styles={KARTE}>
        <div className="eg-qr">
          <div className="eg-qr-kasten">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/k/${secret}/qr.png`} alt="" width={160} height={160} />
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ ...T.kicker, marginBottom: 4 }}>Adresse</div>
            <div className="eg-url" data-testid="einwurf-adresse">{url}</div>
            <div className="eg-knoepfe">
              <Button onClick={() => navigator.clipboard?.writeText(url).then(() => setKopiert(true))}>
                {kopiert ? "Kopiert" : "Adresse kopieren"}
              </Button>
              <Button href="/ehrlich-gesagt-aushang" target="_blank">Aushang drucken</Button>
            </div>
          </div>
        </div>
      </Card>
      <Card variant="outlined" title="WER LIEST MIT" styles={KARTE}>
        <p style={{ margin: 0 }}>{leser.length > 0 ? leser.join(", ") : "Pocket ID liefert gerade keine Namen."}</p>
      </Card>
      <section className="eg-gefahr">
        <div style={T.kicker}>Gefahrenzone</div>
        <p style={{ margin: "6px 0 0" }}>Neuer Link: gedruckte Aushänge werden ungültig. Abholcodes bleiben gültig.</p>
        <div className="eg-knoepfe">
          <Popconfirm
            title="Link neu erzeugen?"
            okText="Neu erzeugen"
            cancelText="Abbrechen"
            onConfirm={() => starte(async () => { await linkNeuAktion(); router.refresh(); })}
          >
            <Button danger disabled={laeuft}>Link neu erzeugen</Button>
          </Popconfirm>
        </div>
      </section>
    </div>
  );
}
