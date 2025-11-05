/**
 * Create User Dialog Component
 * Modal for creating new users
 */

'use client';

import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function CreateUserDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Button
      onClick={() => setOpen(true)}
      leftIcon={<UserPlus className="h-4 w-4" />}
    >
      Add User
    </Button>
  );
}