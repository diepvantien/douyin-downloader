
# Douyin Downloader (MV3)

Fast, watermark‑free Douyin downloader for Chrome MV3. Supports videos, photo posts (slideshow), paste/share links, bulk, and livestreams.

## Features
- Download this video/photos: one click downloads either the playing video (best bitrate) or all images from a photo post (`.webp`, sequential filenames)
- Download all (user): batching (default 5/file batch, 30s pause), filters (newest/oldest, title contains, limit)
- Export links (txt) from any user page
- Paste link/share: parses messy text, resolves `v.douyin.com` short links, downloads video or photo posts directly
- Inline thumbnail buttons on user overview + floating button on the player (detail/modal/fullscreen)
- Filenames: `username_title` with sanitization and truncation
- Options: request delay per file, batch size, batch pause, filters
- English UI

## Usage
1. Open a Douyin page (user/feed/detail). Click “Download this video/photos”.
2. For photo posts, images are saved as `{user}_{title}_01.webp`, `_02.webp`, …
3. Use “Download all (user)” for bulk with batching and filters.
4. Paste any share text/short link in the popup and press Download.

Tip: If video/photos/livestream don’t start, refresh the page (F5) and try again.

## Permissions
- `downloads`, `storage`, `tabs`, `activeTab`, `scripting`, `webRequest`
- Host permissions: `*.douyin.com`, `*.iesdouyin.com`, `*.douyincdn.com`, `*.douyinpic.com`, `*.zjcdn.com`, `*.bytecdn.com`, `v.douyin.com`

## What’s new (UI/logic)
- Photo posts: DOM/API/network capture; `.webp` only; avatar/logo filtered; de‑duplication
- Paste‑link: resolves short links, downloads images directly without opening a tab (when possible)
- Floating button works on detail/modal/fullscreen and supports both video and photos
- Queue de‑duplication to prevent repeat/infinite downloads

## Privacy
No personal data is collected. Settings are saved via `chrome.storage.sync`. See [PRIVACY.md](./PRIVACY.md).

## Contact
- GitHub: https://github.com/diepvantien
- Email: dieptien290620@gmail.com

## Dev
Load unpacked in `chrome://extensions` → Developer mode → Load unpacked → select this folder.

## Support
- Issues/feedback: https://github.com/diepvantien
- Privacy Policy: ./PRIVACY.md
