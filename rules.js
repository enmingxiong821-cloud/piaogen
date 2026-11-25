(function () {
  const DAY = 86400000;
  const REAL = window.PG_REAL || {};
  const SANBAO_ITEMS = (REAL.sanbao && REAL.sanbao.items) || [];
  const PATHS = (REAL.paths || []);
  const CANCEL_GUIDE = (REAL.cancelGuide && REAL.cancelGuide.items) || [];
  const CANCEL_NOTE = (REAL.cancelGuide && REAL.cancelGuide.note) || "";
  const PRICE_RULES = REAL.priceRules || {};
  const BRANDS = (REAL.brands && REAL.brands.brands) || [];
  const EVIDENCE = REAL.evidence || {};
  const REPLY_RULES = REAL.replyRules || {};

  const CATEGORY = {
    appliance: { label: "家电", keywords: ["家电", "空调", "冰箱", "洗衣机", "电视", "空气炸锅", "烤箱", "微波炉", "热水器", "吸尘器", "油烟机", "电风扇", "净水器", "扫地机器人"] },
    furniture: { label: "家具", keywords: ["家具", "餐桌", "沙发", "床", "衣柜", "书桌", "椅子", "茶几", "床垫", "橱柜"] },
    renovation: { label: "装修定金", keywords: ["装修", "定金", "订金", "合同", "瓷砖", "全屋定制", "施工", "尾款"] },
    digital: { label: "数码", keywords: ["手机", "电脑", "平板", "相机", "耳机", "数码", "笔记本", "摄像机", "录像机", "收录机", "显示器", "屏幕", "手表"] },
    apparel: { label: "服饰鞋包", keywords: ["衣服", "外套", "羽绒", "鞋", "靴", "包", "裤", "裙", "内衣", "箱", "袜"] },
    food: { label: "食品生鲜", keywords: ["食品", "生鲜", "水果", "牛奶", "零食", "大米", "肉", "菜", "麦片", "拉面", "面", "饭", "外卖", "餐", "汉堡", "奶茶", "咖啡"] },
    beauty: { label: "美妆个护", keywords: ["护肤", "面霜", "精华", "口红", "洗发", "沐浴", "化妆品"] },
    baby: { label: "母婴", keywords: ["奶粉", "纸尿裤", "婴儿", "童装", "玩具", "推车"] },
    auto: { label: "汽车", keywords: ["汽车", "车辆", "轮胎", "保养", "4S", "车主", "摩托车"] },
    prepaid: { label: "预付卡", keywords: ["预付", "储值", "会员卡", "课时", "健身卡", "美容卡", "年卡", "充值"] },
    grocery: { label: "商超", keywords: ["超市", "便利店", "商超", "购物广场", "百货"] },
    other: { label: "其他", keywords: [] }
  };

  const CHANNEL = {
    taobao: { label: "淘宝", online: true, platform: "taobao" },
    tmall: { label: "天猫", online: true, platform: "taobao" },
    jd: { label: "京东", online: true, platform: "jd" },
    alipay: { label: "支付宝", online: true, platform: "alipay" },
    pdd: { label: "拼多多", online: true, platform: "pdd" },
    douyin: { label: "抖音电商", online: true, platform: "douyin" },
    kuaishou: { label: "快手电商", online: true, platform: "other" },
    xhs: { label: "小红书", online: true, platform: "other" },
    vip: { label: "唯品会", online: true, platform: "other" },
    suning: { label: "苏宁", online: true, platform: "other" },
    meituan: { label: "美团", online: true, platform: "other" },
    eleme: { label: "饿了么", online: true, platform: "eleme" },
    wechat: { label: "微信支付", online: true, platform: "wechat" },
    offline: { label: "线下", online: false, platform: "offline" },
    other: { label: "其他", online: true, platform: "other" }
  };

  const BASIS = {
    sanbao3: { law: "《部分商品修理更换退货责任规定》", article: "第三条", short: "谁经销谁负责；合同不得免除三包责任", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao8: { law: "《部分商品修理更换退货责任规定》", article: "第八条", short: "三包有效期自开具发票之日起算，扣除修理占用和无配件待修时间", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao9: { law: "《部分商品修理更换退货责任规定》", article: "第九条", short: "目录内产品自售出之日起 7 日内发生性能故障，可选退货、换货或修理", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao10: { law: "《部分商品修理更换退货责任规定》", article: "第十条", short: "目录内产品自售出之日起 15 日内发生性能故障，可选换货或修理", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao11: { law: "《部分商品修理更换退货责任规定》", article: "第十一条", short: "三包有效期内修理两次仍不能正常使用，凭修理记录免费换货或退货", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    sanbao12: { law: "《部分商品修理更换退货责任规定》", article: "第十二条", short: "无配件待修超 90 日、修理者原因超 30 日未修好，应免费换货", url: "https://www.samr.gov.cn/zw/zfxxgk/fdzdgknr/zlfzs/art/2023/art_b05a6da5edd74778bf7d899f0cbcc728.html" },
    cpl24: { law: "《消费者权益保护法》", article: "第二十四条", short: "商品或服务不符合质量要求，可依规定或约定退货，或要求更换、修理", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    cpl25: { law: "《消费者权益保护法》", article: "第二十五条", short: "网络等方式购物，自收到商品起 7 日内可无理由退货；定制、鲜活易腐、拆封音像/软件、报刊等除外", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    cpl23: { law: "《消费者权益保护法》", article: "第二十三条第三款", short: "耐用商品或装饰装修，自接受之日起 6 个月内发现瑕疵，由经营者承担举证责任", url: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm" },
    deposit20: { law: "《民法典》", article: "第五百八十六条", short: "定金合同自实际交付时成立；定金不得超过主合同标的额 20%，超过部分不产生定金效力", url: "https://www.gov.cn/xinwen/2020-06/01/content_5516649.htm" },
    depositDouble: { law: "《民法典》", article: "第五百八十七条", short: "收受定金一方不履行债务致合同目的不能实现，应双倍返还定金", url: "https://www.gov.cn/xinwen/2020-06/01/content_5516649.htm" },
    xiaobao10: { law: "《消费者权益保护法实施条例》", article: "第十条", short: "自动展期、自动续费应在接受服务前和续费日期前以显著方式提醒", url: "https://www.gov.cn/gongbao/2024/issue_11266/202404/content_6944108.html" },
    platformPrice2026: { law: "《互联网平台价格行为规则》", article: "自动续期 / 自动扣款", short: "2026-04-10 起，每次扣款前应显著提醒扣款时间、金额、取消途径，允许随时取消；收费标准变化应一并通知", url: "https://www.ndrc.gov.cn/xxgk/zcfb/ghxwj/202512/t20251217_1402474_ext.html" },
    xiaobao22: { law: "《消费者权益保护法实施条例》", article: "第二十二条", short: "收取预付款应订立书面合同；未按约定提供商品或服务，应按要求履行或退还预付款", url: "https://www.gov.cn/gongbao/2024/issue_11266/202404/content_6944108.html" },
    kuaidi28: { law: "《快递市场管理办法》", article: "第二十八条", short: "未经用户同意，不得代为确认收到快件，不得擅自将快件投递到智能快件箱、快递服务站等末端服务设施", url: "https://www.gov.cn/zhengce/202401/content_6924448.htm" },
    kuaidi54: { law: "《快递市场管理办法》", article: "第五十四条", short: "违反快递服务规定，由邮政管理部门责令改正并处罚款；具体处罚以原文与监管部门认定为准", url: "https://www.gov.cn/zhengce/202401/content_6924448.htm" },
    prepaid2025: { law: "《最高人民法院关于审理预付式消费民事纠纷案件适用法律若干问题的解释》", article: "法释〔2025〕4号", short: "付款七日内原则上可请求返还预付款本金；迁店明显不便、擅自转店、服务无法正常提供等可主张解除合同；以具体证据和合同为准", url: "https://bxx.lncourt.gov.cn/article/detail/2025/03/id/8751313.shtml" },
    loanCost2026: { law: "《个人贷款业务明示综合融资成本规定》", article: "金规〔2026〕2号", short: "2026-08-01 起，个人贷款应明示正常履约和违约情形下的综合融资成本，利息、分期费、增信费等都应纳入", url: "https://sousuo.www.gov.cn/sousuo/search.shtml?code=17da70961a7&searchWord=%E4%B8%AA%E4%BA%BA%E8%B4%B7%E6%AC%BE%E4%B8%9A%E5%8A%A1%E6%98%8E%E7%A4%BA%E7%BB%BC%E5%90%88%E8%9E%8D%E8%B5%84%E6%88%90%E6%9C%AC%E8%A7%84%E5%AE%9A" },
    loanApr2021: { law: "《中国人民银行公告〔2021〕第3号》", article: "贷款年化利率", short: "贷款年化利率应以全部贷款成本与实际占用本金的比例折算；营销和合同应显著展示年化利率", url: "https://sousuo.www.gov.cn/sousuo/search.shtml?code=17da70961a7&searchWord=%E4%B8%AD%E5%9B%BD%E4%BA%BA%E6%B0%91%E9%93%B6%E8%A1%8C%E5%85%AC%E5%91%8A%E3%80%942021%E3%80%95%E7%AC%AC3%E5%8F%B7" },
    financialSuitability2026: { law: "《金融机构产品适当性管理办法》", article: "2025年第7号令", short: "2026-02-01 起施行；金融机构应了解产品、了解客户，把适当产品通过适当渠道给适合客户", url: "https://www.nfra.gov.cn/cn/view/pages/rulesDetail.html?docId=1217183&itemId=4214&generaltype=1" },
    platform: { law: "平台/商家价保承诺", article: "订单页", short: "价保是平台或商家的服务承诺，不是法定权利；天数、起算和条件以订单页为准", url: "" },
    promise: { law: "商家承诺", article: "购买时页面或沟通记录", short: "经营者应按其承诺履行；承诺高于法定标准的，按承诺执行", url: "https://www.gov.cn/gongbao/2024/issue_11266/202404/content_6944108.html" }
  };

  const RULES_META = { version: "2026.11.21-v9.2", checkedAt: "2026-11-21" };

  const EFFECTIVE = {
    sanbao3: "1995-08-25", sanbao8: "1995-08-25", sanbao9: "1995-08-25",
    sanbao10: "1995-08-25", sanbao11: "1995-08-25", sanbao12: "1995-08-25",
    cpl23: "2014-03-15", cpl24: "2014-03-15", cpl25: "2014-03-15",
    deposit20: "2021-01-01", depositDouble: "2021-01-01",
    xiaobao10: "2024-07-01", platformPrice2026: "2026-04-10", xiaobao22: "2024-07-01",
    prepaid2025: "2025-05-01", loanCost2026: "2026-08-01",
    loanApr2021: "2021-03-31", financialSuitability2026: "2026-02-01",
    platform: "以订单页为准", promise: "以承诺为准"
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

  function addBusinessDays(value, days) {
    const d = startOfDay(value);
    let left = Number(days) || 0;
    while (left > 0) {
      d.setDate(d.getDate() + 1);
      const day = d.getDay();
      if (day !== 0 && day !== 6) left -= 1;
    }
    return d;
  }

  function addMonths(value, months) {
    const d = startOfDay(value);
    const targetDay = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + Number(months || 0));
    const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(targetDay, last));
    return d;
  }

  function addYears(value, years) {
    return addMonths(value, Number(years || 0) * 12);
  }

  function daysLeft(end) {
    const today = startOfDay(new Date());
    const normalized = typeof end === "string" ? end.replace(/\./g, "-") : end;
    const target = startOfDay(normalized);
    return Math.ceil((target - today) / DAY);
  }

  function fmt(d) {
    if (!d) return "";
    const x = new Date(d);
    if (Number.isNaN(x.getTime())) return "";
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
    if (value.includes("拼多多") || value.includes("多多买菜")) return "pdd";
    if (value.includes("抖音")) return "douyin";
    if (value.includes("快手")) return "kuaishou";
    if (value.includes("小红书")) return "xhs";
    if (value.includes("唯品会")) return "vip";
    if (value.includes("苏宁")) return "suning";
    if (value.includes("美团") || value.includes("大众点评")) return "meituan";
    if (value.includes("饿了么") || value.includes("蜂鸟")) return "eleme";
    if (value.includes("食无忧") || value.includes("订单已送达") && value.includes("客服")) return "eleme";
    if (value.includes("微信支付") || value.includes("微信账单")) return "wechat";
    if (value.includes("支付宝") || value.includes("花呗") || value.includes("余额宝")) return "alipay";
    if (value.includes("超市") || value.includes("便利店") || value.includes("百货")) return "offline";
    if (value.includes("线下") || value.includes("门店") || value.includes("收据") || value.includes("小票")) return "offline";
    if (value.includes("京东自营") || value.includes("京东白条") || value.includes("PLUS会员")) return "jd";
    if (value.includes("菜鸟驿站") || value.includes("退货宝") || value.includes("交易成功") || value.includes("闲鱼")) return "taobao";
    return "other";
  }

  const CATALOG_ALIASES = [
    ["家用空调器", /空调/],
    ["家用电冰箱", /冰箱/],
    ["洗衣机", /洗衣机/],
    ["黑白电视机", /黑白电视/],
    ["彩色电视机", /电视/],
    ["电风扇", /电风扇|风扇/],
    ["微波炉", /微波炉/],
    ["吸尘器", /吸尘器/],
    ["吸排油烟机", /油烟机|吸排/],
    ["燃气热水器", /燃气热水器/],
    ["摩托车", /摩托车/],
    ["自行车", /自行车/],
    ["摄像机", /摄像机/],
    ["家用录像机", /录像机/],
    ["收录机", /收录机|音响/],
    ["电子琴", /电子琴/],
    ["缝纫机", /缝纫机/],
    ["钟表", /钟表|手表/]
  ];

  function catalogFor(ticket) {
    const text = `${ticket && ticket.product || ""} ${ticket && ticket.merchant || ""} ${ticket && ticket.raw || ""}`;
    for (const [name, rx] of CATALOG_ALIASES) {
      if (rx.test(text)) return SANBAO_ITEMS.find((item) => item.name === name) || null;
    }
    return null;
  }

  function brandFor(ticket) {
    const explicit = ticket && (ticket.warrantyBrand || (ticket.warranty && ticket.warranty.brand));
    if (explicit) {
      const hit = BRANDS.find((b) => String(explicit).includes(b.brand));
      if (hit) return hit;
    }
    const text = `${ticket && ticket.product || ""} ${ticket && ticket.merchant || ""} ${ticket && ticket.raw || ""}`;
    const lower = text.toLowerCase();
    if (/iphone|ipad|mac|apple|airpods/.test(lower)) return BRANDS.find((b) => b.brand === "Apple") || null;
    return BRANDS.find((b) => text.includes(b.brand)) || null;
  }

  function pushWindow(list, opt) {
    const basis = opt.basisId ? BASIS[opt.basisId] : null;
    const end = opt.end || "";
    const left = end ? daysLeft(end) : null;
    const applicability = opt.applicability || (left === null ? "unknown" : "applicable");
    let status = "unknown";
    if (applicability === "not_applicable") status = "not_applicable";
    else if (left === null) status = "unknown";
    else if (left < 0) status = "closed";
    else if (left <= 3) status = "expiring";
    else status = "open";
    list.push(Object.assign({
      type: opt.type,
      label: opt.label,
      start: opt.start ? fmt(opt.start) : "",
      end: end ? fmt(end) : "",
      daysLeft: left,
      amount: Number(opt.amount) || 0,
      applicability,
      status,
      source: opt.source || (basis ? `${basis.law}${basis.article} · ${basis.short}` : ""),
      basis: basis ? { id: opt.basisId, law: basis.law, article: basis.article, text: basis.short, url: basis.url } : null,
      note: opt.note || "",
      details: opt.details || ""
    }, opt.extra || {}));
  }

  function buildWindows(ticket) {
    if (ticket && ticket.noWindows) return [];
    const baseDate = ticket.date || ticket.invoiceDate || ticket.receivedDate;
    const parsed = baseDate ? new Date(baseDate) : null;
    const hasDate = parsed && !Number.isNaN(parsed.getTime());
    if (!hasDate) {
      return [{
        type: "unknown",
        label: "截止日",
        start: "",
        end: "",
        daysLeft: null,
        applicability: "unknown",
        status: "unknown",
        source: "缺购买日期，先补日期再算",
        note: ""
      }];
    }

    const invoiceDate = ticket.invoiceDate ? new Date(ticket.invoiceDate) : parsed;
    const receivedDate = ticket.receivedDate ? new Date(ticket.receivedDate) : null;
    const category = CATEGORY[ticket.category] || CATEGORY.other;
    const channel = CHANNEL[ticket.channel] || CHANNEL.other;
    const catalog = catalogFor(ticket);
    const list = [];

    const depositCase = ticket.category === "renovation" || ticket.category === "prepaid" || ticket.deposit;
    // 商超不只卖吃的：洗洁精、纸巾等仍应有 7 天无理由。
    // 只有明确是食品的商品，才按食品/生鲜处理。
    const groceryFood = ticket.category === "grocery" &&
      /食品|生鲜|水果|蔬菜|牛奶|酸奶|面包|饼干|零食|大米|面粉|食用油|猪肉|牛肉|鸡蛋|方便面|拉面|火腿|月饼|麦片|燕麦/.test(
        `${ticket.product || ""} ${ticket.raw || ""}`
      );
    const foodLike = category.label === "食品生鲜" || channel.platform === "eleme" || ticket.category === "food" || groceryFood;

    if (!depositCase) {
      if (channel.online) {
        if (ticket.noReasonException || ticket.noReason === false || foodLike) {
          pushWindow(list, {
            type: "return",
            label: "无理由退货",
            applicability: "not_applicable",
            source: foodLike
              ? "食品/外卖通常不适用 7 天无理由；质量问题按《消保法》第二十四条主张"
              : "订单页/法定例外：不支持 7 天无理由，或属于定制、鲜活易腐、拆封音像/软件、报刊等",
            note: "质量问题仍可按《消保法》第二十四条主张"
          });
          if (foodLike) {
            pushWindow(list, {
              type: "quality",
              label: "食品质量问题",
              applicability: "unknown",
              basisId: "cpl24",
              source: "异物、变质、撒漏等按《消保法》第二十四条主张；不适用 7 天无理由",
              note: "留好照片/视频、外包装和批次信息"
            });
          }
        } else if (receivedDate) {
          pushWindow(list, {
            type: "return",
            label: "无理由退货",
            start: receivedDate,
            end: addDays(receivedDate, 7),
            basisId: "cpl25",
            note: "从签收日起算；商品需完好、不影响二次销售"
          });
        } else {
          pushWindow(list, {
            type: "return",
            label: "无理由退货",
            applicability: "unknown",
            source: "需要签收日；线上 7 天无理由从收到商品之日起算",
            note: "补上签收日后再算，不从下单日猜"
          });
        }
      }

      if (catalog) {
        pushWindow(list, {
          type: "three_return",
          label: "三包退货",
          start: invoiceDate,
          end: addDays(invoiceDate, 7),
          basisId: "sanbao9",
          note: "目录内商品，性能故障；从发票日起算"
        });
        pushWindow(list, {
          type: "three_exchange",
          label: "三包换货",
          start: invoiceDate,
          end: addDays(invoiceDate, 15),
          basisId: "sanbao10",
          note: "目录内商品，性能故障；从发票日起算"
        });
      } else if (ticket.issue === "quality") {
        pushWindow(list, {
          type: "quality",
          label: "质量问题",
          applicability: "unknown",
          basisId: "cpl24",
          source: "《消保法》第二十四条：不符质量要求可主张退货/更换/修理；无法定 7/15 日倒计时",
          note: "需要故障证据；经营者可能要求检测"
        });
      }
    }

    if (!depositCase && !foodLike) {
    const pp = ticket.priceProtection || {};
    if (pp.hasMark === "yes" && pp.deadline) {
      const diff = ticket.priceCheck && ticket.priceCheck.sameModel
        ? Math.max(0, Number(ticket.amount) - Number(ticket.priceCheck.price))
        : 0;
      pushWindow(list, {
        type: "price",
        label: "价保",
        start: pp.start || parsed,
        end: pp.deadline,
        basisId: "platform",
        amount: diff,
        details: ticket.priceCheck
          ? (ticket.priceCheck.sameModel ? `同款 ¥${Number(ticket.priceCheck.price).toFixed(2)}${diff ? ` · 可退差价 ¥${diff.toFixed(2)}` : ""}` : "同款未确认，差价暂不计算")
          : "补一张当前价截图，才能算差价",
        note: pp.note || "以订单页价保标识和截止日为准"
      });
    } else if (pp.hasMark === "yes") {
      pushWindow(list, {
        type: "price",
        label: "价保",
        applicability: "unknown",
        source: `订单页写明有价保${pp.days ? `（${pp.days} 天）` : ""}；截止日需要确认`,
        note: "补上订单页截止日后，才显示倒计时"
      });
    } else if (pp.hasMark === "no") {
      pushWindow(list, {
        type: "price",
        label: "价保",
        applicability: "not_applicable",
        source: "订单页没有价保标识；价保是平台/商家承诺，不是法定权利",
        note: "不要显示倒计时"
      });
    } else {
      pushWindow(list, {
        type: "price",
        label: "价保",
        applicability: "unknown",
        source: "需要确认订单页是否有价保标识、截止日是哪天",
        note: "没有确认前不显示天数"
      });
    }

    if (catalog) {
      const part = ticket.warrantyPart || "";
      if (part === "whole" || part === "main") {
        const years = part === "main" ? catalog.mainYears : catalog.wholeYears;
        if (years === null || years === undefined) {
          pushWindow(list, {
            type: "warranty",
            label: part === "main" ? "保修·主要部件" : "保修·整机",
            applicability: "not_applicable",
            source: `${catalog.name}目录内没有主要部件期限`,
            note: "按整机期限或商家承诺"
          });
        } else {
          pushWindow(list, {
            type: "warranty",
            label: part === "main" ? "保修·主要部件" : "保修·整机",
            start: invoiceDate,
            end: addYears(invoiceDate, years),
            basisId: "sanbao8",
            details: `${catalog.name} · ${years} 年`,
            note: part === "main" ? `主要部件：${(catalog.mainParts || []).join("、")}` : ""
          });
        }
      } else {
        pushWindow(list, {
          type: "warranty",
          label: "保修",
          applicability: "unknown",
          basisId: "sanbao8",
          source: `目录内：整机 ${catalog.wholeYears} 年${catalog.mainYears ? ` / 主要部件 ${catalog.mainYears} 年` : ""}；需确认坏的是整机还是主要部件`,
          note: "补上“整机/主要部件”后再算"
        });
      }
    } else {
      if (ticket.warrantyUntil) {
        pushWindow(list, {
          type: "warranty",
          label: "保修",
          start: invoiceDate,
          end: ticket.warrantyUntil,
          source: "品牌/商家保修承诺",
          note: "无法定三包；按保修卡/品牌政策"
        });
      } else {
        pushWindow(list, {
          type: "warranty",
          label: "保修",
          applicability: "unknown",
          source: "无法定三包：该商品不在 18 类目录；按品牌/商家保修承诺",
          note: "需要保修卡或品牌政策，不显示法定倒计时"
        });
      }
    }
    }

    if (ticket.promise) {
      if (ticket.promiseDeadline) {
        pushWindow(list, {
          type: "promise",
          label: "商家承诺",
          start: parsed,
          end: ticket.promiseDeadline,
          basisId: "promise",
          note: ticket.promise
        });
      } else {
        pushWindow(list, {
          type: "promise",
          label: "商家承诺",
          applicability: "unknown",
          basisId: "promise",
          source: `商家承诺：${ticket.promise}`,
          note: "需要商家确认或约定兑现日"
        });
      }
    }

    if (ticket.category === "prepaid") {
      pushWindow(list, {
        type: "prepaid",
        label: "预付余额",
        applicability: "unknown",
        basisId: "xiaobao22",
        source: "《消保法实施条例》第二十二条：未按约定提供商品/服务，可要求履行或退还预付款",
        note: "商家停业/搬迁/服务缩水是重点事实"
      });
    }

    if (ticket.category === "renovation" || ticket.deposit) {
      pushWindow(list, {
        type: "deposit",
        label: "定金",
        applicability: "unknown",
        basisId: "deposit20",
        source: "《民法典》第五百八十六条：定金不超过主合同标的额 20%；超过部分不产生定金效力",
        note: "先分清“定金/订金”和谁违约"
      });
    }

    return list.sort((a, b) => {
      const rank = (w) => (w.applicability === "applicable" ? 0 : w.applicability === "unknown" ? 1 : 2);
      const ar = rank(a), br = rank(b);
      if (ar !== br) return ar - br;
      const av = a.daysLeft === null ? 9999 : a.daysLeft;
      const bv = b.daysLeft === null ? 9999 : b.daysLeft;
      return av - bv;
    });
  }

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
    const open = (ticket.windows || []).filter((w) => w.applicability === "applicable" && w.daysLeft !== null && w.daysLeft >= 0 && w.status !== "closed");
    const rank = { price: 0, return: 1, three_return: 2, three_exchange: 3, warranty: 4, deposit: 5, prepaid: 5, promise: 6 };
    open.sort((a, b) => (a.daysLeft - b.daysLeft) || ((rank[a.type] ?? 9) - (rank[b.type] ?? 9)));
    return open[0] || null;
  }

  function windowAction(type) {
    if (type === "price") return "price";
    if (["return", "three_return", "three_exchange", "quality"].includes(type)) return "return";
    if (type === "warranty") return "warranty";
    if (type === "promise") return "promise";
    if (type === "deposit") return "deposit";
    if (type === "prepaid") return "prepaid";
    if (type === "subscription") return "subscription";
    return "other";
  }

  function pathFor(ticket, window) {
    const channel = CHANNEL[ticket && ticket.channel] || CHANNEL.other;
    const action = windowAction(window && window.type);
    if (action === "warranty") {
      const brand = brandFor(ticket || {});
      return {
        label: brand ? `打开${brand.brand}官方售后` : "打开品牌官方售后",
        path: brand ? ["品牌官网", "服务支持", "报修/服务网点"] : ["商品/保修卡", "品牌官网或购买门店", "报修/服务网点"],
        url: brand ? brand.serviceUrl : "",
        fallback: brand ? "找不到入口时，用购买门店/品牌客服电话" : "找不到品牌入口时，联系购买门店",
        source: brand ? brand.source : "品牌售后目录（待补）",
        confidence: brand ? brand.confidence : "generic"
      };
    }
    if (action === "deposit" || action === "prepaid") {
      return {
        label: action === "deposit" ? "准备合同与付款记录" : "准备协议与余额记录",
        path: action === "deposit"
          ? ["合同/定金收据", "付款记录", "与商家书面沟通", "12315/法院"]
          : ["会员协议/课时合同", "充值记录", "余额截图", "与商家协商", "12315"],
        url: "https://www.12315.cn/",
        fallback: "先书面沟通并留痕；协商不成再走 12315。",
        source: "消费维权通用路径",
        confidence: "generic"
      };
    }
    if (action === "promise") {
      return {
        label: "发承诺确认单",
        path: ["订单详情/聊天记录", "发送承诺确认单", "约定兑现日", "到期未履行再升级"],
        url: "",
        fallback: "找不到商家入口时，用订单页的官方客服。",
        source: "承诺确认流程",
        confidence: "generic"
      };
    }
    if (action === "subscription") {
      const map = { alipay: "alipay", wechat: "wechat", apple: "apple", jd: "jd_plus", taobao: "taobao_88vip", douyin: "douyin", meituan: "meituan" };
      const item = CANCEL_GUIDE.find((x) => x.id === (map[channel.platform] || "alipay"));
      if (item) {
        return {
          label: `关闭${item.name}的自动续费`,
          path: item.steps.slice(),
          url: "",
          fallback: item.note,
          source: item.source,
          confidence: item.confidence
        };
      }
      const p = PATHS.find((x) => x.id === "alipay_autopay");
      return p || { label: "关闭自动续费", path: ["支付 App", "支付设置", "自动扣款/免扣费", "关闭服务"], url: "", fallback: "联系签约商户解约", source: "路径库", confidence: "generic" };
    }
    const wanted = `${channel.platform}_${action}`;
    const exact = PATHS.find((x) => x.id === wanted);
    if (exact) return exact;
    if (action === "return" && channel.platform === "offline") {
      return {
        label: "联系门店/商家",
        path: ["订单/小票/合同", "购买门店或商家客服", "书面说明诉求", "平台/12315"],
        url: "https://www.12315.cn/",
        fallback: "线下购买没有平台订单页；先找门店，保留小票和沟通记录。",
        source: "线下消费通用路径",
        confidence: "generic"
      };
    }
    return {
      label: "打开对应 App 的订单/服务页",
      path: ["打开对应 App", "我的/订单", "找到这笔", "申请售后/价保"],
      url: "",
      fallback: "找不到时，复制订单号，联系官方客服。",
      source: "通用路径",
      confidence: "generic"
    };
  }

  function portalFor(window, ticket) {
    const p = pathFor(ticket || {}, window || {});
    return { label: p.label, url: p.url || "", path: p.path || [], fallback: p.fallback || "", source: p.source || "", confidence: p.confidence || "" };
  }

  function scriptFor(ticket, window) {
    const merchant = ticket.merchant || "商家";
    const amount = ticket.amount ? `¥${Number(ticket.amount).toFixed(2)}` : "这笔订单";
    const when = ticket.date || "购买日期";
    const basis = (window && window.basis) || BASIS.cpl24;
    const cite = `依据${basis.law}${basis.article}：${basis.text || basis.short || ""}。`;
    const catalog = catalogFor(ticket);
    const pp = ticket.priceCheck;
    const priceLine = pp && pp.sameModel && pp.price
      ? `订单页显示有价保，截止 ${ticket.priceProtection && ticket.priceProtection.deadline || "以订单页为准"}；同款现价 ¥${Number(pp.price).toFixed(2)}，实付 ${amount}。`
      : "请先核对订单页的价保标识和截止日，并附当前同款价格截图。";
    const map = {
      return: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）申请退货。${cite}请告诉我退货入口、寄回地址和费用承担方式。`,
      three_return: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）出现性能故障，申请三包退货。${cite}请按发票价一次退清。`,
      three_exchange: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）出现性能故障，申请三包换货。${cite}请免费调换同型号同规格。`,
      quality: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）不符合质量要求，申请退货/更换/修理。${cite}请给出处理方案和检测方式。`,
      price: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）申请价保。${priceLine}${cite}请核对差价和到账时间。`,
      warranty: `你好，我在${merchant}购买的${ticket.product || "商品"}（${amount}，${when}）还在保修期内，现在出现故障。${cite}${catalog ? `该商品在 ${catalog.name} 三包目录内。` : "该商品不在 18 类三包目录，按品牌/商家保修承诺处理。"}请确认保修范围、最近网点和所需材料。`,
      promise: `你好，购买时你方承诺：${ticket.promise}。${cite}请确认这条承诺是否仍然有效，以及兑现需要什么条件。`,
      deposit: `你好，我在${merchant}支付的${ticket.product || "装修定金"}（${amount}，${when}）想确认退还或转尾款的条件。${cite}请提供合同里的定金条款。`,
      prepaid: `你好，我在${merchant}办理的${ticket.product || "预付卡"}（${amount}，${when}）还有余额未消费。${cite}请说明剩余金额的退还方式和时限。`
    };
    const text = map[window.type] || `你好，我想咨询${merchant}这笔订单（${amount}）的售后处理方式。`;
    const helper = ticket.helper && ticket.helper.forWhom ? `我帮${ticket.helper.forWhom}问的，` : "";
    return helper ? text.replace("你好，", `你好，${helper}`) : text;
  }

  function checklistFor(window, ticket) {
    const cat = ticket && EVIDENCE.categories && EVIDENCE.categories[ticket.category];
    if (window.type === "price") {
      return ["订单页截图（含价保标识/截止日）", "当前商品页（含价格/规格/时间）", "同款链接/商品编号"];
    }
    if (window.type === "warranty") {
      return ["发票/保修卡", "故障视频", "铭牌/序列号"];
    }
    if (["return", "three_return", "three_exchange", "quality"].includes(window.type)) {
      return (cat ? cat.must.concat(cat.helpful || []) : ["订单/发票", "商品现状照片", "包装/吊牌/赠品"]).slice(0, 6);
    }
    if (window.type === "deposit") return ["合同/定金收据", "付款记录", "沟通记录"];
    if (window.type === "prepaid") return ["会员协议/课时合同", "充值记录", "当前余额截图", "门店通知或聊天记录"];
    if (window.type === "promise") return ["承诺截图或录音", "订单截图", "与商家的沟通记录"];
    return ["订单截图", "相关证据"];
  }

  const OBJECTIONS = {
    return: [
      ["已经拆封了，不能退", "拆封查验不等于商品不完好；法定例外是定制、鲜活易腐、拆封音像/软件、报刊等。"],
      ["超过 7 天了", "质量问题走《消保法》第二十四条，不受 7 天无理由限制；目录内商品还有三包。"],
      ["特价商品不退不换", "《部分商品修理更换退货责任规定》第三条：合同不得免除三包责任。"]
    ],
    three_return: [
      ["超过 7 天了", "三包 7 日从售出/发票日算；如已超，仍可看 15 日换货或三包有效期内的修理/换货。"],
      ["这是人为损坏", "《消保法》第二十三条第三款：6 个月内耐用商品瑕疵，由经营者举证。"]
    ],
    three_exchange: [
      ["超过 15 天了", "三包有效期内修理两次仍不能正常使用，凭修理记录仍可要求免费换货（第十一条）。"],
      ["这是人为损坏", "《消保法》第二十三条第三款：6 个月内耐用商品瑕疵，由经营者举证。"]
    ],
    warranty: [
      ["配件没到，先等着", "三包第十二条：无配件待修超过 90 日，应当免费换货。"],
      ["修两次就好了", "三包第十一条：修理两次仍不能正常使用，应免费换货或退货。"],
      ["不在保修范围", "请出具书面检测结论和依据；目录外商品按品牌承诺/消保法第二十四条继续核对。"]
    ],
    price: [
      ["活动价不参与价保", "请出示该商品页的价保条款；没有写明排除的，按页面承诺执行。"],
      ["已经过价保期", "请给出价保起算日和截止日；不同平台从支付或签收起算，以订单页为准。"],
      ["没有价保标识", "价保是页面承诺；没有标识不能主张价保，但可看商家是否有其他承诺。"]
    ],
    deposit: [
      ["定金一律不退", "《民法典》第五百八十七条：收受定金一方违约，应双倍返还。"],
      ["这是订金不是定金", "订金不适用定金罚则，但合同目的不能实现时仍应返还。"],
      ["超过 20% 的部分也不退", "《民法典》第五百八十六条：超过主合同标的额 20% 的部分不产生定金效力，应按预付款返还。"]
    ],
    prepaid: [
      ["卡一经售出不退", "《消保法实施条例》第二十二条：未按约定提供商品或服务，应按消费者要求履行或退还预付款。"],
      ["换老板了找新老板", "经营者变更不影响原合同义务，可要求现经营者继续履行或退款。"]
    ],
    promise: [
      ["口头承诺不算数", "《消保法实施条例》第十二条：经营者应按承诺履行；聊天记录、录音可以作为证据。"]
    ]
  };

  function objectionsFor(win) {
    return (win && OBJECTIONS[win.type]) || OBJECTIONS.return;
  }

  function taxHints(ticket) {
    const out = [];
    const cat = ticket && ticket.category;
    if (["appliance", "digital", "auto"].indexOf(cat) >= 0) {
      const d = cat === "digital"
        ? "手机、平板、智能手表手环按售价 15% 补贴，单件最高 500 元（单价需在限额内）。"
        : cat === "auto"
          ? "汽车以旧换新按各地细则执行，报废或置换各有对应补贴。"
          : "家电按售价 15% 补贴，1 级能效 20%，单件最高 2000 元。";
      out.push({ t: "购新补贴", d, n: "发票、旧机回收单、本人银行卡" });
    }
    if (cat === "auto") {
      out.push({ t: "车辆购置税", d: "按不含税价 10% 计征；新能源车按当年目录免征或减半。", n: "机动车销售统一发票、合格证" });
    }
    if (cat === "renovation" || cat === "furniture") {
      out.push({ t: "凭证留存", d: "家装、家具发票是保修、返工、纠纷举证的核心凭证，建议长期保存电子版。", n: "发票原件或 PDF" });
    }
    out.push({ t: "发票查验", d: "在国家税务总局全国增值税发票查验平台核验真伪，报销、投诉、维权都要用。", n: "发票代码、号码、开票日期、金额" });
    out.push({ t: "年度汇算", d: "每年 3–6 月办理综合所得汇算，专项附加扣除要用到合同、发票、还款凭证。", n: "相关凭证原件" });
    return out;
  }

  const CLAIM_TEXT = {
    return: (t) => `要求退货退款 ${t.amount}，退回运费由经营者承担。`,
    three_return: (t) => `要求按发票价一次退清 ${t.amount}。`,
    three_exchange: () => "要求免费更换同型号同规格商品。",
    quality: () => "要求按《消保法》第二十四条退货、更换或修理。",
    warranty: () => "要求免费修理；如修理两次仍不能正常使用，要求免费换货。",
    price: () => "要求退还差价，金额以平台核验为准。",
    deposit: (t) => `要求退还定金 ${t.amount}；经营者违约的，要求双倍返还。`,
    prepaid: (t) => `要求退还剩余预付款 ${t.amount}。`,
    promise: () => "要求按购买时的承诺履行。"
  };

  function complaintFor(ticket, win, variant) {
    const amount = Number(ticket.amount) || 0;
    const f = {
      merchant: ticket.merchant || "（商家名称待确认）",
      product: ticket.product || "（商品或服务名称待确认）",
      date: ticket.date || "（购买日期待确认）",
      orderNo: ticket.orderNo || "（订单号待确认）",
      amount: amount ? `¥${amount.toFixed(2)}` : "（金额待确认）"
    };
    const basis = (win && win.basis) || { law: "《消费者权益保护法》", article: "第二十四条", text: "商品不符合质量要求的，可以要求退货、更换、修理。" };
    const claim = (CLAIM_TEXT[win && win.type] || CLAIM_TEXT.return)(f);
    const ev = (ticket.evidence || []).map((e, i) => `${i + 1}. ${e.label || e.type || "证据"}`).join("\n") || "1. （待补充）";
    const checks = [
      { label: "有明确事实（商家 / 日期 / 金额）", ok: !!(ticket.merchant && ticket.date && amount) },
      { label: "有法律依据（条款号）", ok: !!(win && win.basis) },
      { label: "有明确诉求", ok: !!claim },
      { label: "有证据清单", ok: (ticket.evidence || []).length > 0 }
    ];
    if (variant === "platform") {
      return { checks, title: `${f.merchant} · 申请平台介入`, body: `订单号：${f.orderNo}
商家：${f.merchant}
商品：${f.product}
金额：${f.amount}
购买日期：${f.date}

你好，我在 ${f.date} 购买了 ${f.product}，支付 ${f.amount}。${claim}

依据${basis.law}${basis.article}：${basis.text}

我已与商家沟通，未能解决。请平台介入处理。

证据：
${ev}` };
    }
    if (variant === "12345") {
      return { checks, title: "12345 政务服务便民热线 · 消费维权转办", body: `【诉求类型】消费维权转办
【被投诉方】${f.merchant}
【商品/服务】${f.product}
【消费金额】${f.amount}
【消费日期】${f.date}
【订单号】${f.orderNo}

【事实与理由】
${f.date}，我在 ${f.merchant} 购买 ${f.product}，支付 ${f.amount}。${claim}

依据${basis.law}${basis.article}：${basis.text}

我已与商家沟通，未能解决。请转市场监管部门（12315）处理，并告知受理编号与办理时限。

【证据】
${ev}` };
    }
    if (variant === "lawsuit") {
      return { checks, title: "起诉前的准备清单（不是起诉状）", body: `【说明】下面是去法院立案前要准备好的材料清单与要点，不是法律意见；是否起诉、怎么写诉状，请咨询律师或立案庭。

【一、当事人】
原告：请填写姓名、身份证号、住址、联系电话
被告：${f.merchant}（需要它的完整工商登记名称与统一社会信用代码，可在国家企业信用信息公示系统查询）

【二、诉讼请求（写清金额）】
${claim}
标的金额：${f.amount}

【三、事实与理由要点】
1. ${f.date} 在 ${f.merchant} 购买 ${f.product}，支付 ${f.amount}，订单号 ${f.orderNo}。
2. 与经营者协商未果（写清时间、方式、对方答复）。
3. 法律依据：${basis.law}${basis.article}——${basis.text}

【四、证据目录】
${ev}
另需：付款凭证、发票/订单详情、聊天或通话记录、商品问题照片/检测结论。

【五、管辖与时效】
- 管辖：一般向被告住所地或合同履行地基层法院起诉，具体以立案庭告知为准。
- 时效：普通诉讼时效为三年（《民法典》第一百八十八条），从知道或应当知道权利受损起算；临近时效请先书面催告并留痕。

【六、提交前自检】
□ 被告名称与统一社会信用代码已核对
□ 诉讼请求金额与证据能对上
□ 证据按时间编号，原件留存
□ 已确认管辖法院与立案方式（现场/网上）` };
    }
    if (variant === "heimao") {
      return { checks, title: `${f.merchant} 拒绝处理 ${f.product}（${f.amount}）`, body: `【投诉对象】${f.merchant}
【涉及金额】${f.amount}
【购买时间】${f.date}
【订单号】${f.orderNo}

【事情经过】
${f.date}，我在 ${f.merchant} 购买 ${f.product}，支付 ${f.amount}。
之后商品出现问题，我联系商家要求处理，商家未按法律规定解决。

【我的诉求】
${claim}

【依据】
${basis.law}${basis.article}：${basis.text}

【证据】
${ev}` };
    }
    return { checks, title: "12315 投诉材料", body: `【投诉人】请填写姓名与联系电话
【被投诉方】${f.merchant}
【商品/服务】${f.product}
【消费金额】${f.amount}
【消费日期】${f.date}
【订单号】${f.orderNo}

【事实与理由】
本人于 ${f.date} 在 ${f.merchant} 购买 ${f.product}，支付 ${f.amount}。因商品或服务不符合约定/法定要求，与经营者协商未果。

【法律依据】
${basis.law}${basis.article}：${basis.text}

【投诉请求】
${claim}

【证据材料】
${ev}` };
  }

  function detectSubscriptions(tickets) {
    const byMerchant = new Map();
    for (const t of (tickets || [])) {
      const key = String(t.merchant || "").trim();
      if (!key || !t.date) continue;
      if (["grocery", "food", "beauty", "baby"].includes(t.category)) continue;
      if (!byMerchant.has(key)) byMerchant.set(key, []);
      byMerchant.get(key).push({ d: new Date(t.date), amt: Number(t.amount) || 0, channel: t.channel || "other" });
    }
    const out = [];
    const ranges = { week: [6, 8], month: [25, 35], quarter: [85, 95], year: [360, 370] };
    const perYear = { week: 52, month: 12, quarter: 4, year: 1 };
    for (const [merchant, rows] of byMerchant) {
      rows.sort((a, b) => a.d - b.d);
      if (rows.length < 2) continue;
      const runs = [];
      let run = null;
      for (let i = 1; i < rows.length; i++) {
        const days = Math.round((rows[i].d - rows[i - 1].d) / 86400000);
        const cycle = Object.keys(ranges).find((k) => days >= ranges[k][0] && days <= ranges[k][1]);
        if (cycle && run && run.cycle === cycle) {
          run.count += 1;
          run.amounts.push(rows[i].amt);
          run.last = rows[i].d;
          run.lastGap = days;
          run.channel = rows[i].channel;
        } else if (cycle) {
          run = { cycle, count: 2, amounts: [rows[i - 1].amt, rows[i].amt], last: rows[i].d, lastGap: days, channel: rows[i].channel };
          runs.push(run);
        } else {
          run = null;
        }
      }
      if (!runs.length) continue;
      runs.sort((a, b) => b.count - a.count || b.last - a.last);
      const best = runs[0];
      if (best.count < 2 || (best.cycle === "week" && best.count < 3)) continue;
      const avg = best.amounts.reduce((s, x) => s + x, 0) / best.amounts.length;
      if (!avg) continue;
      const drift = Math.max.apply(null, best.amounts.map((a) => Math.abs(a - avg) / avg));
      if (drift > 0.05) continue;
      out.push({ merchant, count: best.count, avg, lastGap: best.lastGap, lastDate: best.last, yearly: avg * perYear[best.cycle], channel: best.channel, cycle: best.cycle });
    }
    return out.sort((a, b) => b.yearly - a.yearly);
  }

  function parseMerchantReply(text, baseDate = new Date()) {
    const raw = String(text || "");
    if (!raw.trim()) return null;
    const out = {
      intent: "unknown",
      amount: null,
      deadline: null,
      condition: null,
      responsibleParty: "unclear",
      nextAction: "让商家明确金额、时间和条件",
      confidence: "low",
      sourceQuote: raw.slice(0, 160)
    };
    const amountMatch = raw.match(/(?:退|赔|补|退差|退款)[^\d¥￥]{0,8}[¥￥]?\s*(\d+(?:\.\d{1,2})?)/) || raw.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/);
    if (amountMatch) out.amount = Number(amountMatch[1]);
    const dayMatch = raw.match(/(\d+)\s*个?工作日内?[^。；;]*?(?:到账|回复|处理|结果)?/);
    const calendarMatch = raw.match(/(\d+)\s*天内?[^。；;]*?(?:到账|回复|处理|结果)?/);
    if (dayMatch) out.deadline = fmt(addBusinessDays(baseDate, Number(dayMatch[1])));
    else if (calendarMatch) out.deadline = fmt(addDays(baseDate, Number(calendarMatch[1])));
    if (/寄回|退回|寄到|检测/.test(raw)) {
      out.intent = "request_evidence";
      out.nextAction = "确认寄回地址、运费承担方、检测时限";
    } else if (/人为损坏|不在保修|不属于保修/.test(raw)) {
      out.intent = "reject";
      out.responsibleParty = "user";
      out.nextAction = "要求出具书面检测结论和依据，准备升级渠道";
    } else if (/等通知|稍后回复|正在处理|加急/.test(raw)) {
      out.intent = "delay";
      out.nextAction = "约定具体回复时间，超时升级";
    } else if (/只能退|最多退|部分退/.test(raw)) {
      out.intent = "partial";
      out.nextAction = "确认是否接受；不接受则给升级路径";
    } else if (/同意|可以退|退差|退款|退\s*[¥￥]?\s*\d/.test(raw)) {
      out.intent = "agree_refund";
      out.nextAction = out.deadline ? "设到账提醒，到账后回填" : "确认到账时间";
    }
    if (out.amount !== null || out.deadline || out.intent !== "unknown") out.confidence = "medium";
    if (out.amount !== null && out.deadline) out.confidence = "high";
    return out;
  }

  // 保单 / 合同：只提取机构、金额、期限。证件号、手机号与原文一律不返回。
  function parsePolicyDoc(text, fileName = "") {
    const raw = String(text || "").replace(/\r/g, "");
    const compact = raw.replace(/[ \t]+/g, " ").trim();
    if (compact.length < 4) return null;

    const kind = /保险|保单|投保|保费|犹豫期|承保|退保/.test(compact)
      ? "insurance"
      : (/合同|协议|课程|健身|会籍|预付费|服务期|培训/.test(compact) ? "prepaid" : "unknown");

    const cleanName = (value) => String(value || "")
      .replace(/^[（(]?\d+[)）]?\s*/, "")
      .replace(/^(?:保险人|投保人|被保险人|甲方|乙方|机构|公司|名称)[:：\s]*/, "")
      .replace(/[，,。；;:：\s]+$/, "")
      .trim()
      .slice(0, 24);

    let merchant = "";
    const namePatterns = [
      /([一-龥（）()]{2,24}(?:保险|人寿|财险)(?:股份)?(?:有限)?(?:责任)?公司)/,
      /([一-龥（）()]{2,24}(?:健身|教育|培训|美容|俱乐部|会所|学院|中心|有限公司|公司))/,
    ];
    for (const pattern of namePatterns) {
      const hit = compact.match(pattern);
      if (hit && hit[1]) { merchant = cleanName(hit[1]); break; }
    }
    if (!merchant) {
      const line = compact.split("\n").map((item) => item.trim())
        .find((item) => item.length >= 2 && item.length <= 24 && !/\d{6,}/.test(item) && /[一-龥]/.test(item) && !/保险单号|保单号|合同编号/.test(item));
      if (line) merchant = cleanName(line);
    }

    const toNumber = (value) => {
      const n = Number(String(value).replace(/[,，\s]/g, ""));
      if (!Number.isFinite(n) || n <= 0 || n >= 1e8) return null;
      if (/^(?:19|20)\d{2}$/.test(String(value).replace(/\D/g, ""))) return null;
      return n;
    };
    let amount = null;
    const amountPatterns = [
      /(?:保险费|保费|合同金额|合同总价|合同价款|总金额|合计金额|应付金额|费用总额|总价款|课程总价|服务总价|金额)[^0-9¥￥\n]{0,6}[¥￥]?\s*(\d[\d,]*(?:\.\d{1,2})?)/,
      /[¥￥]\s*(\d[\d,]*(?:\.\d{1,2})?)/,
      /(\d[\d,]*(?:\.\d{2}))\s*元/
    ];
    for (const pattern of amountPatterns) {
      const hit = compact.match(pattern);
      if (!hit) continue;
      const n = toNumber(hit[1]);
      if (n !== null) { amount = n; break; }
    }

    let coolingDays = null;
    const cooling = compact.match(/(?:犹豫期|冷静期|退费期|退款期|无理由退货期|无理由退换期)[^0-9]{0,8}(\d{1,3})\s*(?:个)?(?:自然)?\s*(天|日)/);
    if (cooling) {
      const n = Number(cooling[1]);
      if (n > 0 && n <= 365) coolingDays = n;
    }

    let term = "";
    const termHit = compact.match(/(?:保障期|保险期间|合同期限|有效期|服务期|使用期|会籍期)[^0-9]{0,8}(\d{1,3})\s*((?:个)?(?:年|月|天|日))/);
    if (termHit) term = `${termHit[1]} ${termHit[2]}`;

    const dateMatch = compact.match(/(?:签收|签单|投保|签署|签订|合同|生效|起算)日期[:：\s]*(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/)
      || compact.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
    let signedDate = "";
    if (dateMatch) {
      const y = Number(dateMatch[1]);
      const m = Number(dateMatch[2]);
      const d = Number(dateMatch[3]);
      if (y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        signedDate = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      }
    }

    const policyType = /重疾|重大疾病|长期健康|医疗险/.test(compact)
      ? "长期健康险"
      : (/银保/.test(compact) ? "银保一年期以上" : (/财产|车险|家财/.test(compact) ? "财产险" : (/一年期|短期/.test(compact) ? "一年期健康险" : "其他")));

    const piiSeen = /\d{17}[\dXx]/.test(compact) || /\b1[3-9]\d{9}\b/.test(compact);
    return {
      kind,
      merchant,
      amount,
      coolingDays,
      term,
      signedDate,
      policyType,
      piiSeen,
      confidence: (merchant && amount) ? "high" : (merchant || amount ? "medium" : "low"),
      note: "只保留机构、金额与期限；证件号、手机号与原文不保存",
      fileName: String(fileName || "").slice(0, 60)
    };
  }

  window.PG = {
    CATEGORY, CHANNEL, BASIS, RULES_META, EFFECTIVE,
    REAL, CANCEL_GUIDE, CANCEL_NOTE,
    categoryOf, channelOf, buildWindows, depositCalc,
    objectionsFor, taxHints, complaintFor, detectSubscriptions,
    priority, scriptFor, checklistFor, portalFor, pathFor,
    daysLeft, fmt, addDays, addBusinessDays, addMonths, addYears, startOfDay,
    catalogFor, brandFor, parseMerchantReply, parsePolicyDoc
  };
})();
