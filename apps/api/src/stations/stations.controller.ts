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
import {
  createStationSchema,
  updateStationSchema,
  listStationsQuerySchema,
} from "@evcharge/shared";
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

  @Get(":id")
  @ApiOperation({ summary: "Get station with chargers and connectors" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stationsService.findOne(id, user);
  }

  @Post()
  @ApiOperation({ summary: "Create station (operator+)" })
  create(
    @Body(new ZodValidationPipe(createStationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.create(body as Parameters<StationsService["create"]>[0], user);
  }

  @Patch(":id")
  @ApiOperation({ summary: "Update station" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateStationSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.stationsService.update(id, body as Parameters<StationsService["update"]>[1], user);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete station" })
  remove(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.stationsService.remove(id, user);
  }
}
