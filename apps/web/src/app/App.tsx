import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Landing from './Landing';
import { Shell } from './Shell';
import SignIn from './SignIn';

const Browse = lazy(() => import('./Browse'));
const ListingPage = lazy(() => import('./ListingPage'));
const Gallery = lazy(() => import('./ListingPage').then((m) => ({ default: m.Gallery })));
const Saved = lazy(() => import('./Saved'));
const Sos = lazy(() => import('./Sos'));
const Messages = lazy(() => import('./Messages'));
const MyBookings = lazy(() => import('./MyBookings'));
const BookingRequests = lazy(() => import('./BookingRequests'));
const Seller = lazy(() => import('./Seller'));
const SellerReviews = lazy(() => import('./Seller').then((m) => ({ default: m.SellerReviews })));
const Notifications = lazy(() => import('./Notifications'));
const Profile = lazy(() => import('./Profile'));
const BecomeProvider = lazy(() => import('./BecomeProvider'));
const ProviderHome = lazy(() => import('./provider/Home'));
const ProviderListings = lazy(() => import('./provider/Listings'));
const Wizard = lazy(() => import('./provider/Wizard'));
const BlockDays = lazy(() => import('./provider/BlockDays'));
const Performance = lazy(() => import('./provider/Performance'));
const BookingValue = lazy(() => import('./provider/BookingValue'));
const CompanyPage = lazy(() => import('./provider/Company'));
const Billing = lazy(() => import('./provider/Billing'));
const Help = lazy(() => import('./Legal').then((m) => ({ default: m.Help })));
const Privacy = lazy(() => import('./Legal').then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import('./Legal').then((m) => ({ default: m.Terms })));
const DeleteAccount = lazy(() => import('./Legal').then((m) => ({ default: m.DeleteAccount })));
const AdminFrame = lazy(() => import('./admin/Frame').then((m) => ({ default: m.AdminFrame })));
const AdminDashboard = lazy(() => import('./admin/Dashboard'));
const AdminListings = lazy(() => import('./admin/Listings'));
const AdminUsers = lazy(() => import('./admin/Users'));
const AdminUser = lazy(() => import('./admin/Users').then((m) => ({ default: m.UserDetail })));
const AdminCategories = lazy(() => import('./admin/Categories'));
const AdminAnalytics = lazy(() => import('./admin/Analytics'));
const AdminReports = lazy(() => import('./admin/Reports'));
const AdminProfile = lazy(() => import('./admin/AdminProfile'));
const NotFound = lazy(() => import('./NotFound'));
const Kit = lazy(() => import('./Kit').then((m) => ({ default: m.Kit })));

function Loading() {
  const { t } = useTranslation();
  return <div role="status" className="p-8 text-center text-caption text-text-secondary">{t('ui.loading')}</div>;
}

export function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/kit" element={<Kit />} />
        <Route element={<Shell />}>
          <Route path="admin" element={<AdminFrame />}>
            <Route index element={<AdminDashboard />} />
            <Route path="listings" element={<AdminListings />} />
            <Route path="users" element={<AdminUsers />} />
            <Route path="users/:id" element={<AdminUser />} />
            <Route path="categories" element={<AdminCategories />} />
            <Route path="categories/:key" element={<AdminCategories />} />
            <Route path="analytics" element={<AdminAnalytics />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="profile" element={<AdminProfile />} />
          </Route>
          <Route index element={<Landing />} />
          <Route path="browse" element={<Browse />} />
          <Route path="posts/:id" element={<ListingPage />} />
          <Route path="posts/:id/photos" element={<Gallery />} />
          <Route path="saved" element={<Saved />} />
          <Route path="saved/searches" element={<Saved />} />
          <Route path="sos" element={<Sos />} />
          <Route path="login" element={<SignIn />} />
          <Route path="login/verify" element={<SignIn />} />
          <Route path="messages" element={<Messages />} />
          <Route path="messages/:id" element={<Messages />} />
          <Route path="bookings" element={<MyBookings />} />
          <Route path="requests" element={<BookingRequests />} />
          <Route path="sellers/:id" element={<Seller />} />
          <Route path="sellers/:id/reviews" element={<SellerReviews />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="profile" element={<Profile />} />
          <Route path="profile/delete" element={<DeleteAccount />} />
          <Route path="help" element={<Help />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="become-provider" element={<BecomeProvider />} />
          <Route path="provider" element={<ProviderHome />} />
          <Route path="provider/listings" element={<ProviderListings />} />
          <Route path="provider/listings/:id/edit" element={<Wizard />} />
          <Route path="provider/listings/:id/performance" element={<Performance />} />
          <Route path="provider/new" element={<Wizard />} />
          <Route path="provider/block" element={<BlockDays />} />
          <Route path="provider/value" element={<BookingValue />} />
          <Route path="provider/company" element={<CompanyPage />} />
          <Route path="provider/billing" element={<Billing />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
