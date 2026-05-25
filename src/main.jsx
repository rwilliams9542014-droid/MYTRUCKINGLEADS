import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider } from "@/context/AuthContext";
import { EasterEggs } from "@/components/EasterEggs";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <AuthProvider>
      <EasterEggs />
      <App />
    </AuthProvider>
  </StrictMode>
);
