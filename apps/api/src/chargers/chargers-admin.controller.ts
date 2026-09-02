import { Body, Controller, Param, Post } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ForbiddenError, NotFoundError } from "@evcharge/domain";
import { z } from "zod";
import { ChargerStatus, ConnectorStatus } from "@prisma/client";
import { ZodValidationPipe } from "../common/pipes/zod-validation.pipe";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { AuthenticatedUser } from "../common/types/auth.types";
import { TenantAccessService } from "../common/services/tenant-access.service";
import { PrismaService } from "../common/database/database.module";
import { ChargerProviderService } from "../charging/charger-provider.service";
import { ChargingEventsService } from "../charging/charging-events.service";

const chargerActionSchema = z.object({
  action: z.enum(["offline", "maintenance", "fault", "restore"]),
});

@ApiTags("chargers-admin")
@ApiBearerAuth()
@Controller("chargers")
export class ChargersAdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantAccess: TenantAccessService,
    private readonly chargerProviderService: ChargerProviderService,
    private readonly events: ChargingEventsService,
  ) {}

  @Post(":id/demo-action")
  @ApiOperation({ summary: "Demo administrative action on a charger" })
  async demoAction(
    @Param("id") chargerId: string,
    @Body(new ZodValidationPipe(chargerActionSchema)) body: unknown,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    this.tenantAccess.assertOperatorOrAbove(user);

    const { action } = body as z.infer<typeof chargerActionSchema>;

    const charger = await this.prisma.charger.findUnique({
      where: { id: chargerId },
      include: { station: true, connectors: true },
    });
    if (!charger) throw new NotFoundError("Charger", chargerId);
    this.tenantAccess.assertCompanyAccess(user, charger.station.companyId);

    const mock = this.chargerProviderService.mockProvider;
    if (!mock) throw new ForbiddenError("Demo actions only available with mock provider");

    let newStatus: ChargerStatus;
    let connectorStatus: ConnectorStatus;

    switch (action) {
      case "offline":
        await mock.disconnect(chargerId);
        newStatus = ChargerStatus.OFFLINE;
        connectorStatus = ConnectorStatus.UNAVAILABLE;
        break;
      case "maintenance":
        newStatus = ChargerStatus.UNAVAILABLE;
        connectorStatus = ConnectorStatus.UNAVAILABLE;
        for (const c of charger.connectors) {
          await mock.setAvailability(chargerId, c.number, "unavailable");
        }
        break;
      case "fault":
        newStatus = ChargerStatus.FAULTED;
        connectorStatus = ConnectorStatus.FAULTED;
        for (const c of charger.connectors) {
          await mock.setAvailability(chargerId, c.number, "faulted");
        }
        break;
      case "restore":
        await mock.restart(chargerId);
        await mock.connect(chargerId);
        newStatus = ChargerStatus.AVAILABLE;
        connectorStatus = ConnectorStatus.AVAILABLE;
        break;
      default:
        throw new ForbiddenError("Invalid action");
    }

    await this.prisma.charger.update({
      where: { id: chargerId },
      data: { status: newStatus, lastSeenAt: new Date() },
    });

    if (action === "restore" || action === "offline") {
      await this.prisma.connector.updateMany({
        where: { chargerId },
        data: { status: connectorStatus },
      });
    }

    await this.events.publish({
      type: "charger.status.changed",
      entityType: "charger",
      entityId: chargerId,
      timestamp: new Date(),
      payload: { chargerId, status: newStatus, action },
    });

    return { chargerId, action, status: newStatus };
  }
}
