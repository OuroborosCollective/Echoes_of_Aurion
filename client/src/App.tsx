/**
 * Echoes of Aurion — App root
 * Design philosophy: The route is a single uninterrupted expedition frame.
 */

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider><Toaster /><Home /></TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
