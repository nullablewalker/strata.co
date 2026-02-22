/**
 * React SPA entry point for Strata.
 *
 * Mounts the root React tree into the #root DOM element defined in index.html.
 * BrowserRouter is placed here (outside App) so that the router context is
 * available to every component, including the AuthProvider inside App.
 * Tailwind v4 styles are imported via index.css which contains the @theme definitions.
 */
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
