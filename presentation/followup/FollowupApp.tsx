import { useEffect } from "react";
import "./followup.css";

const configuredWebAppUrl = import.meta.env.VITE_FOLLOWUP_APPS_SCRIPT_WEB_APP_URL?.trim() ?? "";

function getFollowupWebAppUrl() {
  if (!configuredWebAppUrl) return "";

  try {
    const url = new URL(configuredWebAppUrl);
    const isGoogleHost =
      url.hostname === "script.google.com" || url.hostname.endsWith(".googleusercontent.com");
    return url.protocol === "https:" && isGoogleHost ? url.toString() : "";
  } catch {
    return "";
  }
}

export default function FollowupApp() {
  const webAppUrl = getFollowupWebAppUrl();

  useEffect(() => {
    if (webAppUrl) window.location.replace(webAppUrl);
  }, [webAppUrl]);

  return (
    <main className="followup-gateway">
      <section>
        <p>WEDDING CHAPTER</p>
        <h1>Follow-up 業務系統</h1>
        {webAppUrl ? (
          <>
            <p>正在進入受公司 Google 帳號保護的系統…</p>
            <a href={webAppUrl}>進入 Follow-up 系統</a>
          </>
        ) : (
          <p>Follow-up 系統尚未完成正式部署設定。</p>
        )}
      </section>
    </main>
  );
}
