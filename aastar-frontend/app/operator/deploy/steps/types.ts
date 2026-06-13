"use client";

/**
 * Shared types for the operator onboarding wizard (registry flow 1 "AOA" /
 * flow 2 "AOA+"). All transactions are signed in the operator's own browser
 * wallet (viem WalletClient from WalletContext); no SSR / backend keys.
 *
 * @module app/operator/deploy/steps/types
 */
import type { Address, WalletClient } from "viem";
import type { ResourceStatus, StakeMode } from "@/lib/resources/resourceChecker";

export type { ResourceStatus, StakeMode };

/** Cross-step wizard state, owned by page.tsx and threaded into each step. */
export interface WizardData {
  mode: StakeMode | null;
  resources: ResourceStatus | null;
  /** xPNTs token address — read back from the factory after deploy (or pre-existing). */
  xPNTsAddress?: Address;
  /** AOA Paymaster V4 address — returned by deployAndRegisterPaymasterV4. */
  paymasterAddress?: Address;
  /** Treasury that receives operator service fees (defaults to the connected EOA). */
  treasury: string;
  /** xPNTs <-> aPNTs exchange rate, human units (parseEther on submit). */
  exchangeRate: string;
  /** New xPNTs token metadata (only used when no token exists yet). */
  tokenName: string;
  tokenSymbol: string;
  communityName: string;
  communityENS: string;
  /** EntryPoint deposit for the AOA paymaster (ETH). */
  ethDeposit: string;
  /** aPNTs collateral deposited to SuperPaymaster (AOA+). */
  aPNTsDeposit: string;
}

export const initialWizardData: WizardData = {
  mode: null,
  resources: null,
  treasury: "",
  exchangeRate: "1",
  tokenName: "",
  tokenSymbol: "",
  communityName: "",
  communityENS: "",
  ethDeposit: "0.05",
  aPNTsDeposit: "1000",
};

/** Props every step component receives from the wizard container. */
export interface StepProps {
  address: Address;
  walletClient: WalletClient;
  data: WizardData;
  update: (patch: Partial<WizardData>) => void;
  onNext: () => void;
  onBack?: () => void;
  /** Re-run the resource pre-check (used after a step mutates on-chain state). */
  refreshResources?: () => Promise<void>;
}
