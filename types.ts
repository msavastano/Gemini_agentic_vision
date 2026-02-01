/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import { Part } from "@google/genai";

export interface ChatMessage {
  id: string;
  role: "user" | "model";
  parts: Part[];
  timestamp: number;
}

export interface ExamplePrompt {
  title: string;
  prompt: string;
  image: string;
}

// Extend Part type locally to support 'thought' property if not present in SDK yet
export type ExtendedPart = Part & {
  thought?: boolean;
};