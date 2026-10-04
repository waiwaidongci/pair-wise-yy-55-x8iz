import { Card, Button, Tag, Tabs, Timeline, Alert, List, Typography, Space, App as AntApp } from 'antd'
import { CheckOutlined, CloseOutlined, CommentOutlined, MergeCellsOutlined, ReloadOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import { adoptConflict, clearMergeError, resolveComment, retryMerge } from '../store'
import { ROLE_LABEL, formatFieldValue } from '../draft'

const { Text } = Typography

export default function Versions() {
  const dispatch = useDispatch<AppDispatch>()
  const { message } = AntApp.useApp()
  const { versions, comments, conflicts, mergeError, pendingPackage } = useSelector((state: RootState) => state.score)
  const unresolvedComments = comments.filter((item) => !item.resolved)
  const unresolvedConflicts = conflicts.filter((item) => !item.resolved)

  const handleAdopt = (id: string, side: 'local' | 'incoming') => {
    dispatch(adoptConflict({ id, side }))
    message.success(side === 'local' ? '已采用本地可出版值' : '已采用对方草稿值')
  }

  return <main className="page">
    <div className="page-head"><div><p className="eyebrow">版本、评论与出版基线</p><h1>差异比较与审阅</h1><p>合并对方导出的草稿包时，同一音符的两边改动按角色和时间保留可出版值，另一版进入冲突记录，不悄悄消失。</p></div><Button type="primary">锁定出版基线</Button></div>
    {mergeError && (
      <Alert
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
        message="草稿包合并失败，原包已保留"
        description={<Space direction="vertical" size={4}><Text>{mergeError}</Text><Text type="secondary">原草稿包未被修改，可修正后重试；重开仍从完整草稿继续。{pendingPackage ? `（待合并包：${pendingPackage.author.name} · ${ROLE_LABEL[pendingPackage.author.role]}）` : ''}</Text></Space>}
        action={<Space><Button icon={<ReloadOutlined />} onClick={() => dispatch(retryMerge())} disabled={!pendingPackage}>重试合并</Button><Button onClick={() => dispatch(clearMergeError())}>保留原包</Button></Space>}
      />
    )}
    <Tabs items={[
      { key: 'conflicts', label: `合并冲突 (${unresolvedConflicts.length})`, children: <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .6fr', gap: 16 }}>
        <Card title="冲突记录：另一版改动未被丢弃">
          {conflicts.length === 0 && <Text type="secondary">暂无合并冲突。导入对方导出的草稿包后，同一音符被两边修改时会在此记录。</Text>}
          <List
            dataSource={conflicts}
            locale={{ emptyText: '暂无冲突记录' }}
            renderItem={(conflict) => (
              <List.Item
                actions={conflict.resolved
                  ? [<Tag key="done" color="green">已处理</Tag>]
                  : [
                      <Button key="local" size="small" type={conflict.winner === 'local' ? 'primary' : 'default'} onClick={() => handleAdopt(conflict.id, 'local')}>采用本地值</Button>,
                      <Button key="incoming" size="small" type={conflict.winner === 'incoming' ? 'primary' : 'default'} onClick={() => handleAdopt(conflict.id, 'incoming')}>采用对方值</Button>,
                    ]}
              >
                <List.Item.Meta
                  avatar={<MergeCellsOutlined style={{ fontSize: 18, color: conflict.resolved ? '#94a3b8' : '#d97706' }} />}
                  title={<Space wrap><Tag>第 {conflict.measure} 小节</Tag><Tag color="purple">{conflict.fieldLabel}</Tag>{conflict.resolved && <Tag color="green">已处理</Tag>}</Space>}
                  description={<Space direction="vertical" size={2}>
                    <Text type="secondary">基线：{formatFieldValue(conflict.field, conflict.baseValue) || '—'}</Text>
                    <Text>本地：{formatFieldValue(conflict.field, conflict.localValue)}</Text>
                    <Text>对方：{formatFieldValue(conflict.field, conflict.incomingValue)}</Text>
                    <Text type="secondary">保留：{conflict.winner === 'local' ? '本地' : '对方'}值（{ROLE_LABEL[conflict.winnerRole]}）· {conflict.reason}</Text>
                  </Space>}
                />
              </List.Item>
            )}
          />
        </Card>
        <Card title="合并规则">
          <Alert type="info" showIcon message="同一音符两边都改过时" description="按角色权重保留可出版值：出版 &gt; 作曲 &gt; 指挥；角色相同时以较晚修改时间为准。未被采用的一版进入左侧冲突记录，可随时改采另一版。" />
          <Alert style={{ marginTop: 12 }} type="warning" showIcon message="合并失败不丢稿" description="草稿包校验失败时保留原包与当前草稿，可重试；重开从本地完整草稿继续，锚点按小节与声部自动补回。" />
        </Card>
      </div> },
      { key: 'diff', label: '版本差异', children: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>{versions.slice(0, 2).map((version) => <Card key={version.id} title={<span>{version.id} · {version.author} <Tag>{version.time}</Tag></span>}><p>{version.summary}</p>{Object.entries(version.trackNotes).map(([trackId, notes]) => <div className="diff-row" key={trackId}><Tag color="red">修改</Tag><span>{trackId}：力度由 mp 调整为 p，增加第 3 拍延音线</span><b>{notes.length} 个音符</b></div>)}<div className="diff-row"><Tag color="green">新增</Tag><span>换页处增加同声部提示音</span><b>2 小节</b></div></Card>)}</div> },
      { key: 'comments', label: `评论锚点 (${unresolvedComments.length})`, children: <div style={{ display: 'grid', gridTemplateColumns: '1.3fr .7fr', gap: 16 }}><Card>{comments.map((comment) => <div key={comment.id} style={{ display: 'grid', gridTemplateColumns: '60px 1fr auto', gap: 12, padding: '14px 0', borderBottom: '1px solid #edf0f5' }}><Tag icon={<CommentOutlined />}>第 {comment.measure} 小节</Tag><div><b>{comment.author}</b><p>{comment.content}</p></div><div>{comment.resolved ? <Tag color="green">已解决</Tag> : <Button size="small" onClick={() => dispatch(resolveComment(comment.id))}>应用评论</Button>}</div></div>)}</Card><Card title="待决事项"><Alert type="warning" showIcon message="第 2 小节力度仍未统一" description="接受评论后会更新圆号分谱，但不会覆盖原始版本。" /><div style={{ display: 'flex', gap: 8, marginTop: 14 }}><Button type="primary" icon={<CheckOutlined />}>接受全部</Button><Button danger icon={<CloseOutlined />}>拒绝修改</Button></div></Card></div> },
      { key: 'timeline', label: '操作历史', children: <Card><Timeline items={[{ color: 'green', children: '16:28 沈青提交 v12：调整终段和声与连音线' }, { color: 'blue', children: '15:40 方亦修改圆号力度，生成本地草稿' }, { color: 'gray', children: '14:10 发布 v11：单簧管移调分谱' }]} /></Card> },
    ]} />
  </main>
}
