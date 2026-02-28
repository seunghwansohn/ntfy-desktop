import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { isPermissionGranted, requestPermission, sendNotification } from '@tauri-apps/plugin-notification';
import { Send, Plus, Trash2, Bell, Server, Zap } from 'lucide-react';

interface NtfyMessage {
  id: string;
  time: number;
  event: string;
  topic: string;
  message?: string;
  title?: string;
  tags?: string[];
  priority?: number;
  serverUrl?: string;
}

interface FrontendMessage {
  server_url: string;
  message: NtfyMessage;
}

interface Subscription {
  serverUrl: string;
  topic: string;
}

const normalizeUrl = (url: string) => url.trim().replace(/\/+$/, '');

function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>(() => {
    const saved = localStorage.getItem('ntfy-subscriptions');
    if (saved) {
      try {
        const parsed: Subscription[] = JSON.parse(saved);
        return parsed.map(s => ({ ...s, serverUrl: normalizeUrl(s.serverUrl) }));
      } catch {
        return [];
      }
    }
    return [];
  });
  
  const [newServerUrl, setNewServerUrl] = useState('https://ntfy.sh');
  const [newTopic, setNewTopic] = useState('');
  const [messages, setMessages] = useState<NtfyMessage[]>([]);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(() => {
    return subscriptions.length > 0 ? subscriptions[0] : null;
  });
  const [composeMessage, setComposeMessage] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});

  const selectedSubRef = useRef<Subscription | null>(selectedSub);

  useEffect(() => {
    selectedSubRef.current = selectedSub;
    if (selectedSub) {
      const key = `${normalizeUrl(selectedSub.serverUrl)}|${selectedSub.topic}`;
      setUnreadCounts((prev) => {
        if (prev[key]) {
          const next = { ...prev };
          delete next[key];
          return next;
        }
        return prev;
      });
    }
  }, [selectedSub]);

  useEffect(() => {
    const initApp = async () => {
      let permission = await isPermissionGranted();
      if (!permission) {
        permission = await requestPermission() === 'granted';
      }
      console.log('Notification permission granted:', permission);
      
      subscriptions.forEach((sub) => {
        invoke('subscribe', { 
          serverUrl: normalizeUrl(sub.serverUrl), 
          topic: sub.topic 
        }).catch(err => console.error(`Failed to subscribe to ${sub.topic}:`, err));
      });
    };

    initApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    localStorage.setItem('ntfy-subscriptions', JSON.stringify(subscriptions));
  }, [subscriptions]);

  useEffect(() => {
    const unlistenPromise = listen<FrontendMessage>('new-message', (event) => {
      const { server_url, message } = event.payload;
      const normalizedServerUrl = normalizeUrl(server_url);
      const enrichedMessage = { ...message, serverUrl: normalizedServerUrl };
      
      setMessages((prev) => [enrichedMessage, ...prev]);

      const current = selectedSubRef.current;
      const isCurrentlyViewing = current && 
        normalizeUrl(current.serverUrl) === normalizedServerUrl && 
        current.topic === message.topic;

      if (!isCurrentlyViewing) {
        const key = `${normalizedServerUrl}|${message.topic}`;
        setUnreadCounts((prev) => ({
          ...prev,
          [key]: (prev[key] || 0) + 1
        }));
      }
    });

    return () => {
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = newTopic.trim();
    let serverUrl = normalizeUrl(newServerUrl);
    if (!serverUrl.startsWith('http')) serverUrl = `https://${serverUrl}`;
    if (!topic || !serverUrl) return;

    const exists = subscriptions.some(s => normalizeUrl(s.serverUrl) === serverUrl && s.topic === topic);
    if (exists) return;

    try {
      await invoke('subscribe', { serverUrl, topic });
      const newSub = { serverUrl, topic };
      setSubscriptions([...subscriptions, newSub]);
      setSelectedSub(newSub);
      setNewTopic('');
    } catch (error) {
      alert(`구독 실패: ${error}`);
    }
  };

  const handleRemoveTopic = async (subToRemove: Subscription) => {
    try {
      const serverUrl = normalizeUrl(subToRemove.serverUrl);
      await invoke('unsubscribe', { serverUrl, topic: subToRemove.topic });
      const nextSubs = subscriptions.filter(
        (s) => !(normalizeUrl(s.serverUrl) === serverUrl && s.topic === subToRemove.topic)
      );
      setSubscriptions(nextSubs);
      if (selectedSub && normalizeUrl(selectedSub.serverUrl) === serverUrl && selectedSub.topic === subToRemove.topic) {
        setSelectedSub(nextSubs.length > 0 ? nextSubs[0] : null);
      }
    } catch (error) {
      console.error(error);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !composeMessage.trim()) return;
    try {
      const baseUrl = normalizeUrl(selectedSub.serverUrl);
      await fetch(`${baseUrl}/${selectedSub.topic}`, { method: 'POST', body: composeMessage });
      setComposeMessage('');
    } catch (error) {
      alert('전송 실패');
    }
  };

  // 표준 알림 테스트 버튼 핸들러
  const handleTestNotification = () => {
    sendNotification({
      title: 'ntfy-desktop 테스트',
      body: '이 알림이 깜빡이지 않고 잘 보이나요?',
    });
  };

  const currentMessages = messages.filter(
    (m) => m.serverUrl === (selectedSub ? normalizeUrl(selectedSub.serverUrl) : '') && 
           m.topic === selectedSub?.topic
  );

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden text-gray-800 font-sans selection:bg-indigo-100">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm z-20">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between gap-2 text-indigo-600 font-bold text-lg">
          <div className="flex items-center gap-2">
            <Bell className="w-5 h-5 fill-current" />
            ntfy-desktop
          </div>
          <button 
            onClick={handleTestNotification}
            className="p-1.5 hover:bg-indigo-100 rounded-full transition-colors text-indigo-400 group"
            title="알림 테스트"
          >
            <Zap className="w-4 h-4 group-active:scale-90 transition-transform" />
          </button>
        </div>
        
        <form onSubmit={handleAddTopic} className="p-4 border-b border-gray-200 flex flex-col gap-2 bg-gray-50/50">
          <div className="flex items-center gap-2 bg-white px-3 py-2 border border-gray-300 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500 shadow-sm transition-all">
             <Server className="w-4 h-4 text-gray-400 flex-shrink-0" />
             <input
              type="text"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              placeholder="https://ntfy.sh"
              className="flex-1 text-sm focus:outline-none bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="토픽 이름..."
              className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-sm"
            />
            <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 active:scale-95 transition-all shadow-sm">
              <Plus className="w-5 h-5" />
            </button>
          </div>
        </form>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {subscriptions.map((sub, idx) => {
            const isSelected = selectedSub && normalizeUrl(selectedSub.serverUrl) === normalizeUrl(sub.serverUrl) && selectedSub.topic === sub.topic;
            const unreadKey = `${normalizeUrl(sub.serverUrl)}|${sub.topic}`;
            const unreadCount = unreadCounts[unreadKey] || 0;
            return (
              <div
                key={`${sub.serverUrl}-${sub.topic}-${idx}`}
                onClick={() => setSelectedSub(sub)}
                className={`flex flex-col p-4 cursor-pointer border-b border-gray-100 hover:bg-indigo-50/50 transition-colors relative group ${
                  isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`font-semibold truncate ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>#{sub.topic}</span>
                    {unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-black px-1.5 py-0.5 rounded-full shadow-sm animate-pulse">
                        {unreadCount}
                      </span>
                    )}
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleRemoveTopic(sub); }} className="text-gray-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-[11px] text-gray-400 truncate mt-1 font-mono">{normalizeUrl(sub.serverUrl).replace(/^https?:\/\//, '')}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-50 relative overflow-hidden">
        {selectedSub ? (
          <>
            <div className="p-5 bg-white border-b border-gray-200 shadow-sm z-10">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-black text-gray-900">#{selectedSub.topic}</h2>
                <div className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded uppercase tracking-wider">Connected</div>
              </div>
              <span className="text-xs text-gray-400 mt-1 font-mono">{normalizeUrl(selectedSub.serverUrl)}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4 custom-scrollbar">
              {currentMessages.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center opacity-30 select-none">
                  <Bell className="w-20 h-20 mb-4" />
                  <p className="text-lg font-medium">아직 메시지가 없습니다.</p>
                </div>
              ) : (
                currentMessages.map((msg, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-2xl shadow-sm border border-gray-100 self-start min-w-[300px] max-w-[85%] animate-in fade-in slide-in-from-bottom-2 duration-300">
                    {msg.title && <div className="font-extrabold text-gray-900 mb-2 text-lg">{msg.title}</div>}
                    <div className="text-gray-700 leading-relaxed whitespace-pre-wrap break-words">{msg.message || "새로운 알림이 도착했습니다."}</div>
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-gray-50 text-[10px] font-bold text-gray-300 uppercase">
                       <span>{new Date(msg.time * 1000).toLocaleTimeString()}</span>
                       <span>{new Date(msg.time * 1000).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-6 bg-white border-t border-gray-100">
              <form onSubmit={handlePublish} className="flex gap-3">
                <input
                  type="text"
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder={`#${selectedSub.topic}에 보낼 메시지 입력...`}
                  className="flex-1 px-5 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 bg-gray-50 outline-none transition-all"
                />
                <button type="submit" disabled={!composeMessage.trim()} className="px-8 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 active:scale-95 disabled:opacity-30 font-bold transition-all shadow-md shadow-indigo-200 flex items-center gap-2">
                  <Send className="w-5 h-5" /> 전송
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-300 select-none">
            <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6"><Bell className="w-12 h-12" /></div>
            <p className="text-xl font-bold text-gray-400">토픽을 선택하세요.</p>
          </div>
        )}
      </div>
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
      `}</style>
    </div>
  );
}

export default App;
