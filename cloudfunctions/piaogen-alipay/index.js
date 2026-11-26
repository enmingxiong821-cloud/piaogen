"use strict";

/**
 * 票根 · 支付宝只读交易查询适配层（CloudBase HTTP 函数）
 *
 * 只做一件事：用商户自己的凭据调 alipay.trade.query，把结果裁剪成票根需要的最小字段。
 * - 只读：不退款、不转账、不关单、不代扣。
 * - 不落库、不写日志、不回传买家账号与资金明细。
 * - 缺少环境变量时直接返回 not_configured，不假装已接入。
 *
 * 环境变量：
 *   ALIPAY_APP_ID        应用 AppID
 *   ALIPAY_PRIVATE_KEY   应用私钥（PKCS#8，可带或不带 BEGIN 头；换行可用 \n）
 *   ALIPAY_PUBLIC_KEY    支付宝公钥（非应用公钥；可带或不带 BEGIN 头）
 *   ALIPAY_GATEWAY       默认 https://openapi.alipay.com/gateway.do
 *   ALLOWED_ORIGIN       可选，逗号分隔的允许来源；不设则不返回 CORS 头
 *   ALIPAY_MAX_PER_MIN   可选，单 IP 每分钟上限，默认 30
 *
 * 接口：POST /  body={"outTradeNo":"..."} 或 {"tradeNo":"..."}
 * 返回：{ ok, source:"alipay.trade.query", trade:{...} } 或 { ok:false, error, message }
 */

const crypto = require("crypto");

const GATEWAY = process.env.ALIPAY_GATEWAY || "https://openapi.alipay.com/gateway.do";
const MAX_PER_MIN = Number(process.env.ALIPAY_MAX_PER_MIN) || 30;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";

const KEEP_FIELDS = [
  "trade_no", "out_trade_no", "trade_status", "total_amount", "buyer_pay_amount",
  "receipt_amount", "refund_fee", "subject", "send_pay_date", "store_name",
  "buyer_logon_id_masked", "invoice_amount", "point_amount"
];

const buckets = new Map();

function nowStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function pem(key, type) {
  const body = String(key || "").replace(/\\n/g, "\n").trim();
  if (!body) return "";
  if (body.includes("BEGIN")) return body;
  const header = type === "private" ? "PRIVATE KEY" : "PUBLIC KEY";
  const lines = body.replace(/\s+/g, "").match(/.{1,64}/g) || [];
  return `-----BEGIN ${header}-----\n${lines.join("\n")}\n-----END ${header}-----`;
}

function sortParams(params) {
  return Object.keys(params)
    .filter((k) => k !== "sign" && params[k] !== undefined && params[k] !== null && String(params[k]) !== "")
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
}

function signContent(content, privateKey) {
  const key = pem(privateKey, "private");
  if (!key) throw new Error("missing_private_key");
  return crypto.createSign("RSA-SHA256").update(content, "utf8").sign(key, "base64");
}

function verifyContent(content, signature, publicKey) {
  const key = pem(publicKey, "public");
  if (!key) return false;
  try {
    return crypto.createVerify("RSA-SHA256").update(content, "utf8").verify(key, signature, "base64");
  } catch (e) {
    return false;
  }
}

function extractResponseNode(text, method) {
  const node = method.replace(/\./g, "_") + "_response";
  const re = new RegExp(`"${node}"\\s*:\\s*\\{`);
  const match = re.exec(text);
  if (!match) return null;
  let i = match.index + match[0].length - 1;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let j = i; j < text.length; j++) {
    const ch = text[j];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}

function maskLogonId(value) {
  const s = String(value || "");
  if (!s) return "";
  if (s.length <= 4) return "*".repeat(s.length);
  return `${s.slice(0, 2)}****${s.slice(-2)}`;
}

function sanitizeTrade(node) {
  const out = {};
  KEEP_FIELDS.forEach((k) => { if (node[k] !== undefined) out[k] = node[k]; });
  if (node.buyer_logon_id) out.buyer_logon_id_masked = maskLogonId(node.buyer_logon_id);
  return out;
}

function buildParams({ appId, privateKey, outTradeNo, tradeNo }) {
  const biz = {};
  if (outTradeNo) biz.out_trade_no = outTradeNo;
  if (tradeNo) biz.trade_no = tradeNo;
  const params = {
    app_id: appId,
    method: "alipay.trade.query",
    format: "JSON",
    charset: "utf-8",
    sign_type: "RSA2",
    timestamp: nowStamp(),
    version: "1.0",
    biz_content: JSON.stringify(biz)
  };
  const content = sortParams(params);
  params.sign = signContent(content, privateKey);
  return { params, content };
}

function sanitizeError(node) {
  return {
    code: node.code || "",
    msg: node.msg || "",
    sub_code: node.sub_code || "",
    sub_msg: node.sub_msg || ""
  };
}

function corsHeaders(origin) {
  if (!ALLOWED_ORIGIN) return {};
  const list = ALLOWED_ORIGIN.split(",").map((s) => s.trim()).filter(Boolean);
  if (!origin || !list.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

function reply(statusCode, body, headers) {
  return Object.assign({
    statusCode,
    headers: Object.assign({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }, headers || {}),
    body: JSON.stringify(body)
  }, { isBase64Encoded: false });
}

function clientIp(event) {
  const h = (event && event.headers) || {};
  return String(h["x-forwarded-for"] || h["X-Forwarded-For"] || h["x-real-ip"] || "unknown").split(",")[0].trim();
}

function rateLimited(ip) {
  const now = Date.now();
  const arr = (buckets.get(ip) || []).filter((t) => now - t < 60000);
  if (arr.length >= MAX_PER_MIN) { buckets.set(ip, arr); return true; }
  arr.push(now);
  buckets.set(ip, arr);
  if (buckets.size > 2000) {
    for (const [k, v] of buckets) if (!v.length || now - v[v.length - 1] > 120000) buckets.delete(k);
  }
  return false;
}

async function queryAlipay(input) {
  const appId = process.env.ALIPAY_APP_ID || "";
  const privateKey = process.env.ALIPAY_PRIVATE_KEY || "";
  const publicKey = process.env.ALIPAY_PUBLIC_KEY || "";
  if (!appId || !privateKey || !publicKey) return { status: 503, body: { ok: false, error: "not_configured", message: "缺少 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY / ALIPAY_PUBLIC_KEY，未接入支付宝。" } };

  const { params } = buildParams({ appId, privateKey, outTradeNo: input.outTradeNo, tradeNo: input.tradeNo });
  let text = "";
  try {
    const resp = await fetch(GATEWAY, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" },
      body: new URLSearchParams(params).toString()
    });
    text = await resp.text();
  } catch (e) {
    return { status: 502, body: { ok: false, error: "gateway_unreachable", message: "网关请求失败，未得到支付宝响应。" } };
  }

  const raw = extractResponseNode(text, "alipay.trade.query");
  if (!raw) return { status: 502, body: { ok: false, error: "bad_response", message: "响应不是预期的 alipay.trade.query 结构。" } };

  let node;
  try { node = JSON.parse(raw); } catch (e) { return { status: 502, body: { ok: false, error: "bad_response", message: "响应 JSON 无法解析。" } }; }

  const signMatch = /"sign"\s*:\s*"([^"]+)"/.exec(text);
  const verified = signMatch ? verifyContent(raw, signMatch[1], publicKey) : false;
  if (!verified) return { status: 502, body: { ok: false, error: "sign_mismatch", message: "响应验签未通过，拒绝使用该结果。" } };

  if (node.code !== "10000") {
    return { status: 200, body: { ok: false, verified: true, error: "alipay_error", alipay: sanitizeError(node), message: node.sub_msg || node.msg || "支付宝返回未成功。" } };
  }

  return { status: 200, body: { ok: true, verified: true, source: "alipay.trade.query", trade: sanitizeTrade(node) } };
}

exports.main = async function main(event) {
  const headers = (event && event.headers) || {};
  const origin = headers.origin || headers.Origin || "";
  const cors = corsHeaders(origin);
  const method = String(event.httpMethod || event.method || "POST").toUpperCase();

  if (method === "OPTIONS") return reply(204, {}, cors);
  if (method !== "POST") return reply(405, { ok: false, error: "method_not_allowed", message: "只接受 POST。" }, cors);

  const ip = clientIp(event);
  if (rateLimited(ip)) return reply(429, { ok: false, error: "rate_limited", message: "请求过于频繁，请稍后再试。" }, cors);

  let body = {};
  try {
    const raw = event.body || "";
    body = raw && typeof raw === "string" ? JSON.parse(raw) : (event || {});
  } catch (e) {
    return reply(400, { ok: false, error: "bad_json", message: "请求体必须是 JSON。" }, cors);
  }

  const outTradeNo = String(body.outTradeNo || body.out_trade_no || "").trim();
  const tradeNo = String(body.tradeNo || body.trade_no || "").trim();
  const pattern = /^[A-Za-z0-9_-]{1,64}$/;
  if (!outTradeNo && !tradeNo) return reply(400, { ok: false, error: "missing_order", message: "需要 outTradeNo 或 tradeNo。" }, cors);
  if ((outTradeNo && !pattern.test(outTradeNo)) || (tradeNo && !pattern.test(tradeNo))) {
    return reply(400, { ok: false, error: "bad_order", message: "订单号只允许字母、数字、下划线与短横线，最长 64 位。" }, cors);
  }
  if (outTradeNo && tradeNo) return reply(400, { ok: false, error: "ambiguous_order", message: "一次只查一个订单：outTradeNo 或 tradeNo。" }, cors);

  const result = await queryAlipay({ outTradeNo, tradeNo });
  return reply(result.status, result.body, cors);
};

exports._internal = {
  pem, sortParams, signContent, verifyContent, extractResponseNode, sanitizeTrade, sanitizeError, buildParams, maskLogonId
};