import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode } from "react";
import { runtimeIssueCode } from "@shared/runtimeContracts";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error) {
    console.error("[Aurion Runtime] Unhandled interface error", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#06151a] p-8 text-[#dcefe9]">
          <div className="flex w-full max-w-xl flex-col items-center border border-cyan-200/20 bg-[#0b2427]/95 p-8 shadow-2xl">
            <AlertTriangle
              size={48}
              className="mb-5 flex-shrink-0 text-[#f0c371]"
            />

            <p className="mb-2 text-[10px] font-bold tracking-[.18em] text-cyan-200">AURION // RUNTIME-SCHUTZ</p>
            <h2 className="mb-3 font-serif text-2xl text-[#f4e4bc]">Die Sternwarte braucht einen neuen Impuls.</h2>
            <p className="mb-2 max-w-md text-center text-sm leading-6 text-cyan-50/75">Der Spielbereich wurde sicher angehalten. Deine Kontodaten und Community-Aktionen wurden nicht verändert.</p>
            <code className="mb-6 border border-cyan-200/15 bg-black/20 px-3 py-1 text-[10px] text-cyan-100/70">VORGANG {runtimeIssueCode(this.state.error)}</code>

            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Sternwarte erneut öffnen
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
