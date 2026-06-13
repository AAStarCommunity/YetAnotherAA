#!/usr/bin/env node
/**
 * 定期更新 SuperPaymaster 价格（threshold = 70分钟，建议每 50 分钟跑一次）
 * crontab: */50 * * * * node /path/to/this/script.js
 */
const { ethers } = require('ethers');
const PRIVATE_KEY = '0x1b9c251d318c3c8576b96beddfdc4ec2ffbff762d70325787bde31559db83a21';
const provider = new ethers.JsonRpcProvider('https://eth-sepolia.g.alchemy.com/v2/Bx4QRW1-vnwJUePSAAD7N');
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const abi = [
  'function updatePrice() external',
  'function priceStalenessThreshold() view returns (uint256)',
];

const PAYMASTERS = [
  { name: 'PMv4', addr: '0xD0c82dc12B7d65b03dF7972f67d13F1D33469a98' },
  { name: 'SuperPaymaster', addr: '0x16cE0c7d846f9446bbBeb9C5a84A4D140fAeD94A' },
];

async function main() {
  const now = Math.floor(Date.now() / 1000);
  for (const { name, addr } of PAYMASTERS) {
    const raw = await provider.call({ to: addr, data: '0xf60fdcb3' });
    const ts = Number(BigInt('0x' + raw.slice(66, 130)));
    const threshold = Number(await new ethers.Contract(addr, abi, provider).priceStalenessThreshold());
    const age = now - ts;
    if (age > threshold * 0.8) { // 在 80% 阈值时提前更新
      const tx = await new ethers.Contract(addr, abi, wallet).updatePrice({ gasLimit: 300000 });
      await tx.wait();
      console.log(`[${new Date().toISOString()}] ${name} price updated, tx: ${tx.hash}`);
    } else {
      console.log(`[${new Date().toISOString()}] ${name} ok, age: ${(age/60).toFixed(1)}min / ${(threshold/60).toFixed(1)}min`);
    }
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
