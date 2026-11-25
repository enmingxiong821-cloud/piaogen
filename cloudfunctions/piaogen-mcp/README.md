# piaogen-mcp · 公网只读 MCP 端点

这是 `v0/mcp/server.js` 的公网只读镜像，部署在 CloudBase HTTP 云函数上。

- 传输：HTTP + JSON-RPC 2.0（`initialize` / `tools/list` / `tools/call`）
- 工具：与本地 MCP 同名的 7 个只读工具
- 写操作：`rights.record`、`finance.record` 一律返回 `public_read_only`
- 数据：内置示例案卷，不含真实用户数据
- 不读文件、不读环境变量、不访问数据库、不发外部请求

## 部署

```powershell
cd C:\Users\Caspian6610\Desktop\竞赛\支付宝智能体涌现\v0
tcb fn deploy piaogen-mcp -e xiongxiongkaifa-d4flmaia4021b1d1 --dir ./cloudfunctions/piaogen-mcp --httpFn --path /piaogen-mcp --runtime Nodejs20.19 --force
```

## 调用

```powershell
curl -s -X POST "https://<env>.service.tcloudbase.com/piaogen-mcp" -H "Content-Type: application/json" -d '{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"tools/list\"}'
```

## 边界

公网端点只证明协议可被调用，不代表已接入支付宝官方 MCP 或阿宝；也不托管用户数据。