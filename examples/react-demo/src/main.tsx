import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("missing #root element");

// StrictMode double-invokes effects in development, proving the presenter's
// mount/dispose lifecycle is safe.
createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
