import { defineConfig } from 'tsup';

export default defineConfig({
    entry: ['src/index.ts', 'src/cli-bin.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    clean: true,
    splitting: false,
    target: 'node18',
    tsconfig: 'tsconfig.json',
});
