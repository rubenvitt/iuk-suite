import { OfflineProbe } from "./OfflineProbe";

export default function BetaPage() {
  return (
    <div data-testid="beta-content">
      Beta (Minimal-Shell, anonym)
      <OfflineProbe />
    </div>
  );
}
