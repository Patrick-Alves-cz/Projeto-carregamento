import { Global, Injectable, Module, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@evcharge/database";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  async onModuleInit() {
    await this.$connect();
  }
}

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
