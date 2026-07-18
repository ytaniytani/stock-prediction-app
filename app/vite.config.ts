import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
// GitHub Pages のプロジェクトサイト（https://<user>.github.io/stock-prediction-app/）
// 配下で配信するため base を設定する。
export default defineConfig({
  base: '/stock-prediction-app/',
  plugins: [react()],
})
