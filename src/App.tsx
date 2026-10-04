import { Layout, Menu, Button, Tag, Space, Badge } from 'antd'
import { AudioOutlined, FileTextOutlined, HistoryOutlined, SaveOutlined, CloudSyncOutlined } from '@ant-design/icons'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from './store'
import { ROLE_LABEL } from './types'
import { saveVersion } from './store'
import Overview from './pages/Overview'
import ScoreEditor from './pages/ScoreEditor'
import Parts from './pages/Parts'
import Versions from './pages/Versions'
import MergeCenter from './pages/MergeCenter'

export default function App() {
  const location = useLocation()
  const dispatch = useDispatch<AppDispatch>()
  const dirty = useSelector((state: RootState) => state.score.dirty)
  const myRole = useSelector((state: RootState) => state.score.myRole)
  const openConflicts = useSelector((state: RootState) => state.score.conflicts.filter((item) => !item.resolved).length)
  const failedMerge = useSelector((state: RootState) => state.score.failedMerge)
  const items = [
    { key: '/', icon: <AudioOutlined />, label: <Link to="/">作品总览</Link> },
    { key: '/score', icon: <FileTextOutlined />, label: <Link to="/score">总谱编辑</Link> },
    { key: '/parts', icon: <FileTextOutlined />, label: <Link to="/parts">分谱出版</Link> },
    { key: '/versions', icon: <HistoryOutlined />, label: <Link to="/versions">版本与评论</Link> },
    {
      key: '/merge',
      icon: <Badge count={openConflicts} size="small" offset={[6, -2]}><CloudSyncOutlined /></Badge>,
      label: <Link to="/merge">同步与冲突{failedMerge ? <Tag color="red" style={{ marginLeft: 6 }}>待重试</Tag> : null}</Link>,
    },
  ]
  return (
    <Layout className="app-shell">
      <Layout.Sider width={224} style={{ background: '#0f172a', color: '#fff', minHeight: '100vh' }}>
        <div className="brand"><span className="brand-mark">谱</span><div><b>总谱出版台</b><small>SCORE PUBLISHING</small></div></div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={items} style={{ background: 'transparent', border: 0 }} />
        <div className="side-status"><b>《潮汐线》</b><small>总谱 12 小节 · 分谱 4 册</small><small style={{ marginTop: 6 }}>本端角色：{ROLE_LABEL[myRole]}</small></div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className="top-header">
          <div><b>沈青 · 室内交响作品</b><Tag style={{ marginLeft: 10 }} color={dirty ? 'orange' : 'green'}>{dirty ? '有未合并草稿（重开后仍在）' : '版本 v12 已保存'}</Tag>{openConflicts > 0 && <Tag color="red">{openConflicts} 项冲突待裁决</Tag>}</div>
          <Space><Button>打印预览</Button><Button type="primary" icon={<SaveOutlined />} onClick={() => dispatch(saveVersion())}>形成版本</Button></Space>
        </Layout.Header>
        <Layout.Content><Routes><Route path="/" element={<Overview />} /><Route path="/score" element={<ScoreEditor />} /><Route path="/parts" element={<Parts />} /><Route path="/versions" element={<Versions />} /><Route path="/merge" element={<MergeCenter />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout.Content>
      </Layout>
    </Layout>
  )
}
