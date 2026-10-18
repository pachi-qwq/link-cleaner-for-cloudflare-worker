# link-cleaner-for-cloudflare-worker

**English** | [简体中文](README.zh-CN.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Runtime](https://img.shields.io/badge/runtime-Cloudflare%20Workers-orange.svg)](https://workers.cloudflare.com/)
[![Tests](https://img.shields.io/badge/tests-107%20passing-brightgreen.svg)](test/)
[![Build](https://img.shields.io/badge/build-none-lightgrey.svg)](#single-file-constraint)

A Cloudflare Worker that scrubs tracking parameters from shared links. Paste a share text, get the
same text back — titles and prose untouched, only the links replaced with clean, expanded URLs.

It is a JavaScript / Worker port of [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)
(a Java clipboard tool), with two deliberate behaviour changes documented in
[Differences from upstream](#differences-from-upstream).

---

## Table of contents

- [Features](#features)
- [Getting started](#getting-started)
- [API contract](#api-contract)
- [Supported sites](#supported-sites)
- [How it works](#how-it-works)
- [Testing](#testing)
- [Project layout](#project-layout)
- [Single-file constraint](#single-file-constraint)
- [Known limitations](#known-limitations)
- [Differences from upstream](#differences-from-upstream)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License & credits](#license--credits)

---

## Features

- **Whole-text processing** — every link in the text is handled in one request; titles and copy are
  left byte-for-byte intact.
- **Short-link expansion** — `b23.tv`, `m.tb.cn`, `v.douyin.com`, `xhslink.com` are resolved to
  their final URLs.
- **Two-tier parameter policy** — a keep-list for known sites, a tracking-key deny-list for
  everything else.
- **Keeps meaningful parameters** — `?p=` (part), `?t=` (start time), `?id=`, `?goods_id=`,
  `?xsec_token=` are never dropped.
- **No dead links** — it would rather leak a tracking parameter than remove a query key it does not
  recognise.
- **Explicit HTTP semantics** — `200 / 400 / 405 / 500` with `content-type`, CORS and `no-store`.
- **Amplification control** — at most 20 links parsed per request, 5 concurrent subrequests, 8 s
  timeout each (Workers free tier allows 50 subrequests per request).
- **Zero dependencies, one file** — no `import`, no build step; `index.js` can be pasted straight
  into the Cloudflare dashboard editor.

## Getting started

### Deploy to Cloudflare

```bash
git clone https://github.com/pachi-qwq/link-cleaner-for-cloudflare-worker.git
cd link-cleaner-for-cloudflare-worker
npm install
npx wrangler login
npm run deploy
```

You get `https://link-cleaner.<your-subdomain>.workers.dev`, used as:

```
https://link-cleaner.<your-subdomain>.workers.dev/?target=<share text>
```

> Percent-encode `target` if you can. Raw, unencoded text also works — everything after
> `?target=` up to the end of the URL is treated as the target.

**No wrangler?** `index.js` is a complete Worker module. Paste it into the Cloudflare dashboard
editor and hit save (`wrangler.toml` exists only for local tooling).

### Local development

```bash
npm install          # installs wrangler only (devDependency)
npm run dev          # http://localhost:8787/?target=...
npm test             # 28 test cases (Node's built-in runner, no dependencies)
npm run check        # bundle check without deploying
```

Requires Node ≥ 18 (verified on v24.16.0).

## API contract

### Request

```http
GET /?target=<share text>
```

| Param | In | Required | Notes |
|---|---|---|---|
| `target` | query | yes | The share text to clean. Percent-encoding recommended, raw accepted |

Methods: `GET` / `HEAD` are processed, `OPTIONS` returns a 204 preflight, anything else is 405.

### Response

| Case | Status | Headers | Body |
|---|---|---|---|
| OK | `200` | `content-type: text/plain; charset=utf-8`<br>`cache-control: no-store`<br>`access-control-allow-origin: *`<br>`x-content-type-options: nosniff` | Cleaned text |
| Missing `?target=` | `400` | same | `缺少 target 参数。用法：/?target=<分享文本>` |
| Method not allowed | `405` | same + `allow: GET, HEAD, OPTIONS` | `只支持 GET` |
| Uncaught error | `500` | same | `内部错误` |
| `OPTIONS` | `204` | same | empty |

No JSON, no caching by design: this is a paste-into-chat text service, and `no-store` reflects that
short-link resolution is time-sensitive.

### Examples

```bash
# Encoded (recommended)
curl -G --data-urlencode "target=【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq?share_source=copy_web&vd_source=f3e3" \
  "https://link-cleaner.<your-subdomain>.workers.dev/"
# → 【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq

# Raw text (legacy form; inner & is not truncated)
curl "https://link-cleaner.<your-subdomain>.workers.dev/?target=https://item.jd.com/1.html?utm_source=a&ad_od=b"
# → https://item.jd.com/1.html
```

### Single-link endpoint: `/clean`

For scripts. Returns JSON instead of text.

```
GET /clean?url=<single URL>
→ 200 application/json
  {
    "input":   "https://item.jd.com/1.html?utm_source=x",
    "output":  "https://item.jd.com/1.html",
    "host":    "item.jd.com",
    "rule":    "jd.com",
    "changed": true
  }
```

| Field | Meaning |
|---|---|
| `input` | The decoded input URL |
| `output` | The cleaned URL (identical to what the text endpoint produces for the same link) |
| `host` | The URL's hostname |
| `rule` | The matched site rule (e.g. `jd.com`), or `null` when no rule matched |
| `changed` | `output !== input` |

Errors: missing `url` → `400 {"error":"missing url"}`; malformed URL → `400 {"error":"invalid url"}`;
non-http(s) → `400 {"error":"unsupported scheme"}`.

```bash
curl -s "https://link-cleaner.<your-subdomain>.workers.dev/clean?url=https%3A%2F%2Fitem.jd.com%2F1.html%3Futm_source%3Dx" | jq -r .output
# https://item.jd.com/1.html
```

## Supported sites

Host matching is exact-or-dot-boundary suffix: `www.`, `item.`, `m.`, `v.`, `e.` all match, while
`evil-bilibili.com` does not.

| Site | Hosts | Behaviour |
|---|---|---|
| Bilibili | `bilibili.com`, `b23.tv` | Short link expanded to `/video/BV…`; query keeps only `p`, `t` |
| Pinduoduo | `yangkeduo.com` | query keeps only `goods_id` |
| Taobao / Tmall | `taobao.com`, `tmall.com` | query keeps only `id` |
| Taobao short | `tb.cn` (incl. `m.`, `e.`) | Expanded to the item page, keeps only `id`; falls back to reading `var url='…'` from the landing page |
| JD | `jd.com` | `jd.com` / `item.jd.com` / `item.m.jd.com` drop the whole query; other hosts (`search.`, `list.`) only lose tracking keys |
| Douyin | `douyin.com`, `iesdouyin.com` | Expanded to `www.douyin.com/video/<id>` |
| Xiaohongshu | `xiaohongshu.com`, `xhslink.com` | Short link expanded; query **keeps only** `xsec_token` (without it WeChat cannot open the note) |
| Curated long tail | 27 sites (Weibo / Sohu / Youku / TikTok / YouTube / X / Reddit / Amazon / eBay / Google ...) | Per-site rules from ClearURLs data, see [NOTICE](NOTICE) |
| Everything else | any | Known tracking keys removed, everything else kept |

### Tracking keys removed by the generic pass

Prefixes: `utm_`, `share_`, `_wv`

Exact keys: `spm`, `scm`, `vd_source`, `from_source`, `refer`, `unique_k`, `bbk`, `refer_share_id`,
`refer_share_channel`, `refer_share_uin`, `share_uin`, `share_plat`, `share_session_id`,
`share_tag`, `share_medium`, `share_source`, `share_from_user_hidden`, `page_from`,
`pxq_secret_key`, `isappinstalled`, `_x_org`, `xsec_source`, `xsec_source_type`, `scene`,
`srcid`, `timestamp`, `t`

Plus a set of **global click/ad tracking IDs** (same names as ClearURLs' `globalRules`):
`gclid`, `dclid`, `gbraid`, `wbraid`, `fbclid`, `msclkid`, `yclid`, `twclid`, `igshid`, `_openstat`,
`_ga`, `_gl`, `mc_cid`, `mc_eid`, `mkt_tok`, `srsltid`, `vero_id`, `rb_clickid`, `s_cid`, `hmb_*`,
`itm_*` and more — these are removed on **any** site.

## How it works

### Pipeline

```
request  GET /?target=<text>
  │
  ├─ readTarget()      take everything after ?target= to end of URL (no truncation at & or #)
  ├─ safeDecode()      decode once, tolerantly; a stray % is passed through ("50% off" won't 500)
  ├─ parseUrls()       extract links with /(https?:\/\/[^\s]+)/gi
  ├─ mapLimit(5)       process the first 20 links with bounded concurrency
  │    └─ cleanOne()
  │         ├─ hostOf() → matchRule()   dot-boundary suffix match
  │         ├─ rule found → site handler (may expand short links via probeFinalUrl)
  │         └─ no rule    → stripTracking() removes known tracking keys only
  └─ replace in place   put each cleaned link back into the original text, in order
response text/plain
```

### Parameter policy: keep-list vs deny-list

| | Registered sites | Everything else |
|---|---|---|
| Policy | Keep-list: only keys listed in `KEEP_PARAMS` survive | Deny-list: only keys in `TRACKING_*` are removed |
| Rationale | Their meaningful params are known (`id`, `goods_id`, `xsec_token`…) | Unknown params are kept; leaking a tracker is cheaper than breaking a link |
| Risk | A new meaningful param requires a `KEEP_PARAMS` update | Some unknown trackers survive |

Upstream Java cuts everything after `?` for unknown sites; that turns `youtube.com/watch?v=xxx` and
`bing.com/search?q=xxx` into dead links, so this project does not do it.

### Cloudflare Workers runtime notes

These cost real debugging time during the port — recorded so nobody rediscovers them:

1. **No `Location` header after following redirects.** A `fetch()` created inside a Worker defaults to
   `redirect: 'follow'`; once followed, the response headers carry no `Location` and the final URL is
   only available as `response.url`. (The *incoming* `Request` is `manual` — do not mix the two
   directions.) The Java version read `Location` from hutool's non-following HEAD request; translated
   literally it is always null — the original code replaced Xiaohongshu short links with a single space.
2. **`fetch(url, {timeout})` — `timeout` is not a supported init key** and is silently dropped. Use
   `AbortSignal.timeout(ms)`.
3. **Subrequest quotas apply** (50 per request on the free tier, 1000 paid). `Promise.all(urls.map(fetch))`
   against user text is unbounded fan-out, hence `FETCH_LIMITS` (20 links, 5 concurrent).
4. **An uncaught exception in a handler yields the CF 1101 error page**, not a tidy 500. The entry
   point wraps everything in `try/catch` and a single failing link is degraded in isolation.
5. **`HEAD` is not universally supported** — some CDNs answer 403/405, so `probeFinalUrl` falls back
   to `GET`.

## Testing

```bash
npm test               # 107 (65 unit + 42 integration)
npm run test:unit      # pure-function unit tests only
npm run test:integration
npm run test:coverage  # Node's built-in coverage (index.js: 91% lines / 86% branches / 100% funcs)
npm run check          # wrangler bundle check
```

All tests drive the real request contract (`new Request(...)`) with a stubbed `fetch` that models
Worker redirect semantics (`.url` populated, `Location` null), so **no network access is required**.

Two layers:

| Layer | Location | What it covers | Count |
|---|---|---|---|
| Unit | `test/unit/` | Pure-function boundaries: `parseUrls` / `stripQuery` / `stripTracking` / `keepForHost` / `readTarget` / `safeDecode` / `mapLimit` / `matchRule` / `cleanOne` | 65 |
| Integration | `test/integration/` | The full contract through `new Request(...)`: routing, short-link expansion (incl. the `HEAD→GET` fallback), failure isolation, limits, encoding/decoding, status codes, headers | 42 |

To enable this, `index.js` ends with a group of **named exports** (`export { parseUrls, … }`) used only
by tests. Workers only care about `export default`, so the named exports do not affect the deployed
artifact — unit-testing pure functions without breaking the single-file constraint.

Coverage is tracked, not enforced. `index.js` currently sits at 93.8% lines, 87.4% branches, 100%
functions. Known-uncoverable branches: real network failures in `probeFinalUrl`, the landing-page
fallback in `taobaoCnUri`, and the entry point's 500 catch-all.

## Project layout

```
.
├── index.js            # the only source file and the only deployable artifact (567 lines, 5 sections)
├── test/
│   ├── unit/           # pure-function unit tests (65)
│   └── integration/    # entry-level integration tests (42)
├── test-support/       # shared helpers and real share-text fixtures (not test files)
├── package.json        # wrangler as the only devDependency
├── wrangler.toml       # main = index.js, bundling only, no transforms
├── README.md           # this file (English, default)
├── README.zh-CN.md     # 简体中文
├── CHANGELOG.md        # English
├── CHANGELOG.zh-CN.md  # 简体中文
├── CONTRIBUTING.md     # English
├── CONTRIBUTING.zh-CN.md
├── NOTICE              # ClearURLs rules attribution (LGPL-3.0)
└── LICENSE             # MIT
```

## Single-file constraint

`index.js` is the only source file and the only deployable artifact: **no imports, no module split,
no build step**. Internally it is organised by five section comments:

```
1. CONFIG   constants, site rules, limits
2. UTILS    pure helpers
3. HANDLERS per-site processing
4. ROUTER   host → handler
5. ENTRY    export default { fetch }
```

This is a deliberate trade-off: a longer file beats a build pipeline, because it must stay
paste-and-run in the Cloudflare dashboard editor. `package.json` / `wrangler.toml` / `test/` are
development-time assets that never reach the bundle (19.5 KiB total, 6.0 KiB gzipped - 7.3 KB of that is the ClearURLs ruleset).

## Known limitations

- **Only http/https**, and URLs cannot contain spaces (share texts separate links with spaces).
- **`t` is on the deny-list** — a handful of sites use `t` as a real parameter and lose it
  (Bilibili is exempted via the keep-list).
- **Unknown short links are not expanded** — only registered hosts get a subrequest.
- **Douyin video only** — image sets and live-stream shares pass through untouched.
- **Resolution failure always degrades to the original** — a link with a tail beats a deleted link.
- **No caching** (`no-store`) — personal-scale traffic does not justify KV.
- **Expanded Bilibili links may keep a trailing slash** — that is the final URL shape from the
  `b23.tv` 302; it opens fine, and no path normalisation is done.

## Differences from upstream

| | Upstream (Java) | This project |
|---|---|---|
| Form | Desktop jar, reads/writes the system clipboard | Cloudflare Worker, HTTP API |
| Unknown sites | Cuts everything after `?` | Removes known tracking keys only (no dead links) |
| Taobao `id` loss | Patched in v1.1.2 with `split[0].contains("id=")` | Fixed at the root with `URLSearchParams` + keep-list |
| Xiaohongshu `xsec_token` | Kept since v1.1.1 | Kept (both the web link and short-link paths) |
| JD search page | Also reduced to a bare path | Host-aware: `keyword` survives |
| OS integration | `xclip` / AWT clipboard | None, pure HTTP |

Two upstream changes were borrowed: `ddb8d86` (Xiaohongshu `xsec_token`) and `51fe8bc`
(generic query stripping + Taobao `id` fix).

## Roadmap

- [x] Per-site keep-lists and a generic tracking deny-list
- [x] Short-link expansion (`resp.url` + `HEAD→GET` fallback), timeouts, concurrency caps
- [x] HTTP status codes and response headers
- [x] Pure-function unit tests alongside integration tests (named exports + `test-support/`)
- [x] Optional: a **curated subset** of the ClearURLs ruleset (27 sites, see [NOTICE](NOTICE)); the full 154 providers are out of scope
- [ ] Optional: `/clean?url=` JSON endpoint for scripting

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Summary:

- Keep `index.js` single-file: no `import`, no file split, no build step.
- Adding a site = one `SITE_RULES` row + one handler + tests + a README table row.
- Commit messages use Chinese with a conventional prefix (`fix:` / `feat:` / `docs:` / `test:` / `chore:`).
- Behaviour changes require test cases; do not refactor unrelated code in the same change.

## License & credits

[MIT](LICENSE) © 2026 pachi-qwq

Derived from [hellodk34/link-cleaner](https://github.com/hellodk34/link-cleaner)
(Copyright (c) 2022 hellodk34, MIT). Thanks to the original author for the research on share-link
privacy.

The embedded per-site rules **data** (`CLEARURLS_PROVIDERS`, 27 providers) comes from ClearURLs Rules
and is used and distributed under **LGPL-3.0**, not MIT; no ClearURLs source code is used here.
See [NOTICE](NOTICE).
