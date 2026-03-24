import { Controller, Post, Get, Body } from '@nestjs/common';
import { whatsappService } from '../notifications/whatsapp.service';

@Controller('test')
export class TestController {
  @Post('whatsapp')
  async testWhatsapp(@Body() body: { phone: string; message: string }) {
    console.log(`📱 Enviando mensaje a ${body.phone}...`);
    const result = await whatsappService.sendMessage(body.phone, body.message);
    return { success: result, phone: body.phone };
  }

  @Get('grupos')
  async getGroups() {
    const groups = await whatsappService.getGroups();
    return { groups };
  }
}