import { mergeThreeWay, validateDraftPackage, recomputePageTurn } from '../src/collab/merge.ts'
import { assignMeasureBeats, reanchorComment, reanchorPageTurn } from '../src/collab/anchor.ts'
import { pagesForTrack, cueMeasuresForTrack, transposeKey, suggestPageTurnMeasure } from '../src/collab/pitch.ts'
import type { DraftPackage, PageTurn, ScoreComment, ScoreNote, Track } from '../src/types.ts'

let passed = 0
const check = (name: string, cond: boolean) => { if (!cond) throw new Error('FAIL: ' + name); passed += 1; console.log('ok -', name) }

const makeNote = (patch: Partial<ScoreNote> & { id: string }): ScoreNote => ({
  key: 'c/4', duration: 'q', dynamic: 'mf', tie: false, expression: '',
  measure: 1, beat: 1, updatedAt: 1000, updatedBy: 'publisher', ...patch,
})

const makeTrack = (id: string, notes: ScoreNote[], transposition = 0): Track => ({
  id, name: id, instrument: 'X', clef: 'treble', transposition, color: '#000', notes,
})

const makePkg = (over: Partial<DraftPackage>): DraftPackage => ({
  packageId: 'PKG-T', schemaVersion: 2, role: 'conductor', author: '指挥', exportedAt: 5000,
  baseVersionId: 'v1', tracks: [], comments: [], pageTurns: [], ...over,
})

// 1. 同一音符两边改：角色优先级（composer > conductor），落选完整进冲突记录
{
  const base = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'mp' })])
  const mine = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'f', updatedBy: 'publisher', updatedAt: 9000 })])
  const theirs = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'p', updatedBy: 'conductor', updatedAt: 2000 })])
  const result = mergeThreeWay({
    myRole: 'publisher', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [], pkg: makePkg({ tracks: [theirs] }), now: 9000,
  })
  check('角色优先：指挥的 p 胜过出版的 f', result.tracks[0]!.notes[0]!.dynamic === 'p')
  check('产生 1 条冲突', result.conflicts.length === 1)
  const c = result.conflicts[0]!
  check('落选值完整保留（f）', (c.droppedValue as ScoreNote).dynamic === 'f')
  check('胜出元数据为指挥', c.kept.role === 'conductor')
  check('冲突标记为字段力度', c.fields.includes('dynamic'))
}

// 2. 同角色时按更新时间取新值
{
  const base = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'mp' })])
  const mine = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'ff', updatedBy: 'composer', updatedAt: 8000 })])
  const theirs = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'pp', updatedBy: 'composer', updatedAt: 3000 })])
  const result = mergeThreeWay({
    myRole: 'composer', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [], pkg: makePkg({ role: 'composer', tracks: [theirs] }), now: 9000,
  })
  check('同角色按时间：较新的 ff 胜出', result.tracks[0]!.notes[0]!.dynamic === 'ff')
}

// 3. 一边改一边不动 → 直接采纳，无冲突
{
  const base = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'mp' })])
  const mine = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'mp' })])
  const theirs = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'p', updatedBy: 'conductor', updatedAt: 3000 })])
  const result = mergeThreeWay({
    myRole: 'publisher', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [], pkg: makePkg({ tracks: [theirs] }), now: 9000,
  })
  check('对方单边修改自动采纳 p', result.tracks[0]!.notes[0]!.dynamic === 'p')
  check('单边修改无冲突', result.conflicts.length === 0)
  check('stats.changed 记 1', result.stats.changed === 1)
}

// 4. 对方新增音符（按锚点识别），我方不动 → 采纳
{
  const base = makeTrack('T1', assignMeasureBeats([makeNote({ id: 'N1' }), makeNote({ id: 'N2', beat: 2, measure: 1 })]))
  const mine = structuredClone(base)
  const theirs = structuredClone(base)
  theirs.notes.push(makeNote({ id: 'N3', measure: 2, beat: 1, dynamic: 'f' }))
  const result = mergeThreeWay({
    myRole: 'publisher', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [], pkg: makePkg({ tracks: [theirs] }), now: 9000,
  })
  check('对方新增音符被合并', result.tracks[0]!.notes.some((n) => n.id === 'N3'))
  check('新增无冲突', result.conflicts.length === 0)
  check('stats.added 记 1', result.stats.added === 1)
}

// 5. 无 baseTracks（旧草稿）：双方修改都视为冲突，不丢数据
{
  const mine = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'f', updatedBy: 'publisher', updatedAt: 9000 })])
  const theirs = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'p', updatedBy: 'conductor', updatedAt: 3000 })])
  const result = mergeThreeWay({
    myRole: 'publisher', myTracks: [mine], theirTracks: [theirs],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [], pkg: makePkg({ tracks: [theirs] }), now: 9000,
  })
  check('无基线时两边不同进冲突', result.conflicts.length === 1)
  check('无基线仍保留可出版值', typeof result.tracks[0]!.notes[0]!.dynamic === 'string')
}

// 6. 移调 → 页数、提示音、换页建议重算
{
  const notes = assignMeasureBeats(Array.from({ length: 48 }, (_, i) => makeNote({ id: `N${i}`, key: 'c/4', measure: 1, beat: 1 })))
  const trackC = makeTrack('T1', notes, 0)
  const pages0 = pagesForTrack(trackC, 4)
  // 移到远关系调，大量升降号
  const trackSharp = makeTrack('T1', notes.map((n) => ({ ...n, key: transposeKey(n.key, 1) })), 1)
  const pages1 = pagesForTrack(trackSharp, 4)
  check('移调后页数重算（>= 原页数）', pages1 >= pages0)
  check('12 小节 4/页至少 3 页', pages0 >= 3)
  check('提示音数量为非负数', cueMeasuresForTrack(trackC, 4) >= 0)
  const turn: PageTurn = { trackId: 'T1', anchorNoteId: null, measure: 99, cueMeasures: 2, manual: false, updatedAt: 0, updatedBy: 'publisher' }
  const updated = recomputePageTurn(trackC, turn, 7000, 'publisher')
  check('自动换页建议落在页边界', updated.measure === suggestPageTurnMeasure(trackC, 4))
  check('换页建议锚到具体音符', updated.anchorNoteId !== null)
}

// 7. 评论与换页建议跟着音符位置走（音符被后移一小节）
{
  const initial = assignMeasureBeats([
    makeNote({ id: 'N1', measure: 1, beat: 1 }),
    makeNote({ id: 'N2', measure: 1, beat: 2 }),
    makeNote({ id: 'N3', measure: 1, beat: 3 }),
    makeNote({ id: 'N4', measure: 1, beat: 4 }),
    makeNote({ id: 'N5', measure: 2, beat: 1 }),
  ])
  // N2、N3、N4 改为二分音符：锚点音符 N5 从第 2 小节第 1 拍被推到第 3 小节第 1 拍
  const moved = assignMeasureBeats(initial.map((n) => ['N2', 'N3', 'N4'].includes(n.id) ? { ...n, duration: 'h' as const } : n))
  const track = makeTrack('T1', moved)
  const comment: ScoreComment = { id: 'C1', author: 'a', role: 'conductor', content: 'x', resolved: false, createdAt: 1, trackId: 'T1', noteId: 'N5', measure: 2 }
  const re = reanchorComment(comment, [track])
  check('评论随音符移动到新小节', re.measure === 3)
  const turn: PageTurn = { trackId: 'T1', anchorNoteId: 'N5', measure: 2, cueMeasures: 1, manual: true, updatedAt: 1, updatedBy: 'publisher' }
  const rt = reanchorPageTurn(turn, [track])
  check('换页建议随锚点音符移动', rt.measure === 3)
  check('手动换页标记保留', rt.manual === true)
}

// 8. 旧草稿升级：无 measure/beat 的音符补回稳定锚点
{
  const legacy = [makeNote({ id: 'N1' }), makeNote({ id: 'N2' }), makeNote({ id: 'N3', duration: 'h' })]
  const upgraded = assignMeasureBeats(structuredClone(legacy))
  check('升级后每个音符有小节', upgraded.every((n) => n.measure >= 1))
  check('升级后拍位递增/换行正确', upgraded[0]!.beat === 1 && upgraded[1]!.beat === 2 && upgraded[2]!.measure === 1 && upgraded[2]!.beat === 3)
}

// 9. 损坏草稿包被 validateDraftPackage 拒绝（原包保留由 store 负责，这里只验证校验）
{
  let rejected = false
  try { validateDraftPackage({ packageId: 'X' }) } catch { rejected = true }
  check('缺 tracks 的包被拒绝', rejected)
  let rejected2 = false
  try { validateDraftPackage(null) } catch { rejected2 = true }
  check('null 草稿包被拒绝', rejected2)
  const ok = validateDraftPackage({ packageId: 'P', schemaVersion: 2, role: 'publisher', author: 'p', exportedAt: 1, tracks: [], comments: [], pageTurns: [] })
  check('合法包通过校验', ok.packageId === 'P')
}

// 10. 结构冲突：对方删除我方刚改的音符 → 按角色裁决，落选记录删除意图
{
  const base = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'mp' })])
  const mine = makeTrack('T1', [makeNote({ id: 'N1', dynamic: 'f', updatedBy: 'composer', updatedAt: 9000 })])
  const theirs = makeTrack('T1', [])
  const result = mergeThreeWay({
    myRole: 'composer', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [],
    pkg: makePkg({ role: 'conductor', tracks: [theirs] }), now: 9000,
  })
  check('作曲修改胜过指挥删除：音符保留', result.tracks[0]!.notes.length === 1)
  check('删除意图进入冲突记录（droppedDeleted）', result.conflicts[0]!.droppedDeleted === true)
}

// 11. 移调声部属性两边改：进冲突
{
  const base = makeTrack('T1', [makeNote({ id: 'N1' })], 0)
  const mine = makeTrack('T1', [makeNote({ id: 'N1' })], -2)
  const theirs = makeTrack('T1', [makeNote({ id: 'N1' })], -7)
  const result = mergeThreeWay({
    myRole: 'publisher', myTracks: [mine], theirTracks: [theirs], baseTracks: [base],
    comments: [], theirComments: [], pageTurns: [], theirPageTurns: [],
    pkg: makePkg({ role: 'conductor', exportedAt: 8000, tracks: [theirs] }), now: 9000,
  })
  const tConflict = result.conflicts.find((c) => c.kind === 'transposition')
  check('移调两边改产生 transposition 冲突', !!tConflict)
  check('指挥移调值 -7 胜出', result.tracks[0]!.transposition === -7)
  check('落选调值完整保留 (-2)', tConflict!.droppedValue === -2)
}

console.log(`\n${passed} checks passed`)
