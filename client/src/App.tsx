import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch, Router as WouterRouter } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";

// Derive router base from Vite BASE_URL.
// Dev: BASE_URL="/" → base=""   GitHub Pages: BASE_URL="/pycalc-live/" → base="/pycalc-live"
const ROUTER_BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <WouterRouter base={ROUTER_BASE}>
            <Switch>
              {/* Single-page app: render Home for all routes */}
              <Route path="/" component={Home} />
              <Route component={Home} />
            </Switch>
          </WouterRouter>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
