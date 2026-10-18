# link-cleaner-for-cloudflare-worker

把带追踪参数的分享链接清洗成干净链接的 Cloudflare Worker。
是 [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)（Java 桌面版）的 JavaScript / Worker 移植。

## 接口契约

```
GET https://<worker>/?target=<分享文本>
→ 200 text/plain：清洗后的文本（标题、文案原样保留，只有其中的链接被替换）
```

当前 `target` 按**原始文本**拼在 URL 后面（不做百分号解码）。解析不了链接时原样返回。
错误路径目前一律返回 `200` 加空 body——错误码与响应头正在改造中。

## 支持的站点

| 站点 | 形态 | 状态 |
|---|---|---|
| 哔哩哔哩 | `b23.tv/xxx` 短链 | 可用 |
| 哔哩哔哩 | `www.bilibili.com/video/BVxxx?...` 长链 | 待修（子域没命中路由） |
| 拼多多 | `mobile.yangkeduo.com/goods.html?...` | 可用 |
| 淘宝 / 天猫 | `item.taobao.com/item.htm?...` | 待修（商品 id 会被丢掉） |
| 淘宝 | `m.tb.cn/xxx` 短链 | 待修 |
| 京东 | `item.jd.com/...` | 待修（handler 内有变量名错误，且子域没命中路由） |
| 抖音 | `v.douyin.com/xxx` 短链 | 待修 |
| 小红书 | `xhslink.com/xxx` 短链 | 待修（当前会把链接清成空格） |
| 小红书 | `xiaohongshu.com/...?xsec_token=...` | 待修（`xsec_token` 是必需参数，不能被删） |
| 其它站点 | 任意 | 暂不处理 |

「待修」项的处理计划见 `D:\tmp\docs\link-cleaner-for-cloudflare-worker-plans\`，按 001–006 依次实施。

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

## 许可

MIT。衍生自 link-cleaner（Copyright (c) 2022 hellodk34, MIT），见 `LICENSE`。
