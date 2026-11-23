#!/usr/bin/env node
"use strict";

// 本地 JSON-RPC over HTTP 桥，复用 server.js 的七个工具。
// 只绑 127.0.0.1、只读示例数据、不代提交、不代收款；公网未托管。

const http = require("http");
const { dispatch, TOOLS } = require("./server.js");

const HOST = process.env.MCP_HTTP_HOST || "127.0.0.1";
const PORT = Number(process.env.MCP_HTTP_PORT || 8787);
const MAX_BODY = 256 * 1024;

function cors(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "content-type, mcp-session-id");
  res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
}

function json(res, status, payload) {
  cors(res);
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function handleMessage(message) {
  if (!message || typeof message !== "object") {
    return { jsonrpc: "2.0", id: null, error: { code: -32600, message: "Invalid Request" } };
  }
  try {
    return dispatch(message);
  } catch (error) {
    return {
      jsonrpc: "2.0",
      id: message.id === undefined ? null : message.id,
      error: { code: -32603, message: String(error && error.message ? error.message : error) }
    };
  }
}

const server = http.createServer((req, res) => {
  if (req.method === "OPTIONS") {
    cors(res);
    res.writeHead(204);
    return res.end();
  }

  if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
    return json(res, 200, {
      ok: true,
      name: "piaogen-rights-finance",
      version: "0.4.0",
      transport: "json-rpc-over-http (local only)",
      tools: TOOLS.map((tool) => tool.name)
    });
  }

  if (req.method !== "POST" || !req.url.startsWith("/mcp")) {
    return json(res, 404, { error: "POST /mcp" });
  }

  let size = 0;
  const chunks = [];
  req.on("data", (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) {
      json(res, 413, { error: "payload too large" });
      return req.destroy();
    }
    chunks.push(chunk);
  });
  req.on("end", () => {
    let body;
    try {
      body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "null");
    } catch (error) {
      return json(res, 200, { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
    }
    if (Array.isArray(body)) {
      const replies = body.map(handleMessage).filter(Boolean);
      return json(res, 200, replies);
    }
    const payload = handleMessage(body);
    if (!payload) {
      cors(res);
      res.writeHead(202);
      return res.end();
    }
    return json(res, 200, payload);
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`piaogen MCP HTTP bridge · http://${HOST}:${PORT}/mcp · 只读示例数据\n`);
});