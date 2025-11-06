# Playlist Search Implementation

## Overview
This document describes the implementation of real-time playlist searching using Spicetify's API.

## Architecture

### 1. Spotify Bridge (`spotify-queue-bridge.js`)
- Added `getUserPlaylists()` function that uses `Spicetify.Platform.RootlistAPI.getContents()` to fetch user playlists
- Modified `checkCommands()` to handle a new `getPlaylists` action
- When triggered, the bridge:
  1. Fetches all user playlists from Spotify
  2. Filters for playlist items
  3. Maps the data to a consistent format with `id`, `name`, `description`, `tracks`, and `uri`
  4. Sends the data to the backend via `/api/playlistsResponse`

### 2. Backend API (`queueService.js`)
Added three new components:

#### Storage
- `userPlaylists`: Array to store fetched playlists
- `pendingPlaylistRequests`: Queue for pending search requests

#### Endpoints

**GET `/api/searchPlaylists?q={query}`**
- Accepts a search query parameter
- Triggers the Spotify bridge to fetch playlists
- Waits up to 2 seconds for the response
- Returns filtered playlists matching the query
- Filters by playlist name and description (case-insensitive)

**POST `/api/playlistsResponse`**
- Receives playlists from the Spotify bridge
- Stores them in `userPlaylists`
- Responds to all pending search requests with filtered results
- Clears the pending requests queue

### 3. Frontend (`SearchBar.jsx`)
- Removed mock playlist data
- Added real-time API integration with debouncing (300ms)
- Added loading state indicator
- Implemented async search with error handling
- Features:
  - Debounced input to prevent excessive API calls
  - Loading indicator while searching
  - Real-time results from user's Spotify playlists
  - Smooth UX with proper state management

### 4. Styling (`SearchBar.css`)
- Added `.search-loading` class for loading state
- Prevents hover effects on loading indicator
- Maintains consistent styling with the rest of the UI

## Data Flow

```
User types in SearchBar
    ↓
Frontend debounces input (300ms)
    ↓
GET /api/searchPlaylists?q={query}
    ↓
Backend sets command: "getPlaylists"
    ↓
Spotify Bridge polls /api/command
    ↓
Bridge fetches playlists via Spicetify API
    ↓
Bridge POSTs playlists to /api/playlistsResponse
    ↓
Backend filters playlists by query
    ↓
Backend responds to pending requests
    ↓
Frontend displays results
```

## Key Features

1. **Real-time Search**: Searches through user's actual Spotify playlists
2. **Debouncing**: Prevents excessive API calls while typing
3. **Loading States**: Clear visual feedback during search
4. **Error Handling**: Graceful fallback if search fails
5. **Efficient Filtering**: Case-insensitive search across name and description
6. **Timeout Protection**: 2-second timeout prevents indefinite waiting

## Usage

1. Ensure Spotify is running with Spicetify installed
2. Start the NextPeek application
3. Type in the search bar to search your playlists
4. Click on a result to select a playlist

## Future Enhancements

- Cache playlists to reduce API calls
- Add pagination for large playlist libraries
- Include playlist artwork in results
- Add ability to play playlist directly
- Support for filtering by playlist owner
