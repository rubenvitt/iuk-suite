/**
 * Typ des Generats statt der Inferenz aus 500 KB JSON (IDA-329): seit den typischen Einsatzmitteln
 * lief `tsc` mit der Inferenz über die 2-GB-Grenze des Heaps. Das JSON erzeugt `scripts/kommplan-zeichen-generat.ts`.
 */
declare const generat: {
  stand: { conformance: string; core: string; schema: string };
  zeichen: Record<string, { titel: string; suchtext: string; viewBox: string; inhalt: string }>;
};
export default generat;
