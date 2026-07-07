import type { BrotliOptions, InputType, ZlibOptions } from 'zlib';
import zlib from 'zlib';
import utils from 'util';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const gzip = utils.promisify(zlib.gzip);
const brotli = utils.promisify(zlib.brotliCompress);

const defaultGzipOptions = <ZlibOptions>{
    level: zlib.constants.Z_DEFAULT_LEVEL,
};

const defaultBrotliOptions = <BrotliOptions>{
    params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
    },
};

export function createGzip(options: ZlibOptions = {}) {
    options = { ...defaultGzipOptions, ...options };
    return (buf: InputType) => gzip(buf, options);
}

export function createBrotil(options: BrotliOptions = {}) {
    options = { ...defaultBrotliOptions, ...options };
    return (buf: InputType) => brotli(buf, options);
}

export function stringToByte(b: string | Uint8Array) {
    if (typeof b === 'string') {
        return encoder.encode(b);
    }
    return b;
}

export function byteToString(b: string | Uint8Array) {
    if (typeof b === 'string') return b;
    return decoder.decode(b);
}
