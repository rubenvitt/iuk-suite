// Form und Farbe je Antwortposition des Live-Quiz, auf Beamer und Handy gleich (▲ ● ■ ◆ ★ ✚): wer
// oben links ▲ sieht, tippt oben links ▲. Kein "use client" und kein Hook — beide Ansichten
// sind Client-Komponenten, eine Server Component bräuchte nichts davon (Falle 6, `CLAUDE.md`).
// Die Formen sind Geometrie, keine Zeichen: deshalb nicht `Icons8Ikone`.
import type { ReactNode } from "react";
import z from "./zeichen.module.css";

const FARBEN = [z.a, z.b, z.c, z.d, z.e, z.f];
const FORMEN: { name: string; svg: ReactNode }[] = [
  { name: "dreieck", svg: <path d="M50 8 96 90H4z" /> },
  { name: "kreis", svg: <circle cx="50" cy="50" r="44" /> },
  { name: "quadrat", svg: <rect x="10" y="10" width="80" height="80" rx="4" /> },
  { name: "raute", svg: <path d="M50 2 98 50 50 98 2 50z" /> },
  { name: "stern", svg: <path d="M50 6 61.8 36.8 94.7 38.5 69 59.2 77.6 91 50 73 22.4 91 31 59.2 5.3 38.5 38.2 36.8z" /> },
  { name: "kreuz", svg: <path d="M37 6h26v31h31v26H63v31H37V63H6V37h31z" /> },
];

/** Die Farbklasse (`--k`, `--kt`) der Option `i` (0–5; eine Frage hat höchstens sechs). */
export const quizFarbe = (i: number): string => FARBEN[i % FARBEN.length];

/** Das Formschild der Option `i`; Größe und Plakette setzt die Ansicht über `className`. */
export function QuizForm({ i, className }: { i: number; className: string }) {
  const f = FORMEN[i % FORMEN.length];
  return (
    <span className={className} data-form={f.name} aria-hidden>
      <svg viewBox="0 0 100 100">{f.svg}</svg>
    </span>
  );
}

/** „2 455“: Tausender mit schmalem Leerzeichen, wie im Mockup. */
export function quizZahl(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
