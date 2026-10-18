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

test('已知缺陷锚点：jd 链接抛 ReferenceError（002 修）', async () => {
    await assert.rejects(callWorker('https://jd.com/10001058.html?utm_source=x'), /uri is not defined/);
});

test('已知缺陷锚点：百分比文本抛 URIError（006 修）', async () => {
    await assert.rejects(callWorker('全场 50% off https://b23.tv/GUOxxxx'), /URI malformed/);
});
