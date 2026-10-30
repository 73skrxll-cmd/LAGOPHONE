import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig(({ command }) => ({
  plugins: [react(), { name: 'development-csp', transformIndexHtml: html => command === 'serve' ? html.replace(/<meta http-equiv="Content-Security-Policy"[^>]+>/, '') : html }],
  base: './'
}));
