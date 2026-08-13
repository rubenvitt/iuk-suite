import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumb } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";

/*
 * DER KOPF JEDER SEITE DES MODULS (Spec §9.4, Muster `docs/design/
 * feedback-admin.md` §4.2 — UEBERNOMMEN, NICHT NEU ERFUNDEN). Flach, keine
 * Karte, drei Zeilen, `margin-bottom: 24`:
 *
 *   1. Brotkrume, 12px.
 *   2. `<h1>` 24/600 — die Textknoepfe der Seite RECHTS IN DERSELBEN ZEILE
 *      (`justify-content: space-between; align-items: flex-end;
 *      flex-wrap: wrap`).
 *   3. Kontextzeile, 12/gedaempft.
 *
 * Auf 390px bleibt `<h1>` bei 24 mit `text-wrap: balance`; die Knoepfe
 * rutschen darunter, die Kontextzeile bleibt — reines Flexbox-Wrapping, ohne
 * eine eigene Medienabfrage (identisch mit `feedback`s Seiten, die genauso
 * verzichten).
 *
 * `Breadcrumb` MIT `items` STATT EIGENEM MARKUP: anders als `lagerbuch`s
 * `Brotkrume` (ein einzelner Rueckweg-Link, dort ausdruecklich MIT dem
 * Vorbehalt „nicht gemessen") ist `Breadcrumb` mit der `items`-API hier
 * bereits eine gepruefte Flaeche — `docs/design/feedback-admin.md` §4.13
 * fuehrt sie unter „Server-sicher (kein JS im Bundle)", nachgezogen aus den
 * Server-Component-Seiten des Moduls `feedback` (z. B.
 * `(admin)/groups/[groupId]/trend/page.tsx`). Verboten ist einzig
 * `Breadcrumb.Item` (Falle 1, Compound-Zugriff) — die `items`-Form ruft ihn
 * nie auf.
 *
 * `Typography` KOMMT NICHT VOR: `<h1>` ist natives HTML mit `SCHRIFT.titel`.
 * Das schliesst Falle 1 (`Typography.Title` in RSC) STRUKTURELL aus, statt
 * sie an jeder Aufrufstelle zu umgehen — deshalb der Quelltext-Scan unten,
 * der genau das ganze Modul bewacht, nicht nur diese eine Datei.
 *
 * `kontext` IST PFLICHT, KEIN `?`, UND `string`, KEIN `ReactNode`: Spec §9.4
 * verlangt fuer jeden Einstieg einen eigenen SATZ, auch fuer den Leerfall —
 * alle drei Beispielsaetze der Spec sind Fliesztext, kein Markup. Ein
 * `ReactNode`-Typ liesze `kontext={anzahl && satz}` zu, das typecheckt und
 * ergibt bei `anzahl === 0` die Zahl `0` als Inhalt statt eines Satzes — ein
 * Fehler, den `pnpm typecheck` als `string` sofort sieht, als `ReactNode`
 * aber durchlaesst. Der Wurf unten bleibt die Gegenprobe fuer den einen Fall,
 * den auch `string` nicht ausschlieszt: die leere Zeichenkette.
 */
export function SeitenKopf({
  brotkrume,
  titel,
  aktionen,
  kontext,
}: {
  brotkrume: { label: string; href?: string }[];
  titel: string;
  aktionen?: ReactNode;
  kontext: string;
}) {
  if (!kontext) {
    throw new Error(
      "SeitenKopf: die Kontextzeile darf nie leer sein — jeder Einstieg braucht einen " +
        "eigenen Satz, auch fuer den Leerfall (Spec §9.4).",
    );
  }

  return (
    <div style={{ marginBlockEnd: 24 }}>
      <Breadcrumb
        style={{ ...SCHRIFT.neben, marginBlockEnd: 4 }}
        items={brotkrume.map((eintrag) => ({
          title: eintrag.href ? <Link href={eintrag.href}>{eintrag.label}</Link> : eintrag.label,
        }))}
      />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: 8,
        }}
      >
        <h1 style={{ ...SCHRIFT.titel, margin: 0, textWrap: "balance" }}>{titel}</h1>
        {aktionen ? <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>{aktionen}</div> : null}
      </div>
      <p style={{ ...SCHRIFT.neben, margin: "4px 0 0" }}>{kontext}</p>
    </div>
  );
}
