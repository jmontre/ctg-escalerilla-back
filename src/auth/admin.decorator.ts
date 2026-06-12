import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_KEY = 'requiresAdmin';
/** Exige is_admin: true en el payload del JWT. */
export const Admin = () => SetMetadata(IS_ADMIN_KEY, true);
