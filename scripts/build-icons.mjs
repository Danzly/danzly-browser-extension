import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import sharp from 'sharp';

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceLogo = path.join(rootDir, 'src/assets/logo.png');
const outputDir = path.join(rootDir, 'public/icons');
const sizes = [16, 32, 48, 128];

await mkdir(outputDir, { recursive: true });

for (const size of sizes) {
  await sharp(sourceLogo)
    .resize(size, size)
    .png()
    .toFile(path.join(outputDir, `icon-${size}.png`));
}

console.log(`Generated ${sizes.length} icons in ${outputDir}`);
