
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState, useRef, useEffect } from "react";
import { sendMessageStream } from "../services/gemini";
import { ChatMessageItem } from "./ChatMessageItem";
import { ChatInput } from "./ChatInput";
import { Sparkles, Lightbulb, RefreshCw } from "lucide-react";
import { motion } from "framer-motion";
import { Part, Content } from "@google/genai";
import { ChatMessage, ExamplePrompt } from "../types";

const DEFAULT_EXAMPLES: ExamplePrompt[] = [
  {
    title: "Visual Thoughts",
    prompt: "Crop out all the animals, and use them as icons in a matplotlib plot showing the lifespan of those animals. Sort by lifespan.",
    image: "https://raw.githubusercontent.com/nannanxia-art/gemini-thinking/refs/heads/main/animals.jpg"
  },
  {
    title: "Visual Thoughts",
    prompt: "Analyze where the mug, glass, and bowl will go? Annotate them on the image with boxes and arrows and save the image.",
    image: "https://raw.githubusercontent.com/nannanxia-art/gemini-thinking/refs/heads/main/spatial2_min.jpeg"
  },
  {
    title: "Visual Thoughts",
    prompt: "How many gears are there? Zoom in to see.",
    image: "https://raw.githubusercontent.com/nannanxia-art/gemini-thinking/refs/heads/main/spatial3_orig_min.jpeg"
  }
];

interface ExampleCardProps {
  example: ExamplePrompt;
  onClick: () => void;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ example, onClick }) => {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    let objectUrl: string | null = null;

    const fetchImage = async () => {
      try {
        const response = await fetch(example.image);
        if (!response.ok) throw new Error("Failed to load image");
        
        const blob = await response.blob();
        
        let mimeType = blob.type;
        if (!mimeType || mimeType === 'application/octet-stream') {
          const ext = example.image.split('.').pop()?.toLowerCase();
          if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
          else if (ext === 'png') mimeType = 'image/png';
          else if (ext === 'webp') mimeType = 'image/webp';
          else mimeType = 'image/jpeg';
        }

        const finalBlob = blob.slice(0, blob.size, mimeType);
        objectUrl = URL.createObjectURL(finalBlob);
        
        if (isMounted) {
          setImageSrc(objectUrl);
        }
      } catch (err) {
        console.error("Thumbnail load error:", err);
        if (isMounted) setError(true);
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [example.image]);

  return (
    <motion.button
      whileHover={{ scale: 1.02, y: -2 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className="flex flex-col items-start p-4 bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all text-left group h-full"
    >
      <div className="w-full h-32 mb-3 rounded-lg overflow-hidden bg-gray-100 relative">
        <div className="absolute inset-0 flex items-center justify-center text-gray-300">
          <Sparkles size={32} />
        </div>
        {imageSrc && !error && (
          <img
            src={imageSrc}
            alt={example.title}
            className="w-full h-full object-cover relative durable-image z-10 group-hover:scale-105 transition-transform duration-500"
            onError={() => setError(true)}
          />
        )}
      </div>
      <div className="flex items-center gap-2 text-blue-600 font-medium mb-1">
        <Lightbulb size={16} />
        <span className="text-sm font-semibold">{example.title}</span>
      </div>
      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{example.prompt}</p>
    </motion.button>
  );
};

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [examples, setExamples] = useState<ExamplePrompt[]>(DEFAULT_EXAMPLES);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/examples/prompts.json")
      .then((res) => res.json())
      .then((data) => setExamples(data))
      .catch((err) => console.error("Failed to load examples:", err));
  }, []);

  const scrollToBottom = (force = false) => {
    if (force || (scrollRef.current && scrollRef.current.scrollHeight - scrollRef.current.scrollTop - scrollRef.current.clientHeight < 500)) {
      messagesEndRef.current?.scrollIntoView({ behavior: force ? "smooth" : "auto" });
    }
  };

  useEffect(() => {
    scrollToBottom(true);
  }, [messages.length]);

  const handleSend = async (text: string, image?: string) => {
    if (isLoading) return;

    const userPart: Part = { text };
    let imagePart: Part | null = null;
    
    if (image) {
      const match = image.match(/^data:(.+);base64,(.+)$/);
      if (match) {
        imagePart = {
          inlineData: {
            mimeType: match[1] === 'application/octet-stream' ? 'image/jpeg' : match[1],
            data: match[2],
          },
        };
      }
    }

    const newUserMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      parts: imagePart ? [imagePart, userPart] : [userPart],
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setIsLoading(true);

    try {
      const history: Content[] = messages.map(m => ({
        role: m.role,
        parts: m.parts
      }));

      const stream = await sendMessageStream(text, history, image);
      const modelMessageId = `model-${Date.now()}`;
      let accumulatedParts: Part[] = [];

      for await (const chunk of stream) {
        const incomingParts = chunk.candidates?.[0]?.content?.parts;
        if (incomingParts) {
          // Robustly merge incoming parts with accumulated parts
          for (const incoming of incomingParts) {
            const lastPart = accumulatedParts[accumulatedParts.length - 1];
            
            // Determine if we can append text to the last part
            // @ts-ignore
            const isSameType = lastPart && (
              (incoming.text && lastPart.text && !incoming.thought && !lastPart.thought && !incoming.executableCode && !lastPart.executableCode) ||
              // @ts-ignore
              (incoming.thought && lastPart.thought)
            );

            if (isSameType) {
              if (incoming.text) {
                lastPart.text = (lastPart.text || "") + incoming.text;
              }
            } else {
              accumulatedParts.push({ ...incoming });
            }
          }

          setMessages((prev) => {
            const last = prev[prev.length - 1];
            const updatedModelMessage: ChatMessage = {
              id: modelMessageId,
              role: "model",
              parts: JSON.parse(JSON.stringify(accumulatedParts)), // Deep copy to ensure UI updates
              timestamp: last?.id === modelMessageId ? last.timestamp : Date.now(),
            };

            if (last && last.id === modelMessageId) {
              return [...prev.slice(0, -1), updatedModelMessage];
            } else {
              return [...prev, updatedModelMessage];
            }
          });
          scrollToBottom();
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      const errorMessage: ChatMessage = {
        id: `error-${Date.now()}`,
        role: "model",
        parts: [{ text: "I encountered an error. Please try again." }],
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExampleClick = (example: ExamplePrompt) => {
    handleSend(example.prompt, example.image);
  };

  const clearChat = () => {
    setMessages([]);
  };

  return (
    <div className="flex flex-col h-screen bg-gray-50 text-gray-900 overflow-hidden">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between z-10 shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-emerald-500 rounded-xl flex items-center justify-center text-white shadow-lg">
            <Sparkles size={22} />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-emerald-600">
              Agentic Vision
            </h1>
            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">Powered by Gemini 3.0</p>
          </div>
        </div>
        
        {messages.length > 0 && (
          <button
            onClick={clearChat}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors flex items-center gap-2"
            title="New Chat"
          >
            <RefreshCw size={18} />
            <span className="text-xs font-medium hidden sm:inline">Reset</span>
          </button>
        )}
      </header>

      {/* Main Content Area */}
      <main ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto w-full min-h-full flex flex-col">
          {messages.length === 0 ? (
            <div className="w-full flex flex-col items-center p-6 md:p-12 lg:py-16">
              <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="max-w-3xl w-full text-center mb-12"
              >
                <h2 className="text-4xl md:text-5xl font-extrabold text-gray-900 mb-4 tracking-tight">
                  Think with Images
                </h2>
                <p className="text-lg text-gray-600 leading-relaxed max-w-2xl mx-auto">
                  Experience the power of Gemini 3.0 Agentic Vision. 
                  Upload an image and ask complex questions that require reasoning, spatial awareness, or code execution.
                </p>
              </motion.div>

              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 w-full max-w-6xl px-4"
              >
                {examples.map((example, index) => (
                  <ExampleCard
                    key={index}
                    example={example}
                    onClick={() => handleExampleClick(example)}
                  />
                ))}
              </motion.div>
            </div>
          ) : (
            <div className="flex-1 p-4 md:p-6 space-y-6 max-w-4xl mx-auto w-full pb-32">
              {messages.map((message) => (
                <ChatMessageItem 
                  key={message.id} 
                  message={message} 
                  isStreaming={isLoading && message === messages[messages.length - 1]} 
                />
              ))}
              <div ref={messagesEndRef} className="h-4" />
            </div>
          )}
        </div>
      </main>

      {/* Input Area */}
      <footer className="bg-white border-t border-gray-100 p-4 pb-6 md:p-6 md:pb-8 shrink-0 relative z-20">
        <div className="max-w-4xl mx-auto">
          <ChatInput onSend={handleSend} disabled={isLoading} />
          <p className="text-center text-[10px] text-gray-400 mt-4 px-4 leading-normal">
            Gemini may display inaccurate info, including about people, so double-check its responses. 
            Thinking-with-images capabilities are in preview.
          </p>
        </div>
      </footer>
    </div>
  );
};
