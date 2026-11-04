/** Nur der Seitentitel: `page.tsx` ist `"use client"` und darf keine Metadaten exportieren. */
export const metadata = { title: "Neue Freigabe" };

export default function SeitentitelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
