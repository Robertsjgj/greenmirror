import "./index.css";
import { render } from "react-dom";
import { App } from "./App";
import { AuthProvider } from "./context/AuthContext";
import { GreenhouseProvider } from "./context/GreenhouseContext";
import { SimulationProvider } from "./context/SimulationContext";

render(
  <AuthProvider>
    <GreenhouseProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </GreenhouseProvider>
  </AuthProvider>,
  document.getElementById("root"),
);

if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // The app should keep working even if the browser declines service workers.
    });
  });
}
