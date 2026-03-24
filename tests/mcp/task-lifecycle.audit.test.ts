import { describe, expect, it } from 'vitest';
import { startTask, type LifecycleHandlerDeps } from '../../server/mcp/tasks/handlers.js';
import { TaskLifecycleMachine } from '../../server/mcp/tasks/lifecycle.js';
import type { TaskEventRepository, TaskRecord, TaskRepository, TaskTransitionAudit } from '../../server/mcp/tasks/repository.js';

class SpyTaskRepository implements TaskRepository {
  private readonly tasks = new Map<string, TaskRecord>();
  saveCalls = 0;

  constructor(seed: TaskRecord[]) {
    for (const task of seed) {
      this.tasks.set(task.id, task);
    }
  }

  async getById(taskId: string): Promise<TaskRecord | null> {
    return this.tasks.get(taskId) ?? null;
  }

  async create(taskId: string, initialState: TaskRecord['state']): Promise<void> {
    this.tasks.set(taskId, { id: taskId, state: initialState });
  }

  async saveState(taskId: string, state: TaskRecord['state']): Promise<void> {
    this.saveCalls += 1;
    const existing = this.tasks.get(taskId);
    if (!existing) return;
    this.tasks.set(taskId, { ...existing, state });
  }
}

class SpyEventRepository implements TaskEventRepository {
  appendCalls = 0;
  events: TaskTransitionAudit[] = [];

  async append(event: TaskTransitionAudit): Promise<void> {
    this.appendCalls += 1;
    this.events.push(event);
  }
}

describe('task lifecycle audit', () => {
  it('persists one state update and one audit append per valid transition', async () => {
    const taskRepo = new SpyTaskRepository([{ id: '11', state: 'todo' }]);
    const eventRepo = new SpyEventRepository();
    const deps: LifecycleHandlerDeps = {
      lifecycleMachine: new TaskLifecycleMachine(),
      taskRepository: taskRepo,
      eventRepository: eventRepo,
      now: () => '2026-03-20T10:00:00.000Z',
      isEnforced: () => true,
    };

    const result = await startTask(deps, '11', 'agent-1');

    expect(result.ok).toBe(true);
    expect(taskRepo.saveCalls).toBe(1);
    expect(eventRepo.appendCalls).toBe(1);

    const event = eventRepo.events[0];
    expect(event).toEqual({
      task_id: '11',
      from: 'todo',
      to: 'in_progress',
      event: 'start',
      actor: 'agent-1',
      timestamp: '2026-03-20T10:00:00.000Z',
    });
  });
});
