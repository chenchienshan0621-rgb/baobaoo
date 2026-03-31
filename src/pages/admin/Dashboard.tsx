import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth, UserProfile, Role } from '../../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Users, Shield, User, Baby, Loader2, Check, X } from 'lucide-react';

export function AdminDashboard() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      const usersData = snapshot.docs.map(doc => doc.data() as UserProfile);
      setUsers(usersData);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
      setErrorMsg('載入使用者失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, newRole: Role) => {
    if (!newRole) return;
    setUpdatingId(userId);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(prev => prev.map(u => u.uid === userId ? { ...u, role: newRole } : u));
      setSuccessMsg('角色更新成功');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${userId}`);
      setErrorMsg('更新角色失敗');
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-stone-500 font-medium">正在載入資料...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex items-center space-x-3 border-b border-stone-200 pb-6">
        <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center shadow-sm">
          <Shield className="w-6 h-6 text-stone-600" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-stone-800">帳號管理</h1>
          <p className="text-stone-500 mt-1">管理系統中的所有使用者帳號與權限</p>
        </div>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex justify-between items-center">
          <span className="text-sm">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-green-50 border border-green-100 text-green-600 p-4 rounded-2xl flex justify-between items-center">
          <span className="text-sm">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="p-1 hover:bg-green-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      <div className="bg-white rounded-3xl shadow-sm border border-stone-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-stone-50 border-b border-stone-200">
                <th className="px-6 py-4 text-sm font-bold text-stone-600">使用者名稱</th>
                <th className="px-6 py-4 text-sm font-bold text-stone-600">Email</th>
                <th className="px-6 py-4 text-sm font-bold text-stone-600">目前角色</th>
                <th className="px-6 py-4 text-sm font-bold text-stone-600">變更角色</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-stone-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center">
                        <User className="w-4 h-4 text-stone-500" />
                      </div>
                      <span className="font-medium text-stone-800">{u.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-stone-600">{u.email}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                      u.role === 'admin' ? 'bg-purple-100 text-purple-700' :
                      u.role === 'nanny' ? 'bg-rose-100 text-rose-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {u.role === 'admin' ? '網站管理者' : u.role === 'nanny' ? '保母' : '家長'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <select
                        value={u.role || ''}
                        onChange={(e) => handleRoleChange(u.uid, e.target.value as Role)}
                        disabled={updatingId === u.uid || u.uid === profile?.uid}
                        className="bg-stone-50 border border-stone-200 text-stone-700 text-sm rounded-lg focus:ring-rose-500 focus:border-rose-500 block w-full p-2.5 disabled:opacity-50"
                      >
                        <option value="parent">家長</option>
                        <option value="nanny">保母</option>
                        <option value="admin">網站管理者</option>
                      </select>
                      {updatingId === u.uid && <Loader2 className="w-4 h-4 animate-spin text-stone-400" />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
