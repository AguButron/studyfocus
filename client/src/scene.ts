import * as THREE from 'three'

const WIDTH = 800
const HEIGHT = 600

export const scene = new THREE.Scene()
scene.background = new THREE.Color(0x2a2a3c)

export const camera = new THREE.PerspectiveCamera(60, WIDTH / HEIGHT, 0.1, 100)
camera.position.set(0, 10, 10)
camera.lookAt(0, 0, 0)

export const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.setSize(WIDTH, HEIGHT)
document.querySelector('#app')!.append(renderer.domElement)

scene.add(new THREE.AmbientLight(0xffffff, 0.6))

const sun = new THREE.DirectionalLight(0xffffff, 2)
sun.position.set(3, 5, 4)
scene.add(sun)