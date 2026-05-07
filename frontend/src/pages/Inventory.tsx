import { useEffect, useState, useCallback, useRef, type FormEvent } from 'react';
import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  type Product,
  type CreateProductData,
} from '../services/inventory.service';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import { Input, Select } from '../components/ui/Input';
import Modal, { ConfirmModal } from '../components/ui/Modal';
import Badge from '../components/ui/Badge';
import Pagination from '../components/ui/Pagination';
import Notification from '../components/Notification';
import styles from './Inventory.module.css';

const CATEGORIES = ['Beverages', 'Snacks', 'Noodles', 'Hygiene', 'Medicine', 'Hardware', 'Cigarettes', 'Other'];

function getStatusVariant(status: string): 'success' | 'warning' | 'danger' {
  if (status === 'In Stock') return 'success';
  if (status === 'Low') return 'warning';
  return 'danger';
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function IconSearch() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconPlus() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

interface ProductFormData {
  name: string;
  sku: string;
  category: string;
  quantity: string;
  price: string;
}

const emptyForm: ProductFormData = { name: '', sku: '', category: CATEGORIES[0], quantity: '0', price: '' };

interface FormErrors {
  name?: string;
  sku?: string;
  category?: string;
  quantity?: string;
  price?: string;
}

function validateForm(data: ProductFormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.name.trim()) errors.name = 'Product name is required';
  if (!data.sku.trim()) errors.sku = 'SKU is required';
  else if (!/^[A-Za-z0-9\-_]+$/.test(data.sku)) errors.sku = 'SKU must be alphanumeric';
  if (!data.category) errors.category = 'Category is required';
  const qty = parseInt(data.quantity);
  if (isNaN(qty) || qty < 0) errors.quantity = 'Quantity must be 0 or greater';
  const price = parseFloat(data.price);
  if (isNaN(price) || price <= 0) errors.price = 'Price must be greater than 0';
  return errors;
}

export default function Inventory() {
  const { canWrite } = useAuth();

  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(emptyForm);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formLoading, setFormLoading] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const LIMIT = 15;

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getProducts({ page, limit: LIMIT, search: search || undefined });
      setProducts(result.data);
      setTotal(result.total);
      setTotalPages(result.totalPages);
    } catch {
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input || input.disabled || document.querySelector('[role="dialog"]')) {
        return;
      }

      input.focus();
      input.select();
    });

    return () => window.cancelAnimationFrame(frame);
  }, []);

  const handleSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const openAdd = () => {
    setFormData(emptyForm);
    setFormErrors({});
    setSubmitError('');
    setAddOpen(true);
  };

  const openEdit = (product: Product) => {
    setSelectedProduct(product);
    setFormData({
      name: product.name,
      sku: product.sku,
      category: product.category,
      quantity: String(product.quantity),
      price: String(product.price),
    });
    setFormErrors({});
    setSubmitError('');
    setEditOpen(true);
  };

  const openDelete = (product: Product) => {
    setSelectedProduct(product);
    setDeleteOpen(true);
  };

  const updateField = (field: keyof ProductFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors((prev) => ({ ...prev, [field]: undefined }));
    }
  };

  const handleAdd = async () => {
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormLoading(true);
    setSubmitError('');
    try {
      const data: CreateProductData = {
        name: formData.name.trim(),
        sku: formData.sku.trim().toUpperCase(),
        category: formData.category,
        quantity: parseInt(formData.quantity),
        price: parseFloat(formData.price),
      };
      await createProduct(data);
      setAddOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to create product';
      setSubmitError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedProduct) return;
    const errors = validateForm(formData);
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }
    setFormLoading(true);
    setSubmitError('');
    try {
      await updateProduct(selectedProduct.id, {
        name: formData.name.trim(),
        sku: formData.sku.trim().toUpperCase(),
        category: formData.category,
        quantity: parseInt(formData.quantity),
        price: parseFloat(formData.price),
      });
      setEditOpen(false);
      fetchProducts();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        'Failed to update product';
      setSubmitError(msg);
    } finally {
      setFormLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedProduct) return;
    setFormLoading(true);
    try {
      await deleteProduct(selectedProduct.id);
      setDeleteOpen(false);
      setNotification({ message: `Product "${selectedProduct.name}" has been successfully deleted`, type: 'success' });
      fetchProducts();
    } catch {
      setDeleteOpen(false);
      setNotification({ message: 'Failed to delete product', type: 'error' });
    } finally {
      setFormLoading(false);
    }
  };

  const productForm = (
    <div className={styles.formGrid}>
      <Input
        id="prod-name"
        label="Product Name"
        value={formData.name}
        onChange={(e) => updateField('name', e.target.value)}
        error={formErrors.name}
        placeholder="e.g. Coca-Cola 1.5L"
      />
      <Input
        id="prod-sku"
        label="SKU"
        value={formData.sku}
        onChange={(e) => updateField('sku', e.target.value)}
        error={formErrors.sku}
        placeholder="e.g. BEV-001"
      />
      <Select
        id="prod-cat"
        label="Category"
        value={formData.category}
        onChange={(e) => updateField('category', e.target.value)}
        error={formErrors.category}
      >
        {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
      </Select>
      <Input
        id="prod-qty"
        label="Quantity"
        type="number"
        min="0"
        value={formData.quantity}
        onChange={(e) => updateField('quantity', e.target.value)}
        error={formErrors.quantity}
      />
      <Input
        id="prod-price"
        label="Price (₱)"
        type="number"
        min="0.01"
        step="0.01"
        value={formData.price}
        onChange={(e) => updateField('price', e.target.value)}
        error={formErrors.price}
        placeholder="0.00"
      />
      {submitError && (
        <div className={styles.submitError}>{submitError}</div>
      )}
    </div>
  );

  return (
    <div className={styles.page}>
      {notification && (
        <Notification
          message={notification.message}
          type={notification.type}
          onClose={() => setNotification(null)}
        />
      )}
      <div className={styles.toolbar}>
        <form onSubmit={handleSearch} className={styles.searchForm}>
          <Input
            id="inv-search"
            ref={searchInputRef}
            type="text"
            placeholder="Search by name or SKU..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            icon={<IconSearch />}
          />
          <Button type="submit" variant="secondary" size="md">Search</Button>
          {search && (
            <Button variant="ghost" size="md" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}>
              Clear
            </Button>
          )}
        </form>
        {canWrite() && (
          <Button icon={<IconPlus />} onClick={openAdd}>
            Add Product
          </Button>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Product Name</th>
                <th>SKU</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Price</th>
                <th>Status</th>
                {canWrite() && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={canWrite() ? 7 : 6} className={styles.empty}>Loading...</td></tr>
              ) : products.length === 0 ? (
                <tr><td colSpan={canWrite() ? 7 : 6} className={styles.empty}>No products found</td></tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id}>
                    <td className={styles.productName}>{product.name}</td>
                    <td className={styles.mono}>{product.sku}</td>
                    <td>{product.category}</td>
                    <td>{product.quantity}</td>
                    <td>₱{Number(product.price).toFixed(2)}</td>
                    <td>
                      <Badge variant={getStatusVariant(product.status)}>{product.status}</Badge>
                    </td>
                    {canWrite() && (
                      <td>
                        <div className={styles.actions}>
                          <button
                            className={`${styles.actionBtn} ${styles.editBtn}`}
                            onClick={() => openEdit(product)}
                            title="Edit"
                          >
                            <IconEdit />
                          </button>
                          <button
                            className={`${styles.actionBtn} ${styles.deleteBtn}`}
                            onClick={() => openDelete(product)}
                            title="Delete"
                          >
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          page={page}
          totalPages={totalPages}
          total={total}
          limit={LIMIT}
          onPageChange={setPage}
        />
      </div>

      {/* Add Modal */}
      <Modal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add Product"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setAddOpen(false)} disabled={formLoading}>Cancel</Button>
            <Button onClick={handleAdd} loading={formLoading}>Add Product</Button>
          </div>
        }
      >
        {productForm}
      </Modal>

      {/* Edit Modal */}
      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Product"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button variant="secondary" onClick={() => setEditOpen(false)} disabled={formLoading}>Cancel</Button>
            <Button onClick={handleEdit} loading={formLoading}>Save Changes</Button>
          </div>
        }
      >
        {productForm}
      </Modal>

      {/* Delete Confirm Modal */}
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Product"
        message={`Are you sure you want to delete "${selectedProduct?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        loading={formLoading}
      />
    </div>
  );
}
