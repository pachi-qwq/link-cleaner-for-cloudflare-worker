// Worker 用例。测试文件不是部署产物：index.js 仍是唯一源码与唯一部署产物。
// 跑法：node --test（不带参数，Node 会自动发现 test/*.test.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../index.js';
import { callWorker, callRaw, stubFetch } from '../../test-support/helpers.mjs';

test('b23 短链解析（唯一当前可用路径，作为回归锚点）', async (t) => {
    const stub = stubFetch({ 'https://b23.tv/GUOxxxx': 'https://www.bilibili.com/video/BV1M4411q7W8?share_source=copy' });
    t.after(stub.restore);
    const res = await callWorker('【标题】 https://b23.tv/GUOxxxx');
    assert.equal(await res.text(), '【标题】 https://www.bilibili.com/video/BV1M4411q7W8');
});

test('文本里的裸 % 不再抛 URIError（006 修）', async (t) => {
    const stub = stubFetch({ 'https://b23.tv/GUOxxxx': 'https://www.bilibili.com/video/BV1M' });
    t.after(stub.restore);
    const res = await callWorker('全场 50% off https://b23.tv/GUOxxxx');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '全场 50% off https://www.bilibili.com/video/BV1M');
});

// ---------- 002：路由 ----------

test('子域命中：www.bilibili.com 长链去掉追踪参数', async () => {
    const res = await callWorker('【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq?share_source=copy_web&vd_source=f3e3');
    assert.equal(await res.text(), '【何同学】 https://www.bilibili.com/video/BV1W14y1b7Mq');
});

test('子域命中：item.m.jd.com 去掉全部 query', async () => {
    const res = await callWorker('https://item.m.jd.com/product/10001058.html?utm_source=iosapp&ad_od=share');
    assert.equal(await res.text(), 'https://item.m.jd.com/product/10001058.html');
});

test('裸域 jd.com 不再抛异常（002 修 ReferenceError）', async () => {
    const res = await callWorker('https://jd.com/10001058.html?utm_source=x');
    assert.equal(await res.text(), 'https://jd.com/10001058.html');
});

test('点边界：evil-bilibili.com 不走 bilibili handler', async () => {
    // 若被误判为 bilibili，?foo=1 会被 keep 白名单删掉；走通用黑名单则原样保留
    const res = await callWorker('https://evil-bilibili.com/video/BV1?foo=1');
    assert.equal(await res.text(), 'https://evil-bilibili.com/video/BV1?foo=1');
});

// ---------- 003：参数清洗 ----------

test('pdd：goods_id 不在首位也不丢', async () => {
    const res = await callWorker('https://mobile.yangkeduo.com/goods.html?_x_org=2&goods_id=28707795&pxq_secret_key=VGKR');
    assert.equal(await res.text(), 'https://mobile.yangkeduo.com/goods.html?goods_id=28707795');
});

test('淘宝：id 不在首位也不丢，不再留悬空问号', async () => {
    const res = await callWorker('https://item.taobao.com/item.htm?spm=a1z10.3&id=67803651&skuId=55285');
    assert.equal(await res.text(), 'https://item.taobao.com/item.htm?id=67803651');
});

test('没有 query 的链接一个字符都不改', async () => {
    const res = await callWorker('https://item.taobao.com/item.htm');
    assert.equal(await res.text(), 'https://item.taobao.com/item.htm');
});

test('必需参数缺失时不悬空问号，fragment 保留', async () => {
    const res = await callWorker('https://mobile.yangkeduo.com/goods.html?a=1#reviews');
    assert.equal(await res.text(), 'https://mobile.yangkeduo.com/goods.html#reviews');
});

test('京东删掉全部 query，路径不动', async () => {
    const res = await callWorker('https://item.jd.com/10001058.html?utm_source=iosapp&ad_od=share');
    assert.equal(await res.text(), 'https://item.jd.com/10001058.html');
});

test('京东搜索页不能全删：keyword 是业务参数（回归锚点）', async () => {
    const res = await callWorker('https://search.jd.com/Search?keyword=%E9%94%AE%E7%9B%98&enc=utf-8&spm=a1');
    assert.equal(await res.text(), 'https://search.jd.com/Search?keyword=%E9%94%AE%E7%9B%98&enc=utf-8');
});

test('B站业务参数 p / t 必须保留', async () => {
    const res = await callWorker('https://www.bilibili.com/video/BV1x?p=2&t=30&share_source=copy');
    assert.equal(await res.text(), 'https://www.bilibili.com/video/BV1x?p=2&t=30');
});

// ---------- 004：短链解析 ----------

test('douyin 短链解析成 video 直链（不依赖 Location 头）', async (t) => {
    const stub = stubFetch({ 'https://v.douyin.com/rHKxxxx/': 'https://www.iesdouyin.com/share/video/7168098046780214580/?region=CN' });
    t.after(stub.restore);
    const res = await callWorker('https://v.douyin.com/rHKxxxx/');
    assert.equal(await res.text(), 'https://www.douyin.com/video/7168098046780214580');
});

test('douyin 用户主页短链不能被伪造成 video 链接（回归锚点）', async (t) => {
    const stub = stubFetch({ 'https://v.douyin.com/abc/': 'https://www.iesdouyin.com/share/user/1234567890/' });
    t.after(stub.restore);
    const res = await callWorker('https://v.douyin.com/abc/');
    assert.equal(await res.text(), 'https://v.douyin.com/abc/');
});

test('没有链接的文本原样返回，不能被吞成空 body（回归锚点）', async () => {
    const res = await callWorker('今天天气不错，晚上吃火锅');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), '今天天气不错，晚上吃火锅');
});

test('tb.cn 短链解析后保留商品 id', async (t) => {
    const stub = stubFetch({ 'https://m.tb.cn/h.fAwWH69': 'https://item.taobao.com/item.htm?spm=a1&id=67803651&skuId=5' });
    t.after(stub.restore);
    const res = await callWorker('https://m.tb.cn/h.fAwWH69');
    assert.equal(await res.text(), 'https://item.taobao.com/item.htm?id=67803651');
});

test('单条解析失败只影响它自己', async (t) => {
    const real = globalThis.fetch;
    t.after(() => { globalThis.fetch = real; });
    globalThis.fetch = async (url, init) => {
        if (String(url).includes('/bad')) throw new Error('boom');
        return { url: String(url), status: 200, headers: { get: () => null }, text: async () => '' };
    };
    const res = await callWorker('https://b23.tv/bad https://b23.tv/good');
    assert.equal(await res.text(), 'https://b23.tv/bad https://b23.tv/good');
});

test('HEAD 被拒时降级 GET', async (t) => {
    const seen = [];
    const real = globalThis.fetch;
    t.after(() => { globalThis.fetch = real; });
    globalThis.fetch = async (url, init) => {
        seen.push(init.method);
        if (init.method === 'HEAD') {
            return { url: '', status: 403, headers: { get: () => null }, text: async () => '' };
        }
        return { url: 'https://www.bilibili.com/video/BV1x', status: 200, headers: { get: () => null }, text: async () => '' };
    };
    await callWorker('https://b23.tv/x');
    assert.deepEqual(seen, ['HEAD', 'GET']);
});

test('30 条链接：最多 20 个子请求，并发不超过 5', async (t) => {
    let inflight = 0;
    let peak = 0;
    let total = 0;
    const real = globalThis.fetch;
    t.after(() => { globalThis.fetch = real; });
    globalThis.fetch = async () => {
        total++;
        inflight++;
        peak = Math.max(peak, inflight);
        await new Promise((r) => setTimeout(r, 5));
        inflight--;
        return { url: '', status: 200, headers: { get: () => null }, text: async () => '' };
    };
    const text = Array.from({ length: 30 }, (_, i) => 'https://b23.tv/x' + i).join(' ');
    await callWorker(text);
    assert.equal(total, 20);
    assert.ok(peak <= 5, 'peak concurrency ' + peak);
});

// ---------- 005：通用去参与小红书 ----------

test('未知站点：删追踪键，保留业务参数', async () => {
    const res = await callWorker('看这个 https://www.example.com/123.html?u=1&utm_source=wx&utm_medium=share');
    assert.equal(await res.text(), '看这个 https://www.example.com/123.html?u=1');
});

test('未知站点：只有追踪键时不留悬空问号', async () => {
    const res = await callWorker('https://www.example.com/x?utm_source=wx');
    assert.equal(await res.text(), 'https://www.example.com/x');
});

test('业务参数 ?v= 绝不能被删（防通用分支变死链）', async () => {
    const res = await callWorker('https://www.youtube.com/watch?v=abc123&utm_source=wx&share_source=copy');
    assert.equal(await res.text(), 'https://www.youtube.com/watch?v=abc123');
});

test('小红书 web 链接只留 xsec_token', async () => {
    const res = await callWorker('https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz123&xsec_source=pc_share&share_from_user_hidden=true');
    assert.equal(await res.text(), 'https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz123');
});

test('小红书短链解析后同样保留 xsec_token', async (t) => {
    const stub = stubFetch({ 'https://xhslink.com/a/abcDEF': 'https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz&xsec_source=pc_share' });
    t.after(stub.restore);
    const res = await callWorker('https://xhslink.com/a/abcDEF');
    assert.equal(await res.text(), 'https://www.xiaohongshu.com/discovery/item/66f1a2b3?xsec_token=ABxyz');
});

// ---------- 006：接口契约 ----------

test('百分号编码的 target 能正常处理', async () => {
    const res = await callWorker('https://item.jd.com/1.html?utm_source=a');
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'https://item.jd.com/1.html');
});

test('原始未编码 target 仍可用，内部 & 不被截断', async () => {
    const res = await callRaw('https://item.jd.com/1.html?utm_source=a&ad_od=b');
    assert.equal(await res.text(), 'https://item.jd.com/1.html');
});

test('缺少 target 返回 400 且有提示', async () => {
    const res = await worker.fetch(new Request('https://w.dev/'), {}, {});
    assert.equal(res.status, 400);
    assert.match(await res.text(), /target/);
});

test('POST 返回 405', async () => {
    const res = await worker.fetch(new Request('https://w.dev/?target=x', { method: 'POST' }), {}, {});
    assert.equal(res.status, 405);
    assert.equal(res.headers.get('allow'), 'GET, HEAD, OPTIONS');
});

test('响应头：text/plain + CORS + no-store', async () => {
    const res = await callWorker('https://item.jd.com/1.html');
    assert.match(res.headers.get('content-type'), /text\/plain/);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
    assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('OPTIONS 返回 204 预检', async () => {
    const res = await worker.fetch(new Request('https://w.dev/', { method: 'OPTIONS' }), {}, {});
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('access-control-allow-origin'), '*');
});

test('HEAD 放行并正常处理', async () => {
    const url = 'https://w.dev/?target=' + encodeURIComponent('https://item.jd.com/1.html');
    const res = await worker.fetch(new Request(url, { method: 'HEAD' }), {}, {});
    assert.equal(res.status, 200);
});
