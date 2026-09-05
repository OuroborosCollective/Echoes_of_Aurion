import { Component, type ReactNode } from "react";
import { runtimeIssueCode } from "@shared/runtimeContracts";

/** Keeps account, community, audio and the tower mounted if the world UI fails. */
export class OpenWorldErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) { return { error }; }

  private recover = () => this.setState({ error: null });

  componentDidMount() {
    window.addEventListener("aurion:return-to-tower", this.recover);
  }

  componentWillUnmount() {
    window.removeEventListener("aurion:return-to-tower", this.recover);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <section className="xaurion-runtime" aria-label="Aurion Open World angehalten">
        <div className="xaurion-runtime__error" role="alert">
          <b>OPEN WORLD ANGEHALTEN</b>
          <span>Die Spieloberfläche konnte nicht weiter angezeigt werden. Kehre zur Sternwarte zurück, um die Welt erneut zu öffnen.</span>
          <code>VORGANG {runtimeIssueCode(this.state.error)}</code>
        </div>
        <button className="xaurion-runtime__return" type="button" onClick={() => window.dispatchEvent(new Event("aurion:xaurion-return-request"))}>ZUR STERNWARTE</button>
      </section>
    );
  }
}
