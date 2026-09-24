"use client";
import { Alert } from "antd";
import type { Schluesselstatus } from "../_lib/schluessel/status";

const TEXT: Record<string, { title: string; description: string } | undefined> = {
  fehlt: { title: "Der Schlüssel-KEK fehlt", description: "EINSATZBUCH_SCHLUESSEL_KEK ist in der Umgebung der Suite nicht gesetzt. Ohne ihn kann die Suite keine Einsätze freigeben; Stammdaten und Reader funktionieren weiter." },
  ungueltig: { title: "Der Schlüssel-KEK ist ungültig", description: "EINSATZBUCH_SCHLUESSEL_KEK muss 32 Byte in Base64 sein (erzeugen mit openssl rand -base64 32)." },
  kek_passt_nicht: { title: "Der Schlüssel-KEK passt nicht zum Schlüsselpaar", description: "Mit dem gesetzten KEK lässt sich der private Schlüssel nicht lesen. Stell den richtigen KEK ein oder lege den Schlüssel aus der Notfall-Sicherung neu ab." },
  paar_fehlt: { title: "Noch kein Schlüsselpaar", description: "Erzeuge es einmalig mit pnpm einsatzbuch:schluessel erzeugen (Runbook „Einsatzbuch-Schlüssel“)." },
};

export function KekHinweis({ status }: { status: Schluesselstatus }) {
  const schluessel = status.kek !== "ok" ? status.kek : status.paar === "fehlt" ? "paar_fehlt" : status.paar === "kek_passt_nicht" ? "kek_passt_nicht" : null;
  const t = schluessel ? TEXT[schluessel] : undefined;
  if (!t) return null;
  return <Alert type="warning" showIcon title={t.title} description={t.description} data-testid="kek-hinweis" />;
}
