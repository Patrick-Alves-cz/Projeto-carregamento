import { Body, Controller, Get, Post, Req, Res } from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import {
  loginSchema,
  registerSchema,
  refreshTokenSchema,
  logoutSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from "@evcharge/shared";
import { Public } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { AuthService } from "./auth.service";
import { clearAuthCookies, setAuthCookies } from "../common/auth/auth-cookies";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("register")
  @ApiOperation({
    summary: "Register a DRIVER account",
    description:
      "Public registration is restricted to DRIVER. ADMIN/OPERATOR must be provisioned internally.",
  })
  async register(
    @Body(new ZodValidationPipe(registerSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(
      body as Parameters<AuthService["register"]>[0],
    );
    setAuthCookies(res, result);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post("login")
  @ApiOperation({ summary: "Login" })
  async login(
    @Body(new ZodValidationPipe(loginSchema)) body: unknown,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(body as Parameters<AuthService["login"]>[0]);
    setAuthCookies(res, result);
    return result;
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post("refresh")
  @ApiOperation({ summary: "Refresh access token. Reuse of a revoked token invalidates the family." })
  async refresh(
    @Body(new ZodValidationPipe(refreshTokenSchema)) body: { refreshToken: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      body.refreshToken ||
      (typeof req.cookies?.evcharge_refresh === "string" ? req.cookies.evcharge_refresh : "");
    const result = await this.authService.refresh(token);
    setAuthCookies(res, result);
    return result;
  }

  @Public()
  @Post("logout")
  @ApiOperation({ summary: "Logout and revoke the refresh token family" })
  async logout(
    @Body(new ZodValidationPipe(logoutSchema)) body: { refreshToken: string },
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token =
      body.refreshToken ||
      (typeof req.cookies?.evcharge_refresh === "string" ? req.cookies.evcharge_refresh : "");
    const result = await this.authService.logout(token);
    clearAuthCookies(res);
    return result;
  }

  @Get("me")
  @ApiBearerAuth()
  @ApiCookieAuth()
  @ApiOperation({
    summary: "Get current authenticated user",
    description: "Does not return document/CPF. Profile is limited to name, phone and avatar.",
  })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.id);
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post("forgot-password")
  @ApiOperation({
    summary: "Request a password reset",
    description:
      "Always returns a generic message. In non-production, a resetToken is included for local DEMO testing and is never written to logs.",
  })
  forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: unknown,
  ) {
    const { email } = body as { email: string };
    return this.authService.forgotPassword(email);
  }

  @Public()
  @Throttle({ default: { limit: 8, ttl: 60000 } })
  @Post("reset-password")
  @ApiOperation({
    summary: "Reset password with a one-time token",
    description: "Invalidates existing refresh tokens after a successful reset.",
  })
  resetPassword(
    @Body(new ZodValidationPipe(resetPasswordSchema)) body: unknown,
  ) {
    const { token, password } = body as { token: string; password: string };
    return this.authService.resetPassword(token, password);
  }
}
