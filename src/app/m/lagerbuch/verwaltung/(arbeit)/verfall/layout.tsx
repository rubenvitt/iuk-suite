/** Nur der Seitentitel: `page.tsx` ist `"use client"` und darf keine Metadaten exportieren. */
export const metadata = { title: "Verfall" };

export default function SeitentitelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
