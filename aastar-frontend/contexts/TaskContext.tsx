"use client";

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import {
  parseUnits,
  formatUnits,
  keccak256,
  toBytes,
  type PublicClient,
  type WalletClient,
} from "viem";
import { TASK_ESCROW_ABI, ERC20_ABI } from "@/lib/contracts/task-escrow-abi";
import {
  TASK_ESCROW_ADDRESS,
  DEFAULT_REWARD_TOKEN,
  DEFAULT_REWARD_TOKEN_DECIMALS,
  TASK_TYPE_LABELS,
  SUPPORTED_CHAIN,
  isContractsConfigured,
  getPublicClient,
} from "@/lib/contracts/task-config";
import {
  type Task,
  type ParsedTask,
  type CreateTaskForm,
  TaskStatus,
  TASK_STATUS_LABELS,
} from "@/lib/task-types";

interface TaskContextType {
  // Data
  tasks: ParsedTask[];
  myTasks: ParsedTask[]; // tasks I created (community role)
  claimedTasks: ParsedTask[]; // tasks I accepted (taskor role)
  loading: boolean;
  error: string | null;
  contractConfigured: boolean;
  // T01: Task token balance
  taskTokenBalance: bigint | null;
  taskTokenBalanceFormatted: string | null;
  loadTaskTokenBalance: (address: string) => Promise<void>;
  // Actions
  loadAllTasks: () => Promise<void>;
  loadMyTasks: (address: string) => Promise<void>;
  createTask: (form: CreateTaskForm, walletClient: WalletClient) => Promise<`0x${string}` | null>;
  acceptTask: (taskId: string, walletClient: WalletClient) => Promise<boolean>;
  submitWork: (taskId: string, evidenceUri: string, walletClient: WalletClient) => Promise<boolean>;
  approveWork: (taskId: string, walletClient: WalletClient) => Promise<boolean>;
  finalizeTask: (taskId: string, walletClient: WalletClient) => Promise<boolean>;
  cancelTask: (taskId: string, walletClient: WalletClient) => Promise<boolean>;
  // T06: Receipts
  getTaskReceipts: (taskId: string) => Promise<`0x${string}`[]>;
  linkReceipt: (
    taskId: string,
    receiptId: string,
    receiptUri: string,
    walletClient: WalletClient
  ) => Promise<boolean>;
  // Helpers
  getTask: (taskId: string) => Promise<ParsedTask | null>;
  approveToken: (amount: bigint, walletClient: WalletClient) => Promise<boolean>;
  checkAllowance: (ownerAddress: string) => Promise<bigint>;
}

const TaskContext = createContext<TaskContextType | null>(null);

export function useTask(): TaskContextType {
  const ctx = useContext(TaskContext);
  if (!ctx) throw new Error("useTask must be used within TaskProvider");
  return ctx;
}

function parseTask(raw: Task): ParsedTask {
  const now = new Date();
  const deadline = new Date(Number(raw.deadline) * 1000);
  const challengeDeadline =
    raw.challengeDeadline > 0n ? new Date(Number(raw.challengeDeadline) * 1000) : null;

  const rewardFormatted = formatUnits(raw.reward, DEFAULT_REWARD_TOKEN_DECIMALS);
  const taskTypeLabel = TASK_TYPE_LABELS[raw.taskType] ?? raw.taskType.slice(0, 10);

  const canFinalize =
    raw.status === TaskStatus.Submitted && challengeDeadline !== null && now > challengeDeadline;

  return {
    taskId: raw.taskId,
    community: raw.community,
    taskor: raw.taskor,
    supplier: raw.supplier,
    token: raw.token,
    reward: raw.reward,
    rewardFormatted,
    supplierFee: raw.supplierFee,
    deadline,
    createdAt: new Date(Number(raw.createdAt) * 1000),
    challengeDeadline,
    status: raw.status,
    statusLabel: TASK_STATUS_LABELS[raw.status] ?? "Unknown",
    metadataUri: raw.metadataUri,
    evidenceUri: raw.evidenceUri,
    taskType: raw.taskType,
    taskTypeLabel,
    isExpired: now > deadline,
    canFinalize,
  };
}

export function TaskProvider({ children }: { children: ReactNode }) {
  const [tasks, setTasks] = useState<ParsedTask[]>([]);
  const [myTasks, setMyTasks] = useState<ParsedTask[]>([]);
  const [claimedTasks, setClaimedTasks] = useState<ParsedTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const contractConfigured = isContractsConfigured();
  // T01: task token balance
  const [taskTokenBalance, setTaskTokenBalance] = useState<bigint | null>(null);
  const [taskTokenBalanceFormatted, setTaskTokenBalanceFormatted] = useState<string | null>(null);

  const fetchTask = useCallback(
    async (client: PublicClient, taskId: `0x${string}`): Promise<ParsedTask | null> => {
      try {
        const raw = await client.readContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "getTask",
          args: [taskId],
        });
        return parseTask(raw as Task);
      } catch {
        return null;
      }
    },
    []
  );

  const loadAllTasks = useCallback(async () => {
    if (!contractConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const client = getPublicClient();
      // Fetch TaskCreated events from recent blocks
      const latestBlock = await client.getBlockNumber();
      const fromBlock = latestBlock > 200000n ? latestBlock - 200000n : 0n;
      const logs = await client.getLogs({
        address: TASK_ESCROW_ADDRESS,
        fromBlock,
        toBlock: "latest",
        topics: [keccak256(toBytes("TaskCreated(bytes32,address,address,uint256)"))],
      } as Parameters<typeof client.getLogs>[0]);

      // taskId is the first indexed param (topics[1]); deduplicate in case of reorgs
      const seen = new Set<string>();
      const taskIds = logs
        .map(l => l.topics[1] as `0x${string}` | undefined)
        .filter((id): id is `0x${string}` => !!id && !seen.has(id) && seen.add(id) !== undefined);
      const fetched = await Promise.all(taskIds.map(id => fetchTask(client, id)));
      const valid = fetched.filter((t): t is ParsedTask => t !== null);
      setTasks(valid);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tasks");
    } finally {
      setLoading(false);
    }
  }, [contractConfigured, fetchTask]);

  const loadMyTasks = useCallback(
    async (address: string) => {
      if (!contractConfigured) return;
      setLoading(true);
      setError(null);
      try {
        const client = getPublicClient();
        const addr = address as `0x${string}`;

        const [communityIds, taskorIds] = await Promise.all([
          client.readContract({
            address: TASK_ESCROW_ADDRESS,
            abi: TASK_ESCROW_ABI,
            functionName: "getTasksByCommunity",
            args: [addr],
          }),
          client.readContract({
            address: TASK_ESCROW_ADDRESS,
            abi: TASK_ESCROW_ABI,
            functionName: "getTasksByTaskor",
            args: [addr],
          }),
        ]);

        const [mine, claimed] = await Promise.all([
          Promise.all((communityIds as `0x${string}`[]).map(id => fetchTask(client, id))),
          Promise.all((taskorIds as `0x${string}`[]).map(id => fetchTask(client, id))),
        ]);

        setMyTasks(mine.filter((t): t is ParsedTask => t !== null));
        setClaimedTasks(claimed.filter((t): t is ParsedTask => t !== null));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load my tasks");
      } finally {
        setLoading(false);
      }
    },
    [contractConfigured, fetchTask]
  );

  const getTask = useCallback(
    async (taskId: string): Promise<ParsedTask | null> => {
      if (!contractConfigured) return null;
      const client = getPublicClient();
      return fetchTask(client, taskId as `0x${string}`);
    },
    [contractConfigured, fetchTask]
  );

  const checkAllowance = useCallback(async (ownerAddress: string): Promise<bigint> => {
    const client = getPublicClient();
    const allowance = await client.readContract({
      address: DEFAULT_REWARD_TOKEN,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [ownerAddress as `0x${string}`, TASK_ESCROW_ADDRESS],
    });
    return allowance as bigint;
  }, []);

  const approveToken = useCallback(
    async (amount: bigint, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: DEFAULT_REWARD_TOKEN,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [TASK_ESCROW_ADDRESS, amount],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const createTask = useCallback(
    async (form: CreateTaskForm, walletClient: WalletClient): Promise<`0x${string}` | null> => {
      const [address] = await walletClient.requestAddresses();
      const reward = parseUnits(form.rewardAmount, DEFAULT_REWARD_TOKEN_DECIMALS);
      const deadline = BigInt(Math.floor(Date.now() / 1000) + form.deadlineDays * 86400);

      // Build metadataUri as inline JSON (MVP: no IPFS)
      const metadata = JSON.stringify({
        title: form.title,
        description: form.description,
        createdAt: Math.floor(Date.now() / 1000),
      });

      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "createTask",
          args: [DEFAULT_REWARD_TOKEN, reward, deadline, metadata, form.taskType],
          account: address,
          chain: SUPPORTED_CHAIN,
        });

        const client = getPublicClient();
        const receipt = await client.waitForTransactionReceipt({ hash });

        // Extract taskId from TaskCreated event
        const log = receipt.logs.find(
          l => l.address.toLowerCase() === TASK_ESCROW_ADDRESS.toLowerCase()
        );
        if (log?.topics[1]) {
          return log.topics[1] as `0x${string}`;
        }
        return null;
      } catch {
        return null;
      }
    },
    []
  );

  const acceptTask = useCallback(
    async (taskId: string, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "acceptTask",
          args: [taskId as `0x${string}`],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const submitWork = useCallback(
    async (taskId: string, evidenceUri: string, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "submitWork",
          args: [taskId as `0x${string}`, evidenceUri],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const approveWork = useCallback(
    async (taskId: string, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "approveWork",
          args: [taskId as `0x${string}`],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const finalizeTask = useCallback(
    async (taskId: string, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "finalizeTask",
          args: [taskId as `0x${string}`],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  const cancelTask = useCallback(
    async (taskId: string, walletClient: WalletClient): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "cancelTask",
          args: [taskId as `0x${string}`],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  // T01: load task token balance for a given address
  const loadTaskTokenBalance = useCallback(async (address: string) => {
    if (!DEFAULT_REWARD_TOKEN || !address) return;
    try {
      const client = getPublicClient();
      const raw = await client.readContract({
        address: DEFAULT_REWARD_TOKEN,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address as `0x${string}`],
      });
      const balance = raw as bigint;
      setTaskTokenBalance(balance);
      setTaskTokenBalanceFormatted(formatUnits(balance, DEFAULT_REWARD_TOKEN_DECIMALS));
    } catch {
      // token not deployed or address invalid — silently ignore
    }
  }, []);

  // T06: get x402 receipts linked to a task
  const getTaskReceipts = useCallback(
    async (taskId: string): Promise<`0x${string}`[]> => {
      if (!contractConfigured) return [];
      try {
        const client = getPublicClient();
        const receipts = await client.readContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "getTaskReceipts",
          args: [taskId as `0x${string}`],
        });
        return receipts as `0x${string}`[];
      } catch {
        return [];
      }
    },
    [contractConfigured]
  );

  // T06: link a receipt to a task
  const linkReceipt = useCallback(
    async (
      taskId: string,
      receiptId: string,
      receiptUri: string,
      walletClient: WalletClient
    ): Promise<boolean> => {
      const [address] = await walletClient.requestAddresses();
      try {
        // receiptId must be bytes32; if it's a plain string, hash it
        const receiptIdBytes =
          receiptId.startsWith("0x") && receiptId.length === 66
            ? (receiptId as `0x${string}`)
            : keccak256(toBytes(receiptId));
        const hash = await walletClient.writeContract({
          address: TASK_ESCROW_ADDRESS,
          abi: TASK_ESCROW_ABI,
          functionName: "linkReceipt",
          args: [taskId as `0x${string}`, receiptIdBytes, receiptUri],
          account: address,
          chain: SUPPORTED_CHAIN,
        });
        const client = getPublicClient();
        await client.waitForTransactionReceipt({ hash });
        return true;
      } catch {
        return false;
      }
    },
    []
  );

  // Auto-load tasks when context mounts
  useEffect(() => {
    if (contractConfigured) {
      loadAllTasks();
    }
  }, [contractConfigured, loadAllTasks]);

  return (
    <TaskContext.Provider
      value={{
        tasks,
        myTasks,
        claimedTasks,
        loading,
        error,
        contractConfigured,
        // T01
        taskTokenBalance,
        taskTokenBalanceFormatted,
        loadTaskTokenBalance,
        loadAllTasks,
        loadMyTasks,
        createTask,
        acceptTask,
        submitWork,
        approveWork,
        finalizeTask,
        cancelTask,
        // T06
        getTaskReceipts,
        linkReceipt,
        getTask,
        approveToken,
        checkAllowance,
      }}
    >
      {children}
    </TaskContext.Provider>
  );
}
