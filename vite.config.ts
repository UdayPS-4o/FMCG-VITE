import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import svgr from "vite-plugin-svgr";

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
  server: {
    allowedHosts: ["giant-wasps-fold.loca.lt"],
    port: 3000
  },
  define: {
    'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify('BMoDDiSzf7AavViREU6_M0Yez44WtpEUUi52Fkscvfd6uI1UfLXXGdzMOTDHbyATt5apBAe6o-eDgYBb33khRmI')
  }
});
