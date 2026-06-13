"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Layout from "@/components/Layout";
import { registryAPI } from "@/lib/api";
import toast from "react-hot-toast";
import {
  ShieldCheckIcon,
  UserGroupIcon,
  CpuChipIcon,
  KeyIcon,
  InformationCircleIcon,
} from "@heroicons/react/24/outline";

interface RoleInfo {
  address: string;
  isAdmin: boolean;
  isCommunityAdmin: boolean;
  isSPO: boolean;
  isV4Operator: boolean;
  isEndUser: boolean;
  roleIds: string[];
  gtokenBalance: string;
}

interface RegistryInfo {
  registryAddress: string;
  chainId: number;
  roleCounts: {
    communityAdmin: string;
    spo: string;
    v4Operator: string;
    endUser: string;
  };
}

function formatGToken(wei: string): string {
  try {
    const bigWei = BigInt(wei);
    const ether = Number(bigWei) / 1e18;
    return ether.toFixed(4);
  } catch {
    return "0";
  }
}

const ROLE_COLOR_MAP: Record<string, string> = {
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
  green: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  gray: "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200",
};

function RoleBadge({ label, active, color }: { label: string; active: boolean; color: string }) {
  const activeClasses = ROLE_COLOR_MAP[color] ?? ROLE_COLOR_MAP.gray;
  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
        active ? activeClasses : "bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-600"
      }`}
    >
      {active && <span className="mr-1.5">✓</span>}
      {label}
    </span>
  );
}

function truncate(addr: string) {
  if (!addr) return "";
  return addr.slice(0, 8) + "..." + addr.slice(-6);
}

export default function RolePage() {
  const router = useRouter();
  const [roleInfo, setRoleInfo] = useState<RoleInfo | null>(null);
  const [registryInfo, setRegistryInfo] = useState<RegistryInfo | null>(null);
  const [queryAddress, setQueryAddress] = useState("");
  const [loading, setLoading] = useState(true);
  const [querying, setQuerying] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [roleRes, infoRes] = await Promise.all([
        registryAPI.getRole().catch(() => null),
        registryAPI.getInfo(),
      ]);
      if (roleRes) setRoleInfo(roleRes.data);
      setRegistryInfo(infoRes.data);
    } catch {
      toast.error("Failed to load registry data");
    } finally {
      setLoading(false);
    }
  };

  const queryRole = async () => {
    if (!queryAddress) return;
    setQuerying(true);
    try {
      const res = await registryAPI.getRole(queryAddress);
      setRoleInfo(res.data);
    } catch {
      toast.error("Failed to query role for address");
    } finally {
      setQuerying(false);
    }
  };

  const navigateTo = (path: string) => router.push(path);

  return (
    <Layout requireAuth>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Role Portal</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            View your role in the AAStar ecosystem and navigate to role-specific dashboards
          </p>
        </div>

        {/* Registry Info */}
        {registryInfo && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center gap-2 mb-4">
              <InformationCircleIcon className="h-5 w-5 text-blue-500" />
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Registry Overview (Sepolia)
              </h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: "Community Admins", value: registryInfo.roleCounts.communityAdmin },
                { label: "SPO Operators", value: registryInfo.roleCounts.spo },
                { label: "V4 Operators", value: registryInfo.roleCounts.v4Operator },
                { label: "End Users", value: registryInfo.roleCounts.endUser },
              ].map(item => (
                <div key={item.label} className="text-center">
                  <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                    {item.value}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="mt-3 text-xs text-gray-400 font-mono">
              Registry: {truncate(registryInfo.registryAddress)}
            </div>
          </div>
        )}

        {/* Address Query */}
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Query Role for Address
          </h2>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="0x... (defaults to your wallet)"
              value={queryAddress}
              onChange={e => setQueryAddress(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={queryRole}
              disabled={querying}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-sm rounded-lg disabled:opacity-50"
            >
              {querying ? "..." : "Query"}
            </button>
          </div>
        </div>

        {/* Current Role Info */}
        {loading ? (
          <div className="text-center py-10 text-gray-500">Loading...</div>
        ) : roleInfo ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                Role Status for {truncate(roleInfo.address)}
              </h2>
              <span className="text-xs text-gray-500">
                {formatGToken(roleInfo.gtokenBalance)} GT
              </span>
            </div>

            <div className="flex flex-wrap gap-2 mb-5">
              <RoleBadge label="Protocol Admin" active={roleInfo.isAdmin} color="purple" />
              <RoleBadge label="Community Admin" active={roleInfo.isCommunityAdmin} color="green" />
              <RoleBadge label="SPO Operator" active={roleInfo.isSPO} color="orange" />
              <RoleBadge label="V4 Operator" active={roleInfo.isV4Operator} color="blue" />
              <RoleBadge label="End User" active={roleInfo.isEndUser} color="gray" />
            </div>

            {/* Navigation Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {roleInfo.isCommunityAdmin && (
                <button
                  onClick={() => navigateTo("/community")}
                  className="flex items-center gap-3 p-4 rounded-lg border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/40 text-left"
                >
                  <UserGroupIcon className="h-8 w-8 text-green-600 dark:text-green-400 shrink-0" />
                  <div>
                    <div className="font-medium text-green-900 dark:text-green-200">
                      Community Admin
                    </div>
                    <div className="text-xs text-green-600 dark:text-green-400">
                      Deploy xPNTs, manage community
                    </div>
                  </div>
                </button>
              )}

              {(roleInfo.isSPO || roleInfo.isV4Operator) && (
                <button
                  onClick={() => navigateTo("/operator")}
                  className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40 text-left"
                >
                  <CpuChipIcon className="h-8 w-8 text-blue-600 dark:text-blue-400 shrink-0" />
                  <div>
                    <div className="font-medium text-blue-900 dark:text-blue-200">
                      Paymaster Operator
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400">
                      Configure SPO / V4 paymaster
                    </div>
                  </div>
                </button>
              )}

              {roleInfo.isAdmin && (
                <button
                  onClick={() => navigateTo("/admin")}
                  className="flex items-center gap-3 p-4 rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-left"
                >
                  <ShieldCheckIcon className="h-8 w-8 text-purple-600 dark:text-purple-400 shrink-0" />
                  <div>
                    <div className="font-medium text-purple-900 dark:text-purple-200">
                      Protocol Admin
                    </div>
                    <div className="text-xs text-purple-600 dark:text-purple-400">
                      Manage roles, configure protocol
                    </div>
                  </div>
                </button>
              )}

              {roleInfo.isEndUser && (
                <button
                  onClick={() => navigateTo("/dashboard")}
                  className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/20 hover:bg-gray-100 dark:hover:bg-gray-900/40 text-left"
                >
                  <KeyIcon className="h-8 w-8 text-gray-600 dark:text-gray-400 shrink-0" />
                  <div>
                    <div className="font-medium text-gray-900 dark:text-gray-200">End User</div>
                    <div className="text-xs text-gray-600 dark:text-gray-400">
                      Wallet, transfers, gasless TX
                    </div>
                  </div>
                </button>
              )}

              {!roleInfo.isAdmin && !roleInfo.isCommunityAdmin && !roleInfo.isSPO && !roleInfo.isV4Operator && !roleInfo.isEndUser && (
                <div className="col-span-full text-center py-6 text-gray-500 dark:text-gray-400">
                  <ShieldCheckIcon className="h-10 w-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No roles found for this address</p>
                  <p className="text-xs mt-1">Purchase GToken to register a role</p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
