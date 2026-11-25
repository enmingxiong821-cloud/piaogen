"use strict";

/**
 * 票根 · 公网只读 MCP 端点（CloudBase HTTP 函数）
 *
 * 只实现 MCP 的 initialize / tools/list / tools/call 三个方法。
 * 七个工具与本地 mcp/server.js 同名同参；所有写操作（*_record）在这里一律拒绝。
 * 不读文件、不读环境变量、不访问数据库、不发外部请求。
 */

const VERSION = "0.4.3";
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
    description: "查一笔消费的权利窗口、最近关闭日与证据缺口（只读，示例数据）",
    inputSchema: { type: "object", properties: { query: { type: "string", description: "商品、商家或订单关键词" } }, additionalProperties: false }
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

function callTool(name, args) {
  switch (name) {
    case "rights.lookup":
      return toolResult(SAMPLE_RIGHTS);
    case "rights.plan":
      return toolResult({
        caseId: (args && args.caseId) || SAMPLE_RIGHTS.caseId,
        sample: true,
        next: ["先补订单页价保标识", "拍当前价截图", "在订单页发起价保或联系商家"],
        materials: ["订单截图", "当前价截图", "与商家沟通记录"],
        official: "支付宝：首页 → 账单 → 找到这笔 → 对此订单有疑问",
        note: "只给路径与材料，不代提交、不承诺结果。"
      });
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
    description: "票根公网只读 MCP：消费权利窗口、资金售后路径、保单字段提取。示例数据，不构成法律/金融结论。",
    transport: "http-json-rpc",
    endpoint: "POST /piaogen-mcp",
    mode: "read-only",
    sample: true,
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
    if (path.endsWith("/manifest.json") || path.endsWith("/.well-known/mcp.json")) return reply(event, 200, manifest());
    return reply(event, 200, manifest());
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