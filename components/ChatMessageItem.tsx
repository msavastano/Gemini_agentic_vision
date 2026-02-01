
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ChatMessage } from "../types";
import { motion, AnimatePresence } from "framer-motion";
import { Bot, User, Terminal, Code2, ChevronRight, Brain } from "lucide-react";
import { Part } from "@google/genai";

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

interface CollapsiblePartProps {
  title: string;
  icon: React.ElementType;
  children: React.ReactNode;
  headerClassName: string;
  contentClassName: string;
  status?: string;
  isStreaming?: boolean;
}

const CollapsiblePart: React.FC<CollapsiblePartProps> = ({
  title,
  icon: Icon,
  children,
  headerClassName,
  contentClassName,
  status,
  isStreaming,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Auto-open thoughts if streaming
  useEffect(() => {
    if (isStreaming) {
      setIsOpen(true);
    }
  }, [isStreaming]);

  return (
    <div className="my-2 rounded-xl border border-gray-200 overflow-hidden shadow-sm bg-white">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold transition-colors border-b border-gray-100 ${headerClassName}`}
      >
        <div className={`transition-transform duration-200 ${isOpen ? "rotate-90" : ""}`}>
          <ChevronRight size={14} />
        </div>
        <Icon size={14} />
        <span>{title}</span>
        {status && (
          <span
            className={`ml-auto text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${
              status === "OUTCOME_OK"
                ? "bg-emerald-500/20 text-emerald-600"
                : "bg-red-500/20 text-red-600"
            }`}
          >
            {status === "OUTCOME_OK" ? "Success" : "Error"}
          </span>
        )}
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: "auto" }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className={contentClassName}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export const ChatMessageItem: React.FC<ChatMessageProps> = ({ message, isStreaming }) => {
  const isUser = message.role === "user";

  const renderPart = (part: Part, index: number) => {
    // Determine if this part is a "thought"
    // @ts-ignore
    const isThought = part.thought === true || (typeof part.thought === 'string');
    
    if (isThought) {
      let title = "Thought Process";
      // @ts-ignore
      const thoughtContent = (typeof part.thought === 'string' ? part.thought : (part.text || "")).trim();
      
      if (isStreaming && index === message.parts.length - 1) {
        const boldMatches = [...thoughtContent.matchAll(/\*\*([^*]+)\*\*/g)];
        if (boldMatches.length > 0) {
           const lastTitle = boldMatches[boldMatches.length - 1][1];
           title = `Thinking: ${lastTitle}`;
        } else {
           title = "Analyzing...";
        }
      }

      return (
        <CollapsiblePart
          key={index}
          title={title}
          icon={Brain}
          isStreaming={isStreaming && index === message.parts.length - 1}
          headerClassName="bg-indigo-50/50 text-indigo-700 hover:bg-indigo-100/50"
          contentClassName="p-4 bg-indigo-50/20 text-indigo-900/80 leading-relaxed"
        >
          {thoughtContent ? (
            <div className="prose prose-sm max-w-none prose-indigo opacity-80">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{thoughtContent}</ReactMarkdown>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-indigo-400 italic">
              <span className="animate-pulse">Thinking...</span>
            </div>
          )}
        </CollapsiblePart>
      );
    }

    if (part.executableCode) {
      return (
        <CollapsiblePart
          key={index}
          title={`Executable Code (${part.executableCode.language})`}
          icon={Code2}
          headerClassName="bg-blue-50/50 text-blue-700 hover:bg-blue-100/50"
          contentClassName="p-0 bg-[#0d1117]"
        >
          <div className="p-4 overflow-x-auto">
             <pre className="text-xs text-blue-100/90 font-mono">
                 <code>{part.executableCode.code}</code>
             </pre>
          </div>
        </CollapsiblePart>
      );
    }

    if (part.codeExecutionResult) {
       const isSuccess = part.codeExecutionResult.outcome === "OUTCOME_OK";
       return (
         <CollapsiblePart
           key={index}
           title="Execution Result"
           icon={Terminal}
           headerClassName={isSuccess ? "bg-emerald-50/50 text-emerald-700 hover:bg-emerald-100/50" : "bg-red-50/50 text-red-700 hover:bg-red-100/50"}
           contentClassName="p-4 bg-gray-900 text-gray-100 font-mono text-xs overflow-x-auto border-t border-gray-800"
           status={part.codeExecutionResult.outcome}
         >
            <div className="whitespace-pre-wrap">
                {part.codeExecutionResult.output}
            </div>
         </CollapsiblePart>
       );
    }

    if (part.text) {
      return (
        <div key={index} className="prose prose-sm max-w-none mb-2 last:mb-0">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
        </div>
      );
    }

    if (part.inlineData) {
      return (
        <div key={index} className="my-3 first:mt-0">
            <img
            src={`data:${part.inlineData.mimeType};base64,${part.inlineData.data}`}
            alt="Uploaded content"
            className="max-w-full rounded-xl border border-gray-200 shadow-sm"
            />
        </div>
      );
    }

    return null;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex gap-3 md:gap-4 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex-shrink-0 w-8 h-8 md:w-9 md:h-9 rounded-xl flex items-center justify-center shadow-md transition-transform hover:scale-105 ${
          isUser ? "bg-blue-600 text-white" : "bg-emerald-600 text-white"
        }`}
      >
        {isUser ? <User size={18} /> : <Bot size={18} />}
      </div>

      <div
        className={`flex flex-col gap-1.5 max-w-[85%] md:max-w-[80%] ${
          isUser ? "items-end" : "items-start"
        }`}
      >
        <div
          className={`px-4 py-3.5 rounded-2xl shadow-sm border border-transparent ${
            isUser
              ? "bg-blue-600 text-white rounded-tr-none"
              : "bg-white border-gray-100 rounded-tl-none text-gray-800"
          }`}
        >
          {message.parts.length > 0 ? (
            message.parts.map((part, i) => renderPart(part, i))
          ) : (
             <div className="flex items-center gap-2 text-gray-400 py-1">
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                <span className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce"></span>
             </div>
          )}
        </div>
        <span className="text-[10px] font-semibold text-gray-400 px-1 uppercase tracking-tighter">
          {new Date(message.timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>
    </motion.div>
  );
};
