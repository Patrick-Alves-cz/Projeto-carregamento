import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createChargerSchema, updateChargerSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { ChargersService } from "./chargers.service";

@ApiTags("chargers")
@ApiBearerAuth()
@Controller("chargers")
export class ChargersController {
  constructor(private chargersService: ChargersService) {}

  @Get()
  @ApiOperation({ summary: "List chargers" })
  findAll(
    @Query("stationId") stationId: string | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chargersService.findAll(stationId, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get charger by ID" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.chargersService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create charger" })
  create(
    @Body(new ZodValidationPipe(createChargerSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chargersService.create(body as Parameters<ChargersService["create"]>[0], user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update charger" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateChargerSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.chargersService.update(id, body as Parameters<ChargersService["update"]>[1], user);
  }
}
