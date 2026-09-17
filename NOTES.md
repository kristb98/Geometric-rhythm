# rythm dash - work notes (updated)

## Current state
Reverted to hand-authored procedural levels (pre-GMD), then rebuilt longer with
dense ship/ball/ufo obstacles, saws, moving saws, and extra portals.

## Physics (MODERATE-EASY): GRAVITY = 0.82, JUMP_FORCE = -12.5
  cube apex ~95.3px (~3.2 blocks); yellow pad ~136.8; red pad ~243.9

## Engine changes this session
1. **Pad/orb re-arm**: pads + orbs now re-trigger on each touch (GD behavior)
   via `_overlap` enter-edge logic instead of one-shot `activated` flag.
2. **Portal collision**: portals now use real AABB overlap (not x-only), so you
   can dodge them by flying over/under. Portal hitboxes are tall (size 180) so
   the intended path always triggers.
3. **SAW + MOVE_SAW**: new lethal obstacle types. Saws spin visually. Moving
   saws oscillate vertically/horizontally via sine wave based on levelX scroll.
   Both kill on any player-box overlap.
4. **Coins removed**: coin objects, coin HUD, coin collect/display all removed.

## Level data (levelData.js)
6 levels, ~480 objects total:
  - Stereo Madness: cube -> ship (saws) -> cube -> ball (saws) -> cube
  - Back On Track: cube -> ship (saws) -> cube -> ufo (saws) -> cube
  - Polargeist: cube -> ship (saws) -> ball (saws) -> cube -> ufo (saws) -> cube
  - Dry Out: cube -> ship (saws) -> cube -> ufo (saws) -> cube -> ball (saws) -> cube
  - Base After Base: cube -> ship (saws) -> ball (saws) -> cube -> ufo (saws) -> cube
  - Can't Let Go: cube -> ship (saws) -> ball (saws) -> cube -> ufo (saws) -> cube
  Saws: 54 static + 32 moving per level. Portals: 63 (with extras for dodge safety).

## Feedback form
Google Forms iframe replaced with "OPEN IN BROWSER" button (Google CSP blocks iframes).
