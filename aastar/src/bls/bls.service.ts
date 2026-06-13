import { Injectable, Inject } from "@nestjs/common";
import { YAAAServerClient } from "@aastar/airaccount/server";
import { YAAA_SERVER_CLIENT } from "../sdk/sdk.providers";
import { BLSSignatureData as BlsSignatureData } from "@aastar/airaccount/server";

@Injectable()
export class BlsService {
  constructor(@Inject(YAAA_SERVER_CLIENT) private client: YAAAServerClient) {}

  async getActiveSignerNodes(): Promise<any[]> {
    return this.client.bls.getActiveSignerNodes();
  }

  async generateBLSSignature(userId: string, userOpHash: string): Promise<BlsSignatureData> {
    return this.client.bls.generateBLSSignature(userId, userOpHash);
  }

  async packSignature(blsData: BlsSignatureData): Promise<string> {
    return this.client.bls.packSignature(blsData);
  }

  async getAvailableNodes() {
    const nodes = await this.client.bls.getActiveSignerNodes();
    return nodes.map((node: any, index: number) => ({
      index: index + 1,
      nodeId: node.nodeId,
      nodeName: node.nodeName,
      apiEndpoint: node.apiEndpoint,
      status: node.status,
      lastSeen: node.lastSeen,
    }));
  }

  async getNodesByIndices(indices: number[]) {
    const allNodes = await this.client.bls.getActiveSignerNodes();
    if (!allNodes || allNodes.length === 0) {
      throw new Error("BLS configuration not found");
    }

    return indices.map(i => {
      const node = allNodes[i - 1] as any;
      if (!node) throw new Error(`Node ${i} not found`);
      return {
        index: i,
        nodeId: node.nodeId,
        nodeName: node.nodeName,
        apiEndpoint: node.apiEndpoint,
        status: node.status,
      };
    });
  }
}
