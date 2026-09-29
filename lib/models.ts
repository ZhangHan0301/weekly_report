export type SyncState = '未保存' | '本地已保存' | '正在同步' | '已同步到 GitHub' | '同步失败' | '存在远程冲突';

export interface Project {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  updatedAt: string;
}

export interface DataIndex {
  version: 1;
  projects: Project[];
}

export interface RemoteFile<T> {
  data: T;
  sha: string | null;
  path: string;
}

export interface WeeklyRecord {
  id: string;
  projectId: string;
  weekStart: string;
  title: string;
  completed: string;
  progress: string;
  risks: string;
  nextPlan: string;
  completion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DailyRecord {
  id: string;
  projectId: string;
  date: string;
  completed: string;
  findings: string;
  tomorrow: string;
  extra: string;
  createdAt: string;
  updatedAt: string;
}

export interface NoteRecord {
  id: string;
  projectId: string;
  title: string;
  content: string;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const emptyWeekly = (projectId: string, weekStart: string): WeeklyRecord => ({
  id: crypto.randomUUID(), projectId, weekStart, title: '', completed: '', progress: '',
  risks: '', nextPlan: '', completion: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});

export const emptyDaily = (projectId: string, date: string): DailyRecord => ({
  id: crypto.randomUUID(), projectId, date, completed: '', findings: '', tomorrow: '', extra: '',
  createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
});
