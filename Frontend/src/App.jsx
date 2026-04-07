import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import LandingPage from "./pages/LandingPage.jsx";
import PricingPage from "./pages/PricingPage.jsx";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
