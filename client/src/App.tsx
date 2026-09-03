/**
 * Echoes of Aurion — App root
 * Design philosophy: The route is a single uninterrupted expedition frame.
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import LocalAuthPanel from "./components/LocalAuthPanel";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import Operations from "./pages/Operations";
import AurionOpenWorldRuntime from "./xaurion/integration/AurionOpenWorldRuntime";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <LocalAuthPanel />
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/ops" component={Operations} />
            <Route component={Home} />
          </Switch>
          <AurionOpenWorldRuntime />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
