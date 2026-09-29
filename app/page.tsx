'use client';

import {
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleOff,
  Cloud,
  FolderKanban,
  HardDrive,
  Link2,
  LogOut,
  Milestone as MilestoneIcon,
  Pencil,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api, type StorageMode } from '@/lib/api';
import {
  emptyProject,
  emptyWeekly,
  type DataIndex,
  type Milestone,
  type Project,
  type ProjectRecord,
  type ProjectStatus,
  type ProjectUpdate,
  type RemoteFile,
  type SyncState,
  type WeeklyDailyEntry,
  type WeeklyRecord,
} from '@/lib/models';
import { RichTextEditor, sanitizeHtml } from '@/components/rich-text-editor';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const mondayOf = (date: Date) => {
  const result = new Date(date);
  const day = result.getDay() || 7;
  result.setDate(result.getDate() - day + 1);
  return isoDate(result);
};
const shiftDate = (value: string, days: number) => {
  const result = new Date(`${value}T12:00:00`);
  result.setDate(result.getDate() + days);
  return isoDate(result);
};
const now = () => new Date().toISOString();
const colors = ['#6d63ea', '#20a486', '#e68a3f', '#d14f73', '#3983cf'];
const statusMeta: Record<ProjectStatus, { label: string; className: string }> = {
  planning: { label: '规划中', className: 'planning' },
  active: { label: '进行中', className: 'active' },
  blocked: { label: '有阻塞', className: 'blocked' },
  done: { label: '已完成', className: 'done' },
};
const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
const draft = <T,>(key: string): T | null => {
  try {
    const value = localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : null;
  } catch {
    return null;
  }
};
const normalizeProject = (project: Project): Project => ({
  ...project,
  status: project.status || 'active',
  progress: Number.isFinite(project.progress) ? project.progress : 0,
});
const weekdayLabels = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
const normalizeWeekly = (record: WeeklyRecord, weekStart: string): WeeklyRecord => {
  const existing = record.dailyEntries || [];
  return {
    ...record,
    projectIds: record.projectIds || [],
    dailyEntries: Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(weekStart, index);
      return existing.find((item) => item.date === date) || {
        date,
        completed: '',
        progress: '',
        risks: '',
        nextPlan: '',
      };
    }),
  };
};
const hasDailyContent = (entry: WeeklyDailyEntry) =>
  Boolean(entry.completed.trim() || entry.progress.trim() || entry.risks.trim() || entry.nextPlan.trim());
const textToHtml = (value: string) =>
  value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('\n', '<br>');

function StorageChoice({ error, onSelect }: { error: string; onSelect: (mode: StorageMode) => void }) {
  const cloudReady = api.cloudConfigured();
  return <main className="login-screen"><section className="storage-choice-card">
    <div className="login-brand"><span className="brand-mark">迹</span><div><strong>工作留迹</strong><span>选择数据保存位置</span></div></div>
    <div className="login-copy"><h1>这次使用哪份数据？</h1><p>本机与云端相互独立，切换不会覆盖另一边的记录。</p></div>
    {error && <p className="form-error storage-error">{error}</p>}
    <div className="storage-options">
      <button onClick={() => onSelect('local')}><span className="storage-icon local"><HardDrive /></span><strong>保存到本机</strong><p>使用当前电脑的 .local-data，需要启动本地数据服务。</p><small>无需注册任何云端账号</small></button>
      <button disabled={!cloudReady} onClick={() => onSelect('cloud')}><span className="storage-icon cloud"><Cloud /></span><strong>保存到 Cloudflare</strong><p>使用 D1 云数据库，可在多台设备访问同一份数据。</p><small>{cloudReady ? '需要已部署的 Cloudflare 服务' : '部署并配置云端地址后可用'}</small></button>
    </div>
  </section></main>;
}

function Login({ mode, onLogin }: { mode: StorageMode; onLogin: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.login(username, password);
      onLogin(result.username);
    } catch {
      setError('用户名或密码错误，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-screen">
      <section className="login-card">
        <div className="login-brand">
          <span className="brand-mark">迹</span>
          <div><strong>工作留迹</strong><span>项目进展与周报</span></div>
        </div>
        <div className="login-copy"><h1>欢迎回来</h1><p>登录后继续记录项目与周报。</p></div>
        <form onSubmit={submit}>
          <label>用户名<input autoComplete="username" maxLength={80} onChange={(event) => setUsername(event.target.value)} required value={username} /></label>
          <label>密码<input autoComplete="current-password" maxLength={200} onChange={(event) => setPassword(event.target.value)} required type="password" value={password} /></label>
          {error && <p className="form-error">{error}</p>}
          <Button disabled={busy} size="lg" type="submit">{busy ? '正在验证…' : '登录'}</Button>
        </form>
        <div className="security-note">{mode === 'local' ? <HardDrive /> : <Cloud />}<span>账号由服务端安全验证<br />当前数据保存在{mode === 'local' ? '这台电脑' : ' Cloudflare D1'}</span></div>
      </section>
    </main>
  );
}

function AccountSetup({ mode, onReady }: { mode: StorageMode; onReady: (username: string) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (password.length < 10) return setError('密码至少需要 10 位');
    if (password !== confirmation) return setError('两次输入的密码不一致');
    setBusy(true);
    setError('');
    try {
      const result = await api.setup(username, password);
      onReady(result.username);
    } catch (setupError) {
      setError(setupError instanceof ApiError ? setupError.message : '设置失败，请确认服务已经启动');
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-screen">
      <section className="login-card setup-card">
        <div className="login-brand"><span className="brand-mark">迹</span><div><strong>工作留迹</strong><span>首次使用</span></div></div>
        <div className="login-copy"><span className="setup-badge">只需设置一次</span><h1>创建管理员账号</h1><p>直接在这里设置账号，以后打开网页登录即可。</p></div>
        <form onSubmit={submit}>
          <label>用户名<input autoComplete="username" maxLength={80} onChange={(event) => setUsername(event.target.value)} placeholder="例如：zh" required value={username} /></label>
          <label>设置密码<input autoComplete="new-password" maxLength={200} minLength={10} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 位" required type="password" value={password} /></label>
          <label>再次输入密码<input autoComplete="new-password" maxLength={200} minLength={10} onChange={(event) => setConfirmation(event.target.value)} required type="password" value={confirmation} /></label>
          {error && <p className="form-error">{error}</p>}
          <Button disabled={busy} size="lg" type="submit">{busy ? '正在创建…' : '创建账号并进入'}</Button>
        </form>
        <div className="security-note">{mode === 'local' ? <HardDrive /> : <Cloud />}<span>密码只保存强哈希，不保存明文<br />账号仅用于当前{mode === 'local' ? '本机数据' : ' Cloudflare 数据库'}</span></div>
      </section>
    </main>
  );
}

export default function Home() {
  const [storageMode, setStorageMode] = useState<'choose' | StorageMode>('choose');
  const [storageError, setStorageError] = useState('');
  const [auth, setAuth] = useState<'loading' | 'setup' | 'out' | 'in'>('loading');
  const [username, setUsername] = useState('');
  const [view, setView] = useState<'projects' | 'weekly'>('projects');
  const [indexFile, setIndexFile] = useState<RemoteFile<DataIndex>>({ data: { version: 1, projects: [] }, sha: null, path: 'data/index.json' });
  const [projectId, setProjectId] = useState('');
  const [projectFile, setProjectFile] = useState<RemoteFile<ProjectRecord> | null>(null);
  const [week, setWeek] = useState(mondayOf(new Date()));
  const [weekly, setWeekly] = useState<WeeklyRecord | null>(null);
  const [weeklySha, setWeeklySha] = useState<string | null>(null);
  const [dailyDate, setDailyDate] = useState(isoDate(new Date()));
  const [generateDialog, setGenerateDialog] = useState(false);
  const [newUpdate, setNewUpdate] = useState('');
  const [sync, setSync] = useState<SyncState>('已保存');
  const [message, setMessage] = useState('');
  const [projectDialog, setProjectDialog] = useState<'new' | 'rename' | 'delete' | null>(null);
  const [projectName, setProjectName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [linkedWeeks, setLinkedWeeks] = useState<RemoteFile<WeeklyRecord>[]>([]);
  const loadingRef = useRef(false);
  const project = indexFile.data.projects.find((item) => item.id === projectId);

  const loadIndex = useCallback(async () => {
    try {
      const file = await api.read<DataIndex>('data/index.json');
      const projects = file.data.projects.map(normalizeProject);
      setIndexFile({ ...file, data: { version: 1, projects } });
      setProjectId((current) => current || projects[0]?.id || '');
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 404) throw error;
      setIndexFile({ data: { version: 1, projects: [] }, sha: null, path: 'data/index.json' });
    }
  }, []);

  const connectStorage = (mode: StorageMode) => {
    api.setStorageMode(mode);
    setStorageMode(mode);
    setStorageError('');
    setAuth('loading');
    setIndexFile({ data: { version: 1, projects: [] }, sha: null, path: 'data/index.json' });
    setProjectId('');
    setProjectFile(null);
    setWeekly(null);
    api.session().then((session) => {
      if (session.needsSetup) setAuth('setup');
      else if (session.authenticated) {
        setAuth('in');
        setUsername(session.username || '');
        void loadIndex();
      } else setAuth('out');
    }).catch(() => {
      setStorageMode('choose');
      setStorageError(mode === 'local' ? '无法连接本机数据服务，请先运行 npm run worker:dev。' : '无法连接 Cloudflare 云端服务，请检查部署地址。');
    });
  };

  useEffect(() => {
    if (auth !== 'in') return;
    loadingRef.current = true;
    const run = async () => {
      try {
        if (view === 'projects') {
          if (!project) { setProjectFile(null); return; }
          const path = `data/projects/${project.id}.json`;
          const local = draft<ProjectRecord>(`${storageMode}:draft:${path}`);
          try {
            const file = await api.read<ProjectRecord>(path);
            setProjectFile({ ...file, data: local || { ...emptyProject(project), ...file.data, ...normalizeProject(file.data) } });
          } catch (error) {
            if (error instanceof ApiError && error.status === 404) setProjectFile({ path, sha: null, data: local || emptyProject(project) });
            else throw error;
          }
        } else {
          const path = `data/weekly/${week}.json`;
          const local = draft<WeeklyRecord>(`${storageMode}:draft:${path}`);
          try {
            const file = await api.read<WeeklyRecord>(path);
            setWeekly(normalizeWeekly(local || file.data, week));
            setWeeklySha(file.sha);
          } catch (error) {
            if (!(error instanceof ApiError) || error.status !== 404) throw error;
            let migrated: WeeklyRecord | null = null;
            for (const item of indexFile.data.projects) {
              try {
                const legacy = await api.read<WeeklyRecord & { projectId?: string }>(`data/weekly/${item.id}/${week}.json`);
                migrated = { ...legacy.data, projectIds: [legacy.data.projectId || item.id] };
                break;
              } catch (legacyError) {
                if (!(legacyError instanceof ApiError) || legacyError.status !== 404) throw legacyError;
              }
            }
            setWeekly(normalizeWeekly(local || migrated || emptyWeekly(week), week));
            setWeeklySha(null);
          }
        }
      } catch {
        setSync('同步失败');
        setMessage('读取数据失败，请检查服务状态');
      } finally {
        loadingRef.current = false;
      }
    };
    void run();
  }, [auth, view, projectId, project, week, indexFile.data.projects, storageMode]);

  useEffect(() => {
    if (loadingRef.current || auth !== 'in') return;
    const timer = window.setTimeout(() => {
      if (view === 'projects' && projectFile) localStorage.setItem(`${storageMode}:draft:${projectFile.path}`, JSON.stringify(projectFile.data));
      if (view === 'weekly' && weekly) localStorage.setItem(`${storageMode}:draft:data/weekly/${week}.json`, JSON.stringify(weekly));
      setSync('本地已保存');
    }, 700);
    setSync('未保存');
    return () => clearTimeout(timer);
  }, [auth, view, projectFile, weekly, week, storageMode]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (sync === '未保存' || sync === '本地已保存') event.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [sync]);

  const saveIndex = async (projects: Project[], commitMessage: string) => {
    const result = await api.write('data/index.json', { version: 1, projects }, indexFile.sha, commitMessage);
    setIndexFile({ data: { version: 1, projects }, sha: result.sha, path: 'data/index.json' });
  };

  const saveCurrent = async () => {
    setSync('正在同步');
    setMessage('');
    try {
      if (view === 'projects' && projectFile) {
        const data: ProjectRecord = {
          ...projectFile.data,
          summary: sanitizeHtml(projectFile.data.summary),
          updates: projectFile.data.updates.map((item) => ({ ...item, content: sanitizeHtml(item.content) })),
          updatedAt: now(),
        };
        const result = await api.write(projectFile.path, data, projectFile.sha, `更新项目：${data.name}`);
        setProjectFile({ ...projectFile, data, sha: result.sha });
        const projects = indexFile.data.projects.map((item) => item.id === data.id ? {
          ...item, name: data.name, status: data.status, progress: data.progress, updatedAt: data.updatedAt,
        } : item);
        await saveIndex(projects, `同步项目概览：${data.name}`);
        localStorage.removeItem(`${storageMode}:draft:${projectFile.path}`);
      }
      if (view === 'weekly' && weekly) {
        const path = `data/weekly/${week}.json`;
        const data: WeeklyRecord = {
          ...weekly,
          completed: sanitizeHtml(weekly.completed),
          progress: sanitizeHtml(weekly.progress),
          risks: sanitizeHtml(weekly.risks),
          nextPlan: sanitizeHtml(weekly.nextPlan),
          updatedAt: now(),
        };
        const result = await api.write(path, data, weeklySha, `${weeklySha ? '更新' : '新增'}周报：${week}`);
        setWeekly(data);
        setWeeklySha(result.sha);
        localStorage.removeItem(`${storageMode}:draft:${path}`);
      }
      setSync('已保存');
      setMessage('保存成功');
    } catch (error) {
      setSync(error instanceof ApiError && error.status === 409 ? '存在远程冲突' : '同步失败');
      setMessage(error instanceof ApiError && error.status === 409 ? '远程内容已变化，请刷新后再保存' : '保存失败，请检查服务状态');
    }
  };

  const confirmProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    try {
      if (projectDialog === 'new') {
        const item: Project = {
          id: crypto.randomUUID(), name, color: colors[indexFile.data.projects.length % colors.length],
          status: 'planning', progress: 0, createdAt: now(), updatedAt: now(),
        };
        await saveIndex([...indexFile.data.projects, item], `新增项目：${name}`);
        const record = emptyProject(item);
        const result = await api.write(`data/projects/${item.id}.json`, record, null, `初始化项目：${name}`);
        setProjectId(item.id);
        setProjectFile({ data: record, sha: result.sha, path: `data/projects/${item.id}.json` });
        setView('projects');
      } else if (projectDialog === 'rename' && project && projectFile) {
        const updated = { ...projectFile.data, name, updatedAt: now() };
        const result = await api.write(projectFile.path, updated, projectFile.sha, `重命名项目：${project.name} → ${name}`);
        await saveIndex(indexFile.data.projects.map((item) => item.id === project.id ? { ...item, name, updatedAt: updated.updatedAt } : item), `重命名项目：${project.name} → ${name}`);
        setProjectFile({ ...projectFile, data: updated, sha: result.sha });
      }
      setProjectDialog(null);
      setProjectName('');
    } catch {
      setMessage('项目操作失败，请重试');
    }
  };

  const prepareDelete = async () => {
    if (!project) return;
    const found: RemoteFile<WeeklyRecord>[] = [];
    try {
      const list = await api.list('data/weekly');
      const files = await Promise.all(list.items.map((item) => api.read<WeeklyRecord>(item.path)));
      found.push(...files.filter((file) => file.data.projectIds?.includes(project.id)));
    } catch { /* 空目录或旧服务版本不影响删除 */ }
    setLinkedWeeks(found);
    setDeleteConfirm('');
    setProjectDialog('delete');
  };

  const deleteProject = async () => {
    if (!project || deleteConfirm !== project.name) return;
    try {
      for (const file of linkedWeeks) {
        await api.write(file.path, { ...file.data, projectIds: file.data.projectIds.filter((id) => id !== project.id), updatedAt: now() }, file.sha, `解除周报与项目关联：${project.name}`);
      }
      if (projectFile?.sha) await api.remove(projectFile.path, projectFile.sha, `删除项目：${project.name}`);
      const projects = indexFile.data.projects.filter((item) => item.id !== project.id);
      await saveIndex(projects, `删除项目：${project.name}`);
      setProjectId(projects[0]?.id || '');
      setProjectDialog(null);
      setMessage('项目已删除，已有周报被保留并解除关联');
    } catch {
      setMessage('删除失败，请刷新后重试');
    }
  };

  const addMilestone = () => {
    if (!projectFile) return;
    const item: Milestone = { id: crypto.randomUUID(), title: '', dueDate: '', done: false, createdAt: now() };
    setProjectFile({ ...projectFile, data: { ...projectFile.data, milestones: [...projectFile.data.milestones, item] } });
  };
  const updateMilestone = (id: string, patch: Partial<Milestone>) => {
    if (!projectFile) return;
    setProjectFile({ ...projectFile, data: { ...projectFile.data, milestones: projectFile.data.milestones.map((item) => item.id === id ? { ...item, ...patch } : item) } });
  };
  const addUpdate = () => {
    if (!projectFile || !plainText(newUpdate)) return;
    const item: ProjectUpdate = { id: crypto.randomUUID(), date: isoDate(new Date()), content: sanitizeHtml(newUpdate), createdAt: now() };
    setProjectFile({ ...projectFile, data: { ...projectFile.data, updates: [item, ...projectFile.data.updates] } });
    setNewUpdate('');
  };

  const updateDailyEntry = (patch: Partial<WeeklyDailyEntry>) => {
    if (!weekly) return;
    const targetDate = weekly.dailyEntries.some((entry) => entry.date === dailyDate)
      ? dailyDate
      : weekly.dailyEntries[0]?.date;
    setWeekly({
      ...weekly,
      dailyEntries: weekly.dailyEntries.map((entry) =>
        entry.date === targetDate ? { ...entry, ...patch } : entry,
      ),
    });
  };

  const selectWeek = (nextWeek: string) => {
    const today = isoDate(new Date());
    setWeek(nextWeek);
    setDailyDate(today >= nextWeek && today <= shiftDate(nextWeek, 6) ? today : nextWeek);
  };

  const generateWeeklyReport = () => {
    if (!weekly) return;
    const sections: Array<keyof Pick<WeeklyDailyEntry, 'completed' | 'progress' | 'risks' | 'nextPlan'>> = [
      'completed', 'progress', 'risks', 'nextPlan',
    ];
    const generated = Object.fromEntries(sections.map((section) => [
      section,
      weekly.dailyEntries
        .filter((entry) => entry[section].trim())
        .map((entry) => {
          const index = Math.max(0, Math.min(6, Math.round((new Date(`${entry.date}T12:00:00`).getTime() - new Date(`${week}T12:00:00`).getTime()) / 86400000)));
          return `<p><strong>${entry.date.slice(5)} ${weekdayLabels[index]}</strong></p><p>${textToHtml(entry[section].trim())}</p>`;
        })
        .join(''),
    ])) as Pick<WeeklyRecord, 'completed' | 'progress' | 'risks' | 'nextPlan'>;
    setWeekly({ ...weekly, ...generated });
    setGenerateDialog(false);
    setMessage('已根据每日记录生成周报，你可以继续编辑');
  };

  const requestGenerate = () => {
    if (!weekly || !weekly.dailyEntries.some(hasDailyContent)) {
      setMessage('请先填写至少一天的每日记录');
      return;
    }
    const hasReport = [weekly.completed, weekly.progress, weekly.risks, weekly.nextPlan].some((value) => plainText(value));
    if (hasReport) setGenerateDialog(true);
    else generateWeeklyReport();
  };

  const statusIcon = sync === '同步失败' ? <WifiOff /> : sync === '存在远程冲突' ? <CircleOff /> : <CircleCheck />;
  const weekLabel = `${week} — ${shiftDate(week, 6)}`;
  const projectStats = useMemo(() => ({
    total: projectFile?.data.milestones.length || 0,
    done: projectFile?.data.milestones.filter((item) => item.done).length || 0,
  }), [projectFile]);
  const selectedDaily = weekly?.dailyEntries.find((entry) => entry.date === dailyDate) || weekly?.dailyEntries[0];
  const switchStorage = () => {
    if (sync === '未保存' || sync === '本地已保存') {
      setMessage('请先保存当前修改，再切换存储位置');
      return;
    }
    void api.logout().catch(() => undefined);
    setStorageMode('choose');
  };

  if (storageMode === 'choose') return <StorageChoice error={storageError} onSelect={connectStorage} />;
  if (auth === 'loading') return <main className="loading-screen"><span className="brand-mark">迹</span><p>正在连接{storageMode === 'local' ? '本机' : '云端'}工作空间…</p></main>;
  if (auth === 'setup') return <AccountSetup mode={storageMode} onReady={(name) => { setUsername(name); setAuth('in'); void loadIndex(); }} />;
  if (auth === 'out') return <Login mode={storageMode} onLogin={(name) => { setUsername(name); setAuth('in'); void loadIndex(); }} />;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">迹</span><div><strong>工作留迹</strong><span>项目进展与周报</span></div></div>
        <nav className="side-nav" aria-label="主要功能">
          <button className={view === 'projects' ? 'active' : ''} onClick={() => setView('projects')}><FolderKanban />项目</button>
          <button className={view === 'weekly' ? 'active' : ''} onClick={() => setView('weekly')}><CalendarDays />周报</button>
        </nav>
        <section className="project-block">
          <div className="nav-caption"><span>项目列表</span><button aria-label="新建项目" onClick={() => { setProjectName(''); setProjectDialog('new'); }}><Plus /></button></div>
          {indexFile.data.projects.map((item) => (
            <button className={`project-row ${projectId === item.id && view === 'projects' ? 'selected' : ''}`} key={item.id} onClick={() => { setProjectId(item.id); setView('projects'); }}>
              <i style={{ background: item.color }} /><span>{item.name}</span><small>{item.progress}%</small>
            </button>
          ))}
          {!indexFile.data.projects.length && <button className="project-row empty-row" onClick={() => setProjectDialog('new')}><Plus />创建第一个项目</button>}
        </section>
        <button className="storage-switch" onClick={switchStorage}><span>{storageMode === 'local' ? <HardDrive /> : <Cloud />}{storageMode === 'local' ? '本机存储' : 'Cloudflare 云端'}</span><small>切换</small></button>
        <footer className="sidebar-footer"><span className="avatar">{username.slice(0, 2).toUpperCase()}</span><div><strong>{username}</strong><span>管理员</span></div><button aria-label="退出登录" onClick={async () => { await api.logout(); setAuth('out'); }}><LogOut /></button></footer>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><span className="brand-mark">迹</span><strong>{view === 'projects' ? '项目' : '周报'}</strong></div>
          <div className="mobile-nav">
            <button aria-label="项目" className={view === 'projects' ? 'active' : ''} onClick={() => setView('projects')}><FolderKanban /></button>
            <button aria-label="周报" className={view === 'weekly' ? 'active' : ''} onClick={() => setView('weekly')}><CalendarDays /></button>
            <button aria-label="切换存储位置" onClick={switchStorage}>{storageMode === 'local' ? <HardDrive /> : <Cloud />}</button>
            {view === 'projects' && indexFile.data.projects.length > 0 && <select aria-label="选择项目" onChange={(event) => setProjectId(event.target.value)} value={projectId}>{indexFile.data.projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}
          </div>
          <label className="search-box"><Search /><input placeholder="搜索功能即将开放" disabled /></label>
          <div className={`sync-state state-${sync}`}>{statusIcon}<span>{sync}</span></div>
          <Button className="save-button" disabled={(view === 'projects' && !projectFile) || (view === 'weekly' && !weekly)} onClick={() => void saveCurrent()}><Save />保存</Button>
        </header>

        <div className="content-wrap">
          {message && <div className={`notice ${sync === '同步失败' || sync === '存在远程冲突' ? 'error' : 'success'}`}>{message}</div>}
          {view === 'projects' ? (
            <>
              <header className="page-heading">
                <div><div className="eyebrow"><span>项目</span><i />进度、节点与过程记录</div><h1>{project?.name || '项目管理'}</h1><p>{project ? '把项目事实沉淀在这里，再在周报中引用。' : '先创建项目，开始记录长期进展。'}</p></div>
                {project && <Button variant="outline" onClick={() => { setProjectName(project.name); setProjectDialog('rename'); }}><Pencil />项目设置</Button>}
              </header>
              {!projectFile ? (
                <section className="coming-panel"><FolderKanban /><h2>还没有项目</h2><p>项目用于记录整体状态、关键节点和每次进展。</p><Button onClick={() => setProjectDialog('new')}><Plus />新建项目</Button></section>
              ) : (
                <div className="project-dashboard">
                  <section className="project-overview">
                    <div className="metric-card"><span>项目状态</span><select className={`status-select ${statusMeta[projectFile.data.status].className}`} value={projectFile.data.status} onChange={(event) => setProjectFile({ ...projectFile, data: { ...projectFile.data, status: event.target.value as ProjectStatus } })}>{Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}</select></div>
                    <div className="metric-card"><span>整体进度</span><strong>{projectFile.data.progress}%</strong><Progress value={projectFile.data.progress} /><input aria-label="项目进度" max="100" min="0" onChange={(event) => setProjectFile({ ...projectFile, data: { ...projectFile.data, progress: Number(event.target.value) } })} type="range" value={projectFile.data.progress} /></div>
                    <div className="metric-card"><span>里程碑</span><strong>{projectStats.done} / {projectStats.total}</strong><small>已完成 / 全部节点</small></div>
                  </section>
                  <section className="editor-card"><div className="section-title"><div><h2>项目概述与当前进展</h2><p>记录目标、范围、当前阶段和重要背景。</p></div></div><RichTextEditor label="项目概述与当前进展" onChange={(summary) => setProjectFile({ ...projectFile, data: { ...projectFile.data, summary } })} value={projectFile.data.summary} /></section>
                  <section className="project-card">
                    <div className="section-title"><div><h2>关键节点</h2><p>用里程碑明确交付物和截止时间。</p></div><Button size="sm" variant="outline" onClick={addMilestone}><Plus />添加节点</Button></div>
                    <div className="milestone-list">
                      {projectFile.data.milestones.map((item) => <div className={`milestone-row ${item.done ? 'is-done' : ''}`} key={item.id}><button aria-label={item.done ? '标记为未完成' : '标记为完成'} className="milestone-check" onClick={() => updateMilestone(item.id, { done: !item.done })}>{item.done && <Check />}</button><input maxLength={120} onChange={(event) => updateMilestone(item.id, { title: event.target.value })} placeholder="节点名称" value={item.title} /><input aria-label="截止日期" onChange={(event) => updateMilestone(item.id, { dueDate: event.target.value })} type="date" value={item.dueDate} /><button aria-label="删除节点" className="icon-button danger" onClick={() => setProjectFile({ ...projectFile, data: { ...projectFile.data, milestones: projectFile.data.milestones.filter((entry) => entry.id !== item.id) } })}><Trash2 /></button></div>)}
                      {!projectFile.data.milestones.length && <div className="empty-inline"><MilestoneIcon /><span>暂无节点，添加第一个里程碑。</span></div>}
                    </div>
                  </section>
                  <section className="project-card">
                    <div className="section-title"><div><h2>进展记录</h2><p>按时间追加关键推进、决策和问题，不覆盖历史。</p></div></div>
                    <div className="update-composer"><RichTextEditor label="新增进展记录" onChange={setNewUpdate} value={newUpdate} /><Button disabled={!plainText(newUpdate)} onClick={addUpdate}><Plus />添加进展</Button></div>
                    <div className="timeline">{projectFile.data.updates.map((item) => <article key={item.id}><i /><div><time>{item.date}</time><p>{plainText(item.content)}</p></div><button aria-label="删除进展" className="icon-button danger" onClick={() => setProjectFile({ ...projectFile, data: { ...projectFile.data, updates: projectFile.data.updates.filter((entry) => entry.id !== item.id) } })}><Trash2 /></button></article>)}{!projectFile.data.updates.length && <div className="empty-inline">还没有进展记录。</div>}</div>
                  </section>
                </div>
              )}
            </>
          ) : (
            <>
              <header className="page-heading"><div><div className="eyebrow"><span>周报</span><i />按自然周独立归档</div><h1>工作周报</h1><p>{weekLabel} · 可关联多个项目</p></div><div className="week-controls"><Button aria-label="上一周" variant="outline" onClick={() => selectWeek(shiftDate(week, -7))}><ChevronLeft /></Button><Button variant="outline" onClick={() => selectWeek(mondayOf(new Date()))}>本周</Button><Button aria-label="下一周" variant="outline" onClick={() => selectWeek(shiftDate(week, 7))}><ChevronRight /></Button></div></header>
              {weekly && <div className="report-grid"><div className="report-main">
                <section className="project-card linked-projects"><div className="section-title"><div><h2>关联项目</h2><p>一份周报可以汇总多个项目，本项也可以留空。</p></div><Link2 /></div><div className="project-options">{indexFile.data.projects.map((item) => { const selected = weekly.projectIds.includes(item.id); return <button className={selected ? 'selected' : ''} key={item.id} onClick={() => setWeekly({ ...weekly, projectIds: selected ? weekly.projectIds.filter((id) => id !== item.id) : [...weekly.projectIds, item.id] })}><i style={{ background: item.color }} />{item.name}{selected && <Check />}</button>; })}{!indexFile.data.projects.length && <span className="empty-hint">暂无项目；周报仍可独立填写。</span>}</div></section>
                <section className="project-card daily-journal">
                  <div className="section-title"><div><h2>每日记录</h2><p>随手记录每天的工作，周末一键整理成周报。</p></div><Button disabled={!weekly.dailyEntries.some(hasDailyContent)} onClick={requestGenerate}><Sparkles />总结并生成周报</Button></div>
                  <div className="day-picker" role="tablist" aria-label="选择日期">{weekly.dailyEntries.map((entry, index) => <button aria-selected={selectedDaily?.date === entry.date} className={`${selectedDaily?.date === entry.date ? 'active' : ''} ${hasDailyContent(entry) ? 'has-content' : ''}`} key={entry.date} onClick={() => setDailyDate(entry.date)} role="tab"><span>{weekdayLabels[index]}</span><strong>{entry.date.slice(5)}</strong><i /></button>)}</div>
                  {selectedDaily && <div className="daily-fields">
                    <label htmlFor="daily-completed">完成事项<textarea id="daily-completed" maxLength={20000} onChange={(event) => updateDailyEntry({ completed: event.target.value })} placeholder="今天完成了什么？" value={selectedDaily.completed} /></label>
                    <label htmlFor="daily-progress">进展与结果<textarea id="daily-progress" maxLength={20000} onChange={(event) => updateDailyEntry({ progress: event.target.value })} placeholder="有什么阶段进展、数据或产出？" value={selectedDaily.progress} /></label>
                    <label htmlFor="daily-risks">问题与风险<textarea id="daily-risks" maxLength={20000} onChange={(event) => updateDailyEntry({ risks: event.target.value })} placeholder="遇到了什么问题？没有可留空。" value={selectedDaily.risks} /></label>
                    <label htmlFor="daily-next-plan">下一步<textarea id="daily-next-plan" maxLength={20000} onChange={(event) => updateDailyEntry({ nextPlan: event.target.value })} placeholder="接下来准备做什么？" value={selectedDaily.nextPlan} /></label>
                  </div>}
                </section>
                <div className="direct-report-divider"><span>直接填写或继续编辑周报</span></div>
                <section className="title-card"><label htmlFor="weekly-title">周报标题</label><input id="weekly-title" maxLength={120} onChange={(event) => setWeekly({ ...weekly, title: event.target.value })} placeholder="例如：第 39 周工作总结" value={weekly.title} /></section>
                <ReportEditor description="本周完成的具体事项和交付结果。" label="本周完成" onChange={(completed) => setWeekly({ ...weekly, completed })} value={weekly.completed} />
                <ReportEditor description="当前推进情况、关键数据和阶段变化。" label="项目进展" onChange={(progress) => setWeekly({ ...weekly, progress })} value={weekly.progress} />
                <ReportEditor description="需要关注的风险、阻塞与所需协助。" label="问题与风险" onChange={(risks) => setWeekly({ ...weekly, risks })} value={weekly.risks} />
                <ReportEditor description="下周计划和预期交付。" label="下周计划" onChange={(nextPlan) => setWeekly({ ...weekly, nextPlan })} value={weekly.nextPlan} />
              </div><aside className="report-aside"><section className="progress-card"><span className="card-kicker">本周计划完成度</span><div className="progress-value"><strong>{weekly.completion}%</strong><span>{weekly.completion >= 80 ? '进展顺利' : weekly.completion >= 50 ? '持续推进' : '需要关注'}</span></div><Progress value={weekly.completion} /><input aria-label="本周完成度" max="100" min="0" onChange={(event) => setWeekly({ ...weekly, completion: Number(event.target.value) })} type="range" value={weekly.completion} /></section><section className="meta-card"><div><span>归档周期</span><strong>{weekLabel}</strong></div><div><span>关联项目</span><strong>{weekly.projectIds.length} 个</strong></div><div><span>保存位置</span><strong>{storageMode === 'local' ? '本机 .local-data' : 'Cloudflare D1'}</strong></div></section></aside></div>}
            </>
          )}
        </div>
      </section>

      <Dialog onOpenChange={(open) => !open && setProjectDialog(null)} open={projectDialog === 'new' || projectDialog === 'rename'}><DialogContent><DialogHeader><DialogTitle>{projectDialog === 'new' ? '新建项目' : '项目设置'}</DialogTitle><DialogDescription>项目用于长期记录进度、关键节点和过程信息。</DialogDescription></DialogHeader><input className="dialog-input" maxLength={80} onChange={(event) => setProjectName(event.target.value)} placeholder="项目名称" value={projectName} /><DialogFooter>{projectDialog === 'rename' && <Button variant="destructive" onClick={() => void prepareDelete()}><Trash2 />删除项目</Button>}<Button variant="outline" onClick={() => setProjectDialog(null)}>取消</Button><Button disabled={!projectName.trim()} onClick={() => void confirmProject()}>保存</Button></DialogFooter></DialogContent></Dialog>
      <Dialog onOpenChange={(open) => !open && setProjectDialog(null)} open={projectDialog === 'delete'}><DialogContent><DialogHeader><DialogTitle>删除项目“{project?.name}”</DialogTitle><DialogDescription>项目详情、{projectFile?.data.milestones.length || 0} 个节点和 {projectFile?.data.updates.length || 0} 条进展将被删除。{linkedWeeks.length} 份关联周报会保留，只解除项目关联。请输入完整项目名称确认。</DialogDescription></DialogHeader><input className="dialog-input" onChange={(event) => setDeleteConfirm(event.target.value)} placeholder={project?.name} value={deleteConfirm} /><DialogFooter><Button variant="outline" onClick={() => setProjectDialog(null)}>取消</Button><Button disabled={deleteConfirm !== project?.name} variant="destructive" onClick={() => void deleteProject()}><Trash2 />永久删除项目</Button></DialogFooter></DialogContent></Dialog>
      <AlertDialog onOpenChange={setGenerateDialog} open={generateDialog}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>重新生成周报？</AlertDialogTitle><AlertDialogDescription>当前周报正文已有内容。继续后，“本周完成、项目进展、问题与风险、下周计划”会根据每日记录重新生成；标题、关联项目和每日记录不会改变。</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>保留当前内容</AlertDialogCancel><AlertDialogAction onClick={generateWeeklyReport}>重新生成</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
    </main>
  );
}

function ReportEditor({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (value: string) => void }) {
  return <section className="editor-card"><div className="section-title"><div><h2>{label}</h2><p>{description}</p></div></div><RichTextEditor label={label} onChange={onChange} value={value} /></section>;
}
