import React, { useState, useMemo } from 'react';
import { SystemNotification, User } from '../types';
import { Bell, User as UserIcon, Check, CheckCheck, Filter, AlertTriangle, CheckCircle, Info, XCircle } from 'lucide-react';

interface AlertsModuleProps {
  notifications: SystemNotification[];
  setNotifications: React.Dispatch<React.SetStateAction<SystemNotification[]>>;
  users: User[];
  currentUser: User;
}

export const AlertsModule: React.FC<AlertsModuleProps> = ({ notifications, setNotifications, users, currentUser }) => {
  const [selectedUser, setSelectedUser] = useState<string>('all');
  
  // FIX: Removed unused 'isAdmin' variable that was causing an error by referencing a non-existent property 'accessLevel'.

  const filteredNotifications = useMemo(() => {
    let items = notifications;
    // FIX: Removed filtering by userId as it no longer exists on SystemNotification
    return items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [notifications]);

  const toggleRead = (id: string) => {
    setNotifications(prev => 
      prev.map(n => n.id === id ? { ...n, read: !n.read } : n)
    );
  };
  
  const markAllAsRead = () => {
      // FIX: Simplified logic to mark all notifications as read since they are no longer user-specific.
      setNotifications(prev =>
          prev.map(n => ({ ...n, read: true }))
      );
  };

  const getIcon = (type: SystemNotification['type']) => {
    switch (type) {
      case 'Success': return <CheckCircle size={24} className="text-green-500" />;
      case 'Warning': return <AlertTriangle size={24} className="text-orange-500" />;
      case 'Error': return <XCircle size={24} className="text-red-500" />;
      case 'Info':
      default: return <Info size={24} className="text-blue-500" />;
    }
  };
  
  // FIX: This function is no longer needed as userId is removed from notifications.
  

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Central de Alertas</h2>
        {/* FIX: User filter is removed as notifications are no longer user-specific. */}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-100">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex justify-end">
            <button 
                onClick={markAllAsRead}
                className="text-sm font-medium text-mcsystem-500 hover:text-mcsystem-400 flex items-center"
            >
                <CheckCheck size={16} className="mr-1.5" /> Marcar todos como lidos
            </button>
        </div>
        
        <div className="divide-y divide-gray-100">
          {filteredNotifications.length > 0 ? filteredNotifications.map(notification => (
            <div key={notification.id} className={`flex items-start p-6 transition-colors ${!notification.read ? 'bg-blue-50/50' : 'bg-white hover:bg-gray-50'}`}>
              <div className="mr-4 flex-shrink-0">
                {getIcon(notification.type)}
              </div>
              <div className="flex-1">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-gray-800">{notification.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{notification.message}</p>
                  </div>
                  <button 
                    onClick={() => toggleRead(notification.id)} 
                    className="p-2 rounded-full hover:bg-gray-200 text-gray-400 hover:text-mcsystem-500 transition-colors"
                    title={notification.read ? "Marcar como não lido" : "Marcar como lido"}
                  >
                    {notification.read ? <Check size={16} /> : <CheckCheck size={16} />}
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-3 flex items-center">
                  {/* FIX: Removed user display as userId is no longer available */}
                  <span>{new Date(notification.createdAt).toLocaleString('pt-BR')}</span>
                </div>
              </div>
            </div>
          )) : (
            <div className="text-center p-12 text-gray-400">
                <Bell size={48} className="mx-auto mb-4 opacity-20" />
                <p>Nenhum alerta encontrado.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};