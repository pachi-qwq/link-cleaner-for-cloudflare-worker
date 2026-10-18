// /clean?url= 单链接 JSON 接口的契约用例。
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../index.js';
import { callWorker, stubFetch } from '../../test-support/helpers.mjs';

const cleanReq = (query) => worker.fetch(new Request('https://w.dev/clean?' + query), {}, {});
const cleanJson = async (query) => {
    const res = await cleanReq(query);
    return {status: res.status, headers: res.headers, body: await res.json()};
};
const enc = (value) => encodeURIComponent(value);

test('/clean：京东商品页命中规则并去掉追踪参数', async () => {
    const {status, headers, body} = await cleanJson('url=' + enc('https://item.jd.com/1.html?utm_source=x'));
    assert.equal(status, 200);
    assert.match(headers.get('content-type'), /^application\/json/);
    assert.equal(body.input, 'https://item.jd.com/1.html?utm_source=x');
    assert.equal(body.output, 'https://item.jd.com/1.html');
    assert.equal(body.host, 'item.jd.com');
    assert.equal(body.rule, 'jd.com');
    assert.equal(body.changed, true);
});

test('/clean：未登记站点 rule 为 null，走通用追踪键清洗', async () => {
    const {body} = await cleanJson('url=' + enc('https://www.example.com/x?utm_source=wx&u=1'));
    assert.equal(body.rule, null);
    assert.equal(body.output, 'https://www.example.com/x?u=1');
});

test('/clean：没有可删参数时 changed=false', async () => {
    const {body} = await cleanJson('url=' + enc('https://item.jd.com/1.html'));
    assert.equal(body.output, body.input);
    assert.equal(body.changed, false);
});

test('/clean：缺 url 返回 400', async () => {
    const {status, body} = await cleanJson('');
    assert.equal(status, 400);
    assert.deepEqual(body, {error: 'missing url'});
});

test('/clean：非法 URL 返回 400', async () => {
    const {status, body} = await cleanJson('url=not-a-url');
    assert.equal(status, 400);
    assert.deepEqual(body, {error: 'invalid url'});
});

test('/clean：非 http(s) 协议返回 400', async () => {
    const {status, body} = await cleanJson('url=' + enc('ftp://a.com/x'));
    assert.equal(status, 400);
    assert.deepEqual(body, {error: 'unsupported scheme'});
});

test('/clean 与文本接口对同一链接输出必须一致（防两条逻辑漂移）', async (t) => {
    const stub = stubFetch({ 'https://b23.tv/GUOxxxx': 'https://www.bilibili.com/video/BV1M?share_source=copy' });
    t.after(stub.restore);
    for (const link of [
        'https://b23.tv/GUOxxxx',
        'https://item.taobao.com/item.htm?spm=a1&id=678',
        'https://www.example.com/x?utm_source=wx&u=1',
        'https://item.jd.com/1.html',
    ]) {
        const fromJson = (await cleanJson('url=' + enc(link))).body.output;
        const fromText = await (await callWorker(link)).text();
        assert.equal(fromJson, fromText, link);
    }
});

test('/clean：POST 返回 405（沿用入口方法检查）', async () => {
    const res = await worker.fetch(new Request('https://w.dev/clean?url=x', {method: 'POST'}), {}, {});
    assert.equal(res.status, 405);
});

test('/clean：OPTIONS 返回 204', async () => {
    const res = await worker.fetch(new Request('https://w.dev/clean?url=x', {method: 'OPTIONS'}), {}, {});
    assert.equal(res.status, 204);
});
