# Product

<!-- impeccable:product-schema 1 -->

## Platform

android

## Users

One musician, using the app for their own songs: practising and playing with an instrument in hand, often on a phone propped up or held in one hand. The same person also opens the library on the web and on a Windows desktop app, which are companions to the phone, not separate products. No band or shared-songbook use is confirmed.

## Product Purpose

Songbook is a personal library of song lyrics (with optional chord lines) to read while playing. It lets the user collect songs by finding lyrics online or pasting them, organise them into collections, and read them comfortably at the moment of playing. Success is that a song is on screen, readable and still, when the musician needs it, with nothing between them and the music.

## Positioning

A private songbook that belongs to the player: the library lives on the device, works offline, and syncs through the user's own Google Drive with no account of its own. Its tools for the moment of playing (a metronome and a guitar tuner) sit in the same app as the lyrics.

## Operating Context

- Used on an Android phone (primary), in a browser, and as a Windows desktop app built from the web export.
- Songs are added by searching for lyrics online ("Find lyrics") or by pasting them; each song can hold chords on its lines, a cover, and details such as artist, album, key, genre, mood, language and year.
- Songs are grouped into ordered collections, sorted by title, artist, year, genre, key, mood, favourites, date added or date last opened, and viewed at three card detail levels.
- Reading happens on the song screen: text size, chords on or off, full screen, and double-tap paging.
- Tools: a metronome and a guitar tuner (several guitar tunings), opened from Settings.

## Capabilities and Constraints

- Works offline: the library is a local database on each device and nothing needs a connection to read or play.
- Syncs through the user's own Google Drive, with no server or sign-in of the product's own. Automatic syncing runs when signed in; sign-in lives in Settings.
- The same look on every device (phone, web, desktop).
- Built with Expo (React Native), so one codebase serves all three targets.
- Tools live in Settings, not in the main menu. The main menu holds the library, collections, add (Find lyrics), a random-song dice and Settings.
- Undecided: whether songs are ever shared with other people; whether the phone version gets landscape or tablet layouts; chord transposition and per-song tempo.

## Brand Commitments

The name is Songbook. The visual system was borrowed on purpose from the owner's Sitness app (violet-first accent, near-black dark theme, flat grey surfaces, one corner radius); keeping that system is a confirmed commitment.

## Evidence on Hand

The user's own song library and the Google Drive sync data. No user research, usage data, testimonials or external reviews exist, and none should be invented.

## Product Principles

1. The song comes first: anything that sits between the player and the lyrics has to earn its place, and controls get out of the way while reading.
2. The library is the user's own: local, offline, synced to their Drive, never behind someone else's account.
3. Built for playing, not browsing: decisions are made for an instrument-in-hand situation, with large targets and calm, stable screens.
4. One system everywhere: the phone, web and desktop versions look and behave alike.
5. Gestures are shortcuts, never the only way: anything a swipe or double tap does can also be found on screen.

## Accessibility & Inclusion

No product-specific requirement has been established. The app follows the owner's existing patterns: labelled controls and large tap targets on the main actions.
