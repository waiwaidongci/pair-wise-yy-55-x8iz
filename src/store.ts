import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import type {
  DraftPackage, FailedMerge, MergeConflict, MergeRecord, MergeStats, PageTurn,
  Role, ScoreComment, ScoreNote, Track,
} from './types'
import { seedComments, seedPageTurns, seedTracks, seedVersions } from './mock'
import { assignMeasureBeats, reanchorComment, reanchorPageTurn } from './collab/anchor'
import { cueMeasuresForTrack, pagesForTrack, transposeKey } from './collab/pitch'
import { mergeThreeWay, recomputePageTurn, validateDraftPackage } from './collab/merge'

const DRAFT_KEY = 'yy55-score-draft-v2'
const MEASURES_PER_PAGE = 4

// reducer 内的冲突记录可能是 Immer 代理，structuredClone 无法克隆，用 JSON 深拷贝
function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

interface ScoreState {
  myRole: Role
  baseVersionId: string
  tracks: Track[]
  pageTurns: PageTurn[]
  selectedTrackId: string
  selectedNoteIndex: number
  history: string[]
  future: string[]
  comments: ScoreComment[]
  versions: typeof seedVersions
  conflicts: MergeConflict[]
  failedMerge: FailedMerge | null
  mergeHistory: MergeRecord[]
  lastExport: { packageId: string; at: number } | null
  dirty: boolean
}

type PersistedDraft = Pick<ScoreState, 'myRole' | 'baseVersionId' | 'tracks' | 'pageTurns' | 'comments' | 'conflicts' | 'failedMerge' | 'mergeHistory' | 'lastExport'>

function loadDraft(): Partial<PersistedDraft> | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    return raw ? JSON.parse(raw) as PersistedDraft : null
  } catch {
    return null
  }
}

const fresh = (): ScoreState => ({
  myRole: 'publisher',
  baseVersionId: 'v12',
  tracks: structuredClone(seedTracks),
  pageTurns: structuredClone(seedPageTurns),
  selectedTrackId: 'TR-01',
  selectedNoteIndex: 2,
  history: [],
  future: [],
  comments: structuredClone(seedComments),
  versions: structuredClone(seedVersions),
  conflicts: [],
  failedMerge: null,
  mergeHistory: [],
  lastExport: null,
  dirty: false,
})

function initialState(): ScoreState {
  const state = fresh()
  const draft = loadDraft()
  if (draft?.tracks?.length) {
    state.myRole = draft.myRole ?? state.myRole
    state.baseVersionId = draft.baseVersionId ?? state.baseVersionId
    state.tracks = draft.tracks
    state.pageTurns = draft.pageTurns?.length ? draft.pageTurns : state.pageTurns
    state.comments = draft.comments ?? state.comments
    state.conflicts = draft.conflicts ?? []
    state.failedMerge = draft.failedMerge ?? null
    state.mergeHistory = draft.mergeHistory ?? []
    state.lastExport = draft.lastExport ?? null
    state.dirty = true
  }
  return state
}

function persist(state: ScoreState) {
  const draft: PersistedDraft = {
    myRole: state.myRole, baseVersionId: state.baseVersionId, tracks: state.tracks,
    pageTurns: state.pageTurns, comments: state.comments, conflicts: state.conflicts,
    failedMerge: state.failedMerge, mergeHistory: state.mergeHistory, lastExport: state.lastExport,
  }
  localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

/** 结构变化后重排小节/拍位锚点，评论与换页建议跟着音符走 */
function relayout(state: ScoreState, trackId?: string) {
  const trackIds = new Set(trackId ? [trackId] : state.tracks.map((item) => item.id))
  for (const track of state.tracks) {
    if (!trackIds.has(track.id)) continue
    track.notes = assignMeasureBeats(track.notes)
    const turn = state.pageTurns.find((item) => item.trackId === track.id)
    if (turn) Object.assign(turn, reanchorPageTurn(turn, state.tracks))
  }
  state.comments = state.comments.map((comment) => reanchorComment(comment, state.tracks))
}

function snapshot(state: ScoreState) {
  state.history.push(JSON.stringify(state.tracks))
  if (state.history.length > 40) state.history.shift()
  state.future = []
  state.dirty = true
  persist(state)
}

const scoreSlice = createSlice({
  name: 'score',
  initialState,
  reducers: {
    setMyRole(state, action: PayloadAction<Role>) { state.myRole = action.payload; persist(state) },
    selectTrack(state, action: PayloadAction<string>) { state.selectedTrackId = action.payload; state.selectedNoteIndex = 0 },
    selectNote(state, action: PayloadAction<number>) { state.selectedNoteIndex = action.payload },
    addNote(state) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      const template = track.notes[Math.min(track.notes.length - 1, state.selectedNoteIndex)]
      const now = Date.now()
      track.notes.splice(state.selectedNoteIndex + 1, 0, {
        id: `N-${now}-${Math.floor(Math.random() * 1000)}`, key: template?.key ?? 'c/4',
        duration: 'q', dynamic: template?.dynamic ?? 'mf', tie: false, expression: '',
        measure: 1, beat: 1, updatedAt: now, updatedBy: state.myRole,
      })
      state.selectedNoteIndex += 1
      relayout(state, track.id)
      persist(state)
    },
    removeNote(state) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      if (track.notes.length > 1) track.notes.splice(state.selectedNoteIndex, 1)
      state.selectedNoteIndex = Math.max(0, state.selectedNoteIndex - 1)
      relayout(state, track.id)
      persist(state)
    },
    updateNote(state, action: PayloadAction<Partial<ScoreNote>>) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      Object.assign(track.notes[state.selectedNoteIndex]!, { ...action.payload, updatedAt: Date.now(), updatedBy: state.myRole })
    },
    transposeTrack(state, action: PayloadAction<number>) {
      if (!action.payload) return
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      track.notes.forEach((note) => {
        note.key = transposeKey(note.key, action.payload)
        note.updatedAt = Date.now()
        note.updatedBy = state.myRole
      })
      track.transposition += action.payload
      // 移调一变：分谱页数、提示音、换页建议全部重算
      const turn = state.pageTurns.find((item) => item.trackId === track.id)
      if (turn) Object.assign(turn, recomputePageTurn(track, turn, Date.now(), state.myRole))
      persist(state)
    },
    setManualPageTurn(state, action: PayloadAction<{ trackId: string; measure: number }>) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === action.payload.trackId)!
      const turn = state.pageTurns.find((item) => item.trackId === action.payload.trackId)!
      turn.manual = true
      turn.measure = action.payload.measure
      const anchor = track.notes.find((note) => note.measure === action.payload.measure && note.beat === 1)
      turn.anchorNoteId = anchor?.id ?? turn.anchorNoteId
      turn.updatedAt = Date.now()
      turn.updatedBy = state.myRole
      persist(state)
    },
    setCueMeasures(state, action: PayloadAction<{ trackId: string; cueMeasures: number }>) {
      snapshot(state)
      const turn = state.pageTurns.find((item) => item.trackId === action.payload.trackId)!
      turn.cueMeasures = action.payload.cueMeasures
      turn.manual = true
      turn.updatedAt = Date.now()
      turn.updatedBy = state.myRole
      persist(state)
    },
    undo(state) {
      const previous = state.history.pop()
      if (!previous) return
      state.future.push(JSON.stringify(state.tracks))
      state.tracks = JSON.parse(previous)
      relayout(state)
      state.dirty = true
      persist(state)
    },
    redo(state) {
      const next = state.future.pop()
      if (!next) return
      state.history.push(JSON.stringify(state.tracks))
      state.tracks = JSON.parse(next)
      relayout(state)
      state.dirty = true
      persist(state)
    },
    resolveComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload)
      if (comment) comment.resolved = true
      state.dirty = true
      persist(state)
    },
    addComment(state, action: PayloadAction<{ trackId: string; noteIndex: number; content: string }>) {
      const track = state.tracks.find((item) => item.id === action.payload.trackId)!
      const note = track.notes[action.payload.noteIndex]
      state.comments.push({
        id: `CM-${Date.now()}`, author: `本端评论`, role: state.myRole, content: action.payload.content,
        resolved: false, createdAt: Date.now(), trackId: track.id, noteId: note?.id ?? null, measure: note?.measure ?? 1,
      })
      state.dirty = true
      persist(state)
    },
    saveVersion(state) {
      state.versions.unshift({
        id: `v${state.versions.length + 13}`, author: '当前用户',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        summary: '合并草稿并形成出版版本',
        trackNotes: Object.fromEntries(state.tracks.map((track) => [track.id, deepClone(track.notes)])),
      })
      state.dirty = false
      state.conflicts = []
      state.failedMerge = null
      state.history = []
      state.future = []
      localStorage.removeItem(DRAFT_KEY)
    },
    recordExport(state, action: PayloadAction<{ packageId: string; at: number }>) {
      state.lastExport = action.payload
      persist(state)
    },
    /** 导入对方草稿包：校验失败只登记原包，不动当前总谱，可重试 */
    importDraft(state, action: PayloadAction<{ raw: string }>) {
      let pkg: DraftPackage
      try {
        pkg = validateDraftPackage(JSON.parse(action.payload.raw))
      } catch (error) {
        state.failedMerge = { raw: action.payload.raw, reason: error instanceof Error ? error.message : '草稿包无法解析', receivedAt: Date.now() }
        persist(state)
        return
      }
      // 旧草稿升级：按小节和声部补回稳定锚点
      const now = Date.now()
      const theirTracks = pkg.tracks.map((track) => {
        const legacy = pkg.schemaVersion < 2 || track.notes.some((note) => note.measure === undefined)
        return legacy
          ? { ...track, notes: assignMeasureBeats(track.notes).map((note) => ({ ...note, updatedAt: note.updatedAt || pkg.exportedAt, updatedBy: note.updatedBy || pkg.role })) }
          : track
      })
      const theirComments = pkg.comments.map((comment) => ({
        ...comment,
        role: comment.role ?? pkg.role,
        trackId: comment.trackId ?? theirTracks[0]?.id ?? null,
        measure: comment.measure ?? 1,
        createdAt: comment.createdAt ?? pkg.exportedAt,
      }))
      const result = mergeThreeWay({
        myRole: state.myRole,
        myTracks: state.tracks,
        theirTracks,
        baseTracks: pkg.baseTracks,
        comments: state.comments,
        theirComments,
        pageTurns: state.pageTurns,
        theirPageTurns: pkg.pageTurns ?? [],
        pkg: { ...pkg, tracks: theirTracks, comments: theirComments },
        now,
      })
      // 合并后按最终音符重排小节/拍位，再让评论与换页建议跟随
      result.tracks.forEach((track) => { track.notes = assignMeasureBeats(track.notes) })
      result.comments = result.comments.map((comment) => reanchorComment(comment, result.tracks))
      result.pageTurns = result.pageTurns.map((turn) => reanchorPageTurn(turn, result.tracks))
      state.tracks = result.tracks
      state.comments = result.comments
      state.pageTurns = result.pageTurns
      state.conflicts = [...state.conflicts, ...result.conflicts]
      state.failedMerge = null
      state.mergeHistory.unshift({ packageId: pkg.packageId, author: pkg.author, role: pkg.role, time: pkg.exportedAt, stats: result.stats })
      state.dirty = true
      persist(state)
    },
    /** 合并失败后用保留的原包重试 */
    retryFailedMerge(state) {
      if (!state.failedMerge) return
      const raw = state.failedMerge.raw
      scoreSlice.caseReducers.importDraft(state, { type: 'score/importDraft', payload: { raw } })
    },
    dismissFailedMerge(state) { state.failedMerge = null; persist(state) },
    /** 冲突裁决后采用落选版本（可出版值切换，原胜出值仍留在冲突记录里） */
    resolveConflict(state, action: PayloadAction<{ conflictId: string; useDropped: boolean }>) {
      const conflict = state.conflicts.find((item) => item.id === action.payload.conflictId)
      if (!conflict || (conflict.resolved && !action.payload.useDropped)) return
      if (action.payload.useDropped && conflict.droppedValue !== undefined) {
        if (conflict.kind === 'note' || conflict.kind === 'structure') {
          const track = state.tracks.find((item) => item.id === conflict.trackId)
          if (!track) return
          const existing = track.notes.find((note) => note.id === conflict.noteId)
          if (conflict.droppedDeleted) {
            // 落选方是删除：应用后移除音符
            track.notes = track.notes.filter((note) => note.id !== conflict.noteId)
            relayout(state, track.id)
          } else {
            const dropped = conflict.droppedValue as ScoreNote
            if (existing) Object.assign(existing, deepClone(dropped), { updatedAt: Date.now(), updatedBy: state.myRole })
            else {
              track.notes.push(deepClone(dropped))
              relayout(state, track.id)
            }
          }
        } else if (conflict.kind === 'transposition') {
          const track = state.tracks.find((item) => item.id === conflict.trackId)
          if (track) {
            track.transposition = conflict.droppedValue as number
            const turn = state.pageTurns.find((item) => item.trackId === track.id)
            if (turn) Object.assign(turn, recomputePageTurn(track, turn, Date.now(), state.myRole))
          }
        } else if (conflict.kind === 'comment') {
          const dropped = conflict.droppedValue as ScoreComment
          const index = state.comments.findIndex((item) => item.id === dropped.id)
          if (index >= 0) state.comments[index] = deepClone(dropped)
          else state.comments.push(deepClone(dropped))
        } else if (conflict.kind === 'pageturn') {
          const dropped = conflict.droppedValue as PageTurn
          const index = state.pageTurns.findIndex((item) => item.trackId === dropped.trackId)
          if (index >= 0) state.pageTurns[index] = reanchorPageTurn(deepClone(dropped), state.tracks)
        }
      }
      conflict.resolved = true
      state.dirty = true
      persist(state)
    },
    clearResolvedConflicts(state) {
      state.conflicts = state.conflicts.filter((item) => !item.resolved)
      persist(state)
    },
  },
})

export const scoreApi = createApi({
  reducerPath: 'scoreApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getPublishingProfile: builder.query<{ title: string; publisher: string; pages: number; deadline: string }, void>({ queryFn: async () => ({ data: { title: '《潮汐线》室内交响作品', publisher: '云谱出版社', pages: 46, deadline: '2026-10-12' } }) }),
  }),
})

export const {
  setMyRole, selectTrack, selectNote, addNote, removeNote, updateNote, transposeTrack,
  setManualPageTurn, setCueMeasures, undo, redo, resolveComment, addComment, saveVersion,
  recordExport, importDraft, retryFailedMerge, dismissFailedMerge, resolveConflict, clearResolvedConflicts,
} = scoreSlice.actions
export const store = configureStore({
  reducer: { score: scoreSlice.reducer, [scoreApi.reducerPath]: scoreApi.reducer },
  middleware: (getDefault) => getDefault().concat(scoreApi.middleware),
})
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch

/** 分谱版面选择器：页数与提示音随移调实时重算 */
export function selectPartLayout(state: RootState, trackId: string) {
  const track = state.score.tracks.find((item) => item.id === trackId)!
  const pageTurn = state.score.pageTurns.find((item) => item.trackId === trackId)!
  const pages = pagesForTrack(track, MEASURES_PER_PAGE)
  const autoCue = cueMeasuresForTrack(track, MEASURES_PER_PAGE)
  return {
    pages,
    cueMeasures: pageTurn.manual ? pageTurn.cueMeasures : autoCue,
    autoCue,
    pageTurn,
    measuresPerPage: MEASURES_PER_PAGE,
  }
}

export type { MergeStats }
