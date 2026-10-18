# Changelog

[简体中文](CHANGELOG.zh-CN.md) | **English**

All notable changes to this project. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- **Bilibili default parameters are dropped**: `p=1` (first part) and `t=0` (play from the
  start) are defaults, so keeping them only added noise — e.g.
  `https://www.bilibili.com/video/BV1Smpj69EWz/?p=1` now becomes `…/BV1Smpj69EWz/`.
  Non-default values (`p=2`, `t=90`) are still preserved.

## [0.3.0] - 2026-10-18

### Added

- **Inlined tracking rules for 27 high-traffic sites** (curated from ClearURLs Rules: Weibo, Sohu,
  Youku, TikTok, YouTube, X, Reddit, Amazon, eBay, Google and more). When a provider matches, its
  `rules` delete parameters and our own tracking deny-list is **applied on top**; sites without a
  provider still use the deny-list. Data taken from an upstream JSON snapshot (2026-10-18) and used
  under LGPL-3.0 — see the new `NOTICE`. The single file grew 325 → 567 lines, the bundle
  9.2 → 19.5 KiB (gzip 3.1 → 6.0).
- **`/clean?url=` single-link JSON endpoint**: returns `input` / `output` / `host` / `rule` /
  `changed`; missing param, malformed URL and non-http(s) each return 400 with an `error` code. It
  shares `cleanOne` with the text endpoint, and a dedicated test asserts both endpoints agree on the
  same link. `readTarget` was generalised into `readParam`.

### Fixed

- **Provider exceptions swallowed the generic deny-list**: hitting a ClearURLs provider's
  `exceptions` returned the input untouched, so `utm_*` / `gclid` survived. Exceptions now only
  exempt that provider's rules while the generic deny-list still applies — matching ClearURLs'
  `globalRules` semantics.
- **Missing global click IDs**: `TRACKING_EXACT` had no `gclid` / `fbclid` / `msclkid` / `yclid` /
  `igshid`, so the most common ad trackers survived on every site. 40+ key names added from
  ClearURLs' `globalRules`.
- **`completeProvider` was dead code**: none of the 27 curated providers uses that flag; the runtime
  branch was removed and the reason documented in the data-block comment.
- **Text without links was swallowed into an empty body**: `process` returned `''` when a text had
  no links, so pasting plain prose yielded `200 ""`. It now returns the text unchanged.
- **Douyin profile links were turned into fake video URLs**: the fallback grabbed any numeric path
  segment, so a `v.douyin.com` redirect to `/share/user/<uid>/` produced a 404
  `www.douyin.com/video/<uid>`. The final URL must now be a Douyin host whose path matches
  `/(share/)?video/<id>`.

### Changed

- Added `x-content-type-options: nosniff` (`/clean` reflects user input into JSON).
- Logs no longer print full URLs, only the host (`probe failed`) — this is a privacy tool; user
  links have no business in logs.

### Tests

- Tests split into two layers: `test/unit/` (pure-function boundaries) and `test/integration/`
  (entry contract), 107 cases total (65 + 42). This is enabled by a group of named exports at the
  end of `index.js`; Workers only use the `default` export.
- `parseUrls` now uses `matchAll` and no longer depends on a module-level `/g` regex's `lastIndex`.
- New scripts: `npm run test:unit` / `test:integration` / `test:coverage` (Node's built-in coverage,
  zero dependencies).
- Shared helpers and real share-text fixtures moved to `test-support/`, so the test runner does not
  treat them as test files.

## [0.2.0] - 2026-10-18

### Fixed

- **Subdomain routing was dead**: the router was a `Map` keyed on the exact hostname, while real
  share links almost always live on `www.` / `item.` / `m.` / `v.` subdomains — so every site handler
  except `b23.tv` and `mobile.yangkeduo.com` was never reached. Now matched by exact-or-dot-boundary
  suffix.
- **JD links returned 500**: `jdUri` referenced an undefined `uri`, so any `jd.com` link threw a
  `ReferenceError` and the whole request became a CF 1101. Fixed, and a single failing link now only
  degrades itself.
- **Short links were replaced with a single space**: the Xiaohongshu/Douyin handlers read
  `headers.get('Location')`, which is always `null` inside a Worker after following a redirect, so
  `removeParams(null)` returned an empty string. Switched to `response.url`.
- **Taobao short links produced half-links**: `taobaoCnUri` used `indexOf(" ")` on a value that had
  already been split on whitespace, so it always got `-1`, called `fetch("")` and pasted
  `item.taobao.com/item.htm?` into the text.
- **Required parameters were dropped**: position-sensitive parsing (`split('&')` +
  `startsWith('id')`) lost `id` / `goods_id` whenever they were not the first query segment, and left
  a dangling `?`. Replaced with `URLSearchParams` plus per-site keep-lists.
- **Text containing `%` returned 500**: the entry point ran `decodeURIComponent` over the whole
  output, so "50% off" threw a `URIError`. Now decoded once at the boundary with a tolerant
  `safeDecode`.
- **Percent-encoded input silently produced an empty body**: `target` was never decoded, so properly
  encoded text returned nothing. `readTarget` now takes the raw value and `safeDecode` decodes it.
- **JD search pages became dead links**: the blanket `jd.com` suffix match reduced
  `search.jd.com/Search?keyword=keyboard` to `/Search`. Now host-aware: product pages drop the whole
  query, other subdomains only lose tracking keys.

### Added

- **Generic cleaning for unknown sites**: only known tracking keys are removed
  (`utm_*`, `spm`, `scm`, `share_*`, `_wv*` …), everything else is kept — avoiding dead
  `?v=` / `?q=` links.
- **Xiaohongshu `xsec_token` is preserved**: both the web link and the short-link path keep only that
  required parameter (borrowed from upstream `ddb8d86`).
- **Bilibili business parameters preserved**: `?p=` (part) and `?t=` (start seconds) are no longer
  dropped.
- **Explicit HTTP contract**: `200 / 400 / 405 / 500`, `OPTIONS` 204, `content-type`,
  `access-control-allow-origin`, `cache-control: no-store`, and a top-level `try/catch` (no more
  1101 pages).
- **Reliable short-link resolution**: `AbortSignal.timeout(8000)` replaces the no-op `timeout` init
  key; `HEAD` rejections (403/405/501) fall back to `GET`.
- **Amplification control**: at most 20 links parsed per request, 5 concurrent (`FETCH_LIMITS`).

### Engineering

- Added `package.json` (wrangler as the only devDependency), `wrangler.toml`
  (`main = index.js`, bundling only), `.gitignore`.
- Added `test/worker.test.mjs`: 28 cases using Node's built-in `node:test`, no dependencies, no
  network.
- Added an MIT `LICENSE`, retaining the upstream `hellodk34/link-cleaner` copyright notice (this
  repository is a derivative work).
- `index.js` reorganised into five fixed sections (CONFIG / UTILS / HANDLERS / ROUTER / ENTRY),
  still a single file with no imports and no build step.
- README grew a full API contract, supported-site table, implementation notes and runtime caveats;
  a Chinese version was added.

## [0.1.0] - 2024-03-02

### Initial release

- Cloudflare Worker port of [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)
  (Java): `?target=` entry point and domain-table dispatch for Pinduoduo, Taobao, JD, Bilibili,
  Douyin and Xiaohongshu.
