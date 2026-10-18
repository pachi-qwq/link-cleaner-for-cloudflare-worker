// 测试公共件：入口调用与 fetch 桩。不被任何运行时代码引用。
import worker from '../index.js';

// 契约：target 按标准做百分号编码
export const callWorker = async (text) =>
    worker.fetch(new Request('https://w.dev/?target=' + encodeURIComponent(text)), {}, {});

// 兼容性入口：原始未编码文本（内部 & 不能被截断）
export const callRaw = async (raw) =>
    worker.fetch(new Request('https://w.dev/?target=' + raw), {}, {});

// 替换全局 fetch，返回 { calls, restore }。
// CF 语义建模：Worker 内新建的 fetch 默认跟随重定向，跟随之后
// headers.get('Location') 为 null，最终地址只能从 .url 读。
// 不要为了让某个用例通过而让它返回真实 Location —— 那等于在测试里
// 假装已经修掉的 bug 不存在。
export const stubFetch = (map = {}, body = '') => {
    const prev = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, init = {}) => {
        calls.push({ url: String(url), method: init.method || 'GET' });
        const dest = map[String(url)] || String(url);
        return {
            url: dest,
            status: 200,
            headers: { get: () => null },
            text: async () => body,
        };
    };
    return { calls, restore: () => { globalThis.fetch = prev; } };
};

// 让某类 URL 抛错的桩：用于验证"单条失败只降级自己"
export const stubFetchThrowing = (predicate) => {
    const prev = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
        if (predicate(String(url), init)) {
            throw new Error('stubbed network failure');
        }
        return {
            url: String(url),
            status: 200,
            headers: { get: () => null },
            text: async () => '',
        };
    };
    return { restore: () => { globalThis.fetch = prev; } };
};
