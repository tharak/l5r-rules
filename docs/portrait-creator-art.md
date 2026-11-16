# Portrait creator art

The portrait creator (`#/portrait-creator`, opened with **Create picture** in Identity or the NPC editor) stacks image layers into a square picture. Everything it offers comes from `public/assets/portrait-creator/manifest.json`; adding art needs no code changes. The current layers are simple placeholders (`"placeholder": true` shows a note on the page); replace them with illustrated ones and set `"placeholder": false`.

The target style is the ink-on-parchment look of the reference images in `public/assets/samplePCs/` (reference only, not used by the app).

## Canvas and alignment

- Every layer is **512 × 512 pixels**, drawn on the same canvas, at the same scale, in the **same pose**: a front-facing bust, head centred horizontally.
- Keep the head in one place for every body type and age: centre about (256, 196), roughly 116 px wide and 144 px tall. Hair and faces are shared across body types, so they only line up if the head never moves.
- Shoulders and outfits change with body type. At y = 380 the shoulders reach about 130 px (slim), 160 px (average) and 195 px (heavy) either side of the centre line.
- Every layer except backgrounds needs a **transparent background**. Backgrounds are opaque and fill the whole square.
- Use **PNG or WebP** (SVG also works). Keep each file small (under ~200 KB); the final picture is saved at 256 × 256.

## Layers (drawn bottom to top, in manifest order)

| Slot | Picker | Varies by | Notes |
|---|---|---|---|
| `background` | Yes | — | Parchment, bamboo, shoji, pines… opaque. |
| `body` | No (follows the attributes) | body type (and gender/age if the shape differs) | Skin: head, ears, neck, shoulders. No face details. |
| `face` | No | age (and gender if you want) | Eyes, brows, nose, mouth, wrinkles for elders. Transparent elsewhere. |
| `outfit` | Yes | body type | Kimono, armour, robes… must cover the torso of its body type. |
| `hair` | Yes, with **None** | gender and age | Grey variants for elders. Hair that falls over the shoulders is fine. |

You can add new slots (for example `accessory` for a mask, scarf, or weapon over the shoulder) anywhere in the list; a slot without `"required": true` gets a **None** choice.

## Manifest entries

Each option maps `gender/age/body` keys to files, with `*` as a wildcard. The **most specific** matching key wins, so you only add special cases where they differ:

```json
{"id": "topknot", "label": "Topknot", "files": {
  "male/*/*": "layers/hair/topknot.png",
  "male/elder/*": "layers/hair/topknot-grey.png"
}}
```

- An option with no matching key for the chosen gender/age/body is hidden (here: topknot is not offered for women).
- File paths must start with `layers/` and use lowercase letters, numbers, `-` and `_`, ending in `.png`, `.webp` or `.svg`.
- `mon` gives the centre (`x`, `y`), `size` and `opacity` of the clan mon stamp per body type, so it sits on the sleeve or chest of that outfit width.
- `npm test` checks the manifest: valid paths, known attributes, and that every gender/age/body combination draws every required slot from a file that exists.

## Naming

`layers/<slot>/<option>[-<variant>].png`, for example `layers/outfit/armor-heavy.png`, `layers/hair/bun-grey.png`, `layers/face/elder-female.png`.

## Prompt notes for generated art

Keep one prompt template and change only the part being drawn, so the layers match:

> Ink wash and brush illustration on aged parchment, Japanese feudal style, sepia and black ink, loose expressive linework, front-facing bust portrait, centred, plain background — *[the layer: e.g. "only a heavy-set man's bare head, neck and shoulders, no clothing, no hair"]* — transparent background, 512 × 512.

Generate the body first, then draw hair, faces and outfits over that same body (use it as the image reference) so the head position and shoulder line match.
