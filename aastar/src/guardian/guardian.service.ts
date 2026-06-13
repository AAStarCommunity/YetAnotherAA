import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { v4 as uuidv4 } from "uuid";
import { ethers } from "ethers";
import { DatabaseService } from "../database/database.service";
import {
  AddGuardianDto,
  RemoveGuardianDto,
  InitiateRecoveryDto,
  SupportRecoveryDto,
} from "./dto/guardian.dto";

// Time lock before recovery can be executed (48 hours in ms)
const RECOVERY_DELAY_MS = 48 * 60 * 60 * 1000;

// Minimum guardians required to support a recovery (M-of-N: 2 out of N)
const RECOVERY_QUORUM = 2;

// ABI fragments for AirAccount social recovery methods.
// Source: AAStarAirAccountBase.sol — proposeRecovery, approveRecovery, executeRecovery, cancelRecovery
// and the activeRecovery() state reader.
const AIRACCOUNT_RECOVERY_ABI = [
  // propose a recovery (caller must be a guardian on-chain)
  "function proposeRecovery(address _newOwner) external",
  // approve the current active proposal (caller must be a guardian on-chain)
  "function approveRecovery() external",
  // execute the proposal after timelock and threshold are met (anyone can call)
  "function executeRecovery() external",
  // vote to cancel active recovery (caller must be a guardian on-chain)
  "function cancelRecovery() external",
  // read the active recovery proposal stored on-chain
  "function activeRecovery() external view returns (address newOwner, uint256 proposedAt, uint256 approvalBitmap, uint256 cancellationBitmap)",
];

@Injectable()
export class GuardianService {
  private readonly logger = new Logger(GuardianService.name);

  constructor(
    private databaseService: DatabaseService,
    private configService: ConfigService
  ) {}

  // ─── Internal helpers ────────────────────────────────────────────────────

  /**
   * Returns a read-only provider connected to the configured RPC endpoint.
   */
  private getProvider(): ethers.JsonRpcProvider {
    const rpcUrl = this.configService.get<string>("ethRpcUrl");
    if (!rpcUrl) {
      throw new InternalServerErrorException("ETH_RPC_URL is not configured");
    }
    return new ethers.JsonRpcProvider(rpcUrl);
  }

  /**
   * Returns a Wallet signer backed by ETH_PRIVATE_KEY, used as the relayer
   * for on-chain executeRecovery() calls (no guardian restriction on that
   * function — anyone may call it once conditions are met).
   */
  private getRelaySigner(): ethers.Wallet {
    const privateKey = this.configService.get<string>("ethPrivateKey");
    if (
      !privateKey ||
      privateKey === "0x0000000000000000000000000000000000000000000000000000000000000001"
    ) {
      throw new InternalServerErrorException(
        "ETH_PRIVATE_KEY is not configured or still set to the placeholder value. " +
          "Please set a funded Sepolia EOA private key in .env to send on-chain recovery transactions."
      );
    }
    const provider = this.getProvider();
    return new ethers.Wallet(privateKey, provider);
  }

  /**
   * Returns an AirAccount contract instance bound to the relayer signer,
   * exposing only the recovery-related ABI fragments.
   */
  private getAirAccountContract(accountAddress: string, signer: ethers.Signer): ethers.Contract {
    return new ethers.Contract(accountAddress, AIRACCOUNT_RECOVERY_ABI, signer);
  }

  /**
   * Returns a read-only AirAccount contract instance for on-chain state queries.
   */
  private getAirAccountContractReadOnly(accountAddress: string): ethers.Contract {
    const provider = this.getProvider();
    return new ethers.Contract(accountAddress, AIRACCOUNT_RECOVERY_ABI, provider);
  }

  /**
   * Reads the on-chain activeRecovery proposal for a given account.
   * Returns null when no proposal is active (newOwner === address(0)).
   */
  private async fetchOnChainRecovery(accountAddress: string): Promise<{
    newOwner: string;
    proposedAt: bigint;
    approvalBitmap: bigint;
    cancellationBitmap: bigint;
  } | null> {
    try {
      const contract = this.getAirAccountContractReadOnly(accountAddress);
      const [newOwner, proposedAt, approvalBitmap, cancellationBitmap] =
        await contract.activeRecovery();
      if (newOwner === ethers.ZeroAddress) {
        return null;
      }
      return { newOwner, proposedAt, cancellationBitmap, approvalBitmap };
    } catch (err) {
      // If the contract does not exist on-chain (e.g. account not yet deployed)
      // treat it as no active recovery rather than crashing.
      this.logger.warn(
        `Could not fetch on-chain activeRecovery for ${accountAddress}: ${(err as Error).message}`
      );
      return null;
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  async getGuardians(accountAddress: string) {
    const guardians = await this.databaseService.getGuardiansByAccount(accountAddress);
    return guardians.filter(g => g.status !== "revoked");
  }

  async addGuardian(accountAddress: string, dto: AddGuardianDto) {
    if (accountAddress.toLowerCase() === dto.guardianAddress.toLowerCase()) {
      throw new BadRequestException("Account cannot be its own guardian");
    }

    const existing = await this.databaseService.findGuardian(accountAddress, dto.guardianAddress);

    if (existing && existing.status !== "revoked") {
      throw new BadRequestException("Guardian already exists for this account");
    }

    const guardian = {
      id: uuidv4(),
      accountAddress,
      guardianAddress: dto.guardianAddress,
      status: "active",
      createdAt: new Date().toISOString(),
      revokedAt: null,
    };

    await this.databaseService.saveGuardian(guardian);
    return guardian;
  }

  async removeGuardian(accountAddress: string, dto: RemoveGuardianDto) {
    const existing = await this.databaseService.findGuardian(accountAddress, dto.guardianAddress);

    if (!existing || existing.status === "revoked") {
      throw new NotFoundException("Guardian not found for this account");
    }

    await this.databaseService.updateGuardian(existing.id, {
      status: "revoked",
      revokedAt: new Date().toISOString(),
    });

    return { message: "Guardian removed successfully" };
  }

  /**
   * Initiates a recovery request.
   *
   * Off-chain flow (always):
   *   - Validates caller is an active guardian in the database.
   *   - Creates a pending recovery record in the database.
   *
   * On-chain note:
   *   - proposeRecovery() on-chain requires msg.sender to be a registered
   *     guardian of the AirAccount contract, so the backend relayer cannot call
   *     it on behalf of the guardian.  The client (guardian's wallet) must
   *     separately call proposeRecovery() on the AirAccount contract directly.
   *   - This endpoint records intent and tracks quorum off-chain, while
   *     executeRecovery() below enforces the actual on-chain state change.
   *
   * If the account is already deployed on-chain and has an active recovery
   * proposal, we sync that information into the response so the caller knows
   * the current on-chain state.
   */
  async initiateRecovery(callerAddress: string, dto: InitiateRecoveryDto) {
    const { accountAddress, newSignerAddress } = dto;

    // Verify caller is an active guardian
    const guardian = await this.databaseService.findGuardian(accountAddress, callerAddress);
    if (!guardian || guardian.status !== "active") {
      throw new ForbiddenException("Caller is not an active guardian of this account");
    }

    // Check no pending recovery already exists in the database
    const existing = await this.databaseService.findPendingRecovery(accountAddress);
    if (existing) {
      throw new BadRequestException("A recovery request is already pending for this account");
    }

    const executeAfter = Date.now() + RECOVERY_DELAY_MS;

    const request = {
      id: uuidv4(),
      accountAddress,
      newSignerAddress,
      initiatedBy: callerAddress,
      supporters: [callerAddress], // initiator implicitly supports
      status: "pending",
      executeAfter: executeAfter.toString(),
      createdAt: new Date().toISOString(),
      executedAt: null,
    };

    await this.databaseService.saveRecoveryRequest(request);

    // Read on-chain state (best-effort, non-blocking for the db write above)
    const onChainRecovery = await this.fetchOnChainRecovery(accountAddress);

    return {
      ...request,
      executeAfterDate: new Date(executeAfter).toISOString(),
      quorumRequired: RECOVERY_QUORUM,
      supportCount: 1,
      // proposeRecovery() requires msg.sender == guardian, so the backend relayer cannot call it.
      // The guardian's wallet must call it directly on the AirAccount contract.
      requiresOnChainAction: true,
      onChainAction: "proposeRecovery(newSignerAddress)",
      onChainRecoveryActive: onChainRecovery !== null,
      onChainNewOwner: onChainRecovery?.newOwner ?? null,
      note:
        "ACTION REQUIRED: The guardian must call proposeRecovery(newSignerAddress) on the AirAccount " +
        "contract directly (msg.sender must be the guardian — the backend relayer cannot do this). " +
        "The backend will call executeRecovery() on-chain once quorum and timelock are met.",
    };
  }

  /**
   * Records a guardian's support for an existing recovery request.
   *
   * On-chain note: approveRecovery() also requires msg.sender == guardian,
   * so the backend relayer cannot call it.  The guardian's wallet must call
   * approveRecovery() on the contract directly.
   */
  async supportRecovery(callerAddress: string, dto: SupportRecoveryDto) {
    const { accountAddress } = dto;

    // Verify caller is an active guardian
    const guardian = await this.databaseService.findGuardian(accountAddress, callerAddress);
    if (!guardian || guardian.status !== "active") {
      throw new ForbiddenException("Caller is not an active guardian of this account");
    }

    const request = await this.databaseService.findPendingRecovery(accountAddress);
    if (!request) {
      throw new NotFoundException("No pending recovery request for this account");
    }

    const supporters: string[] = Array.isArray(request.supporters)
      ? request.supporters
      : request.supporters
        ? request.supporters.split(",").filter(Boolean)
        : [];

    if (supporters.includes(callerAddress)) {
      throw new BadRequestException("You have already supported this recovery request");
    }

    supporters.push(callerAddress);

    await this.databaseService.updateRecoveryRequest(request.id, { supporters });

    // Read on-chain approval bitmap (best-effort)
    const onChainRecovery = await this.fetchOnChainRecovery(accountAddress);
    const onChainApprovals = onChainRecovery
      ? // Count set bits in approvalBitmap
        [...onChainRecovery.approvalBitmap.toString(2)].filter(b => b === "1").length
      : null;

    return {
      ...request,
      supporters,
      supportCount: supporters.length,
      quorumRequired: RECOVERY_QUORUM,
      quorumReached: supporters.length >= RECOVERY_QUORUM,
      onChainApprovals,
      // approveRecovery() also requires msg.sender == guardian; backend cannot call it.
      requiresOnChainAction: true,
      onChainAction: "approveRecovery()",
      note:
        supporters.length >= RECOVERY_QUORUM
          ? "Quorum reached. ACTION REQUIRED: Guardian must also call approveRecovery() on the contract directly. Once timelock expires, call executeRecovery to finalise on-chain."
          : "Quorum not yet reached. Additional guardian support required. ACTION REQUIRED: Guardian must also call approveRecovery() on the contract directly.",
    };
  }

  /**
   * Executes the recovery.
   *
   * Steps:
   *  1. Validate off-chain quorum and timelock (database checks).
   *  2. Send an on-chain executeRecovery() transaction using the backend relayer.
   *     This function has no msg.sender restriction in the contract — anyone may
   *     call it once conditions (threshold + timelock) are met on-chain.
   *  3. Wait for the transaction to be mined and confirm success.
   *  4. Update the database only after on-chain success.
   *
   * On-chain failure causes an exception; the database is NOT updated, so
   * the recovery request stays in "pending" status and can be retried.
   */
  async executeRecovery(accountAddress: string) {
    // ── 1. Off-chain checks ───────────────────────────────────────────────
    const request = await this.databaseService.findPendingRecovery(accountAddress);
    if (!request) {
      throw new NotFoundException("No pending recovery request for this account");
    }

    const supporters: string[] = Array.isArray(request.supporters)
      ? request.supporters
      : request.supporters
        ? request.supporters.split(",").filter(Boolean)
        : [];

    if (supporters.length < RECOVERY_QUORUM) {
      throw new BadRequestException(
        `Recovery requires at least ${RECOVERY_QUORUM} guardian confirmations (current: ${supporters.length})`
      );
    }

    const executeAfter = Number(request.executeAfter);
    if (Date.now() < executeAfter) {
      const remaining = Math.ceil((executeAfter - Date.now()) / 1000 / 60);
      throw new BadRequestException(
        `Recovery time lock has not expired yet. Please wait ${remaining} more minutes.`
      );
    }

    // ── 2. On-chain executeRecovery() ─────────────────────────────────────
    this.logger.log(
      `Executing on-chain recovery for account=${accountAddress} newOwner=${request.newSignerAddress}`
    );

    let txHash: string;
    try {
      const signer = this.getRelaySigner();
      const contract = this.getAirAccountContract(accountAddress, signer);

      const tx: ethers.TransactionResponse = await contract.executeRecovery();
      txHash = tx.hash;
      this.logger.log(`On-chain executeRecovery tx sent: ${txHash}`);

      // ── 3. Wait for confirmation ────────────────────────────────────────
      const receipt = await tx.wait(1);
      if (!receipt || receipt.status !== 1) {
        throw new Error(
          `Transaction ${txHash} was mined but reverted (status=${receipt?.status ?? "unknown"})`
        );
      }
      this.logger.log(
        `On-chain executeRecovery confirmed in block ${receipt.blockNumber} (tx=${txHash})`
      );
    } catch (err) {
      // On-chain failure: do NOT update the database — the request stays
      // "pending" so the caller can diagnose and retry.
      const message = (err as Error).message ?? String(err);
      this.logger.error(`On-chain executeRecovery failed for ${accountAddress}: ${message}`);
      throw new InternalServerErrorException(
        `On-chain executeRecovery transaction failed: ${message}`
      );
    }

    // ── 4. Update database only after on-chain success ─────────────────
    await this.databaseService.updateRecoveryRequest(request.id, {
      status: "executed",
      executedAt: new Date().toISOString(),
    });

    // Update the account's signerAddress in the database to reflect the new owner
    await this.databaseService.updateAccountByAddress(accountAddress, {
      signerAddress: request.newSignerAddress,
    });

    return {
      message: "Account recovery executed successfully (on-chain + database updated)",
      accountAddress,
      newSignerAddress: request.newSignerAddress,
      executedAt: new Date().toISOString(),
      txHash,
    };
  }

  async cancelRecovery(callerAddress: string, accountAddress: string) {
    const request = await this.databaseService.findPendingRecovery(accountAddress);
    if (!request) {
      throw new NotFoundException("No pending recovery request for this account");
    }

    // Only a guardian or the original signer of the account can cancel
    const guardian = await this.databaseService.findGuardian(accountAddress, callerAddress);
    const account = await this.databaseService.findAccountByAddress(accountAddress);

    const isGuardian = guardian && guardian.status === "active";
    const isSigner =
      account && account.signerAddress?.toLowerCase() === callerAddress.toLowerCase();

    if (!isGuardian && !isSigner) {
      throw new ForbiddenException(
        "Only an active guardian or the account signer can cancel a recovery"
      );
    }

    await this.databaseService.updateRecoveryRequest(request.id, {
      status: "cancelled",
    });

    return { message: "Recovery request cancelled successfully" };
  }

  async getPendingRecovery(accountAddress: string) {
    const request = await this.databaseService.findPendingRecovery(accountAddress);
    if (!request) return null;

    const supporters: string[] = Array.isArray(request.supporters)
      ? request.supporters
      : request.supporters
        ? request.supporters.split(",").filter(Boolean)
        : [];

    // Enrich with on-chain state (best-effort)
    const onChainRecovery = await this.fetchOnChainRecovery(accountAddress);

    return {
      ...request,
      supporters,
      supportCount: supporters.length,
      quorumRequired: RECOVERY_QUORUM,
      quorumReached: supporters.length >= RECOVERY_QUORUM,
      executeAfterDate: new Date(Number(request.executeAfter)).toISOString(),
      timeLockExpired: Date.now() >= Number(request.executeAfter),
      onChain: onChainRecovery
        ? {
            active: true,
            newOwner: onChainRecovery.newOwner,
            proposedAt: new Date(Number(onChainRecovery.proposedAt) * 1000).toISOString(),
            approvalCount: [...onChainRecovery.approvalBitmap.toString(2)].filter(b => b === "1")
              .length,
          }
        : { active: false },
    };
  }
}
