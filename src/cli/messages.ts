import type { DomainError } from '../tasks/types.js';

export type CliErrorCategory = 'usage' | 'validation' | 'domain' | 'infrastructure';

export const CLI_EXIT_CODES = {
  success: 0,
  usage: 64,
  validation: 65,
  domain: 1,
  infrastructure: 70,
} as const;

const COMMANDS = ['init', 'check', 'add', 'board', 'complete', 'mcp'] as const;

const SUBCOMMAND_HELP: Record<(typeof COMMANDS)[number], string> = {
  init: `Usage: nexuscli init\n\nDescription:\n  Bootstrap local .nexus.db schema.`,
  check: `Usage: nexuscli check\n\nDescription:\n  Verify DB connectivity and readiness.`,
  add: `Usage: nexuscli add <type> <title>\n\nArguments:\n  <type>   feat|fix|chore|refactor|docs\n  <title>  Non-empty task title\n\nExample:\n  nexuscli add feat "Create login form"`,
  board: `Usage: nexuscli board\n\nDescription:\n  List pending and in_progress tasks.`,
  complete: `Usage: nexuscli complete <id>\n\nArguments:\n  <id>  Positive integer task id\n\nExample:\n  nexuscli complete 1`,
  mcp: `Usage: nexus mcp [mode]\n       nexus mcp setup opencode\n\nSubcommands:\n  stdio              Start MCP stdio server (default)\n  setup opencode     Configure nexuscli MCP in ~/.config/opencode/opencode.json\n\nExamples:\n  nexus mcp stdio\n  nexus mcp setup opencode`,
};

export const ROOT_HELP_TEXT = `NexusCLI runtime MVP\n\nUsage:\n  nexus --help\n  nexus <command> [options]\n  nexus <command> --help\n\nCommands:\n  init                    Bootstrap local .nexus.db schema\n  check                   Verify DB connectivity and readiness\n  add <type> <title>      Create pending task (type: feat|fix|chore|refactor|docs)\n  board                   List pending and in_progress tasks\n  complete <id>           Complete task and create local git commit\n  mcp [mode]              Start MCP server mode (mode: stdio)\n  mcp setup opencode      Configure nexuscli MCP in opencode (zero-config)\n  --help                  Show this help message\n`;

const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array.from({ length: n + 1 }, () => 0));

  for (let i = 0; i <= m; i += 1) dp[i][0] = i;
  for (let j = 0; j <= n; j += 1) dp[0][j] = j;

  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
};

const nearestCommand = (command: string): string | null => {
  const ranked = COMMANDS.map((candidate) => ({ candidate, score: levenshtein(command, candidate) })).sort(
    (left, right) => left.score - right.score,
  );

  const best = ranked[0];
  return best && best.score <= 3 ? best.candidate : null;
};

export const getSubcommandHelp = (command: string): string | null => {
  if (command in SUBCOMMAND_HELP) {
    return SUBCOMMAND_HELP[command as keyof typeof SUBCOMMAND_HELP];
  }
  return null;
};

export const unknownCommandMessage = (command: string): string => {
  const suggested = nearestCommand(command);
  const suggestion = suggested ? ` Try 'nexuscli ${suggested} --help'.` : " Use 'nexuscli --help'.";
  return `Unknown command '${command}'.${suggestion}`;
};

export const invalidTaskIdMessage = (value: string | undefined): string =>
  `Invalid task id '${value ?? ''}'. Expected positive integer. Hint: use 'nexuscli complete <id>' (example: 'nexuscli complete 1').`;

export const positiveIntegerFieldMessage = (fieldName: string, value?: unknown): string =>
  `Invalid ${fieldName}${value !== undefined ? ` '${String(value)}'` : ''}. Expected positive integer.`;

export const unsupportedMcpModeMessage = (mode: string): string =>
  `Unsupported MCP mode '${mode}'. Expected 'stdio'. Hint: run 'nexuscli mcp stdio'.`;

export const missingAddArgsMessage = (): string =>
  "Usage error: add requires <type> and <title>. Hint: run 'nexuscli add feat \"Create login form\"'.";

export const mapDomainErrorToCliCategory = (error: DomainError): CliErrorCategory => {
  if (error.code === 'VALIDATION_ERROR' || error.code === 'INVALID_TASK_TYPE' || error.code === 'TITLE_REQUIRED') {
    return 'validation';
  }

  return 'domain';
};

export const mapCategoryToExitCode = (category: CliErrorCategory): number => {
  switch (category) {
    case 'usage':
      return CLI_EXIT_CODES.usage;
    case 'validation':
      return CLI_EXIT_CODES.validation;
    case 'infrastructure':
      return CLI_EXIT_CODES.infrastructure;
    case 'domain':
    default:
      return CLI_EXIT_CODES.domain;
  }
};
