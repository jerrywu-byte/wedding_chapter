"use client";
import { copy } from "../../shared/story-copy";
import { previewQuestion as q, previewPersonality as p, secondaryPersonality as s, proceedToVenue, type ExperienceProps } from "../../shared/experience-adapter";
import { LineIcon } from "../../shared/LineIcon";
import "./experience.css";

export default function MoonlitOracle(x: ExperienceProps) {
  return <main className={`mo-shell mo-screen-${x.screen}`}>
    <div className="mo-photo" aria-hidden="true" />
    <div className="mo-vignette" aria-hidden="true" />
    {x.screen === "opening" ? <section className="mo-opening">
      <div className="mo-opening-copy">
        <p>{copy.eyebrow}</p>
        <h1>循著夜色，<br />走進你們的<br /><em>婚禮篇章。</em></h1>
        <small>{copy.intro}</small>
        <button className="mo-primary" onClick={() => x.onNavigate("chapter")}>{copy.open}<span>→</span></button>
      </div>
      <aside className="mo-oracle-mark" aria-label="Moonlit Oracle">
        <span>✦</span><b>MOONLIT<br />ORACLE</b><small>THE STORY OF TWO</small>
      </aside>
      <p className="mo-scroll">SCROLL INTO THE NIGHT <i /></p>
    </section> : x.screen === "chapter" ? <section className="mo-chapter">
      <div className="mo-ritual">
        <header><span>✦</span><p>CHAPTER 01<br /><b>夜色裡的第一個直覺</b></p><span>01 / 06</span></header>
        <div className="mo-question"><p>LISTEN TO YOUR FIRST INSTINCT</p><h1>{q.title}</h1></div>
        <div className="mo-orbit" role="radiogroup" aria-label={q.title}>{q.options.map((o, i) => <button key={o.optionId} role="radio" aria-checked={x.selectedOptionId === o.optionId} onClick={() => x.onSelect(o.optionId)}><span><LineIcon n={i} /></span><b>{["新月", "上弦", "滿月", "殘月"][i]}</b><small>{o.text}</small></button>)}</div>
        <nav><button onClick={() => x.onNavigate("opening")}>{copy.back}</button><i>✦ ───── ✦</i><button className="mo-primary" onClick={() => x.onNavigate("result")}>{copy.next}<span>→</span></button></nav>
      </div>
    </section> : <section className="mo-result">
      <div className="mo-result-card">
        <p>{copy.resultEyebrow}</p><span className="mo-result-moon">✦</span>
        <h1>{p.displayName}</h1><h2>{p.resultCard!.headline}</h2>
        <article><p>{p.description}</p><div>{p.keywords.slice(0, 5).map(k => <span key={k}>{k}</span>)}</div><small>星圖邊緣，也映著 {s.displayName} 的光。</small></article>
        <blockquote>{copy.stage}</blockquote>
        <nav><button onClick={() => x.onNavigate("chapter")}>{copy.back}</button><button className="mo-primary" onClick={() => proceedToVenue(x.embedded)}>{copy.stageAction}<span>→</span></button></nav>
      </div>
    </section>}
  </main>;
}
