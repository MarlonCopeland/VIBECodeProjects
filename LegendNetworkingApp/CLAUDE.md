# LegendNetworkingApp

See the repo-root `CLAUDE.md` for Node / npm rules (this app needs Node 22)
and the verification command.

## UI design work

Use the `frontend-design` skill (`.claude/skills/frontend-design/`) for any new
screen, redesign, or visual polish. It's written for websites, so for this
Expo / React Native app:

- Change the design system in `src/theme/` (`tokens.ts` for spacing, radius
  and type scale; `colors.ts` for `lightColors` / `darkColors`). Components read
  from the theme and never hard-code colors or spacing.
- Load custom typefaces with `expo-font` and add them to the type tokens.
- Use press feedback (`Pressable` states) where the skill talks about hover,
  and check both light and dark themes.
- The subject is personal networking: contacts, circles grouped by premise,
  and outreach. Base design choices on that.
- The planned cosmetics store (paid borders, backgrounds, color schemes) is
  the place to be bold. Build color schemes as alternate theme palettes so
  they plug into `ThemeProvider`. Don't name the retro scheme "SNES".
