"use client";

import { useState } from "react";

export function VenuePhoto({ src, displayName }: { src: string | null; displayName: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return <div className="wx-hall-photo">
    {src && src !== failedSrc
      ? <img src={src} alt={`${displayName}廳房空間`} loading="lazy" onError={() => setFailedSrc(src)} />
      : <div className="wx-hall-photo-placeholder">
        <small>WEDDING CHAPTER</small>
        <strong>{displayName}</strong>
        <span>場地照片準備中</span>
      </div>}
  </div>;
}
