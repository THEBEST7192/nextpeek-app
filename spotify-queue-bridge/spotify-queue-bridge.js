// ==UserScript==
// @thebest7192       Spotify Queue Bridge for NextPeek
// ==/UserScript==

(async function QueueBridge() {
  let lastKnownContextUri = null;

  const updateKnownContext = (contextUri) => {
    if (contextUri && !contextUri.startsWith('spotify:track:')) {
      lastKnownContextUri = contextUri;
    }
  };

  while (!Spicetify?.Player || !Spicetify?.CosmosAsync) {
    await new Promise(r => setTimeout(r, 500));
  }

  async function updateBackend() {
    try {
      let queue;
      // Always use Spicetify's local queue data
      queue = { queue: { next_tracks: Spicetify.Queue?.nextTracks || [] } };

      const current = Spicetify.Player.data?.item?.metadata;
      const currentContextUri = Spicetify.Queue?.contextUri
        || Spicetify.Player.data?.context_uri
        || Spicetify.Player.data?.item?.metadata?.context_uri;

      updateKnownContext(currentContextUri);

      const repeatModeRaw = typeof Spicetify.Player.getRepeat === 'function'
        ? Spicetify.Player.getRepeat()
        : 0;
      const repeatMode = Number.isFinite(repeatModeRaw) ? repeatModeRaw : Number(repeatModeRaw) || 0;
      // Thanks to @sanooj.es on Discord for this function
      // Get current shuffle mode: 0 = off, 1 = normal, 2 = smart
      const getShuffle = () => {
          const isShuffle = Spicetify.Player.origin._state.shuffle;
          const isSmartShuffle = Spicetify.Player.origin._state.smartShuffle;

          if (!isShuffle) return 0;   // shuffle OFF
          if (!isSmartShuffle) return 1; // normal shuffle
          return 2;                    // smart shuffle
      };
      const shuffleState = getShuffle();

      const nowPlaying = current
        ? {
            title: current.title,
            artist: Spicetify.Player.data.item?.artists?.map(artist => artist.name).join(', '),
            album_cover: current.image_url,
            uri: Spicetify.Player.data?.item?.uri,
            isPlaying: Spicetify.Player.isPlaying(),
            repeatMode,
            shuffle: shuffleState,
            duration: Spicetify.Player.getDuration(),
            progress: Spicetify.Player.getProgress(),
            formattedDuration: Spicetify.Player.formatTime(Spicetify.Player.getDuration()),
            formattedProgress: Spicetify.Player.formatTime(Spicetify.Player.getProgress()),
            progressPercent: Spicetify.Player.getProgressPercent(),
          }
        : {};


      const q =
        queue?.queue?.next_tracks?.map((t) => {
          // console.log('Queue track object:', t);
          const trackUri = t.uri || t.contextTrack?.uri || t.track?.uri || t.item?.uri || t.contextTrack?.metadata?.uri || t.metadata?.uri;
          return {
            title: t.contextTrack?.metadata?.title || t.track?.name || t.metadata?.title || t.item?.title || t.name,
            artist: t.contextTrack?.metadata ? Object.keys(t.contextTrack.metadata).filter(k => k.startsWith('artist_name')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => t.contextTrack.metadata[k]).filter(Boolean).join(', ') || "Unknown Artist" : "Unknown Artist",
            album_cover: t.contextTrack?.metadata?.image_url || t.track?.album?.images?.[0]?.url || t.metadata?.image_url || t.item?.album?.images?.[0]?.url || t.album?.images?.[0]?.url,
            uri: trackUri,
          }
        }) || [];

      await fetch("http://localhost:7192/api/updateQueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nowPlaying,
          queue: q,
          repeatMode,
          shuffle: shuffleState,
        }),
      });
    } catch (err) {
      console.error("QueueBridge update failed:", err);
    }
  }

  async function getUserPlaylists() {
    try {
      const root = await Spicetify.Platform.RootlistAPI.getContents();
      const playlists = root.items.filter(i => i.type === "playlist");
      
      return playlists.map(playlist => ({
        id: playlist.uri,
        name: playlist.name,
        description: playlist.description || '',
        tracks: playlist.totalLength || 0,
        uri: playlist.uri
      }));
    } catch (err) {
      console.error("Failed to get user playlists:", err);
      return [];
    }
  }

  async function getRecentlyPlayedTracks() {
    try {
      const timestamp = Date.now();
      const response = await Spicetify.CosmosAsync.get(`https://api.spotify.com/v1/me/player/recently-played?limit=50&_t=${timestamp}`);
      // console.log("Fetched recently played tracks:", response.items.length);
      return response.items.map(item => ({
        title: item.track.name,
        artist: item.track.artists.map(artist => artist.name).join(', '),
        album_cover: item.track.album.images[0]?.url,
        uri: item.track.uri,
        played_at: item.played_at,
      }));
    } catch (err) {
      console.error("Failed to get recently played tracks:", err);
      return [];
    }
  }

  async function checkCommands() {
    try {
      const res = await fetch("http://localhost:7192/api/command");
      const { action, data } = await res.json();

      if (action !== 'none') {
        console.log("Received command:", action);
      }

      switch (action) {
        case "play":
          Spicetify.Player.play();
          break;
        case "pause":
          Spicetify.Player.pause();
          break;
        case "next":
          Spicetify.Player.next();
          break;
        case "previous":
          Spicetify.Player.back();
          break;
        case "getPlaylists":
          const playlists = await getUserPlaylists();
          await fetch("http://localhost:7192/api/playlistsResponse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ playlists }),
          });
          break;
        case "getRecentlyPlayed":
          const recentlyPlayed = await getRecentlyPlayedTracks();
          await fetch("http://localhost:7192/api/recentlyPlayedResponse", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ recentlyPlayed }),
          });
          break;
        case "playPlaylist":
          if (data && data.uri) {
            try {
              // Use Spicetify.Player.playUri to play the playlist
              await Spicetify.Player.playUri(data.uri);
              console.log("Playing playlist:", data.uri);
            } catch (err) {
              console.error("Failed to play playlist:", err);
            }
          }
          break;
        case "setShuffle":
          if (data && "state" in data) {
            const rawState = data.state;
            const numericState = Number(rawState);
            // Only allow explicit 0/1 shuffle toggles coming from the app UI
            const normalizedState = numericState === 1 ? 1 : 0;
            Spicetify.Player.origin.setShuffle(Boolean(normalizedState));
            await updateBackend();
          }
          break;
        case "setRepeatMode":
          if (data && typeof data.mode === "number" && typeof Spicetify.Player.setRepeat === "function") {
            await Spicetify.Player.setRepeat(data.mode);
            await updateBackend();
          }
          break;
        case "playTrack":
          if (data && data.uri) {
            try {
              const contextUri = Spicetify.Queue?.contextUri ||
                Spicetify.Player.data?.context_uri ||
                Spicetify.Player.data?.item?.metadata?.context_uri;

              updateKnownContext(contextUri);

              const effectiveContextUri = (!contextUri || contextUri.startsWith('spotify:track:'))
                ? lastKnownContextUri
                : contextUri;

              const queueSources = [
                ...(Spicetify.Queue?.queue ?? []),
                ...(Spicetify.Queue?.nextTracks ?? [])
              ];

              const matchTrack = queueSources.find((track) => {
                const possibleUris = [
                  track?.uri,
                  track?.contextTrack?.uri,
                  track?.contextTrack?.metadata?.uri,
                  track?.track?.uri,
                  track?.item?.uri,
                  track?.metadata?.uri
                ].filter(Boolean);
                return possibleUris.includes(data.uri);
              });

              const trackUid = matchTrack?.contextTrack?.uid;

              // Only use skipTo to avoid single-track repeat caused by playUri
              if (trackUid && effectiveContextUri && Spicetify.Platform?.PlayerAPI?.skipTo) {
                await Spicetify.Platform.PlayerAPI.skipTo({
                  uri: data.uri,
                  uid: trackUid,
                  contextUri: effectiveContextUri,
                });
              }
            } catch (err) {
              console.error("Queue playback failed:", err);
            }
          }
          break;
        case "seek": {
          if (!data || typeof data !== "object") {
            break;
          }

          const rawPercent = data.positionPercent ?? data.position;
          const hasPercent = typeof rawPercent === "number" && Number.isFinite(rawPercent);
          if (!hasPercent) {
            break;
          }

          const percent = Math.min(1, Math.max(0, rawPercent));

          try {
            Spicetify.Player.seek(percent);
          } catch (err) {
            console.error("Failed to seek track:", err);
          }
          break;
        }
        default:
          break;
      }
    } catch (err) {
      console.error("Command check failed:", err);
    }
  }

  function debounce(func, delay) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), delay);
    };
  }

  const debouncedUpdateBackend = debounce(updateBackend, 300);
  const playPauseUpdateBackend = debounce(updateBackend, 100);

  Spicetify.Player.addEventListener("songchange", debouncedUpdateBackend);
  Spicetify.Player.addEventListener("queuechange", debouncedUpdateBackend);
  Spicetify.Player.addEventListener("onplaypause", playPauseUpdateBackend); 
  Spicetify.Player.addEventListener("onprogress", debouncedUpdateBackend);

  setInterval(updateBackend, 500); 
  setInterval(checkCommands, 500); 

  updateBackend();
})();
