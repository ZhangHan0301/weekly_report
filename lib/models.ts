export type SyncState =
  | '未保存'
  | '本地已保存'
  | '正在同步'
  | '已保存'
  | '同步失败'
  | '存在远程冲突';

export type ProjectStatus = 'planning' | 'active' | 'blocked' | 'done';

export interface Project {
  id: string;
  name: string;
  color: string;
  status: ProjectStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface Milestone {
  id: string;
  title: string;
  dueDate: string;
  done: boolean;
  createdAt: string;
}

export interface ProjectUpdate {
  id: string;
  date: string;
  content: string;
  createdAt: string;
}

export interface ProjectRecord extends Project {
  summary: string;
  milestones: Milestone[];
  updates: ProjectUpdate[];
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
  weekStart: string;
  title: string;
  projectIds: string[];
  dailyEntries: WeeklyDailyEntry[];
  completed: string;
  progress: string;
  risks: string;
  nextPlan: string;
  completion: number;
  createdAt: string;
  updatedAt: string;
}

export interface WeeklyDailyEntry {
  date: string;
  completed: string;
  progress: string;
  risks: string;
  nextPlan: string;
}

export const emptyProject = (project: Project): ProjectRecord => ({
  ...project,
  summary: '',
  milestones: [],
  updates: [],
});

export const emptyWeekly = (weekStart: string): WeeklyRecord => ({
  id: crypto.randomUUID(),
  weekStart,
  title: '',
  projectIds: [],
  dailyEntries: [],
  completed: '',
  progress: '',
  risks: '',
  nextPlan: '',
  completion: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});
