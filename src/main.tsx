import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./desktop.css";
import "./workspace.css";
import { applyTheme, readThemePreference, resolveTheme } from "./themes";

applyTheme(resolveTheme(readThemePreference()));

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
