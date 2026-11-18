(function () {
  const DAY = 86400000;

  const CATEGORY = {
    appliance: { label: "家电", warrantyDays: 365, catalog: true, keywords: ["家电", "空调", "冰箱", "洗衣机", "电视", "空气炸锅", "烤箱", "微波炉", "热水器", "吸尘器", "油烟机", "电风扇"] },
    furniture: { label: "家具", warrantyDays: 730, catalog: false, keywords: ["家具", "餐桌", "沙发", "床", "衣柜", "书桌", "椅子", "茶几", "床垫", "橱柜"] },
    renovation: { label: "装修定金", warrantyDays: 365, catalog: false, keywords: ["装修", "定金", "订金", "合同", "瓷砖", "全屋定制", "施工", "尾款"] },
    digital: { label: "数码", warrantyDays: 365, catalog: true, keywords: ["手机", "电脑", "平板", "相机", "耳机", "数码", "笔记本"] },
    other: { label: "其他", warrantyDays: 365, catalog: false, keywords: [] }
  };

  const CHANNEL = {
    taobao: { label: "淘宝", priceDays: 7, online: true },
    tmall: { label: "天猫", priceDays: 15, online: true },
    jd: { label: "京东", priceDays: 7, online: true },
    alipay: { label: "支付宝", priceDays: 0, online: true },
    offline: { label: "线下", priceDays: 0, online: false },
    other: { label: "其他", priceDays: 7, online: true }
  };

  // 真实条款。每条都能点开原文，和“示例规则”不是一回事。
  const BASIS = {
    sanbao3: { law: "《部分商品修理更换退货责任规定》", article: "第三条", short: "谁经销谁负责；合同不得免除三包责任", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao8: { law: "《部分商品修理更换退货责任规定》", article: "第八条", short: "三包有效期自开具发票之日起算，扣除修理占用和无配件待修时间", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao9: { law: "《部分商品修理更换退货责任规定》", article: "第九条", short: "售出 7 日内发生性能故障，可选退货、换货或修理；退货按发票价一次退清", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao10: { law: "《部分商品修理更换退货责任规定》", article: "第十条", short: "售出 15 日内发生性能故障，可选换货或修理；换货免费调换同型号同规格", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao11: { law: "《部分商品修理更换退货责任规定》", article: "第十一条", short: "三包有效期内修理两次仍不能正常使用，凭修理记录免费换货或退货", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao12: { law: "《部分商品修理更换退货责任规定》", article: "第十二条", short: "无配件待修超 90 日、修理者原因超 30 日未修好，应免费换货", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    cpl24: { law: "《消费者权益保护法》", article: "第二十四条", short: "商品或服务不符合质量要求，可依规定或约定退货，或要求更换、修理；退换修的必要运输费由经营者承担", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    cpl25: { law: "《消费者权益保护法》", article: "第二十五条", short: "网络、电视、电话、邮购等方式购物，自收到商品起 7 日内可无理由退货（定制、鲜活易腐、拆封音像制品与软件、报刊除外）", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    cpl23: { law: "《消费者权益保护法》", article: "第二十三条第三款", short: "耐用商品或装饰装修，自接受之日起 6 个月内发现瑕疵，由经营者承担举证责任", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    deposit20: { law: "《民法典》", article: "第五百八十六条", short: "定金合同自实际交付时成立；定金不得超过主合同标的额 20%，超过部分不产生定金效力", url: "https://www.court.gov.cn/zixun/xiangqing/233181.html" },
    depositDouble: { law: "《民法典》", article: "第五百八十七条", short: "收受定金一方不履行债务致合同目的不能实现，应双倍返还定金", url: "https://www.court.gov.cn/zixun/xiangqing/233181.html" },
    platform: { law: "平台规则", article: "商品页/订单页", short: "价保是平台或商家的服务承诺，不是法定权利，天数和条件以订单页为准", url: "" },
    promise: { law: "商家承诺", article: "购买时页面或沟通记录", short: "承诺高于法定标准的，按承诺执行", url: "" }
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

    function push(type, label, end, basisId, confidence, extra = {}) {
      const b = BASIS[basisId];
      const left = daysLeft(end);
      list.push(Object.assign({
        type,
        label,
        start: fmt(madeAt),
        end: fmt(end),
        daysLeft: left,
        source: `${b.law}${b.article} · ${b.short}`,
        basis: { id: basisId, law: b.law, article: b.article, text: b.short, url: b.url },
        confidence,
        status: left < 0 ? "closed" : left <= 3 ? "expiring" : "open"
      }, extra));
    }

    // 目录内商品走三包，目录外走消保法 24 条兜底
    const returnBasis = category.catalog ? "sanbao9" : "cpl24";
    push("return", "退货", addDays(madeAt, 7), returnBasis, "法定", {
      alt: channel.online ? BASIS.cpl25 : null,
      note: channel.online
        ? "线上还可用《消保法》第二十五条：自收到商品起 7 日内无理由退货，起算日比这里更晚"
        : ""
    });

    if (category.catalog) {
      push("exchange", "换货", addDays(madeAt, 15), "sanbao10", "法定");
    } else {
      push("exchange", "换货", addDays(madeAt, 15), "cpl24", "法定", {
        note: "非目录商品按《消保法》第二十四条主张更换"
      });
    }

    if (channel.priceDays > 0) {
      push("price", "价保", addDays(madeAt, channel.priceDays), "platform", "平台", {
        note: `${channel.label}价保天数以订单页为准，这里的 ${channel.priceDays} 天只作提醒`
      });
    } else {
      const b = BASIS.platform;
      list.push({
        type: "price",
        label: "价保",
        start: fmt(madeAt),
        end: "",
        daysLeft: null,
        source: `${b.law}${b.article} · ${b.short}`,
        basis: { id: "platform", law: b.law, article: b.article, text: b.short, url: "" },
        confidence: "待确认",
        status: "unknown"
      });
    }

    push("warranty", "保修", addDays(madeAt, category.warrantyDays), category.catalog ? "sanbao8" : "cpl24", "法定", {
      note: category.catalog
        ? "目录内整机 1 年，主要部件 2–3 年；修理占用时间可顺延"
        : "非目录商品按约定或商家承诺保修"
    });

    if (ticket.promise) {
      const b = BASIS.promise;
      list.push({
        type: "promise",
        label: "承诺",
        start: fmt(madeAt),
        end: "",
        daysLeft: null,
        source: `${b.law}${b.article} · ${b.short}：${ticket.promise}`,
        basis: { id: "promise", law: b.law, article: b.article, text: b.short, url: "" },
        confidence: "待确认",
        status: "unknown"
      });
    }

    if (ticket.category === "renovation") {
      const b = BASIS.deposit20;
      list.push({
        type: "deposit",
        label: "定金",
        start: fmt(madeAt),
        end: "",
        daysLeft: null,
        source: `${b.law}${b.article} · ${b.short}`,
        basis: { id: "deposit20", law: b.law, article: b.article, text: b.short, url: b.url },
        confidence: "法定",
        status: "unknown",
        note: "对方违约可主张双倍返还（《民法典》第五百八十七条）"
      });
    }

    return list.sort((a, b) => {
      const av = a.daysLeft === null ? 9999 : a.daysLeft;
      const bv = b.daysLeft === null ? 9999 : b.daysLeft;
      return av - bv;
    });
  }

  // 定金罚则：有效定金、超出部分、双倍返还
  function depositCalc(total, paid, breachedByCounterparty = true) {
    const cap = Number(total) * 0.2;
    const paidNum = Number(paid);
    const valid = Math.min(paidNum, cap);
    const excess = Math.max(0, paidNum - cap);
    const back = breachedByCounterparty ? valid * 2 + excess : excess;
    return {
      total: Number(total),
      paid: paidNum,
      cap,
      valid,
      excess,
      back,
      note: String(paidNum) === "NaN" || !total ? "补上合同总额和已付定金再算" : ""
    };
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
    const when = ticket.date || "购买日期";
    const basis = (window && window.basis) || BASIS.cpl24;
    const cite = `依据${basis.law}${basis.article}：${basis.short}。`;
    const map = {
      return: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）还在退货期内。${cite}请告诉我退货入口、寄回地址和需要承担的费用。`,
      exchange: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）出现性能故障。${cite}请帮我安排换货，并确认上门或寄回的地址。`,
      price: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）现在同款降价。${cite}请帮我核对是否符合价保条件、能退多少差价、需要提交哪些截图。`,
      warranty: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）还在保修期内，现在出现故障。${cite}请帮我确认保修范围、最近的服务网点和需要准备的材料。`,
      promise: `你好，购买时你方承诺：${ticket.promise}。${cite}请确认这条承诺是否仍然有效，以及兑现需要什么条件。`,
      deposit: `你好，我在${merchant}支付的${ticket.product || "装修定金"}（${amount}，${when}）想确认退还或转尾款的条件。${cite}请提供合同里的定金条款。`
    };
    return map[window.type] || `你好，我想咨询${merchant}这笔订单（${amount}）的售后处理方式。`;
  }

  function checklistFor(window) {
    const map = {
      return: ["发票或订单截图", "商品现状照片", "包装、吊牌、赠品"],
      exchange: ["发票或订单截图", "性能故障照片或视频", "三包凭证、保修卡"],
      price: ["订单截图", "当前降价页面", "同款商品链接"],
      warranty: ["发票或三包凭证", "故障照片或视频", "此前的修理记录"],
      promise: ["承诺截图或录音", "订单截图", "与商家的沟通记录"],
      deposit: ["合同或定金收据", "付款记录", "沟通记录"]
    };
    return map[window.type] || ["订单截图", "相关证据"];
  }

  function portalFor(window) {
    const map = {
      return: { label: "打开订单页申请退货", url: "https://www.taobao.com" },
      exchange: { label: "打开订单页申请换货", url: "https://www.taobao.com" },
      price: { label: "打开订单页看价保", url: "https://www.taobao.com" },
      warranty: { label: "打开品牌售后", url: "https://www.alipay.com" },
      promise: { label: "打开商家沟通", url: "https://www.alipay.com" },
      deposit: { label: "打开合同与沟通记录", url: "https://www.alipay.com" }
    };
    return map[window.type] || { label: "打开官方入口", url: "https://www.alipay.com" };
  }

  window.PG = {
    CATEGORY,
    CHANNEL,
    BASIS,
    categoryOf,
    channelOf,
    buildWindows,
    depositCalc,
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