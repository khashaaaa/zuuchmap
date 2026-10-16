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
  Kit: undefined;
};

export type Nav = NativeStackNavigationProp<RootStackParamList>;
