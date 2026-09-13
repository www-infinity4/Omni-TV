# Omni TV

Omni TV is the live channel-surfer for the Infinity TV network.

## How it works

- One main viewer stays on the Omni TV page.
- The shared Infinity channel registry supplies the live channel list.
- Each station remains the authority for its own schedule and synchronization.
- Selecting a channel loads that station inside Omni TV at the station's current live position.
- Omni TV isolates the station player so viewers can change channels without navigating away.
- A lightweight same-origin probe reads each station's current `#nowTitle` and social image to build a live "what's on now" remote.
- Channel Up / Channel Down surf sequentially through the network.
- The grid refreshes its live-program labels periodically.

## Shared network contract

Omni TV reads the existing shared channel system from `TNT/channels-core.js`. Newly deployed station repos can be added to the shared registry and will flow into Omni TV without creating a separate Omni schedule.

The station itself owns playback timing. Omni TV does not invent or copy the station schedule, which prevents the universal viewer from drifting away from the individual channel.

## Mobile

The layout is built for Android first: one 16:9/16:10 live screen, large CH-/CH+ controls, searchable live cards, and no requirement to leave Omni TV when changing stations.
