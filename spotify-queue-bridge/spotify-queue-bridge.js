// ==UserScript==
// @thebest7192       Spotify Queue Bridge for NextPeek
// ==/UserScript==

(async function QueueBridge() {
  while (!Spicetify?.Player || !Spicetify?.CosmosAsync) {
    await new Promise(r => setTimeout(r, 500));
  }

  async function updateBackend() {
    try {
      let queue;
      // Always use Spicetify's local queue data
      queue = { queue: { next_tracks: Spicetify.Queue?.nextTracks || [] } };

      const current = Spicetify.Player.data?.item?.metadata;

      const nowPlaying = current
        ? {
            title: current.title,
            artist: current.artist_name,
            album_cover: current.image_url,
          }
        : {};

      const q =
        queue?.queue?.next_tracks?.map((t) => {
          console.log('Queue track object:', t);
          return {
            title: t.contextTrack?.metadata?.title || t.track?.name || t.metadata?.title || t.item?.title || t.name,
            artist: t.contextTrack?.metadata?.artist_name || t.track?.artists?.[0]?.name || t.item?.artists?.[0]?.name || t.metadata?.artist_name || (t.artists?.[0]?.name ?? "Unknown"),
            album_cover: t.contextTrack?.metadata?.image_url || t.track?.album?.images?.[0]?.url || t.metadata?.image_url || t.item?.album?.images?.[0]?.url || t.album?.images?.[0]?.url,
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


  async function checkCommands() {
    try {
      const res = await fetch("http://localhost:7192/api/command");
      const { action } = await res.json();

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

  const debouncedUpdateBackend = debounce(updateBackend, 1000);

  Spicetify.Player.addEventListener("songchange", debouncedUpdateBackend);
  Spicetify.Player.addEventListener("queuechange", debouncedUpdateBackend);
  Spicetify.Player.addEventListener("onplaypause", debouncedUpdateBackend);
  Spicetify.Player.addEventListener("onprogress", debouncedUpdateBackend);

  // Update every 5s
  // setInterval(updateBackend, 5000);
  setInterval(checkCommands, 1000);

  updateBackend();
})();
