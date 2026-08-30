# Browser Store Listing Notes

## Single purpose

Danzly submits dance-event URLs to the Danzly event-processing service. Users can submit the current page manually or automatically discover Facebook event links while browsing.

## Permission explanations

- `activeTab`: reads the current HTTP or HTTPS page URL, Event JSON-LD, limited visible text, event image URLs, and event metadata only after the user opens the popup and presses **Submit this page**.
- `storage`: stores the verified API key, automatic-submission preference, and up to 1,000 successful submission URLs locally for deduplication.
- `scripting`: dynamically installs or removes the automatic Facebook-event scanner after the user changes the automatic-submission setting.
- `http://*/*` and `https://*/*`: sends authenticated requests to Danzly and, while automatic submission is enabled, inspects page URLs, links, and visible text locally for Facebook event links. Turning automatic submission off stops scanning.

## Chrome Web Store privacy declarations

Declare the following data uses in the Developer Dashboard:

- Authentication information: the Danzly API key is stored locally and transmitted only to Danzly over HTTPS.
- Website content: page URLs, link destinations, and visible text are processed locally when automatic submission is enabled.
- Website content: Event JSON-LD, limited visible text, event image URLs, and event metadata from a manually selected page are transmitted to Danzly as fallback event data. Page URLs, link destinations, and visible text are otherwise processed locally when automatic submission is enabled.
- Web browsing activity: the manually selected page URL or automatically detected Facebook event URL is transmitted to Danzly for the user-facing event-submission feature.

The extension does not sell data, use it for advertising or credit decisions, transfer it for unrelated purposes, or allow human review except when required for user-authorized support, security, or legal compliance. Link the listing to `https://danz.ly/extension/privacy` and ensure that URL is publicly accessible before submission.

## Firefox Add-ons declarations

The Firefox manifest declares required `authenticationInfo`, `websiteActivity`, and `websiteContent`. Confirm these selections in AMO during submission.

## Release checklist

- Run `pnpm run check`, `pnpm run lint`, `pnpm run test`, `pnpm run build`, and `pnpm run test:browser`.
- Test key creation and connection, verification, manual submission, live automatic-submission enable/disable, a revoked key, server unavailability, rate limiting, and duplicate URLs in current stable Chrome and Firefox.
- `pnpm run build` packages the store archives into `release/danzly-extension-chrome-v<version>.zip` and `release/danzly-extension-firefox-v<version>.zip`, each with `manifest.json` at the archive root.
- Prepare store icons, screenshots, support contact details, and the public privacy-policy URL.
- Submit the Chrome privacy questionnaire and Firefox data-collection declaration using the descriptions above.
- AMO's automated validator flags "Unsafe assignment to innerHTML" in the bundled popup script. This comes from Vue's own runtime code (the `v-html` directive handler and its in-DOM template fallback), not extension code — the extension never uses `v-html`. Note this in the reviewer notes when submitting.
