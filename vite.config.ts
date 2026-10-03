import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Proxy local: LBank e MEXC não liberam CORS, então o servidor do Vite repassa as chamadas REST.
// ATENÇÃO: funciona com `npm run dev`/`npm run preview`. Se publicar online, precisa de um proxy equivalente.
const proxy = {
  '/proxy/lbank/': { target: 'https://api.lbkex.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/proxy\/lbank/, '') },
  // WebSocket da LBank: o navegador não conecta direto, então passa pelo servidor local (sem o cabeçalho Origin).
  '/proxy/lbank-ws': {
    target: 'wss://www.lbkex.net',
    ws: true,
    changeOrigin: true,
    secure: true,
    rewrite: (p: string) => p.replace(/^\/proxy\/lbank-ws/, '/ws/V2/'),
    configure: (proxy: any) => proxy.on('proxyReqWs', (req: any) => req.removeHeader('origin')),
  },
  '/proxy/kucoin/': { target: 'https://api.kucoin.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/proxy\/kucoin/, '') },
  '/proxy/mexc': { target: 'https://api.mexc.com', changeOrigin: true, rewrite: (p: string) => p.replace(/^\/proxy\/mexc/, '') },
}

export default defineConfig({
  plugins: [react()],
  server: { proxy },
  preview: { proxy },
})
