import { Module, DynamicModule, Global } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { DatabaseService } from "./database.service";
import { JsonAdapter } from "./adapters/json.adapter";
import { PostgresAdapter } from "./adapters/postgres.adapter";
import {
  User,
  Account,
  Transfer,
  Passkey,
  BlsConfig,
  UserToken,
  Guardian,
  RecoveryRequest,
} from "../entities";

@Global()
@Module({})
export class DatabaseModule {
  static forRoot(): DynamicModule {
    // Use environment variable directly for module initialization
    const dbType = process.env.DB_TYPE || "json";

    const imports: any[] = [ConfigModule];
    const providers: any[] = [JsonAdapter];

    // Only import TypeORM modules when using postgres
    if (dbType === "postgres") {
      imports.push(
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          useFactory: async (configService: ConfigService) => {
            const databaseUrl = configService.get<string>("DATABASE_URL");
            if (!databaseUrl) {
              throw new Error(
                "DATABASE_URL environment variable is required when DB_TYPE is 'postgres'"
              );
            }

            return {
              type: "postgres",
              url: databaseUrl,
              entities: [
                User,
                Account,
                Transfer,
                Passkey,
                BlsConfig,
                UserToken,
                Guardian,
                RecoveryRequest,
              ],
              synchronize: true, // Auto-create tables
              logging: configService.get<string>("NODE_ENV") === "development",
              ssl:
                databaseUrl &&
                (databaseUrl.includes("sslmode=require") || databaseUrl.includes("ssl=true"))
                  ? { rejectUnauthorized: false }
                  : undefined,
            };
          },
          inject: [ConfigService],
        }),
        TypeOrmModule.forFeature([
          User,
          Account,
          Transfer,
          Passkey,
          BlsConfig,
          UserToken,
          Guardian,
          RecoveryRequest,
        ])
      );
      providers.push(PostgresAdapter);
    }

    return {
      module: DatabaseModule,
      imports,
      providers: [
        ...providers,
        {
          provide: DatabaseService,
          useFactory: (
            configService: ConfigService,
            jsonAdapter: JsonAdapter,
            postgresAdapter?: PostgresAdapter
          ) => {
            return new DatabaseService(configService, jsonAdapter, postgresAdapter);
          },
          inject: [ConfigService, JsonAdapter, { token: PostgresAdapter, optional: true }],
        },
      ],
      exports: [DatabaseService],
    };
  }
}
