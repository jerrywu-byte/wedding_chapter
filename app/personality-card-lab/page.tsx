"use client";

import { useRef } from "react";
import { PersonalityCard } from "../../components/personality/PersonalityCard";
import { getActivePersonalities } from "../../lib/personalityData";
import {
  createPersonalityCardPng,
  triggerPersonalityCardDownload,
} from "../../lib/personalityCardDownload";

export default function PersonalityCardLab() {
  const refs = useRef<Record<string, HTMLElement | null>>({});
  if (import.meta.env.PROD) return null;
  const personalities = getActivePersonalities();

  return <main className="personality-card-lab">
    <h1>Personality Card QA</h1>
    {personalities.map((personality) => <section key={personality.id} id={`qa-${personality.id}`}>
      <PersonalityCard
        ref={(node) => { refs.current[personality.id] = node; }}
        personality={personality}
        coupleNames="新郎姓名 × 新娘姓名"
        mode="download"
      />
      <button
        type="button"
        data-download-personality={personality.id}
        onClick={async () => {
          const node = refs.current[personality.id];
          if (!node) return;
          const png = await createPersonalityCardPng(node);
          triggerPersonalityCardDownload(png, `Wedding_Chapter_${personality.displayName}.png`);
        }}
      >
        下載 {personality.displayName}
      </button>
    </section>)}
  </main>;
}
