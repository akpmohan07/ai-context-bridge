// YouTube caption extraction for the Second Viewer link. Runs in the page's MAIN world,
// because it needs YouTube's own player object (#movie_player) and ytcfg.
//
// Ported from asbplayer (https://github.com/asbplayer/asbplayer), files
// extension/src/entrypoints/youtube-page.ts, extension/src/services/youtube.ts and the
// srv3 branch of common/subtitle-reader/subtitle-reader.ts. asbplayer is AGPL-3.0, so this
// file is AGPL-3.0 too. That is why the feature lives on an unpublished branch: do not ship
// it in a store build of AI Context Bridge (Apache-2.0) without rewriting it first.
//
// Order of attempts, as in asbplayer:
//   1. the initialized player's caption tracks (their URLs carry the runtime "pot" token)
//   2. the InnerTube player API with the ANDROID client
//   3. the page's player response plus a pot token decoded from sessionStorage

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function poll(test, timeoutMs) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (test()) return true;
    await sleep(200);
  }
  return false;
}

export function currentVideoId() {
  const path = /\/(shorts|embed|live)\/([^/?#]+)/.exec(location.pathname)?.[2];
  return path || new URLSearchParams(location.search).get('v') || null;
}

const player = () => document.querySelector('#movie_player');

const trackLabel = (t) =>
  t.name?.simpleText || t.name?.runs?.[0]?.text || t.displayName || t.languageName || t.languageCode;

function timedTextUrl(track) {
  const url = new URL(track.url || track.baseUrl, location.href);
  url.searchParams.set('fmt', 'srv3');
  url.searchParams.set('c', window.ytcfg?.get?.('INNERTUBE_CLIENT_NAME') || 'WEB');
  return url.toString();
}

// 1. The player exposes caption URLs once it has initialized its audio track.
async function tracksFromPlayer(videoId) {
  let tracks;
  const ok = await poll(() => {
    const p = player();
    const playerVideoId = p?.getVideoData?.()?.video_id;
    const t = p?.getAudioTrack?.()?.captionTracks;
    if ((playerVideoId === undefined || playerVideoId === videoId) && Array.isArray(t) && t.length) {
      const hasPot = t.some((x) => x?.url && new URL(x.url, location.href).searchParams.get('pot') !== null);
      if (hasPot) {
        tracks = t;
        return true;
      }
    }
    return false;
  }, 5000);
  return ok ? tracks : undefined;
}

// 2. Ask InnerTube as the Android app.
async function tracksFromAndroidInnerTube(videoId) {
  const apiKey = window.ytcfg?.get?.('INNERTUBE_API_KEY');
  if (!apiKey) return undefined;
  const response = await fetch(`https://${location.host}/youtubei/v1/player?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      context: { client: { clientName: 'ANDROID', clientVersion: '20.10.38', hl: window.ytcfg.get('HL') || 'en' } },
      videoId,
    }),
  });
  if (response.status !== 200) return undefined;
  const payload = await response.json();
  return payload?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
}

// 3. The page's player response, with a pot token decoded from YouTube's sessionStorage cache.
function computeHash(input, start = 0, end = input.length) {
  let hash = 0;
  for (let i = start; i < end; i++) hash = (Math.imul(31, hash) + input.charCodeAt(i)) | 0;
  return hash;
}

function transformData(data, videoId) {
  const mid = videoId.length >> 1;
  const key1 = computeHash(videoId, 0, mid);
  const key2 = computeHash(videoId, mid);
  const data32 = new Uint32Array(data.buffer);
  const firstWord = data32[0];
  for (let i = 1; i < data32.length; i += 2) {
    let a = firstWord, b = i, c = key1, d = key2;
    for (let round = 0; round < 22; round++) {
      b = ((b >>> 8) | (b << 24)) + a;
      b ^= c + 38293;
      a = ((a << 3) | (a >>> 29)) ^ b;
      d = ((d >>> 8) | (d << 24)) + c;
      d ^= round + 38293;
      c = ((c << 3) | (c >>> 29)) ^ d;
    }
    data32[i] ^= a;
    if (i + 1 < data32.length) data32[i + 1] ^= b;
  }
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function decodeCachedPoToken(videoId, encoded) {
  const data = base64ToBytes(encoded);
  transformData(data, videoId);
  let index = 4;
  while (index < 7 && data[index] === 0) index++;
  for (const byte of [196, 200, 224, 18]) {
    if (data[index++] !== byte) return undefined;
  }
  index += 4; // expiry timestamp
  let bin = '';
  for (const b of new Uint8Array(data.buffer, index)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\//g, '_').replace(/\+/g, '-').replace(/=+$/g, '');
}

function decodePoToken(videoId) {
  const keys = window.sessionStorage.getItem('iU5q-!O9@$');
  if (!keys) return undefined;
  let token;
  for (const key of keys.split(',')) {
    const encoded = window.sessionStorage.getItem(key);
    if (!encoded) continue;
    try {
      token = decodeCachedPoToken(videoId, encoded) ?? token;
    } catch {
      // not a pot entry
    }
  }
  return token;
}

function tracksWithDecodedPot(videoId) {
  const pot = decodePoToken(videoId);
  const tracks = playerResponse(videoId)?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!pot || !Array.isArray(tracks)) return undefined;
  return tracks.map((t) => {
    const url = new URL(t.baseUrl, location.href);
    url.searchParams.set('pot', pot);
    return { ...t, url: url.toString() };
  });
}

function playerResponse(videoId) {
  const fromPlayer = player()?.getPlayerResponse?.();
  if (fromPlayer?.videoDetails?.videoId === videoId) return fromPlayer;
  const initial = window.ytInitialPlayerResponse;
  if (initial?.videoDetails?.videoId === videoId) return initial;
  return fromPlayer;
}

// Prefer captions written by people, in English; then English auto captions; then anything.
function pickTrack(tracks) {
  const en = (t) => (t.languageCode || '').startsWith('en');
  const human = (t) => t.kind !== 'asr';
  return (
    tracks.find((t) => human(t) && en(t)) ||
    tracks.find((t) => en(t)) ||
    tracks.find(human) ||
    tracks[0]
  );
}

// The srv3 XML is parsed by the Second Viewer server: YouTube's page enforces Trusted Types,
// which blocks DOMParser here.
const looksLikeSrv3 = (body) => /<timedtext[\s>]/.test(body) && /<p\s/.test(body);

function details(videoId) {
  const pr = playerResponse(videoId);
  const vd = pr?.videoDetails || {};
  const mf = pr?.microformat?.playerMicroformatRenderer || {};
  return {
    videoId,
    url: location.href,
    title: vd.title || player()?.getVideoData?.()?.title || document.title.replace(/ - YouTube$/, ''),
    channel: vd.author || mf.ownerChannelName || null,
    published: mf.publishDate || mf.uploadDate || null,
    length: Number(vd.lengthSeconds) || null,
    description: vd.shortDescription || '',
  };
}

// Everything the server needs about this video, captions included.
export async function videoContext() {
  const videoId = currentVideoId();
  if (!videoId) return { error: 'no video on this page' };
  const ctx = { ...details(videoId), srv3: null, track: null, error: null };
  const attempts = [
    ['player', () => tracksFromPlayer(videoId)],
    ['android', () => tracksFromAndroidInnerTube(videoId)],
    ['pot', async () => tracksWithDecodedPot(videoId)],
  ];
  const errors = [];
  for (const [name, getTracks] of attempts) {
    try {
      const tracks = (await getTracks())?.filter((t) => (t.url || t.baseUrl) && t.languageCode);
      if (!tracks?.length) {
        errors.push(`${name}: no tracks`);
        continue;
      }
      const track = pickTrack(tracks);
      const res = await fetch(timedTextUrl(track));
      const body = res.ok ? await res.text() : '';
      if (!looksLikeSrv3(body)) {
        errors.push(`${name}: empty (${res.status})`);
        continue;
      }
      ctx.srv3 = body;
      ctx.track = { label: trackLabel(track), language: track.languageCode, auto: track.kind === 'asr', via: name };
      break;
    } catch (e) {
      errors.push(`${name}: ${e?.message || e}`);
    }
  }
  if (!ctx.srv3) ctx.error = errors.join('; ');
  // Don't hand over captions for a different video (YouTube is a single-page app).
  if (currentVideoId() !== videoId) return { error: 'video changed while loading captions' };
  return ctx;
}
