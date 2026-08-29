import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        icon: true,
        // This will transform SVG to a React component
        exportType: "named",
        namedExport: "ReactComponent",
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ['@splinetool/runtime'],
  },
  server: {
    allowedHosts: ["giant-wasps-fold.loca.lt"],
    port: 3000,
    hmr: false,
    proxy: {
      '/api/whatsapp': {
        target: 'http://localhost:3188',
        changeOrigin: true,
      },
    },
  },
  define: {
    'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify('BMoDDiSzf7AavViREU6_M0Yez44WtpEUUi52Fkscvfd6uI1UfLXXGdzMOTDHbyATt5apBAe6o-eDgYBb33khRmI')
  },
  build: {
    rollupOptions: {
      external: ['@capacitor/core', '@capacitor/preferences']
    }
  }
});
