import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import History from "./pages/History";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import Auth from "./pages/Auth";
import Share from "./pages/Share";
import ViewShare from "./pages/ViewShare";
import SecurityDashboard from "./pages/SecurityDashboard";
import Security from "./pages/Security";
import Verify2FA from "./pages/Verify2FA";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/share" element={<Share />} />
          <Route path="/s/:identifier" element={<ViewShare />} />
          <Route path="/history" element={<History />} />
          <Route path="/security-dashboard" element={<SecurityDashboard />} />
          <Route path="/security" element={<Security />} />
          <Route path="/verify-2fa" element={<Verify2FA />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
