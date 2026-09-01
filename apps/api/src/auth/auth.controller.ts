import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  logoutSchema,
} from "@evcharge/shared";
import { Public } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuthService } from "./auth.service";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("register")
  @ApiOperation({ summary: "Register a new user" })
  register(@Body(new ZodValidationPipe(registerSchema)) body: unknown) {
    return this.authService.register(body as Parameters<AuthService["register"]>[0]);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  @ApiOperation({ summary: "Login" })
  login(@Body(new ZodValidationPipe(loginSchema)) body: unknown) {
    return this.authService.login(body as Parameters<AuthService["login"]>[0]);
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token" })
  refresh(@Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string }) {
    return this.authService.refresh(body.refreshToken);
  }

  @Public()
  @Post("logout")
  @ApiOperation({ summary: "Logout and revoke refresh token" })
  logout(@Body(new ZodValidationPipe(logoutSchema)) body: { refreshToken: string }) {
    return this.authService.logout(body.refreshToken);
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current authenticated user" })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }
}
