import { defineConfig } from 'vite';
import { bundleAnalyzer } from '../src/index.ts';

export default defineConfig({
    root: __dirname,
    plugins: [bundleAnalyzer({ analyzerMode: 'static' })],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
