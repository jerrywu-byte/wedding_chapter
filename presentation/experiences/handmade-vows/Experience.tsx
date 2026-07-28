"use client";
/* eslint-disable @next/next/no-img-element -- transparent photographic props must stay unoptimized in the Vinext worker preview */

import type {ReactNode} from "react";
import {copy} from "../../shared/story-copy";
import {
  previewQuestion as question,
  previewPersonality as personality,
  secondaryPersonality,
  proceedToVenue,
  type ExperienceProps,
} from "../../shared/experience-adapter";
import "./experience.css";

const PaperSheet=({className="",children}:{className?:string;children?:ReactNode})=><div className={`hv-paper-material ${className}`}>{children}</div>;

export default function HandmadeVows(props:ExperienceProps){
  return <main className="hv-worktable">
    {props.screen==="opening"?<Opening onOpen={()=>props.onNavigate("chapter")}/>:null}
    {props.screen==="chapter"?<Chapter {...props}/>:null}
    {props.screen==="result"?<Result {...props}/>:null}
  </main>;
}

function Opening({onOpen}:{onOpen():void}){
  return <section className="hv-opening-scene hv-scene-enter">
    <div className="hv-opening-story">
      <p className="hv-imprint">{copy.brand}<span>HANDMADE WEDDING EDITORIAL</span></p>
      <h1>把兩個人的日常，<br/>寫成一頁<em>婚禮誓詞</em></h1>
      <p className="hv-opening-copy">循著直覺，慢慢翻閱幾個關於婚禮的片段。<br/>這裡沒有標準答案，只有你們想留下的樣子。</p>
      <button className="hv-paper-tab" type="button" onClick={onOpen}><span>翻開這份誓詞</span><i aria-hidden="true">01</i></button>
    </div>
    <div className="hv-vow-stack">
      <PaperSheet className="hv-stack-sheet hv-stack-third"/>
      <PaperSheet className="hv-stack-sheet hv-stack-second"/>
      <PaperSheet className="hv-vow-cover">
        <small>OUR HANDMADE VOWS</small>
        <span className="hv-cover-rule"/>
        <h2>THE STORY<br/>OF TWO</h2>
        <p>一份寫給婚禮以前，<br/>也寫給往後日子的誓詞。</p>
        <b>月光詩人</b>
      </PaperSheet>
      <img className="hv-babys-breath hv-opening-flower" src="/handmade/dried-babys-breath.png" alt="" aria-hidden="true" width="1254" height="1254"/>
      <span className="hv-wax-seal" aria-hidden="true">W</span>
    </div>
  </section>;
}

function Chapter(props:ExperienceProps){
  return <section className="hv-chapter-scene hv-paper-drop">
    <header className="hv-chapter-index"><span>HANDMADE VOWS</span><b>Chapter 01</b><i>01 / 08</i></header>
    <PaperSheet className="hv-manuscript">
      <h1>{question.title}</h1>
      <span className="hv-pencil-rule" aria-hidden="true"/>
      <small>選一張最接近直覺的紙片</small>
    </PaperSheet>
    <div className="hv-choice-scatter" role="radiogroup" aria-label={question.title}>
      {question.options.map((o,index)=><button
        key={o.optionId}
        type="button"
        role="radio"
        aria-checked={props.selectedOptionId===o.optionId}
        className={`hv-note hv-note-${index+1}`}
        onClick={()=>props.onSelect(o.optionId)}
      >
        <b>0{index+1}</b>
        <span>{o.text}</span>
        <i className="hv-pencil-circle" aria-hidden="true">選</i>
      </button>)}
    </div>
    <img className="hv-babys-breath hv-chapter-flower" src="/handmade/dried-babys-breath.png" alt="" aria-hidden="true" width="1254" height="1254"/>
    <nav className="hv-paper-navigation" aria-label="篇章導覽">
      <button type="button" onClick={()=>props.onNavigate("opening")}>回到前頁</button>
      <button type="button" onClick={()=>props.onNavigate("result")}>繼續翻閱 <span aria-hidden="true">→</span></button>
    </nav>
  </section>;
}

function Result(props:ExperienceProps){
  return <section className="hv-result-scene hv-page-reveal">
    <div className="hv-result-stack">
      <PaperSheet className="hv-result-underlay hv-result-underlay-one"/>
      <PaperSheet className="hv-result-underlay hv-result-underlay-two"/>
      <PaperSheet className="hv-finished-vow">
        <p className="hv-result-kicker">{copy.resultEyebrow}</p>
        <h1><small>你們的篇章是</small>{personality.displayName}</h1>
        <h2>{personality.resultCard!.headline}</h2>
        <p className="hv-vow-story">{personality.description}</p>
        <div className="hv-keyword-line">{personality.keywords.slice(0,5).map(keyword=><span key={keyword}>{keyword}</span>)}</div>
        <p className="hv-margin-note">頁邊還留著一些<br/><b>{secondaryPersonality.displayName}</b> 的溫柔筆跡。</p>
        <blockquote>{copy.stage}</blockquote>
      </PaperSheet>
      <img className="hv-babys-breath hv-result-flower" src="/handmade/dried-babys-breath.png" alt="" aria-hidden="true" width="1254" height="1254"/>
      <span className="hv-wax-seal hv-result-seal" aria-hidden="true">W</span>
    </div>
    <nav className="hv-paper-navigation hv-result-navigation" aria-label="結果導覽">
      <button type="button" onClick={()=>props.onNavigate("chapter")}>回到前頁</button>
      <button type="button" onClick={()=>proceedToVenue(props.embedded)}>尋找故事發生的地方 <span aria-hidden="true">→</span></button>
    </nav>
  </section>;
}
