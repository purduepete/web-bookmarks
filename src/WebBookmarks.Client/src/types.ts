// The canonical bookmark/group shapes now live in the shared palette-core so
// they can be reused by the userscript build. Re-exported here under the names
// the React client already uses to avoid touching every import site.
export type { Bookmark as WebBookmarksItem, BookmarkGroup } from './palette-core/types';
