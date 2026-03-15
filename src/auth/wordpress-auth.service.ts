import { Injectable, UnauthorizedException } from '@nestjs/common';

@Injectable()
export class WordPressAuthService {
  private readonly wpUrl: string;

  constructor() {
    this.wpUrl = process.env.WORDPRESS_URL || 'https://clubdetenisgraneros.cl';
  }

  /**
   * Verificar sesión de WordPress usando las cookies
   */
  async verifySession(cookies: string): Promise<WordPressUser> {
    console.log('🌐 WordPress URL:', this.wpUrl);
    console.log('🍪 Cookies a enviar:', cookies.substring(0, 100) + '...');
    
    try {
      const url = `${this.wpUrl}/wp-json/ctg/v1/me`;
      console.log('📡 Haciendo request a:', url);
      
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Cookie': cookies,
          'User-Agent': 'NestJS-WordPress-Auth/1.0'
        }
      });

      console.log('📊 Response status:', response.status);
      console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
      
      const responseText = await response.text();
      console.log('📄 Response body:', responseText.substring(0, 200));

      if (!response.ok) {
        console.log('❌ Response no OK');
        throw new UnauthorizedException('Sesión de WordPress inválida');
      }

      const data = JSON.parse(responseText);
      console.log('✅ Data parseada:', data);
      
      return {
        id: data.id,
        username: data.username,
        name: data.name,
        email: data.email,
        roles: data.roles
      };
    } catch (error) {
      console.error('💥 Error completo:', error);
      throw new UnauthorizedException('No se pudo verificar la sesión de WordPress');
    }
  }
}

export interface WordPressUser {
  id: number;
  username: string;
  name: string;
  email: string;
  roles: string[];
}