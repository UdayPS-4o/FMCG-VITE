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
  custom_id: number | null;
  brand_code: string;
  brand_name: string;
  image_url: string;
  is_custom: boolean;
  product_count?: number;
}

const AppListings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'products'|'brands'>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [allBrands, setAllBrands] = useState<CustomBrand[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Filters
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all'); // all, no-image, no-brand
  
  // Bulk selection
  const [selectedCodes, setSelectedCodes] = useState<string[]>([]);
  const [bulkBrandCode, setBulkBrandCode] = useState('');

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [amazonImages, setAmazonImages] = useState<string[]>([]);
  const [amazonSearchQuery, setAmazonSearchQuery] = useState('');
  
  const [showBrandModal, setShowBrandModal] = useState(false);
  const [editingBrand, setEditingBrand] = useState<CustomBrand | null>(null);

  // Add Products to Brand
  const [showAddProductsModal, setShowAddProductsModal] = useState(false);
  const [targetBrand, setTargetBrand] = useState<CustomBrand | null>(null);
  const [addProdSearch, setAddProdSearch] = useState('');
  const [tempSelectedProds, setTempSelectedProds] = useState<string[]>([]);

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
        fetch(`${constants.baseURL}/api/app/admin/brands`, { headers })
      ]);
      
      if (!prodRes.ok || !brandRes.ok) throw new Error('Failed to fetch data');
      
      setProducts(await prodRes.json());
      setAllBrands(await brandRes.json());
    } catch {
      toast.error('Error loading data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, []);

  // Filter and paginate
  const filteredProducts = products.filter(p => {
    const matchesSearch = p.PRODUCT.toLowerCase().includes(search.toLowerCase()) || 
                          p.CODE.toLowerCase().includes(search.toLowerCase()) ||
                          (p.nickname || '').toLowerCase().includes(search.toLowerCase());
    let matchesFilter = true;
    if (filterType === 'no-image') matchesFilter = !p.image_url;
    if (filterType === 'no-brand') matchesFilter = !p.brand_code;
    return matchesSearch && matchesFilter;
  });
  
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
    setAmazonImages([]);
    // Prefer nickname for search (more accurate), fall back to raw product name
    const searchTerm = p.nickname || p.PRODUCT;
    setAmazonSearchQuery(searchTerm);
    setShowProductModal(true);
    // Auto-search after state settles
    setTimeout(() => {
      triggerAmazonSearch(searchTerm);
    }, 50);
  };

  const triggerAmazonSearch = async (query: string) => {
    if (!query) return;
    setIsSearching(true);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${constants.baseURL}/api/app/admin/amazon-search?q=${encodeURIComponent(query)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.images) {
        setAmazonImages(data.images);
      }
    } catch {
      // silent fail on auto-search
    } finally {
      setIsSearching(false);
    }
  };

  const handleProductSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

      // 1. Save Meta (Nickname, Brand, existing image_url if provided)
      const res = await fetch(`${constants.baseURL}/api/app/admin/products/${editingProduct.CODE}/meta`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({
          nickname: productForm.nickname,
          brand_code: productForm.brand_code,
          image_url: productForm.image_url // might be updated from Amazon search
        })
      });
      if (!res.ok) throw new Error('Failed to update meta');

      // 2. Upload new image if file selected
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

  const searchAmazon = async () => {
    if (!amazonSearchQuery) return;
    setIsSearching(true);
    try {
      const token = localStorage.getItem('token') || '';
      const res = await fetch(`${constants.baseURL}/api/app/admin/amazon-search?q=${encodeURIComponent(amazonSearchQuery)}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.images) {
        setAmazonImages(data.images);
      } else {
        toast.error('No images found');
      }
    } catch {
      toast.error('Amazon search failed');
    } finally {
      setIsSearching(false);
    }
  };

  const selectAmazonImage = async (imgUrl: string) => {
    if (!editingProduct) return;
    try {
      const token = localStorage.getItem('token') || '';
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      const res = await fetch(`${constants.baseURL}/api/app/admin/product-image`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ productCode: editingProduct.CODE, imageUrl: imgUrl })
      });
      if (!res.ok) throw new Error('Failed to save image');
      const data = await res.json();
      setProductForm(p => ({ ...p, image_url: data.imageUrl, newImageFile: '' }));
      toast.success('Image updated from Amazon');
      setAmazonImages([]);
    } catch {
      toast.error('Failed to import Amazon image');
    }
  };

  // Bulk Assign Brand
  const toggleSelect = (code: string) => {
    setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };
  
  const toggleSelectAll = () => {
    if (selectedCodes.length === currentProducts.length) setSelectedCodes([]);
    else setSelectedCodes(currentProducts.map(p => p.CODE));
  };

  const handleBulkAssign = async () => {
    if (!bulkBrandCode || selectedCodes.length === 0) return;
    if (!window.confirm(`Assign brand to ${selectedCodes.length} products?`)) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      
      await Promise.all(selectedCodes.map(code => {
        const p = products.find(x => x.CODE === code);
        return fetch(`${constants.baseURL}/api/app/admin/products/${code}/meta`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            nickname: p?.nickname || '',
            brand_code: bulkBrandCode,
            image_url: p?.image_url || ''
          })
        });
      }));
      toast.success(`Assigned brand to ${selectedCodes.length} products`);
      setSelectedCodes([]);
      fetchData();
    } catch {
      toast.error('Bulk assignment failed');
    } finally {
      setLoading(false);
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
      const res = await fetch(`${constants.baseURL}/api/app/admin/brands`, {
        method: 'POST',
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

  const deleteBrand = async (customId: number | null) => {
    if (!customId) return toast.error('Cannot delete built-in brand');
    if (!window.confirm('Delete this custom brand?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${constants.baseURL}/api/app/admin/brands_custom/${customId}`, {
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

  const openAddProductsToBrand = (b: CustomBrand) => {
    setTargetBrand(b);
    setAddProdSearch('');
    setTempSelectedProds([]);
    setShowAddProductsModal(true);
  };

  const handleAddProductsToBrand = async () => {
    if (!targetBrand || tempSelectedProds.length === 0) return;
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
      
      await Promise.all(tempSelectedProds.map(code => {
        const p = products.find(x => x.CODE === code);
        return fetch(`${constants.baseURL}/api/app/admin/products/${code}/meta`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({
            nickname: p?.nickname || '',
            brand_code: targetBrand.brand_code,
            image_url: p?.image_url || ''
          })
        });
      }));
      
      toast.success(`Added ${tempSelectedProds.length} products to ${targetBrand.brand_name}`);
      setShowAddProductsModal(false);
      fetchData();
    } catch {
      toast.error('Failed to add products to brand');
    } finally {
      setLoading(false);
    }
  };

  const productsForAddModal = products.filter(p => {
    if (p.brand_code === targetBrand?.brand_code) return false;
    const matchesSearch = p.PRODUCT.toLowerCase().includes(addProdSearch.toLowerCase()) || 
                          p.CODE.toLowerCase().includes(addProdSearch.toLowerCase());
    return matchesSearch;
  }).slice(0, 50);

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">App Listings</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage product nicknames, images, and custom brands.</p>
        </div>
        <div className="flex bg-gray-100 dark:bg-gray-900 p-1 rounded-lg">
          <button
            onClick={() => setActiveTab('products')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'products' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Products
          </button>
          <button
            onClick={() => setActiveTab('brands')}
            className={`px-4 py-2 rounded-md text-sm font-bold transition-colors ${activeTab === 'brands' ? 'bg-white dark:bg-gray-700 text-brand-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
          >
            Brands Directory
          </button>
        </div>
      </div>

      {activeTab === 'products' && (
        <>

      {/* Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-2 flex-1 min-w-[300px]">
          <input 
            type="text" 
            placeholder="Search by name, code or nickname..." 
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            className="flex-1 max-w-md border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none"
          />
          <select
            value={filterType}
            onChange={(e) => { setFilterType(e.target.value); setCurrentPage(1); }}
            className="border border-gray-300 dark:border-gray-600 rounded-lg px-4 py-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none"
          >
            <option value="all" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">All Products</option>
            <option value="no-image" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Missing Image</option>
            <option value="no-brand" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Missing Brand</option>
          </select>
        </div>
        
        {/* Bulk Action Bar */}
        {selectedCodes.length > 0 && (
          <div className="bg-brand-50 border border-brand-200 rounded-lg p-2 flex items-center gap-3">
            <span className="text-sm font-semibold text-brand-700">{selectedCodes.length} selected</span>
            <select 
              value={bulkBrandCode} 
              onChange={e => setBulkBrandCode(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              <option value="" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Select Brand to Assign</option>
              {allBrands.map(b => <option key={b.brand_code} value={b.brand_code} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">{b.brand_name || b.brand_code}</option>)}
            </select>
            <button 
              onClick={handleBulkAssign}
              disabled={!bulkBrandCode}
              className="bg-brand-600 disabled:opacity-50 text-white px-3 py-1 rounded text-sm font-medium"
            >
              Apply
            </button>
          </div>
        )}
      </div>

      {/* Product Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                <th className="px-4 py-4 w-10">
                  <input type="checkbox" checked={selectedCodes.length === currentProducts.length && currentProducts.length > 0} onChange={toggleSelectAll} className="rounded" />
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Image</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Product Info</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Nickname</th>
                <th className="px-6 py-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Brand</th>
                <th className="px-6 py-4 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : currentProducts.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No products found.</td></tr>
              ) : (
                currentProducts.map(p => {
                  const br = allBrands.find(b => b.brand_code === p.brand_code);
                  const isSelected = selectedCodes.includes(p.CODE);
                  return (
                    <tr key={p.CODE} className={`hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${isSelected ? 'bg-brand-50/30' : ''}`}>
                      <td className="px-4 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.CODE)} className="rounded" />
                      </td>
                      <td className="px-4 py-4 whitespace-nowrap">
                        {p.image_url ? (
                          <img src={p.image_url.startsWith('http') ? p.image_url : `${constants.baseURL}${p.image_url}`} alt={p.PRODUCT} className="h-12 w-12 object-contain rounded bg-gray-100 p-1" />
                        ) : (
                          <div className="h-12 w-12 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xs text-gray-400 font-medium border border-dashed border-gray-300">No Img</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-bold text-gray-900 dark:text-white">{p.PRODUCT}</div>
                        <div className="text-xs text-gray-500 mt-1 font-mono">{p.CODE} | Rs {p.RATE1}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 font-medium">
                        {p.nickname || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {br ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {br.brand_name || br.brand_desc}
                          </span>
                        ) : '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button onClick={() => openEditProduct(p)} className="text-brand-600 hover:text-brand-900 font-semibold bg-brand-50 px-4 py-2 rounded-lg transition-colors border border-brand-100">Edit Listing</button>
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
            <span className="text-sm text-gray-500 font-medium">Page {currentPage} of {totalPages} ({filteredProducts.length} items)</span>
            <div className="space-x-2">
              <button 
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="px-4 py-1.5 rounded-lg border disabled:opacity-50 text-sm font-medium bg-white hover:bg-gray-50"
              >Prev</button>
              <button 
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="px-4 py-1.5 rounded-lg border disabled:opacity-50 text-sm font-medium bg-white hover:bg-gray-50"
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Product Edit Modal */}
      {showProductModal && editingProduct && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowProductModal(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden max-h-[95vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between shrink-0">
              <h3 className="text-xl font-bold">Edit Listing: <span className="text-brand-600">{editingProduct.CODE}</span></h3>
              <button type="button" onClick={() => setShowProductModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            
              <div className="p-6 overflow-y-auto flex-1">
              <form id="productForm" onSubmit={handleProductSubmit} className="space-y-5">
                <div>
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Product Name</label>
                  <input type="text" disabled value={editingProduct.PRODUCT} className="w-full border rounded-lg px-3 py-2 bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium" />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">App Nickname</label>
                    <input 
                      type="text" 
                      value={productForm.nickname} 
                      onChange={e => setProductForm(p => ({...p, nickname: e.target.value}))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white" 
                      placeholder="e.g. Rin Soap 50g" 
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-1">Brand</label>
                    <select 
                      value={productForm.brand_code} 
                      onChange={e => setProductForm(p => ({...p, brand_code: e.target.value}))}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-500 outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">No Brand</option>
                      {allBrands.map(b => <option key={b.brand_code} value={b.brand_code} className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">{b.brand_name || b.brand_desc}</option>)}
                    </select>
                  </div>
                </div>

                <div className="border-t dark:border-gray-700 pt-5 mt-5">
                  <label className="block text-sm font-bold text-gray-700 dark:text-gray-200 mb-3">Product Image</label>
                  
                  {/* Current Image Preview */}
                  <div className="flex gap-4 mb-4">
                    <div className="flex flex-col items-center justify-center p-2 border-2 border-dashed border-gray-200 dark:border-gray-600 rounded-xl w-24 h-24 bg-gray-50 dark:bg-gray-700">
                      {(productForm.image_url || productForm.newImageFile) ? (
                        <img 
                          src={productForm.newImageFile || (productForm.image_url.startsWith('http') ? productForm.image_url : `${constants.baseURL}${productForm.image_url}`)} 
                          alt="preview" className="w-full h-full object-contain" 
                        />
                      ) : (
                        <span className="text-xs text-gray-400 font-medium">No Image</span>
                      )}
                    </div>
                    
                    <div className="flex-1 flex flex-col justify-center space-y-2">
                      <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, setProductForm, 'newImageFile')} className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
                      <p className="text-xs text-gray-500">Upload a local image file. Max 5MB.</p>
                    </div>
                  </div>

                  {/* Amazon Search Integration */}
                  <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 mt-2">
                    <p className="text-sm font-bold text-orange-800 mb-2 flex items-center gap-2">
                      <span>Amazon Auto-Match</span>
                    </p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={amazonSearchQuery}
                        onChange={e => setAmazonSearchQuery(e.target.value)}
                        className="flex-1 border border-orange-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500"
                      />
                      <button 
                        type="button" 
                        onClick={searchAmazon}
                        disabled={isSearching}
                        className="bg-orange-500 text-white px-4 py-2 rounded-lg font-medium text-sm hover:bg-orange-600 disabled:opacity-50 min-w-[100px]"
                      >
                        {isSearching ? 'Searching...' : 'Search'}
                      </button>
                    </div>

                    {amazonImages.length > 0 && (
                      <div className="grid grid-cols-4 gap-3 mt-4">
                        {amazonImages.slice(0, 4).map((img, idx) => (
                          <div key={idx} className="relative group rounded-lg overflow-hidden border border-gray-200 shadow-sm aspect-square bg-white flex items-center justify-center cursor-pointer hover:border-orange-500 transition-colors" onClick={() => selectAmazonImage(img)}>
                            <img src={img} alt="Amazon" className="w-full h-full object-contain p-2" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                              <span className="text-white text-xs font-bold px-2 py-1 bg-orange-500 rounded">Use</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              </form>
            </div>
            
              <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-end gap-3 shrink-0">
              <button type="button" onClick={() => setShowProductModal(false)} className="px-5 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-600">Cancel</button>
              <button type="submit" form="productForm" className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-bold shadow-sm">Save Listing</button>
            </div>
          </div>
        </div>
      )}
      )}

        </>
      )}

      {/* Brands Tab */}
      {activeTab === 'brands' && (
        <div className="flex gap-8 flex-col lg:flex-row">
          {/* Form */}
          <div className="w-full lg:w-1/3 space-y-4">
            <form onSubmit={handleBrandSubmit} className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 space-y-4 sticky top-6">
              <div className="flex justify-between items-center mb-2">
                <h4 className="font-bold text-lg text-gray-900 dark:text-white">
                  {editingBrand ? 'Edit Brand' : 'Add New Brand'}
                </h4>
                {editingBrand && (
                  <button type="button" onClick={() => { setEditingBrand(null); setBrandForm({brand_code:'', brand_name:'', image_url:''}); }} className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400">Cancel Edit</button>
                )}
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Brand Code (Unique identifier)</label>
                <input required type="text" value={brandForm.brand_code} disabled={!!editingBrand} onChange={e => setBrandForm(f => ({...f, brand_code: e.target.value}))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-50 disabled:bg-gray-100 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Display Name</label>
                <input required type="text" value={brandForm.brand_name} onChange={e => setBrandForm(f => ({...f, brand_name: e.target.value}))} className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-700 dark:text-gray-200 mb-1">Brand Logo (Base64)</label>
                {brandForm.image_url && <div className="mb-3 w-16 h-16 rounded-full overflow-hidden border border-gray-200 bg-white p-1"><img src={brandForm.image_url} alt="img" className="w-full h-full object-contain" /></div>}
                <input type="file" accept="image/*" onChange={(e) => handleImageChange(e, setBrandForm, 'image_url')} className="w-full text-sm text-gray-500 dark:text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100" />
              </div>
              <div className="pt-4 border-t dark:border-gray-700">
                <button type="submit" className="w-full bg-brand-600 hover:bg-brand-700 text-white font-bold py-2.5 rounded-lg text-sm shadow-sm transition-colors">
                  {editingBrand ? 'Save Changes' : 'Create Brand'}
                </button>
              </div>
            </form>
          </div>

          {/* List */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 flex justify-between items-center">
              <h4 className="font-bold text-gray-900 dark:text-white">Brand Directory</h4>
              <span className="text-sm font-medium text-brand-600 bg-brand-50 px-3 py-1 rounded-full">{allBrands.length} Total Brands</span>
            </div>
            
            <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-[800px] overflow-y-auto">
              {allBrands.map(b => (
                <div key={b.brand_code} className="p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors group">
                  <div className="flex items-center gap-4">
                    {b.image_url ? (
                      <div className="w-12 h-12 rounded-lg border border-gray-200 bg-white p-1 flex items-center justify-center shrink-0 shadow-sm">
                        <img src={b.image_url.startsWith('http') ? b.image_url : `${constants.baseURL}${b.image_url}`} alt={b.brand_name} className="max-w-full max-h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-12 h-12 rounded-lg border border-dashed border-gray-300 bg-gray-50 dark:bg-gray-700 flex items-center justify-center shrink-0">
                        <span className="text-gray-400 font-bold text-sm">{b.brand_name?.substring(0, 2).toUpperCase()}</span>
                      </div>
                    )}
                    <div>
                      <div className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        {b.brand_name}
                        {b.is_custom && <span className="text-[10px] uppercase font-bold tracking-wider bg-purple-100 text-purple-700 px-2 py-0.5 rounded">Custom</span>}
                        {!b.is_custom && <span className="text-[10px] uppercase font-bold tracking-wider bg-gray-100 text-gray-600 px-2 py-0.5 rounded">Built-in</span>}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-3 mt-1">
                        <span className="font-mono bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded text-gray-600 dark:text-gray-300">{b.brand_code}</span>
                        <span className="flex items-center gap-1">
                          <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
                          {b.product_count || 0} Products
                        </span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => openAddProductsToBrand(b)} className="px-3 py-1.5 bg-emerald-50 text-emerald-600 hover:bg-emerald-100 font-semibold text-xs rounded-lg transition-colors">Add Products</button>
                    <button onClick={() => openEditBrand(b)} className="px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 font-semibold text-xs rounded-lg transition-colors">Edit</button>
                    {b.is_custom && (
                      <button onClick={() => deleteBrand(b.custom_id)} className="px-3 py-1.5 bg-red-50 text-red-600 hover:bg-red-100 font-semibold text-xs rounded-lg transition-colors">Delete</button>
                    )}
                  </div>
                </div>
              ))}
              
              {allBrands.length === 0 && (
                <div className="p-12 text-center text-gray-500">
                  No brands found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Products to Brand Modal */}
      {showAddProductsModal && targetBrand && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddProductsModal(false)} />
          <div className="relative w-full max-w-xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center shrink-0">
              <div>
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">Add Products to Brand</h3>
                <p className="text-sm text-brand-600 font-semibold">{targetBrand.brand_name}</p>
              </div>
              <button type="button" onClick={() => setShowAddProductsModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>

            <div className="p-6 flex-1 overflow-hidden flex flex-col space-y-4">
              <div className="relative">
                <input 
                  type="text" 
                  placeholder="Search products to add..."
                  value={addProdSearch}
                  onChange={e => setAddProdSearch(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-10 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
                <span className="absolute left-3 top-2.5 text-gray-400">🔍</span>
              </div>

              <div className="flex-1 overflow-y-auto border border-gray-100 dark:border-gray-700 rounded-lg divide-y divide-gray-50 dark:divide-gray-700">
                {productsForAddModal.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 text-sm">No eligible products found.</div>
                ) : (
                  productsForAddModal.map(p => (
                    <div key={p.CODE} className="p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <input 
                        type="checkbox" 
                        id={`add-${p.CODE}`}
                        checked={tempSelectedProds.includes(p.CODE)}
                        onChange={() => setTempSelectedProds(prev => prev.includes(p.CODE) ? prev.filter(c => c !== p.CODE) : [...prev, p.CODE])}
                        className="rounded text-brand-600 w-4 h-4"
                      />
                      <label htmlFor={`add-${p.CODE}`} className="flex-1 cursor-pointer">
                        <div className="text-sm font-bold text-gray-900 dark:text-white">{p.PRODUCT}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{p.CODE} {p.brand_code ? `(Currently: ${p.brand_code})` : '(No Brand)'}</div>
                      </label>
                    </div>
                  ))
                )}
              </div>
              {productsForAddModal.length > 0 && <p className="text-[10px] text-gray-400">Showing first 50 results.</p>}
            </div>

            <div className="px-6 py-4 bg-gray-50 dark:bg-gray-800 border-t dark:border-gray-700 flex justify-between items-center shrink-0">
              <span className="text-sm font-semibold text-gray-600 dark:text-gray-400">{tempSelectedProds.length} products selected</span>
              <div className="flex gap-3">
                <button type="button" onClick={() => setShowAddProductsModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg">Cancel</button>
                <button 
                  onClick={handleAddProductsToBrand}
                  disabled={tempSelectedProds.length === 0 || loading}
                  className="px-6 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold shadow-sm"
                >
                  {loading ? 'Adding...' : 'Add Selected'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppListings;
