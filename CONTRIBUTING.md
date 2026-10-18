# Contributing

[简体中文](CONTRIBUTING.zh-CN.md) | **English**

Thanks for taking the time to improve this project. It is small and the rules are few, but a couple
of them are hard requirements.

## Hard rules

1. **`index.js` is the only source file and the only deployable artifact.** No `import` / `require`,
   no splitting into `src/*.js`, no TypeScript, no bundler. The goal is that the whole file can be
   pasted into the Cloudflare dashboard editor and run as-is.
2. **Zero runtime dependencies.** `dependencies` must stay empty; `devDependencies` contains only
   wrangler.
3. **Zero test dependencies.** Node's built-in `node:test` + `node:assert/strict` only — no
   vitest/jest/mocha.
4. **Behaviour changes need tests.** Do not refactor unrelated code in the same change; reviews will
   reject it.

## Internal structure of the single file

`index.js` is partitioned by five section comments. New code goes into the matching section:

```
// ========== 1. CONFIG: constants, site rules, limits ==========
// ========== 2. UTILS: pure helpers ==========
// ========== 3. HANDLERS: per-site processing ==========
// ========== 4. ROUTER: host → handler ==========
// ========== 5. ENTRY: export default { fetch } ==========
```

## Adding a site

Four places must change; a partial change is not done:

1. `index.js`
   - add an `xxxUri = async (url) => …` in section 3 (HANDLERS);
   - to keep specific params, add `'example.com': ['id']` to `KEEP_PARAMS` in CONFIG;
   - add a `{domain, handler}` row to `SITE_RULES` in section 4 (ROUTER).
2. `test/integration/worker.test.mjs`: one end-to-end case using a real share-text shape (title,
   CJK punctuation, trailing text).
3. `README.md` and `README.zh-CN.md`: one row each in the "Supported sites" table.
4. `CHANGELOG.md` (and `CHANGELOG.zh-CN.md`): an entry under `[Unreleased]`.

Host matching always uses exact-or-dot-boundary suffix: `host === domain || host.endsWith('.' + domain)`.
Never drop the dot — `endsWith('bilibili.com')` would match `evil-bilibili.com`, which is a security
boundary, not a style choice.

## Development workflow

```bash
npm install
npm run dev      # http://localhost:8787/?target=...
npm test         # all 112 must pass before committing
npm run check    # bundle check (wrangler dry-run)
```

- Write the test first (red), then the code (green).

### How the tests are organised

| Directory | Command | Contents |
|---|---|---|
| `test/unit/` | `npm run test:unit` | Pure-function boundaries (`stripQuery` with null/invalid URL/duplicate keys, `readTarget` with `&`/`#`, `mapLimit` ordering and concurrency) |
| `test/integration/` | `npm run test:integration` | The full contract through `new Request(...)`; one case per real share text |
| `test-support/` | — | `helpers.mjs` (`callWorker` / `callRaw` / `stubFetch`) and `fixtures.mjs`. **Do not** put these under `test/` — the test runner would execute them as test files |
| Everything | `npm test` | All of the above (112) |
| Coverage | `npm run test:coverage` | Node's built-in coverage, no dependencies |

Pure functions are unit-testable because `index.js` ends with a group of **named exports used only by
tests**:

```js
export { parseUrls, stripQuery, stripTracking, isTrackingKey, keepForHost, hostOf,
         safeDecode, readParam, readTarget, mapLimit, matchRule, cleanOne,
         compileClearUrls, stripByProviderRules };
```

Workers only care about `export default`, so these do not affect the deployed artifact.
**Every export needs a test**, otherwise remove it — this is a testing surface, not a public API.

Coverage baseline (`npm run test:coverage`, 2026-10-18): `index.js` 93.8% lines, 87.7% branches,
100% functions. A PR should not lower it noticeably; there is no hard threshold. Known-unreachable
branches: real network failures in `probeFinalUrl`, the landing-page fallback in `taobaoCnUri`, and
the entry point's 500 catch-all.

### Pre-commit checklist

- Use `npx wrangler dev --local` when verifying real edge behaviour; "the stubbed fetch passes" is
  not "it works in production".
- `grep -n "^import \|require(" index.js` returns nothing; `npm test` is green.

## Commit convention

Chinese message + conventional prefix (this is the maintainer's convention; keep it consistent):

```
fix: 京东只对商品页全删 query，搜索页 keyword 不再被砍成死链
feat: 未知站点按追踪键黑名单清洗，小红书保留 xsec_token
test: 补 UTILS 纯函数用例
docs: README 补英文版
chore: 升级 wrangler
```

One commit does one thing; do not bundle unrelated changes.

## PR checklist

- [ ] `npm test` is green and new behaviour has cases
- [ ] `index.js` still has no `import` / `require` and is still paste-and-run
- [ ] `npx wrangler deploy --dry-run` passes and the bundle has not grown noticeably
      (currently ~20.2 KiB / 6.1 KiB gzipped, including 7.3 KB of rules data)
- [ ] Host rules use dot-boundary suffix matching
- [ ] New query keys went to the right place: business params → `KEEP_PARAMS`, tracking params →
      `TRACKING_*`
- [ ] README (both languages) and CHANGELOG are in sync

## Three things reviewers should look for

1. **Any "elegance" that introduces modules or a build step** — it breaks the project's core
   constraint.
2. **"Drop the whole query" used as a generic strategy** — that turns `?v=` / `?q=` links into dead
   links.
3. **Tests that legitimise a bug**: in `stubFetch`, `headers.get('Location')` must return `null`,
   because that is what a real Worker sees after following a redirect. Making it return a real
   Location means pretending the (fixed) bug does not exist.

## License

By contributing you agree to license your work under [MIT](LICENSE). This repository is derived from
[hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner) (MIT); its copyright notice is
retained. Embedded rules data is LGPL-3.0 — see [NOTICE](NOTICE).
