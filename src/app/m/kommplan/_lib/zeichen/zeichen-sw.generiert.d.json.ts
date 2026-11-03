/** Typ des Generats statt der Inferenz aus rund 480 KB JSON (IDA-329, wie `zeichen.generiert.d.json.ts`). */
declare const generat: {
  stand: { conformance: string; core: string; schema: string };
  zeichen: Record<string, { viewBox: string; inhalt: string }>;
};
export default generat;
