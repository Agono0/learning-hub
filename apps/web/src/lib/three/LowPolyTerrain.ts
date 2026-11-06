import * as THREE from 'three'
import { LOW_POLY_PALETTE } from '@learning-hub/core/world'

/**
 * Procedural low-poly floating forest island.
 */
export function createLowPolyTerrain(): THREE.Group {
  const terrainGroup = new THREE.Group()

  // 1. Floating island base
  const islandGeo = new THREE.CylinderGeometry(22, 14, 8, 16, 2)
  // Deform bottom vertices slightly for rugged low-poly cliff look
  const pos = islandGeo.attributes.position!
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i)
    if (y < 0) {
      pos.setX(i, pos.getX(i) + Math.sin(i * 3.7) * 1.2)
      pos.setZ(i, pos.getZ(i) + Math.cos(i * 2.3) * 1.2)
    }
  }
  islandGeo.computeVertexNormals()

  const cliffMat = new THREE.MeshLambertMaterial({
    color: LOW_POLY_PALETTE.rock,
    flatShading: true,
  })
  const island = new THREE.Mesh(islandGeo, cliffMat)
  island.position.y = -4
  island.receiveShadow = true
  terrainGroup.add(island)

  // 2. Grassy surface
  const grassGeo = new THREE.CylinderGeometry(22.2, 21.8, 1.2, 24, 2)
  const grassPos = grassGeo.attributes.position!
  for (let i = 0; i < grassPos.count; i++) {
    const y = grassPos.getY(i)
    if (y > 0) {
      const x = grassPos.getX(i)
      const z = grassPos.getZ(i)
      const dist = Math.sqrt(x * x + z * z)
      // Gentle rolling hill, flatter near center
      const bump = Math.sin(x * 0.25) * Math.cos(z * 0.25) * 0.8
      grassPos.setY(i, y + (dist > 4 ? bump : 0.1))
    }
  }
  grassGeo.computeVertexNormals()

  const grassMat = new THREE.MeshLambertMaterial({
    color: LOW_POLY_PALETTE.grass1,
    flatShading: true,
  })
  const grass = new THREE.Mesh(grassGeo, grassMat)
  grass.position.y = 0.2
  grass.receiveShadow = true
  terrainGroup.add(grass)

  // 3. Central study pedestal (where active 3D timer and character reside)
  const pedestalGeo = new THREE.CylinderGeometry(3.5, 3.8, 0.4, 12)
  const stoneMat = new THREE.MeshLambertMaterial({
    color: 0x94a3b8,
    flatShading: true,
  })
  const pedestal = new THREE.Mesh(pedestalGeo, stoneMat)
  pedestal.position.set(0, 0.4, 0)
  pedestal.receiveShadow = true
  terrainGroup.add(pedestal)

  // Stepping stones leading toward pedestal
  for (let i = 1; i <= 4; i++) {
    const stone = new THREE.Mesh(
      new THREE.CylinderGeometry(0.8 - i * 0.08, 0.9 - i * 0.08, 0.15, 7),
      stoneMat,
    )
    stone.position.set(0, 0.35, 3.8 + i * 1.6)
    stone.rotation.y = i * 0.9
    stone.receiveShadow = true
    terrainGroup.add(stone)
  }

  // Small ambient campsite rocks around the periphery
  const rockGeo = new THREE.DodecahedronGeometry(0.7, 0)
  for (let i = 0; i < 8; i++) {
    const rock = new THREE.Mesh(rockGeo, cliffMat)
    const angle = (i / 8) * Math.PI * 2 + 0.3
    const r = 16 + (i % 3) * 1.5
    rock.position.set(Math.cos(angle) * r, 0.4, Math.sin(angle) * r)
    rock.rotation.set(i, i * 2, 0)
    rock.scale.set(1 + (i % 2) * 0.5, 0.8, 1 + (i % 3) * 0.4)
    rock.receiveShadow = true
    terrainGroup.add(rock)
  }

  return terrainGroup
}
