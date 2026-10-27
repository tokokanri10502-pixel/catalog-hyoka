import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ハッシュルーティングなので base は相対パスでOK（GitHub Pagesのリポジトリ名に依存しない）
export default defineConfig({
  plugins: [react()],
  base: './',
  server: { port: 5185 },
})
