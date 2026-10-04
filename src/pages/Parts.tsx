import { useMemo, useState } from 'react'
import { Button, InputNumber, Select, Space, Switch, Tag, Alert, Statistic, Card, Row, Col } from 'antd'
import { PrinterOutlined, PlayCircleOutlined } from '@ant-design/icons'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { recomputePartLayout } from '../draft'

function playCue(pitch: string) {
  const match = pitch.match(/^([cdefgab]#?)(\d)$/)
  if (!match) return
  const audio = new AudioContext()
  const oscillator = audio.createOscillator()
  const gain = audio.createGain()
  const frequencies: Record<string, number> = {
    c: 261.63, 'c#': 277.18, d: 293.66, 'd#': 311.13, e: 329.63, f: 349.23,
    'f#': 369.99, g: 392.0, 'g#': 415.3, a: 440.0, 'a#': 466.16, b: 493.88,
  }
  const semitone = (Number(match[2]) - 4) * 12 + ({ c: 0, 'c#': 1, d: 2, 'd#': 3, e: 4, f: 5, 'f#': 6, g: 7, 'g#': 8, a: 9, 'a#': 10, b: 11 } as Record<string, number>)[match[1]!]!
  oscillator.frequency.value = (frequencies[match[1]!] ?? 440) * Math.pow(2, semitone / 12)
  oscillator.connect(gain).connect(audio.destination)
  gain.gain.setValueAtTime(0.2, audio.currentTime)
  oscillator.start()
  oscillator.stop(audio.currentTime + 0.35)
}

export default function Parts() {
  const tracks = useSelector((state: RootState) => state.score.tracks)
  const [trackId, setTrackId] = useState(tracks[0]!.id)
  const [cue, setCue] = useState(true)
  const [pageTurn, setPageTurn] = useState(2)
  const track = tracks.find((item) => item.id === trackId)!

  // 移调一变，分谱页数、提示音与换页建议全部重算
  const layout = useMemo(
    () => recomputePartLayout(track, tracks),
    [track, tracks],
  )

  return <main className="page">
    <div className="page-head no-print"><div><p className="eyebrow">分谱提取与出版排版</p><h1>演奏者分谱预览</h1><p>从总谱提取独立声部，移调后自动重算页数、提示音与换页建议。</p></div><Button type="primary" icon={<PrinterOutlined />} onClick={() => window.print()}>打印分谱</Button></div>
    <div className="panel no-print" style={{ marginBottom: 16 }}>
      <Space wrap>
        <Select value={trackId} style={{ width: 180 }} options={tracks.map((item) => ({ value: item.id, label: `${item.name} · ${item.instrument}` }))} onChange={setTrackId} />
        <span>换页前提示音：</span><InputNumber min={0} max={8} value={pageTurn} onChange={(value) => setPageTurn(value ?? 0)} /><span>小节</span>
        <Switch checked={cue} onChange={setCue} checkedChildren="显示提示音" unCheckedChildren="隐藏提示音" />
        <Tag color={track.transposition ? 'purple' : 'blue'}>{track.transposition ? `移调 ${track.transposition > 0 ? '+' : ''}${track.transposition}` : '不移调'}</Tag>
      </Space>
    </div>
    <Row gutter={[14, 14]} className="no-print" style={{ marginBottom: 16 }}>
      <Col xs={12} sm={6}><Card><Statistic title="分谱页数（移调后重算）" value={layout.pages} suffix="页" /></Card></Col>
      <Col xs={12} sm={6}><Card><Statistic title="每页小节数" value={layout.measuresPerPage} suffix="小节" /></Card></Col>
      <Col xs={12} sm={6}><Card><Statistic title="提示音数量" value={layout.cues.length} suffix="处" /></Card></Col>
      <Col xs={12} sm={6}><Card><Statistic title="换页建议" value={`第 ${layout.pageTurnMeasure} 小节前`} /></Card></Col>
    </Row>
    <Alert
      type="info"
      showIcon
      className="no-print"
      style={{ marginBottom: 16 }}
      message={`排版已于 ${new Date(layout.recomputedAt).toLocaleTimeString('zh-CN')} 重算`}
      description={`移调 ${track.transposition > 0 ? '+' : ''}${track.transposition} 半音：分谱共 ${layout.pages} 页，提示音 ${layout.cues.length} 处，建议在第 ${layout.pageTurnMeasure} 小节前换页。提示音音高已按本声部移调重算。`}
    />
    <article className="part-page">
      <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '2px solid #0f172a', paddingBottom: 10 }}><div><h1 style={{ margin: 0, fontFamily: 'serif' }}>{track.name}</h1><small>{track.instrument} · 移调后记谱分谱</small></div><div style={{ textAlign: 'right' }}><b>《潮汐线》</b><div>沈青 作品</div><div>出版稿 v12</div></div></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}><b>I. 潮起 · ♩ = 72</b><span>1</span></div>
      {[0, 1, 2].map((measureIndex) => {
        const cueAtMeasure = layout.cues.find((item) => item.measure === measureIndex + 1)
        return <div key={measureIndex}><div className="part-measure">{track.notes.slice(measureIndex * 4, measureIndex * 4 + 4).map((note, index) => <div key={note.id} className="part-note"><b>{note.key.replace('/', '')}</b><small style={{ display: 'block', color: '#64748b' }}>{note.dynamic}{note.tie ? ' ⁀' : ''}</small>{cue && index === 0 && measureIndex > 0 && cueAtMeasure && <em style={{ display: 'block', fontSize: 10, color: '#2563eb' }}>提示：{cueAtMeasure.partName} · {cueAtMeasure.pitch}</em>}</div>)}</div>{measureIndex === 1 && <div style={{ textAlign: 'right', color: '#64748b', fontSize: 12 }}>换页 → 建议在第 {layout.pageTurnMeasure} 小节前</div>}</div>
      })}
      {cue && layout.cues.length > 0 && <div className="no-print" style={{ marginTop: 12 }}><Space wrap>{layout.cues.map((item) => <Button key={item.measure} size="small" icon={<PlayCircleOutlined />} onClick={() => playCue(item.pitch)}>第 {item.measure} 小节提示音（{item.pitch}）</Button>)}</Space></div>}
      <div style={{ marginTop: 30, borderTop: '1px solid #94a3b8', paddingTop: 10, color: '#64748b', fontSize: 11 }}>© 2026 云谱出版社 · 仅限排练使用 · 禁止未授权复制</div>
    </article>
  </main>
}
