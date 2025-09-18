// content/content.js - fixed no-template-literal build
(function () {
  // ---------- small utils ----------
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function log() { var a = Array.prototype.slice.call(arguments); a.unshift("[DouyinDL]"); console.log.apply(console, a); }
  async function loadLocaleMessages(locale) {
    var loc = (locale || '').trim();
    // fixed English UI; ignore stored locale
    if (!loc) { try { loc = (chrome.i18n && chrome.i18n.getUILanguage && chrome.i18n.getUILanguage()) || 'en'; } catch(e){ loc='en'; } }
    try {
      var url = chrome.runtime.getURL("_locales/" + loc + "/messages.json");
      var res = await fetch(url); if (!res.ok) throw new Error('http '+res.status);
      var json = await res.json(); window.__DYDL_I18N__ = { locale: loc, messages: json };
    } catch (e) {
      if (loc !== 'en') return loadLocaleMessages('en');
      window.__DYDL_I18N__ = { locale: 'en', messages: {} };
    }
  }
  function _(k, fallback) { try { var m = (window.__DYDL_I18N__ && window.__DYDL_I18N__.messages && window.__DYDL_I18N__.messages[k] && window.__DYDL_I18N__.messages[k].message) || chrome.i18n.getMessage(k); return m || (fallback || ""); } catch (e) { return fallback || ""; } }
  // Force locale if set in storage
  (async function(){ try { await loadLocaleMessages(); } catch(e){} })();
  try { chrome.runtime.onMessage.addListener(function(m){ if(m&&m.action==="localeChanged"){ try { loadLocaleMessages(m.locale).then(function(){ location.reload(); }); } catch(e){ location.reload(); } } }); } catch(e){}

  var CDN_PATTERNS = [
    /https?:\/\/[^\/]*v\d+-dy-[^\/]*\.zjcdn\.com\/.*\/video\/tos\//i,
    /https?:\/\/[^\/]*douyincdn\.com\/.*\.flv(\?|$)/i,
    /https?:\/\/[^\/]*bytecdn\.com\/.*\/video\/tos\//i,
    /https?:\/\/.*\/video\/tos\//i
  ];

  var IMAGE_PATTERNS = [
    /https?:\/\/[^\/]*douyinpic\.com\/.*aweme-images/i,
    /https?:\/\/[^\/]*douyinpic\.com\/.*tplv-dy-aweme-images/i,
    /https?:\/\/[^\/]*douyinpic\.com\/.*(\.webp|\.jpg|\.jpeg|\.png)(\?|$)/i
  ];

  function collectImageUrlsFromDOMStrict() {
    try {
      var urls = [];
      var seen = {};
      var nodes = Array.prototype.slice.call(document.querySelectorAll('img[src*="aweme-images"], img[src*="douyinpic.com/"]'));
      for (var i=0;i<nodes.length;i++) {
        var u = nodes[i].getAttribute('src') || '';
        if (!u) continue;
        u = ensureHttps(u);
        // Strict include: aweme-images or biz_tag=aweme_images or PackSourceEnum_AWEME_DETAIL; exclude avatars/logos/covers
        var include = ((/aweme-images/i.test(u) || /[?&]biz_tag=aweme_images/i.test(u) || /PackSourceEnum_AWEME_DETAIL/i.test(u) || /[?&]sc=image/i.test(u)) && /\.webp(\?|$)/i.test(u));
        var exclude = (/avatar/i.test(u) || /user\-?avatar/i.test(u) || /logo/i.test(u) || /cover/i.test(u));
        if (include && !exclude) {
          if (!seen[u]) { seen[u]=1; urls.push(u); }
        }
      }
      return urls;
    } catch(e) { return []; }
  }

  function ensureHttps(u) { return (u && u.indexOf("http:") === 0) ? u.replace(/^http:/, "https:") : u; }
  function isVideoUrl(u) { return !!(u && (/video\/tos\//i.test(u) || /\.flv(\?|$)/i.test(u))); }
  function looksLikeImage(u) { return !!(u && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(u)); }
  function looksLikeAudio(u) { return !!(u && (/(\/audio\/|audio_only)/i.test(u) || /\.(mp3|aac|m4a)(\?|$)/i.test(u))); }

  // ---------- performance sniffers ----------
  function findInPerf() {
    var ents = performance.getEntriesByType("resource") || [];
    for (var i = 0; i < ents.length; i++) {
      var name = ents[i].name || "";
      for (var j = 0; j < CDN_PATTERNS.length; j++) {
        if (CDN_PATTERNS[j].test(name)) return ensureHttps(name);
      }
    }
    return null;
  }

  function watchPerfOnce(timeout) {
    timeout = timeout || 7000;
    return new Promise(function (resolve) {
      var done = false;
      function finish(url) { if (done) return; done = true; try { po.disconnect(); } catch (e) {} resolve(url || null); }
      var po = new PerformanceObserver(function (list) {
        var arr = list.getEntries() || [];
        for (var i = 0; i < arr.length; i++) {
          var name = arr[i].name || "";
          for (var j = 0; j < CDN_PATTERNS.length; j++) {
            if (CDN_PATTERNS[j].test(name)) { finish(ensureHttps(name)); return; }
          }
        }
      });
      try { po.observe({ entryTypes: ["resource"] }); } catch (e) {}
      var first = findInPerf();
      if (first) return finish(first);
      setTimeout(function () { finish(null); }, timeout);
    });
  }

  async function findImagesInPerf(timeout, expectMax) {
    timeout = timeout || 6000; expectMax = expectMax || 20;
    return new Promise(function(resolve){
      var done=false; var results=[]; var seen={};
      function push(u){ u=ensureHttps(u||""); if(!u) return; if(seen[u]) return; for(var i=0;i<IMAGE_PATTERNS.length;i++){ if(IMAGE_PATTERNS[i].test(u)){ seen[u]=1; results.push(u); break; } }
        if(results.length>=expectMax){ finish(); }
      }
      function finish(){ if(done) return; done=true; try{po.disconnect();}catch(e){} resolve(results.slice()); }
      var ents = performance.getEntriesByType("resource")||[];
      for(var i=0;i<ents.length;i++){ push(ents[i].name||""); }
      var po = new PerformanceObserver(function(list){ var arr=list.getEntries()||[]; for(var j=0;j<arr.length;j++){ push(arr[j].name||""); } });
      try{ po.observe({entryTypes:["resource"]}); } catch(e){}
      setTimeout(finish, timeout);
    });
  }

  // ---------- decode render data ----------
  function decodeRenderData() {
    var el = document.querySelector("#RENDER_DATA");
    if (!el || !el.textContent) return null;
    try {
      var txt = decodeURIComponent((el.textContent || "").trim());
      return JSON.parse(txt);
    } catch (e) { return null; }
  }
  
  // ---------- robust fetch helpers ----------
  async function fetchJsonRetry(url, options, attempts) {
    attempts = attempts || 3;
    var lastErr = null;
    for (var i = 0; i < attempts; i++) {
      try {
        var res = await fetch(url, options || { credentials: "include" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        return await res.json();
      } catch (e) {
        lastErr = e;
        await sleep(400 + Math.random() * 600);
      }
    }
    throw lastErr || new Error("fetch failed");
  }
  function deepFind(obj, predicate, path) {
    path = path || [];
    if (obj && typeof obj === "object") {
      try { if (predicate(obj)) return { obj: obj, path: path.slice() }; } catch (e) {}
      var keys = Object.keys(obj);
      for (var i = 0; i < keys.length; i++) {
        var k = keys[i];
        var res = deepFind(obj[k], predicate, path.concat(k));
        if (res) return res;
      }
    }
    return null;
  }

  // ---------- title helpers ----------
  function getVideoTitleFallback() {
    var t = ((document.querySelector('[data-e2e="video-desc"]') || {}).textContent || "").trim();
    if (t) return t;
    var aria = ((document.querySelector('[aria-label]') || {}).getAttribute ? document.querySelector('[aria-label]').getAttribute('aria-label') : "");
    if (aria && aria.trim()) return aria.trim();
    var h = (document.querySelector("h1,h2") || {}).textContent;
    if (h) { h = h.trim(); if (h) return h; }
    var dt = (document.title || "").trim();
    if (dt) return dt.replace(/\s*\|.*$/, "").slice(0, 120);
    return "";
  }
  function getVideoTitleFromRender() {
    var data = decodeRenderData();
    if (!data) return "";
    var hit = deepFind(data, function (o) {
      return (typeof (o && o.desc) === "string" && o.desc.length > 0) ||
             (typeof (o && o.title) === "string" && o.title.length > 0) ||
             (typeof (o && o.share_title) === "string" && o.share_title.length > 0);
    });
    if (hit) return (hit.obj.desc || hit.obj.title || hit.obj.share_title || "").trim();
    // Try DOM rich caption structure provided by user
    try {
      // Case 1: user overview modal/detail
      var rich1 = document.querySelector('div.pQBVl0z4 span.arnSiSbK');
      if (rich1 && rich1.textContent && rich1.textContent.trim()) return rich1.textContent.trim();
      // Case 2: feed (jingxuan)
      var rich2 = document.querySelector('span.arnSiSbK.hT34TYMB');
      if (rich2 && rich2.textContent && rich2.textContent.trim()) return rich2.textContent.trim();
      // Case 3: recommend page structure
      var rich3 = document.querySelector('#video-info-wrap [data-e2e="video-desc"] span.arnSiSbK');
      if (rich3 && rich3.textContent && rich3.textContent.trim()) return rich3.textContent.trim();
    } catch(e){}
    return "";
  }

  function getTitleFromAnchorByAwemeId(awemeId) {
    if (!awemeId) return "";
    try {
      var a = document.querySelector('a[href*="/video/' + awemeId + '"]');
      if (!a) return "";
      var img = a.querySelector('img[alt]');
      if (img && typeof img.alt === 'string' && img.alt.trim()) return img.alt.trim();
    } catch (e) {}
    return "";
  }

  function getUsernameFromDOM() {
    var h1 = document.querySelector("h1");
    if (h1 && h1.textContent && h1.textContent.trim()) return h1.textContent.trim();
    var nameNode = document.querySelector('[data-e2e="user-name"], [data-e2e="user-title"]');
    if (nameNode && nameNode.textContent && nameNode.textContent.trim()) return nameNode.textContent.trim();
    // recommend/feed page: @username within arnSiSbK
    try {
      var at = document.querySelector('#video-info-wrap [data-e2e="feed-video-nickname"] .arnSiSbK');
      if (at && at.textContent) return at.textContent.replace(/^@+/, '').trim();
    } catch(e){}
    var data = decodeRenderData();
    if (data) {
      var hit = deepFind(data, function (o) { return typeof (o && o.nickname) === "string" && o.sec_user_id; });
      if (hit && hit.obj.nickname) return hit.obj.nickname;
    }
    var fromUrl = location.pathname.match(/\/user\/([^\/?#]+)/);
    if (fromUrl) return fromUrl[1];
    return "douyin-user";
  }

  function getUserIdAny() {
    var fromUrl = location.pathname.match(/\/user\/([^\/?#]+)/);
    if (fromUrl) return fromUrl[1];
    var a = document.querySelector('a[href*="/user/"]');
    if (a && a.href) {
      var m = a.href.match(/\/user\/([^\/?#]+)/);
      if (m) return m[1];
    }
    var data = decodeRenderData();
    if (data) {
      var hit = deepFind(data, function (o) { return typeof (o && o.sec_user_id) === "string" && o.sec_user_id.length > 10; });
      if (hit) return hit.obj.sec_user_id;
    }
    return null;
  }

  function getAwemeIdFromUrl(u) {
    try {
      var url = new URL(u, location.href);
      var m = url.pathname.match(/\/video\/(\d+)/);
      if (m) return m[1];
      var modal = url.searchParams.get("modal_id");
      if (modal) return modal;
    } catch (e) {}
    return null;
  }

  // ---------- image helpers (carousel posts) ----------
  async function fetchAwemeDetail(awemeId) {
    try {
      var data = await fetchJsonRetry("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=" + awemeId, { credentials: "include" }, 3);
      return (data && data.aweme_detail) || null;
    } catch(e) { return null; }
  }
  function collectImageUrlsFromDetail(detail) {
    var urls = [];
    try {
      var ip = detail && detail.image_post_info && detail.image_post_info.images;
      if (Array.isArray(ip)) {
        for (var i=0;i<ip.length;i++) {
          var disp = ip[i] && ip[i].display_image;
          var u = (disp && disp.url_list && disp.url_list[0]) || "";
          if (u) urls.push(ensureHttps(u));
        }
      }
      var imgs = detail && detail.images;
      if (Array.isArray(imgs)) {
        for (var j=0;j<imgs.length;j++) {
          var u2 = (imgs[j] && imgs[j].url_list && imgs[j].url_list[0]) || "";
          if (u2) urls.push(ensureHttps(u2));
        }
      }
    } catch(e) {}
    var seen = {};
    return urls.filter(function(u){ if (seen[u]) return false; seen[u]=1; return true; });
  }
  async function queueImageDownloadItems(imageUrls, baseTitle, username) {
    var items = [];
    for (var i=0;i<imageUrls.length;i++) {
      var idx = ("0" + (i+1)).slice(-2);
      var ext = (imageUrls[i].match(/\.(jpg|jpeg|png|webp)(?=\?|$)/i) || [".jpg"])[0];
      var fname = (username + "_" + baseTitle + "_" + idx).replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 120) + ext;
      items.push({ url: imageUrls[i], filename: fname, awemeId: baseTitle + "_" + idx });
    }
    if (items.length) {
      try { await chrome.runtime.sendMessage({ action: "queueDownloads", items: items, folderName: null }); } catch(e){}
    }
  }

  function getAwemeIdFromPlaying() {
    try {
      var v = pickPlayingVideo();
      if (!v) return null;
      var a = v.closest('a[href*="/video/"]') || (v.parentElement && v.parentElement.querySelector && v.parentElement.querySelector('a[href*="/video/"]'));
      if (a && a.href) {
        var m = a.href.match(/\/video\/(\d+)/);
        if (m) return m[1];
      }
    } catch(e) {}
    return null;
  }

  function isHomepage() {
    var p = location.pathname;
    var qs = new URLSearchParams(location.search);
    return (p === "/" && qs.get("recommend") === "1") || /recommend|discover|hot|jingxuan/.test(p);
  }

  function isUserPage() {
    return /\/user\//.test(location.pathname);
  }

  function isDetailPage() {
    return /\/video\/\d+/.test(location.pathname);
  }

  function isModalDetailPage() {
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.get("modal_id")) return true;
    } catch(e){}
    return false;
  }

  function isFullscreenAny() {
    try {
      if (document.fullscreenElement) return true;
      var vids = Array.prototype.slice.call(document.querySelectorAll("video"));
      for (var i = 0; i < vids.length; i++) {
        var v = vids[i];
        if (v.webkitDisplayingFullscreen || v.msFullscreenElement) return true;
      }
    } catch(e) {}
    return false;
  }

  // ---------- choose current video ----------
  function pickPlayingVideo() {
    var vids = Array.prototype.slice.call(document.querySelectorAll("video"));
    var playing = vids.find ? vids.find(function (v) { return !v.paused && v.currentTime > 0 && !v.ended; }) : null;
    if (playing) return playing;
    var best = null, bestArea = 0;
    var vw = window.innerWidth, vh = window.innerHeight;
    for (var i = 0; i < vids.length; i++) {
      var v = vids[i], r = v.getBoundingClientRect();
      var x = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0));
      var y = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      var area = x * y;
      if (area > bestArea) { bestArea = area; best = v; }
    }
    return best;
  }

  function getDirectVideoUrl(timeout) {
    timeout = timeout || 8000;
    return new Promise(function (resolve) {
      (async function () {
        var v = pickPlayingVideo();
        if (v) {
          if (v.currentSrc || v.src) {
            var u0 = ensureHttps(v.currentSrc || v.src);
            if (isVideoUrl(u0)) { resolve(u0); return; }
          }
          try { v.muted = true; await v.play().catch(function () {}); } catch (e) {}
          await sleep(250);
          if (v.currentSrc || v.src) {
            var u1 = ensureHttps(v.currentSrc || v.src);
            if (isVideoUrl(u1)) { resolve(u1); return; }
          }
        }
        var inPerf = findInPerf();
        if (isVideoUrl(inPerf)) { resolve(inPerf); return; }
        var watching = watchPerfOnce(timeout);

        if (v) {
          try { v.muted = true; await v.play().catch(function () {}); } catch (e2) {}
          await sleep(400);
          if (v.currentSrc || v.src) {
            var u2 = ensureHttps(v.currentSrc || v.src);
            if (isVideoUrl(u2)) { resolve(u2); return; }
          }
        }

        var data = decodeRenderData();
        if (data) {
          var hit = deepFind(data, function (o) {
            return o && typeof o === "object" &&
                   Array.isArray(o.url_list) && o.url_list[0] && typeof o.url_list[0] === "string";
          });
          if (hit) {
            var u3 = ensureHttps(hit.obj.url_list[0]);
            if (isVideoUrl(u3)) { resolve(u3); return; }
          }
        }

        var w = await watching;
        resolve(isVideoUrl(w) ? w : null);
      })();
    });
  }

  // ---------- Live helpers ----------
  function isLiveRootPage() {
    try { return location.hostname.endsWith("douyin.com") && /\/root\/live\//.test(location.pathname); } catch(e) { return false; }
  }
  function isLivePage() { return /(^|\.)live\.douyin\.com$/.test(location.hostname) || isLiveRootPage(); }
  async function getLiveFlvUrl(timeout) {
    timeout = timeout || 8000;
    var direct = findInPerf();
    if (direct && /\.flv(\?|$)/i.test(direct)) return direct;
    var watching = watchPerfOnce(timeout);
    var v = document.querySelector("video");
    if (v) { try { v.muted = true; await v.play().catch(function () {}); } catch (e) {} }
    var url = await watching;
    if (url && /\.flv(\?|$)/i.test(url)) return url;
    return null;
  }

  // ---------- Title for single download ----------
  async function getSingleDownloadName(awemeId) {
    var username = getUsernameFromDOM();
    var a = getVideoTitleFromRender();
    var b = getVideoTitleFallback();
    var c = getTitleFromAnchorByAwemeId(awemeId);
    function isBadTitle(t) {
      if (!t) return true;
      var s = String(t).trim();
      if (!s) return true;
      if (username && s === username) return true;
      if (/^pc\s*tab$/i.test(s)) return true;
      if (/^pc$/i.test(s)) return true;
      return false;
    }
    var title = (a || b || c || "").trim();
    if (isBadTitle(title) && awemeId) {
      try {
        var data = await fetchJsonRetry("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=" + awemeId, { credentials: "include" }, 2);
        var ad = data && data.aweme_detail;
        var t = (ad && (ad.desc || ad.title || ad.share_title)) || "";
        if (t && typeof t === "string") title = t.trim();
      } catch(e) {}
    }
    if ((!title || title === username) && awemeId) {
      try {
        var data = await fetchJsonRetry("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=" + awemeId, { credentials: "include" }, 2);
        var ad = data && data.aweme_detail;
        var t = (ad && (ad.desc || ad.title || ad.share_title)) || "";
        if (t && typeof t === "string") title = t.trim();
      } catch(e) {}
    }
    if (isBadTitle(title)) title = awemeId ? String(awemeId) : ("douyin-" + Date.now());
    title = title.replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 120);
    return (username + "_" + title);
  }

  // ---------- Status Bar (removed; use popup status) ----------
  function setUserMeta(_) {}
  function setScanProgress(_) {}

  function showToast(text) {
    var t = document.createElement("div");
    t.className = "dydl-toast";
    t.textContent = text;
    document.documentElement.appendChild(t);
    setTimeout(function () { try { t.remove(); } catch (e) {} }, 2200);
  }

  // ---------- user list / export ----------
  async function listUserVideos() {
    var sec_user_id = getUserIdAny();
    if (!sec_user_id) throw new Error("Không tìm thấy user id trong URL/DOM.");
    var username = getUsernameFromDOM();
    try { chrome.runtime.sendMessage({ action: "scanProgress", phase: "init", done: 0, total: 0, user: username }); } catch(e){}

    // total videos
    var total = 0;
    try {
      // Prefer DOM count when available
      var domCount = 0;
      try {
        var countEl = document.querySelector('[data-e2e="user-tab-count"]');
        if (countEl && countEl.textContent) domCount = parseInt(countEl.textContent.replace(/\D+/g, ''), 10) || 0;
      } catch(e){}
      if (domCount > 0) {
        total = domCount;
      } else {
        var ud = await fetchJsonRetry("https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=" + encodeURIComponent(sec_user_id), { credentials: "include" }, 2);
        total = (ud && ud.user && (ud.user.aweme_count || ud.user.awemeCount)) || 0;
      }
    } catch (e) {}

    var cursor = 0, hasMore = 1, rows = [], seen = {};
    while (hasMore === 1) {
      var url = "https://www.douyin.com/aweme/v1/web/aweme/post/?device_platform=webapp&aid=6383&channel=channel_pc_web"
              + "&sec_user_id=" + encodeURIComponent(sec_user_id)
              + "&max_cursor=" + cursor
              + "&count=20&version_code=170400&version_name=17.4.0";
      var data = null;
      try {
        data = await fetchJsonRetry(url, { credentials: "include" }, 3);
      } catch (e2) {
        log("listUserVideos API error", e2);
        break;
      }
      hasMore = (data && data.has_more) ? 1 : 0;
      cursor = (data && data.max_cursor) ? data.max_cursor : 0;
      var list = (data && data.aweme_list) ? data.aweme_list : [];
      for (var i = 0; i < list.length; i++) {
        var item = list[i];
        var id = item && item.aweme_id;
        if (!id || seen[id]) continue;
        seen[id] = 1;
        var link = "";
        var v = item && item.video;
        if (v && Array.isArray(v.bit_rate) && v.bit_rate.length) {
          var sorted = v.bit_rate.slice().sort(function (a, b) { return (b.bit_rate || 0) - (a.bit_rate || 0); });
          var best = sorted[0] || {};
          link = (best.play_addr && best.play_addr.url_list && best.play_addr.url_list[0]) ||
                 (best.download_addr && best.download_addr.url_list && best.download_addr.url_list[0]) || "";
        } else if (v) {
          link = (v.play_addr && v.play_addr.url_list && v.play_addr.url_list[0]) ||
                 (v.download_addr && v.download_addr.url_list && v.download_addr.url_list[0]) || "";
        }
        if (link) {
          var username = getUsernameFromDOM();
          // Build title similarly to single-download logic
          var fromRender = (item && (item.desc || (item.share_info && item.share_info.share_title))) || "";
          var title = (fromRender || (item && item.desc) || (item && item.title) || "").trim();
          if (!title) title = "douyin-" + id;
          var filename = (username + "_" + title).replace(/[\n\r]+/g, " ").replace(/\s{2,}/g, " ").slice(0, 120);
          rows.push({ awemeId: id, url: ensureHttps(link), desc: title, filename: filename });
        }
        try { chrome.runtime.sendMessage({ action: "scanProgress", phase: "scan", done: rows.length, total: total||0, user: username }); } catch(e){}
      }
      await sleep(500 + Math.random() * 400);
    }
    try { chrome.runtime.sendMessage({ action: "scanProgress", phase: "done", done: rows.length, total: rows.length, user: username }); } catch(e){}
    return rows;
  }

  async function exportLinksTxt() {
    var username = getUsernameFromDOM();
    var items = await listUserVideos();
    var lines = items.map(function (it) { return it.url; }).join("\n");
    var fname = (username + "-" + items.length + ".txt").replace(/[\\/:*?"<>|]+/g, "_");
    chrome.runtime.sendMessage({ action: "saveTextFile", filename: fname, content: lines });
    showToast("Đã xuất " + items.length + " link vào " + fname);
  }

  async function downloadAllVideos() {
    var username = getUsernameFromDOM();
    var items = await listUserVideos();
    // Apply filters from settings
    try {
      var st = await chrome.storage.sync.get(["bulkOrder","bulkTitleIncludes","bulkLimit"]);
      var order = st.bulkOrder || "none";
      var kw = (st.bulkTitleIncludes || "").trim();
      var lim = parseInt(st.bulkLimit||"0",10) || 0;
      if (kw) {
        var kwl = kw.toLowerCase();
        items = items.filter(function (it) { return (it.desc||it.filename||"").toLowerCase().indexOf(kwl) >= 0; });
      }
      if (order === "newest") items.sort(function(a,b){ return (b.awemeId||"0").localeCompare(a.awemeId||"0"); });
      if (order === "oldest") items.sort(function(a,b){ return (a.awemeId||"0").localeCompare(b.awemeId||"0"); });
      if (lim>0) items = items.slice(0, lim);
    } catch(e) {}
    var folderName = (username + "-" + items.length).replace(/[\\/:*?"<>|]+/g, "_");
    chrome.runtime.sendMessage({ action: "queueDownloads", items: items, folderName: folderName });
    try { chrome.runtime.sendMessage({ action: "scanProgress", phase: "queue", done: 0, total: items.length, user: username }); } catch(e){}
  }

  async function fetchBestUrlByAwemeId(awemeId) {
    try {
      var data = await fetchJsonRetry("https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=" + awemeId, { credentials: "include" }, 3);
      var v = data && data.aweme_detail && data.aweme_detail.video;
      if (!v) return null;
      if (Array.isArray(v.bit_rate) && v.bit_rate.length) {
        var best = v.bit_rate.slice().sort(function (a, b) { return (b.bit_rate || 0) - (a.bit_rate || 0); })[0] || {};
        var u = (best.play_addr && best.play_addr.url_list && best.play_addr.url_list[0]) ||
                (best.download_addr && best.download_addr.url_list && best.download_addr.url_list[0]) || "";
        return ensureHttps(u);
      }
      var u2 = (v.play_addr && v.play_addr.url_list && v.play_addr.url_list[0]) ||
               (v.download_addr && v.download_addr.url_list && v.download_addr.url_list[0]) || "";
      return ensureHttps(u2);
    } catch (e) { return null; }
  }

  async function downloadCurrentPlaying() {
    var m = location.pathname.match(/\/video\/(\d+)/);
    var qsCur = new URLSearchParams(location.search);
    var modalCur = qsCur.get("modal_id");
    var awemeId = modalCur || ((m && m[1]) ? m[1] : (getAwemeIdFromPlaying() || null));
    var url = null;
    if (awemeId) {
      // Try image post first (DOM -> API)
      var domImgsC = collectImageUrlsFromDOMStrict();
      if (domImgsC && domImgsC.length) {
        var baseC = await getSingleDownloadName(awemeId);
        var userC = getUsernameFromDOM();
        await queueImageDownloadItems(domImgsC, baseC, userC);
        showToast(_("toastStartVideo", "Starting download."));
        return;
      }
      var detail = await fetchAwemeDetail(awemeId);
      var imgs = collectImageUrlsFromDetail(detail);
      if (imgs && imgs.length) {
        var base = await getSingleDownloadName(awemeId);
        var username = getUsernameFromDOM();
        await queueImageDownloadItems(imgs, base, username);
        showToast(_("toastStartVideo", "Starting download."));
        return;
      }
      url = await fetchBestUrlByAwemeId(awemeId);
    }
    if (!url) {
      url = await getDirectVideoUrl(9000);
    }
    if (!url) { showToast(_("toastReloadToCatch", "Could not capture. Reload and try again.")); return; }
    var filename = await getSingleDownloadName(awemeId || String(Date.now()));
    chrome.runtime.sendMessage({ action: "downloadUrlDirect", url: url, awemeId: awemeId || String(Date.now()), user: null, closeThisTab: false, filename: filename });
    showToast(_("toastStartVideo", "Starting download."));
  }

  async function downloadLivestream() {
    if (!isLivePage()) { showToast(_("toastNeedLiveTab", "Open a live.douyin.com tab first.")); return; }
    var live = null;
    try { var r = await chrome.runtime.sendMessage({ action: "getLastLiveUrl" }); if (r && r.ok && r.url) live = r.url; } catch (e) {}
    if (!live) live = await getLiveFlvUrl(9000);

    if (!live) { showToast(_("toastReloadToCatch", "Could not capture. Reload and try again.")); return; }
    var title = ((document.querySelector('[data-e2e="live-room-title"]') || {}).textContent || document.title || "douyin-live").trim();
    chrome.runtime.sendMessage({ action: "downloadUrlDirect", url: live, awemeId: ("live-" + Date.now()), user: null, closeThisTab: false, filename: title });
    showToast(_("toastStartLive", "Starting livestream download."));
  }

  // ---------- open or fetch by aweme link ----------
  async function downloadByAwemeIdOrOpen(aHref) {
    var awemeId = getAwemeIdFromUrl(aHref);
    if (awemeId) {
      try {
        var data = await fetchAwemeDetail(awemeId);
        var v = data && data.video;
        var imgs = collectImageUrlsFromDetail(data);
        var url = "";
        if (imgs && imgs.length) {
          var base2 = await getSingleDownloadName(awemeId);
          var user2 = getUsernameFromDOM();
          await queueImageDownloadItems(imgs, base2, user2);
          return;
        } else if (v) {
          if (Array.isArray(v.bit_rate) && v.bit_rate.length) {
            var best = v.bit_rate.slice().sort(function (a, b) { return (b.bit_rate || 0) - (a.bit_rate || 0); })[0] || {};
            url = (best.play_addr && best.play_addr.url_list && best.play_addr.url_list[0]) ||
                  (best.download_addr && best.download_addr.url_list && best.download_addr.url_list[0]) || "";
          } else {
            url = (v.play_addr && v.play_addr.url_list && v.play_addr.url_list[0]) ||
                  (v.download_addr && v.download_addr.url_list && v.download_addr.url_list[0]) || "";
          }
        }
        url = ensureHttps(url);
        if (isVideoUrl(url) && !looksLikeImage(url)) {
          var filename = getTitleFromAnchorByAwemeId(awemeId) || await getSingleDownloadName(awemeId);
          chrome.runtime.sendMessage({ action: "downloadUrlDirect", url: url, awemeId: awemeId, user: null, closeThisTab: false, filename: filename });
          return;
        }
      } catch (e) { /* fallback below */ }
    }
    chrome.runtime.sendMessage({ action: "openTabAndDownload", url: aHref });
  }

  // ---------- UI: place buttons ----------
  function containerForAnchor(a) {
    return a.closest('[data-e2e="feed-item"]') ||
           a.closest('[data-e2e="user-post-item"]') ||
           a.closest('[data-e2e="search-card"]') ||
           a.closest("article") || a.parentElement || a;
  }

  function ensureButtonsOnVideos() { return; }

  function injectThumbButtons() {
    if (!isUserPage()) return;
    var anchors = {};
    Array.prototype.slice.call(document.querySelectorAll('a[href*="/video/"]')).forEach(function (a) { anchors[a.href + "|" + (a.dataset.dydl || "0")] = a; });
    Object.keys(anchors).forEach(function (k) {
      var a = anchors[k];
      if (a.dataset.dydl) return;
      a.dataset.dydl = "1";
      var wrap = containerForAnchor(a);
      if (!wrap.style.position) wrap.style.position = "relative";
      if (wrap.querySelector('.dydl-thumb-btn')) return;
      var btn = document.createElement("button");
      btn.className = "dydl-thumb-btn";
      btn.title = _("btnDownloadThis", "Download this video");
      btn.textContent = "↓";
      btn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        downloadByAwemeIdOrOpen(a.href);
        showToast(_("toastPreparing", "Preparing download..."));
      });
      wrap.appendChild(btn);
    });
    updatePlayingVisibility();
  }

  function updatePlayingVisibility() {
    var vids = Array.prototype.slice.call(document.querySelectorAll("video"));
    var playing = vids.find ? vids.find(function (v) { return !v.paused && v.currentTime > 0 && !v.ended; }) : null;
    var allBtns = Array.prototype.slice.call(document.querySelectorAll(".dydl-thumb-btn"));
    // Fullscreen or detail/live/modal page: hide all thumbnail buttons, show floating only (even if paused)
    if (isFullscreenAny() || isDetailPage() || isModalDetailPage() || isLivePage()) {
      allBtns.forEach(function (b) { try { b.style.display = "none"; if (!isUserPage()) b.remove(); } catch(e){} });
      ensureFloatingButton();
      // On detail/live pages, show even if autoplay is blocked
      setFloatingButtonVisible(true);
      return;
    }
    // User overview page: keep thumbnail buttons visible
    if (isUserPage()) {
      allBtns.forEach(function (b) { b.style.display = ""; b.classList && b.classList.remove("dydl-big"); });
      setFloatingButtonVisible(false);
      return;
    }
    // Non-user pages
    if (!playing) {
      // No playing: show thumbnail buttons; hide floating
      allBtns.forEach(function (b) { b.style.display = ""; b.classList && b.classList.remove("dydl-big"); });
      setFloatingButtonVisible(false);
      return;
    }
    // Playing on non-user page: hide thumbnail buttons and show floating
    allBtns.forEach(function (b) { b.style.display = "none"; b.classList && b.classList.remove("dydl-big"); });
    ensureFloatingButton();
    setFloatingButtonVisible(true);
  }

  function attachVideoListeners() {
    Array.prototype.slice.call(document.querySelectorAll("video")).forEach(function (v) {
      if (v.dataset.dydl) return;
      v.dataset.dydl = "1";
      ["play", "playing", "pause", "ended", "timeupdate"].forEach(function (ev) {
        v.addEventListener(ev, function () { try { updatePlayingVisibility(); } catch (e) {} }, { passive: true });
      });
    });
  }

  // ---------- floating download button for playing video ----------
  var floatingBtn = null;
  function ensureFloatingButton() {
    if (floatingBtn) return;
    var b = document.createElement("button");
    b.className = "dydl-floating-btn";
    b.textContent = "↓";
    b.title = _("btnDownloadThis", "Download this video");
    b.addEventListener("click", function (e) {
      e.preventDefault(); e.stopPropagation();
      downloadCurrentPlaying();
      showToast(_("toastPreparing", "Preparing download..."));
    });
    document.documentElement.appendChild(b);
    floatingBtn = b;
  }
  function setFloatingButtonVisible(v) {
    if (!floatingBtn) return;
    floatingBtn.style.display = v ? "" : "none";
  }

  // ---------- messages ----------
  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    (async function () {
      if (msg && msg.action === "exportLinksTxt") await exportLinksTxt();
      if (msg && msg.action === "downloadAllVideos") await downloadAllVideos();
      if (msg && msg.action === "downloadCurrentPlaying") await downloadCurrentPlaying();
      if (msg && msg.action === "downloadLivestream") await downloadLivestream();
      if (msg && msg.action === "fetchAndDownloadByAwemeId" && msg.awemeId) {
        setTimeout(async function () {
          // Try images first: DOM -> API -> network
          var domImgs = collectImageUrlsFromDOMStrict();
          if (domImgs && domImgs.length) {
            var baseDom = await getSingleDownloadName(msg.awemeId);
            var userDom = getUsernameFromDOM();
            await queueImageDownloadItems(domImgs, baseDom, userDom);
            try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){}
            return;
          }
          // API detail
          var detail = await fetchAwemeDetail(msg.awemeId);
          var imgs = collectImageUrlsFromDetail(detail);
          if (imgs && imgs.length) {
            var base3 = await getSingleDownloadName(msg.awemeId);
            var u3 = getUsernameFromDOM();
            await queueImageDownloadItems(imgs, base3, u3);
            try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){}
            return;
          }
          // Fallback: sniff network for aweme-images
          try {
            var imgsPerf = await findImagesInPerf(6000, 50);
            if (imgsPerf && imgsPerf.length) {
              var basePerf = await getSingleDownloadName(msg.awemeId);
              var userPerf = getUsernameFromDOM();
              await queueImageDownloadItems(imgsPerf, basePerf, userPerf);
              try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){}
              return;
            }
          } catch(e){}
          var u = await fetchBestUrlByAwemeId(msg.awemeId);
          if (!u) u = await getDirectVideoUrl(9000);
          if (u && isVideoUrl(u) && !looksLikeImage(u)) {
            var title = await getSingleDownloadName(msg.awemeId);
            chrome.runtime.sendMessage({ action: "downloadUrlDirect", url: u, awemeId: msg.awemeId, user: null, closeThisTab: true, filename: title });
          } else { showToast(_("toastReloadToCatch", "Could not capture. Reload and try again.")); }
        }, 600);
      }
      if (msg && msg.action === "downloadFromThisPage") {
        // Try to resolve awemeId from: /video/ID, modal_id, or playing context
        var qs0 = new URLSearchParams(location.search);
        var modal0 = qs0.get("modal_id");
        var m2 = location.pathname.match(/\/video\/(\d+)/);
        var awemeId2 = modal0 || (m2 && m2[1]) || (getAwemeIdFromPlaying() || null);

        // If we have an aweme id, first check for image posts
        if (awemeId2) {
          try {
            // DOM-first
            var domImgs2 = collectImageUrlsFromDOMStrict();
            if (domImgs2 && domImgs2.length) {
              var baseD = await getSingleDownloadName(awemeId2);
              var userD = getUsernameFromDOM();
              await queueImageDownloadItems(domImgs2, baseD, userD);
              var closeD = !!(msg && msg.fromTempTab);
              if (closeD) { try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){} }
              return;
            }
            var det0 = await fetchAwemeDetail(awemeId2);
            var imgs0 = collectImageUrlsFromDetail(det0);
            if (imgs0 && imgs0.length) {
              var title0 = await getSingleDownloadName(awemeId2);
              var user0 = getUsernameFromDOM();
              await queueImageDownloadItems(imgs0, title0, user0);
              var close0 = !!(msg && msg.fromTempTab);
              if (close0) { try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){} }
              return;
            }
          } catch(e) {}
        }
        // Fallback: sniff images from network resources when on a photo post
        try {
          var imgsNet = await findImagesInPerf(6000, 50);
          if (imgsNet && imgsNet.length) {
            var baseNet = await getSingleDownloadName(awemeId2 || String(Date.now()));
            var userNet = getUsernameFromDOM();
            await queueImageDownloadItems(imgsNet, baseNet, userNet);
            var closeNet = !!(msg && msg.fromTempTab);
            if (closeNet) { try { chrome.runtime.sendMessage({ action: "closeTempTab" }); } catch(e){} }
            return;
          }
        } catch(e){}

        // Fallback to best video or sniffing
        var u2 = null;
        if (awemeId2) u2 = await fetchBestUrlByAwemeId(awemeId2);
        if (!u2) u2 = await getDirectVideoUrl(9000);
        if (u2 && isVideoUrl(u2) && !looksLikeImage(u2) && !looksLikeAudio(u2)) {
          var title2 = await getSingleDownloadName(awemeId2 || String(Date.now()));
          var closeFlag = !!(msg && msg.fromTempTab);
          chrome.runtime.sendMessage({ action: "downloadUrlDirect", url: u2, awemeId: awemeId2 || String(Date.now()), user: null, closeThisTab: closeFlag, filename: title2 });
        } else {
          showToast(_("toastReloadToCatch", "Could not capture. Reload and try again."));
        }
      }
    })();
    return true;
  });

  // No in-page status updates; popup shows status

  // ---------- observers & init ----------
  var mo = new MutationObserver(function () { try { injectThumbButtons(); ensureButtonsOnVideos(); attachVideoListeners(); } catch (e) {} });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  injectThumbButtons();
  ensureButtonsOnVideos();
  attachVideoListeners();
  try { document.addEventListener("fullscreenchange", function(){ try { updatePlayingVisibility(); } catch(e){} }, { passive: true }); } catch(e) {}
  try { document.addEventListener("webkitfullscreenchange", function(){ try { updatePlayingVisibility(); } catch(e){} }, { passive: true }); } catch(e) {}
  setInterval(updatePlayingVisibility, 800);
})();
