import { Injectable } from "@nestjs/common";
import {
  IStorageAdapter,
  AccountRecord,
  TransferRecord,
  PaymasterRecord,
  BlsConfigRecord,
} from "@aastar/airaccount/server";
import { DatabaseService } from "../database/database.service";
import * as fs from "fs";
import * as path from "path";

@Injectable()
export class BackendStorageAdapter implements IStorageAdapter {
  private dataDir: string;

  constructor(private databaseService: DatabaseService) {
    this.dataDir = path.join(process.cwd(), "data");
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true });
    }
  }

  // Accounts
  async getAccounts(): Promise<AccountRecord[]> {
    return this.databaseService.getAccounts();
  }

  async saveAccount(account: AccountRecord): Promise<void> {
    return this.databaseService.saveAccount(account);
  }

  async findAccountByUserId(userId: string): Promise<AccountRecord | null> {
    return this.databaseService.findAccountByUserId(userId);
  }

  async updateAccount(userId: string, updates: Partial<AccountRecord>): Promise<void> {
    return this.databaseService.updateAccount(userId, updates);
  }

  // Transfers
  async saveTransfer(transfer: TransferRecord): Promise<void> {
    return this.databaseService.saveTransfer(transfer);
  }

  async findTransfersByUserId(userId: string): Promise<TransferRecord[]> {
    return this.databaseService.findTransfersByUserId(userId);
  }

  async findTransferById(id: string): Promise<TransferRecord | null> {
    return this.databaseService.findTransferById(id);
  }

  async updateTransfer(id: string, updates: Partial<TransferRecord>): Promise<void> {
    return this.databaseService.updateTransfer(id, updates);
  }

  // Paymasters (file-based storage)
  async getPaymasters(userId: string): Promise<PaymasterRecord[]> {
    const filePath = this.getUserPaymastersFilePath(userId);
    if (!fs.existsSync(filePath)) {
      return [];
    }
    try {
      const data = fs.readFileSync(filePath, "utf8");
      return JSON.parse(data);
    } catch {
      return [];
    }
  }

  async savePaymaster(userId: string, paymaster: PaymasterRecord): Promise<void> {
    const paymasters = await this.getPaymasters(userId);
    const existingIndex = paymasters.findIndex(p => p.name === paymaster.name);
    if (existingIndex >= 0) {
      paymasters[existingIndex] = paymaster;
    } else {
      paymasters.push(paymaster);
    }
    const filePath = this.getUserPaymastersFilePath(userId);
    fs.writeFileSync(filePath, JSON.stringify(paymasters, null, 2));
  }

  async removePaymaster(userId: string, name: string): Promise<boolean> {
    const paymasters = await this.getPaymasters(userId);
    const filtered = paymasters.filter(p => p.name !== name);
    if (filtered.length < paymasters.length) {
      const filePath = this.getUserPaymastersFilePath(userId);
      fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2));
      return true;
    }
    return false;
  }

  // BLS config
  async getBlsConfig(): Promise<BlsConfigRecord | null> {
    return this.databaseService.getBlsConfig();
  }

  async updateSignerNodesCache(nodes: unknown[]): Promise<void> {
    return this.databaseService.updateSignerNodesCache(nodes);
  }

  private getUserPaymastersFilePath(userId: string): string {
    return path.join(this.dataDir, `user-paymasters-${userId}.json`);
  }
}
