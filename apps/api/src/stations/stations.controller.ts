import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import {
  createStationSchema,
  updateStationSchema,
  listStationsQuerySchema,
  nearbyStationsQuerySchema,
  stationDetailQuerySchema,
} from "@evcharge/shared";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { StationsService } from "./stations.service";

@ApiTags("stations")
@ApiBearerAuth()
@Controller("stations")
export class StationsController {
  constructor(private stationsService: StationsService) {}

  @Get()
  @ApiOperation({ summary: "List stations with optional geo filters" })
  findAll(
    @Query(new ZodValidationPipe(listStationsQuerySchema)) query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.findAll(query as Parameters<StationsService["findAll"]>[0], user);
  }

  @Get("nearby")
  @ApiOperation({ summary: "Discover nearby stations for the driver map" })
  nearby(
    @Query(new ZodValidationPipe(nearbyStationsQuerySchema)) query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.findNearby(
      query as Parameters<StationsService["findNearby"]>[0],
      user,
    );
  }

  @Get(":id")
  @ApiOperation({ summary: "Get station with chargers and connectors" })
  findOne(
    @Param("id") id: string,
    @Query(new ZodValidationPipe(stationDetailQuerySchema)) query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const parsed = query as { vehicleId?: string };
    return this.stationsService.findOne(id, user, parsed.vehicleId);
  }

  @Post()
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create station (operator+)" })
  create(
    @Body(new ZodValidationPipe(createStationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.create(body as Parameters<StationsService["create"]>[0], user);
  }

  @Patch(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update station" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.update(id, body as Parameters<StationsService["update"]>[1], user);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Delete station" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stationsService.remove(id, user);
  }
}
