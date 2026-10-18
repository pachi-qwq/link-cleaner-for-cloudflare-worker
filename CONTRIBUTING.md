# 贡献指南

感谢你愿意花时间改进这个项目。它很小，规则也很少，但有几条是硬的。

## 硬规则

1. **`index.js` 是唯一源码，也是唯一部署产物。** 不允许 `import` / `require`、不允许拆成
   `src/*.js`、不允许引入 TypeScript 或 bundler。目标是可以整段粘进 Cloudflare Dashboard
   的在线编辑器并直接运行。
2. **零运行时依赖。** `dependencies` 必须为空；`devDependencies` 只放 wrangler。
3. **测试零依赖。** 只用 Node 内置的 `node:test` + `node:assert/strict`。不引入 vitest/jest/mocha。
4. **改行为必须带用例。** 不改行为的地方不要顺手重构——评审会按这条打回。

## 单文件内部结构

`index.js` 用 5 个分节注释分区，新增代码只能落进对应分区：

```
// ========== 1. CONFIG：常量、站点规则表、限额 ==========
// ========== 2. UTILS：纯函数工具 ==========
// ========== 3. HANDLERS：单站点处理 ==========
// ========== 4. ROUTER：host → handler ==========
// ========== 5. ENTRY：export default { fetch } ==========
```

## 新增一个站点

四处都要改，缺一不算完成：

1. `index.js`
   - 在 `// ========== 3. HANDLERS ==========` 里加一个 `xxxUri = async (url) => …`；
   - 需要保留某些参数时，在 CONFIG 的 `KEEP_PARAMS` 里加 `'example.com': ['id']`；
   - 在 `// ========== 4. ROUTER ==========` 的 `SITE_RULES` 里加一行 `{domain, handler}`。
2. `test/worker.test.mjs` 加一条端到端用例（真实分享文本形态，带标题/中文标点的那种）。
3. `README.md` 与 `README.en.md` 的「支持的站点」表格各加一行。
4. `CHANGELOG.md` 的 `[Unreleased]` 里加一条。

域名匹配一律用「相等或点边界后缀」：`host === domain || host.endsWith('.' + domain)`。
不要把点去掉——`endsWith('bilibili.com')` 会让 `evil-bilibili.com` 命中，这是安全边界。

## 开发流程

```bash
npm install
npm run dev      # http://localhost:8787/?target=...
npm test         # 107 条全绿才能提交
npm run check    # 打包校验（wrangler dry-run）
```

- 行为改动先写用例（红），再改代码（绿）。

### 测试怎么组织

| 目录 | 跑法 | 放什么 |
|---|---|---|
| `test/unit/` | `npm run test:unit` | 纯函数的边界（`stripQuery` 的 null/非法 URL/重复键、`readTarget` 的 `&`/`#`、`mapLimit` 的保序与并发） |
| `test/integration/` | `npm run test:integration` | 走 `new Request(...)` 的完整契约，一条用例对应一条真实分享文本 |
| `test-support/` | —— | `helpers.mjs`（`callWorker` / `callRaw` / `stubFetch`）与 `fixtures.mjs`；**不要**放进 `test/`，否则会被 test runner 当成用例执行 |
| 全量 | `npm test` | 上面全部（107 条） |
| 覆盖率 | `npm run test:coverage` | Node 内置覆盖率，零依赖 |

纯函数能单测是因为 `index.js` 末尾有一组**只给测试用的命名导出**：

```js
export { parseUrls, stripQuery, stripTracking, isTrackingKey, keepForHost, hostOf,
         safeDecode, readTarget, mapLimit, matchRule, cleanOne };
```

Worker 只认 `export default`，这些命名导出不影响部署。**加导出就要有用例**，否则删掉——它是测试面，
不是公共 API。

覆盖率基线（`npm run test:coverage`，2026-10-18）：`index.js` 行 93.8%、分支 87.4%、函数 100%。
PR 不应显著降低；不设硬阈值。已知无法覆盖的分支：`probeFinalUrl` 的真实网络失败、
`taobaoCnUri` 的落地页兜底、入口 500 兜底。

### 提交前自检

- 需要验证真实边缘行为时用 `npx wrangler dev --local`，不要把"桩 fetch 通过"当成"线上可用"。
- `grep -n "^import \|require(" index.js` 无命中；`npm test` 全绿。

## 提交规范

中文 + conventional 前缀：

```
fix: 京东只对商品页全删 query，搜索页 keyword 不再被砍成死链
feat: 未知站点按追踪键黑名单清洗，小红书保留 xsec_token
test: 补 UTILS 纯函数用例
docs: README 补英文版
chore: 升级 wrangler
```

一个提交只做一件事；不合并无关改动。

## PR 检查清单

- [ ] `node --test` 全绿，新增行为有用例
- [ ] `index.js` 仍然没有 `import` / `require`，仍可整段粘贴运行
- [ ] `npx wrangler deploy --dry-run` 通过，体积没有明显增长（当前约 19.5 KiB / gzip 6.0 KiB，含 7.3 KB 规则数据）
- [ ] 域名规则用了点边界后缀匹配
- [ ] 新增的 query 键放对了地方：业务参数进 `KEEP_PARAMS`，追踪参数进 `TRACKING_*`
- [ ] README（中英）与 CHANGELOG 已同步

## 评审时最该盯的三件事

1. **有没有为了"优雅"引入模块化或构建步骤**——这会破坏项目的核心约束。
2. **有没有把"删掉整个 query"当成通用策略**——那会给 `?v=` / `?q=` 类链接造死链。
3. **测试桩有没有把 bug 合法化**：`stubFetch` 里 `headers.get('Location')` 必须返回 `null`，
   因为真实 Worker 跟随重定向后就是这个行为。改成返回真实 Location 等于在测试里假装
   （已经修掉的）bug 不存在。

## 许可

提交即以 [MIT](LICENSE) 授权。本仓库衍生自
[hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)（MIT），保留其版权声明。
