import { configureStore, createSlice, type PayloadAction } from '@reduxjs/toolkit'
import { createApi, fakeBaseQuery } from '@reduxjs/toolkit/query/react'
import type { ConflictRecord, DraftPackage, Role, ScoreComment, ScoreNote, ScoreVersion, Track } from './types'
import { seedComments, seedTracks, seedVersions } from './mock'
import {
  DRAFT_STORAGE_KEY, mergeDrafts, migrateComments, migrateDraft, migrateTracks,
  validateDraftPackage,
} from './draft'

interface ScoreState {
  tracks: Track[]
  selectedTrackId: string
  selectedNoteIndex: number
  history: string[]
  future: string[]
  comments: ScoreComment[]
  versions: ScoreVersion[]
  dirty: boolean
  /** 当前操作者角色：指挥 / 作曲 / 出版，冲突时按角色权重保留可出版值 */
  role: Role
  /** 合并冲突记录：另一版改动进入此处，不悄悄消失 */
  conflicts: ConflictRecord[]
  /** 合并基线：双方共同的出版基线，用于三方合并 */
  baseTracks: Track[]
  baseComments: ScoreComment[]
  /** 合并失败信息：保留原包并重试，不破坏当前草稿 */
  mergeError: string | null
  pendingPackage: DraftPackage | null
  draftSavedAt: string | null
}

const initialState: ScoreState = {
  tracks: structuredClone(seedTracks),
  selectedTrackId: 'TR-01',
  selectedNoteIndex: 2,
  history: [],
  future: [],
  comments: structuredClone(seedComments),
  versions: structuredClone(seedVersions),
  dirty: false,
  role: 'composer',
  conflicts: [],
  baseTracks: structuredClone(seedTracks),
  baseComments: structuredClone(seedComments),
  mergeError: null,
  pendingPackage: null,
  draftSavedAt: null,
}

function persist(state: ScoreState) {
  state.draftSavedAt = new Date().toISOString()
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify({
    tracks: state.tracks,
    comments: state.comments,
    conflicts: state.conflicts,
    role: state.role,
    baseTracks: state.baseTracks,
    baseComments: state.baseComments,
    savedAt: state.draftSavedAt,
  }))
}

function snapshot(state: ScoreState) {
  state.history.push(JSON.stringify(state.tracks))
  if (state.history.length > 40) state.history.shift()
  state.future = []
  state.dirty = true
  persist(state)
}

function touchNote(note: ScoreNote) {
  note.updatedAt = new Date().toISOString()
}

function transposeKey(key: string, semitones: number) {
  const chromatic = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
  const [pitch, octaveText] = key.split('/')
  let index = chromatic.indexOf(pitch!.replace('b', '')) + semitones
  let octave = Number(octaveText)
  while (index < 0) { index += 12; octave -= 1 }
  while (index >= 12) { index -= 12; octave += 1 }
  return `${chromatic[index]}/${octave}`
}

/** 合并草稿包：校验 → 三方合并 → 原子提交；失败则保留原包并记录错误，可重试 */
function applyPackage(state: ScoreState, pkg: DraftPackage) {
  try {
    validateDraftPackage(pkg)
    const incomingTracks = migrateTracks(pkg.tracks)
    const incomingComments = migrateComments(pkg.comments)
    const result = mergeDrafts(
      state.baseTracks, state.tracks, incomingTracks,
      state.role, pkg.author.role,
      state.baseComments, state.comments, incomingComments,
    )
    state.tracks = result.tracks
    state.comments = result.comments
    state.conflicts = [...result.conflicts, ...state.conflicts]
    state.baseTracks = structuredClone(result.tracks)
    state.baseComments = structuredClone(result.comments)
    state.mergeError = null
    state.pendingPackage = null
    state.dirty = true
    persist(state)
  } catch (err) {
    // 合并失败：保留原包（当前草稿不动），记录错误以便重试
    state.mergeError = err instanceof Error ? err.message : String(err)
    state.pendingPackage = pkg
  }
}

const scoreSlice = createSlice({
  name: 'score',
  initialState,
  reducers: {
    selectTrack(state, action: PayloadAction<string>) { state.selectedTrackId = action.payload; state.selectedNoteIndex = 0 },
    selectNote(state, action: PayloadAction<number>) { state.selectedNoteIndex = action.payload },
    addNote(state) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      const template = track.notes[Math.min(track.notes.length - 1, state.selectedNoteIndex)]
      const index = state.selectedNoteIndex + 1
      const measure = Math.floor(index / 4)
      const noteIndex = index % 4
      track.notes.splice(index, 0, {
        id: `N-${Date.now()}`,
        anchor: `${track.id}#m${measure}#n${noteIndex}`,
        key: template?.key ?? 'c/4',
        duration: template?.duration ?? 'q',
        dynamic: template?.dynamic ?? 'mf',
        tie: false,
        expression: '',
        updatedAt: new Date().toISOString(),
      })
      state.selectedNoteIndex = index
    },
    removeNote(state) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      if (track.notes.length > 1) track.notes.splice(state.selectedNoteIndex, 1)
      state.selectedNoteIndex = Math.max(0, state.selectedNoteIndex - 1)
    },
    updateNote(state, action: PayloadAction<Partial<ScoreNote>>) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      const note = track.notes[state.selectedNoteIndex]!
      Object.assign(note, action.payload)
      touchNote(note)
    },
    transposeTrack(state, action: PayloadAction<number>) {
      snapshot(state)
      const track = state.tracks.find((item) => item.id === state.selectedTrackId)!
      track.notes.forEach((note) => { note.key = transposeKey(note.key, action.payload); touchNote(note) })
      track.transposition += action.payload
    },
    undo(state) {
      const previous = state.history.pop()
      if (!previous) return
      state.future.push(JSON.stringify(state.tracks))
      state.tracks = JSON.parse(previous)
      state.dirty = true
      persist(state)
    },
    redo(state) {
      const next = state.future.pop()
      if (!next) return
      state.history.push(JSON.stringify(state.tracks))
      state.tracks = JSON.parse(next)
      state.dirty = true
      persist(state)
    },
    resolveComment(state, action: PayloadAction<string>) {
      const comment = state.comments.find((item) => item.id === action.payload)
      if (comment) { comment.resolved = true; comment.updatedAt = new Date().toISOString() }
      state.dirty = true
      persist(state)
    },
    saveVersion(state) {
      state.versions.unshift({
        id: `v${state.versions.length + 13}`,
        author: '当前用户',
        time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        summary: '保存当前总谱与分谱调整',
        trackNotes: Object.fromEntries(state.tracks.map((track) => [track.id, structuredClone(track.notes)])),
      })
      state.baseTracks = structuredClone(state.tracks)
      state.baseComments = structuredClone(state.comments)
      state.dirty = false
      localStorage.removeItem(DRAFT_STORAGE_KEY)
    },
    setRole(state, action: PayloadAction<Role>) {
      state.role = action.payload
      persist(state)
    },
    importDraft(state, action: PayloadAction<DraftPackage>) {
      applyPackage(state, action.payload)
    },
    retryMerge(state) {
      if (!state.pendingPackage) return
      const pkg = state.pendingPackage
      state.mergeError = null
      applyPackage(state, pkg)
    },
    clearMergeError(state) {
      state.mergeError = null
    },
    /** 在冲突记录中采用另一版：把该字段改为另一方的值，冲突标记为已处理 */
    adoptConflict(state, action: PayloadAction<{ id: string; side: 'local' | 'incoming' }>) {
      const conflict = state.conflicts.find((item) => item.id === action.payload.id)
      if (!conflict) return
      const value = action.payload.side === 'local' ? conflict.localValue : conflict.incomingValue
      if (conflict.field === 'comment') {
        const comment = state.comments.find((item) => item.id === conflict.refId)
        if (comment) comment.content = String(value ?? '')
      } else {
        const track = state.tracks.find((item) => item.id === conflict.trackId)
        const note = track?.notes.find((item) => item.anchor === conflict.refId)
        if (note) (note as unknown as Record<string, unknown>)[conflict.field] = value
      }
      conflict.winner = action.payload.side
      conflict.resolved = true
      state.dirty = true
      persist(state)
    },
    /** 重开时从完整草稿继续：缺锚点的旧草稿按小节与声部补回稳定锚点 */
    restoreDraft(state) {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
      if (!raw) return
      try {
        const draft = JSON.parse(raw) as {
          tracks?: Track[]; comments?: ScoreComment[]; conflicts?: ConflictRecord[]
          role?: Role; baseTracks?: Track[]; baseComments?: ScoreComment[]; savedAt?: string
        }
        const migrated = migrateDraft(draft)
        if (migrated.tracks.length) state.tracks = migrated.tracks
        if (migrated.comments.length) state.comments = migrated.comments
        if (Array.isArray(draft.conflicts)) state.conflicts = draft.conflicts
        if (draft.role) state.role = draft.role
        if (Array.isArray(draft.baseTracks)) state.baseTracks = migrateTracks(draft.baseTracks)
        if (Array.isArray(draft.baseComments)) state.baseComments = migrateComments(draft.baseComments)
        state.dirty = true
        state.draftSavedAt = draft.savedAt ?? null
      } catch {
        localStorage.removeItem(DRAFT_STORAGE_KEY)
      }
    },
    discardDraft(state) {
      localStorage.removeItem(DRAFT_STORAGE_KEY)
      state.conflicts = []
      state.dirty = false
      state.draftSavedAt = null
    },
  },
})

export const scoreApi = createApi({
  reducerPath: 'scoreApi',
  baseQuery: fakeBaseQuery(),
  endpoints: (builder) => ({
    getPublishingProfile: builder.query<{ title: string; publisher: string; pages: number; deadline: string }, void>({
      queryFn: async () => ({ data: { title: '《潮汐线》室内交响作品', publisher: '云谱出版社', pages: 46, deadline: '2026-10-12' } }),
    }),
  }),
})

export const {
  selectTrack, selectNote, addNote, removeNote, updateNote, transposeTrack, undo, redo,
  resolveComment, saveVersion, setRole, importDraft, retryMerge, clearMergeError,
  adoptConflict, restoreDraft, discardDraft,
} = scoreSlice.actions
export const store = configureStore({
  reducer: { score: scoreSlice.reducer, [scoreApi.reducerPath]: scoreApi.reducer },
  middleware: (getDefault) => getDefault().concat(scoreApi.middleware),
})
export type RootState = ReturnType<typeof store.getState>
export type AppDispatch = typeof store.dispatch
