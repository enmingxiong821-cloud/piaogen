#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const readline = require("readline");

const DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "case-demo.json"), "utf8"));
const cases = DATA.cases.map((item) => ({ ...item, actions: Array.isArray(item.actions) ? item.actions.slice() : [] }));
const FINANCE_DATA = JSON.parse(fs.readFileSync(path.join(__dirname, "finance-demo.json"), "utf8"));
const financeCases = FINANCE_DATA.cases.map((item) => ({ ...item, actions: Array.isArray(item.actions) ? item.actions.slice() : [] }));
const engine = require("./rights-engine.js");

// 本地持久化：写在 server.js 同目录，文件不可写时自动退回内存模式。
// 只存动作与状态，不存票据原文、证件号、手机号。
// PG_MCP_STORE=off 用于测试，不落盘；也可指定自定义路径。
const STORE_MODE = process.env.PG_MCP_STORE || "";
const STORE_PATH = STORE_MODE === "off" ? null : (STORE_MODE || path.join(__dirname, "records.local.json"));
const STORE_LIMIT = 5000;
let storeWarning = "";
let storedRecords = [];
if (STORE_PATH) {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) throw new Error("records file is not an array");
    storedRecords = parsed;
  } catch (error) {
    if (error && error.code !== "ENOENT") {
      try { fs.renameSync(STORE_PATH, `${STORE_PATH}.corrupt-${Date.now()}`); } catch (e) { /* ignore */ }
      storeWarning = "本地记录文件损坏，已备份为 .corrupt-* 并从空记录开始";
    }
    storedRecords = [];
  }
}

function applyStoredRecord(row) {
  if (!row || !row.caseId || !row.action) return;
  const pool = row.kind === "finance" ? financeCases : cases;
  const target = pool.find((item) => item.caseId === row.caseId);
  if (!target) return;
  target.actions = (target.actions || []).concat(row.action);
  if (row.caseStatus) target.status = row.caseStatus;
  if (row.kind === "finance") {
    if (typeof row.recoveredAmount === "number") target.recoveredAmount = row.recoveredAmount;
    if (row.updatedAt) target.updatedAt = row.updatedAt;
  }
}

storedRecords.forEach(applyStoredRecord);

function persistRecord(row) {
  storedRecords.push(row);
  let truncated = false;
  if (storedRecords.length > STORE_LIMIT) {
    storedRecords = storedRecords.slice(-STORE_LIMIT);
    truncated = true;
  }
  if (!STORE_PATH) return { persisted: false, truncated, warning: storeWarning };
  try {
    const tmp = `${STORE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(storedRecords, null, 2));
    fs.renameSync(tmp, STORE_PATH);
    return { persisted: true, truncated, warning: storeWarning };
  } catch (error) {
    return { persisted: false, truncated, warning: storeWarning };
  }
}

const TOOLS = [
  {
    name: "rights.lookup",
    description: "查一笔购买对应的消费权利回执：还能做什么、最近哪一天关闭、缺什么证据。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "一句话或关键词，例如“空气炸锅”“上周买的”" },
        merchant: { type: "string", description: "商家名" },
        category: { type: "string", description: "品类 key，例如 appliance / furniture / renovation" },
        date: { type: "string", description: "购买日期 YYYY-MM-DD" },
        amount: { type: "number", description: "金额" }
      }
    }
  },
  {
    name: "rights.plan",
    description: "给一宗案卷生成下一步：主行动、材料清单、话术、入口和禁止事项。",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string", description: "案卷编号，例如 PG-20261113-0001" }
      },
      required: ["caseId"]
    }
  },
  {
    name: "rights.record",
    description: "把办理结果写回案卷，并持久化到本地 records.local.json；金额分预计与已确认，不代提交。",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string", description: "案卷编号" },
        status: {
          type: "string",
          enum: ["submitted", "refunded", "repaired", "promise", "rejected", "abandoned"],
          description: "结果状态"
        },
        confirmed: { type: "boolean", description: "用户是否确认到账/完成；refunded / repaired / promise 必须为 true" },
        amount: { type: "number", description: "已确认金额，没有就省略" },
        note: { type: "string", description: "备注，例如“平台客服说 3 天到账”" }
      },
      required: ["caseId", "status"]
    }
  },
  {
    name: "finance.lookup",
    description: "查资金售后案卷：退款没到、银行卡争议、自动续费、预付卡、分期息费或保险犹豫期。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "一句话或关键词，例如“退款没到”“银行卡半夜被刷”" },
        type: {
          type: "string",
          enum: ["payment", "chargeback", "renewal", "prepaid", "installment", "insurance"],
          description: "资金售后类型"
        },
        merchant: { type: "string", description: "商家 / 机构" },
        amount: { type: "number", description: "争议金额" }
      }
    }
  },
  {
    name: "finance.plan",
    description: "给一宗资金案卷生成下一步：先补什么证据、官方路径、可直接说的话和禁止事项。",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string", description: "资金案卷编号，例如 FM-20261121-0001" }
      },
      required: ["caseId"]
    }
  },
  {
    name: "finance.record",
    description: "记录资金售后进度并持久化到本地 records.local.json；只有调用方明确 confirmed=true 且用户确认到账/解决时，才记录已解决金额。",
    inputSchema: {
      type: "object",
      properties: {
        caseId: { type: "string", description: "资金案卷编号" },
        status: {
          type: "string",
          enum: ["submitted", "accepted", "waiting", "resolved", "rejected", "closed"],
          description: "进度状态"
        },
        confirmed: { type: "boolean", description: "用户是否确认到账/已解决；resolved 必须为 true" },
        amount: { type: "number", description: "确认解决金额，没有就省略" },
        note: { type: "string", description: "备注，例如“银行受理，等待补件”" }
      },
      required: ["caseId", "status"]
    }
  },
  {
    name: "policy.parse",
    description: "从保单/合同文字里只提取机构、金额、期限与签单日期；不返回证件号、手机号或原文。",
    inputSchema: {
      type: "object",
      properties: {
        text: { type: "string", description: "OCR 得到的保单/合同文字" },
        fileName: { type: "string", description: "可选，文件名" }
      },
      required: ["text"]
    }
  }
];

function nearest(item) {
  const open = (item.windows || [])
    .filter((win) => typeof win.daysLeft === "number" && win.daysLeft >= 0)
    .sort((a, b) => a.daysLeft - b.daysLeft);
  return open[0] || null;
}

function summary(item) {
  const win = nearest(item);
  return {
    caseId: item.caseId,
    merchant: item.merchant,
    product: item.product,
    amount: item.amount,
    date: item.date,
    status: item.status,
    evidenceCount: (item.evidence || []).length,
    missing: item.missing || [],
    nearest: win ? { type: win.type, label: win.label, end: win.end, daysLeft: win.daysLeft } : null,
    primary: item.primary ? item.primary.label : null
  };
}

function score(item, args) {
  let n = 0;
  const query = String(args.query || "").trim();
  if (query) {
    if (query.includes(item.merchant) || item.merchant.includes(query)) n += 4;
    if (query.includes(item.product) || item.product.includes(query)) n += 4;
    if (query.includes(item.caseId)) n += 4;
    const tokens = query.split(/[\s，。！？、,]+/).filter((x) => x.length >= 2);
    for (const token of tokens) {
      if (item.product.includes(token) || item.merchant.includes(token)) n += 1;
    }
  }
  if (args.merchant && item.merchant.includes(String(args.merchant))) n += 3;
  if (args.category && item.category === args.category) n += 2;
  if (args.date && item.date === args.date) n += 2;
  if (typeof args.amount === "number" && Number(item.amount) === args.amount) n += 2;
  return n;
}

function lookup(args) {
  const input = args || {};
  const ranked = cases
    .map((item) => ({ item, score: score(item, input) }))
    .sort((a, b) => b.score - a.score);
  const hasQuery = Object.keys(input).some((key) => input[key] !== undefined && input[key] !== "");
  const picked = hasQuery ? ranked.filter((row) => row.score > 0) : ranked;

  // 只要给了日期或商品名，就按官方目录与法条当场算一遍，而不是只查示例案卷。
  const canCompute = ["date", "receivedDate", "invoiceDate", "product"].some(
    (key) => input[key] !== undefined && input[key] !== ""
  );
  const computed = canCompute ? computeRights(input) : null;

  return {
    count: picked.length,
    cases: picked.slice(0, 10).map((row) => summary(row.item)),
    ...(computed ? { computed } : {})
  };
}

/* 用同一份纯函数引擎按输入算权利窗口；与公网端点共用 rights-engine.js。 */
function computeRights(input) {
  const windows = engine.buildWindows(input, input.today);
  const nearest = engine.nearestWindow(windows);
  const gaps = engine.evidenceGaps(windows, input);
  return {
    input: {
      product: input.product || "",
      merchant: input.merchant || "",
      amount: typeof input.amount === "number" ? input.amount : null,
      date: input.date || input.invoiceDate || input.receivedDate || ""
    },
    windows,
    nearest,
    evidenceGaps: gaps,
    ruleVersion: engine.DATA.version,
    note: "按官方目录与法条计算；价保是平台承诺不是法定权利，没有截止日就不给倒计时。"
  };
}

function plan(args) {
  const item = cases.find((row) => row.caseId === args.caseId);
  if (!item) return { error: `没有找到案卷 ${args.caseId}` };
  const win = nearest(item);
  return {
    caseId: item.caseId,
    merchant: item.merchant,
    product: item.product,
    status: item.status,
    primary: item.primary,
    nearest: win ? { type: win.type, label: win.label, end: win.end, daysLeft: win.daysLeft } : null,
    evidence: item.evidence || [],
    missing: item.missing || [],
    doNot: item.doNot || [],
    humanApproval: true
  };
}

function record(args) {
  const item = cases.find((row) => row.caseId === args.caseId);
  if (!item) return { error: `没有找到案卷 ${args.caseId}` };
  const status = String(args.status || "");
  const allowed = ["submitted", "refunded", "repaired", "promise", "rejected", "abandoned"];
  if (!allowed.includes(status)) return { error: `不支持的结果状态：${status}` };
  const needConfirm = ["refunded", "repaired", "promise"].includes(status);
  if (needConfirm && args.confirmed !== true) {
    return { error: "refunded / repaired / promise 必须由用户确认后传 confirmed=true；不能把受理或口头承诺写成已办结" };
  }
  const action = {
    id: `A-${Date.now().toString(36)}`,
    status,
    amount: typeof args.amount === "number" ? args.amount : null,
    note: String(args.note || ""),
    confirmed: args.confirmed === true,
    at: new Date().toISOString()
  };
  item.actions.push(action);
  if (needConfirm) item.status = "已办结";
  else if (status === "rejected") item.status = "被拒";
  else if (status !== "abandoned") item.status = "进行中";
  const win = nearest(item);
  const predicted = win ? Number(win.amount) || 0 : 0;
  const confirmed = item.actions
    .filter((row) => row.confirmed !== false && ["refunded", "promise"].includes(row.status))
    .reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  const stored = persistRecord({ kind: "rights", caseId: item.caseId, caseStatus: item.status, action });
  return {
    caseId: item.caseId,
    status: item.status,
    action,
    outcome: { predicted: Math.max(predicted, confirmed), confirmed },
    persisted: stored.persisted,
    store: { count: storedRecords.length, truncated: stored.truncated, warning: stored.warning },
    audit: [
      `记录 ${status}`,
      "不代提交；结果由调用方或用户确认后写入",
      stored.persisted ? "已写入本地 records.local.json" : "本次未落盘，仅保留在本次进程内",
      stored.truncated ? `记录超过 ${STORE_LIMIT} 条，已丢弃最旧记录` : "",
      stored.warning || "",
      `累计 ${item.actions.length} 条动作`
    ].filter(Boolean)
  };
}

function financeDeadline(item) {
  if (!item.deadline) return { date: null, daysLeft: null, source: "未填写，不生成倒计时" };
  const target = new Date(String(item.deadline).replace(/\./g, "-"));
  if (Number.isNaN(target.getTime())) return { date: null, daysLeft: null, source: "日期无法解析，不生成倒计时" };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  return {
    date: item.deadline,
    daysLeft: Math.round((target - today) / 86400000),
    source: "用户填写的截止日；不是系统推断"
  };
}

function financeSummary(item) {
  const due = financeDeadline(item);
  return {
    caseId: item.caseId,
    type: item.type,
    label: item.label,
    merchant: item.merchant,
    amount: item.amount,
    date: item.date,
    status: item.status,
    recoveredAmount: Number(item.recoveredAmount) || 0,
    updatedAt: item.updatedAt || null,
    deadline: due,
    evidenceReady: (item.evidence || []).filter((row) => row.status === "ready").length,
    evidenceTotal: (item.evidence || []).length,
    missing: item.missing || [],
    primary: item.primary ? item.primary.label : null
  };
}

function financeScore(item, args) {
  let score = 0;
  const query = String(args.query || "").trim();
  const intentHints = {
    payment: /退款|没到账|重复扣|没收到|金额不对|货不对板/,
    chargeback: /盗刷|银行卡|信用卡|拒付|未授权|争议交易/,
    renewal: /自动续费|连续包月|会员|代扣|免密|扣费/,
    prepaid: /预付|储值|健身|美容|教培|洗车|余额/,
    installment: /分期|月供|手续费|年化|利息|贷款|息费/,
    insurance: /保险|保单|犹豫期|退保|保费/
  };
  if (query) {
    for (const token of [item.merchant, item.label, item.caseId, item.type]) {
      if (token && (query.includes(token) || token.includes(query))) score += 4;
    }
    for (const token of query.split(/[\s，。！？、,]+/).filter((x) => x.length >= 2)) {
      if (String(item.merchant || "").includes(token) || String(item.label || "").includes(token)) score += 1;
    }
    if (intentHints[item.type] && intentHints[item.type].test(query)) score += 4;
  }
  if (args.type && item.type === args.type) score += 4;
  if (args.merchant && String(item.merchant || "").includes(String(args.merchant))) score += 3;
  if (typeof args.amount === "number" && Number(item.amount) === args.amount) score += 2;
  return score;
}

function financeLookup(args) {
  const hasQuery = Object.keys(args || {}).some((key) => args[key] !== undefined && args[key] !== "");
  const ranked = financeCases
    .map((item) => ({ item, score: financeScore(item, args || {}) }))
    .sort((a, b) => b.score - a.score);
  const picked = hasQuery ? ranked.filter((row) => row.score > 0) : ranked;
  return {
    count: picked.length,
    cases: picked.slice(0, 10).map((row) => financeSummary(row.item))
  };
}

function financePlan(args) {
  const item = financeCases.find((row) => row.caseId === args.caseId);
  if (!item) return { error: `没有找到资金案卷 ${args.caseId}` };
  const summary = financeSummary(item);
  const missing = item.missing || [];
  return {
    ...summary,
    primary: item.primary,
    fields: item.fields || {},
    evidence: item.evidence || [],
    routes: item.routes || [],
    script: item.script || "",
    doNot: item.doNot || [],
    humanApproval: true,
    submitPolicy: "只准备材料和路径；由用户自己提交，不代提交、不代收款。"
  };
}

function financeRecord(args) {
  const item = financeCases.find((row) => row.caseId === args.caseId);
  if (!item) return { error: `没有找到资金案卷 ${args.caseId}` };
  const status = String(args.status || "");
  const allowed = ["submitted", "accepted", "waiting", "resolved", "rejected", "closed"];
  if (!allowed.includes(status)) return { error: `不支持的进度状态：${status}` };
  if (status === "resolved" && args.confirmed !== true) {
    return { error: "resolved 必须由用户确认 confirmed=true；不能把受理或口头承诺写成已解决" };
  }
  const amount = status === "resolved" && typeof args.amount === "number" ? args.amount : 0;
  const action = {
    id: `FA-${Date.now().toString(36)}`,
    status,
    amount,
    note: String(args.note || ""),
    at: new Date().toISOString(),
    confirmed: args.confirmed === true
  };
  item.actions.push(action);
  item.status = status;
  item.updatedAt = new Date().toISOString();
  if (status === "resolved") item.recoveredAmount = amount;
  const stored = persistRecord({
    kind: "finance",
    caseId: item.caseId,
    caseStatus: status,
    recoveredAmount: item.recoveredAmount,
    updatedAt: item.updatedAt,
    action
  });
  return {
    caseId: item.caseId,
    status,
    action,
    outcome: {
      disputed: Number(item.amount) || 0,
      confirmed: amount
    },
    persisted: stored.persisted,
    store: { count: storedRecords.length, truncated: stored.truncated, warning: stored.warning },
    audit: [
      `记录 ${status}`,
      "只记录调用方声明的进度；未确认到账不写已解决",
      stored.persisted ? "已写入本地 records.local.json" : "本次未落盘，仅保留在本次进程内",
      stored.truncated ? `记录超过 ${STORE_LIMIT} 条，已丢弃最旧记录` : "",
      stored.warning || "",
      "不代提交、不代收款"
    ].filter(Boolean)
  };
}

// 与前端 PG.parsePolicyDoc 同口径：只返回三项，不保留证件与原文。
function parsePolicy(text) {
  const compact = String(text || "").replace(/\r/g, "").replace(/[ \t]+/g, " ").trim();
  if (compact.length < 4) return { error: "没有足够文字可读" };
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
  for (const pattern of [
    /([一-龥（）()]{2,24}(?:保险|人寿|财险)(?:股份)?(?:有限)?(?:责任)?公司)/,
    /([一-龥（）()]{2,24}(?:健身|教育|培训|美容|俱乐部|会所|学院|中心|有限公司|公司))/
  ]) {
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
  for (const pattern of [
    /(?:保险费|保费|合同金额|合同总价|合同价款|总金额|合计金额|应付金额|费用总额|总价款|课程总价|服务总价|金额)[^0-9¥￥\n]{0,6}[¥￥]?\s*(\d[\d,]*(?:\.\d{1,2})?)/,
    /[¥￥]\s*(\d[\d,]*(?:\.\d{1,2})?)/,
    /(\d[\d,]*(?:\.\d{2}))\s*元/
  ]) {
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

  return {
    kind,
    merchant,
    amount,
    coolingDays,
    term,
    signedDate,
    policyType,
    piiSeen: /\d{17}[\dXx]/.test(compact) || /\b1[3-9]\d{9}\b/.test(compact),
    confidence: (merchant && amount) ? "high" : (merchant || amount ? "medium" : "low"),
    note: "只保留机构、金额与期限；证件号、手机号与原文不保存"
  };
}

function reply(id, result, error) {
  return error
    ? { jsonrpc: "2.0", id, error }
    : { jsonrpc: "2.0", id, result };
}

function callTool(name, args) {
  if (name === "rights.lookup" || name === "case.lookup") return lookup(args || {});
  if (name === "rights.plan" || name === "case.plan") return plan(args || {});
  if (name === "rights.record" || name === "case.record") return record(args || {});
  if (name === "finance.lookup" || name === "funds.lookup") return financeLookup(args || {});
  if (name === "finance.plan" || name === "funds.plan") return financePlan(args || {});
  if (name === "finance.record" || name === "funds.record") return financeRecord(args || {});
  if (name === "policy.parse") return parsePolicy((args || {}).text);
  return { error: `未知工具：${name}` };
}

function dispatch(message) {
  const id = message.id;
  const method = message.method;
  if (method === "initialize") {
    return reply(id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: "piaogen-rights-finance", version: "0.5.0" }
    });
  }
  if (method === "tools/list") return reply(id, { tools: TOOLS });
  if (method === "tools/call") {
    const params = message.params || {};
    const payload = callTool(params.name, params.arguments || {});
    if (payload && payload.error) {
      return reply(id, { content: [{ type: "text", text: payload.error }], isError: true });
    }
    return reply(id, { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }], isError: false });
  }
  if (method === "ping") return reply(id, {});
  if (method === "notifications/initialized" || method === undefined) return null;
  return reply(id, null, { code: -32601, message: `Method not found: ${method}` });
}

function send(payload) {
  if (!payload) return;
  process.stdout.write(JSON.stringify(payload) + "\n");
}

module.exports = { dispatch, TOOLS };

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  rl.on("line", (line) => {
    if (!line.trim()) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      return send(reply(null, null, { code: -32700, message: "Parse error" }));
    }
    try {
      send(dispatch(message));
    } catch (error) {
      send(reply(message.id, null, { code: -32603, message: String(error && error.message ? error.message : error) }));
    }
  });
}
