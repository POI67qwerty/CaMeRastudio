import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  // GitHub Pagesなどのリポジトリ配下でも、画像・CSS・JSを相対パスで読み込む。
  base: "./",
  server: { host: "0.0.0.0", allowedHosts: true },
  // 専用プレビュー用サーバーでは、ルートからモデルビューアーを開く。
  plugins:
    process.env.MODEL_VIEWER_START === "1"
      ? [
          {
            name: "viewer-preview-root",
            configureServer(server) {
              server.middlewares.use((req, res, next) => {
                if (req.url === "/" || req.url.startsWith("/?"))
                  req.url = "/model-viewer.html" + req.url.slice(1);
                next();
              });
            },
          },
        ]
      : [],
  build: {
    rollupOptions: {
      input: {
        room: resolve(import.meta.dirname, "index.html"),
        modelViewer: resolve(import.meta.dirname, "model-viewer.html"),
      },
    },
  },
});
