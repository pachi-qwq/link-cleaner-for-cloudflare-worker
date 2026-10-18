// UTILS 层单测：不起 Worker、不发请求，直接测纯函数。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
    parseUrls, stripQuery, stripTracking, isTrackingKey, hostOf,
    keepForHost, safeDecode, readTarget, mapLimit,
} from '../../index.js';

describe('parseUrls', () => {
    it('非字符串返回空数组', () => {
        assert.deepEqual(parseUrls(null), []);
        assert.deepEqual(parseUrls(undefined), []);
        assert.deepEqual(parseUrls(''), []);
    });

    it('没有链接的文本返回空数组', () => {
        assert.deepEqual(parseUrls('今天天气不错，晚上吃火锅'), []);
    });

    it('按文本顺序取出多个链接', () => {
        assert.deepEqual(
            parseUrls('a https://x.com/1 b https://y.com/2?z=1'),
            ['https://x.com/1', 'https://y.com/2?z=1'],
        );
    });

    it('大写 scheme 也能匹配', () => {
        assert.deepEqual(parseUrls('看 HTTPS://X.com/A'), ['HTTPS://X.com/A']);
    });

    it('连续调用结果一致（不残留 lastIndex）', () => {
        const text = 'https://a.com/1 https://b.com/2';
        assert.deepEqual(parseUrls(text), parseUrls(text));
        assert.deepEqual(parseUrls(text), ['https://a.com/1', 'https://b.com/2']);
    });
});

describe('stripQuery', () => {
    it('非字符串与空串返回空串', () => {
        assert.equal(stripQuery(null), '');
        assert.equal(stripQuery(42), '');
        assert.equal(stripQuery(''), '');
    });

    it('非法 URL 原样返回', () => {
        assert.equal(stripQuery('https://[::1/x'), 'https://[::1/x');
    });

    it('没有 query 时一个字符都不改', () => {
        assert.equal(stripQuery('https://a.com/X'), 'https://a.com/X');
        assert.equal(stripQuery('https://a.com/x#frag'), 'https://a.com/x#frag');
    });

    it('keep 为空时删光 query 且不留悬空问号', () => {
        assert.equal(stripQuery('https://a.com/x?a=1&b=2'), 'https://a.com/x');
    });

    it('只保留白名单键，顺序不动', () => {
        assert.equal(stripQuery('https://a.com/x?a=1&id=2&b=3', ['id']), 'https://a.com/x?id=2');
    });

    it('同名重复键都保留', () => {
        assert.equal(stripQuery('https://a.com/x?id=1&id=2', ['id']), 'https://a.com/x?id=1&id=2');
    });

    it('删完 query 后 fragment 仍在', () => {
        assert.equal(stripQuery('https://a.com/x?a=1#reviews', []), 'https://a.com/x#reviews');
    });
});

describe('stripTracking', () => {
    it('只删追踪键，业务参数保留', () => {
        assert.equal(stripTracking('https://a.com/x?v=abc&utm_source=wx'), 'https://a.com/x?v=abc');
    });

    it('全是追踪键时不留 query', () => {
        assert.equal(stripTracking('https://a.com/x?utm_source=wx&share_medium=qq'), 'https://a.com/x');
    });

    it('没有 query 时原样返回', () => {
        assert.equal(stripTracking('https://a.com/x'), 'https://a.com/x');
    });

    it('空值与非法 URL 容错', () => {
        assert.equal(stripTracking(''), '');
        assert.equal(stripTracking('https://[::1/x'), 'https://[::1/x');
    });
});

describe('isTrackingKey', () => {
    it('前缀与精确键都识别', () => {
        for (const key of ['utm_source', 'utm_medium', 'share_tag', 'share_source', '_wvx', 'spm', 'scm', 't', 'vd_source']) {
            assert.equal(isTrackingKey(key), true, key);
        }
    });

    it('业务参数不误判', () => {
        for (const key of ['id', 'goods_id', 'v', 'q', 'p', 'keyword', 'xsec_token']) {
            assert.equal(isTrackingKey(key), false, key);
        }
    });
});

describe('hostOf', () => {
    it('正常 URL 返回 hostname', () => {
        assert.equal(hostOf('https://www.a.com/x?y=1'), 'www.a.com');
    });

    it('空值与非法 URL 返回空串', () => {
        assert.equal(hostOf(''), '');
        assert.equal(hostOf('https://[::1/x'), '');
    });
});

describe('keepForHost', () => {
    it('子域命中父域名规则', () => {
        assert.deepEqual(keepForHost('item.taobao.com'), ['id']);
        assert.deepEqual(keepForHost('www.bilibili.com'), ['p', 't']);
    });

    it('裸域命中', () => {
        assert.deepEqual(keepForHost('taobao.com'), ['id']);
    });

    it('点边界：相似域名不命中', () => {
        assert.deepEqual(keepForHost('evil-taobao.com'), []);
        assert.deepEqual(keepForHost('notbilibili.com'), []);
    });

    it('未知域名返回空数组', () => {
        assert.deepEqual(keepForHost('example.com'), []);
    });
});

describe('safeDecode', () => {
    it('正常编码串解码', () => {
        assert.equal(safeDecode('%E4%B8%AD%E6%96%87'), '中文');
    });

    it('坏百分号原样返回，不抛异常', () => {
        assert.equal(safeDecode('全场 50% off'), '全场 50% off');
    });

    it('空值返回空串', () => {
        assert.equal(safeDecode(''), '');
        assert.equal(safeDecode(null), '');
    });
});

describe('readTarget', () => {
    it('取出 target 值', () => {
        assert.equal(readTarget('https://w.dev/?target=abc'), 'abc');
    });

    it('原始文本里的 & 不被截断', () => {
        assert.equal(readTarget('https://w.dev/?target=https://a.com/x?y=1&z=2'), 'https://a.com/x?y=1&z=2');
    });

    it('fragment 被截掉', () => {
        assert.equal(readTarget('https://w.dev/?target=a#hash'), 'a');
    });

    it('target 不在第一位也能取到', () => {
        assert.equal(readTarget('https://w.dev/?foo=1&target=abc'), 'abc');
    });

    it('缺少 ?target= 返回空串', () => {
        assert.equal(readTarget('https://w.dev/'), '');
        assert.equal(readTarget('https://w.dev/?other=1'), '');
    });
});

describe('mapLimit', () => {
    it('空数组返回空数组', async () => {
        assert.deepEqual(await mapLimit([], 5, async (x) => x), []);
    });

    it('limit 大于数组长度不报错', async () => {
        assert.deepEqual(await mapLimit(['a', 'b'], 5, async (x) => x.toUpperCase()), ['A', 'B']);
    });

    it('输出顺序与输入一致（完成顺序被打乱）', async () => {
        const out = await mapLimit([30, 1, 20, 5], 4, async (ms) => {
            await new Promise((r) => setTimeout(r, ms));
            return ms;
        });
        assert.deepEqual(out, [30, 1, 20, 5]);
    });

    it('并发不超过 limit', async () => {
        let inflight = 0;
        let peak = 0;
        await mapLimit(Array.from({ length: 20 }, (_, i) => i), 3, async (i) => {
            inflight++;
            peak = Math.max(peak, inflight);
            await new Promise((r) => setTimeout(r, 2));
            inflight--;
            return i;
        });
        assert.ok(peak <= 3, `peak ${peak}`);
    });

    it('limit=1 时严格串行', async () => {
        const seen = [];
        await mapLimit([1, 2, 3], 1, async (i) => {
            seen.push(`start${i}`);
            await new Promise((r) => setTimeout(r, 1));
            seen.push(`end${i}`);
            return i;
        });
        assert.deepEqual(seen, ['start1', 'end1', 'start2', 'end2', 'start3', 'end3']);
    });
});
