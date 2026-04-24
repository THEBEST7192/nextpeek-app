// LRCLIB API implementation inspired by lucid-lyrics
// https://gitlab.com/sanoojes/lucid-lyrics
// Licensed under GNU AGPLv3

const LRCLIB_BASE_URL = "https://lrclib.net/api/get";

export async function fetchLyrics(title, artist, album, duration) {
  if (!title || !artist) {
    return { success: false, error: 'Missing track information' };
  }

  const params = new URLSearchParams({
    track_name: title,
    artist_name: artist,
    album_name: album || '',
    duration: String((duration || 0) / 1000),
  });

  const requestUrl = `${LRCLIB_BASE_URL}?${params.toString()}`;

  try {
    const response = await fetch(requestUrl, {
      headers: {
        "x-user-agent": "NextPeek (https://github.com/THEBEST7192/nextpeek-app)",
      },
    });

    if (!response.ok) {
      throw new Error("LRC Fetch Failed");
    }

    const data = await response.json();

    if (data.error || data.statusCode) {
      return { success: false, error: 'Lyrics not found' };
    }

    if (data.plainLyrics) {
      return { success: true, lyrics: data.plainLyrics };
    }

    if (data.syncedLyrics) {
      // Parse synced lyrics to plain text
      const lines = data.syncedLyrics.split('\n');
      const plainText = lines
        .map(line => {
          const match = line.match(/\](.*)$/);
          return match ? match[1].trim() : '';
        })
        .filter(line => line && line !== '♪' && line !== '♫')
        .join('\n');
      
      return { success: true, lyrics: plainText || 'No lyrics available' };
    }

    return { success: false, error: 'No lyrics available' };
  } catch (err) {
    return { success: false, error: 'Failed to load lyrics' };
  }
}

function parseLRC(lyrics, durationSecs) {
  const lines = lyrics.split("\n");
  const result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.length < 6) continue;

    if (line[0] === "[" && line.charCodeAt(1) >= 65) continue;

    const tagEnd = line.indexOf("]");
    if (line[0] === "[" && tagEnd !== -1) {
      const colonIdx = line.indexOf(":", 1);

      if (colonIdx !== -1 && colonIdx < tagEnd) {
        const mins = Number(line.substring(1, colonIdx));
        const secs = Number(line.substring(colonIdx + 1, tagEnd));
        const startTime = mins * 60 + secs;

        if (!Number.isNaN(startTime)) {
          let text = line.substring(tagEnd + 1).trim();

          if (text.indexOf("[") !== -1) {
            text = text.replace(/\[\d{2}:\d{2}(?:\.\d{2,3})?\]/g, "").trim();
          }
          if (text.indexOf("<") !== -1) {
            text = text.replace(/<[^>]+>/g, "").trim();
          }

          if (!text || text === "♪" || text === "♫") {
            text = " ";
          }

          result.push(text);
        }
      }
    }
  }

  return result.filter(line => line && line !== " ").join('\n');
}
