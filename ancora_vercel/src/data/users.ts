

import { User } from '../types';

export const MOCK_USERS: User[] = [
  // FIX: Removed non-existent 'accessLevel' property and corrected role to 'admin'.
  { 
    id: 'u1', 
    tenant_id: 'default',
    name: 'MC System Demo', 
    role: 'admin', 
    email: 'admin@mcsystem.com', 
    password: '123', 
    avatar: 'MC'
  }
];