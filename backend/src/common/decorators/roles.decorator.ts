import { SetMetadata } from '@nestjs/common';
import { RolUsuario } from '../enums/kolab.enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RolUsuario[]) => SetMetadata(ROLES_KEY, roles);
