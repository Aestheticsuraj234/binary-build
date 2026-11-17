# Binary design system

Binary is **dark only**, with **one accent colour** (acid lime `#d1fe17`). Every
screen, on web and mobile, uses the tokens below. If a screen needs a value
that isn't here, add a token first, then use it.

## Where the tokens live

| Place                                  | Used by                                                  |
| -------------------------------------- | -------------------------------------------------------- |
| `packages/shared/src/design-tokens.ts` | The source of truth. The mobile app imports it directly. |
| `apps/web/app/globals.css`             | The web app, as `--binary-*` CSS variables.              |

A test (`packages/shared/src/design-tokens.test.ts`) fails if the two disagree,
so change both together.

## Colour

| Token           | Value     | Use it for                                         |
| --------------- | --------- | -------------------------------------------------- |
| `background`    | `#09090b` | The page or screen behind everything.              |
| `surface`       | `#18181b` | Inputs, cards, secondary buttons.                  |
| `surfaceRaised` | `#27272a` | Hover and pressed states on surfaces.              |
| `border`        | `#27272a` | Quiet dividers.                                    |
| `borderStrong`  | `#3f3f46` | Input and secondary-button outlines.               |
| `text`          | `#fafafa` | Headings, labels, body text.                       |
| `textMuted`     | `#a1a1aa` | Supporting text under a heading, hints.            |
| `textSubtle`    | `#71717a` | Placeholders and the least important text.         |
| `accent`        | `#d1fe17` | **The one main action on a screen.** Nothing else. |
| `accentPressed` | `#b6e000` | The main action while pressed or hovered.          |
| `onAccent`      | `#09090b` | Text and icons on top of `accent`.                 |
| `danger`        | `#f87171` | Error text and the border of an error message.     |
| `dangerSurface` | `#2a1215` | The background of an error message.                |

### Rules for the accent

- One lime element per screen: the button that does the main job (Sign in,
  Create account). Secondary actions (Sign out, Cancel) use `surface` with a
  `borderStrong` outline.
- Text on lime is always `onAccent` (near black). Never put white text on lime.
- Small brand touches (the "01" logo tile, the focus ring, the dot on a
  saved key's badge, the lock icon) may also use lime, because they are not
  competing actions.
- On a page with several equal actions (one Save per provider), none of them
  is the main action, so they all use the secondary style. The Playground's
  Run button is the one lime button on that page.

### shadcn/ui names on the web

`globals.css` maps shadcn's variables onto these tokens. Watch out for one name
clash: shadcn's `accent` is a _hover background_ (`surfaceRaised`), not Binary's
lime. In Tailwind classes, Binary's lime is `bg-primary` / `text-primary`.

## Spacing

Use these steps, in pixels: `xs 4`, `sm 8`, `md 12`, `lg 16`, `xl 24`, `xxl 32`,
`xxxl 48`.

- Gap between form fields: `lg` (16).
- Screen padding on mobile: `xl` (24). Web pages use `px-4` (16) up to a
  centred max width.
- Space between a heading block and the form below it: `xxl` (32).

## Corner radius

`sm 6`, `md 10`, `lg 16`, `full 999` (pills, avatars).

- Inputs, buttons and alerts: `md` (10).
- Cards and sheets: `lg` (16).
- The logo tile: `md` on web (the mobile logo is still the small square).

## Type

The web uses Geist; mobile uses the system font. Sizes in pixels:
`xs 12`, `sm 14`, `md 16`, `lg 20`, `xl 28`. Weights: `regular 400`,
`medium 500` (labels), `semibold 600` (headings and buttons).

- Screen title: `xl`, semibold (web uses `text-2xl`).
- Body and inputs: `md`.
- Labels, helper and error text: `sm`.

## Components

- **Primary button**: `accent` background, `onAccent` label, 48px tall on
  mobile (44px on web), radius `md`. Shows a spinner while busy and can't be
  pressed twice.
- **Secondary button**: `surface` background, `borderStrong` outline, `text`
  label.
- **Text field**: label above (`sm`, medium), input with `surface` background
  and `borderStrong` outline, 48px tall on mobile. When invalid, the outline
  turns `danger` and the message appears underneath in `danger`, `sm`.
- **Error message** (for problems with the whole form, like a wrong
  password): `dangerSurface` background, `danger` border and text, radius `md`,
  above the form fields.

- **Card**: `surface` background, `border` outline, radius `lg`, 24px
  padding (web `p-6`). Used for each provider on the API keys page and each
  answer column in the Playground.
- **Badge**: a small pill (`full` radius) with a `borderStrong` outline and
  `textMuted` label, for statuses like "Not added". A saved key's badge adds a
  small lime dot.
- **Skeleton**: a pulsing `surfaceRaised` block, the same size as what's
  loading.

## App shell (web)

Every signed-in page lives in `apps/web/app/(app)/` and shares one layout:

- **Top bar**, 64px tall, with a `border` line under it. On the left: the logo
  (a lime "01" tile and "Binary") and the main links (icon and label; icon
  only on small screens). The current page's link gets a `surfaceRaised`
  background. On the right: initials in a circle, the email (hidden on small
  screens) and a ghost "Sign out" button.
- **Page header**: title at 36px semibold, then one line of `textMuted`
  description.
- **Width**: `max-w-3xl` for forms and lists, `max-w-6xl` for side-by-side
  layouts like the Playground. Use the `Page` component, which handles both.
- To add a section, add a folder under `app/(app)/` and a link in
  `components/nav-links.tsx`.

## Accessibility

- Every input has a visible label, not just a placeholder.
- Error messages are linked to their input (`aria-describedby` on web) and form
  errors use `role="alert"` so screen readers announce them.
- Lime on near-black and white on near-black both pass WCAG AA contrast with
  room to spare. Don't put `textSubtle` on `surfaceRaised` for anything people
  need to read.
