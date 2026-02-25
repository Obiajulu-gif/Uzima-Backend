import { randomUUID } from 'crypto';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { getRedisUrl, redisConfig } from '../../config/redis.config';
import { User } from '../../entities/user.entity';
import {
  DailyTaskAssignment,
  HealthTask,
  HealthTaskCompletion,
} from '../entities/daily-task-assignment.entity';

@Injectable()
export class TaskAssignmentService implements OnModuleDestroy {
  private readonly logger = new Logger(TaskAssignmentService.name);
  private readonly redis: Redis;

  private readonly DAILY_TASK_LIMIT = 5;

  constructor(
    @InjectRepository(DailyTaskAssignment)
    private readonly dailyTaskAssignmentRepository: Repository<DailyTaskAssignment>,
    @InjectRepository(HealthTask)
    private readonly healthTaskRepository: Repository<HealthTask>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {
    const config = redisConfig(this.configService);

    this.redis = new Redis(getRedisUrl(config), {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 1000,
    });

    this.redis.on('error', (error: Error) => {
      this.logger.warn(`Redis error: ${error.message}`);
    });
  }

  async onModuleDestroy(): Promise<void> {
    this.redis.disconnect();
  }

  async getTodayTasksForUser(userId: string): Promise<HealthTask[]> {
    const today = this.getTodayDateString();
    const cacheKey = this.getCacheKey(userId, today);

    const cachedTasks = await this.getCachedTasks(cacheKey);
    if (cachedTasks !== null) {
      this.logger.debug(`Cache hit for ${cacheKey}`);
      return cachedTasks;
    }

    this.logger.debug(`Cache miss for ${cacheKey}`);

    const existingAssignment = await this.dailyTaskAssignmentRepository.findOne({
      where: {
        user: { id: userId },
        assignedDate: today,
      },
      relations: ['tasks'],
    });

    if (existingAssignment) {
      const tasks = existingAssignment.tasks ?? [];
      await this.setCachedTasks(cacheKey, tasks);
      return tasks;
    }

    const tasks = await this.createTodayAssignment(userId, today);
    await this.setCachedTasks(cacheKey, tasks);

    return tasks;
  }

  private async createTodayAssignment(
    userId: string,
    assignedDate: string,
  ): Promise<HealthTask[]> {
    try {
      const savedAssignment = await this.dataSource.transaction(
        async (entityManager): Promise<DailyTaskAssignment> => {
          const assignmentRepository =
            entityManager.getRepository(DailyTaskAssignment);
          const taskRepository = entityManager.getRepository(HealthTask);

          const existingAssignment = await assignmentRepository.findOne({
            where: {
              user: { id: userId },
              assignedDate,
            },
            relations: ['tasks'],
          });

          if (existingAssignment) {
            return existingAssignment;
          }

          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

          const eligibleTasks = await taskRepository
            .createQueryBuilder('task')
            .where((qb) => {
              const completionSubquery = qb
                .subQuery()
                .select('1')
                .from(HealthTaskCompletion, 'completion')
                .where('completion.task_id = task.id')
                .andWhere('completion.user_id = :userId')
                .andWhere('completion.completed_at >= :sevenDaysAgo')
                .getQuery();

              return `NOT EXISTS ${completionSubquery}`;
            })
            .setParameters({
              userId,
              sevenDaysAgo,
            })
            .orderBy('task.id', 'ASC')
            .take(this.DAILY_TASK_LIMIT)
            .getMany();

          const assignment = assignmentRepository.create({
            id: randomUUID(),
            user: { id: userId } as User,
            assignedDate,
            tasks: eligibleTasks,
          });

          const createdAssignment = await assignmentRepository.save(assignment);

          this.logger.log(
            `Created daily assignment for user ${userId} on ${assignedDate} with ${eligibleTasks.length} task(s)`,
          );

          return assignmentRepository.findOneOrFail({
            where: { id: createdAssignment.id },
            relations: ['tasks'],
          });
        },
      );

      return savedAssignment.tasks ?? [];
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        const existingAssignment = await this.dailyTaskAssignmentRepository.findOne(
          {
            where: {
              user: { id: userId },
              assignedDate,
            },
            relations: ['tasks'],
          },
        );

        if (existingAssignment) {
          return existingAssignment.tasks ?? [];
        }
      }

      throw error;
    }
  }

  private async getCachedTasks(cacheKey: string): Promise<HealthTask[] | null> {
    const redisReady = await this.ensureRedisReady();
    if (!redisReady) {
      return null;
    }

    try {
      const cachedValue = await this.redis.get(cacheKey);
      if (!cachedValue) {
        return null;
      }

      const parsedValue: unknown = JSON.parse(cachedValue);
      if (!Array.isArray(parsedValue)) {
        return null;
      }

      return parsedValue as HealthTask[];
    } catch (error) {
      this.logger.warn(
        `Failed to read daily task cache (${cacheKey}): ${(error as Error).message}`,
      );

      return null;
    }
  }

  private async setCachedTasks(
    cacheKey: string,
    tasks: HealthTask[],
  ): Promise<void> {
    const redisReady = await this.ensureRedisReady();
    if (!redisReady) {
      return;
    }

    const ttl = this.getSecondsUntilEndOfDay();

    try {
      await this.redis.set(cacheKey, JSON.stringify(tasks), 'EX', ttl);
    } catch (error) {
      this.logger.warn(
        `Failed to write daily task cache (${cacheKey}): ${(error as Error).message}`,
      );
    }
  }

  private async ensureRedisReady(): Promise<boolean> {
    if (this.redis.status === 'ready') {
      return true;
    }

    if (this.redis.status === 'connecting') {
      return false;
    }

    try {
      await this.redis.connect();
      return true;
    } catch (error) {
      this.logger.warn(
        `Redis unavailable, bypassing cache: ${(error as Error).message}`,
      );

      return false;
    }
  }

  private getCacheKey(userId: string, date: string): string {
    return `daily_tasks:${userId}:${date}`;
  }

  private getTodayDateString(): string {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  private getSecondsUntilEndOfDay(): number {
    const now = new Date();
    const endOfDay = new Date(now);

    endOfDay.setHours(23, 59, 59, 999);

    return Math.max(1, Math.ceil((endOfDay.getTime() - now.getTime()) / 1000));
  }

  private isUniqueViolation(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) {
      return false;
    }

    const driverError = error.driverError as { code?: string };
    return driverError?.code === '23505';
  }
}
