# Invoices Module

Módulo de facturación y pagos para el sistema Motogest.

## Overview

Este módulo gestiona el ciclo completo de facturación:
- Creación de facturas desde órdenes de trabajo completadas
- Registro de pagos manuales (efectivo, transferencia, tarjeta)
- Pagos parciales y overpayment
- Cancelación de facturas
- Reportes básicos

## Architecture

### Models

#### Invoice
- **Snapshot inmutable**: Al crear una factura, se copian los datos de `WorkOrderCost`
- **Status**: `pending` → `partial` → `paid` → `overpaid` → `cancelled`
- **Invoice Number**: Secuencial por tenant (INV-0001, INV-0002, ...)
- **Relaciones**: 
  - 1:1 con WorkOrder (una factura por OT)
  - 1:N con Payment (múltiples pagos por factura)
  - N:1 con Client

#### Payment
- **Métodos**: `cash`, `transfer`, `card`
- **Campos**: amount, method, reference, paymentDate, receivedBy
- **CASCADE delete**: Si se cancela la factura, se eliminan todos los pagos

### State Machine

```
WorkOrder Status:
completed → invoiced → paid
                ↓
            completed (si se cancela la factura)

Invoice Status:
pending → partial → paid
                ↓
            overpaid (si se paga más del total)
                ↓
            cancelled (solo pending/partial pueden cancelarse)
```

## API Endpoints

### POST /work-orders/:id/invoice
Crear factura desde una orden de trabajo completada.

**Roles**: `admin_taller`, `recepcionista`

**Body**:
```json
{
  "notes": "Notas opcionales"
}
```

**Response**:
```json
{
  "id": "uuid",
  "workOrderId": "uuid",
  "clientId": "uuid",
  "invoiceNumber": "INV-0001",
  "status": "pending",
  "subtotal": 1000,
  "taxRate": 21,
  "taxAmount": 210,
  "totalAmount": 1210,
  "paidAmount": 0,
  "notes": "Notas opcionales",
  "issueDate": "2026-06-19T00:00:00.000Z"
}
```

**Errores**:
- `404`: WorkOrder no encontrada
- `400`: WorkOrder no está en estado `completed`
- `409`: Ya existe una factura para esta WorkOrder

### GET /invoices
Listar facturas con filtros y paginación.

**Roles**: `admin_taller`, `recepcionista`, `mechanic`

**Query Params**:
- `status`: `pending` | `partial` | `paid` | `overpaid` | `cancelled`
- `clientId`: UUID
- `dateFrom`: ISO date
- `dateTo`: ISO date
- `page`: number (default: 1)
- `limit`: number (default: 20)

**Response**:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

**Nota**: Los mecánicos solo ven facturas de OTs donde están asignados.

### GET /invoices/:id
Obtener detalle de factura con pagos.

**Roles**: `admin_taller`, `recepcionista`, `mechanic`

**Response**:
```json
{
  "id": "uuid",
  "invoiceNumber": "INV-0001",
  "status": "partial",
  "totalAmount": 1210,
  "paidAmount": 500,
  "payments": [
    {
      "id": "uuid",
      "amount": 500,
      "method": "cash",
      "reference": "Pago parcial",
      "paymentDate": "2026-06-19T00:00:00.000Z"
    }
  ]
}
```

### POST /invoices/:id/payments
Registrar pago.

**Roles**: `admin_taller`, `recepcionista`

**Body**:
```json
{
  "amount": 500,
  "method": "cash",
  "reference": "Referencia opcional"
}
```

**Response**:
```json
{
  "id": "uuid",
  "amount": 500,
  "method": "cash",
  "reference": "Referencia opcional",
  "paymentDate": "2026-06-19T00:00:00.000Z"
}
```

**Errores**:
- `404`: Factura no encontrada
- `400`: Factura está `cancelled` o `overpaid`
- `400`: Monto inválido (<= 0)
- `400`: Método de pago inválido

**Status transitions**:
- `pending` → `partial` (si paidAmount < totalAmount)
- `partial` → `paid` (si paidAmount == totalAmount)
- `pending`/`partial` → `overpaid` (si paidAmount > totalAmount)

### POST /invoices/:id/cancel
Cancelar factura.

**Roles**: `admin_taller`, `recepcionista`

**Response**:
```json
{
  "id": "uuid",
  "status": "cancelled",
  "paidAmount": 0,
  "cancelledAt": "2026-06-19T00:00:00.000Z"
}
```

**Errores**:
- `404`: Factura no encontrada
- `400`: Factura no es cancelable (ya está `paid`, `overpaid`, o `cancelled`)

**Efectos**:
- Elimina todos los pagos asociados
- Resetea `paidAmount` a 0
- Revierte WorkOrder de `invoiced` a `completed`

### GET /invoices/reports/summary
Reporte básico de facturas.

**Roles**: `admin_taller`, `recepcionista`

**Query Params**:
- `dateFrom`: ISO date (opcional)
- `dateTo`: ISO date (opcional)

**Response**:
```json
{
  "totalIssued": 10000,
  "totalPaid": 8000,
  "totalPending": 2000,
  "invoicesByStatus": {
    "pending": 5,
    "partial": 3,
    "paid": 10,
    "overpaid": 1,
    "cancelled": 2
  }
}
```

**Nota**: Las facturas `cancelled` no se incluyen en los totales.

## Business Rules

### Invoice Creation
- Solo se puede crear factura desde WorkOrder en estado `completed`
- La factura es un **snapshot inmutable** de WorkOrderCost
- Solo se permite **una factura por WorkOrder**
- El número de factura es secuencial por tenant

### Payment Processing
- Se permiten pagos parciales
- Se permite overpayment (pago mayor al total)
- Cada pago actualiza `paidAmount` y `status` de la factura
- WorkOrder pasa a estado `paid` cuando la factura está completamente pagada

### Cancellation
- Solo facturas `pending` o `partial` pueden cancelarse
- Al cancelar:
  - Se eliminan todos los pagos
  - `paidAmount` se resetea a 0
  - WorkOrder revierte a `completed`

### Multi-tenancy
- Invoice y Payment son tenant-scoped
- Todas las queries usan `withRlsTransaction()` + `prisma.scoped()`
- RLS policies garantizan aislamiento entre tenants

## Testing

### Unit Tests
```bash
pnpm --filter @taller-saas/api test -- invoices
```

**Coverage**:
- `InvoicesService`: 15 tests
- `PaymentsService`: 5 tests

### E2E Tests
```bash
pnpm --filter @taller-saas/api test:e2e -- invoices
```

**Suites**:
- `invoices.e2e-spec.ts`: Tests básicos de CRUD
- `integration.e2e-spec.ts`: Flujo completo (OT → invoice → payments → paid)
- `edge-cases.e2e-spec.ts`: Overpayment, duplicate invoice, RBAC

## Dependencies

- **WorkOrdersModule**: Para crear facturas desde OTs y actualizar status
- **PrismaModule**: Para acceso a base de datos con RLS
- **TenantContext**: Para aislamiento multi-tenant

## Migration

```bash
pnpm --filter @taller-saas/api prisma migrate dev --name add_invoices_payments
```

**Tablas creadas**:
- `invoices`: Facturas con snapshot de costos
- `payments`: Pagos registrados

**RLS Policies**:
- `tenant_isolation` en ambas tablas
- Grants a `taller_app` role

## Future Enhancements

- Integración con MercadoPago/Stripe (Fase 6)
- Portal de pagos para clientes
- Integración AFIP (facturación electrónica argentina)
- Notificaciones automáticas por email/WhatsApp
- Conciliación bancaria automática
- Exportación a PDF/Excel
