# Source images

Full-resolution masters. **Nothing here is deployed** — Vite copies the whole of
`public/` into the build, so a 624KB master sitting there shipped to every
visitor even though no markup referenced it.

Derived files that *are* served live in `public/`:

| Master | Served | Used at |
|---|---|---|
| `serpentora-mark.png` (2911×2789, 624KB) | `serpentora-mark-380.png` (57KB) | hero, 190px |
| | `serpentora-mark-72.png` (8.5KB) | masthead 36px, footer 26px |
| `Logo.png` (1024×1024, 1.3MB) | `Logo-144.png` (24KB) | light chrome on the legal and auth routes, 72px and 26px |
| `screenshot.jpeg` | not currently served | was the old site's hero still |

To regenerate a size, resize the master to twice its largest CSS use and keep
the file in `public/`.
