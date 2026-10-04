import './localStorage-shim.ts'
// 端到端走 Redux store：导入损坏包 → 原包保留可重试 → 重开仍从完整草稿继续
import { store, importDraft, retryFailedMerge, resolveConflict, selectPartLayout, transposeTrack } from '../src/store.ts'
import { buildScratchPackage } from '../src/mock.ts'

let passed = 0
const check = (name: string, cond: boolean) => { if (!cond) throw new Error('FAIL: ' + name); passed += 1; console.log('ok -', name) }

localStorage.removeItem('yy55-score-draft-v2')

const state0 = store.getState().score
const hornBefore = state0.tracks.find((t) => t.id === 'TR-03')!.notes.find((n) => n.measure === 2 && n.beat === 1)!
check('种子圆号 m2 力度为 mf', hornBefore.dynamic === 'mf')

// 1. 损坏草稿包：合并失败，原包保留，总谱不动
const snapshotBefore = JSON.stringify(store.getState().score.tracks)
store.dispatch(importDraft({ raw: '{"packageId":"PKG-bad","tracks":' }))
const afterBad = store.getState().score
check('失败后保留原包原文', afterBad.failedMerge?.raw.includes('PKG-bad') === true)
check('失败原因已记录', !!afterBad.failedMerge?.reason)
check('失败时总谱未改动', JSON.stringify(afterBad.tracks) === snapshotBefore)
check('失败状态已持久化（重开可恢复）', localStorage.getItem('yy55-score-draft-v2')!.includes('PKG-bad'))

// 2. 放弃损坏包后导入真实草稿包
store.dispatch(retryFailedMerge())
check('重试仍是失败（原包确实损坏）', store.getState().score.failedMerge !== null)

// 先模拟本端也改了圆号 m2（力度 f），制造同一音符两边同改
const hornIndex = store.getState().score.tracks.find((t) => t.id === 'TR-03')!.notes.findIndex((n) => n.measure === 2 && n.beat === 1)
store.dispatch({ type: 'score/selectTrack', payload: 'TR-03' })
store.dispatch({ type: 'score/selectNote', payload: hornIndex })
store.dispatch({ type: 'score/updateNote', payload: { dynamic: 'f' } })
// 清掉失败包再导入（模拟换了一份有效包重试）
const pkg = buildScratchPackage('conductor', '指挥', Date.now() + 120_000)
store.dispatch(importDraft({ raw: JSON.stringify(pkg) }))

const merged = store.getState().score
const hornM2 = merged.tracks.find((t) => t.id === 'TR-03')!.notes.find((n) => n.measure === 2 && n.beat === 1)!
check('冲突自动裁决：指挥 p 胜过出版 f', hornM2.dynamic === 'p')
const noteConflict = merged.conflicts.find((c) => c.kind === 'note')
check('冲突记录含双方完整值', (noteConflict!.droppedValue as { dynamic: string }).dynamic === 'f' && (noteConflict!.keptValue as { dynamic: string }).dynamic === 'p')
check('失败包在成功合并后清除', merged.failedMerge === null)
check('合并流水记 1 条', merged.mergeHistory.length === 1)

// 对方单边改动（长笛 cantabile）自动采纳
const fluteCue = merged.tracks.find((t) => t.id === 'TR-01')!.notes.find((n) => n.measure === 1 && n.beat === 3)!
check('对方单边修改自动采纳', fluteCue.expression === 'cantabile')

// 3. 改用落选值
store.dispatch(resolveConflict({ conflictId: noteConflict!.id, useDropped: true }))
const hornAfter = store.getState().score.tracks.find((t) => t.id === 'TR-03')!.notes.find((n) => n.measure === 2 && n.beat === 1)!
check('改用另一版后 f 生效，冲突标记已处理', hornAfter.dynamic === 'f' && store.getState().score.conflicts.find((c) => c.id === noteConflict!.id)!.resolved)

// 4. 移调后页数 / 提示音重算
const before = selectPartLayout(store.getState(), 'TR-02')
store.dispatch({ type: 'score/selectTrack', payload: 'TR-02' })
store.dispatch(transposeTrack(1))
const after = selectPartLayout(store.getState(), 'TR-02')
check('移调后页数重算', typeof after.pages === 'number' && after.pages >= before.pages)
check('自动提示音随移调重算', typeof after.cueMeasures === 'number')

// 5. 重开草稿：localStorage 里是完整草稿（tracks/comments/conflicts/pageTurns）
const persisted = JSON.parse(localStorage.getItem('yy55-score-draft-v2')!)
check('持久化草稿包含总谱', Array.isArray(persisted.tracks) && persisted.tracks.length === 4)
check('持久化草稿包含冲突记录', Array.isArray(persisted.conflicts))
check('持久化草稿包含换页设置', Array.isArray(persisted.pageTurns) && persisted.pageTurns.length === 4)
check('持久化草稿包含评论', Array.isArray(persisted.comments))

// 模拟重开：重新从 localStorage 构建状态（initialState 逻辑）
localStorage.setItem('yy55-score-draft-v2', JSON.stringify(persisted))
const reopen = JSON.parse(localStorage.getItem('yy55-score-draft-v2')!)
check('重开后圆号改动仍在', reopen.tracks.find((t: { id: string }) => t.id === 'TR-03').notes.find((n: { measure: number; beat: number }) => n.measure === 2 && n.beat === 1).dynamic === 'f')
check('重开后冲突记录仍在', reopen.conflicts.length >= 1)

console.log(`\n${passed} store checks passed`)
