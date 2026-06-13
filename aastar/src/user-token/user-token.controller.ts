import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  Query,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { UserTokenService, CreateUserTokenDto, UpdateUserTokenDto } from "./user-token.service";
import { AccountService } from "../account/account.service";

@ApiTags("user-tokens")
@Controller("user-tokens")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UserTokenController {
  constructor(
    private readonly userTokenService: UserTokenService,
    private readonly accountService: AccountService
  ) {}

  @Get()
  @ApiOperation({ summary: "Get user's token list" })
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: "boolean",
    description: "Show only active tokens",
  })
  @ApiQuery({
    name: "withBalances",
    required: false,
    type: "boolean",
    description: "Include token balances",
  })
  @ApiResponse({
    status: 200,
    description: "User's token list",
  })
  async getUserTokens(
    @Request() req,
    @Query("activeOnly") activeOnly?: boolean,
    @Query("withBalances") withBalances?: boolean
  ) {
    const userId = req.user.sub;

    if (withBalances) {
      try {
        const accountAddress = await this.accountService.getAccountAddress(userId);
        if (!accountAddress) {
          // Return tokens without balances if no account exists
          return this.userTokenService.getUserTokens(userId, activeOnly !== false);
        }
        return this.userTokenService.getUserTokensWithBalances(userId, accountAddress);
      } catch (_error) {
        // If account service fails, still return tokens without balances
        return this.userTokenService.getUserTokens(userId, activeOnly !== false);
      }
    }

    return this.userTokenService.getUserTokens(userId, activeOnly !== false);
  }

  @Post()
  @ApiOperation({ summary: "Add a token to user's list" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        address: { type: "string", description: "Token contract address" },
        symbol: {
          type: "string",
          description: "Token symbol (optional, will be fetched if not provided)",
        },
        name: {
          type: "string",
          description: "Token name (optional, will be fetched if not provided)",
        },
        decimals: {
          type: "number",
          description: "Token decimals (optional, will be fetched if not provided)",
        },
        logoUrl: { type: "string", description: "Token logo URL" },
      },
      required: ["address"],
    },
  })
  @ApiResponse({
    status: 201,
    description: "Token added successfully",
  })
  async addUserToken(@Request() req, @Body() tokenData: CreateUserTokenDto) {
    const userId = req.user.sub;
    return this.userTokenService.addUserToken(userId, tokenData);
  }

  @Put(":tokenId")
  @ApiOperation({ summary: "Update a user token" })
  @ApiParam({ name: "tokenId", description: "Token ID" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        isActive: { type: "boolean", description: "Whether token is active" },
        sortOrder: { type: "number", description: "Sort order" },
        logoUrl: { type: "string", description: "Token logo URL" },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Token updated successfully",
  })
  async updateUserToken(
    @Request() req,
    @Param("tokenId") tokenId: string,
    @Body() updateData: UpdateUserTokenDto
  ) {
    const userId = req.user.sub;
    return this.userTokenService.updateUserToken(userId, tokenId, updateData);
  }

  @Delete(":tokenId")
  @ApiOperation({ summary: "Remove a token from user's list (soft delete)" })
  @ApiParam({ name: "tokenId", description: "Token ID" })
  @ApiResponse({
    status: 200,
    description: "Token removed successfully",
  })
  async removeUserToken(@Request() req, @Param("tokenId") tokenId: string) {
    const userId = req.user.sub;
    await this.userTokenService.removeUserToken(userId, tokenId);
    return { message: "Token removed successfully" };
  }

  @Delete(":tokenId/permanent")
  @ApiOperation({ summary: "Permanently delete a token from user's list" })
  @ApiParam({ name: "tokenId", description: "Token ID" })
  @ApiResponse({
    status: 200,
    description: "Token deleted permanently",
  })
  async deleteUserToken(@Request() req, @Param("tokenId") tokenId: string) {
    const userId = req.user.sub;
    await this.userTokenService.deleteUserToken(userId, tokenId);
    return { message: "Token deleted permanently" };
  }

  @Get("search")
  @ApiOperation({ summary: "Search and filter user tokens" })
  @ApiQuery({ name: "query", required: false, description: "Search query" })
  @ApiQuery({
    name: "customOnly",
    required: false,
    type: "boolean",
    description: "Show only custom tokens",
  })
  @ApiQuery({
    name: "activeOnly",
    required: false,
    type: "boolean",
    description: "Show only active tokens",
  })
  @ApiResponse({
    status: 200,
    description: "Filtered token list",
  })
  async searchUserTokens(
    @Request() req,
    @Query("query") query?: string,
    @Query("customOnly") customOnly?: boolean,
    @Query("activeOnly") activeOnly?: boolean
  ) {
    const userId = req.user.sub;

    const filters: any = {};
    if (query) filters.query = query;
    if (customOnly !== undefined) filters.customOnly = customOnly === true;
    if (activeOnly !== undefined) filters.activeOnly = activeOnly !== false;

    return this.userTokenService.searchUserTokens(userId, filters);
  }

  @Post("initialize-defaults")
  @ApiOperation({ summary: "Initialize default tokens for user" })
  @ApiResponse({
    status: 201,
    description: "Default tokens initialized",
  })
  async initializeDefaultTokens(@Request() req) {
    const userId = req.user.sub;
    return this.userTokenService.initializeDefaultTokens(userId);
  }

  @Put("reorder")
  @ApiOperation({ summary: "Update token order for user" })
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        tokenOrders: {
          type: "array",
          items: {
            type: "object",
            properties: {
              tokenId: { type: "string" },
              sortOrder: { type: "number" },
            },
          },
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: "Token order updated",
  })
  async updateTokensOrder(
    @Request() req,
    @Body() body: { tokenOrders: { tokenId: string; sortOrder: number }[] }
  ) {
    const userId = req.user.sub;
    await this.userTokenService.updateTokensOrder(userId, body.tokenOrders);
    return { message: "Token order updated successfully" };
  }
}
