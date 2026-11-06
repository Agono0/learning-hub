/**
 * World mood presets — one per app color palette.
 *
 * A mood is the full atmospheric state of the 3D forest: sky gradient, fog,
 * sun/hemisphere/ambient light mix, tone-mapping exposure and night features.
 * The Settings appearance picker picks a palette; the world follows along, so
 * the 2D UI and the 3D sanctuary always feel like the same place.
 */
import * as THREE from 'three'

export interface WorldMoodPreset {
  id: string
  label: string
  /** Sky gradient stops (zenith → horizon → below-horizon ground haze). */
  skyTop: number
  skyHorizon: number
  skyGround: number
  fogColor: number
  fogNear: number
  fogFar: number
  sunColor: number
  sunIntensity: number
  sunPosition: [number, number, number]
  hemiSky: number
  hemiGround: number
  hemiIntensity: number
  ambientIntensity: number
  /** ACES exposure — dusk/night moods are brighter than raw physics suggests. */
  exposure: number
  /** Night moods reveal the star dome and wake the fireflies. */
  night: boolean
}

export const WORLD_MOODS: Record<string, WorldMoodPreset> = {
  calm: {
    id: 'calm',
    label: 'Calm Morning',
    skyTop: 0x7fb2e5,
    skyHorizon: 0xdcebf5,
    skyGround: 0xc9d8c2,
    fogColor: 0xdcebf5,
    fogNear: 38,
    fogFar: 110,
    sunColor: 0xfff1d6,
    sunIntensity: 2.4,
    sunPosition: [24, 32, 18],
    hemiSky: 0xbfd9f2,
    hemiGround: 0x8a9a7b,
    hemiIntensity: 0.85,
    ambientIntensity: 0.28,
    exposure: 1.05,
    night: false,
  },
  forest: {
    id: 'forest',
    label: 'Verdant Noon',
    skyTop: 0x4f9be8,
    skyHorizon: 0xcfe8f7,
    skyGround: 0xbcd4a8,
    fogColor: 0xcfe8f7,
    fogNear: 42,
    fogFar: 120,
    sunColor: 0xfffbe8,
    sunIntensity: 2.8,
    sunPosition: [18, 40, 14],
    hemiSky: 0xa8d8f0,
    hemiGround: 0x6f8f52,
    hemiIntensity: 0.9,
    ambientIntensity: 0.26,
    exposure: 1.0,
    night: false,
  },
  ocean: {
    id: 'ocean',
    label: 'Coastal Clear',
    skyTop: 0x2f8fd6,
    skyHorizon: 0xd6f0f7,
    skyGround: 0xc2ddd8,
    fogColor: 0xd6f0f7,
    fogNear: 46,
    fogFar: 130,
    sunColor: 0xfdfdf2,
    sunIntensity: 3.0,
    sunPosition: [30, 38, -12],
    hemiSky: 0x9fd4ee,
    hemiGround: 0x7e9789,
    hemiIntensity: 0.95,
    ambientIntensity: 0.3,
    exposure: 1.0,
    night: false,
  },
  sunset: {
    id: 'sunset',
    label: 'Golden Hour',
    skyTop: 0x5f6fae,
    skyHorizon: 0xffc98a,
    skyGround: 0xd9a06f,
    fogColor: 0xf5c08a,
    fogNear: 30,
    fogFar: 95,
    sunColor: 0xffb469,
    sunIntensity: 2.6,
    sunPosition: [-30, 10, 16],
    hemiSky: 0xe8b088,
    hemiGround: 0x6f5a44,
    hemiIntensity: 0.7,
    ambientIntensity: 0.32,
    exposure: 1.08,
    night: false,
  },
  blossom: {
    id: 'blossom',
    label: 'Sakura Dawn',
    skyTop: 0x8fa8e8,
    skyHorizon: 0xfde4ef,
    skyGround: 0xe8d3cf,
    fogColor: 0xfde4ef,
    fogNear: 34,
    fogFar: 100,
    sunColor: 0xffe8ec,
    sunIntensity: 2.4,
    sunPosition: [20, 26, -20],
    hemiSky: 0xf2c9dc,
    hemiGround: 0x9a8177,
    hemiIntensity: 0.85,
    ambientIntensity: 0.34,
    exposure: 1.06,
    night: false,
  },
  midnight: {
    id: 'midnight',
    label: 'Starlit Night',
    skyTop: 0x070b1c,
    skyHorizon: 0x1d2b4a,
    skyGround: 0x141c30,
    fogColor: 0x141c30,
    fogNear: 26,
    fogFar: 90,
    sunColor: 0x9db8e8,
    sunIntensity: 1.1,
    sunPosition: [-20, 34, -22],
    hemiSky: 0x2a3a5e,
    hemiGround: 0x131a26,
    hemiIntensity: 0.55,
    ambientIntensity: 0.22,
    exposure: 1.15,
    night: true,
  },
}

export const DEFAULT_WORLD_MOOD = 'calm'

export function resolveWorldMood(id?: string | null): WorldMoodPreset {
  return (id && WORLD_MOODS[id]) || WORLD_MOODS[DEFAULT_WORLD_MOOD]
}

/** Converts a preset into live THREE values (colors need linear-space conversion). */
export function moodColor(hex: number): THREE.Color {
  return new THREE.Color(hex)
}
