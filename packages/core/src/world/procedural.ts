/**
 * Procedural low-poly 3D geometry definitions and palette configurations.
 *
 * Defines vertex layouts, color schemes, and transform hierarchies
 * used by the Three.js canvas renderer across Web, Desktop, and Android.
 */

export interface ColorPalette {
  grass1: number
  grass2: number
  dirt: number
  rock: number
  water: number
  bark: number
  wood: number
  leafGreen: number
  leafAutumn: number
  leafSakura: number
  leafCrystal: number
}

export const LOW_POLY_PALETTE: ColorPalette = {
  grass1: 0x48bb78,
  grass2: 0x38a169,
  dirt: 0x8d5b4c,
  rock: 0x718096,
  water: 0x4299e1,
  bark: 0x5a3d28,
  wood: 0x7b4b27,
  leafGreen: 0x2f855a,
  leafAutumn: 0xdd6b20,
  leafSakura: 0xf687b3,
  leafCrystal: 0x63b3ed,
}

export interface CharacterMeshSpec {
  id: string
  robeColor: number
  accentColor: number
  skinColor: number
  hairColor: number
  hatType?: string | null
  handType?: string | null
}

export function parseHexColor(colorStr: string, fallback: number): number {
  if (!colorStr) return fallback
  const clean = colorStr.replace('#', '')
  const num = parseInt(clean, 16)
  return isNaN(num) ? fallback : num
}

export interface TreeGrowthSpec {
  scale: number
  foliageScale: number
  trunkHeight: number
  colorMultiplier: number
}

/**
 * Calculates smooth interpolated tree growth stage for the 3D timer (progress 0..1).
 */
export function calculateTreeGrowth(progress: number): TreeGrowthSpec {
  const p = Math.max(0, Math.min(1, progress))

  // 0.0 -> 0.2: seedling sprouting from earth
  if (p < 0.2) {
    const t = p / 0.2
    return {
      scale: 0.2 + t * 0.2,
      foliageScale: 0.1 + t * 0.2,
      trunkHeight: 0.4 + t * 0.3,
      colorMultiplier: 0.7 + t * 0.2,
    }
  }

  // 0.2 -> 0.7: young tree growing branches
  if (p < 0.7) {
    const t = (p - 0.2) / 0.5
    return {
      scale: 0.4 + t * 0.4,
      foliageScale: 0.3 + t * 0.5,
      trunkHeight: 0.7 + t * 0.5,
      colorMultiplier: 0.9 + t * 0.1,
    }
  }

  // 0.7 -> 1.0: full bloom / mature canopy
  const t = (p - 0.7) / 0.3
  return {
    scale: 0.8 + t * 0.2,
    foliageScale: 0.8 + t * 0.2,
    trunkHeight: 1.2 + t * 0.1,
    colorMultiplier: 1.0,
  }
}

export interface HourglassSpec {
  topSandRatio: number
  bottomSandRatio: number
  particleRate: number
}

/**
 * Computes sand particle and pile ratios for the 3D Hourglass timer (progress 0..1).
 */
export function calculateHourglassProgress(progress: number): HourglassSpec {
  const p = Math.max(0, Math.min(1, progress))
  return {
    topSandRatio: Math.max(0, 1 - p),
    bottomSandRatio: Math.min(1, p),
    particleRate: p >= 1 ? 0 : 1,
  }
}
