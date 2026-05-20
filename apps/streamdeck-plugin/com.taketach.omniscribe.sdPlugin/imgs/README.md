# Plugin art (placeholders)

The `.png` files in this directory are programmatically generated from SVG
(see `scripts/gen-art.mjs` notes in commit history — orange ring + play
triangle on a dark Forge-themed background, monochrome white for the icon
variants Stream Deck tints). Re-render or replace before public release if
a designer produces final art.

Required sizes (per Elgato manifest spec):

| File                  | Purpose                                                    | Sizes                  |
| --------------------- | ---------------------------------------------------------- | ---------------------- |
| `plugin-icon`         | Stream Deck preferences                                    | 256×256, 512×512 (@2x) |
| `category-icon`       | Actions-list group icon (monochrome, white on transparent) | 28×28, 56×56 (@2x)     |
| `actions/launch/icon` | Action list icon (monochrome)                              | 20×20, 40×40 (@2x)     |
| `actions/launch/key`  | Default key image                                          | 72×72, 144×144 (@2x)   |

File names should be referenced **without** the `.png` extension in the
manifest — Stream Deck picks up `@2x` variants automatically.
