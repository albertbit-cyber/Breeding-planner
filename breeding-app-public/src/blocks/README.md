# Content blocks

A page is an array of blocks. Each block is a plain object with a `type` and
whatever props that type takes:

```js
[
  { type: 'hero', headlineStart: 'Manage your collection with', ... },
  { type: 'stats', items: [{ value: '500+', label: 'morph genetics built in' }] },
]
```

`BlockRenderer` (from `./index.jsx`) maps the array onto components. Two props
are understood on every block regardless of type:

| Prop | Effect |
| --- | --- |
| `id` | Stable React key. Optional now; the CMS will always supply one. |
| `hidden` | Skips the block. Lets an author retire a section without deleting its content. |

Most blocks also accept `background` (`'soft'` \| `'white'` \| `'dark'`) and the
heading cluster `label` / `title` / `subtitle`.

## Why it is shaped like this

Phase 1 stores these arrays as a JSON constant in the repo. Phase 2 serves the
identical shape from `GET /api/content/pages/:slug` and the admin editor writes
it. The renderer does not change between the two — only where the array comes
from — so the contract below is what the editor's field definitions must target.

Two rules keep edited pages on-brand:

- **Colours are named, never hex.** Blocks take `theme: 'gold' | 'purple' | …`
  and resolve it through `theme.js`. The editor shows swatches; there is no
  colour input, so a page cannot drift off the palette.
- **There is no raw-HTML block.** Prose is a node tree (see `richText`). Anything
  it cannot express needs a new node type rather than pasted markup.

## Types

### `hero`
`badge {icon, text}`, `headlineStart`, `headlineHighlight`, `headlineEnd`,
`subtext`, `pills [{theme, icon, label}]`, `actions [{label, href, variant}]`,
`preview {url, image, alt}`.

Headline is three fields, not one string with markup, so the highlighted run
stays a styled element. `pills[].theme` is a pill theme (`gold`/`coral`/`purple`),
not a block theme.

### `stats`
`items [{value, label}]`. Renders as a compact bar, one column per item.

### `featureGrid`
`items [{theme, icon, title, desc}]`. Auto-fitting cards.

### `featureList`
`items [{icon, label}]`, `panel` (bool). Flat icon-and-label enumeration; `panel`
wraps it in the white card used at the foot of /pricing.

### `steps`
`items [{theme, title, desc}]`. **Numbers come from position** — reordering
renumbers automatically, so authored content must not include the number.

### `tutorials`
`items [{theme, icon, title, summary, steps: [string], image, imageAlt, caption, showScreenshot}]`.

A tutorial with no `image` renders a visible dashed placeholder rather than
collapsing the slot, so an unfinished page looks unfinished.

### `cta`
`badge {icon, text}`, `title`, `text`, `action {label, href, variant}`.

### `richText`
`align`, `nodes [...]`. Node types:

```js
{ type: 'h2' | 'h3', text }
{ type: 'p', spans }
{ type: 'ul' | 'ol', items: [spans, ...] }
{ type: 'table', head: [text, ...], rows: [[spans, ...], ...] }
```

`spans` is a string, or an array of strings and inline runs:

```js
{ text, bold?, italic?, href?, fill? }   // fill = highlighted placeholder
{ br: true }
```

`fill` marks unfinished text (company name, registered address) so it renders
highlighted and cannot ship unnoticed.

### `pricingTable`
`showBillingToggle`, `monthlyLabel`, `yearlyLabel`, `savingsBadge`,
`plans [...]`. Each plan:

```js
{
  id, name, accent, featured, featuredLabel,
  priceMode: 'free' | 'amount' | 'contact',
  monthly, yearly, currencySymbol, freeLabel, contactLabel,
  stackLabel, stackSubLabel, desc,
  cta: { label, href, variant: 'outline' | 'gold' | 'dark' },
  footnote,
}
```

The first three plans lay out in a row of three, the remainder in a centred row
of two — matching the existing page.

## Links

`href` is a plain string. `BlockLink` sends anything matching
`http:`/`https:`/`mailto:`/`tel:` to a real anchor and everything else through
the router. This matters because the breeder app is on a different host now, so
every login and sign-up target is absolute and a router `<Link>` would mangle it
into a relative path.

## Unknown types

`BlockRenderer` skips a type it does not recognise — loudly in development, and
silently in production. Once content is served from the database an editor can
publish a block that the deployed bundle predates; losing one section beats
blanking the page.
