/** Echoes of Aurion — Aurion hosts portal/auth/community; AX1 owns `/play`. */
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LocalAuthPanel from "./components/LocalAuthPanel";
import AurionCommunityHost from "./components/AurionCommunityHost";
import { ThemeProvider } from "./contexts/ThemeContext";
import Account from "./pages/Account";
import Community from "./pages/Community";
import GlbUpload from "./pages/GlbUpload";
import Home from "./pages/Home";
import Operations from "./pages/Operations";
import QuestStudio from "./pages/QuestStudio";
import AurionPlayRoute from "./xaurion/integration/AurionPlayRoute";
import Ax1PlayNavigationBridge from "./xaurion/integration/Ax1PlayNavigationBridge";
import { SoundManager } from "./xaurion/audio/SoundManager";

function App() {
  const [location] = useLocation();
  const websiteSurface = location !== "/play";
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <SoundManager />
          <LocalAuthPanel />
          {websiteSurface && <AurionCommunityHost />}
          <Ax1PlayNavigationBridge />
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/account" component={Account} />
            <Route path="/community" component={Community} />
            <Route path="/play" component={AurionPlayRoute} />
            <Route path="/ops" component={Operations} />
            <Route path="/ops/quests" component={QuestStudio} />
            <Route path="/ops/glb-upload" component={GlbUpload} />
            <Route component={Home} />
          </Switch>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
