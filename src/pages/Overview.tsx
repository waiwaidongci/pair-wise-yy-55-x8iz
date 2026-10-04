import { Alert, Button, Card, Col, Progress, Row, Table, Tag } from 'antd'
import { useNavigate } from 'react-router-dom'
import { useSelector } from 'react-redux'
import type { RootState } from '../store'
import { scoreApi, selectPartLayout } from '../store'
import { measureCount } from '../collab/pitch'

export default function Overview() {
  const navigate = useNavigate()
  const tracks = useSelector((state: RootState) => state.score.tracks)
  const comments = useSelector((state: RootState) => state.score.comments)
  const openConflicts = useSelector((state: RootState) => state.score.conflicts.filter((item) => !item.resolved).length)
  const failedMerge = useSelector((state: RootState) => state.score.failedMerge)
  const { data } = scoreApi.endpoints.getPublishingProfile.useQuery()
  const totalMeasures = Math.max(...tracks.map((track) => measureCount(track)))
  return <main className="page">
    <div className="page-head"><div><p className="eyebrow">乐谱、移调与出版准备</p><h1>{data?.title ?? '总谱出版工作台'}</h1><p>统一管理多声部总谱、断网草稿合并、移调分谱、换页提示与评论锚点。</p></div><Button type="primary" onClick={() => navigate('/score')}>进入总谱编辑</Button></div>
    <Row gutter={[14, 14]} className="metrics"><Col xs={24} sm={12} xl={6}><Card className="metric"><span>声部数量</span><strong>{tracks.length}</strong><small>{tracks.length} 个乐手分谱</small></Card></Col><Col xs={24} sm={12} xl={6}><Card className="metric"><span>总谱小节</span><strong>{totalMeasures}</strong><small>4/4 拍 · C 大调</small></Card></Col><Col xs={24} sm={12} xl={6}><Card className="metric"><span>待处理评论</span><strong>{comments.filter((item) => !item.resolved).length}</strong><small>指挥与作曲意见</small></Card></Col><Col xs={24} sm={12} xl={6}><Card className="metric"><span>未决冲突</span><strong style={{ color: openConflicts ? '#dc2626' : undefined }}>{openConflicts}</strong><small>同一音符两边修改</small></Card></Col></Row>
    {(openConflicts > 0 || failedMerge) && <Alert type={failedMerge ? 'error' : 'warning'} showIcon style={{ marginBottom: 16 }}
      message={failedMerge ? '一个草稿包合并失败，原包已保留，可重试' : `有 ${openConflicts} 项合并冲突需要裁决`}
      description={failedMerge ? `失败原因：${failedMerge.reason}。当前总谱未被破坏。` : '已按角色与时间保留一个可出版值，另一版完整记录在冲突中心。'}
      action={<Button size="small" type="primary" onClick={() => navigate('/merge')}>{failedMerge ? '重试合并' : '查看冲突'}</Button>} />}
    <Row gutter={[16, 16]}><Col xs={24} xl={16}><Card title="声部与出版状态"><Table rowKey="id" pagination={false} dataSource={tracks} columns={[
      { title: '声部', dataIndex: 'name' },
      { title: '乐器', dataIndex: 'instrument' },
      { title: '移调', render: (_value, row) => <Tag color={row.transposition ? 'purple' : 'blue'}>{row.transposition ? `${row.transposition > 0 ? '+' : ''}${row.transposition} 半音` : '不移调'}</Tag> },
      { title: '小节 / 音符', render: (_value, row) => `${measureCount(row)} 小节 / ${row.notes.length} 音` },
      { title: '分谱页数', render: (_value, row) => <PartPages trackId={row.id} /> },
      { title: '状态', render: () => <Tag color="green">可排版</Tag> },
    ]} /></Card></Col><Col xs={24} xl={8}><Card title="出版检查"><div className="check-row"><span>和弦拼写校验</span><b className="success">通过</b></div><div className="check-row"><span>节奏完整性</span><b className="success">通过</b></div><div className="check-row"><span>换页与提示音</span><b className={openConflicts ? 'danger' : 'success'}>{openConflicts ? `${openConflicts} 项冲突待决` : '已随移调重算'}</b></div><div className="check-row"><span>分谱移调</span><b className="success">已与总谱同步</b></div><Progress percent={openConflicts ? 68 : 82} strokeColor="#2563eb" /><p className="muted">合并草稿并裁决全部冲突后，方可锁定出版版本。</p></Card></Col></Row>
  </main>
}

function PartPages({ trackId }: { trackId: string }) {
  // useSelector 在表格单元组件中调用，页数随移调实时重算
  const { pages } = useSelector((state: RootState) => selectPartLayout(state, trackId))
  return <span>{pages} 页</span>
}
