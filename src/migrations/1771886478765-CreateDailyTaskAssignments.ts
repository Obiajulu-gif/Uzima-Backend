import {
  MigrationInterface,
  QueryRunner,
  Table,
  TableForeignKey,
  TableIndex,
  TableUnique,
} from 'typeorm';

export class CreateDailyTaskAssignments1771886478765
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    const usersTable = await queryRunner.getTable('users');
    const healthTasksTable = await queryRunner.getTable('health_tasks');

    const userIdColumnType = usersTable?.findColumnByName('id')?.type ?? 'uuid';
    const healthTaskIdColumnType =
      healthTasksTable?.findColumnByName('id')?.type ?? 'uuid';

    await queryRunner.createTable(
      new Table({
        name: 'daily_task_assignments',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
            default: 'uuid_generate_v4()',
          },
          {
            name: 'user_id',
            type: userIdColumnType,
            isNullable: false,
          },
          {
            name: 'assigned_date',
            type: 'date',
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createUniqueConstraint(
      'daily_task_assignments',
      new TableUnique({
        name: 'UQ_daily_task_assignments_user_assigned_date',
        columnNames: ['user_id', 'assigned_date'],
      }),
    );

    await queryRunner.createIndex(
      'daily_task_assignments',
      new TableIndex({
        name: 'IDX_daily_task_assignments_user_assigned_date',
        columnNames: ['user_id', 'assigned_date'],
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignments',
      new TableForeignKey({
        name: 'FK_daily_task_assignments_user_id',
        columnNames: ['user_id'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createTable(
      new Table({
        name: 'daily_task_assignment_tasks',
        columns: [
          {
            name: 'daily_task_assignment_id',
            type: 'uuid',
            isPrimary: true,
            isNullable: false,
          },
          {
            name: 'health_task_id',
            type: healthTaskIdColumnType,
            isPrimary: true,
            isNullable: false,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'daily_task_assignment_tasks',
      new TableIndex({
        name: 'IDX_daily_task_assignment_tasks_assignment_id',
        columnNames: ['daily_task_assignment_id'],
      }),
    );

    await queryRunner.createIndex(
      'daily_task_assignment_tasks',
      new TableIndex({
        name: 'IDX_daily_task_assignment_tasks_health_task_id',
        columnNames: ['health_task_id'],
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignment_tasks',
      new TableForeignKey({
        name: 'FK_daily_task_assignment_tasks_assignment_id',
        columnNames: ['daily_task_assignment_id'],
        referencedTableName: 'daily_task_assignments',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );

    await queryRunner.createForeignKey(
      'daily_task_assignment_tasks',
      new TableForeignKey({
        name: 'FK_daily_task_assignment_tasks_health_task_id',
        columnNames: ['health_task_id'],
        referencedTableName: 'health_tasks',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const dailyTaskAssignmentTasksTable = await queryRunner.getTable(
      'daily_task_assignment_tasks',
    );

    if (dailyTaskAssignmentTasksTable) {
      for (const foreignKey of dailyTaskAssignmentTasksTable.foreignKeys) {
        await queryRunner.dropForeignKey(
          'daily_task_assignment_tasks',
          foreignKey,
        );
      }
    }

    const dailyTaskAssignmentsTable = await queryRunner.getTable(
      'daily_task_assignments',
    );

    if (dailyTaskAssignmentsTable) {
      for (const foreignKey of dailyTaskAssignmentsTable.foreignKeys) {
        await queryRunner.dropForeignKey('daily_task_assignments', foreignKey);
      }
    }

    await queryRunner.dropTable('daily_task_assignment_tasks', true);
    await queryRunner.dropIndex(
      'daily_task_assignments',
      'IDX_daily_task_assignments_user_assigned_date',
    );
    await queryRunner.dropUniqueConstraint(
      'daily_task_assignments',
      'UQ_daily_task_assignments_user_assigned_date',
    );
    await queryRunner.dropTable('daily_task_assignments', true);
  }
}
