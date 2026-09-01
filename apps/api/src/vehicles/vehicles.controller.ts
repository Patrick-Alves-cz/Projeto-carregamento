import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { createVehicleSchema, updateVehicleSchema } from "@evcharge/shared";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { VehiclesService } from "./vehicles.service";

@ApiTags("vehicles")
@ApiBearerAuth()
@Controller("vehicles")
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Get()
  @ApiOperation({ summary: "List own vehicles" })
  findAll(@CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findAll(user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get vehicle by ID" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create vehicle" })
  create(
    @Body(new ZodValidationPipe(createVehicleSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.create(body as Parameters<VehiclesService["create"]>[0], user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update vehicle" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.vehiclesService.update(id, body as Parameters<VehiclesService["update"]>[1], user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete vehicle" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.vehiclesService.remove(id, user);
  }
}
