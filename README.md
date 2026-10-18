# link-cleaner-for-cloudflare-worker

**简体中文** | [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange.svg)](https://workers.cloudflare.com/)
[![Tests](https://img.shields.io/badge/tests-78%20passing-brightgreen.svg)](test/)
[![Build](https://img.shields.io/badge/build-none-lightgrey.svg)](#单文件约束)

把带追踪参数的分享链接清洗成干净链接的 Cloudflare Worker。粘贴一段分享文本，拿回同样的文本——
标题、文案原样保留，只有里面的链接被换成去掉了追踪参数、短链已展开的干净地址。

它是 [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)（Java 桌面剪贴板版）的
JavaScript / Worker 移植，行为上做了两处有意偏离，见[与上游的差异](#与上游的差异)。

---

## 目录

- [功能特性](#功能特性)
- [快速开始](#快速开始)
- [接口契约](#接口契约)
- [支持的站点](#支持的站点)
- [工作原理](#工作原理)
- [测试](#测试)
- [项目结构](#项目结构)
- [单文件约束](#单文件约束)
- [已知限制与取舍](#已知限制与取舍)
- [与上游的差异](#与上游的差异)
- [路线图](#路线图)
- [贡献](#贡献)
- [许可与致谢](#许可与致谢)

---

## 功能特性

- **整段文本处理**：一次请求处理文本里的所有链接，标题与文案一个字符都不动。
- **短链展开**：`b23.tv`、`m.tb.cn`、`v.douyin.com`、`xhslink.com` 会解析成最终地址。
- **参数策略分两层**：已登记站点用「必须保留」的白名单，其它站点用「已知追踪键」的黑名单。
- **保留业务参数**：`?p=`（分P）、`?t=`（起播秒数）、`?id=`、`?goods_id=`、`?xsec_token=` 不会被删。
- **不会造死链**：宁可漏删追踪参数，也不删不认识的 query 键。
- **明确的 HTTP 语义**：`200 / 400 / 405 / 500`，带 `content-type`、CORS、`no-store`。
- **抗放大**：单次请求最多解析 20 条链接、并发 5、单条 8 秒超时（CF 免费档每请求 50 子请求）。
- **零依赖、单文件**：没有 `import`、没有构建步骤，`index.js` 可直接粘进 Cloudflare 在线编辑器。

## 快速开始

### 部署到 Cloudflare

```bash
git clone https://github.com/pachi-qwq/link-cleaner-for-cloudflare-worker.git
cd link-cleaner-for-cloudflare-worker
npm install
npx wrangler login
npm run deploy
```

部署完会得到一个 `https://link-cleaner.<你的子域>.workers.dev`。用法：

```
https://link-cleaner.<你的子域>.workers.dev/?target=<分享文本>
```

> `target` 建议做百分号编码。也支持原始未编码文本（此时 `?target=` 之后的整段内容都算 target）。

**不想用 wrangler**：`index.js` 是完整可运行的 Worker 模块，直接整段粘贴到 Cloudflare Dashboard
的在线编辑器里，保存即生效（`wrangler.toml` 只是给本地工具用的）。

### 本地开发

```bash
npm install          # 只装 wrangler（devDependency）
npm run dev          # http://localhost:8787/?target=...
npm test             # 28 条用例（Node 内置 test runner，零依赖）
npm run check        # 只做打包校验，不部署
```

要求 Node ≥ 18（本机在 v24.16.0 上验证）。

## 接口契约

### 请求

```http
GET /?target=<分享文本>
```

| 参数 | 位置 | 必需 | 说明 |
|---|---|---|---|
| `target` | query | 是 | 待清洗的整段分享文本。建议 `encodeURIComponent` 编码；未编码也接受 |

方法：`GET` / `HEAD` 正常处理，`OPTIONS` 返回 204 预检，其它方法 405。

### 响应

| 情况 | 状态码 | 响应头 | body |
|---|---|---|---|
| 正常 | `200` | `content-type: text/plain; charset=utf-8`<br>`cache-control: no-store`<br>`access-control-allow-origin: *` | 清洗后的文本 |
| 缺 `?target=` | `400` | 同上 | `缺少 target 参数。用法：/?target=<分享文本>` |
| 非 GET/HEAD/OPTIONS | `405` | 同上 + `allow: GET, HEAD, OPTIONS` | `只支持 GET` |
| 未捕获异常 | `500` | 同上 | `内部错误` |
| `OPTIONS` | `204` | 同上 | 空 |

设计上刻意不做 JSON、不做缓存：这是一个"贴进聊天框"的文本服务，`no-store` 是因为短链解析结果
随时会变（见[已知限制](#已知限制与取舍)）。

### 示例

```bash
# 编码用法（推荐）
curl -G --data-urlencode "target=【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq?share_source=copy_web&vd_source=f3e3" \
  "https://link-cleaner.<你的子域>.workers.dev/"
# → 【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq

# 原始文本（老用法，内部的 & 不会被截断）
curl "https://link-cleaner.<你的子域>.workers.dev/?target=https://item.jd.com/1.html?utm_source=a&ad_od=b"
# → https://item.jd.com/1.html
```

## 支持的站点

域名匹配规则是「相等或点边界后缀」：`www.` / `item.` / `m.` / `v.` / `e.` 都能命中，
`evil-bilibili.com` 不会。

| 站点 | 匹配域名 | 处理方式 |
|---|---|---|
| 哔哩哔哩 | `bilibili.com`、`b23.tv` | 短链解析为 `/video/BV…`；query 只保留 `p`、`t` |
| 拼多多 | `yangkeduo.com` | query 只保留 `goods_id` |
| 淘宝 / 天猫 | `taobao.com`、`tmall.com` | query 只保留 `id` |
| 淘宝短链 | `tb.cn`（含 `m.`、`e.`） | 解析为商品页后只保留 `id`；解析不到时回退读落地页里的 `var url='…'` |
| 京东 | `jd.com` | `jd.com` / `item.jd.com` / `item.m.jd.com` 删掉全部 query；其它子域（`search.`、`list.`）只删追踪键 |
| 抖音 | `douyin.com`、`iesdouyin.com` | 解析为 `www.douyin.com/video/<id>` |
| 小红书 | `xiaohongshu.com`、`xhslink.com` | 短链解析为笔记页；query **只保留** `xsec_token`（缺它微信里打不开） |
| 其它站点 | 任意 | 删掉已知追踪键，其余全部保留 |

### 通用层删掉的追踪键

前缀：`utm_`、`share_`、`_wv`

精确键：`spm`、`scm`、`vd_source`、`from_source`、`refer`、`unique_k`、`bbk`、`refer_share_id`、
`refer_share_channel`、`refer_share_uin`、`share_uin`、`share_plat`、`share_session_id`、
`share_tag`、`share_medium`、`share_source`、`share_from_user_hidden`、`page_from`、
`pxq_secret_key`、`isappinstalled`、`_x_org`、`xsec_source`、`xsec_source_type`、`scene`、
`srcid`、`timestamp`、`t`

## 工作原理

### 处理流水线

```
请求  GET /?target=<文本>
  │
  ├─ readTarget()      取 ?target= 之后到 URL 末尾的全部内容（不截断 & 和 #）
  ├─ safeDecode()      容错解码一次；坏百分号原样放过（"50% off" 不会 500）
  ├─ parseUrls()       用 /(https?:\/\/[^\s]+)/gi 切出所有链接
  ├─ mapLimit(5)       有界并发处理前 20 条；超出的原样返回
  │    └─ cleanOne()
  │         ├─ hostOf() → matchRule()  点边界后缀匹配
  │         ├─ 命中规则 → 站点 handler（可能 probeFinalUrl 展开短链）
  │         └─ 未命中   → stripTracking() 只删追踪键
  └─ 文本整体替换       按出现顺序把清洗结果填回原文
响应 text/plain
```

### 参数策略：白名单 vs 黑名单

| | 已登记站点 | 其它站点 |
|---|---|---|
| 策略 | 白名单：`KEEP_PARAMS` 里列出的键才留 | 黑名单：`TRACKING_*` 里列出的才删 |
| 理由 | 这些站点的业务参数已知（`id`、`goods_id`、`xsec_token`…），其余必是追踪 | 业务参数未知，宁可漏删不能误删 |
| 风险 | 站点新增业务参数需更新 `KEEP_PARAMS` | 漏删一些不认识的追踪参数 |

上游 Java 版对未知站点是「砍掉 `?` 之后全部」，那会把 `youtube.com/watch?v=xxx`、
`bing.com/search?q=xxx` 变成死链，因此这里不采用。

### 运行时注意事项

这些是移植过程中踩到的 Cloudflare Workers 语义，写在这里免得下一个人重踩：

1. **跟随重定向后拿不到 `Location` 头**。Worker 内新建的 `fetch()` 默认 `redirect: 'follow'`，
   跟随之后响应头里没有 `Location`，最终地址只能读 `response.url`。（入参 `Request` 才是
   `manual`，两个方向别混。）Java 版用 hutool 的 `HttpRequest.head()`（不跟随）靠 `Location`
   取值，直译过来就恒为 null——原实现会把小红书短链清成一个空格。
2. **`fetch(url, {timeout})` 的 `timeout` 是无效键**，会被静默丢弃。取消要用
   `AbortSignal.timeout(ms)`。
3. **子请求有配额**：免费档每请求 50、付费 1000。`Promise.all(urls.map(fetch))` 对着用户文本
   就是无界扇出，因此 `FETCH_LIMITS` 把单次解析限到 20 条、并发 5。
4. **handler 内未捕获异常 → CF 1101 错误页**，不是体面的 500。入口整体 `try/catch`，
   单条链接失败只降级这一条。
5. **`HEAD` 不是处处支持**：部分 CDN 返回 403/405，所以 `probeFinalUrl` 会降级 `GET`。

## 测试

```bash
npm test               # 78 条（纯函数单测 46 + 入口集成 32）
npm run test:unit      # 只跑纯函数单测
npm run test:integration
npm run test:coverage  # Node 内置覆盖率（当前 index.js 行 91% / 分支 86% / 函数 100%）
npm run check          # wrangler 打包校验
```

测试全部走真实入参契约（`new Request(...)`），用桩 `fetch` 模拟 Worker 的重定向语义
（`.url` 有值、`Location` 为 null），因此**不需要网络**。

两层结构：

| 层 | 位置 | 测什么 | 数量 |
|---|---|---|---|
| 单测 | `test/unit/` | 纯函数边界：`parseUrls` / `stripQuery` / `stripTracking` / `keepForHost` / `readTarget` / `safeDecode` / `mapLimit` / `matchRule` / `cleanOne` | 46 |
| 集成 | `test/integration/` | 走 `new Request(...)` 的完整契约：路由命中、短链展开（含 `HEAD→GET` 降级）、失败降级、并发与条数上限、编码/解码/错误码/响应头 | 32 |

为此 `index.js` 末尾有一组**命名导出**（`export { parseUrls, … }`），只给测试用；Worker 只认
`export default`，命名导出不影响部署产物。纯函数能单测，同时不违反单文件约束。

覆盖率不设硬阈值，只做趋势观察。当前 `index.js`：行 91.3%、分支 85.8%、函数 100%。
已知无法覆盖的分支：`probeFinalUrl` 的真实网络失败、`taobaoCnUri` 的落地页兜底、入口的 500 兜底。

## 项目结构

```
.
├── index.js            # 唯一源码 + 唯一部署产物（325 行，5 个分节）
├── test/
│   ├── unit/           # 纯函数单测（46 条）
│   └── integration/    # 入口集成测试（32 条）
├── test-support/       # 测试公共件与真实分享文本样例（不是测试文件）
├── package.json        # 只依赖 wrangler（devDependency）
├── wrangler.toml       # main = index.js，只打包不转换
├── README.md           # 本文（简体中文）
├── README.en.md        # English
├── CHANGELOG.md
├── CONTRIBUTING.md
└── LICENSE             # MIT
```

## 单文件约束

`index.js` 是唯一源码，也是唯一部署产物：**不 import、不拆模块、不走构建步骤**。
文件内部只用 5 个分节注释分区：

```
1. CONFIG   常量、站点规则表、限额
2. UTILS    纯函数工具
3. HANDLERS 单站点处理
4. ROUTER   host → handler
5. ENTRY    export default { fetch }
```

这是刻意的取舍：宁可让文件长一点，也不要为了"分层"引入打包步骤——它需要能在 Cloudflare
在线编辑器里整段粘贴就能跑。`package.json` / `wrangler.toml` / `test/` 都是开发期资产，
不进部署产物（打包体积 9.2 KiB / gzip 3.1 KiB）。

## 已知限制与取舍

- **只处理 http/https**，且 URL 里不能有空格（分享文本用空格分隔链接，这是有意的）。
- **`t` 在黑名单里**：极少数站点把 `t` 当业务参数，会被误删（B站已通过白名单豁免）。
- **不认识的短链不展开**：只有登记过的域名会发子请求。
- **抖音只支持视频**：图集、直播分享链接解析不出 video id 时原样返回。
- **解析失败一律降级为原文**：宁可给你一条带尾巴的链接，也不删掉链接。这是刻意的。
- **不做缓存**：`no-store`，每次实时解析。个人自用流量下引入 KV 的运维成本不划算。
- **B站短链结果可能带尾斜杠**：那是 `b23.tv` 302 的最终地址形态，能正常打开，未做路径归一。

## 与上游的差异

| 方面 | 上游 [link-cleaner](https://github.com/hellodk34/link-cleaner)（Java） | 本项目 |
|---|---|---|
| 形态 | 桌面 jar，读写系统剪贴板 | Cloudflare Worker，HTTP 接口 |
| 未知站点 | 砍掉 `?` 之后全部 | 只删已知追踪键（避免造死链） |
| 淘宝 `id` 丢失 | v1.1.2 用 `split[0].contains("id=")` 打补丁 | `URLSearchParams` + 白名单，根治 |
| 小红书 `xsec_token` | v1.1.1 起保留 | 保留（web 链接与短链两条路径） |
| 京东搜索页 | 同样会被清成裸路径 | 已按 host 区分，搜索页保留 `keyword` |
| 系统集成 | `xclip` / AWT 剪贴板 | 无，纯 HTTP |

上游两条被借鉴的改动：`ddb8d86`（小红书 `xsec_token`）、`51fe8bc`（通用去参与淘宝 `id` 修复）。

## 路线图

- [x] 站点级参数白名单与通用追踪键黑名单
- [x] 短链展开（`resp.url` + `HEAD→GET` 降级）、超时、并发上限
- [x] HTTP 错误码与响应头
- [x] 纯函数单测 + 集成测试双层（命名导出 + `test-support/`）
- [ ] 可选：接 [ClearURLs Rules](https://github.com/ClearURLs/Rules) 的规则表（4 万条）
- [ ] 可选：`/clean?url=` 单链接 JSON 接口（给脚本用）

## 贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。简要规则：

- `index.js` 保持单文件，不加 `import`、不拆文件、不加构建步骤。
- 新增站点 = 一行 `SITE_RULES` + 一个 handler + 用例 + README 表格。
- 提交信息用中文 + conventional 前缀（`fix:` / `feat:` / `docs:` / `test:` / `chore:`）。
- 改行为必须带用例；不改行为的地方不要顺手重构。

## 许可与致谢

[MIT](LICENSE) © 2026 pachi-qwq

衍生自 [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)
（Copyright (c) 2022 hellodk34, MIT）。感谢原作者对分享链接隐私问题的整理与分析。
