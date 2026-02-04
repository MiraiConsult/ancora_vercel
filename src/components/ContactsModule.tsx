import React, { useState } from 'react';
import { Contact, Company } from '../types';
import { Search, Plus, Pencil, Trash2, Mail, Phone, Building2, X, Save } from 'lucide-react';
import { supabase } from '../lib/supabaseClient';

interface ContactsModuleProps {
  contacts: Contact[];
  setContacts: React.Dispatch<React.SetStateAction<Contact[]>>;
  companies: Company[];
}

export const ContactsModule: React.FC<ContactsModuleProps> = ({ contacts, setContacts, companies }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Contact>>({
    name: '',
    role: '',
    email: '',
    phone: '',
    companyId: ''
  });

  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ name: '', role: '', email: '', phone: '', companyId: '' });
  };

  const handleEditClick = (contact: Contact) => {
    setEditingId(contact.id);
    setFormData(contact);
    setIsModalOpen(true);
  };

  const handleDeleteClick = async (id: string) => {
    if (window.confirm("Excluir contato?")) {
      setContacts(prev => prev.filter(c => c.id !== id));
      await supabase.from('contacts').delete().eq('id', id);
    }
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    const company = companies.find(c => c.id === formData.companyId);
    
    // FIX: Cast object to satisfy the Omit<Contact, 'tenant_id'> type, as the form data is a Partial type.
    const contactToSave: Omit<Contact, 'tenant_id'> = editingId
        ? { ...contacts.find(c => c.id === editingId)!, ...formData } as Contact
        : { id: `ct${Date.now()}`, ...formData } as Omit<Contact, 'tenant_id'>;

    if (editingId) {
        setContacts(prev => prev.map(c => c.id === editingId ? { ...contactToSave, tenant_id: company!.tenant_id } as Contact : c));
    } else {
        setContacts(prev => [...prev, { ...contactToSave, tenant_id: company!.tenant_id } as Contact]);
    }
    
    await supabase.from('contacts').upsert(contactToSave);
    closeModal();
  };

  const getCompanyName = (id: string) => companies.find(c => c.id === id)?.name || 'N/A';

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">Contatos</h2>
            <button onClick={() => { setEditingId(null); setFormData({name: '', role: '', email: '', phone: '', companyId: ''}); setIsModalOpen(true); }} className="bg-mcsystem-500 hover:bg-mcsystem-400 text-white px-4 py-2 rounded-md flex items-center text-sm font-medium transition-colors">
              <Plus size={16} className="mr-2" /> Novo Contato
            </button>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
             <div className="p-4 border-b border-gray-200 bg-gray-50 flex gap-4">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                    <input type="text" placeholder="Buscar contato..." className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-mcsystem-500" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>
            
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-100 text-gray-700 font-medium">
                        <tr>
                            <th className="p-4">Nome</th>
                            <th className="p-4">Empresa</th>
                            <th className="p-4">Cargo</th>
                            <th className="p-4">Contato</th>
                            <th className="p-4 text-center">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredContacts.map(contact => (
                            <tr key={contact.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-gray-800">{contact.name}</td>
                                <td className="p-4 flex items-center">
                                    <Building2 size={14} className="mr-2 text-gray-400"/>
                                    {getCompanyName(contact.companyId)}
                                </td>
                                <td className="p-4">{contact.role}</td>
                                <td className="p-4 space-y-1">
                                    <div className="flex items-center text-xs"><Mail size={12} className="mr-2 text-gray-400"/> {contact.email}</div>
                                    <div className="flex items-center text-xs"><Phone size={12} className="mr-2 text-gray-400"/> {contact.phone}</div>
                                </td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center space-x-2">
                                        <button onClick={() => handleEditClick(contact)} className="p-1.5 text-gray-400 hover:text-blue-500"><Pencil size={16}/></button>
                                        <button onClick={() => handleDeleteClick(contact.id)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={16}/></button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {filteredContacts.length === 0 && <tr><td colSpan={5} className="p-8 text-center text-gray-400">Nenhum contato encontrado.</td></tr>}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Modal */}
        {isModalOpen && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] p-4">
                <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                    <div className="bg-gray-50 px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800">{editingId ? 'Editar Contato' : 'Novo Contato'}</h3>
                        <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                            <X size={20} />
                        </button>
                    </div>
                    <form onSubmit={handleSaveContact} className="p-6 space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Nome Completo</label>
                            <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                            value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Cargo</label>
                                <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                                value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
                                <select className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none bg-white"
                                    value={formData.companyId} onChange={e => setFormData({...formData, companyId: e.target.value})}>
                                    <option value="">Selecione...</option>
                                    {companies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                            <input required type="email" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                            value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                            <input required type="text" className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-1 focus:ring-mcsystem-500 outline-none" 
                            value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                        </div>
                        
                        <div className="flex justify-end space-x-2 pt-2">
                            <button type="button" onClick={closeModal} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancelar</button>
                            <button type="submit" className="px-4 py-2 bg-mcsystem-500 text-white rounded hover:bg-mcsystem-400 flex items-center">
                                <Save size={16} className="mr-2" /> Salvar
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        )}
    </div>
  );
};