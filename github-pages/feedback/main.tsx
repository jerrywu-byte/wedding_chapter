import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/noto-serif-tc";
import FeedbackApp from "../../presentation/feedback/FeedbackApp";

const root = document.getElementById("root");
if (!root) throw new Error("找不到活動回饋入口掛載節點。");

createRoot(root).render(
  <StrictMode>
    <FeedbackApp />
  </StrictMode>,
);
