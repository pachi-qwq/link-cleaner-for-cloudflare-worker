// ROUTER / HANDLERS 层单测：测路由选择与单条清洗的降级行为。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, cleanOne } from '../../index.js';
import { stubFetch, stubFetchThrowing } from '../../test-support/helpers.mjs';

describe('matchRule', () => {
    it('子域命中对应规则', () => {
        assert.equal(matchRule('www.bilibili.com').domain, 'bilibili.com');
        assert.equal(matchRule('item.jd.com').domain, 'jd.com');
        assert.equal(matchRule('m.tb.cn').domain, 'tb.cn');
        assert.equal(matchRule('v.douyin.com').domain, 'douyin.com');
        assert.equal(matchRule('www.xiaohongshu.com').domain, 'xiaohongshu.com');
    });

    it('裸域与短链域名各自命中', () => {
        assert.equal(matchRule('b23.tv').domain, 'b23.tv');
        assert.equal(matchRule('taobao.com').domain, 'taobao.com');
    });

    it('点边界：相似域名不命中', () => {
        assert.equal(matchRule('evil-bilibili.com'), undefined);
        assert.equal(matchRule('notbilibili.com'), undefined);
        assert.equal(matchRule('bilibili.com.evil.com'), undefined);
    });

    it('未知域名与空 host 不命中', () => {
        assert.equal(matchRule('example.com'), undefined);
        assert.equal(matchRule(''), undefined);
    });
});

describe('cleanOne', () => {
    it('未登记站点走通用追踪键清洗', async () => {
        const stub = stubFetch();
        try {
            assert.equal(await cleanOne('https://www.example.com/x?utm_source=wx&u=1'),
                'https://www.example.com/x?u=1');
        } finally {
            stub.restore();
        }
    });

    it('无法解析的 URL 原样返回', async () => {
        const stub = stubFetch();
        try {
            assert.equal(await cleanOne('https://[::1/x'), 'https://[::1/x');
        } finally {
            stub.restore();
        }
    });

    it('handler 抛错时只降级这一条', async () => {
        const stub = stubFetchThrowing((url) => url.includes('b23.tv'));
        try {
            assert.equal(await cleanOne('https://b23.tv/x'), 'https://b23.tv/x');
        } finally {
            stub.restore();
        }
    });

    it('京东搜索页保留 keyword（host 白名单不含 search.）', async () => {
        const stub = stubFetch();
        try {
            assert.equal(await cleanOne('https://search.jd.com/Search?keyword=k&spm=a1'),
                'https://search.jd.com/Search?keyword=k');
        } finally {
            stub.restore();
        }
    });

    it('京东商品页全删 query', async () => {
        const stub = stubFetch();
        try {
            assert.equal(await cleanOne('https://item.jd.com/1.html?utm_source=x'),
                'https://item.jd.com/1.html');
        } finally {
            stub.restore();
        }
    });
});
