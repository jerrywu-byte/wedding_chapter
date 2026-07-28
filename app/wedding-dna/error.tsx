"use client";
import { useEffect } from "react";

export default function WeddingDnaError({ reset }: { error: Error & { digest?: string }; reset(): void }) {
  useEffect(() => { console.error("[Wedding DNA page error]"); }, []);
  return <main className="dna-shell"><section className="dna-step analyzing"><p className="eyebrow">WEDDING DNA</p><h1>資料暫時沒有準備好</h1><p>廳房、題目或人格資料載入時遇到問題。已填寫的內容仍保存在這台裝置，請稍後再試。</p><button className="dna-primary" onClick={reset}>重新載入</button></section></main>;
}
