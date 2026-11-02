import * as THREE from 'three'

const FONT = '32px system-ui, sans-serif'
const LABEL_HEIGHT = 48 // píxeles de la imagen
const PADDING = 12
const METERS_PER_PIXEL = 0.01
const LABEL_Y = 1 // metros sobre el centro del personaje

export function createLabel(text: string) {
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')!

  context.font = FONT
  canvas.width = Math.ceil(context.measureText(text).width) + PADDING * 2
  canvas.height = LABEL_HEIGHT

  // Cambiar el tamaño del canvas borra su configuración
  context.font = FONT
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = 'rgba(30, 30, 46, 0.8)'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#ffffff'
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace

  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture }))
  label.scale.set(canvas.width * METERS_PER_PIXEL, canvas.height * METERS_PER_PIXEL, 1)
  label.position.y = LABEL_Y
  return label
}

export function disposeLabel(label: THREE.Sprite) {
  label.material.map?.dispose()
  label.material.dispose()
}