import {
  Controller,
  Get,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { HealthTask } from './entities/daily-task-assignment.entity';
import { TaskAssignmentService } from './assignment/task-assignment.service';

interface AuthenticatedRequest extends Request {
  user?: {
    sub?: string;
    userId?: string;
    id?: string;
  };
}

@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(
    private readonly taskAssignmentService: TaskAssignmentService,
  ) {}

  @Get('today')
  async getTodayTasks(@Req() req: AuthenticatedRequest): Promise<HealthTask[]> {
    const userId = req.user?.sub ?? req.user?.userId ?? req.user?.id;

    if (!userId) {
      throw new UnauthorizedException('User not found in request context');
    }

    return this.taskAssignmentService.getTodayTasksForUser(userId);
  }
}
