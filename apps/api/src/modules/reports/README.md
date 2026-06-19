# Reports Module

Módulo de reportes y dashboard para el sistema Motogest.

## Overview

Este módulo proporciona métricas y reportes para el dashboard del taller:
- KPIs principales (clientes, vehículos, mecánicos, OTs)
- Reportes de ingresos
- Performance de mecánicos
- Estadísticas de órdenes de trabajo

## API Endpoints

### GET /reports/dashboard

Obtiene las métricas principales del dashboard.

**Roles**: `admin_taller`, `recepcionista`

**Response**:
```json
{
  "totalClients": 150,
  "totalVehicles": 200,
  "totalMechanics": 5,
  "workOrdersByStatus": {
    "created": 10,
    "assigned": 5,
    "in_progress": 8,
    "completed": 15,
    "invoiced": 20,
    "paid": 50,
    "delivered": 100
  },
  "monthlyRevenue": 500000,
  "pendingRevenue": 150000,
  "lowStockParts": 3
}
```

**Descripción de campos**:
- `totalClients`: Total de clientes activos
- `totalVehicles`: Total de vehículos registrados
- `totalMechanics`: Total de mecánicos activos
- `workOrdersByStatus`: OTs agrupadas por estado
- `monthlyRevenue`: Ingresos del mes actual (facturas no canceladas)
- `pendingRevenue`: Monto pendiente de cobro (facturas pending/partial)
- `lowStockParts`: Cantidad de repuestos con stock bajo

### GET /reports/revenue

Reporte detallado de ingresos con filtro por fechas.

**Roles**: `admin_taller`, `recepcionista`

**Query Params**:
- `startDate`: Fecha inicio (ISO 8601, opcional)
- `endDate`: Fecha fin (ISO 8601, opcional)

**Response**:
```json
{
  "invoices": [
    {
      "id": "uuid",
      "invoiceNumber": "INV-0001",
      "issueDate": "2024-01-15T00:00:00.000Z",
      "totalAmount": 10000,
      "paidAmount": 10000,
      "status": "paid",
      "client": {
        "name": "Cliente Ejemplo"
      }
    }
  ],
  "totalRevenue": 500000,
  "totalPaid": 350000,
  "totalPending": 150000
}
```

### GET /reports/mechanics/performance

Performance de mecánicos con métricas de productividad.

**Roles**: `admin_taller`, `recepcionista`

**Query Params**:
- `startDate`: Fecha inicio (ISO 8601, opcional)
- `endDate`: Fecha fin (ISO 8601, opcional)

**Response**:
```json
[
  {
    "mechanicId": "uuid",
    "mechanicName": "Juan Pérez",
    "completedOrders": 25,
    "totalLaborCost": 250000,
    "avgRepairTimeHours": 4.5
  }
]
```

**Descripción de campos**:
- `completedOrders`: OTs completadas en el período
- `totalLaborCost`: Total de costos de mano de obra generados
- `avgRepairTimeHours`: Tiempo promedio de reparación en horas

### GET /reports/work-orders/stats

Estadísticas de órdenes de trabajo.

**Roles**: `admin_taller`, `recepcionista`, `mecanico`

**Response**:
```json
{
  "completedThisMonth": 30,
  "inProgress": 5,
  "avgCompletionTimeHours": 3.5
}
```

**Descripción de campos**:
- `completedThisMonth`: OTs completadas en el mes actual
- `inProgress`: OTs actualmente en progreso
- `avgCompletionTimeHours`: Tiempo promedio de completado (últimos 30 días)

## Testing

```bash
# Unit tests
pnpm --filter @taller-saas/api test reports.service.spec.ts

# Coverage
pnpm --filter @taller-saas/api test:cov reports.service.spec.ts
```

## Multi-tenancy

Todos los endpoints usan `withRlsTransaction()` para garantizar aislamiento entre tenants.

## Próximas mejoras

- [ ] Exportación a PDF/Excel
- [ ] Gráficos y visualizaciones
- [ ] Reportes personalizados
- [ ] Comparación entre períodos
- [ ] Proyecciones y tendencias
- [ ] Alertas automáticas (stock bajo, OTs vencidas)
