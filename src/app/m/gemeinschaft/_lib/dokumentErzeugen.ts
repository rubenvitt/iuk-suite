import { dokumentPdf, type Unterschrift } from "./dokumentPdf";
import type { dokumentGrundlage } from "./vermietung";
import { zeitraumText } from "./vermietungText";
import { DOKUMENT_TITEL, type Dokumentart } from "./vermietungTypen";
import { mieterFeldIds } from "./vertragFeld";
import { dokumentTitel } from "./vertragName";

/**
 * Baut aus der Grundlage eines Dokuments (IDA-354) die PDF: die Ansicht vor dem Unterschreiben (Werte und
 * Unterschriften, die es gibt) oder die fertige Fassung mit der Unterschrift der mietenden Person in allen ihren
 * Feldern (ohne Feld auf einer eigenen letzten Seite).
 */

type Grundlage = NonNullable<ReturnType<typeof dokumentGrundlage>>;

const rahmen = (g: Grundlage, art: Dokumentart, fertig: boolean, am: number) => ({
  titel: dokumentTitel(art, g.anfrage.von, fertig), dokument: DOKUMENT_TITEL[art], zeitraum: zeitraumText(g.anfrage.von, g.anfrage.bis), anlass: g.anfrage.anlass, am,
});

export async function ansichtPdf(g: Grundlage, art: Dokumentart): Promise<Buffer> {
  return Buffer.from(await dokumentPdf(g.inhalt, g.felder, g.werte, g.unterschriften, rahmen(g, art, false, g.freigegebenAm ?? Date.now())));
}

/** Die fertige Fassung; `feldIds` sind die Felder, in die die Unterschrift gesetzt wurde. Wirft, wenn das Bild nicht dekodiert. */
export async function fassungMitMieter(g: Grundlage, art: Dokumentart, u: { name: string; bild: Buffer; am: number }): Promise<{ inhalt: Buffer; feldIds: string[] }> {
  const feldIds = mieterFeldIds(g.felder);
  const neu: Unterschrift[] = feldIds.map((feldId) => ({ feldId, rolle: "mieter", name: u.name, am: u.am, bild: u.bild }));
  const alle = [...g.unterschriften.filter((x) => x.rolle !== "mieter"), ...neu];
  return { inhalt: Buffer.from(await dokumentPdf(g.inhalt, g.felder, g.werte, alle, rahmen(g, art, true, u.am))), feldIds };
}
