import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity({ schema: 'administracion', name: 'soporte_asignaciones' })
export class SoporteAsignacionTypeOrmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'id_solicitud_item', type: 'integer' })
  idSolicitudItem: number;

  @Column({ name: 'id_soporte', type: 'bigint' })
  idSoporte: number;

  @Column({ name: 'id_asignado_por', type: 'bigint' })
  idAsignadoPor: number;

  @CreateDateColumn({ name: 'fecha_asignacion' })
  fechaAsignacion: Date;

  @Column({ name: 'fecha_inicio', type: 'timestamp', nullable: true })
  fechaInicio: Date | null;

  @Column({ name: 'fecha_fin', type: 'timestamp', nullable: true })
  fechaFin: Date | null;

  @Column({ type: 'varchar', length: 50, default: 'ASIGNADA' })
  estado: string;

  @Column({ type: 'text', nullable: true })
  observacion: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, default: 'NORMAL' })
  prioridad: string | null;
}