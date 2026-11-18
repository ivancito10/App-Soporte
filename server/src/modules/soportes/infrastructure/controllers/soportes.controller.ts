import {
  Controller, Post, Patch, Body, Req, UseGuards, UseFilters,
  Param, ParseIntPipe, UseInterceptors, UploadedFile, BadRequestException, ForbiddenException, Inject
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { multerSoporteConfig } from '../config/multer-soporte.config';
import { AuthGuard } from '@nestjs/passport';
import { CreateSolicitudUseCase } from '../../application/use-cases/create-solicitud.use-case';
import { CreateSolicitudDto } from '../../application/dtos/create-solicitud.dto';
import { SoporteExceptionFilter } from '../filters/soporte-exception.filter';
import { AsignarSoporteUseCase } from '../../application/use-cases/asignar-soporte.use-case';
import { AsignarSoporteDto } from '../../application/dtos/asignar-soporte.dto';
import { ReasignarSoporteUseCase } from '../../application/use-cases/reasignar-soporte.use-case';
import { ReasignarSoporteDto } from '../../application/dtos/reasignar-soporte.dto';
import { FinalizarSoporteUseCase } from '../../application/use-cases/finalizar-soporte.use-case';
import { FinalizarSoporteDto } from '../../application/dtos/finalizar-soporte.dto';
import { Get, Query } from '@nestjs/common';
import { ListarBandejasUseCase } from '../../application/use-cases/listar-bandejas.use-case';
import { BandejaSoporteDto } from '../../application/dtos/bandeja-soporte.dto';


@Controller('soportes')
@UseGuards(AuthGuard('jwt'))
@UseFilters(SoporteExceptionFilter) // <-- Aplicado el filtro
export class SoportesController {
  constructor(
    private readonly createUseCase: CreateSolicitudUseCase,
    private readonly asignarUseCase: AsignarSoporteUseCase,
    private readonly reasignarUseCase: ReasignarSoporteUseCase,
    private readonly finalizarUseCase: FinalizarSoporteUseCase,
    private readonly listarBandejasUseCase: ListarBandejasUseCase,

    @Inject('SoporteRepositoryPort') private readonly soporteRepo: any,
    @Inject('NotificationServicePort') private readonly notificationService: any
  ) { }

  @Post('solicitud')
  async crear(@Req() req: any, @Body() dto: CreateSolicitudDto) {
    const idUsuario = req.user.id;

    // CORRECCIÓN 4: Primero va idUsuario, luego dto
    const response = await this.createUseCase.ejecutar(idUsuario, dto);

    return {
      status: 201,
      success: response.exito,
      message: response.mensaje,
      data: response.datos
    };
  }
  @Post('asignar')
  async asignarSoporte(@Body() dto: AsignarSoporteDto, @Req() req: any) {
    const idOperador = req.user?.id;
    const response = await this.asignarUseCase.ejecutar(idOperador, dto);

    return {
      status: 201,
      success: response.exito,
      message: response.mensaje,
      data: response.datos
    };
  }

  @Post('asignacion/:id/reasignar')
  async reasignarSoporte(
    @Param('id', ParseIntPipe) idAsignacion: number,
    @Body() dto: ReasignarSoporteDto,
    @Req() req: any
  ) {
    const idDeSoporte = req.user?.id; // Técnico actual logueado
    const response = await this.reasignarUseCase.ejecutar(idAsignacion, idDeSoporte, dto);

    return {
      status: 200,
      success: response.exito,
      message: response.mensaje,
      data: response.datos
    };
  }

  @Post('asignacion/:id/finalizar')
  @UseInterceptors(FileInterceptor('archivo', multerSoporteConfig)) // 'archivo' es el key que enviará React Native
  async finalizarSoporte(
    @Param('id', ParseIntPipe) idAsignacion: number,
    @UploadedFile() file: Express.Multer.File, // <-- Captura el archivo físico
    @Body('observacion') observacion: string,
    @Req() req: any
  ) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar el acta (Imagen o PDF) para finalizar el soporte.');
    }
    if (!observacion || !observacion.trim()) {
      throw new BadRequestException('El diagnóstico u observación del trabajo realizado es obligatorio para finalizar el soporte.');
    }

    const idSoporte = req.user?.id;

    // Mapeamos los datos del archivo físico guardado a nuestro DTO
    const dto: FinalizarSoporteDto = {
      nombre_archivo: file.originalname,
      ruta_url: `/uploads/soportes/actas/${file.filename}`, // Ruta local que se guardará en BD
      tipo_mime: file.mimetype,
      observacion: observacion || null,
    };

    const response = await this.finalizarUseCase.ejecutar(idAsignacion, idSoporte, dto);

    return {
      status: 200,
      success: response.exito,
      message: response.mensaje,
      data: response.datos
    };
  }

  @Get('bandeja')
  async listarBandeja(
    @Query() dto: BandejaSoporteDto,
    @Req() req: any
  ) {
    const idUsuario = req.user?.id;
    const response = await this.listarBandejasUseCase.ejecutar(idUsuario, dto);

    return {
      status: 200,
      success: response.exito,
      message: response.mensaje,
      data: response.datos
    };
  }
  @Post('solicitud/:id/resolicitar')
  async resolicitar(
    @Param('id', ParseIntPipe) idSolicitud: number,
    @Body() body: { observacion?: string; motivo?: string },
    @Req() req: any
  ) {
    const idUsuario = req.user.id;
    const motivo = body?.observacion || body?.motivo;

    // 1. Registra la insistencia en soporte_re_solicitudes y obtiene los tokens FCM del Técnico asignado y de los Operadores
    const response = await this.soporteRepo.resolicitarSoporte(idSolicitud, idUsuario, motivo);

    // 2. Formateamos la ubicación tal como pide la Fase 4 (ej. "Odontología Piso 1")
    const pisoFormateado = response.piso
      ? /^(piso|planta)/i.test(String(response.piso).trim())
        ? String(response.piso).trim()
        : `Piso ${String(response.piso).trim()}`
      : '';
    const ubicacion = [response.oficina, pisoFormateado].filter(Boolean).join(' ') || `Ticket #${idSolicitud}`;

    const mensajeAlerta = `⚠️ Insistencia: El usuario de ${ubicacion} requiere atención demorada`;

    // 3. Disparamos la notificación Push hacia los celulares de los Operadores y del Técnico asignado
    if (response.tokensDestino && response.tokensDestino.length > 0) {
      this.notificationService
        .enviarNotificacion(
          response.tokensDestino,
          `⚠️ Insistencia - Ticket #${idSolicitud}`,
          mensajeAlerta,
          {
            idSolicitud: idSolicitud.toString(),
            oficina: String(response.oficina || ''),
            piso: String(response.piso || ''),
            motivo: String(response.motivo || ''),
          },
        )
        .catch((e: any) => console.log('Fallo notificación push en insistencia:', e));
    }

    return {
      status: 201,
      success: true,
      message: response.mensaje,
      alerta: mensajeAlerta,
    };
  }

  @Get('solicitud/:id/items')
  async obtenerItemsSolicitud(@Param('id') id: string) {
    const items = await this.soporteRepo.obtenerItemsDeSolicitud(parseInt(id, 10));
    return {
      exito: true,
      datos: items
    };
  }

  @Get('solicitud/:id/acta')
  async obtenerActaSolicitud(@Param('id', ParseIntPipe) idSolicitud: number) {
    const acta = await this.soporteRepo.obtenerActaDeSolicitud(idSolicitud);
    return {
      exito: true,
      datos: acta
    };
  }
  @Post('solicitud/:id/items')
  async agregarItem(
    @Param('id') id: string,
    @Body() body: { id_tipo_soporte: number, descripcion: string }
  ) {
    await this.soporteRepo.agregarItemASolicitud(parseInt(id, 10), body.id_tipo_soporte, body.descripcion);
    return { exito: true, mensaje: 'Problema añadido correctamente' };
  }

  @Get('tecnicos/disponibles')
  async obtenerTecnicos() {
    const tecnicos = await this.soporteRepo.obtenerTecnicosDisponibles();
    return { exito: true, datos: tecnicos };
  }

  @Post('solicitud/:id/en-proceso')
  async ponerEnProceso(
    @Param('id', ParseIntPipe) idSolicitud: number,
    @Req() req: any
  ) {
    const idSoporte = req.user?.id;
    const resultado = await this.soporteRepo.ponerEnProcesoSoporte(idSolicitud, idSoporte);
    return {
      status: 200,
      success: true,
      message: 'El soporte ha sido puesto EN PROCESO.',
      data: resultado
    };
  }

  @Post('solicitud/:id/reasignar-operador')
  async reasignarPorOperador(
    @Param('id', ParseIntPipe) idSolicitud: number,
    @Body() body: { idTecnico: number; justificacion: string; prioridad?: string }
  ) {
    if (!body.idTecnico || !body.justificacion?.trim()) {
      throw new BadRequestException('Debes seleccionar un nuevo técnico e ingresar el motivo de la reasignación.');
    }

    const resultado = await this.soporteRepo.reasignarPorOperador(
      idSolicitud,
      Number(body.idTecnico),
      body.justificacion.trim(),
      body.prioridad
    );

    return {
      status: 200,
      success: true,
      message: 'El soporte fue reasignado correctamente.',
      data: resultado
    };
  }

  // =========================================================
  // ENDPOINTS DE GESTIÓN DE ROLES (EXCLUSIVO ADMINISTRADOR)
  // =========================================================

  private async verificarRolAdministrador(req: any) {
    const rolToken = String(req.user?.rolSoporte || '').toUpperCase();
    const rolesToken: string[] = Array.isArray(req.user?.rolesSoporte)
      ? req.user.rolesSoporte.map((r: any) => String(r).toUpperCase())
      : [];

    if (rolToken === 'ADMINISTRADOR' || rolesToken.includes('ADMINISTRADOR')) return;

    const esAdminEnBd = await this.soporteRepo.esUsuarioAdministrador(Number(req.user?.id));
    if (!esAdminEnBd) {
      throw new ForbiddenException('Acceso denegado: Solo un usuario con rol ADMINISTRADOR puede gestionar roles.');
    }
  }

  @Get('roles/usuarios')
  async listarUsuariosConRoles(@Req() req: any) {
    await this.verificarRolAdministrador(req);
    const usuarios = await this.soporteRepo.obtenerUsuariosConRoles();
    return {
      status: 200,
      exito: true,
      success: true,
      datos: usuarios,
      data: usuarios,
    };
  }

  @Post('roles/asignar')
  async asignarRol(
    @Body() body: { id_usuario?: number; idUsuario?: number; rol_soporte?: string; rolSoporte?: string },
    @Req() req: any
  ) {
    await this.verificarRolAdministrador(req);

    const idUsuarioDestino = Number(body.id_usuario ?? body.idUsuario);
    const rolSoporte = String(body.rol_soporte ?? body.rolSoporte ?? '').trim().toUpperCase();

    if (!idUsuarioDestino || !rolSoporte) {
      throw new BadRequestException('Debes proporcionar id_usuario y rol_soporte (OPERADOR, TECNICO o ADMINISTRADOR).');
    }

    const idAdminActual = Number(req.user?.id);
    // El Administrador sí puede asignarse un segundo rol adicional (ej. OPERADOR) sin perder su rol ADMINISTRADOR

    const resultado = await this.soporteRepo.asignarRolUsuario(idUsuarioDestino, rolSoporte);
    return {
      status: 200,
      exito: true,
      success: true,
      mensaje: `Rol ${rolSoporte} asignado correctamente.`,
      message: `Rol ${rolSoporte} asignado correctamente.`,
      datos: resultado,
      data: resultado,
    };
  }

  @Patch('roles/:idUsuario/quitar')
  async quitarRol(
    @Param('idUsuario', ParseIntPipe) idUsuario: number,
    @Body() body: { rol_soporte?: string; rolSoporte?: string },
    @Req() req: any
  ) {
    await this.verificarRolAdministrador(req);

    const rolAQuitar = (body?.rol_soporte ?? body?.rolSoporte)?.trim().toUpperCase();
    const idAdminActual = Number(req.user?.id);

    if (idAdminActual === Number(idUsuario) && (!rolAQuitar || rolAQuitar === 'ADMINISTRADOR')) {
      throw new BadRequestException('Por seguridad, no puedes quitarte el rol de ADMINISTRADOR a ti mismo.');
    }

    const resultado = await this.soporteRepo.quitarRolUsuario(idUsuario, rolAQuitar);
    return {
      status: 200,
      exito: true,
      success: true,
      mensaje: rolAQuitar
        ? `Rol ${rolAQuitar} quitado correctamente.`
        : 'Roles revocados correctamente. El funcionario vuelve a ser USUARIO por defecto.',
      message: rolAQuitar
        ? `Rol ${rolAQuitar} quitado correctamente.`
        : 'Roles revocados correctamente. El funcionario vuelve a ser USUARIO por defecto.',
      datos: resultado,
      data: resultado,
    };
  }
}