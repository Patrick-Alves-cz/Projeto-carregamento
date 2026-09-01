import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createConnectorSchema, updateConnectorSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ConnectorsService } from "./connectors.service";

@ApiTags("connectors")
@ApiBearerAuth()
@Controller("connectors")
export class ConnectorsController {
  constructor(private connectorsService: ConnectorsService) {}

  @Get()
  @ApiOperation({ summary: "List connectors" })
  findAll(
    @Query("chargerId") chargerId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectorsService.findAll(chargerId, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get connector by ID" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.connectorsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create connector" })
  create(
    @Body(new ZodValidationPipe(createConnectorSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectorsService.create(body as Parameters<ConnectorsService["create"]>[0], user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update connector" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateConnectorSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.connectorsService.update(id, body as Parameters<ConnectorsService["update"]>[1], user);
  }
}
