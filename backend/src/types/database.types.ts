export type UserRole = 'customer' | 'shopkeeper' | 'delivery_partner';

export type OrderStatus = 
  | 'pending_at_store'
  | 'store_accepted'
  | 'preparing_order'
  | 'ready_for_pickup'
  | 'delivery_partner_assigned'
  | 'order_picked_up'
  | 'in_transit'
  | 'order_delivered'
  | 'order_cancelled';

export type PaymentStatus = 'pending' | 'completed' | 'failed' | 'refunded';

export type AdminRole = 'super_admin' | 'admin';

export type AdminStatus = 'active' | 'inactive' | 'suspended';

export type CouponType = 'flat' | 'percent' | 'first_order_discount';

export type PaymentMethodType = 
  | 'cash_on_delivery'
  | 'upi'
  | 'credit_card'
  | 'debit_card'
  | 'net_banking'
  | 'wallet';

export interface AppUser {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  role: UserRole;
  is_activated: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  user_id: string;
  name: string;
  surname: string | null;
  phone: string;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  landmark: string;
  delivery_instructions: string;
  google_place_id: string | null;
  google_formatted_address: string | null;
  google_place_data: any;
  created_at: string;
  updated_at: string;
}

export interface CustomerSavedAddress {
  id: string;
  customer_id: string;
  label: string | null;
  address: string;
  city: string | null;
  state: string | null;
  pincode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  google_place_id: string | null;
  google_formatted_address: string | null;
  google_place_data: any;
  contact_name: string | null;
  contact_phone: string | null;
  landmark: string | null;
  delivery_instructions: string | null;
  is_default: boolean;
  is_active: boolean;
  delivery_for: string;
  receiver_name: string | null;
  receiver_address: string | null;
  receiver_phone: string | null;
  created_at: string;
  updated_at: string;
}

export interface Store {
  id: string;
  owner_id: string;
  name: string;
  phone: string;
  address: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface MasterProduct {
  id: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  image_url: string | null;
  base_price: number;
  discounted_price: number;
  unit: string;
  is_loose: boolean;
  min_quantity: number;
  max_quantity: number;
  rating: number;
  rating_count: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  store_id: string;
  master_product_id: string;
  quantity: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface CustomerOrder {
  id: string;
  order_code: string | null;
  customer_id: string;
  status: OrderStatus;
  payment_status: string;
  payment_method: PaymentMethodType | null;
  subtotal_amount: number;
  delivery_fee: number;
  discount_amount: number;
  total_amount: number;
  coupon_id: string | null;
  delivery_address: string;
  delivery_latitude: number;
  delivery_longitude: number;
  notes: string | null;
  placed_at: string;
  updated_at: string;
  delivered_at: string | null;
  cancelled_at: string | null;
  export_token: string | null;
  exported_at: string | null;
  created_at: string;
}

export interface StoreOrder {
  id: string;
  customer_order_id: string;
  store_id: string;
  delivery_partner_id: string | null;
  status: string;
  subtotal_amount: number;
  delivery_fee: number;
  accepted_at: string | null;
  ready_at: string | null;
  assigned_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  store_order_id: string;
  product_id: string;
  product_name: string;
  unit: string | null;
  image_url: string | null;
  unit_price: number;
  quantity: number;
  created_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  description: string | null;
  coupon_type: CouponType;
  discount_value: number;
  max_discount_amount: number | null;
  min_order_value: number;
  applies_to_first_n_orders: number | null;
  usage_limit: number | null;
  usage_count: number;
  per_user_limit: number;
  valid_from: string;
  valid_until: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Admin {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role: AdminRole;
  permissions: string[];
  created_by: string | null;
  status: AdminStatus;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ProductsWithDetails {
  id: string;
  store_id: string;
  stock_quantity: number;
  available_in_store: boolean;
  master_product_id: string;
  name: string;
  category: string;
  brand: string | null;
  description: string | null;
  image_url: string | null;
  mrp: number;
  price: number;
  unit: string;
  is_loose: boolean;
  min_quantity: number;
  max_quantity: number;
  rating: number;
  rating_count: number;
  store_name: string;
  store_latitude: number;
  store_longitude: number;
}
