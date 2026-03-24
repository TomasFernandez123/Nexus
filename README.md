# NexusCLI Runtime MVP Wiring

Runtime mínimo ejecutable para NexusCLI con dos adapters:
- CLI (`src/cli/main.ts`)
- MCP health server (`src/mcp/server.ts`)

## Requisitos

- Node.js 20+
- npm

## Instalación Rápida (Recomendado)

### Paso 1: Instalar globalmente
Cloná el repo y hacé build para que el comando `nexus` quede disponible en tu terminal:

```bash
git clone https://github.com/tu-usuario/NexusCLI.git
cd NexusCLI
npm install
npm run build
npm install -g .
```

### Paso 2: Autoconfiguración para OpenCode
Corré este comando para inyectar la configuración automáticamente en tu OpenCode:

```bash
nexus mcp setup opencode
```

> **¡Listo!** Ahora solo tenés que abrir OpenCode en cualquier carpeta de proyecto. El CLI detectará automáticamente dónde estás, creará una base de datos SQLite aislada para ese proyecto, y vas a poder gestionar tus tareas directamente con la IA.

---

## Setup de desarrollo

Si querés aportar al CLI o correrlo sin instalarlo globalmente:

1. Instalar dependencias:
   ```bash
   npm install
   ```

## Flujo zero-config (recomendado)

No necesitás exportar variables para el flujo básico.

1. Usar CLI local:
   ```bash
   npm run dev:cli -- --help
   npm run dev:cli -- init
   npm run dev:cli -- board
   ```
2. Usar MCP en stdio (default para OpenCode):
   ```bash
   npm run dev:cli -- mcp
   ```

## Comandos

- CLI help:
  ```bash
  npm run dev:cli -- --help
  ```

- Inicializar base local (idempotente):
  ```bash
  npm run dev:cli -- init
  ```

- Verificar readiness de DB (conectividad + versión baseline):
  ```bash
  npm run dev:cli -- check
  ```

- Crear tarea:
  ```bash
  npm run dev:cli -- add feat "Implementar board local"
  ```

- Ver tablero pendiente/en progreso:
  ```bash
  npm run dev:cli -- board
  ```

- Completar tarea (intenta commit local automático):
  ```bash
  npm run dev:cli -- complete 1
  ```

- MCP server (health endpoint):
  ```bash
  export MCP_PORT=6061
  npm run dev:mcp
  ```
  Luego verificar:
  ```bash
  curl http://127.0.0.1:${MCP_PORT}/health
  ```

## Catálogo MCP (MVP)

Endpoint de tools:

```bash
POST http://127.0.0.1:${MCP_PORT}/tools/call
Content-Type: application/json
```

Tools disponibles:

- `task_list_pending` → lista tareas `todo`/`in_progress` con respuesta paginada consistente (`{ items, next_cursor }`).
- `task_start` → inicia tarea (`{ "id": number }`; `taskId` sigue soportado temporalmente, deprecado).
- `task_add_log` → agrega log (`{ "id": number, "text": string }`; `taskId` sigue soportado temporalmente, deprecado).
- `task_complete` → completa tarea y ejecuta commit local (`{ "id": number }`; `taskId` sigue soportado temporalmente, deprecado).
- `task_create` → crea tarea (`{ "type": "feat|fix|chore|docs", "title": string, "description?": string }`).
- `db_init` → inicializa baseline de DB y tracking (`{}`).
- `db_check` → valida readiness de DB y versión de schema (`{}`).

### `task_list_pending` contract

Inputs opcionales:

- `limit` (default `100`, max `500`, entero positivo)
- `cursor` (entero positivo existente; string o number)

Forma de respuesta (única):

- Siempre devuelve `{ items: CanonicalTask[], next_cursor: string | null }`, incluso con `input: {}`.
- `limit` y `cursor` siguen siendo opcionales para paginar explícitamente.

Request/response de referencia:

```json
{
  "tool": "task_list_pending",
  "input": {}
}
```

```json
{
  "items": [
    {
      "id": 11,
      "type": "chore",
      "title": "Ship MVP vertical slice",
      "status": "in_progress",
      "created_at": "2026-03-21T10:00:00.000Z",
      "updated_at": "2026-03-21T10:05:00.000Z",
      "completed_at": null,
      "commit_hash": null,
      "commit_message": null
    }
  ],
  "next_cursor": null
}
```

Errores de validación relevantes:

- `limit` inválido: `400 { "code": "VALIDATION_ERROR", "error": "limit must be a positive integer" }`
- `limit` > `500`: `400 { "code": "VALIDATION_ERROR", "error": "limit must be <= 500" }`
- `cursor` inválido: `400 { "code": "VALIDATION_ERROR", "error": "cursor must be a positive integer" }`
- `cursor` inexistente: `400 { "code": "VALIDATION_ERROR", "error": "cursor '<id>' not found" }`

- Smoke checks (CLI help + MCP health con timeout):
  ```bash
  npm run check:smoke
  ```

- E2E baseline (local/CI parity):
  ```bash
  npm run test:e2e
  ```

## Variables de entorno opcionales

| Variable | Descripción | Valores válidos |
|---|---|---|
| `NODE_ENV` | Modo de ejecución (default: `development`) | `development`, `test`, `production` |
| `LOG_LEVEL` | Nivel de logging (default: `info`) | `debug`, `info`, `warn`, `error` |
| `NEXUS_DB_PATH` | Ruta de DB local (default: `path.join(process.cwd(), '.nexus.db')`) | Path de archivo SQLite |
| `MCP_PORT` | Puerto del servidor MCP en modo HTTP (no aplica a stdio) | Entero entre `1` y `65535` |

## Formato de errores de arranque

Cuando hay configuración inválida, el runtime falla rápido con errores explícitos.

Ejemplo:
- Puerto inválido:
  - `Invalid MCP_PORT: 'abc'. Expected integer between 1 and 65535.`

## Troubleshooting

Para guía completa de pruebas (incluye E2E baseline y rollout), ver:
- `docs/testing.md`

### 1) MCP timeout en smoke

Síntoma:
- `MCP healthcheck timeout after <N>ms`

Acciones:
- Verificá que `MCP_PORT` esté libre.
- Aumentá timeout:
  ```bash
  SMOKE_TIMEOUT_MS=10000 npm run check:smoke
  ```

### 2) Variables inválidas al arrancar CLI/MCP

Síntoma:
- `Invalid NODE_ENV: ...`
- `Invalid LOG_LEVEL: ...`
- `Invalid MCP_PORT: ...`

Acciones:
- Verificá si estás forzando vars inválidas en tu shell/CI.
- Para MCP HTTP, definí `MCP_PORT` explícitamente.
- Para flujo stdio (`nexuscli mcp`), no hace falta `MCP_PORT`.
