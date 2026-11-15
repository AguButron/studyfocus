// Una llamada al servidor: sin cuerpo es GET; con cuerpo, POST en JSON. Devuelve la respuesta o el error para mostrar
export type Result<T> = { value: T; error: null } | { value: null; error: string }

export async function callApi<T>(path: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const result = await response.json()
    if (!response.ok) return { value: null, error: result.error ?? 'No se pudo completar.' }
    return { value: result, error: null }
  } catch {
    return { value: null, error: 'No se pudo conectar con el servidor.' }
  }
}
