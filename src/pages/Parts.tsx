import { useMemo, useState } from 'react'
import { Alert, Button, InputNumber, Select, Space, Switch, Tag } from 'antd'
import { PrinterOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { selectPartLayout, setCueMeasures, setManualPageTurn } from '../store'
import { toWrittenPitch } from '../collab/pitch'
import type { ScoreNote } from '../types'

const MEASURE_COUNT = 4

export default function Parts() {
  const dispatch = useDispatch<AppDispatch>()
  const tracks = useSelector((state: RootState) => state.score.tracks)
  const [trackId, setTrackId] = useState(tracks[0]!.id)
  const [showCue, setShowCue] = useState(true)
  const track = tracks.find((item) => item.id === trackId)!
  const { pages, cueMeasures, autoCue, pageTurn } = useSelector((state: RootState) => selectPartLayout(state, trackId))

  const measures = useMemo(() => {
    const rows: ScoreNote[][] = []
    for (let measure = 1; measure <= MEASURE_COUNT; measure += 1) rows.push(track.notes.filter((note) => note.measure === measure))
    return rows
  }, [track])

  // 提示音取自下一声部，按本分谱移调量换算为记谱音高
  const cueTrack = tracks[(tracks.findIndex((item) => item.id === track.id) + 1) % tracks.length]!
  const cueForMeasure = (measure: number) => {
    const cueNote = cueTrack.notes.find((note) => note.measure === measure)
    return cueNote ? toWrittenPitch(cueNote.key, track.transposition).replace('/', '') : ''
  }

  return <main className="page">
    <div className="page-head no-print">
      <div>
        <p className="eyebrow">分谱提取与出版排版</p>
        <h1>演奏者分谱预览</h1>
        <p>移调一变，分谱页数与提示音立即重算；换页建议锚定音符位置，音符移动后建议跟着走。</p>
      </div>
      <Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>打印分谱</Button>
    </div>
    <div className="panel no-print" style={{ marginBottom: 16 }}>
      <Space wrap>
        <Select value={trackId} style={{ width: 200 }} options={tracks.map((item) => ({ value: item.id, label: `${item.name} · ${item.instrument}` }))} onChange={setTrackId} />
        <Tag color={track.transposition ? 'purple' : 'blue'}>{track.transposition ? `记谱移调 ${track.transposition > 0 ? '+' : ''}${track.transposition} 半音` : '不移调'}</Tag>
        <span>换页前提示音：</span>
        <InputNumber min={0} max={4} value={cueMeasures} onChange={(value) => dispatch(setCueMeasures({ trackId, cueMeasures: value ?? 0 }))} /><span>小节</span>
        <Switch checked={showCue} onChange={setShowCue} checkedChildren="显示提示音" unCheckedChildren="隐藏提示音" />
      </Space>
      <Alert
        style={{ marginTop: 12 }} type="info" showIcon
        message={`移调排版重算：共 ${pages} 页 · ${pageTurn.manual ? '手动' : '自动'}换页在第 ${pageTurn.measure} 小节前（锚点音符 ${pageTurn.anchorNoteId ?? '无'}）· 自动建议提示音 ${autoCue} 小节`}
        description={<>
          <span>可手动指定换页小节，设置仍锚定音符：</span>
          <Space style={{ marginLeft: 8 }}>
            {Array.from({ length: MEASURE_COUNT }, (_, index) => index + 2).map((measure) => (
              <Button key={measure} size="small" type={pageTurn.measure === measure ? 'primary' : 'default'}
                onClick={() => dispatch(setManualPageTurn({ trackId, measure }))}>第 {measure} 小节前</Button>
            ))}
          </Space>
        </>}
      />
    </div>
    <article className="part-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 10 }}>
        <div><h1 style={{ margin: 0, fontFamily: 'serif' }}>{track.name}</h1><small>{track.instrument} · 移调后记谱分谱 · 共 {pages} 页</small></div>
        <div style={{ textAlign: 'right' }}><b>《潮汐线》</b><div>沈青 作品</div><div>出版稿 v12</div></div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}><b>I. 潮起 · ♩ = 72</b><span>1</span></div>
      {measures.map((measureNotes, measureIndex) => {
        const measure = measureIndex + 1
        return <div key={measure}>
          <div className="part-measure">{measureNotes.map((note) => (
            <div key={note.id} className="part-note">
              <b>{note.key.replace('/', '')}</b>
              <small style={{ display: 'block', color: '#64748b' }}>{note.dynamic}{note.tie ? ' ⁀' : ''}{note.accidental ? ` ${note.accidental}` : ''}</small>
              {showCue && cueMeasures > 0 && measure >= pageTurn.measure - cueMeasures && measure < pageTurn.measure && (
                <em style={{ display: 'block', fontSize: 10, color: '#2563eb' }}>提示 {cueTrack.name}：{cueForMeasure(measure)}</em>
              )}
            </div>
          ))}</div>
          {measure === pageTurn.measure - 1 && <div style={{ textAlign: 'right', color: '#b45309', fontSize: 12 }}>换页 → 建议在第 {pageTurn.measure} 小节前 · 已保留 {cueMeasures} 小节{cueTrack.name}提示音</div>}
        </div>
      })}
      <div style={{ marginTop: 30, borderTop: '1px solid #94a3b8', paddingTop: 10, color: '#64748b', fontSize: 11 }}>© 2026 云谱出版社 · 仅限排练使用 · 禁止未授权复制</div>
    </article>
  </main>
}
