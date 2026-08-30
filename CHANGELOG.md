# Changelog

All notable changes to the Danzly browser extension are documented in this file.

## [1.0.2] - 2026-08-30

### Changed

- Changed the submitted-page count badge from red to grey.

### Fixed

- Fixed manual page submission from the extension popup.

## [1.0.1] - 2026-08-30

### Fixed

- Fixed extension connection in Firefox and Chrome, including automatic detection and manual API-key setup.
- Fixed re-enabling automatic submission in Firefox.

## [1.0.0] - 2026-08-30

### Added

- Connect the extension to a Danzly account via a restricted API key, either through the connect flow or manual entry.
- Manually submit the current page as a dance event, sending Event JSON-LD, page text, image URLs, and metadata as fallback data.
- Automatically detect and submit Facebook event links found while browsing, with a toggle to enable or disable scanning.
- Local deduplication of up to 1,000 previously submitted URLs to avoid resubmission.
- Disconnect flow that clears the saved API key, submission history, and automatic-submission preference.
- Chrome and Firefox builds, including Firefox for Android compatibility.
