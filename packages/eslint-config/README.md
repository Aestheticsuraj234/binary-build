# @binary/eslint-config

Shared ESLint rules, based on the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html).
Prettier (see the root `.prettierrc.json`) handles formatting.

- `base`: every package
- `next`: the web app
- `expo`: the mobile app

The one deliberate exception to the style guide: Next.js pages and Expo Router
screens use default exports, because those frameworks require them.
