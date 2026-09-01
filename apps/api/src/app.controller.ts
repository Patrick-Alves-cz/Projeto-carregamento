import { Controller, Get } from "@nestjs/common";
import { Public } from "./common/decorators/auth.decorators";
import { AppService } from "./app.service";

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Public()
  @Get()
  getInfo() {
    return this.appService.getInfo();
  }
}
