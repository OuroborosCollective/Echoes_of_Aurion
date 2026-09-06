/** Echoes of Aurion — Aurion hosts portal/auth; AX1 owns the mounted game route. */
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LocalAuthPanel from "./components/LocalAuthPanel";
import { ThemeProvider } from "./contexts/ThemeContext";
import GlbUpload from "./pages/GlbUpload";
import Home from "./pages/Home";
import Operations from "./pages/Operations";
import AurionGroupsPage from "./xaurion/integration/AurionGroupFinder";
import AurionPlayRoute, { persistConfirmedPlayLaunch } from "./xaurion/integration/AurionPlayRoute";

function PlayNavigationBridge() {
  const [, navigate] = useLocation();
  useEffect(() => {
    const launch = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!persistConfirmedPlayLaunch(detail)) return;
      navigate("/play");
    };
    window.addEventListener("aurion:load-open-world", launch);
    return () => window.removeEventListener("aurion:load-open-world", launch);
  }, [navigate]);
  return null;
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <LocalAuthPanel />
          <PlayNavigationBridge />
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/play" component={AurionPlayRoute} />
            <Route path="/ops" component={Operations} />
            <Route path="/ops/glb-upload" component={GlbUpload} />
            <Route path="/groups" component={AurionGroupsPage} />
            <Route component={Home} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
