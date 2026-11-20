import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { SoporteRepositoryPort } from '../../domain/ports/soporte.repository.port';
import { CreateSolicitudDto } from '../../application/dtos/create-solicitud.dto';
import { DB_CONNECTIONS } from '../../../../config/database.constants';
import { SolicitudTypeOrmEntity } from '../../domain/entities/solicitud.typeorm-entity';
import { SolicitudItemTypeOrmEntity } from '../../domain/entities/solicitud-item.typeorm-entity';
import { AsignarSoporteDto } from '../../application/dtos/asignar-soporte.dto';
import { ReasignarSoporteDto } from '../../application/dtos/reasignar-soporte.dto';
import { SoporteAsignacionTypeOrmEntity } from '../../domain/entities/asignacion.typeorm-entity';
import { SoporteReasignacionTypeOrmEntity } from '../../domain/entities/reasignacion.typeorm-entity';
import { FinalizarSoporteDto } from '../../application/dtos/finalizar-soporte.dto';
import { SoporteArchivoActaTypeOrmEntity } from '../../domain/entities/acta.typeorm-entity';



@Injectable()
export class PostgresSoporteRepository implements SoporteRepositoryPort {
  private readonly logger = new Logger(PostgresSoporteRepository.name);

  constructor(
    @InjectDataSource(DB_CONNECTIONS.SIGHOV)
    private readonly dataSource: DataSource,
  ) { }

  async crearSolicitudTransaccional(idUsuario: number, dto: CreateSolicitudDto): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Crear instancia de la cabecera usando la entidad de TypeORM
      const nuevaSolicitud = new SolicitudTypeOrmEntity();
      nuevaSolicitud.idUsuario = idUsuario;

      nuevaSolicitud.piso = dto.piso ?? null;
      nuevaSolicitud.oficina = dto.oficina ?? null;
      nuevaSolicitud.consultorio = dto.consultorio ?? null;
      nuevaSolicitud.estado = 'PENDIENTE';

      // Guardamos la cabecera usando el manager del QueryRunner (Transaccional puro TypeORM)
      const solicitudGuardada = await queryRunner.manager.save(nuevaSolicitud);

      const itemsCreados = [];

      // 2. Insertar Detalle usando la entidad de TypeORM
      if (dto.items && dto.items.length > 0) {
        for (const item of dto.items) {
          const nuevoItem = new SolicitudItemTypeOrmEntity();
          nuevoItem.idSolicitud = solicitudGuardada.id; // Usamos el ID generado arriba
          nuevoItem.idTipoSoporte = item.id_tipo_soporte;
          nuevoItem.descripcion = item.descripcion ?? null;

          const itemGuardado = await queryRunner.manager.save(nuevoItem);
          itemsCreados.push(itemGuardado);
        }
      }

      await queryRunner.commitTransaction();

      return {
        idSolicitud: solicitudGuardada.id,
        items: itemsCreados
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error registrando soporte: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException('No se pudo guardar la solicitud de soporte.');
    } finally {
      await queryRunner.release();
    }
  }

  async asignarSoporteTransaccional(idOperador: number, dto: AsignarSoporteDto): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const idSoporte = Number(dto.idTecnico ?? dto.id_soporte);
      let idSolicitudItem = dto.id_solicitud_item;
      let idSolicitudCabecera = dto.idSolicitud;

      // Si desde el frontend nos envían idSolicitud (ej. Ticket #6), buscamos su ítem principal
      if (!idSolicitudItem && idSolicitudCabecera) {
        const items = await queryRunner.query(
          `SELECT id FROM administracion.soporte_solicitud_items WHERE id_solicitud = $1 ORDER BY id ASC LIMIT 1`,
          [idSolicitudCabecera]
        );

        if (items && items.length > 0) {
          idSolicitudItem = items[0].id;
        } else {
          // Si por alguna razón el ticket no tenía ítems, creamos uno por defecto para poder asignarlo
          const nuevoItem = await queryRunner.query(
            `INSERT INTO administracion.soporte_solicitud_items (id_solicitud, id_tipo_soporte, descripcion)
             VALUES ($1, 1, 'Soporte general') RETURNING id`,
            [idSolicitudCabecera]
          );
          idSolicitudItem = nuevoItem[0].id;
        }
      }

      if (!idSolicitudItem || !idSoporte) {
        throw new Error('Faltan datos para asignar el soporte (id_solicitud_item o id_soporte).');
      }

      const prioridadValida = (dto.prioridad || 'NORMAL').toUpperCase();

      const asignacionQuery = `
        INSERT INTO administracion.soporte_asignaciones 
        (id_solicitud_item, id_soporte, id_asignado_por, fecha_asignacion, estado, observacion, prioridad) 
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, 'ASIGNADA', $4, $5) 
        RETURNING id;
      `;

      const asignacionResult = await queryRunner.query(asignacionQuery, [
        idSolicitudItem,
        idSoporte,
        idOperador,
        dto.observacion ?? null,
        prioridadValida,
      ]);
      const idAsignacion = asignacionResult[0].id;

      if (!idSolicitudCabecera) {
        const idSolicitudQuery = `
          SELECT id_solicitud 
          FROM administracion.soporte_solicitud_items 
          WHERE id = $1;
        `;
        const itemResult = await queryRunner.query(idSolicitudQuery, [idSolicitudItem]);

        if (!itemResult || itemResult.length === 0) {
          throw new Error('El ítem de solicitud no existe');
        }
        idSolicitudCabecera = itemResult[0].id_solicitud;
      }

      const updateCabeceraQuery = `
        UPDATE administracion.soporte_solicitudes 
        SET estado = 'ASIGNADA', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1;
      `;
      await queryRunner.query(updateCabeceraQuery, [idSolicitudCabecera]);

      await queryRunner.commitTransaction();

      return {
        id: idAsignacion,
        idAsignacion,
        idSolicitud: idSolicitudCabecera,
        estado: 'ASIGNADA'
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al asignar soporte: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException('No se pudo asignar el soporte.');
    } finally {
      await queryRunner.release();
    }
  }

  async reasignarSoporteTransaccional(
    idAsignacion: number,
    idDeSoporte: number,
    dto: ReasignarSoporteDto,
  ): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Buscar la asignación usando TypeORM puro
      const asignacion = await queryRunner.manager.findOne(SoporteAsignacionTypeOrmEntity, {
        where: { id: idAsignacion, idSoporte: idDeSoporte },
      });

      if (!asignacion) {
        throw new Error('La asignación no existe o no te pertenece.');
      }

      // 2. Insertar en soporte_reasignaciones usando Entidad
      const nuevaReasignacion = new SoporteReasignacionTypeOrmEntity();
      nuevaReasignacion.idAsignacion = idAsignacion;
      nuevaReasignacion.idDeSoporte = idDeSoporte;
      nuevaReasignacion.idASoporte = dto.id_a_soporte;
      nuevaReasignacion.justificacion = dto.justificacion;

      await queryRunner.manager.save(nuevaReasignacion);

      // 3. Actualizar la tabla soporte_asignaciones usando Entidad
      asignacion.idSoporte = Number(dto.id_a_soporte);
      asignacion.estado = 'ASIGNADA';
      asignacion.fechaAsignacion = new Date();

      await queryRunner.manager.save(asignacion);

      // Aseguramos que la solicitud vuelva a ASIGNADA para el nuevo técnico
      await queryRunner.query(
        `UPDATE administracion.soporte_solicitudes s
         SET estado = 'ASIGNADA', updated_at = CURRENT_TIMESTAMP
         FROM administracion.soporte_solicitud_items si
         WHERE si.id_solicitud = s.id AND si.id = $1`,
        [asignacion.idSolicitudItem]
      );

      await queryRunner.commitTransaction();

      return {
        idAsignacion: asignacion.id,
        nuevoTecnico: dto.id_a_soporte,
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al reasignar soporte: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException(error?.message || 'No se pudo reasignar el soporte.');
    } finally {
      await queryRunner.release();
    }

  }

  async finalizarSoporteTransaccional(
    idAsignacion: number,
    idSoporte: number,
    dto: FinalizarSoporteDto,
  ): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Buscar la asignación usando TypeORM puro
      const asignacion = await queryRunner.manager.findOne(SoporteAsignacionTypeOrmEntity, {
        where: { id: idAsignacion, idSoporte: idSoporte },
      });

      if (!asignacion) {
        throw new Error('La asignación no existe o no estás autorizado para finalizarla.');
      }

      if (asignacion.estado === 'FINALIZADA') {
        throw new Error('Esta solicitud ya fue finalizada anteriormente.');
      }

      // 2. Actualizar la tabla soporte_asignaciones (Cierre del ticket usando CURRENT_TIMESTAMP de la BD)
      const cierreResult = await queryRunner.query(
        `UPDATE administracion.soporte_asignaciones
         SET fecha_fin = CURRENT_TIMESTAMP,
             fecha_inicio = COALESCE(fecha_inicio, fecha_asignacion),
             estado = 'FINALIZADA',
             observacion = $1
         WHERE id = $2
         RETURNING fecha_fin`,
        [dto.observacion ?? null, idAsignacion]
      );
      asignacion.fechaFin = cierreResult?.[0]?.fecha_fin ?? new Date();

      // Actualizamos también el estado de la cabecera soporte_solicitudes a FINALIZADA
      await queryRunner.query(
        `UPDATE administracion.soporte_solicitudes s
         SET estado = 'FINALIZADA', updated_at = CURRENT_TIMESTAMP
         FROM administracion.soporte_solicitud_items si
         WHERE si.id_solicitud = s.id AND si.id = $1`,
        [asignacion.idSolicitudItem]
      );

      // 3. Crear el registro del acta/evidencia fotográfica
      const nuevaActa = new SoporteArchivoActaTypeOrmEntity();
      nuevaActa.idAsignacion = idAsignacion;
      nuevaActa.nombreArchivo = dto.nombre_archivo;
      nuevaActa.rutaUrl = dto.ruta_url;
      nuevaActa.tipoMime = dto.tipo_mime ?? null;

      await queryRunner.manager.save(nuevaActa);

      await queryRunner.commitTransaction();

      return {
        idAsignacion: asignacion.id,
        fechaFin: asignacion.fechaFin,
        actaUrl: nuevaActa.rutaUrl
      };

    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al finalizar soporte: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException(error?.message || 'No se pudo finalizar el soporte.');
    } finally {
      await queryRunner.release();
    }
  }
  async obtenerMisSolicitudesUsuario(idUsuario: number, estadoFiltro?: string): Promise<any[]> {
    let query = `
      SELECT 
        s.id,
        s.id as id_solicitud,
        s.id_usuario as "idUsuario",
        s.piso,
        s.oficina,
        s.consultorio,
        s.estado,
        s.created_at as "createdAt",
        s.updated_at as "updatedAt",
        MAX(a.id) as id_asignacion,
        MAX(a.id_soporte) as id_tecnico,
        MAX(a.observacion) as diagnostico,
        MAX(a.prioridad) as prioridad,
        MAX(ac.ruta_url) as url_acta,
        MAX(ac.nombre_archivo) as nombre_archivo_acta,
        MAX(ac.tipo_mime) as tipo_mime_acta,
        MAX(a.fecha_asignacion) as fecha_asignacion,
        MAX(a.fecha_inicio) as fecha_inicio,
        MAX(a.fecha_fin) as fecha_finalizacion,
        MAX(GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_asignacion))))::int) as segundos_desde_asignacion,
        MAX(CASE WHEN a.fecha_inicio IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_inicio))))::int ELSE NULL END) as segundos_desde_inicio,
        MAX(COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''), u.name)) as nombre_tecnico,
        (
          SELECT COUNT(*)::int
          FROM administracion.soporte_re_solicitudes rs2
          WHERE rs2.id_solicitud = s.id
        ) as cantidad_resolicitudes,
        (
          SELECT rs2.motivo
          FROM administracion.soporte_re_solicitudes rs2
          WHERE rs2.id_solicitud = s.id
          ORDER BY rs2.id DESC
          LIMIT 1
        ) as ultima_resolicitud_motivo
      FROM administracion.soporte_solicitudes s
      LEFT JOIN administracion.soporte_solicitud_items si ON si.id_solicitud = s.id
      LEFT JOIN administracion.soporte_asignaciones a ON a.id_solicitud_item = si.id
      LEFT JOIN administracion.soporte_archivos_actas ac ON ac.id_asignacion = a.id
      LEFT JOIN administracion.users u ON u.id = a.id_soporte
      LEFT JOIN administracion.persona p ON p.id = u.id_persona
      WHERE s.id_usuario = $1
    `;

    const params: any[] = [idUsuario];
    if (estadoFiltro) {
      query += ` AND s.estado = $2`;
      params.push(estadoFiltro);
    }

    query += `
      GROUP BY s.id, s.id_usuario, s.piso, s.oficina, s.consultorio, s.estado, s.created_at, s.updated_at
      ORDER BY s.created_at DESC
    `;

    return await this.dataSource.query(query, params);
  }

  // BANDEJA 2: Lo que ve el Operador (Normalmente PENDIENTES)
  // =========================================================
  // BANDEJA OPERADOR: Solicitudes + Alertas de Re-solicitud
  // =========================================================
  async obtenerBandejaOperador(estadoFiltro?: string): Promise<any[]> {
    let query = `
      SELECT 
        s.id as id_solicitud, 
        s.created_at as fecha_solicitud, 
        s.piso, 
        s.oficina, 
        s.estado,
        COUNT(DISTINCT rs.id)::int as cantidad_resolicitudes,
        MAX(COALESCE(to_jsonb(rs)->>'fecha_resolicitud', to_jsonb(rs)->>'fecha', to_jsonb(rs)->>'created_at')) as ultima_resolicitud,
        (
          SELECT rs2.motivo
          FROM administracion.soporte_re_solicitudes rs2
          WHERE rs2.id_solicitud = s.id
          ORDER BY rs2.id DESC
          LIMIT 1
        ) as ultima_resolicitud_motivo,
        
        -- MAPEAMOS TUS COLUMNAS REALES
        MAX(a.id) as id_asignacion,
        MAX(a.id_soporte) as id_tecnico,
        MAX(a.observacion) as diagnostico,
        MAX(a.prioridad) as prioridad,
        MAX(ac.ruta_url) as url_acta,
        MAX(ac.nombre_archivo) as nombre_archivo_acta,
        MAX(ac.tipo_mime) as tipo_mime_acta,
        MAX(a.fecha_asignacion) as fecha_asignacion,
        MAX(a.fecha_inicio) as fecha_inicio,
        MAX(a.fecha_fin) as fecha_finalizacion,
        MAX(GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_asignacion))))::int) as segundos_desde_asignacion,
        MAX(CASE WHEN a.fecha_inicio IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_inicio))))::int ELSE NULL END) as segundos_desde_inicio,
        MAX(COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''), u.name)) as nombre_tecnico,
        (
          SELECT r.justificacion
          FROM administracion.soporte_reasignaciones r
          INNER JOIN administracion.soporte_asignaciones a2 ON r.id_asignacion = a2.id
          INNER JOIN administracion.soporte_solicitud_items si2 ON a2.id_solicitud_item = si2.id
          WHERE si2.id_solicitud = s.id
          ORDER BY r.id DESC
          LIMIT 1
        ) as ultima_reasignacion_motivo
        
      FROM administracion.soporte_solicitudes s
      LEFT JOIN administracion.soporte_re_solicitudes rs ON rs.id_solicitud = s.id
      -- Puente para llegar a las asignaciones a través de los ítems
      LEFT JOIN administracion.soporte_solicitud_items si ON si.id_solicitud = s.id
      LEFT JOIN administracion.soporte_asignaciones a ON a.id_solicitud_item = si.id
      LEFT JOIN administracion.soporte_archivos_actas ac ON ac.id_asignacion = a.id
      -- En tu BD la tabla de usuarios es administracion.users y la persona tiene el nombre completo
      LEFT JOIN administracion.users u ON u.id = a.id_soporte
      LEFT JOIN administracion.persona p ON p.id = u.id_persona
    `;

    const queryParams: any[] = [];

    if (estadoFiltro) {
      query += ` WHERE s.estado = $1`;
      queryParams.push(estadoFiltro);
    }

    // AGRUPAMOS POR EL TICKET PRINCIPAL
    query += `
      GROUP BY 
        s.id, 
        s.created_at, 
        s.piso, 
        s.oficina, 
        s.estado
      ORDER BY s.created_at DESC
    `;

    // Ejecutamos la consulta
    const resultados = await this.dataSource.query(query, queryParams);

    // Calculamos el tiempo de resolución
    return resultados.map((ticket: any) => {
      let tiempo_resolucion = 'No finalizado';

      if (ticket.fecha_asignacion && ticket.fecha_finalizacion) {
        const inicio = new Date(ticket.fecha_asignacion).getTime();
        const fin = new Date(ticket.fecha_finalizacion).getTime();
        const diferenciaMinutos = Math.floor((fin - inicio) / (1000 * 60));

        if (diferenciaMinutos < 60) {
          tiempo_resolucion = `${diferenciaMinutos} minutos`;
        } else {
          const horas = Math.floor(diferenciaMinutos / 60);
          const minutos = diferenciaMinutos % 60;
          tiempo_resolucion = `${horas}h ${minutos}m`;
        }
      }

      return {
        ...ticket,
        tiempo_resolucion,
      };
    });
  }
  // =========================================================
  // BANDEJA ADMINISTRADOR: Tiempos de atención e Historial
  // =========================================================
  async obtenerBandejaAdministrador(estadoFiltro?: string): Promise<any[]> {
    let query = `
      SELECT 
        a.id as id_asignacion,
        s.id as id_solicitud,
        s.oficina,
        a.id_soporte as id_tecnico, 
        a.estado,
        a.fecha_asignacion,
        a.fecha_fin,
        
        -- Calculamos la diferencia en minutos desde que se asignó hasta que finalizó
        COALESCE(EXTRACT(EPOCH FROM (a.fecha_fin - a.fecha_asignacion))/60, 0) as minutos_atencion,
        
        -- Contamos cuántas veces se reasignó este ticket
        (SELECT COUNT(*) FROM administracion.soporte_reasignaciones r WHERE r.id_asignacion = a.id) as cantidad_reasignaciones
      
      FROM administracion.soporte_asignaciones a
      
      -- JOIN con la tabla intermedia 'soporte_solicitud_items'
      INNER JOIN administracion.soporte_solicitud_items si ON a.id_solicitud_item = si.id
      
      -- JOIN con la tabla cabecera 'soporte_solicitudes' para obtener la oficina y el id
      INNER JOIN administracion.soporte_solicitudes s ON si.id_solicitud = s.id
    `;

    const params: any[] = [];
    if (estadoFiltro) {
      query += ` WHERE a.estado = $1`;
      params.push(estadoFiltro);
    }

    query += ` ORDER BY a.fecha_asignacion DESC`;

    return await this.dataSource.query(query, params);
  }

  // BANDEJA 3: Lo que ve el Técnico de Soporte
  async obtenerMisTareasTecnico(idSoporte: number, estadoFiltro?: string): Promise<any[]> {
    let query = `
      SELECT 
        a.id as id_asignacion,
        s.id as id_solicitud,
        s.piso,
        s.oficina,
        s.consultorio,
        a.estado,
        a.prioridad,
        a.fecha_asignacion,
        a.fecha_inicio,
        a.fecha_fin as fecha_finalizacion,
        GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_asignacion))))::int as segundos_desde_asignacion,
        CASE WHEN a.fecha_inicio IS NOT NULL THEN GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (COALESCE(a.fecha_fin, CURRENT_TIMESTAMP) - a.fecha_inicio))))::int ELSE NULL END as segundos_desde_inicio,
        a.observacion as diagnostico,
        (
          SELECT ac.ruta_url
          FROM administracion.soporte_archivos_actas ac
          WHERE ac.id_asignacion = a.id
          ORDER BY ac.id DESC
          LIMIT 1
        ) as url_acta,
        (
          SELECT ac.nombre_archivo
          FROM administracion.soporte_archivos_actas ac
          WHERE ac.id_asignacion = a.id
          ORDER BY ac.id DESC
          LIMIT 1
        ) as nombre_archivo_acta,
        (
          SELECT ac.tipo_mime
          FROM administracion.soporte_archivos_actas ac
          WHERE ac.id_asignacion = a.id
          ORDER BY ac.id DESC
          LIMIT 1
        ) as tipo_mime_acta,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''), u.name) as nombre_tecnico,
        (
          SELECT r.justificacion
          FROM administracion.soporte_reasignaciones r
          WHERE r.id_asignacion = a.id
          ORDER BY r.id DESC
          LIMIT 1
        ) as ultima_reasignacion_motivo,
        (
          SELECT COUNT(*)::int
          FROM administracion.soporte_re_solicitudes rs2
          WHERE rs2.id_solicitud = s.id
        ) as cantidad_resolicitudes,
        (
          SELECT rs2.motivo
          FROM administracion.soporte_re_solicitudes rs2
          WHERE rs2.id_solicitud = s.id
          ORDER BY rs2.id DESC
          LIMIT 1
        ) as ultima_resolicitud_motivo
      FROM administracion.soporte_asignaciones a
      INNER JOIN administracion.soporte_solicitud_items si ON a.id_solicitud_item = si.id
      INNER JOIN administracion.soporte_solicitudes s ON si.id_solicitud = s.id
      LEFT JOIN administracion.users u ON u.id = a.id_soporte
      LEFT JOIN administracion.persona p ON p.id = u.id_persona
      WHERE a.id_soporte = $1
    `;

    const params: any[] = [idSoporte];
    if (estadoFiltro) {
      query += ` AND a.estado = $2`;
      params.push(estadoFiltro);
    }

    query += ` ORDER BY a.fecha_asignacion DESC`;

    return await this.dataSource.query(query, params);
  }

  async resolicitarSoporte(idSolicitud: number, idUsuario: number, observacion?: string): Promise<any> {
    // 1. Verificamos si la solicitud es del usuario, si no está finalizada y obtenemos su ubicación (oficina, piso)
    const solicitud = await this.dataSource.query(
      `SELECT id, estado, piso, oficina, consultorio 
       FROM administracion.soporte_solicitudes 
       WHERE id = $1 AND id_usuario = $2`,
      [idSolicitud, idUsuario]
    );

    if (!solicitud.length) {
      throw new Error('La solicitud no existe o no te pertenece.');
    }

    const ticket = solicitud[0];

    if (ticket.estado === 'FINALIZADA') {
      throw new Error('No puedes re-solicitar un ticket que ya está finalizado.');
    }

    const motivoLimpio = observacion?.trim() || 'El usuario está pidiendo atención nuevamente.';

    // 2. Insertamos el registro de re-solicitud (insistencia) en administracion.soporte_re_solicitudes
    await this.dataSource.query(
      `INSERT INTO administracion.soporte_re_solicitudes (id_solicitud, fecha, motivo) 
       VALUES ($1, CURRENT_TIMESTAMP, $2)`,
      [idSolicitud, motivoLimpio]
    );

    // 3. Buscamos el fcm_token (token_dispositivo) del Técnico asignado a este ticket (si ya tiene uno)
    const rowsTecnico = await this.dataSource.query(
      `SELECT DISTINCT ft.token_dispositivo, a.id_soporte
       FROM administracion.soporte_asignaciones a
       INNER JOIN administracion.soporte_solicitud_items si ON a.id_solicitud_item = si.id
       LEFT JOIN administracion.soporte_fcm_tokens ft ON ft.id_usuario = a.id_soporte
       WHERE si.id_solicitud = $1`,
      [idSolicitud]
    );

    const tokensTecnico: string[] = rowsTecnico
      .map((r: any) => r.token_dispositivo)
      .filter(Boolean);

    // 4. Buscamos los fcm_token (token_dispositivo) de todos los Operadores activos
    const rowsOperadores = await this.dataSource.query(
      `SELECT DISTINCT ft.token_dispositivo, sur.id_usuario
       FROM administracion.soportes_usuarios_roles sur
       INNER JOIN administracion.soporte_fcm_tokens ft ON ft.id_usuario = sur.id_usuario
       WHERE sur.rol_soporte = 'OPERADOR' AND sur.estado = true`
    );

    const tokensOperadores: string[] = rowsOperadores
      .map((r: any) => r.token_dispositivo)
      .filter(Boolean);

    // Unificamos ambos conjuntos sin duplicados para enviar la alerta tanto a Operadores como al Técnico asignado
    const tokensDestino = Array.from(new Set([...tokensTecnico, ...tokensOperadores]));

    return {
      exito: true,
      mensaje: 'Re-solicitud enviada correctamente al operador y al técnico.',
      piso: ticket.piso,
      oficina: ticket.oficina,
      consultorio: ticket.consultorio,
      motivo: motivoLimpio,
      tokensTecnico,
      tokensOperadores,
      tokensDestino,
    };
  }

  async obtenerTokensOperadoresActivos(): Promise<string[]> {
    const rows = await this.dataSource.query(
      `SELECT DISTINCT ft.token_dispositivo
       FROM administracion.soportes_usuarios_roles sur
       INNER JOIN administracion.soporte_fcm_tokens ft ON ft.id_usuario = sur.id_usuario
       WHERE sur.rol_soporte = 'OPERADOR' AND sur.estado = true`
    );
    return rows.map((r: any) => r.token_dispositivo).filter(Boolean);
  }
  // Añade esta función en tu clase PostgresSoporteRepository
  async obtenerItemsDeSolicitud(idSolicitud: number): Promise<any[]> {
    const query = `
      SELECT id, id_tipo_soporte, descripcion 
      FROM administracion.soporte_solicitud_items 
      WHERE id_solicitud = $1
    `;
    return await this.dataSource.query(query, [idSolicitud]);
  }

  async obtenerActaDeSolicitud(idSolicitud: number): Promise<any | null> {
    const query = `
      SELECT 
        ac.id, 
        ac.id_asignacion, 
        ac.nombre_archivo, 
        ac.ruta_url, 
        ac.tipo_mime, 
        ac.created_at
      FROM administracion.soporte_archivos_actas ac
      INNER JOIN administracion.soporte_asignaciones a ON ac.id_asignacion = a.id
      INNER JOIN administracion.soporte_solicitud_items si ON a.id_solicitud_item = si.id
      WHERE si.id_solicitud = $1
      ORDER BY ac.id DESC
      LIMIT 1
    `;
    const rows = await this.dataSource.query(query, [idSolicitud]);
    return rows && rows.length > 0 ? rows[0] : null;
  }

  async agregarItemASolicitud(idSolicitud: number, idTipoSoporte: number, descripcion: string): Promise<any> {
    const query = `
    INSERT INTO administracion.soporte_solicitud_items (id_solicitud, id_tipo_soporte, descripcion)
    VALUES ($1, $2, $3) RETURNING id
  `;
    return await this.dataSource.query(query, [idSolicitud, idTipoSoporte, descripcion]);
  }

  async obtenerTecnicosDisponibles(): Promise<any[]> {
    // Cruza la tabla de roles con administracion.users (y persona) para obtener el nombre
    const query = `
      SELECT 
        u.id, 
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''), u.name) as nombre
      FROM administracion.soportes_usuarios_roles sur
      JOIN administracion.users u ON sur.id_usuario = u.id
      LEFT JOIN administracion.persona p ON p.id = u.id_persona
      WHERE sur.rol_soporte = 'TECNICO' AND sur.estado = true
    `;
    return await this.dataSource.query(query);
  }

  // TÉCNICO: Poner soporte EN_PROCESO
  async ponerEnProcesoSoporte(idSolicitud: number, idSoporte: number): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Actualizamos la asignación del técnico a EN_PROCESO y registramos fecha_inicio
      const asignaciones = await queryRunner.query(
        `UPDATE administracion.soporte_asignaciones a
         SET estado = 'EN_PROCESO', fecha_inicio = COALESCE(a.fecha_inicio, CURRENT_TIMESTAMP)
         FROM administracion.soporte_solicitud_items si
         WHERE a.id_solicitud_item = si.id
           AND si.id_solicitud = $1
           AND a.id_soporte = $2
         RETURNING a.id`,
        [idSolicitud, idSoporte]
      );

      if (!asignaciones || asignaciones.length === 0) {
        throw new Error('No se encontró la asignación de este ticket para tu usuario.');
      }

      // Actualizamos el estado de la cabecera de la solicitud a EN_PROCESO
      await queryRunner.query(
        `UPDATE administracion.soporte_solicitudes
         SET estado = 'EN_PROCESO', updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [idSolicitud]
      );

      await queryRunner.commitTransaction();
      return { exito: true, estado: 'EN_PROCESO' };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al poner en proceso el soporte: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException(error?.message || 'No se pudo poner en proceso el soporte.');
    } finally {
      await queryRunner.release();
    }
  }

  // OPERADOR: Reasignar técnico guardando justificación en soporte_reasignaciones (Opción A)
  async reasignarPorOperador(idSolicitud: number, idNuevoTecnico: number, justificacion: string, prioridad?: string): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // 1. Buscamos la asignación actual del ticket
      const asignacionActual = await queryRunner.query(
        `SELECT a.id, a.id_soporte, a.estado, a.prioridad, s.estado as estado_solicitud
         FROM administracion.soporte_asignaciones a
         INNER JOIN administracion.soporte_solicitud_items si ON a.id_solicitud_item = si.id
         INNER JOIN administracion.soporte_solicitudes s ON si.id_solicitud = s.id
         WHERE si.id_solicitud = $1
         ORDER BY a.id DESC LIMIT 1`,
        [idSolicitud]
      );

      if (!asignacionActual || asignacionActual.length === 0) {
        throw new Error('Este ticket aún no tiene una asignación activa para reasignar.');
      }

      const asignacion = asignacionActual[0];

      if (asignacion.estado === 'EN_PROCESO' || asignacion.estado_solicitud === 'EN_PROCESO') {
        throw new Error('El técnico ya puso este soporte EN PROCESO. No se puede reasignar mientras está siendo atendido.');
      }

      if (Number(asignacion.id_soporte) === Number(idNuevoTecnico)) {
        throw new Error('El ticket ya está asignado a este mismo técnico.');
      }

      // 2. Insertamos el historial en administracion.soporte_reasignaciones
      await queryRunner.query(
        `INSERT INTO administracion.soporte_reasignaciones
         (id_asignacion, id_de_soporte, id_a_soporte, justificacion, fecha)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [asignacion.id, asignacion.id_soporte, idNuevoTecnico, justificacion]
      );

      const prioridadFinal = (prioridad || asignacion.prioridad || 'NORMAL').toUpperCase();

      // 3. Actualizamos el técnico en soporte_asignaciones (desaparece del primer técnico y pasa al nuevo)
      await queryRunner.query(
        `UPDATE administracion.soporte_asignaciones
         SET id_soporte = $1, fecha_asignacion = CURRENT_TIMESTAMP, estado = 'ASIGNADA', prioridad = $2
         WHERE id = $3`,
        [idNuevoTecnico, prioridadFinal, asignacion.id]
      );

      await queryRunner.commitTransaction();
      return {
        exito: true,
        idAsignacion: asignacion.id,
        idDeSoporte: asignacion.id_soporte,
        idASoporte: idNuevoTecnico,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al reasignar por operador: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException(error?.message || 'No se pudo reasignar el soporte.');
    } finally {
      await queryRunner.release();
    }
  }

  // =========================================================
  // GESTIÓN DE ROLES (ADMINISTRADOR)
  // =========================================================

  async esUsuarioAdministrador(idUsuario: number): Promise<boolean> {
    if (!idUsuario) return false;
    const rows = await this.dataSource.query(
      `SELECT rol_soporte
       FROM administracion.soportes_usuarios_roles
       WHERE id_usuario = $1 AND UPPER(rol_soporte) = 'ADMINISTRADOR' AND estado = true
       LIMIT 1`,
      [idUsuario]
    );
    return rows && rows.length > 0;
  }

  async obtenerRolesDeUsuario(idUsuario: number): Promise<string[]> {
    if (!idUsuario) return [];
    const rows = await this.dataSource.query(
      `SELECT DISTINCT UPPER(rol_soporte) as rol
       FROM administracion.soportes_usuarios_roles
       WHERE id_usuario = $1 AND estado = true`,
      [idUsuario]
    );
    return rows.map((r: any) => r.rol);
  }

  private async asegurarEsquemaMultiRol(queryRunner: any): Promise<void> {
    try {
      // Si existía una restricción UNIQUE o PK de una sola columna sobre id_usuario,
      // la reemplazamos por una restricción compuesta (id_usuario, rol_soporte) para permitir múltiples roles por funcionario.
      const constraints = await queryRunner.query(`
        SELECT c.conname, c.contype, pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c
        JOIN pg_namespace n ON n.oid = c.connamespace
        JOIN pg_class t ON t.oid = c.conrelid
        WHERE n.nspname = 'administracion'
          AND t.relname = 'soportes_usuarios_roles'
          AND c.contype IN ('p', 'u')
      `);
      for (const c of constraints || []) {
        const def = String(c.def || '');
        if (def.includes('(id_usuario)') && !def.includes('rol_soporte')) {
          await queryRunner.query(
            `ALTER TABLE administracion.soportes_usuarios_roles DROP CONSTRAINT IF EXISTS "${c.conname}"`
          );
        }
      }
    } catch (_e) {
      // Ignoramos si el usuario de BD no tiene permisos DDL o si ya fue ajustado
    }
  }

  async obtenerUsuariosConRoles(): Promise<any[]> {
    const query = `
      SELECT
        u.id as id_usuario,
        u.name as username,
        u.email,
        COALESCE(
          NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''),
          u.name
        ) as nombre_completo,
        p.ci as ci,
        COALESCE(sur.rol_principal, 'SIN_ROL') as rol_soporte,
        COALESCE(sur.roles_activos, ARRAY[]::text[]) as roles_activos,
        CASE WHEN sur.id_usuario IS NOT NULL AND array_length(sur.roles_activos, 1) > 0 THEN true ELSE false END as tiene_rol_especial
      FROM administracion.users u
      LEFT JOIN administracion.persona p ON p.id = u.id_persona
      LEFT JOIN (
        SELECT
          id_usuario,
          ARRAY_AGG(DISTINCT UPPER(rol_soporte) ORDER BY UPPER(rol_soporte)) as roles_activos,
          MAX(UPPER(rol_soporte)) as rol_principal
        FROM administracion.soportes_usuarios_roles
        WHERE estado = true
        GROUP BY id_usuario
      ) sur ON sur.id_usuario = u.id
      WHERE u.estado = true
      ORDER BY
        CASE WHEN sur.id_usuario IS NOT NULL THEN 0 ELSE 1 END ASC,
        COALESCE(NULLIF(TRIM(CONCAT_WS(' ', p.nombres, p.p_apellido, p.s_apellido)), ''), u.name) ASC
    `;
    return await this.dataSource.query(query);
  }

  async asignarRolUsuario(idUsuario: number, rolSoporte: string): Promise<any> {
    const rolLimpio = String(rolSoporte || '').trim().toUpperCase();
    const rolesPermitidos = ['USUARIO', 'OPERADOR', 'TECNICO', 'ADMINISTRADOR'];
    if (!rolesPermitidos.includes(rolLimpio)) {
      throw new Error('Rol no válido. Solo se permiten USUARIO, OPERADOR, TECNICO o ADMINISTRADOR.');
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.asegurarEsquemaMultiRol(queryRunner);

      // Verificamos si este usuario ya tiene ese rol específico (activo o inactivo)
      const existenteMismoRol = await queryRunner.query(
        `SELECT id_usuario, rol_soporte
         FROM administracion.soportes_usuarios_roles
         WHERE id_usuario = $1 AND UPPER(rol_soporte) = $2
         LIMIT 1`,
        [idUsuario, rolLimpio]
      );

      if (existenteMismoRol && existenteMismoRol.length > 0) {
        await queryRunner.query(
          `UPDATE administracion.soportes_usuarios_roles
           SET estado = true, rol_soporte = $1
           WHERE id_usuario = $2 AND UPPER(rol_soporte) = $1`,
          [rolLimpio, idUsuario]
        );
      } else {
        // Reutilizamos una fila inactiva si existe, o insertamos una nueva fila activa para permitir múltiples roles simultáneos
        const filaInactiva = await queryRunner.query(
          `SELECT rol_soporte
           FROM administracion.soportes_usuarios_roles
           WHERE id_usuario = $1 AND estado = false
           LIMIT 1`,
          [idUsuario]
        );

        if (filaInactiva && filaInactiva.length > 0) {
          await queryRunner.query(
            `UPDATE administracion.soportes_usuarios_roles
             SET rol_soporte = $1, estado = true
             WHERE id_usuario = $2 AND rol_soporte = $3`,
            [rolLimpio, idUsuario, filaInactiva[0].rol_soporte]
          );
        } else {
          await queryRunner.query(
            `INSERT INTO administracion.soportes_usuarios_roles (id_usuario, rol_soporte, estado)
             VALUES ($1, $2, true)`,
            [idUsuario, rolLimpio]
          );
        }
      }

      const rolesActivosRows = await queryRunner.query(
        `SELECT DISTINCT UPPER(rol_soporte) as rol
         FROM administracion.soportes_usuarios_roles
         WHERE id_usuario = $1 AND estado = true`,
        [idUsuario]
      );
      const rolesActivos = rolesActivosRows.map((r: any) => r.rol);

      await queryRunner.commitTransaction();
      return {
        id_usuario: Number(idUsuario),
        rol_soporte: rolLimpio,
        roles_activos: rolesActivos,
        estado: true,
      };
    } catch (error: any) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error al asignar rol a usuario #${idUsuario}: ${error?.message}`, error?.stack);
      throw new InternalServerErrorException(error?.message || 'No se pudo asignar el rol al usuario.');
    } finally {
      await queryRunner.release();
    }
  }

  async quitarRolUsuario(idUsuario: number, rolSoporte?: string): Promise<any> {
    if (rolSoporte && rolSoporte.trim()) {
      const rolLimpio = rolSoporte.trim().toUpperCase();
      await this.dataSource.query(
        `UPDATE administracion.soportes_usuarios_roles
         SET estado = false
         WHERE id_usuario = $1 AND UPPER(rol_soporte) = $2`,
        [idUsuario, rolLimpio]
      );
    } else {
      await this.dataSource.query(
        `UPDATE administracion.soportes_usuarios_roles
         SET estado = false
         WHERE id_usuario = $1`,
        [idUsuario]
      );
    }

    const rolesRestantesRows = await this.dataSource.query(
      `SELECT DISTINCT UPPER(rol_soporte) as rol
       FROM administracion.soportes_usuarios_roles
       WHERE id_usuario = $1 AND estado = true`,
      [idUsuario]
    );
    const rolesRestantes = rolesRestantesRows.map((r: any) => r.rol);

    return {
      id_usuario: Number(idUsuario),
      rol_soporte: rolesRestantes[0] || 'SIN_ROL',
      roles_activos: rolesRestantes,
      estado: rolesRestantes.length > 0,
    };
  }

}

