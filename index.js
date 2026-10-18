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

// ========== 2. UTILS：纯函数工具 ==========
const parseUrls = (inputText) => {
    let urls = [];
    let match;
    // Find all URLs in the input text
    while ((match = URL_REGEX.exec(inputText)) !== null) {
        urls.push(match[0]);
    }

    return urls;
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
        console.warn('probe failed', url, err && err.message);
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

const getUrlParams = (url) => {
    const origin = url.split('?')[0]
    return url.split(`${origin}?target=`)[1]
}

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

const jdUri = async (url) => removeParams(url);

const douyinUri = async (url) => {
    const finalUrl = await probeFinalUrl(url);
    if (finalUrl === '') {
        return url;
    }
    const match = finalUrl.match(/\/video\/(\d+)/) || finalUrl.match(/\/(\d{6,})\//);
    return match ? 'https://www.douyin.com/video/' + match[1] : url;
}

const xiaohongshuUri = async (url) => {
    // 短链先解析成最终地址；xsec_token 的保留逻辑见 005
    const finalUrl = url.includes('xhslink.com') ? await probeFinalUrl(url) : url;
    const target = finalUrl || url;
    return stripQuery(target);
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
        return url;
    }
    try {
        return await rule.handler(url);
    } catch (err) {
        console.warn('handler failed', host, err && err.message);
        return url;
    }
};

const process = async (url) => {
    if ((url ?? '') === '') {
        return '';
    }
    const target = getUrlParams(url);
    if ((target ?? '') === '') {
        return '';
    }

    const urls = parseUrls(target)
    if (urls.length === 0) {
        return '';
    }
    const processed = await mapLimit(urls, FETCH_LIMITS.concurrency,
        (item, index) => (index < FETCH_LIMITS.maxUrls ? cleanOne(item) : Promise.resolve(item)));

    let cursor = 0;
    return target.replace(URL_REGEX, () => processed[cursor++]);
}
// ========== 5. ENTRY：export default { fetch } ==========
export default {
    async fetch({url}, env, ctx) {
        const res = await process(url);
        return new Response(decodeURIComponent(res || ''));
    },
};
