import Phaser from 'phaser'
import './style.css'

class RoomScene extends Phaser.Scene {
  constructor() {
    super('RoomScene')
  }

  create() {
    this.add.text(400, 300, 'StudyFocus', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5)
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
