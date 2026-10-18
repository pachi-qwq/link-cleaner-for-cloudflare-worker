// Worker 用例。测试文件不是部署产物：index.js 仍是唯一源码与唯一部署产物。
// 跑法：node --test（不带参数，Node 会自动发现 test/*.test.mjs）
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../index.js';

// 今天的入参契约是「原文未编码直接拼在 ?target= 后面」（见 index.js 的 getUrlParams）。
// 006 会改成百分号编码，届时只改这一个函数。
const callWorker = async (text) =>
    worker.fetch({ url: 'https://w.dev/?target=' + text }, {}, {});

// 替换全局 fetch，返回调用记录与恢复函数。
// CF 语义建模：follow 之后 headers 里没有 Location，最终地址只能从 .url 读。
const stubFetch = (map, body = '') => {
    const prev = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init) => {
        calls.push({ url: String(url), method: (init && init.method) || 'GET' });
        const dest = map[String(url)] || String(url);
        return { url: dest, status: 200, headers: { get: () => null }, text: async () => body };
    };
    return { calls, restore: () => { globalThis.fetch = prev; } };
};

test('b23 短链解析（唯一当前可用路径，作为回归锚点）', async (t) => {
    const stub = stubFetch({ 'https://b23.tv/GUOxxxx': 'https://www.bilibili.com/video/BV1M4411q7W8?share_source=copy' });
    t.after(stub.restore);
    const res = await callWorker('【标题】 https://b23.tv/GUOxxxx');
    assert.equal(await res.text(), '【标题】 https://www.bilibili.com/video/BV1M4411q7W8');
});

test('已知缺陷锚点：百分比文本抛 URIError（006 修）', async () => {
    await assert.rejects(callWorker('全场 50% off https://b23.tv/GUOxxxx'), /URI malformed/);
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

test('evil-bilibili.com 不被误认为 bilibili', async () => {
    const res = await callWorker('https://evil-bilibili.com/video/BV1?share_source=x');
    assert.equal(await res.text(), 'https://evil-bilibili.com/video/BV1?share_source=x');
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

test('B站业务参数 p / t 必须保留', async () => {
    const res = await callWorker('https://www.bilibili.com/video/BV1x?p=2&t=30&share_source=copy');
    assert.equal(await res.text(), 'https://www.bilibili.com/video/BV1x?p=2&t=30');
});
