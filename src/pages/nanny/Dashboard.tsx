import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { format } from 'date-fns';
import { handleFirestoreError, OperationType } from '../../lib/utils';
import { Image as ImageIcon, Edit2, Check, X, Loader2, BookOpen, MapPin, Clock, Trash2, CheckSquare, Square, Share2, MessageCircle, FileText } from 'lucide-react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

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

export function NannyDashboard() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  
  // 編輯狀態
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // 選擇與刪除狀態
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'logs'),
      where('nannyId', '==', user.uid),
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

  const handleEditClick = (log: Log) => {
    setEditingId(log.id);
    setEditContent(log.description);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditContent('');
  };

  const handleSaveEdit = async (logId: string) => {
    if (!editContent.trim()) return;
    setIsUpdating(true);
    setErrorMsg(null);
    try {
      await updateDoc(doc(db, 'logs', logId), {
        description: editContent.trim()
      });
      setEditingId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `logs/${logId}`);
      setErrorMsg('更新失敗，請稍後再試。');
    } finally {
      setIsUpdating(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedLogIds(prev =>
      prev.includes(id) ? prev.filter(logId => logId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selectedLogIds.length === logs.length) {
      setSelectedLogIds([]);
    } else {
      setSelectedLogIds(logs.map(log => log.id));
    }
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    setErrorMsg(null);
    try {
      await Promise.all(selectedLogIds.map(id => deleteDoc(doc(db, 'logs', id))));
      setSelectedLogIds([]);
      setShowDeleteConfirm(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, 'logs');
      setErrorMsg('刪除失敗，請稍後再試。');
    } finally {
      setIsDeleting(false);
    }
  };

  const [isSharing, setIsSharing] = useState(false);

  const handleShare = async () => {
    const selectedLogs = logs.filter(log => selectedLogIds.includes(log.id));
    if (selectedLogs.length === 0) return;

    setIsSharing(true);
    try {
      // 稍微等待確保 React 已經將隱藏的 DOM 渲染完畢
      await new Promise(resolve => setTimeout(resolve, 800));

      let shareText = '寶貝的溫馨日誌：\n\n';
      selectedLogs.forEach(log => {
        const dateStr = format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm');
        shareText += `【${dateStr}】\n${log.description}\n\n`;
      });
      const appUrl = window.location.origin + window.location.pathname;
      shareText += `\n查看更多：${appUrl}`;

      const logElement = document.getElementById('combined-share-container');
      let file: File | null = null;

      if (logElement) {
        try {
          // 確保圖片已載入
          const images = logElement.getElementsByTagName('img');
          await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          }));

          const canvas = await html2canvas(logElement, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 800,
            onclone: (clonedDoc) => {
              const el = clonedDoc.getElementById('combined-share-container');
              if (el) {
                el.style.position = 'relative';
                el.style.left = '0';
                el.style.top = '0';
              }
            }
          });

          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (blob) {
            file = new File([blob], `baby-logs-${format(new Date(), 'yyyyMMdd-HHmm')}.jpg`, { type: 'image/jpeg' });
          }
        } catch (e) {
          console.warn('Failed to generate combined image for sharing', e);
        }
      }

      if (navigator.share) {
        const shareData: ShareData = {
          title: '寶貝的溫馨日誌',
        };

        // 如果瀏覽器支援分享檔案，且我們成功轉換了檔案
        if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
          shareData.files = [file];
          // 為了確保圖片能成功分享到 Line/FB 等，我們不把 text 放在 shareData 裡面，而是複製到剪貼簿
          try {
            await navigator.clipboard.writeText(shareText);
            setSuccessMsg('已複製文字！請在分享時貼上。');
          } catch (e) {}
        } else {
          shareData.text = shareText;
          shareData.url = appUrl;
        }

        await navigator.share(shareData);
        if (!file) setSuccessMsg('分享成功！');
      } else {
        // 降級方案：複製文字到剪貼簿
        await navigator.clipboard.writeText(shareText);
        setSuccessMsg('已複製日誌內容與連結到剪貼簿！');
      }
    } catch (error) {
      if ((error as Error).name !== 'AbortError') {
        console.error('Share failed:', error);
        setErrorMsg('分享失敗，請稍後再試。');
      }
    } finally {
      setIsSharing(false);
    }

    // 3秒後清除成功訊息
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const handleShareLine = async () => {
    const selectedLogs = logs.filter(log => selectedLogIds.includes(log.id));
    if (selectedLogs.length === 0) return;

    setIsSharing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 800));

      let shareText = '寶貝的溫馨日誌：\n\n';
      selectedLogs.forEach(log => {
        const dateStr = format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm');
        shareText += `【${dateStr}】\n${log.description}\n\n`;
      });
      const appUrl = window.location.origin + window.location.pathname;
      shareText += `\n查看更多：${appUrl}`;

      const logElement = document.getElementById('combined-share-container');
      if (logElement) {
        try {
          const images = logElement.getElementsByTagName('img');
          await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          }));

          const canvas = await html2canvas(logElement, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 800,
            onclone: (clonedDoc) => {
              const el = clonedDoc.getElementById('combined-share-container');
              if (el) {
                el.style.position = 'relative';
                el.style.left = '0';
                el.style.top = '0';
              }
            }
          });

          const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `baby-logs-${format(new Date(), 'yyyyMMdd-HHmm')}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
          }
        } catch (e) {
          console.warn('Failed to generate combined image for Line sharing', e);
        }
      }

      const lineUrl = `https://line.me/R/msg/text/?${encodeURIComponent(shareText)}`;
      window.open(lineUrl, '_blank');
      setSuccessMsg('已下載圖檔並開啟 Line！請在 Line 中手動附上圖片。');
    } catch (error) {
      console.error('Line Share failed:', error);
      setErrorMsg('分享失敗，請稍後再試。');
    } finally {
      setIsSharing(false);
    }
    
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  const handleDownloadPDF = async () => {
    const selectedLogs = logs.filter(log => selectedLogIds.includes(log.id));
    if (selectedLogs.length === 0) return;

    setIsGeneratingPDF(true);
    setErrorMsg(null);

    try {
      // 稍微等待確保 React 已經將隱藏的 DOM 渲染完畢
      await new Promise(resolve => setTimeout(resolve, 800));

      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      for (let i = 0; i < selectedLogs.length; i++) {
        const log = selectedLogs[i];
        const logElement = document.getElementById(`pdf-log-${log.id}`);
        
        if (logElement) {
          // 確保圖片已載入
          const images = logElement.getElementsByTagName('img');
          await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => {
              img.onload = resolve;
              img.onerror = resolve;
            });
          }));

          const canvas = await html2canvas(logElement, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            backgroundColor: '#ffffff',
            windowWidth: 800,
            onclone: (clonedDoc) => {
              const el = clonedDoc.getElementById(`pdf-log-${log.id}`);
              if (el) {
                el.style.position = 'relative';
                el.style.left = '0';
                el.style.top = '0';
              }
            }
          });

          const imgData = canvas.toDataURL('image/jpeg', 0.9);
          
          if (imgData === 'data:,') {
            throw new Error('Canvas 截圖為空');
          }

          const imgProps = pdf.getImageProperties(imgData);
          const imgHeight = (imgProps.height * pdfWidth) / imgProps.width;

          if (i > 0) {
            pdf.addPage();
          }
          
          // 如果內容超過一頁的高度，則縮放以適應一頁
          const finalHeight = Math.min(imgHeight, pdfHeight);
          const finalWidth = (finalHeight * pdfWidth) / imgHeight;
          const xOffset = (pdfWidth - finalWidth) / 2;
          
          pdf.addImage(imgData, 'JPEG', xOffset, 0, finalWidth, finalHeight);
        }
      }

      pdf.save(`baby-logs-${format(new Date(), 'yyyyMMdd')}.pdf`);
      setSuccessMsg('PDF 下載成功！');
    } catch (error) {
      console.error('PDF generation failed:', error);
      setErrorMsg('PDF 產生失敗，請稍後再試。');
    } finally {
      setIsGeneratingPDF(false);
    }
    setTimeout(() => setSuccessMsg(null), 3000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-4">
        <div className="w-12 h-12 border-4 border-rose-200 border-t-rose-500 rounded-full animate-spin"></div>
        <p className="text-stone-500 font-medium">正在載入日誌資料...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      <div className="flex items-center space-x-3 border-b border-rose-100 pb-6">
        <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center shadow-sm">
          <BookOpen className="w-6 h-6 text-rose-500" />
        </div>
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-stone-800">日誌總覽</h1>
          <p className="text-stone-500 mt-1">管理與回顧您發布的所有寶貝日誌</p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={handleSelectAll}
            className="flex items-center space-x-2 px-4 py-2 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-xl transition-colors font-medium text-sm"
          >
            {selectedLogIds.length === logs.length ? (
              <>
                <CheckSquare className="w-4 h-4" />
                <span>取消全選</span>
              </>
            ) : (
              <>
                <Square className="w-4 h-4" />
                <span>全選</span>
              </>
            )}
          </button>
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

      {successMsg && (
        <div className="bg-green-50 border border-green-100 text-green-600 p-4 rounded-2xl flex justify-between items-center animate-in fade-in slide-in-from-top-2">
          <span className="text-sm">{successMsg}</span>
          <button onClick={() => setSuccessMsg(null)} className="p-1 hover:bg-green-100 rounded-lg transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      
      {logs.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-3xl shadow-sm border border-rose-100">
          <div className="w-24 h-24 bg-rose-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ImageIcon className="w-12 h-12 text-rose-300" />
          </div>
          <h3 className="text-xl font-bold text-stone-700 mb-2">尚未發布任何日誌</h3>
          <p className="text-stone-500">快到「新增日誌」為寶貝們記錄美好的一天吧！</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {logs.map(log => {
            const isSelected = selectedLogIds.includes(log.id);
            return (
            <div key={log.id} className={`bg-white rounded-3xl shadow-sm border overflow-hidden hover:shadow-lg transition-all duration-300 flex flex-col group ${isSelected ? 'border-rose-400 ring-2 ring-rose-100' : 'border-rose-100'}`}>
              <div className="aspect-square relative bg-stone-50 overflow-hidden">
                {/* 選擇核取方塊 */}
                <button
                  onClick={() => toggleSelection(log.id)}
                  className="absolute top-4 left-4 z-30 p-1"
                >
                  <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all shadow-sm ${
                    isSelected 
                      ? 'bg-rose-500 border-rose-500 text-white' 
                      : 'bg-white/90 border-stone-300 text-transparent hover:border-rose-400'
                  }`}>
                    <Check className="w-4 h-4" />
                  </div>
                </button>

                <img 
                  src={log.photoBase64} 
                  alt="Log" 
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
              <div className="p-6 flex flex-col flex-1 bg-white relative z-10">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center space-x-2">
                    <span className="bg-rose-100 text-rose-600 text-xs font-bold px-3 py-1 rounded-full">
                      {format(new Date(log.createdAt), 'yyyy/MM/dd')}
                    </span>
                    <span className="text-stone-400 text-sm font-medium">
                      {format(new Date(log.createdAt), 'HH:mm')}
                    </span>
                  </div>
                  {editingId !== log.id && (
                    <button
                      onClick={() => handleEditClick(log)}
                      className="text-stone-400 hover:text-rose-500 hover:bg-rose-50 p-2 rounded-full transition-colors"
                      title="編輯日誌內容"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
                
                {editingId === log.id ? (
                  <div className="space-y-3 flex-1 flex flex-col">
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full p-4 bg-stone-50 border border-rose-200 rounded-2xl focus:ring-4 focus:ring-rose-100 focus:border-rose-300 outline-none resize-none text-sm text-stone-700 flex-1 min-h-[120px]"
                      disabled={isUpdating}
                      placeholder="請輸入日誌內容..."
                    />
                    <div className="flex justify-end space-x-2 mt-auto pt-2">
                      <button
                        onClick={handleCancelEdit}
                        disabled={isUpdating}
                        className="px-4 py-2 text-stone-500 hover:bg-stone-100 rounded-xl transition-colors text-sm font-medium"
                      >
                        取消
                      </button>
                      <button
                        onClick={() => handleSaveEdit(log.id)}
                        disabled={isUpdating || !editContent.trim()}
                        className="px-4 py-2 bg-rose-500 text-white hover:bg-rose-600 rounded-xl transition-colors flex items-center justify-center space-x-1 text-sm font-medium disabled:opacity-50"
                      >
                        {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        <span>儲存</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-stone-700 text-base leading-relaxed flex-1 whitespace-pre-wrap">
                    {log.description}
                  </p>
                )}
                
                <div className="mt-6 flex flex-wrap gap-2">
                  {log.toddlerIds.map(id => (
                    <span key={id} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-stone-100 text-stone-600 border border-stone-200">
                      已標記寶貝
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )})}
        </div>
      )}

      {/* 浮動操作列 */}
      {selectedLogIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 bg-stone-800 text-white px-6 py-4 rounded-full shadow-2xl flex items-center space-x-6 z-40 animate-in slide-in-from-bottom-10">
          <span className="font-medium whitespace-nowrap">已選擇 {selectedLogIds.length} 筆日誌</span>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setSelectedLogIds([])}
              className="px-4 py-2 hover:bg-stone-700 rounded-full transition-colors text-sm whitespace-nowrap"
            >
              取消
            </button>
            <button
              onClick={handleShare}
              disabled={isSharing}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-full transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap disabled:opacity-50"
            >
              {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              <span className="hidden sm:inline">分享</span>
            </button>
            <button
              onClick={handleShareLine}
              disabled={isSharing}
              className="px-4 py-2 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-full transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap disabled:opacity-50"
            >
              {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageCircle className="w-4 h-4" />}
              <span className="hidden sm:inline">Line</span>
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isGeneratingPDF}
              className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap disabled:opacity-50"
            >
              {isGeneratingPDF ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              <span className="hidden sm:inline">PDF</span>
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-full transition-colors text-sm font-medium flex items-center space-x-1 whitespace-nowrap"
            >
              <Trash2 className="w-4 h-4" />
              <span className="hidden sm:inline">刪除</span>
            </button>
          </div>
        </div>
      )}

      {/* 刪除確認彈窗 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl animate-in zoom-in-95">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-6">
              <Trash2 className="w-6 h-6 text-red-600" />
            </div>
            <h3 className="text-2xl font-bold text-stone-800 mb-2">確認刪除日誌</h3>
            <p className="text-stone-600 mb-8 leading-relaxed">
              確定要刪除選取的 <span className="font-bold text-red-600">{selectedLogIds.length}</span> 筆日誌嗎？此動作無法復原，家長也將無法再看到這些照片。
            </p>
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-6 py-3 text-stone-600 hover:bg-stone-100 rounded-xl transition-colors font-medium"
              >
                取消
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl transition-colors font-medium flex items-center space-x-2 disabled:opacity-50"
              >
                {isDeleting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}
                <span>確定刪除</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden container for PDF generation */}
      <div className="fixed left-[200vw] top-0 w-[800px] pointer-events-none">
        {logs.filter(log => selectedLogIds.includes(log.id)).map(log => (
          <div 
            key={`pdf-${log.id}`} 
            id={`pdf-log-${log.id}`} 
            className="p-10"
            style={{ backgroundColor: '#ffffff' }}
          >
            <div className="text-3xl font-bold mb-6 pb-4 flex items-center justify-between" style={{ color: '#292524', borderBottom: '2px solid #ffe4e6' }}>
              <span>寶貝溫馨日誌</span>
              <span className="text-xl font-normal" style={{ color: '#78716c' }}>{format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm')}</span>
            </div>
            {log.photoBase64 && (
              <div className="mb-8 rounded-2xl overflow-hidden flex justify-center" style={{ backgroundColor: '#fafaf9' }}>
                <img 
                  src={log.photoBase64} 
                  alt="Log" 
                  className="w-full h-auto rounded-xl" 
                  style={{ display: 'block' }}
                />
              </div>
            )}
            <p className="text-2xl leading-relaxed whitespace-pre-wrap" style={{ color: '#292524' }}>
              {log.description}
            </p>
          </div>
        ))}
      </div>
      {/* Hidden container for single combined image generation */}
      <div className="fixed left-[300vw] top-0 w-[800px] pointer-events-none">
        <div id="combined-share-container" className="p-10" style={{ backgroundColor: '#ffffff' }}>
          <div className="text-4xl font-bold mb-8 pb-4 text-center" style={{ color: '#292524', borderBottom: '2px solid #ffe4e6' }}>
            寶貝溫馨日誌
          </div>
          {logs.filter(log => selectedLogIds.includes(log.id)).map((log, index) => (
            <div key={`combined-${log.id}`} className={index > 0 ? "mt-12 pt-12" : ""} style={index > 0 ? { borderTop: '2px dashed #e5e5e5' } : {}}>
              <div className="text-xl font-normal mb-6" style={{ color: '#78716c' }}>
                {format(new Date(log.createdAt), 'yyyy/MM/dd HH:mm')}
              </div>
              {log.photoBase64 && (
                <div className="mb-8 rounded-2xl overflow-hidden flex justify-center" style={{ backgroundColor: '#fafaf9' }}>
                  <img 
                    src={log.photoBase64} 
                    alt="Log" 
                    className="w-full h-auto rounded-xl" 
                    style={{ display: 'block' }}
                  />
                </div>
              )}
              <p className="text-2xl leading-relaxed whitespace-pre-wrap" style={{ color: '#292524' }}>
                {log.description}
              </p>
            </div>
          ))}
          <div className="mt-12 pt-6 text-center text-lg" style={{ color: '#a8a29e', borderTop: '2px solid #ffe4e6' }}>
            來自 香香媽媽寶貝日誌
          </div>
        </div>
      </div>
    </div>
  );
}
