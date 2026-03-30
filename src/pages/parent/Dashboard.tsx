import React, { useEffect, useState } from 'react';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Image as ImageIcon, Download, Heart, MapPin, Clock, Filter, Calendar, Baby } from 'lucide-react';

interface Log {
  id: string;
  photoBase64: string;
  description: string;
  toddlerIds: string[];
  parentEmails: string[];
  nannyId: string;
  createdAt: string;
  photoTime?: string;
  photoLocation?: { lat: number; lng: number; address?: string };
}

interface Toddler {
  id: string;
  name: string;
}

export function ParentDashboard() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [toddlers, setToddlers] = useState<Toddler[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter states
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedToddlerId, setSelectedToddlerId] = useState('');

  useEffect(() => {
    if (!user || !user.email) return;

    // Fetch toddlers for the filter dropdown
    const fetchToddlers = async () => {
      try {
        const q1 = query(collection(db, 'toddlers'), where('parentEmail', '==', user.email));
        const q2 = query(collection(db, 'toddlers'), where('parentEmails', 'array-contains', user.email));
        
        const [snapshot1, snapshot2] = await Promise.all([getDocs(q1), getDocs(q2)]);
        
        const toddlersMap = new Map();
        snapshot1.docs.forEach(doc => toddlersMap.set(doc.id, { id: doc.id, name: doc.data().name }));
        snapshot2.docs.forEach(doc => toddlersMap.set(doc.id, { id: doc.id, name: doc.data().name }));
        
        setToddlers(Array.from(toddlersMap.values()) as Toddler[]);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'toddlers');
      }
    };
    fetchToddlers();

    // 核心過濾邏輯：只查詢 parentEmails 陣列中包含當前登入家長 Email 的日誌
    // 這部分同時受到 Firestore Security Rules 的保護，確保資料安全
    const q = query(
      collection(db, 'logs'),
      where('parentEmails', 'array-contains', user.email),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Log[];
      setLogs(logsData);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
      setLoading(false);
    });

    return unsubscribe;
  }, [user]);

  const handleDownload = (base64: string, date: string) => {
    const a = document.createElement('a');
    a.href = base64;
    a.download = `baby-log-${format(new Date(date), 'yyyyMMdd-HHmmss')}.jpg`;
    a.click();
  };

  const filteredLogs = logs.filter(log => {
    let match = true;
    if (selectedToddlerId) {
      match = match && log.toddlerIds.includes(selectedToddlerId);
    }
    if (startDate) {
      match = match && new Date(log.createdAt) >= new Date(startDate);
    }
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match = match && new Date(log.createdAt) <= end;
    }
    return match;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-stone-500 font-medium">正在載入寶貝的珍貴回憶...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex items-center space-x-3 border-b border-rose-100 pb-6">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center shadow-sm">
          <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-stone-800">寶貝成長相簿</h1>
          <p className="text-stone-500 mt-1">紀錄每一天的可愛瞬間</p>
        </div>
      </div>

      {/* 篩選區塊 */}
      <div className="bg-white p-6 rounded-3xl shadow-sm border border-rose-100">
        <div className="flex items-center space-x-2 mb-4 text-stone-800 font-bold">
          <Filter className="w-5 h-5 text-rose-500" />
          <span>篩選日誌</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1 flex items-center space-x-1">
              <Calendar className="w-4 h-4" />
              <span>開始日期</span>
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-rose-200 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1 flex items-center space-x-1">
              <Calendar className="w-4 h-4" />
              <span>結束日期</span>
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-rose-200 outline-none transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-600 mb-1 flex items-center space-x-1">
              <Baby className="w-4 h-4" />
              <span>選擇寶貝</span>
            </label>
            <select
              value={selectedToddlerId}
              onChange={(e) => setSelectedToddlerId(e.target.value)}
              className="w-full px-4 py-2 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-rose-200 outline-none transition-all"
            >
              <option value="">全部寶貝</option>
              {toddlers.map(t => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {filteredLogs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-rose-100">
          <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-12 h-12 text-rose-300" />
          </div>
          <h3 className="text-xl font-bold text-stone-700 mb-2">目前還沒有照片喔！</h3>
          <p className="text-stone-500">保母上傳寶貝的日誌後，就會在這裡顯示囉。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredLogs.map(log => (
            <div key={log.id} className="bg-white rounded-3xl shadow-sm border border-rose-100 overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group transform hover:-translate-y-1">
              {/* 照片區域 */}
              <div className="aspect-square relative bg-stone-50 overflow-hidden">
                <img 
                  src={log.photoBase64} 
                  alt="Baby Log" 
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  referrerPolicy="no-referrer"
                />
                
                {/* EXIF Info Overlay */}
                {(log.photoTime || log.photoLocation) && (
                  <div className="absolute bottom-3 left-3 right-3 flex flex-col gap-1.5 pointer-events-none z-20">
                    {log.photoTime && (
                      <div className="self-start bg-black/60 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(log.photoTime).toLocaleString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    {log.photoLocation && (
                      <div className="self-start bg-black/60 backdrop-blur-sm text-white text-[10px] px-2.5 py-1 rounded-full flex items-center space-x-1">
                        <MapPin className="w-3 h-3" />
                        <span>{log.photoLocation.address || `${log.photoLocation.lat.toFixed(4)}, ${log.photoLocation.lng.toFixed(4)}`}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* 內容與按鈕區域 */}
              <div className="p-6 flex flex-col flex-1 bg-white">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-3">
                    <span className="bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1 rounded-full">
                      {format(new Date(log.createdAt), 'yyyy/MM/dd')}
                    </span>
                    <span className="text-stone-400 text-sm font-medium">
                      {format(new Date(log.createdAt), 'HH:mm')}
                    </span>
                  </div>
                  <p className="text-stone-700 text-base leading-relaxed mb-6">
                    {log.description}
                  </p>
                </div>
                
                {/* 顯眼的下載按鈕 */}
                <button
                  onClick={() => handleDownload(log.photoBase64, log.createdAt)}
                  className="w-full mt-auto flex items-center justify-center space-x-2 bg-rose-50 text-rose-600 hover:bg-rose-500 hover:text-white py-3.5 rounded-2xl font-bold transition-colors duration-200 shadow-sm"
                >
                  <Download className="w-5 h-5" />
                  <span>下載珍藏照片</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

