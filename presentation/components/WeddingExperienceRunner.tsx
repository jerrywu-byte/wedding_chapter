"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getActiveQuizQuestions, QUIZ_VERSION } from "../../lib/quizData";
import { calculateQuizResult } from "../../lib/quizScoring";
import { rankHallsForBasicInfo } from "../../lib/recommendationEngine";
import { getHallById } from "../../lib/hallData";
import { getPersonalityById } from "../../lib/personalityData";
import { createPersonalityCardPng, triggerPersonalityCardDownload } from "../../lib/personalityCardDownload";
import { BANQUET_PLANNERS } from "../../lib/banquetPlanners";
import { validatePhone } from "../../lib/sessionState";
import { createWeddingChapterSubmission, submitWeddingChapter } from "../../lib/weddingChapterSubmission";
import { ESTIMATED_TABLE_RANGES, getEstimatedTableRange, isEstimatedTableRangeId, tableRangeForLegacyCount } from "../../lib/tableRanges";
import { PersonalityCard } from "../../components/personality/PersonalityCard";
import { EditorialLineBreaks } from "../../components/typography/EditorialLineBreaks";
import type { WeddingExperienceSession, WeddingExperienceStep, WeddingProfile } from "../../types/wedding-experience";
import { experienceMeta, type ExperienceId } from "../shared/experience-types";
import "../styles/wedding-experience-flow.css";
import "../styles/wedding-experience-enhancements.css";
import "../../app/typography.css";

const steps: WeddingExperienceStep[] = ["profile", "opening", "quiz", "personality-result", "venue-result", "ending"];
const blank: WeddingProfile = {
  banquetPlanner: "",
  groomName: "", groomPhone: "", brideName: "", bridePhone: "",
  primaryContactType: "groom", primaryContactName: "", primaryContactPhone: "",
  weddingDate: null, weddingDateUndecided: false, mealPeriod: "", estimatedTables: null, estimatedTableRangeId: "",
};
const newClientSubmissionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `wedding-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const key = (id: ExperienceId) => `wedding-chapter:experience:${id}:v1`;
const validStep = (value: unknown): value is WeddingExperienceStep => steps.includes(value as WeddingExperienceStep);
const experienceUrl = (id: ExperienceId, step: WeddingExperienceStep) => {
  const basePath = globalThis.__WEDDING_CHAPTER_BASE_PATH__;
  return basePath
    ? `${basePath}?step=${step}`
    : `/${id}?step=${step}`;
};

function normalized(profile: WeddingProfile): WeddingProfile {
  if (profile.primaryContactType === "groom") {
    return { ...profile, primaryContactName: profile.groomName, primaryContactPhone: profile.groomPhone };
  }
  if (profile.primaryContactType === "bride") {
    return { ...profile, primaryContactName: profile.brideName, primaryContactPhone: profile.bridePhone };
  }
  return profile;
}

function profileErrors(profile: WeddingProfile) {
  const p = normalized(profile);
  const errors: string[] = [];
  if (!p.banquetPlanner) errors.push("請選擇您的宴會企劃");
  if (!p.groomName.trim()) errors.push("請填寫新郎姓名");
  if (!validatePhone(p.groomPhone)) errors.push("請填寫正確的新郎電話");
  if (!p.brideName.trim()) errors.push("請填寫新娘姓名");
  if (!validatePhone(p.bridePhone)) errors.push("請填寫正確的新娘電話");
  if (!p.primaryContactName.trim()) errors.push("請填寫主要聯絡人姓名");
  if (!validatePhone(p.primaryContactPhone)) errors.push("請填寫正確的主要聯絡人電話");
  if (!p.weddingDateUndecided && !p.weddingDate) errors.push("請選擇婚禮日期，或勾選未決定日期");
  if (!p.mealPeriod) errors.push("請選擇午宴、晚宴或都可以");
  if (!p.estimatedTableRangeId) errors.push("請選擇預計桌數");
  return errors;
}

function recover(raw: Partial<WeddingExperienceSession> | null, id: ExperienceId): WeddingExperienceSession {
  const questions = getActiveQuizQuestions();
  const base: WeddingExperienceSession = {
    version: 2, quizVersion: QUIZ_VERSION, experienceId: id, step: "profile", profile: blank,
    currentQuestionIndex: 0, quizAnswers: [], personalityResult: null,
    venueRecommendations: [], submissionClientId: newClientSubmissionId(),
    submissionNumber: null, submittedAt: null,
  };
  if (!raw) return base;
  const legacy = raw.profile as (Partial<WeddingProfile> & { contactPhone?: string }) | undefined;
  const profile = normalized({
    ...blank,
    ...legacy,
    groomPhone: legacy?.groomPhone || legacy?.contactPhone || "",
    bridePhone: legacy?.bridePhone || legacy?.contactPhone || "",
    weddingDate: legacy?.weddingDate || null,
    estimatedTableRangeId: isEstimatedTableRangeId(legacy?.estimatedTableRangeId)
      ? legacy.estimatedTableRangeId
      : tableRangeForLegacyCount(legacy?.estimatedTables),
  });
  const quizVersionMatches = raw.quizVersion === QUIZ_VERSION;
  let step = validStep(raw.step) ? raw.step : "profile";
  const quizAnswers = quizVersionMatches && Array.isArray(raw.quizAnswers) ? raw.quizAnswers : [];
  const personalityResult = quizVersionMatches ? raw.personalityResult ?? null : null;
  const venueRecommendations = quizVersionMatches && Array.isArray(raw.venueRecommendations) ? raw.venueRecommendations : [];
  if (!quizVersionMatches && step !== "profile") step = "opening";
  if (step !== "profile" && profileErrors(profile).length) step = "profile";
  if (["personality-result", "venue-result", "ending"].includes(step) && !personalityResult?.isComplete) step = "quiz";
  if (["venue-result", "ending"].includes(step) && !venueRecommendations.length) step = "personality-result";
  return {
    ...base, ...raw, version: 2, quizVersion: QUIZ_VERSION, step, profile,
    currentQuestionIndex: Math.max(0, Math.min(Number(raw.currentQuestionIndex) || 0, questions.length - 1)),
    quizAnswers, personalityResult, venueRecommendations,
    submissionClientId: raw.submissionClientId || base.submissionClientId,
    submissionNumber: raw.submissionNumber || null,
    submittedAt: raw.submittedAt || null,
  };
}

export default function WeddingExperienceRunner({ experienceId }: { experienceId: ExperienceId }) {
  const questions = useMemo(() => getActiveQuizQuestions(), []);
  const [session, setSession] = useState<WeddingExperienceSession>(() => recover(null, experienceId));
  const [ready, setReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [detail, setDetail] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState("");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const downloadCardRef = useRef<HTMLElement>(null);

  // Session hydration deliberately runs once after the client storage APIs exist.
  useEffect(() => {
    let raw: Partial<WeddingExperienceSession> | null = null;
    try { raw = JSON.parse(sessionStorage.getItem(key(experienceId)) || "null"); } catch {}
    const urlStep = new URLSearchParams(location.search).get("step");
    if (raw && validStep(urlStep)) raw.step = urlStep;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSession(recover(raw, experienceId));
    localStorage.setItem("wedding-chapter:last-experience", experienceId);
    setReady(true);
  }, [experienceId]);
  useEffect(() => {
    if (!ready) return;
    sessionStorage.setItem(key(experienceId), JSON.stringify(session));
    history.replaceState({ experienceId, step: session.step }, "", experienceUrl(experienceId, session.step));
  }, [ready, session, experienceId]);

  const update = (next: Partial<WeddingExperienceSession>) => setSession(current => ({ ...current, ...next, experienceId }));
  const updateProfile = (next: Partial<WeddingProfile>) => update({ profile: { ...session.profile, ...next } });
  const go = (step: WeddingExperienceStep) => { setErrors([]); setDetail(null); update({ step }); };
  const p = session.profile;
  const result = session.personalityResult?.primaryPersonality;
  const personality = result ? getPersonalityById(result.id) : null;
  const question = questions[session.currentQuestionIndex];
  const dateLabel = p.weddingDateUndecided ? "日期未決定" : p.weddingDate;
  const mealPeriodLabel = p.mealPeriod === "lunch" ? "午宴" : p.mealPeriod === "dinner" ? "晚宴" : "都可以";
  const tableRange = getEstimatedTableRange(p.estimatedTableRangeId);
  const tableRangeLabel = tableRange?.label ?? "尚未選擇";

  const submitProfile = () => {
    const profile = normalized(p);
    const foundErrors = profileErrors(profile);
    setErrors(foundErrors);
    if (!foundErrors.length) update({ profile, step: "opening" });
  };
  const answer = (optionId: string) => update({ quizAnswers: [...session.quizAnswers.filter(item => item.questionId !== question.id), { questionId: question.id, optionId }] });
  const next = () => {
    if (!session.quizAnswers.some(item => item.questionId === question.id)) { setErrors(["請先選擇一個答案"]); return; }
    setErrors([]);
    if (session.currentQuestionIndex < questions.length - 1) update({ currentQuestionIndex: session.currentQuestionIndex + 1 });
    else update({ personalityResult: calculateQuizResult(session.quizAnswers), step: "personality-result" });
  };
  const back = () => {
    if (session.step === "opening") go("profile");
    else if (session.step === "quiz") {
      if (session.currentQuestionIndex) update({ currentQuestionIndex: session.currentQuestionIndex - 1 });
      else go("opening");
    }
    else if (session.step === "personality-result") update({ step: "quiz", currentQuestionIndex: questions.length - 1 });
    else if (session.step === "venue-result") go("personality-result");
    else if (session.step === "ending") go("venue-result");
  };
  const findVenues = () => {
    if (!session.personalityResult) return;
    const found = rankHallsForBasicInfo({ estimatedTables: p.estimatedTables, estimatedTableRange: tableRange, estimatedGuests: null, tableCountUndecided: false }, session.personalityResult);
    update({ venueRecommendations: found.recommendations.slice(0, 3), step: "venue-result" });
  };
  const savePersonalityCard = async () => {
    if (!result || !personality || !downloadCardRef.current) return;
    try {
      setSaveMessage("正在整理人格卡…");
      const node = downloadCardRef.current;
      const image = await createPersonalityCardPng(node);
      await triggerPersonalityCardDownload(image, `Wedding_Chapter_${personality.displayName}_${p.groomName}_${p.brideName}.png`);
      setSaveMessage("人格卡已可儲存為 PNG 圖片");
    } catch {
      setSaveMessage("無法儲存圖片，請確認瀏覽器允許下載後再試一次");
    }
  };
  const completeChapter = async () => {
    if (submitLock.current || session.submissionNumber) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmissionMessage("正在儲存新人資料…");
    try {
      const payload = createWeddingChapterSubmission(session);
      const saved = await submitWeddingChapter(payload);
      update({ submissionNumber: saved.serialNumber, submittedAt: new Date().toISOString() });
      setSubmissionMessage(`資料已儲存，流水編號 ${saved.serialNumber}。`);
    } catch (error) {
      setSubmissionMessage(error instanceof Error ? error.message : "暫時無法送出，請稍後再試。");
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  if (!ready) return <main className={`wx-flow wx-${experienceId}`}><p>正在翻開篇章…</p></main>;
  return <main className={`wx-flow wx-${experienceId}`} data-experience-id={experienceId} data-step={session.step}>
    <div className="wx-ambient" aria-hidden="true"><i/><i/><i/></div>
    <header><span className="wx-wordmark">WEDDING CHAPTER</span><span>{experienceMeta[experienceId].name}</span><b>{steps.indexOf(session.step) + 1} / 6</b></header>

    {session.step === "profile" && <section className="wx-page wx-profile">
      <div className="wx-intro"><small>BEFORE THE STORY</small><h1>先寫下<br/>故事的名字</h1><p>兩人的資料只需填寫一次，之後會直接用來尋找適合的婚禮舞台。</p></div>
      <form onSubmit={event => { event.preventDefault(); submitProfile(); }}>
        <label className="wx-planner" htmlFor="banquet-planner">選擇您的宴會企劃 *
          <select id="banquet-planner" required value={p.banquetPlanner} onChange={event => updateProfile({ banquetPlanner: event.target.value as WeddingProfile["banquetPlanner"] })}>
            <option value="" disabled>請選擇</option>
            {BANQUET_PLANNERS.map(name => <option value={name} key={name}>{name}</option>)}
          </select>
        </label>
        <div className="wx-person"><h2>新郎資料</h2><div className="wx-two">
          <Field label="新郎姓名" value={p.groomName} change={value => updateProfile({ groomName: value })}/>
          <Field label="新郎電話" value={p.groomPhone} change={value => updateProfile({ groomPhone: value })} placeholder="0912345678" type="tel"/>
        </div></div>
        <div className="wx-person"><h2>新娘資料</h2><div className="wx-two">
          <Field label="新娘姓名" value={p.brideName} change={value => updateProfile({ brideName: value })}/>
          <Field label="新娘電話" value={p.bridePhone} change={value => updateProfile({ bridePhone: value })} placeholder="0912345678" type="tel"/>
        </div></div>
        <fieldset><legend>主要聯絡人</legend><div className="wx-radio">
          {([["groom", "新郎"], ["bride", "新娘"], ["other", "其他"]] as const).map(item => <label key={item[0]}><input type="radio" checked={p.primaryContactType === item[0]} onChange={() => updateProfile({ primaryContactType: item[0], primaryContactName: "", primaryContactPhone: "" })}/>{item[1]}</label>)}
        </div></fieldset>
        {p.primaryContactType === "other" && <div className="wx-two">
          <Field label="其他聯絡人姓名" value={p.primaryContactName} change={value => updateProfile({ primaryContactName: value })}/>
          <Field label="其他聯絡人電話" value={p.primaryContactPhone} change={value => updateProfile({ primaryContactPhone: value })} placeholder="0912345678" type="tel"/>
        </div>}
        <div className="wx-two"><div>
          <Field label="婚禮日期" value={p.weddingDate ?? ""} change={value => updateProfile({ weddingDate: value || null, weddingDateUndecided: false })} type="date" disabled={p.weddingDateUndecided} lang="en-CA"/>
          <div className="wx-schedule-row">
            <fieldset className="wx-meal-period"><legend>宴會時段 *</legend><div className="wx-radio">
              {([["lunch", "午宴"], ["dinner", "晚宴"], ["flexible", "都可以"]] as const).map(item => <label key={item[0]}><input type="radio" name="meal-period" checked={p.mealPeriod === item[0]} onChange={() => updateProfile({ mealPeriod: item[0] })}/>{item[1]}</label>)}
            </div></fieldset>
            <label className="wx-check wx-date-undecided"><input type="checkbox" checked={p.weddingDateUndecided} onChange={event => updateProfile({ weddingDateUndecided: event.target.checked, weddingDate: event.target.checked ? null : p.weddingDate })}/> 未決定日期</label>
          </div>
        </div><label>預計桌數<select value={p.estimatedTableRangeId} onChange={event => { const id = event.target.value; const range = isEstimatedTableRangeId(id) ? getEstimatedTableRange(id) : null; updateProfile({ estimatedTableRangeId: isEstimatedTableRangeId(id) ? id : "", estimatedTables: range?.minimum ?? null }); }}><option value="" disabled>請選擇</option>{ESTIMATED_TABLE_RANGES.map(range => <option value={range.id} key={range.id}>{range.label}</option>)}</select></label></div>
        <Errors values={errors}/><button className="wx-primary">進入你們的故事 →</button>
      </form>
    </section>}

    {session.step === "opening" && <section className="wx-page wx-center"><small>YOUR WEDDING CHAPTER</small><h1>{p.groomName} × {p.brideName}</h1><p>在五個故事章節裡，憑直覺選出最像你們的畫面。</p><button className="wx-primary" onClick={() => go("quiz")}>翻開故事 →</button><button className="wx-back" onClick={back}>返回基本資料</button></section>}
    {session.step === "quiz" && <section className="wx-page wx-quiz"><div className="wx-progress"><i style={{ width: `${(session.currentQuestionIndex + 1) / questions.length * 100}%` }}/></div><small>CHAPTER {String(session.currentQuestionIndex + 1).padStart(2, "0")} · {session.currentQuestionIndex + 1} / {questions.length}</small><h1><EditorialLineBreaks text={question.title} /></h1><div className="wx-options" data-question={question.id}>{question.options.map((option, index) => <button className={`wx-option wx-option-${index + 1}`} key={option.optionId} aria-pressed={session.quizAnswers.some(item => item.questionId === question.id && item.optionId === option.optionId)} onClick={() => answer(option.optionId)}><i>{String.fromCharCode(65 + index)}</i><b>{option.text}</b></button>)}</div><Errors values={errors}/><nav><button className="wx-back" onClick={back}>返回</button><button className="wx-primary" onClick={next}>{session.currentQuestionIndex === questions.length - 1 ? "揭曉篇章" : "下一題"} →</button></nav></section>}
    {session.step === "personality-result" && result && <section className="wx-page wx-center wx-personality"><small>THE STORY WITHIN YOU</small>{personality ? <><PersonalityCard personality={personality} coupleNames={`${p.groomName} × ${p.brideName}`} mode="screen"/><div className="wx-download-render" aria-hidden="true"><PersonalityCard ref={downloadCardRef} personality={personality} coupleNames={`${p.groomName} × ${p.brideName}`} mode="download"/></div><div className="wx-card-save"><button onClick={savePersonalityCard}>↓ 將人格卡另存為圖片</button><p role="status" aria-live="polite">{saveMessage}</p></div></> : <article className="personality-card-error"><h1>人格篇章需要重新整理</h1><p>這筆舊資料的人格代碼已無法辨識，請返回最後一題重新揭曉，不會隨機替換成其他人格。</p></article>}<div className="wx-actions"><button className="wx-back" onClick={back}>返回最後一題</button>{personality ? <button className="wx-primary" onClick={findVenues}>尋找故事舞台 →</button> : null}</div></section>}
    {session.step === "venue-result" && <section className="wx-page wx-venues"><small>YOUR STORY STAGES</small><h1>適合你們的婚禮舞台</h1><p>{tableRangeLabel} · {dateLabel}</p><div className="wx-halls">{session.venueRecommendations.map((recommendation, index) => { const hall = getHallById(recommendation.hallId); return <article key={recommendation.hallId}><em>0{index + 1}</em><small>{index === 0 ? "第一推薦" : index === 1 ? "第二推薦" : "第三推薦"}</small><h2>{recommendation.displayName}</h2><p>{recommendation.reasons[1] || recommendation.reasons[0]}</p><b>{hall?.capacity.minimumTables ?? "待確認"}–{hall?.capacity.maximumTables ?? "待確認"} 桌</b><ul>{hall?.features.slice(0, 3).map(feature => <li key={feature}>{feature}</li>)}</ul><button onClick={() => setDetail(detail === recommendation.hallId ? null : recommendation.hallId)}>{detail === recommendation.hallId ? "收起詳細資料" : "查看詳細資料"}</button>{detail === recommendation.hallId && <div>{recommendation.reasons.map(reason => <p key={reason}>{reason}</p>)}</div>}</article>; })}</div><nav><button className="wx-back" onClick={back}>返回人格篇章</button><button className="wx-primary" onClick={() => go("ending")}>完成篇章 →</button></nav></section>}
    {session.step === "ending" && <section className="wx-page wx-center wx-ending"><small>WEDDING CHAPTER</small><h1>{p.groomName} × {p.brideName}</h1><blockquote>「屬於你們的婚禮篇章，已經悄悄展開。」</blockquote><dl><div><dt>宴會企劃</dt><dd>{p.banquetPlanner}</dd></div><div><dt>宴會時段</dt><dd>{mealPeriodLabel}</dd></div><div><dt>人格篇章</dt><dd>{result?.displayName}</dd></div><div><dt>第一推薦</dt><dd>{session.venueRecommendations[0]?.displayName}</dd></div><div><dt>婚禮日期</dt><dd>{dateLabel}</dd></div><div><dt>預計桌數</dt><dd>{tableRangeLabel}</dd></div></dl><p className="wx-routing-note">完成後將交由 {p.banquetPlanner} 接續服務</p>{session.submissionNumber ? <p className="wx-submission-success" role="status">已完成送出<br/><strong>{session.submissionNumber}</strong></p> : null}<p className="wx-submit-message" role="status" aria-live="polite">{submissionMessage}</p><div className="wx-actions"><button className="wx-back" onClick={back}>回到推薦廳房</button><button onClick={() => go("personality-result")}>重新閱讀篇章</button><button className="wx-primary" disabled={submitting || Boolean(session.submissionNumber)} onClick={completeChapter}>{session.submissionNumber ? "已完成" : submitting ? "處理中…" : "完成"}</button></div></section>}
  </main>;
}

function Field({ label, value, change, placeholder, type = "text", disabled = false, lang }: { label: string; value: string; change: (value: string) => void; placeholder?: string; type?: string; disabled?: boolean; lang?: string }) {
  return <label>{label}<input type={type} lang={lang} value={value} disabled={disabled} onChange={event => change(event.target.value)} placeholder={placeholder}/></label>;
}
function Errors({ values }: { values: string[] }) {
  return values.length ? <div className="wx-errors" role="alert">{values.map(value => <p key={value}>{value}</p>)}</div> : null;
}
