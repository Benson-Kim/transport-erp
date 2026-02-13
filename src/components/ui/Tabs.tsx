/**
 * Tabs Component
 * Accessible tabbed interface
 */

'use client';
import { ReactNode, useState, useRef } from 'react';
import { cn } from '@/lib/utils/cn';

export interface Tab {
  id: string;
  label: string;
  content: ReactNode;
  disabled?: boolean;
  icon?: ReactNode;
}

export interface TabsProps {
  tabs: Tab[];
  defaultTab?: string;
  onChange?: (tabId: string) => void;
  variant?: 'line' | 'pills';
  className?: string;
}

export function Tabs({
  tabs,
  defaultTab,
  onChange,
  variant = 'line',
  className,
}: Readonly<TabsProps>) {
  const [activeTab, setActiveTab] = useState(defaultTab || tabs[0]?.id);
  const tabListRef = useRef<HTMLDivElement>(null);

  const handleTabChange = (tabId: string) => {
    setActiveTab(tabId);
    onChange?.(tabId);
  };

  const handleKeyDown = (e: React.KeyboardEvent, currentIndex: number) => {
    const enabledTabs = tabs.filter((tab) => !tab.disabled);
    const currentTab = tabs[currentIndex];
    if (!currentTab) return;

    const enabledIndex = enabledTabs.findIndex((tab) => tab.id === currentTab.id);
    if (enabledIndex === -1) return;

    switch (e.key) {
      case 'ArrowLeft': {
        e.preventDefault();
        const prevIndex = enabledIndex > 0 ? enabledIndex - 1 : enabledTabs.length - 1;
        const prevTab = enabledTabs[prevIndex];
        if (prevTab) handleTabChange(prevTab.id);
        break;
      }

      case 'ArrowRight': {
        e.preventDefault();
        const nextIndex = enabledIndex < enabledTabs.length - 1 ? enabledIndex + 1 : 0;
        const nextTab = enabledTabs[nextIndex];
        if (nextTab) handleTabChange(nextTab.id);
        break;
      }

      case 'Home': {
        e.preventDefault();
        const firstTab = enabledTabs[0];
        if (firstTab) handleTabChange(firstTab.id);
        break;
      }

      case 'End': {
        e.preventDefault();
        const lastTab = enabledTabs.at(-1);
        if (lastTab) handleTabChange(lastTab.id);
        break;
      }
    }
  };

  const activeTabContent = tabs.find((tab) => tab.id === activeTab)?.content;

  return (
    <div className={cn('w-full', className)}>
      <div
        ref={tabListRef}
        role="tablist"
        className={cn(
          'flex',
          variant === 'line' && 'border-b border-neutral-200',
          variant === 'pills' && 'gap-2 p-1 bg-neutral-100 rounded-lg'
        )}
      >
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            aria-controls={`tabpanel-${tab.id}`}
            aria-selected={activeTab === tab.id}
            tabIndex={activeTab === tab.id ? 0 : -1}
            disabled={tab.disabled}
            onClick={() => handleTabChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors',
              'focus-visible:outline-none',
              variant === 'line' && [
                'border-b-2 -mb-px',
                activeTab === tab.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-neutral-600 hover:text-neutral-900',
              ],
              variant === 'pills' && [
                'rounded-md',
                activeTab === tab.id
                  ? 'bg-white text-neutral-900 shadow-sm'
                  : 'text-neutral-600 hover:text-neutral-900',
              ],
              tab.disabled && 'cursor-not-allowed opacity-50'
            )}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        className="mt-4"
      >
        {activeTabContent}
      </div>
    </div>
  );
}
