import { getDesign } from './designs'
import { buildRoom } from './roomBuilder'
import { createVoxelView } from './voxelView'

// La vista previa de la sala en Estudiar, antes de crearla: el diseño en cubos, quieto. Se descarga
// recién al abrir esa sección (menu.ts la importa al usarla), así el menú no carga Three.js de entrada.
// Una sola vista para todas: al cambiar de diseño se arma la sala nueva en el mismo lienzo

let view: ReturnType<typeof createVoxelView> | null = null
let shownId: string | null = null

export function showRoomPreview(container: HTMLElement, designId: string) {
  if (!view) {
    view = createVoxelView(container)
    view.setPixels(true)
    view.controls.enableZoom = false // la rueda del mouse sigue moviendo la página, no acerca la sala
  }
  view.start()
  if (shownId === designId) return
  const design = getDesign(designId)
  if (!design) return
  shownId = designId
  view.show(buildRoom(design), design.theme.sky)
}

// Al salir de Estudiar deja de dibujar, para no gastar mientras no se ve
export function pauseRoomPreview() {
  view?.renderer.setAnimationLoop(null)
}
