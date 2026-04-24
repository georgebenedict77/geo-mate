# Changelog

All notable changes to this project are documented in this file.

## [1.1.1] - 2026-04-24

### Fixed

- Launch reliability on local environments by defaulting server runtime to `PORT=3050`.
- Added built-in `.env` file loading so local configuration is applied automatically.

### Improved

- Updated README run instructions to match real default launch port and latest release link.
- Published formal GitHub Release object for portfolio presentation.

## [1.1.0] - 2026-04-24

### Added

- Professional presentation assets: screenshots and demo GIF.
- Portfolio-grade README with product positioning, architecture, setup, and demo section.
- CI workflow (`.github/workflows/ci.yml`) with syntax and smoke checks.
- Project-level `LICENSE` (MIT).
- Structured release notes in `docs/releases/v1.1.0.md`.

### Improved

- PWA presentation and install guidance in docs.
- Production deployment guidance for Render + GitHub Pages.

## [1.0.0] - 2026-04-22

### Added

- Full GEO MATE web experience:
  - Landing site
  - Auth flow with email/phone verification
  - Discovery/swipes/matches
  - In-browser chat
  - Profile editing
- OTP provider integration structure (Resend/SendGrid/Twilio).
- Render deployment blueprint.
