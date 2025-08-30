/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  getErrorMessage,
  loadServerHierarchicalMemory,
} from '@google/gemini-cli-core';
import { MessageType } from '../types.js';
import type { SlashCommand, SlashCommandActionReturn } from './types.js';
import { CommandKind } from './types.js';

export const memoryCommand: SlashCommand = {
  name: 'memory',
  description: 'Commands for interacting with memory.',
  kind: CommandKind.BUILT_IN,
  subCommands: [
    {
      name: 'show',
      description: 'Show the current memory contents.',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        const memoryContent = context.services.config?.getUserMemory() || '';
        const fileCount = context.services.config?.getGeminiMdFileCount() || 0;

        const messageContent =
          memoryContent.length > 0
            ? `Current memory content from ${fileCount} file(s):\n\n---\n${memoryContent}\n---`
            : 'Memory is currently empty.';

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: messageContent,
          },
          Date.now(),
        );
      },
    },
    {
      name: 'add',
      description: 'Add content to the memory.',
      kind: CommandKind.BUILT_IN,
      action: async (
        context,
        args,
      ): Promise<SlashCommandActionReturn | void> => {
        if (!args || args.trim() === '') {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Usage: /memory add <text to remember>',
          };
        }

        // Get all available GEMINI.md files
        const config = await context.services.config;
        if (!config) {
          return {
            type: 'message',
            messageType: 'error',
            content: 'Configuration not available',
          };
        }

        const { filePaths } = await loadServerHierarchicalMemory(
          config.getWorkingDir(),
          config.shouldLoadMemoryFromIncludeDirectories()
            ? config.getWorkspaceContext().getDirectories()
            : [],
          config.getDebugMode(),
          config.getFileService(),
          config.getExtensionContextFilePaths(),
          config.getFolderTrust(),
          context.services.settings.merged.context?.importFormat || 'tree',
          config.getFileFilteringOptions(),
          context.services.settings.merged.context?.discoveryMaxDirs,
        );

        let selectedFile: string | undefined;

        // If multiple files exist, prompt for selection
        if (filePaths && filePaths.length > 1) {
          const fileOptions = filePaths.map((fp, index) => ({
            label: `${index + 1}. ${fp}`,
            value: fp,
          }));

          // Prompt user to select a file
          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: 'Multiple GEMINI.md files found. Please select which file to save to:',
            },
            Date.now(),
          );

          // Display options to user
          fileOptions.forEach((option) => {
            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: option.label,
              },
              Date.now(),
            );
          });

          // For now, we'll default to the first file
          // In a full implementation, this would need to integrate with the UI's selection mechanism
          selectedFile = filePaths[0];

          context.ui.addItem(
            {
              type: MessageType.INFO,
              text: `Using default file: ${selectedFile}`,
            },
            Date.now(),
          );
        } else if (filePaths && filePaths.length === 1) {
          selectedFile = filePaths[0];
        }

        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: `Attempting to save to memory: "${args.trim()}"`,
          },
          Date.now(),
        );

        return {
          type: 'tool',
          toolName: 'save_memory',
          toolArgs: {
            fact: args.trim(),
            targetFile: selectedFile,
          },
        };
      },
    },
    {
      name: 'refresh',
      description: 'Refresh the memory from the source.',
      kind: CommandKind.BUILT_IN,
      action: async (context) => {
        context.ui.addItem(
          {
            type: MessageType.INFO,
            text: 'Refreshing memory from source files...',
          },
          Date.now(),
        );

        try {
          const config = await context.services.config;
          if (config) {
            const { memoryContent, fileCount } =
              await loadServerHierarchicalMemory(
                config.getWorkingDir(),
                config.shouldLoadMemoryFromIncludeDirectories()
                  ? config.getWorkspaceContext().getDirectories()
                  : [],
                config.getDebugMode(),
                config.getFileService(),
                config.getExtensionContextFilePaths(),
                config.getFolderTrust(),
                context.services.settings.merged.context?.importFormat ||
                  'tree', // Use setting or default to 'tree'
                config.getFileFilteringOptions(),
                context.services.settings.merged.context?.discoveryMaxDirs,
              );
            config.setUserMemory(memoryContent);
            config.setGeminiMdFileCount(fileCount);

            const successMessage =
              memoryContent.length > 0
                ? `Memory refreshed successfully. Loaded ${memoryContent.length} characters from ${fileCount} file(s).`
                : 'Memory refreshed successfully. No memory content found.';

            context.ui.addItem(
              {
                type: MessageType.INFO,
                text: successMessage,
              },
              Date.now(),
            );
          }
        } catch (error) {
          const errorMessage = getErrorMessage(error);
          context.ui.addItem(
            {
              type: MessageType.ERROR,
              text: `Error refreshing memory: ${errorMessage}`,
            },
            Date.now(),
          );
        }
      },
    },
  ],
};
