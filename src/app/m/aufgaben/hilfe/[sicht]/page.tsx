import { notFound } from "next/navigation";
import { getDb } from "../../_db/client";
import { sichtFuerSchluessel, zielHref, type HilfeSicht } from "../../_lib/hilfe";
import { akteurFuerSeite, subFuerSitzung, type Akteur } from "../../_lib/zugang";
import { HilfeKapitel } from "../../_ui/hilfe/HilfeKapitel";
import { NichtEingetragenSeite } from "../../_ui/NichtEingetragenSeite";

export const dynamic = "force-dynamic";

/*
 * `/hilfe/<sicht>` — EIN KAPITEL.
 *
 * ══ KEIN ROLLEN-GATE AUF DEM KAPITEL SELBST, UND DAS IST EINE ENTSCHEIDUNG, KEIN VERSEHEN:
 *    ein Kapitel ist Text ueber eine Flaeche, kein Zugang zu ihren Daten — es liest keine Aufgabe,
 *    keine Person, keinen Nachweis. `notFound()` fuer eine BuFDi auf `/hilfe/verteilen` verhinderte
 *    nichts (die Existenz der Verteilung steht in Spec und Runbook) und kostete den Fall, in dem
 *    sie genau wissen will, was mit ihrer fertig gemeldeten Aufgabe als Naechstes passiert.
 *
 *    WAS STATTDESSEN GATET, IST DER WEG UND DER KNOPF: `/hilfe` zeigt nur die Kapitel dieser
 *    Person (`hilfeSichten`), und der Verweis „Sicht oeffnen" entsteht nur, wo `zielHref` eine
 *    Adresse liefert — auf `/verteilen` steht er trotzdem, und wer ihn dort ohne Koordination
 *    klickt, bekommt dieselbe 404 wie ueber die Adresszeile. Deshalb sagt jedes Kapitel unter
 *    „Was hier nicht geht" ausdruecklich, wem die Sicht 404 antwortet: die Anleitung verschweigt
 *    den Riegel nicht, sie erklaert ihn.
 *
 * ══ EIN UNBEKANNTER SCHLUESSEL BLEIBT `notFound()` — das ist keine Rollenfrage, sondern eine
 *    Adresse, die es nicht gibt.
 */
export function kapitelInhalt(sicht: HilfeSicht, akteur: Akteur) {
  return <HilfeKapitel sicht={sicht} zielHref={zielHref(sicht, akteur)} />;
}

export default async function HilfeKapitelPage({
  params,
}: {
  params: Promise<{ sicht: string }>;
}) {
  const db = getDb();
  const akteur = await akteurFuerSeite(db);
  if (!akteur) return <NichtEingetragenSeite sub={await subFuerSitzung()} />;
  const { sicht } = await params;
  const gefunden = sichtFuerSchluessel(sicht);
  if (!gefunden) notFound();
  return kapitelInhalt(gefunden, akteur);
}
