import * as THREE from 'three'
import { parseHexColor } from '@learning-hub/core/world'

export interface CharacterCustomizationOptions {
  characterId: string // e.g. 'char_apprentice', 'char_ranger', 'char_alchemist', 'char_monk', 'char_mage', 'char_sage'
  headAccessory?: string | null // e.g. 'head_straw_hat', 'head_glasses', 'head_mage_hood', 'head_crown'
  handAccessory?: string | null // e.g. 'hand_quill', 'hand_book', 'hand_lantern', 'hand_staff'
  robeColor?: string
}

export interface CharacterInstance {
  group: THREE.Group
  update: (deltaSeconds: number, isMoving: boolean) => void
  setMoving: (moving: boolean) => void
}

/**
 * Creates a low-poly stylized character avatar with modular clothing, accessories, and animations.
 */
export function createLowPolyCharacter(options: CharacterCustomizationOptions): CharacterInstance {
  const rootGroup = new THREE.Group()

  // Base colors by character
  let robeColor = 0x4f46e5 // Apprentice indigo
  const skinColor = 0xfcd34d // warm skin tone
  let hairColor = 0x78350f // brown hair

  switch (options.characterId) {
    case 'char_ranger':
      robeColor = 0x15803d
      hairColor = 0x451a03
      break
    case 'char_alchemist':
      robeColor = 0x7c3aed
      hairColor = 0x1e293b
      break
    case 'char_monk':
      robeColor = 0xea580c
      hairColor = 0x0f172a
      break
    case 'char_mage':
      robeColor = 0x0284c7
      hairColor = 0xe2e8f0
      break
    case 'char_sage':
      robeColor = 0x047857
      hairColor = 0xffffff
      break
    case 'char_apprentice':
    default:
      robeColor = 0x4f46e5
      break
  }

  if (options.robeColor) {
    robeColor = parseHexColor(options.robeColor, robeColor)
  }

  const robeMat = new THREE.MeshStandardMaterial({ color: robeColor, flatShading: true })
  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, flatShading: true })
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, flatShading: true })
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, flatShading: true })

  // 1. Torso / Robe
  const bodyGeo = new THREE.ConeGeometry(0.7, 1.4, 6)
  const body = new THREE.Mesh(bodyGeo, robeMat)
  body.position.y = 0.9
  body.castShadow = true
  rootGroup.add(body)

  // Belt / sash
  const beltGeo = new THREE.CylinderGeometry(0.55, 0.58, 0.15, 6)
  const belt = new THREE.Mesh(beltGeo, darkMat)
  belt.position.y = 0.8
  rootGroup.add(belt)

  // 2. Head
  const headGeo = new THREE.DodecahedronGeometry(0.42, 0)
  const head = new THREE.Mesh(headGeo, skinMat)
  head.position.y = 1.75
  head.castShadow = true
  rootGroup.add(head)

  // Eyes (simple dark cubes)
  const eyeGeo = new THREE.BoxGeometry(0.08, 0.08, 0.08)
  const leftEye = new THREE.Mesh(eyeGeo, darkMat)
  leftEye.position.set(-0.14, 1.8, 0.35)
  const rightEye = new THREE.Mesh(eyeGeo, darkMat)
  rightEye.position.set(0.14, 1.8, 0.35)
  rootGroup.add(leftEye)
  rootGroup.add(rightEye)

  // Hair
  const hairGeo = new THREE.DodecahedronGeometry(0.44, 0)
  const hair = new THREE.Mesh(hairGeo, hairMat)
  hair.position.set(0, 1.88, -0.05)
  hair.scale.set(1.02, 0.6, 1.05)
  rootGroup.add(hair)

  // 3. Limbs (Arms)
  const armGeo = new THREE.CylinderGeometry(0.1, 0.12, 0.7, 5)
  const leftArm = new THREE.Mesh(armGeo, robeMat)
  leftArm.position.set(-0.55, 1.15, 0)
  leftArm.rotation.z = 0.25
  leftArm.castShadow = true
  rootGroup.add(leftArm)

  const rightArm = new THREE.Mesh(armGeo, robeMat)
  rightArm.position.set(0.55, 1.15, 0)
  rightArm.rotation.z = -0.25
  rightArm.castShadow = true
  rootGroup.add(rightArm)

  // 4. Headwear Accessory
  if (options.headAccessory) {
    if (options.headAccessory === 'head_straw_hat') {
      const brim = new THREE.Mesh(
        new THREE.CylinderGeometry(0.85, 0.85, 0.05, 8),
        new THREE.MeshStandardMaterial({ color: 0xeab308, flatShading: true }),
      )
      brim.position.y = 1.95
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(0.45, 0.35, 6),
        new THREE.MeshStandardMaterial({ color: 0xca8a04, flatShading: true }),
      )
      crown.position.y = 2.15
      rootGroup.add(brim)
      rootGroup.add(crown)
    } else if (options.headAccessory === 'head_glasses') {
      const frameMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24 })
      const lGlass = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 8), frameMat)
      lGlass.position.set(-0.15, 1.8, 0.39)
      const rGlass = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 4, 8), frameMat)
      rGlass.position.set(0.15, 1.8, 0.39)
      rootGroup.add(lGlass)
      rootGroup.add(rGlass)
    } else if (options.headAccessory === 'head_mage_hood') {
      const hoodGeo = new THREE.ConeGeometry(0.65, 0.7, 6)
      const hood = new THREE.Mesh(
        hoodGeo,
        new THREE.MeshStandardMaterial({ color: 0x312e81, flatShading: true }),
      )
      hood.position.set(0, 2.05, -0.1)
      hood.rotation.x = -0.2
      rootGroup.add(hood)
    } else if (options.headAccessory === 'head_crown') {
      const wreath = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.06, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0xf59e0b, flatShading: true }),
      )
      wreath.position.set(0, 2.0, 0)
      wreath.rotation.x = Math.PI / 2
      rootGroup.add(wreath)
    }
  }

  // 5. Handheld Accessory
  if (options.handAccessory) {
    if (options.handAccessory === 'hand_lantern') {
      const lanternGroup = new THREE.Group()
      const cage = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.3, 6),
        new THREE.MeshStandardMaterial({ color: 0x334155, flatShading: true }),
      )
      const core = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.08),
        new THREE.MeshBasicMaterial({ color: 0xfef08a }),
      )
      lanternGroup.add(cage)
      lanternGroup.add(core)

      const glow = new THREE.PointLight(0xfef08a, 1.5, 5)
      glow.position.y = 0.1
      lanternGroup.add(glow)

      lanternGroup.position.set(0.65, 0.8, 0.25)
      rootGroup.add(lanternGroup)
    } else if (options.handAccessory === 'hand_book') {
      const book = new THREE.Mesh(
        new THREE.BoxGeometry(0.25, 0.35, 0.08),
        new THREE.MeshStandardMaterial({ color: 0x991b1b, flatShading: true }),
      )
      book.position.set(-0.6, 0.9, 0.2)
      book.rotation.set(0.4, 0.3, -0.2)
      rootGroup.add(book)
    } else if (options.handAccessory === 'hand_staff') {
      const staffGroup = new THREE.Group()
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5),
        new THREE.MeshStandardMaterial({ color: 0x78350f, flatShading: true }),
      )
      const gem = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.15),
        new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, flatShading: true }),
      )
      gem.position.y = 0.95
      staffGroup.add(pole)
      staffGroup.add(gem)
      staffGroup.position.set(0.65, 0.9, 0.2)
      rootGroup.add(staffGroup)
    } else if (options.handAccessory === 'hand_quill') {
      const quill = new THREE.Mesh(
        new THREE.ConeGeometry(0.06, 0.45, 4),
        new THREE.MeshStandardMaterial({ color: 0xf8fafc, flatShading: true }),
      )
      quill.position.set(0.6, 0.9, 0.2)
      quill.rotation.set(-0.6, 0.2, 0.2)
      rootGroup.add(quill)
    }
  }

  // Animation state
  let animTime = 0

  function update(deltaSeconds: number, isMoving: boolean) {
    animTime += deltaSeconds * (isMoving ? 8 : 2.5)

    if (isMoving) {
      // Walking bob and arm swing
      rootGroup.position.y = Math.abs(Math.sin(animTime)) * 0.15
      leftArm.rotation.x = Math.sin(animTime) * 0.6
      rightArm.rotation.x = -Math.sin(animTime) * 0.6
    } else {
      // Calm idle breathing bob
      rootGroup.position.y = Math.sin(animTime) * 0.04
      leftArm.rotation.x = Math.sin(animTime * 0.8) * 0.08
      rightArm.rotation.x = -Math.sin(animTime * 0.8) * 0.08
    }
  }

  function setMoving(_val: boolean) {
    // optional hook for external controllers
  }

  return {
    group: rootGroup,
    update,
    setMoving,
  }
}
