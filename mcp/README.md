# 票根 MCP server

版本 `piaogen-rights-finance 0.4.3`，零依赖 stdio，7 个工具。用于证明票根不仅能被人类点开，也能被外部 Agent 调用。机器可读清单见 [`manifest.json`](manifest.json)，公开说明页见 [`../agent-api.html`](../agent-api.html)。

## 启动

```bash
node server.js
```

客户端配置：

```json
{
  "mcpServers": {
    "piaogen": {
      "command": "node",
      "args": ["<解压目录>/v0/mcp/server.js"]
    }
  }
}
```

## 本地 HTTP 桥（可选）

除 stdio 外还提供一个零依赖的 JSON-RPC over HTTP 入口，方便用 curl / 浏览器工具调：

```bash
node http-server.js          # 默认 127.0.0.1:8787
curl -s http://127.0.0.1:8787/health
curl -s http://127.0.0.1:8787/mcp \
  -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

- 端口用 `MCP_HTTP_PORT` 覆盖；默认只绑 `127.0.0.1`，不对外。
- 支持单条与批量 JSON-RPC；`notifications/*` 返回 202。
- 这是普通 JSON-RPC POST，**不是** MCP 官方 Streamable HTTP（无 SSE、无会话 ID），
  也不代表已有公网托管地址；公网 MCP 仍是后续路线。

## 写入落盘

`rights.record` / `finance.record` 默认写入 `server.js` 同目录的 `records.local.json`，
重启后自动回放动作与状态；只存状态、金额、备注和时间，不存票据原文、证件号、手机号。

- 写入用「临时文件 + rename」原子替换；写到一半中断不会留下截断的 JSON。
- 启动时若文件损坏，会备份为 `records.local.json.corrupt-<时间戳>`，从空记录开始，并在返回的 `store.warning` 里说明。
- 最多保留 5000 条，超出丢弃最旧记录，返回 `store.truncated: true`，不静默丢。
- 测试时设 `PG_MCP_STORE=off` 关闭落盘（`mcp_smoke.py` / `mcp_http_smoke.py` 已默认关闭）。
- 也可用 `PG_MCP_STORE=<路径>` 指定文件。
- 文件不可写时自动退回内存模式，返回 `persisted: false`。

## 确认门

`rights.record` 写 `refunded` / `repaired` / `promise`、`finance.record` 写 `resolved` 时，**必须**同时传 `confirmed: true`；否则返回 `isError`，不写状态、不累加金额。口径是「用户确认到账 / 已解决」，不是「已受理」「商家口头答应」。

## 工具

| 工具 | 作用 | 写操作 |
|---|---|---|
| `rights.lookup` | 按商品 / 问题查消费权利窗口 | 否 |
| `rights.plan` | 生成消费权利办理路径 | 否 |
| `rights.record` | 写入示例案卷 | 落盘 `records.local.json` |
| `finance.lookup` | 按资金问题查六类售后规则 | 否 |
| `finance.plan` | 生成资金售后路径与材料 | 否 |
| `finance.record` | 写入示例资金案卷 | 落盘 `records.local.json` |
| `policy.parse` | 从保单 / 合同文字只提取机构、金额、期限与签单日期；不返回证件号、手机号或原文 | 否（无存储） |

## 验证

1. 在 `v0/` 下运行 `python mcp_smoke.py`（stdio，期望 `13/13`）、`python mcp_store_smoke.py`（落盘与重启回放，期望 `9/9`）与 `python mcp_http_smoke.py`（HTTP 桥，期望 `6/6`）。
2. 运行 `npx @modelcontextprotocol/inspector@latest`。
3. Transport 选 `STDIO`，Command 填 `node`，Args 填 `<解压目录>/v0/mcp/server.js`。
4. `tools/list` 应出现上述 7 个工具。
5. 调 `rights.lookup`，`query="空气炸锅"`，应返回价保 / 退货 / 保修窗口。

## 典型意图 → 工具

| 用户一句话 | 调用 | 返回 |
|---|---|---|
| “这单空气炸锅还能退吗？” | `rights.lookup {"query":"空气炸锅"}` | 退货/价保/保修窗口与缺的证据 |
| “我妈的会员自动续费能退吗？” | `finance.lookup {"query":"自动续费"}` | 关闭代扣、提醒义务、可主张部分 |
| “帮我把退款案卷推进下一步” | `finance.plan {"caseId":"FM-20261121-0001"}` | 证据门、官方路径、话术、禁止事项 |
| “把这个结果记下来” | `finance.record {"caseId":"…","status":"waiting","note":"银行受理"}` | 写入本地示例案卷并落盘；不代提交 |
| “这张保单只帮我提机构、钱和天数” | `policy.parse {"text":"…OCR 文字…"}` | 机构、金额、犹豫期/期限、签单日；不含证件与原文 |

跨宿主验证：MCP Inspector（STDIO）→ `tools/list` 7 个 → 调 `rights.lookup` 返回窗口；Claude Desktop / Cursor 用上面的配置各跑一次。本地 HTTP 桥可独立跑通 `initialize → tools/list → tools/call`；官方 Streamable HTTP 与公网托管是后续路线，**当前未部署**，不要写成“已接入阿宝”。

## 数据与边界

- 读取 `case-demo.json` / `finance-demo.json`，是**演示数据**，不是线上实时用户数据。
- `record` 只写本地示例案卷与 `records.local.json`，不写用户浏览器的 localStorage，不联网。
- 不代提交、不代收款、不托管资金。
- 不提供 shell、文件系统、浏览器、支付或任意 HTTP 能力。
- 不承诺“保证退回 / 保证拒付成功”；金额、日期、条款以原文和机构告知为准。

## 与赛事“可被调用”

- 公开 URL：给人点开、交互、看回执。
- MCP server：给外部 Agent 调用，验证 `initialize → tools/list → tools/call`。
- 这是“可被调用”的最低可验证形态；**不是“已接入阿宝”**，阿宝 Skill 属于赛后邀约 / 企业主体通道。