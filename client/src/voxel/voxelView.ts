import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import type { BuiltRoom, Sky } from './roomBuilder'
import { faceQuads, VOXEL_SIZE, type VoxelSet } from './voxels'
import { windowWeather } from './windowWeather'

// Dibuja una sala en cubos con Three.js, con su luz y una cámara que se puede mover. La usan la galería de
// diseños y "Crea tu sala"; la sala de verdad (room.ts) usa voxelMesh para sus cubos.

const MAX_LAMPS = 6 // luces de lámparas a la vez: más gastan demasiado al dibujar

// Toda la sala en dos figuras (una que recibe luz y sombra, y otra con lo que brilla), con solo las caras que
// se ven y las vecinas del mismo color juntas (faceQuads). Responde cuántos triángulos quedaron
export function voxelMesh(voxels: VoxelSet) {
  const group = new THREE.Group()
  const quads = faceQuads(voxels)
  let triangles = 0
  const color = new THREE.Color()
  for (const glowing of [false, true]) {
    const list = quads.filter((quad) => (quad.glow > 0) === glowing)
    if (list.length === 0) continue
    // Arreglos del tamaño justo desde el principio: con cubos de 2,5 cm son cientos de miles de números
    const positions = new Float32Array(list.length * 12)
    const normals = new Float32Array(list.length * 12)
    const colors = new Float32Array(list.length * 12)
    const indices = new Uint32Array(list.length * 6)
    list.forEach((quad, q) => {
      color.setHex(quad.color)
      if (glowing) color.multiplyScalar(0.55 + quad.glow * 0.55)
      const ua = (quad.axis + 1) % 3
      const va = (quad.axis + 2) % 3
      const corners = [0, 0, quad.width, 0, quad.width, quad.height, 0, quad.height]
      for (let c = 0; c < 4; c++) {
        const at = q * 12 + c * 3
        positions[at + quad.axis] = quad.plane * VOXEL_SIZE
        positions[at + ua] = (quad.u + corners[c * 2]) * VOXEL_SIZE
        positions[at + va] = (quad.v + corners[c * 2 + 1]) * VOXEL_SIZE
        normals[at + quad.axis] = quad.sign
        colors[at] = color.r
        colors[at + 1] = color.g
        colors[at + 2] = color.b
      }
      // De frente se ve en sentido contrario a las agujas del reloj; mirando hacia el otro lado, al revés
      const first = q * 4
      indices.set(quad.sign === 1 ? [first, first + 1, first + 2, first, first + 2, first + 3] : [first, first + 2, first + 1, first, first + 3, first + 2], q * 6)
    })
    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
    geometry.setIndex(new THREE.BufferAttribute(indices, 1))
    const material = glowing ? new THREE.MeshBasicMaterial({ vertexColors: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })
    const mesh = new THREE.Mesh(geometry, material)
    mesh.castShadow = !glowing
    mesh.receiveShadow = !glowing
    group.add(mesh)
    triangles += indices.length / 3
  }
  return { group, triangles }
}

export const SKY_LIGHT: Record<Sky, { hemi: number; sky: number; ground: number; sun: number; sunColor: number; front: number; background: number; lamp: number }> = {
  dia: { hemi: 1.1, sky: 0xdfe8ff, ground: 0x6b5a4a, sun: 2.2, sunColor: 0xfff1d6, front: 0.7, background: 0x1b2230, lamp: 0.6 },
  tarde: { hemi: 0.85, sky: 0xb8c4ff, ground: 0x4a3426, sun: 1.6, sunColor: 0xffc89a, front: 0.55, background: 0x121417, lamp: 1 },
  noche: { hemi: 0.28, sky: 0x8fa6ff, ground: 0x1a1424, sun: 0.3, sunColor: 0x8fa6ff, front: 0.18, background: 0x0b0c10, lamp: 1.5 },
}

export type ViewName = 'room' | 'close' | 'side'

export function createVoxelView(container: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: false })
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap
  container.append(renderer.domElement)

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200)
  const controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI * 0.48
  controls.minDistance = 0.8
  controls.maxDistance = 30
  controls.autoRotateSpeed = 0.6

  const hemi = new THREE.HemisphereLight()
  const sun = new THREE.DirectionalLight()
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.bias = -0.0008
  const front = new THREE.DirectionalLight(0xc9d2ff)
  scene.add(hemi, sun, sun.target, front)

  let roomGroup: THREE.Group | null = null
  const lamps: THREE.PointLight[] = []
  let size = { width: 6, depth: 6 }
  let goal: { position: THREE.Vector3; target: THREE.Vector3 } | null = null
  let pixelScale = 0.75

  function fit() {
    const { clientWidth: w, clientHeight: h } = container
    renderer.setPixelRatio(pixelScale * Math.min(window.devicePixelRatio, 2))
    renderer.setSize(w, h, false)
    camera.aspect = w / Math.max(1, h)
    camera.updateProjectionMatrix()
  }
  new ResizeObserver(fit).observe(container)
  fit()
  controls.addEventListener('start', () => (goal = null))

  function viewFor(name: ViewName) {
    const w = size.width * VOXEL_SIZE
    const d = size.depth * VOXEL_SIZE
    // En una pantalla angosta la sala no cabe de ancho: la cámara se aleja
    const narrow = Math.max(1, 1.4 / camera.aspect) ** 0.6
    const distance = (Math.max(w * 0.8, d) * 0.9 + 1.2) * narrow
    if (name === 'close') return { position: [w * 0.18, 1.6, d * 0.18], target: [0, 0.7, -d * 0.2] }
    if (name === 'side') return { position: [-w * 0.42, 2.2, d * 0.42], target: [w * 0.1, 0.5, -d * 0.1] }
    return { position: [0, distance * 0.82, distance * 0.95], target: [0, 0.2, -d * 0.04] }
  }

  return {
    renderer,
    camera,
    scene,
    controls,
    // Cambia la sala que se ve. keepCamera deja la cámara donde está (al editar en "Crea tu sala").
    // Responde cuántos cubos y triángulos dibujó
    show(built: BuiltRoom, sky: Sky, keepCamera = false) {
      if (roomGroup) {
        scene.remove(roomGroup)
        roomGroup.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose()
            ;(object.material as THREE.Material).dispose()
          }
        })
      }
      const { group, triangles } = voxelMesh(built.voxels)
      group.add(windowWeather(built.windows))
      const stats = { cubes: built.voxels.size, triangles }
      roomGroup = group
      scene.add(group)
      size = { width: built.width, depth: built.depth }

      const light = SKY_LIGHT[sky]
      scene.background = new THREE.Color(light.background)
      hemi.color.setHex(light.sky)
      hemi.groundColor.setHex(light.ground)
      hemi.intensity = light.hemi
      const w = built.width * VOXEL_SIZE
      const d = built.depth * VOXEL_SIZE
      sun.color.setHex(light.sunColor)
      sun.intensity = light.sun
      sun.position.set(w * 0.2, 3.4, -d * 0.5 - 2)
      sun.target.position.set(0, 0, d * 0.15)
      const reach = Math.max(w, d) * 0.65
      Object.assign(sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 0.5, far: d + 10 })
      sun.shadow.camera.updateProjectionMatrix()
      front.intensity = light.front
      front.position.set(-1, 4, d + 2)

      for (const lamp of lamps) scene.remove(lamp)
      lamps.length = 0
      for (const source of built.lights.slice(0, MAX_LAMPS)) {
        const lamp = new THREE.PointLight(source.color, source.intensity * light.lamp, source.distance, 1.6)
        lamp.position.set((source.x + 0.5) * VOXEL_SIZE, (source.y + 0.5) * VOXEL_SIZE, (source.z + 0.5) * VOXEL_SIZE)
        scene.add(lamp)
        lamps.push(lamp)
      }

      if (!keepCamera) {
        const view = viewFor('room')
        camera.position.set(...(view.position as [number, number, number]))
        controls.target.set(...(view.target as [number, number, number]))
        goal = null
      }
      return stats
    },
    setView(name: ViewName) {
      const view = viewFor(name)
      goal = { position: new THREE.Vector3(...view.position), target: new THREE.Vector3(...view.target) }
    },
    setPixels(isOn: boolean) {
      pixelScale = isOn ? 0.75 : 1
      renderer.domElement.style.imageRendering = isOn ? 'pixelated' : ''
      fit()
    },
    start(onFrame?: () => void) {
      renderer.setAnimationLoop(() => {
        if (goal) {
          camera.position.lerp(goal.position, 0.1)
          controls.target.lerp(goal.target, 0.1)
          if (camera.position.distanceTo(goal.position) < 0.01) goal = null
        }
        controls.update()
        onFrame?.()
        renderer.render(scene, camera)
      })
    },
  }
}
