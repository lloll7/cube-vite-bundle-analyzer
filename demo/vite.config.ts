import { defineConfig } from 'vite';
import { bundleAnalyzer } from '../src/index.ts';

export default defineConfig({
    root: __dirname,
    plugins: [bundleAnalyzer()],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
