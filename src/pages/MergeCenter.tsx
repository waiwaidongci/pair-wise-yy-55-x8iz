import { useMemo, useRef, useState } from 'react'
import {
  Alert, Button, Card, Col, Empty, Modal, Radio, Row, Space, Statistic, Table, Tag, Timeline, Typography, message,
} from 'antd'
import {
  CloudServerOutlined, DownloadOutlined, ExclamationCircleOutlined, FileSearchOutlined,
  ImportOutlined, ReloadOutlined, UploadOutlined,
} from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from '../store'
import {
  clearResolvedConflicts, dismissFailedMerge, importDraft, recordExport, resolveConflict, retryFailedMerge, setMyRole,
} from '../store'
import { ROLE_LABEL, type DraftPackage, type MergeConflict, type Role } from '../types'
import { fieldLabel } from '../collab/merge'
import { buildScratchPackage } from '../mock'

const ROLE_COLOR: Record<Role, string> = { composer: 'gold', conductor: 'blue', publisher: 'purple' }

function downloadPackage(pkg: DraftPackage) {
  const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `draft-${pkg.packageId}.json`
  link.click()
  URL.revokeObjectURL(url)
}

export default function MergeCenter() {
  const dispatch = useDispatch<AppDispatch>()
  const {
    myRole, tracks, pageTurns, comments, conflicts, failedMerge, mergeHistory, lastExport, baseVersionId,
  } = useSelector((state: RootState) => state.score)
  const [pendingRole, setPendingRole] = useState<Role>('conductor')
  const [messageApi, contextHolder] = message.useMessage()
  const fileRef = useRef<HTMLInputElement>(null)

  const openConflicts = conflicts.filter((item) => !item.resolved)

  const exportDraft = () => {
    const now = Date.now()
    const pkg: DraftPackage = {
      packageId: `PKG-${myRole}-${now}`,
      schemaVersion: 2,
      role: myRole,
      author: ROLE_LABEL[myRole],
      exportedAt: now,
      baseVersionId,
      tracks: structuredClone(tracks),
      comments: structuredClone(comments),
      pageTurns: structuredClone(pageTurns),
      baseTracks: structuredClone(tracks),
    }
    downloadPackage(pkg)
    dispatch(recordExport({ packageId: pkg.packageId, at: now }))
    messageApi.success(`已导出 ${ROLE_LABEL[myRole]} 的断网草稿包，可在网络恢复后交给他人合并`)
  }

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const raw = String(reader.result)
      dispatch(importDraft({ raw }))
    }
    reader.readAsText(file)
    return false
  }

  const importScratch = () => {
    const now = Date.now() + 60_000
    const pkg = buildScratchPackage(pendingRole, ROLE_LABEL[pendingRole], now)
    dispatch(importDraft({ raw: JSON.stringify(pkg) }))
    messageApi.info(`已模拟「${ROLE_LABEL[pendingRole]}」断网导出的草稿包并尝试合并`)
  }

  const importBroken = () => {
    dispatch(importDraft({ raw: '{"packageId":"PKG-broken","tracks":' }))
  }

  const conflictColumns = [
    {
      title: '类型', dataIndex: 'kind', width: 90, render: (kind: MergeConflict['kind']) => {
        const map = { note: '音符', transposition: '移调', comment: '评论', pageturn: '换页', structure: '删除' } as const
        return <Tag color="red">{map[kind]}</Tag>
      },
    },
    {
      title: '位置 / 字段', render: (_: unknown, row: MergeConflict) => (
        <div>
          <div>{row.trackId ?? '全局'}{row.measure ? ` · 第 ${row.measure} 小节` : ''}{row.noteId ? ` · ${row.noteId}` : ''}</div>
          <Space size={4} wrap>{row.fields.map((field) => <Tag key={field}>{fieldLabel(field)}</Tag>)}</Space>
        </div>
      ),
    },
    {
      title: '可出版值（保留）', render: (_: unknown, row: MergeConflict) => (
        <div><Tag color={ROLE_COLOR[row.kept.role]}>{ROLE_LABEL[row.kept.role]}</Tag>{row.kept.summary}<div><small>{new Date(row.kept.time).toLocaleString('zh-CN', { hour12: false })}</small></div></div>
      ),
    },
    {
      title: '另一版（冲突记录）', render: (_: unknown, row: MergeConflict) => (
        <div style={{ color: '#b45309' }}><Tag>{ROLE_LABEL[row.dropped.role]}</Tag>{row.dropped.summary}<div><small>{new Date(row.dropped.time).toLocaleString('zh-CN', { hour12: false })}</small></div></div>
      ),
    },
    {
      title: '操作', width: 230, render: (_: unknown, row: MergeConflict) => (
        <Space direction="vertical" size={4}>
          {row.resolved
            ? <Tag color="green">已按 {row.keptDeleted || row.droppedDeleted ? '删除' : '选定'} 值处理</Tag>
            : <>
              <Button size="small" type="primary" onClick={() => dispatch(resolveConflict({ conflictId: row.id, useDropped: false }))}>保留可出版值</Button>
              <Button size="small" onClick={() => {
                Modal.confirm({
                  title: '改用另一版？',
                  icon: <ExclamationCircleOutlined />,
                  content: `当前可出版值「${row.kept.summary}」会被替换为「${row.dropped.summary}」，原值仍保留在本冲突记录中，不会消失。`,
                  okText: '改用另一版',
                  cancelText: '取消',
                  onOk: () => dispatch(resolveConflict({ conflictId: row.id, useDropped: true })),
                })
              }}>改用另一版</Button>
            </>}
        </Space>
      ),
    },
  ]

  const stats = useMemo(() => mergeHistory.reduce((acc, item) => ({
    added: acc.added + item.stats.added, changed: acc.changed + item.stats.changed,
    removed: acc.removed + item.stats.removed, conflicts: acc.conflicts + item.stats.conflicts,
  }), { added: 0, changed: 0, removed: 0, conflicts: 0 }), [mergeHistory])

  return <main className="page">
    {contextHolder}
    <div className="page-head">
      <div>
        <p className="eyebrow">断网排练 · 草稿包合并</p>
        <h1>同步与冲突中心</h1>
        <p>指挥、作曲、出版各自断网改总谱与分谱；网络恢复后导入对方草稿包三方合并。同一音符两边改过时按角色、再按时间保留一个可出版值，另一版完整进入冲突记录。</p>
      </div>
      <Space>
        <Radio.Group value={myRole} onChange={(event) => dispatch(setMyRole(event.target.value as Role))}
          options={(Object.keys(ROLE_LABEL) as Role[]).map((role) => ({ value: role, label: `本端：${ROLE_LABEL[role]}` }))} optionType="button" />
      </Space>
    </div>

    {failedMerge && <Alert
      type="error" showIcon icon={<ExclamationCircleOutlined />} style={{ marginBottom: 16 }}
      message="合并失败：已保留原草稿包，当前总谱未改动"
      description={<Space direction="vertical" align="start">
        <span>原因：{failedMerge.reason} · 收到于 {new Date(failedMerge.receivedAt).toLocaleTimeString('zh-CN', { hour12: false })}</span>
        <Space>
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => dispatch(retryFailedMerge())}>用原包重试合并</Button>
          <Button onClick={() => { navigator.clipboard?.writeText(failedMerge.raw); messageApi.success('原包内容已复制，可排查后重试') }}>复制原包内容</Button>
          <Button danger type="text" onClick={() => dispatch(dismissFailedMerge())}>放弃此包</Button>
        </Space>
      </Space>}
    />}

    <Row gutter={[14, 14]}>
      <Col xs={24} md={12} xl={6}><Card><Statistic title="合并过的草稿包" value={mergeHistory.length} prefix={<CloudServerOutlined />} /></Card></Col>
      <Col xs={24} md={12} xl={6}><Card><Statistic title="采纳改动" value={stats.added + stats.changed + stats.removed} valueStyle={{ color: '#2563eb' }} suffix={`处 (+${stats.added} 改${stats.changed} 删${stats.removed})`} /></Card></Col>
      <Col xs={24} md={12} xl={6}><Card><Statistic title="未决冲突" value={openConflicts.length} valueStyle={{ color: openConflicts.length ? '#dc2626' : '#16a34a' }} suffix={`/ 共 ${conflicts.length}`} /></Card></Col>
      <Col xs={24} md={12} xl={6}><Card><Statistic title="上次导出" value={lastExport ? new Date(lastExport.at).toLocaleTimeString('zh-CN', { hour12: false }) : '—'} prefix={<DownloadOutlined />} /></Card></Col>
    </Row>

    <Row gutter={16} style={{ marginTop: 16 }}>
      <Col xs={24} xl={12}>
        <Card title={<span><DownloadOutlined /> 断网导出草稿包</span>} extra={<Tag color={ROLE_COLOR[myRole]}>{ROLE_LABEL[myRole]}</Tag>}>
          <p className="muted">把当前总谱、评论锚点与换页设置连同共同基线（{baseVersionId}）打成草稿包，排练结束网络恢复后交给其他人合并。</p>
          <Button type="primary" size="large" icon={<DownloadOutlined />} onClick={exportDraft} block>导出我的草稿包 (.json)</Button>
        </Card>
      </Col>
      <Col xs={24} xl={12}>
        <Card title={<span><ImportOutlined /> 导入对方草稿包合并</span>}>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) readFile(file); event.target.value = '' }} />
          <Space direction="vertical" style={{ width: '100%' }} size={10}>
            <Button size="large" icon={<UploadOutlined />} onClick={() => fileRef.current?.click()} block>选择草稿包文件合并</Button>
            <Card size="small" style={{ background: '#f8fafc' }}>
              <Space wrap>
                <Radio.Group value={pendingRole} onChange={(event) => setPendingRole(event.target.value as Role)}
                  options={(Object.keys(ROLE_LABEL) as Role[]).map((role) => ({ value: role, label: ROLE_LABEL[role] }))} optionType="button" size="small" />
                <Button size="small" icon={<FileSearchOutlined />} onClick={importScratch}>模拟对方断网草稿（含音符两边同改）</Button>
                <Button size="small" danger type="dashed" onClick={importBroken}>模拟损坏草稿包</Button>
              </Space>
              <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0', fontSize: 12 }}>
                演练：对方同时改了圆号第 2 小节力度与长笛表情；前者两边同改进冲突，后者自动采纳。损坏包用于验证“失败保留原包、可重试”。
              </Typography.Paragraph>
            </Card>
          </Space>
        </Card>
      </Col>
    </Row>

    <Card
      style={{ marginTop: 16 }}
      title={<span>冲突记录 {openConflicts.length > 0 && <Tag color="red">{openConflicts.length} 项待裁决</Tag>}</span>}
      extra={conflicts.length > 0 && <Button size="small" onClick={() => dispatch(clearResolvedConflicts())}>清除已处理记录</Button>}
    >
      {conflicts.length === 0
        ? <Empty description="还没有冲突。同一音符两边都改过时，落选的一版会完整记录在这里，绝不悄悄消失。" />
        : <Table rowKey="id" size="small" pagination={false} dataSource={conflicts} columns={conflictColumns} />}
    </Card>

    <Card style={{ marginTop: 16 }} title="合并流水">
      {mergeHistory.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="尚未合并过草稿包" /> : (
        <Timeline items={mergeHistory.map((record) => ({
          color: record.stats.conflicts ? 'red' : 'green',
          children: <Space wrap>
            <b>{new Date(record.time).toLocaleString('zh-CN', { hour12: false })}</b>
            <Tag color={ROLE_COLOR[record.role]}>{ROLE_LABEL[record.role]} · {record.author}</Tag>
            <span>草稿包 {record.packageId}</span>
            <Tag color="green">新增 {record.stats.added}</Tag>
            <Tag color="blue">修改 {record.stats.changed}</Tag>
            <Tag>删除 {record.stats.removed}</Tag>
            <Tag color={record.stats.conflicts ? 'red' : 'default'}>冲突 {record.stats.conflicts}</Tag>
          </Space>,
        }))} />
      )}
    </Card>
  </main>
}
