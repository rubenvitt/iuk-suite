"use client";
import { Alert } from "antd";
import type { Schluesselstatus } from "../_lib/schluessel/status";

/*
 * IDA-390: Wer das hier sieht, verwaltet das Einsatztagebuch, betreibt aber nicht den Server. Der Text
 * sagt deshalb, was los ist und was zu tun ist; Variablenname und Befehle stehen im Runbook
 * „Einsatzbuch-Schlüssel“, die Ursache für die Technik am Element (`data-ursache`).
 */
const TECHNIK = "Melde dich bei der Technik.";
const OHNE_FREIGABE = "Bis dahin kann die Suite keine Einsätze freigeben; Stammdaten und Reader gehen weiter.";

const TEXT: Record<string, { title: string; description: string } | undefined> = {
  fehlt: { title: "Die Verschlüsselung ist auf dem Server nicht eingerichtet", description: `${OHNE_FREIGABE} ${TECHNIK}` },
  ungueltig: { title: "Die Verschlüsselung ist auf dem Server falsch eingerichtet", description: `${OHNE_FREIGABE} ${TECHNIK}` },
  kek_passt_nicht: { title: "Der Server kann den Schlüssel des Einsatztagebuchs nicht lesen", description: `${OHNE_FREIGABE} ${TECHNIK}` },
  entwicklungs_kek: { title: "Die Verschlüsselung läuft mit einem Testschlüssel", description: `Der Testschlüssel ist öffentlich bekannt und schützt die Einsätze nicht. ${TECHNIK}` },
  paar_fehlt: { title: "Das Einsatztagebuch hat noch keinen Schlüssel", description: `${OHNE_FREIGABE} ${TECHNIK}` },
};

export function KekHinweis({ status }: { status: Schluesselstatus }) {
  // Der Entwicklungs-KEK geht vor: erst ein eigener KEK, dann lohnt der Blick auf das Paar.
  const schluessel =
    status.kek !== "ok" ? status.kek
    : status.entwicklungsKekInProduktion ? "entwicklungs_kek"
    : status.paar === "fehlt" ? "paar_fehlt"
    : status.paar === "kek_passt_nicht" ? "kek_passt_nicht"
    : null;
  const t = schluessel ? TEXT[schluessel] : undefined;
  if (!t) return null;
  return <Alert type="warning" showIcon title={t.title} description={t.description} data-testid="kek-hinweis" data-ursache={schluessel} />;
}
