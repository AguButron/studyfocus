import Phaser from 'phaser'
import './style.css'

const PLAYER_SPEED = 200 // píxeles por segundo

class RoomScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Rectangle
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
  private keyW!: Phaser.Input.Keyboard.Key
  private keyA!: Phaser.Input.Keyboard.Key
  private keyS!: Phaser.Input.Keyboard.Key
  private keyD!: Phaser.Input.Keyboard.Key

  constructor() {
    super('RoomScene')
  }

  create() {
    this.player = this.add.rectangle(400, 300, 32, 32, 0x89b4fa)
    this.cursors = this.input.keyboard!.createCursorKeys()
    this.keyW = this.input.keyboard!.addKey('W')
    this.keyA = this.input.keyboard!.addKey('A')
    this.keyS = this.input.keyboard!.addKey('S')
    this.keyD = this.input.keyboard!.addKey('D')
  }

  update(_time: number, delta: number) {

    const distance = PLAYER_SPEED * (delta / 1000)

    let dx = 0
    let dy = 0
    
    if (this.keyW.isDown || this.cursors.up.isDown) {
      dy -= distance
    }

    if (this.keyA.isDown || this.cursors.left.isDown) {
      dx -= distance
    }

    if (this.keyS.isDown || this.cursors.down.isDown) {
      dy += distance
    }

    if (this.keyD.isDown || this.cursors.right.isDown) {
      dx += distance
    }

    const length = Math.hypot(dx, dy)
    if (length === 0) return

    this.player.x += (dx / length) * distance
    this.player.y += (dy / length) * distance

  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  width: 800,
  height: 600,
  parent: 'app',
  backgroundColor: '#2a2a3c',
  scene: RoomScene,
})