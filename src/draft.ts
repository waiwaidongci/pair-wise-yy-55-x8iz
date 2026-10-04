import type { ConflictRecord, DraftPackage, PartLayout, Role, ScoreComment, ScoreNote, Track } from './types'

/** 角色出版权重：出版方对“可出版值”拥有最终决定权，作曲次之，指挥再次 */
export const ROLE_WEIGHT: Record<Role, number> = { publisher: 3, composer: 2, conductor: 1 }
export const ROLE_LABEL: Record<Role, string> = { conductor: '指挥', composer: '作曲', publisher: '出版' }

export const DRAFT_STORAGE_KEY = 'yy55-score-draft'
export const PACKAGE_FORMAT = 'score-draft-package'
export const PACKAGE_VERSION = 1

/** 按小节与声部生成稳定锚点：声部#小节#音位 */
export function noteAnchor(trackId: string, measure: number, noteIndex: number): string {
  return `${trackId}#m${measure}#n${noteIndex}`
}

export function commentAnchor(trackId: string | 'ALL', measure: number): string {
  return `${trackId}#m${measure}`
}

/** 旧草稿升级：为缺少锚点的音符按小节与声部补回稳定锚点 */
export function migrateTracks(tracks: Track[]): Track[] {
  return tracks.map((track) => ({
    ...track,
    notes: track.notes.map((note, index) => {
      const measure = Math.floor(index / 4)
      const noteIndex = index % 4
      const anchor = note.anchor || noteAnchor(track.id, measure, noteIndex)
      return { ...note, anchor }
    }),
  }))
}

/** 旧草稿升级：为缺少锚点的评论补回锚点（评论跟随音符位置） */
export function migrateComments(comments: ScoreComment[]): ScoreComment[] {
  return comments.map((comment) => ({
    ...comment,
    anchor: comment.anchor || commentAnchor('ALL', comment.measure),
  }))
}

/** 旧草稿/旧包升级入口：缺锚点则按小节和声部补回 */
export function migrateDraft(draft: { tracks?: Track[]; comments?: ScoreComment[] }): { tracks: Track[]; comments: ScoreComment[] } {
  return { tracks: migrateTracks(draft.tracks ?? []), comments: migrateComments(draft.comments ?? []) }
}

function noteKey(trackId: string, note: ScoreNote): string {
  return note.anchor || `${trackId}#${note.id}`
}

export interface MergeResult {
  tracks: Track[]
  comments: ScoreComment[]
  conflicts: ConflictRecord[]
}

const FIELD_LABELS: Record<string, string> = {
  key: '音高', duration: '时值', accidental: '临时记号', dynamic: '力度', tie: '连音线', expression: '表情', comment: '评论内容',
}

export function formatFieldValue(field: string, value: unknown): string {
  if (field === 'tie') return value ? '有连音线' : '无'
  if (field === 'accidental') return value ? String(value) : '无'
  if (field === 'comment') return String(value ?? '')
  return String(value ?? '')
}

function pickWinner(local: ScoreNote | undefined, incoming: ScoreNote | undefined, localRole: Role, incomingRole: Role): 'local' | 'incoming' {
  const localWeight = ROLE_WEIGHT[localRole]
  const incomingWeight = ROLE_WEIGHT[incomingRole]
  if (localWeight !== incomingWeight) return localWeight > incomingWeight ? 'local' : 'incoming'
  const localTime = local?.updatedAt ?? ''
  const incomingTime = incoming?.updatedAt ?? ''
  return incomingTime > localTime ? 'incoming' : 'local'
}

/**
 * 合并对方导出的草稿包。
 * 同一音符两边都改过时：按角色权重保留一个可出版值，另一版进入冲突记录，改动不会消失。
 * 角色相同则以较晚时间为准。
 */
export function mergeDrafts(
  baseTracks: Track[],
  localTracks: Track[],
  incomingTracks: Track[],
  localRole: Role,
  incomingRole: Role,
  baseComments: ScoreComment[],
  localComments: ScoreComment[],
  incomingComments: ScoreComment[],
): MergeResult {
  const conflicts: ConflictRecord[] = []
  const now = new Date().toISOString()

  const mergedTracks: Track[] = localTracks.map((localTrack) => {
    const incomingTrack = incomingTracks.find((t) => t.id === localTrack.id)
    if (!incomingTrack) return structuredClone(localTrack)
    const baseTrack = baseTracks.find((t) => t.id === localTrack.id)
    const baseByAnchor = new Map<string, ScoreNote>()
    baseTrack?.notes.forEach((note) => baseByAnchor.set(noteKey(localTrack.id, note), note))
    const incomingByAnchor = new Map<string, ScoreNote>()
    incomingTrack.notes.forEach((note) => incomingByAnchor.set(noteKey(localTrack.id, note), note))

    const mergedNotes: ScoreNote[] = []
    const anchors = new Set<string>()
    localTrack.notes.forEach((note) => anchors.add(noteKey(localTrack.id, note)))
    incomingTrack.notes.forEach((note) => anchors.add(noteKey(localTrack.id, note)))

    anchors.forEach((anchor) => {
      const localNote = localTrack.notes.find((n) => noteKey(localTrack.id, n) === anchor)
      const incomingNote = incomingTrack.notes.find((n) => noteKey(localTrack.id, n) === anchor)
      const baseNote = baseByAnchor.get(anchor)
      const measureMatch = anchor.match(/#m(\d+)#/)
      const measure = measureMatch ? Number(measureMatch[1]) : 0

      if (localNote && incomingNote) {
        const fields = ['key', 'duration', 'accidental', 'dynamic', 'tie', 'expression'] as const
        const merged: ScoreNote = { ...localNote }
        fields.forEach((field) => {
          const baseValue = baseNote ? (baseNote as unknown as Record<string, unknown>)[field] : ''
          const localValue = (localNote as unknown as Record<string, unknown>)[field]
          const incomingValue = (incomingNote as unknown as Record<string, unknown>)[field]
          const localChanged = !baseNote || localValue !== baseValue
          const incomingChanged = !baseNote || incomingValue !== baseValue
          if (localChanged && incomingChanged && localValue !== incomingValue) {
            const winnerSide = pickWinner(localNote, incomingNote, localRole, incomingRole)
            const winnerNote = winnerSide === 'local' ? localNote : incomingNote
            const reason = ROLE_WEIGHT[localRole] !== ROLE_WEIGHT[incomingRole]
              ? `角色权重 ${ROLE_LABEL[winnerSide === 'local' ? localRole : incomingRole]}（${ROLE_WEIGHT[winnerSide === 'local' ? localRole : incomingRole]}）优先于${ROLE_LABEL[winnerSide === 'local' ? incomingRole : localRole]}（${ROLE_WEIGHT[winnerSide === 'local' ? incomingRole : localRole]}）`
              : `同角色（${ROLE_LABEL[localRole]}）以较晚修改时间为准`
            conflicts.push({
              id: `CF-${conflicts.length + 1}-${anchor}-${field}`,
              refId: anchor, anchor, trackId: localTrack.id, measure,
              field, fieldLabel: FIELD_LABELS[field] ?? field,
              baseValue, localValue, incomingValue,
              winner: winnerSide, winnerRole: winnerSide === 'local' ? localRole : incomingRole,
              reason, time: now, resolved: false,
            })
            ;(merged as unknown as Record<string, unknown>)[field] = winnerNote[field]
          } else if (incomingChanged && !localChanged) {
            ;(merged as unknown as Record<string, unknown>)[field] = incomingNote[field]
          }
        })
        mergedNotes.push(merged)
      } else if (incomingNote) {
        // 对方新增或修改的音符：若本地已删除且对方有修改，记录冲突，不让删除悄悄吞掉对方修改
        const fields = ['key', 'duration', 'accidental', 'dynamic', 'tie', 'expression'] as const
        const incomingChanged = !baseNote || fields.some((f) => (incomingNote as unknown as Record<string, unknown>)[f] !== (baseNote as unknown as Record<string, unknown> | undefined)?.[f])
        if (baseNote && incomingChanged) {
          conflicts.push({
            id: `CF-${conflicts.length + 1}-${anchor}-deleted`,
            refId: anchor, anchor, trackId: localTrack.id, measure,
            field: 'deleted', fieldLabel: '音符删除',
            baseValue: '存在', localValue: '删除', incomingValue: '保留音符',
            winner: 'incoming', winnerRole: incomingRole,
            reason: '本地删除了该音符而对方有修改，保留音符并记录此冲突',
            time: now, resolved: false,
          })
        }
        mergedNotes.push({ ...incomingNote })
      } else if (localNote) {
        // 对方删除了该音符：若本地也改过，记录冲突，不让删除悄悄吞掉本地修改
        const fields = ['key', 'duration', 'accidental', 'dynamic', 'tie', 'expression'] as const
        const localChanged = !baseNote || fields.some((f) => (localNote as unknown as Record<string, unknown>)[f] !== (baseNote as unknown as Record<string, unknown> | undefined)?.[f])
        if (baseNote && localChanged) {
          conflicts.push({
            id: `CF-${conflicts.length + 1}-${anchor}-deleted`,
            refId: anchor, anchor, trackId: localTrack.id, measure,
            field: 'deleted', fieldLabel: '音符删除',
            baseValue: '存在', localValue: '保留音符', incomingValue: '删除',
            winner: 'local', winnerRole: localRole,
            reason: '对方删除了该音符而本地有修改，保留音符并记录此冲突',
            time: now, resolved: false,
          })
        }
        mergedNotes.push({ ...localNote })
      }
    })

    mergedNotes.sort((a, b) => {
      const ma = a.anchor.match(/#m(\d+)#n(\d+)/)
      const mb = b.anchor.match(/#m(\d+)#n(\d+)/)
      if (!ma || !mb) return 0
      return Number(ma[1]) - Number(mb[1]) || Number(ma[2]) - Number(mb[2])
    })
    return { ...localTrack, notes: mergedNotes }
  })

  // 评论合并：同一评论两边修改时同样按角色/时间保留可出版值
  const mergedComments: ScoreComment[] = []
  const commentIds = new Set<string>()
  localComments.forEach((c) => commentIds.add(c.id))
  incomingComments.forEach((c) => commentIds.add(c.id))
  commentIds.forEach((id) => {
    const local = localComments.find((c) => c.id === id)
    const incoming = incomingComments.find((c) => c.id === id)
    const base = baseComments.find((c) => c.id === id)
    if (local && incoming) {
      const localChanged = !base || local.content !== base.content || local.resolved !== base.resolved
      const incomingChanged = !base || incoming.content !== base.content || incoming.resolved !== base.resolved
      if (localChanged && incomingChanged && (local.content !== incoming.content || local.resolved !== incoming.resolved)) {
        const winnerSide = pickWinner(
          { updatedAt: local.updatedAt } as ScoreNote,
          { updatedAt: incoming.updatedAt } as ScoreNote,
          localRole, incomingRole,
        )
        const winner = winnerSide === 'local' ? local : incoming
        conflicts.push({
          id: `CF-CM-${id}`,
          refId: id, anchor: winner.anchor, trackId: 'ALL', measure: winner.measure,
          field: 'comment', fieldLabel: '评论内容',
          baseValue: base?.content ?? '', localValue: local.content, incomingValue: incoming.content,
          winner: winnerSide, winnerRole: winnerSide === 'local' ? localRole : incomingRole,
          reason: ROLE_WEIGHT[localRole] !== ROLE_WEIGHT[incomingRole]
            ? `角色权重 ${ROLE_LABEL[winnerSide === 'local' ? localRole : incomingRole]}优先`
            : '同角色以较晚修改时间为准',
          time: now, resolved: false,
        })
        mergedComments.push({ ...winner })
      } else {
        mergedComments.push(incomingChanged ? { ...incoming } : { ...local })
      }
    } else if (incoming) {
      mergedComments.push({ ...incoming })
    } else if (local) {
      mergedComments.push({ ...local })
    }
  })

  return { tracks: mergedTracks, comments: mergedComments, conflicts }
}

/** 分谱排版重算：移调变化后重算页数、提示音与换页建议 */
export function recomputePartLayout(track: Track, allTracks: Track[], measuresPerPage = 4): PartLayout {
  const totalMeasures = Math.max(1, Math.ceil(track.notes.length / 4))
  const pages = Math.max(1, Math.ceil(totalMeasures / measuresPerPage))
  const cues: { measure: number; trackId: string; partName: string; pitch: string }[] = []
  // 提示音：每个小节开头（除第 1 小节）由同页其他声部提示进入音高，音高随移调重算
  for (let m = 1; m < totalMeasures; m++) {
    const cueTrack = allTracks.find((t) => t.id !== track.id) ?? allTracks[0]
    if (!cueTrack) continue
    const cueNote = cueTrack.notes[m * 4]
    if (!cueNote) continue
    const transposed = transposeKey(cueNote.key, track.transposition - cueTrack.transposition)
    cues.push({ measure: m + 1, trackId: cueTrack.id, partName: cueTrack.name, pitch: transposed.replace('/', '') })
  }
  // 换页建议：在分页处附近找长音/休止小节，建议提前一小节翻页
  const breakMeasure = pages * measuresPerPage
  let pageTurnMeasure = Math.min(totalMeasures, breakMeasure)
  for (let m = breakMeasure - 1; m >= Math.max(1, breakMeasure - 2); m--) {
    const hasLong = track.notes.slice((m - 1) * 4, m * 4).some((n) => n.duration === 'h')
    if (hasLong) { pageTurnMeasure = m; break }
  }
  return { pages, measuresPerPage, cues, pageTurnMeasure, recomputedAt: new Date().toISOString() }
}

function transposeKey(key: string, semitones: number): string {
  const chromatic = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
  const [pitch, octaveText] = key.split('/')
  let index = chromatic.indexOf(pitch!.replace('b', '')) + semitones
  let octave = Number(octaveText)
  while (index < 0) { index += 12; octave -= 1 }
  while (index >= 12) { index -= 12; octave += 1 }
  return `${chromatic[index]}/${octave}`
}

/** 导出草稿包：断网修改后导出，供对方恢复网络时合并 */
export function exportDraftPackage(tracks: Track[], comments: ScoreComment[], role: Role, authorName: string, baseVersionId: string): DraftPackage {
  return {
    format: PACKAGE_FORMAT,
    version: PACKAGE_VERSION,
    exportedAt: new Date().toISOString(),
    author: { role, name: authorName },
    baseVersionId,
    tracks: structuredClone(tracks),
    comments: structuredClone(comments),
  }
}

/** 校验草稿包结构，非法时抛出错误（调用方保留原包并重试） */
export function validateDraftPackage(raw: unknown): asserts raw is DraftPackage {
  if (typeof raw !== 'object' || raw === null) throw new Error('草稿包为空或不是有效对象')
  const pkg = raw as Record<string, unknown>
  if (pkg.format !== PACKAGE_FORMAT) throw new Error(`草稿包格式无法识别：期望 ${PACKAGE_FORMAT}，收到 ${String(pkg.format)}`)
  if (pkg.version !== PACKAGE_VERSION) throw new Error(`草稿包版本不兼容：期望 v${PACKAGE_VERSION}，收到 v${String(pkg.version)}`)
  if (!Array.isArray(pkg.tracks) || pkg.tracks.length === 0) throw new Error('草稿包缺少声部数据')
  if (!Array.isArray(pkg.comments)) throw new Error('草稿包缺少评论数据')
  for (const track of pkg.tracks as unknown[]) {
    if (typeof track !== 'object' || track === null) throw new Error('草稿包声部数据损坏')
    const t = track as Record<string, unknown>
    if (typeof t.id !== 'string' || !Array.isArray(t.notes)) throw new Error('草稿包声部结构损坏')
  }
}

/** 导出草稿包为 JSON 文件（断网修改后导出，供对方恢复网络时合并） */
export function downloadPackage(pkg: DraftPackage) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `draft-package-${pkg.author.role}-${pkg.exportedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

/** 读取草稿包文件并解析为 JSON */
export function readPackageFile(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        resolve(JSON.parse(String(reader.result)))
      } catch {
        reject(new Error('草稿包文件不是有效的 JSON'))
      }
    }
    reader.onerror = () => reject(new Error('草稿包文件读取失败'))
    reader.readAsText(file)
  })
}
