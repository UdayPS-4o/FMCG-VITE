import React, { useState, useEffect } from 'react';
import useAuth from '../../hooks/useAuth';
import constants from '../../constants';

interface MessageData {
  id: string;
  recipientId: number;
  recipientName: string;
  message: string;
  photoAttachment?: string;
  sentAt: string;
  sentBy: number;
  isRead: boolean;
}

const GlobalMessageNotification: React.FC = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<MessageData[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  const [selectedAttachment, setSelectedAttachment] = useState<string | null>(null);

  // Load messages from the backend API
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const response = await fetch(`${constants.baseURL}/api/messages`);
        if (response.ok) {
          const data = await response.json();
          // Filter messages for current user
          const isAdmin = user && user.routeAccess && user.routeAccess.includes('Admin');
          const userMessages = user ? data.messages.filter((msg: MessageData) => msg.recipientId === user.id || (isAdmin && msg.recipientId === 1)) : [];
          setMessages(userMessages);
        }
      } catch (error) {
        console.error('Error fetching messages:', error);
      }
    };

    fetchMessages();
    
    // Poll for new messages every 5 seconds since we don't have WebSockets set up
    const intervalId = setInterval(fetchMessages, 5000);
    return () => clearInterval(intervalId);
  }, [user]);

  const markMessageAsRead = async (messageId: string) => {
    try {
      const response = await fetch(`${constants.baseURL}/api/messages/${messageId}/read`, {
        method: 'PUT'
      });
      if (response.ok) {
        setMessages(prev => prev.map(msg => 
          msg.id === messageId ? { ...msg, isRead: true } : msg
        ));
      }
    } catch (error) {
      console.error('Error marking message as read:', error);
    }
  };

  const markAllMessagesAsRead = async () => {
    if (!user) return;
    try {
      const isAdmin = user.routeAccess && user.routeAccess.includes('Admin');
      const response = await fetch(`${constants.baseURL}/api/messages/read-all`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, isAdmin })
      });
      if (response.ok) {
        setMessages(prev => prev.map(msg => ({ ...msg, isRead: true })));
      }
    } catch (error) {
      console.error('Error marking all messages as read:', error);
    }
    setIsExpanded(false);
  };

  // Filter out read messages
  const visibleMessages = messages.filter(msg => !msg.isRead);
  
  // Debug logging
  console.log('GlobalMessageNotification - Total messages:', messages.length);
  console.log('GlobalMessageNotification - Visible messages:', visibleMessages.length);
  console.log('GlobalMessageNotification - Messages:', visibleMessages);

  if (visibleMessages.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-[100000] bg-blue-600 text-white shadow-lg">
      <div className="px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
              </svg>
              <span className="font-medium">
                {visibleMessages.length === 1 
                  ? 'New message from Admin' 
                  : `${visibleMessages.length} new messages from Admin`
                }
              </span>
            </div>
            {!isExpanded && visibleMessages.length > 0 && (
              <div className="flex items-center space-x-2">
                <div className="text-sm opacity-90 truncate max-w-md">
                  {visibleMessages[0].message}
                </div>
                {visibleMessages[0].photoAttachment && (
                  <div 
                    onClick={() => setSelectedAttachment(visibleMessages[0].photoAttachment!)}
                    className="cursor-pointer hover:opacity-80 transition-opacity flex-shrink-0"
                    title="Click to view attachment"
                  >
                    <img 
                      src={visibleMessages[0].photoAttachment} 
                      alt="Attachment" 
                      className="w-8 h-8 object-cover rounded border border-blue-300"
                      onError={(e) => {
                        console.error('Image failed to load:', visibleMessages[0].photoAttachment);
                        e.currentTarget.style.display = 'none';
                      }}
                      onLoad={() => {
                        console.log('Image loaded successfully:', visibleMessages[0].photoAttachment);
                      }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-2">
            {visibleMessages.length > 1 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="text-white hover:text-blue-200 transition-colors"
                title={isExpanded ? 'Collapse' : 'Expand all messages'}
              >
                <svg 
                  className={`h-4 w-4 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
                  fill="currentColor" 
                  viewBox="0 0 20 20"
                >
                  <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
            
            <button
              onClick={markAllMessagesAsRead}
              className="text-white hover:text-blue-200 transition-colors"
              title="Mark all messages as read"
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
        
        {/* Expanded messages view */}
        {isExpanded && visibleMessages.length > 1 && (
          <div className="mt-3 space-y-2 max-h-60 overflow-y-auto">
            {visibleMessages.map((message) => (
              <div key={message.id} className="bg-blue-700 rounded-lg p-3">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs text-blue-200 font-medium">
                    Admin Message
                  </span>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs text-blue-200">
                      {new Date(message.sentAt).toLocaleString()}
                    </span>
                    <button
                      onClick={() => markMessageAsRead(message.id)}
                      className="text-blue-200 hover:text-white transition-colors"
                      title="Mark this message as read"
                    >
                      <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                </div>
                <p className="text-sm text-white mb-2">
                  {message.message}
                </p>
                {message.photoAttachment && (
                  <div className="mt-2">
                    <div 
                      onClick={() => setSelectedAttachment(message.photoAttachment!)}
                      className="block cursor-pointer hover:opacity-80 transition-opacity"
                      title="Click to view attachment"
                    >
                      <img 
                        src={message.photoAttachment} 
                        alt="Attachment" 
                        className="max-w-full h-auto rounded border border-blue-500"
                        style={{ maxHeight: '150px' }}
                        onError={(e) => {
                          console.error('Expanded view image failed to load:', message.photoAttachment);
                          e.currentTarget.style.display = 'none';
                        }}
                        onLoad={() => {
                          console.log('Expanded view image loaded successfully:', message.photoAttachment);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        
        {/* Single message expanded view */}
        {isExpanded && visibleMessages.length === 1 && (
          <div className="mt-3">
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs text-blue-200 font-medium">
                Admin Message
              </span>
              <span className="text-xs text-blue-200">
                {new Date(visibleMessages[0].sentAt).toLocaleString()}
              </span>
            </div>
            {visibleMessages[0].photoAttachment && (
              <div className="mt-2">
                <div 
                  onClick={() => setSelectedAttachment(visibleMessages[0].photoAttachment!)}
                  className="block cursor-pointer hover:opacity-80 transition-opacity"
                  title="Click to view attachment"
                >
                  <img 
                    src={visibleMessages[0].photoAttachment} 
                    alt="Attachment" 
                    className="max-w-full h-auto rounded border border-blue-500"
                    style={{ maxHeight: '150px' }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Attachment Modal */}
      {selectedAttachment && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[100001]"
          onClick={() => setSelectedAttachment(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] p-4">
            <button
              onClick={() => setSelectedAttachment(null)}
              className="absolute top-2 right-2 text-white hover:text-gray-300 bg-black bg-opacity-50 rounded-full p-2 z-10"
              title="Close attachment"
            >
              <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
            <img 
              src={selectedAttachment} 
              alt="Attachment" 
              className="max-w-full max-h-full object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default GlobalMessageNotification;