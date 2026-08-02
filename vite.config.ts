import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { resolve } from 'path';

// CSP differs between dev and prod because Vite uses inline styles for HMR
const devCSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' ws://localhost:* http://localhost:*; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self';";
const prodCSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; frame-ancestors 'none'; form-action 'self'; base-uri 'self';";

// Permissions-Policy to explicitly disable features we don't use
const permissionsPolicy = "geolocation=(), camera=(), microphone=(), payment=(), usb=(), bluetooth=(), magnetometer=(), gyroscope=(), accelerometer=()";

export default defineConfig(({ mode }) => ({
  base: '/skrive/',
  plugins: [
    react(),
    {
      name: 'html-transform',
      transformIndexHtml(html) {
        const csp = mode === 'production' ? prodCSP : devCSP;
        return html
          .replace(
            '<!-- CSP_PLACEHOLDER -->',
            `<meta http-equiv="Content-Security-Policy" content="${csp}" />`
          )
          .replace(
            '<!-- PERMISSIONS_POLICY_PLACEHOLDER -->',
            `<meta http-equiv="Permissions-Policy" content="${permissionsPolicy}" />`
          );
      }
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icons/*.png', 'fonts/*.woff2'],
      manifest: {
        id: '/skrive/',
        name: 'Skrive',
        short_name: 'Skrive',
        description: 'En lettvekts notatapp med offline-støtte',
        theme_color: '#0A520D',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/skrive/',
        scope: '/skrive/',
        icons: [
          {
            src: 'icons/icon-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          },
          {
            // Full-bleed variant: maskable icons are cropped to the OS
            // shape, so the regular icon's transparent margin would show
            // as a ring and its corners would be cut
            src: 'icons/icon-maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ],
        // Enables the richer install dialog in Chrome/Edge on desktop
        screenshots: [
          {
            src: 'screenshots/desktop.png',
            sizes: '2560x1600',
            type: 'image/png',
            form_factor: 'wide',
            label: 'Skriv og organiser notater'
          }
        ],
        categories: ['productivity', 'utilities'],
        lang: 'no',
        dir: 'ltr'
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // Screenshots are only shown in the install dialog; keep them
        // out of the offline precache
        globIgnores: ['**/screenshots/**']
      },
      devOptions: {
        enabled: true
      }
    })
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  build: {
    target: 'esnext',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'libsodium': ['libsodium-wrappers']
        }
      }
    }
  }
}));
