import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { Conversation, ListingListItem } from '@zuuchmap/core';

export type TabParamList = {
  browse: undefined; messages: undefined; profile: undefined;
  /** `seg`: open on the saved searches (a saved-search notification). */
  saved: { seg?: 'searches' } | undefined;
  /** Provider shell. */
  home: undefined;
  /** `renew`: open the renew sheet for that listing (an expiry notification). */
  myPosts: { renew?: number } | undefined; add: undefined;
  /** Admin shell (Figma J1): `browse` is the admin search, the rest are the queues. */
  approval: undefined; reports: undefined;
};

export type RootStackParamList = {
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  /** `item` seeds the screen while the full listing loads. */
  ListingDetail: { id: number; item?: ListingListItem };
  Gallery: { images: string[]; index: number; title: string };
  Sos: undefined;
  SignIn: undefined;
  CategoryPicker: undefined;
  SubcategoryPicker: { category: string };
  BecomeProvider: undefined;
  MyBookings: undefined;
  BookingRequests: undefined;
  /** `conversation` seeds the header while the thread loads. */
  Thread: { id: string; conversation?: Conversation };
  Seller: { id: string };
  Reviews: { id: string; name: string };
  /** Provider (phase 6). `edit`: an existing listing; `copyFrom`: prefill a new one from it; `step`: where to open. */
  Wizard: { edit?: number; copyFrom?: number; step?: number } | undefined;
  /** `postId` preselects one listing. */
  BlockDays: { postId?: number } | undefined;
  Performance: { id: number };
  BookingValue: undefined;
  Company: undefined;
  Notifications: undefined;
  NotificationSettings: undefined;
  /** Phase 8: plan and payment history; one QPay invoice by id. */
  Billing: undefined;
  Payment: { id: string };
  /** Figma L1–L4, L6. */
  Help: undefined;
  Privacy: undefined;
  Terms: undefined;
  DeleteAccount: undefined;
  /** Phase 9 admin (Figma J2/J9 review, J6 users, J7 analytics). */
  AdminReview: { id: number };
  AdminUsers: undefined;
  AdminAnalytics: undefined;
  Kit: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;
