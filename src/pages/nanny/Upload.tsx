import React, { useState, useRef, useEffect } from 'react';
import { collection, addDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Upload as UploadIcon, X, Loader2, Sparkles, Check, ImagePlus, Info, Download, MapPin, Clock, Plus, Trash2 } from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { useNavigate, Link } from 'react-router-dom';
import exifr from 'exifr';

interface Toddler {
  id: string;
  name: string;
  characteristics: string;
  parentEmail?: string;
  parentEmails?: string[];
}

interface DailyRecord {
  activityContent: string;
  meals: string;
  snacks: string;
  sleepRecord: string;
  toileting: string;
}

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  base64Image: string;
  photoTime: Date | null;
  photoLocation: {lat: number, lng: number, address?: string} | null;
  description: string;
  selectedToddlerIds: string[];
  dailyRecords: Record<string, DailyRecord>;
  hasAnalyzed: boolean;
  isAnalyzing: boolean;
  errorMsg: string | null;
}

export function NannyUpload() {
  const { user } = useAuth();
  const navigate = useNavigate();
  
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isGlobalAnalyzing, setIsGlobalAnalyzing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const [toddlers, setToddlers] = useState<Toddler[]>([]);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!user) return;
    const fetchToddlers = async () => {
      try {
        const q = query(collection(db, 'toddlers'), where('nannyId', '==', user.uid));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Toddler[];
        setToddlers(data);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'toddlers');
      }
    };
    fetchToddlers();
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
          const MAX_WIDTH = 800;
          const MAX_HEIGHT = 800;
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

  const processFiles = async (files: File[]) => {
    setErrorMsg(null);
    const newItems: UploadItem[] = [];
    
    for (const selectedFile of files) {
      let photoTime = null;
      let photoLocation = null;
      
      try {
        const exifData = await exifr.parse(selectedFile, ['DateTimeOriginal']);
        if (exifData?.DateTimeOriginal) {
          photoTime = new Date(exifData.DateTimeOriginal);
        }
        const gpsData = await exifr.gps(selectedFile);
        if (gpsData) {
          const lat = gpsData.latitude;
          const lng = gpsData.longitude;
          let address = undefined;
          try {
            const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`);
            if (response.ok) {
              const data = await response.json();
              if (data.address) {
                const { city, town, village, suburb, road } = data.address;
                const area = city || town || village || suburb || '';
                address = [area, road].filter(Boolean).join(' ');
              }
            }
          } catch (geoError) {
            console.warn('Reverse geocoding failed:', geoError);
          }
          photoLocation = { lat, lng, address };
        }
      } catch (exifError) {
        console.warn('Could not extract EXIF data:', exifError);
      }

      try {
        const base64 = await resizeAndCompressImage(selectedFile);
        newItems.push({
          id: Math.random().toString(36).substring(7),
          file: selectedFile,
          previewUrl: URL.createObjectURL(selectedFile),
          base64Image: base64,
          photoTime,
          photoLocation,
          description: '',
          selectedToddlerIds: [],
          dailyRecords: {},
          hasAnalyzed: false,
          isAnalyzing: false,
          errorMsg: null
        });
      } catch (error) {
        console.error('Error processing image:', error);
        setErrorMsg('部分圖片處理失敗，請重試。');
      }
    }
    
    setItems(prev => [...prev, ...newItems]);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length > 0) {
      await processFiles(selectedFiles);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files || []);
    const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
    if (imageFiles.length > 0) {
      await processFiles(imageFiles);
    } else {
      setErrorMsg('請上傳圖片檔案 (JPG, PNG 等)');
    }
  };

  const analyzeAll = async () => {
    if (toddlers.length === 0) {
      setErrorMsg('請先到「幼兒管理」新增幼兒資料，AI 才能進行辨識。');
      return;
    }

    const unanalyzedItems = items.filter(item => !item.hasAnalyzed);
    if (unanalyzedItems.length === 0) return;

    setIsGlobalAnalyzing(true);
    setErrorMsg(null);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const toddlerListStr = toddlers.map(t => `ID: ${t.id}, 姓名: ${t.name}, 特徵: ${t.characteristics}`).join('\n');
    
    const prompt = `
      你是一個專業的幼兒保母助手。請分析這張照片：
      1. 根據以下幼兒名單與特徵，判斷照片中出現了哪些幼兒，並回傳他們的 ID 列表。如果無法確定，請回傳空列表。
      2. 使用已辨識出的寶貝名稱與特徵進行說明，寫一段溫馨的日誌描述，說明照片中的幼兒在做什麼。語氣要溫柔、充滿愛。
      3. 敘述字數必須控制在 50 字以內。

      幼兒名單：
      ${toddlerListStr}
    `;

    for (const item of unanalyzedItems) {
      setItems(prev => prev.map(p => p.id === item.id ? { ...p, isAnalyzing: true, errorMsg: null } : p));
      
      try {
        const base64Data = item.base64Image.split(',')[1];
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: {
            parts: [
              { inlineData: { data: base64Data, mimeType: 'image/jpeg' } },
              { text: prompt }
            ]
          },
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                description: { type: Type.STRING, description: "溫馨的照片描述" },
                identifiedToddlerIds: { 
                  type: Type.ARRAY, 
                  items: { type: Type.STRING },
                  description: "照片中辨識出的幼兒 ID 列表"
                }
              },
              required: ["description", "identifiedToddlerIds"]
            }
          }
        });

        const result = JSON.parse(response.text || '{}');
        
        setItems(prev => prev.map(p => {
          if (p.id === item.id) {
            const validIds = result.identifiedToddlerIds 
              ? result.identifiedToddlerIds.filter((id: string) => toddlers.some(t => t.id === id))
              : p.selectedToddlerIds;
              
            const newRecords: Record<string, DailyRecord> = {};
            validIds.forEach((id: string) => {
              if (p.dailyRecords[id]) {
                newRecords[id] = p.dailyRecords[id];
              } else {
                newRecords[id] = {
                  activityContent: '',
                  meals: '',
                  snacks: '',
                  sleepRecord: '',
                  toileting: ''
                };
              }
            });
              
            return {
              ...p,
              description: result.description || p.description,
              selectedToddlerIds: validIds,
              dailyRecords: newRecords,
              hasAnalyzed: true,
              isAnalyzing: false
            };
          }
          return p;
        }));
      } catch (error) {
        console.error('AI Analysis failed for item:', item.id, error);
        setItems(prev => prev.map(p => p.id === item.id ? { ...p, isAnalyzing: false, errorMsg: 'AI 分析失敗，請手動輸入描述。' } : p));
      }
    }

    setIsGlobalAnalyzing(false);
  };

  const updateItem = (id: string, updates: Partial<UploadItem>) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item));
  };

  const toggleToddler = (itemId: string, toddlerId: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        const isSelected = item.selectedToddlerIds.includes(toddlerId);
        const newIds = isSelected
          ? item.selectedToddlerIds.filter(id => id !== toddlerId)
          : [...item.selectedToddlerIds, toddlerId];
        
        const newRecords = { ...item.dailyRecords };
        if (isSelected) {
          delete newRecords[toddlerId];
        } else {
          newRecords[toddlerId] = {
            activityContent: '',
            meals: '',
            snacks: '',
            sleepRecord: '',
            toileting: ''
          };
        }
        
        return { ...item, selectedToddlerIds: newIds, dailyRecords: newRecords };
      }
      return item;
    }));
  };

  const updateDailyRecord = (itemId: string, toddlerId: string, field: keyof DailyRecord, value: string) => {
    setItems(prev => prev.map(item => {
      if (item.id === itemId) {
        return {
          ...item,
          dailyRecords: {
            ...item.dailyRecords,
            [toddlerId]: {
              ...item.dailyRecords[toddlerId],
              [field]: value
            }
          }
        };
      }
      return item;
    }));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveAll = async () => {
    if (!user || items.length === 0) return;

    const invalidItems = items.filter(item => !item.description.trim() || item.selectedToddlerIds.length === 0);
    if (invalidItems.length > 0) {
      setErrorMsg(`有 ${invalidItems.length} 篇日誌尚未填寫描述或選擇寶貝。`);
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const promises = items.map(async (item) => {
        const parentEmails = toddlers
          .filter(t => item.selectedToddlerIds.includes(t.id))
          .flatMap(t => t.parentEmails || (t.parentEmail ? [t.parentEmail] : []))
          .filter(email => email);

        const uniqueParentEmails = Array.from(new Set(parentEmails));

        const logData: any = {
          photoBase64: item.base64Image,
          description: item.description.trim(),
          toddlerIds: item.selectedToddlerIds,
          dailyRecords: item.dailyRecords,
          parentEmails: uniqueParentEmails,
          nannyId: user.uid,
          createdAt: new Date().toISOString()
        };

        if (item.photoTime) {
          logData.photoTime = item.photoTime.toISOString();
        }
        if (item.photoLocation) {
          logData.photoLocation = item.photoLocation;
        }

        return addDoc(collection(db, 'logs'), logData);
      });

      await Promise.all(promises);
      navigate('/nanny/dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'logs');
      setErrorMsg('發布失敗，請稍後再試。');
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-20 sm:pb-0">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-rose-100 rounded-full flex items-center justify-center">
            <ImagePlus className="w-5 h-5 text-rose-500" />
          </div>
          <h1 className="text-2xl font-bold text-stone-800">新增溫馨日誌</h1>
        </div>
        
        {items.length > 0 && (
          <div className="flex items-center space-x-3">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center space-x-1 px-4 py-2 bg-white border border-stone-200 text-stone-700 rounded-xl hover:bg-stone-50 transition-colors text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>繼續新增照片</span>
            </button>
            <button
              onClick={analyzeAll}
              disabled={isGlobalAnalyzing || items.every(i => i.hasAnalyzed) || toddlers.length === 0}
              className="flex items-center space-x-1 px-4 py-2 bg-gradient-to-r from-rose-400 to-pink-400 text-white rounded-xl hover:from-rose-500 hover:to-pink-500 transition-all disabled:opacity-50 text-sm font-medium shadow-sm"
            >
              {isGlobalAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              <span>批次 AI 辨識</span>
            </button>
          </div>
        )}
      </div>

      {errorMsg && (
        <div className="bg-red-50 border border-red-100 text-red-600 p-4 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <span className="text-sm">{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="p-1 hover:bg-red-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <div 
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-3xl p-16 text-center cursor-pointer transition-all duration-200 ${
            isDragging 
              ? 'border-rose-400 bg-rose-50 scale-[1.02]' 
              : 'border-rose-200 bg-white hover:border-rose-300 hover:bg-rose-50/50'
          }`}
        >
          <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <UploadIcon className="w-10 h-10 text-rose-500" />
          </div>
          <p className="text-xl text-stone-700 font-medium mb-2">點擊或拖放照片至此 (支援多選)</p>
          <p className="text-stone-400 text-sm">支援 JPG, PNG 格式，可一次上傳多張照片</p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple
            className="hidden" 
          />
        </div>
      ) : (
        <div className="space-y-6">
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange} 
            accept="image/*" 
            multiple
            className="hidden" 
          />
          
          {items.map((item, index) => (
            <div key={item.id} className="bg-white p-6 rounded-3xl shadow-sm border border-rose-100 flex flex-col md:flex-row gap-6 relative animate-in fade-in slide-in-from-bottom-4">
              <button 
                onClick={() => removeItem(item.id)} 
                className="absolute top-4 right-4 text-stone-300 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-full transition-colors z-10"
                title="移除此照片"
              >
                <Trash2 className="w-5 h-5" />
              </button>

              {/* Left: Image */}
              <div className="w-full md:w-1/3 relative rounded-2xl overflow-hidden bg-stone-50 border border-stone-100 flex-shrink-0">
                <img 
                  src={item.previewUrl} 
                  alt={`Upload ${index + 1}`} 
                  className="w-full h-48 md:h-full object-cover" 
                />
                {(item.photoTime || item.photoLocation) && (
                  <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-1.5 pointer-events-none">
                    {item.photoTime && (
                      <div className="self-start bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{item.photoTime.toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    )}
                    {item.photoLocation && (
                      <div className="self-start bg-black/60 backdrop-blur-sm text-white text-[10px] px-2 py-1 rounded-full flex items-center space-x-1">
                        <MapPin className="w-3 h-3" />
                        <span className="truncate max-w-[150px]">{item.photoLocation.address || '已定位'}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Right: Form */}
              <div className="w-full md:w-2/3 flex flex-col space-y-4 pt-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-bold text-stone-700">日誌內容</label>
                  {item.isAnalyzing && (
                    <span className="text-xs text-amber-500 flex items-center font-medium">
                      <Loader2 className="w-3 h-3 animate-spin mr-1" /> AI 辨識中...
                    </span>
                  )}
                  {item.hasAnalyzed && !item.isAnalyzing && (
                    <span className="text-xs text-green-500 flex items-center font-medium">
                      <Check className="w-3 h-3 mr-1" /> AI 辨識完成
                    </span>
                  )}
                </div>
                <textarea
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-xl focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none transition-all resize-none text-sm text-stone-700"
                  placeholder="請輸入溫馨的日誌描述..."
                />
                
                <div>
                  <label className="text-sm font-bold text-stone-700 mb-2 block">
                    標記寶貝 <span className="text-rose-500 font-normal">*必選</span>
                  </label>
                  {toddlers.length === 0 ? (
                    <p className="text-xs text-rose-500">請先至「幼兒管理」新增幼兒資料</p>
                  ) : (
                    <div className="flex flex-col space-y-4">
                      <div className="flex flex-wrap gap-2">
                        {toddlers.map(toddler => {
                          const isSelected = item.selectedToddlerIds.includes(toddler.id);
                          return (
                            <button
                              key={toddler.id}
                              onClick={() => toggleToddler(item.id, toddler.id)}
                              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition-all text-sm ${
                                isSelected 
                                  ? 'bg-rose-100 border-rose-300 text-rose-700 font-medium' 
                                  : 'bg-white border-stone-200 text-stone-600 hover:bg-stone-50'
                              }`}
                            >
                              <div className={`w-4 h-4 rounded-full flex items-center justify-center border ${isSelected ? 'bg-rose-400 border-rose-400 text-white' : 'border-stone-300'}`}>
                                {isSelected && <Check className="w-2.5 h-2.5" />}
                              </div>
                              <span>{toddler.name}</span>
                            </button>
                          );
                        })}
                      </div>
                      
                      {item.selectedToddlerIds.length > 0 && (
                        <div className="space-y-4 mt-4 border-t border-stone-100 pt-4">
                          <h4 className="text-sm font-bold text-stone-700">寶貝生活紀錄</h4>
                          {item.selectedToddlerIds.map(toddlerId => {
                            const toddler = toddlers.find(t => t.id === toddlerId);
                            const record = item.dailyRecords[toddlerId];
                            if (!toddler || !record) return null;
                            
                            return (
                              <div key={toddlerId} className="bg-stone-50 p-4 rounded-xl border border-stone-200 space-y-3">
                                <div className="font-medium text-rose-600 border-b border-rose-100 pb-2 mb-3">{toddler.name} 的紀錄</div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                  <div>
                                    <label className="text-xs font-bold text-stone-600 mb-1 block">活動內容</label>
                                    <input 
                                      type="text" 
                                      value={record.activityContent}
                                      onChange={(e) => updateDailyRecord(item.id, toddlerId, 'activityContent', e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
                                      placeholder="例如：畫畫、聽故事"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-stone-600 mb-1 block">用餐</label>
                                    <input 
                                      type="text" 
                                      value={record.meals}
                                      onChange={(e) => updateDailyRecord(item.id, toddlerId, 'meals', e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
                                      placeholder="例如：吃了一碗飯、蔬菜"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-stone-600 mb-1 block">點心</label>
                                    <input 
                                      type="text" 
                                      value={record.snacks}
                                      onChange={(e) => updateDailyRecord(item.id, toddlerId, 'snacks', e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
                                      placeholder="例如：蘋果半顆、牛奶"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs font-bold text-stone-600 mb-1 block">睡眠記錄</label>
                                    <input 
                                      type="text" 
                                      value={record.sleepRecord}
                                      onChange={(e) => updateDailyRecord(item.id, toddlerId, 'sleepRecord', e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
                                      placeholder="例如：午睡 13:00 - 15:00"
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <label className="text-xs font-bold text-stone-600 mb-1 block">如廁</label>
                                    <input 
                                      type="text" 
                                      value={record.toileting}
                                      onChange={(e) => updateDailyRecord(item.id, toddlerId, 'toileting', e.target.value)}
                                      className="w-full px-3 py-2 bg-white border border-stone-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-100 focus:border-rose-300 outline-none"
                                      placeholder="例如：大便1次(正常)、小便3次"
                                    />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                
                {item.errorMsg && (
                  <p className="text-xs text-red-500 mt-2">{item.errorMsg}</p>
                )}
              </div>
            </div>
          ))}

          {/* Submit Button */}
          <div className="pt-6 border-t border-stone-200">
            <button
              onClick={handleSaveAll}
              disabled={isSaving || items.length === 0}
              className="w-full px-8 py-4 bg-stone-800 text-white rounded-2xl hover:bg-stone-900 transition-all disabled:opacity-50 disabled:hover:bg-stone-800 font-medium shadow-md text-lg flex items-center justify-center space-x-2"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>發布中...</span>
                </>
              ) : (
                <span>確認發布 {items.length} 篇日誌</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
