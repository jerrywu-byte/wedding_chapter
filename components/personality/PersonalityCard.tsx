import { Fragment, forwardRef } from "react";
import type { WeddingPersonality } from "../../types/wedding-personality";
import { EditorialLineBreaks } from "../typography/EditorialLineBreaks";

export interface PersonalityCardProps {
  personality: WeddingPersonality;
  coupleNames: string;
  mode: "screen";
}

export const PersonalityCard = forwardRef<HTMLElement, PersonalityCardProps>(
  function PersonalityCard({ personality, coupleNames, mode }, ref) {
    const observations = personality.observations ?? [];
    const sceneLines = personality.scene?.lines ?? [];

    return (
      <article
        ref={ref}
        className={`personality-card personality-card--${mode}`}
        data-personality-id={personality.id}
        data-card-mode={mode}
      >
        <header className="personality-card__hero">
          <div className="personality-card__hero-copy">
            <div className="personality-card__starlight" aria-hidden="true" />
            <p className="personality-card__brand">WEDDING CHAPTER</p>
            {personality.specialAbility ? (
              <div className="personality-card__hero-ability">
                <span>人格特殊能力</span>
                <p>
                  <b>{personality.specialAbility.label}</b>
                  <strong>{personality.specialAbility.value}</strong>
                </p>
              </div>
            ) : null}
            <h1
              className={
                personality.displayName.length >= 5
                  ? "personality-card__name personality-card__name--long"
                  : "personality-card__name"
              }
            >
              {personality.displayName}
            </h1>
            <p className="personality-card__tagline">
              <EditorialLineBreaks text={personality.subtitle} />
            </p>
            <small>{coupleNames}</small>
          </div>
        </header>

        <div className="personality-card__body">
          <section className="personality-card__intro">
            <Kicker>PERSONALITY STORY</Kicker>
            <h2>你們的婚禮故事</h2>
            <p><FixedLineBreaks text={personality.description} /></p>
          </section>

          <section className="personality-card__direction">
            <Kicker>RECOMMENDED DIRECTION</Kicker>
            <h2>推薦廳房方向</h2>
            <ul>
              {personality.preferredFeatures.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
          </section>

          <section className="personality-card__observations">
            <Kicker>WEDDING FIELD NOTES</Kicker>
            <h2>婚禮現場觀察</h2>
            <ol>
              {observations.map((observation) => (
                <li key={observation}>{observation}</li>
              ))}
            </ol>
          </section>

          <section className="personality-card__scene">
            <Kicker>A LITTLE WEDDING SCENE</Kicker>
            <h2>婚禮流程小劇場</h2>
            {personality.scene?.speaker ? <p>{personality.scene.speaker}</p> : null}
            <ul>
              {sceneLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </section>

          {personality.aiSecret ? (
            <aside className="personality-card__secret">
              <Kicker>AI QUIETLY NOTICED</Kicker>
              <h2>AI 偷偷發現</h2>
              <AiSecretText text={personality.aiSecret} />
            </aside>
          ) : null}
        </div>
      </article>
    );
  },
);

function Kicker({ children }: { children: string }) {
  return <p className="personality-card__kicker">{children}</p>;
}

function FixedLineBreaks({ text }: { text: string }) {
  return text.split("\n").map((line, index) => (
    <Fragment key={`${index}-${line}`}>
      {index > 0 ? <br /> : null}
      {line}
    </Fragment>
  ));
}

function AiSecretText({ text }: { text: string }) {
  const phraseEnd = text.search(/[，。！？；]/u);
  const splitAt = phraseEnd >= 0 && phraseEnd < 35 ? phraseEnd + 1 : Math.min(text.length, 35);
  const brandPhrase = text.slice(0, splitAt);
  const explanation = text.slice(splitAt);

  return (
    <p>
      <span className="font-body"><EditorialLineBreaks text={brandPhrase} /></span>
      {explanation ? <span className="font-body">{explanation}</span> : null}
    </p>
  );
}
