import React from "react";
import ReactDOM from "react-dom/client";
import { Embed } from "./Embed";
import { App } from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {window.location.pathname.startsWith("/embed/") ? <Embed /> : <App />}
  </React.StrictMode>,
);
