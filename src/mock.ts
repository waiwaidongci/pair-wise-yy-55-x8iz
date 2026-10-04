import type { PageTurn, Role, ScoreComment, ScoreNote, ScoreVersion, Track } from './types'
import { assignMeasureBeats } from './collab/anchor'

const BASE_TIME = new Date('2026-10-04T16:00:00+08:00').getTime()

const notes = (keys: string[], role: Role): ScoreNote[] => assignMeasureBeats(
  keys.map((key, index) => ({
    id: `N-${index + 1}`,
    key,
    duration: (index % 4 === 0 ? 'h' : 'q') as ScoreNote['duration'],
    dynamic: (index < 2 ? 'mp' : 'mf') as ScoreNote['dynamic'],
    tie: index === 2,
    expression: index === 3 ? 'dolce' : '',
    measure: 1, beat: 1,
    updatedAt: BASE_TIME + index * 60_000,
    updatedBy: role,
  })),
)

export const seedTracks: Track[] = [
  { id: 'TR-01', name: '长笛', instrument: 'Flute', clef: 'treble', transposition: 0, color: '#2563eb', notes: notes(['c/5','d/5','e/5','g/5','a/5','g/5','e/5','d/5','c/5','e/5','g/5','a/5'], 'composer') },
  { id: 'TR-02', name: '单簧管', instrument: 'Clarinet in Bb', clef: 'treble', transposition: -2, color: '#7c3aed', notes: notes(['d/4','e/4','f/4','a/4','c/5','a/4','f/4','e/4','d/4','f/4','a/4','c/5'], 'publisher') },
  { id: 'TR-03', name: '圆号', instrument: 'Horn in F', clef: 'treble', transposition: -7, color: '#d97706', notes: notes(['g/3','a/3','c/4','d/4','e/4','d/4','c/4','a/3','g/3','c/4','d/4','e/4'], 'conductor') },
  { id: 'TR-04', name: '大提琴', instrument: 'Violoncello', clef: 'bass', transposition: 0, color: '#059669', notes: notes(['c/3','g/3','e/3','d/3','c/3','g/3','a/3','g/3','c/3','e/3','g/3','a/3'], 'composer') },
]

const noteAt = (trackId: string, measure: number, beat?: number): string | null => {
  const track = seedTracks.find((item) => item.id === trackId)
  const inMeasure = track?.notes.filter((note) => note.measure === measure) ?? []
  const found = beat ? inMeasure.find((note) => note.beat === beat) : inMeasure[0]
  return found?.id ?? null
}

export const seedComments: ScoreComment[] = [
  { id: 'CM-1', author: '指挥 · 方亦', role: 'conductor', content: '圆号第 2 小节进入需再弱一级，避免覆盖大提琴主题。', resolved: false, createdAt: BASE_TIME + 1_000, trackId: 'TR-03', noteId: noteAt('TR-03', 2), measure: 2 },
  { id: 'CM-2', author: '作曲 · 沈青', role: 'composer', content: '第 2 小节末音增加延音线，与下一小节第一拍连奏。', resolved: false, createdAt: BASE_TIME + 2_000, trackId: 'TR-01', noteId: noteAt('TR-01', 2, 3), measure: 2 },
  { id: 'CM-3', author: '出版 · 赵晴', role: 'publisher', content: '单簧管分谱需在换页处保留 2 小节提示音。', resolved: true, createdAt: BASE_TIME + 3_000, trackId: 'TR-02', noteId: noteAt('TR-02', 3), measure: 3 },
]

export const seedPageTurns: PageTurn[] = seedTracks.map((track, index) => {
  const measure = 3
  const anchor = track.notes.find((note) => note.measure === measure && note.beat === 1) ?? null
  return {
    trackId: track.id,
    anchorNoteId: anchor?.id ?? null,
    measure,
    cueMeasures: index === 1 ? 2 : 1,
    manual: index === 1,
    updatedAt: BASE_TIME,
    updatedBy: 'publisher',
  }
})

export const seedVersions: ScoreVersion[] = [
  { id: 'v12', author: '沈青', time: '今天 16:28', summary: '调整终段和声，补充圆号力度与连音线', trackNotes: { 'TR-03': seedTracks[2]!.notes } },
  { id: 'v11', author: '方亦', time: '今天 14:10', summary: '移调单簧管分谱并调整换气标记', trackNotes: { 'TR-02': seedTracks[1]!.notes } },
]

/** 演示用：另一个角色断网期间导出的草稿包（同一音符两边都改过，用于冲突演练） */
export function buildScratchPackage(role: Role, author: string, exportedAt: number): import('./types').DraftPackage {
  const tracks = structuredClone(seedTracks)
  // 对方改了圆号第 2 小节力度（我方稍后也会改）→ 音符冲突
  const horn = tracks.find((item) => item.id === 'TR-03')!
  const hornM2 = horn.notes.find((note) => note.measure === 2 && note.beat === 1)!
  hornM2.dynamic = 'p'
  hornM2.updatedBy = role
  hornM2.updatedAt = exportedAt
  // 对方又改了长笛第 1 小节表情（我方没动）→ 直接采纳
  const flute = tracks.find((item) => item.id === 'TR-01')!
  const fluteNote = flute.notes.find((note) => note.measure === 1 && note.beat === 3)!
  fluteNote.expression = 'cantabile'
  fluteNote.updatedBy = role
  fluteNote.updatedAt = exportedAt
  return {
    packageId: `PKG-${role}-${exportedAt}`,
    schemaVersion: 2,
    role,
    author,
    exportedAt,
    baseVersionId: 'v12',
    tracks,
    comments: structuredClone(seedComments),
    pageTurns: structuredClone(seedPageTurns),
    baseTracks: structuredClone(seedTracks),
  }
}
