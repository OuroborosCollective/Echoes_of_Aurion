/** Echoes of Aurion — Aurion hosts portal/auth/community; AX1 owns `/play`. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LocalAuthPanel from "./components/LocalAuthPanel";
import AurionCommunityHost from "./components/AurionCommunityHost";
import { ThemeProvider } from "./contexts/ThemeContext";
import GlbUpload from "./pages/GlbUpload";
import Home from "./pages/Home";
import Operations from "./pages/Operations";
import AurionGroupsPage from "./xaurion/integration/AurionGroupFinder";
import AurionPlayRoute from "./xaurion/integration/AurionPlayRoute";
import Ax1PlayNavigationBridge from "./xaurion/integration/Ax1PlayNavigationBridge";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <LocalAuthPanel />
          <AurionCommunityHost />
          <Ax1PlayNavigationBridge />
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
