/**
 * Atmosphere layer for the 3D world: gradient sky dome, drifting clouds,
 * twinkling star dome and wandering fireflies. Everything is procedural and
 * cheap — no textures, no loaders — so it also runs inside the native webview.
 */
import * as THREE from 'three'
import type { WorldMoodPreset } from './WorldMood'

export interface Atmosphere {
  group: THREE.Group
  update: (deltaSeconds: number, elapsed: number) => void
  applyMood: (preset: WorldMoodPreset) => void
  dispose: () => void
}

const skyVertexShader = /* glsl */ `
  varying vec3 vWorldPos;
  void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`

const skyFragmentShader = /* glsl */ `
  varying vec3 vWorldPos;
  uniform vec3 uTop;
  uniform vec3 uHorizon;
  uniform vec3 uGround;
  uniform vec3 uSunDir;
  uniform vec3 uSunTint;
  void main() {
    vec3 dir = normalize(vWorldPos);
    float h = dir.y;
    // Three-stop vertical gradient with a soft blend band around the horizon.
    vec3 color = h >= 0.0
      ? mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), 0.55))
      : mix(uHorizon, uGround, pow(clamp(-h, 0.0, 1.0), 0.7));
    // Subtle warm halo around the sun direction for depth.
    float sunGlow = pow(max(dot(dir, normalize(uSunDir)), 0.0), 24.0);
    color = mix(color, uSunTint, sunGlow * 0.35);
    gl_FragColor = vec4(color, 1.0);
  }
`

function createSkyDome(): { mesh: THREE.Mesh; uniforms: Record<string, THREE.IUniform> } {
  const uniforms: Record<string, THREE.IUniform> = {
    uTop: { value: new THREE.Color(0x7fb2e5) },
    uHorizon: { value: new THREE.Color(0xdcebf5) },
    uGround: { value: new THREE.Color(0xc9d8c2) },
    uSunDir: { value: new THREE.Vector3(0.5, 0.6, 0.4) },
    uSunTint: { value: new THREE.Color(0xfff1d6) },
  }
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: skyVertexShader,
    fragmentShader: skyFragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  })
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16), material)
  mesh.frustumCulled = false
  return { mesh, uniforms }
}

function createClouds(count: number): {
  group: THREE.Group
  update: (delta: number) => void
  setCount: (n: number) => void
  dispose: () => void
} {
  const group = new THREE.Group()
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
    emissive: 0xdfe9f5,
    emissiveIntensity: 0.18,
  })
  const puffGeo = new THREE.IcosahedronGeometry(1, 0)
  const clouds: { root: THREE.Group; speed: number; radius: number; angle: number }[] = []

  function spawn(n: number) {
    for (const c of clouds) group.remove(c.root)
    clouds.length = 0
    for (let i = 0; i < n; i++) {
      const root = new THREE.Group()
      const puffs = 3 + (i % 3)
      for (let p = 0; p < puffs; p++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat)
        const s = 1.6 + ((i * 7 + p * 13) % 10) / 8
        puff.scale.set(s * 1.5, s * 0.72, s)
        puff.position.set(p * s * 1.15 - s, ((p * 17) % 7) / 10, ((p * 11) % 5) / 6)
        root.add(puff)
      }
      const radius = 34 + ((i * 23) % 26)
      const angle = (i / n) * Math.PI * 2 + (i % 3) * 0.5
      root.position.set(Math.cos(angle) * radius, 20 + ((i * 13) % 9), Math.sin(angle) * radius)
      root.rotation.y = Math.random() * Math.PI
      group.add(root)
      clouds.push({ root, speed: 0.008 + ((i * 7) % 5) / 900, radius, angle })
    }
  }

  function update(delta: number) {
    for (const c of clouds) {
      c.angle += c.speed * delta
      c.root.position.x = Math.cos(c.angle) * c.radius
      c.root.position.z = Math.sin(c.angle) * c.radius
    }
  }

  spawn(count)
  return {
    group,
    update,
    setCount: spawn,
    dispose: () => {
      cloudMat.dispose()
      puffGeo.dispose()
    },
  }
}

function createStars(): { points: THREE.Points; material: THREE.PointsMaterial } {
  const count = 260
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    // Distribute on the upper hemisphere shell.
    const theta = (i / count) * Math.PI * 2 + ((i * 17) % 7) / 10
    const phi = 0.12 + (((i * 31) % 100) / 100) * 1.35
    const r = 130
    positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r
    positions[i * 3 + 1] = Math.cos(phi) * r * 0.9 + 8
    positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xdfe8ff,
    size: 1.5,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
  })
  return { points: new THREE.Points(geo, material), material }
}

function createFireflies(count: number): {
  points: THREE.Points
  material: THREE.PointsMaterial
  update: (elapsed: number) => void
} {
  const positions = new Float32Array(count * 3)
  const seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = (((i * 47) % 100) / 100) * Math.PI * 2
    const r = 4 + (((i * 29) % 100) / 100) * 15
    positions[i * 3] = Math.cos(a) * r
    positions[i * 3 + 1] = 0.8 + (((i * 13) % 100) / 100) * 3.5
    positions[i * 3 + 2] = Math.sin(a) * r
    seeds[i] = (i * 0.618) % 6.28
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  const material = new THREE.PointsMaterial({
    color: 0xd9f99d,
    size: 2.6,
    sizeAttenuation: false,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  })
  const points = new THREE.Points(geo, material)
  points.frustumCulled = false

  function update(elapsed: number) {
    const attr = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < count; i++) {
      const t = elapsed * 0.5 + seeds[i]
      attr.setX(i, attr.getX(i) + Math.sin(t * 0.9) * 0.004)
      attr.setY(i, 0.8 + Math.max(0, Math.sin(t)) * 3.2 + Math.sin(t * 2.3) * 0.2)
      attr.setZ(i, attr.getZ(i) + Math.cos(t * 0.7) * 0.004)
    }
    attr.needsUpdate = true
    material.opacity = 0.55 + Math.sin(elapsed * 2.1) * 0.2
  }

  return { points, material, update }
}

export function createAtmosphere(cloudCount = 7, fireflyCount = 44): Atmosphere {
  const group = new THREE.Group()
  const sky = createSkyDome()
  const clouds = createClouds(cloudCount)
  const stars = createStars()
  const fireflies = createFireflies(fireflyCount)

  group.add(sky.mesh, clouds.group, stars.points, fireflies.points)

  function applyMood(preset: WorldMoodPreset) {
    const u = sky.uniforms
    ;(u.uTop.value as THREE.Color).setHex(preset.skyTop)
    ;(u.uHorizon.value as THREE.Color).setHex(preset.skyHorizon)
    ;(u.uGround.value as THREE.Color).setHex(preset.skyGround)
    const sunDir = new THREE.Vector3(...preset.sunPosition).normalize()
    ;(u.uSunDir.value as THREE.Vector3).copy(sunDir)
    ;(u.uSunTint.value as THREE.Color).setHex(preset.sunColor)

    stars.material.opacity = preset.night ? 0.9 : 0
    fireflies.material.opacity = preset.night ? 0.7 : 0
    clouds.group.visible = !preset.night || cloudCount > 0
  }

  function update(delta: number, elapsed: number) {
    clouds.update(delta)
    stars.points.rotation.y += delta * 0.004
    if (fireflies.material.opacity > 0) fireflies.update(elapsed)
  }

  function dispose() {
    sky.mesh.geometry.dispose()
    ;(sky.mesh.material as THREE.Material).dispose()
    clouds.dispose()
    stars.points.geometry.dispose()
    fireflies.points.geometry.dispose()
  }

  return { group, update, applyMood, dispose }
}
