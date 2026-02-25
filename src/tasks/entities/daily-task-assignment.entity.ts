import {
  Column,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryColumn,
  Unique,
} from 'typeorm';
import { User } from '../../entities/user.entity';

@Entity('health_tasks')
export class HealthTask {
  @PrimaryColumn({ type: 'varchar' })
  id: string;
}

@Entity('health_task_completions')
export class HealthTaskCompletion {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @PrimaryColumn({ name: 'task_id', type: 'varchar' })
  taskId: string;

  @PrimaryColumn({ name: 'completed_at', type: 'timestamp' })
  completedAt: Date;
}

@Entity('daily_task_assignments')
@Unique(['user', 'assignedDate'])
export class DailyTaskAssignment {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @ManyToOne(() => User, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToMany(() => HealthTask)
  @JoinTable({
    name: 'daily_task_assignment_tasks',
    joinColumn: {
      name: 'daily_task_assignment_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'health_task_id',
      referencedColumnName: 'id',
    },
  })
  tasks: HealthTask[];

  @Column({ type: 'date', name: 'assigned_date' })
  assignedDate: string;
}
