import CausalRecoveryDashboard from "./CausalRecoveryDashboard";
import CausalStudioDashboard from "./CausalStudioDashboard";

/**
 * Compatibility route for the former all-in-one causality dashboard.
 * The old surface exposed rollback mutation and overstated eight-stage replay
 * observability. Keep one UI entry point, but compose only the truthful,
 * read-only evidence surfaces.
 */
export default function CausalityDashboard() {
  return (
    <div className="space-y-6">
      <CausalStudioDashboard />
      <CausalRecoveryDashboard />
    </div>
  );
}
