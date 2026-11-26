# 票根 · 消费权利计算 Skill

一个可以整包交给任意智能体平台的技能包：给它一张票，它算清每项权利哪天关、还缺什么、该找谁。

## 装什么

```
skill/
├── SKILL.md            入口说明（平台读这个）
├── skill.json          机器可读的能力声明
├── README.md           本文件
└── mcp/
    ├── rights-engine.js    纯函数计算核心，零依赖
    ├── rights-data.json    规则数据（三包 18 类、渠道、目录别名）
    └── openapi.json        REST 契约
```

## 三种接入

**1. 远程 MCP（最省事）**

```
https://xiongxiongkaifa-d4flmaia4021b1d1-1506832756.ap-shanghai.app.tcloudbase.com/piaogen-mcp
```

只读，无需登录，每 IP 每分钟 60 次。`initialize` → `tools/list` → `tools/call`。

**2. 远程 REST（不会说 MCP 也行）**

```bash
curl -X POST https://.../piaogen-mcp/rights \
  -H 'Content-Type: application/json' \
  -d '{"product":"空调","date":"2026-11-20","today":"2026-11-26"}'
```

**3. 本地（数据不出本机）**

```bash
node mcp/server.js        # stdio
node mcp/http-server.js   # 127.0.0.1:8787
```

## 算的是什么

| 权利 | 起算 | 依据 |
|---|---|---|
| 线上 7 天无理由 | 签收日 | 消保法第 25 条 |
| 三包退货 7 天 | 发票日 | 三包规定（18 类目录） |
| 三包换货 15 天 | 发票日 | 三包规定 |
| 三包修理 | 发票日 | 三包规定 |
| 整机 / 主要部件保修 | 发票日 | 三包规定 + 品牌承诺 |
| 价保 | 订单页标识 | 平台承诺（**不是法定权利**） |

不在 18 类目录里的商品，票根明说「无法定三包，按品牌承诺」，不硬套天数。

## 不做什么

- 不代提交、不代收款、不托管资金
- 不索取完整卡号、CVV、验证码、网银密码
- 不承诺「保证退回」「保证拒付成功」
- 没有公开依据的天数不倒计时

## 验证

```bash
node cloudfunctions/piaogen-mcp/selftest.js   # 21 项
node mcp/store-test.js                        # 本地 stdio
```
