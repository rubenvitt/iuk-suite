import Link from "next/link";
import type { ReactNode } from "react";
import { Breadcrumb } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import s from "./aufgaben.module.css";

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
  hilfe,
}: {
  brotkrume: { label: string; href?: string }[];
  titel: string;
  aktionen?: ReactNode;
  kontext: string;
  /**
   * DER SCHLUESSEL DES ANLEITUNGSKAPITELS ZU DIESER SICHT (`_lib/hilfe.ts`s `SichtSchluessel`).
   *
   * ER STEHT IN DER BROTKRUMENZEILE UND NICHT IM `aktionen`-SLOT, UND ZWAR AUF JEDER SEITE AN
   * DERSELBEN STELLE: eine Hilfe, die mal neben „Aufgabe einstellen" und mal neben dem
   * Wochenwaehler auftaucht, wird auf der dritten Seite gesucht statt gesehen. Der `aktionen`-Slot
   * gehoert ausserdem den Handlungen DIESER Seite — ein Verweis auf eine Textseite ist keine.
   *
   * `optional`, WEIL NICHT JEDE SEITE EIN KAPITEL HAT: die Anleitungsseiten selbst tragen keines
   * (sie waeren ihr eigener Verweis), und `NichtEingetragenSeite` erklaert sich selbst.
   *
   * KEIN `SichtSchluessel`-TYP IN DIESER SIGNATUR, SONDERN `string`: `_lib/hilfe.ts` importiert
   * `_lib/zugang.ts` und damit `@/core/auth`; `SeitenKopf` wird von zwei Client-Inseln her
   * mitgezogen, und ein `import type` ist genau der Import, den eine spaetere Aufraeumrunde zu
   * einem Wertimport macht. Die Zusicherung „der Schluessel existiert wirklich" traegt dafuer
   * `hilfe.test.ts`, das jeden im Modul gesetzten `hilfe`-Wert gegen `SICHT_SCHLUESSEL` prueft —
   * ein Riegel am Quelltext statt einer Typkopplung ueber eine Modulgrenze, die man nicht will.
   */
  hilfe?: string;
}) {
  if (!kontext) {
    throw new Error(
      "SeitenKopf: die Kontextzeile darf nie leer sein — jeder Einstieg braucht einen " +
        "eigenen Satz, auch fuer den Leerfall (Spec §9.4).",
    );
  }

  return (
    <div style={{ marginBlockEnd: SPACE.xl }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: SPACE.sm,
          flexWrap: "wrap",
        }}
      >
        <Breadcrumb
          style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.xs }}
          items={brotkrume.map((eintrag) => ({
            title: eintrag.href ? <Link href={eintrag.href}>{eintrag.label}</Link> : eintrag.label,
          }))}
        />
        {hilfe ? (
          /*
           * DIE AUFSCHRIFT IST AUF JEDER SEITE DIESELBE, DAS ZIEL NICHT — und dazu kommt der
           * gleichnamige Navigationseintrag der Shell (`_lib/nav.ts`, Ziel `/hilfe`). Wer sich
           * eine Linkliste vorlesen laesst, hoerte also zweimal „Anleitung" ohne Unterschied.
           * `aria-label` traegt deshalb die Sicht mit; sichtbar bleibt das kurze Wort.
           */
          <Link
            href={`/hilfe/${hilfe}`}
            className={s.leiseLink}
            style={SCHRIFT.neben}
            aria-label={`Anleitung zu „${titel}“`}
          >
            Anleitung
          </Link>
        ) : null}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          flexWrap: "wrap",
          gap: SPACE.sm,
        }}
      >
        <h1 style={{ ...SCHRIFT.titel, margin: 0, textWrap: "balance" }}>{titel}</h1>
        {aktionen ? (
          <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>{aktionen}</div>
        ) : null}
      </div>
      <p style={{ ...SCHRIFT.neben, margin: `${SPACE.xs}px 0 0` }}>{kontext}</p>
    </div>
  );
}
