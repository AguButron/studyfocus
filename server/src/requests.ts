import type { IncomingMessage, RequestListener, ServerResponse } from 'node:http'

const MAX_BODY_SIZE = 8192 // bytes, un token de Google cabe de sobra
const ATTEMPT_WINDOW = 15 * 60 * 1000 // milisegundos
const UNAVAILABLE = 'No está disponible ahora. Prueba de nuevo en unos minutos.'

// Un error que se le muestra a la persona, con su código HTTP
export class RequestError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const attempts = new Map<string, { count: number; resetAt: number }>()

// Cuenta los intentos de cada clave en una ventana de tiempo, para frenar a quien prueba muchas veces
export function allowAttempt(key: string, max: number) {
  const now = Date.now()
  for (const [otherKey, attempt] of attempts) {
    if (attempt.resetAt <= now) attempts.delete(otherKey)
  }

  const attempt = attempts.get(key) ?? { count: 0, resetAt: now + ATTEMPT_WINDOW }
  attempt.count++
  attempts.set(key, attempt)
  return attempt.count <= max
}

// Solo acepta JSON: otro sitio no puede enviarlo con la cookie de la persona sin que el navegador lo bloquee
export async function readBody(request: IncomingMessage) {
  if (!request.headers['content-type']?.startsWith('application/json')) {
    throw new RequestError(415, 'Formato no válido.')
  }

  let body = ''
  for await (const chunk of request) {
    body += chunk
    if (body.length > MAX_BODY_SIZE) throw new RequestError(413, 'Mensaje demasiado grande.')
  }

  try {
    const parsed: unknown = JSON.parse(body)
    return (parsed ?? {}) as Record<string, unknown>
  } catch {
    throw new RequestError(400, 'Formato no válido.')
  }
}

export function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

// Responde los errores esperados con su mensaje, y cualquier otro como un servicio no disponible
export function createJsonHandler(
  label: string,
  handle: (request: IncomingMessage, response: ServerResponse) => Promise<void>,
  unavailableMessage = UNAVAILABLE,
): RequestListener {
  return (request, response) => {
    handle(request, response).catch((error: unknown) => {
      if (error instanceof RequestError) {
        sendJson(response, error.status, { error: error.message })
        return
      }
      console.error(`Error en ${label}:`, error)
      sendJson(response, 503, { error: unavailableMessage })
    })
  }
}
