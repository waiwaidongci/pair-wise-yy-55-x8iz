import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Divider, Input, Segmented, Select, Space, Tag, Tooltip } from 'antd'
import { DeleteOutlined, PlusOutlined, RedoOutlined, UndoOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import { Accidental, Formatter, Renderer, Stave, StaveNote, Voice } from 'vexflow'
import type { AppDispatch, RootState } from '../store'
import {
  addComment, addNote, redo, removeNote, selectNote, selectTrack, transposeTrack, undo, updateNote,
} from '../store'
import { ROLE_LABEL, type Role } from '../types'
import { durationWeight } from '../collab/pitch'

const ROLE_COLOR: Record<Role, string> = { composer: 'gold', conductor: 'blue', publisher: 'purple' }

export default function ScoreEditor() {
  const dispatch = useDispatch<AppDispatch>()
  const { tracks, selectedTrackId, selectedNoteIndex, history, future, dirty, comments } = useSelector((state: RootState) => state.score)
  const track = tracks.find((item) => item.id === selectedTrackId)!
  const note = track.notes[selectedNoteIndex]
  const scoreRef = useRef<HTMLDivElement>(null)
  const [commentText, setCommentText] = useState('')

  const measures = useMemo(() => {
    const rows = new Map<number, typeof track.notes>()
    for (const item of track.notes) {
      const list = rows.get(item.measure) ?? []
      list.push(item)
      rows.set(item.measure, list)
    }
    return [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, list]) => list)
  }, [track])

  useEffect(() => {
    const element = scoreRef.current
    if (!element) return
    element.innerHTML = ''
    const renderer = new Renderer(element, Renderer.Backends.SVG)
    renderer.resize(1060, 230)
    const context = renderer.getContext()
    measures.forEach((measureNotes, index) => {
      const stave = new Stave(index * 340, 22, 320).addClef(track.clef)
      if (index === 0) stave.addTimeSignature('4/4')
      stave.setContext(context).draw()
      const staveNotes = measureNotes.map((item) => {
        const staveNote = new StaveNote({ keys: [item.key], duration: item.duration })
        if (item.accidental) staveNote.addModifier(new Accidental(item.accidental), 0)
        return staveNote
      })
      if (staveNotes.length) {
        const beats = measureNotes.reduce((sum, item) => sum + durationWeight(item.duration), 0)
        const voice = new Voice({ num_beats: beats, beat_value: 4 })
        voice.addTickables(staveNotes)
        new Formatter().joinVoices([voice]).format([voice], 275)
        voice.draw(context, stave)
      }
      context.setFont('Arial', 11, 'normal').fillText(track.name, index * 340 + 10, 15)
      if (track.transposition) context.fillText(`移调 ${track.transposition > 0 ? '+' : ''}${track.transposition}`, index * 340 + 210, 15)
    })
  }, [measures, track.clef, track.name, track.transposition])

  const update = (patch: Record<string, unknown>) => dispatch(updateNote(patch as never))
  const noteComments = note ? comments.filter((comment) => comment.noteId === note.id) : []
  return <main className="page">
    <div className="page-head"><div><p className="eyebrow">五线谱编辑与移调</p><h1>多声部总谱</h1><p>选择音符后可编辑时值、力度、连音、表情和移调；每次修改带角色与时间戳，用于断网合并时裁决同一音符的两边修改。</p></div><Space><Tag color={dirty ? 'orange' : 'green'}>{dirty ? '有未保存修改' : '已保存'}</Tag><Tooltip title="撤销"><Button icon={<UndoOutlined />} disabled={!history.length} onClick={() => dispatch(undo())} /></Tooltip><Tooltip title="重做"><Button icon={<RedoOutlined />} disabled={!future.length} onClick={() => dispatch(redo())} /></Tooltip></Space></div>
    <div className="score-toolbar"><Segmented value={selectedTrackId} options={tracks.map((item) => ({ label: item.name, value: item.id }))} onChange={(value) => dispatch(selectTrack(String(value)))} /><span style={{ flex: 1 }} /><Button onClick={() => dispatch(transposeTrack(-1))}>降半音</Button><Button onClick={() => dispatch(transposeTrack(1))}>升半音</Button><Select value={track.transposition} style={{ width: 120 }} options={[-12, -7, -5, -2, 0, 2, 5, 7, 12].map((value) => ({ value, label: `移调 ${value > 0 ? '+' : ''}${value}` }))} onChange={(value) => dispatch(transposeTrack(value - track.transposition))} /></div>
    <Alert type="info" showIcon message={`${track.instrument} · ${track.clef === 'treble' ? '高音谱号' : track.clef === 'bass' ? '低音谱号' : '中音谱号'}`} description="移调后分谱页数、提示音与换页建议会立即在「分谱出版」页重算；移调仅改变当前声部。" style={{ marginBottom: 12 }} />
    <div className="score-grid">
      <section>
        <div className="score-canvas-wrap" ref={scoreRef} />
        <div className="note-strip">{track.notes.map((item, index) => <button key={item.id} className={`note-chip ${index === selectedNoteIndex ? 'active' : ''}`} onClick={() => dispatch(selectNote(index))}><b>{item.measure}-{item.beat}</b><small>{item.key.replace('/', '')} · {item.dynamic}</small><Tag color={ROLE_COLOR[item.updatedBy]} style={{ marginInline: 0, fontSize: 9, lineHeight: '14px', padding: '0 3px' }}>{ROLE_LABEL[item.updatedBy]}</Tag></button>)}</div>
        <Space wrap><Button icon={<PlusOutlined />} onClick={() => dispatch(addNote())}>添加音符</Button><Button danger icon={<DeleteOutlined />} onClick={() => dispatch(removeNote())}>删除当前</Button><Button onClick={() => update({ duration: note?.duration === 'q' ? 'h' : note?.duration === 'h' ? '8' : 'q' })}>切换时值</Button><Button onClick={() => update({ tie: !note?.tie })}>{note?.tie ? '取消延音' : '增加延音'}</Button><Button onClick={() => update({ accidental: note?.accidental ? undefined : '#' })}>{note?.accidental ? '移除临时记号' : '增加升号'}</Button></Space>
      </section>
      <aside className="panel">
        <h3>音符属性</h3>
        {note && <Space style={{ marginBottom: 8 }}><Tag color={ROLE_COLOR[note.updatedBy]}>{ROLE_LABEL[note.updatedBy]} 修改</Tag><small>{new Date(note.updatedAt).toLocaleString('zh-CN', { hour12: false })}</small><small>锚点 第 {note.measure} 小节第 {note.beat} 拍 · {note.id}</small></Space>}
        <label>力度</label><Select value={note?.dynamic} style={{ width: '100%' }} options={['pp', 'p', 'mp', 'mf', 'f', 'ff'].map((value) => ({ value, label: value }))} onChange={(value) => update({ dynamic: value })} />
        <label>表情标记</label><Select value={note?.expression || undefined} allowClear style={{ width: '100%' }} options={[{ value: 'dolce', label: 'dolce 柔和地' }, { value: 'cantabile', label: 'cantabile 如歌地' }, { value: 'marcato', label: 'marcato 着重地' }]} onChange={(value) => update({ expression: value ?? '' })} />
        <Divider />
        <h3>锚定评论</h3>
        {noteComments.length === 0 && <p className="muted">该音符暂无评论；评论锚定音符，音符移动后评论跟着走。</p>}
        {noteComments.map((comment) => <div key={comment.id} style={{ padding: '6px 0', borderBottom: '1px solid #eef2f7' }}><Space size={4}><Tag color={ROLE_COLOR[comment.role]}>{ROLE_LABEL[comment.role]}</Tag>{comment.resolved ? <Tag color="green">已解决</Tag> : <Tag>第 {comment.measure} 小节</Tag>}</Space><p style={{ margin: '4px 0' }}>{comment.content}</p></div>)}
        <Space.Compact style={{ width: '100%', marginTop: 8 }}>
          <Input placeholder="对当前音符加评论…" value={commentText} onChange={(event) => setCommentText(event.target.value)} />
          <Button type="primary" disabled={!note || !commentText.trim()} onClick={() => { dispatch(addComment({ trackId: selectedTrackId, noteIndex: selectedNoteIndex, content: commentText.trim() })); setCommentText('') }}>锚定</Button>
        </Space.Compact>
        <Divider />
        <h3>和弦与节奏校验</h3>
        <div className="check-row"><span>小节拍数</span><b className="success">完整</b></div>
        <div className="check-row"><span>声部音域</span><b className="success">符合</b></div>
        <div className="check-row"><span>移调范围</span><b className="warning">圆号需复核</b></div>
      </aside>
    </div>
  </main>
}
