// Mirrors TaskEscrowV2.sol TaskStatus enum
export enum TaskStatus {
  Open = 0,
  Accepted = 1,
  InProgress = 2,
  Submitted = 3,
  Challenged = 4,
  Finalized = 5,
  Refunded = 6,
  Disputed = 7,
}

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  [TaskStatus.Open]: "Open",
  [TaskStatus.Accepted]: "Accepted",
  [TaskStatus.InProgress]: "In Progress",
  [TaskStatus.Submitted]: "Submitted",
  [TaskStatus.Challenged]: "Challenged",
  [TaskStatus.Finalized]: "Completed",
  [TaskStatus.Refunded]: "Refunded",
  [TaskStatus.Disputed]: "Disputed",
};

export const TASK_STATUS_COLORS: Record<TaskStatus, string> = {
  [TaskStatus.Open]: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  [TaskStatus.Accepted]: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  [TaskStatus.InProgress]:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  [TaskStatus.Submitted]:
    "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  [TaskStatus.Challenged]:
    "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  [TaskStatus.Finalized]: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  [TaskStatus.Refunded]: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  [TaskStatus.Disputed]: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

// Mirrors TaskEscrowV2.sol Task struct
export interface Task {
  taskId: `0x${string}`;
  community: `0x${string}`;
  taskor: `0x${string}`;
  supplier: `0x${string}`;
  token: `0x${string}`;
  reward: bigint;
  supplierFee: bigint;
  deadline: bigint;
  createdAt: bigint;
  challengeDeadline: bigint;
  challengeStake: bigint;
  status: TaskStatus;
  metadataUri: string;
  evidenceUri: string;
  taskType: `0x${string}`;
  juryTaskHash: `0x${string}`;
}

// Parsed task for UI display (human-readable fields)
export interface ParsedTask {
  taskId: string;
  community: string;
  taskor: string;
  supplier: string;
  token: string;
  reward: bigint;
  rewardFormatted: string;
  supplierFee: bigint;
  deadline: Date;
  createdAt: Date;
  challengeDeadline: Date | null;
  status: TaskStatus;
  statusLabel: string;
  metadataUri: string;
  evidenceUri: string;
  taskType: string;
  taskTypeLabel: string;
  isExpired: boolean;
  canFinalize: boolean;
}

export interface CreateTaskForm {
  title: string;
  description: string;
  rewardAmount: string;
  deadlineDays: number;
  taskType: `0x${string}`;
}

export interface SubmitEvidenceForm {
  evidenceUri: string;
  description: string;
}

// Metadata stored in IPFS / onchain URI (JSON)
export interface TaskMetadata {
  title: string;
  description: string;
  requirements?: string;
  tags?: string[];
  createdAt: number;
}
