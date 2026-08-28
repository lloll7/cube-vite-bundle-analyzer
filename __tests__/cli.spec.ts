import { describe, expect, it } from 'vitest';
import { createAnalyzerOptions, parseCliArgs } from '../src/cli.ts';

describe('parseCliArgs', () => {
    it('parses short option names', () => {
        expect(
            parseCliArgs(['-c', 'vite.config.ts', '-m', 'json', '-p', '8888', '-o'])
        ).toEqual({
            configFile: 'vite.config.ts',
            analyzerMode: 'json',
            analyzerPort: 8888,
            openAnalyzer: true,
        });
    });

    it('parses long option names', () => {
        expect(
            parseCliArgs(['--config', 'x.ts', '--mode', 'static', '--port', '9999', '--open'])
        ).toEqual({
            configFile: 'x.ts',
            analyzerMode: 'static',
            analyzerPort: 9999,
            openAnalyzer: true,
        });
    });

    it('parses --diff short and long option names', () => {
        expect(parseCliArgs(['-d'])).toEqual({ diff: true });
        expect(parseCliArgs(['--diff'])).toEqual({ diff: true });
        expect(parseCliArgs(['-m', 'json', '--diff'])).toEqual({
            analyzerMode: 'json',
            diff: true,
        });
    });
});

describe('createAnalyzerOptions', () => {
    it('defaults to server mode', () => {
        expect(createAnalyzerOptions({})).toEqual({ analyzerMode: 'server' });
    });

    it('passes diff flag through', () => {
        expect(createAnalyzerOptions({ diff: true })).toEqual({
            analyzerMode: 'server',
            diff: true,
        });
    });
});
