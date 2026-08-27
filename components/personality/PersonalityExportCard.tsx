import { forwardRef } from "react";
import { getHallById } from "../../lib/hallData";
import type { WeddingPersonality } from "../../types/wedding-personality";

export interface PersonalityExportCardProps {
  personality: WeddingPersonality;
  hallIds: string[];
}

export const PersonalityExportCard = forwardRef<HTMLElement, PersonalityExportCardProps>(
  function PersonalityExportCard({ personality, hallIds }, ref) {
    const recommendedHalls = hallIds
      .slice(0, 3)
      .map((hallId) => getHallById(hallId))
      .filter((hall) => hall !== null);

    return (
      <article ref={ref} className="personality-export-card" data-personality-id={personality.id} data-export-ratio="9:16">
        <header className="personality-export-card__header">
          <p>WEDDING CHAPTER</p>
          <span>YOUR WEDDING PERSONALITY</span>
          <h1>{personality.displayName}</h1>
          <h2>{personality.subtitle}</h2>
        </header>

        <div className="personality-export-card__content">
          <section className="personality-export-card__intro">
            <ExportKicker>PERSONALITY STORY</ExportKicker>
            <h3>你們的婚禮故事</h3>
            <p>{personality.description}</p>
          </section>

          {personality.aiSecret ? (
            <section className="personality-export-card__ai">
              <ExportKicker>AI QUIETLY NOTICED</ExportKicker>
              <h3>AI 偷偷發現</h3>
              <p>{personality.aiSecret}</p>
            </section>
          ) : null}

          <section>
            <ExportKicker>WEDDING FIELD NOTES</ExportKicker>
            <h3>婚禮現場觀察</h3>
            <ol>{(personality.observations ?? []).map((observation) => <li key={observation}>{observation}</li>)}</ol>
          </section>

          <section>
            <ExportKicker>A LITTLE WEDDING SCENE</ExportKicker>
            <h3>婚禮流程小劇場</h3>
            {personality.scene?.speaker ? <b>{personality.scene.speaker}</b> : null}
            <ul>{(personality.scene?.lines ?? []).map((line) => <li key={line}>{line}</li>)}</ul>
          </section>

          {personality.specialAbility ? (
            <section className="personality-export-card__ability">
              <ExportKicker>SPECIAL ABILITY</ExportKicker>
              <h3>人格特殊能力</h3>
              <p><span>{personality.specialAbility.label}</span><strong>{personality.specialAbility.value}</strong></p>
            </section>
          ) : null}

          <section className="personality-export-card__halls">
            <ExportKicker>STORY STAGES</ExportKicker>
            <h3>推薦廳房</h3>
            <div>
              {recommendedHalls.length
                ? recommendedHalls.map((hall, index) => <p key={hall.id}><span>0{index + 1}</span>{hall.displayName}</p>)
                : <p><span>—</span>請由宴會顧問協助確認</p>}
            </div>
          </section>
        </div>
        <footer>典華幸福機構 · WEDDING CHAPTER</footer>
      </article>
    );
  },
);

function ExportKicker({ children }: { children: string }) {
  return <p className="personality-export-card__kicker">{children}</p>;
}
