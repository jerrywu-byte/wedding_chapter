"use client";

import {
  previewQuestion as question,
  previewPersonality as personality,
  secondaryPersonality,
  proceedToVenue,
  type ExperienceProps,
} from "../../shared/experience-adapter";
import {LineIcon} from "../../shared/LineIcon";
import {PersonalityStoryContent} from "../../../components/personality/PersonalityStoryContent";
import "./experience.css";

export default function BrandColor(props:ExperienceProps){
  return <main className="bc-shell">
    {props.screen==="opening"?<Opening onOpen={()=>props.onNavigate("chapter")}/>:null}
    {props.screen==="chapter"?<InvitationGallery {...props}/>:null}
    {props.screen==="result"?<WeddingCertificate {...props}/>:null}
  </main>;
}

function BrandMark(){
  return <div className="bc-brand-mark">Wedding Chapter</div>;
}

function Opening({onOpen}:{onOpen():void}){
  return <section className="bc-opening bc-reveal">
    <div className="bc-opening-copy">
      <BrandMark/>
      <p className="bc-overline">YOUR WEDDING CHAPTER · VOLUME 01</p>
      <h1><span className="bc-desktop-title">找到屬於<br/>你們的<br/><em>婚禮篇章</em></span><span className="bc-mobile-title">找到屬於你們的<br/><b>婚禮</b><br/><em>篇章</em></span></h1>
      <span className="bc-title-rule" aria-hidden="true"/>
      <p className="bc-intro">五個關於婚禮的故事章節，將你們在意的氛圍、儀式與相聚，整理成一份專屬的 Wedding Identity。</p>
      <button className="bc-editorial-action" type="button" onClick={onOpen}><span>開啟婚禮篇章</span><i aria-hidden="true">01</i></button>
    </div>
    <div className="bc-product-shot" aria-hidden="true">
      <div className="bc-soft-light"/>
      <div className="bc-envelope"/>
      <article className="bc-brand-book">
        <small>WEDDING CHAPTER</small>
        <b>THE<br/>WEDDING<br/>CHAPTER</b>
        <span>IDENTITY / CEREMONY / MEMORY</span>
      </article>
      <article className="bc-invitation-card">
        <span className="bc-invitation-imprint">WEDDING CHAPTER</span>
        <small>THE BEGINNING OF</small>
        <strong>OUR<br/>CHAPTER</strong>
        <i>YOUR WEDDING EDITORIAL</i>
      </article>
    </div>
    <p className="bc-opening-index">EDITORIAL 01 — 03</p>
  </section>;
}

function InvitationGallery(props:ExperienceProps){
  return <section className="bc-chapter bc-reveal">
    <header className="bc-chapter-header"><BrandMark/><span>CHAPTER 01</span><i>01 / 08</i></header>
    <div className="bc-question-heading">
      <h1>{question.title}</h1>
      <span aria-hidden="true"/>
      <small>INVITATION COLLECTION · 請挑選最接近直覺的一款</small>
    </div>
    <div className="bc-invitation-gallery" role="radiogroup" aria-label={question.title}>
      {question.options.map((o,index)=><button
        key={o.optionId}
        type="button"
        role="radio"
        aria-checked={props.selectedOptionId===o.optionId}
        className={`bc-invitation-sample bc-sample-${index+1}`}
        onClick={()=>props.onSelect(o.optionId)}
      >
        <span className="bc-card-frame" aria-hidden="true"/>
        <span className="bc-card-icon"><LineIcon n={index}/></span>
        <b>0{index+1}</b>
        <strong>{o.text}</strong>
        <i className="bc-selected-stamp" aria-hidden="true">SELECTED</i>
      </button>)}
    </div>
    <nav className="bc-reading-navigation" aria-label="篇章導覽">
      <button type="button" onClick={()=>props.onNavigate("opening")}>← 回到上一頁</button>
      <span>WEDDING IDENTITY COLLECTION</span>
      <button type="button" onClick={()=>props.onNavigate("result")}>閱讀下一章 →</button>
    </nav>
  </section>;
}

function WeddingCertificate(props:ExperienceProps){
  const keywords=personality.keywords.slice(0,3);
  return <section className="bc-result bc-certificate-reveal">
    <header className="bc-result-header"><BrandMark/><span>WEDDING IDENTITY / CERTIFICATE 01</span></header>
    <article className="bc-certificate">
      <span className="bc-certificate-border" aria-hidden="true"/>
      <p className="bc-certificate-kicker">YOUR WEDDING IDENTITY</p>
      <h1><small>靜謐月光</small>{personality.displayName}<em>MOONLIT ROMANCE</em></h1>
      <div className="bc-premium-labels">{keywords.map(keyword=><span key={keyword}>{keyword}</span>)}</div>
      <p className="bc-brand-statement">光影、花藝與細節，構成你們婚禮最動人的語言。<br/>溫柔不必喧嘩，自會成為被記住的畫面。</p>
      <div className="bc-identity-summary">
        <section><small>CHAPTER SUMMARY</small><b>{personality.resultCard!.headline}</b></section>
        <section><small>YOUR WEDDING KEYWORDS</small><b>{keywords.join(" · ")}</b></section>
        <section><small>RECOMMENDED ATMOSPHERE</small><b>柔光 · 儀式 · 浪漫</b></section>
        <section><small>FAVORITE SCENE</small><b>光線落下的片刻</b></section>
      </div>
      <p className="bc-secondary-note">你們的婚禮氣質，也帶有一些 {secondaryPersonality.displayName} 的溫度。</p>
    </article>
    <PersonalityStoryContent personality={personality}/>
    <p className="bc-stage-copy">每一種 Wedding Identity，都值得一個能完整呈現它的舞台。</p>
    <nav className="bc-reading-navigation bc-result-navigation" aria-label="結果導覽">
      <button type="button" onClick={()=>props.onNavigate("chapter")}>← 回到上一頁</button>
      <span>WEDDING CHAPTER</span>
      <button type="button" onClick={()=>proceedToVenue(props.embedded)}>尋找故事的舞台 →</button>
    </nav>
  </section>;
}
