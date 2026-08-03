// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  
  build: {
    minify: 'esbuild', // 난독화
    cssMinify: true,   // CSS 파일 압축
  },
  
  // console.log / debugger 삭제
  esbuild: {
    drop: ['console', 'debugger'],
  },
});