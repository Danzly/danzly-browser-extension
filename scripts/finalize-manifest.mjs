import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const outputDirectory = process.argv[2];
if (!outputDirectory) throw new Error('Provide the extension build directory');

const manifestPath = path.resolve(outputDirectory, 'manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const placeholderMatch = 'https://content-script.invalid/*';
const contentScriptResources = manifest.web_accessible_resources?.find((entry) =>
  entry.matches?.includes(placeholderMatch)
);
if (!contentScriptResources) throw new Error('Could not find generated content-script resources in the manifest');

contentScriptResources.matches = ['http://*/*', 'https://*/*'];
if (manifest.browser_specific_settings?.gecko) delete contentScriptResources.use_dynamic_url;
else contentScriptResources.use_dynamic_url = false;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
