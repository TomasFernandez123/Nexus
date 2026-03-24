## NexusCLI Step 5 — CLI Process Readiness

Este artifact documenta la política terminal final de proceso para ejecución de NexusCLI en CLI y MCP stdio, con foco en determinismo para CI/scripts.

### Tabla estable de exit codes

| Categoría terminal | Stream | Exit code | Cuándo aplica |
|---|---|---:|---|
| `success` | `stdout` | `0` | Completó correctamente |
| `usage` | `stderr` | `64` | Comando/uso inválido |
| `validation` | `stderr` | `65` | Input inválido/violación de contrato |
| `domain` | `stderr` | `1` | Error de dominio de negocio |
| `infrastructure` | `stderr` | `70` | Fallo de runtime/IO/bootstrap |
| `signal` | `stderr` | `130` | Terminación por señal soportada |

### Política de señal

- Señales soportadas: `SIGINT`, `SIGTERM`.
- Política estable: ambas resuelven categoría terminal `signal` con exit code `130`.
- Shutdown idempotente: señales repetidas NO duplican cleanup crítico.

### Observabilidad de proceso

Fases canónicas (orden lógico):

1. `startup`
2. `running` (si bootstrap exitoso)
3. `shutdown`
4. `terminated`

Contratos observables:

- `stdout` solo para payload de éxito.
- `stderr` para errores terminales y condiciones no exitosas.
- Las rutas terminales (éxito/error/señal) convergen en el mismo tail `shutdown -> terminated`.

### Checklist de no-regresión (flujos CLI principales no-MCP)

- `nexuscli --help` → `0`, salida por `stdout`.
- `nexuscli init` → `0`, salida canónica por `stdout`.
- `nexuscli check` (runtime ok) → `0`, salida canónica por `stdout`.
- `nexuscli add feat "Title"` → `0`, contrato canónico de task en `stdout`.
- `nexuscli board` → `0`, lista canónica en `stdout`.
- `nexuscli complete <id válido>` → `0`, resultado canónico en `stdout`.
- `nexuscli <unknown>` → `64`, mensaje terminal por `stderr`.
- `nexuscli complete NaN` → `65`, error canónico por `stderr`.

Evidencia de validación:

- `tests/cli/lifecycle.test.ts`
- `tests/cli/streams.test.ts`
- `tests/cli/exit-codes.test.ts`
- `tests/cli/main.test.ts`
