import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { createPersonalityDownloadUrl } from "../../lib/personalityDownloadUrl";

export interface PersonalityDownloadPanelProps {
  personalityId: string;
  personalityName: string;
  hallIds: string[];
}

export function PersonalityDownloadPanel({ personalityId, personalityName, hallIds }: PersonalityDownloadPanelProps) {
  const [qrCode, setQrCode] = useState("");
  const [qrError, setQrError] = useState("");
  const downloadUrl = useMemo(
    () => createPersonalityDownloadUrl({ personalityId, hallIds }),
    [hallIds, personalityId],
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(downloadUrl, {
      errorCorrectionLevel: "M",
      margin: 2,
      width: 360,
      color: { dark: "#332820ff", light: "#fffaf0ff" },
    })
      .then((image) => { if (active) setQrCode(image); })
      .catch(() => { if (active) setQrError("QR Code 暫時無法產生，請使用備用按鈕開啟。"); });
    return () => { active = false; };
  }, [downloadUrl]);

  return (
    <section className="personality-download-panel">
      <p className="personality-download-panel__kicker">SAVE YOUR CHAPTER</p>
      <h2>你們的婚禮人格已經準備好了</h2>
      <h3>{personalityName}</h3>
      {qrCode ? <img src={qrCode} alt="開啟婚禮人格卡下載頁的 QR Code" /> : null}
      <p>使用手機掃描 QR Code，保存你們的婚禮人格卡</p>
      {qrError ? <p role="status">{qrError}</p> : null}
      <a href={downloadUrl} target="_blank" rel="noopener noreferrer">開啟人格卡下載頁</a>
    </section>
  );
}
