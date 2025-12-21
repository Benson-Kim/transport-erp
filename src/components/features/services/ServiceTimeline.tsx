// components/features/services/ServiceTimeline.tsx
'use client';

import { useState, useEffect } from 'react';

import { format } from 'date-fns';
import {
  Activity,
  Plus,
  Edit,
  CheckCircle,
  XCircle,
  FileText,
  Mail,
  Archive,
  User,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import { getServiceActivity } from '@/actions/service-actions';
import { Card, CardBody, Button, Spinner, Badge } from '@/components/ui';
import { cn } from '@/lib/utils/cn';

interface ServiceTimelineProps {
  serviceId: string;
}

interface ActivityItem {
  id: string;
  action: string;
  description: string;
  user: { name: string; email: string } | null;
  createdAt: string | Date;
  metadata?: any;
}

export function ServiceTimeline({ serviceId }: ServiceTimelineProps) {
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadActivities();
  }, [serviceId]);

  useEffect(() => {
    if (page > 1) {
      loadMoreActivities();
    }
  }, [page]);

  const loadActivities = async () => {
    setIsLoading(true);
    try {
      const { activities: newActivities, hasMore: more } = await getServiceActivity(serviceId, {
        page: 1,
        limit: 10,
      });

      setActivities(newActivities);
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load activities:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadMoreActivities = async () => {
    try {
      const { activities: newActivities, hasMore: more } = await getServiceActivity(serviceId, {
        page,
        limit: 10,
      });

      setActivities((prev) => [...prev, ...newActivities]);
      setHasMore(more);
    } catch (error) {
      console.error('Failed to load more activities:', error);
    }
  };

  const getActivityIcon = (action: string) => {
    switch (action) {
      case 'CREATE':
        return { icon: Plus, color: 'text-green-600' };
      case 'UPDATE':
        return { icon: Edit, color: 'text-blue-600' };
      case 'COMPLETE':
        return { icon: CheckCircle, color: 'text-green-600' };
      case 'CANCEL':
        return { icon: XCircle, color: 'text-red-600' };
      case 'GENERATE_DOCUMENT':
        return { icon: FileText, color: 'text-purple-600' };
      case 'SEND_EMAIL':
        return { icon: Mail, color: 'text-blue-600' };
      case 'ARCHIVE':
        return { icon: Archive, color: 'text-gray-600' };
      default:
        return { icon: Activity, color: 'text-gray-600' };
    }
  };

  const visibleActivities = isExpanded ? activities : activities.slice(0, 3);

  return (
    <Card>
      <CardBody>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center">
            <Activity className="h-5 w-5 mr-2" />
            Activity Timeline
          </h2>

          {activities.length > 3 && (
            <Button variant="ghost" size="sm" onClick={() => setIsExpanded(!isExpanded)}>
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Show Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Show All ({activities.length})
                </>
              )}
            </Button>
          )}
        </div>

        {isLoading && page === 1 ? (
          <div className="flex items-center justify-center py-8">
            <Spinner className="h-6 w-6" />
          </div>
        ) : activities.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No activity recorded yet</div>
        ) : (
          <div className="space-y-4">
            {visibleActivities.map((activity, index) => {
              const { icon: Icon, color } = getActivityIcon(activity.action);

              return (
                <div
                  key={activity.id}
                  className={cn(
                    'relative flex gap-4',
                    index < visibleActivities.length - 1 && 'pb-4'
                  )}
                >
                  {/* Timeline Line */}
                  {index < visibleActivities.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-neutral-200" />
                  )}

                  {/* Icon */}
                  <div
                    className={cn(
                      'flex-shrink-0 w-10 h-10 rounded-full bg-white border-2 flex items-center justify-center',
                      color === 'text-green-600' && 'border-green-200',
                      color === 'text-blue-600' && 'border-blue-200',
                      color === 'text-red-600' && 'border-red-200',
                      color === 'text-purple-600' && 'border-purple-200',
                      color === 'text-gray-600' && 'border-gray-200'
                    )}
                  >
                    <Icon className={cn('h-5 w-5', color)} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <p className="text-sm font-medium">{activity.description}</p>

                        {/* Metadata - show changes for updates */}
                        {activity.action === 'UPDATE' && activity.metadata?.changes && (
                          <div className="mt-1 space-y-1">
                            {activity.metadata.changes.map((change: any, i: number) => (
                              <div key={i} className="text-xs text-muted-foreground">
                                <span className="font-medium">{change.field}:</span>{' '}
                                <span className="line-through">{change.oldValue}</span>
                                {' → '}
                                <span className="text-neutral-900">{change.newValue}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                          {activity.user && (
                            <>
                              <div className="flex items-center">
                                <User className="h-3 w-3 mr-1" />
                                {activity.user.name}
                              </div>
                              <span>•</span>
                            </>
                          )}

                          <time dateTime={new Date(activity.createdAt).toISOString()}>
                            {format(new Date(activity.createdAt), 'dd MMM yyyy HH:mm')}
                          </time>
                        </div>
                      </div>

                      {/* Action Badge */}
                      <Badge variant="billed" size="sm">
                        {activity.action.replace(/_/g, ' ')}
                      </Badge>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Load More */}
            {isExpanded && hasMore && (
              <div className="text-center pt-4">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  loading={isLoading && page > 1}
                >
                  Load More Activity
                </Button>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
