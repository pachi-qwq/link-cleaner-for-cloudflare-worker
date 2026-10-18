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

// 白名单里的键也可能带着「默认值」——p=1 是第一P、t=0 是开头，URL 里带着纯属噪音。
const DEFAULT_PARAMS = {
    'bilibili.com': {p: '1', t: '0'},
};

// 未知站点只删这些键，其余保留。宁可漏删，不要误删——删错的代价是死链。
const TRACKING_EXACT = new Set([
    // 国内平台
    'spm', 'scm', 'vd_source', 'from_source', 'refer', 'unique_k', 'bbk',
    'refer_share_id', 'refer_share_channel', 'refer_share_uin', 'share_uin',
    'share_plat', 'share_session_id', 'share_tag', 'share_medium', 'share_source',
    'share_from_user_hidden', 'page_from', 'pxq_secret_key', 'isappinstalled',
    '_x_org', 'xsec_source', 'xsec_source_type', 'scene', 'srcid', 'timestamp', 't',
    // 常见全局点击 ID / 邮件与广告追踪（键名同 ClearURLs globalRules，见 NOTICE）
    'gclid', 'dclid', 'gbraid', 'wbraid', 'fbclid', 'msclkid', 'yclid', 'twclid',
    'igshid', 'igsh', '_openstat', 'vero_id', 'vero_conv', 'wickedid', 'mkt_tok',
    'rb_clickid', 's_cid', 'cmpid', 'srsltid', '_ga', '_gl', 'gs_l', 'gs_lcp',
    'mc_cid', 'mc_eid', 'wt_mc', 'wtrid', 'ml_subscriber', 'ml_subscriber_hash',
    'tracking_source', 'fb_action_ids', 'fb_action_types', 'fb_source', 'fb_ref',
    'action_object_map', 'action_type_map', 'action_ref_map',
    'hmb_campaign', 'hmb_medium', 'hmb_source', 'itm_source', 'itm_medium', 'itm_campaign',
    '__hssc', '__hstc', '__hsfp', '_hsenc', 'oly_anon_id', 'oly_enc_id',
]);
const TRACKING_PREFIX = ['utm_', 'share_', '_wv'];

// 精选自 ClearURLs Rules（LGPL-3.0，快照 2026-10-18）：
// 27 个高频站点，只保留 urlPattern / rules / exceptions，已剔除 redirections 与 rawRules。
// 上游标记 completeProvider 的 provider（整段 query 全删）本项目一个都没选，故运行时不处理该字段。
// 更新方式：人工核对 https://github.com/ClearURLs/Rules/blob/master/data.min.json 后替换本块。
// 许可说明见 NOTICE。
const CLEARURLS_PROVIDERS = {
    "google": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}",
        rules: ["ved", "bi[a-z]*", "gfe_[a-z]*", "ei", "source", "gs_[a-z]*", "site", "oq", "esrc", "uact", "cd", "cad", "gws_[a-z]*", "atyp", "vet", "_u", "je", "dcr", "ie", "sei", "sa", "dpr", "btn[a-z]*", "usg", "cd", "cad", "uact", "aqs", "sourceid", "sxsrf", "rlz", "i-would-rather-use-firefox", "pcampaignid", "sca_(?:esv|upv)", "iflsig", "fbs", "ictx", "cshid"],
        exceptions: ["^https?:\\/\\/mail\\.google\\.com\\/mail\\/u\\/", "^https?:\\/\\/accounts\\.google\\.com\\/o\\/oauth2\\/", "^https?:\\/\\/accounts\\.google\\.com\\/signin\\/oauth\\/", "^https?:\\/\\/(?:docs|accounts)\\.google(?:\\.[a-z]{2,}){1,}", "^https?:\\/\\/([a-z0-9-\\.])*(chat|drive)\\.google\\.com\\/videoplayback", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}(?:\\/upload)?\\/drive\\/", "^https?:\\/\\/news\\.google\\.com.*\\?hl=.", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}\\/s\\?tbm=map.*?gs_[a-z]*=.", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}\\/(?:complete\\/search|setprefs|searchbyimage)", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}\\/(?:appsactivity|aclk\\?)", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?google(?:\\.[a-z]{2,}){1,}\\/safe[-]?browsing\\/([^&]+)"],
    },
    "youtube": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?(youtube\\.com|youtu\\.be)",
        rules: ["feature", "gclid", "kw", "si", "pp"],
        exceptions: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?youtube\\.com\\/signin\\?.*?"],
    },
    "twitter": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?twitter.com",
        rules: ["(?:ref_?)?src", "s", "cn", "ref_url", "t"],
        exceptions: ["^https?:\\/\\/twitter.com\\/i\\/redirect"],
    },
    "x": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?x.com",
        rules: ["(?:ref_?)?src", "s", "cn", "ref_url", "t"],
        exceptions: ["^https?:\\/\\/x.com\\/i\\/redirect"],
    },
    "facebook": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com",
        rules: ["hc_[a-z_%\\[\\]0-9]*", "[a-z]*ref[a-z]*", "__tn__", "eid", "__(?:xts|cft)__(?:\\[|%5B)\\d(?:\\]|%5D)", "comment_tracking", "dti", "app", "video_source", "ftentidentifier", "pageid", "padding", "ls_ref", "action_history", "tracking", "referral_code", "referral_story_type", "eav", "sfnsn", "idorvanity", "wtsid", "rdc", "rdr", "paipv", "_nc_x", "_rdr", "mibextid"],
        exceptions: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/.*?(plugins|ajax)\\/", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/dialog\\/(?:share|send)", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/groups\\/member_bio\\/bio_dialog\\/", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/photo\\.php\\?", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/privacy\\/specific_audience_selector_dialog\\/", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?facebook\\.com\\/photo\\/download\\/"],
    },
    "instagram": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?instagram\\.com",
        rules: ["igshid", "igsh"],
    },
    "reddit": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?reddit.com",
        rules: ["%24deep_link", "\\$deep_link", "correlation_id", "ref_campaign", "ref_source", "%243p", "rdt", "\\$3p", "%24original_url", "\\$original_url", "_branch_match_id", "share_id"],
    },
    "amazon": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?amazon(?:\\.[a-z]{2,}){1,}",
        rules: ["p[fd]_rd_[a-z]*", "qid", "srs?", "__mk_[a-z]{1,3}_[a-z]{1,3}", "spIA", "ms3_c", "[a-z%0-9]*ie", "refRID", "colii?d", "[^a-z%0-9]adId", "qualifier", "_encoding", "smid", "field-lbr_brands_browse-bin", "ref_?", "th", "sprefix", "crid", "keywords", "cv_ct_[a-z]+", "linkCode", "creativeASIN", "ascsubtag", "aaxitk", "hsa_cr_id", "sb-ci-[a-z]+", "rnid", "dchild", "camp", "creative", "content-id", "dib", "dib_tag", "social_share", "starsLeft", "skipTwisterOG"],
        exceptions: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?amazon(?:\\.[a-z]{2,}){1,}\\/gp\\/.*?(?:redirector.html|cart\\/ajax-update.html|video\\/api\\/)", "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?amazon(?:\\.[a-z]{2,}){1,}\\/(?:hz\\/reviews-render\\/ajax\\/|message-us\\?|s\\?)"],
    },
    "aliexpress": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?aliexpress(?:\\.[a-z]{2,}){1,}",
        rules: ["ws_ab_test", "btsid", "algo_expid", "algo_pvid", "gps-id", "scm[_a-z-]*", "cv", "af", "mall_affr", "sk", "dp", "terminal_id", "aff_request_id"],
    },
    "ebay": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?ebay(?:\\.[a-z]{2,}){1,}",
        rules: ["_trkparms", "_trksid", "_from", "hash"],
    },
    "bing": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?bing(?:\\.[a-z]{2,}){1,}",
        rules: ["cvid", "sk", "sp", "sc", "qs", "qp"],
        exceptions: ["^https?:\\/\\/(?:[a-z0-9-]+\\.)*?bing(?:\\.[a-z]{2,}){1,}\\/WS\\/redirect\\/"],
    },
    "netflix": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?netflix.com",
        rules: ["trackId", "tctx", "jb[a-z]*?"],
    },
    "twitch": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?twitch\\.com",
        rules: ["tt_medium", "tt_content"],
    },
    "weibo": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?weibo\\.(cn|com)",
        rules: ["weibo_id", "dt_dapp"],
    },
    "sohu": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?sohu\\.com",
        rules: ["pvid", "scm"],
    },
    "youku.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?youku\\.com",
        rules: ["tpa"],
    },
    "tiktok.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?tiktok\\.com",
        rules: ["u_code", "preview_pb", "_d", "_t", "_r", "timestamp", "user_id", "share_app_name", "share_iid", "source"],
    },
    "spotify.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?spotify\\.com",
        rules: ["si"],
    },
    "medium.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?medium\\.com",
        rules: ["source"],
    },
    "github.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?github\\.com",
        rules: ["email_token", "email_source"],
    },
    "imdb.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?imdb\\.com",
        rules: ["ref_", "pf_rd_[a-z]*"],
    },
    "airbnb": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?airbnb\\.(com|ae|ca|co\\.in|co\\.nz|co\\.uk|co\\.za|com\\.au|com\\.mt|com\\.sg|de|gy|ie)",
        rules: ["federated_search_id", "search_type", "source", "source_impression_id"],
    },
    "snapchat.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?snapchat\\.com",
        rules: ["sc_referrer", "sc_ua"],
    },
    "yandex": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?(?:yandex(?:\\.[a-z]{2,}){1,}|ya\\.ru)",
        rules: ["lr", "redircnt"],
    },
    "LinkedIn": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?linkedin\\.com",
        rules: ["refId", "trk", "li[a-z]{2}", "trackingId"],
    },
    "walmart.com": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?walmart\\.com",
        rules: ["u1", "ath[a-z]*"],
    },
    "steampowered": {
        urlPattern: "^https?:\\/\\/(?:[a-z0-9-]+\\.)*?steampowered\\.com",
        rules: ["snr"],
    },
};


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

// 去掉白名单参数里的默认值（p=1 / t=0），其余一律不动
const stripDefaultParams = (url) => {
    const host = hostOf(url);
    const domain = Object.keys(DEFAULT_PARAMS).find(
        (d) => host === d || host.endsWith('.' + d)
    );
    if (!domain) {
        return url;
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
    const defaults = DEFAULT_PARAMS[domain];
    for (const key of [...u.searchParams.keys()]) {
        if (defaults[key] !== undefined && u.searchParams.get(key) === defaults[key]) {
            u.searchParams.delete(key);
        }
    }
    return u.toString();
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

// 懒编译：首次用到时才构造 RegExp，冷启动不为没命中的规则付代价
let CLEARURLS_COMPILED = null;

const compileClearUrls = () => {
    if (CLEARURLS_COMPILED) {
        return CLEARURLS_COMPILED;
    }
    CLEARURLS_COMPILED = Object.entries(CLEARURLS_PROVIDERS).map(([name, provider]) => ({
        name,
        match: new RegExp(provider.urlPattern, 'i'),
        exceptions: (provider.exceptions || []).map((source) => {
            try {
                return new RegExp(source, 'i');
            } catch (err) {
                return null;
            }
        }).filter(Boolean),
        rules: provider.rules.map((source) => {
            try {
                // 参数名整串匹配：`srs?` 只命中 sr / srs，不会命中 srsomething
                return new RegExp('^(?:' + source + ')$');
            } catch (err) {
                return null;
            }
        }).filter(Boolean),
    }));
    return CLEARURLS_COMPILED;
};

// 命中 provider 就按它的规则删参数；没命中退回手写黑名单。
// 例外（exceptions）只豁免这个 provider 的规则，不豁免通用黑名单——这与 ClearURLs 一致：
// 它的 globalRules 是独立的一层，provider 例外不影响它。
const stripByProviderRules = (url) => {
    let u;
    try {
        u = new URL(url);
    } catch (err) {
        return url;
    }
    for (const provider of compileClearUrls()) {
        if (!provider.match.test(url)) {
            continue;
        }
        if (provider.exceptions.some((re) => re.test(url))) {
            continue;
        }
        if (!u.search) {
            return url;
        }
        for (const key of [...u.searchParams.keys()]) {
            // provider 规则叠加在通用黑名单之上：命中 provider 后仍按 TRACKING_* 再洗一遍
            if (provider.rules.some((re) => re.test(key)) || isTrackingKey(key)) {
                u.searchParams.delete(key);
            }
        }
        return u.toString();
    }
    return stripTracking(url);
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
    return stripDefaultParams(stripQuery(target, keepForHost(hostOf(target))));
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
        return stripByProviderRules(url);
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
    'x-content-type-options': 'nosniff',
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
    compileClearUrls, stripByProviderRules, stripDefaultParams,
};
