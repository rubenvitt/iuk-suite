import type { Metadata } from "next";

/**
 * NUR DER MANIFEST-VERWEIS, SONST `{children}` — Vorbild `lagerbuch/layout.tsx`/
 * `radio/layout.tsx`. Dieses Layout ist Vorfahr JEDES Kindes unter `m/uav`,
 * auch der Verwaltung (`(admin)/`) — eine Shell hier wäre für sie falsch:
 * die Verwaltung braucht `variant="full"`, der Teilnehmer-Zweig
 * `variant="minimal"` (Registry), und Next.js-Layouts stapeln sich pro
 * Pfad-Segment, nicht pro Route-Group — ein zweites `<Shell>` in
 * `(teilnehmer)/layout.tsx` läge sonst INNERHALB von diesem hier.
 *
 * Seit Aufgabe 15 tragen deshalb `(teilnehmer)/layout.tsx` (`variant="minimal"`,
 * RegisterSW, Boot-Modus) und `(admin)/layout.tsx` (`variant="full"`) ihre
 * Shell-Entscheidung jeweils selbst — Geschwister-Segmente unter `m/uav`,
 * keines importiert das andere.
 */
export const metadata: Metadata = {
  manifest: "/manifest.webmanifest",
};

export default function UavLayout({ children }: { children: React.ReactNode }) {
  return children;
}
