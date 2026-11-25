const DEFAULT_URL = "https://enmingxiong821-cloud.github.io/piaogen/?from=alipay-mini";

// 只有填入审核通过的订阅消息模板 ID 才会真正请求订阅；留空时什么都不做。
const REMINDER_TEMPLATE_ID = "";
const LAST_URL_KEY = "piaogen.lastUrl";

function readStorage(key, fallback) {
  try {
    const res = my.getStorageSync({ key });
    return res && res.data != null ? res.data : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeStorage(key, data) {
  try {
    my.setStorageSync({ key, data });
  } catch (e) {
    // 拿不到存储权限时按无缓存处理，不影响打开页面。
  }
}

function safeSystemInfo() {
  try {
    if (my.getSystemInfoSync) return my.getSystemInfoSync() || {};
    if (my.getSystemInfo) {
      let info = null;
      // 同步 API 缺失时退回异步，但 onLoad 不等它，避免白屏。
      my.getSystemInfo({ success: (res) => { info = res; } });
      return info || {};
    }
  } catch (e) {}
  return {};
}

Page({
  data: {
    url: DEFAULT_URL
  },

  onLoad(query) {
    const raw = query && query.url ? decodeURIComponent(query.url) : "";
    // 只接受 https 链接；不接受 file、javascript、data 等协议。
    const picked = /^https:\/\//i.test(raw) ? raw : (readStorage(LAST_URL_KEY, "") || DEFAULT_URL);
    const url = /^https:\/\//i.test(picked) ? picked : DEFAULT_URL;
    writeStorage(LAST_URL_KEY, url);

    // 只取与界面有关的系统信息；不读账号、手机号、位置、通讯录。
    const sys = safeSystemInfo();
    const dark = /dark/i.test(String(sys.theme || ""));
    this.setData({ url: this.withHints(url, { dark, platform: sys.platform || "" }) });
  },

  withHints(url, hints) {
    const join = url.includes("?") ? "&" : "?";
    const parts = ["mini=alipay"];
    if (hints.dark) parts.push("theme=dark");
    if (hints.platform) parts.push(`platform=${encodeURIComponent(String(hints.platform).toLowerCase())}`);
    if (/[?&]mini=/.test(url)) return url;
    return `${url}${join}${parts.join("&")}`;
  },

  onMessage(event) {
    const detail = (event && event.detail) || {};
    // 壳不处理业务数据，只响应网页里用户明确点下的动作。
    if (detail.type === "subscribe-reminder") this.requestReminder();
  },

  requestReminder() {
    if (!REMINDER_TEMPLATE_ID) {
      console.log("piaogen: 未配置订阅消息模板，跳过");
      return;
    }
    try {
      my.requestSubscribeMessage({
        entityIds: [REMINDER_TEMPLATE_ID],
        success: (res) => console.log("piaogen: 订阅结果", res && res.behavior),
        fail: (err) => console.log("piaogen: 订阅失败", err && err.error)
      });
    } catch (e) {
      console.log("piaogen: 当前基础库不支持订阅消息");
    }
  }
});