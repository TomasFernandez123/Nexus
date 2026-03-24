# ⚡ NexusCLI 

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20-blue.svg)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)
[![GitHub release](https://img.shields.io/github/v/release/TomasFernandez123/Nexus?include_prereleases)](https://github.com/TomasFernandez123/Nexus/releases)

Runtime mínimo ejecutable para NexusCLI, diseñado con una arquitectura de dos adaptadores: una interfaz de línea de comandos (CLI) y un servidor de salud MCP.

![NexusCLI Demo en Terminal](./docs/demo.gif) *(Nota: Acá deberías colocar un GIF corto grabando tu terminal usando la herramienta)*

## Tabla de Contenidos
- [Requisitos](#requisitos)
- [Instalación Rápida](#instalación-rápida)
- [Uso](#uso)
- [Catálogo MCP (MVP)](#catálogo-mcp-mvp)
- [Configuración y Entorno](#configuración-y-entorno)
- [Desarrollo Local](#desarrollo-local)
- [Troubleshooting](#troubleshooting)

## Requisitos

- Node.js 20+
- npm

## Instalación Rápida

La forma recomendada de utilizar NexusCLI es instalándolo globalmente en tu sistema.

### 1. Instalar globalmente
Cloná el repositorio y compilá el proyecto para que el comando `nexus` quede disponible en tu terminal:

```bash
git clone https://github.com/TomasFernandez123/Nexus.git
cd Nexus
npm install
npm run build
npm install -g .
```

### 2. Autoconfiguración para OpenCode
Ejecutá este comando para inyectar la configuración automáticamente en OpenCode (Zero-Config):

```bash
nexus mcp setup opencode
```

> **¡Listo!** Al abrir OpenCode en cualquier carpeta, el CLI detectará tu ubicación, creará una base de datos SQLite aislada para ese proyecto y te permitirá gestionar tareas directamente con la IA.

## Uso

Una vez instalado, podés utilizar la CLI directamente:

- **Ayuda general:** `nexus --help`
- **Inicializar base local (idempotente):** `nexus init`
- **Verificar readiness de DB:** `nexus check`
- **Crear tarea:** `nexus add feat "Implementar board local"`
- **Ver tablero:** `nexus board`
- **Completar tarea (intenta commit automático):** `nexus complete 1`

## Catálogo MCP (MVP)

El servidor expone herramientas mediante el endpoint de tools:

### Request HTTP de prueba:
```http
POST http://127.0.0.1:${MCP_PORT}/tools/call
Content-Type: application/json
```

### Tools Disponibles

| Tool | Descripción | Payload |
|---|---|---|
| `task_list_pending` | Lista tareas `todo`/`in_progress` paginadas. | `{}` |
| `task_start` | Inicia una tarea. | `{ "id": number }` |
| `task_add_log` | Agrega un log técnico a la tarea. | `{ "id": number, "message": string }` |
| `task_complete` | Completa tarea y ejecuta commit local. | `{ "id": number }` |
| `task_create` | Crea una nueva tarea. | `{ "type": "feat\|fix\|chore\|docs", "title": string }` |
| `db_init` | Inicializa baseline de DB y tracking. | `{}` |
| `db_check` | Valida readiness de DB y versión. | `{}` |

### Contrato: `task_list_pending`

**Inputs opcionales:**
- `limit`: Default 100, max 500 (entero positivo).
- `cursor`: ID existente para paginación (string o number).

**Formato de respuesta:**
Siempre devuelve un objeto con `items` y `next_cursor`.

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

## Configuración y Entorno

El runtime valida la configuración en el arranque y falla rápido con errores explícitos (ej: `Invalid MCP_PORT: 'abc'`).

| Variable | Descripción | Valores válidos |
|---|---|---|
| `NODE_ENV` | Modo de ejecución (default: `development`) | `development`, `test`, `production` |
| `LOG_LEVEL` | Nivel de logging (default: `info`) | `debug`, `info`, `warn`, `error` |
| `NEXUS_DB_PATH` | Ruta de DB local (default: aísla bases de datos bajo `$CWD/.nexuscli/db/<hash>.sqlite` según la carpeta de ejecución) | Path de archivo SQLite |
| `MCP_PORT` | Puerto del servidor MCP en modo HTTP | Entero entre `1` y `65535` |

## Desarrollo Local

Si querés aportar al CLI o probarlo sin instalarlo globalmente, no necesitás exportar variables de entorno para los comandos básicos.

### Setup Inicial
```bash
npm install
```

### Ejecución en Desarrollo
Podés probar los comandos utilizando el script de desarrollo:

- **CLI local:**
  ```bash
  npm run dev:cli -- --help
  npm run dev:cli -- init
  ```
- **MCP en stdio (default para OpenCode):**
  ```bash
  npm run dev:cli -- mcp
  ```
- **MCP server (health endpoint):**
  ```bash
  export MCP_PORT=6061
  npm run dev:mcp
  ```
  Verificación: `curl http://127.0.0.1:${MCP_PORT}/health`

### Testing y Validación
- **Smoke checks:** `npm run check:smoke`
- **E2E baseline:** `npm run test:e2e`

## Troubleshooting

Para una guía completa de pruebas, consultá `docs/testing.md`.

### Problemas Comunes

**1. MCP timeout en smoke (`MCP healthcheck timeout`)**
- Verificá que el puerto definido en `MCP_PORT` esté libre.
- Aumentá el timeout de la prueba:
  ```bash
  SMOKE_TIMEOUT_MS=10000 npm run check:smoke
  ```

**2. Variables inválidas al arrancar**
- Errores de CLI como `Invalid NODE_ENV: ...`
- Verificá si estás forzando variables inválidas en tu shell o CI.
- Para MCP HTTP, definí `MCP_PORT` explícitamente.
- *Nota:* Para el flujo stdio (`nexus mcp stdio` o autoconfigurado), no hace falta definir `MCP_PORT`.
