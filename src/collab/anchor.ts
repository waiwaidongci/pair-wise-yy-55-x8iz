import type { PageTurn, ScoreComment, ScoreNote, Track } from '../types'


/** 稳定锚点：同一声部内，小节 + 拍位唯一标识一个音符，不受 id 变化影响 */
export function anchorKey(trackId: string, measure: number, beat: number): string {
  return `${trackId}#m${measure}b${beat}`
}

export function noteAnchor(trackId: string, note: ScoreNote): string {
  return anchorKey(trackId, note.measure, note.beat)
}

/** 由小节内顺序补齐拍位（四分音符为 1 拍，八分音符为 0.5 拍，二分音符为 2 拍） */
export function assignMeasureBeats(notes: ScoreNote[]): ScoreNote[] {
  const weight: Record<ScoreNote['duration'], number> = { h: 2, q: 1, '8': 0.5 }
  let measure = 1
  let cursor = 0
  return notes.map((note, index) => {
    const measureBeats = 4
    // 当前音放不下本小节剩余拍位时先换行（二分音符不得跨小节）
    if (cursor + weight[note.duration] > measureBeats + 1e-6) { measure += 1; cursor = 0 }
    const beat = cursor + 1
    cursor += weight[note.duration]
    return { ...note, measure, beat, id: note.id || `N-${measure}-${index + 1}` }
  })
}

/** 评论跟着音符位置走：锚定音符移动小节后，评论小节同步更新 */
export function reanchorComment(comment: ScoreComment, tracks: Track[]): ScoreComment {
  if (!comment.noteId) return comment
  for (const track of tracks) {
    const note = track.notes.find((item) => item.id === comment.noteId)
    if (note) {
      return { ...comment, trackId: track.id, measure: note.measure }
    }
  }
  // 锚点音符已不存在：保留声部与最后小节，标记为脱离锚点（noteId 置空由调用方决定）
  return comment
}

/** 换页建议跟着音符走：锚点音符换了小节，换页位置随之更新 */
export function reanchorPageTurn(pageTurn: PageTurn, tracks: Track[]): PageTurn {
  if (!pageTurn.anchorNoteId) return pageTurn
  const track = tracks.find((item) => item.id === pageTurn.trackId)
  const note = track?.notes.find((item) => item.id === pageTurn.anchorNoteId)
  if (note) return { ...pageTurn, measure: note.measure }
  return pageTurn
}

export function measureOfNote(tracks: Track[], noteId: string): { trackId: string; measure: number } | null {
  for (const track of tracks) {
    const note = track.notes.find((item) => item.id === noteId)
    if (note) return { trackId: track.id, measure: note.measure }
  }
  return null
}
