import { Shell } from "@/core/shell/Shell";
import { getModule } from "@/core/registry";

// full-Shell NUR für die Verwaltung: diese Route-Group liegt eine Ebene über
// `f/` (Task 11), das sein eigenes, chrome-loses Layout hat. Next.js-Layouts
// stapeln sich pro Pfad-Segment, nicht pro Route-Group — `f/` importiert
// dieses Layout hier also nie, weil `(admin)` und `f` Geschwister-Segmente
// unter `feedback/` sind (Route-Groups sind reine Ordnungs-Ordner, tragen
// aber trotzdem die Layout-Verschachtelung nur für ihren eigenen Ast).
export default function FeedbackAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const mod = getModule("feedback");
  return (
    <Shell variant={mod.shell} moduleKey={mod.key}>
      {children}
    </Shell>
  );
}
