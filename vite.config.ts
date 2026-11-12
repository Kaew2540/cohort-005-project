import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // SPIKE: allow a tunnel host (cloudflared/ngrok) so a phone gets HTTPS
  server: { allowedHosts: true },
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
});
