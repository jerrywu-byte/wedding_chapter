import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/noto-serif-tc";
import "../app/globals.css";
import { PersonalityDownloadPage } from "../components/personality/PersonalityDownloadPage";
import { readPersonalityDownloadState } from "../lib/personalityDownloadUrl";
import WeddingExperienceRunner from "../presentation/components/WeddingExperienceRunner";

globalThis.__WEDDING_CHAPTER_BASE_PATH__ = import.meta.env.BASE_URL;

const root = document.getElementById("root");
if (!root) throw new Error("找不到 Wedding Chapter 掛載節點。");
const downloadState = readPersonalityDownloadState(window.location.search);

createRoot(root).render(
  <StrictMode>
    {downloadState
      ? <PersonalityDownloadPage state={downloadState} />
      : <WeddingExperienceRunner experienceId="brandcolor" />}
  </StrictMode>,
);
