import type { Metadata } from "next";
import "@fontsource-variable/noto-sans-tc";
import "@fontsource-variable/noto-serif-tc";
import "./globals.css";

export const metadata: Metadata = {
  title: "月光詩人｜典華婚禮人格測驗",
  description: "循著直覺探索你們的婚禮性格，找到最適合故事發生的典華廳房。",
  other: { "codex-preview": "development" },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
