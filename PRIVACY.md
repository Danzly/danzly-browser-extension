# Danzly Browser Extension Privacy Notice

Last updated: 2026-08-30

The Danzly browser extension submits event URLs to Danzly. Manual submission sends the URL shown in the popup only after the user presses **Submit this page**. At that time, the extension also sends Event JSON-LD, up to 10,000 characters of visible page text, up to 10 event image URLs, and limited event metadata such as title, description, time, and location. Danzly uses this data as a fallback when it cannot access the event page directly.

Automatic submission is enabled by default after the extension is connected. The extension examines page URLs, link destinations, and visible text locally to identify Facebook event links. Only detected Facebook event URLs are sent to Danzly; complete page contents and general browsing history are not transmitted.

The extension stores the following information in browser extension storage on the user's device:

- The restricted Danzly API key created when the user connects the extension or generates a key for manual setup.
- Whether automatic submission is enabled.
- Up to 1,000 successfully submitted URLs, used to avoid duplicate submissions.

Browser extension storage is isolated from ordinary websites but is not encrypted by the browser. Danzly API keys are limited to event submission, remain valid until revoked, and can be revoked at any time from Danzly account settings. Disconnecting clears the saved key, submitted-URL count, and automatic-submission preference. Turning automatic submission off stops page scanning. The extension retains website access while installed so the feature can be turned back on without another browser prompt. Uninstalling the extension removes its local storage.

Danzly stores submitted URLs, manually supplied event data, and the resulting processing records with the user's account. Essential hosting, logging, and error-monitoring providers may process this information as needed to operate and secure the service. Danzly does not sell extension data or use it for advertising.

The public browser extension privacy policy is available at [https://danz.ly/extension/privacy](https://danz.ly/extension/privacy). The complete Danzly privacy policy, including data rights and contact information, is available at [https://danz.ly/privacy](https://danz.ly/privacy).
