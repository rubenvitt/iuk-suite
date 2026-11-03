// Wie `f/layout.tsx`: keine Suite-Shell, kein App-Switcher, kein antd — die öffentliche Seite von
// „Ehrlich gesagt" (IDA-314) trägt dieselbe Optik wie der Dienstabend-Zettel (`zettel.module.css`).
export default function EhrlichOeffentlichLayout({ children }: { children: React.ReactNode }) {
  return <main>{children}</main>;
}
