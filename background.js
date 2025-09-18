
// background.js (MV3) - v1.0.6
import { sanitize, fileDownloadName, extractShortLink, nowTs, sanitizeFilename, resolveRedirect } from './lib/utils.js';

// ---- Helpers for photo posts and share links ----
function pickLargestUrl(list){
  if (!Array.isArray(list) || list.length===0) return null;
  const arr = list.slice().map(u => u && u.replace?.(/^http:/,'https:'));
  arr.sort((a,b)=> (b?.length||0) - (a?.length||0));
  return arr[0] || null;
}
function pad2(n){ const s=String(n); return s.length>=2?s:("0"+s); }
function sanitizeSimple(s){ return (s||"").replace(/[\\/:*?"<>|]+/g, "_").slice(0,180); }

async function fetchAwemeDetailBg(awemeId){
  const api = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}`;
  const res = await fetch(api, { credentials: 'include' });
  if (!res.ok) throw new Error('HTTP '+res.status);
  const j = await res.json();
  return j?.aweme_detail || j?.aweme || j;
}
function extractImagePost(detail){
  if (!detail) return null;
  let images = [];
  const imgsNew = detail?.image_post_info?.images;
  if (Array.isArray(imgsNew) && imgsNew.length){
    images = imgsNew.map(it => pickLargestUrl(it?.url_list || it?.display_image?.url_list || [])).filter(Boolean);
  }
  if (images.length===0 && Array.isArray(detail?.images)){
    images = detail.images.map(it => pickLargestUrl(it?.url_list || [])).filter(Boolean);
  }
  if (!images.length) return null;
  const music = pickLargestUrl(detail?.music?.play_url?.url_list || []);
  const title = (detail?.desc || detail?.share_title || detail?.share_info?.share_title || `douyin-${nowTs()}`).trim();
  const user  = detail?.author?.nickname || 'douyin-user';
  return { images, music, title, user };
}

async function handleDownloadFromShareText(text){
  try {
    const link = extractShortLink(text || "");
    if (!link) return { ok:false, error:'no-link' };
    const resolved = await resolveRedirect(link);
    const finalUrl = resolved || link;
    const videoMatch = finalUrl.match(/\/video\/(\d+)/);
    const urlObj = new URL(finalUrl);
    const modalId = urlObj.searchParams.get('modal_id');
    const awemeId = (videoMatch && videoMatch[1]) || modalId;
    if (!awemeId) return { ok:false, error:'no-aweme' };
    const detail = await fetchAwemeDetailBg(awemeId);
    const imgPost = extractImagePost(detail);
    if (imgPost){
      const base = `${sanitizeSimple(imgPost.user)}_${sanitizeSimple(imgPost.title)}`;
      let idx = 0;
      for (const u of imgPost.images){
        const ext = (u.match(/\.(jpe?g|png|webp)(?=$|\?)/i)?.[0] || '.jpg');
        const filename = `${base}_${pad2(++idx)}${ext}`;
        state.queue.push({ id: `${awemeId}-${idx}`, url: u, filename, status: 'queued' });
      }
      pumpQueue();
      return { ok:true, type:'images', count: imgPost.images.length };
    }
    // Not an image post → let content pipeline handle video in temp tab (fallback)
    return { ok:false, error:'not-image' };
  } catch (e) {
    return { ok:false, error:String(e) };
  }
}

const state = {
  queue: [],
  completed: 0,
  failed: 0,
  active: 0,
  concurrency: 1,
  seen: new Set(),
  tempTabs: new Set(),
  scan: null,
  requestDelayMs: 300
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({
    defaultFolderTemplate: "{user}-{count}",
    concurrency: 1,
    requestDelayMs: 300,
    batchSize: 5,
    batchDelaySeconds: 30,
    bulkOrder: "none",
    bulkTitleIncludes: "",
    bulkLimit: 0
  });
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.action === "saveTextFile") {
        const { filename, content } = msg;
        // Deduplicate by content hash to avoid multiple downloads
        const key = `txt:${(content||"").length}:${filename}`;
        if (state.seen.has(key)) { sendResponse({ ok: true, skipped: true }); return; }
        state.seen.add(key);
        const blobUrl = `data:text/plain;charset=utf-8,${encodeURIComponent(content)}`;
        await chrome.downloads.download({ url: blobUrl, filename, saveAs: false });
        sendResponse({ ok: true }); return;
      }

      if (msg?.action === "queueDownloads") {
        const { items, folderName, batchSize: bs, batchDelaySeconds: bd } = msg;
        const sanitizedFolder = sanitize(folderName || `douyin-${nowTs()}`);
        const st = await chrome.storage.sync.get(["batchSize","batchDelaySeconds"]);
        const batchSize = Number.isInteger(bs) && bs>0 ? bs : (parseInt(st.batchSize||"5",10) || 5);
        const batchDelayMs = (Number.isInteger(bd) && bd>=0 ? bd : (parseInt(st.batchDelaySeconds||"30",10) || 30)) * 1000;
        const chunks = [];
        for (let i=0;i<items.length;i+=batchSize) chunks.push(items.slice(i, i+batchSize));
        chunks.forEach((chunk, idx) => {
          setTimeout(() => {
            for (const it of chunk) {
              if (!it?.url) continue;
              if (state.seen.has(it.url)) continue; // dedupe to prevent infinite downloads
              state.seen.add(it.url);
              const name = fileDownloadName(it);
              const filename = `${sanitizedFolder}/${name}`;
              state.queue.push({ id: it.awemeId || name, url: it.url, filename, status: "queued" });
            }
            pumpQueue();
          }, idx * batchDelayMs);
        });
        sendResponse({ ok: true, enqueued: items.length, batches: chunks.length, batchSize }); return;
      }

      if (msg?.action === "downloadItem") {
        const { awemeId, url, folderName } = msg;
        const sanitizedFolder = sanitize(folderName || `douyin-${nowTs()}`);
        const name = fileDownloadName({ awemeId, url });
        const filename = `${sanitizedFolder}/${name}`;
        state.queue.push({ id: awemeId || name, url, filename, status: "queued" });
        pumpQueue();
        sendResponse({ ok: true }); return;
      }

      if (msg?.action === "getStatus") {
        sendResponse({ ...state, queueLength: state.queue.length }); return;
      }
      if (msg?.action === "scanProgress") {
        const { phase, done, total, user } = msg;
        state.scan = phase ? { phase, done: done||0, total: total||0, user: user||null } : null;
        broadcastStatus();
        sendResponse({ ok: true }); return;
      }

      if (msg?.action === "setSettings") {
        const { defaultFolderTemplate, concurrency, requestDelayMs, batchSize, batchDelaySeconds, bulkOrder, bulkTitleIncludes, bulkLimit } = msg;
        const patch = {};
        if (defaultFolderTemplate) patch.defaultFolderTemplate = defaultFolderTemplate;
        if (Number.isInteger(concurrency) && concurrency > 0) { patch.concurrency = concurrency; state.concurrency = concurrency; }
        if (Number.isInteger(requestDelayMs) && requestDelayMs >= 0) { patch.requestDelayMs = requestDelayMs; state.requestDelayMs = requestDelayMs; }
        if (Number.isInteger(batchSize) && batchSize>0) patch.batchSize = batchSize;
        if (Number.isInteger(batchDelaySeconds) && batchDelaySeconds>=0) patch.batchDelaySeconds = batchDelaySeconds;
        if (typeof bulkOrder === 'string') patch.bulkOrder = bulkOrder;
        if (typeof bulkTitleIncludes === 'string') patch.bulkTitleIncludes = bulkTitleIncludes;
        if (Number.isInteger(bulkLimit) && bulkLimit>=0) patch.bulkLimit = bulkLimit;
        await chrome.storage.sync.set(patch);
        sendResponse({ ok: true }); return;
      }

      if (msg?.action === "downloadUrlDirect") {
        const { url, awemeId, user, closeThisTab, filename } = msg;
        try {
          if (!url) { sendResponse({ ok: false, error: "no-url" }); return; }
          if (state.seen.has(url)) {
            if (closeThisTab && sender?.tab?.id) { try { chrome.tabs.remove(sender.tab.id); } catch(e){} }
            sendResponse({ ok: true, skipped: true }); return;
          }
          state.seen.add(url);
          const base = sanitizeFilename(filename || awemeId || `douyin-${nowTs()}`);
          const ext = /\.flv(\?|$)/i.test(url) ? ".flv" : ".mp4";
          const finalName = base.endsWith(ext) ? base : (base + ext);
          await chrome.downloads.download({ url, filename: finalName, saveAs: false, conflictAction: "uniquify" });
          state.completed++; broadcastStatus();
          if (closeThisTab && sender?.tab?.id) { setTimeout(() => { try { chrome.tabs.remove(sender.tab.id); } catch(e){} }, 500); }
          sendResponse({ ok: true }); return;
        } catch (e) {
          try {
            const folderName = sanitize(`${user || 'douyin'}-1`);
            const base = sanitizeFilename(filename || awemeId || `douyin-${nowTs()}`);
            const ext = /\.flv(\?|$)/i.test(url) ? ".flv" : ".mp4";
            await chrome.downloads.download({ url, filename: `${folderName}/${base}${ext}`, saveAs: false, conflictAction: "uniquify" });
            state.completed++; broadcastStatus();
            if (closeThisTab && sender?.tab?.id) { setTimeout(() => { try { chrome.tabs.remove(sender.tab.id); } catch(e){} }, 500); }
            sendResponse({ ok: true, fallback: true }); return;
          } catch (e2) {
            state.failed++; broadcastStatus();
            if (closeThisTab && sender?.tab?.id) { setTimeout(() => { try { chrome.tabs.remove(sender.tab.id); } catch(e){} }, 500); }
            sendResponse({ ok: false, error: String(e2) }); return;
          }
        }
      }

      if (msg?.action === "openTabAndDownload") {
        const { url } = msg;
        const created = await chrome.tabs.create({ url, active: false });
        const tabId = created.id;
        state.tempTabs.add(tabId);
        await waitForFinalUrl(tabId, 15000);
        try {
          await chrome.tabs.sendMessage(tabId, { action: "downloadFromThisPage", fromTempTab: true });
        } catch (e) {
          await new Promise(r => setTimeout(r, 1200));
          try { await chrome.tabs.sendMessage(tabId, { action: "downloadFromThisPage", fromTempTab: true }); } catch {}
        }
        // Tab will be closed by content.js when it sends downloadUrlDirect(closeThisTab:true)
        sendResponse({ ok: true }); return;
      }

      if (msg?.action === "closeTempTab") {
        const id = sender?.tab?.id;
        if (id && state.tempTabs.has(id)) {
          try { await chrome.tabs.remove(id); } catch {}
          state.tempTabs.delete(id);
          sendResponse({ ok: true, closed: true }); return;
        }
        sendResponse({ ok: false, error: "no-temp-tab" }); return;
      }

      if (msg?.action === "downloadFromTextLink") {
        const raw = msg.text || "";
        // Prefer direct background flow that also handles image posts
        const res = await handleDownloadFromShareText(raw);
        if (res && res.ok) { sendResponse(res); return; }
        // Fallback to old temp-tab method
        const link = extractShortLink(raw);
        if (!link) { sendResponse({ ok: false, error: "no-link" }); return; }
        const finalResolved = await resolveRedirect(link) || link;
        const created = await chrome.tabs.create({ url: finalResolved, active: false });
        const tabId = created.id;
        state.tempTabs.add(tabId);
        const finalUrl = await waitForFinalUrl(tabId, 15000);
        const m = finalUrl && finalUrl.match(/\/video\/(\d+)/);
        try {
          if (m) {
            await chrome.tabs.sendMessage(tabId, { action: "fetchAndDownloadByAwemeId", awemeId: m[1] });
          } else {
            await chrome.tabs.sendMessage(tabId, { action: "downloadFromThisPage" });
          }
        } catch (e) {
          await new Promise(r => setTimeout(r, 1200));
          try {
            if (m) {
              await chrome.tabs.sendMessage(tabId, { action: "fetchAndDownloadByAwemeId", awemeId: m[1], fromTempTab: true });
            } else {
              await chrome.tabs.sendMessage(tabId, { action: "downloadFromThisPage", fromTempTab: true });
            }
          } catch {}
        }
        sendResponse({ ok: true, via: "tempTab" }); return;
      }

      if (msg?.action === "downloadFromThisPageRequest") {
        if (sender?.tab?.id) {
          try { await chrome.tabs.sendMessage(sender.tab.id, { action: "downloadFromThisPage" }); }
          catch {}
          sendResponse({ ok: true }); return;
        }
        sendResponse({ ok: false, error: "no-tab" }); return;
      }

      if (msg?.action === "getLastLiveUrl") { const t = sender?.tab?.id; sendResponse({ ok: true, url: (t!=null ? lastMediaByTab.get(t) : null) || null }); return; }
      if (msg?.action === "getLastLiveUrl") { const t = sender?.tab?.id; sendResponse({ ok: true, url: (t!=null ? lastMediaByTab.get(t) : null) || null }); return; }
if (msg?.action === "getLastHlsUrl") { const t = sender?.tab?.id; sendResponse({ ok: true, url: (t!=null ? lastHlsByTab.get(t) : null) || null }); return; }
if (msg?.action === "downloadHlsFromUrl") { const { url, folder } = msg; downloadHls(url, folder).then(()=>sendResponse({ok:true})).catch(err=>sendResponse({ok:false,error:String(err)})); return; }
sendResponse({ ok: false, error: "Unknown action" }); return;
    } catch (e) {
      console.error("background error:", e);
      try { sendResponse({ ok: false, error: String(e) }); } catch(_){}
    }
  })();
  return true;
});

async function pumpQueue() {
  if (state.active > 0) return;
  state.active = 1;
  try {
    while (state.queue.length) {
      const item = state.queue.shift();
      if (!item) break;
      // One-shot guarantee: prevent any url from being re-enqueued later
      state.seen.add(item.url);
      item.status = "downloading";
      broadcastStatus();
      try {
        await chrome.downloads.download({ url: item.url, filename: item.filename, saveAs: false, conflictAction: "uniquify" });
        state.completed++;
        item.status = "done";
      } catch (e) {
        state.failed++;
        item.status = "failed";
      }
      broadcastStatus();
      const st = await chrome.storage.sync.get(["requestDelayMs"]);
      const delayMs = parseInt(st.requestDelayMs||state.requestDelayMs||0,10) || 0;
      if (delayMs>0 && state.queue.length) { await new Promise(r=>setTimeout(r, delayMs)); }
    }
  } finally {
    state.active = 0;
  }
}

function broadcastStatus() {
  chrome.runtime.sendMessage({ action: "statusUpdate", payload: {
    completed: state.completed,
    failed: state.failed,
    active: state.active,
    queueLength: state.queue.length,
    scan: state.scan
  }}).catch(()=>{});
}

async function waitForFinalUrl(tabId, timeoutMs = 10000) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(async () => {
      if (finished) return;
      finished = true;
      try { const info = await chrome.tabs.get(tabId); resolve(info?.url || null); }
      catch { resolve(null); }
    }, timeoutMs);

    function onUpdated(updatedTabId, info, tab) {
      if (updatedTabId !== tabId) return;
      if (info.status === "complete") {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        chrome.tabs.get(tabId).then(t => {
          resolve(t?.url || tab?.url || null);
        }).catch(() => resolve(tab?.url || null));
        chrome.tabs.onUpdated.removeListener(onUpdated);
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

// Make this a module even if nothing to export

// ---- Live FLV observer ----
const lastMediaByTab = new Map();

try {
  const urlFilters = [
    "*://*.douyin.com/*",
    "*://*.iesdouyin.com/*",
    "*://*.douyincdn.com/*",
    "*://*.zjcdn.com/*",
    "*://*.bytecdn.com/*"
  ];

  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      try {
        const url = details.url || "";
        const tabId = details.tabId;
        if (tabId >= 0 && /\.flv(\?|$)/i.test(url)) {
          lastMediaByTab.set(tabId, url);
        }
      } catch {}
    },
    { urls: urlFilters },
    []
  );

  chrome.webRequest.onHeadersReceived.addListener(
    (details) => {
      try {
        const ct = (details.responseHeaders || []).find(h => (h.name || "").toLowerCase() === "content-type");
        if (ct && /^video\/x-flv/i.test(ct.value || "")) {
          lastMediaByTab.set(details.tabId, details.url);
        }
      } catch {}
    },
    { urls: urlFilters },
    ["responseHeaders", "extraHeaders"]
  );
} catch (e) {
  console.warn("webRequest not available:", e);
}



async function fetchText(u) {
  const res = await fetch(u);
  if (!res.ok) throw new Error("HTTP " + res.status + " for " + u);
  return await res.text();
}
function resolveUrl(base, relative) {
  try { return new URL(relative, base).toString(); } catch { return relative; }
}
function parseMaster(lines) {
  // returns best variant url by BANDWIDTH
  let bestUrl = null, bestBw = -1;
  for (let i=0;i<lines.length;i++){
    const line = lines[i].trim();
    if (line.startsWith("#EXT-X-STREAM-INF")) {
      const m = line.match(/BANDWIDTH=(\d+)/i);
      const bw = m ? parseInt(m[1],10) : 0;
      let next = "";
      // next non-comment line
      for (let j=i+1;j<lines.length;j++){
        const l2 = lines[j].trim();
        if (!l2 || l2.startsWith("#")) continue;
        next = l2; break;
      }
      if (next && bw >= bestBw) { bestBw = bw; bestUrl = next; }
    }
  }
  return bestUrl;
}
function parseMedia(lines) {
  // returns list of segment urls
  const segs = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    segs.push(t);
  }
  return segs;
}
async function downloadHls(m3u8Url, folderName) {
  const base = m3u8Url;
  const text = await fetchText(base);
  const lines = text.split(/\r?\n/);
  const isMaster = lines.some(l => l.startsWith("#EXT-X-STREAM-INF"));
  let mediaUrl = base;
  if (isMaster) {
    const best = parseMaster(lines);
    if (!best) throw new Error("No variant in master m3u8");
    mediaUrl = resolveUrl(base, best);
  }
  const m3u8Body = await fetchText(mediaUrl);
  const m3u8Lines = m3u8Body.split(/\r?\n/);
  const segs = parseMedia(m3u8Lines).map(u => resolveUrl(mediaUrl, u));

  // save m3u8 file
  const fname = (folderName || "douyin-live") + "/" + "playlist.m3u8";
  await chrome.downloads.download({ url: mediaUrl, filename: fname, saveAs: false });

  // queue segments
  const prefix = (folderName || "douyin-live") + "/segments/";
  let idx = 0;
  for (const s of segs) {
    const name = prefix + (String(++idx).padStart(5,"0")) + ".ts";
    try { await chrome.downloads.download({ url: s, filename: name, saveAs: false }); } catch(e){ /* ignore individual */ }
  }
}

export {};
