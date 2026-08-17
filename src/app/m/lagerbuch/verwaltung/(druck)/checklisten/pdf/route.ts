import { headers } from "next/headers";
import { auth } from "@/core/auth";
import { getDb } from "../../../../_db/client";
import { checklistenPdf, pdfDateiname } from "../../../../_lib/checklistePdf";
import { lagerbuchHostOderNull } from "../../../../_lib/host";
import {
  checklistenDaten,
  gewaehlteFahrzeuge,
  standDatum,
} from "../../../../_lib/lesepfade/checkliste";
import { istLagerbuchAdmin, viewerAusSession } from "../../../../_lib/zugang";

export const dynamic = "force-dynamic";

/**
 * DIE FAHRZEUG-CHECKLISTEN ALS PDF → /verwaltung/checklisten/pdf.
 *
 * Derselbe Bogen wie unter /verwaltung/checklisten, nur als Datei. Er liest
 * dieselben Parameter (`?fz=` wiederholbar, `?blind=1`, `?kompakt=1`) und
 * dieselben Lesepfade — was die Seite zeigt, steht in der Datei.
 *
 * ⚠️ DIE RIEGEL STEHEN HIER SELBST, UND ZWAR VOLLSTAENDIG. Ein Route Handler
 * hat KEIN Layout ueber sich: `(druck)/layout.tsx` riegelt diese Adresse NICHT
 * (`_lib/host.ts` schreibt genau das aus — „Route Handler haben KEIN Layout").
 * Faellt eine der beiden Zeilen unten weg, liegt die komplette Soll-Bestueckung
 * jeder Flotte als Download offen, waehrend die Seite daneben weiter richtig
 * riegelt — und kein Quelltext-Scan sieht die Luecke, weil an der Seite alles
 * stimmt.
 *
 * ⚠️ DIE NICHT-WERFENDE FORM DER RIEGEL (`lagerbuchHostOderNull` +
 * `istLagerbuchAdmin`), NICHT `requireLagerbuchAdmin`. Der werfende Riegel ist
 * auf Server-Component-Rendering zugeschnitten: sein `redirect("/login…")`
 * beantwortete einen Datei-Download mit einer HTML-Anmeldeseite unter dem
 * Namen `checkliste-….pdf`. Dieselbe Entscheidung und dieselbe Begruendung wie
 * in den beiden CSV-Exporten von `feedback`.
 *
 * ⚠️ 404 UND NICHT 403, in beiden Faellen: „ein 403 verriete, dass es die
 * Admin-Route gibt" — und der Host-Riegel laeuft vor dem Personen-Riegel,
 * damit ein anonymer Aufruf auf fremdem Host die Verwaltungsroute nicht ueber
 * einen Login-Umweg verraet.
 *
 * ⚠️ KEIN `merkeNutzer` HIER. `requireLagerbuchAdmin` schreibt den Namen der
 * verwaltenden Person nach `users` (§4.13); dieser Pfad liest nur und braucht
 * die Zeile nicht. Wer sie aus Analogie nachtraegt, macht aus einem Download
 * einen Schreibzugriff.
 */
export async function GET(request: Request): Promise<Response> {
  const kopf = await headers();
  if (lagerbuchHostOderNull(kopf) === null) return new Response(null, { status: 404 });

  const viewer = viewerAusSession(await auth());
  if (!istLagerbuchAdmin(viewer)) return new Response(null, { status: 404 });

  const parameter = new URL(request.url).searchParams;
  const gewaehlt = gewaehlteFahrzeuge(parameter.getAll("fz"));
  const jetzt = new Date();

  const blaetter = checklistenDaten(
    getDb(),
    gewaehlt.length === 0 ? null : gewaehlt,
    jetzt,
  );

  /**
   * KEIN LEERES PDF. Die Seite kann den leeren Fall BENENNEN („kein aktives
   * Fahrzeug angelegt") und einen Weg zurueck anbieten; eine Datei kann das
   * nicht — ein PDF mit null Seiten ist in manchen Betrachtern gar nicht zu
   * oeffnen und sieht in allen uebrigen wie ein defekter Download aus. Wer
   * hierher kommt, kam ueber den Knopf auf einem Bogen, der Blaetter zeigt;
   * ist die Auswahl inzwischen leer, ist 404 die ehrlichere Antwort.
   */
  if (blaetter.length === 0) return new Response(null, { status: 404 });

  const stand = standDatum(jetzt);
  const bytes = await checklistenPdf(blaetter, {
    stand,
    blind: parameter.get("blind") === "1",
    kompakt: parameter.get("kompakt") === "1",
    erstellt: jetzt,
  });

  // `Buffer.from`, nicht das rohe `Uint8Array`: `BodyInit` nimmt in dieser
  // Typumgebung `Uint8Array<ArrayBufferLike>` nicht an. Der Aufruf kopiert die
  // Bytes — bei einem Bogen von wenigen zehn Kilobyte ist das billiger als
  // eine `as BodyInit`-Zusicherung, die eine echte Unvertraeglichkeit
  // ueberdecken koennte.
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      // `attachment`: der Bogen ist zum Ablegen und Weiterschicken da. Der
      // Dateiname ist bewusst ASCII (`pdfDateiname`) — er steht ungequotet
      // zwischen Anfuehrungszeichen, und der ungekuerzte Fahrzeugname steht im
      // Dokument selbst.
      "Content-Disposition": `attachment; filename="${pdfDateiname(blaetter, stand)}"`,
      // Die Sollmengen einer Flotte gehoeren in keinen geteilten Zwischenspeicher.
      "Cache-Control": "private, no-store",
    },
  });
}
