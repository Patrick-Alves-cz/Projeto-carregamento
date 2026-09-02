import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import {
  listSessionsQuerySchema,
  sessionIdParamSchema,
  startSessionSchema,
} from "@evcharge/shared";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/auth.types";
import { SessionsService } from "./sessions.service";

@ApiTags("sessions")
@ApiBearerAuth()
@Controller("sessions")
export class SessionsController {
  constructor(private readonly sessionsService: SessionsService) {}

  @Post("start")
  @ApiOperation({ summary: "Start a charging session" })
  start(
    @Body(new ZodValidationPipe(startSessionSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.sessionsService.start(body as Parameters<SessionsService["start"]>[0], user);
  }

  @Post(":id/stop")
  @ApiOperation({ summary: "Stop an active charging session" })
  stop(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.stop(id, user);
  }

  @Post(":id/pause")
  @ApiOperation({ summary: "Pause an active charging session" })
  pause(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.pause(id, user);
  }

  @Post(":id/resume")
  @ApiOperation({ summary: "Resume a paused charging session" })
  resume(
    @Param(new ZodValidationPipe(sessionIdParamSchema)) params: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    const { id } = params as { id: string };
    return this.sessionsService.resume(id, user);
  }

  @Get("active/live")
  @ApiOperation({ summary: "List active sessions for operator live view" })
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
