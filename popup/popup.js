
// popup/popup.js - v1.0.5
// ----- lightweight i18n loader -----
async function loadLocaleMessages(locale) {
  const loc = (locale || '').trim() || (chrome.i18n?.getUILanguage?.() || 'en');
  try {
    const url = chrome.runtime.getURL(`_locales/${loc}/messages.json`);
    const res = await fetch(url);
    if (!res.ok) throw new Error('http '+res.status);
    const json = await res.json();
    window.__DYDL_I18N__ = { locale: loc, messages: json };
  } catch {
    if (loc !== 'en') return loadLocaleMessages('en');
    window.__DYDL_I18N__ = { locale: 'en', messages: {} };
  }
}
function _(k, fallback="") {
  try { const m = window.__DYDL_I18N__?.messages?.[k]?.message; return m || chrome.i18n.getMessage(k) || fallback; } catch { return fallback; }
}
// react to locale change
// language fixed; ignore localeChanged

function queryActiveDouyinTab() {
  return chrome.tabs.query({ active: true, currentWindow: true }).then(tabs => {
    const tab = tabs[0];
    if (tab && /:\/\/.*(douyin\.com|iesdouyin\.com)/.test(tab.url || "")) return tab;
    return null;
  });
}

function wireI18n() {
  document.querySelector("#btn-play").textContent = _("popupPlay","Download this video/photos");
  document.querySelector("#btn-export").textContent = _("popupExport","Export links (txt)");
  document.querySelector("#btn-all").textContent = _("popupAll","Download all (user)");
  document.querySelector("#btn-paste").textContent = _("popupPasteDownload","Download");
  document.querySelector("label[for=pasteLabel]")?.remove();
  document.querySelector(".paste label").textContent = _("popupFromLink","Download from link/share");
  document.querySelector("#btn-live").textContent = _("popupLive","Download livestream (this tab)");
  try { document.getElementById("note-refresh").textContent = _("noteRefresh","If video/photos/livestream don't start, refresh the page (F5) and try again."); } catch{}
  try { document.getElementById("statusLabel").textContent = _("statusLabel","Status:"); } catch{}
  try { document.getElementById("lnk-settings").textContent = _("settingsLink","Settings"); } catch{}
}

async function sendMessageSafe(target, message) {
  try {
    const res = await chrome.tabs.sendMessage(target.id, message);
    return res;
  } catch (e) {
    // If content not ready, try again once
    await new Promise(r => setTimeout(r, 1200));
    try { return await chrome.tabs.sendMessage(target.id, message); } catch { return null; }
  }
}

document.getElementById("btn-play").addEventListener("click", async () => {
  const tab = await queryActiveDouyinTab();
  if (!tab) { alert(_("toastNeedDouyinTab","Open a Douyin tab first.")); return; }
  await sendMessageSafe(tab, { action: "downloadCurrentPlaying" });
});

document.getElementById("btn-export").addEventListener("click", async () => {
  const tab = await queryActiveDouyinTab();
  if (!tab) { alert(_("toastNeedUserPage","Open a Douyin user page then try again.")); return; }
  await sendMessageSafe(tab, { action: "exportLinksTxt" });
});

document.getElementById("btn-all").addEventListener("click", async () => {
  const tab = await queryActiveDouyinTab();
  if (!tab) { alert(_("toastNeedUserPage","Open a Douyin user page then try again.")); return; }
  await sendMessageSafe(tab, { action: "downloadAllVideos" });
});

document.getElementById("btn-paste").addEventListener("click", async () => {
  const text = (document.getElementById("paste").value || "").trim();
  if (!text) { alert(_("popupFromLink","Download from link/share")); return; }
  try {
    const res = await chrome.runtime.sendMessage({ action: "downloadFromTextLink", text });
    if (!res?.ok) alert(res?.error || "Error");
  } catch (e) {
    alert("Background not responding.");
  }
});

// Livestream
let liveBtn = document.getElementById("btn-live");
if (!liveBtn) {
  const actions = document.querySelector(".actions");
  const btn = document.createElement("button");
  btn.id = "btn-live";
  actions.appendChild(btn);
}
document.getElementById("btn-live").addEventListener("click", async () => {
  const tab = await queryActiveDouyinTab();
  if (!tab) { alert(_("toastNeedLiveTab","Open a live.douyin.com tab first.")); return; }
  await sendMessageSafe(tab, { action: "downloadLivestream" });
});

// Status
async function refreshStatus() {
  try {
    const st = await chrome.runtime.sendMessage({ action: "getStatus" });
    if (!st) return;
    document.getElementById("ok").textContent = st.completed;
    document.getElementById("fail").textContent = st.failed;
    document.getElementById("act").textContent = st.active;
    document.getElementById("qlen").textContent = st.queueLength || (st.queue?.length || 0);
    document.getElementById("stat").textContent = (st.active>0 || st.queueLength>0) ? _("statusBusy","Downloading...") : _("statusIdle","Idle");
    const s = st.scan;
    const scanEl = document.getElementById("scan");
    if (s && (s.phase === "init" || s.phase === "scan" || s.phase === "queue")) {
      scanEl.style.display = "grid";
      document.getElementById("phase").textContent = s.phase;
      document.getElementById("user").textContent = s.user || "";
      const done = s.done||0, total = s.total||0;
      document.getElementById("done").textContent = done;
      document.getElementById("total").textContent = total;
      const pct = total>0 ? Math.min(100, Math.floor(done*100/total)) : 0;
      document.getElementById("fill").style.width = pct+"%";
    } else if (s && s.phase === "done") {
      scanEl.style.display = "grid";
      document.getElementById("phase").textContent = "done";
      document.getElementById("user").textContent = s.user || "";
      document.getElementById("done").textContent = s.done||0;
      document.getElementById("total").textContent = s.total||0;
      document.getElementById("fill").style.width = "100%";
    } else {
      scanEl.style.display = "none";
    }
  } catch(e) {}
}
setInterval(refreshStatus, 1000);
// load locale then wire labels
(async () => {
  try {
    const st = await chrome.storage.sync.get(["forceLocale"]);
    await loadLocaleMessages(st.forceLocale||"en");
  } catch { await loadLocaleMessages("en"); }
  refreshStatus();
  wireI18n();
  // placeholder for paste
  try { document.getElementById("paste").placeholder = _("popupPastePlaceholder","Paste a link… e.g. https://v.douyin.com/xxxx/"); } catch{}
  // version stamp
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'));
    const man = await res.json();
    document.getElementById('ver').textContent = man.version || '';
    document.getElementById('year').textContent = String(new Date().getFullYear());
  } catch {}
})();
