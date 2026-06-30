import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { SwaggerModule, DocumentBuilder } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { ConfigService } from "@nestjs/config";

// Make BigInt JSON-serializable across the whole API. SDK records (e.g. AccountRecord.salt) can carry
// a raw bigint, and Express's res.json() throws "Do not know how to serialize a BigInt" → an opaque
// 500 AFTER the work succeeded (e.g. the account is already deployed on-chain). Emit it as a decimal
// string instead. Standard NestJS pattern; safe (only affects JSON.stringify of bigint values).
(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    })
  );

  // API prefix
  const apiPrefix = configService.get<string>("API_PREFIX", "api/v1");
  app.setGlobalPrefix(apiPrefix);

  // CORS
  app.enableCors({
    origin: true,
    credentials: true,
  });

  // Swagger Documentation
  const config = new DocumentBuilder()
    .setTitle("AAStar API")
    .setDescription("ERC-4337 Account Abstraction API with BLS Aggregate Signatures")
    .setVersion("1.0")
    .addBearerAuth()
    .addTag("auth", "User authentication endpoints")
    .addTag("account", "ERC-4337 account management")
    .addTag("transfer", "Transfer operations")
    .addTag("bls", "BLS signature services")
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("api-docs", app, document);

  const port = configService.get<number>("PORT", 3000);
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}/${apiPrefix}`);
  console.log(`📚 API Documentation: http://localhost:${port}/api-docs`);
}

bootstrap();
