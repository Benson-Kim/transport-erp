/**
 * Database Seed Script
 * Populates the database with sample data for development and testing
 */

import {
  PrismaClient,
  UserRole,
  ServiceStatus,
  InvoiceStatus,
  PaymentStatus,
} from '@/app/generated/prisma';
import { hash } from 'bcryptjs';
import { addDays, subDays } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Generate a sequential number with prefix
 */
function generateNumber(
  prefix: string,
  index: number,
  year: number = new Date().getFullYear()
): string {
  return `${prefix}-${year}-${String(index).padStart(5, '0')}`;
}

/**
 * Generate random decimal within range
 */
function randomDecimal(min: number, max: number, decimals: number = 2): number {
  const factor = Math.pow(10, decimals);
  return Math.round((Math.random() * (max - min) + min) * factor) / factor;
}

/**
 * Generate random date within range
 */
function randomDate(start: Date, end: Date): Date {
  return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
}

async function main() {
  console.log('Starting database seed...');

  // Clean existing data
  console.log('Cleaning existing data...');
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.serviceLoadingOrder.deleteMany();
  await prisma.loadingOrder.deleteMany();
  await prisma.serviceStatusHistory.deleteMany();
  await prisma.service.deleteMany();
  await prisma.clientContact.deleteMany();
  await prisma.client.deleteMany();
  await prisma.supplier.deleteMany();
  await prisma.company.deleteMany();
  await prisma.document.deleteMany();
  await prisma.systemSetting.deleteMany();
  await prisma.session.deleteMany();
  await prisma.account.deleteMany();
  await prisma.user.deleteMany();

  /* ---------- Users ---------- */
  console.log('Creating users...');
  const hashedPassword = await hash('password123', 12);

  const [adminUser, managerUser, accountantUser, operatorUser] = await prisma.$transaction([
    prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin User',
        password: hashedPassword,
        role: UserRole.ADMIN,
        emailVerified: new Date(),
        department: 'Management',
        phone: '+34 600 123 456',
        isActive: true,
        lastLoginAt: new Date(),
      },
    }),
    prisma.user.create({
      data: {
        email: 'manager@example.com',
        name: 'Manager User',
        password: hashedPassword,
        role: UserRole.MANAGER,
        emailVerified: new Date(),
        department: 'Operations',
        phone: '+34 600 234 567',
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'accountant@example.com',
        name: 'Accountant User',
        password: hashedPassword,
        role: UserRole.ACCOUNTANT,
        emailVerified: new Date(),
        department: 'Finance',
        phone: '+34 600 345 678',
        isActive: true,
      },
    }),
    prisma.user.create({
      data: {
        email: 'operator@example.com',
        name: 'Operator User',
        password: hashedPassword,
        role: UserRole.OPERATOR,
        emailVerified: new Date(),
        department: 'Operations',
        phone: '+34 600 456 789',
        isActive: true,
      },
    }),
  ]);

  /* ---------- Companies ---------- */
  console.log('Creating companies...');
  const [companyA, companyB] = await prisma.$transaction([
    prisma.company.create({
      data: {
        code: 'COMP001',
        legalName: 'Transportes Rápidos S.L.',
        tradeName: 'TransRapido',
        vatNumber: 'B12345678',
        registrationNo: 'REG-2020-001',
        addressLine1: 'Calle Principal 123',
        city: 'Madrid',
        state: 'Madrid',
        postalCode: '28001',
        country: 'ES',
        phone: '+34 91 123 4567',
        email: 'info@transrapido.es',
        website: 'https://transrapido.es',
        bankName: 'Banco Santander',
        iban: 'ES9121000418450200051332',
        currency: 'EUR',
        invoicePrefix: 'TR',
        isActive: true,
        metadata: { employees: 50, fleet_size: 30 },
      },
    }),
    prisma.company.create({
      data: {
        code: 'COMP002',
        legalName: 'Logística Global S.A.',
        tradeName: 'LogiGlobal',
        vatNumber: 'A87654321',
        registrationNo: 'REG-2019-002',
        addressLine1: 'Avenida Logística 456',
        city: 'Barcelona',
        state: 'Barcelona',
        postalCode: '08001',
        country: 'ES',
        phone: '+34 93 456 7890',
        email: 'contacto@logiglobal.es',
        website: 'https://logiglobal.es',
        bankName: 'CaixaBank',
        iban: 'ES6621000418401234567891',
        currency: 'EUR',
        invoicePrefix: 'LG',
        isActive: true,
      },
    }),
  ]);

  /* ---------- Clients ---------- */
  console.log('Creating clients...');
  const clients = await prisma.$transaction([
    prisma.client.create({
      data: {
        clientCode: 'CLI001',
        companyId: companyA.id,
        name: 'Supermercados El Ahorro S.A.',
        tradeName: 'El Ahorro',
        vatNumber: 'A11111111',
        billingAddress: {
          line1: 'Calle Comercio 789',
          city: 'Valencia',
          state: 'Valencia',
          postalCode: '46001',
          country: 'ES',
        },
        shippingAddress: {
          line1: 'Polígono Industrial Sur',
          line2: 'Nave 15',
          city: 'Valencia',
          state: 'Valencia',
          postalCode: '46005',
          country: 'ES',
        },
        billingEmail: 'facturacion@elahorro.es',
        trafficEmail: 'logistica@elahorro.es',
        contactPerson: 'Juan García',
        contactPhone: '+34 96 123 4567',
        creditLimit: 50000,
        paymentTerms: 30,
        discount: 5,
        currency: 'EUR',
        language: 'es',
        tags: ['retail', 'food', 'priority'],
        isActive: true,
        contacts: {
          create: [
            {
              name: 'Juan García',
              position: 'Jefe de Logística',
              email: 'jgarcia@elahorro.es',
              phone: '+34 96 123 4567',
              mobile: '+34 600 111 222',
              isPrimary: true,
            },
            {
              name: 'María López',
              position: 'Coordinadora de Compras',
              email: 'mlopez@elahorro.es',
              phone: '+34 96 123 4568',
              mobile: '+34 600 333 444',
              isPrimary: false,
            },
          ],
        },
      },
    }),
    prisma.client.create({
      data: {
        clientCode: 'CLI002',
        companyId: companyA.id,
        name: 'Industrias Metálicas del Norte S.L.',
        tradeName: 'MetalNorte',
        vatNumber: 'B22222222',
        billingAddress: {
          line1: 'Polígono Industrial Este',
          line2: 'Parcela 45',
          city: 'Bilbao',
          state: 'Vizcaya',
          postalCode: '48001',
          country: 'ES',
        },
        billingEmail: 'administracion@metalnorte.es',
        trafficEmail: 'pedidos@metalnorte.es',
        contactPerson: 'Pedro Fernández',
        contactPhone: '+34 94 567 8901',
        creditLimit: 75000,
        paymentTerms: 45,
        currency: 'EUR',
        language: 'es',
        tags: ['industrial', 'manufacturing', 'b2b'],
        isActive: true,
      },
    }),
    prisma.client.create({
      data: {
        clientCode: 'CLI003',
        companyId: companyB.id,
        name: 'E-Commerce Solutions Ltd.',
        tradeName: 'EComSol',
        vatNumber: 'GB123456789',
        billingAddress: {
          line1: '123 High Street',
          city: 'London',
          postalCode: 'SW1A 1AA',
          country: 'GB',
        },
        billingEmail: 'accounts@ecommerce-solutions.co.uk',
        contactPerson: 'John Smith',
        contactPhone: '+44 20 7123 4567',
        creditLimit: 100000,
        paymentTerms: 60,
        currency: 'GBP',
        language: 'en',
        tags: ['international', 'ecommerce', 'technology'],
        isActive: true,
      },
    }),
  ]);

  /* ---------- Suppliers ---------- */
  console.log('Creating suppliers...');
  const suppliers = await prisma.$transaction([
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP001',
        companyId: companyB.id,
        name: 'Transportes Autónomos González',
        vatNumber: '12345678X',
        addressLine1: 'Calle Transportista 10',
        city: 'Madrid',
        postalCode: '28020',
        country: 'ES',
        email: 'gonzalez@autonomos.es',
        phone: '+34 91 234 5678',
        contactPerson: 'Antonio González',
        contactMobile: '+34 650 123 456',
        irpfRate: 15,
        vatRate: 21,
        paymentTerms: 30,
        paymentMethod: 'TRANSFER',
        bankName: 'BBVA',
        iban: 'ES7921000813610123456789',
        currency: 'EUR',
        tags: ['autonomo', 'nacional', 'fiable'],
        isActive: true,
      },
    }),
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP002',
        companyId: companyB.id,
        name: 'Logística Express S.L.',
        tradeName: 'LogiExpress',
        vatNumber: 'B33333333',
        addressLine1: 'Avenida Industrial 234',
        city: 'Barcelona',
        postalCode: '08025',
        country: 'ES',
        email: 'facturas@logiexpress.es',
        phone: '+34 93 345 6789',
        contactPerson: 'Carmen Ruiz',
        vatRate: 21,
        paymentTerms: 45,
        paymentMethod: 'TRANSFER',
        bankName: 'La Caixa',
        iban: 'ES1021000418401234567892',
        currency: 'EUR',
        tags: ['empresa', 'express', 'nacional'],
        requirePO: true,
        isActive: true,
      },
    }),
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP003',
        companyId: companyB.id,
        name: 'International Freight Services',
        vatNumber: 'DE987654321',
        addressLine1: 'Hauptstraße 123',
        city: 'Munich',
        postalCode: '80331',
        country: 'DE',
        email: 'billing@ifs-munich.de',
        phone: '+49 89 1234 5678',
        contactPerson: 'Klaus Mueller',
        vatRate: 19,
        paymentTerms: 60,
        paymentMethod: 'TRANSFER',
        currency: 'EUR',
        tags: ['international', 'air-freight', 'premium'],
        isActive: true,
      },
    }),
  ]);

  /* ---------- Services (+ status history) ---------- */
  console.log('Creating services ...');
  const currentDate = new Date();
  const startDate = subDays(currentDate, 60);
  const serviceCreateInputs: any[] = [];

  for (let i = 1; i <= 50; i++) {
    const serviceDate = randomDate(startDate, currentDate);
    const client = clients[Math.floor(Math.random() * clients.length)];
    const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    if (!client || !supplier) continue;

    const costAmount = randomDecimal(100, 2000);
    const marginPercent = randomDecimal(15, 35);
    const saleAmount = Math.round(costAmount * (1 + marginPercent / 100) * 100) / 100;

    const statuses = [
      ServiceStatus.DRAFT,
      ServiceStatus.CONFIRMED,
      ServiceStatus.IN_PROGRESS,
      ServiceStatus.COMPLETED,
    ];
    // bias: earlier services more likely to be completed
    const status =
      i < 30
        ? statuses[Math.floor(Math.random() * 3)]
        : statuses[Math.floor(Math.random() * statuses.length)];
    const completedAt =
      status === ServiceStatus.COMPLETED
        ? addDays(serviceDate, Math.floor(Math.random() * 3) + 1)
        : null;

    serviceCreateInputs.push({
      serviceNumber: generateNumber('SRV', i),
      date: serviceDate,
      clientId: client.id,
      supplierId: supplier.id,
      createdById: operatorUser.id,
      assignedToId: Math.random() > 0.5 ? managerUser.id : operatorUser.id,
      description: `Transport service from warehouse to ${['Store A', 'Store B', 'Distribution Center', 'Customer Location'][Math.floor(Math.random() * 4)]}`,
      reference:
        Math.random() > 0.5
          ? `PO-2024-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`
          : null,
      origin: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla'][Math.floor(Math.random() * 4)],
      destination: ['Bilbao', 'Zaragoza', 'Málaga', 'Lisboa'][Math.floor(Math.random() * 4)],
      distance: Math.floor(Math.random() * 500) + 50,
      vehicleType: ['Truck', 'Van', 'Trailer', 'Container'][Math.floor(Math.random() * 4)],
      vehiclePlate: `${String(Math.floor(Math.random() * 9999)).padStart(4, '0')} ${['ABC', 'DEF', 'GHI', 'JKL'][Math.floor(Math.random() * 4)]}`,
      driverName: ['Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez'][
        Math.floor(Math.random() * 4)
      ],
      costAmount,
      saleAmount,
      margin: Math.round((saleAmount - costAmount) * 100) / 100,
      marginPercentage: marginPercent,
      costVatRate: 21,
      costVatAmount: Math.round(costAmount * 0.21 * 100) / 100,
      saleVatRate: 21,
      saleVatAmount: Math.round(saleAmount * 0.21 * 100) / 100,
      status,
      completedAt,
      notes: Math.random() > 0.7 ? 'Handle with care - fragile items' : null,
      internalNotes: Math.random() > 0.8 ? 'Regular customer - priority service' : null,
      attachments: [],
      customFields: null,
    });
  }

  // Insert services and build status history records
  const createdServices = await prisma.$transaction(
    async (tx) => {
      const created = await Promise.all(
        serviceCreateInputs.map((d) => tx.service.create({ data: d }))
      );

      const historyRecords: any[] = [];
      for (const svc of created) {
        if (svc.status !== ServiceStatus.DRAFT) {
          historyRecords.push({
            serviceId: svc.id,
            fromStatus: ServiceStatus.DRAFT,
            toStatus: ServiceStatus.CONFIRMED,
            changedBy: operatorUser.id,
            changedAt: addDays(svc.date, 1),
          });
        }
        if (svc.status === ServiceStatus.IN_PROGRESS || svc.status === ServiceStatus.COMPLETED) {
          historyRecords.push({
            serviceId: svc.id,
            fromStatus: ServiceStatus.CONFIRMED,
            toStatus: ServiceStatus.IN_PROGRESS,
            changedBy: managerUser.id,
            changedAt: addDays(svc.date, 2),
          });
        }
        if (svc.status === ServiceStatus.COMPLETED) {
          historyRecords.push({
            serviceId: svc.id,
            fromStatus: ServiceStatus.IN_PROGRESS,
            toStatus: ServiceStatus.COMPLETED,
            changedBy: managerUser.id,
            changedAt: svc.completedAt ?? addDays(svc.date, 3),
          });
        }
      }

      if (historyRecords.length > 0) {
        await tx.serviceStatusHistory.createMany({ data: historyRecords });
      }

      return created;
    },
    { timeout: 60000 }
  );

  console.log(`Created ${createdServices.length} services.`);

  /* ---------- Loading Orders  ---------- */
  console.log('Creating loading orders ...');

  const completedServices = createdServices.filter((s) => s.status === ServiceStatus.COMPLETED);

  const loadingOrderInputs: any[] = [];
  for (let i = 1; i <= 10; i++) {
    const selected = completedServices.slice(i * 3, (i + 1) * 3).filter(Boolean);
    if (selected.length === 0) continue;
    const first = selected[0];
    if (!first?.clientId) continue;

    loadingOrderInputs.push({
      orderNumber: generateNumber('LO', i),
      generatedById: managerUser.id,
      clientId: first.clientId,
      notes: 'Loading order for multiple deliveries',
      pdfPath: `/documents/loading-orders/LO-2024-${String(i).padStart(5, '0')}.pdf`,
      pdfGeneratedAt: new Date(),
      pdfSize: Math.floor(Math.random() * 500_000) + 100_000,
      services: { create: selected.map((svc, idx) => ({ serviceId: svc.id, position: idx + 1 })) },
    });
  }

  const createdLoadingOrders =
    loadingOrderInputs.length > 0
      ? await prisma.$transaction(
          loadingOrderInputs.map((d) => prisma.loadingOrder.create({ data: d }))
        )
      : [];

  console.log(`Created ${createdLoadingOrders.length} loading orders.`);

  /* ---------- Invoices + Payments (per batch) ---------- */
  console.log('Creating invoices and payments...');

  const invoiceResults: any[] = [];

  // Build list of candidate services for invoicing (completed)
  const invoiceCandidateServices = createdServices.filter(
    (s) => s.status === ServiceStatus.COMPLETED
  );

  // We'll create up to 15 invoices
  for (let i = 1; i <= 15; i++) {
    const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    if (!supplier) continue;

    // pick 1-3 services that belong to this supplier
    const invoiceServices = invoiceCandidateServices
      .filter((s) => s.supplierId === supplier.id)
      .slice(0, Math.floor(Math.random() * 3) + 1);

    if (invoiceServices.length === 0) continue;

    // calculate amounts
    const subtotal = invoiceServices.reduce((sum, s) => sum + Number(s.costAmount), 0);
    const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
    const irpfRate = supplier.irpfRate ? Number(supplier.irpfRate) : 0;
    const irpfAmount = irpfRate > 0 ? Math.round(subtotal * (irpfRate / 100) * 100) / 100 : 0;
    const totalAmount = Math.round((subtotal + taxAmount - irpfAmount) * 100) / 100;

    const invoiceDate = subDays(currentDate, 45 - i * 3);
    const dueDate = addDays(invoiceDate, supplier.paymentTerms ?? 30);
    const isPaid = Math.random() > 0.3 && dueDate < currentDate;

    // create invoice and optional payment inside a transaction to keep each invoice atomic
    const createdInvoice = await prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.create({
        data: {
          invoiceNumber: generateNumber('INV', i),
          invoiceDate,
          dueDate,
          supplierId: supplier.id,
          createdById: accountantUser.id,
          subtotal,
          taxAmount,
          totalAmount,
          currency: supplier.currency ?? 'EUR',
          status: isPaid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
          paymentStatus: isPaid ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          paidAmount: isPaid ? totalAmount : 0,
          paidAt: isPaid ? addDays(invoiceDate, Math.floor(Math.random() * 20) + 10) : null,
          paymentMethod: isPaid ? 'TRANSFER' : null,
          irpfRate: irpfRate > 0 ? irpfRate : null,
          irpfAmount: irpfAmount > 0 ? irpfAmount : null,
          description: `Invoice for transport services - Period: ${invoiceDate.toLocaleDateString()}`,
          pdfPath: `/documents/invoices/INV-2024-${String(i).padStart(5, '0')}.pdf`,
          pdfGeneratedAt: invoiceDate,
          sentAt: addDays(invoiceDate, 1),
          sentTo: supplier.email ?? null,
          items: {
            create: invoiceServices.map((s) => ({
              serviceId: s.id,
              description: s.description ?? 'Transport service',
              quantity: 1,
              unitPrice: Number(s.costAmount),
              amount: Number(s.costAmount),
              taxRate: 21,
              taxAmount: Math.round(Number(s.costAmount) * 0.21 * 100) / 100,
            })),
          },
        },
      });

      if (isPaid) {
        await tx.payment.create({
          data: {
            paymentNumber: generateNumber('PAY', i),
            invoiceId: inv.id,
            amount: totalAmount,
            currency: supplier.currency ?? 'EUR',
            paymentDate: inv.paidAt ?? new Date(),
            paymentMethod: 'TRANSFER',
            reference: `REF-${Math.floor(Math.random() * 999999)}`,
            status: PaymentStatus.COMPLETED,
            notes: 'Payment received via bank transfer',
          },
        });
      }

      // Mark services INVOICED (updateMany)
      await tx.service.updateMany({
        where: { id: { in: invoiceServices.map((s) => s.id) } },
        data: { status: ServiceStatus.INVOICED },
      });

      return inv;
    });

    invoiceResults.push(createdInvoice);
  }

  console.log(`Created ${invoiceResults.length} invoices (and payments where applicable).`);

  /* ---------- Notifications ---------- */
  console.log('Creating notifications...');
  await prisma.$transaction([
    prisma.notification.create({
      data: {
        userId: adminUser.id,
        title: 'Welcome to Enterprise Dashboard',
        message: 'Your account has been successfully set up. Start by exploring the dashboard.',
        type: 'info',
        category: 'system',
        isRead: true,
        readAt: new Date(),
      },
    }),
    prisma.notification.create({
      data: {
        userId: adminUser.id,
        title: 'New Invoice Received',
        message: 'Invoice INV-2024-00001 has been received and requires approval.',
        type: 'info',
        category: 'invoice',
        actionUrl: '/invoices/INV-2024-00001',
        actionLabel: 'View Invoice',
        isRead: false,
      },
    }),
    prisma.notification.create({
      data: {
        userId: managerUser.id,
        title: 'Service Completed',
        message: 'Service SRV-2024-00001 has been marked as completed.',
        type: 'success',
        category: 'service',
        actionUrl: '/services/SRV-2024-00001',
        actionLabel: 'View Service',
        isRead: false,
      },
    }),
    prisma.notification.create({
      data: {
        userId: accountantUser.id,
        title: 'Payment Overdue',
        message: 'Invoice INV-2024-00002 is overdue by 5 days.',
        type: 'warning',
        category: 'invoice',
        actionUrl: '/invoices/INV-2024-00002',
        actionLabel: 'View Invoice',
        isRead: false,
      },
    }),
  ]);

  /* ---------- System Settings ---------- */
  console.log('Creating system settings...');
  await prisma.$transaction([
    prisma.systemSetting.create({
      data: {
        key: 'company.info',
        value: {
          name: 'Enterprise Dashboard Corp',
          address: 'Calle Principal 1, 28001 Madrid',
          vat: 'B00000000',
          email: 'info@enterprise-dashboard.com',
          phone: '+34 91 000 0000',
        },
        description: 'Company information',
        isPublic: true,
      },
    }),
    prisma.systemSetting.create({
      data: {
        key: 'invoice.settings',
        value: {
          prefix: 'INV',
          startNumber: 1,
          footerText: 'Thank you for your business',
          paymentTerms: 30,
          latePaymentFee: 1.5,
        },
        description: 'Invoice configuration',
        isPublic: false,
      },
    }),
    prisma.systemSetting.create({
      data: {
        key: 'email.templates',
        value: {
          invoiceSubject: 'Invoice {number} from {company}',
          invoiceBody: 'Please find attached invoice {number} with due date {dueDate}.',
          reminderSubject: 'Payment reminder for invoice {number}',
          reminderBody: 'This is a friendly reminder that invoice {number} is due.',
        },
        description: 'Email template settings',
        isPublic: false,
      },
    }),
    prisma.systemSetting.create({
      data: {
        key: 'features.enabled',
        value: {
          twoFactorAuth: true,
          emailNotifications: true,
          autoBackup: true,
          apiAccess: false,
        },
        description: 'Feature flags',
        isPublic: false,
      },
    }),
  ]);

  /* ---------- Audit Logs ---------- */
  console.log('Creating some audit logs...');
  // Reference a couple of existing records safely
  const auditActions = [
    { action: 'LOGIN', userId: adminUser.id, tableName: 'users', recordId: adminUser.id },
    {
      action: 'CREATE',
      userId: operatorUser.id,
      tableName: 'services',
      recordId: createdServices[0]?.id,
    },
    {
      action: 'UPDATE',
      userId: managerUser.id,
      tableName: 'services',
      recordId: createdServices[1]?.id,
    },
    {
      action: 'CREATE',
      userId: accountantUser.id,
      tableName: 'invoices',
      recordId: invoiceResults[0]?.id,
    },
  ];

  for (const audit of auditActions) {
    if (!audit.recordId) continue;
    await prisma.auditLog.create({
      data: {
        userId: audit.userId,
        action: audit.action as any,
        tableName: audit.tableName,
        recordId: audit.recordId,
        ipAddress: '192.168.1.100',
        userAgent: 'SeedScript/1.0',
        metadata: { seed: true },
      },
    });
  }

  console.log('Database seed completed successfully!');

  /* ---------- Summary ---------- */
  console.log('Database seed completed successfully!');

  console.log('\nSeed Summary:');
  console.log(`  - Users: 4`);
  console.log(`  - Companies: 2`);
  console.log(`  - Clients: ${clients.length}`);
  console.log(`  - Suppliers: ${suppliers.length}`);
  console.log(`  - Services: ${createdServices.length}`);
  console.log(`  - Loading Orders: ${createdLoadingOrders.length}`);
  console.log(`  - Invoices: ${invoiceResults.length}`);

  console.log('\nTest Credentials:');
  console.log('  Email: admin@example.com');
  console.log('  Password: password123');
}

/* ---------- Run ---------- */

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
