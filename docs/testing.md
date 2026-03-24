# Testing Guide

## E2E baseline (MVP)

Comando canónico (local y CI):

```bash
npm run test:e2e
```

Este comando ejecuta:
- smoke de CLI `--help`
- smoke de MCP health con polling bounded y timeout
- pruebas unitarias de utilidades críticas del harness (polling/timeout/diagnóstico)

## Release gate técnico (Step 9)

Comando canónico de gate de release:

```bash
npm run release:gate
```

Este gate orquesta en orden determinístico:
- `npm run build`
- `npm run typecheck`
- `npm run test`

Criterio binario:
- PASS: código de salida `0`.
- FAIL: código de salida no-cero + diagnóstico explícito del check bloqueante.

## E2E persistencia CLI (Step 7)

Comando dedicado de persistencia:

```bash
npm run test:e2e:persistence
```

Decisión de rollout:
- `test:e2e` **no agrega** la suite de persistencia por defecto (queda opt-in) para mantener feedback rápido y estable del smoke base.
- `test:e2e:persistence` concentra escenarios cross-process y contratos de falla/recovery, con mayor costo temporal y superficie de debugging.

Cobertura Step 7:
- `tests/e2e/persistence.cli-roundtrip.e2e.test.ts` → `init -> add -> board` entre procesos distintos.
- `tests/e2e/persistence.cli-complete-restart.e2e.test.ts` → `add -> complete -> board` con reinicios.
- `tests/e2e/persistence.cli-storage-failure.e2e.test.ts` → contrato de error storage con `NEXUS_DB_PATH` inválido.
- `tests/e2e/persistence.cli-recovery.e2e.test.ts` → lectura consistente luego de terminación abrupta posterior.

## Cobertura de DB Bootstrap (Step 1)

Pruebas clave agregadas para bootstrap:

- `tests/db/bootstrap.service.test.ts`
  - idempotencia de `init()` (`initialized` -> `already_initialized`)
  - `check()` con respuesta `ready` y `schemaVersion` determinístico
  - error controlado `DB_NOT_INITIALIZED` si se ejecuta `check` antes de baseline
  - tracking de migraciones en `nexus_schema_migrations` en orden ascendente

- `tests/cli/main.test.ts`
  - comando `check` posterior a `init` con payload de readiness

- `tests/mcp/task-lifecycle.contract.test.ts`
  - herramienta MCP `db_check` retorna envelope exitoso con `status=ready`

## Criterios de salida del Step 1 (alineados al spec)

- [x] Bootstrap crea/abre DB sin intervención manual extra (`BootstrapService.init`, CLI `init`, MCP `db_init`).
- [x] Migraciones baseline corren en orden determinístico y quedan registradas (`nexus_schema_migrations`, versión `0001..0004`).
- [x] Flujo `check` devuelve estado claro y accionable (`status`, `dbPath`, `schemaVersion`) vía CLI y MCP.
- [x] Errores canónicos equivalentes entre interfaces (`DB_NOT_INITIALIZED` parity CLI/MCP).

## Prerrequisitos

- Node.js 20+
- Dependencias instaladas (`npm install`)
- Variables de entorno mínimas:
  - `NODE_ENV` (`development|test|production`)
  - `MCP_PORT` (1-65535)
  - `LOG_LEVEL` (`debug|info|warn|error`)

Variables opcionales para E2E:
- `SMOKE_TIMEOUT_MS` (default: `5000`)
- `SMOKE_POLL_INTERVAL_MS` (default: `150`)

## Troubleshooting rápido

### 1) Timeout de health MCP

Síntoma típico:
- `MCP healthcheck timeout after <N>ms`

Checks:
1. Confirmar puerto libre (`MCP_PORT`).
2. Aumentar timeout temporalmente:

```bash
SMOKE_TIMEOUT_MS=10000 npm run test:e2e
```

3. Revisar diagnóstico JSON del harness (`step`, `reason`, `processState`).

### 2) Paridad local/CI

Regla: CI debe usar exactamente el mismo comando (`npm run test:e2e`).

Si local pasa y CI falla:
1. Verificar valores de env en CI (`NODE_ENV`, `MCP_PORT`, `LOG_LEVEL`).
2. Verificar que el job no esté truncando logs de error del harness.

## Rollout plan

1. Etapa observacional: job E2E en CI no bloqueante por 1-2 ciclos.
2. Etapa bloqueante: activar gate de merge cuando estabilidad sea consistente.

## CLI UX polish verification (Step 4)

Pruebas contractuales para UX de CLI:

- `tests/cli/main.test.ts`
  - `--help` raíz y `subcommand --help` con salida consistente.
  - comando desconocido con hint accionable (`nexuscli --help`).
  - validación de input con hint de formato correcto.

- `tests/cli/exit-codes.test.ts`
  - `0` para ejecución exitosa.
  - `64` para errores de uso/comando desconocido.
  - `65` para errores de validación/input.

- `tests/mcp/server.stdio.test.ts` y `tests/contracts/error-parity.test.ts`
  - alineación de categoría/mensaje base entre CLI y MCP para validaciones equivalentes.

## Riesgos abiertos

- Señal de health final del runtime (endpoint HTTP vs señal alternativa) en función de `mvp-runtime-wiring`.
  - Responsable sugerido: owner de runtime wiring.
- Framework E2E definitivo: hoy baseline sobre Vitest + harness propio.
  - Responsable sugerido: owner de testing platform.
