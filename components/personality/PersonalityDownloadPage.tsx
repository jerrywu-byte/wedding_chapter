import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { getPersonalityById } from "../../lib/personalityData";
import { createPersonalityCardPng, triggerPersonalityCardDownload } from "../../lib/personalityCardDownload";
import type { PersonalityDownloadState } from "../../lib/personalityDownloadUrl";
import { PersonalityExportCard } from "./PersonalityExportCard";

export function PersonalityDownloadPage({ state }: { state: PersonalityDownloadState }) {
  const personality = getPersonalityById(state.personalityId);
  const cardRef = useRef<HTMLElement>(null);
  const [imageBlob, setImageBlob] = useState<Blob | null>(null);
  const [imageUrl, setImageUrl] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [message, setMessage] = useState("正在準備手機直式人格卡…");

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(window.location.href, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
      color: { dark: "#332820ff", light: "#fffaf0ff" },
    }).then((image) => { if (active) setQrCode(image); }).catch(() => {});
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!personality || !cardRef.current) return;
    let active = true;
    let objectUrl = "";
    createPersonalityCardPng(cardRef.current)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setImageBlob(blob);
        setImageUrl(objectUrl);
        setMessage("");
      })
      .catch(() => { if (active) setMessage("人格卡暫時無法產生，請稍後重新整理。") });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [personality, state.hallIds]);

  if (!personality) {
    return <main className="personality-download-page personality-download-page--error"><h1>找不到這張婚禮人格卡</h1><p>請回到 Wedding Chapter 重新完成測驗。</p></main>;
  }

  const download = () => {
    if (!imageBlob) return;
    triggerPersonalityCardDownload(imageBlob, `Wedding_Chapter_${personality.displayName}`);
  };

  return (
    <main className="personality-download-page">
      <section className="personality-download-page__desktop">
        <p>WEDDING CHAPTER</p>
        <h1>你們的婚禮人格已經準備好了</h1>
        <h2>{personality.displayName}</h2>
        {qrCode ? <img src={qrCode} alt="婚禮人格卡下載頁 QR Code" /> : null}
        <p>使用手機掃描 QR Code，保存你們的婚禮人格卡</p>
        <button type="button" disabled={!imageBlob} onClick={download}>備用下載 PNG</button>
      </section>
      <section className="personality-download-page__mobile">
        <header><p>WEDDING CHAPTER</p><h1>{personality.displayName}</h1></header>
        {imageUrl ? <img src={imageUrl} alt={`${personality.displayName}手機直式婚禮人格卡`} /> : <p role="status">{message}</p>}
        <button type="button" disabled={!imageBlob} onClick={download}>下載圖片</button>
        <p>也可以長按圖片，選擇「儲存到照片」。</p>
      </section>
      <div className="personality-export-render" aria-hidden="true">
        <PersonalityExportCard ref={cardRef} personality={personality} hallIds={state.hallIds} />
      </div>
    </main>
  );
}
