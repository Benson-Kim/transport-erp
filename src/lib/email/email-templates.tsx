/**
 * Email Templates
 * React Email templates for all email types
 */

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
  Tailwind,
  Row,
  Column,
} from '@react-email/components';

// Base email template styles
const main = {
  backgroundColor: '#ffffff',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: '0 auto',
  padding: '20px 0 48px',
  maxWidth: '560px',
};

const logo = {
  margin: '0 auto',
};

const heading = {
  fontSize: '24px',
  letterSpacing: '-0.5px',
  lineHeight: '1.3',
  fontWeight: '400',
  color: '#484848',
  padding: '17px 0 0',
};

const paragraph = {
  margin: '0 0 15px',
  fontSize: '15px',
  lineHeight: '1.4',
  color: '#3c4149',
};

const buttonStyle = {
  backgroundColor: '#3b82f6',
  borderRadius: '5px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: 'bold',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'block',
  padding: '12px 20px',
};

const hr = {
  borderColor: '#e6ebf1',
  margin: '20px 0',
};

const footer = {
  color: '#8898aa',
  fontSize: '12px',
  lineHeight: '16px',
};

/**
 * Verification Email Template
 */
export function VerificationEmailTemplate({
  name,
  verificationUrl,
  expiresIn,
}: {
  name: string;
  email: string;
  verificationUrl: string;
  expiresIn: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Verify your email address for Enterprise Dashboard</Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />
            <Heading style={heading}>Verify your email address</Heading>

            <Text style={paragraph}>Hi {name},</Text>

            <Text style={paragraph}>
              Thanks for signing up for Enterprise Dashboard! Please verify your email address by
              clicking the button below:
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={buttonStyle} href={verificationUrl}>
                Verify Email Address
              </Button>
            </Section>

            <Text style={paragraph}>Or copy and paste this URL into your browser:</Text>
            <Link
              href={verificationUrl}
              style={{ color: '#3b82f6', fontSize: '14px', wordBreak: 'break-all' }}
            >
              {verificationUrl}
            </Link>

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              This verification link will expire in {expiresIn}.
            </Text>

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              If you didn't create an account with Enterprise Dashboard, you can safely ignore this
              email.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
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
  resetUrl,
  expiresIn,
  ipAddress,
  userAgent,
}: {
  name: string;
  email: string;
  resetUrl: string;
  expiresIn: string;
  ipAddress?: string;
  userAgent?: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Reset your Enterprise Dashboard password</Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />
            <Heading style={heading}>Reset your password</Heading>

            <Text style={paragraph}>Hi {name},</Text>

            <Text style={paragraph}>
              We received a request to reset your password for your Enterprise Dashboard account.
              Click the button below to create a new password:
            </Text>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={buttonStyle} href={resetUrl}>
                Reset Password
              </Button>
            </Section>

            <Text style={paragraph}>Or copy and paste this URL into your browser:</Text>
            <Link
              href={resetUrl}
              style={{ color: '#3b82f6', fontSize: '14px', wordBreak: 'break-all' }}
            >
              {resetUrl}
            </Link>

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              This password reset link will expire in {expiresIn}.
            </Text>

            {(ipAddress || userAgent) && (
              <>
                <Text style={{ ...paragraph, fontSize: '14px', fontWeight: 'bold' }}>
                  Request Details:
                </Text>
                {ipAddress && (
                  <Text style={{ ...paragraph, fontSize: '13px', margin: '5px 0' }}>
                    IP Address: {ipAddress}
                  </Text>
                )}
                {userAgent && (
                  <Text style={{ ...paragraph, fontSize: '13px', margin: '5px 0' }}>
                    Browser: {userAgent}
                  </Text>
                )}
              </>
            )}

            <Text style={{ ...paragraph, fontSize: '14px', color: '#ef4444' }}>
              If you didn't request a password reset, please contact our support team immediately as
              someone may be trying to access your account.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
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
}: {
  name: string;
  email: string;
  loginUrl: string;
  features: string[];
}) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to Enterprise Dashboard!</Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />
            <Heading style={heading}>Welcome to Enterprise Dashboard! 🎉</Heading>

            <Text style={paragraph}>Hi {name},</Text>

            <Text style={paragraph}>
              Your account has been successfully created. We're excited to have you on board!
            </Text>

            <Text style={paragraph}>With Enterprise Dashboard, you can:</Text>

            <ul style={{ paddingLeft: '20px' }}>
              {features.map((feature, index) => (
                <li key={index} style={{ ...paragraph, margin: '8px 0' }}>
                  {feature}
                </li>
              ))}
            </ul>

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Button style={buttonStyle} href={loginUrl}>
                Get Started
              </Button>
            </Section>

            <Text style={paragraph}>
              <strong>Your login details:</strong>
            </Text>
            <Text style={{ ...paragraph, margin: '5px 0' }}>Email: {email}</Text>

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              Need help getting started? Check out our{' '}
              <Link
                href={`${process.env['NEXT_PUBLIC_APP_URL']}/help`}
                style={{ color: '#3b82f6' }}
              >
                Help Center
              </Link>{' '}
              or reply to this email.
            </Text>

            <Text style={{ ...paragraph, fontSize: '14px' }}>
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

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
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
}: {
  recipientName: string;
  recipientEmail: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  totalAmount: string;
  currency: string;
  viewUrl: string;
  downloadUrl: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPrice: string;
    total: string;
  }>;
}) {
  return (
    <Html>
      <Head />
      <Preview>
        Invoice {invoiceNumber} - {totalAmount} {currency}
      </Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />
            <Heading style={heading}>Invoice {invoiceNumber}</Heading>

            <Text style={paragraph}>Dear {recipientName},</Text>

            <Text style={paragraph}>
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
                  <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Invoice Number:
                  </Text>
                  <Text style={{ ...paragraph, margin: '5px 0' }}>{invoiceNumber}</Text>
                </Column>
                <Column>
                  <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Invoice Date:
                  </Text>
                  <Text style={{ ...paragraph, margin: '5px 0' }}>{invoiceDate}</Text>
                </Column>
              </Row>
              <Row style={{ marginTop: '15px' }}>
                <Column>
                  <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Due Date:
                  </Text>
                  <Text style={{ ...paragraph, margin: '5px 0' }}>{dueDate}</Text>
                </Column>
                <Column>
                  <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                    Total Amount:
                  </Text>
                  <Text
                    style={{ ...paragraph, margin: '5px 0', fontSize: '18px', fontWeight: 'bold' }}
                  >
                    {totalAmount} {currency}
                  </Text>
                </Column>
              </Row>
            </Section>

            {items.length > 0 && (
              <>
                <Text style={{ ...paragraph, fontWeight: 'bold', marginTop: '20px' }}>
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
                    {items.map((item, index) => (
                      <tr key={index} style={{ borderBottom: '1px solid #f3f4f6' }}>
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
                  <Button style={{ ...buttonStyle, marginRight: '10px' }} href={viewUrl}>
                    View Invoice Online
                  </Button>
                </Column>
                <Column>
                  <Button
                    style={{
                      ...buttonStyle,
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

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              Payment terms: Payment due within 30 days of invoice date.
            </Text>

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              For questions about this invoice, please contact our billing department.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
              <br />
              Tax ID: B12345678 • billing@enterprise-dashboard.com
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
}: {
  recipientName: string;
  recipientEmail: string;
  orderNumber: string;
  orderDate: string;
  services: Array<{
    serviceNumber: string;
    description: string;
    origin: string;
    destination: string;
  }>;
  viewUrl: string;
  downloadUrl: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Loading Order {orderNumber}</Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />
            <Heading style={heading}>Loading Order {orderNumber}</Heading>

            <Text style={paragraph}>Dear {recipientName},</Text>

            <Text style={paragraph}>
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
              <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                Order Details:
              </Text>
              <Text style={{ ...paragraph, margin: '5px 0' }}>Order Number: {orderNumber}</Text>
              <Text style={{ ...paragraph, margin: '5px 0' }}>Date: {orderDate}</Text>
              <Text style={{ ...paragraph, margin: '5px 0' }}>Services: {services.length}</Text>
            </Section>

            {services.length > 0 && (
              <>
                <Text style={{ ...paragraph, fontWeight: 'bold', marginTop: '20px' }}>
                  Services Included:
                </Text>
                {services.map((service, index) => (
                  <Section
                    key={index}
                    style={{
                      borderLeft: '4px solid #3b82f6',
                      paddingLeft: '15px',
                      marginBottom: '15px',
                    }}
                  >
                    <Text style={{ ...paragraph, margin: '5px 0', fontWeight: 'bold' }}>
                      {service.serviceNumber}
                    </Text>
                    <Text style={{ ...paragraph, margin: '5px 0' }}>{service.description}</Text>
                    <Text style={{ ...paragraph, margin: '5px 0', fontSize: '14px' }}>
                      Route: {service.origin} → {service.destination}
                    </Text>
                  </Section>
                ))}
              </>
            )}

            <Section style={{ textAlign: 'center', margin: '32px 0' }}>
              <Row>
                <Column>
                  <Button style={{ ...buttonStyle, marginRight: '10px' }} href={viewUrl}>
                    View Order Online
                  </Button>
                </Column>
                <Column>
                  <Button
                    style={{
                      ...buttonStyle,
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

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              For questions about this loading order, please contact our operations team.
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
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
}: {
  recipientName: string;
  title: string;
  message: string;
  actionUrl?: string;
  actionLabel?: string;
  type: 'info' | 'success' | 'warning' | 'error';
}) {
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

  return (
    <Html>
      <Head />
      <Preview>{title}</Preview>
      <Tailwind>
        <Body style={main}>
          <Container style={container}>
            <Img
              src={`${process.env['NEXT_PUBLIC_APP_URL']}/logo.png`}
              width="48"
              height="48"
              alt="Enterprise Dashboard"
              style={logo}
            />

            <Section
              style={{
                borderLeft: `4px solid ${typeColors[type]}`,
                paddingLeft: '20px',
                marginTop: '20px',
              }}
            >
              <Heading style={heading}>
                {typeEmojis[type]} {title}
              </Heading>
            </Section>

            <Text style={paragraph}>Hi {recipientName},</Text>

            <Text style={paragraph}>{message}</Text>

            {actionUrl && actionLabel && (
              <Section style={{ textAlign: 'center', margin: '32px 0' }}>
                <Button
                  style={{
                    ...buttonStyle,
                    backgroundColor: typeColors[type],
                  }}
                  href={actionUrl}
                >
                  {actionLabel}
                </Button>
              </Section>
            )}

            <Hr style={hr} />

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              This is an automated notification from Enterprise Dashboard.
            </Text>

            <Text style={{ ...paragraph, fontSize: '14px' }}>
              To manage your notification preferences, visit your{' '}
              <Link
                href={`${process.env['NEXT_PUBLIC_APP_URL']}/settings/notifications`}
                style={{ color: '#3b82f6' }}
              >
                account settings
              </Link>
              .
            </Text>

            <Hr style={hr} />

            <Text style={footer}>
              Enterprise Dashboard, Inc. • 123 Business St • Madrid, Spain 28001
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}
