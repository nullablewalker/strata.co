/**
 * React SPA entry point for Strata.
 *
 * Mounts the root React tree into the #root DOM element defined in index.html.
 * BrowserRouter is placed here (outside App) so that the router context is
 * available to every component, including the AuthProvider inside App.
 * Tailwind v4 styles are imported via index.css which contains the @theme definitions.
 */
import React, { Component, type ReactNode, type ErrorInfo } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/index.css";

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 32, color: "#ff6b6b", fontFamily: "monospace" }}>
          <h1>Render Error</h1>
          <pre style={{ whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: "pre-wrap", color: "#888", marginTop: 16 }}>
            {this.state.error.stack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>,
);
