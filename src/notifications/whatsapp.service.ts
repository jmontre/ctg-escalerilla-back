import { Client, LocalAuth } from 'whatsapp-web.js';
import * as fs from 'fs';
import * as path from 'path';

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

    const lockFiles = [
      path.join(dataPath, 'SingletonLock'),
      path.join(dataPath, 'SingletonCookie'),
      path.join(dataPath, 'SingletonSocket'),
    ];

    for (const lockFile of lockFiles) {
      if (fs.existsSync(lockFile)) {
        fs.unlinkSync(lockFile);
        console.log(`🧹 Eliminado: ${lockFile}`);
      }
    }

    const findAndDeleteLocks = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findAndDeleteLocks(fullPath);
        } else if (['SingletonLock', 'SingletonCookie', 'SingletonSocket'].includes(entry.name)) {
          fs.unlinkSync(fullPath);
          console.log(`🧹 Eliminado: ${fullPath}`);
        }
      }
    };

    findAndDeleteLocks(dataPath);

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath,
      }),
      puppeteer: {
        headless: true,
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--single-process',
        ],
      },
    });

    this.client.on('qr', (qr) => {
      console.log('\n╔════════════════════════════════════════════════════════════╗');
      console.log('║       GENERA TU QR EN https://qr.io                       ║');
      console.log('╚════════════════════════════════════════════════════════════╝\n');
      console.log('📋 COPIA ESTE TEXTO COMPLETO:\n');
      console.log('┌─────────────────────────────────────────────────────────┐');
      console.log(qr);
      console.log('└─────────────────────────────────────────────────────────┘\n');
      console.log('👉 PASOS:');
      console.log('   1. Ve a https://qr.io');
      console.log('   2. Pega el texto de arriba en el campo "Text"');
      console.log('   3. Genera el QR');
      console.log('   4. Escanéalo con WhatsApp en tu teléfono\n');
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

  private formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/[\s\-\(\)]/g, '');
    
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    
    if (!cleaned.startsWith('56')) {
      if (cleaned.startsWith('9')) {
        cleaned = '56' + cleaned;
      } else {
        console.warn(`⚠️ Número sospechoso: ${phone} -> ${cleaned}`);
      }
    }
    
    console.log(`📱 Formateando: ${phone} -> ${cleaned}@c.us`);
    return cleaned + '@c.us';
  }

  async sendMessage(phone: string, message: string) {
    if (!this.ready) {
      console.log('⚠️ WhatsApp no está listo');
      return false;
    }

    try {
      const chatId = this.formatPhoneNumber(phone);
      
      const numberExists = await this.client.isRegisteredUser(chatId);
      
      if (!numberExists) {
        console.error(`❌ El número ${phone} (${chatId}) NO está registrado en WhatsApp`);
        return false;
      }
      
      await this.client.sendMessage(chatId, message);
      console.log(`✅ Mensaje enviado exitosamente a ${phone} (${chatId})`);
      return true;
    } catch (error) {
      console.error(`❌ Error enviando mensaje a ${phone}:`, error.message || error);
      return false;
    }
  }

  async sendChallengeNotification(challengerName: string, challengedName: string, challengedPhone: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://ctg-escalerilla-front.vercel.app';
    
    return this.sendMessage(challengedPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `¡Tienes un nuevo desafío!\n` +
      `*${challengerName}* te ha desafiado.\n\n` +
      `⏰ Tienes 24 horas para responder.\n\n` +
      `👉 Ver mis desafíos:\n` +
      `${appUrl}/fixture`
    );
  }

  async sendAcceptedNotification(challengerName: string, challengedName: string, challengerPhone: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://ctg-escalerilla-front.vercel.app';
    
    return this.sendMessage(challengerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `✅ *${challengedName}* aceptó tu desafío!\n\n` +
      `⏰ Tienen 5 días para jugar.\n\n` +
      `👉 Coordinar partido:\n` +
      `${appUrl}/fixture`
    );
  }

  async sendRejectedNotification(challengerName: string, challengedName: string, challengerPhone: string) {
    const appUrl = process.env.FRONTEND_URL || 'https://ctg-escalerilla-front.vercel.app';
    
    return this.sendMessage(challengerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `❌ ${challengedName} rechazó tu desafío.\n\n` +
      `🏆 Ganas por W.O. y subes en la escalerilla!\n\n` +
      `👉 Ver escalerilla:\n` +
      `${appUrl}`
    );
  }

  async sendDeadlineReminder(playerName: string, opponentName: string, playerPhone: string, hoursLeft: number) {
    const appUrl = process.env.FRONTEND_URL || 'https://ctg-escalerilla-front.vercel.app';
    
    return this.sendMessage(playerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `⏰ *RECORDATORIO*\n\n` +
      `Tu partido contra *${opponentName}* vence en ${hoursLeft} horas.\n\n` +
      `👉 Reportar resultado:\n` +
      `${appUrl}/fixture`
    );
  }

  async sendPasswordResetLink(playerName: string, playerPhone: string, resetLink: string) {
    return this.sendMessage(playerPhone,
      `🎾 *Club de Tenis Graneros*\n\n` +
      `Hola *${playerName}*\n\n` +
      `Solicitud de cambio de contraseña.\n\n` +
      `👉 Cambiar contraseña:\n` +
      `${resetLink}\n\n` +
      `⏰ Expira en 1 hora.`
    );
  }

  isReady() {
    return this.ready;
  }
}

export const whatsappService = new WhatsAppService();
