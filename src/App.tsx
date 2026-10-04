import { useEffect, useRef } from 'react'
import { Layout, Menu, Button, Tag, Space, Select, Badge, App as AntApp } from 'antd'
import { AudioOutlined, FileTextOutlined, HistoryOutlined, SaveOutlined, ExportOutlined, ImportOutlined } from '@ant-design/icons'
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import type { AppDispatch, RootState } from './store'
import { restoreDraft, saveVersion, setRole, importDraft } from './store'
import { ROLE_LABEL, exportDraftPackage, downloadPackage, readPackageFile } from './draft'
import type { Role } from './types'
import Overview from './pages/Overview'
import ScoreEditor from './pages/ScoreEditor'
import Parts from './pages/Parts'
import Versions from './pages/Versions'

export default function App() {
  const location = useLocation()
  const dispatch = useDispatch<AppDispatch>()
  const { message } = AntApp.useApp()
  const { dirty, role, conflicts, tracks, comments, versions } = useSelector((state: RootState) => state.score)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // 重开时从完整草稿继续（缺锚点的旧草稿自动升级）
  useEffect(() => {
    dispatch(restoreDraft())
  }, [dispatch])

  const unresolvedConflicts = conflicts.filter((item) => !item.resolved).length

  const handleExport = () => {
    const pkg = exportDraftPackage(tracks, comments, role, '当前用户', versions[0]?.id ?? 'v12')
    downloadPackage(pkg)
    message.success(`已导出${ROLE_LABEL[role]}草稿包，供对方恢复网络后合并`)
  }

  const handleImportFile = async (file: File) => {
    try {
      const raw = await readPackageFile(file)
      const pkg = raw as Parameters<typeof importDraft>[0]
      dispatch(importDraft(pkg))
      message.success('草稿包合并完成，冲突记录已保留')
    } catch (err) {
      message.error(err instanceof Error ? err.message : '草稿包读取失败')
    }
  }

  const items = [
    { key: '/', icon: <AudioOutlined />, label: <Link to="/">作品总览</Link> },
    { key: '/score', icon: <FileTextOutlined />, label: <Link to="/score">总谱编辑</Link> },
    { key: '/parts', icon: <FileTextOutlined />, label: <Link to="/parts">分谱出版</Link> },
    {
      key: '/versions',
      icon: <HistoryOutlined />,
      label: (
        <Link to="/versions">
          版本与评论
          {unresolvedConflicts > 0 && <Badge count={unresolvedConflicts} size="small" style={{ marginLeft: 8 }} />}
        </Link>
      ),
    },
  ]
  return (
    <Layout className="app-shell">
      <Layout.Sider width={224} style={{ background: '#0f172a', color: '#fff', minHeight: '100vh' }}>
        <div className="brand"><span className="brand-mark">谱</span><div><b>总谱出版台</b><small>SCORE PUBLISHING</small></div></div>
        <Menu theme="dark" mode="inline" selectedKeys={[location.pathname]} items={items} style={{ background: 'transparent', border: 0 }} />
        <div className="side-status"><b>《潮汐线》</b><small>总谱 12 小节 · 分谱 4 册</small></div>
      </Layout.Sider>
      <Layout>
        <Layout.Header className="top-header">
          <div><b>沈青 · 室内交响作品</b><Tag style={{ marginLeft: 10 }} color={dirty ? 'orange' : 'green'}>{dirty ? '未保存修改' : '版本 v12 已保存'}</Tag></div>
          <Space>
            <Select
              value={role}
              style={{ width: 130 }}
              onChange={(value: Role) => dispatch(setRole(value))}
              options={(Object.keys(ROLE_LABEL) as Role[]).map((value) => ({ value, label: `${ROLE_LABEL[value]}视角` }))}
            />
            <Button icon={<ExportOutlined />} onClick={handleExport}>导出草稿包</Button>
            <Button icon={<ImportOutlined />} onClick={() => fileInputRef.current?.click()}>导入草稿包</Button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              style={{ display: 'none' }}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void handleImportFile(file)
                event.target.value = ''
              }}
            />
            <Button>打印预览</Button>
            <Button type="primary" icon={<SaveOutlined />} onClick={() => dispatch(saveVersion())}>形成版本</Button>
          </Space>
        </Layout.Header>
        <Layout.Content><Routes><Route path="/" element={<Overview />} /><Route path="/score" element={<ScoreEditor />} /><Route path="/parts" element={<Parts />} /><Route path="/versions" element={<Versions />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></Layout.Content>
      </Layout>
    </Layout>
  )
}
