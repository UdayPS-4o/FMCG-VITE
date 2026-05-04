import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import constants from '../../constants';

interface Product {
  CODE: string;
  PRODUCT: string;
  UNIT_1: string;
  UNIT_2: string;
  MULT_F: string;
  RATE1: string;
  MRP1: string;
  PACK: string;
  nickname: string;
  brand_code: string;
  image_url: string;
}

interface CustomBrand {
  id: number;
  brand_code: string;
  brand_name: string;
  image_url: string;
}

const AppListings: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [brands, setBrands] = useState<CustomBrand[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<CustomBrand | null>(null);

  // Forms
  const [productForm, setProductForm] = useState({ nickname: '', brand_code: '', image_url: '', newImageFile: '' });
  const [brandForm, setBrandForm] = useState({ brand_code: '', brand_name: '', image_url: '' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { Authorization: `Bearer ${token}` };
      
      const [prodRes, brandRes] = await Promise.all([
        fetch(`${constants.baseURL}/api/app/admin/products`, { headers }),
        fetch(`${constants.baseURL}/api/app/admin/brands_custom`, { headers })
      ]);
      
      if (!prodRes.ok || !brandRes.ok) throw new Error('Failed to fetch data');
      
      setProducts(await prodRes.json());
      setBrands(await brandRes.json());
    } catch {
      toast.error('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Filter and paginate
  const filteredProducts = products.filter(p => 
    p.PRODUCT.toLowerCase().includes(search.toLowerCase()) || 
    p.CODE.toLowerCase().includes(search.toLowerCase()) ||
    (p.nickname || '').toLowerCase().includes(search.toLowerCase())
  );
  
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
  const currentProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // File to Base64
  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<any>>, field: string) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setter((prev: any) => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  // Product Methods
  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setProductForm({
      nickname: p.nickname || '',
      brand_code: p.brand_code || '',
      image_url: p.image_url || '',
      newImageFile: ''
    });
    setShowProductModal(true);
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // 1. Save Meta (Nickname, Brand)
      const res = await fetch(`${constants.baseURL}/api/app/admin/products/${editingProduct.CODE}/meta`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          nickname: productForm.nickname,
          brand_code: productForm.brand_code,
          image_url: productForm.image_url // Retain existing if no new one
        })
      });
      if (!res.ok) throw new Error('Failed to update meta');

      // 2. Upload new image if selected
      if (productForm.newImageFile) {
        const imgRes = await fetch(`${constants.baseURL}/api/app/admin/product-image`, {
          method: 'POST',
          headers,
          body: JSON.stringify({ productCode: editingProduct.CODE, imageUrl: productForm.newImageFile })
        });
        if (!imgRes.ok) throw new Error('Failed to upload image');
      }

      toast.success('Product updated');
      setShowProductModal(false);
      fetchData();
    } catch {
      toast.error('Error updating product');
    }
  };

  // Brand Methods
  const openNewBrand = () => {
    setEditingBrand(null);
    setBrandForm({ brand_code: '', brand_name: '', image_url: '' });
    setShowBrandModal(true);
  };

  const openEditBrand = (b: CustomBrand) => {
    setEditingBrand(b);
    setBrandForm({ brand_code: b.brand_code, brand_name: b.brand_name, image_url: b.image_url || '' });
    setShowBrandModal(true);
  };

  const handleBrandSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const url = editingBrand 
        ? `${constants.baseURL}/api/app/admin/brands_custom/${editingBrand.id}`
        : `${constants.baseURL}/api/app/admin/brands_custom`;
      const method = editingBrand ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(brandForm)
      });
      if (!res.ok) throw new Error('Failed to save brand');
      
      toast.success(editingBrand ? 'Brand updated' : 'Brand created');
      setShowBrandModal(false);
      fetchData();
    } catch {
      toast.error('Error saving brand');
    }
  };

  const deleteBrand = async (id: number) => {
    if (!window.confirm('Delete this brand?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${constants.baseURL}/api/app/admin/brands_custom/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Brand deleted');
      fetchData();
    } catch {
      toast.error('Error deleting brand');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">App Listings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage product nicknames, images, and custom brands.</p>
        </div>
        <button
          onClick={openNewBrand}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          Manage Brands
        </button>
      </div>

      {/* Controls */}
      <div className="flex gap-4">
        <input 
          type="text" 
          placeholder="Search by product name, code or nickname..." 
          value={search}
          onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
          className="w-full max-w-md border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
        />
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Image</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Info</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nickname</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : currentProducts.length === 0 ? (
                <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-500">No products found.</td></tr>
              ) : (
                currentProducts.map(p => {
                  const br = brands.find(b => b.brand_code === p.brand_code);
                  return (
                    <tr key={p.CODE} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        {p.image_url ? (
                          <img src={`${constants.baseURL}${p.image_url}`} alt={p.PRODUCT} className="h-12 w-12 object-contain rounded bg-gray-100 p-1" />
                        ) : (
                          <div className="h-12 w-12 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-400">No Img</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{p.PRODUCT}</div>
                        <div className="text-xs text-gray-500">Code: {p.CODE} | Rs {p.RATE1}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-medium">
                        {p.nickname || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        {br ? br.brand_name : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => openEditProduct(p)} className="text-brand-600 hover:text-brand-900 font-semibold bg-brand-50 px-3 py-1 rounded">Edit Listing</button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-6 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <span className="text-sm text-gray-500">Page {currentPage} of {totalPages}</span>
            <div className="space-x-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-3 py-1 rounded border disabled:opacity-50 text-sm"
              >Prev</button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-3 py-1 rounded border disabled:opacity-50 text-sm"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Product Edit Modal */}
      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowProductModal(false)} />
          <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
            <form onSubmit={handleProductSubmit}>
              <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between">
                <h3 className="text-xl font-bold">Edit Listing: {editingProduct.CODE}</h3>
                <button type="button" onClick={() => setShowProductModal(false)}>✕</button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Product Name</label>
                  <input type="text" disabled value={editingProduct.PRODUCT} className="w-full border rounded px-3 py-2 bg-gray-50 text-gray-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Nickname (Appears in App)</label>
                  <input 
                    type="text" 
                    value={productForm.nickname} 
                    onChange={e => setProductForm(p => ({...p, nickname: e.target.value}))}
                    className="w-full border rounded px-3 py-2" placeholder="e.g. Rin Soap 50g" 
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Assign Brand</label>
                  <select 
                    value={productForm.brand_code} 
                    onChange={e => setProductForm(p => ({...p, brand_code: e.target.value}))}
                    className="w-full border rounded px-3 py-2"
                  >
                    <option value="">No Brand</option>
                    {brands.map(b => <option key={b.brand_code} value={b.brand_code}>{b.brand_name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Product Image</label>
                  {productForm.image_url && !productForm.newImageFile && (
                    <img src={`${constants.baseURL}${productForm.image_url}`} alt="current" className="h-20 mb-2 border p-1 rounded" />
                  )}
                  {productForm.newImageFile && (
                    <img src={productForm.newImageFile} alt="preview" className="h-20 mb-2 border p-1 rounded" />
                  )}
                  <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, setProductForm, 'newImageFile')} className="w-full" />
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t flex justify-end gap-2">
                <button type="button" onClick={() => setShowProductModal(false)} className="px-4 py-2 border rounded text-sm">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-brand-600 text-white rounded text-sm">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Brands Modal */}
      {showBrandModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowBrandModal(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between shrink-0">
              <h3 className="text-xl font-bold">Manage Custom Brands</h3>
              <button type="button" onClick={() => setShowBrandModal(false)}>✕</button>
            </div>
            <div className="p-6 flex-1 overflow-y-auto flex gap-6 flex-col md:flex-row">
              {/* Form */}
              <form onSubmit={handleBrandSubmit} className="flex-1 space-y-4 bg-gray-50 p-4 rounded-xl border">
                <h4 className="font-bold text-sm">{editingBrand ? 'Edit Brand' : 'Create New Brand'}</h4>
                <div>
                  <label className="block text-xs font-medium mb-1">Brand Code (Unique)</label>
                  <input required type="text" value={brandForm.brand_code} disabled={!!editingBrand} onChange={e => setBrandForm(f => ({...f, brand_code: e.target.value}))} className="w-full border rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Brand Name</label>
                  <input required type="text" value={brandForm.brand_name} onChange={e => setBrandForm(f => ({...f, brand_name: e.target.value}))} className="w-full border rounded px-3 py-1.5 text-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Image Base64 (Optional)</label>
                  {brandForm.image_url && <img src={brandForm.image_url} alt="img" className="h-10 mb-1" />}
                  <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, setBrandForm, 'image_url')} className="text-xs w-full" />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="submit" className="bg-brand-600 text-white px-3 py-1.5 rounded text-xs">Save</button>
                  {editingBrand && <button type="button" onClick={() => { setEditingBrand(null); setBrandForm({brand_code:'', brand_name:'', image_url:''}); }} className="px-3 py-1.5 border rounded text-xs">Cancel Edit</button>}
                </div>
              </form>
              {/* List */}
              <div className="flex-1 space-y-2 max-h-[50vh] overflow-y-auto pr-2">
                {brands.map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 border rounded bg-white">
                    <div className="flex items-center gap-3">
                      {b.image_url ? <img src={b.image_url} alt="" className="w-8 h-8 rounded-full border" /> : <div className="w-8 h-8 rounded-full bg-gray-200" />}
                      <div>
                        <div className="text-sm font-bold">{b.brand_name}</div>
                        <div className="text-xs text-gray-500">{b.brand_code}</div>
                      </div>
                    </div>
                    <div className="space-x-2">
                      <button onClick={() => openEditBrand(b)} className="text-xs text-blue-600">Edit</button>
                      <button onClick={() => deleteBrand(b.id)} className="text-xs text-red-600">Del</button>
                    </div>
                  </div>
                ))}
                {brands.length === 0 && <p className="text-sm text-gray-500">No custom brands created yet.</p>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppListings;
