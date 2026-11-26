"use strict";

/**
 * 票根 · 权利计算核心（纯函数，零依赖）
 *
 * 从 v0/rules.js 抽出「按购买日期算权利窗口」这一段，做成可在 CloudBase / Node / 浏览器
 * 三处共用的纯函数。目的：让公网 MCP 的 rights.lookup 真正接收参数、当场计算，
 * 而不是返回写死的示例数据。
 *
 * 不读文件、不读环境变量、不联网。所有法条与目录数据来自 rights-data.json（构建时生成）。
 */

const DATA = require("./rights-data.json");

const DAY = 86400000;

/* —— 日期工具 —— */
function startOfDay(value) {
  const d = value instanceof Date ? new Date(value) : new Date(String(value).replace(/\./g, "-"));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(value, days) {
  const d = startOfDay(value);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d;
}
function addYears(value, years) {
  const d = startOfDay(value);
  if (!d) return null;
  d.setFullYear(d.getFullYear() + years);
  return d;
}
function fmt(d) {
  if (!d) return "";
  const x = d instanceof Date ? d : startOfDay(d);
  if (!x) return "";
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}
function daysLeft(end, today) {
  const e = startOfDay(end);
  const t = today ? startOfDay(today) : startOfDay(new Date());
  if (!e || !t) return null;
  return Math.round((e - t) / DAY);
}

/* —— 分类 —— */
const CATEGORY = {
  appliance: { label: "家电", keywords: ["家电", "空调", "冰箱", "洗衣机", "电视", "空气炸锅", "烤箱", "微波炉", "热水器", "吸尘器", "油烟机", "电风扇", "净水器", "扫地机器人"] },
  furniture: { label: "家具", keywords: ["家具", "餐桌", "沙发", "床", "衣柜", "书桌", "椅子", "茶几", "床垫", "橱柜"] },
  renovation: { label: "装修定金", keywords: ["装修", "定金", "订金", "合同", "瓷砖", "全屋定制", "施工", "尾款"] },
  digital: { label: "数码", keywords: ["手机", "电脑", "平板", "相机", "耳机", "数码", "笔记本", "摄像机", "显示器", "屏幕", "手表"] },
  apparel: { label: "服饰鞋包", keywords: ["衣服", "外套", "羽绒", "鞋", "靴", "包", "裤", "裙", "内衣", "箱", "袜"] },
  food: { label: "食品生鲜", keywords: ["食品", "生鲜", "水果", "牛奶", "零食", "大米", "肉", "菜", "麦片", "拉面", "面", "饭", "外卖", "餐", "汉堡", "奶茶", "咖啡"] },
  beauty: { label: "美妆个护", keywords: ["护肤", "面霜", "精华", "口红", "洗发", "沐浴", "化妆品"] },
  baby: { label: "母婴", keywords: ["奶粉", "纸尿裤", "婴儿", "童装", "玩具", "推车"] },
  auto: { label: "汽车", keywords: ["汽车", "车辆", "轮胎", "保养", "4S", "车主", "摩托车"] },
  prepaid: { label: "预付卡", keywords: ["预付", "储值", "会员卡", "课时", "健身卡", "美容卡", "年卡", "充值"] },
  grocery: { label: "商超", keywords: ["超市", "便利店", "商超", "购物广场", "百货"] },
  other: { label: "其他", keywords: [] }
};

const ONLINE_CHANNELS = {
  taobao: "淘宝", tmall: "天猫", jd: "京东", alipay: "支付宝", pdd: "拼多多",
  douyin: "抖音电商", kuaishou: "快手电商", xhs: "小红书", vip: "唯品会",
  suning: "苏宁", meituan: "美团", eleme: "饿了么", wechat: "微信支付"
};

function categoryOf(text) {
  const value = String(text || "");
  let best = "other";
  let bestScore = 0;
  for (const [key, meta] of Object.entries(CATEGORY)) {
    if (key === "other") continue;
    const hits = meta.keywords.filter((kw) => value.includes(kw)).length;
    if (hits > bestScore) { bestScore = hits; best = key; }
  }
  return best;
}

function channelOf(text) {
  const value = String(text || "");
  if (/线下|门店|实体店|柜台/.test(value)) return "offline";
  for (const [key, label] of Object.entries(ONLINE_CHANNELS)) {
    if (value.includes(label)) return key;
  }
  return "other";
}

/* —— 三包目录 —— */
/* 目录名是官方口径（「家用空调器」），用户说的是俗称（「空调」）。
   这里把俗称映射到目录名，避免因为叫法不同就漏掉法定三包。 */
const CATALOG_ALIASES = [
  ["家用空调器", ["空调", "挂机", "柜机", "中央空调"]],
  ["彩色电视机", ["电视", "电视机", "彩电"]],
  ["黑白电视机", ["黑白电视"]],
  ["家用电冰箱", ["冰箱", "冰柜"]],
  ["洗衣机", ["洗衣机", "滚筒", "波轮"]],
  ["微波炉", ["微波炉", "光波炉"]],
  ["吸尘器", ["吸尘器", "扫地机器人", "洗地机"]],
  ["电风扇", ["电扇", "风扇", "落地扇"]],
  ["吸排油烟机", ["油烟机", "抽油烟机"]],
  ["燃气热水器", ["热水器", "燃气热水器", "电热水器"]],
  ["摄像机", ["摄像机", "录像机", "DV"]],
  ["收录机", ["收录机", "录音机"]],
  ["电子琴", ["电子琴", "电钢琴"]],
  ["自行车", ["自行车", "山地车", "折叠车"]],
  ["缝纫机", ["缝纫机"]],
  ["钟表", ["手表", "钟表", "机械表"]],
  ["摩托车", ["摩托车", "电动车"]]
];

function catalogFor(text) {
  const value = String(text || "");
  const items = (DATA.sanbao && DATA.sanbao.items) || [];
  let best = null;
  let bestScore = 0;

  // 1) 先按官方目录名精确包含
  for (const item of items) {
    const name = item.name;
    if (!name) continue;
    if (value.includes(name) && name.length > bestScore) {
      bestScore = name.length;
      best = item;
    }
  }
  if (best) return best;

  // 2) 再按俗称别名匹配
  for (const [catalogName, aliases] of CATALOG_ALIASES) {
    const item = items.find((row) => row.name === catalogName);
    if (!item) continue;
    for (const alias of aliases) {
      if (value.includes(alias) && alias.length > bestScore) {
        bestScore = alias.length;
        best = item;
      }
    }
  }
  return bestScore >= 2 ? best : null;
}

/* —— 权利窗口计算 —— */
function buildWindows(input, today) {
  const ticket = input || {};
  const baseDate = ticket.date || ticket.invoiceDate || ticket.receivedDate;
  const parsed = baseDate ? startOfDay(baseDate) : null;
  if (!parsed) {
    return [{
      type: "unknown",
      label: "截止日",
      end: null,
      daysLeft: null,
      applicability: "unknown",
      source: "缺购买日期，先补日期再算",
      note: ""
    }];
  }

  const invoiceDate = ticket.invoiceDate ? startOfDay(ticket.invoiceDate) : parsed;
  const receivedDate = ticket.receivedDate ? startOfDay(ticket.receivedDate) : null;
  const categoryKey = ticket.category || categoryOf(`${ticket.product || ""} ${ticket.merchant || ""}`);
  const catLabel = (CATEGORY[categoryKey] || CATEGORY.other).label;
  const channelKey = ticket.channel || channelOf(`${ticket.merchant || ""} ${ticket.raw || ""}`);
  const online = channelKey !== "offline";
  const catalog = catalogFor(`${ticket.product || ""} ${ticket.raw || ""}`);

  const depositCase = categoryKey === "renovation" || categoryKey === "prepaid" || ticket.deposit === true;
  const groceryFood = categoryKey === "grocery" &&
    /食品|生鲜|水果|蔬菜|牛奶|酸奶|面包|饼干|零食|大米|面粉|食用油|猪肉|牛肉|鸡蛋|方便面|拉面|火腿|月饼|麦片|燕麦/.test(
      `${ticket.product || ""} ${ticket.raw || ""}`
    );
  const foodLike = catLabel === "食品生鲜" || channelKey === "eleme" || categoryKey === "food" || groceryFood;

  const list = [];
  const push = (win) => {
    const end = win.end || null;
    list.push({
      type: win.type,
      label: win.label,
      start: win.start ? fmt(win.start) : "",
      end: end ? fmt(end) : null,
      daysLeft: end ? daysLeft(end, today) : null,
      applicability: win.applicability || "applicable",
      basis: win.basis || "",
      basisUrl: win.basisUrl || "",
      source: win.source || "",
      note: win.note || "",
      amount: typeof win.amount === "number" ? win.amount : undefined
    });
  };

  if (!depositCase) {
    if (online) {
      if (foodLike) {
        push({
          type: "return", label: "无理由退货", applicability: "not_applicable",
          source: "食品/外卖通常不适用 7 天无理由；质量问题按《消保法》第二十四条主张",
          note: "质量问题仍可主张"
        });
        push({
          type: "quality", label: "食品质量问题", applicability: "unknown",
          basis: "《消保法》第二十四条",
          basisUrl: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm",
          source: "异物、变质、撒漏等按《消保法》第二十四条主张",
          note: "留好照片/视频、外包装和批次信息"
        });
      } else if (receivedDate) {
        push({
          type: "return", label: "无理由退货", start: receivedDate, end: addDays(receivedDate, 7),
          basis: "《消保法》第二十五条",
          basisUrl: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm",
          note: "从签收日起算；商品需完好、不影响二次销售"
        });
      } else {
        push({
          type: "return", label: "无理由退货", applicability: "unknown",
          source: "需要签收日；线上 7 天无理由从收到商品之日起算",
          note: "补上签收日后再算，不从下单日猜"
        });
      }

      if (catalog) {
        push({
          type: "three_return", label: "三包退货", start: invoiceDate, end: addDays(invoiceDate, 7),
          basis: "《部分商品修理更换退货责任规定》第九条",
          basisUrl: DATA.sanbao.sourceUrl,
          note: `目录内商品（${catalog.name}），性能故障；从发票日起算`
        });
        push({
          type: "three_exchange", label: "三包换货", start: invoiceDate, end: addDays(invoiceDate, 15),
          basis: "《部分商品修理更换退货责任规定》第十条",
          basisUrl: DATA.sanbao.sourceUrl,
          note: `目录内商品（${catalog.name}），性能故障；从发票日起算`
        });
      } else if (ticket.issue === "quality") {
        push({
          type: "quality", label: "质量问题", applicability: "unknown",
          basis: "《消保法》第二十四条",
          basisUrl: "https://www.gov.cn/jrzg/2013-10/25/content_2515601.htm",
          source: "不符质量要求可主张退货/更换/修理；无法定 7/15 日倒计时",
          note: "需要故障证据；经营者可能要求检测"
        });
      }
    }

    // 价保：只有明确给了截止日才算
    const pp = ticket.priceProtection || {};
    if (pp.hasMark === "yes" && pp.deadline) {
      const diff = ticket.currentPrice && ticket.amount
        ? Math.max(0, Number(ticket.amount) - Number(ticket.currentPrice))
        : 0;
      push({
        type: "price", label: "价保", start: pp.start ? startOfDay(pp.start) : parsed, end: pp.deadline,
        basis: "平台/商家价保承诺", source: "价保是平台或商家的服务承诺，不是法定权利",
        amount: diff,
        note: diff ? `同款现价 ¥${Number(ticket.currentPrice).toFixed(2)}，可退差价 ¥${diff.toFixed(2)}` : "补一张当前价截图，才能算差价"
      });
    } else if (pp.hasMark === "yes") {
      push({
        type: "price", label: "价保", applicability: "unknown",
        source: `订单页写明有价保${pp.days ? `（${pp.days} 天）` : ""}；截止日需要确认`,
        note: "补上订单页截止日后，才显示倒计时"
      });
    } else if (pp.hasMark === "no") {
      push({
        type: "price", label: "价保", applicability: "not_applicable",
        source: "订单页没有价保标识；价保是平台/商家承诺，不是法定权利",
        note: "不显示倒计时"
      });
    } else {
      push({
        type: "price", label: "价保", applicability: "unknown",
        source: "需要确认订单页是否有价保标识、截止日是哪天",
        note: "没有确认前不显示天数"
      });
    }

    // 保修
    if (catalog) {
      const years = catalog.wholeYears;
      if (typeof years === "number" && years > 0) {
        push({
          type: "warranty", label: "保修·整机", start: invoiceDate, end: addYears(invoiceDate, years),
          basis: "《部分商品修理更换退货责任规定》第八条",
          basisUrl: DATA.sanbao.sourceUrl,
          note: `${catalog.name} · 整机 ${years} 年${catalog.mainYears ? ` / 主要部件 ${catalog.mainYears} 年` : ""}`
        });
      }
      if (typeof catalog.mainYears === "number" && catalog.mainYears > 0) {
        push({
          type: "warranty_main", label: "保修·主要部件", start: invoiceDate, end: addYears(invoiceDate, catalog.mainYears),
          basis: "《部分商品修理更换退货责任规定》第八条",
          basisUrl: DATA.sanbao.sourceUrl,
          note: `主要部件：${(catalog.mainParts || []).join("、")}`
        });
      }
    }
  }

  return list;
}

/* —— 最近关闭的一项 —— */
function nearestWindow(windows) {
  const open = (windows || [])
    .filter((w) => typeof w.daysLeft === "number" && w.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return open[0] || null;
}

/* —— 证据缺口 —— */
function evidenceGaps(windows, input) {
  const gaps = [];
  const t = input || {};
  for (const w of windows || []) {
    if (w.applicability === "unknown") {
      if (w.type === "return" && !t.receivedDate) gaps.push("签收日（快递单或物流截图）");
      if (w.type === "price" && !t.priceProtection) gaps.push("订单页价保标识与截止日");
      if (w.type === "warranty" && !t.warrantyPart) gaps.push("故障部位（整机还是主要部件）");
    }
    if (w.type === "price" && w.applicability === "applicable" && !t.currentPrice) {
      gaps.push("当前价截图（算差价用）");
    }
  }
  return [...new Set(gaps)];
}

module.exports = {
  buildWindows, nearestWindow, evidenceGaps,
  categoryOf, channelOf, catalogFor,
  daysLeft, fmt, addDays, addYears, startOfDay,
  DATA
};
