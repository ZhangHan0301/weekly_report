'use client';

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleOff,
  Cloud,
  FileClock,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  Pin,
  Plus,
  Search,
  StickyNote,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import {
  emptyDaily,
  emptyWeekly,
  type DailyRecord,
  type DataIndex,
  type NoteRecord,
  type Project,
  type RemoteFile,
  type SyncState,
  type WeeklyRecord,
} from '@/lib/models';
import { RichTextEditor, sanitizeHtml } from '@/components/rich-text-editor';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const mondayOf = (date: Date) => {
  const d = new Date(date);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return isoDate(d);
};
const shiftDate = (value: string, days: number) => {
  const d = new Date(value + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return isoDate(d);
};
const plainText = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const now = () => new Date().toISOString();
const colors = ['#6d63ea', '#20a486', '#e68a3f', '#d14f73', '#3983cf'];

function Login({ onLogin }: { onLogin: (username: string) => void }) {
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
          <div>
            <strong>工作留迹</strong>
            <span>你的个人工作记录</span>
          </div>
        </div>
        <div className="login-copy">
          <h1>欢迎回来</h1>
          <p>登录后继续记录本周进展。</p>
        </div>
        <form onSubmit={submit}>
          <label>
            用户名
            <input
              autoComplete="username"
              maxLength={80}
              onChange={(e) => setUsername(e.target.value)}
              required
              value={username}
            />
          </label>
          <label>
            密码
            <input
              autoComplete="current-password"
              maxLength={200}
              onChange={(e) => setPassword(e.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <Button disabled={busy} size="lg" type="submit">
            {busy ? '正在验证…' : '登录'}
          </Button>
        </form>
        <div className="security-note">
          <Cloud />
          <span>
            数据保存在你的 GitHub 私有仓库
            <br />
            密码和访问令牌不会进入网页代码
          </span>
        </div>
      </section>
    </main>
  );
}

export default function Home() {
  const [auth, setAuth] = useState<'loading' | 'out' | 'in'>('loading');
  const [username, setUsername] = useState('');
  const [indexFile, setIndexFile] = useState<RemoteFile<DataIndex>>({
    data: { version: 1, projects: [] },
    sha: null,
    path: 'data/index.json',
  });
  const [projectId, setProjectId] = useState('');
  const [tab, setTab] = useState('weekly');
  const [date, setDate] = useState(isoDate(new Date()));
  const [week, setWeek] = useState(mondayOf(new Date()));
  const [weekly, setWeekly] = useState<WeeklyRecord | null>(null);
  const [weeklySha, setWeeklySha] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyRecord | null>(null);
  const [dailySha, setDailySha] = useState<string | null>(null);
  const [notes, setNotes] = useState<RemoteFile<NoteRecord>[]>([]);
  const [note, setNote] = useState<RemoteFile<NoteRecord> | null>(null);
  const [sync, setSync] = useState<SyncState>('本地已保存');
  const [message, setMessage] = useState('');
  const [projectDialog, setProjectDialog] = useState<
    'new' | 'rename' | 'delete' | null
  >(null);
  const [projectName, setProjectName] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteStats, setDeleteStats] = useState({
    weekly: 0,
    daily: 0,
    notes: 0,
  });
  const [deleteFiles, setDeleteFiles] = useState<
    { path: string; sha: string }[]
  >([]);
  const loadingRef = useRef(false);
  const project = indexFile.data.projects.find((p) => p.id === projectId);

  const loadIndex = useCallback(async () => {
    try {
      const file = await api.read<DataIndex>('data/index.json');
      setIndexFile(file);
      setProjectId((current) => current || file.data.projects[0]?.id || '');
    } catch (error) {
      if (error instanceof ApiError && error.status === 404)
        setIndexFile({
          data: { version: 1, projects: [] },
          sha: null,
          path: 'data/index.json',
        });
      else throw error;
    }
  }, []);
  useEffect(() => {
    api
      .session()
      .then((s) => {
        if (s.authenticated) {
          setAuth('in');
          setUsername(s.username || '');
          void loadIndex();
        } else setAuth('out');
      })
      .catch(() => setAuth('out'));
  }, [loadIndex]);

  useEffect(() => {
    if (!projectId || auth !== 'in') return;
    loadingRef.current = true;
    const run = async () => {
      try {
        if (tab === 'weekly') {
          const path = `data/weekly/${projectId}/${week}.json`;
          const draft = localStorage.getItem(`draft:${path}`);
          try {
            const file = await api.read<WeeklyRecord>(path);
            setWeekly(draft ? JSON.parse(draft) : file.data);
            setWeeklySha(file.sha);
          } catch (e) {
            if (e instanceof ApiError && e.status === 404)
              setWeekly(
                draft ? JSON.parse(draft) : emptyWeekly(projectId, week),
              );
            else throw e;
          }
        } else if (tab === 'daily') {
          const path = `data/daily/${projectId}/${date}.json`;
          const draft = localStorage.getItem(`draft:${path}`);
          try {
            const file = await api.read<DailyRecord>(path);
            setDaily(draft ? JSON.parse(draft) : file.data);
            setDailySha(file.sha);
          } catch (e) {
            if (e instanceof ApiError && e.status === 404)
              setDaily(draft ? JSON.parse(draft) : emptyDaily(projectId, date));
            else throw e;
          }
        } else {
          const result = await api.list(`data/notes/${projectId}`);
          const files = await Promise.all(
            result.items.map((item) => api.read<NoteRecord>(item.path)),
          );
          setNotes(
            files.sort(
              (a, b) =>
                Number(b.data.pinned) - Number(a.data.pinned) ||
                b.data.updatedAt.localeCompare(a.data.updatedAt),
            ),
          );
        }
      } catch {
        setSync('同步失败');
      } finally {
        loadingRef.current = false;
      }
    };
    void run();
  }, [auth, projectId, tab, date, week]);

  useEffect(() => {
    if (loadingRef.current || !projectId) return;
    const timer = window.setTimeout(() => {
      if (tab === 'weekly' && weekly)
        localStorage.setItem(
          `draft:data/weekly/${projectId}/${week}.json`,
          JSON.stringify(weekly),
        );
      if (tab === 'daily' && daily)
        localStorage.setItem(
          `draft:data/daily/${projectId}/${date}.json`,
          JSON.stringify(daily),
        );
      if (note)
        localStorage.setItem(`draft:${note.path}`, JSON.stringify(note.data));
      setSync('本地已保存');
    }, 700);
    setSync('未保存');
    return () => clearTimeout(timer);
  }, [weekly, daily, note, tab, projectId, week, date]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (sync === '未保存' || sync === '本地已保存') e.preventDefault();
    };
    addEventListener('beforeunload', warn);
    return () => removeEventListener('beforeunload', warn);
  }, [sync]);

  const saveCurrent = async () => {
    setSync('正在同步');
    setMessage('');
    try {
      if (tab === 'weekly' && weekly) {
        const path = `data/weekly/${projectId}/${week}.json`;
        const data = { ...weekly, updatedAt: now() };
        const result = await api.write(
          path,
          data,
          weeklySha,
          `${weeklySha ? '更新' : '新增'}周报：${project?.name} ${week}`,
        );
        setWeekly(data);
        setWeeklySha(result.sha);
        localStorage.removeItem(`draft:${path}`);
      } else if (tab === 'daily' && daily) {
        const path = `data/daily/${projectId}/${date}.json`;
        const data = { ...daily, updatedAt: now() };
        const result = await api.write(
          path,
          data,
          dailySha,
          `${dailySha ? '更新' : '新增'}日报：${project?.name} ${date}`,
        );
        setDaily(data);
        setDailySha(result.sha);
        localStorage.removeItem(`draft:${path}`);
      } else if (tab === 'notes' && note) {
        const data = { ...note.data, updatedAt: now() };
        const result = await api.write(
          note.path,
          data,
          note.sha,
          `${note.sha ? '更新' : '新增'}便签：${data.title}`,
        );
        setNote({ ...note, data, sha: result.sha });
        setNotes((items) => [
          ...items.filter((i) => i.data.id !== data.id),
          { ...note, data, sha: result.sha },
        ]);
        localStorage.removeItem(`draft:${note.path}`);
      }
      setSync('已同步到 GitHub');
      setMessage('保存成功');
    } catch (e) {
      setSync(
        e instanceof ApiError && e.status === 409 ? '存在远程冲突' : '同步失败',
      );
      setMessage(
        e instanceof ApiError && e.status === 409
          ? '远程内容已变化，请重新加载或另存副本'
          : '同步失败，请检查网络后重试',
      );
    }
  };

  const saveIndex = async (projects: Project[], messageText: string) => {
    const result = await api.write(
      'data/index.json',
      { version: 1, projects },
      indexFile.sha,
      messageText,
    );
    setIndexFile({
      data: { version: 1, projects },
      sha: result.sha,
      path: 'data/index.json',
    });
  };
  const confirmProject = async () => {
    const name = projectName.trim();
    if (!name) return;
    if (projectDialog === 'new') {
      const item: Project = {
        id: crypto.randomUUID(),
        name,
        color: colors[indexFile.data.projects.length % colors.length],
        createdAt: now(),
        updatedAt: now(),
      };
      await saveIndex([...indexFile.data.projects, item], `新增项目：${name}`);
      setProjectId(item.id);
    }
    if (projectDialog === 'rename' && project) {
      await saveIndex(
        indexFile.data.projects.map((p) =>
          p.id === project.id ? { ...p, name, updatedAt: now() } : p,
        ),
        `重命名项目：${project.name} → ${name}`,
      );
    }
    setProjectDialog(null);
    setProjectName('');
  };
  const prepareDelete = async () => {
    if (!project) return;
    const [weeklyFiles, dailyFiles, noteFiles] = await Promise.all(
      ['weekly', 'daily', 'notes'].map((kind) =>
        api
          .list(`data/${kind}/${project.id}`)
          .then((r) => r.items)
          .catch(() => []),
      ),
    );
    setDeleteStats({
      weekly: weeklyFiles.length,
      daily: dailyFiles.length,
      notes: noteFiles.length,
    });
    setDeleteFiles([...weeklyFiles, ...dailyFiles, ...noteFiles]);
    setDeleteConfirm('');
    setProjectDialog('delete');
  };
  const exportBackup = async () => {
    if (!project) return;
    const records = await Promise.all(
      deleteFiles.map((file) =>
        api
          .read<unknown>(file.path)
          .then((r) => ({ path: file.path, data: r.data })),
      ),
    );
    const blob = new Blob(
      [JSON.stringify({ exportedAt: now(), project, records }, null, 2)],
      { type: 'application/json' },
    );
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${project.name}-备份-${isoDate(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const deleteProject = async () => {
    if (!project || deleteConfirm !== project.name) return;
    for (const file of deleteFiles)
      await api.remove(file.path, file.sha, `删除项目数据：${project.name}`);
    const projects = indexFile.data.projects.filter((p) => p.id !== project.id);
    await saveIndex(projects, `删除项目：${project.name}`);
    setProjectId(projects[0]?.id || '');
    setProjectDialog(null);
  };

  const logout = async () => {
    await api.logout();
    setAuth('out');
  };
  const statusIcon =
    sync === '同步失败' ? (
      <WifiOff />
    ) : sync === '存在远程冲突' ? (
      <CircleOff />
    ) : (
      <CircleCheck />
    );
  const rangeLabel = tab === 'weekly' ? week : date;
  const noteCards = useMemo(
    () =>
      notes.map((item) => (
        <button
          className="note-card"
          key={item.data.id}
          onClick={() => setNote(item)}
          type="button"
        >
          {item.data.pinned && <Pin />}
          <strong>{item.data.title || '无标题便签'}</strong>
          <p>{plainText(item.data.content) || '空便签'}</p>
          <span>
            {new Date(item.data.updatedAt).toLocaleDateString('zh-CN')}
          </span>
        </button>
      )),
    [notes],
  );

  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: unknown,
            options?: { signal: AbortSignal },
          ) => void;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    context.registerTool(
      {
        name: 'save_work_record',
        title: '保存当前工作记录',
        description: '将当前打开的周报、日报或便签同步到 GitHub。',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
        annotations: { readOnlyHint: false, untrustedContentHint: false },
        execute: async () => {
          await saveCurrent();
          return { status: 'saved', type: tab, project: project?.name };
        },
      },
      { signal: controller.signal },
    );
    return () => controller.abort();
  });

  if (auth === 'loading')
    return (
      <main className="loading-screen">
        <span className="brand-mark">迹</span>
        <p>正在打开工作台…</p>
      </main>
    );
  if (auth === 'out')
    return (
      <Login
        onLogin={(name) => {
          setUsername(name);
          setAuth('in');
          void loadIndex();
        }}
      />
    );
  if (!project)
    return (
      <main className="empty-project">
        <span className="brand-mark">迹</span>
        <h1>开始记录第一项工作</h1>
        <p>先创建一个项目，周报、日报和便签都会归档在项目下。</p>
        <Button
          onClick={() => {
            setProjectName('');
            setProjectDialog('new');
          }}
        >
          <Plus />
          新建项目
        </Button>
        <ProjectDialog
          mode={projectDialog}
          name={projectName}
          setName={setProjectName}
          close={() => setProjectDialog(null)}
          confirm={confirmProject}
        />
      </main>
    );

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">迹</span>
          <div>
            <strong>工作留迹</strong>
            <span>个人工作台</span>
          </div>
        </div>
        <button className="project-switcher" type="button">
          <span>
            <i style={{ background: project.color }} />
            {project.name}
          </span>
        </button>
        <nav className="side-nav" aria-label="主导航">
          <button
            className={tab === 'weekly' ? 'active' : ''}
            onClick={() => setTab('weekly')}
          >
            <NotebookPen />
            工作周报
          </button>
          <button
            className={tab === 'daily' ? 'active' : ''}
            onClick={() => setTab('daily')}
          >
            <CalendarDays />
            每日记录
          </button>
          <button
            className={tab === 'notes' ? 'active' : ''}
            onClick={() => setTab('notes')}
          >
            <StickyNote />
            项目便签 <span className="count">{notes.length}</span>
          </button>
          <button>
            <FileClock />
            历史归档
          </button>
        </nav>
        <div className="project-block">
          <div className="nav-caption">
            <span>我的项目</span>
            <button
              aria-label="新建项目"
              onClick={() => {
                setProjectName('');
                setProjectDialog('new');
              }}
            >
              <Plus />
            </button>
          </div>
          {indexFile.data.projects.map((p) => (
            <button
              className={
                p.id === projectId ? 'project-row selected' : 'project-row'
              }
              key={p.id}
              onClick={() => setProjectId(p.id)}
            >
              <i style={{ background: p.color }} />
              {p.name}
              {p.id === projectId && (
                <MoreHorizontal
                  onClick={(e) => {
                    e.stopPropagation();
                    setProjectName(p.name);
                    setProjectDialog('rename');
                  }}
                />
              )}
            </button>
          ))}
        </div>
        <div className="sidebar-footer">
          <div className="avatar">{username.slice(0, 2).toUpperCase()}</div>
          <div>
            <strong>{username}</strong>
            <span>GitHub 私有仓库</span>
          </div>
          <button aria-label="退出登录" onClick={logout}>
            <LogOut />
          </button>
        </div>
      </aside>
      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand">
            <span className="brand-mark">迹</span>
            <strong>工作留迹</strong>
          </div>
          <label className="search-box">
            <Search />
            <input aria-label="搜索记录" placeholder="搜索记录…" />
          </label>
          <div className={`sync-state state-${sync}`}>
            {statusIcon}
            {sync}
          </div>
          <Button
            className="save-button"
            disabled={sync === '正在同步'}
            onClick={saveCurrent}
            size="lg"
          >
            <Cloud />
            保存并同步
          </Button>
        </header>
        <div className="content-wrap">
          {message && (
            <div
              className={
                sync === '已同步到 GitHub' ? 'notice success' : 'notice error'
              }
            >
              {message}
            </div>
          )}
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                <span>{project.name}</span>
                <i />
                {rangeLabel}
              </div>
              <h1>
                {tab === 'weekly'
                  ? '工作周报'
                  : tab === 'daily'
                    ? '每日记录'
                    : '项目便签'}
              </h1>
              <p>
                {tab === 'weekly'
                  ? '周一至周日，自然周归档'
                  : tab === 'daily'
                    ? '当天工作会独立保存'
                    : '置顶重要事项，随时补充想法'}
              </p>
            </div>
            {tab !== 'notes' && (
              <div className="week-controls">
                <Button
                  aria-label="上一期"
                  onClick={() =>
                    tab === 'weekly'
                      ? setWeek(shiftDate(week, -7))
                      : setDate(shiftDate(date, -1))
                  }
                  size="icon-lg"
                  variant="outline"
                >
                  <ChevronLeft />
                </Button>
                <Button
                  onClick={() =>
                    tab === 'weekly'
                      ? setWeek(mondayOf(new Date()))
                      : setDate(isoDate(new Date()))
                  }
                  variant="outline"
                >
                  <CalendarDays />
                  {tab === 'weekly' ? '本周' : '今天'}
                </Button>
                <Button
                  aria-label="下一期"
                  onClick={() =>
                    tab === 'weekly'
                      ? setWeek(shiftDate(week, 7))
                      : setDate(shiftDate(date, 1))
                  }
                  size="icon-lg"
                  variant="outline"
                >
                  <ChevronRight />
                </Button>
              </div>
            )}
            {tab === 'notes' && (
              <Button
                onClick={() => {
                  const id = crypto.randomUUID();
                  setNote({
                    path: `data/notes/${projectId}/${id}.json`,
                    sha: null,
                    data: {
                      id,
                      projectId,
                      title: '',
                      content: '',
                      pinned: false,
                      createdAt: now(),
                      updatedAt: now(),
                    },
                  });
                }}
              >
                <Plus />
                新建便签
              </Button>
            )}
          </div>
          <Tabs className="record-tabs" onValueChange={setTab} value={tab}>
            <TabsList variant="line">
              <TabsTrigger value="weekly">周报</TabsTrigger>
              <TabsTrigger value="daily">日报</TabsTrigger>
              <TabsTrigger value="notes">便签</TabsTrigger>
            </TabsList>
            <TabsContent value="weekly">
              {weekly && (
                <div className="report-grid">
                  <div className="report-main">
                    <section className="title-card">
                      <label htmlFor="weekly-title">周报标题</label>
                      <input
                        id="weekly-title"
                        maxLength={120}
                        onChange={(e) =>
                          setWeekly({ ...weekly, title: e.target.value })
                        }
                        placeholder="例如：局部规划与动态避障优化"
                        value={weekly.title}
                      />
                    </section>
                    <RichTextEditor
                      label="本周完成"
                      hint="不会自动添加编号"
                      value={weekly.completed}
                      onChange={(v) => setWeekly({ ...weekly, completed: v })}
                    />
                    <RichTextEditor
                      label="进展与成果"
                      value={weekly.progress}
                      onChange={(v) => setWeekly({ ...weekly, progress: v })}
                    />
                    <RichTextEditor
                      label="问题与风险"
                      value={weekly.risks}
                      onChange={(v) => setWeekly({ ...weekly, risks: v })}
                    />
                    <RichTextEditor
                      label="下周计划"
                      value={weekly.nextPlan}
                      onChange={(v) => setWeekly({ ...weekly, nextPlan: v })}
                    />
                  </div>
                  <aside className="report-aside">
                    <section className="progress-card">
                      <div className="card-kicker">本周完成度</div>
                      <div className="progress-value">
                        <strong>{weekly.completion}%</strong>
                        <span>
                          {weekly.completion >= 80
                            ? '接近完成'
                            : weekly.completion >= 50
                              ? '进展顺利'
                              : '持续推进'}
                        </span>
                      </div>
                      <Progress value={weekly.completion} />
                      <input
                        aria-label="完成度"
                        max="100"
                        min="0"
                        onChange={(e) =>
                          setWeekly({
                            ...weekly,
                            completion: Number(e.target.value),
                          })
                        }
                        type="range"
                        value={weekly.completion}
                      />
                    </section>
                    <RecordActions
                      onDelete={async () => {
                        if (weeklySha) {
                          await api.remove(
                            `data/weekly/${projectId}/${week}.json`,
                            weeklySha,
                            `删除周报：${project.name} ${week}`,
                          );
                          setWeekly(emptyWeekly(projectId, week));
                          setWeeklySha(null);
                        }
                      }}
                    />
                  </aside>
                </div>
              )}
            </TabsContent>
            <TabsContent value="daily">
              {daily && (
                <div className="report-grid">
                  <div className="report-main">
                    <RichTextEditor
                      label="今日完成"
                      value={daily.completed}
                      onChange={(v) => setDaily({ ...daily, completed: v })}
                    />
                    <RichTextEditor
                      label="问题与发现"
                      value={daily.findings}
                      onChange={(v) => setDaily({ ...daily, findings: v })}
                    />
                    <RichTextEditor
                      label="明日计划"
                      value={daily.tomorrow}
                      onChange={(v) => setDaily({ ...daily, tomorrow: v })}
                    />
                    <RichTextEditor
                      label="补充记录"
                      value={daily.extra}
                      onChange={(v) => setDaily({ ...daily, extra: v })}
                    />
                  </div>
                  <aside className="report-aside">
                    <RecordActions
                      onDelete={async () => {
                        if (dailySha) {
                          await api.remove(
                            `data/daily/${projectId}/${date}.json`,
                            dailySha,
                            `删除日报：${project.name} ${date}`,
                          );
                          setDaily(emptyDaily(projectId, date));
                          setDailySha(null);
                        }
                      }}
                    />
                  </aside>
                </div>
              )}
            </TabsContent>
            <TabsContent value="notes">
              <div className="notes-grid">
                {noteCards}
                {notes.length === 0 && (
                  <div className="notes-empty">
                    <StickyNote />
                    <h2>还没有便签</h2>
                    <p>把临时想法、问题和提醒留在这里。</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </section>
      <Dialog
        onOpenChange={(open) => !open && setNote(null)}
        open={Boolean(note)}
      >
        <DialogContent className="note-dialog">
          {note && (
            <>
              <DialogHeader>
                <DialogTitle>编辑便签</DialogTitle>
                <DialogDescription>正文会先保存为本地草稿。</DialogDescription>
              </DialogHeader>
              <input
                className="dialog-input"
                maxLength={120}
                onChange={(e) =>
                  setNote({
                    ...note,
                    data: { ...note.data, title: e.target.value },
                  })
                }
                placeholder="便签标题"
                value={note.data.title}
              />
              <label className="pin-field">
                <input
                  checked={note.data.pinned}
                  onChange={(e) =>
                    setNote({
                      ...note,
                      data: { ...note.data, pinned: e.target.checked },
                    })
                  }
                  type="checkbox"
                />
                置顶便签
              </label>
              <RichTextEditor
                label="正文"
                value={note.data.content}
                onChange={(v) =>
                  setNote({
                    ...note,
                    data: { ...note.data, content: sanitizeHtml(v) },
                  })
                }
              />
              <DialogFooter>
                <Button
                      variant="destructive"
                      onClick={async () => {
                        if (!confirm(`确定删除便签“${note.data.title || '无标题便签'}”吗？`)) return;
                        if (note.sha)
                          await api.remove(
                        note.path,
                        note.sha,
                        `删除便签：${note.data.title}`,
                      );
                    setNotes((items) =>
                      items.filter((i) => i.data.id !== note.data.id),
                    );
                    setNote(null);
                  }}
                >
                  <Trash2 />
                  删除
                </Button>
                <Button onClick={saveCurrent}>
                  <Cloud />
                  保存并同步
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      <ProjectDialog
        mode={projectDialog}
        name={projectName}
        setName={setProjectName}
        close={() => setProjectDialog(null)}
        confirm={confirmProject}
        onDelete={prepareDelete}
      />
      <Dialog
        onOpenChange={(open) => !open && setProjectDialog(null)}
        open={projectDialog === 'delete'}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除项目“{project.name}”</DialogTitle>
            <DialogDescription>
              将删除 {deleteStats.weekly} 份周报、{deleteStats.daily} 份日报和{' '}
              {deleteStats.notes}{' '}
              个便签。删除前请先导出备份，然后输入完整项目名称确认。
            </DialogDescription>
          </DialogHeader>
          <Button onClick={exportBackup} variant="outline">
            导出项目备份
          </Button>
          <input
            className="dialog-input"
            onChange={(e) => setDeleteConfirm(e.target.value)}
            placeholder={project.name}
            value={deleteConfirm}
          />
          <DialogFooter>
            <Button onClick={() => setProjectDialog(null)} variant="outline">
              取消
            </Button>
            <Button
              disabled={deleteConfirm !== project.name}
              onClick={deleteProject}
              variant="destructive"
            >
              <Trash2 />
              永久删除项目
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function RecordActions({ onDelete }: { onDelete: () => Promise<void> }) {
  return (
    <section className="meta-card">
      <div>
        <span>保存策略</span>
        <strong>本地草稿 + 手动同步</strong>
      </div>
      <div>
        <span>并发保护</span>
        <strong>GitHub SHA 冲突检测</strong>
      </div>
      <Button
        onClick={() => {
          if (confirm('确定删除这条记录吗？此操作会形成一条 Git 提交。'))
            void onDelete();
        }}
        variant="destructive"
      >
        <Trash2 />
        删除当前记录
      </Button>
    </section>
  );
}

function ProjectDialog({
  mode,
  name,
  setName,
  close,
  confirm,
  onDelete,
}: {
  mode: 'new' | 'rename' | 'delete' | null;
  name: string;
  setName: (v: string) => void;
  close: () => void;
  confirm: () => void;
  onDelete?: () => void;
}) {
  return (
    <Dialog
      onOpenChange={(open) => !open && close()}
      open={mode === 'new' || mode === 'rename'}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'new' ? '新建项目' : '修改项目名称'}
          </DialogTitle>
          <DialogDescription>
            项目用于独立归档周报、日报和便签。
          </DialogDescription>
        </DialogHeader>
        <input
          className="dialog-input"
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          placeholder="项目名称"
          value={name}
        />
        <DialogFooter>
          {mode === 'rename' && onDelete ? (
            <Button onClick={onDelete} variant="destructive">
              删除项目
            </Button>
          ) : null}
          <Button onClick={close} variant="outline">
            取消
          </Button>
          <Button disabled={!name.trim()} onClick={confirm}>
            {mode === 'new' ? '创建项目' : '保存修改'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
