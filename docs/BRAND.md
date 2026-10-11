# Abdou Academy — brand in the product

Source: the official identity pack (_direction 02_) — files in `public/brand/`.
Use them as delivered: do not redraw, recolour, stretch or re-typeset the logo.

## Assets

| File                                  | Use                                                                                     |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `abdou_academy_logo_primary.svg/.png` | On light backgrounds (purple + lime loop, ink "abdou", purple "ACADEMY")                |
| `abdou_academy_logo_inverse.svg/.png` | On purple (white + lime loop, white "abdou", lime "ACADEMY") — used on the printed card |
| `abdou_academy_avatar.svg/.png`       | App icon, favicon, social avatar (`src/app/icon.svg`, `apple-icon.png`, `favicon.ico`)  |
| `abdou_academy_brandboard.png`        | Reference board                                                                         |

In the UI, `src/components/brand/logo.tsx` renders the same symbol paths and
the wordmark as live text in Inter 900/800 (exactly what the official SVGs specify).

## Colours

| Token  | Hex       | Role                                                                                                      |
| ------ | --------- | --------------------------------------------------------------------------------------------------------- |
| Purple | `#4B2AF0` | Primary actions, active navigation, links and accents on light surfaces, hero fields                      |
| Lime   | `#D6FF46` | Fills and highlights, CTAs on purple, progress on purple, the player's play button — always with ink text |
| Ink    | `#1C1734` | Text; dark-mode surfaces                                                                                  |
| Lilac  | `#E9E4FF` | Soft chips, selected rows, secondary surfaces                                                             |
| Ivory  | `#F5F3EF` | Page canvas                                                                                               |

Semantic tokens live in `src/app/globals.css` (`--primary`, `--lime`, `--highlight`,
`--secondary`, …). Components never use raw colours, except the logo itself.
Dark mode: ink canvas, purple actions, lime text accents (`--highlight`).

## Typography

- Latin: **Inter** — headings 800 with tight tracking, wordmark 900; letter-spaced capitals
  (`.eyebrow`) echo "A C A D E M Y".
- Arabic: **IBM Plex Sans Arabic** (700 for headings — its heaviest weight).

## Voice

_Learn it. Build it. Own it._ · _Activate once. Learn for life._ · bold, friendly, confident.
