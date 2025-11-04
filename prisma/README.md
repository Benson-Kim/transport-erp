# Database Documentation

## Overview

This application uses PostgreSQL with Prisma ORM for database management. The schema implements a
comprehensive enterprise management system with support for companies, clients, suppliers, services,
invoices, and more.

## Database Architecture

### Core Features

- **Soft Deletes**: All main entities support soft deletion with `deletedAt` field
- **Audit Trail**: Complete audit logging for compliance and debugging
- **Multi-tenancy Ready**: Company-based data isolation
- **Type Safety**: Full TypeScript support through Prisma
- **Performance**: Optimized indexes on frequently queried fields

## Schema Overview

### Authentication & Users

- `users` - System users with role-based access control
- `accounts` - OAuth provider accounts (NextAuth.js)
- `sessions` - User sessions
- `verification_tokens` - Email verification tokens

### Business Entities

- `companies` - Company profiles (can be both client and supplier)
- `clients` - Customer organizations
- `suppliers` - Service providers
- `client_contacts` - Contact persons for clients

### Operations

- `services` - Transport/logistics services
- `loading_orders` - Grouped services for delivery
- `invoices` - Supplier invoices
- `invoice_items` - Line items on invoices
- `payments` - Payment records

### System

- `audit_logs` - Complete audit trail
- `notifications` - User notifications
- `system_settings` - Application configuration
- `documents` - File attachments

## Database Setup

### Prerequisites

- PostgreSQL 14 or higher
- Node.js 20 or higher
- npm or yarn

### Installation

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Set up environment variables**

   ```bash
   DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
   ```

3. **Run migrations**

   ```bash
   npm run db:migrate
   ```

4. **Seed the database (development only)**
   ```bash
   npm run db:seed
   ```

## Migrations

### Creating a new migration

```bash
npx prisma migrate dev --name migration_name
```

### Applying migrations to production

```bash
npx prisma migrate deploy
```

### Rolling back migrations

```bash
npx prisma migrate reset
```

> Warning: This will drop the database and re-apply all migrations!

## Common Queries

### Soft Delete Pattern

```typescript
// Exclude soft-deleted records
const activeServices = await prisma.service.findMany({
  where: {
    deletedAt: null,
  },
});

// Soft delete a record
await prisma.service.update({
  where: { id },
  data: { deletedAt: new Date() },
});

// Restore a soft-deleted record
await prisma.service.update({
  where: { id },
  data: { deletedAt: null },
});
```

### Pagination Pattern

```typescript
const { data, pagination } = await getPaginatedServices({
  page: 1,
  limit: 20,
  sortBy: 'date',
  sortOrder: 'desc',
});
```

### Transaction Pattern

```typescript
await withTransaction(async (tx) => {
  // All operations in transaction
  const service = await tx.service.create({ ... });
  const invoice = await tx.invoice.create({ ... });
  await createAuditLog({ ... });
});
```

## Indexes

The schema includes strategic indexes for optimal query performance:

### Single Column Indexes

- User email
- Company VAT numbers
- Service numbers
- Invoice numbers
- Foreign keys

### Composite Indexes

- `services`: [date, status]
- `audit_logs`: [tableName, recordId]

## Backup Strategy

### Automated Backups

- Daily backups at 2 AM UTC
- Weekly full backups on Sundays
- Point-in-time recovery enabled
- 30-day retention for daily backups
- 90-day retention for weekly backups

### Manual Backup

```bash
pg_dump -U username -h localhost database_name > backup_$(date +%Y%m%d).sql
```

### Restore from Backup

```bash
psql -U username -h localhost database_name < backup_20240101.sql
```

## Security Considerations

- **Encryption**: Use SSL/TLS for database connections
- **Access Control**: Implement row-level security where needed
- **Sensitive Data**: Hash passwords with bcrypt
- **API Keys**: Store encrypted in database
- **PII Protection**: Consider data masking for sensitive fields

## Performance Optimization

### Query Optimization

- Use indexes on frequently queried columns
- Avoid N+1 queries with proper includes
- Use pagination for large datasets
- Consider database views for complex queries

### Connection Pooling

Prisma automatically handles connection pooling. Default settings:

- Connection limit: 10
- Connection timeout: 10 seconds

### Monitoring

Monitor these metrics:

- Query execution time
- Connection pool usage
- Table sizes and growth
- Index usage statistics

## Maintenance

### Regular Tasks

**Vacuum (weekly)**

```sql
VACUUM ANALYZE;
```

**Reindex (monthly)**

```sql
REINDEX DATABASE database_name;
```

**Statistics update (daily)**

```sql
ANALYZE;
```

### Health Checks

```typescript
const health = await checkDatabaseHealth();
console.log(`Database connected: ${health.connected}`);
console.log(`Latency: ${health.latency}ms`);
```

## Development Tools

### Prisma Studio

Visual database browser:

```bash
npm run db:studio
```

### Database Reset

Reset database to clean state:

```bash
npm run db:reset
```

## Troubleshooting

### Common Issues

**Connection timeout**

- Check database server is running
- Verify connection string
- Check firewall rules

**Migration conflicts**

- Use `prisma migrate resolve`
- Check for uncommitted migrations

**Performance issues**

- Run `EXPLAIN ANALYZE` on slow queries
- Check missing indexes
- Review connection pool settings

## Support

For database-related issues:

- Check Prisma documentation: [https://www.prisma.io/docs](https://www.prisma.io/docs)
- Review PostgreSQL logs
- Contact system administrator
