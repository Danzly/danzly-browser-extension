import { createWriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { ZipArchive } from 'archiver';
import packageJson from '../package.json' with { type: 'json' };

const [sourceDirectory, browserName] = process.argv.slice(2);
if (!sourceDirectory || !browserName) throw new Error('Usage: package-extension.mjs <source-directory> <browser-name>');

const releaseDirectory = path.resolve('release');
await mkdir(releaseDirectory, { recursive: true });

const archivePath = path.join(releaseDirectory, `danzly-extension-${browserName}-v${packageJson.version}.zip`);
const output = createWriteStream(archivePath);
const archive = new ZipArchive({ zlib: { level: 9 } });
const closed = new Promise((resolve, reject) => {
  output.on('close', resolve);
  archive.on('error', reject);
});

archive.pipe(output);
archive.directory(path.resolve(sourceDirectory), false);
await archive.finalize();
await closed;

console.log(`Packaged ${path.relative(process.cwd(), archivePath)} (${archive.pointer()} bytes)`);
