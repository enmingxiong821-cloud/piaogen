"use strict";

/**
 * 离线自检：不联网、不读真实凭据。
 * 用临时生成的 RSA 密钥对验证签名/验签、响应节点提取与字段裁剪。
 * 运行：node selftest.js
 */

const assert = require("assert");
const crypto = require("crypto");
const I = require("./index.js")._internal;

const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});

let passed = 0;
async function ok(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}

async function run() {

await ok("pem 补全私钥头", () => {
  const bare = privateKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  assert.ok(I.pem(bare, "private").startsWith("-----BEGIN PRIVATE KEY-----"));
});

await ok("pem 补全公钥头", () => {
  const bare = publicKey.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  assert.ok(I.pem(bare, "public").startsWith("-----BEGIN PUBLIC KEY-----"));
});

await ok("参数排序排除空值与 sign", () => {
  const s = I.sortParams({ b: "2", a: "1", sign: "x", empty: "" });
  assert.strictEqual(s, "a=1&b=2");
});

await ok("签名可被公钥验证", () => {
  const { params, content } = I.buildParams({
    appId: "2021000000000000",
    privateKey,
    outTradeNo: "PG202611250001"
  });
  assert.strictEqual(params.method, "alipay.trade.query");
  assert.strictEqual(params.sign_type, "RSA2");
  assert.ok(params.biz_content.includes("PG202611250001"));
  assert.ok(I.verifyContent(content, params.sign, publicKey));
});

await ok("篡改签名后验签失败", () => {
  const content = "app_id=1&method=x";
  const sign = I.signContent(content, privateKey);
  assert.strictEqual(I.verifyContent(content, sign, publicKey), true);
  assert.strictEqual(I.verifyContent(content + "&x=1", sign, publicKey), false);
});

await ok("从响应文本中精确截取节点", () => {
  const node = '{"code":"10000","msg":"Success","subject":"含}括号的商品","nested":{"a":1}}';
  const text = `{"alipay_trade_query_response":${node},"sign":"abc"}`;
  assert.strictEqual(I.extractResponseNode(text, "alipay.trade.query"), node);
});

await ok("裁剪响应只保留白名单字段", () => {
  const out = I.sanitizeTrade({
    code: "10000", msg: "Success", trade_no: "2026", out_trade_no: "PG1",
    trade_status: "TRADE_SUCCESS", total_amount: "39.90", buyer_logon_id: "abc***@example.com",
    buyer_user_id: "2088xxx", fund_bill_list: [{ amount: "39.90" }], subject: "抽纸"
  });
  assert.strictEqual(out.trade_status, "TRADE_SUCCESS");
  assert.strictEqual(out.buyer_user_id, undefined);
  assert.strictEqual(out.fund_bill_list, undefined);
  assert.strictEqual(out.buyer_logon_id, undefined);
  assert.strictEqual(out.buyer_logon_id_masked, "ab****om");
});

await ok("错误响应只保留 code/msg/sub_code/sub_msg", () => {
  const out = I.sanitizeError({ code: "40004", msg: "Business Failed", sub_code: "ACQ.TRADE_NOT_EXIST", sub_msg: "交易不存在", buyer_user_id: "x" });
  assert.deepStrictEqual(Object.keys(out).sort(), ["code", "msg", "sub_code", "sub_msg"]);
});

await ok("缺少凭据时返回 not_configured", async () => {
  delete process.env.ALIPAY_APP_ID;
  delete process.env.ALIPAY_PRIVATE_KEY;
  delete process.env.ALIPAY_PUBLIC_KEY;
  const res = await require("./index.js").main({ httpMethod: "POST", headers: {}, body: JSON.stringify({ outTradeNo: "PG1" }) });
  assert.strictEqual(res.statusCode, 503);
  assert.ok(res.body.includes("not_configured"));
});

await ok("拒绝非 POST 与非法订单号", async () => {
  const main = require("./index.js").main;
  const g = await main({ httpMethod: "GET", headers: {} });
  assert.strictEqual(g.statusCode, 405);
  const bad = await main({ httpMethod: "POST", headers: {}, body: JSON.stringify({ outTradeNo: "../etc/passwd" }) });
  assert.strictEqual(bad.statusCode, 400);
  const both = await main({ httpMethod: "POST", headers: {}, body: JSON.stringify({ outTradeNo: "A1", tradeNo: "B2" }) });
  assert.strictEqual(both.statusCode, 400);
});

}

run().then(() => {
  console.log(`\n${passed} checks passed`);
}).catch((err) => {
  console.error("FAIL", err && err.message);
  process.exit(1);
});