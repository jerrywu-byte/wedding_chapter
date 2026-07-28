import type { WeddingPersonality } from "../../types/wedding-personality";
import { EditorialLineBreaks } from "../typography/EditorialLineBreaks";

export function PersonalityStoryContent({ personality }: { personality: WeddingPersonality }) {
  const observations = personality.observations ?? [];
  const lines = personality.scene?.lines ?? [];
  const hasContent = observations.length || lines.length || personality.specialAbility || personality.aiSecret;
  if (!hasContent) return null;

  return <div className="personality-story-content">
    {observations.length ? <section className="personality-observations">
      <p className="personality-story-kicker">WEDDING FIELD NOTES</p>
      <h3>婚禮現場觀察</h3>
      <div>{observations.map((observation, index) => <p key={`${index}-${observation}`}><span>{String(index + 1).padStart(2, "0")}</span>{index === 0 ? <EditorialLineBreaks text={observation} /> : observation}</p>)}</div>
    </section> : null}
    {lines.length ? <section className="personality-scene">
      <p className="personality-story-kicker">A LITTLE WEDDING SCENE</p>
      <h3>婚禮流程小劇場</h3>
      {personality.scene?.speaker ? <b>{personality.scene.speaker}</b> : null}
      <div>{lines.map((line, index) => <p key={`${index}-${line}`}>{index === 0 ? <EditorialLineBreaks text={line} /> : line}</p>)}</div>
    </section> : null}
    {personality.aiSecret ? <aside className="personality-ai-secret">
      <p className="personality-story-kicker">AI QUIETLY NOTICED</p>
      <h3>AI 偷偷發現</h3>
      <AiSecretText text={personality.aiSecret} />
    </aside> : null}
  </div>;
}

function AiSecretText({ text }: { text: string }) {
  const phraseEnd = text.search(/[，。！？；]/u);
  const splitAt = phraseEnd >= 0 && phraseEnd < 35 ? phraseEnd + 1 : Math.min(text.length, 35);

  return (
    <p>
      <span className="font-body"><EditorialLineBreaks text={text.slice(0, splitAt)} /></span>
      {splitAt < text.length ? <span className="font-body">{text.slice(splitAt)}</span> : null}
    </p>
  );
}
