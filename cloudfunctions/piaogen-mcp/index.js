"use strict";

/**
 * 票根 · 公网只读 MCP 端点（CloudBase HTTP 函数）
 *
 * 只实现 MCP 的 initialize / tools/list / tools/call 三个方法。
 * 七个工具与本地 mcp/server.js 同名同参；所有写操作（*_record）在这里一律拒绝。
 * 不读文件、不读环境变量、不访问数据库、不发外部请求。
 */

const VERSION = "0.5.0";
const engine = require("./rights-engine");
const OPENAPI = require("./openapi.json");
const MAX_BODY = 64 * 1024;
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;
const ALLOWED_ORIGINS = [
  "https://enmingxiong821-cloud.github.io",
  "https://xiongxiongkaifa-d4flmaia4021b1d1-1506832756.tcloudbaseapp.com",
  "http://127.0.0.1:8765",
  "http://localhost:8765"
];
const hits = new Map();
const SAMPLE_RIGHTS = {
  caseId: "PG-20261113-0001",
  sample: true,
  merchant: "某家电卖场",
  product: "1.5 匹空调",
  amount: 3299,
  paidAt: "2026-11-13",
  channel: "支付宝",
  windows: [
    { type: "退货", label: "线上 7 天无理由", closesAt: "2026-11-20", daysLeft: 0, basis: "消费者权益保护法第 25 条" },
    { type: "价保", label: "价保（以订单页标识为准）", closesAt: null, daysLeft: null, basis: "平台价保规则" },
    { type: "保修", label: "整机保修", closesAt: "2029-11-13", daysLeft: 1090, basis: "三包规定与品牌保修卡" }
  ],
  missing: ["订单页价保标识", "当前价截图"],
  note: "示例案卷，不是真实用户数据；金额与天数以票据和合同为准。"
};

const SAMPLE_FINANCE = {
  caseId: "PG-FIN-20261115-0001",
  sample: true,
  type: "自动续费",
  merchant: "某视频会员",
  amount: 25,
  lastChargedAt: "2026-11-15",
  nextChargeAt: "2026-12-15",
  reminders: { time: false, amount: true, cancelPath: true },
  note: "示例案卷；是否构成违规以平台记录和《互联网平台价格行为规则》为准。"
};

const TOOLS = [
  {
    name: "rights.lookup",
    description: "按购买日期当场算一笔消费的权利窗口：无理由退货、三包退货/换货、价保、保修各剩几天，还缺什么证据。传 date + product 即可；不传参数返回示例。",
    inputSchema: {
      type: "object",
      properties: {
        product: { type: "string", description: "商品名，例如「空调」「冰箱」「手机」" },
        merchant: { type: "string", description: "商家名，用于判断线上/线下" },
        amount: { type: "number", description: "购买金额" },
        date: { type: "string", description: "购买日期 YYYY-MM-DD" },
        receivedDate: { type: "string", description: "签收日期 YYYY-MM-DD；线上 7 天无理由从这天算" },
        invoiceDate: { type: "string", description: "发票日期 YYYY-MM-DD；三包从这天算" },
        category: { type: "string", description: "品类 key：appliance / digital / apparel / food / prepaid 等" },
        channel: { type: "string", description: "渠道：taobao / jd / alipay / offline 等" },
        currentPrice: { type: "number", description: "当前同款价格；有价保截止日时用来算差价" },
        today: { type: "string", description: "可选，按哪天算（YYYY-MM-DD）；默认今天" }
      },
      additionalProperties: false
    }
  },
  {
    name: "rights.plan",
    description: "给一宗消费案卷生成下一步、材料与官方入口（只读）",
    inputSchema: { type: "object", properties: { caseId: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "rights.record",
    description: "回填办理结果；公网只读端点不支持写操作",
    inputSchema: { type: "object", properties: { caseId: { type: "string" }, status: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }
  },
  {
    name: "finance.lookup",
    description: "查退款、拒付、续费、预付卡、分期、保险六类资金案卷（只读，示例数据）",
    inputSchema: { type: "object", properties: { query: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "finance.plan",
    description: "给一宗资金案卷生成官方路径、材料与话术（只读）",
    inputSchema: { type: "object", properties: { caseId: { type: "string" } }, additionalProperties: false }
  },
  {
    name: "finance.record",
    description: "回填资金办理结果；公网只读端点不支持写操作",
    inputSchema: { type: "object", properties: { caseId: { type: "string" }, status: { type: "string" }, confirmed: { type: "boolean" } }, additionalProperties: false }
  },
  {
    name: "policy.parse",
    description: "从保单/合同文字中只提取机构、金额、期限与签单日期；证件号、手机号与原文不返回",
    inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"], additionalProperties: false }
  }
];

function toolResult(data, isError) {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }], isError: !!isError };
}

function readOnly(name) {
  return toolResult({ error: "public_read_only", tool: name, message: "公网端点只读；写操作请在本机 MCP stdio 或本地 HTTP 桥完成。" }, true);
}

function parsePolicy(text) {
  const raw = String(text || "").slice(0, 20000);
  const org = (raw.match(/([一-龥A-Za-z0-9（）()·]{2,30}(?:保险|银行|公司|集团|平台|商城|医院))/u) || [])[1] || "";
  const amountMatch = raw.match(/(?:¥|￥|人民币)?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?\s*元/);
  const amount = amountMatch ? Number(amountMatch[1].replace(/,/g, "")) : null;
  const termMatch = raw.match(/(\d{1,2})\s*(年|个月|月)/);
  const term = termMatch ? `${termMatch[1]}${termMatch[2]}` : "";
  const dateMatch = raw.match(/(20\d{2})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  const signedAt = dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, "0")}-${String(dateMatch[3]).padStart(2, "0")}` : "";
  return { org, amount, term, signedAt, note: "只回四项；证件号、手机号与原文已丢弃。" };
}

/* 真正按输入计算的权利查询：不是返回固定示例，而是拿调用方给的日期与品类当场算。 */
function computeRights(args) {
  const input = args || {};
  const hasAny = ["product", "merchant", "date", "receivedDate", "invoiceDate", "amount", "category", "channel"]
    .some((key) => input[key] !== undefined && input[key] !== "");
  if (!hasAny) {
    return { sample: true, note: "没有传参数，返回示例。传 date + product 可以算你自己的。", ...SAMPLE_RIGHTS };
  }
  const today = input.today || undefined;
  const windows = engine.buildWindows(input, today);
  const nearest = engine.nearestWindow(windows);
  const gaps = engine.evidenceGaps(windows, input);
  return {
    sample: false,
    input: {
      product: input.product || "",
      merchant: input.merchant || "",
      amount: typeof input.amount === "number" ? input.amount : null,
      date: input.date || input.invoiceDate || input.receivedDate || "",
      channel: input.channel || ""
    },
    windows,
    nearest,
    evidenceGaps: gaps,
    ruleVersion: engine.DATA.version,
    note: "按官方目录与法条计算；价保是平台承诺不是法定权利，没有截止日就不给倒计时。金额与天数以票据为准。"
  };
}

/* 基于同一份输入，给出下一步：做什么、带什么、去哪儿、别做什么。 */
function planRights(args) {
  const input = args || {};
  const computed = computeRights(input);
  const nearest = computed.nearest || null;
  const gaps = computed.evidenceGaps || [];
  const next = [];
  const doNot = [
    "不代你提交任何投诉或申请",
    "不承诺一定退成、一定赔到",
    "没有核实过的天数不写进材料"
  ];

  if (nearest) {
    next.push(`先办「${nearest.label}」，${nearest.daysLeft === 0 ? "今天就是最后一天" : `还剩 ${nearest.daysLeft} 天`}`);
  }
  for (const gap of gaps.slice(0, 3)) next.push(`补：${gap}`);
  next.push("按渠道顺序走：先找商家 → 商家不处理找平台 → 再不行走 12315 / 12345");

  const official = input.channel === "offline"
    ? "线下门店：先找店长，留存小票与沟通记录；不处理可拨 12315"
    : "支付宝：首页 → 账单 → 找到这笔 → 对此订单有疑问";

  return {
    sample: computed.sample,
    caseId: input.caseId || (computed.sample ? SAMPLE_RIGHTS.caseId : null),
    input: computed.input,
    nearest,
    next,
    materials: ["订单截图", "支付记录", ...gaps],
    official,
    doNot,
    ruleVersion: engine.DATA.version,
    note: "只给路径、材料与顺序，不代提交、不承诺结果。金额与天数以票据为准。"
  };
}

function callTool(name, args) {
  switch (name) {
    case "rights.lookup":
      return toolResult(computeRights(args));
    case "rights.plan":
      return toolResult(planRights(args));
    case "rights.record":
      return readOnly(name);
    case "finance.lookup":
      return toolResult(SAMPLE_FINANCE);
    case "finance.plan":
      return toolResult({
        caseId: (args && args.caseId) || SAMPLE_FINANCE.caseId,
        sample: true,
        next: ["核对开通授权与扣费前提醒", "先在 App 内关闭自动续费", "保留扣款记录与取消截图"],
        materials: ["扣款记录", "开通页面截图", "取消成功截图"],
        official: "支付宝：我的 → 设置 → 支付设置 → 免密支付/自动扣款",
        note: "关代扣不等于解除合同；是否退款以平台规则为准。"
      });
    case "finance.record":
      return readOnly(name);
    case "policy.parse":
      return toolResult(parsePolicy(args && args.text));
    default:
      return toolResult({ error: "unknown_tool", name }, true);
  }
}

function rpc(method, params, id) {
  if (method === "initialize") {
    return {
      jsonrpc: "2.0", id,
      result: {
        protocolVersion: (params && params.protocolVersion) || "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "piaogen-rights", version: VERSION },
        instructions: "票根公网只读端点：七个只读工具；写操作请用本地 MCP。示例数据，不构成法律/金融结论。"
      }
    };
  }
  if (method === "ping") return { jsonrpc: "2.0", id, result: {} };
  if (method === "tools/list") return { jsonrpc: "2.0", id, result: { tools: TOOLS } };
  if (method === "tools/call") {
    const name = params && params.name;
    const args = (params && params.arguments) || {};
    if (!TOOLS.some((tool) => tool.name === name)) {
      return { jsonrpc: "2.0", id, error: { code: -32602, message: `unknown tool: ${name}` } };
    }
    return { jsonrpc: "2.0", id, result: callTool(name, args) };
  }
  return { jsonrpc: "2.0", id, error: { code: -32601, message: `method not found: ${method}` } };
}

function requestHeaders(event) {
  const h = (event && (event.headers || event.header)) || {};
  const out = {};
  Object.keys(h).forEach((k) => { out[String(k).toLowerCase()] = h[k]; });
  return out;
}

function headers(event) {
  const origin = requestHeaders(event).origin || "";
  const out = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, Authorization, X-MCP-Token, MCP-Protocol-Version",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer"
  };
  if (ALLOWED_ORIGINS.includes(origin)) {
    out["Access-Control-Allow-Origin"] = origin;
    out["Vary"] = "Origin";
  }
  return out;
}

function clientIp(event) {
  const h = requestHeaders(event);
  return String(h["x-forwarded-for"] || h["x-real-ip"] || (event && event.requestContext && event.requestContext.sourceIp) || "unknown").split(",")[0].trim();
}

function limited(event) {
  const ip = clientIp(event);
  const now = Date.now();
  const row = hits.get(ip) || { at: now, n: 0 };
  if (now - row.at > RATE_WINDOW) { row.at = now; row.n = 0; }
  row.n += 1;
  hits.set(ip, row);
  if (hits.size > 5000) hits.clear();
  return row.n > RATE_LIMIT;
}

function authorized(event) {
  const token = process.env.MCP_READ_TOKEN;
  if (!token) return true;
  const h = requestHeaders(event);
  const given = String(h.authorization || "").replace(/^Bearer\s+/i, "") || String(h["x-mcp-token"] || "");
  return !!(given && given === token);
}

function manifest() {
  return {
    name: "piaogen-rights",
    version: VERSION,
    description: "票根公网 MCP：按购买日期当场计算消费权利窗口（无理由退货/三包/价保/保修）、给下一步与证据缺口、提取保单字段。只读，不构成法律/金融结论。",
    transport: "http-json-rpc",
    endpoint: "POST /piaogen-mcp",
    mode: "read-only",
    sample: "可选：不传参数返回示例，传 date + product 返回真实计算",
    computes: ["rights.lookup", "rights.plan", "policy.parse"],
    ruleVersion: engine.DATA.version,
    /* 对应的站点版本：调用方可以据此对齐文档与工具行为 */
    site: "V14.0",
    auth: process.env.MCP_READ_TOKEN ? "bearer" : "none",
    tools: TOOLS.map((tool) => ({ name: tool.name, description: tool.description })),
    boundaries: ["不代提交", "不代收款", "不托管资金", "不读用户数据", "写操作拒绝"]
  };
}

function reply(event, statusCode, data) {
  return { statusCode, headers: headers(event), body: JSON.stringify(data, null, 2) };
}

exports.main = async (event) => {
  const method = String((event && (event.httpMethod || event.method)) || "POST").toUpperCase();
  const path = String((event && (event.path || event.rawPath)) || "").toLowerCase();
  if (method === "OPTIONS") return { statusCode: 204, headers: headers(event), body: "" };

  if (limited(event)) {
    return reply(event, 429, { error: "rate_limited", message: "每分钟最多 60 次；请稍后再试。" });
  }

  if (method === "GET") {
    if (path.endsWith("/health")) return reply(event, 200, { ok: true, name: "piaogen-rights", version: VERSION, mode: "read-only" });
    if (path.endsWith("/openapi.json")) return reply(event, 200, OPENAPI);
    if (path.endsWith("/manifest.json") || path.endsWith("/.well-known/mcp.json")) return reply(event, 200, manifest());
    return reply(event, 200, manifest());
  }

  /* REST 直调：给不认识 MCP 的调用方（比如只会发 JSON 的脚本或低代码平台）。
     和 MCP 的 tools/call 走同一个计算核心，结果完全一致。 */
  if (path.endsWith("/rights") || path.endsWith("/plan")) {
    let payload;
    try {
      payload = typeof event.body === "string" ? JSON.parse(event.body || "{}") : (event.body || {});
    } catch (error) {
      return reply(event, 400, { error: "bad_json", message: "请求体不是合法 JSON。" });
    }
    if (!payload || typeof payload !== "object") {
      return reply(event, 400, { error: "bad_body", message: "请求体应为 JSON 对象。" });
    }
    const out = path.endsWith("/rights") ? computeRights(payload) : planRights(payload);
    return reply(event, 200, out);
  }

  if (!authorized(event)) {
    return reply(event, 401, { jsonrpc: "2.0", id: null, error: { code: -32001, message: "unauthorized" } });
  }

  const body = event && event.body;
  if (typeof body === "string" && body.length > MAX_BODY) {
    return reply(event, 413, { jsonrpc: "2.0", id: null, error: { code: -32002, message: "payload too large" } });
  }

  let payload;
  try {
    payload = typeof body === "string" ? JSON.parse(body) : body;
  } catch (error) {
    return reply(event, 400, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "parse error" } });
  }

  if (!payload || typeof payload !== "object") {
    return reply(event, 400, { jsonrpc: "2.0", id: null, error: { code: -32600, message: "invalid request" } });
  }

  const result = rpc(payload.method, payload.params, payload.id === undefined ? null : payload.id);
  return reply(event, 200, result);
};

exports._test = { requestHeaders, headers, limited, authorized, manifest, rpc, TOOLS, hits };