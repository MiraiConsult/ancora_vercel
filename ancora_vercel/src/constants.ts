

// This file now serves as a central export point for all mock data.
// The actual data resides in the data/ folder to ensure a single source of truth.

export { MOCK_USERS } from './data/users';
export { MOCK_COMPANIES } from './data/companies';
export { MOCK_CONTACTS } from './data/contacts';
export { MOCK_TASKS } from './data/tasks';
export { MOCK_DEALS } from './data/deals';
// Note: MOCK_REVENUE_TYPES and MOCK_BANKS are defined in finance.ts based on the provided file structure
export { MOCK_FINANCE, MOCK_REVENUE_TYPES, MOCK_BANKS } from './data/finance';
export { MOCK_CHART_OF_ACCOUNTS } from './data/chartOfAccounts';
export { MOCK_SEGMENTS, MOCK_DEAL_STAGES, MOCK_TASK_TYPES } from './data/lists';
export { MOCK_NOTIFICATIONS } from './data/notifications';
export { MOCK_FINANCE_SPLITS } from './data/financeSplits';
