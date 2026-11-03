import type { Metadata } from "next";
import { NEWSREADER_KLASSE } from "../../f/[slugSecret]/Zustaende";
import { Abholen } from "./Abholen";

export const metadata: Metadata = { title: "Antwort abholen · Ehrlich gesagt", robots: { index: false, follow: false } };

/**
 * ANTWORT ABHOLEN (IDA-314). Ohne Secret im Pfad: Abholcodes gelten weiter, auch wenn der Aushang einen neuen
 * Link bekommt. Der Code geht nur im POST-Körper über die Leitung, nie in die Adresse.
 */
export default function AbholenSeite() {
  return <Abholen schrift={NEWSREADER_KLASSE} />;
}
