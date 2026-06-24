const { ethers } = require("ethers");

const RPC_URL = process.env.ETH_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const ACCOUNT_ADDRESS = "0x975961302a83090B1eb94676E1430B5baCa43F9E";

// Simple Account ABI - just the owner() function
const ACCOUNT_ABI = [
  "function owner() view returns (address)",
  "function signer() view returns (address)",
];

async function checkAccount() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);

  // Check if contract is deployed
  const code = await provider.getCode(ACCOUNT_ADDRESS);
  console.log("Contract deployed:", code !== "0x");
  console.log("Code length:", code.length);

  if (code !== "0x") {
    const account = new ethers.Contract(ACCOUNT_ADDRESS, ACCOUNT_ABI, provider);

    try {
      const owner = await account.owner();
      console.log("Owner address:", owner);
    } catch (e) {
      console.log("No owner() function or error:", e.message);
    }

    try {
      const signer = await account.signer();
      console.log("Signer address:", signer);
    } catch (e) {
      console.log("No signer() function or error:", e.message);
    }
  }
}

checkAccount().catch(console.error);
