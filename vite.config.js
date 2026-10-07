import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],server:{proxy:{'/api':'http://127.0.0.1:8787'}},build:{sourcemap:false,rollupOptions:{output:{manualChunks(id){if(id.includes('node_modules/recharts')||id.includes('node_modules/d3-')||id.includes('node_modules/victory')||id.includes('node_modules/@reduxjs')||id.includes('node_modules/redux')||id.includes('node_modules/immer')||id.includes('node_modules/react-redux'))return 'charts';if(id.includes('node_modules'))return 'vendor';}}}}});
