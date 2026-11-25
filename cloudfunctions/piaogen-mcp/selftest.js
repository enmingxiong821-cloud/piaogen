"use strict";

/* 公网只读 MCP 离线自检：不联网、不部署。node selftest.js */
const assert = require("assert");
const fn = require("./index.js");
const main = fn.main;
const T = fn._test;

let passed = 0;
async function check(name, fnc) {
  try { await fnc(); passed += 1; console.log("PASS", name); }
  catch (e) { console.error("FAIL", name, e.message); process.exitCode = 1; }
}
function call(event) { return main(event); }
function body(res) { return JSON.parse(res.body); }

(async () => {
  T.hits.clear();

  await check("GET manifest", async () => {
    const r = await call({ httpMethod: "GET", path: "/piaogen-mcp" });
    assert.strictEqual(r.statusCode, 200);
    const j = body(r);
    assert.strictEqual(j.mode, "read-only");
    assert.strictEqual(j.tools.length, 7);
  });

  await check("GET health", async () => {
    const r = await call({ httpMethod: "GET", path: "/piaogen-mcp/health" });
    assert.strictEqual(r.statusCode, 200);
    assert.strictEqual(body(r).ok, true);
  });

  await check("CORS allows github pages", async () => {
    const r = await call({ httpMethod: "OPTIONS", path: "/piaogen-mcp", headers: { origin: "https://enmingxiong821-cloud.github.io" } });
    assert.strictEqual(r.statusCode, 204);
    assert.strictEqual(r.headers["Access-Control-Allow-Origin"], "https://enmingxiong821-cloud.github.io");
  });

  await check("CORS rejects unknown origin", async () => {
    const r = await call({ httpMethod: "OPTIONS", path: "/piaogen-mcp", headers: { origin: "https://evil.example" } });
    assert.strictEqual(r.headers["Access-Control-Allow-Origin"], undefined);
  });

  await check("initialize", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }) });
    const j = body(r);
    assert.strictEqual(j.result.serverInfo.name, "piaogen-rights");
    assert.ok(j.result.capabilities.tools);
  });

  await check("tools/list 7 read-only", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }) });
    const tools = body(r).result.tools;
    assert.strictEqual(tools.length, 7);
    assert.ok(tools.every((t) => !/\.record$/.test(t.name) || /只读/.test(t.description)));
  });

  await check("policy.parse drops PII", async () => {
    const text = "某某保险股份有限公司 保单 人民币 1,280.00 元 期限 3 年 签单日期 2026-11-20 身份证 110101199001011234 手机 13800138000";
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "policy.parse", arguments: { text } } }) });
    const out = body(r).result.content[0].text;
    assert.ok(out.includes("1280"));
    assert.ok(!out.includes("110101199001011234"));
    assert.ok(!out.includes("13800138000"));
  });

  await check("write is refused", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "rights.record", arguments: { confirmed: true } } }) });
    assert.strictEqual(body(r).result.isError, true);
    assert.ok(body(r).result.content[0].text.includes("public_read_only"));
  });

  await check("unknown tool", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "shell.exec" } }) });
    assert.strictEqual(body(r).error.code, -32602);
  });

  await check("bad json", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: "{" });
    assert.strictEqual(r.statusCode, 400);
  });

  await check("payload too large", async () => {
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: "x".repeat(70 * 1024) });
    assert.strictEqual(r.statusCode, 413);
  });

  await check("token optional by default", async () => {
    delete process.env.MCP_READ_TOKEN;
    assert.strictEqual(T.authorized({ headers: {} }), true);
  });

  await check("token enforced when set", async () => {
    process.env.MCP_READ_TOKEN = "test-token";
    assert.strictEqual(T.authorized({ headers: {} }), false);
    assert.strictEqual(T.authorized({ headers: { authorization: "Bearer test-token" } }), true);
    assert.strictEqual(T.authorized({ headers: { "x-mcp-token": "test-token" } }), true);
    const r = await call({ httpMethod: "POST", path: "/piaogen-mcp", body: JSON.stringify({ jsonrpc: "2.0", id: 6, method: "tools/list" }), headers: {} });
    assert.strictEqual(r.statusCode, 401);
    delete process.env.MCP_READ_TOKEN;
  });

  await check("rate limit", async () => {
    T.hits.clear();
    const ev = { httpMethod: "POST", path: "/piaogen-mcp", headers: { "x-forwarded-for": "1.2.3.4" }, body: JSON.stringify({ jsonrpc: "2.0", id: 7, method: "ping" }) };
    let last = null;
    for (let i = 0; i < 61; i += 1) last = await call(ev);
    assert.strictEqual(last.statusCode, 429);
  });

  console.log(`\nSUMMARY: ${passed}/14 passed`);
})();