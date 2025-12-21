// /components/features/settings/SystemSettingsContent.tsx
'use client';

import { useEffect, useMemo, useState } from 'react';


import { zodResolver } from '@hookform/resolvers/zod';
import { Mail, FileText, Database, Hash, Settings, AlertCircle } from 'lucide-react';
import { FormProvider, useForm } from 'react-hook-form';

import {
  getSystemSettings,
  runManualBackup,
  saveEmailSettings,
  testEmailConfiguration,
  updateBackup,
  updateGeneral,
  updateNumberSequences,
  updatePDF,
} from '@/actions/settings-actions';
import { Alert, Button, Card, PageHeader, Tabs } from '@/components/ui';
import type { Tab } from '@/components/ui/Tabs';
import { toast } from '@/lib/toast';
import {
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
  systemSettingsSchema,
} from '@/lib/validations/settings-schema';

import BackupSettings from './SystemSettings/Backup';
import EmailConfiguration from './SystemSettings/EmailConfig';
import GeneralSettings from './SystemSettings/General';
import PDFSettings from './SystemSettings/PDF';
import SequenceSettings from './SystemSettings/Sequence';

type SettingsSection = keyof SystemSettings;

export function SystemSettingsContent() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('email');

  const methods = useForm<SystemSettings>({
    resolver: zodResolver(systemSettingsSchema),
    defaultValues: DEFAULT_SYSTEM_SETTINGS,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      setError(null);
      const data = await getSystemSettings();
      const mergedData = {
        email: { ...DEFAULT_SYSTEM_SETTINGS.email, ...data.email },
        pdf: { ...DEFAULT_SYSTEM_SETTINGS.pdf, ...data.pdf },
        backup: { ...DEFAULT_SYSTEM_SETTINGS.backup, ...data.backup },
        numberSequences: { ...DEFAULT_SYSTEM_SETTINGS.numberSequences, ...data.numberSequences },
        general: { ...DEFAULT_SYSTEM_SETTINGS.general, ...data.general },
      };
      methods.reset(mergedData);
    } catch (error) {
      setError('Failed to load system settings. Please check your permissions.');
      console.error('Load settings error:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSection(section: SettingsSection) {
    setSaving(section);

    try {
      const values = methods.getValues();
      let result;

      const actionMap: Record<
        SettingsSection,
        () => Promise<{ success: boolean; error?: string }>
      > = {
        email: () => saveEmailSettings(values.email),
        pdf: () => updatePDF(values.pdf),
        backup: () => updateBackup(values.backup),
        numberSequences: () => updateNumberSequences(values.numberSequences),
        general: () => updateGeneral(values.general),
      };

      result = await actionMap[section]();

      if (result?.success) {
        toast.success(`${section} settings updated successfully`);
      } else {
        toast.error(result?.error || `Failed to update ${section} settings`);
      }
    } catch (error) {
      toast.error(`Failed to update ${section} settings`);
      console.error(`Save ${section} error:`, error);
    } finally {
      setSaving(null);
    }
  }

  async function handleTestEmail() {
    try {
      setSaving('email-test');

      const email = methods.getValues('email.fromEmail');
      const result = await testEmailConfiguration(email);

      if (result.success) {
        toast.success(result.data!);
      } else {
        toast.error(result.error!);
      }
    } catch (error) {
      toast.error('Failed to send test email');
    } finally {
      setSaving(null);
    }
  }

  async function handleManualBackup() {
    try {
      setSaving('backup');
      const result = await runManualBackup();

      if (result.success) {
        toast.success(`Backup completed at ${new Date(result.data!.createdAt).toLocaleString()}`);
      } else {
        toast.error(result.error!);
      }
    } catch (error) {
      toast.error('Failed to trigger backup');
    } finally {
      setSaving(null);
    }
  }

  // Define tabs with their content
  const tabs: Tab[] = useMemo(
    () => [
      {
        id: 'email',
        label: 'Email',
        icon: <Mail className="h-4 w-4" />,
        content: (
          <TabContent
            title="Email Configuration"
            description="Configure email provider and sender settings for system notifications"
            section="email"
            onSave={() => handleSaveSection('email')}
            isSaving={saving === 'email'}
            actions={
              <Button
                type="button"
                variant="secondary"
                onClick={handleTestEmail}
                disabled={saving === 'email' || saving === 'email-test'}
              >
                {saving === 'email-test' ? 'Sending...' : 'Send Test Email'}
              </Button>
            }
          >
            <EmailConfiguration />
          </TabContent>
        ),
      },
      {
        id: 'pdf',
        label: 'PDF',
        icon: <FileText className="h-4 w-4" />,
        content: (
          <TabContent
            title="PDF Settings"
            description="Configure PDF document generation settings"
            section="pdf"
            onSave={() => handleSaveSection('pdf')}
            isSaving={saving === 'pdf'}
          >
            <PDFSettings />
          </TabContent>
        ),
      },
      {
        id: 'backup',
        label: 'Backup',
        icon: <Database className="h-4 w-4" />,
        content: (
          <TabContent
            title="Backup Settings"
            description="Configure automatic backup schedule and storage"
            section="backup"
            onSave={() => handleSaveSection('backup')}
            isSaving={saving === 'backup'}
            actions={
              <Button
                type="button"
                variant="secondary"
                onClick={handleManualBackup}
                disabled={saving === 'backup' || saving === 'backup-manual'}
              >
                {saving === 'backup-manual' ? 'Running Backup...' : 'Run Manual Backup'}
              </Button>
            }
          >
            <BackupSettings />
          </TabContent>
        ),
      },
      {
        id: 'sequences',
        label: 'Number Sequences',
        icon: <Hash className="h-4 w-4" />,
        content: (
          <TabContent
            title="Number Sequences"
            description="Configure document numbering formats and sequences"
            section="numberSequences"
            onSave={() => handleSaveSection('numberSequences')}
            isSaving={saving === 'numberSequences'}
          >
            <SequenceSettings />
          </TabContent>
        ),
      },
      {
        id: 'general',
        label: 'General',
        icon: <Settings className="h-4 w-4" />,
        content: (
          <TabContent
            title="General Settings"
            description="Configure regional settings, tax defaults, and feature toggles"
            section="general"
            onSave={() => handleSaveSection('general')}
            isSaving={saving === 'general'}
          >
            <GeneralSettings />
          </TabContent>
        ),
      },
    ],
    [saving, methods]
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 bg-neutral-200 rounded w-1/4 animate-pulse" />
        <div className="h-12 bg-neutral-100 rounded animate-pulse" />
        <div className="h-96 bg-neutral-50 rounded animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert variant="error">
        <AlertCircle className="h-4 w-4" />
        <span>{error}</span>
      </Alert>
    );
  }

  return (
    <FormProvider {...methods}>
      <div className="space-y-6">
        <PageHeader
          title="System Settings"
          description="Configure system-wide settings and preferences"
        />

        <Card className="p-6">
          <Tabs tabs={tabs} defaultTab={activeTab} onChange={setActiveTab} variant="line" />
        </Card>
      </div>
    </FormProvider>
  );
}

/**
 * Tab content wrapper with header and save button
 */
interface TabContentProps {
  title: string;
  description: string;
  section: string;
  onSave: () => void;
  isSaving: boolean;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

function TabContent({ title, description, onSave, isSaving, actions, children }: TabContentProps) {
  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="border-b border-neutral-200 pb-4">
        <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
        <p className="text-sm text-neutral-500 mt-1">{description}</p>
      </div>

      {/* Section Content */}
      <div className="min-h-[400px]">{children}</div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-3 pt-6 border-t border-neutral-200">
        {actions}
        <Button type="button" onClick={onSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save Changes'}
        </Button>
      </div>
    </div>
  );
}
