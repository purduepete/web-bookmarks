import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { test } from 'node:test';

const source = readFileSync(new URL('./src/palette.user.js', import.meta.url), 'utf8');
const header = readFileSync(new URL('./src/header.txt', import.meta.url), 'utf8');
const constants = source.slice(source.indexOf('    const APP_URL'), source.indexOf('    // Don\'t show palette'));
const requests = source.slice(source.indexOf('    function requestApi('), source.indexOf('    async function getGroups('));

function api(response) {
    let request;
    const context = vm.createContext({
        URL,
        GM_xmlhttpRequest(options) {
            request = options;
            response(options);
        },
    });
    vm.runInContext(constants + requests + '\nthis.api = { fetchBookmarks, fetchProfiles };', context);
    return { ...context.api, request: () => request };
}

test('bookmark and profile requests use the public host and browser cookies', async () => {
    const client = api(options => options.onload({ status: 200, responseText: '[]' }));
    await client.fetchBookmarks('work & home');
    assert.equal(client.request().url, 'https://web-bookmarks.jimlertech.com/api/bookmarks?profile=work%20%26%20home');
    assert.equal(client.request().anonymous, false);
    await client.fetchBookmarks();
    assert.equal(client.request().url, 'https://web-bookmarks.jimlertech.com/api/bookmarks');
    await client.fetchProfiles();
    assert.equal(client.request().url, 'https://web-bookmarks.jimlertech.com/api/bookmarks/profiles');
    assert.match(header, /@connect\s+web-bookmarks\.jimlertech\.com/);
    assert.doesNotMatch(header + constants, /tail8ad282|8792/);
});

test('Access redirects, login HTML and denied sessions request interactive sign-in', async () => {
    for (const response of [
        { status: 302, responseText: '' },
        { status: 401, responseText: '' },
        { status: 403, responseText: '' },
        { status: 200, finalUrl: 'https://yellow-field-eef5.cloudflareaccess.com/cdn-cgi/access/login', responseText: '' },
        { status: 200, finalUrl: 'https://web-bookmarks.jimlertech.com/cdn-cgi/access/login', responseText: '' },
        { status: 200, responseText: '<!DOCTYPE html><title>Sign in</title>' },
    ]) {
        const client = api(options => options.onload(response));
        await assert.rejects(client.fetchBookmarks(), { name: 'SignInRequiredError' });
    }
});

test('server errors, invalid JSON, network failures and timeouts remain explicit', async () => {
    for (const [respond, expected] of [
        [options => options.onload({ status: 500, responseText: '' }), /HTTP 500/],
        [options => options.onload({ status: 502, responseText: '<html>Bad gateway</html>' }), /HTTP 502/],
        [options => options.onload({ status: 200, responseText: 'invalid' }), /Unexpected token/],
        [options => options.onerror(), /Cannot reach WebBookmarks/],
        [options => options.ontimeout(), /Request timed out/],
    ]) {
        await assert.rejects(api(respond).fetchProfiles(), expected);
    }
});

test('sign-in error gives a user-initiated link to the public app', () => {
    const start = source.indexOf('            setError(msg,');
    const end = source.indexOf('        return activePaletteHandle;', start);
    const method = source.slice(start, end).trim().replace(/,\s*};$/, '');
    const element = () => ({
        children: [],
        appendChild(child) { this.children.push(child); },
        replaceChildren() { this.children = []; },
        addEventListener(event, callback) { this[event] = callback; },
    });
    const listEl = element();
    let opened;
    const context = vm.createContext({
        listEl,
        loading: true,
        document: { createElement: element },
        GM_openInTab: (url, options) => { opened = { url, options }; },
    });
    vm.runInContext(constants + 'this.handle = {' + method + '};', context);
    context.handle.setError('Sign in first.', true);
    assert.equal(context.loading, false);
    const button = listEl.children[0].children[1];
    assert.equal(button.textContent, 'Sign in to WebBookmarks');
    assert.equal(opened, undefined);
    button.click();
    assert.equal(opened.url, 'https://web-bookmarks.jimlertech.com');
    assert.equal(opened.options.active, true);
    context.handle.setError('HTTP 500');
    assert.equal(listEl.children[0].children.length, 0);
});
