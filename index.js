// ========== 1. CONFIG：常量、站点规则表、限额 ==========
// 单文件约束：本文件是唯一源码，也是唯一部署产物。不要拆模块、不要 import、不要构建步骤。

const URL_REGEX = /(https?:\/\/[^\s]+)/gi;

const COMMON_FETCH_PARAMS = {method: 'HEAD', timeout: 20000}

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

const getUrlParams = (url) => {
    const origin = url.split('?')[0]
    return url.split(`${origin}?target=`)[1]
}

// ========== 3. HANDLERS：单站点处理 ==========
const biliUri = async (url) => {
    let uri = url;
    if (uri.includes('b23.tv')) {
        const resp = await fetch(uri, COMMON_FETCH_PARAMS);
        uri = resp.url || uri;
    }
    return stripQuery(uri, keepForHost(hostOf(uri)));
}

// 淘宝 / 天猫长链：必需参数是 id
const taobaoComUri = async (url) => stripQuery(url, keepForHost(hostOf(url)));

const taobaoCnUri = async (url) => {
    let uri = decodeURIComponent(url);
    if (uri.includes("taobao.com")) {
        return taobaoComUri(uri);
    }
    const start = uri.indexOf("https");
    const end = uri.indexOf(" ");
    const goodName = uri.substring(end);
    const realUri = uri.substring(start, end);
    const result = await fetch(realUri, {method: 'GET', timeout: 20000});
    const responseBody = await result.text();
    const regex = /var url = '([^'\r\n]*)';/;
    const matcher = responseBody.match(regex);
    if (matcher) {
        uri = matcher[1];
    }

    return `${goodName} ${await taobaoComUri(uri)}`;
}

// 拼多多：必需参数是 goods_id
const pddGoodsUri = async (url) => stripQuery(url, keepForHost(hostOf(url)));

const jdUri = async (url) => removeParams(url);

const douyinUri = async (url) => {
    const uri = url;
    const startIndex = uri.indexOf("抖音，");
    const httpsIndex = uri.indexOf("https");
    const text = uri.substring(startIndex + 3, httpsIndex);
    const newUri = uri.substring(httpsIndex);

    const resp = await fetch(newUri, COMMON_FETCH_PARAMS);
    const location = resp.headers.get('Location');
    const newLocation = removeParams(location);
    const regex = /\/(\d+)\//;
    const match = newLocation.match(regex);

    if (match) {
        const videoId = match[1];
        const newUriTemplate = "https://www.douyin.com/video/%s";
        const result = newUriTemplate.replace('%s', videoId);
        return text + result;
    }

    return url;
}

const xiaohongshuUri = async (url) => {
    let schemePrefix = null;
    if (url.includes("http://")) {
        schemePrefix = "http://";
    } else if (url.includes("https://")) {
        schemePrefix = "https://";
    } else {
        console.log(`${url} is not supported now.`);
    }
    const httpIndex = url.lastIndexOf(schemePrefix);
    // 正则表达式匹配 URI
    const regex = /(?<=http:\/\/|https:\/\/)[\w\d+./?=]+/;
    const matcher = url.match(regex);

    // 寻找匹配项并输出结果
    if (matcher) {
        const uri = matcher[0];
        const resp = await fetch(schemePrefix + uri, COMMON_FETCH_PARAMS);
        const location = resp.headers.get('Location');
        const cleanedUri = removeParams(location);
        return url.substring(0, httpIndex) + " " + cleanedUri;
    }
    return "";
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
    if (urls == null || urls.length === 0) {
        return '';
    }
    const processedUrls = await Promise.all(urls.map(cleanOne));
    return target.replace(URL_REGEX, () => (processedUrls.shift()));
}

// ========== 5. ENTRY：export default { fetch } ==========
export default {
    async fetch({url}, env, ctx) {
        const res = await process(url);
        return new Response(decodeURIComponent(res || ''));
    },
};
