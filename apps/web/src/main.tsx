import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { initPostHog, trackPageview } from "@/integrations/posthog";
import { router } from "@/integrations/tanstack-router/router";

import "./env";
import "@workspace/ui/styles/globals.css";

initPostHog();
trackPageview();
router.subscribe("onResolved", (e) => {
  if (e.pathChanged) trackPageview();
});

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
