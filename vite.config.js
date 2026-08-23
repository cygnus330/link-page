// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const srcProfilePath = path.resolve(__dirname, 'src/assets/profile.jpg');
const pubAssetsDir = path.resolve(__dirname, 'public/assets');
const pubProfilePath = path.resolve(pubAssetsDir, 'profile.jpg');
if (fs.existsSync(srcProfilePath) && !fs.existsSync(pubProfilePath)) {
  if (!fs.existsSync(pubAssetsDir)) {
    fs.mkdirSync(pubAssetsDir, { recursive: true });
  }
  fs.copyFileSync(srcProfilePath, pubProfilePath);
}

function localPagesFunctionsPlugin() {
  return {
    name: 'local-pages-functions',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url === '/api/links' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk) => {
            body += chunk;
          });
          req.on('end', async () => {
            try {
              const { onRequestPost } = await import('./functions/api/links.js');
              const mockRequest = new Request('http://localhost:5173/api/links', {
                method: 'POST',
                headers: req.headers,
                body: body || undefined,
              });
              const response = await onRequestPost({
                request: mockRequest,
                env: {
                  TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
                },
              });
              res.statusCode = response.status;
              response.headers.forEach((value, key) => {
                res.setHeader(key, value);
              });
              const responseBody = await response.text();
              res.end(responseBody);
            } catch (err) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: false, error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), localPagesFunctionsPlugin()],
  
  build: {
    minify: 'esbuild', // 난독화
    cssMinify: true,   // CSS 파일 압축
  },
  
  // console.log / debugger 삭제
  esbuild: {
    drop: ['console', 'debugger'],
  },
});