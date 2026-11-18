(function () {
  const DAY = 86400000;

  const CATEGORY = {
    appliance: { label: "家电", warrantyDays: 365, keywords: ["家电", "空调", "冰箱", "洗衣机", "电视", "空气炸锅", "烤箱", "微波炉", "热水器", "吸尘器"] },
    furniture: { label: "家具", warrantyDays: 730, keywords: ["家具", "餐桌", "沙发", "床", "衣柜", "书桌", "椅子", "茶几", "床垫"] },
    renovation: { label: "装修定金", warrantyDays: 365, keywords: ["装修", "定金", "订金", "合同", "瓷砖", "橱柜", "全屋定制", "施工", "尾款"] },
    digital: { label: "数码", warrantyDays: 365, keywords: ["手机", "电脑", "平板", "相机", "耳机", "数码"] },
    other: { label: "其他", warrantyDays: 365, keywords: [] }
  };

  const CHANNEL = {
    taobao: { label: "淘宝", priceDays: 7 },
    tmall: { label: "天猫", priceDays: 15 },
    jd: { label: "京东", priceDays: 7 },
    alipay: { label: "支付宝", priceDays: 0 },
    offline: { label: "线下", priceDays: 0 },
    other: { label: "其他", priceDays: 7 }
  };

  function startOfDay(value) {
    const d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(value, days) {
    const d = startOfDay(value);
    d.setDate(d.getDate() + days);
    return d;
  }

  function daysLeft(end) {
    const today = startOfDay(new Date());
    const target = startOfDay(end);
    return Math.ceil((target - today) / DAY);
  }

  function fmt(d) {
    const x = new Date(d);
    return `${x.getFullYear()}.${String(x.getMonth() + 1).padStart(2, "0")}.${String(x.getDate()).padStart(2, "0")}`;
  }

  function categoryOf(text = "") {
    const value = String(text);
    for (const [key, item] of Object.entries(CATEGORY)) {
      if (key === "other") continue;
      if (item.keywords.some((word) => value.includes(word))) return key;
    }
    return "other";
  }

  function channelOf(text = "") {
    const value = String(text);
    if (value.includes("天猫")) return "tmall";
    if (value.includes("淘宝")) return "taobao";
    if (value.includes("京东")) return "jd";
    if (value.includes("支付宝")) return "alipay";
    if (value.includes("线下") || value.includes("门店") || value.includes("收据")) return "offline";
    return "other";
  }

  function buildWindows(ticket) {
    const parsed = ticket.date ? new Date(ticket.date) : null;
    const hasDate = parsed && !Number.isNaN(parsed.getTime());
    if (!hasDate) {
      return [{
        type: "unknown",
        label: "截止日",
        start: "",
        end: "",
        daysLeft: null,
        source: "缺购买日期，先补日期再算",
        confidence: "需确认",
        status: "unknown"
      }];
    }
    const madeAt = parsed;
    const category = CATEGORY[ticket.category] || CATEGORY.other;
    const channel = CHANNEL[ticket.channel] || CHANNEL.other;
    const list = [];

    function push(type, label, end, source, confidence, status = "open") {
      const left = daysLeft(end);
      list.push({
        type,
        label,
        start: fmt(madeAt),
        end: fmt(end),
        daysLeft: left,
        source,
        confidence,
        status: left < 0 ? "closed" : left <= 3 ? "expiring" : status
      });
    }

    push("return", "退货", addDays(madeAt, 7), "七天无理由（线上，示例规则）", "示例");
    push("exchange", "换货", addDays(madeAt, 15), "十五日换货（三包，示例规则）", "示例");
    if (channel.priceDays > 0) {
      push("price", "价保", addDays(madeAt, channel.priceDays), `${channel.label}价保（示例，以订单页为准）`, "示例");
    } else {
      list.push({
        type: "price",
        label: "价保",
        start: fmt(madeAt),
        end: "",
        daysLeft: null,
        source: "该渠道价保规则需以订单页为准",
        confidence: "需确认",
        status: "unknown"
      });
    }
    push("warranty", "保修", addDays(madeAt, category.warrantyDays), `${category.label}保修（示例，以发票/保修卡为准）`, "示例");

    if (ticket.promise) {
      list.push({
        type: "promise",
        label: "承诺",
        start: fmt(madeAt),
        end: "",
        daysLeft: null,
        source: "商家承诺（待商家确认）",
        confidence: "待确认",
        status: "unknown"
      });
    }
    if (ticket.category === "renovation") {
      push("deposit", "定金/尾款", addDays(madeAt, 30), "合同/定金约定（示例，以合同为准）", "示例");
    }

    return list.sort((a, b) => {
      const av = a.daysLeft === null ? 9999 : a.daysLeft;
      const bv = b.daysLeft === null ? 9999 : b.daysLeft;
      return av - bv;
    });
  }

  function priority(ticket) {
    const open = (ticket.windows || []).filter((w) => w.daysLeft !== null && w.daysLeft >= 0);
    const rank = { price: 0, return: 1, exchange: 2, warranty: 3, deposit: 4, promise: 5 };
    open.sort((a, b) => (a.daysLeft - b.daysLeft) || ((rank[a.type] ?? 9) - (rank[b.type] ?? 9)));
    return open[0] || null;
  }

  function scriptFor(ticket, window) {
    const merchant = ticket.merchant || "商家";
    const amount = ticket.amount ? `¥${Number(ticket.amount).toFixed(2)}` : "这笔订单";
    const map = {
      return: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${ticket.date || "购买日期"}），还在七天无理由退货期内，想申请退货。请告诉我退货入口和需要寄回的材料。`,
      exchange: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}），还在十五日换货期内，商品出现需要换货的情况。请帮我确认换货流程和地址。`,
      price: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${ticket.date || "购买日期"}）还在价保期内，现在同款出现降价。请帮我确认是否符合价保条件、能退多少差价，以及需要提交哪些截图。`,
      warranty: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${ticket.date || "购买日期"}）还在保修期内。现在出现故障，请帮我确认保修范围、最近的服务网点和需要准备的材料。`,
      promise: `你好，购买时你方承诺：${ticket.promise}。请确认这条承诺是否仍然有效，以及兑现需要什么条件。`,
      deposit: `你好，我在${merchant}支付的${ticket.product || "装修定金"}（${amount}，${ticket.date || "支付日期"}），想确认定金退还/转尾款的条件和流程。请提供合同依据。`
    };
    return map[window.type] || `你好，我想咨询${merchant}这笔订单（${amount}）的售后处理方式。`;
  }

  function checklistFor(window) {
    const map = {
      return: ["订单截图", "商品现状照片", "包装/吊牌（如有）"],
      exchange: ["订单截图", "故障/瑕疵照片", "保修卡/发票（如有）"],
      price: ["订单截图", "当前降价页面", "同款链接/新订单（如有）"],
      warranty: ["订单截图", "发票/保修卡", "故障照片/视频"],
      promise: ["承诺截图/录音", "订单截图", "商家确认记录"],
      deposit: ["合同/定金收据", "付款记录", "沟通记录"]
    };
    return map[window.type] || ["订单截图", "相关证据"];
  }

  function portalFor(window) {
    const map = {
      return: { label: "打开淘宝/京东订单", url: "https://www.taobao.com" },
      exchange: { label: "打开订单页", url: "https://www.taobao.com" },
      price: { label: "打开价保入口", url: "https://www.taobao.com" },
      warranty: { label: "打开品牌售后", url: "https://www.alipay.com" },
      promise: { label: "打开商家沟通", url: "https://www.alipay.com" },
      deposit: { label: "打开合同/沟通", url: "https://www.alipay.com" }
    };
    return map[window.type] || { label: "打开官方入口", url: "https://www.alipay.com" };
  }

  window.PG = {
    CATEGORY,
    CHANNEL,
    categoryOf,
    channelOf,
    buildWindows,
    priority,
    scriptFor,
    checklistFor,
    portalFor,
    daysLeft,
    fmt,
    addDays,
    startOfDay
  };
})();
