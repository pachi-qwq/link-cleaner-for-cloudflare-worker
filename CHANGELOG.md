# 更新日志

本项目遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/) 与
[语义化版本](https://semver.org/lang/zh-CN/)。

## [Unreleased]

### 计划中

- 纯函数单测 + 入口集成测试双层拆分（计划 007）。

## [0.2.0] - 2026-10-18

### 修复

- **子域路由失效**：路由表原来是 `Map` 精确匹配完整 hostname，而真实分享链接几乎都在
  `www.` / `item.` / `m.` / `v.` 子域上，导致除 `b23.tv` 与 `mobile.yangkeduo.com` 外的
  站点处理器从未被触发。改为「相等或点边界后缀」匹配。
- **京东链接 500**：`jdUri` 引用了不存在的变量 `uri`，任何 `jd.com` 链接都会抛
  `ReferenceError`，整个请求变成 CF 1101。已修正，并让单条链接失败只降级自己。
- **短链被清成空格**：小红书/抖音处理器读 `headers.get('Location')`，而 Worker 内跟随重定向后
  该头恒为 `null`，`removeParams(null)` 返回空串，链接被替换成一个空格。改用 `response.url`。
- **淘宝短链产生半截链接**：`taobaoCnUri` 用 `indexOf(" ")` 取 URL，而上游已按空白切分过，
  恒为 `-1`，于是 `fetch("")` 并把 `item.taobao.com/item.htm?` 拼进正文。
- **必需参数被丢弃**：`split('&')` + `startsWith('id')` 的位置敏感解析，使 `id` / `goods_id`
  不在第一个 query 段时就丢失，并留下悬空 `?`。改用 `URLSearchParams` + 每站点白名单。
- **带 `%` 的文案 500**：入口对整段输出做 `decodeURIComponent`，"全场 50% off" 这类文本会抛
  `URIError`。改为在边界处容错解码一次（`safeDecode`）。
- **百分号编码的入参静默失效**：`target` 从不解码，传入 `encodeURIComponent` 后的正常文本会
  返回空 body。改为 `readTarget` 取原文 + `safeDecode` 解码。
- **京东搜索页变死链**：`jd.com` 后缀一刀切导致 `search.jd.com/Search?keyword=键盘` 被清成
  `/Search`。改为按 host 区分：商品页全删，其它子域只删追踪键。

### 新增

- **未知站点通用清洗**：只删已知追踪键（`utm_*`、`spm`、`scm`、`share_*`、`_wv*` 等），
  其余参数一律保留，避免把 `?v=` / `?q=` 类链接砍成死链。
- **小红书 `xsec_token` 保留**：web 链接与短链两条路径都只保留该必需参数（借鉴上游 `ddb8d86`）。
- **B站业务参数保留**：`?p=`（分P）、`?t=`（起播秒数）不再被删。
- **明确的 HTTP 契约**：`200 / 400 / 405 / 500`、`OPTIONS` 204、`content-type`、
  `access-control-allow-origin`、`cache-control: no-store`，入口整体 `try/catch`（不再出现 1101）。
- **短链解析的可靠性**：`AbortSignal.timeout(8000)` 取代无效的 `timeout` init 键；
  `HEAD` 被拒（403/405/501）时降级 `GET`。
- **抗放大**：单次请求最多解析 20 条链接、并发 5（`FETCH_LIMITS`）。

### 工程化

- 新增 `package.json`（唯一 devDependency 为 wrangler）、`wrangler.toml`（`main = index.js`，
  只打包不转换）、`.gitignore`。
- 新增 `test/worker.test.mjs`：28 条用例，使用 Node 内置 `node:test`，零依赖，不需要网络。
- 新增 MIT `LICENSE`，保留上游 `hellodk34/link-cleaner` 的版权声明（本仓库是其衍生作品）。
- `index.js` 内部改为 5 个固定分节（CONFIG / UTILS / HANDLERS / ROUTER / ENTRY），
  保持单文件、无 import、无构建步骤。
- README 补齐接口契约、支持站点、实现说明、运行时注意事项；新增英文版 `README.en.md`。

## [0.1.0] - 2024-03-02

### 初始版本

- 由 [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)（Java）移植而来的
  Cloudflare Worker 雏形：`?target=` 入口、按域名查表的 pdd / 淘宝 / 京东 / B站 / 抖音 /
  小红书处理逻辑。
