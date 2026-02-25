import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  DailyTaskAssignment,
  HealthTask,
  HealthTaskCompletion,
} from '../entities/daily-task-assignment.entity';
import { TasksController } from '../tasks.controller';
import { TaskAssignmentService } from './task-assignment.service';

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([
      DailyTaskAssignment,
      HealthTask,
      HealthTaskCompletion,
    ]),
  ],
  controllers: [TasksController],
  providers: [TaskAssignmentService],
  exports: [TaskAssignmentService],
})
export class TaskAssignmentModule {}
