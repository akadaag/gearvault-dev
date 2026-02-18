import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          // React core — changes rarely, excellent cache hit rate
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // Supabase — large SDK, only needed for auth/sync
          'vendor-supabase': ['@supabase/supabase-js'],
          // PDF export — very large, only used when exporting
          'vendor-pdf': ['jspdf'],
          // Data layer — IndexedDB + schema validation
          'vendor-data': ['dexie', 'dexie-react-hooks', 'zod'],
          // html2canvas — transitive dep of jspdf, only needed for export
          'vendor-html2canvas': ['html2canvas'],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        name: 'PackShot',
        short_name: 'PackShot',
        description: 'Local-first gear catalog and AI packing assistant for photographers and videographers.',
        theme_color: '#0a84ff',
        background_color: '#0f1115',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        icons: [
          {
            src: 'pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json}'],
        navigateFallback: '/index.html',
      },
      devOptions: {
        enabled: true,
      },
    }),
  ],
})
