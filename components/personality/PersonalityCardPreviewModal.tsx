"use client";

export interface PersonalityCardPreview {
  url: string;
  file: File;
  canShareFile: boolean;
}

interface PersonalityCardPreviewModalProps {
  preview: PersonalityCardPreview;
  shareMessage: string;
  onShare: () => void;
  onClose: () => void;
}

export function PersonalityCardPreviewModal({
  preview,
  shareMessage,
  onShare,
  onClose,
}: PersonalityCardPreviewModalProps) {
  return <div className="personality-card-preview-backdrop" role="presentation">
    <section
      className="personality-card-preview-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="personality-card-preview-title"
    >
      <h2 id="personality-card-preview-title">人格卡圖片預覽</h2>
      <p>請長按圖片儲存，或使用下方按鈕分享</p>
      <div className="personality-card-preview-image">
        <img src={preview.url} alt="Wedding Chapter 人格卡預覽" />
      </div>
      {!preview.canShareFile
        ? <p className="personality-card-preview-note">此瀏覽器無法直接開啟儲存選單，請長按圖片後選擇儲存圖片。</p>
        : null}
      {shareMessage ? <p className="personality-card-preview-note" role="status" aria-live="polite">{shareMessage}</p> : null}
      <div className="personality-card-preview-actions">
        {preview.canShareFile
          ? <button className="wx-primary" type="button" onClick={onShare}>分享／儲存</button>
          : null}
        <button type="button" onClick={onClose}>關閉</button>
      </div>
    </section>
  </div>;
}
