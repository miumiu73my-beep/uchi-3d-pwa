import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] || 'uchi-no-ko-3d-test';
const basePath = process.env.PWA_BASE_PATH || '/' + repositoryName + '/';

export default defineConfig({
  base: basePath,
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: '3Dモデル生成',
        short_name: '3D生成',
        description: 'GitHub ActionsでBlenderを実行する個人用PWA',
        start_url: basePath,
        scope: basePath,
        display: 'standalone',
        background_color: '#f9f6ff',
        theme_color: '#67549a',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,json}'],
        navigateFallback: basePath + 'index.html',
        navigateFallbackDenylist: [/^\/api\//]
      }
    })
  ]
});
