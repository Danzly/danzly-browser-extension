import { defineManifest } from '@crxjs/vite-plugin';
import { version } from '../package.json' with { type: 'json' };

const isFirefox = process.env.TARGET_BROWSER === 'firefox';
const isDevelopment = process.env.NODE_ENV !== 'production';

export default defineManifest({
  manifest_version: 3,
  name: 'Danzly',
  description: 'Submit dance events to Danzly directly from your browser.',
  version,
  ...(!isFirefox && { minimum_chrome_version: '102' }),
  icons: {
    16: 'public/icons/icon-16.png',
    32: 'public/icons/icon-32.png',
    48: 'public/icons/icon-48.png',
    128: 'public/icons/icon-128.png',
  },
  action: {
    default_popup: 'src/popup/index.html',
    default_icon: {
      16: 'public/icons/icon-16.png',
      32: 'public/icons/icon-32.png',
      48: 'public/icons/icon-48.png',
      128: 'public/icons/icon-128.png',
    },
  },
  background: isFirefox
    ? { scripts: ['src/background/index.ts'], type: 'module' }
    : { service_worker: 'src/background/index.ts', type: 'module' },
  content_scripts: [
    {
      matches: [
        'https://content-script.invalid/*',
        'https://danz.ly/extension/connect*',
        ...(isDevelopment ? ['http://localhost:9042/extension/connect*'] : []),
      ],
      run_at: 'document_start',
      js: ['src/content/index.ts'],
    },
  ],
  permissions: ['activeTab', 'scripting', 'storage'],
  host_permissions: ['http://*/*', 'https://*/*'],
  ...(isDevelopment && {
    web_accessible_resources: [{ resources: ['assets/*.js'], matches: ['http://*/*', 'https://*/*'] }],
  }),
  ...(isFirefox && {
    browser_specific_settings: {
      gecko: {
        id: 'browser-extension@danz.ly',
        strict_min_version: '140.0',
        data_collection_permissions: {
          required: ['authenticationInfo', 'websiteActivity', 'websiteContent'],
        },
      },
    },
  }),
});
