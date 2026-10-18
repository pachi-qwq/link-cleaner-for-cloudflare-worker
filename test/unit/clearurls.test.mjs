// ClearURLs 精选规则（27 个 provider）的行为与结构用例。
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { compileClearUrls, stripByProviderRules } from '../../index.js';
import { CLEARURLS_CASES } from '../../test-support/fixtures.mjs';

describe('ClearURLs 精选规则：逐站点行为', () => {
    for (const [input, want] of CLEARURLS_CASES) {
        it(`${new URL(input).hostname}`, () => {
            assert.equal(stripByProviderRules(input), want);
        });
    }
});

describe('ClearURLs 精选规则：结构与边界', () => {
    it('27 个 provider 全部可编译，且每个至少有 1 条规则', () => {
        const compiled = compileClearUrls();
        assert.equal(compiled.length, 27);
        for (const provider of compiled) {
            assert.ok(provider.match instanceof RegExp, provider.name + ' pattern');
            assert.ok(provider.rules.length > 0, provider.name + ' rules');
        }
    });

    it('命中 exceptions 的 URL 原样返回（facebook 分享弹窗）', () => {
        const url = 'https://www.facebook.com/dialog/share?app_id=1&utm_source=wx';
        assert.equal(stripByProviderRules(url), url);
    });

    it('未命中 provider 的站点仍走手写黑名单', () => {
        assert.equal(stripByProviderRules('https://www.example.com/x?utm_source=wx&u=1'),
            'https://www.example.com/x?u=1');
    });

    it('provider 规则与通用黑名单叠加（youtube 的 utm_* 也要删）', () => {
        assert.equal(
            stripByProviderRules('https://www.youtube.com/watch?v=abc&gclid=1&utm_source=wx&share_source=copy'),
            'https://www.youtube.com/watch?v=abc',
        );
    });

    it('没有 query 的链接原样返回', () => {
        assert.equal(stripByProviderRules('https://weibo.com/1234/abcd'), 'https://weibo.com/1234/abcd');
    });
});
