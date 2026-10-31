import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useBookmarks } from './useBookmarks';

const bookmark = {
    id: 1,
    name: 'Saved bookmark',
    shortcut: 'saved',
    description: '',
    url: 'https://example.invalid',
    urls: '',
    isVisible: true,
    bookmarkGroup: 'Saved',
    sortOrder: 0,
    profile: 'home',
    isFavorite: false,
};

let root: Root;
let state: ReturnType<typeof useBookmarks>;
let container: HTMLDivElement;

function Probe() {
    state = useBookmarks();
    return null;
}

async function mount() {
    await act(async () => {
        root.render(createElement(Probe));
    });
}

const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

beforeEach(() => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, value),
    });
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
});

afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

it('surfaces profiles-only HTTP 500 even when bookmarks succeed later', async () => {
    let resolveBookmarks!: (value: Response) => void;
    const bookmarks = new Promise<Response>((resolve) => {
        resolveBookmarks = resolve;
    });
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) =>
            url.endsWith('/profiles') ? Promise.resolve(response({}, 500)) : bookmarks,
        ),
    );
    await mount();
    await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
    });
    expect(state.error).toContain('Failed to fetch profiles: 500');
    expect(console.error).toHaveBeenCalledWith(
        '[webbookmarks] Failed to load profiles:',
        expect.any(Error),
    );
    await act(async () => resolveBookmarks(response([bookmark])));
    expect(state.bookmarks).toEqual([bookmark]);
    expect(state.loading).toBe(false);
    expect(state.error).toContain('Failed to fetch profiles: 500');
});

it.each([[{}], [['home', 7]]])(
    'rejects malformed profiles without replacing saved profiles: %j',
    async (body) => {
        localStorage.setItem('profiles', JSON.stringify(['home', 'work']));
        localStorage.setItem('bookmarks_home', JSON.stringify([bookmark]));
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) =>
                Promise.resolve(response(url.endsWith('/profiles') ? body : [bookmark])),
            ),
        );
        await mount();
        expect(state.profiles).toEqual(['home', 'work']);
        expect(state.bookmarks).toEqual([bookmark]);
        expect(state.error).toBe('The server returned an invalid profiles list.');
        expect(JSON.parse(localStorage.getItem('profiles')!)).toEqual(['home', 'work']);
        expect(console.error).toHaveBeenCalled();
    },
);

it('keeps usable saved profiles and bookmarks on offline failures', async () => {
    localStorage.setItem('profiles', JSON.stringify(['home', 'work']));
    localStorage.setItem('bookmarks_home', JSON.stringify([bookmark]));
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Offline')));
    await mount();
    await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
    });
    expect(state.profiles).toEqual(['home', 'work']);
    expect(state.bookmarks).toEqual([bookmark]);
    expect(state.loading).toBe(false);
    expect(state.error).toContain('Offline');
    expect(console.error).toHaveBeenCalled();
});

it.each(['{broken', '{"unexpected":true}', '["home",7]'])(
    'surfaces an invalid profile cache before the server answers: %s',
    async (cached) => {
        localStorage.setItem('profiles', cached);
        localStorage.setItem('bookmarks_home', JSON.stringify([bookmark]));
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) =>
                url.endsWith('/profiles')
                    ? new Promise<Response>(() => {})
                    : Promise.resolve(response([bookmark])),
            ),
        );
        await mount();
        expect(state.profiles).toEqual([]);
        expect(state.bookmarks).toEqual([bookmark]);
        expect(state.error).toBe('Saved profiles could not be read.');
        expect(console.error).toHaveBeenCalled();
    },
);
