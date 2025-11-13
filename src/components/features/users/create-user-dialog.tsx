/**
 * Create User Dialog Component
 * Modal for creating new users
 */

'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui';

export function CreateUserDialog() {
  const [_open, setOpen] = useState(false);

  return (
    <Button onClick={() => setOpen(true)} icon={<UserPlus className="h-4 w-4" />}>
      Add User
    </Button>
  );
}
