// Si el navegador dibuja la sala 3D sin la tarjeta gráfica (aceleración por hardware apagada, o un computador
// que el navegador no considera apto). En ese modo la sala va lenta, y con el video de YouTube encima aparecen
// cuadros negros y parpadeo. Sin Three.js: pregunta directo al navegador, con un lienzo de prueba que se descarta.

// Dibujadores por software: Chrome, Brave y Edge usan SwiftShader; Linux, llvmpipe; Windows, Microsoft Basic Render
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i

let result: boolean | null = null

function describeRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext) {
  // Los navegadores actuales ya dan el nombre real en RENDERER; la extensión queda para los más antiguos
  const info = gl.getExtension('WEBGL_debug_renderer_info')
  return String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '')
}

// roomContext: el lienzo real de la sala, que también se revisa por su nombre (algunos navegadores entregan
// el lienzo de prueba aunque después dibujen por software)
export function isSoftwareRendering(roomContext?: WebGLRenderingContext | WebGL2RenderingContext | null) {
  if (result !== null) return result
  try {
    if (roomContext && SOFTWARE_RENDERER.test(describeRenderer(roomContext))) return (result = true)
    // Con failIfMajorPerformanceCaveat, el navegador no entrega el lienzo si tendría que dibujar sin tarjeta gráfica
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: true })
      ?? document.createElement('canvas').getContext('webgl', { failIfMajorPerformanceCaveat: true })
    result = !gl || SOFTWARE_RENDERER.test(describeRenderer(gl))
    gl?.getExtension('WEBGL_lose_context')?.loseContext() // libera el lienzo de prueba al tiro
  } catch {
    result = false // si no se puede preguntar, no se avisa
  }
  return result
}
