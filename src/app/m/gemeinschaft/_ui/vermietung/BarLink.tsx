"use client";

import { App, Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";

/**
 * Die öffentliche Anfrageseite der Bar aus der Verwaltung heraus (IDA-334): öffnen, Link kopieren, QR-Plakat.
 * Das Plakat ist ein Route Handler (`vermietung/plakat`) und öffnet im PDF-Betrachter des Browsers.
 */
export function BarLink({ adresse }: { adresse: string }) {
  const { message } = App.useApp();
  const kopieren = async () => {
    try {
      await navigator.clipboard.writeText(adresse);
      message.success("Link kopiert.");
    } catch {
      message.info({ content: `Kopieren ging nicht. Der Link: ${adresse}`, duration: 15 });
    }
  };
  return (
    <>
      <Button href={adresse} target="_blank" rel="noreferrer" icon={<Icons8Ikone name="globe" groesse={16} />}>Anfrageseite</Button>
      <Button onClick={() => void kopieren()} icon={<Icons8Ikone name="copy" groesse={16} />}>Link kopieren</Button>
      <Button href="/vermietung/plakat" target="_blank" icon={<Icons8Ikone name="qr-code" groesse={16} />}>QR-Plakat</Button>
    </>
  );
}
