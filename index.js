// ========== 1. CONFIG：常量、站点规则表、限额 ==========
// 单文件约束：本文件是唯一源码，也是唯一部署产物。不要拆模块、不要 import、不要构建步骤。

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

// 子请求限额：CF 免费档每个请求 50 个子请求，别让一段文本把配额打满
const FETCH_LIMITS = {
    maxUrls: 20,        // 单次请求最多解析多少条链接，超出的原样返回
    concurrency: 5,     // 同时在飞的子请求上限
    timeoutMs: 8000,    // 单条子请求超时
};

// 各站点清洗时必须保留的 query 键。不在表里的站点表示「一个 query 都不需要」。
const KEEP_PARAMS = {
    'yangkeduo.com': ['goods_id'],
    'taobao.com': ['id'],
    'tmall.com': ['id'],
    'bilibili.com': ['p', 't'],   // p=分P，t=起播秒数，都不是追踪参数
};

// 未知站点只删这些键，其余保留。宁可漏删，不要误删——删错的代价是死链。
const TRACKING_EXACT = new Set([
    'spm', 'scm', 'vd_source', 'from_source', 'refer', 'unique_k', 'bbk',
    'refer_share_id', 'refer_share_channel', 'refer_share_uin', 'share_uin',
    'share_plat', 'share_session_id', 'share_tag', 'share_medium', 'share_source',
    'share_from_user_hidden', 'page_from', 'pxq_secret_key', 'isappinstalled',
    '_x_org', 'xsec_source', 'xsec_source_type', 'scene', 'srcid', 'timestamp', 't',
]);
const TRACKING_PREFIX = ['utm_', 'share_', '_wv'];


// ========== 2. UTILS：纯函数工具 ==========
const parseUrls = (inputText) => {
    if (typeof inputText !== 'string' || inputText === '') {
        return [];
    }
    // matchAll 每次都用新的迭代器，不依赖正则的 lastIndex 状态
    return [...inputText.matchAll(URL_REGEX)].map((match) => match[0]);
}

// 只删 query，保留 fragment；没有 query 时原样返回（避免 URL 正规化带来的多余改写）。
const stripQuery = (url, keep = []) => {
    if (typeof url !== 'string' || url === '') {
        return '';
    }
    let u;
    try {
        u = new URL(url);
    } catch (err) {
        return url;
    }
    if (!u.search) {
        return url;
    }
    for (const key of [...u.searchParams.keys()]) {
        if (!keep.includes(key)) {
            u.searchParams.delete(key);
        }
    }
    return u.toString();
};

const hostOf = (url) => {
    try {
        return new URL(url).hostname;
    } catch (err) {
        return '';
    }
};

const keepForHost = (host) => {
    const hit = Object.keys(KEEP_PARAMS).find(
        (domain) => host === domain || host.endsWith('.' + domain)
    );
    return hit ? KEEP_PARAMS[hit] : [];
};

// 保留这个名字：语义 = 删掉全部 query（null/'' 返回 ''）
const removeParams = (uri) => stripQuery(uri ?? '');

// 解析短链：拿最终地址只能靠 resp.url —— Worker 内新建的 fetch 默认跟随重定向，
// 跟随之后响应头里没有 Location（入参 Request 才是 manual，两个方向别混）。
// HEAD 被拒时降级 GET；任何失败都返回 ''，由调用方决定降级策略。
const probeFinalUrl = async (url) => {
    const once = (method) => fetch(url, {
        method,
        redirect: 'follow',
        signal: AbortSignal.timeout(FETCH_LIMITS.timeoutMs),
    });
    try {
        let resp = await once('HEAD');
        if (resp.status === 403 || resp.status === 405 || resp.status === 501) {
            resp = await once('GET');
        }
        return resp.url || '';
    } catch (err) {
        console.warn('probe failed', hostOf(url) || '(unparsable)', err && err.message);
        return '';
    }
};

// 有界并发：全部跑完才返回，输出顺序与输入一致
const mapLimit = async (items, limit, fn) => {
    const out = new Array(items.length);
    let cursor = 0;
    const runners = Array.from({length: Math.min(limit, items.length)}, async () => {
        while (cursor < items.length) {
            const index = cursor++;
            out[index] = await fn(items[index], index);
        }
    });
    await Promise.all(runners);
    return out;
};

const isTrackingKey = (key) => TRACKING_EXACT.has(key)
    || TRACKING_PREFIX.some((prefix) => key.startsWith(prefix));

// 通用站点：只删追踪键。没有 query 时原样返回，避免 URL 正规化改写原文。
const stripTracking = (url) => {
    if (typeof url !== 'string' || url === '') {
        return '';
    }
    let u;
    try {
        u = new URL(url);
    } catch (err) {
        return url;
    }
    if (!u.search) {
        return url;
    }
    for (const key of [...u.searchParams.keys()]) {
        if (isTrackingKey(key)) {
            u.searchParams.delete(key);
        }
    }
    return u.toString();
};

// 容错解码：输入可能是原始分享文本（含裸 %），也可能是百分号编码过的。
// 解不出来就原样返回——永远不要因为用户文本里有 '%' 就抛 500。
const safeDecode = (text) => {
    if (typeof text !== 'string' || text === '') {
        return '';
    }
    try {
        return decodeURIComponent(text);
    } catch (err) {
        return text;
    }
};

// 取 query 里某个参数到 URL 末尾的全部内容。不用 searchParams：
// 原始分享文本里本来就带 & 和 #，用 searchParams 会在第一个 & 处截断。
const readParam = (urlString, name) => {
    const hashless = String(urlString || '').split('#')[0];
    const qIndex = hashless.indexOf('?');
    if (qIndex === -1) {
        return '';
    }
    const query = hashless.slice(qIndex + 1);
    const pattern = new RegExp('(?:^|&)' + name + '=(.*)$', 's');
    const match = pattern.exec(query);
    return match ? match[1] : '';
};

const readTarget = (urlString) => readParam(urlString, 'target');

// ========== 3. HANDLERS：单站点处理 ==========
const biliUri = async (url) => {
    const finalUrl = url.includes('b23.tv') ? await probeFinalUrl(url) : url;
    const target = finalUrl || url;
    return stripQuery(target, keepForHost(hostOf(target)));
}

// 淘宝 / 天猫长链：必需参数是 id
const taobaoComUri = async (url) => stripQuery(url, keepForHost(hostOf(url)));

const taobaoCnUri = async (url) => {
    const finalUrl = await probeFinalUrl(url);
    if (/^https?:\/\/([a-z0-9-]+\.)*(taobao|tmall)\.com\//i.test(finalUrl)) {
        return taobaoComUri(finalUrl);
    }
    // 兜底：短链落在自建落地页，页面里有 var url = '...'（需要 GET 才能拿 body）
    try {
        const resp = await fetch(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(FETCH_LIMITS.timeoutMs),
        });
        const body = await resp.text();
        // 不用正则：单个文件里少一层转义，读起来也更直白
        const marker = "var url = '";
        const at = body.indexOf(marker);
        const end = at === -1 ? -1 : body.indexOf("';", at + marker.length);
        if (at !== -1 && end !== -1) {
            return taobaoComUri(body.slice(at + marker.length, end));
        }
    } catch (err) {
        console.warn('taobao cn fallback failed', err && err.message);
    }
    return url;
}

// 拼多多：必需参数是 goods_id
const pddGoodsUri = async (url) => stripQuery(url, keepForHost(hostOf(url)));

// 京东：只有商品/详情页可以「全删 query」。搜索页、列表页的 keyword/ev 之类是业务参数，
// 一刀切会把 search.jd.com/Search?keyword=键盘 砍成死链，所以其它子域走通用黑名单。
const JD_SKU_HOSTS = new Set(['jd.com', 'item.jd.com', 'item.m.jd.com']);

const jdUri = async (url) => {
    const host = hostOf(url);
    if (JD_SKU_HOSTS.has(host)) {
        return removeParams(url);
    }
    return stripTracking(url);
};

const douyinUri = async (url) => {
    const finalUrl = await probeFinalUrl(url);
    if (finalUrl === '') {
        return url;
    }
    // 只在抖音自己的域名上、且确实是 video 形态时才改写：
    // 用户主页（/share/user/<uid>/）、图集之类的链接不能被伪造成 video 地址。
    if (!/(^|\.)(iesdouyin|douyin)\.com$/i.test(hostOf(finalUrl))) {
        return url;
    }
    const match = finalUrl.match(/\/(?:share\/)?video\/(\d+)/);
    return match ? 'https://www.douyin.com/video/' + match[1] : url;
}

// 小红书：xsec_token 是必需参数（缺它微信里打不开笔记），其余全部丢掉
const xiaohongshuUri = async (url) => {
    const finalUrl = url.includes('xhslink.com') ? await probeFinalUrl(url) : url;
    const target = finalUrl || url;
    if (!/xiaohongshu\.com/i.test(target)) {
        return stripTracking(target);
    }
    return stripQuery(target, ['xsec_token']);
}
// ========== 4. ROUTER：host → handler ==========
// 匹配规则是「相等或点边界后缀」：www./item./m./v. 等子域都能命中，
// 而 evil-bilibili.com 不会误命中（点边界是安全边界，不是风格问题）。
const SITE_RULES = [
    {domain: 'b23.tv', handler: biliUri},
    {domain: 'bilibili.com', handler: biliUri},
    {domain: 'yangkeduo.com', handler: pddGoodsUri},
    {domain: 'jd.com', handler: jdUri},
    {domain: 'tb.cn', handler: taobaoCnUri},
    {domain: 'taobao.com', handler: taobaoComUri},
    {domain: 'tmall.com', handler: taobaoComUri},
    {domain: 'douyin.com', handler: douyinUri},
    {domain: 'iesdouyin.com', handler: douyinUri},
    {domain: 'xiaohongshu.com', handler: xiaohongshuUri},
    {domain: 'xhslink.com', handler: xiaohongshuUri},
];

const matchRule = (host) => SITE_RULES.find(
    (rule) => host === rule.domain || host.endsWith('.' + rule.domain)
);

// 单个链接的清洗：解析不了就原样放过；handler 抛错也只降级这一条，
// 不能让一个坏链接把整段文本打成 CF 1101。
const cleanOne = async (url) => {
    let host;
    try {
        host = new URL(url).hostname;
    } catch (err) {
        return url;
    }
    const rule = matchRule(host);
    if (!rule) {
        return stripTracking(url);
    }
    try {
        return await rule.handler(url);
    } catch (err) {
        console.warn('handler failed', host, err && err.message);
        return url;
    }
};

const process = async (target) => {
    if ((target ?? '') === '') {
        return '';
    }

    const urls = parseUrls(target)
    if (urls.length === 0) {
        return target;          // 没有链接就原样返回文本，不能吞成空 body
    }
    const processed = await mapLimit(urls, FETCH_LIMITS.concurrency,
        (item, index) => (index < FETCH_LIMITS.maxUrls ? cleanOne(item) : Promise.resolve(item)));

    let cursor = 0;
    return target.replace(URL_REGEX, () => processed[cursor++]);
}
// ========== 5. ENTRY：export default { fetch } ==========
const TEXT_HEADERS = {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
};

const textResponse = (body, status = 200, extra = {}) =>
    new Response(body, {status, headers: {...TEXT_HEADERS, ...extra}});

const JSON_HEADERS = {...TEXT_HEADERS, 'content-type': 'application/json; charset=utf-8'};

const jsonResponse = (payload, status = 200) =>
    new Response(JSON.stringify(payload), {status, headers: JSON_HEADERS});

// 单链接接口：复用 cleanOne，保证与文本接口对同一条链接输出一致
const cleanEndpoint = async (rawUrl) => {
    const value = safeDecode(readParam(rawUrl, 'url'));
    if (value === '') {
        return jsonResponse({error: 'missing url'}, 400);
    }
    let parsed;
    try {
        parsed = new URL(value);
    } catch (err) {
        return jsonResponse({error: 'invalid url'}, 400);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return jsonResponse({error: 'unsupported scheme'}, 400);
    }
    const output = await cleanOne(value);
    const rule = matchRule(parsed.hostname);
    return jsonResponse({
        input: value,
        output,
        host: parsed.hostname,
        rule: rule ? rule.domain : null,
        changed: output !== value,
    });
};

export default {
    async fetch(request) {
        try {
            const method = (request && request.method) || 'GET';
            if (method === 'OPTIONS') {
                return new Response(null, {status: 204, headers: TEXT_HEADERS});
            }
            if (method !== 'GET' && method !== 'HEAD') {
                return textResponse('只支持 GET', 405, {allow: 'GET, HEAD, OPTIONS'});
            }
            const rawUrl = String((request && request.url) || '');
            const pathname = new URL(rawUrl).pathname;
            if (pathname === '/clean' || pathname === '/clean/') {
                return await cleanEndpoint(rawUrl);
            }
            const target = safeDecode(readTarget(rawUrl));
            if (target === '') {
                return textResponse('缺少 target 参数。用法：/?target=<分享文本>', 400);
            }
            return textResponse(await process(target));
        } catch (err) {
            console.warn('unhandled', err && err.message);
            return textResponse('内部错误', 500);
        }
    },
};

// 仅供测试：Worker 只认 default 导出，这些命名导出不进运行时路径。
export {
    parseUrls, stripQuery, stripTracking, isTrackingKey, keepForHost, hostOf,
    safeDecode, readParam, readTarget, mapLimit, matchRule, cleanOne,
};
