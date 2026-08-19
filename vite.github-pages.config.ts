import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { resolve } from "node:path";

const GITHUB_PAGES_BASE = "/wedding_chapter/";

function githubPagesAssetPaths(base: string): Plugin {
  return {
    name: "wedding-chapter-github-pages-asset-paths",
    enforce: "pre",
    transform(code, id) {
      if (id.includes("/node_modules/")) return null;
      if (id.endsWith(".css")) {
        return code.replace(/url\((["']?)\/(?!\/)/g, `url($1${base}`);
      }
      if (id.endsWith(".json")) {
        return code.replace(/"\/(?!\/)/g, `"${base}`);
      }
      if (/\.[jt]sx?$/.test(id)) {
        return code.replace(/\b(src|href)="\/(?!\/)/g, `$1="${base}`);
      }
      return null;
    },
  };
}

export default defineConfig(() => {
  return {
    base: GITHUB_PAGES_BASE,
    root: resolve(process.cwd(), "github-pages"),
    publicDir: resolve(process.cwd(), "public"),
    envDir: process.cwd(),
    plugins: [githubPagesAssetPaths(GITHUB_PAGES_BASE), react()],
    build: {
      outDir: resolve(process.cwd(), "dist"),
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: {
          main: resolve(process.cwd(), "github-pages/index.html"),
          followup: resolve(process.cwd(), "github-pages/followup/index.html"),
        },
      },
    },
  };
});
