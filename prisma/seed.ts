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
  Company,
  Client,
  Supplier,
  Service,
  LoadingOrder,
  Invoice,
  SystemSetting,
  Notification,
  AuditLog,
  User,
} from '@/app/generated/prisma';
import { hash } from 'bcryptjs';
import crypto from 'crypto';
import { addDays, subDays } from 'date-fns';

const prisma = new PrismaClient();

interface SeedUsers {
  admin: User;
  manager: User;
  accountant: User;
  operator: User;
}

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

/**
 * Generate random integer between 0 (inclusive) and max (exclusive)
 * @param max
 * @returns
 */
function getRandomInt(max: number): number {
  return crypto.randomInt(max);
}

/**
 * Clean existing data from all tables to ensure a fresh seed
 */
async function cleanDatabase(): Promise<void> {
  console.log('Cleaning existing data...');

  const deleteOperations = [
    prisma.auditLog.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.invoiceItem.deleteMany(),
    prisma.invoice.deleteMany(),
    prisma.serviceLoadingOrder.deleteMany(),
    prisma.loadingOrder.deleteMany(),
    prisma.serviceStatusHistory.deleteMany(),
    prisma.service.deleteMany(),
    prisma.clientContact.deleteMany(),
    prisma.client.deleteMany(),
    prisma.supplier.deleteMany(),
    prisma.company.deleteMany(),
    prisma.document.deleteMany(),
    prisma.systemSetting.deleteMany(),
    prisma.session.deleteMany(),
    prisma.account.deleteMany(),
    prisma.user.deleteMany(),
  ];

  for (const operation of deleteOperations) {
    await operation;
  }
}

/**
 * Create initial users with different roles and return references for later use
 * @returns Object containing created user records for admin, manager, accountant, and operator
 */
async function createUsers(): Promise<SeedUsers> {
  console.log('Creating users...');
  const hashedPassword = await hash('password123', 12);

  const userData = [
    {
      email: 'admin@example.com',
      name: 'Admin User',
      role: UserRole.ADMIN,
      department: 'Management',
      phone: '+34 600 123 456',
      lastLoginAt: new Date(),
    },
    {
      email: 'manager@example.com',
      name: 'Manager User',
      role: UserRole.MANAGER,
      department: 'Operations',
      phone: '+34 600 234 567',
    },
    {
      email: 'accountant@example.com',
      name: 'Accountant User',
      role: UserRole.ACCOUNTANT,
      department: 'Finance',
      phone: '+34 600 345 678',
    },
    {
      email: 'operator@example.com',
      name: 'Operator User',
      role: UserRole.OPERATOR,
      department: 'Operations',
      phone: '+34 600 456 789',
    },
  ];

  const users = await prisma.$transaction(
    userData.map((data) =>
      prisma.user.create({
        data: { ...data, password: hashedPassword, emailVerified: new Date(), isActive: true },
      })
    )
  );

  return {
    admin: users[0]!,
    manager: users[1]!,
    accountant: users[2]!,
    operator: users[3]!,
  };
}

/**
 * Create sample companies with realistic data and return references for later use
 * @returns Array of created company records
 */
async function createCompanies(): Promise<Company[]> {
  console.log('Creating companies...');

  return prisma.$transaction([
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
}

/**
 *  Create sample clients with realistic data and return references for later use
 * @param companies
 * @returns Array of created client records
 */
async function createClient(companies: Company[]): Promise<Client[]> {
  console.log('Creating clients...');
  const [companyA, companyB] = companies;

  return prisma.$transaction([
    prisma.client.create({
      data: {
        clientCode: 'CLI001',
        companyId: companyA!.id,
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
        companyId: companyA!.id,
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
        companyId: companyB!.id,
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
}

/**
 *  Create sample suppliers with realistic data and return references for later use
 * @param companies
 * @returns Array of created supplier records
 */
async function createSuppliers(companies: Company[]): Promise<Supplier[]> {
  console.log('Creating suppliers...');
  const companyB = companies[1];

  return prisma.$transaction([
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP001',
        companyId: companyB!.id,
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
        companyId: companyB!.id,
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
        companyId: companyB!.id,
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
}

/**
 *  Create sample services with realistic data, including randomization for dates, amounts, and statuses. Also builds related status history records.
 * @param clients
 * @param suppliers
 * @param users
 */
async function createServices(
  clients: Client[],
  suppliers: Supplier[],
  users: SeedUsers
): Promise<Service[]> {
  console.log('Creating services ...');

  const currentDate = new Date();
  const startDate = subDays(currentDate, 60);
  const serviceCreateInputs: any[] = [];

  for (let i = 1; i <= 50; i++) {
    const serviceDate = randomDate(startDate, currentDate);
    const client = clients[getRandomInt(clients.length)];
    const supplier = suppliers[getRandomInt(suppliers.length)];
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
    const status = i < 30 ? statuses[getRandomInt(3)] : statuses[getRandomInt(statuses.length)];
    const completedAt =
      status === ServiceStatus.COMPLETED ? addDays(serviceDate, getRandomInt(3) + 1) : null;

    const origins = ['Madrid', 'Barcelona', 'Valencia', 'Sevilla'];
    const destinations = ['Bilbao', 'Zaragoza', 'Málaga', 'Lisboa'];
    const vehicleTypes = ['Truck', 'Van', 'Trailer', 'Container'];
    const plateSuffixes = ['ABC', 'DEF', 'GHI', 'JKL'];
    const drivers = ['Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez'];
    const storeNames = ['Store A', 'Store B', 'Distribution Center', 'Customer Location'];

    serviceCreateInputs.push({
      serviceNumber: generateNumber('SRV', i),
      date: serviceDate,
      clientId: client.id,
      supplierId: supplier.id,
      createdById: users.operator.id,
      assignedToId: getRandomInt(2) === 0 ? users.manager.id : users.operator.id,
      description: `Transport service from warehouse to ${storeNames[getRandomInt(storeNames.length)]}`,
      reference:
        Math.random() > 0.5 ? `PO-2024-${String(getRandomInt(10000)).padStart(4, '0')}` : null,
      origin: origins[getRandomInt(origins.length)],
      destination: destinations[getRandomInt(destinations.length)],
      distance: getRandomInt(500) + 50,
      vehicleType: vehicleTypes[getRandomInt(vehicleTypes.length)],
      vehiclePlate: `${String(getRandomInt(10000)).padStart(4, '0')} ${plateSuffixes[getRandomInt(plateSuffixes.length)]}`,
      driverName: drivers[getRandomInt(drivers.length)],
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

  return prisma.$transaction(
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
            changedBy: users.operator.id,
            changedAt: addDays(svc.date, 1),
          });
        }
        if (svc.status === ServiceStatus.IN_PROGRESS || svc.status === ServiceStatus.COMPLETED) {
          historyRecords.push({
            serviceId: svc.id,
            fromStatus: ServiceStatus.CONFIRMED,
            toStatus: ServiceStatus.IN_PROGRESS,
            changedBy: users.operator.id,
            changedAt: addDays(svc.date, 2),
          });
        }
        if (svc.status === ServiceStatus.COMPLETED) {
          historyRecords.push({
            serviceId: svc.id,
            fromStatus: ServiceStatus.IN_PROGRESS,
            toStatus: ServiceStatus.COMPLETED,
            changedBy: users.operator.id,
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
}

/**
 *  Create sample loading orders that group multiple completed services, and return references for later use. Each loading order will be associated with 2-3 completed services.
 * @param services
 * @param users
 */
async function createLoadingOrders(services: Service[], users: SeedUsers): Promise<LoadingOrder[]> {
  console.log('Creating loading orders ...');

  const completedServices = services.filter((s) => s.status === ServiceStatus.COMPLETED);
  const loadingOrderInputs: any[] = [];

  for (let i = 1; i <= 10; i++) {
    const selected = completedServices.slice(i * 3, (i + 1) * 3).filter(Boolean);
    if (selected.length === 0) continue;
    const first = selected[0];
    if (!first?.clientId) continue;

    loadingOrderInputs.push({
      orderNumber: generateNumber('LO', i),
      generatedById: users.manager.id,
      clientId: first.clientId,
      notes: 'Loading order for multiple deliveries',
      pdfPath: `/documents/loading-orders/LO-2024-${String(i).padStart(5, '0')}.pdf`,
      pdfGeneratedAt: new Date(),
      pdfSize: getRandomInt(500_000) + 100_000,
      services: { create: selected.map((svc, idx) => ({ serviceId: svc.id, position: idx + 1 })) },
    });
  }

  if (loadingOrderInputs.length === 0) return [];

  return prisma.$transaction(
    loadingOrderInputs.map((d) => prisma.loadingOrder.create({ data: d }))
  );
}

/**
 *  Create sample invoices for completed services, associating them with suppliers and clients. Randomly determine which invoices are paid vs pending, and create corresponding payment records for paid invoices. Also updates the status of invoiced services to INVOICED.
 * @param tx
 * @param index
 * @param supplier
 * @param invoiceServices
 * @param users
 * @param currentDate
 */
async function createSingleInvoice(
  tx: any,
  index: number,
  supplier: Supplier,
  invoiceServices: Service[],
  users: SeedUsers,
  currentDate: Date
): Promise<Invoice> {
  console.log('Creating invoices and payments...');

  // calculate amounts
  const subtotal = invoiceServices.reduce((sum, s) => sum + Number(s.costAmount), 0);
  const taxAmount = Math.round(subtotal * 0.21 * 100) / 100;
  const irpfRate = supplier.irpfRate ? Number(supplier.irpfRate) : 0;
  const irpfAmount = irpfRate > 0 ? Math.round(subtotal * (irpfRate / 100) * 100) / 100 : 0;
  const totalAmount = Math.round((subtotal + taxAmount - irpfAmount) * 100) / 100;

  const invoiceDate = subDays(currentDate, 45 - index * 3);
  const dueDate = addDays(invoiceDate, supplier.paymentTerms ?? 30);
  const isPaid = Math.random() > 0.3 && dueDate < currentDate;

  // create invoice and optional payment inside a transaction to keep each invoice atomic
  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber: generateNumber('INV', index),
      invoiceDate,
      dueDate,
      supplierId: supplier.id,
      createdById: users.accountant.id,
      subtotal,
      taxAmount,
      totalAmount,
      currency: supplier.currency ?? 'EUR',
      status: isPaid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
      paymentStatus: isPaid ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
      paidAmount: isPaid ? totalAmount : 0,
      paidAt: isPaid ? addDays(invoiceDate, getRandomInt(20) + 10) : null,
      paymentMethod: isPaid ? 'TRANSFER' : null,
      irpfRate: irpfRate > 0 ? irpfRate : null,
      irpfAmount: irpfAmount > 0 ? irpfAmount : null,
      description: `Invoice for transport services - Period: ${invoiceDate.toLocaleDateString()}`,
      pdfPath: `/documents/invoices/INV-2024-${String(index).padStart(5, '0')}.pdf`,
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
        paymentNumber: generateNumber('PAY', index),
        invoiceId: invoice.id,
        amount: totalAmount,
        currency: supplier.currency ?? 'EUR',
        paymentDate: invoice.paidAt ?? new Date(),
        paymentMethod: 'TRANSFER',
        reference: `REF-${getRandomInt(999999)}`,
        status: PaymentStatus.COMPLETED,
        notes: 'Payment received via bank transfer',
      },
    });
  }

  await tx.service.updateMany({
    where: { id: { in: invoiceServices.map((s) => s.id) } },
    data: { status: ServiceStatus.INVOICED },
  });

  return invoice;
}

/**
 *  Create sample invoices for completed services, associating them with suppliers and clients. Randomly determine which invoices are paid vs pending, and create corresponding payment records for paid invoices. Also updates the status of invoiced services to INVOICED.
 * @param supplier
 * @param invoiceServices
 * @param users
 * @param currentDate
 */

async function createInvoices(
  suppliers: Supplier[],
  services: Service[],
  users: SeedUsers
): Promise<Invoice[]> {
  console.log('Creating invoices and payments...');

  const invoices: Invoice[] = [];
  const currentDate = new Date();
  const completedServices = services.filter((s) => s.status === ServiceStatus.COMPLETED);

  for (let i = 1; i <= 15; i++) {
    const supplier = suppliers[getRandomInt(suppliers.length)];
    if (!supplier) continue;

    // pick 1-3 services that belong to this supplier
    const invoiceServices = completedServices
      .filter((s) => s.supplierId === supplier.id)
      .slice(0, getRandomInt(3) + 1);

    if (invoiceServices.length === 0) continue;

    const createdInvoice = await prisma.$transaction((tx) =>
      createSingleInvoice(tx, i, supplier, invoiceServices, users, currentDate)
    );

    invoices.push(createdInvoice);
  }
  return invoices;
}

/**
 *  Create sample notifications for users, including a mix of read/unread and different types (info, warning, success). Some notifications will include action URLs to simulate real application behavior.
 * @param users
 */
async function createNotifications(users: SeedUsers): Promise<Notification[]> {
  console.log('Creating notifications...');

  const notifications = [
    {
      userId: users.admin.id,
      title: 'Welcome to Enterprise Dashboard',
      message: 'Your account has been successfully set up. Start by exploring the dashboard.',
      type: 'info',
      category: 'system',
      isRead: true,
      readAt: new Date(),
    },
    {
      userId: users.admin.id,
      title: 'New Invoice Received',
      message: 'Invoice INV-2024-00001 has been received and requires approval.',
      type: 'info',
      category: 'invoice',
      actionUrl: '/invoices/INV-2024-00001',
      actionLabel: 'View Invoice',
      isRead: false,
    },
    {
      userId: users.manager.id,
      title: 'Service Completed',
      message: 'Service SRV-2024-00001 has been marked as completed.',
      type: 'success',
      category: 'service',
      actionUrl: '/services/SRV-2024-00001',
      actionLabel: 'View Service',
      isRead: false,
    },
    {
      userId: users.accountant.id,
      title: 'Payment Overdue',
      message: 'Invoice INV-2024-00002 is overdue by 5 days.',
      type: 'warning',
      category: 'invoice',
      actionUrl: '/invoices/INV-2024-00002',
      actionLabel: 'View Invoice',
      isRead: false,
    },
  ];

  return prisma.$transaction(notifications.map((data) => prisma.notification.create({ data })));
}

/**
 * Create sample system settings with default values. These settings can be used to control application behavior and features. For example, we can create settings for enabling/disabling features, setting default values, or storing API keys. This is a placeholder function where you can define your specific settings based on your application's needs.
 */
async function createSystemSettings(): Promise<SystemSetting[]> {
  console.log('Creating system settings...');

  const settings = [
    {
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
    {
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
    {
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
    {
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
  ];
  return prisma.$transaction(settings.map((data) => prisma.systemSetting.create({ data })));
}

/**
 *  Create sample audit logs to track important actions performed by users in the system. This can include actions like user logins, service status changes, invoice creations, etc. Each log entry will reference the user who performed the action, the type of action, the affected table and record, and a timestamp. This is useful for monitoring and debugging purposes.
 * @param users
 * @param services
 * @param invoices
 */
async function createAuditLogs(
  users: SeedUsers,
  services: Service[],
  invoices: Invoice[]
): Promise<AuditLog[]> {
  console.log('Creating some audit logs...');

  const auditActions = [
    { action: 'LOGIN', userId: users.admin.id, tableName: 'users', recordId: users.admin.id },
    {
      action: 'CREATE',
      userId: users.operator.id,
      tableName: 'services',
      recordId: services[0]?.id,
    },
    {
      action: 'UPDATE',
      userId: users.manager.id,
      tableName: 'services',
      recordId: services[1]?.id,
    },
    {
      action: 'CREATE',
      userId: users.accountant.id,
      tableName: 'invoices',
      recordId: invoices[0]?.id,
    },
  ].filter((a) => a.recordId);

  return prisma.$transaction(
    auditActions.map((audit) =>
      prisma.auditLog.create({
        data: {
          userId: audit.userId,
          action: audit.action as any,
          tableName: audit.tableName,
          recordId: audit.recordId!,
          ipAddress: '192.168.1.100',
          userAgent: 'SeedScript/1.0',
          metadata: { seed: true },
        },
      })
    )
  );
}

async function main() {
  console.log('Starting database seed...');

  await cleanDatabase();

  const users = await createUsers();
  console.log(`Created 4 users.`);

  const companies = await createCompanies();
  console.log(`Created ${companies.length} companies.`);

  const suppliers = await createSuppliers(companies);
  console.log(`Created ${suppliers.length} suppliers.`);

  const clients = await createClient(companies);
  console.log(`Created ${clients.length} clients.`);

  const services = await createServices(clients, suppliers, users);
  console.log(`Created ${services.length} services.`);

  const loadingOrders = await createLoadingOrders(services, users);
  console.log(`Created ${loadingOrders.length} loading orders.`);

  const invoices = await createInvoices(suppliers, services, users);
  console.log(`Created ${invoices.length} invoices (and payments where applicable).`);

  const notifications = await createNotifications(users);
  console.log(`Created ${notifications.length} notifications.`);

  const settings = await createSystemSettings();
  console.log(`Created ${settings.length} system settings.`);

  const auditLogs = await createAuditLogs(users, services, invoices);
  console.log(`Created ${auditLogs.length} audit logs.`);

  console.log('Database seed completed successfully!');

  /* ---------- Summary ---------- */
  console.log('Database seed completed successfully!');

  console.log('\nSeed Summary:');
  console.log(`  - Users: 4`);
  console.log(`  - Companies: ${companies.length}`);
  console.log(`  - Clients: ${clients.length}`);
  console.log(`  - Suppliers: ${suppliers.length}`);
  console.log(`  - Services: ${services.length}`);
  console.log(`  - Loading Orders: ${loadingOrders.length}`);
  console.log(`  - Invoices: ${invoices.length}`);
  console.log(`  - Notifications: ${notifications.length}`);
  console.log(`  - System Settings: ${settings.length}`);
  console.log(`  - Audit Logs: ${auditLogs.length}`);

  console.log('\nTest Credentials:');
  console.log('  Email: admin@example.com');
  console.log('  Password: password123');
}

/* ---------- Run ---------- */
try {
  await main();
} catch (e) {
  console.error('Seed error:', e);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
