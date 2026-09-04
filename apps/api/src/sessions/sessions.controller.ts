import { Body, Controller, Get, Headers, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import {
  listSessionsQuerySchema,
  sessionIdParamSchema,
  startSessionSchema,
  stopSessionSchema,
} from "@evcharge/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/auth.decorators";
import { AuthenticatedUser } from "../common/types/auth.types";
import { SessionsService } from "./sessions.service";

function readIdempotencyKey(header: string | undefined, bodyKey?: string): string | undefined {
  const fromHeader = header?.trim();
  if (fromHeader && fromHeader.length >= 8) return fromHeader;
  return bodyKey;
}

@ApiTags("sessions")
@ApiBearerAuth()
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post("start")
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({
    summary: "Start a charging session",
    description:
      "DRIVER only. Validates vehicle × connector compatibility. Same Idempotency-Key returns the original session. Connector states: AVAILABLE → PREPARING → CHARGING. Session states: PENDING → PREPARING → ACTIVE.",
  })
  start(
    @Body(new ZodValidationPipe(startSessionSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyHeader?: string,
  ) {
    const input = body as Parameters<SessionsService["start"]>[0];
    return this.sessionsService.start(
      {
        ...input,
        idempotencyKey: readIdempotencyKey(idempotencyHeader, input.idempotencyKey),
      },
      user,
    );
  }

  @Post(":id/stop")
  @ApiHeader({ name: "Idempotency-Key", required: false })
  @ApiOperation({
    summary: "Stop an active charging session",
    description: "Same Idempotency-Key for an already stopped session returns the completed session.",
  })
  stop(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @Body(new ZodValidationPipe(stopSessionSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
    @Headers("idempotency-key") idempotencyHeader?: string,
  ) {
    const { id } = params as { id: string };
    const { idempotencyKey } = (body ?? {}) as { idempotencyKey?: string };
    return this.sessionsService.stop(id, user, readIdempotencyKey(idempotencyHeader, idempotencyKey));
  }

  @Post(":id/pause")
  @ApiOperation({ summary: "Pause an active charging session and halt mock metering" })
  pause(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.pause(id, user);
  }

  @Post(":id/resume")
  @ApiOperation({ summary: "Resume a paused charging session and restart mock metering" })
  resume(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.resume(id, user);
  }

  @Get("active/live")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "List active sessions for operator live view (company-scoped)" })
  listActiveLive(@CurrentUser() user: AuthenticatedUser) {
    return this.sessionsService.getActiveSessionsForOperator(user);
  }

  @Get()
  @ApiOperation({ summary: "List charging sessions with filters" })
  findAll(
    @Query(new ZodValidationPipe(listSessionsQuerySchema)) query: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionsService.findAll(query as Parameters<SessionsService["findAll"]>[0], user);
  }

  @Get(":id/receipt")
  @ApiOperation({ summary: "Get the logical receipt for a finished session" })
  receipt(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.getReceipt(id, user);
  }

  @Get(":id")
  @ApiOperation({ summary: "Get charging session detail" })
  findOne(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.findOne(id, user);
  }
}
