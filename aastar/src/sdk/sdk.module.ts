import { Module, Global } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { BackendStorageAdapter } from "./backend-storage.adapter";
import { yaaaServerClientProvider, YAAA_SERVER_CLIENT } from "./sdk.providers";

@Global()
@Module({
  imports: [AuthModule],
  providers: [BackendStorageAdapter, yaaaServerClientProvider],
  exports: [YAAA_SERVER_CLIENT, BackendStorageAdapter],
})
export class SdkModule {}
