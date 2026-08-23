import fs from 'node:fs';
import path from 'node:path';

const projectDir = process.argv[2] ?? 'cube-zigbee-bridge-ultra-web';
const distDir = path.resolve(projectDir, 'dist');
const statsFile = path.join(distDir, 'stats.json');

if (!fs.existsSync(statsFile)) {
    console.error(`stats.json not found: ${statsFile}`);
    console.error('Run `npm run test:real` first.');
    process.exit(1);
}

const modules = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
const sizeMismatches = [];
const mapMismatches = [];

for (const mod of modules) {
    const file = path.join(distDir, mod.filename);
    if (!fs.existsSync(file)) continue;

    const actualSize = fs.statSync(file).size;
    if (mod.parsedSize !== actualSize) {
        sizeMismatches.push({
            file: mod.filename,
            parsedSize: mod.parsedSize,
            actualSize,
        });
    }

    if (!mod.isAsset) {
        const mapFile = `${file}.map`;
        if (fs.existsSync(mapFile)) {
            const actualMapSize = fs.statSync(mapFile).size;
            if (mod.mapSize !== actualMapSize) {
                mapMismatches.push({
                    file: mod.filename,
                    mapSize: mod.mapSize,
                    actualMapSize,
                });
            }
        }
    }
}

console.log(`total modules: ${modules.length}`);
console.log(`parsedSize mismatches: ${sizeMismatches.length}`);
console.log(`mapSize mismatches: ${mapMismatches.length}`);

if (sizeMismatches.length) {
    console.table(sizeMismatches);
}
if (mapMismatches.length) {
    console.table(mapMismatches);
}

if (sizeMismatches.length || mapMismatches.length) {
    process.exit(1);
}

console.log('stats.json matches disk files.');
