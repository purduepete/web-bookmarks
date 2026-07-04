// Builds the shippable Tampermonkey userscript from src/palette.user.js.
//
// The source module imports the shared palette-core logic (the single source of
// truth also used by the React web app). esbuild bundles that core inline and we
// prepend the ==UserScript== metadata from src/header.txt as a verbatim banner so
// Tampermonkey still sees it at the very top of the file.
//
// Output: ../webbookmarks-palette.user.js (the file Tampermonkey / the Gist ship).
// Run with `npm run build` from the tampermonkey/ folder.
import * as esbuild from 'esbuild';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const header = readFileSync(resolve(here, 'src', 'header.txt'), 'utf8').trimEnd();

await esbuild.build({
    entryPoints: [resolve(here, 'src', 'palette.user.js')],
    bundle: true,
    format: 'iife',
    target: 'es2020',
    charset: 'utf8',
    legalComments: 'none',
    minify: false,
    banner: { js: header + '\n' },
    outfile: resolve(here, 'webbookmarks-palette.user.js'),
});

console.log('Built webbookmarks-palette.user.js');
