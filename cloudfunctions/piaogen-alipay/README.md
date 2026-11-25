# piaogen-alipay · 支付宝只读交易查询适配层

状态：**代码完成，未部署，未用真实凭据跑通。** 没有 AppID、应用私钥、支付宝公钥，就不接。

它只做一件事：商户用**自己的**凭据调 `alipay.trade.query`，把结果裁剪成票根需要的字段，交给前端生成“支付后案卷”。不退款、不转账、不关单、不代扣、不落库、不写日志。

## 接口

```
POST /
Content-Type: application/json

{"outTradeNo": "PG202611250001"}
或
{"tradeNo": "2026112522001..."}
```

成功：

```json
{
  "ok": true,
  "verified": true,
  "source": "alipay.trade.query",
  "trade": {
    "trade_no": "2026...",
    "out_trade_no": "PG202611250001",
    "trade_status": "TRADE_SUCCESS",
    "total_amount": "39.90",
    "receipt_amount": "39.90",
    "refund_fee": "0.00",
    "subject": "抽纸 3 层 100 抽",
    "send_pay_date": "2026-11-25 10:12:03",
    "buyer_logon_id_masked": "ab****om"
  }
}
```

失败一律 `ok:false`，并带 `error`：

| HTTP | error | 含义 |
|---:|---|---|
| 400 | bad_json / missing_order / bad_order / ambiguous_order | 请求不合法 |
| 405 | method_not_allowed | 只接受 POST |
| 429 | rate_limited | 单 IP 每分钟超过上限 |
| 502 | gateway_unreachable / bad_response / sign_mismatch | 网关异常或验签失败，不采用结果 |
| 503 | not_configured | 缺少环境变量 |

支付宝业务错误（如 `ACQ.TRADE_NOT_EXIST`）返回 HTTP 200 + `ok:false` + `alipay:{code,msg,sub_code,sub_msg}`。

## 环境变量

| 变量 | 必填 | 说明 |
|---|---|---|
| `ALIPAY_APP_ID` | 是 | 应用 AppID |
| `ALIPAY_PRIVATE_KEY` | 是 | 应用私钥（PKCS#8；可去头尾与换行） |
| `ALIPAY_PUBLIC_KEY` | 是 | **支付宝公钥**，不是应用公钥 |
| `ALIPAY_GATEWAY` | 否 | 默认 `https://openapi.alipay.com/gateway.do`；沙箱另行指定 |
| `ALLOWED_ORIGIN` | 否 | 允许的网页来源，逗号分隔；不设则不返回 CORS 头，只供服务端调用 |
| `ALIPAY_MAX_PER_MIN` | 否 | 单 IP 每分钟上限，默认 30 |

## 部署（CloudBase）

1. 在云开发控制台新建 **HTTP 访问服务** 的 Node.js 函数，上传本目录。
2. 在函数配置里填环境变量；密钥只放环境变量，不进代码仓库。
3. 绑定自定义域名或使用默认域名；把该地址填进 `v0/alipay.html` 的“适配层地址”。
4. 用一笔**自己商户号下**的真实订单号调一次，确认 `verified:true` 且金额一致。

## 边界

- 只允许 `alipay.trade.query` 一个方法，参数只接受订单号。
- 响应必须验签通过才返回；验签失败按 502 处理。
- 买家账号只回脱敏值；不返回 `buyer_user_id`、`fund_bill_list`、`voucher_detail_list`。
- 不记录请求体与响应体；只保留函数自身的运行日志。
- 订单号只允许 `[A-Za-z0-9_-]{1,64}`，避免把任意字符串拼进请求。
- 费率与配额由支付宝开放平台账户决定，本项目不做代扣与资金托管。

## 自检

```powershell
cd v0\cloudfunctions\piaogen-alipay
node selftest.js
```

10 项：密钥头补全、参数排序、签名/验签、篡改拒绝、响应节点截取、字段裁剪、错误裁剪、缺凭据、方法与订单号校验。全部离线，不联网。