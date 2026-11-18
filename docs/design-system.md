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

- **Sidebar** (17rem, `border` on the right) on screens 768px and wider. Top
  to bottom: the logo (a lime "01" tile and "Binary"), the main links
  (Discover, Playground, API keys; the current one gets a `surfaceRaised`
  background), a lime **New chat** button, then one scrolling list with
  **Recent chats** (face and title, newest first; a bin button shows on hover
  or focus, and always on touch screens) and **Your crew** (each agent's face,
  name and job; the `+` hires someone), and the user card (initials, name,
  email, sign out).
- **New chat** talks to whoever the open page is about, or else the first
  crew member.
- **Phones** get a 56px top bar with the logo and a menu button. The menu
  slides the same sidebar in from the left.
- **Width**: `max-w-3xl` for forms and lists, `max-w-6xl` for grids like
  Discover and the Playground.
- To add a section, add a folder under `app/(app)/` and a link in
  `components/nav-links.tsx`.

## Chat

- A conversation is a character **stage** (on the character's `tint`, with
  New chat, Edit and Delete chat on top) beside the messages. On narrow
  screens the stage sits above them.
- Your messages are `surfaceRaised` bubbles on the right. Answers sit on the
  page with a small, still face beside them, rendered as **Markdown**:
  headings, lists, tables, quotes and code blocks highlighted with the GitHub
  Dark theme. Half-written Markdown is closed while it streams, so `**` or an
  open code fence never shows.
- Links in answers are lime and underlined, and ask "Leave Binary?" before
  opening.
- A failed answer keeps the words that arrived, with the reason in a
  `dangerSurface` box below and a note that it wasn't saved.
- A fired agent's chat shows a neutral note, and no composer.
- On the web, answers use [Streamdown](https://streamdown.ai), which styles
  itself with Tailwind classes. `app/globals.css` points Tailwind at its files
  with `@source`; if that path is wrong, answers lose their styles silently.

## Characters

- The cast lives in `packages/shared/src/characters.ts`: name, personality,
  greeting, body `color` and a dark `tint`. Draw a character's panel
  (cards, the stage, the creator preview) on its `tint`.
- **Moods**: `idle` (floats and blinks), `thinking` (sways, thought dots),
  `talking` (mouth moves), `happy` (bounces). In a conversation: thinking
  while waiting, talking while the answer streams, happy when it's done,
  then back to idle.
- Small, repeated faces (lists, the character grid, chat messages) are not
  animated. Only one face on screen should move at a time.
- Reduced motion turns every character animation off.

## Phone app

The Expo app uses the same tokens from `@binary/shared`. Inner screens get a
dark native header with a back button; buttons are 48px tall; choices like
provider and model are pill buttons rather than drop-downs.

- Home shows the newest **Recent chats** first (bin button or long press to
  delete; "See all" when there are more), then Your crew and the cast.
- A chat's header has **New** and a **•••** menu (Edit agent, Delete chat).
- Answers render Markdown with `marked`, `remend` for half-written text and
  `lowlight` for code colours, close to the web's look. Wide tables and code
  scroll sideways.

## Accessibility

- Every input has a visible label, not just a placeholder.
- Error messages are linked to their input (`aria-describedby` on web) and form
  errors use `role="alert"` so screen readers announce them.
- Lime on near-black and white on near-black both pass WCAG AA contrast with
  room to spare. Don't put `textSubtle` on `surfaceRaised` for anything people
  need to read.
