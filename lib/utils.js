
// lib/utils.js
export function sanitize(name = "") {
  return name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "douyin";
}

export function nowTs() {
  return Math.floor(Date.now()/1000);
}

function guessExt(item){
  try {
    const name = (item && typeof item.filename === 'string') ? item.filename.toLowerCase() : '';
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(name)) return name.match(/\.(jpg|jpeg|png|webp)/i)[0].toLowerCase();
    const url = (item && typeof item.url === 'string') ? item.url.toLowerCase() : '';
    if (/\.(jpg|jpeg|png|webp)(\?|$)/i.test(url)) return url.match(/\.(jpg|jpeg|png|webp)/i)[0].toLowerCase();
    if (/\.flv(\?|$)/i.test(url) || /\.flv(\?|$)/i.test(name)) return '.flv';
    if (/\.m3u8(\?|$)/i.test(url) || /\.m3u8(\?|$)/i.test(name)) return '.m3u8';
    if (/\.mp4(\?|$)/i.test(url) || /\.mp4(\?|$)/i.test(name)) return '.mp4';
  } catch {}
  return '.mp4';
}

export function fileDownloadName(item) {
  const baseFromItem = (item && typeof item.filename === 'string' && item.filename.trim()) ? sanitizeFilename(item.filename.trim()) : null;
  const id = item?.awemeId || `${nowTs()}`;
  const base = baseFromItem || `${id}`;
  const ext = guessExt(item);
  // If base already ends with any known extension, keep it
  if (/\.(jpg|jpeg|png|webp|mp4|flv|m3u8)$/i.test(base)) return base;
  return base + ext;
}

export function extractShortLink(text) {
  // Extract v.douyin.com short URL OR full douyin links from a messy string
  const patterns = [
    /(https?:\/\/[^\s]*iesdouyin\.com[^\s]*)/,
    /(https?:\/\/v\.douyin\.com\/[A-Za-z0-9\/_-]+)/,
    /(https?:\/\/www\.douyin\.com\/video\/\d+)/,
    /(https?:\/\/www\.douyin\.com\/user\/[A-Za-z0-9._\-]+(?:\?[^ \n]*)?)/,
    /(https?:\/\/www\.douyin\.com\/[A-Za-z0-9\/?&_=-]+)/
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

export async function resolveRedirect(url) {
  try {
    const res = await fetch(url, { redirect: "follow", credentials: "include" });
    // If fetch follows redirects, res.url should be final destination
    return res.url || url;
  } catch (e) {
    console.warn("resolveRedirect failed", e);
    return null;
  }
}


export function sanitizeFilename(name = "") {
  const cleaned = name.replace(/[\\/:*?"<>|]+/g, "_").trim();
  // guard against very long names
  return (cleaned || "douyin").slice(0, 120);
}
