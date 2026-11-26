App({
  onLaunch() {
    // 只做壳：业务全部在 web-view 里的票根 PWA，壳不读取用户数据。
  },
  onError(error) {
    console.error("piaogen-mini-shell", error);
  }
});