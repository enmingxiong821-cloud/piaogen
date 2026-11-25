const DEFAULT_URL = "https://enmingxiong821-cloud.github.io/piaogen/?from=alipay-mini";

Page({
  data: {
    url: DEFAULT_URL
  },

  onLoad(query) {
    const raw = query && query.url ? decodeURIComponent(query.url) : "";
    // 只接受 https 链接；不接受 file、javascript、data 等协议。
    const url = /^https:\/\//i.test(raw) ? raw : DEFAULT_URL;
    this.setData({ url });
  },

  onMessage(event) {
    // 壳不处理业务数据，只记录 web-view 发来的非敏感事件。
    console.log("piaogen web-view message", event && event.detail);
  }
});