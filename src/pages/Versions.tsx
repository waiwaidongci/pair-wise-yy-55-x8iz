import { Card, Button, Tag, Tabs, Timeline, Alert, Space } from 'antd'
import { CheckOutlined, CloseOutlined, CommentOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { resolveComment } from '../store'
import { ROLE_LABEL, type Role } from '../types'

const ROLE_COLOR: Record<Role, string> = { composer: 'gold', conductor: 'blue', publisher: 'purple' }

export default function Versions() {
  const dispatch = useDispatch<AppDispatch>()
  const { versions, comments, conflicts, mergeHistory } = useSelector((state: RootState) => state.score)
  const openConflicts = conflicts.filter((item) => !item.resolved)
  return <main className="page">
    <div className="page-head"><div><p className="eyebrow">版本、评论与出版基线</p><h1>差异比较与审阅</h1><p>评论锚定具体声部与音符，音符位置变化后自动跟随；合并冲突可逐项裁决，落选版本不会被覆盖丢失。</p></div><Button type="primary">锁定出版基线</Button></div>
    {openConflicts.length > 0 && <Alert type="error" showIcon style={{ marginBottom: 16 }}
      message={`有 ${openConflicts.length} 项合并冲突待裁决`}
      description="同一音符两边都改过：当前已按角色/时间保留可出版值，另一版在冲突记录中完整保留。"
      action={<Link to="/merge"><Button size="small" type="primary">去冲突中心</Button></Link>} />}
    <Tabs items={[
      { key: 'diff', label: '版本差异', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16 }}>{versions.slice(0, 2).map((version) => <Card key={version.id} title={<span>{version.id} · {version.author} <Tag>{version.time}</Tag></span>}><p>{version.summary}</p>{Object.entries(version.trackNotes).map(([trackId, notes]) => <div className="diff-row" key={trackId}><Tag color="red">修改</Tag><span>{trackId}：力度由 mp 调整为 p，增加第 3 拍延音线</span><b>{notes.length} 个音符</b></div>)}<div className="diff-row"><Tag color="green">新增</Tag><span>换页处增加同声部提示音</span><b>2 小节</b></div></Card>)}</div> },
      { key: 'comments', label: `评论锚点 (${comments.filter((item) => !item.resolved).length})`, children: <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 16 }}><Card>{comments.map((comment) => <div key={comment.id} style={{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: 12, padding: '14px 0', borderBottom: '1px solid #edf0f5' }}><Space direction="vertical" size={2}><Tag icon={<CommentOutlined />}>{comment.trackId ?? '全局'} · 第 {comment.measure} 小节</Tag><Tag color={ROLE_COLOR[comment.role]}>{ROLE_LABEL[comment.role]}</Tag>{comment.noteId && <small style={{ color: '#94a3b8' }}>锚 {comment.noteId}</small>}</Space><div><b>{comment.author}</b><p>{comment.content}</p></div><div>{comment.resolved ? <Tag color="green">已解决</Tag> : <Button size="small" onClick={() => dispatch(resolveComment(comment.id))}>应用评论</Button>}</div></div>)}</Card><Card title="待决事项"><Alert type="warning" showIcon message="评论跟随音符" description="当音符被移动小节，评论的小节号会随锚点自动更新，不会错位。" /><div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Button type="primary" icon={<CheckOutlined />}>接受全部</Button><Button danger icon={<CloseOutlined />}>拒绝修改</Button></div></Card></div> },
      { key: 'timeline', label: '合并与操作历史', children: <Card><Timeline items={[
        ...mergeHistory.map((record) => ({ color: record.stats.conflicts ? 'red' : 'blue', children: <span>{new Date(record.time).toLocaleString('zh-CN', { hour12: false })} 合并 {ROLE_LABEL[record.role]} 草稿包 {record.packageId}：新增 {record.stats.added} · 修改 {record.stats.changed} · 冲突 {record.stats.conflicts}</span> })),
        { color: 'green', children: '16:28 沈青提交 v12：调整终段和声与连音线' },
        { color: 'blue', children: '15:40 方亦修改圆号力度，生成本地草稿' },
        { color: 'gray', children: '14:10 发布 v11：单簧管移调分谱' },
      ]} /></Card> },
    ]} />
  </main>
}
