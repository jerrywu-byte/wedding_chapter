import { useMemo, useState } from "react";
import type { FollowupCase, FollowupStatus } from "../../types/followup";
import { mockFollowupCases } from "./mockFollowupCases";
import "./followup.css";

const STATUS_OPTIONS: FollowupStatus[] = ["洽談中", "已訂", "退訂", "流失"];

function displayDate(value: string) {
  return value ? value.replaceAll("-", ".") : "尚未填寫";
}

function CaseListItem({
  item,
  selected,
  onSelect,
}: {
  item: FollowupCase;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`followup-case${selected ? " is-selected" : ""}`}
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
    >
      <span className="followup-case__topline">
        <strong>{item.partnerOne}・{item.partnerTwo}</strong>
        <span className={`followup-status-dot status-${item.status}`}>{item.status}</span>
      </span>
      <span className="followup-case__meta">
        <span>{item.requestNo}</span>
        <span>{displayDate(item.eventDate)}</span>
      </span>
    </button>
  );
}

export default function FollowupApp() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(mockFollowupCases[0].id);
  const [mobileDetail, setMobileDetail] = useState(false);
  const [cases, setCases] = useState(mockFollowupCases);
  const [notice, setNotice] = useState("");

  const filteredCases = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase("zh-Hant");
    if (!keyword) return cases;
    return cases.filter((item) =>
      [item.requestNo, item.partnerOne, item.partnerTwo, item.primaryContact, item.phone]
        .some((value) => value.toLocaleLowerCase("zh-Hant").includes(keyword)),
    );
  }, [cases, query]);

  const selectedCase = cases.find((item) => item.id === selectedId) ?? cases[0];

  const updateSelectedCase = (update: (item: FollowupCase) => FollowupCase) => {
    setCases((current) => current.map((item) => (item.id === selectedId ? update(item) : item)));
    setNotice("");
  };

  const selectCase = (id: string) => {
    setSelectedId(id);
    setMobileDetail(true);
    setNotice("");
  };

  return (
    <main className={`followup-shell${mobileDetail ? " followup-shell--detail" : ""}`}>
      <aside className="followup-list-panel" aria-label="新人案件列表">
        <header className="followup-list-header">
          <p className="followup-brand">WEDDING CHAPTER</p>
          <h1>新人案件</h1>
          <p>快速查看與整理每一次洽談。</p>
        </header>

        <label className="followup-search">
          <span className="sr-only">搜尋新人案件</span>
          <span aria-hidden="true">⌕</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋姓名、流水號或電話"
          />
        </label>

        <div className="followup-list-summary">
          <span>案件列表</span>
          <span>{filteredCases.length} 筆</span>
        </div>

        <div className="followup-case-list">
          {filteredCases.map((item) => (
            <CaseListItem
              key={item.id}
              item={item}
              selected={item.id === selectedId}
              onSelect={() => selectCase(item.id)}
            />
          ))}
          {filteredCases.length === 0 && (
            <p className="followup-empty">找不到符合的新人案件。</p>
          )}
        </div>
      </aside>

      <section className="followup-detail-panel" aria-label="案件詳細資料">
        <div className="followup-detail-wrap">
          <button type="button" className="followup-back" onClick={() => setMobileDetail(false)}>
            <span aria-hidden="true">←</span> 返回案件列表
          </button>

          <header className="followup-detail-header">
            <div>
              <p className="followup-eyebrow">CASE DETAIL</p>
              <h2>{selectedCase.partnerOne}<span>＆</span>{selectedCase.partnerTwo}</h2>
              <p>{selectedCase.requestNo}</p>
            </div>
            <span className={`followup-status-badge status-${selectedCase.status}`}>
              {selectedCase.status}
            </span>
          </header>

          <section className="followup-card followup-basic-card">
            <div className="followup-section-heading">
              <span>01</span>
              <div><p>BASIC INFORMATION</p><h3>新人基本資料</h3></div>
            </div>
            <dl className="followup-basic-grid">
              <div><dt>主要聯絡人</dt><dd>{selectedCase.primaryContact}</dd></div>
              <div><dt>聯絡電話</dt><dd>{selectedCase.phone}</dd></div>
              <div><dt>填寫日期</dt><dd>{displayDate(selectedCase.submittedAt)}</dd></div>
              <div><dt>預計婚期</dt><dd>{displayDate(selectedCase.eventDate)}</dd></div>
              <div><dt>預計桌數</dt><dd>{selectedCase.tableCount} 桌</dd></div>
              <div><dt>婚禮人格</dt><dd>{selectedCase.personality}</dd></div>
              <div className="followup-basic-grid__wide"><dt>推薦廳房</dt><dd>{selectedCase.recommendedHall}</dd></div>
            </dl>
          </section>

          <section className="followup-card">
            <div className="followup-section-heading">
              <span>02</span>
              <div><p>CONSULTATION NOTES</p><h3>三次洽談紀錄</h3></div>
            </div>
            <div className="followup-consultations">
              {selectedCase.consultations.map((consultation, index) => (
                <fieldset key={index}>
                  <legend>第{["一", "二", "三"][index]}次洽談</legend>
                  <label>
                    <span>洽談日期</span>
                    <input
                      type="date"
                      value={consultation.date}
                      onChange={(event) => updateSelectedCase((item) => ({
                        ...item,
                        consultations: item.consultations.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, date: event.target.value } : entry,
                        ) as FollowupCase["consultations"],
                      }))}
                    />
                  </label>
                  <label>
                    <span>洽談內容</span>
                    <textarea
                      value={consultation.note}
                      onChange={(event) => updateSelectedCase((item) => ({
                        ...item,
                        consultations: item.consultations.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, note: event.target.value } : entry,
                        ) as FollowupCase["consultations"],
                      }))}
                      placeholder="記錄本次洽談重點…"
                      rows={4}
                    />
                  </label>
                </fieldset>
              ))}
            </div>
          </section>

          <section className="followup-card">
            <div className="followup-section-heading">
              <span>03</span>
              <div><p>CASE STATUS</p><h3>案件狀態</h3></div>
            </div>
            <div className="followup-closing-grid">
              <div>
                <span className="followup-field-label">目前狀態</span>
                <div className="followup-status-options" role="radiogroup" aria-label="案件狀態">
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      role="radio"
                      aria-checked={selectedCase.status === status}
                      className={selectedCase.status === status ? "is-active" : ""}
                      onClick={() => updateSelectedCase((item) => ({ ...item, status }))}
                    >
                      <i aria-hidden="true" />{status}
                    </button>
                  ))}
                </div>
              </div>
              <label className="followup-close-date">
                <span className="followup-field-label">結案日期</span>
                <input
                  type="date"
                  value={selectedCase.closedDate}
                  onChange={(event) => updateSelectedCase((item) => ({
                    ...item,
                    closedDate: event.target.value,
                  }))}
                />
              </label>
            </div>
          </section>

          <footer className="followup-actions">
            <p>Prototype 展示模式｜所有調整只存在於目前畫面</p>
            <button
              type="button"
              onClick={() => setNotice("這是 Phase 1A Prototype，目前不會儲存任何資料。")}
            >
              儲存洽談紀錄
            </button>
            <p className="followup-save-notice" aria-live="polite">{notice}</p>
          </footer>
        </div>
      </section>
    </main>
  );
}
