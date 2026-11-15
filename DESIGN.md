---
name: Songbook
description: A near-black songbook with one violet light on the song that matters.
colors:
  violet-signal: "#A78BFA"
  ink-on-violet: "#0B0814"
  violet-night: "#3A3158"
  stage-black: "#050408"
  control-grey: "#212024"
  well-grey: "#1A191F"
  divider-grey: "#3E3C42"
  page-white: "#EAE9EF"
  quiet-grey: "#9A989E"
typography:
  title:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 500
  body:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "17px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
  small:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  tiny:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "12px"
    fontWeight: 400
  lyrics:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "0.15px"
  chords:
    fontFamily: "monospace"
    fontSize: "19px"
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: "0.3px"
  tuner-note:
    fontFamily: "system-ui, Roboto, sans-serif"
    fontSize: "88px"
    fontWeight: 500
    lineHeight: 1.09
rounded:
  md: "16px"
  pill: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "18px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.violet-signal}"
    textColor: "{colors.ink-on-violet}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    height: "44px"
  button-tonal:
    backgroundColor: "{colors.well-grey}"
    textColor: "{colors.page-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "11px 16px"
  list-row:
    backgroundColor: "{colors.control-grey}"
    textColor: "{colors.page-white}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "12px"
  tag:
    backgroundColor: "{colors.well-grey}"
    textColor: "{colors.quiet-grey}"
    typography: "{typography.tiny}"
    rounded: "{rounded.md}"
  tag-accent:
    backgroundColor: "{colors.violet-night}"
    textColor: "{colors.violet-signal}"
    typography: "{typography.tiny}"
    rounded: "{rounded.md}"
  add-button:
    backgroundColor: "{colors.violet-signal}"
    textColor: "{colors.ink-on-violet}"
    rounded: "{rounded.pill}"
    size: "68px"
---

# Design System: Songbook

## Overview

**Creative North Star: "The Stage Light"**

A dark room with one light on what matters. Songbook's page is nearly black, and the only things lit are the song you are about to play and the controls you can press. The library is plain lines in the dark; the song you played last is the one lit card at the top; the lyrics, once open, are the brightest and largest thing on the screen. Every control either sits where a thumb already is or steps out of the way while you read.

The mood is quietly confident: few elements, each clearly purposeful, with no ornament to look at between songs. One violet accent marks the things you can act on, and everything else is a step of near-black or grey. The system grew from the owner's Sitness app (the Music Stand direction) and was moved to this darker, more theatrical version; it is kept the same on the phone, the web and the Windows desktop.

**Key Characteristics:**
- A nearly black page; depth comes from stepping between greys and from one lit card, not from shadows.
- One violet accent, on actions and the current state only.
- One 16px corner on everything except the round add button and switch.
- Large, calm type for lyrics; small, quiet type for everything around them.
- Controls move out of the way while reading, and full screen leaves only the way back.

## Colors

A near-black page tinted with violet, flat grey surfaces a step above it, and a single violet accent.

### Primary
- **Violet Signal** (#A78BFA): the only accent. Buttons, the add button, active tab icons, selected tags, links like "Cancel" and "Got it", the in-tune needle and the pulsing tap ring on the beat. The app lets the user switch it to Teal (#2FB6A0), Amber (#D89C46) or Coral (#EA6A50); every other colour is tinted 5-10% with whichever accent is chosen.
- **Ink on Violet** (#0B0814): text and icons drawn on top of the accent.
- **Violet Night** (#3A3158): the accent's deep tint, used behind accent-coloured tags and the in-tune zone on the tuner bar.

### Neutral
- **Stage Black** (#050408): the page behind everything (97% black, 3% accent).
- **Control Grey** (#212024): cards, sheets and menus (Settings, collections, dialogs). The step above the page. Library songs are not on it: they sit directly on the page.
- **Bar Black** (derived, about #141218): the bottom menu, one step above the page and below the cards, with a Well Grey hairline along its top edge.
- **Well Grey** (#1A191F): tags and tonal buttons. The step below the cards, so tags sink into them instead of floating.
- **Divider Grey** (#3E3C42): borders, slider tracks, the text-size pill outline and the off switch track.
- **Page White** (#EAE9EF): primary text.
- **Quiet Grey** (#9A989E): secondary text, inactive icons, metadata.

A light theme exists for daytime: page #F4F6F7, surfaces #FFFFFF, wells #E8EEF0, text #111A1F, secondary text #5F6E79, dividers #DEE6E9, accent tint #E9E3FB. Dark is the default and the design reference; the light palette follows the same roles.

### Named Rules
**The One Voice Rule.** The accent marks what can be pressed or what is current. If a screen has more than a handful of accent elements, something that should be grey has been coloured.

**The Step-Down Rule.** Each layer is one grey step from the one behind it: Stage Black, then Control Grey, then Well Grey. Tags and tonal buttons sit below the surface they are on, not above it. The only lit surface on a list screen is the song that is about to be played.

## Typography

**Font:** the device's own sans (Roboto on Android, Segoe UI on Windows). No fonts are loaded from the network. The user can pick another family in Settings (Light, Medium, Condensed, Serif, Monospace and others), and every text uses the chosen family, except chord lines, which are always monospace.

**Character:** plain and legible, with weight doing most of the hierarchy work. A single 500 weight marks titles and song names; everything else is regular.

### Hierarchy
- **Title** (500, 22px): screen titles and the song title in the song header.
- **Body** (400, 17px, 1.5): list rows, inputs and buttons.
- **Label** (400, 15px): section headers, switch labels, quiet links.
- **Small** (400, 13px, 1.5): secondary lines, descriptions, hints.
- **Tiny** (400, 12px): tags and small print.
- **Lyrics** (400, 19px default, 1.55, +0.15px tracking): the song itself. The user sets the size from 16 to 36. A little more leading and tracking than body text because the words are light on a dark page.
- **Chords** (700, same size as the lyric, monospace, 1.25, +0.3px): bold and accent-coloured, sitting directly above the line they belong to with 8px more space above than below.
- **Tuner note** (500, 88px): the one display size, for the note being played.

### Named Rules
**The Words First Rule.** The lyric is the largest and brightest text on any screen it appears on. Nothing around it is larger or higher in contrast.

## Layout

A single column on the phone, framed and centred on wide windows (up to 720px). Screen content has an 18-20px side margin. The Library is plain rows separated by 1px hairlines, with the last-played song as a single lit card above them; other lists (collections, Settings) use cards with an 8px gap and 11-14px of inner padding. The top of every screen clears the status bar by 8px.

The bottom menu is 44px tall with a round add button rising 28px above it. Header buttons are 44px square, and round buttons (the dice, the metronome heads) are 56-68px. Tap targets are never smaller than 44px.

On the song screen the controls (text size and chords) are the first thing in the scrolling content, not a fixed bar, so they leave the screen as you read. A thin position bar sits on the right edge when the song is longer than the screen. In full screen only the exit button remains.

## Elevation & Depth

Flat by default. Depth is carried by tonal layering: Stage Black, Control Grey, Well Grey. There are no card shadows. The only shadows in the system are on the switch thumb (a small soft drop) and on floating menus (a soft, offset drop: 0 6px 16px at 25%), and a 55% black scrim behind bottom sheets.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. A shadow appears only on something that floats above the page (a menu, a thumb), never to make a card look raised.

## Shapes

One corner radius: 16px, on cards, list rows, buttons, inputs, sheets, tags and menus. The exceptions are circles: the add button, the dice and slider heads (fully round) and the switch (a pill). The text-size control is a single 16px outlined pill split in two by a 1px divider. There is no variation in corner size to signal importance; size and colour do that.

## Components

### Buttons
- **Shape:** 16px corners, 44px tall (56px for the tuner's retry button).
- **Primary:** Violet Signal fill with Ink on Violet text, body size.
- **Tonal:** Well Grey fill with Page White text, for secondary actions like "Paste lyrics".
- **Press:** the default reduced opacity; no custom hover or glow.
- **Add button:** a 68px round Violet Signal button that rises 28px above the bottom menu, ringed in the page colour so it looks cut out of the bar.

### Chips (tags)
- **Style:** Well Grey with Quiet Grey text, tiny size, 16px corners. The key is the accent tag (Violet Night with Violet Signal text) in every card size.

### Cards / Containers
- **Corner Style:** 16px.
- **Background:** Control Grey on Stage Black.
- **Shadow Strategy:** none; see Elevation.
- **Border:** none.
- **Internal Padding:** 12px (artist and details views), 11px (name view).
- A library row has a cover (36px in the name view, 64px otherwise), the title in 500 and quieter lines below, on the page itself with a Well Grey hairline above it. Swiping a row right reveals an accent "Add to collection" button; swiping left reveals a red "Delete" button.
- **Last played card** (the signature component): the most recently opened song as one larger card in Violet Night with a 1px Violet Signal edge, a 52px cover, an 18px title, the artist and the key as an accent tag.

### Inputs / Fields
- **Style:** Control Grey fill, 16px corners, 10px vertical and 12px horizontal padding, Page White text with Quiet Grey placeholder.
- **Focus:** no custom focus treatment; relies on the platform caret.

### Navigation
- A bottom menu of five slots: Library, Collections, the raised add button, the dice and Settings. Icons are 22px, Quiet Grey when inactive and Violet Signal when current. The Tools screens open from Settings and have no tab.
- Screen headers are a back chevron, a 22px title and plain accent icon buttons at the right.

### Signature components
- **Tap-tempo ring and slider heads** (Metronome): 68px circles with a 3px accent border that pulse on the beat (accent on beat one, grey on the others) and show the value held under the finger.
- **Tuner needle:** a thin 4px needle on a 6px track, turning accent inside the 5-cent in-tune zone.

## Do's and Don'ts

### Do:
- **Do** keep the page Stage Black and light only the song you are about to play (the last-played card) and what can be pressed.
- **Do** use Violet Signal only for things you can act on or the current state.
- **Do** use the 16px corner everywhere, and fully round shapes only for circular buttons and the switch.
- **Do** keep touch targets at 44px or larger, and put frequent actions in the lower half of the screen.
- **Do** let controls leave the screen while the song is being read.
- **Do** keep the phone, web and desktop versions looking the same.

### Don't:
- **Don't** add shadows to cards or buttons to make them look raised.
- **Don't** put library songs back on grey cards: the list is plain lines in the dark.
- **Don't** introduce a second accent colour next to the chosen one.
- **Don't** make any text on a song screen larger or higher in contrast than the lyrics.
- **Don't** put an action behind a gesture alone: every swipe or double tap needs an on-screen route.
- **Don't** load web fonts or add a second font family; the device's own font is the system.
