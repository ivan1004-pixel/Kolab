import { UseGuards } from '@nestjs/common';
import { Args, ID, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolUsuario } from '../common/enums/kolab.enums';
import { GqlAuthGuard } from '../common/guards/gql-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import {
  AdminCreateUsuarioInput,
  AdminUpdateUsuarioInput,
  UpdatePerfilInput,
  UpdatePreferenciasInput,
} from './dto/usuario.input';
import { Usuario } from './schemas/usuario.schema';
import { UsersService } from './users.service';

@Resolver(() => Usuario)
export class UsersResolver {
  constructor(private readonly usersService: UsersService) {}

  @Query(() => Usuario, { description: 'Obtiene el perfil del usuario autenticado' })
  @UseGuards(GqlAuthGuard)
  async miPerfil(@CurrentUser() user: AuthenticatedUser): Promise<Usuario> {
    return this.usersService.findById(user.userId);
  }

  @Mutation(() => Usuario, { description: 'RF-51: Editar perfil del usuario' })
  @UseGuards(GqlAuthGuard)
  async actualizarPerfil(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: UpdatePerfilInput,
  ): Promise<Usuario> {
    return this.usersService.updatePerfil(user.userId, input);
  }

  @Mutation(() => Usuario, { description: 'RF-53: Configurar preferencias de usuario' })
  @UseGuards(GqlAuthGuard)
  async actualizarPreferencias(
    @CurrentUser() user: AuthenticatedUser,
    @Args('input') input: UpdatePreferenciasInput,
  ): Promise<Usuario> {
    return this.usersService.updatePreferencias(user.userId, input);
  }

  @Mutation(() => Usuario, { description: 'Inscribir asignatura en la tira de materias (RF-07)' })
  @UseGuards(GqlAuthGuard)
  async inscribirAsignatura(
    @CurrentUser() user: AuthenticatedUser,
    @Args('asignaturaId', { type: () => ID }) asignaturaId: string,
  ): Promise<Usuario> {
    return this.usersService.enrollAsignatura(user.userId, asignaturaId);
  }

  @Mutation(() => Boolean, { description: 'RF-54: Eliminar cuenta y baja de datos personales' })
  @UseGuards(GqlAuthGuard)
  async eliminarMiCuenta(@CurrentUser() user: AuthenticatedUser): Promise<boolean> {
    return this.usersService.softDeleteAccount(user.userId);
  }

  // --- Administración (RF-31) ---
  @Query(() => [Usuario], { description: 'RF-31: Listar usuarios (Solo Administrador)' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async usuarios(): Promise<Usuario[]> {
    return this.usersService.findAll();
  }

  @Mutation(() => Usuario, { description: 'RF-31: Crear usuario y asignar rol' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async adminCrearUsuario(
    @Args('input') input: AdminCreateUsuarioInput,
  ): Promise<Usuario> {
    return this.usersService.adminCreateUsuario(input);
  }

  @Mutation(() => Usuario, { description: 'RF-31: Editar o dar de baja usuario' })
  @UseGuards(GqlAuthGuard, RolesGuard)
  @Roles(RolUsuario.ADMINISTRADOR)
  async adminActualizarUsuario(
    @Args('id', { type: () => ID }) id: string,
    @Args('input') input: AdminUpdateUsuarioInput,
  ): Promise<Usuario> {
    return this.usersService.adminUpdateUsuario(id, input);
  }
}
