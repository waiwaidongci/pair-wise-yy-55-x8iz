export type Role = 'conductor' | 'composer' | 'publisher'

export interface ScoreNote {
  id: string
  /** 稳定锚点：声部#小节#音位，旧草稿升级时按小节与声部补回，评论与换页建议跟随此锚点 */
  anchor: string
  key: string
  duration: 'q' | 'h' | '8'
  accidental?: '#' | 'b' | 'n'
  dynamic: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
  tie: boolean
  expression: string
  /** ISO 时间戳，同角色冲突时以较晚时间为准 */
  updatedAt: string
}

export interface Track {
  id: string
  name: string
  instrument: string
  clef: 'treble' | 'bass' | 'alto'
  transposition: number
  color: string
  notes: ScoreNote[]
}

export interface ScoreComment {
  id: string
  /** 锚点：声部#小节（ALL 表示全声部），评论跟随音符位置 */
  anchor: string
  measure: number
  author: string
  content: string
  resolved: boolean
  /** ISO 时间戳，同角色冲突时以较晚时间为准 */
  updatedAt: string
}

/** 合并冲突记录：同一音符字段被两边修改时，保留可出版值，另一版进入此记录 */
export interface ConflictRecord {
  id: string
  /** 音符锚点或评论 id */
  refId: string
  anchor: string
  trackId: string
  measure: number
  field: string
  fieldLabel: string
  baseValue: unknown
  localValue: unknown
  incomingValue: unknown
  winner: 'local' | 'incoming'
  winnerRole: Role
  reason: string
  time: string
  /** 用户是否已在冲突记录中采用另一版 */
  resolved: boolean
}

/** 离线导出的草稿包：断网期间各自修改，恢复后合并 */
export interface DraftPackage {
  format: 'score-draft-package'
  version: 1
  exportedAt: string
  author: { role: Role; name: string }
  baseVersionId: string
  tracks: Track[]
  comments: ScoreComment[]
}

/** 分谱排版计算结果：移调变化后重算页数、提示音与换页建议 */
export interface PartLayout {
  pages: number
  measuresPerPage: number
  cues: { measure: number; trackId: string; partName: string; pitch: string }[]
  pageTurnMeasure: number
  recomputedAt: string
}

export interface ScoreVersion {
  id: string
  author: string
  time: string
  summary: string
  trackNotes: Record<string, ScoreNote[]>
}
