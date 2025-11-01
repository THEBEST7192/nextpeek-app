# NextPeek - Spotify Queue Manager

NextPeek gives you a clean, always-on window into your live Spotify queue, right on your desktop.

## Getting Started

1.  **Clone the repository:**
    ```bash
    git clone <repository_url>
    cd nextpeek-app
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```
 
3.  **Run the application:**
    ```bash
    npm start
    ```
    Then click the `Start` button in the app to start the local queue server.

## Spicetify Extension Setup

To enable NextPeek to receive queue information from Spotify, you need to install the provided Spicetify userscript.

1.  **Navigate to the `spotify-queue-bridge` directory:**
    ```bash
    cd spotify-queue-bridge
    ```

2.  **Install the userscript:**
    *   **On Windows:** Run the `install-queue-bridge.bat` script.
        ```bash
        install-queue-bridge.bat
        ```
    *   **On Linux/macOS:** Run the `install-queue-bridge.sh` script.
        ```bash
        ./install-queue-bridge.sh
        ```
    These scripts will copy the `spotify-queue-bridge.js` file to your Spicetify extensions folder, enable it, and apply Spicetify changes.

### Directory Overview (`/c:/Users/Administrator/Downloads/nextpeek-app/spotify-queue-bridge/`)

- `spotify-queue-bridge.js` — Spicetify userscript that:
  - Reads local queue data from `Spicetify.Queue.nextTracks` and the current item from `Spicetify.Player.data.item.metadata`.
  - Sends updates to `http://localhost:7192/api/updateQueue` with:
    - `nowPlaying`: `{ title, artist, album_cover }`
    - `queue`: `[{ title, artist, album_cover }, ...]`
  - Polls `http://localhost:7192/api/command` every second to execute `play`, `pause`, `next`, `previous`.
  - Debounces queue updates (~1s) on playback/queue events to avoid spamming.

- `install-queue-bridge.bat` — Windows installer that copies the userscript to `%LOCALAPPDATA%\spicetify\Extensions\spotify-queue-bridge.js` and runs `spicetify apply`.

- `install-queue-bridge.sh` — Linux/macOS installer that copies the userscript to `$HOME/.config/spicetify/Extensions/spotify-queue-bridge.js` and runs `spicetify apply`.

### Manual Install Paths

- Windows: `%LOCALAPPDATA%\spicetify\Extensions\spotify-queue-bridge.js`
- Linux/macOS: `$HOME/.config/spicetify/Extensions/spotify-queue-bridge.js`

### Update Workflow

- Edit `spotify-queue-bridge.js` as needed.
- Re-run the appropriate installer (`install-queue-bridge.bat` or `install-queue-bridge.sh`).
- Restart Spotify for changes to load.

### Verification & Troubleshooting

- In NextPeek (terminal/devtools):
  - Look for `Queue server running at http://127.0.0.1:7192/` and `Queue updated: { ... }` when Spotify is playing.

- In Spotify (Developer Console):
  - You should see `Queue track object:` logs when the bridge processes queued tracks.

- If no updates appear:
  - Ensure Spicetify is installed and the extension is enabled.
  - Re-run the installer and restart Spotify.
  - Confirm NextPeek is running and you clicked `Start` in the app.

## Features

*   Always-on window for Spotify queue.
*   Play/Pause, Skip Previous, Skip Next controls.
*   Pin/Unpin window.
*   Snap window to screen edges.
*   Receives queue via local Spicetify bridge (no Spotify API auth).