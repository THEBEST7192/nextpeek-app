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

3.  **Set up Spotify API Credentials:**
    *   Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications).
    *   Log in and create a new application.
    *   Note down your **Client ID**.
    *   In the application settings, add `http://127.0.0.1:7192` to your **Redirect URIs**.
    *   Create a `.env` file in the root of this project (next to `package.json`).
    *   Add your Spotify Client ID to the `.env` file:
        ```
        SPOTIFY_CLIENT_ID=your_spotify_client_id_here
        ```
        (Replace `your_spotify_client_id_here` with your actual Client ID).

4.  **Run the application:**
    ```bash
    npm start
    ```

## Features

*   Always-on window for Spotify queue.
*   Play/Pause, Skip Previous, Skip Next controls.
*   Pin/Unpin window.
*   Snap window to screen edges.
*   Spotify OAuth for secure authentication.