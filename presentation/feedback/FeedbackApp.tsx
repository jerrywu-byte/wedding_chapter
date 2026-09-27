import { FormEvent, useMemo, useState } from "react";
import {
  emptyFeedbackAnswers,
  feedbackQuestions,
  type FeedbackAnswers,
} from "./feedbackQuestions";
import "./feedback.css";

const REQUIRED_MESSAGE = "這題還沒完成，請選擇最符合您感受的答案。";

function ChoiceGroup({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="feedback-choice-grid" role="radiogroup" aria-label={name}>
      {options.map((option) => {
        const selected = value === option;
        return (
          <button
            key={option}
            type="button"
            className={`feedback-choice ${selected ? "is-selected" : ""}`}
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option)}
          >
            <span>{option}</span>
            <i aria-hidden="true">{selected ? "✓" : ""}</i>
          </button>
        );
      })}
    </div>
  );
}

function MultiChoiceGroup({
  name,
  values,
  options,
  onToggle,
}: {
  name: string;
  values: string[];
  options: readonly string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="feedback-multi-grid" aria-label={name}>
      {options.map((option) => {
        const selected = values.includes(option);
        return (
          <button
            key={option}
            type="button"
            className={`feedback-multi ${selected ? "is-selected" : ""}`}
            aria-pressed={selected}
            onClick={() => onToggle(option)}
          >
            <i aria-hidden="true">{selected ? "✓" : ""}</i>
            <span>{option}</span>
          </button>
        );
      })}
    </div>
  );
}

export default function FeedbackApp() {
  const [answers, setAnswers] = useState<FeedbackAnswers>(emptyFeedbackAnswers);
  const [submitted, setSubmitted] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const errors = useMemo(
    () => ({
      q1: !answers.q1,
      q2: !answers.q2,
      q3: !answers.q3,
      q4: answers.q4.length === 0,
      q5: answers.q5.length === 0,
    }),
    [answers],
  );

  const isComplete = !Object.values(errors).some(Boolean);

  function setSingle(key: "q1" | "q2" | "q3", value: string) {
    setAnswers((current) => ({ ...current, [key]: value }));
  }

  function toggleMulti(key: "q4" | "q5", value: string) {
    setAnswers((current) => {
      const values = current[key];
      let next = values.includes(value)
        ? values.filter((item) => item !== value)
        : [...values, value];

      if (key === "q4") {
        if (value === "目前沒有特別猶豫" && !values.includes(value)) {
          next = ["目前沒有特別猶豫"];
        } else if (value !== "目前沒有特別猶豫") {
          next = next.filter((item) => item !== "目前沒有特別猶豫");
        }
      }

      return { ...current, [key]: next };
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAttempted(true);

    if (!isComplete) {
      requestAnimationFrame(() => {
        document.querySelector<HTMLElement>(".feedback-question.has-error")?.focus();
      });
      return;
    }

    setSubmitted(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (submitted) {
    return (
      <main className="feedback-page feedback-page--success">
        <section className="feedback-success-card" aria-live="polite">
          <div className="feedback-success-mark">✓</div>
          <p className="feedback-kicker">WEDDING CHAPTER</p>
          <h1>謝謝您的回饋</h1>
          <p>
            您的意見我們已經收到。
            <br />
            謝謝您今天來到新莊典華，
            <br />
            期待有機會陪你們一起完成屬於自己的婚禮。
          </p>
          <span>新莊典華</span>
        </section>
      </main>
    );
  }

  return (
    <main className="feedback-page">
      <header className="feedback-hero">
        <p className="feedback-kicker">WEDDING CHAPTER</p>
        <h1>婚禮體驗日・活動回饋</h1>
        <p className="feedback-intro">
          感謝您蒞臨新莊典華參觀與洽談。
          <br />
          為提供更符合您期待的宴會服務，誠摯邀請您留下本次洽談後的感受與建議。
        </p>
        <div className="feedback-time">約 1 分鐘即可完成</div>
      </header>

      <form className="feedback-form" onSubmit={handleSubmit} noValidate>
        <section className="feedback-section" aria-labelledby="feedback-section-1">
          <div className="feedback-section-heading">
            <span>01</span>
            <div>
              <p>CONSULTATION</p>
              <h2 id="feedback-section-1">洽談感受</h2>
            </div>
          </div>

          {(["q1", "q2", "q3"] as const).map((key, index) => (
            <article
              key={key}
              className={`feedback-question ${attempted && errors[key] ? "has-error" : ""}`}
              tabIndex={-1}
            >
              <div className="feedback-question-title">
                <span>Q{index + 1}</span>
                <h3>{feedbackQuestions[key].title}</h3>
              </div>
              <ChoiceGroup
                name={`Q${index + 1}`}
                value={answers[key]}
                options={feedbackQuestions[key].options}
                onChange={(value) => setSingle(key, value)}
              />
              {attempted && errors[key] ? <p className="feedback-error">{REQUIRED_MESSAGE}</p> : null}
            </article>
          ))}
        </section>

        <section className="feedback-section" aria-labelledby="feedback-section-2">
          <div className="feedback-section-heading">
            <span>02</span>
            <div>
              <p>YOUR THOUGHTS</p>
              <h2 id="feedback-section-2">您目前的想法</h2>
            </div>
          </div>

          <article
            className={`feedback-question ${attempted && errors.q4 ? "has-error" : ""}`}
            tabIndex={-1}
          >
            <div className="feedback-question-title">
              <span>Q4</span>
              <div>
                <h3>{feedbackQuestions.q4.title}</h3>
                <p>可複選</p>
              </div>
            </div>
            <MultiChoiceGroup
              name="Q4"
              values={answers.q4}
              options={feedbackQuestions.q4.options}
              onToggle={(value) => toggleMulti("q4", value)}
            />
            {answers.q4.includes("其他") ? (
              <label className="feedback-other">
                <span>其他原因</span>
                <input
                  value={answers.q4Other}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, q4Other: event.target.value }))
                  }
                  placeholder="請告訴我們其他考量…"
                  maxLength={120}
                />
              </label>
            ) : null}
            {attempted && errors.q4 ? <p className="feedback-error">{REQUIRED_MESSAGE}</p> : null}
          </article>

          <article
            className={`feedback-question ${attempted && errors.q5 ? "has-error" : ""}`}
            tabIndex={-1}
          >
            <div className="feedback-question-title">
              <span>Q5</span>
              <div>
                <h3>{feedbackQuestions.q5.title}</h3>
                <p>可複選</p>
              </div>
            </div>
            <MultiChoiceGroup
              name="Q5"
              values={answers.q5}
              options={feedbackQuestions.q5.options}
              onToggle={(value) => toggleMulti("q5", value)}
            />
            {answers.q5.includes("其他") ? (
              <label className="feedback-other">
                <span>其他原因</span>
                <input
                  value={answers.q5Other}
                  onChange={(event) =>
                    setAnswers((current) => ({ ...current, q5Other: event.target.value }))
                  }
                  placeholder="想補充的好印象…"
                  maxLength={120}
                />
              </label>
            ) : null}
            {attempted && errors.q5 ? <p className="feedback-error">{REQUIRED_MESSAGE}</p> : null}
          </article>
        </section>

        <section className="feedback-section" aria-labelledby="feedback-section-3">
          <div className="feedback-section-heading">
            <span>03</span>
            <div>
              <p>ONE MORE THING</p>
              <h2 id="feedback-section-3">想對我們說的話</h2>
            </div>
          </div>

          <article className="feedback-question">
            <div className="feedback-question-title">
              <span>Q6</span>
              <div>
                <h3>{feedbackQuestions.q6.title}</h3>
                <p>選填</p>
              </div>
            </div>
            <textarea
              value={answers.q6}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, q6: event.target.value }))
              }
              placeholder="歡迎留下您的想法…"
              maxLength={500}
            />
          </article>

          <article className="feedback-question">
            <div className="feedback-question-title">
              <span>Q7</span>
              <div>
                <h3>{feedbackQuestions.q7.title}</h3>
                <p>選填</p>
              </div>
            </div>
            <p className="feedback-helper">{feedbackQuestions.q7.helper}</p>
            <textarea
              value={answers.q7}
              onChange={(event) =>
                setAnswers((current) => ({ ...current, q7: event.target.value }))
              }
              placeholder="想告訴我們什麼都可以…"
              maxLength={500}
            />
          </article>
        </section>

        <footer className="feedback-submit-area">
          {attempted && !isComplete ? (
            <p className="feedback-submit-warning">還有幾題尚未完成，請確認 Q1～Q5。</p>
          ) : (
            <p>Q1～Q5 為必填，Q6～Q7 可自由填寫。</p>
          )}
          <button type="submit">送出我的回饋</button>
          <small>您的意見僅供服務改善與後續洽談參考使用</small>
        </footer>
      </form>
    </main>
  );
}
