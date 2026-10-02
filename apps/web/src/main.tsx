import React from "react";
import ReactDOM from "react-dom/client";
import { Embed } from "./Embed";
import { AuthGate } from "./AuthGate";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/embed/") ? <Embed /> : <AuthGate />}
  </React.StrictMode>,
);
