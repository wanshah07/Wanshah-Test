import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { applyAppTheme, readAppTheme, watchSystemTheme } from "./lib/theme";
import { toast } from "./components/Toast";

applyAppTheme(readAppTheme());

// A button whose request failed must never just do nothing: any failure no handler caught is shown.
window.addEventListener("unhandledrejection", (e) => {
  const err = e.reason as { message?: string; status?: number } | undefined;
  if (err?.status === 401) return; // the sign-in redirect is already on its way
  toast(err?.message ? `That did not work: ${err.message}` : "That did not work. Try again.", true);
});
watchSystemTheme();

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
