import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/noto-serif-tc";
import "../app/globals.css";
import WeddingExperienceRunner from "../presentation/components/WeddingExperienceRunner";

globalThis.__WEDDING_CHAPTER_BASE_PATH__ = import.meta.env.BASE_URL;

const root = document.getElementById("root");
if (!root) throw new Error("找不到 Wedding Chapter 掛載節點。");

createRoot(root).render(
  <StrictMode>
    <WeddingExperienceRunner experienceId="brandcolor" />
  </StrictMode>,
);
