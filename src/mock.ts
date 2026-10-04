import type { ScoreComment, ScoreNote, ScoreVersion, Track } from './types'
import { commentAnchor, noteAnchor } from './draft'

const notes = (trackId: string, keys: string[]): ScoreNote[] => keys.map((key, index) => {
  const measure = Math.floor(index / 4)
  const noteIndex = index % 4
  return {
    id: `N-${index + 1}`,
    anchor: noteAnchor(trackId, measure, noteIndex),
    key,
    duration: index % 4 === 0 ? 'h' : 'q',
    dynamic: index < 2 ? 'mp' : 'mf',
    tie: index === 2,
    expression: index === 3 ? 'dolce' : '',
    updatedAt: new Date('2026-10-04T08:00:00Z').toISOString(),
  }
})

export const seedTracks: Track[] = [
  { id: 'TR-01', name: '长笛', instrument: 'Flute', clef: 'treble', transposition: 0, color: '#2563eb', notes: notes('TR-01', ['c/5','d/5','e/5','g/5','a/5','g/5','e/5','d/5','c/5','e/5','g/5','a/5']) },
  { id: 'TR-02', name: '单簧管', instrument: 'Clarinet in Bb', clef: 'treble', transposition: -2, color: '#7c3aed', notes: notes('TR-02', ['d/4','e/4','f/4','a/4','c/5','a/4','f/4','e/4','d/4','f/4','a/4','c/5']) },
  { id: 'TR-03', name: '圆号', instrument: 'Horn in F', clef: 'treble', transposition: -7, color: '#d97706', notes: notes('TR-03', ['g/3','a/3','c/4','d/4','e/4','d/4','c/4','a/3','g/3','c/4','d/4','e/4']) },
  { id: 'TR-04', name: '大提琴', instrument: 'Violoncello', clef: 'bass', transposition: 0, color: '#059669', notes: notes('TR-04', ['c/3','g/3','e/3','d/3','c/3','g/3','a/3','g/3','c/3','e/3','g/3','a/3']) },
]

export const seedComments: ScoreComment[] = [
  { id: 'CM-1', anchor: commentAnchor('ALL', 2), measure: 2, author: '指挥 · 方亦', content: '圆号第 2 小节进入需再弱一级，避免覆盖大提琴主题。', resolved: false, updatedAt: new Date('2026-10-04T09:10:00Z').toISOString() },
  { id: 'CM-2', anchor: commentAnchor('ALL', 3), measure: 3, author: '作曲 · 沈青', content: '第 3 小节末音增加延音线，与下一小节第一拍连奏。', resolved: false, updatedAt: new Date('2026-10-04T09:20:00Z').toISOString() },
  { id: 'CM-3', anchor: commentAnchor('ALL', 6), measure: 6, author: '出版 · 赵晴', content: '单簧管分谱需在换页处保留 2 小节提示音。', resolved: true, updatedAt: new Date('2026-10-04T09:30:00Z').toISOString() },
]

export const seedVersions: ScoreVersion[] = [
  { id: 'v12', author: '沈青', time: '今天 16:28', summary: '调整终段和声，补充圆号力度与连音线', trackNotes: { 'TR-03': seedTracks[2]!.notes } },
  { id: 'v11', author: '方亦', time: '今天 14:10', summary: '移调单簧管分谱并调整换气标记', trackNotes: { 'TR-02': seedTracks[1]!.notes } },
]
