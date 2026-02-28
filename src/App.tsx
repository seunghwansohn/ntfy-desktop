import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { Send, Plus, Trash2, Bell, Server } from 'lucide-react';

interface NtfyMessage {
  id: string;
  time: number;
  event: string;
  topic: string;
  message?: string;
  title?: string;
  tags?: string[];
  priority?: number;
}

interface Subscription {
  serverUrl: string;
  topic: string;
}

function App() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [newServerUrl, setNewServerUrl] = useState('https://ntfy.sh');
  const [newTopic, setNewTopic] = useState('');
  const [messages, setMessages] = useState<NtfyMessage[]>([]);
  const [selectedSub, setSelectedSub] = useState<Subscription | null>(null);
  const [composeMessage, setComposeMessage] = useState('');

  // 마운트 시 저장된 구독 목록을 불러오고 백그라운드 구독을 시작합니다.
  useEffect(() => {
    const saved = localStorage.getItem('ntfy-subscriptions');
    if (saved) {
      try {
        const parsed: Subscription[] = JSON.parse(saved);
        setSubscriptions(parsed);
        if (parsed.length > 0) setSelectedSub(parsed[0]);
        // Rust 백엔드에 각각의 토픽 구독 요청
        parsed.forEach((sub) => {
          invoke('subscribe', { serverUrl: sub.serverUrl, topic: sub.topic }).catch(console.error);
        });
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  // 구독 목록이 변경될 때 로컬 스토리지에 저장합니다.
  useEffect(() => {
    localStorage.setItem('ntfy-subscriptions', JSON.stringify(subscriptions));
  }, [subscriptions]);

  // Rust 백엔드로부터 새로운 메시지 이벤트를 수신합니다.
  useEffect(() => {
    let unlisten: UnlistenFn;
    
    const setup = async () => {
      unlisten = await listen<NtfyMessage>('new-message', (event) => {
        setMessages((prev) => [event.payload, ...prev]);
      });
    };

    setup();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleAddTopic = async (e: React.FormEvent) => {
    e.preventDefault();
    const topic = newTopic.trim();
    let serverUrl = newServerUrl.trim();
    if (!serverUrl.startsWith('http')) {
      serverUrl = `https://${serverUrl}`;
    }

    if (!topic || !serverUrl) return;

    const exists = subscriptions.some(s => s.serverUrl === serverUrl && s.topic === topic);
    if (exists) return;

    try {
      await invoke('subscribe', { serverUrl, topic });
      const newSub = { serverUrl, topic };
      setSubscriptions([...subscriptions, newSub]);
      setSelectedSub(newSub);
      setNewTopic('');
    } catch (error) {
      console.error('Failed to subscribe:', error);
      alert(`구독 실패: ${error}`);
    }
  };

  const handleRemoveTopic = async (subToRemove: Subscription) => {
    try {
      await invoke('unsubscribe', { serverUrl: subToRemove.serverUrl, topic: subToRemove.topic });
      const newSubs = subscriptions.filter(
        (s) => !(s.serverUrl === subToRemove.serverUrl && s.topic === subToRemove.topic)
      );
      setSubscriptions(newSubs);
      if (selectedSub?.serverUrl === subToRemove.serverUrl && selectedSub?.topic === subToRemove.topic) {
        setSelectedSub(null);
      }
    } catch (error) {
      console.error('Failed to unsubscribe:', error);
    }
  };

  const handlePublish = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSub || !composeMessage.trim()) return;

    try {
      const baseUrl = selectedSub.serverUrl.replace(/\/$/, '');
      await fetch(`${baseUrl}/${selectedSub.topic}`, {
        method: 'POST',
        body: composeMessage,
      });
      setComposeMessage('');
    } catch (error) {
      console.error('Failed to publish message:', error);
      alert('메시지 전송에 실패했습니다.');
    }
  };

  const currentMessages = messages.filter((m) => m.topic === selectedSub?.topic);

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden text-gray-800 font-sans">
      {/* Sidebar */}
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm z-20">
        <div className="p-4 border-b border-gray-200 bg-gray-50 flex items-center gap-2 text-indigo-600 font-bold text-lg">
          <Bell className="w-5 h-5" />
          ntfy-desktop
        </div>
        
        <form onSubmit={handleAddTopic} className="p-4 border-b border-gray-200 flex flex-col gap-2 bg-gray-50/50">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 border border-gray-300 rounded focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
             <Server className="w-4 h-4 text-gray-400 flex-shrink-0" />
             <input
              type="text"
              value={newServerUrl}
              onChange={(e) => setNewServerUrl(e.target.value)}
              placeholder="https://ntfy.sh"
              className="flex-1 text-sm focus:outline-none w-full bg-transparent"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newTopic}
              onChange={(e) => setNewTopic(e.target.value)}
              placeholder="토픽 이름 입력..."
              className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              className="px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors flex items-center justify-center"
              title="구독 추가"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </form>

        <div className="flex-1 overflow-y-auto">
          {subscriptions.map((sub, idx) => {
            const isSelected = selectedSub?.serverUrl === sub.serverUrl && selectedSub?.topic === sub.topic;
            return (
              <div
                key={`${sub.serverUrl}-${sub.topic}-${idx}`}
                onClick={() => setSelectedSub(sub)}
                className={`flex flex-col p-3 cursor-pointer border-b border-gray-100 hover:bg-gray-50 transition-colors ${
                  isSelected ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-gray-800 truncate">#{sub.topic}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRemoveTopic(sub);
                    }}
                    className="text-gray-400 hover:text-red-500 p-1 rounded transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <span className="text-xs text-gray-500 truncate mt-1">
                  {sub.serverUrl.replace(/^https?:\/\//, '')}
                </span>
              </div>
            )
          })}
          {subscriptions.length === 0 && (
            <div className="p-6 text-sm text-gray-500 text-center">
              구독 중인 토픽이 없습니다.<br/>
              위에서 서버 주소와 토픽을 입력해 추가하세요.
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col bg-gray-50 relative">
        {selectedSub ? (
          <>
            <div className="p-4 bg-white border-b border-gray-200 flex flex-col shadow-sm z-10">
              <h2 className="text-xl font-bold text-gray-800">#{selectedSub.topic}</h2>
              <span className="text-xs text-gray-500">{selectedSub.serverUrl}</span>
            </div>

            <div className="flex-1 overflow-y-auto p-6 flex flex-col-reverse gap-4">
              {currentMessages.length === 0 ? (
                <div className="text-center text-gray-400 mt-10">
                  아직 수신된 메시지가 없습니다.
                </div>
              ) : (
                currentMessages.map((msg, idx) => (
                  <div key={idx} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 self-start min-w-[250px] max-w-[80%]">
                    {msg.title && <div className="font-bold text-gray-800 mb-2">{msg.title}</div>}
                    <div className="text-gray-700 whitespace-pre-wrap break-words">{msg.message || "새로운 알림이 도착했습니다."}</div>
                    <div className="text-xs text-gray-400 mt-3 text-right">
                      {new Date(msg.time * 1000).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
              <form onSubmit={handlePublish} className="flex gap-2">
                <input
                  type="text"
                  value={composeMessage}
                  onChange={(e) => setComposeMessage(e.target.value)}
                  placeholder={`#${selectedSub.topic}에 보낼 메시지 입력...`}
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <button
                  type="submit"
                  disabled={!composeMessage.trim()}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium transition-colors shadow-sm"
                >
                  <Send className="w-4 h-4" />
                  전송
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <Bell className="w-16 h-16 text-gray-200 mb-4" />
            <p>사이드바에서 토픽을 선택하거나 새로 추가하세요.</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
