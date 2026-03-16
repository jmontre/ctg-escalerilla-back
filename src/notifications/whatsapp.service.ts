import { Client, LocalAuth } from 'whatsapp-web.js';
import * as qrcode from 'qrcode-terminal';

export class WhatsAppService {
  private client: Client;
  private ready = false;

  async initialize() {
    if (process.env.WHATSAPP_ENABLED !== 'true') {
      console.log('⚠️ WhatsApp desactivado (WHATSAPP_ENABLED != true)');
      return;
    }

    console.log('🔄 Inicializando WhatsApp Bot...');

    const dataPath = process.env.WHATSAPP_SESSION_PATH || '.wwebjs_auth';

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath,
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    });

    this.client.on('qr', (qr) => {
      console.log('\n╔════════════════════════════════════════╗');
      console.log('║   ESCANEA CON WHATSAPP BUSINESS        ║');
      console.log('╚════════════════════════════════════════╝\n');
      qrcode.generate(qr, { small: true });
      console.log('\n📱 Escanea el QR de arriba con WhatsApp\n');
    });

    this.client.on('ready', () => {
      console.log('✅ WhatsApp conectado! 🎉');
      this.ready = true;
    });

    this.client.on('authenticated', () => {
      console.log('✅ Autenticado correctamente');
    });

    this.client.on('auth_failure', () => {
      console.log('❌ Error de autenticación');
      this.ready = false;
    });

    this.client.on('disconnected', (reason) => {
      console.log('❌ Desconectado:', reason);
      this.ready = false;
    });

    try {
      await this.client.initialize();
    } catch (error) {
      console.error('❌ Error inicializando WhatsApp:', error);
    }
  }

  async sendMessage(phone: string, message: string) {
    if (!this.ready) {
      console.log('⚠️ WhatsApp no está listo');
      return false;
    }

    try {
      const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
      await this.client.sendMessage(chatId, message);
      return true;
    } catch (error) {
      console.error('❌ Error enviando mensaje:', error);
      return false;
    }
  }

  async sendChallengeNotification(challengerName: string, challengedName: string, challengedPhone: string) {
    return this.sendMessage(challengedPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `¡Tienes un nuevo desafío!\n\n` +
      `*${challengerName}* te ha desafiado.\n\n` +
      `⏰ Tienes *24 horas* para aceptar o rechazar.\n\n` +
      `Ingresa a la app para responder.`
    );
  }

  async sendAcceptedNotification(challengerName: string, challengedName: string, challengerPhone: string) {
    return this.sendMessage(challengerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `✅ *${challengedName}* aceptó tu desafío!\n\n` +
      `⏰ Tienen *5 días* para jugar el partido.\n\n` +
      `Coordinen y no olviden registrar el resultado.`
    );
  }

  async sendRejectedNotification(challengerName: string, challengedName: string, challengerPhone: string) {
    return this.sendMessage(challengerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `${challengedName} rechazó tu desafío.\n\n` +
      `🏆 ¡Ganas por W.O. y subes en la escalerilla!`
    );
  }

  async sendDeadlineReminder(playerName: string, opponentName: string, playerPhone: string, hoursLeft: number) {
    return this.sendMessage(playerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `⏰ *RECORDATORIO*\n\n` +
      `Tu partido contra *${opponentName}* vence en *${hoursLeft} horas*.\n\n` +
      `No olvides jugar y registrar el resultado.`
    );
  }

  isReady() {
    return this.ready;
  }
}

export const whatsappService = new WhatsAppService();