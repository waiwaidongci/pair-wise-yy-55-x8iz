import type {
  DraftPackage, MergeConflict, MergeStats, PageTurn, Role, ScoreComment, ScoreNote, Track,
} from '../types'
import { ROLE_PRIORITY } from '../types'
import { noteAnchor, reanchorComment } from './anchor'
import { suggestPageTurnMeasure } from './pitch'

const NOTE_FIELDS: (keyof ScoreNote)[] = ['key', 'duration', 'accidental', 'dynamic', 'tie', 'expression']
const FIELD_LABEL: Record<string, string> = {
  key: '音高', duration: '时值', accidental: '临时记号', dynamic: '力度', tie: '延音线', expression: '表情',
}

// 合并在 Redux reducer 内执行，入参可能是 Immer 代理；structuredClone 无法克隆代理，故用 JSON 深拷贝
function clone<T>(value: T): T {
  return value === undefined ? value : JSON.parse(JSON.stringify(value)) as T
}

export function fieldLabel(field: string): string {
  return FIELD_LABEL[field] ?? field
}

export function noteSummary(note: ScoreNote | undefined): string {
  if (!note) return '（音符已删除）'
  return `${note.key.replace('/', '')} · ${note.dynamic}${note.tie ? ' · 延音' : ''}${note.expression ? ` · ${note.expression}` : ''}`
}

/**
 * 决定可出版值：先看角色优先级，角色相同再看更新时间。
 * 返回 true 表示保留我方（mine），false 表示采用对方（theirs）。
 */
export function decideWinner(mine: { role: Role; time: number }, theirs: { role: Role; time: number }): boolean {
  if (ROLE_PRIORITY[mine.role] !== ROLE_PRIORITY[theirs.role]) {
    return ROLE_PRIORITY[mine.role] > ROLE_PRIORITY[theirs.role]
  }
  return mine.time >= theirs.time
}

interface NoteIndex {
  byId: Map<string, ScoreNote>
  byAnchor: Map<string, ScoreNote>
}

function indexNotes(track: Track | undefined): NoteIndex {
  const byId = new Map<string, ScoreNote>()
  const byAnchor = new Map<string, ScoreNote>()
  for (const note of track?.notes ?? []) {
    byId.set(note.id, note)
    byAnchor.set(noteAnchor(track!.id, note), note)
  }
  return { byId, byAnchor }
}

function findIncoming(base: NoteIndex, theirs: NoteIndex, trackId: string, note: ScoreNote): ScoreNote | undefined {
  // 优先稳定锚点（小节+拍位），其次音符 id
  return theirs.byAnchor.get(noteAnchor(trackId, note)) ?? theirs.byId.get(note.id)
}

function sameNote(a: ScoreNote | undefined, b: ScoreNote | undefined): boolean {
  if (!a || !b) return false
  return NOTE_FIELDS.every((field) => JSON.stringify(a[field]) === JSON.stringify(b[field]))
}

function changedFields(a: ScoreNote, b: ScoreNote): string[] {
  return NOTE_FIELDS.filter((field) => JSON.stringify(a[field]) !== JSON.stringify(b[field]))
}

/** 移调变化后重算换页建议（锚到具体音符，不锚小节序号） */
export function recomputePageTurn(
  track: Track, previous: PageTurn, updatedAt: number, role: Role,
): PageTurn {
  const suggestedMeasure = suggestPageTurnMeasure(track, 4)
  const measure = previous.manual ? previous.measure : suggestedMeasure
  const anchorNote = track.notes.find((note) => note.measure === measure && note.beat === 1)
    ?? track.notes.find((note) => note.measure === measure) ?? null
  return {
    ...previous,
    measure: anchorNote?.measure ?? measure,
    anchorNoteId: anchorNote?.id ?? null,
    updatedAt,
    updatedBy: role,
  }
}

export interface MergeInput {
  myRole: Role
  myTracks: Track[]
  theirTracks: Track[]
  baseTracks?: Track[]
  comments: ScoreComment[]
  theirComments: ScoreComment[]
  pageTurns: PageTurn[]
  theirPageTurns: PageTurn[]
  pkg: DraftPackage
  now: number
}

export interface MergeResult {
  tracks: Track[]
  comments: ScoreComment[]
  pageTurns: PageTurn[]
  conflicts: MergeConflict[]
  stats: MergeStats
}

let conflictSeq = 0
function conflictId() {
  conflictSeq += 1
  return `CF-${Date.now()}-${conflictSeq}`
}

/**
 * 三方合并：以 baseTracks 为共同祖先。
 * 同一音符两边改过时，按角色、再按时间保留一个可出版值，另一版完整进冲突记录，不丢任何改动。
 */
export function mergeThreeWay(input: MergeInput): MergeResult {
  const { myRole, pkg } = input
  const conflicts: MergeConflict[] = []
  const stats: MergeStats = { added: 0, changed: 0, removed: 0, conflicts: 0 }
  const tracksOut: Track[] = []

  for (const myTrack of input.myTracks) {
    const theirTrack = input.theirTracks.find((item) => item.id === myTrack.id)
    const baseTrack = input.baseTracks?.find((item) => item.id === myTrack.id)
    if (!theirTrack) { tracksOut.push(clone(myTrack)); continue }

    const baseIdx = indexNotes(baseTrack)
    const myIdx = indexNotes(myTrack)
    const theirIdx = indexNotes(theirTrack)
    const outNotes: ScoreNote[] = []
    const consumed = new Set<string>()

    const recordConflict = (params: {
      kind: MergeConflict['kind']; noteId: string | null; measure: number | null; fields: string[]
      mineNote?: ScoreNote; theirsNote?: ScoreNote; winnerMine: boolean
      mineDeleted?: boolean; theirsDeleted?: boolean
    }) => {
      const mineMeta = { role: myRole, time: params.mineNote?.updatedAt ?? input.now, summary: params.mineDeleted ? '（我方删除）' : noteSummary(params.mineNote) }
      const theirMeta = { role: pkg.role, time: params.theirsNote?.updatedAt ?? pkg.exportedAt, summary: params.theirsDeleted ? '（对方删除）' : noteSummary(params.theirsNote) }
      const conflict: MergeConflict = {
        id: conflictId(),
        kind: params.kind,
        trackId: myTrack.id,
        noteId: params.noteId,
        measure: params.measure,
        fields: params.fields,
        kept: params.winnerMine ? mineMeta : theirMeta,
        dropped: params.winnerMine ? theirMeta : mineMeta,
        keptValue: params.winnerMine ? params.mineNote : params.theirsNote,
        droppedValue: params.winnerMine ? params.theirsNote : params.mineNote,
        keptDeleted: params.winnerMine ? params.mineDeleted : params.theirsDeleted,
        droppedDeleted: params.winnerMine ? params.theirsDeleted : params.mineDeleted,
        winner: params.winnerMine ? 'mine' : 'theirs',
        resolved: false,
        packageId: pkg.packageId,
      }
      conflicts.push(conflict)
      stats.conflicts += 1
    }

    // 以我方声部顺序为主线逐个音符合并
    for (const myNote of myTrack.notes) {
      const theirNote = findIncoming(baseIdx, theirIdx, myTrack.id, myNote)
      const baseNote = baseIdx.byAnchor.get(noteAnchor(myTrack.id, myNote)) ?? baseIdx.byId.get(myNote.id)

      if (!theirNote) {
        // 对方没有对应音符：对方删除 / 我方新增
        const mineChanged = !baseNote || !sameNote(baseNote, myNote)
        const theyDeleted = baseNote && !theirTrack.notes.some((n) => noteAnchor(myTrack.id, n) === noteAnchor(myTrack.id, myNote) || n.id === myNote.id)
        if (mineChanged && theyDeleted) {
          const winnerMine = decideWinner({ role: myRole, time: myNote.updatedAt }, { role: pkg.role, time: pkg.exportedAt })
          recordConflict({ kind: 'structure', noteId: myNote.id, measure: myNote.measure, fields: ['删除/保留'], mineNote: myNote, theirsDeleted: true, winnerMine })
          if (winnerMine) outNotes.push(clone(myNote))
          else stats.removed += 1
        } else {
          outNotes.push(clone(myNote))
          if (!baseNote) stats.added += 1
        }
        continue
      }
      consumed.add(theirNote.id)
      consumed.add(noteAnchor(myTrack.id, theirNote))

      const mineChanged = !baseNote || !sameNote(baseNote, myNote)
      const theirsChanged = !baseNote || !sameNote(baseNote, theirNote)

      if (mineChanged && theirsChanged && !sameNote(myNote, theirNote)) {
        // 同一音符两边都改过：按角色 + 时间取可出版值，另一版进冲突记录
        const fields = changedFields(myNote, theirNote)
        const winnerMine = decideWinner({ role: myRole, time: myNote.updatedAt }, { role: pkg.role, time: theirNote.updatedAt })
        recordConflict({ kind: 'note', noteId: myNote.id, measure: myNote.measure, fields, mineNote: myNote, theirsNote: theirNote, winnerMine })
        const winner = winnerMine ? myNote : theirNote
        // 胜出值保留，但更新时间/角色取胜出方，保证后续合并裁决仍正确
        outNotes.push(clone(winner))
        stats.changed += 1
      } else if (theirsChanged && !mineChanged) {
        outNotes.push(clone(theirNote)); stats.changed += 1
      } else {
        outNotes.push(clone(myNote))
        if (mineChanged && !baseNote) stats.added += 1
      }
    }

    // 对方新增的音符（我方主线没有）
    for (const theirNote of theirTrack.notes) {
      if (consumed.has(theirNote.id) || consumed.has(noteAnchor(myTrack.id, theirNote))) continue
      const baseNote = baseIdx.byAnchor.get(noteAnchor(myTrack.id, theirNote)) ?? baseIdx.byId.get(theirNote.id)
      const mineDeleted = !baseNote ? false : !myTrack.notes.some((n) => noteAnchor(myTrack.id, n) === noteAnchor(myTrack.id, theirNote) || n.id === theirNote.id)
      if (mineDeleted) {
        const winnerMine = decideWinner({ role: myRole, time: input.now }, { role: pkg.role, time: theirNote.updatedAt })
        recordConflict({ kind: 'structure', noteId: theirNote.id, measure: theirNote.measure, fields: ['删除/保留'], mineDeleted: true, theirsNote: theirNote, winnerMine })
        if (!winnerMine) outNotes.push(clone(theirNote))
        else stats.removed += 1
      } else if (!baseNote) {
        outNotes.push(clone(theirNote)); stats.added += 1
      }
    }

    // 移调声部属性冲突
    let transposition = myTrack.transposition
    const baseTransposition = baseTrack?.transposition
    const mineTChanged = baseTransposition === undefined || myTrack.transposition !== baseTransposition
    const theirTChanged = baseTransposition === undefined || theirTrack.transposition !== baseTransposition
    if (mineTChanged && theirTChanged && myTrack.transposition !== theirTrack.transposition) {
      const winnerMine = decideWinner({ role: myRole, time: input.now }, { role: pkg.role, time: pkg.exportedAt })
      conflicts.push({
        id: conflictId(), kind: 'transposition', trackId: myTrack.id, noteId: null, measure: null, fields: ['移调'],
        kept: { role: winnerMine ? myRole : pkg.role, time: input.now, summary: `移调 ${winnerMine ? myTrack.transposition : theirTrack.transposition} 半音` },
        dropped: { role: winnerMine ? pkg.role : myRole, time: pkg.exportedAt, summary: `移调 ${winnerMine ? theirTrack.transposition : myTrack.transposition} 半音` },
        keptValue: winnerMine ? myTrack.transposition : theirTrack.transposition,
        droppedValue: winnerMine ? theirTrack.transposition : myTrack.transposition,
        winner: winnerMine ? 'mine' : 'theirs', resolved: false, packageId: pkg.packageId,
      })
      stats.conflicts += 1
      transposition = winnerMine ? myTrack.transposition : theirTrack.transposition
    } else if (theirTChanged && !mineTChanged) {
      transposition = theirTrack.transposition
    }

    // 合并完成后按小节/拍位排序，保证对方新增音符落在正确位置
    outNotes.sort((a, b) => (a.measure - b.measure) || (a.beat - b.beat))

    tracksOut.push({ ...clone(myTrack), transposition, notes: outNotes })
  }

  // 评论合并：按 id 去重；同 id 两边都改过 resolved/content 时按角色裁决，落选进冲突记录
  const commentsOut = mergeComments(input, conflicts, stats)
    .map((comment) => reanchorComment(comment, tracksOut))
  // 换页设置合并后，随最终音符位置重新锚定
  const pageTurnsOut = mergePageTurns(input, tracksOut, conflicts, stats)

  return { tracks: tracksOut, comments: commentsOut, pageTurns: pageTurnsOut, conflicts, stats }
}

function mergeComments(input: MergeInput, conflicts: MergeConflict[], stats: MergeStats): ScoreComment[] {
  const { myRole, pkg } = input
  const mineById = new Map(input.comments.map((comment) => [comment.id, comment]))
  const out: ScoreComment[] = clone(input.comments)
  for (const theirs of input.theirComments) {
    const mine = mineById.get(theirs.id)
    if (!mine) { out.push(clone(theirs)); stats.added += 1; continue }
    const fields: string[] = []
    if (mine.content !== theirs.content) fields.push('内容')
    if (mine.resolved !== theirs.resolved) fields.push('解决状态')
    if (mine.measure !== theirs.measure || mine.noteId !== theirs.noteId) fields.push('锚点')
    if (fields.length) {
      const winnerMine = decideWinner({ role: myRole, time: mine.createdAt }, { role: pkg.role, time: theirs.createdAt })
      conflicts.push({
        id: conflictId(), kind: 'comment', trackId: theirs.trackId, noteId: theirs.noteId, measure: theirs.measure, fields,
        kept: { role: winnerMine ? myRole : pkg.role, time: mine.createdAt, summary: winnerMine ? mine.content : theirs.content },
        dropped: { role: winnerMine ? pkg.role : myRole, time: theirs.createdAt, summary: winnerMine ? theirs.content : mine.content },
        keptValue: winnerMine ? mine : theirs,
        droppedValue: winnerMine ? theirs : mine,
        winner: winnerMine ? 'mine' : 'theirs', resolved: false, packageId: pkg.packageId,
      })
      stats.conflicts += 1
      const winner = winnerMine ? mine : theirs
      const index = out.findIndex((item) => item.id === theirs.id)
      if (index >= 0) out[index] = clone(winner)
    }
  }
  return out
}

function mergePageTurns(input: MergeInput, tracksOut: Track[], conflicts: MergeConflict[], stats: MergeStats): PageTurn[] {
  const { myRole, pkg, now } = input
  const mineById = new Map(input.pageTurns.map((item) => [item.trackId, item]))
  const out: PageTurn[] = []
  for (const track of tracksOut) {
    const mine = mineById.get(track.id)
    const theirs = input.theirPageTurns.find((item) => item.trackId === track.id)
    let merged: PageTurn
    if (mine && theirs) {
      const fields: string[] = []
      if (mine.measure !== theirs.measure) fields.push('换页小节')
      if (mine.cueMeasures !== theirs.cueMeasures) fields.push('提示音')
      if (fields.length) {
        const winnerMine = decideWinner({ role: myRole, time: mine.updatedAt }, { role: pkg.role, time: theirs.updatedAt })
        conflicts.push({
          id: conflictId(), kind: 'pageturn', trackId: track.id, noteId: null, measure: null, fields,
          kept: { role: winnerMine ? myRole : pkg.role, time: mine.updatedAt, summary: winnerMine ? `第 ${mine.measure} 小节换页` : `第 ${theirs.measure} 小节换页` },
          dropped: { role: winnerMine ? pkg.role : myRole, time: theirs.updatedAt, summary: winnerMine ? `第 ${theirs.measure} 小节换页` : `第 ${mine.measure} 小节换页` },
          keptValue: winnerMine ? mine : theirs,
          droppedValue: winnerMine ? theirs : mine,
          winner: winnerMine ? 'mine' : 'theirs', resolved: false, packageId: pkg.packageId,
        })
        stats.conflicts += 1
        merged = clone(winnerMine ? mine : theirs)
      } else {
        merged = clone(mine)
      }
    } else if (mine || theirs) {
      merged = clone(theirs ?? mine!)
    } else {
      const fallback: PageTurn = {
        trackId: track.id, anchorNoteId: null, measure: 1, cueMeasures: 1,
        manual: false, updatedAt: now, updatedBy: myRole,
      }
      merged = fallback
    }
    // 移调/合并后音符位置可能已变：换页建议跟着音符位置走并重算
    merged = recomputePageTurn(track, merged, now, merged.updatedBy ?? myRole)
    out.push(merged)
  }
  return out
}

/** 导出草稿包前做最后一道完整性检查；失败由调用方保留原包 */
export function validateDraftPackage(raw: unknown): DraftPackage {
  if (!raw || typeof raw !== 'object') throw new Error('草稿包不是合法对象')
  const pkg = raw as Partial<DraftPackage>
  if (!pkg.packageId || typeof pkg.packageId !== 'string') throw new Error('缺少草稿包编号')
  if (!Array.isArray(pkg.tracks)) throw new Error('草稿包缺少声部数据')
  for (const track of pkg.tracks) {
    if (!track.id || !Array.isArray(track.notes)) throw new Error(`声部 ${track.id ?? '?'} 数据不完整`)
  }
  if (!Array.isArray(pkg.comments)) throw new Error('草稿包缺少评论数据')
  if (!Array.isArray(pkg.pageTurns)) throw new Error('草稿包缺少换页数据')
  if (typeof pkg.exportedAt !== 'number') throw new Error('草稿包缺少导出时间')
  if (pkg.role !== 'composer' && pkg.role !== 'conductor' && pkg.role !== 'publisher') throw new Error('草稿包角色未知')
  return pkg as DraftPackage
}
