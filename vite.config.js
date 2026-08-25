import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/my-sound-bookmark/",
  build: {
    outDir: "docs",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(process.cwd(), "index.html"),
        experience: resolve(process.cwd(), "experience.html"),
        player: resolve(process.cwd(), "player.html")
      }
    }
  }
});
