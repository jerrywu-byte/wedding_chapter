"use client";
import hallJson from "../../data/halls.json";
import type { HallsData, Hall } from "../../types/hall";
import type { RankedHallByQuiz } from "../../lib/recommendationEngine";
import { PrimaryButton } from "./Ui";

const data = hallJson as unknown as HallsData;
export const hallById = (id: string) => data.halls.find((hall) => hall.id === id);
const range = (a: number | null, b: number | null) => a === null || b === null ? "待確認" : `${a}–${b} 桌`;
export const capacityText = (hall: Hall) => range(hall.capacity.minimumTables, hall.capacity.maximumTables);
export const comfortText = (hall: Hall) => range(hall.capacity.comfortableMinimumTables, hall.capacity.comfortableMaximumTables);

export function HallRecommendationCard({ result, rank, compared, onCompare, onDetail }: { result: RankedHallByQuiz; rank?: number; compared: boolean; onCompare(): void; onDetail(): void }) {
  const hall = hallById(result.hallId)!;
  const labels = ["最符合你", "另一種可能", "驚喜選擇"];
  return <article className="hall-card">
    <div className="hall-card-top"><div>{rank ? <b>#{rank} {labels[rank - 1]}</b> : <b className="manual">容量需確認</b>}<h3>{hall.displayName}</h3><p>{hall.floor ?? "樓層待確認"}</p></div><span className="score">{result.normalizedScore}%</span></div>
    <dl><div><dt>可承接桌數</dt><dd>{capacityText(hall)}</dd></div><div><dt>舒適桌數</dt><dd>{comfortText(hall)}</dd></div></dl>
    <ul>{result.reasons.slice(0, 3).map((reason) => <li key={reason}>{reason}</li>)}</ul>
    {result.warnings.map((warning) => <p className="warning" key={warning}>{warning}</p>)}
    <div className="card-buttons"><button onClick={onDetail}>查看詳情</button><button onClick={onCompare}>{compared ? "移出比較" : "加入比較"}</button></div>
  </article>;
}

const equipmentLabels: [keyof Hall["equipment"], string][] = [["ledScreen","LED 電視牆"],["projector","投影設備"],["tv","電視"],["soundSystem","音響系統"],["microphone","麥克風"],["starLightAisle","星光走道"],["aerialCableEntrance","空中纜車"],["loft","空中閣樓"],["secondStage","第二舞台"]];
export function HallDetailModal({ result, onClose }: { result: RankedHallByQuiz | null; onClose(): void }) {
  if (!result) return null; const hall = hallById(result.hallId)!;
  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section className="detail-modal" role="dialog" aria-modal="true" aria-label={`${hall.displayName}詳情`} onMouseDown={(e) => e.stopPropagation()}>
    <button className="modal-close" onClick={onClose} aria-label="關閉">×</button><p className="eyebrow">{hall.floor ?? "樓層待確認"}</p><h2>{hall.displayName}</h2>
    <div className="detail-grid"><div><h3>容量</h3><p>可承接：{capacityText(hall)}</p><p>舒適：{comfortText(hall)}</p></div><div><h3>風格</h3><p>{hall.style.designStyles.join("、") || "資料待確認"}</p></div></div>
    <h3>場地特色</h3><ul>{hall.features.length ? hall.features.map((x)=><li key={x}>{x}</li>) : <li>資料待確認</li>}</ul>
    <h3>設備</h3><ul>{equipmentLabels.map(([key,label]) => hall.equipment[key] === true ? <li key={key}>{label}{key === "ledScreen" && hall.equipment.ledScreenSizeInches ? ` ${hall.equipment.ledScreenSizeInches} 吋` : ""}{key === "tv" && hall.equipment.tvSizeInches ? ` ${hall.equipment.tvSizeInches} 吋` : ""}</li> : hall.equipment[key] === null ? <li key={key}>{label}：資料待確認</li> : null)}{hall.equipment.hangingGiftDeviceCount ? <li>空中鉛錘 {hall.equipment.hangingGiftDeviceCount} 組</li> : null}</ul>
    <h3>進場方式</h3><p>{hall.recommendedFor.entranceMethods.join("、") || "資料待確認"}</p><h3>推薦理由</h3><ul>{result.reasons.map((x)=><li key={x}>{x}</li>)}</ul><h3>婚禮顧問重點</h3><ul>{hall.salesNotes.sellingPoints.map((x)=><li key={x}>{x}</li>)}</ul>
    <PrimaryButton onClick={onClose}>關閉詳情</PrimaryButton>
  </section></div>;
}
