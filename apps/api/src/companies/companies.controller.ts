import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { createCompanySchema, updateCompanySchema } from "@evcharge/shared";
import { Roles } from "../common/decorators/auth.decorators";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { AuthenticatedUser } from "../common/types/auth.types";
import { CompaniesService } from "./companies.service";

@ApiTags("companies")
@ApiBearerAuth()
@Controller("companies")
export class CompaniesController {
  constructor(private companiesService: CompaniesService) {}

  @Get(":id")
  @Roles(UserRole.OPERATOR, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Get company by ID" })
  findOne(@Param("id") id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.companiesService.findOne(id, user);
  }

  @Post()
  @Roles(UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Create company (super_admin only)" })
  create(
    @Body(new ZodValidationPipe(createCompanySchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.create(body as Parameters<CompaniesService["create"]>[0], user);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Update company" })
  update(
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateCompanySchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.companiesService.update(id, body as Parameters<CompaniesService["update"]>[1], user);
  }
}
