/**
 * Result of DAG analysis (generic over task type)
 */
export interface DAGAnalysis<T> {
  // Tasks in topological order
  sorted: T[];

  // Execution levels (tasks at same level can run in parallel)
  levels: T[][];

  // Tasks with no dependencies (can start immediately)
  entryPoints: T[];

  // Tasks that nothing depends on (final tasks)
  exitPoints: T[];
}

/**
 * Topologically sort tasks based on dependencies
 * Uses Kahn's algorithm
 */
export function topologicalSort<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[]
): T[] {
  const graph = new Map<string, string[]>();
  const inDegree = new Map<string, number>();
  const taskMap = new Map<string, T>();

  // Initialize
  for (const task of tasks) {
    graph.set(task.id, []);
    inDegree.set(task.id, 0);
    taskMap.set(task.id, task);
  }

  // Build graph
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      graph.get(dep)?.push(task.id);
      inDegree.set(task.id, (inDegree.get(task.id) ?? 0) + 1);
    }
  }

  // Kahn's algorithm
  const queue = tasks.filter(t => (inDegree.get(t.id) ?? 0) === 0);
  const result: T[] = [];

  while (queue.length > 0) {
    const task = queue.shift()!;
    result.push(task);

    for (const next of graph.get(task.id) ?? []) {
      const newDegree = (inDegree.get(next) ?? 0) - 1;
      inDegree.set(next, newDegree);

      if (newDegree === 0) {
        const nextTask = taskMap.get(next);
        if (nextTask) queue.push(nextTask);
      }
    }
  }

  if (result.length !== tasks.length) {
    throw new Error('Circular dependency detected in task graph');
  }

  return result;
}

/**
 * Get tasks that are ready to execute
 * (all dependencies are in completed set)
 */
export function getReadyTasks<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[],
  completed: Set<string>,
  running: Set<string> = new Set()
): T[] {
  return tasks.filter(task => {
    // Already completed or running
    if (completed.has(task.id) || running.has(task.id)) {
      return false;
    }

    // Check all dependencies are completed
    const deps = task.dependsOn ?? [];
    return deps.every(d => completed.has(d));
  });
}

/**
 * Analyze task DAG to extract execution levels and entry/exit points
 */
export function analyzeDAG<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[]
): DAGAnalysis<T> {
  // Sort first
  const sorted = topologicalSort(tasks);

  // Calculate levels (BFS from entry points)
  const levels: T[][] = [];
  const taskLevel = new Map<string, number>();
  const taskMap = new Map<string, T>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  // Entry points have no dependencies
  const entryPoints = tasks.filter(t => (t.dependsOn ?? []).length === 0);

  // Calculate level for each task
  for (const task of sorted) {
    const deps = task.dependsOn ?? [];
    if (deps.length === 0) {
      taskLevel.set(task.id, 0);
    } else {
      const maxDepLevel = Math.max(...deps.map(d => taskLevel.get(d) ?? 0));
      taskLevel.set(task.id, maxDepLevel + 1);
    }
  }

  // Group by level
  const maxLevel = Math.max(...taskLevel.values(), 0);
  for (let i = 0; i <= maxLevel; i++) {
    levels[i] = [];
  }

  for (const task of sorted) {
    const level = taskLevel.get(task.id) ?? 0;
    levels[level].push(task);
  }

  // Exit points: nothing depends on them
  const dependedOn = new Set<string>();
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      dependedOn.add(dep);
    }
  }
  const exitPoints = tasks.filter(t => !dependedOn.has(t.id));

  return {
    sorted,
    levels,
    entryPoints,
    exitPoints
  };
}

/**
 * Check if adding a dependency would create a cycle
 */
export function wouldCreateCycle<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[],
  fromId: string,
  toId: string
): boolean {
  // Create a temporary task list with the new dependency
  const modifiedTasks = tasks.map(t => {
    if (t.id === fromId) {
      return {
        ...t,
        dependsOn: [...(t.dependsOn ?? []), toId]
      };
    }
    return t;
  });

  try {
    topologicalSort(modifiedTasks);
    return false; // No cycle
  } catch {
    return true; // Cycle detected
  }
}

/**
 * Get all tasks that depend on a given task (direct and transitive)
 */
export function getDependents<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[],
  taskId: string
): T[] {
  const dependents = new Set<string>();
  const queue = [taskId];

  // Build reverse graph
  const reverseDeps = new Map<string, string[]>();
  for (const task of tasks) {
    for (const dep of task.dependsOn ?? []) {
      const existing = reverseDeps.get(dep) ?? [];
      existing.push(task.id);
      reverseDeps.set(dep, existing);
    }
  }

  // BFS to find all dependents
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const dependent of reverseDeps.get(current) ?? []) {
      if (!dependents.has(dependent)) {
        dependents.add(dependent);
        queue.push(dependent);
      }
    }
  }

  return tasks.filter(t => dependents.has(t.id));
}

/**
 * Get all dependencies of a task (direct and transitive)
 */
export function getDependencies<T extends { id: string; dependsOn?: string[] }>(
  tasks: T[],
  taskId: string
): T[] {
  const dependencies = new Set<string>();
  const taskMap = new Map<string, T>();

  for (const task of tasks) {
    taskMap.set(task.id, task);
  }

  const queue = [...(taskMap.get(taskId)?.dependsOn ?? [])];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (!dependencies.has(current)) {
      dependencies.add(current);
      const task = taskMap.get(current);
      if (task) {
        queue.push(...(task.dependsOn ?? []));
      }
    }
  }

  return tasks.filter(t => dependencies.has(t.id));
}
