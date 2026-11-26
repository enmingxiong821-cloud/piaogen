# piaogen-mcp · 公网只读 MCP 端点

这是 `v0/mcp/server.js` 的公网只读镜像，部署在 CloudBase HTTP 云函数上。

- 传输：HTTP + JSON-RPC 2.0（`initialize` / `tools/list` / `tools/call`）
- 工具：与本地 MCP 同名的 7 个只读工具（`rights.*`、`finance.*`、`policy.parse`）
- 写操作：`rights.record`、`finance.record` 一律返回 `public_read_only`
- 数据：内置示例案卷，不含真实用户数据
- 不读文件、不访问数据库、不发外部请求
- 可选鉴权：设置环境变量 `MCP_READ_TOKEN` 后，请求需带 `Authorization: Bearer <token>` 或 `X-MCP-Token`
- 限流：每 IP 每分钟 60 次；请求体上限 64KB
- CORS：只放行票根的 GitHub Pages、CloudBase 域名与本地 `127.0.0.1:8765`

## 端点

| 方法 | 路径 | 作用 |
|---|---|---|
| GET | `/piaogen-mcp` | 机器可读清单（名称、版本、7 工具、边界） |
| GET | `/piaogen-mcp/health` | 健康检查 |
| GET | `/piaogen-mcp/manifest.json` | 同上，标准清单 |
| POST | `/piaogen-mcp` | JSON-RPC 2.0 |

## 部署

```powershell
cd C:\Users\Caspian6610\Desktop\竞赛\支付宝智能体涌现\v0
tcb fn deploy piaogen-mcp -e xiongxiongkaifa-d4flmaia4021b1d1 --dir ./cloudfunctions/piaogen-mcp --httpFn --path /piaogen-mcp --runtime Nodejs20.19 --force
```

可选：设置只读令牌（不设则公开只读）。

```powershell
tcb fn config update piaogen-mcp -e xiongxiongkaifa-d4flmaia4021b1d1 --envVariables MCP_READ_TOKEN=<随机长串>
```

## 调用

```powershell
curl -s -X POST "https://<env>.service.tcloudbase.com/piaogen-mcp" -H "Content-Type: application/json" -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

```powershell
curl -s "https://<env>.service.tcloudbase.com/piaogen-mcp/health"
```

## 离线自检

```powershell
cd cloudfunctions/piaogen-mcp
node selftest.js
```

覆盖：清单、健康检查、CORS 放行/拒绝、initialize、tools/list、保单字段裁剪（不含证件号/手机号）、写操作拒绝、未知工具、坏 JSON、超大请求、可选令牌、限流。

## 边界

公网端点只证明协议可被调用，不代表已接入支付宝官方 MCP 或阿宝；也不托管用户数据。接入阿宝需要企业开发者/代开发服务商资质与邀测，见 `v0/接入清单_支付宝.md`。