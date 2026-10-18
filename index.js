// ========== 1. CONFIG：常量、站点规则表、限额 ==========
// 单文件约束：本文件是唯一源码，也是唯一部署产物。不要拆模块、不要 import、不要构建步骤。

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

const COMMON_FETCH_PARAMS = {method: 'HEAD', timeout: 20000}

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

const removeParams = (uri) => {
    if ((uri ?? '') === '') {
        return ''
    }
    const split = uri.split("?");
    return split[0];
}

const getUrlParams = (url) => {
    const origin = url.split('?')[0]
    return url.split(`${origin}?target=`)[1]
}

// ========== 3. HANDLERS：单站点处理 ==========
const biliUri = async (url) => {
    let uri = url;
    const httpsIndex = uri.indexOf("https");
    const text = uri.substring(0, httpsIndex);
    uri = uri.substring(httpsIndex);
    if (uri.includes("b23.tv")) {
        const resp = await fetch(uri, COMMON_FETCH_PARAMS);
        uri = resp.url;
    }
    return (text.length === 0 ? "" : (text + " ")) + removeParams(uri);
}

const taobaoComUri = async (url) => {
    let uri = url;
    const split = uri.split("&");
    if (split.length === 1) {
        return split[0];
    }
    const id = uri.split("?");
    let param = "";
    for (let i = 0; i < split.length; i++) {
        const item = split[i];
        if (item.startsWith("id") && item.includes("id=")) {
            param = item;
            break;
        }
    }
    return id[0].concat("?").concat(param);
}

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

const pddGoodsUri = async (url) => {
    const split = url.split("&");
    const goods = url.split("?");
    let param = "";

    if (split.length === 1) {
        return split[0];
    }

    for (let i = 0; i < split.length; i++) {
        let item = split[i];
        if (item.startsWith("goods") && item.includes("goods_id=")) {
            param = item;
            break;
        }
    }
    return goods[0].concat("?").concat(param);
}

const jdUri = async (url) => {
    return removeParams(uri)
}

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
const URL_PROCESS0R = new Map();
URL_PROCESS0R.set('yangkeduo.com', pddGoodsUri);
URL_PROCESS0R.set('mobile.yangkeduo.com', pddGoodsUri);
URL_PROCESS0R.set('jd.com', jdUri);
URL_PROCESS0R.set('taobao.com', taobaoComUri);
URL_PROCESS0R.set('tb.cn', taobaoCnUri);
URL_PROCESS0R.set('m.tb.cn', taobaoCnUri);
URL_PROCESS0R.set('bilibili.com', biliUri);
URL_PROCESS0R.set('b23.tv', biliUri);
URL_PROCESS0R.set('douyin.com', douyinUri);
URL_PROCESS0R.set('xhslink.com', xiaohongshuUri);

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
    const processedUrls = await Promise.all(
        urls.map(async (e) => {
            const domain = new URL(e).hostname;
            const fun = URL_PROCESS0R.get(domain);
            if (typeof fun === 'function') {
                return await fun(e);
            } else {
                return e;
            }
        })
    )
    return target.replace(URL_REGEX, () => (processedUrls.shift()));
}

// ========== 5. ENTRY：export default { fetch } ==========
export default {
    async fetch({url}, env, ctx) {
        const res = await process(url);
        return new Response(decodeURIComponent(res || ''));
    },
};
