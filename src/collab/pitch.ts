import type { ScoreNote, Track } from '../types'

const CHROMATIC_FLAT = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
const CHROMATIC_SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const NOTE_WEIGHT: Record<ScoreNote['duration'], number> = { h: 2, q: 1, '8': 0.5 }

export interface Pitch {
  pitchClass: number // 0-11
  octave: number
}

export function parseKey(key: string): Pitch {
  const [spelling, octaveText] = key.split('/') as [string, string]
  const table = spelling.includes('b') ? CHROMATIC_FLAT : CHROMATIC_SHARP
  return { pitchClass: table.indexOf(spelling), octave: Number(octaveText) }
}

export function formatKey(pitchClass: number, octave: number, preferFlat: boolean): string {
  const table = preferFlat ? CHROMATIC_FLAT : CHROMATIC_SHARP
  return `${table[pitchClass]}/${octave}`
}

/** 半音移调；负向音程优先用降号拼写，与原谱升降号习惯保持一致 */
export function transposeKey(key: string, semitones: number): string {
  const { pitchClass, octave } = parseKey(key)
  let next = pitchClass + semitones
  let nextOctave = octave
  while (next < 0) { next += 12; nextOctave -= 1 }
  while (next >= 12) { next -= 12; nextOctave += 1 }
  return formatKey(next, nextOctave, semitones < 0)
}

/** 把另一声部的音乐会音高转成当前移调分谱的记谱音高 */
export function toWrittenPitch(key: string, targetTransposition: number): string {
  return transposeKey(key, -targetTransposition)
}

export function durationWeight(duration: ScoreNote['duration']): number {
  return NOTE_WEIGHT[duration]
}

/** 移调后升降号密度，用于估排一页能容纳的小节：临时记号越多横向占位越宽 */
export function accidentalsPerMeasure(track: Track): number {
  if (!track.notes.length) return 0
  let total = 0
  for (const note of track.notes) total += parseKey(note.key).pitchClass === 0 ? 0 : /#|b/.test(note.key) ? 1 : 0
  return total / measureCount(track)
}

export function measureCount(track: Track): number {
  if (!track.notes.length) return 1
  const measures = new Set<number>()
  for (const note of track.notes) measures.add(note.measure)
  return measures.size
}

/** 移调一变，分谱页数重算：升降号越多、一页容量越小 */
export function pagesForTrack(track: Track, measuresPerPage: number): number {
  const density = accidentalsPerMeasure(track)
  const capacity = Math.max(2, measuresPerPage - Math.round(density * 2))
  return Math.max(1, Math.ceil(measureCount(track) / capacity))
}

/** 换页前的提示音数量随移调排版变化：页数越多，每页末尾预留的提示小节越少 */
export function cueMeasuresForTrack(track: Track, measuresPerPage: number): number {
  const pages = pagesForTrack(track, measuresPerPage)
  if (pages <= 1) return 0
  const density = accidentalsPerMeasure(track)
  return Math.max(1, Math.min(3, 4 - pages + (density > 0.4 ? 0 : 1)))
}

/** 自动换页建议：优先落在整页边界、且不切断长延音/重表情的小节之前 */
export function suggestPageTurnMeasure(track: Track, measuresPerPage: number): number {
  const total = measureCount(track)
  if (total <= measuresPerPage) return total
  const byMeasure = new Map<number, ScoreNote[]>()
  for (const note of track.notes) {
    const list = byMeasure.get(note.measure) ?? []
    list.push(note)
    byMeasure.set(note.measure, list)
  }
  let best = measuresPerPage
  let bestScore = -Infinity
  for (let m = measuresPerPage; m < total; m += measuresPerPage) {
    let score = 100 - Math.abs(m - measuresPerPage)
    const list = byMeasure.get(m) ?? []
    for (const note of list) {
      if (note.tie) score -= 30 // 不在延音线中间翻页
      if (note.expression) score -= 10
      if (note.duration === 'h') score -= 6
    }
    if (score > bestScore) { bestScore = score; best = m }
  }
  return best
}
