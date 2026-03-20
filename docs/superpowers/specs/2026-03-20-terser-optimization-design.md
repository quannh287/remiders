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
          drop_console: ['log'],  // keeps console.error/warn in catch blocks
          pure_getters: true,
          unsafe: true,
          unsafe_arrows: true,
        },
        mangle: {
          properties: {
            regex: /^_/,
            // IMPORTANT: never add properties from types serialized to
            // chrome.storage.local here — mangling those names corrupts
            // persisted data on extension update
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
| `drop_console: ['log']` | Remove `console.log` calls only — preserves `console.error`/`console.warn` in catch blocks |
| `pure_getters: true` | Assume getters have no side effects — enables more dead code elimination |
| `unsafe: true` | Enable optimizations that are safe for well-typed JS but technically spec-bending |
| `unsafe_arrows: true` | Convert functions to arrow functions where safe |
| `mangle.properties.regex: /^_/` | Mangle only properties starting with `_` — avoids touching Chrome API names |
| `comments: false` | Strip all comments from output |
| `extractComments: false` | Don't create a separate `*.LICENSE.txt` file |

### Safety

`mangle.properties` is scoped to `regex: /^_/` — only private-convention properties are mangled. Chrome API properties (`chrome.notifications`, `classList`, etc.) are never touched.

**Storage safety constraint:** Properties on any type serialized to `chrome.storage.local` (`AppState`, `CheckInRecord`, `Settings`) must never start with `_`. If they do, Terser will rename them in the compiled JS but the data already persisted in storage will still use the old names, silently corrupting user data on extension update. Current interface fields (`date`, `checkInTime`, `expectedCheckoutTime`, `manualOverride`, `history`, `today`, `settings`, `lunchBreakMinutes`, `notifyBeforeMinutes`, `lastActiveTimestamp`) are all safe. An inline comment in `webpack.config.js` will document this constraint for future maintainers.

`drop_console: ['log']` removes only `console.log` calls — `console.error` and `console.warn` in catch blocks are preserved so errors remain visible in production.

`unsafe: true` and `unsafe_arrows: true` are safe for this codebase because the code uses no sparse arrays, no `arguments` object mutation, and no prototype modification. Chrome API calls are method invocations with side effects — Terser preserves these regardless of unsafe mode. Arrow function conversion is safe because no code relies on `this` binding in non-method functions.

## Testing

- Run `npm run build` — must succeed with no errors
- Check `dist/popup/popup.js` — no `console.log` strings present
- Check `dist/popup/popup.js` — `console.error` strings ARE present (preserved from catch blocks)
- Check `dist/popup/popup.js` — no comments present
- Verify extension still works in Chrome after reload
