/**
 * Database Seed Script
 * Populates the database with sample data for development and testing
 */

import { PrismaClient, UserRole, ServiceStatus, InvoiceStatus, PaymentStatus } from '@prisma/client';
import { hash } from 'bcryptjs';
import { addDays, subDays, startOfMonth, endOfMonth } from 'date-fns';

const prisma = new PrismaClient();

/**
 * Generate a sequential number with prefix
 */
function generateNumber(prefix: string, index: number, year: number = new Date().getFullYear()): string {
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

  // =============================================
  // Create Users
  // =============================================
  console.log('Creating users...');
  
  const hashedPassword = await hash('password123', 12);
  
  const users = await Promise.all([
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

  const [adminUser, managerUser, accountantUser, operatorUser] = users;

  // =============================================
  // Create Companies
  // =============================================
  console.log('Creating companies...');
  
  const companies = await Promise.all([
    prisma.company.create({
      data: {
        code: 'COMP001',
        legalName: 'Transportes Rápidos S.L.',
        tradeName: 'TransRápido',
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
        metadata: {
          employees: 50,
          fleet_size: 30,
          certifications: ['ISO 9001', 'ISO 14001'],
        },
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
        addressLine2: 'Polígono Industrial Norte',
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

  // =============================================
  // Create Clients
  // =============================================
  console.log('Creating clients...');
  
  const clients = await Promise.all([
    prisma.client.create({
      data: {
        clientCode: 'CLI001',
        companyId: companies[0].id,
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
        name: 'E-Commerce Solutions Ltd.',
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

  // =============================================
  // Create Suppliers
  // =============================================
  console.log('Creating suppliers...');
  
  const suppliers = await Promise.all([
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP001',
        companyId: companies[1].id,
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
        metadata: {
          vehicle_type: 'Furgoneta',
          license_plate: '1234 ABC',
          insurance_number: 'INS-2024-001',
        },
      },
    }),
    prisma.supplier.create({
      data: {
        supplierCode: 'SUP002',
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

  // =============================================
  // Create Services
  // =============================================
  console.log('Creating services...');
  
  const currentDate = new Date();
  const startDate = subDays(currentDate, 60);
  const services = [];
  
  for (let i = 1; i <= 50; i++) {
    const serviceDate = randomDate(startDate, currentDate);
    const client = clients[Math.floor(Math.random() * clients.length)];
    const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    const costAmount = randomDecimal(100, 2000);
    const margin = randomDecimal(15, 35);
    const saleAmount = costAmount * (1 + margin / 100);
    
    const statuses = [
      ServiceStatus.COMPLETED,
      ServiceStatus.IN_PROGRESS,
      ServiceStatus.CONFIRMED,
      ServiceStatus.DRAFT,
    ];
    const status = statuses[Math.min(Math.floor(Math.random() * statuses.length), i < 30 ? 0 : 3)];
    
    const service = await prisma.service.create({
      data: {
        serviceNumber: generateNumber('SRV', i),
        date: serviceDate,
        clientId: client.id,
        supplierId: supplier.id,
        createdById: operatorUser.id,
        assignedToId: Math.random() > 0.5 ? managerUser.id : operatorUser.id,
        description: `Transport service from warehouse to ${['Store A', 'Store B', 'Distribution Center', 'Customer Location'][Math.floor(Math.random() * 4)]}`,
        reference: Math.random() > 0.5 ? `PO-2024-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}` : undefined,
        origin: ['Madrid', 'Barcelona', 'Valencia', 'Sevilla'][Math.floor(Math.random() * 4)],
        destination: ['Bilbao', 'Zaragoza', 'Málaga', 'Lisboa'][Math.floor(Math.random() * 4)],
        distance: Math.floor(Math.random() * 500) + 50,
        vehicleType: ['Truck', 'Van', 'Trailer', 'Container'][Math.floor(Math.random() * 4)],
        vehiclePlate: `${Math.floor(Math.random() * 9999)} ${['ABC', 'DEF', 'GHI', 'JKL'][Math.floor(Math.random() * 4)]}`,
        driverName: ['Juan Pérez', 'María García', 'Carlos López', 'Ana Martínez'][Math.floor(Math.random() * 4)],
        costAmount,
        saleAmount,
        margin: saleAmount - costAmount,
        marginPercentage: margin,
        costVatRate: 21,
        costVatAmount: costAmount * 0.21,
        saleVatRate: 21,
        saleVatAmount: saleAmount * 0.21,
        status,
        completedAt: status === ServiceStatus.COMPLETED ? addDays(serviceDate, Math.floor(Math.random() * 3) + 1) : undefined,
        notes: Math.random() > 0.7 ? 'Handle with care - fragile items' : undefined,
        internalNotes: Math.random() > 0.8 ? 'Regular customer - priority service' : undefined,
      },
    });
    
    services.push(service);
    
    // Add status history
    if (status !== ServiceStatus.DRAFT) {
      await prisma.serviceStatusHistory.create({
        data: {
          serviceId: service.id,
          fromStatus: ServiceStatus.DRAFT,
          toStatus: ServiceStatus.CONFIRMED,
          changedBy: operatorUser.id,
          changedAt: addDays(serviceDate, 1),
        },
      });
    }
    
    if (status === ServiceStatus.IN_PROGRESS || status === ServiceStatus.COMPLETED) {
      await prisma.serviceStatusHistory.create({
        data: {
          serviceId: service.id,
          fromStatus: ServiceStatus.CONFIRMED,
          toStatus: ServiceStatus.IN_PROGRESS,
          changedBy: managerUser.id,
          changedAt: addDays(serviceDate, 2),
        },
      });
    }
    
    if (status === ServiceStatus.COMPLETED) {
      await prisma.serviceStatusHistory.create({
        data: {
          serviceId: service.id,
          fromStatus: ServiceStatus.IN_PROGRESS,
          toStatus: ServiceStatus.COMPLETED,
          changedBy: managerUser.id,
          changedAt: service.completedAt!,
        },
      });
    }
  }

  // =============================================
  // Create Loading Orders
  // =============================================
  console.log('Creating loading orders...');
  
  const completedServices = services.filter(s => s.status === ServiceStatus.COMPLETED);
  const loadingOrders = [];
  
  for (let i = 1; i <= 10; i++) {
    const selectedServices = completedServices
      .slice(i * 3, (i + 1) * 3)
      .filter(Boolean);
    
    if (selectedServices.length > 0) {
      const loadingOrder = await prisma.loadingOrder.create({
        data: {
          orderNumber: generateNumber('LO', i),
          generatedById: managerUser.id,
          clientId: selectedServices[0].clientId,
          notes: 'Loading order for multiple deliveries',
          pdfPath: `/documents/loading-orders/LO-2024-${String(i).padStart(5, '0')}.pdf`,
          pdfGeneratedAt: new Date(),
          pdfSize: Math.floor(Math.random() * 500000) + 100000,
          services: {
            create: selectedServices.map((service, index) => ({
              serviceId: service.id,
              position: index + 1,
            })),
          },
        },
      });
      
      loadingOrders.push(loadingOrder);
    }
  }

  // =============================================
  // Create Invoices
  // =============================================
  console.log('Creating invoices...');
  
  const invoicedServices = services.filter(s => s.status === ServiceStatus.COMPLETED).slice(0, 20);
  const invoices = [];
  
  for (let i = 1; i <= 15; i++) {
    const supplier = suppliers[Math.floor(Math.random() * suppliers.length)];
    const invoiceServices = invoicedServices
      .filter(s => s.supplierId === supplier.id)
      .slice(0, Math.floor(Math.random() * 3) + 1);
    
    if (invoiceServices.length > 0) {
      const subtotal = invoiceServices.reduce((sum, s) => sum + Number(s.costAmount), 0);
      const taxAmount = subtotal * 0.21;
      const irpfRate = supplier.irpfRate ? Number(supplier.irpfRate) : 0;
      const irpfAmount = irpfRate > 0 ? subtotal * (irpfRate / 100) : 0;
      const totalAmount = subtotal + taxAmount - irpfAmount;
      
      const invoiceDate = subDays(currentDate, 45 - i * 3);
      const dueDate = addDays(invoiceDate, supplier.paymentTerms);
      const isPaid = Math.random() > 0.3 && dueDate < currentDate;
      
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: generateNumber('INV', i),
          invoiceDate,
          dueDate,
          supplierId: supplier.id,
          createdById: accountantUser.id,
          subtotal,
          taxAmount,
          totalAmount,
          currency: supplier.currency,
          status: isPaid ? InvoiceStatus.PAID : InvoiceStatus.SENT,
          paymentStatus: isPaid ? PaymentStatus.COMPLETED : PaymentStatus.PENDING,
          paidAmount: isPaid ? totalAmount : 0,
          paidAt: isPaid ? addDays(invoiceDate, Math.floor(Math.random() * 20) + 10) : undefined,
          paymentMethod: isPaid ? 'TRANSFER' : undefined,
          irpfRate: irpfRate > 0 ? irpfRate : undefined,
          irpfAmount: irpfAmount > 0 ? irpfAmount : undefined,
          description: `Invoice for transport services - Period: ${invoiceDate.toLocaleDateString()}`,
          pdfPath: `/documents/invoices/INV-2024-${String(i).padStart(5, '0')}.pdf`,
          pdfGeneratedAt: invoiceDate,
          sentAt: addDays(invoiceDate, 1),
          sentTo: supplier.email,
          items: {
            create: invoiceServices.map(service => ({
              serviceId: service.id,
              description: service.description,
              quantity: 1,
              unitPrice: service.costAmount,
              amount: service.costAmount,
              taxRate: 21,
              taxAmount: Number(service.costAmount) * 0.21,
            })),
          },
        },
      });
      
      invoices.push(invoice);
      
      // Create payment if paid
      if (isPaid) {
        await prisma.payment.create({
          data: {
            paymentNumber: generateNumber('PAY', i),
            invoiceId: invoice.id,
            amount: totalAmount,
            currency: supplier.currency,
            paymentDate: invoice.paidAt!,
            paymentMethod: 'TRANSFER',
            reference: `REF-${Math.floor(Math.random() * 999999)}`,
            status: PaymentStatus.COMPLETED,
            notes: 'Payment received via bank transfer',
          },
        });
      }
      
      // Update services to INVOICED
      await prisma.service.updateMany({
        where: {
          id: {
            in: invoiceServices.map(s => s.id),
          },
        },
        data: {
          status: ServiceStatus.INVOICED,
        },
      });
    }
  }

  // =============================================
  // Create Notifications
  // =============================================
  console.log('Creating notifications...');
  
  await Promise.all([
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

  // =============================================
  // Create System Settings
  // =============================================
  console.log('Creating system settings...');
  
  await Promise.all([
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

  // =============================================
  // Create Audit Logs
  // =============================================
  console.log('Creating audit logs...');
  
  const auditActions = [
    { action: 'LOGIN', userId: adminUser.id, tableName: 'users', recordId: adminUser.id },
    { action: 'CREATE', userId: operatorUser.id, tableName: 'services', recordId: services[0].id },
    { action: 'UPDATE', userId: managerUser.id, tableName: 'services', recordId: services[1].id },
    { action: 'CREATE', userId: accountantUser.id, tableName: 'invoices', recordId: invoices[0]?.id },
  ];
  
  for (const audit of auditActions) {
    if (audit.recordId) {
      await prisma.auditLog.create({
        data: {
          userId: audit.userId,
          action: audit.action as any,
          tableName: audit.tableName,
          recordId: audit.recordId,
          ipAddress: '192.168.1.100',
          userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
          metadata: {
            browser: 'Chrome',
            os: 'Windows',
            device: 'Desktop',
          },
        },
      });
    }
  }

  console.log('Database seed completed successfully!');
  
  // Print summary
  console.log('\nSeed Summary:');
  console.log(`  - Users: ${users.length}`);
  console.log(`  - Companies: ${companies.length}`);
  console.log(`  - Clients: ${clients.length}`);
  console.log(`  - Suppliers: ${suppliers.length}`);
  console.log(`  - Services: ${services.length}`);
  console.log(`  - Loading Orders: ${loadingOrders.length}`);
  console.log(`  - Invoices: ${invoices.length}`);
  
  console.log('\nTest Credentials:');
  console.log('  Email: admin@example.com');
  console.log('  Password: password123');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });