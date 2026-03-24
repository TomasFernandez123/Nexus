# NexusCLI — Product Requirements Document

**Versión:** 1.0.0 (MVP)  
**Estado:** Draft  
**Fecha:** 2026-03-20  
**Tipo:** Herramienta CLI + Servidor MCP  

---

## 1. Executive Summary

### Problem Statement

Los agentes de IA que asisten en programación pierden el contexto global del proyecto entre sesiones y carecen de una fuente de verdad estructurada para responder "¿qué hago a continuación?". Simultáneamente, el desarrollador experimenta context switching al alternar entre la terminal y herramientas externas (Jira, GitHub) para gestionar tickets y realizar commits manuales repetitivos.

### Proposed Solution

NexusCLI es un gestor de estado de proyectos "local-first" que opera sobre una base de datos SQLite por proyecto, exponiendo herramientas MCP para que agentes de IA (como OpenCode) puedan auto-asignarse tareas, documentar contexto técnico y automatizar el flujo de commit al completarlas — sin intervención humana.

### Success Criteria

| KPI | Target | Measurement |
|-----|--------|-------------|
| Tiempo de setup | ≤ 2 min | `nexus init` + configuración MCP en OpenCode |
| Conexión MCP | 100% estable | Agente conectado exitosamente en < 5s |
| Commits correctamente formateados | ≥ 95% | Validación regex del formato `<type>: <title> (Closes #<id>)` |
| Error handling覆盖率 | 100% | Los 2 escenarios de error documentados deben devolver mensajes claros al agente |
| Cobertura de tests unitarios | ≥ 80% | Vitest: queries SQLite + formateo de commits |

---

## 2. User Experience & Functionality

### User Personas

| Persona | Rol | Necesidad |
|---------|-----|-----------|
| **Desarrollador Senior** | Usuario principal | Gestionar backlog desde CLI y delegar trabajo a la IA sin perder trazabilidad |
| **Agente de IA (OpenCode)** | Consumidor primario | Leer tareas pendientes, autocompletarse, documentar decisiones técnicas |

### User Stories

#### US-001: Inicialización del Proyecto
> **Como** desarrollador, **quiero** inicializar NexusCLI en mi proyecto **para que** el sistema quede listo para rastrear tareas.

**Criterios de Aceptación:**
- [ ] `nexus init` crea el archivo `.nexus.db` en el directorio actual
- [ ] El archivo es creado solo si no existe (idempotente)
- [ ] Si el archivo ya existe, el comando responde "Already initialized" sin errores

---

#### US-002: Crear una Tarea
> **Como** desarrollador, **quiero** crear tareas desde la terminal **para que** pueda planificar el trabajo antes de delegarlo a la IA.

**Criterios de Aceptación:**
- [ ] `nexus add feat "Integrar pasarela de pagos"` crea una tarea tipo `feat` con estado `todo`
- [ ] Tipos válidos: `feat`, `fix`, `chore`, `refactor`, `docs`
- [ ] Tipos inválidos devuelven error: `Invalid task type. Allowed: feat, fix, chore, refactor, docs`
- [ ] El `title` es obligatorio (mínimo 1 carácter)
- [ ] La tarea es persisted en SQLite con `created_at` y `updated_at` correctos

---

#### US-003: Ver el Board de Tareas
> **Como** desarrollador, **quiero** ver el estado del proyecto **para que** pueda entender qué está en progreso y qué falta.

**Criterios de Aceptación:**
- [ ] `nexus board` muestra una tabla ASCII con columnas: ID, Type, Title, Status
- [ ] Las tareas se agrupan por estado: `TODO`, `IN PROGRESS`, `DONE`
- [ ] Tareas vacías muestran `— No tasks —` en la sección correspondiente

---

#### US-004: Iniciar el Servidor MCP
> **Como** desarrollador, **quiero** iniciar el servidor MCP **para que** el agente de IA pueda conectarse y consumir las herramientas.

**Criterios de Aceptación:**
- [ ] `nexus mcp` inicia el servidor en modo `stdio`
- [ ] El servidor responde al handshake del SDK MCP con `schemaVersion`, `name: "nexuscli"`, `tools: [...]`
- [ ] No produce output adicional (logging deshabilitado por stdio)

---

#### US-005: Listar Tareas Pendientes (Agente)
> **Como** agente de IA, **quiero** obtener la lista de tareas pendientes **para que** pueda decidir cuál tomar.

**Criterios de Aceptación:**
- [ ] La herramienta `task_list_pending()` retorna todas las tareas con `status` = `todo` o `in_progress`
- [ ] El formato de respuesta incluye: `id`, `type`, `title`, `status`, `created_at`
- [ ] Si no hay tareas pendientes, retorna array vacío `[]`

---

#### US-006: Asignarse una Tarea (Agente)
> **Como** agente de IA, **quiero** cambiar el estado de una tarea a `in_progress` **para que** el equipo sepa que estoy trabajando en ella.

**Criterios de Aceptación:**
- [ ] La herramienta `task_start(id)` cambia `status` → `in_progress` y actualiza `updated_at`
- [ ] Si la tarea no existe, retorna error: `{ "error": "Task #<id> not found" }`
- [ ] Si la tarea ya está en `done`, retorna error: `{ "error": "Task #<id> is already completed" }`

---

#### US-007: Documentar Log Técnico (Agente)
> **Como** agente de IA, **quiero** registrar decisiones técnicas y bugs encontrados **para que** el desarrollador tenga trazabilidad del pensamiento.

**Criterios de Aceptación:**
- [ ] La herramienta `task_add_log(id, message)` inserta un registro en `task_logs`
- [ ] El log incluye `created_at` automático
- [ ] Si la tarea no existe, retorna error: `{ "error": "Task #<id> not found" }`

---

#### US-008: Completar Tarea con Commit Automático (Agente)
> **Como** agente de IA, **quiero** marcar una tarea como completada y que se genere un commit automáticamente **para que** el trabajo quede registrado en Git sin intervención humana.

**Criterios de Aceptación:**
- [ ] `task_complete(id)` cambia `status` → `done` y actualiza `updated_at`
- [ ] Ejecuta `git add .` → construye mensaje → `git commit -m "<type>: <title> (Closes #<id>)"`
- [ ] Si el repositorio no está inicializado, retorna: `{ "error": "Git repository not initialized. Run: git init" }`
- [ ] Si no hay cambios para commitear, retorna: `{ "error": "Nothing to commit. Did you save your changes?" }`
- [ ] El commit se hace en el repositorio **local únicamente** (sin push)

---

#### US-009: Commit Manual por Desarrollador
> **Como** desarrollador, **quiero** que NexusCLI también funcione como CLI puro **para que** pueda crear commits sin usar MCP.

**Criterios de Aceptación:**
- [ ] `nexus complete <id>` expone la misma lógica de `task_complete` sin necesidad del servidor MCP
- [ ] Mensajes de error idénticos a US-008

---

#### US-010: Crear una Tarea (Agente)
> **Como** agente de IA, **quiero** crear tareas desde el backlog **para que** pueda registrar trabajo identificado durante el desarrollo.

**Criterios de Aceptación:**
- [ ] La herramienta `task_create(type, title)` inserta una nueva tarea con `status` = `todo`
- [ ] Tipos válidos: `feat`, `fix`, `chore`, `refactor`, `docs`
- [ ] Tipos inválidos devuelven error: `{ "error": "Invalid task type. Allowed: feat, fix, chore, refactor, docs" }`
- [ ] Si `title` está vacío o es solo whitespace, retorna error: `{ "error": "Task title is required" }`
- [ ] Retorna el `id` de la tarea creada para poder encadenar con `task_start`

---

### Non-Goals (MVP)

- ❌ `git push` automático — queda como acción humana de validación
- ❌ Conflictos de merge — asumimos trabajo en rama única
- ❌ Sistema de autenticación o multiusuario
- ❌ Integración con repositorios remotos (GitHub, GitLab)
- ❌ Historial de commits o vista de diff dentro del CLI
- ❌ Soporte para base de datos compartida o cloud sync
- ❌ Soporte para Windows o macOS en el MVP (Linux-only ejecutable)

---

## 3. Technical Specifications

### Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                    OpenCode (Agente)                 │
└──────────────────────┬──────────────────────────────┘
                       │ stdio
                       ▼
┌─────────────────────────────────────────────────────┐
│              NexusCLI MCP Server                     │
│  ┌─────────────┐    ┌──────────────┐              │
│  │  Tools API  │    │  Git Runner  │              │
│  └──────┬──────┘    └──────┬───────┘              │
│         │                  │                       │
│         └────────┬─────────┘                       │
│                  ▼                                   │
│         ┌────────────────┐                          │
│         │  SQLite (.db)  │                          │
│         └────────────────┘                          │
└─────────────────────────────────────────────────────┘
                       ▲
                       │ stdio
                       │
┌─────────────────────────────────────────────────────┐
│                   CLI (Humano)                       │
│  nexus init | nexus add | nexus board | nexus mcp  │
└─────────────────────────────────────────────────────┘
```

### Stack

| Componente | Tecnología | Justificación |
|------------|------------|---------------|
| Lenguaje | TypeScript | Tipado estático, transpilable a JS standalone |
| Runtime | Node.js | Requisito para SDK MCP + ecosistema npm |
| DB | SQLite (better-sqlite3) | Sincrónico, sin servidor, embebido en el proceso |
| MCP SDK | @modelcontextprotocol/sdk | Implementación oficial stdio |
| CLI | Commander.js | Mínimo overhead, TypeScript-first |
| Testing | Vitest | Rápido, ESM-native, coverage out-of-the-box |
| Empaquetado | pkg o esbuild | Bundling a ejecutable Linux single-file |

### Data Model

#### Tabla: `tasks`

```sql
CREATE TABLE tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL CHECK(type IN ('feat', 'fix', 'chore', 'refactor', 'docs')),
  title       TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'todo' CHECK(status IN ('todo', 'in_progress', 'blocked', 'done', 'cancelled')),
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### Tabla: `task_logs`

```sql
CREATE TABLE task_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_task_logs_task_id ON task_logs(task_id);
```

### MCP Schema

#### Handshake Response
```json
{
  "protocolVersion": "2024-11-05",
  "capabilities": { "tools": {} },
  "serverInfo": { "name": "nexuscli", "version": "1.0.0" }
}
```

#### Tool Definitions

```typescript
// task_list_pending
{
  name: "task_list_pending",
  description: "Returns all tasks with status 'todo' or 'in_progress'",
  inputSchema: { type: "object", properties: {} }
}

// task_start
{
  name: "task_start",
  description: "Changes task status to 'in_progress'",
  inputSchema: {
    type: "object",
    properties: { id: { type: "number", description: "Task ID" } },
    required: ["id"]
  }
}

// task_add_log
{
  name: "task_add_log",
  description: "Adds a technical log entry to a task",
  inputSchema: {
    type: "object",
    properties: {
      id: { type: "number", description: "Task ID" },
      message: { type: "string", description: "Log content" }
    },
    required: ["id", "message"]
  }
}

// task_complete
{
  name: "task_complete",
  description: "Marks task as 'done' and triggers local git commit",
  inputSchema: {
    type: "object",
    properties: { id: { type: "number", description: "Task ID" } },
    required: ["id"]
  }
}

// task_create
{
  name: "task_create",
  description: "Creates a new task in the project backlog. The AI can use this to automatically create tasks from natural language instructions or when it identifies work that needs to be tracked.",
  inputSchema: {
    type: "object",
    properties: {
      type: { 
        type: "string", 
        description: "Task type",
        enum: ["feat", "fix", "chore", "refactor", "docs"]
      },
      title: { 
        type: "string", 
        description: "Task title (brief description of the work)" 
      }
    },
    required: ["type", "title"]
  }
}
```

### Git Commit Format

```
<type>: <title> (Closes #<id>)
```

**Ejemplos:**
```
feat: Integrar pasarela de pagos (Closes #1)
fix: Corregir error de parsing en task_add_log (Closes #3)
docs: Agregar README de integración OpenCode (Closes #7)
```

**Regex de validación:**
```regex
^(feat|fix|chore|refactor|docs): .+ \(Closes #\d+\)$
```

### Directory Structure

```
nexuscli/
├── src/
│   ├── cli.ts           # Commander.js CLI entry point
│   ├── mcp-server.ts    # MCP server setup + tool handlers
│   ├── db.ts            # SQLite initialization + queries
│   ├── git.ts           # Git automation runner
│   ├── tools/           # MCP tool implementations
│   │   ├── list-pending.ts
│   │   ├── task-start.ts
│   │   ├── task-add-log.ts
│   │   └── task-complete.ts
│   └── types.ts         # Shared TypeScript interfaces
├── tests/
│   ├── db.test.ts       # SQLite query tests (Vitest)
│   └── commit-format.test.ts  # Commit string validation tests
├── .gitignore
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

### OpenCode Integration (Documentation)

```markdown
## Integración con OpenCode

Agregar NexusCLI como proveedor MCP en tu configuración de OpenCode:

1. Edita tu archivo de configuración MCP de OpenCode
2. Agrega el siguiente provider:

```json
{
  "mcpServers": {
    "nexuscli": {
      "command": "npx",
      "args": ["nexus-cli", "mcp"]
    }
  }
}
```

3. Reinicia OpenCode
4. Verifica la conexión ejecutando: `nexus board`

El agente de IA tendrá acceso automático a las herramientas:
- `task_list_pending` — Ver backlog de tareas
- `task_start` — Asignarse una tarea
- `task_add_log` — Documentar decisiones técnicas
- `task_complete` — Completar y commiter automáticamente
- `task_create` — Crear una nueva tarea en el backlog
```

---

## 4. AI System Requirements

### Tool Requirements

| Herramienta | Input | Output | Efecto Secundario |
|-------------|-------|--------|------------------|
| `task_list_pending` | — | `Task[]` | Ninguno (readonly) |
| `task_start` | `id: number` | `{ success: true }` o error | Actualiza `status` y `updated_at` |
| `task_add_log` | `id: number, message: string` | `{ success: true }` o error | Inserta en `task_logs` |
| `task_complete` | `id: number` | `{ success: true, commit: string }` o error | Actualiza status + `git commit` |
| `task_create` | `type: string, title: string` | `{ success: true, id: number }` o error | Inserta en `tasks` con `status: 'todo'` |

### Error Response Contract

Todas las herramientas deben retornar errores en formato consistente:

```typescript
{
  "error": "Error message here",
  "code": "ERROR_CODE" // opcional, para categorización
}
```

| Código | Descripción |
|--------|-------------|
| `TASK_NOT_FOUND` | La tarea con el ID especificado no existe |
| `ALREADY_COMPLETED` | La tarea ya está en estado `done` |
| `INVALID_STATE` | Estado o evento fuera del set canónico del lifecycle |
| `INVALID_TRANSITION` | Evento no permitido desde el estado actual de la tarea |
| `GIT_NOT_INITIALIZED` | No se encontró `.git` en el directorio |
| `GIT_NOTHING_TO_COMMIT` | No hay archivos modificados para commitear |
| `INVALID_TASK_TYPE` | El tipo especificado no está en la lista permitida |
| `TITLE_REQUIRED` | El título está vacío o es solo espacios |

---

## 5. Risks & Roadmap

### Technical Risks

| Riesgo | Probabilidad | Impacto | Mitigación |
|--------|--------------|---------|------------|
| `better-sqlite3` no compila en entorno objetivo | Media | Alto | Bundling con pkg + binary PATH resolution |
| El SDK MCP cambia de API en versiones futuras | Baja | Medio | Pin de versión en `package.json` + tests de integración |
| El ejecutable bundlado excede límite de tamaño | Baja | Bajo | Tree-shaking + lazy loading de commands no usados |

### Phased Rollout

#### v1.0.0 — MVP (Entrega actual)
- CLI core: `init`, `add`, `board`, `mcp`
- MCP server: las 5 herramientas
- Git automation (local commit only)
- Unit tests con Vitest
- Empaquetado Linux single-file

#### v1.1.0 — Developer Experience
- Autocompletado en CLI (readline)
- Colors y status badges en `nexus board`
- `nexus log <id>` — ver historial de logs de una tarea
- `nexus delete <id>` — eliminar tarea huérfana

#### v2.0.0 — Collaboration
- `nexus sync` — sincronización a servicio cloud (requiere auth)
- GitHub integration: crear Issue desde tarea
- Notificaciones cuando la IA completa una tarea

---

## 6. Appendix

### Glossary

| Término | Definición |
|---------|------------|
| **Local-first** | El sistema funciona sin conexión a internet y almacena todo localmente |
| **MCP (Model Context Protocol)** | Protocolo de comunicación stdio para herramientas de IA |
| **Conventional Commits** | Formato de mensajes de commit: `<type>: <description>` |
| **SQLite** | Motor de base de datos embebido, sin servidor |

### Dependencies

```json
{
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "better-sqlite3": "^11.0.0",
    "commander": "^12.0.0"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vitest": "^1.0.0",
    "@types/better-sqlite3": "^7.6.0",
    "@types/node": "^20.0.0",
    "pkg": "^5.0.0"
  }
}
```
