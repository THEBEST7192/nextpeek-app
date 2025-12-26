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
      const internalQueue = Spicetify.Platform?.PlayerAPI?._queue?._queue;
      const nextTracks = Spicetify.Queue?.nextTracks || [];
      const prevTracks = internalQueue?.prevTracks || [];

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

      const mapTrack = (t) => {
        const trackUri = t.uri || t.contextTrack?.uri || t.track?.uri || t.item?.uri || t.contextTrack?.metadata?.uri || t.metadata?.uri;
        const metadata = t.contextTrack?.metadata || t.metadata || {};
        return {
          title: metadata.title || t.track?.name || t.item?.title || t.name || "Unknown Title",
          artist: Object.keys(metadata).filter(k => k.startsWith('artist_name')).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).map(k => metadata[k]).filter(Boolean).join(', ') || t.track?.artists?.map(a => a.name).join(', ') || "Unknown Artist",
          album_cover: metadata.image_url || t.track?.album?.images?.[0]?.url || t.item?.album?.images?.[0]?.url || t.album?.images?.[0]?.url,
          uri: trackUri,
        };
      };

      const q = nextTracks.map(mapTrack);
      const history = prevTracks.map(mapTrack).reverse();

      await fetch("http://localhost:7192/api/updateQueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nowPlaying,
          queue: q,
          history: history,
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
        case "getRecentlyPlayed":
          await updateBackend();
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
          const duration = Spicetify.Player.getDuration();
          if (duration > 0) {
            Spicetify.Player.seek(percent * duration);
          }
          break;
        }
      }
    } catch (err) {
      // console.error("checkCommands failed:", err);
    }
  }

  // Update backend when player state changes
  Spicetify.Player.addEventListener("onplaypause", updateBackend);
  Spicetify.Player.addEventListener("onprogress", updateBackend);
  Spicetify.Player.addEventListener("songchange", updateBackend);

  // Poll for commands from the NextPeek desktop app
  setInterval(checkCommands, 500);
  
  // Initial update
  updateBackend();
})();