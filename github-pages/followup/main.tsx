import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/noto-serif-tc";
import FollowupApp from "../../presentation/followup/FollowupApp";

const root = document.getElementById("root");
if (!root) throw new Error("找不到 Follow-up Prototype 掛載節點。");

createRoot(root).render(
  <StrictMode>
    <FollowupApp />
  </StrictMode>,
);
