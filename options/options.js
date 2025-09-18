
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
function _(k, fallback="") { try { const m = window.__DYDL_I18N__?.messages?.[k]?.message; return m || chrome.i18n.getMessage(k) || fallback; } catch { return fallback; } }

document.addEventListener("DOMContentLoaded", async () => {
  try { const st = await chrome.storage.sync.get(["forceLocale"]); await loadLocaleMessages(st.forceLocale||"en"); } catch { await loadLocaleMessages("en"); }
  const tpl = document.getElementById("tpl");
  const cc = { value: 1 }; // deprecated
  const msg = document.getElementById("msg");
  const reqDelay = document.getElementById("reqDelay");
  const batchSize = document.getElementById("batchSize");
  const batchDelay = document.getElementById("batchDelay");
  const bulkOrder = document.getElementById("bulkOrder");
  const bulkTitleIncludes = document.getElementById("bulkTitleIncludes");
  const bulkLimit = document.getElementById("bulkLimit");
  const uiLang = null;
  // i18n labels
  try {
    document.title = "Douyin Downloader - " + _("optionsTitle", "Settings");
    document.getElementById("hdr").textContent = _("optionsTitle", "Settings");
    document.querySelector('label[for=tpl]')?.remove();
    document.getElementById('lbl-tpl').textContent = _("optionsFolderTemplate", "Default folder name template (inside Downloads):");
    document.getElementById('lbl-hints').textContent = _("optionsHints", "Hints: {user}, {count}");
    document.getElementById('lbl-reqdelay').textContent = _("optionsReqDelay", "Delay between requests (ms):");
    // bulk labels
    document.getElementById('lg-bulk').textContent = _("optionsBulkLegend","Bulk download");
    document.getElementById('lbl-bsize').textContent = _("optionsBatchSize","Batch size:");
    document.getElementById('lbl-bdelay').textContent = _("optionsBatchDelay","Delay between batches (s):");
    document.getElementById('lbl-order').textContent = "Filter:";
    document.getElementById('lbl-title').textContent = _("optionsFilterTitle","Filter title (contains):");
    document.getElementById('lbl-limit').textContent = _("optionsLimit","Limit (0 = unlimited):");
    // language legend
    document.getElementById('lg-lang').textContent = _("optionsLanguage","Language");
    document.getElementById('lbl-lang').textContent = _("optionsUiLanguage","UI Language:");
    document.getElementById("save").textContent = _("optionsSave", "Save");
  } catch {}

  const data = await chrome.storage.sync.get(["defaultFolderTemplate", "concurrency", "requestDelayMs", "batchSize", "batchDelaySeconds", "bulkOrder", "bulkTitleIncludes", "bulkLimit", "forceLocale"]);
  tpl.value = data.defaultFolderTemplate || "{user}-{count}";
  reqDelay.value = data.requestDelayMs || 0;
  batchSize.value = data.batchSize || 5;
  batchDelay.value = data.batchDelaySeconds || 30;
  bulkOrder.value = data.bulkOrder || "none";
  bulkTitleIncludes.value = data.bulkTitleIncludes || "";
  bulkLimit.value = data.bulkLimit || 0;
  // language toggler (hidden; force EN)
  // fixed English UI; ignore forceLocale

  document.getElementById("save").addEventListener("click", async () => {
    const defaultFolderTemplate = tpl.value.trim() || "{user}-{count}";
    await chrome.runtime.sendMessage({ action: "setSettings", defaultFolderTemplate, requestDelayMs: parseInt(reqDelay.value||"0",10), batchSize: parseInt(batchSize.value||"5",10), batchDelaySeconds: parseInt(batchDelay.value||"30",10), bulkOrder: bulkOrder.value, bulkTitleIncludes: bulkTitleIncludes.value.trim(), bulkLimit: parseInt(bulkLimit.value||"0",10) });
    msg.textContent = _("optionsSaved", "Đã lưu!");
    setTimeout(()=> msg.textContent = "", 1500);
  });
});
