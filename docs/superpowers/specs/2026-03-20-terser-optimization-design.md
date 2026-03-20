# Terser Build Optimization

**Date:** 2026-03-20
**Status:** Approved

## Problem

Webpack `mode: 'production'` uses Terser with default settings. The defaults don't enable multi-pass optimization, don't remove console statements, and don't perform property mangling. The output is minified but not as compact or opaque as it could be.

## Goal

Configure Terser explicitly in `webpack.config.js` to produce smaller, harder-to-read output without adding new dependencies or risking Chrome Web Store policy violations.

## Non-Goals

- String encryption or control flow flattening (violates Chrome Web Store policy)
- Installing javascript-obfuscator or similar tools
- Mangling Chrome API property names (would break the extension)

## Design

### Single file change: `webpack.config.js`

Add `optimization.minimizer` with a manually configured `TerserPlugin`. `TerserPlugin` is already bundled with webpack 5 — no new package needed.

```js
const TerserPlugin = require('terser-webpack-plugin');

// inside module.exports:
optimization: {
  minimizer: [
    new TerserPlugin({
      terserOptions: {
        compress: {
          passes: 2,
          drop_console: true,
          pure_getters: true,
          unsafe: true,
          unsafe_arrows: true,
        },
        mangle: {
          properties: {
            regex: /^_/,
          },
        },
        format: {
          comments: false,
        },
      },
      extractComments: false,
    }),
  ],
},
```

### Options explained

| Option | Effect |
|--------|--------|
| `passes: 2` | Run compression twice — second pass catches opportunities the first missed |
| `drop_console: true` | Remove all `console.*` calls from dist output |
| `pure_getters: true` | Assume getters have no side effects — enables more dead code elimination |
| `unsafe: true` | Enable optimizations that are safe for well-typed JS but technically spec-bending |
| `unsafe_arrows: true` | Convert functions to arrow functions where safe |
| `mangle.properties.regex: /^_/` | Mangle only properties starting with `_` — avoids touching Chrome API names |
| `comments: false` | Strip all comments from output |
| `extractComments: false` | Don't create a separate `*.LICENSE.txt` file |

### Safety

`mangle.properties` is scoped to `regex: /^_/` — only private-convention properties are mangled. Chrome API properties (`chrome.notifications`, `classList`, etc.) are never touched.

`drop_console: true` removes the debug `console.log` calls added during the notification feature development. This is intentional.

## Testing

- Run `npm run build` — must succeed with no errors
- Check `dist/popup/popup.js` — no `console.log` strings present
- Check `dist/popup/popup.js` — no comments present
- Verify extension still works in Chrome after reload
