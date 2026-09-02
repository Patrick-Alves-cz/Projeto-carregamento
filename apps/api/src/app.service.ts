import { Injectable } from "@nestjs/common";
import { APP_NAME } from "@evcharge/shared";

@Injectable()
export class AppService {
  getInfo() {
    return {
      name: APP_NAME,
      version: "0.0.0",
      phase: "phase-2",
    };
  }
}
