import React, { useState, useEffect } from 'react';
import { toast } from 'react-toastify';
import constants from '../../constants';

interface AppScheme {
  id: number;
  name: string;
  discount_amount: number;
  scheme_type: string;
  condition_code: string;
  condition_qty: number;
  start_date: string;
  end_date: string;
  is_active: number;
  show_as_banner: number;
  banner_text: string;
  sub_group?: string;
}

const SCHEME_TYPE_LABELS: Record<string, string> = {
  first_purchase: 'First Purchase',
  item_quantity: 'Item Quantity',
  overall_bill_amount: 'Overall Bill Amount',
};

const AppSchemes: React.FC = () => {
  const [schemes, setSchemes] = useState<AppScheme[]>([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingScheme, setEditingScheme] = useState<AppScheme | null>(null);
  const [subgroups, setSubgroups] = useState<any[]>([]);

  const emptyForm = {
    name: '',
    discount_amount: '',
    scheme_type: 'first_purchase',
    condition_code: '',
    condition_qty: '',
    start_date: '',
    end_date: '',
    is_active: 1,
    show_as_banner: 1,
    banner_text: '',
    sub_group: '',
  };

  const [formData, setFormData] = useState<typeof emptyForm>(emptyForm);

  const fetchSchemes = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${constants.baseURL}/api/app/admin/schemes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      setSchemes(await res.json());
    } catch {
      toast.error('Error loading schemes');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubgroups = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${constants.baseURL}/slink/subgrp`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setSubgroups(await res.json());
      }
    } catch {
      console.error('Error loading subgroups');
    }
  };

  useEffect(() => { 
    fetchSchemes(); 
    fetchSubgroups();
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (type === 'checkbox') {
      const checked = (e.target as HTMLInputElement).checked;
      setFormData(prev => ({ ...prev, [name]: checked ? 1 : 0 }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const url = editingScheme
        ? `${constants.baseURL}/api/app/admin/schemes/${editingScheme.id}`
        : `${constants.baseURL}/api/app/admin/schemes`;
      const method = editingScheme ? 'PUT' : 'POST';
      const payload = {
        ...formData,
        discount_amount: parseFloat(formData.discount_amount) || 0,
        condition_qty: parseInt(formData.condition_qty, 10) || 0,
      };
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(editingScheme ? 'Scheme updated' : 'Scheme created');
      setShowModal(false);
      fetchSchemes();
    } catch {
      toast.error('Error saving scheme');
    }
  };

  const openNew = () => {
    setEditingScheme(null);
    setFormData(emptyForm);
    setShowModal(true);
  };

  const openEdit = (s: AppScheme) => {
    setEditingScheme(s);
    setFormData({
      name: s.name || '',
      discount_amount: s.discount_amount?.toString() || '',
      scheme_type: s.scheme_type || 'first_purchase',
      condition_code: s.condition_code || '',
      condition_qty: s.condition_qty?.toString() || '',
      start_date: s.start_date || '',
      end_date: s.end_date || '',
      is_active: s.is_active,
      show_as_banner: s.show_as_banner,
      banner_text: s.banner_text || '',
      sub_group: s.sub_group || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this scheme?')) return;
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${constants.baseURL}/api/app/admin/schemes/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed');
      toast.success('Scheme deleted');
      fetchSchemes();
    } catch {
      toast.error('Error deleting scheme');
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">App Custom Schemes</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Manage discount schemes and app banners</p>
        </div>
        <button
          onClick={openNew}
          className="bg-brand-500 hover:bg-brand-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors shadow-sm"
        >
          + Create Scheme
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-900/50">
              <tr>
                {['Name', 'Type', 'Discount', 'Sub Group', 'Banner', 'Active', 'Actions'].map(h => (
                  <th key={h} className={`px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider ${h === 'Actions' ? 'text-right' : 'text-left'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {loading ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">Loading...</td></tr>
              ) : schemes.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-500">No schemes found. Create one to get started.</td></tr>
              ) : (
                schemes.map(scheme => (
                  <tr key={scheme.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{scheme.name}</div>
                      {scheme.show_as_banner === 1 && (
                        <div className="text-xs text-gray-500 max-w-xs truncate" title={scheme.banner_text}>
                          {scheme.banner_text}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {SCHEME_TYPE_LABELS[scheme.scheme_type] || scheme.scheme_type}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-green-600 dark:text-green-400">Rs {scheme.discount_amount}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {scheme.sub_group ? (subgroups.find(sg => sg.subgroupCode === scheme.sub_group)?.title || scheme.sub_group) : 'All'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${scheme.show_as_banner === 1 ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>
                        {scheme.show_as_banner === 1 ? 'Yes' : 'No'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 inline-flex text-xs leading-5 font-semibold rounded-full ${scheme.is_active === 1 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {scheme.is_active === 1 ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-3">
                      <button onClick={() => openEdit(scheme)} className="text-brand-600 hover:text-brand-900 font-semibold">Edit</button>
                      <button onClick={() => handleDelete(scheme.id)} className="text-red-600 hover:text-red-900 font-semibold">Delete</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/60" onClick={() => setShowModal(false)} />
          <div className="relative w-full max-w-2xl bg-white dark:bg-gray-800 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden" onClick={e => e.stopPropagation()}>
            <form onSubmit={handleSubmit}>
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">
                  {editingScheme ? 'Edit Scheme' : 'Create New Scheme'}
                </h3>
                <button type="button" onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="px-6 py-5 max-h-[70vh] overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scheme Name</label>
                    <input
                      type="text" name="name" required
                      value={formData.name} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                      placeholder="e.g., 50 off on first purchase"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Scheme Type</label>
                    <select
                      name="scheme_type"
                      value={formData.scheme_type} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    >
                      <option value="first_purchase" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">First Purchase</option>
                      <option value="item_quantity" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Item Quantity (e.g. 10 cases of Rin)</option>
                      <option value="overall_bill_amount" className="bg-white dark:bg-gray-800 text-gray-900 dark:text-white">Overall Bill Amount</option>
                    </select>

                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Sub Group (Optional)</label>
                    <select
                      name="sub_group"
                      value={formData.sub_group} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    >
                      <option value="">All Sub Groups</option>
                      {subgroups.map(sg => (
                        <option key={sg.subgroupCode} value={sg.subgroupCode}>{sg.title}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Discount Amount (Rs)</label>
                    <input
                      type="number" name="discount_amount" required min="0"
                      value={formData.discount_amount} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                      placeholder="50"
                    />
                  </div>

                  {formData.scheme_type === 'item_quantity' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Item Code</label>
                        <input
                          type="text" name="condition_code"
                          value={formData.condition_code} onChange={handleInputChange}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                          placeholder="e.g. H3123"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Required Qty (boxes)</label>
                        <input
                          type="number" name="condition_qty" min="0"
                          value={formData.condition_qty} onChange={handleInputChange}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                          placeholder="10"
                        />
                      </div>
                    </>
                  )}

                  {formData.scheme_type === 'overall_bill_amount' && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Minimum Bill Amount (Rs)</label>
                      <input
                        type="number" name="condition_qty" min="0"
                        value={formData.condition_qty} onChange={handleInputChange}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        placeholder="1000"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date / Time</label>
                    <input
                      type="datetime-local" name="start_date"
                      value={formData.start_date} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">End Date / Time</label>
                    <input
                      type="datetime-local" name="end_date"
                      value={formData.end_date} onChange={handleInputChange}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                    />
                  </div>

                  <div className="col-span-2 pt-2 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox" name="show_as_banner"
                        checked={formData.show_as_banner === 1} onChange={handleInputChange}
                        className="h-4 w-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Show as Banner in App</span>
                    </label>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox" name="is_active"
                        checked={formData.is_active === 1} onChange={handleInputChange}
                        className="h-4 w-4 text-brand-600 rounded border-gray-300 focus:ring-brand-500"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">Scheme is Active</span>
                    </label>
                  </div>

                  {formData.show_as_banner === 1 && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Banner Text</label>
                      <input
                        type="text" name="banner_text" required
                        value={formData.banner_text} onChange={handleInputChange}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                        placeholder="e.g., 50 OFF on orders over 1000rs!"
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* Modal Footer */}
              <div className="flex flex-row-reverse gap-3 px-6 py-4 bg-gray-50 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700">
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold transition-colors shadow-sm"
                >
                  Save Scheme
                </button>
                <button
                  type="button" onClick={() => setShowModal(false)}
                  className="px-5 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-semibold transition-colors"
                >
                  Cancel
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AppSchemes;
