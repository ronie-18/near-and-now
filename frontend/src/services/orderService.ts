import { Order } from './supabase';

const getApiBase = () => {
  let base = (import.meta.env.VITE_API_URL || import.meta.env.EXPO_PUBLIC_API_BASE_URL || '')
    .toString()
    .replace(/\/$/, '');
  if (import.meta.env.DEV && base.startsWith('https://')) {
    return '';
  }
  return base;
};

export interface CustomerOrderResponse {
  id: string;
  order_code: string;
  customer_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  subtotal_amount: number;
  delivery_fee: number;
  total_amount: number;
  delivery_address: string;
  placed_at: string;
  created_at: string;
  store_orders?: Array<{
    id: string;
    store_id: string;
    status: string;
    order_items: Array<{
      product_id: string;
      product_name: string;
      unit: string;
      image_url: string;
      unit_price: number;
      quantity: number;
    }>;
  }>;
}

export async function fetchCustomerOrders(customerId: string): Promise<Order[]> {
  try {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/orders/customer/${customerId}`;
    
    console.log('📦 Fetching customer orders from:', url);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch orders:', response.status, response.statusText);
      throw new Error(`Failed to fetch orders: ${response.statusText}`);
    }

    const data: CustomerOrderResponse[] = await response.json();
    
    console.log(`✅ Fetched ${data.length} orders from backend`);

    const orders: Order[] = data.map((co) => {
      const allItems: any[] = [];
      let itemsCount = 0;
      
      (co.store_orders || []).forEach((so) => {
        if (so.order_items) {
          allItems.push(...so.order_items.map(item => ({
            product_id: item.product_id,
            name: item.product_name,
            price: item.unit_price,
            quantity: item.quantity,
            image: item.image_url,
            unit: item.unit
          })));
          itemsCount += so.order_items.length;
        }
      });

      return {
        id: co.id,
        user_id: co.customer_id,
        customer_name: '',
        customer_phone: '',
        order_status: co.status as Order['order_status'],
        payment_status: co.payment_status as Order['payment_status'],
        payment_method: co.payment_method || '',
        order_total: Number(co.total_amount),
        subtotal: Number(co.subtotal_amount),
        delivery_fee: Number(co.delivery_fee || 0),
        items: allItems,
        items_count: itemsCount,
        shipping_address: {
          address: co.delivery_address || '',
          city: '',
          state: '',
          pincode: ''
        },
        created_at: co.placed_at || co.created_at || '',
        order_number: co.order_code
      };
    });

    return orders;
  } catch (error) {
    console.error('❌ Error fetching customer orders:', error);
    throw error;
  }
}

export async function fetchOrderById(orderId: string): Promise<CustomerOrderResponse | null> {
  try {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/orders/${orderId}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch order:', response.status, response.statusText);
      return null;
    }

    const data: CustomerOrderResponse = await response.json();
    return data;
  } catch (error) {
    console.error('Error fetching order by ID:', error);
    return null;
  }
}

export async function cancelOrder(orderId: string): Promise<{ success: boolean; message: string; order?: any }> {
  try {
    const apiBase = getApiBase();
    const url = `${apiBase}/api/orders/${orderId}/cancel`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to cancel order');
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    console.error('Error cancelling order:', error);
    throw error;
  }
}
