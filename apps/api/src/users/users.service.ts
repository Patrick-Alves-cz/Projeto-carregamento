import { Injectable } from "@nestjs/common";
import { NotFoundError } from "@evcharge/domain";
import type { UpdateProfileInput } from "@evcharge/shared";
import { PrismaService } from "../common/database/database.module";

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        profile: true,
        companyMembers: { include: { company: true } },
      },
    });
    if (!user) throw new NotFoundError("User", userId);
    return this.formatUser(user);
  }

  async updateMe(userId: string, input: UpdateProfileInput) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError("User", userId);

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        profile: {
          update: {
            fullName: input.fullName,
            phone: input.phone,
            avatarUrl: input.avatarUrl,
            ...(user.role !== "DRIVER" ? { document: input.document } : {}),
          },
        },
      },
      include: {
        profile: true,
        companyMembers: { include: { company: true } },
      },
    });

    return this.formatUser(updated);
  }

  private formatUser(user: {
    id: string;
    email: string;
    role: string;
    status: string;
    createdAt: Date;
    profile: {
      fullName: string;
      phone: string | null;
      avatarUrl: string | null;
      document: string | null;
    } | null;
    companyMembers: { role: string; company: { id: string; name: string; slug: string } }[];
  }) {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      status: user.status,
      createdAt: user.createdAt,
      profile: user.profile
        ? {
            fullName: user.profile.fullName,
            phone: user.profile.phone,
            avatarUrl: user.profile.avatarUrl,
          }
        : null,
      companies: user.companyMembers.map((m) => ({
        memberRole: m.role,
        ...m.company,
      })),
    };
  }
}
