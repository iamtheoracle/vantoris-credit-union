import React, { Suspense } from "react"
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import ProtectedRoute from '@/components/ProtectedRoute';
import PageTransition from './components/vantoris/PageTransition';
import { ExceptionAuthProvider } from '@/components/vantoris/ExceptionAuthContext';

import MemberLayout from './components/vantoris/MemberLayout';
import AdminLayout from './components/vantoris/AdminLayout';
import OperationsRoute from './components/OperationsRoute';
import MemberRoute from './components/MemberRoute';

const Login = React.lazy(() => import('./pages/Login'));
const Landing = React.lazy(() => import('./pages/Landing'));
const Register = React.lazy(() => import('./pages/Register'));
const ForgotPassword = React.lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));

const Home = React.lazy(() => import('./pages/Home'));
const MoveMoney = React.lazy(() => import('./pages/MoveMoney'));
const Apply = React.lazy(() => import('./pages/Apply'));
const ApplyKYC = React.lazy(() => import('./pages/ApplyKYC'));
const Accounts = React.lazy(() => import('./pages/Accounts'));
const AccountDetail = React.lazy(() => import('./pages/AccountDetail'));
const Services = React.lazy(() => import('./pages/Services'));
const Messages = React.lazy(() => import('./pages/Messages'));
const Profile = React.lazy(() => import('./pages/Profile'));
const MemberDocuments = React.lazy(() => import('./pages/MemberDocuments'));
const MemberAdvisor = React.lazy(() => import('./pages/MemberAdvisor'));
const More = React.lazy(() => import('./pages/More'));
const Discovery = React.lazy(() => import('./pages/Discovery'));
const Discover = React.lazy(() => import('./pages/Discover'));
const DiscoverNews = React.lazy(() => import('./pages/DiscoverNews'));
const DiscoverFX = React.lazy(() => import('./pages/DiscoverFX'));
const DiscoverNGO = React.lazy(() => import('./pages/DiscoverNGO'));
const DiscoverMarketing = React.lazy(() => import('./pages/DiscoverMarketing'));
const MemberQR = React.lazy(() => import('./pages/MemberQR'));
const Transactions = React.lazy(() => import('./pages/Transactions'));
const Money = React.lazy(() => import('./pages/product/Money'));
const CardsPage = React.lazy(() => import('./pages/product/Cards'));
const TravelPage = React.lazy(() => import('./pages/product/Travel'));
const HomesPage = React.lazy(() => import('./pages/product/Homes'));
const NewsPage = React.lazy(() => import('./pages/product/News'));
const AskPage = React.lazy(() => import('./pages/product/Ask'));
const HeroBoxHub = React.lazy(() => import('./pages/product/HeroBoxHub'));
const SupportPage = React.lazy(() => import('./pages/product/Support'));
const DiscoverFlights = React.lazy(() => import('./pages/DiscoverFlights'));
const DiscoverHousing = React.lazy(() => import('./pages/DiscoverHousing'));
const TransactionDispute = React.lazy(() => import('./pages/TransactionDispute'));
const BrandIdentity = React.lazy(() => import('./pages/BrandIdentity'));
const VantorisAssistant = React.lazy(() => import('./components/vantoris/VantorisAssistant'));
const HeroBox = React.lazy(() => import('./pages/HeroBox'));
const Investment = React.lazy(() => import('./pages/Investment'));

const AdminOverview = React.lazy(() => import('./pages/admin/AdminOverview'));
const ExecutiveDashboard = React.lazy(() => import('./pages/operations/ExecutiveDashboard'));
const SecurityComplianceDashboard = React.lazy(() => import('./pages/operations/SecurityComplianceDashboard'));
const AdminApplications = React.lazy(() => import('./pages/admin/AdminApplications'));
const AdminKYC = React.lazy(() => import('./pages/admin/AdminKYC'));
const AdminMembers = React.lazy(() => import('./pages/admin/AdminMembers'));
const AdminAccounts = React.lazy(() => import('./pages/admin/AdminAccounts'));
const AdminWithdrawals = React.lazy(() => import('./pages/admin/AdminWithdrawals'));
const AdminAgent = React.lazy(() => import('./pages/admin/AdminAgent'));
const RecommendationReview = React.lazy(() => import('./pages/operations/RecommendationReview'));
const TransactionExportDashboard = React.lazy(() => import('./pages/operations/TransactionExportDashboard'));
const ImpactAnalytics = React.lazy(() => import('./pages/operations/ImpactAnalytics'));
const SupporterLeaderboard = React.lazy(() => import('./pages/operations/SupporterLeaderboard'));
const HeroBoxMissionControl = React.lazy(() => import('./pages/operations/HeroBoxMissionControl'));
const HeroBoxHeroes = React.lazy(() => import('./pages/operations/HeroBoxHeroes'));
const HeroBoxCarePackages = React.lazy(() => import('./pages/operations/HeroBoxCarePackages'));
const HeroBoxVolunteers = React.lazy(() => import('./pages/operations/HeroBoxVolunteers'));

const WithdrawalLimits = React.lazy(() => import('./pages/operations/WithdrawalLimits'));
const Organizations = React.lazy(() => import('./pages/operations/Organizations'));
const Finance = React.lazy(() => import('./pages/operations/Finance'));
const Deposits = React.lazy(() => import('./pages/operations/Deposits'));
const Transfers = React.lazy(() => import('./pages/operations/Transfers'));
const OperationsDocuments = React.lazy(() => import('./pages/operations/OperationsDocuments'));
const Cards = React.lazy(() => import('./pages/operations/Cards'));
const WalletAssignment = React.lazy(() => import('./pages/operations/WalletAssignment'));
const ResponseTemplates = React.lazy(() => import('./pages/operations/ResponseTemplates'));
const AccountAssignment = React.lazy(() => import('./pages/operations/AccountAssignment'));
const Reports = React.lazy(() => import('./pages/operations/Reports'));
const ExecutiveReports = React.lazy(() => import('./pages/operations/ExecutiveReports'));
const AuditLogs = React.lazy(() => import('./pages/operations/AuditLogs'));
const AumGrowth = React.lazy(() => import('./pages/operations/AumGrowth'));
const BulkTransactionImport = React.lazy(() => import('./pages/operations/BulkTransactionImport'));
const TransactionSummaries = React.lazy(() => import('./pages/operations/TransactionSummaries'));
const WithdrawalAuditLog = React.lazy(() => import('./pages/operations/WithdrawalAuditLog'));
const ActivityTimeline = React.lazy(() => import('./pages/operations/ActivityTimeline'));
const VerificationRequests = React.lazy(() => import('./pages/operations/VerificationRequests'));
const ServiceRequests = React.lazy(() => import('./pages/operations/ServiceRequests'));
const MemberMessages = React.lazy(() => import('./pages/operations/MemberMessages'));
const OperationalProfiles = React.lazy(() => import('./pages/operations/OperationalProfiles'));
const Referrals = React.lazy(() => import('./pages/operations/Referrals'));
const Configuration = React.lazy(() => import('./pages/operations/Configuration'));
const ApiManagement = React.lazy(() => import('./pages/operations/ApiManagement'));
const Integrations = React.lazy(() => import('./pages/operations/Integrations'));
const OperationsNotifications = React.lazy(() => import('./pages/operations/OperationsNotifications'));
const Security = React.lazy(() => import('./pages/operations/Security'));
const FeatureFlags = React.lazy(() => import('./pages/operations/FeatureFlags'));
const BackgroundJobs = React.lazy(() => import('./pages/operations/BackgroundJobs'));
const SystemHealth = React.lazy(() => import('./pages/operations/SystemHealth'));
const DataIntegrityAudit = React.lazy(() => import('./pages/operations/DataIntegrityAudit'));
const InvestmentDashboard = React.lazy(() => import('./pages/operations/InvestmentDashboard'));
const InvestmentDeposits = React.lazy(() => import('./pages/operations/InvestmentDeposits'));
const InvestmentWithdrawals = React.lazy(() => import('./pages/operations/InvestmentWithdrawals'));
const InvestmentPortfolios = React.lazy(() => import('./pages/operations/InvestmentPortfolios'));
const InvestmentSignals = React.lazy(() => import('./pages/operations/InvestmentSignals'));
const HeroBoxAdminProducts = React.lazy(() => import('./pages/operations/HeroBoxAdminProducts'));
const HeroBoxAdminOrders = React.lazy(() => import('./pages/operations/HeroBoxAdminOrders'));
const HeroBoxFundsShipping = React.lazy(() => import('./pages/operations/HeroBoxFundsShipping'));
const DiscoveryNetwork = React.lazy(() => import('./pages/operations/DiscoveryNetwork'));
const Approvals = React.lazy(() => import('./pages/operations/Approvals'));
const HumanitarianCases = React.lazy(() => import('./pages/operations/HumanitarianCases'));

const LoadingFallback = () => (
  <div className="fixed inset-0 flex items-center justify-center bg-background">
    <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
  </div>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) return <LoadingFallback />;

  // Keep the app reachable: show local /login instead of a blank redirect.
  // Base44 hosted login can still be used from the Login page itself.
  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      // Fall through to public routes so /login, /register remain usable.
    }
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <ExceptionAuthProvider>
        <Routes>
          <Route element={<PageTransition />}>
            <Route path="/welcome" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/brand" element={<BrandIdentity />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Route>

          <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
            <Route element={<MemberRoute />}>
            <Route element={<MemberLayout />}>
              <Route path="/" element={<Home />} />
              <Route path="/apply" element={<Navigate to="/register" replace />} />
              <Route path="/apply/kyc" element={<ApplyKYC />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/accounts/:id" element={<AccountDetail />} />
              <Route path="/services" element={<Services />} />
              <Route path="/messages" element={<Messages />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/documents" element={<MemberDocuments />} />
              <Route path="/advisor" element={<AskPage />} />
                            <Route path="/discovery" element={<Discovery />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/discover/news" element={<DiscoverNews />} />
              <Route path="/discover/fx" element={<DiscoverFX />} />
              <Route path="/discover/ngo" element={<DiscoverNGO />} />
              <Route path="/discover/marketing" element={<DiscoverMarketing />} />
              <Route path="/discover/flights" element={<DiscoverFlights />} />
              <Route path="/discover/housing" element={<DiscoverHousing />} />
              <Route path="/transactions" element={<Transactions />} />
              <Route path="/qr" element={<MemberQR />} />
              <Route path="/money" element={<Money />} />
              <Route path="/cards" element={<CardsPage />} />
              <Route path="/travel" element={<TravelPage />} />
              <Route path="/homes" element={<HomesPage />} />
              <Route path="/news" element={<NewsPage />} />
              <Route path="/ask" element={<AskPage />} />
              <Route path="/herobox-hub" element={<HeroBoxHub />} />
              <Route path="/support" element={<SupportPage />} />
              <Route path="/move-money" element={<MoveMoney />} />
              <Route path="/move" element={<MoveMoney />} />
              <Route path="/more" element={<More />} />
              <Route path="/dispute" element={<TransactionDispute />} />
              <Route path="/assistant" element={<VantorisAssistant />} />
              <Route path="/herobox" element={<HeroBox />} />
              <Route path="/investment" element={<Investment />} />
            </Route>
            </Route>

            <Route path="/admin/*" element={<Navigate to="/operations" replace />} />

            <Route element={<OperationsRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="/operations" element={<AdminOverview />} />
                <Route path="/operations/executive" element={<ExecutiveDashboard />} />
                <Route path="/operations/security-dashboard" element={<SecurityComplianceDashboard />} />
                <Route path="/operations/applications" element={<AdminApplications />} />
                <Route path="/operations/kyc" element={<AdminKYC />} />
                <Route path="/operations/members" element={<AdminMembers />} />
                <Route path="/operations/operational-profiles" element={<OperationalProfiles />} />
                <Route path="/operations/accounts" element={<AdminAccounts />} />
                <Route path="/operations/withdrawals" element={<AdminWithdrawals />} />
                <Route path="/operations/withdrawal-limits" element={<WithdrawalLimits />} />
                <Route path="/operations/verification-requests" element={<VerificationRequests />} />
                <Route path="/operations/service-requests" element={<ServiceRequests />} />
                <Route path="/operations/member-messages" element={<MemberMessages />} />
                <Route path="/operations/referrals" element={<Referrals />} />
                <Route path="/operations/response-templates" element={<ResponseTemplates />} />
                <Route path="/operations/assistant" element={<AdminAgent />} />
                <Route path="/operations/recommendations" element={<RecommendationReview />} />
                <Route path="/operations/transaction-export" element={<TransactionExportDashboard />} />
                <Route path="/operations/impact-analytics" element={<ImpactAnalytics />} />
                <Route path="/operations/leaderboard" element={<SupporterLeaderboard />} />
                <Route path="/operations/herobox" element={<HeroBoxMissionControl />} />
                <Route path="/operations/herobox/heroes" element={<HeroBoxHeroes />} />
                <Route path="/operations/herobox/care-packages" element={<HeroBoxCarePackages />} />
                <Route path="/operations/herobox/volunteers" element={<HeroBoxVolunteers />} />
                <Route path="/operations/herobox/products" element={<HeroBoxAdminProducts />} />
                <Route path="/operations/herobox/orders" element={<HeroBoxAdminOrders />} />
                <Route path="/operations/herobox/funds-shipping" element={<HeroBoxFundsShipping />} />
                <Route path="/operations/discovery-network" element={<DiscoveryNetwork />} />
                <Route path="/operations/humanitarian-cases" element={<HumanitarianCases />} />
                <Route path="/operations/organizations" element={<Organizations />} />
                <Route path="/operations/finance" element={<Finance />} />
                <Route path="/operations/approvals" element={<Approvals />} />
                <Route path="/operations/deposits" element={<Deposits />} />
                <Route path="/operations/transfers" element={<Transfers />} />
                <Route path="/operations/documents" element={<OperationsDocuments />} />
                <Route path="/operations/cards" element={<Cards />} />
                <Route path="/operations/wallet-assignment" element={<WalletAssignment />} />
                <Route path="/operations/account-assignment" element={<AccountAssignment />} />
                <Route path="/operations/reports" element={<Reports />} />
                <Route path="/operations/executive-reports" element={<ExecutiveReports />} />
                <Route path="/operations/audit-logs" element={<AuditLogs />} />
                <Route path="/operations/aum-growth" element={<AumGrowth />} />
                <Route path="/operations/bulk-import" element={<BulkTransactionImport />} />
                <Route path="/operations/transaction-summaries" element={<TransactionSummaries />} />
                <Route path="/operations/withdrawal-audit-log" element={<WithdrawalAuditLog />} />
                <Route path="/operations/activity" element={<ActivityTimeline />} />
                <Route path="/operations/configuration" element={<Configuration />} />
                <Route path="/operations/api-management" element={<ApiManagement />} />
                <Route path="/operations/integrations" element={<Integrations />} />
                <Route path="/operations/notifications" element={<OperationsNotifications />} />
                <Route path="/operations/security" element={<Security />} />
                <Route path="/operations/feature-flags" element={<FeatureFlags />} />
                <Route path="/operations/background-jobs" element={<BackgroundJobs />} />
                <Route path="/operations/system-health" element={<SystemHealth />} />
                <Route path="/operations/data-integrity" element={<DataIntegrityAudit />} />
                <Route path="/operations/investment" element={<InvestmentDashboard />} />
                <Route path="/operations/investment/deposits" element={<InvestmentDeposits />} />
                <Route path="/operations/investment/withdrawals" element={<InvestmentWithdrawals />} />
                <Route path="/operations/investment/portfolios" element={<InvestmentPortfolios />} />
                <Route path="/operations/investment/signals" element={<InvestmentSignals />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<PageNotFound />} />
        </Routes>
      </ExceptionAuthProvider>
    </Suspense>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AuthenticatedApp />
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App