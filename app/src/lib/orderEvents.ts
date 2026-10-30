// Window events for live order updates (push notification → in-app banner → pages refetch).
export const ORDER_PUSH_EVENT = 'order:push';       // detail: OrderPushDetail
export const ORDER_REFRESH_EVENT = 'order:refresh'; // pages showing orders reload silently
export const APP_NAVIGATE_EVENT = 'app:navigate';   // detail: url (notification tapped)

export interface OrderPushDetail {
    title: string;
    body: string;
    url?: string;
    orderId?: string;
    status?: string;
}
export const PENDING_NAV_KEY = 'app_pending_nav';   // sessionStorage: url from a tapped notification
