import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Delta Schedule Portal',
        short_name: 'Schedule',
        description: 'Daily operations board — Board=day, List=worker, Card=service',
        theme_color: '#1b3a63',
        background_color: '#eff4fb',
        display: 'standalone',
        start_url: '/',
      },
      workbox: {
        navigateFallbackDenylist: [/^\/auth\//],
      },
    }),
  ],
})
