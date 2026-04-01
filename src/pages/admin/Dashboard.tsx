import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth, UserProfile, Role } from '../../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Users, Shield, User, Baby, Loader2, Check, X, Settings, Plus, Mail, Home } from 'lucide-react';

interface ExtendedUserProfile extends UserProfile {
  isPreRegistered?: boolean;
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { profile, setRole } = useAuth();
  const [users, setUsers] = useState<ExtendedUserProfile[]>([]);
  const [toddlers, setToddlers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [editingUser, setEditingUser] = useState<ExtendedUserProfile | null>(null);
  const [editRole, setEditRole] = useState<Role>(null);
  const [editLinkedToddlers, setEditLinkedToddlers] = useState<string[]>([]);
  
  // Add User Modal states
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('parent');
  const [newUserLinkedToddlers, setNewUserLinkedToddlers] = useState<string[]>([]);
  const [deletingEmail, setDeletingEmail] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [usersSnapshot, toddlersSnapshot, preRegSnapshot] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'toddlers')),
        getDocs(collection(db, 'pre_registered_users'))
      ]);
      
      const usersData = usersSnapshot.docs.map(doc => doc.data() as ExtendedUserProfile);
      const preRegData = preRegSnapshot.docs.map(doc => ({
        uid: doc.id, // Use email as uid for pre-registered users in the UI
        email: doc.id,
        name: doc.data().name || '尚未登入',
        role: doc.data().role,
        linkedToddlerIds: doc.data().linkedToddlerIds || [],
        isPreRegistered: true
      } as ExtendedUserProfile));

      // Filter out pre-registered users who have already logged in (just in case)
      const activeEmails = new Set(usersData.map(u => u.email));
      const filteredPreReg = preRegData.filter(u => !activeEmails.has(u.email));

      setUsers([...usersData, ...filteredPreReg]);

      const toddlersData = toddlersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setToddlers(toddlersData);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users/toddlers');
      setErrorMsg('載入資料失敗');
    } finally {
      setLoading(false);
    }
  };

  const openEditModal = (user: ExtendedUserProfile) => {
    setEditingUser(user);
    setEditRole(user.role);
    setEditLinkedToddlers(user.linkedToddlerIds || []);
  };

  const handleSaveUser = async () => {
    if (!editingUser || !editRole) return;
    setUpdatingId(editingUser.uid);
    setErrorMsg(null);
    try {
      const updates: any = { role: editRole };
      if (editRole === 'parent') {
        updates.linkedToddlerIds = editLinkedToddlers;
      } else {
        updates.linkedToddlerIds = [];
      }
      
      if (editingUser.isPreRegistered) {
        await updateDoc(doc(db, 'pre_registered_users', editingUser.email), updates);
      } else {
        await updateDoc(doc(db, 'users', editingUser.uid), updates);
      }
      
      setUsers(prev => prev.map(u => u.uid === editingUser.uid ? { ...u, ...updates } : u));
      setSuccessMsg('帳號設定已儲存');
      
      if (editingUser.uid === profile?.uid) {
        setTimeout(() => {
          navigate('/');
        }, 1500);
      } else {
        setTimeout(() => {
          setSuccessMsg(null);
        }, 3000);
      }
      setEditingUser(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${editingUser.uid}`);
      setErrorMsg('儲存設定失敗');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleAddUser = async () => {
    if (!newUserEmail || !newUserName) {
      setErrorMsg('請填寫姓名與 Email');
      return;
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      setErrorMsg('請輸入有效的 Email 格式');
      return;
    }

    setUpdatingId('new');
    setErrorMsg(null);
    try {
      const newUserData = {
        name: newUserName,
        role: newUserRole,
        linkedToddlerIds: newUserRole === 'parent' ? newUserLinkedToddlers : []
      };
      
      await setDoc(doc(db, 'pre_registered_users', newUserEmail), newUserData);
      
      setSuccessMsg('已成功新增邀請帳號！當該使用者使用此 Email 登入時，將自動套用此權限。');
      setIsAddingUser(false);
      setNewUserName('');
      setNewUserEmail('');
      setNewUserRole('parent');
      setNewUserLinkedToddlers([]);
      fetchData(); // Refresh list
      
      setTimeout(() => {
        setSuccessMsg(null);
      }, 5000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `pre_registered_users/${newUserEmail}`);
      setErrorMsg('新增帳號失敗，請確定您有足夠的權限');
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeletePreReg = (email: string) => {
    setDeletingEmail(email);
  };

  const executeDeletePreReg = async () => {
    if (!deletingEmail) return;
    
    try {
      await deleteDoc(doc(db, 'pre_registered_users', deletingEmail));
      setUsers(prev => prev.filter(u => u.email !== deletingEmail || !u.isPreRegistered));
      setSuccessMsg('已刪除邀請紀錄');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `pre_registered_users/${deletingEmail}`);
      setErrorMsg('刪除失敗');
    } finally {
      setDeletingEmail(null);
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
      <div className="flex items-center justify-between border-b border-stone-200 pb-6">
        <div className="flex items-center space-x-3">
          <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center shadow-sm">
            <Shield className="w-6 h-6 text-stone-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-stone-800">帳號管理</h1>
            <p className="text-stone-500 mt-1">管理系統中的所有使用者帳號與權限</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={async () => {
              if (profile?.email === 'chen.chienshan0621@gmail.com' && setRole) {
                await setRole('nanny');
                navigate('/nanny/dashboard');
              } else {
                navigate('/');
              }
            }}
            className="flex items-center space-x-2 px-4 py-2 bg-stone-100 text-stone-600 rounded-xl hover:bg-stone-200 transition-colors shadow-sm"
          >
            <Home className="w-5 h-5" />
            <span className="font-medium">返回首頁</span>
          </button>
          <button
            onClick={() => setIsAddingUser(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-rose-500 text-white rounded-xl hover:bg-rose-600 transition-colors shadow-sm"
          >
            <Plus className="w-5 h-5" />
            <span className="font-medium">新增帳號</span>
          </button>
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
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-stone-800">{u.name}</span>
                        {u.isPreRegistered && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[10px] rounded-full font-medium border border-amber-200">
                            尚未登入
                          </span>
                        )}
                      </div>
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
                      <button
                        onClick={() => openEditModal(u)}
                        className="flex items-center space-x-2 px-3 py-1.5 bg-stone-100 text-stone-600 rounded-lg hover:bg-stone-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Settings className="w-4 h-4" />
                        <span className="text-sm font-medium">設定</span>
                      </button>
                      {u.isPreRegistered && (
                        <button
                          onClick={() => handleDeletePreReg(u.email)}
                          className="flex items-center space-x-2 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                        >
                          <X className="w-4 h-4" />
                          <span className="text-sm font-medium">刪除邀請</span>
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-stone-800">帳號設定 - {editingUser.name}</h2>
              <button onClick={() => setEditingUser(null)} className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-2">身分角色</label>
                <select
                  value={editRole || ''}
                  onChange={(e) => setEditRole(e.target.value as Role)}
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                >
                  <option value="parent">家長</option>
                  <option value="nanny">保母</option>
                  <option value="admin">網站管理者</option>
                </select>
              </div>

              {editRole === 'parent' && (
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-2">連結寶貝 (僅家長適用)</label>
                  <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-xl p-2 space-y-1 bg-stone-50">
                    {toddlers.map(t => (
                      <label key={t.id} className="flex items-center space-x-3 p-3 hover:bg-white rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={editLinkedToddlers.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setEditLinkedToddlers([...editLinkedToddlers, t.id]);
                            } else {
                              setEditLinkedToddlers(editLinkedToddlers.filter(id => id !== t.id));
                            }
                          }}
                          className="w-4 h-4 text-rose-500 rounded border-stone-300 focus:ring-rose-500"
                        />
                        <span className="text-stone-700 font-medium">{t.name}</span>
                      </label>
                    ))}
                    {toddlers.length === 0 && (
                      <p className="text-sm text-stone-500 p-4 text-center">目前系統中沒有寶貝資料</p>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 mt-2">勾選後，該家長將能看到這些寶貝的日誌與生活紀錄。</p>
                </div>
              )}
            </div>

            <div className="mt-8 flex space-x-3">
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl font-medium hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSaveUser}
                disabled={updatingId === editingUser.uid}
                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors flex justify-center items-center"
              >
                {updatingId === editingUser.uid ? <Loader2 className="w-5 h-5 animate-spin" /> : '儲存設定並返回'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add User Modal */}
      {isAddingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-stone-800">新增邀請帳號</h2>
              <button onClick={() => setIsAddingUser(false)} className="p-2 text-stone-400 hover:text-stone-600 rounded-full hover:bg-stone-100">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-2">使用者名稱</label>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="例如：王小明"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm font-bold text-stone-700 mb-2">Email (Google 帳號)</label>
                <input
                  type="email"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  placeholder="例如：example@gmail.com"
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                />
                <p className="text-xs text-stone-500 mt-1">請輸入使用者未來將用來登入的 Google Email。</p>
              </div>

              <div>
                <label className="block text-sm font-bold text-stone-700 mb-2">身分角色</label>
                <select
                  value={newUserRole || ''}
                  onChange={(e) => setNewUserRole(e.target.value as Role)}
                  className="w-full bg-stone-50 border border-stone-200 text-stone-800 rounded-xl p-3 focus:ring-2 focus:ring-rose-500 focus:border-rose-500 outline-none"
                >
                  <option value="parent">家長</option>
                  <option value="nanny">保母</option>
                  <option value="admin">網站管理者</option>
                </select>
              </div>

              {newUserRole === 'parent' && (
                <div>
                  <label className="block text-sm font-bold text-stone-700 mb-2">連結寶貝 (僅家長適用)</label>
                  <div className="max-h-48 overflow-y-auto border border-stone-200 rounded-xl p-2 space-y-1 bg-stone-50">
                    {toddlers.map(t => (
                      <label key={t.id} className="flex items-center space-x-3 p-3 hover:bg-white rounded-lg cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={newUserLinkedToddlers.includes(t.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setNewUserLinkedToddlers([...newUserLinkedToddlers, t.id]);
                            } else {
                              setNewUserLinkedToddlers(newUserLinkedToddlers.filter(id => id !== t.id));
                            }
                          }}
                          className="w-4 h-4 text-rose-500 rounded border-stone-300 focus:ring-rose-500"
                        />
                        <span className="text-stone-700 font-medium">{t.name}</span>
                      </label>
                    ))}
                    {toddlers.length === 0 && (
                      <p className="text-sm text-stone-500 p-4 text-center">目前系統中沒有寶貝資料</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="mt-8 flex space-x-3">
              <button
                onClick={() => setIsAddingUser(false)}
                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl font-medium hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAddUser}
                disabled={updatingId === 'new'}
                className="flex-1 px-4 py-3 bg-rose-500 text-white rounded-xl font-medium hover:bg-rose-600 transition-colors flex justify-center items-center"
              >
                {updatingId === 'new' ? <Loader2 className="w-5 h-5 animate-spin" /> : '確認新增'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Delete Confirmation Modal */}
      {deletingEmail && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-xl text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-stone-800 mb-2">確定要刪除邀請嗎？</h2>
            <p className="text-stone-500 mb-6">
              即將刪除 <span className="font-medium text-stone-700">{deletingEmail}</span> 的邀請紀錄，此動作無法復原。
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setDeletingEmail(null)}
                className="flex-1 px-4 py-3 bg-stone-100 text-stone-700 rounded-xl font-medium hover:bg-stone-200 transition-colors"
              >
                取消
              </button>
              <button
                onClick={executeDeletePreReg}
                className="flex-1 px-4 py-3 bg-red-500 text-white rounded-xl font-medium hover:bg-red-600 transition-colors"
              >
                確定刪除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
