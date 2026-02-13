/**
 * Email Templates
 * React Email templates for all email types
 * @module email-templates
 */

import * as React from 'react';
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
  Row,
  Column,
  Tailwind,
} from '@react-email/components';

import type {
  VerificationEmailData,
  PasswordResetEmailData,
  WelcomeEmailData,
  InvoiceEmailData,
  LoadingOrderEmailData,
  NotificationEmailData,
  AccountLockedEmailData,
  TwoFactorEmailData,
} from '@/types/mail';
import { formatCurrency } from '../utils/formatting';

/**
 * Shared email template styles and utilities
 */

export const styles = {
  main: {
    backgroundColor: '#ffffff',
    fontFamily:
      '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
  } satisfies React.CSSProperties,

  container: {
    margin: '0 auto',
    padding: '20px 0 48px',
    maxWidth: '560px',
  } satisfies React.CSSProperties,

  logo: {
    margin: '0 auto',
    display: 'block',
  } satisfies React.CSSProperties,

  heading: {
    fontSize: '24px',
    letterSpacing: '-0.5px',
    lineHeight: '1.3',
    fontWeight: '400',
    color: '#484848',
    padding: '17px 0 0',
  } satisfies React.CSSProperties,

  paragraph: {
    margin: '0 0 15px',
    fontSize: '15px',
    lineHeight: '1.4',
    color: '#3c4149',
  } satisfies React.CSSProperties,

  button: {
    backgroundColor: '#3b82f6',
    borderRadius: '5px',
    color: '#fff',
    fontSize: '16px',
    fontWeight: 'bold',
    textDecoration: 'none',
    textAlign: 'center' as const,
    display: 'inline-block',
    padding: '12px 20px',
    width: '100%',
    maxWidth: '200px',
  } satisfies React.CSSProperties,

  hr: {
    borderColor: '#e6ebf1',
    margin: '20px 0',
  } satisfies React.CSSProperties,

  footer: {
    color: '#8898aa',
    fontSize: '12px',
    lineHeight: '16px',
  } satisfies React.CSSProperties,

  codeBox: {
    background: '#f4f4f4',
    borderRadius: '4px',
    fontSize: '24px',
    fontWeight: 'bold',
    textAlign: 'center' as const,
    padding: '16px',
    color: '#333',
    letterSpacing: '4px',
  } satisfies React.CSSProperties,

  alertBox: (color: string) =>
    ({
      backgroundColor: color === 'red' ? '#fef2f2' : '#eff6ff',
      border: `1px solid ${color === 'red' ? '#fee2e2' : '#dbeafe'}`,
      borderRadius: '6px',
      padding: '16px',
      marginTop: '20px',
      marginBottom: '20px',
    }) satisfies React.CSSProperties,
};

// Get base URL with fallback
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

// Get company details
export function getCompanyDetails() {
  return {
    name: process.env.NEXT_PUBLIC_COMPANY_NAME || 'Road Freight ERP',
    address: process.env.NEXT_PUBLIC_COMPANY_ADDRESS || '123 Business St • Madrid, Spain 28001',
    taxId: process.env.NEXT_PUBLIC_COMPANY_TAX_ID || 'B12345678',
    supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || 'support@roadfreight-erp.com',
    billingEmail: process.env.NEXT_PUBLIC_BILLING_EMAIL || 'billing@roadfreight-erp.com',
  };
}

/**
 * Verification Email Template
 */
export function VerificationEmailTemplate({
  name,
  email,
  verificationUrl,
  expiresIn,
}: Readonly<VerificationEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();
  return (
    <Html>
      <Head />
      <Preview>Verify your email address for {company.name}</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Verify your email address</Heading>

            <Text style={styles.paragraph}>Hi {name},</Text>

            <Text style={styles.paragraph}>
              Thanks for signing up for {company.name}! Please verify your email address by clicking
              the button below:
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={styles.button} href={verificationUrl}>
                Verify Email Address
              </Button>
            </Section>

            <Text style={styles.paragraph}>Or copy and paste this URL into your browser:</Text>
            <Link
              href={verificationUrl}
              style={{ color: '#3b82f6', fontSize: '14px', wordBreak: 'break-all' }}
            >
              {verificationUrl}
            </Link>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              This verification link will expire in {expiresIn}.
            </Text>

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              If you didn&apos;t create an account with {company.name}, you can safely ignore this
              email.
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name} • {company.address}
              <br />
              This email was sent to {email}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Password Reset Email Template
 */
export function PasswordResetEmailTemplate({
  name,
  email,
  resetUrl,
  expiresIn,
  ipAddress,
  userAgent,
}: Readonly<PasswordResetEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>Reset your {company.name} password</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Reset your password</Heading>

            <Text style={styles.paragraph}>Hi {name},</Text>

            <Text style={styles.paragraph}>
              We received a request to reset your password for your {company.name} account. Click
              the button below to create a new password:
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={styles.button} href={resetUrl}>
                Reset Password
              </Button>
            </Section>

            <Text style={styles.paragraph}>Or copy and paste this URL into your browser:</Text>
            <Link
              href={resetUrl}
              style={{ color: '#3b82f6', fontSize: '14px', wordBreak: 'break-all' }}
            >
              {resetUrl}
            </Link>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              This password reset link will expire in {expiresIn}.
            </Text>

            {(ipAddress || userAgent) && (
              <Section
                style={{
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fee2e2',
                  borderRadius: '6px',
                  padding: '12px',
                  marginTop: '20px',
                }}
              >
                <Text
                  style={{
                    ...styles.paragraph,
                    fontSize: '14px',
                    fontWeight: 'bold',
                    color: '#991b1b',
                  }}
                >
                  Security Information:
                </Text>
                {ipAddress && (
                  <Text
                    style={{
                      ...styles.paragraph,
                      fontSize: '13px',
                      margin: '5px 0',
                      color: '#991b1b',
                    }}
                  >
                    IP Address: {ipAddress}
                  </Text>
                )}
                {userAgent && (
                  <Text
                    style={{
                      ...styles.paragraph,
                      fontSize: '13px',
                      margin: '5px 0',
                      color: '#991b1b',
                    }}
                  >
                    Browser: {userAgent}
                  </Text>
                )}
                <Text
                  style={{
                    ...styles.paragraph,
                    fontSize: '13px',
                    marginTop: '10px',
                    color: '#991b1b',
                  }}
                >
                  If you didn&apos;t request this, please secure your account immediately.
                </Text>
              </Section>
            )}

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name} • {company.address}
              <br />
              This email was sent to {email}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Two-Factor Authentication Email Template
 */
export function TwoFactorEmailTemplate({
  name,
  email,
  code,
  expiresIn,
}: Readonly<TwoFactorEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>
        Your {company.name} verification code: {code}
      </Preview>

      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Two-Factor Authentication</Heading>

            <Text style={styles.paragraph}>Hi {name},</Text>

            <Text style={styles.paragraph}>Your two-factor authentication code is:</Text>

            <Section style={styles.codeBox}>{code}</Section>

            <Text style={styles.paragraph}>
              Enter this code in your browser to complete the sign-in process.
            </Text>

            <Text style={{ ...styles.paragraph, fontSize: '14px', color: '#ef4444' }}>
              This code will expire in {expiresIn}.
            </Text>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              If you didn&apos;t attempt to sign in, someone may be trying to access your account.
              Please change your password immediately and contact support.
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name} • Security Alert
              <br />
              This email was sent to {email}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Account Locked Email Template
 */
export function AccountLockedEmailTemplate({
  name,
  email,
  reason,
  unlockUrl,
  supportUrl,
  lockedAt,
}: Readonly<AccountLockedEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>Your {company.name} account has been locked</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Account Security Alert</Heading>

            <Text style={styles.paragraph}>Hi {name},</Text>

            <Section
              style={{
                backgroundColor: '#fef2f2',
                border: '1px solid #fee2e2',
                borderRadius: '6px',
                padding: '16px',
                marginTop: '20px',
                marginBottom: '20px',
              }}
            >
              <Text style={{ ...styles.paragraph, fontWeight: 'bold', color: '#991b1b' }}>
                Your account has been locked
              </Text>
              <Text style={{ ...styles.paragraph, color: '#991b1b', marginBottom: '5px' }}>
                Reason: {reason}
              </Text>
              <Text
                style={{ ...styles.paragraph, fontSize: '14px', color: '#991b1b', marginBottom: 0 }}
              >
                Locked at: {lockedAt}
              </Text>
            </Section>

            <Text style={styles.paragraph}>
              To unlock your account, please follow the security verification process:
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={styles.button} href={unlockUrl}>
                Unlock Account
              </Button>
            </Section>

            <Text style={styles.paragraph}>
              If you need assistance, please contact our support team:
            </Text>

            <Section style={{ textAlign: 'center', marginTop: '20px' }}>
              <Button style={{ ...styles.button, backgroundColor: '#6b7280' }} href={supportUrl}>
                Contact Support
              </Button>
            </Section>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name} • Security Team
              <br />
              This email was sent to {email}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Welcome Email Template
 */
export function WelcomeEmailTemplate({
  name,
  email,
  loginUrl,
  features,
}: Readonly<WelcomeEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>Welcome to {company.name}!</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Welcome to {company.name}! 🎉</Heading>

            <Text style={styles.paragraph}>Hi {name},</Text>

            <Text style={styles.paragraph}>
              Your account has been successfully created. We&apos;re excited to have you on board!
            </Text>

            <Text style={styles.paragraph}>With {company.name}, you can:</Text>

            <ul style={{ paddingLeft: '20px' }}>
              {features.map((feature) => (
                <li key={feature} style={{ ...styles.paragraph, margin: '8px 0' }}>
                  {feature}
                </li>
              ))}
            </ul>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={styles.button} href={loginUrl}>
                Get Started
              </Button>
            </Section>

            <Text style={styles.paragraph}>
              <strong>Your login details:</strong>
            </Text>
            <Text style={{ ...styles.paragraph, margin: '5px 0' }}>Email: {email}</Text>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              Need help getting started? Check out our{' '}
              <Link href={`${baseUrl}/help`} style={{ color: '#3b82f6' }}>
                Help Center
              </Link>{' '}
              or reply to this email.
            </Text>

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              Follow us on{' '}
              <Link href="https://twitter.com/enterprise" style={{ color: '#3b82f6' }}>
                Twitter
              </Link>{' '}
              and{' '}
              <Link href="https://linkedin.com/company/enterprise" style={{ color: '#3b82f6' }}>
                LinkedIn
              </Link>{' '}
              for updates and tips.
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name}, Inc. • {company.address}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Invoice Email Template
 */
export function InvoiceEmailTemplate({
  recipientName,
  invoiceNumber,
  invoiceDate,
  dueDate,
  totalAmount,
  currency,
  viewUrl,
  downloadUrl,
  items,
}: Readonly<InvoiceEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>{`Invoice ${invoiceNumber} - ${formatCurrency(totalAmount, currency)}`}</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Invoice {invoiceNumber}</Heading>

            <Text style={styles.paragraph}>Dear {recipientName},</Text>

            <Text style={styles.paragraph}>
              Please find attached invoice {invoiceNumber} for your recent services.
            </Text>

            <Section
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                padding: '20px',
                margin: '20px 0',
              }}
            >
              <Row>
                <Column>
                  <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Invoice Number:
                  </Text>
                  <Text style={{ ...styles.paragraph, margin: '5px 0' }}>{invoiceNumber}</Text>
                </Column>
                <Column>
                  <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Invoice Date:
                  </Text>
                  <Text style={{ ...styles.paragraph, margin: '5px 0' }}>{invoiceDate}</Text>
                </Column>
              </Row>
              <Row style={{ marginTop: '15px' }}>
                <Column>
                  <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Due Date:
                  </Text>
                  <Text style={{ ...styles.paragraph, margin: '5px 0' }}>{dueDate}</Text>
                </Column>
                <Column>
                  <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Total Amount:
                  </Text>
                  <Text
                    style={{
                      ...styles.paragraph,
                      margin: '5px 0',
                      fontSize: '18px',
                      fontWeight: 'bold',
                    }}
                  >
                    {totalAmount} {currency}
                  </Text>
                </Column>
              </Row>
            </Section>

            {items.length > 0 && (
              <>
                <Text style={{ ...styles.paragraph, fontWeight: 'bold', marginTop: '20px' }}>
                  Invoice Items:
                </Text>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e5e7eb' }}>
                      <th style={{ padding: '8px', textAlign: 'left', fontSize: '14px' }}>
                        Description
                      </th>
                      <th style={{ padding: '8px', textAlign: 'center', fontSize: '14px' }}>Qty</th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>
                        Unit Price
                      </th>
                      <th style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '8px', fontSize: '14px' }}>{item.description}</td>
                        <td style={{ padding: '8px', textAlign: 'center', fontSize: '14px' }}>
                          {item.quantity}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>
                          {item.unitPrice}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', fontSize: '14px' }}>
                          {item.total}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Row>
                <Column>
                  <Button style={{ ...styles.button, marginRight: '10px' }} href={viewUrl}>
                    View Invoice Online
                  </Button>
                </Column>
                <Column>
                  <Button
                    style={{
                      ...styles.button,
                      backgroundColor: '#10b981',
                      marginLeft: '10px',
                    }}
                    href={downloadUrl}
                  >
                    Download PDF
                  </Button>
                </Column>
              </Row>
            </Section>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              Payment terms: Payment due within 30 days of invoice date.
            </Text>

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              For questions about this invoice, please contact our billing department.
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name} • {company.address}
              <br />
              {company.taxId && <> Tax ID: {company.taxId} • </>}
              {company.billingEmail}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Loading Order Email Template
 */
export function LoadingOrderEmailTemplate({
  recipientName,
  orderNumber,
  orderDate,
  services,
  viewUrl,
  downloadUrl,
}: Readonly<LoadingOrderEmailData>) {
  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>Loading Order {orderNumber}</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />
            <Heading style={styles.heading}>Loading Order {orderNumber}</Heading>

            <Text style={styles.paragraph}>Dear {recipientName},</Text>

            <Text style={styles.paragraph}>
              Your loading order {orderNumber} has been generated and is ready for review.
            </Text>

            <Section
              style={{
                backgroundColor: '#f9fafb',
                borderRadius: '8px',
                padding: '20px',
                margin: '20px 0',
              }}
            >
              <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                Order Details:
              </Text>
              <Text style={{ ...styles.paragraph, margin: '5px 0' }}>
                Order Number: {orderNumber}
              </Text>
              <Text style={{ ...styles.paragraph, margin: '5px 0' }}>Date: {orderDate}</Text>
              <Text style={{ ...styles.paragraph, margin: '5px 0' }}>
                Services: {services.length}
              </Text>
            </Section>

            {services.length > 0 && (
              <>
                <Text style={{ ...styles.paragraph, fontWeight: 'bold', marginTop: '20px' }}>
                  Services Included:
                </Text>
                {services.map((service) => (
                  <Section
                    key={service.serviceNumber}
                    style={{
                      borderLeft: '4px solid #3b82f6',
                      paddingLeft: '15px',
                      marginBottom: '15px',
                    }}
                  >
                    <Text style={{ ...styles.paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                      {service.serviceNumber}
                    </Text>
                    <Text style={{ ...styles.paragraph, margin: '5px 0' }}>
                      {service.description}
                    </Text>
                    <Text style={{ ...styles.paragraph, margin: '5px 0', fontSize: '14px' }}>
                      Route: {service.origin} → {service.destination}
                    </Text>
                  </Section>
                ))}
              </>
            )}

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Row>
                <Column>
                  <Button style={{ ...styles.button, marginRight: '10px' }} href={viewUrl}>
                    View Order Online
                  </Button>
                </Column>
                <Column>
                  <Button
                    style={{
                      ...styles.button,
                      backgroundColor: '#10b981',
                      marginLeft: '10px',
                    }}
                    href={downloadUrl}
                  >
                    Download PDF
                  </Button>
                </Column>
              </Row>
            </Section>

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              For questions about this loading order, please contact our operations team.
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name}, Inc. • {company.address}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

/**
 * Notification Email Template
 */
export function NotificationEmailTemplate({
  recipientName,
  title,
  message,
  actionUrl,
  actionLabel,
  type,
}: Readonly<NotificationEmailData>) {
  const typeColors = {
    info: '#3b82f6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
  };

  const typeEmojis = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };

  const company = getCompanyDetails();
  const baseUrl = getBaseUrl();

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Tailwind>
        <Body style={styles.main}>
          <Container style={styles.container}>
            <Img
              src={`${baseUrl}/logo.png`}
              width="48"
              height="48"
              alt={company.name}
              style={styles.logo}
            />

            <Section
              style={{
                borderLeft: `4px solid ${typeColors[type]}`,
                paddingLeft: '20px',
                marginTop: '20px',
              }}
            >
              <Heading style={styles.heading}>
                {typeEmojis[type]} {title}
              </Heading>
            </Section>

            <Text style={styles.paragraph}>Hi {recipientName},</Text>

            <Text style={styles.paragraph}>{message}</Text>

            {actionUrl && actionLabel && (
              <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button
                  style={{
                    ...styles.button,
                    backgroundColor: typeColors[type],
                  }}
                  href={actionUrl}
                >
                  {actionLabel}
                </Button>
              </Section>
            )}

            <Hr style={styles.hr} />

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              This is an automated notification from {company.name}.
            </Text>

            <Text style={{ ...styles.paragraph, fontSize: '14px' }}>
              To manage your notification preferences, visit your{' '}
              <Link href={`${baseUrl}/settings/notifications`} style={{ color: '#3b82f6' }}>
                account settings
              </Link>
              .
            </Text>

            <Hr style={styles.hr} />

            <Text style={styles.footer}>
              {company.name}, Inc. • {company.address}
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
