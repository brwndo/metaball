import { defineConfig } from "vite";

export default defineConfig({
  // Root base is correct for a custom domain (metaball.space).
  base: "/",
  server: {
    open: true,
  },
});
