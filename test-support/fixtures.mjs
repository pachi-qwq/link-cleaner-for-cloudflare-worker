// 真实分享文本样例：照抄用户实际粘贴的形态，不要美化成干净 URL。
// 单测和集成测试共用；新增站点时在这里加一条。
export const SHARE_TEXTS = {
    biliShort: '【让你的耳朵怀孕！《A Moment Apart》极限竞速：地平线4配乐-哔哩哔哩】 https://b23.tv/BV1M4411q7W8',
    biliLong: '【【何同学】我做了一个自己打字的键盘...】 https://www.bilibili.com/video/BV1W14y1b7Mq?share_source=copy_web&vd_source=f3e330de995a48b819604c85bc0dxxxx',
    pdd: 'https://mobile.yangkeduo.com/goods.html?_x_org=2&refer_share_uin=KSF&goods_id=28707795&pxq_secret_key=VGKR&_wvx=10',
    taobaoShort: '【淘宝】https://m.tb.cn/h.fAwWH69?tk=XTP02u5 CZ3457 「LuatOS墨水屏开发板（每个ID限购1件,,多拍不发）」',
    taobaoLong: 'https://item.taobao.com/item.htm?spm=a21bo.jianhua&id=820478945544&skuId=5528532737270&utparam=%7B%22item_ctr%22%3A0.39%7D',
    jd: 'https://item.m.jd.com/product/10001058.html?&utm_source=iosapp&utm_medium=appshare&utm_campaign=t_335139774&ad_od=share',
    jdSearch: 'https://search.jd.com/Search?keyword=%E9%94%AE%E7%9B%98&enc=utf-8&spm=a1',
    douyin: '7.46 jcA:/ 复制打开抖音，看看【宽甸魔笛琴行的作品】中国足球 何日出头 https://v.douyin.com/rHKxxxx/',
    xhsWeb: 'https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz123&xsec_source=pc_share&share_from_user_hidden=true',
    general: 'asdfafd 智能abc https://www.example.com/123.html?u=1&utm_source=wx',
    percent: '全场 50% off https://item.jd.com/1.html?utm_source=a',
};

// ClearURLs 精选规则的期望输出（来源：上游 rules 逐条核对，见 plans/009）
export const CLEARURLS_CASES = [
    ['https://weibo.com/1234/abcd?weibo_id=1&dt_dapp=1&from=page', 'https://weibo.com/1234/abcd?from=page'],
    ['https://www.youtube.com/watch?v=abc&gclid=1&feature=share&si=xyz', 'https://www.youtube.com/watch?v=abc'],
    ['https://www.instagram.com/p/ABC/?igshid=xyz', 'https://www.instagram.com/p/ABC/'],
    ['https://www.sohu.com/a/1_2?pvid=abc&scm=1', 'https://www.sohu.com/a/1_2'],
    ['https://v.youku.com/v_show/id_X.html?tpa=1', 'https://v.youku.com/v_show/id_X.html'],
    ['https://www.tiktok.com/@u/video/1?u_code=abc&_d=1', 'https://www.tiktok.com/@u/video/1'],
    ['https://www.ebay.com/itm/1?_trkparms=x&_trksid=y', 'https://www.ebay.com/itm/1'],
    ['https://www.aliexpress.com/item/1.html?ws_ab_test=1&btsid=2', 'https://www.aliexpress.com/item/1.html'],
    ['https://github.com/u/r?email_token=abc', 'https://github.com/u/r'],
    ['https://medium.com/@u/post?source=email-abc', 'https://medium.com/@u/post'],
];

// 短链解析桩：key 是请求的短链，value 是 302 之后的最终地址
export const REDIRECTS = {
    'https://b23.tv/BV1M4411q7W8': 'https://www.bilibili.com/video/BV1M4411q7W8?share_source=copy',
    'https://b23.tv/GUOxxxx': 'https://www.bilibili.com/video/BV1M4411q7W8?share_source=copy',
    'https://m.tb.cn/h.fAwWH69': 'https://item.taobao.com/item.htm?spm=a1&id=67803651&skuId=5',
    'https://v.douyin.com/rHKxxxx/': 'https://www.iesdouyin.com/share/video/7168098046780214580/?region=CN',
    'https://v.douyin.com/abc/': 'https://www.iesdouyin.com/share/user/1234567890/',
    'https://xhslink.com/a/abcDEF': 'https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz&xsec_source=pc_share',
};
