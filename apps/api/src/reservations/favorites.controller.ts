import { Body, Controller, Delete, Get, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { z } from "zod";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { FavoritesService } from "./favorites.service";

const bodySchema = z.object({
  stationId: z.string().cuid(),
  connectorId: z.string().cuid().optional(),
});

@ApiTags("favorites")
@ApiBearerAuth()
@Controller("favorites")
export class FavoritesController {
  constructor(private readonly favorites: FavoritesService) {}

  @Get()
  @Roles(UserRole.DRIVER)
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.favorites.list(user);
  }

  @Post()
  @Roles(UserRole.DRIVER)
  add(
    @Body(new ZodValidationPipe(bodySchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const input = body as { stationId: string; connectorId?: string };
    return this.favorites.add(user, input.stationId, input.connectorId);
  }

  @Delete(":stationId")
  @Roles(UserRole.DRIVER)
  remove(@Param("stationId") stationId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.favorites.remove(user, stationId);
  }
}
