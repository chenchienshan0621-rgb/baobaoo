import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Plus, Trash2, UserCircle, Upload as UploadIcon, X, Sparkles, Loader2, Image as ImageIcon, ChevronDown, ChevronUp } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { GoogleGenAI } from '@google/genai';
import { format } from 'date-fns';

export interface Toddler {
  id: string;
  name: string;
  characteristics: string;
  parentEmail?: string;
  parentEmails?: string[];
  nannyId: string;
  createdAt: string;
  photoBase64?: string;
}

interface Log {
  id: string;
  photoBase64: string;
  description: string;
  toddlerIds: string[];
  createdAt: string;
}

export function NannyToddlers() {
  const { user } = useAuth();
  const [toddlers, setToddlers] = useState<Toddler[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [expandedToddlerId, setExpandedToddlerId] = useState<string | null>(null);
  const [selectedLog, setSelectedLog] = useState<Log | null>(null);
  
  const [photoBase64, setPhotoBase64] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, reset, setValue, watch, formState: { isSubmitting } } = useForm<{
    name: string;
    characteristics: string;
    parentEmail1: string;
    parentEmail2: string;
    parentEmail3: string;
  }>();

  const characteristicsValue = watch('characteristics');

  useEffect(() => {
    if (!user) return;

    const qToddlers = query(
      collection(db, 'toddlers'),
      where('nannyId', '==', user.uid)
    );

    const unsubscribeToddlers = onSnapshot(qToddlers, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Toddler[];
      setToddlers(data);
      setLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'toddlers');
      setLoading(false);
    });

    const qLogs = query(
      collection(db, 'logs'),
      where('nannyId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Log[];
      setLogs(data);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'logs');
    });

    return () => {
      unsubscribeToddlers();
      unsubscribeLogs();
    };
  }, [user]);

  const resizeAndCompressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400; // Smaller size for profile pics
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
        img.onerror = (error) => reject(error);
      };
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      try {
        const base64 = await resizeAndCompressImage(selectedFile);
        setPhotoBase64(base64);
        setErrorMsg(null);
      } catch (error) {
        console.error('Error processing image:', error);
        setErrorMsg('圖片處理失敗，請重試。');
      }
    }
  };

  const analyzeCharacteristics = async () => {
    if (!photoBase64) return;
    
    setIsAnalyzing(true);
    setErrorMsg(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const prompt = `請分析這張幼兒的照片，用簡短的文字（約 20-30 字）描述這位幼兒的外貌特徵，例如：髮型、臉型、是否戴眼鏡、常穿的衣服顏色或款式等。這將用於後續的 AI 臉部辨識，請盡量描述具體的視覺特徵。`;
      const base64Data = photoBase64.split(',')[1];

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
            { text: prompt }
          ]
        }
      });

      if (response.text) {
        setValue('characteristics', response.text.trim());
      }
    } catch (error) {
      console.error('AI Analysis failed:', error);
      setErrorMsg('AI 分析失敗，請手動輸入特徵。');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onSubmit = async (data: any) => {
    if (!user) return;
    try {
      const parentEmails = [data.parentEmail1, data.parentEmail2, data.parentEmail3]
        .map(email => email?.trim())
        .filter(email => email);

      const toddlerData: any = {
        name: data.name,
        characteristics: data.characteristics,
        parentEmails: parentEmails,
        nannyId: user.uid,
        createdAt: new Date().toISOString()
      };
      
      if (photoBase64) {
        toddlerData.photoBase64 = photoBase64;
      }

      await addDoc(collection(db, 'toddlers'), toddlerData);
      reset();
      setPhotoBase64(null);
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'toddlers');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'toddlers', id));
      setDeletingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `toddlers/${id}`);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedToddlerId(expandedToddlerId === id ? null : id);
  };

  if (loading) return <div className="flex justify-center py-12 text-stone-500">載入中...</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-20 sm:pb-0">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-stone-800">幼兒管理</h1>
        <button
          onClick={() => {
            setIsAdding(!isAdding);
            if (!isAdding) {
              reset();
              setPhotoBase64(null);
              setErrorMsg(null);
            }
          }}
          className="flex items-center space-x-2 bg-amber-500 text-white px-4 py-2 rounded-xl hover:bg-amber-600 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          <span>新增幼兒</span>
        </button>
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <span className="text-sm">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {isAdding && (
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white p-6 rounded-2xl shadow-sm border border-stone-100 space-y-6 animate-in fade-in slide-in-from-top-4">
          
          {/* Photo Upload Area */}
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-2">幼兒照片 (選填，可幫助 AI 辨識)</label>
            {!photoBase64 ? (
              <div 
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-stone-200 rounded-2xl p-8 text-center cursor-pointer hover:border-amber-300 hover:bg-amber-50 transition-all"
              >
                <UploadIcon className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                <p className="text-sm text-stone-500">點擊上傳幼兒照片</p>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept="image/*" 
                  className="hidden" 
                />
              </div>
            ) : (
              <div className="relative inline-block">
                <img src={photoBase64} alt="Preview" className="w-32 h-32 object-cover rounded-2xl border border-stone-200 shadow-sm" />
                <button
                  type="button"
                  onClick={() => setPhotoBase64(null)}
                  className="absolute -top-2 -right-2 bg-white rounded-full p-1 shadow-md border border-stone-200 text-stone-500 hover:text-red-500 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">姓名</label>
            <input
              {...register('name', { required: true })}
              className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
              placeholder="例如：小明"
            />
          </div>

          <div>
            <div className="flex justify-between items-end mb-1">
              <label className="block text-sm font-medium text-stone-700">外貌特徵 (供 AI 辨識用)</label>
              {photoBase64 && (
                <button
                  type="button"
                  onClick={analyzeCharacteristics}
                  disabled={isAnalyzing}
                  className="flex items-center space-x-1 text-xs bg-amber-100 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-200 transition-colors disabled:opacity-50"
                >
                  {isAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                  <span>AI 自動辨識特徵</span>
                </button>
              )}
            </div>
            <textarea
              {...register('characteristics', { required: true })}
              rows={3}
              className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all resize-none"
              placeholder="例如：戴藍色粗框眼鏡、短髮男孩。若有上傳照片，可點擊右上角按鈕讓 AI 自動填寫。"
            />
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">家長 Email 1 <span className="text-red-500">*</span></label>
              <input
                type="email"
                {...register('parentEmail1', { required: true })}
                className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                placeholder="家長登入用的 Email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">家長 Email 2 (選填)</label>
              <input
                type="email"
                {...register('parentEmail2')}
                className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                placeholder="第二位家長 Email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">家長 Email 3 (選填)</label>
              <input
                type="email"
                {...register('parentEmail3')}
                className="w-full px-4 py-2 border border-stone-200 rounded-xl focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all"
                placeholder="第三位家長 Email"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3 pt-4 border-t border-stone-100">
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                reset();
                setPhotoBase64(null);
              }}
              className="px-4 py-2 text-stone-600 hover:bg-stone-100 rounded-xl transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 font-medium"
            >
              {isSubmitting ? '儲存中...' : '儲存資料'}
            </button>
          </div>
        </form>
      )}

      <div className="grid gap-4">
        {toddlers.map(toddler => {
          const toddlerLogs = logs.filter(log => log.toddlerIds.includes(toddler.id));
          const isExpanded = expandedToddlerId === toddler.id;

          return (
            <div key={toddler.id} className="bg-white rounded-2xl shadow-sm border border-stone-100 overflow-hidden group">
              <div className="p-6 flex items-start justify-between">
                <div className="flex items-start space-x-4">
                  {toddler.photoBase64 ? (
                    <img 
                      src={toddler.photoBase64} 
                      alt={toddler.name} 
                      className="w-14 h-14 rounded-full object-cover border-2 border-amber-100 flex-shrink-0"
                    />
                  ) : (
                    <div className="w-14 h-14 bg-amber-50 text-amber-500 rounded-full flex items-center justify-center flex-shrink-0 border-2 border-amber-100">
                      <UserCircle className="w-8 h-8" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-bold text-stone-800">{toddler.name}</h3>
                    <p className="text-sm text-stone-600 mt-1 leading-relaxed"><span className="font-medium text-stone-500">特徵：</span>{toddler.characteristics}</p>
                    <p className="text-sm text-stone-600 mt-1"><span className="font-medium text-stone-500">家長：</span>{(toddler.parentEmails || (toddler.parentEmail ? [toddler.parentEmail] : [])).join(', ')}</p>
                    <button
                      onClick={() => toggleExpand(toddler.id)}
                      className="mt-3 flex items-center space-x-1 text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
                    >
                      <ImageIcon className="w-4 h-4" />
                      <span>已完成 {toddlerLogs.length} 篇日誌</span>
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                {deletingId === toddler.id ? (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setDeletingId(null)}
                      className="px-3 py-1.5 text-sm text-stone-600 bg-stone-100 hover:bg-stone-200 rounded-lg transition-colors"
                    >
                      取消
                    </button>
                    <button
                      onClick={() => handleDelete(toddler.id)}
                      className="px-3 py-1.5 text-sm text-white bg-red-500 hover:bg-red-600 rounded-lg transition-colors"
                    >
                      確定刪除
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(toddler.id)}
                    className="p-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors opacity-0 group-hover:opacity-100 sm:opacity-100"
                    title="刪除幼兒資料"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* 展開顯示該幼兒的日誌 */}
              {isExpanded && (
                <div className="bg-stone-50 border-t border-stone-100 p-6 animate-in slide-in-from-top-2">
                  <h4 className="text-sm font-bold text-stone-700 mb-4 flex items-center space-x-2">
                    <ImageIcon className="w-4 h-4 text-stone-400" />
                    <span>{toddler.name} 的專屬相簿</span>
                  </h4>
                  {toddlerLogs.length === 0 ? (
                    <p className="text-sm text-stone-500 text-center py-4">目前還沒有日誌喔！</p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                      {toddlerLogs.map(log => (
                        <div 
                          key={log.id} 
                          onClick={() => setSelectedLog(log)}
                          className="bg-white rounded-xl overflow-hidden shadow-sm border border-stone-200 group relative cursor-pointer hover:shadow-md transition-shadow"
                        >
                          <div className="aspect-square relative">
                            <img 
                              src={log.photoBase64} 
                              alt="Log" 
                              className="w-full h-full object-cover"
                              referrerPolicy="no-referrer"
                            />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center p-2">
                              <p className="text-white text-xs line-clamp-3 text-center">
                                {log.description}
                              </p>
                            </div>
                          </div>
                          <div className="p-2 bg-white">
                            <p className="text-[10px] text-stone-500 font-medium text-center">
                              {format(new Date(log.createdAt), 'yyyy/MM/dd')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {toddlers.length === 0 && !isAdding && (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm border border-stone-100">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <UserCircle className="w-8 h-8 text-amber-400" />
            </div>
            <p className="text-stone-500 font-medium">尚未新增任何幼兒資料</p>
            <p className="text-sm text-stone-400 mt-1">點擊右上角「新增幼兒」開始建立名單</p>
          </div>
        )}
      </div>

      {/* Full Log Preview Modal */}
      {selectedLog && (
        <div 
          className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center p-4 animate-in fade-in" 
          onClick={() => setSelectedLog(null)}
        >
          <div 
            className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95" 
            onClick={e => e.stopPropagation()}
          >
            <div className="relative bg-stone-50 rounded-t-3xl border-b border-stone-100">
              <img 
                src={selectedLog.photoBase64} 
                alt="Log" 
                className="w-full h-auto max-h-[60vh] object-contain rounded-t-3xl" 
                referrerPolicy="no-referrer"
              />
              <button 
                onClick={() => setSelectedLog(null)} 
                className="absolute top-4 right-4 bg-white/90 p-2 rounded-full text-stone-600 hover:text-stone-900 hover:bg-white transition-all shadow-sm"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 sm:p-8">
              <div className="flex items-center space-x-2 mb-4">
                <span className="bg-amber-100 text-amber-700 text-sm font-bold px-3 py-1 rounded-full">
                  {format(new Date(selectedLog.createdAt), 'yyyy/MM/dd HH:mm')}
                </span>
              </div>
              <p className="text-stone-700 text-base leading-relaxed whitespace-pre-wrap">
                {selectedLog.description}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
