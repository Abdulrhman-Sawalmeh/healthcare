import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { systemConfig } from "./config/system";
import { AuthProvider } from "./context/AuthContext";
import { LanguageProvider } from "./context/LanguageContext";
import "./styles/global.css";

document.documentElement.lang = "ar";
document.documentElement.dir = "rtl";
document.title = systemConfig.name;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </LanguageProvider>
  </React.StrictMode>
);
