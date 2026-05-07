import api from './api';

export interface Product {
  id: string;
  itemcode: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
  status: 'In Stock' | 'Low' | 'Out';
  createdAt: string;
  updatedAt: string;
}

export interface ProductsResponse {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
}

export interface CreateProductData {
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number;
}

export type UpdateProductData = Partial<CreateProductData>;

export async function getProducts(filters: ProductFilters = {}): Promise<ProductsResponse> {
  const params = new URLSearchParams();
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));
  if (filters.search) params.set('search', filters.search);
  if (filters.category) params.set('category', filters.category);

  const res = await api.get<{ success: boolean; data: ProductsResponse }>(`/inventory?${params}`);
  return res.data.data;
}

export async function getProduct(id: string): Promise<Product> {
  const res = await api.get<{ success: boolean; data: Product }>(`/inventory/${id}`);
  return res.data.data;
}

export async function createProduct(data: CreateProductData): Promise<Product> {
  const res = await api.post<{ success: boolean; data: Product }>('/inventory', data);
  return res.data.data;
}

export async function updateProduct(id: string, data: UpdateProductData): Promise<Product> {
  const res = await api.patch<{ success: boolean; data: Product }>(`/inventory/${id}`, data);
  return res.data.data;
}

export async function deleteProduct(id: string): Promise<void> {
  await api.delete(`/inventory/${id}`);
}

export async function getCategories(): Promise<string[]> {
  const res = await api.get<{ success: boolean; data: string[] }>('/inventory/categories');
  return res.data.data;
}
