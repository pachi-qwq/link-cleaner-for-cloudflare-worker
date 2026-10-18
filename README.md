# link-cleaner-for-cloudflare-worker

把带追踪参数的分享链接清洗成干净链接的 Cloudflare Worker。
是 [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)（Java 桌面版）的 JavaScript / Worker 移植。

## 接口契约

```
GET https://<worker>/?target=<分享文本>
→ 200 text/plain：清洗后的文本（标题、文案原样保留，只有其中的链接被替换）
```

| 情况 | 响应 |
|---|---|
| 正常 | `200`，`text/plain; charset=utf-8`，`cache-control: no-store`，`access-control-allow-origin: *` |
| 缺 `?target=` | `400` + 一行提示文本 |
| 非 GET/HEAD/OPTIONS | `405`，带 `allow: GET, HEAD, OPTIONS` |
| 内部异常 | `500` + 一行提示文本（不会出现 CF 1101 错误页） |
| `OPTIONS` | `204`（CORS 预检） |

`target` 建议用百分号编码（`?target=` + `encodeURIComponent(分享文本)`）；也兼容原始未编码文本，
此时 `?target=` 之后的整段内容（含 `&`、`#`）都算 target。解码是容错的：文本里有裸 `%`
（例如「全场 50% off」）不会报错。

## 支持的站点

| 站点 | 形态 | 处理方式 |
|---|---|---|
| 哔哩哔哩 | `b23.tv/xxx` 短链 | 解析成 `bilibili.com/video/BVxxx`，保留 `?p=`（分P）、`?t=`（起播秒数） |
| 哔哩哔哩 | `*.bilibili.com/video/BVxxx?...` | 只保留 `p` / `t` |
| 拼多多 | `*.yangkeduo.com/goods.html?...` | 只保留 `goods_id` |
| 淘宝 / 天猫 | `*.taobao.com`、`*.tmall.com` | 只保留 `id` |
| 淘宝 | `m.tb.cn/xxx` 短链 | 解析成商品页，只保留 `id`；解析不到时回退读落地页里的 `var url='...'` |
| 京东 | `*.jd.com` | 删掉全部 query |
| 抖音 | `v.douyin.com/xxx`、`*.douyin.com` | 解析成 `www.douyin.com/video/<id>` |
| 小红书 | `xhslink.com/xxx` 短链 | 解析成笔记页，只保留 `xsec_token` |
| 小红书 | `*.xiaohongshu.com/...?xsec_token=...` | 只保留 `xsec_token`（缺了它微信里打不开） |
| 其它站点 | 任意 | 删掉已知追踪键（`utm_*`、`spm`、`scm`、`share_*`、`_wv*` 等），其余保留 |

域名匹配是「相等或点边界后缀」：`www.` / `item.` / `m.` / `v.` 都能命中，`evil-bilibili.com` 不会。

### 为什么不学上游「未知站点一律砍掉 `?` 之后」

上游 Java 版对未知站点直接 `substring(0, '?')`。在剪贴板工具里勉强能用，但会给
`youtube.com/watch?v=xxx`、`bing.com/search?q=xxx` 这类链接造出死链。这里改成黑名单：
只删已知追踪键，漏删可以接受，误删不行。

## 本地开发

```bash
npm install        # 只装 wrangler（devDependency）
npm run dev        # 本地起 wrangler dev：http://localhost:8787/?target=...
node --test        # 跑测试（Node 内置 test runner，零依赖）
npm run deploy     # 发布到 Cloudflare
npm run check      # 只做打包校验，不部署
```

要求 Node ≥ 18（本机用 v24 验证）。`node --test` 会自动发现 `test/*.test.mjs`，
**不要**写成 `node --test test/`（Node 24 上会报 `Cannot find module`）。

## 单文件约束

`index.js` 是唯一源码，也是唯一部署产物：不 import、不拆模块、不走构建步骤，
可以直接整段粘进 Cloudflare Dashboard 的在线编辑器。内部只用 5 个分节注释分区：

```
1. CONFIG   常量、站点规则表、限额
2. UTILS    纯函数工具
3. HANDLERS 单站点处理
4. ROUTER   host → handler
5. ENTRY    export default { fetch }
```

`package.json` / `wrangler.toml` / `test/` 都是开发期资产，不进部署产物。

### 运行时注意

Worker 内新建的 `fetch()` 默认跟随重定向，**跟随之后拿不到 `Location` 头**，最终地址只能读
`response.url`；`fetch(url, {timeout})` 的 `timeout` 是无效键，取消要用 `AbortSignal.timeout()`。
短链解析限 `FETCH_LIMITS`：单次请求最多解析 20 条链接、同时在飞 5 个、单条 8 秒超时
（CF 免费档每请求 50 个子请求）。

## 许可

MIT。衍生自 link-cleaner（Copyright (c) 2022 hellodk34, MIT），见 `LICENSE`。
