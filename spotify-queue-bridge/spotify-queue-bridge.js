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

      const nowPlaying = current
        ? {
            title: current.title,
            artist: current.artist_name,
            album_cover: current.image_url,
            isPlaying: Spicetify.Player.isPlaying(),
          }
        : {};

      const q =
        queue?.queue?.next_tracks?.map((t) => {
          // console.log('Queue track object:', t);
          const trackUri = t.uri || t.contextTrack?.uri || t.track?.uri || t.item?.uri || t.contextTrack?.metadata?.uri || t.metadata?.uri;
          return {
            title: t.contextTrack?.metadata?.title || t.track?.name || t.metadata?.title || t.item?.title || t.name,
            artist: t.contextTrack?.metadata?.artist_name || t.track?.artists?.[0]?.name || t.item?.artists?.[0]?.name || t.metadata?.artist_name || (t.artists?.[0]?.name ?? "Unknown"),
            album_cover: t.contextTrack?.metadata?.image_url || t.track?.album?.images?.[0]?.url || t.metadata?.image_url || t.item?.album?.images?.[0]?.url || t.album?.images?.[0]?.url,
            uri: trackUri,
          }
        }) || [];

      await fetch("http://localhost:7192/api/updateQueue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nowPlaying, queue: q }),
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

  setInterval(updateBackend, 2000); 
  setInterval(checkCommands, 500); 

  updateBackend();
})();
