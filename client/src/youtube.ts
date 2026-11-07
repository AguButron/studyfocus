// Los links de YouTube: se lee el video y el segundo de inicio, y se arma el reproductor insertable

export interface YouTubeVideo {
  id: string
  start: number // segundos
}

const VIDEO_ID = /^[\w-]{11}$/
const HOSTS = ['youtube.com', 'youtube-nocookie.com']

// Acepta "4218", "4218s" y "1h10m18s"
function parseStart(value: string | null) {
  if (!value) return 0
  if (/^\d+s?$/.test(value)) return parseInt(value, 10)

  const match = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/)
  if (!match) return 0
  const [, hours = '0', minutes = '0', seconds = '0'] = match
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds)
}

export function parseYouTubeLink(text: string): YouTubeVideo | null {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    return null
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null

  const host = url.hostname.replace(/^(www|m|music)\./, '')
  let id: string | null = null
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null
  } else if (HOSTS.includes(host)) {
    id = url.pathname === '/watch' ? url.searchParams.get('v') : (url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ?? null)
  }

  if (!id || !VIDEO_ID.test(id)) return null
  return { id, start: parseStart(url.searchParams.get('t') ?? url.searchParams.get('start')) }
}

// El modo de privacidad de YouTube no deja cookies hasta que se reproduce el video.
// Sin reproducción automática, el video queda en pausa hasta que la persona le da play.
export function createYouTubePlayer({ id, start }: YouTubeVideo, autoplay: boolean) {
  const frame = document.createElement('iframe')
  const params = new URLSearchParams({ autoplay: autoplay ? '1' : '0', rel: '0', playsinline: '1' })
  if (start > 0) {
    params.set('start', String(start))
  }

  frame.src = `https://www.youtube-nocookie.com/embed/${id}?${params}`
  frame.title = 'Música de YouTube'
  frame.allow = 'autoplay; encrypted-media; picture-in-picture'
  frame.referrerPolicy = 'strict-origin-when-cross-origin' // YouTube pide saber desde qué sitio se inserta
  frame.allowFullscreen = true
  return frame
}
