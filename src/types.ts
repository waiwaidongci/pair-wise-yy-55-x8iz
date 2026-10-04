// 协作角色：同一条音符两边都改过、无法自动取最新时，按角色优先级决定可出版值
export type Role = 'composer' | 'conductor' | 'publisher'

export const ROLE_LABEL: Record<Role, string> = {
  composer: '作曲',
  conductor: '指挥',
  publisher: '出版',
}

// 出版可定稿优先级：作曲 > 指挥 > 出版（音符艺术内容以总谱作者为准，排版意见进冲突记录）
export const ROLE_PRIORITY: Record<Role, number> = {
  composer: 3,
  conductor: 2,
  publisher: 1,
}

export interface ScoreNote {
  id: string
  key: string
  duration: 'q' | 'h' | '8'
  accidental?: '#' | 'b' | 'n'
  dynamic: 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
  tie: boolean
  expression: string
  // 稳定元数据：按 声部+小节+拍位 生成，旧草稿升级时据此补锚点
  measure: number
  beat: number
  updatedAt: number
  updatedBy: Role
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
  author: string
  role: Role
  content: string
  resolved: boolean
  createdAt: number
  // 锚点：优先跟具体音符（noteId），找不到音符时退回到声部 + 小节
  trackId: string | null
  noteId: string | null
  measure: number
}

/** 每个声部一份换页设置：锚到具体音符，音符移动后换页建议跟着走 */
export interface PageTurn {
  trackId: string
  anchorNoteId: string | null
  measure: number
  // 换页前保留的提示音小节数
  cueMeasures: number
  manual: boolean
  updatedAt: number
  updatedBy: Role
}

export type ConflictKind = 'note' | 'transposition' | 'comment' | 'pageturn' | 'structure'

export interface MergeConflict {
  id: string
  kind: ConflictKind
  trackId: string | null
  noteId: string | null
  measure: number | null
  fields: string[]
  kept: { role: Role; time: number; summary: string }
  dropped: { role: Role; time: number; summary: string }
  // 完整保留双方原值，冲突面板可一键改用落选版本
  keptValue?: unknown
  droppedValue?: unknown
  // structure 冲突里落选方是否为“删除”
  droppedDeleted?: boolean
  keptDeleted?: boolean
  winner: 'mine' | 'theirs'
  resolved: boolean
  packageId: string
}

export interface MergeStats {
  added: number
  changed: number
  removed: number
  conflicts: number
}

/** 离线草稿包：断网期间导出，网络恢复后在另一端导入合并 */
export interface DraftPackage {
  packageId: string
  schemaVersion: 2
  role: Role
  author: string
  exportedAt: number
  baseVersionId: string
  tracks: Track[]
  comments: ScoreComment[]
  pageTurns: PageTurn[]
  // 合并基线（导出时所基于的总谱快照）；旧草稿包缺失时全部按双方修改处理
  baseTracks?: Track[]
  baseTransposition?: Record<string, number>
}

export interface ScoreVersion {
  id: string
  author: string
  time: string
  summary: string
  trackNotes: Record<string, ScoreNote[]>
}

/** 合并失败时保留的原包，重开后仍可重试 */
export interface FailedMerge {
  raw: string
  reason: string
  receivedAt: number
}

export interface MergeRecord {
  packageId: string
  author: string
  role: Role
  time: number
  stats: MergeStats
}
