import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/AppShell';
import { AskPennyWisePage } from '@/pages/AskPennyWise';
import { AnalyticsPage } from '@/pages/Analytics';
import { BudgetPage } from '@/pages/Budget';
import { SavingsPage } from '@/pages/Savings';
import { TransactionsPage } from '@/pages/Transactions';

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<AskPennyWisePage />} />
          <Route path="transactions" element={<TransactionsPage />} />
          <Route path="budget" element={<BudgetPage />} />
          <Route path="savings" element={<SavingsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
